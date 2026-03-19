package live.airuncoach.airuncoach.data.workers

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import live.airuncoach.airuncoach.data.SyncQueue
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.UploadRunRequest
import live.airuncoach.airuncoach.domain.model.RunSession

/**
 * WorkManager Worker for syncing pending runs in the background.
 * Implements exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, ...
 *
 * Runs periodically and on demand when connectivity changes.
 *
 * NOTE: Uses RetrofitClient directly (not Hilt injection) because standard
 * CoroutineWorker does not support @Inject without @HiltWorker + HiltWorkerFactory setup.
 */
class SyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    private val syncQueue by lazy { SyncQueue(applicationContext) }
    private val apiService by lazy {
        val sessionManager = SessionManager(applicationContext)
        RetrofitClient(applicationContext, sessionManager).instance
    }

    override suspend fun doWork(): Result {
        try {
            Log.d("SyncWorker", "🔄 Starting sync worker")

            var successCount = 0
            var failureCount = 0

            // Process all pending syncs until queue is empty
            while (true) {
                val run = syncQueue.getNextPendingSync() ?: break

                try {
                    syncQueue.markSyncing(run.id)
                    Log.d("SyncWorker", "📤 Uploading run ${run.id}...")

                    // Convert RunSession to UploadRunRequest
                    val uploadRequest = convertRunToUploadRequest(run)

                    // Attempt upload
                    apiService.uploadRun(uploadRequest)

                    // Success - remove from queue
                    syncQueue.markSynced(run.id)
                    successCount++
                    Log.d("SyncWorker", "✅ Successfully synced run ${run.id}")

                } catch (e: Exception) {
                    failureCount++
                    val errorMsg = e.message ?: "Unknown error"
                    syncQueue.recordFailure(run.id, errorMsg)
                    Log.e("SyncWorker", "❌ Failed to sync run ${run.id}: $errorMsg")

                    // Stop processing on failure; WorkManager backoff will retry later
                    break
                }
            }

            val pendingCount = syncQueue.getPendingSyncCount()
            Log.d("SyncWorker", "✅ Sync completed: $successCount uploaded, $failureCount failed, $pendingCount pending")

            return if (failureCount > 0) {
                // Trigger WorkManager exponential backoff retry
                Result.retry()
            } else {
                Result.success()
            }

        } catch (e: Exception) {
            Log.e("SyncWorker", "💥 Sync worker crashed: ${e.message}", e)
            return Result.retry()
        }
    }

    companion object {
        private const val SYNC_WORK_TAG = "run_sync"
        private const val SYNC_WORK_NAME_PERIODIC = "AiRunCoachSyncPeriodic"
        private const val SYNC_WORK_NAME_IMMEDIATE = "AiRunCoachSyncImmediate"

        /**
         * Schedule periodic sync work (every 15 minutes).
         * Called on app startup to ensure background syncing is active.
         */
        fun schedulePeriodicSync(context: Context) {
            try {
                val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                    15,
                    java.util.concurrent.TimeUnit.MINUTES
                )
                    .setBackoffCriteria(
                        BackoffPolicy.EXPONENTIAL,
                        androidx.work.WorkRequest.MIN_BACKOFF_MILLIS,
                        java.util.concurrent.TimeUnit.MILLISECONDS
                    )
                    .addTag(SYNC_WORK_TAG)
                    .build()

                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    SYNC_WORK_NAME_PERIODIC,
                    ExistingPeriodicWorkPolicy.KEEP,
                    syncRequest
                )

                Log.d("SyncWorker", "✅ Scheduled periodic sync work (every 15 min)")
            } catch (e: Exception) {
                Log.e("SyncWorker", "❌ Failed to schedule sync work: ${e.message}")
            }
        }

        /**
         * Trigger a one-time immediate sync (e.g., right after queuing a failed run).
         */
        fun triggerImmediateSync(context: Context) {
            try {
                val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                    .setBackoffCriteria(
                        BackoffPolicy.EXPONENTIAL,
                        androidx.work.WorkRequest.MIN_BACKOFF_MILLIS,
                        java.util.concurrent.TimeUnit.MILLISECONDS
                    )
                    .addTag(SYNC_WORK_TAG)
                    .build()

                WorkManager.getInstance(context).enqueueUniqueWork(
                    SYNC_WORK_NAME_IMMEDIATE,
                    ExistingWorkPolicy.REPLACE,
                    syncRequest
                )

                Log.d("SyncWorker", "🚀 Triggered immediate one-time sync")
            } catch (e: Exception) {
                Log.e("SyncWorker", "❌ Failed to trigger immediate sync: ${e.message}")
            }
        }

        /**
         * Cancel all sync work.
         */
        fun cancelSync(context: Context) {
            try {
                WorkManager.getInstance(context).cancelAllWorkByTag(SYNC_WORK_TAG)
                Log.d("SyncWorker", "⏹️ Cancelled all sync work")
            } catch (e: Exception) {
                Log.e("SyncWorker", "❌ Failed to cancel sync: ${e.message}")
            }
        }

        /**
         * Convert a RunSession to UploadRunRequest for API.
         */
        fun convertRunToUploadRequest(run: RunSession): UploadRunRequest {
            // Get start location from first route point
            val startLat = run.routePoints.firstOrNull()?.latitude ?: 0.0
            val startLng = run.routePoints.firstOrNull()?.longitude ?: 0.0

            // Calculate elevation data from route points
            var maxElev = run.routePoints.firstOrNull()?.altitude ?: 0.0
            var minElev = maxElev
            for (point in run.routePoints) {
                val elev = point.altitude ?: 0.0
                maxElev = maxOf(maxElev, elev)
                minElev = minOf(minElev, elev)
            }

            return UploadRunRequest(
                routeId = run.routeHash,
                startTime = run.startTime,
                distance = run.distance,
                duration = run.duration,
                avgPace = run.averagePace ?: "0:00",
                avgHeartRate = if (run.heartRate > 0) run.heartRate else null,
                maxHeartRate = null,
                minHeartRate = run.minHeartRate,
                calories = run.calories,
                cadence = run.cadence,
                maxCadence = run.maxCadence,
                elevation = (run.totalElevationGain + run.totalElevationLoss) / 2.0,
                difficulty = run.difficulty ?: "moderate",
                startLat = startLat,
                startLng = startLng,
                gpsTrack = run.routePoints,
                completedAt = run.endTime ?: System.currentTimeMillis(),
                elevationGain = run.totalElevationGain,
                elevationLoss = run.totalElevationLoss,
                tss = 0,
                gap = null,
                isPublic = false,
                strugglePoints = run.strugglePoints,
                kmSplits = run.kmSplits,
                terrainType = run.terrainType?.toString() ?: "unknown",
                userComments = run.userComments,
                targetDistance = run.targetDistance,
                targetTime = run.targetTime,
                wasTargetAchieved = run.wasTargetAchieved,
                aiCoachingNotes = run.aiCoachingNotes,
                maxInclinePercent = run.steepestIncline,
                maxDeclinePercent = run.steepestDecline,
                minElevation = minElev,
                maxElevation = maxElev,
                totalSteps = run.totalSteps,
                activeCalories = run.activeCalories,
                avgSpeed = run.avgSpeed,
                movingTime = run.movingTime,
                elapsedTime = run.elapsedTime,
                avgStrideLength = run.avgStrideLength,
                weatherData = run.weatherAtStart,
                linkedWorkoutId = run.linkedWorkoutId,
                linkedPlanId = run.linkedPlanId,
                planProgressWeek = run.planProgressWeek,
                planProgressWeeks = run.planProgressWeeks,
                workoutType = run.workoutType,
                workoutIntensity = run.workoutIntensity,
                workoutDescription = run.workoutDescription
            )
        }
    }
}

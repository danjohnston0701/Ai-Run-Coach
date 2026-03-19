package live.airuncoach.airuncoach.data.workers

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.delay
import live.airuncoach.airuncoach.data.SyncQueue
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.UploadRunRequest
import live.airuncoach.airuncoach.domain.model.RunSession
import javax.inject.Inject
import kotlin.math.pow
import kotlin.math.roundToLong

/**
 * WorkManager Worker for syncing pending runs in the background.
 * Implements exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, ...
 *
 * Runs periodically and on demand when connectivity changes.
 */
class SyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    @Inject
    lateinit var apiService: ApiService

    private lateinit var syncQueue: SyncQueue

    override suspend fun doWork(): Result {
        try {
            syncQueue = SyncQueue(applicationContext)

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

                    // Don't retry individual runs more than 10 times
                    // Let the next scheduled work attempt (with exponential backoff)
                    break
                }
            }

            val pendingCount = syncQueue.getPendingSyncCount()
            Log.d("SyncWorker", "✅ Sync worker completed: $successCount uploaded, $failureCount failed, $pendingCount pending")

            return if (failureCount > 0) {
                // If there were failures, reschedule and retry
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
        private const val SYNC_WORK_NAME = "AiRunCoachSync"

        /**
         * Schedule periodic sync work (e.g., every 15 minutes).
         * Called on app startup to ensure background syncing is active.
         */
        fun schedulePeriodicSync(context: Context) {
            try {
                val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                    15, // interval
                    java.util.concurrent.TimeUnit.MINUTES
                )
                    .setBackoffCriteria(
                        BackoffPolicy.EXPONENTIAL,
                        1, // initial delay in seconds (1s, 2s, 4s, ...)
                        java.util.concurrent.TimeUnit.SECONDS
                    )
                    .addTag(SYNC_WORK_TAG)
                    .build()

                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    SYNC_WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP, // Keep existing work
                    syncRequest
                )

                Log.d("SyncWorker", "✅ Scheduled periodic sync work (every 15 min)")
            } catch (e: Exception) {
                Log.e("SyncWorker", "❌ Failed to schedule sync work: ${e.message}")
            }
        }

        /**
         * Trigger sync work immediately (e.g., when connectivity returns).
         */
        fun triggerImmediateSync(context: Context) {
            try {
                val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                    15,
                    java.util.concurrent.TimeUnit.MINUTES
                )
                    .setBackoffCriteria(
                        BackoffPolicy.EXPONENTIAL,
                        1,
                        java.util.concurrent.TimeUnit.SECONDS
                    )
                    .addTag(SYNC_WORK_TAG)
                    .build()

                // Use the same unique name to replace any pending work
                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    SYNC_WORK_NAME,
                    ExistingPeriodicWorkPolicy.REPLACE, // Replace to trigger immediately
                    syncRequest
                )

                Log.d("SyncWorker", "🚀 Triggered immediate sync work")
            } catch (e: Exception) {
                Log.e("SyncWorker", "❌ Failed to trigger sync: ${e.message}")
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
        private fun convertRunToUploadRequest(run: RunSession): UploadRunRequest {
            // Get start location from first route point
            val startLat = run.routePoints.firstOrNull()?.latitude ?: 0.0
            val startLng = run.routePoints.firstOrNull()?.longitude ?: 0.0
            
            // Calculate elevation data from route points (simple approach)
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
                maxHeartRate = null, // Not in RunSession yet
                minHeartRate = run.minHeartRate,
                calories = run.calories,
                cadence = run.cadence,
                maxCadence = run.maxCadence,
                elevation = (run.totalElevationGain + run.totalElevationLoss) / 2.0, // Average
                difficulty = run.difficulty ?: "moderate",
                startLat = startLat,
                startLng = startLng,
                gpsTrack = run.routePoints,
                completedAt = run.endTime ?: System.currentTimeMillis(),
                elevationGain = run.totalElevationGain,
                elevationLoss = run.totalElevationLoss,
                tss = 0, // Calculate from HR zones if needed
                gap = null, // Grade-adjusted pace (not in model)
                isPublic = false, // Default to private
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

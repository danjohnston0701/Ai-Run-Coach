package live.airuncoach.airuncoach.wear.sync

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import live.airuncoach.airuncoach.wear.WearApplication
import java.util.concurrent.TimeUnit

/**
 * Background sync of queued watch runs: runs whenever the watch has a network (its own Wi-Fi /
 * LTE, or the phone's connection over Bluetooth), even with the app closed, and retries with
 * backoff until every queued run is saved. The in-app triggers (finish, reconnect, new token)
 * call the same [live.airuncoach.airuncoach.wear.data.RunSyncer] directly; its mutex keeps the
 * two from overlapping.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? WearApplication ?: return Result.failure()
        val result = app.runSyncer.syncAll()
        Log.d(TAG, "Background sync: $result")
        return when {
            result.remaining == 0 -> Result.success()
            // No usable token: nothing to do until the phone sends a new one, which schedules
            // a fresh sync itself — don't burn retries in the meantime.
            result.authBlocked -> Result.success()
            else -> Result.retry()
        }
    }

    companion object {
        private const val TAG = "SyncWorker"
        private const val WORK_NAME = "sync-pending-watch-runs"

        fun schedule(context: Context) {
            try {
                val request = OneTimeWorkRequestBuilder<SyncWorker>()
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                    .build()
                WorkManager.getInstance(context)
                    .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
            } catch (e: Exception) {
                Log.w(TAG, "schedule failed: ${e.message}")
            }
        }
    }
}

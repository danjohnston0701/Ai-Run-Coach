package live.airuncoach.airuncoach.data

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow
import live.airuncoach.airuncoach.data.database.AiRunCoachDatabase
import live.airuncoach.airuncoach.data.database.PendingSyncEntity
import live.airuncoach.airuncoach.domain.model.RunSession

/**
 * Repository for managing pending run uploads.
 * Handles queuing, retrying, and removing runs from the sync queue.
 */
class SyncQueue(private val context: Context) {

    private val database = AiRunCoachDatabase.getInstance(context)
    private val dao = database.pendingSyncDao()
    private val gson = Gson()

    /**
     * Add a run to the pending sync queue (when upload fails).
     * Returns the database ID of the queued item.
     */
    suspend fun addPendingRun(run: RunSession): Long {
        val serialized = gson.toJson(run)
        val pending = PendingSyncEntity(
            runId = run.id,
            runData = serialized,
            retryCount = 0
        )

        return try {
            val id = dao.insert(pending)
            Log.d("SyncQueue", "✅ Added run ${run.id} to sync queue (db id: $id)")
            id
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to queue run ${run.id}: ${e.message}")
            throw e
        }
    }

    /**
     * Mark a pending sync as successfully uploaded and remove it.
     */
    suspend fun markSynced(runId: String) {
        try {
            val pending = dao.getByRunId(runId) ?: return
            dao.delete(pending)
            Log.d("SyncQueue", "✅ Removed run $runId from sync queue")
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to mark $runId as synced: ${e.message}")
            throw e
        }
    }

    /**
     * Get the next run to upload (oldest, not currently syncing).
     */
    suspend fun getNextPendingSync(): RunSession? {
        return try {
            val pending = dao.getNextPendingSync() ?: return null
            val run = gson.fromJson(pending.runData, RunSession::class.java)
            Log.d("SyncQueue", "📤 Retrieved pending run ${pending.runId} for sync (attempt ${pending.retryCount + 1})")
            run
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to deserialize pending sync: ${e.message}")
            null
        }
    }

    /**
     * Mark a sync as currently in progress.
     */
    suspend fun markSyncing(runId: String) {
        try {
            val pending = dao.getByRunId(runId) ?: return
            dao.update(pending.copy(isSyncing = true))
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to mark $runId as syncing: ${e.message}")
        }
    }

    /**
     * Record a sync failure (increment retry count, store error).
     */
    suspend fun recordFailure(runId: String, error: String) {
        try {
            val pending = dao.getByRunId(runId) ?: return
            val updated = pending.copy(
                isSyncing = false,
                retryCount = pending.retryCount + 1,
                lastRetryAt = System.currentTimeMillis(),
                lastError = error
            )
            dao.update(updated)
            Log.w("SyncQueue", "⚠️  Run $runId failed (attempt ${updated.retryCount}): $error")
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to record failure for $runId: ${e.message}")
        }
    }

    /**
     * Get all pending syncs (for debugging/UI).
     */
    suspend fun getAllPendingSyncs(): List<RunSession> {
        return try {
            dao.getAllPendingSyncs().mapNotNull { entity ->
                try {
                    gson.fromJson(entity.runData, RunSession::class.java)
                } catch (e: Exception) {
                    Log.e("SyncQueue", "Failed to deserialize sync ${entity.id}: ${e.message}")
                    null
                }
            }
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to get all pending syncs: ${e.message}")
            emptyList()
        }
    }

    /**
     * Observe pending sync count for UI updates.
     */
    fun observePendingSyncCount(): Flow<Int> = dao.observePendingSyncCount()

    /**
     * Observe all pending syncs for UI updates.
     */
    fun observePendingSyncs(): Flow<List<PendingSyncEntity>> = dao.observePendingSyncs()

    /**
     * Get pending sync count (for debugging).
     */
    suspend fun getPendingSyncCount(): Int {
        return try {
            dao.getAllPendingSyncs().size
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to get sync count: ${e.message}")
            0
        }
    }

    /**
     * Clear all pending syncs (use carefully).
     */
    suspend fun clearAllPendingSyncs() {
        try {
            dao.clear()
            Log.w("SyncQueue", "🗑️  Cleared all pending syncs")
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to clear syncs: ${e.message}")
        }
    }
}

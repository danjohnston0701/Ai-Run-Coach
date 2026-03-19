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
     * Add a run to the pending sync queue (called when upload fails).
     * Returns the database row ID of the queued item.
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
     * Mark a pending sync as successfully uploaded and remove it from the queue.
     */
    suspend fun markSynced(runId: String) {
        try {
            dao.deleteByRunId(runId)
            Log.d("SyncQueue", "✅ Removed run $runId from sync queue")
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to mark $runId as synced: ${e.message}")
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
            dao.markSyncing(runId)
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to mark $runId as syncing: ${e.message}")
        }
    }

    /**
     * Record a sync failure (increment retry count, store error message).
     */
    suspend fun recordFailure(runId: String, error: String) {
        try {
            val pending = dao.getByRunId(runId) ?: return
            dao.updateById(
                id = pending.id,
                retryCount = pending.retryCount + 1,
                lastRetryAt = System.currentTimeMillis(),
                isSyncing = 0,
                lastError = error
            )
            Log.w("SyncQueue", "⚠️  Run $runId failed (attempt ${pending.retryCount + 1}): $error")
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

    /** Observe pending sync count as a Flow for live UI updates. */
    fun observePendingSyncCount(): Flow<Int> = dao.observePendingSyncCount()

    /** Observe all pending syncs as a Flow for live UI updates. */
    fun observePendingSyncs(): Flow<List<PendingSyncEntity>> = dao.observePendingSyncs()

    /** Snapshot count of pending syncs. */
    suspend fun getPendingSyncCount(): Int {
        return try {
            dao.getAllPendingSyncs().size
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to get sync count: ${e.message}")
            0
        }
    }

    /** Clear all pending syncs (use carefully). */
    suspend fun clearAllPendingSyncs() {
        try {
            dao.clear()
            Log.w("SyncQueue", "🗑️  Cleared all pending syncs")
        } catch (e: Exception) {
            Log.e("SyncQueue", "❌ Failed to clear syncs: ${e.message}")
        }
    }
}

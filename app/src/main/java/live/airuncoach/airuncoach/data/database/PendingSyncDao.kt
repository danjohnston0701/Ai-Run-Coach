package live.airuncoach.airuncoach.data.database

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for pending syncs.
 * Handles all database operations for runs awaiting upload.
 */
@Dao
interface PendingSyncDao {

    /**
     * Add a run to the pending sync queue.
     */
    @Insert
    suspend fun insert(pendingSync: PendingSyncEntity): Long

    /**
     * Update a pending sync (e.g., increment retry count, update error message).
     */
    @Update
    suspend fun update(pendingSync: PendingSyncEntity)

    /**
     * Remove a pending sync (after successful upload).
     */
    @Delete
    suspend fun delete(pendingSync: PendingSyncEntity)

    /**
     * Remove a pending sync by ID.
     */
    @Query("DELETE FROM pending_syncs WHERE id = :id")
    suspend fun deleteById(id: Long)

    /**
     * Get a pending sync by run ID.
     */
    @Query("SELECT * FROM pending_syncs WHERE runId = :runId")
    suspend fun getByRunId(runId: String): PendingSyncEntity?

    /**
     * Get the oldest pending sync that's not currently syncing.
     * Used for background worker to process queue.
     */
    @Query("SELECT * FROM pending_syncs WHERE isSyncing = 0 ORDER BY createdAt ASC LIMIT 1")
    suspend fun getNextPendingSync(): PendingSyncEntity?

    /**
     * Get all pending syncs (for debug/monitoring).
     */
    @Query("SELECT * FROM pending_syncs ORDER BY createdAt DESC")
    suspend fun getAllPendingSyncs(): List<PendingSyncEntity>

    /**
     * Watch pending syncs as flow (for UI state).
     */
    @Query("SELECT * FROM pending_syncs ORDER BY createdAt DESC")
    fun observePendingSyncs(): Flow<List<PendingSyncEntity>>

    /**
     * Get count of pending syncs.
     */
    @Query("SELECT COUNT(*) FROM pending_syncs")
    fun observePendingSyncCount(): Flow<Int>

    /**
     * Clear all pending syncs (nuclear option for cleanup).
     */
    @Query("DELETE FROM pending_syncs")
    suspend fun clear()
}

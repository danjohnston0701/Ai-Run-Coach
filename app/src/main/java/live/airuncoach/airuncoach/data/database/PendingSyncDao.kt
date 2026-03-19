package live.airuncoach.airuncoach.data.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for pending syncs.
 * Handles all database operations for runs awaiting upload.
 *
 * Note: @Update and @Delete are replaced with explicit @Query statements to
 * avoid [ksp] IllegalStateException: unexpected jvm signature V, which is a
 * known KSP/Room bug when suspend methods return Unit via those annotations.
 */
@Dao
interface PendingSyncDao {

    /**
     * Add a run to the pending sync queue.
     * REPLACE on conflict so re-queuing an already-pending run is safe.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(pendingSync: PendingSyncEntity): Long

    /**
     * Update a specific pending sync by ID with new retry metadata.
     */
    @Query("""
        UPDATE pending_syncs
        SET retryCount = :retryCount,
            lastRetryAt = :lastRetryAt,
            isSyncing = :isSyncing,
            lastError = :lastError
        WHERE id = :id
    """)
    suspend fun updateById(
        id: Long,
        retryCount: Int,
        lastRetryAt: Long,
        isSyncing: Int,   // 0 = false, 1 = true  (SQLite has no BOOLEAN type)
        lastError: String?
    )

    /**
     * Mark a pending sync as currently in-progress.
     */
    @Query("UPDATE pending_syncs SET isSyncing = 1 WHERE runId = :runId")
    suspend fun markSyncing(runId: String)

    /**
     * Mark a sync as no longer in-progress (e.g., after failure).
     */
    @Query("UPDATE pending_syncs SET isSyncing = 0 WHERE runId = :runId")
    suspend fun markNotSyncing(runId: String)

    /**
     * Remove a pending sync by its unique database ID.
     */
    @Query("DELETE FROM pending_syncs WHERE id = :id")
    suspend fun deleteById(id: Long)

    /**
     * Remove a pending sync by its run ID (after successful upload).
     */
    @Query("DELETE FROM pending_syncs WHERE runId = :runId")
    suspend fun deleteByRunId(runId: String)

    /**
     * Get a pending sync by run ID.
     */
    @Query("SELECT * FROM pending_syncs WHERE runId = :runId LIMIT 1")
    suspend fun getByRunId(runId: String): PendingSyncEntity?

    /**
     * Get the oldest pending sync that is not currently syncing.
     * Used by the background worker to process the queue one item at a time.
     */
    @Query("SELECT * FROM pending_syncs WHERE isSyncing = 0 ORDER BY createdAt ASC LIMIT 1")
    suspend fun getNextPendingSync(): PendingSyncEntity?

    /**
     * Get all pending syncs (for debug / monitoring).
     */
    @Query("SELECT * FROM pending_syncs ORDER BY createdAt DESC")
    suspend fun getAllPendingSyncs(): List<PendingSyncEntity>

    /**
     * Watch pending syncs as a live Flow (for UI state).
     */
    @Query("SELECT * FROM pending_syncs ORDER BY createdAt DESC")
    fun observePendingSyncs(): Flow<List<PendingSyncEntity>>

    /**
     * Live count of pending syncs (for the sync-status badge in the UI).
     */
    @Query("SELECT COUNT(*) FROM pending_syncs")
    fun observePendingSyncCount(): Flow<Int>

    /**
     * Clear ALL pending syncs (nuclear cleanup option).
     */
    @Query("DELETE FROM pending_syncs")
    suspend fun clear()
}

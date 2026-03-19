package live.airuncoach.airuncoach.data.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for pending syncs.
 *
 * IMPORTANT: Every suspend @Query method MUST return a non-Unit type (e.g. Int)
 * because Room 2.6.1's KSP processor crashes with
 *   "IllegalStateException: unexpected jvm signature V"
 * when it encounters suspend methods that return Unit/void.
 * Returning Int (affected row count) works around this bug.
 */
@Dao
interface PendingSyncDao {

    /** Add a run to the pending sync queue. Returns the row ID. */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(pendingSync: PendingSyncEntity): Long

    /** Update retry metadata for a specific pending sync. Returns rows affected. */
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
        isSyncing: Int,
        lastError: String?
    ): Int

    /** Mark a pending sync as currently in-progress. Returns rows affected. */
    @Query("UPDATE pending_syncs SET isSyncing = 1 WHERE runId = :runId")
    suspend fun markSyncing(runId: String): Int

    /** Remove a pending sync by run ID (after successful upload). Returns rows affected. */
    @Query("DELETE FROM pending_syncs WHERE runId = :runId")
    suspend fun deleteByRunId(runId: String): Int

    /** Get a pending sync by run ID. */
    @Query("SELECT * FROM pending_syncs WHERE runId = :runId LIMIT 1")
    suspend fun getByRunId(runId: String): PendingSyncEntity?

    /** Get the oldest pending sync that is not currently syncing. */
    @Query("SELECT * FROM pending_syncs WHERE isSyncing = 0 ORDER BY createdAt ASC LIMIT 1")
    suspend fun getNextPendingSync(): PendingSyncEntity?

    /** Get all pending syncs (for debug / monitoring). */
    @Query("SELECT * FROM pending_syncs ORDER BY createdAt DESC")
    suspend fun getAllPendingSyncs(): List<PendingSyncEntity>

    /** Watch pending syncs as a live Flow (for UI state). */
    @Query("SELECT * FROM pending_syncs ORDER BY createdAt DESC")
    fun observePendingSyncs(): Flow<List<PendingSyncEntity>>

    /** Live count of pending syncs (for the sync-status badge). */
    @Query("SELECT COUNT(*) FROM pending_syncs")
    fun observePendingSyncCount(): Flow<Int>

    /** Clear ALL pending syncs. Returns rows deleted. */
    @Query("DELETE FROM pending_syncs")
    suspend fun clear(): Int
}

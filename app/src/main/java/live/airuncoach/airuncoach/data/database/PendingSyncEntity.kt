package live.airuncoach.airuncoach.data.database

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Represents a run that failed to upload and is pending sync.
 * Stores the serialized run data so it can be retried when connectivity returns.
 */
@Entity(tableName = "pending_syncs")
data class PendingSyncEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    // Unique run ID (used for deduplication)
    val runId: String,

    // Serialized run data (JSON)
    val runData: String,

    // Number of failed upload attempts
    val retryCount: Int = 0,

    // Timestamp of when this was added to queue
    val createdAt: Long = System.currentTimeMillis(),

    // Timestamp of last retry attempt
    val lastRetryAt: Long = System.currentTimeMillis(),

    // Whether this sync is currently being attempted
    val isSyncing: Boolean = false,

    // Error message from last failed attempt
    val lastError: String? = null
)

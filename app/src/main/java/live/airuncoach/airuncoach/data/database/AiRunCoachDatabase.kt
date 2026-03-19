package live.airuncoach.airuncoach.data.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Main application database for local persistence.
 * Currently used for:
 * - PendingSync: Runs awaiting upload (offline resilience)
 *
 * Future use:
 * - Run history (full runs, not just IDs)
 * - Cache for API responses (plans, workouts)
 * - Sync conflict resolution
 */
@Database(
    entities = [PendingSyncEntity::class],
    version = 1,
    exportSchema = true
)
abstract class AiRunCoachDatabase : RoomDatabase() {

    abstract fun pendingSyncDao(): PendingSyncDao

    companion object {
        private const val DB_NAME = "airuncoach.db"

        @Volatile
        private var instance: AiRunCoachDatabase? = null

        fun getInstance(context: Context): AiRunCoachDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AiRunCoachDatabase::class.java,
                    DB_NAME
                )
                    .build()
                    .also { instance = it }
            }
        }
    }
}

package live.airuncoach.airuncoach.wear.storage

import android.content.Context
import android.util.Log

/**
 * Production [OfflineBufferStorage] backed by plain SharedPreferences — synchronous so
 * [OfflineGpsBuffer.save]'s tier cascade can know immediately whether a write succeeded,
 * matching the Garmin watch app's synchronous `App.Storage.setValue()` semantics.
 */
class SharedPrefsOfflineBufferStorage(context: Context) : OfflineBufferStorage {
    private val prefs = context.applicationContext.getSharedPreferences("wear_offline_buffer", Context.MODE_PRIVATE)

    override fun write(key: String, value: String): Boolean {
        return try {
            prefs.edit().putString(key, value).commit()
        } catch (e: Exception) {
            Log.w("OfflineBufferStorage", "write($key) failed: ${e.message}")
            false
        }
    }

    override fun delete(key: String) {
        prefs.edit().remove(key).apply()
    }

    fun read(key: String): String? = prefs.getString(key, null)
}

package live.airuncoach.airuncoach.wear.storage

import android.content.Context

/**
 * Builds up to 1.0.5 kept one finished run in SharedPreferences ("wear_offline_buffer") and
 * never read it back. Any run still sitting there is moved into [PendingRunStore] once, so it
 * finally syncs. Its start time was never recorded, so the server dates it to when it syncs.
 */
object LegacyOfflineBatch {
    private const val PREFS = "wear_offline_buffer"

    fun migrate(context: Context, store: PendingRunStore) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val sessionId = prefs.getString("offlineBatchSessionId", null)
        if (sessionId != null) {
            val points = parsePoints(prefs.getString("offlineBatchPoints", null))
            if (points.isNotEmpty()) {
                store.enqueue(
                    RunRecord(
                        sessionId = sessionId,
                        finishedAtMs = 0, // long past the session/end window: track upload only
                        distanceM = prefs.getString("offlineBatchDistance", null)?.toDoubleOrNull() ?: 0.0,
                        durationSec = prefs.getString("offlineBatchDuration", null)?.toIntOrNull() ?: 0,
                        totalAscentM = prefs.getString("offlineBatchAscent", null)?.toDoubleOrNull() ?: 0.0,
                        points = points,
                        recovered = true
                    )
                )
            }
        }
        if (prefs.all.isNotEmpty()) prefs.edit().clear().apply()
    }

    /** "elapsed,lat,lng,alt,hr,cad,pace;..." — the old OfflineGpsBuffer encoding. */
    internal fun parsePoints(encoded: String?): List<List<Int>> =
        encoded.orEmpty().split(";").mapNotNull { p ->
            p.split(",").mapNotNull { it.trim().toIntOrNull() }.takeIf { it.size == 7 }
        }
}

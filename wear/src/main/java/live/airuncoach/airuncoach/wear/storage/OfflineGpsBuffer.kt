package live.airuncoach.airuncoach.wear.storage

/**
 * A single compact offline sample — mirrors the Garmin watch app's 7-element point format
 * exactly (RunView.mc): [elapsed_s, lat_e5, lng_e5, alt_dm, hr, cadence, pace_ds].
 *   lat_e5/lng_e5 = coordinate x 100000 (integer)
 *   alt_dm        = altitude x 10 (decimetres)
 *   pace_ds       = pace x 10 (deciseconds/km)
 * Captured every 15s during a standalone (non-phone-connected) run, capped at 360 points
 * (90 minutes of coverage) — same cadence/cap as the Garmin app.
 */
data class GpsPoint(
    val elapsedS: Int,
    val latE5: Int,
    val lngE5: Int,
    val altDm: Int,
    val hr: Int,
    val cadence: Int,
    val paceDs: Int
)

/** Storage backend abstraction so [OfflineGpsBuffer] is unit-testable without a real DataStore/device. */
interface OfflineBufferStorage {
    /** Returns true if the write succeeded, false if it failed (e.g. quota exceeded). */
    fun write(key: String, value: String): Boolean
    fun delete(key: String)
}

enum class SaveTier { FULL, COMPACT, METADATA_ONLY }

/**
 * 4-tier storage-full-resilient cascade — mirrors RunView.mc's finishRun() offline-buffer save
 * logic exactly:
 *   Tier 1: save the full point array.
 *   Tier 2: clear any stale previous batch to free quota, retry the full array.
 *   Tier 3: compact — keep only every 2nd point (halves storage cost, still ~45min coverage).
 *   Tier 4: metadata only — scalar summary (distance/duration/ascent) survives even if every
 *           GPS point write fails; the in-memory copy is still available for a live BT/HTTP
 *           flush the moment connectivity returns.
 * The in-memory [points] list is always retained regardless of which tier (if any) succeeded.
 */
class OfflineGpsBuffer(private val storage: OfflineBufferStorage) {

    companion object {
        const val MAX_POINTS = 360
        private const val KEY_SESSION_ID = "offlineBatchSessionId"
        private const val KEY_DISTANCE = "offlineBatchDistance"
        private const val KEY_DURATION = "offlineBatchDuration"
        private const val KEY_ASCENT = "offlineBatchAscent"
        private const val KEY_POINTS = "offlineBatchPoints"
    }

    private val _points = mutableListOf<GpsPoint>()
    val points: List<GpsPoint> get() = _points
    var isFull = false
        private set

    fun reset() {
        _points.clear()
        isFull = false
    }

    fun addPoint(p: GpsPoint) {
        if (_points.size >= MAX_POINTS) {
            isFull = true
            return
        }
        _points.add(p)
    }

    /**
     * Persists the buffer via the tier cascade. Metadata (session id / distance / duration /
     * ascent) is written first and unconditionally — it's tiny and almost always fits even
     * when the point array can't.
     */
    fun save(sessionId: String, distanceM: Float, durationS: Int, ascentM: Float): SaveTier {
        storage.write(KEY_SESSION_ID, sessionId)
        storage.write(KEY_DISTANCE, distanceM.toString())
        storage.write(KEY_DURATION, durationS.toString())
        storage.write(KEY_ASCENT, ascentM.toString())

        val fullJson = encode(_points)
        if (storage.write(KEY_POINTS, fullJson)) return SaveTier.FULL

        // Tier 2: clear any stale previous batch to free quota, retry the full array.
        storage.delete(KEY_POINTS)
        if (storage.write(KEY_POINTS, fullJson)) return SaveTier.FULL

        // Tier 3: compact — every 2nd point.
        val compact = _points.filterIndexed { i, _ -> i % 2 == 0 }
        val compactJson = encode(compact)
        if (storage.write(KEY_POINTS, compactJson)) return SaveTier.COMPACT

        // Tier 4: metadata only — GPS points dropped, scalar summary already saved above.
        storage.delete(KEY_POINTS)
        return SaveTier.METADATA_ONLY
    }

    fun clearPersisted() {
        storage.delete(KEY_SESSION_ID)
        storage.delete(KEY_POINTS)
        storage.delete(KEY_DISTANCE)
        storage.delete(KEY_DURATION)
        storage.delete(KEY_ASCENT)
    }

    private fun encode(points: List<GpsPoint>): String =
        points.joinToString(";") {
            "${it.elapsedS},${it.latE5},${it.lngE5},${it.altDm},${it.hr},${it.cadence},${it.paceDs}"
        }
}

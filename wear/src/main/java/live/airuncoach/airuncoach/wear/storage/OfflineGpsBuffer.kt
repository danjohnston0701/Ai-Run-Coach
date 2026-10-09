package live.airuncoach.airuncoach.wear.storage

/**
 * A single compact sample — the Garmin watch app's 7-element point format exactly
 * (RunView.mc): [elapsed_s, lat_e5, lng_e5, alt_dm, hr, cadence, pace_ds].
 *   lat_e5/lng_e5 = coordinate x 100000 (integer)
 *   alt_dm        = altitude x 10 (decimetres)
 *   pace_ds       = pace x 10 (deciseconds/km)
 */
data class GpsPoint(
    val elapsedS: Int,
    val latE5: Int,
    val lngE5: Int,
    val altDm: Int,
    val hr: Int,
    val cadence: Int,
    val paceDs: Int
) {
    fun toCompact(): List<Int> = listOf(elapsedS, latE5, lngE5, altDm, hr, cadence, paceDs)

    companion object {
        fun fromCompact(p: List<Int>): GpsPoint? =
            if (p.size < 7) null else GpsPoint(p[0], p[1], p[2], p[3], p[4], p[5], p[6])
    }
}

/**
 * The in-memory track of a watch-owned run, captured every [CAPTURE_INTERVAL_MS]. Persistence
 * lives in [PendingRunStore] (checkpointed during the run, queued at the finish).
 *
 * Garmin samples every 15 s and stops at 90 minutes because of its tiny heap; a Galaxy Watch
 * has room for a finer track and a long run, so this keeps 5 s samples for 6 hours — a half
 * marathon over 90 minutes used to lose the rest of its route.
 */
class OfflineGpsBuffer {

    companion object {
        const val CAPTURE_INTERVAL_MS = 5_000L
        const val MAX_POINTS = 4_320 // 6 h at 5 s
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

    fun compact(): List<List<Int>> = _points.map { it.toCompact() }

    /** Reloads a checkpointed track after the app was killed mid-run. */
    fun restore(compact: List<List<Int>>) {
        reset()
        compact.mapNotNull { GpsPoint.fromCompact(it) }.forEach { addPoint(it) }
    }
}

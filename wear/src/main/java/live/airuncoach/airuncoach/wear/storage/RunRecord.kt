package live.airuncoach.airuncoach.wear.storage

/**
 * Everything needed to save one watch-owned run to the backend, on its own — the durable unit
 * behind both the in-progress checkpoint (battery died / app killed mid-run) and the queue of
 * finished runs still waiting to sync. Serialised with Gson, so every field has a default and
 * a record written by an older build still loads.
 *
 * [points] use the Garmin watch app's compact 7-field format (see [GpsPoint]) — the shape
 * `/api/garmin-companion/session/{id}/upload-batch` decodes.
 */
data class RunRecord(
    val sessionId: String = "",
    val sessionType: String = "run",
    val plannedWorkoutId: String? = null,
    /** Wall-clock start, epoch seconds — the batch points only carry elapsed seconds, so
     * without it the server dates a late-synced run to when it synced. */
    val startedAtEpochSec: Long = 0,
    /** When the run finished (or, for a recovered checkpoint, was last saved), epoch ms. */
    val finishedAtMs: Long = 0,
    val distanceM: Double = 0.0,
    val durationSec: Int = 0,
    val totalAscentM: Double = 0.0,
    val totalDescentM: Double = 0.0,
    val avgHeartRate: Int? = null,
    val maxHeartRate: Int? = null,
    val avgCadence: Int? = null,
    val avgPaceSecPerKm: Double? = null,
    val points: List<List<Int>> = emptyList(),
    /** POST session/start reached the server, so session/end has a session to close. */
    val sessionStarted: Boolean = false,
    /** POST session/end already succeeded — a retry only needs the batch upload. */
    val endSent: Boolean = false,
    /** Saved from an unfinished checkpoint (battery died / app killed), not a pressed FINISH. */
    val recovered: Boolean = false,
    /** Points were thinned (every 2nd kept) or dropped to fit storage. */
    val saveTier: SaveTier = SaveTier.FULL,

    // ── Checkpoint-only state, so a killed app can carry on the same run ───────────
    val clock: ActiveClockSnapshot? = null,
    val isPaused: Boolean = false,
    val sampleCount: Int = 0,
    val sumHeartRate: Double = 0.0,
    val sumCadence: Double = 0.0,
    val sumPace: Double = 0.0,
    val lastAltM: Double? = null,
)

/** Persisted form of [live.airuncoach.airuncoach.wear.session.ActiveClock]. */
data class ActiveClockSnapshot(
    val startedAtMs: Long = 0,
    val pausedTotalMs: Long = 0,
    /** Non-null while paused: when the current pause began. */
    val pausedAtMs: Long? = null,
)

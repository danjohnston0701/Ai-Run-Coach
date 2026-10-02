package live.airuncoach.airuncoach.wear.ui

/** Which full-screen overlay (if any) is showing — mirrors RunView.mc's OVERLAY_* enum. Only
 * WAITING and GPS_WAIT short-circuit the dashboard; NONE falls through to Diamond/Grid. */
enum class Overlay { WAITING, GPS_WAIT, NONE }

/**
 * All state the UI needs, owned by [live.airuncoach.airuncoach.wear.session.RunSessionController]
 * and observed directly via its `StateFlow` (no separate ViewModel indirection — the controller
 * is already Application-scoped/lifecycle-safe, see its class doc).
 */
data class RunScreenState(
    val overlay: Overlay = Overlay.WAITING,
    val isRunning: Boolean = false,
    val isPaused: Boolean = false,
    val isFinished: Boolean = false,
    val isAuthenticated: Boolean = false,
    val isPhoneConnected: Boolean = false,
    val gpsQuality: Int = 0,
    val gpsLost: Boolean = false,
    val offlineGraceElapsed: Boolean = false,
    val elapsedMs: Long = 0,
    val distanceM: Double = 0.0,
    val paceSecPerKm: Double = 0.0,
    val heartRate: Int = 0,
    val cadence: Int = 0,
    val avgPaceSecPerKm: Double = 0.0,
    val batteryPct: Int? = null,
    val statusMessage: String? = null,
    val screenPage: Int = 0,
    val sessionType: String = "run",
    /** The phone has sent a prepared session ("preparedRun") for the next run. */
    val isPrepared: Boolean = false,
    /** The runner chose "Continue without coaching" on the prepare-on-phone screen. */
    val prepareGateDismissed: Boolean = false,
    /** The prepared session's details, shown on the ready screen (null/blank = not sent). */
    val preparedDistanceKm: Double? = null,
    val preparedTargetPace: String? = null,
    /** Runner's max HR (208 − 0.7 × age), known only once the phone has sent a real one — a
     * guessed value must never be dressed up as a heart-rate zone. Mirrors RunView.mc's
     * _maxHr / _maxHrKnown. */
    val maxHr: Int? = null
) {
    val isWalk: Boolean get() = sessionType == "walk"

    /** Before a run, after GPS lock and the prepare step: the ready screen with START. */
    val showReady: Boolean
        get() = !isRunning && !isPaused && !isFinished && overlay == Overlay.NONE

    /** Heart-rate zone 1–5, or null when there's no reading or no personalised max HR. */
    val hrZone: Int?
        get() {
            val max = maxHr ?: return null
            if (heartRate <= 0) return null
            val pct = heartRate * 100.0 / max
            return when {
                pct < 60 -> 1
                pct < 70 -> 2
                pct < 80 -> 3
                pct < 90 -> 4
                else -> 5
            }
        }

    /**
     * Show the prepare-on-phone screen instead of the start screen: paired, idle, nothing
     * prepared, and the runner hasn't opted out. Hidden on the post-run screen so the final
     * stats stay visible. Mirrors RunView.mc's isPrepareGateActive().
     */
    val showPrepareGate: Boolean
        get() = isAuthenticated && !isRunning && !isPaused && !isPrepared &&
            !prepareGateDismissed && !isFinished
}

/**
 * What BACK (the Galaxy Watch's bottom button, or the swipe-back gesture) does. Unlike Garmin's
 * BACK, which pages the screens mid-run, here it pauses: a Galaxy Watch's top button is the
 * system Home key and never reaches the app, so BACK is the only hardware control there is.
 * Paging is a horizontal swipe instead.
 */
enum class BackAction { Pause, ConfirmFinish, ConfirmExit, None }

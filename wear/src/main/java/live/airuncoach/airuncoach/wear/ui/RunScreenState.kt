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
    val prepareGateDismissed: Boolean = false
) {
    val isWalk: Boolean get() = sessionType == "walk"

    /**
     * Show the prepare-on-phone screen instead of the start screen: paired, idle, nothing
     * prepared, and the runner hasn't opted out. Hidden on the post-run screen so the final
     * stats stay visible. Mirrors RunView.mc's isPrepareGateActive().
     */
    val showPrepareGate: Boolean
        get() = isAuthenticated && !isRunning && !isPaused && !isPrepared &&
            !prepareGateDismissed && !isFinished
}

/** Three-way BACK-button branch — mirrors RunView.mc's `onBack()` truth table exactly. */
enum class BackAction { ToggleScreen, ConfirmFinish, ConfirmExit, None }

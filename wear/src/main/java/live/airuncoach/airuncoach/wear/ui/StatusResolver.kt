package live.airuncoach.airuncoach.wear.ui

/** Pure input for [resolveStatus] — kept separate from any Compose/Android state so the
 * priority logic is unit-testable without a device. */
data class StatusBarInput(
    val ephemeralMessage: String?,
    val isRunning: Boolean,
    val gpsLost: Boolean,
    val isAuthenticated: Boolean,
    val isConnected: Boolean,
    val offlineGraceElapsed: Boolean,
    val isFinished: Boolean = false
)

enum class StatusTone { NEUTRAL, WARNING, DIM }

data class ResolvedStatus(val text: String?, val tone: StatusTone)

/**
 * Priority-ordered status-bar text for the run dashboards — mirrors the Garmin Connect IQ watch
 * app's `_drawStatusBar()` (RunView.mc):
 *   0. blank on the FINISHED screen — it's the runner's result, no prompts or nudges on it
 *   1. Ephemeral status message (e.g. "Asking coach...", "Connected - streaming live")
 *   2. "GPS LOST" — while running and GPS quality has been below threshold for the grace window
 *   3. "OFFLINE" — idle, authenticated, not connected to phone, past the connect grace period
 *   4. blank otherwise. Garmin's idle "PRESS START" has no equivalent: before a run the
 *      dashboards give way to the ready screen and its START button.
 */
fun resolveStatus(input: StatusBarInput): ResolvedStatus = with(input) {
    when {
        isFinished && !isRunning -> ResolvedStatus(null, StatusTone.DIM)
        !ephemeralMessage.isNullOrBlank() -> ResolvedStatus(ephemeralMessage, StatusTone.NEUTRAL)
        isRunning && gpsLost -> ResolvedStatus("GPS LOST", StatusTone.WARNING)
        !isRunning && isAuthenticated && !isConnected && offlineGraceElapsed -> ResolvedStatus("OFFLINE", StatusTone.WARNING)
        else -> ResolvedStatus(null, StatusTone.DIM)
    }
}

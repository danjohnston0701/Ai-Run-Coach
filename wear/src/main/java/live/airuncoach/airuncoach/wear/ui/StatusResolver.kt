package live.airuncoach.airuncoach.wear.ui

/** Pure input for [resolveStatus] — kept separate from any Compose/Android state so the
 * priority logic is unit-testable without a device. */
data class StatusBarInput(
    val ephemeralMessage: String?,
    val isRunning: Boolean,
    val gpsLost: Boolean,
    val isAuthenticated: Boolean,
    val isConnected: Boolean,
    val offlineGraceElapsed: Boolean
)

enum class StatusTone { NEUTRAL, WARNING, DIM }

data class ResolvedStatus(val text: String?, val tone: StatusTone)

/**
 * Priority-ordered status-bar text resolution — mirrors the Garmin Connect IQ watch app's
 * `_drawStatusBar()` (RunView.mc) exactly:
 *   1. Ephemeral status message (e.g. "Asking coach...", "Connected - streaming live")
 *   2. "GPS LOST" — while running and GPS quality has been below threshold for the grace window
 *   3. "OFFLINE" — idle, authenticated, not connected to phone, past the connect grace period
 *   4. "PRESS START" — idle, otherwise nothing to report
 *   5. blank — running with nothing else to show
 */
fun resolveStatus(input: StatusBarInput): ResolvedStatus = with(input) {
    when {
        !ephemeralMessage.isNullOrBlank() -> ResolvedStatus(ephemeralMessage, StatusTone.NEUTRAL)
        isRunning && gpsLost -> ResolvedStatus("GPS LOST", StatusTone.WARNING)
        !isRunning && isAuthenticated && !isConnected && offlineGraceElapsed -> ResolvedStatus("OFFLINE", StatusTone.WARNING)
        !isRunning -> ResolvedStatus("PRESS START", StatusTone.DIM)
        else -> ResolvedStatus(null, StatusTone.DIM)
    }
}

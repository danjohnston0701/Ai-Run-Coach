package live.airuncoach.airuncoach.wear.ui

import java.util.Locale

/** mm:ss (or h:mm:ss past an hour) — matches RunView.mc's duration display. */
fun formatElapsed(elapsedMs: Long): String {
    val totalSec = elapsedMs / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s)
    else String.format(Locale.US, "%d:%02d", m, s)
}

/** m:ss/km, or "--" if pace is invalid/unavailable — matches RunView.mc's `_fmtPaceDec`. */
fun formatPace(paceSecPerKm: Double): String {
    if (paceSecPerKm <= 0.0 || paceSecPerKm > 1200.0) return "--"
    val totalSec = paceSecPerKm.toInt()
    val m = totalSec / 60
    val s = totalSec % 60
    return String.format(Locale.US, "%d:%02d", m, s)
}

/** Distance in km to 2 decimal places. */
fun formatDistanceKm(distanceM: Double): String = String.format(Locale.US, "%.2f", distanceM / 1000.0)

fun formatIntOrDash(value: Int): String = if (value > 0) value.toString() else "--"

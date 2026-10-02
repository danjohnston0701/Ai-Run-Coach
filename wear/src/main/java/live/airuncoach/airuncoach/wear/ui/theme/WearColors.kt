package live.airuncoach.airuncoach.wear.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Exact palette from the Garmin Connect IQ watch app's Diamond Grid Dashboard (RunView.mc) —
 * every screen composable references these constants rather than inlining hex values, so the
 * two apps stay visually identical by construction.
 */
object WearColors {
    val Background = Color.Black

    // Header / waiting overlay
    val GreenRing = Color(0xFF00AA55)

    // Metric rings
    val TealKm = Color(0xFF00BFA8)
    val YellowPace = Color(0xFFFFDD00)
    val OrangeCadence = Color(0xFFFF8800) // grid screen's cadence label color

    // Duration label states
    val DurationRunning = Color(0xFF00CC66)
    val DurationFinished = Color(0xFF007744)

    // GPS wait
    val GpsBlue = Color(0xFF0088CC)
    val GpsBarRed = Color(0xFFF44336)
    val GpsBarAmber = Color(0xFFFFD740)
    val GpsBarGreen = Color(0xFF00E676)
    val GpsBarUnlit = Color(0xFFBBBBBB)

    // Status / warnings
    val AmberWarning = Color(0xFFFFAA00)
    val OrangePaused = Color(0xFFFF6600)
    val OrangeStartDisabled = Color(0xFFFF6600)

    // Text
    val White = Color.White
    val LightGray = Color(0xFFBBBBBB)
    val DarkGray = Color(0xFF555555)
    val DividerGray = Color(0xFF444444)
    val DimGray = Color(0xFFAAAAAA)

    // Battery
    val BatteryOutline = Color(0xFF888888)
    val BatteryGood = Color(0xFF00CC66)
    val BatteryLow = Color(0xFFFFAA00)
    val BatteryCritical = Color(0xFFFF4444)

    // START button (green) — gold when the phone has prepared a coached session
    val StartGreen = Color(0xFF00E676)
    val CoachedGold = Color(0xFFFFC94D)

    // Heart rate — the HR ring and grid label, same red as the Garmin app
    val RedHr = Color(0xFFFF3355)
}

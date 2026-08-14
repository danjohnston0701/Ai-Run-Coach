package live.airuncoach.airuncoach.wear.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.RunScreenState
import live.airuncoach.airuncoach.wear.ui.StatusBarInput
import live.airuncoach.airuncoach.wear.ui.components.PageDots
import live.airuncoach.airuncoach.wear.ui.components.StatusBar
import live.airuncoach.airuncoach.wear.ui.formatDistanceKm
import live.airuncoach.airuncoach.wear.ui.formatElapsed
import live.airuncoach.airuncoach.wear.ui.formatIntOrDash
import live.airuncoach.airuncoach.wear.ui.formatPace
import live.airuncoach.airuncoach.wear.ui.theme.WearColors
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Alternate 3x2 data-dense screen — mirrors RunView.mc's `_drawGridScreen()`: Duration|Pace,
 * Distance|Cadence, HR|Avg Pace, no battery icon, same status bar. Reached via swipe/
 * horizontal-drag toggle (see input/GestureHandler.kt).
 */
@Composable
fun GridDashboard(state: RunScreenState, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val w = maxWidth
        val h = maxHeight

        val timerText = if (state.isRunning || state.isPaused || state.isFinished) {
            formatElapsed(state.elapsedMs)
        } else {
            SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
        }
        val timerColor = when {
            state.isRunning || state.isPaused -> WearColors.DurationRunning
            state.isFinished -> WearColors.DurationFinished
            else -> WearColors.White
        }

        // Row 1: Duration | Pace
        GridCell("DURATION", timerText, timerColor, Modifier.align(Alignment.TopStart).offset(x = w * 0.05f, y = h * 0.16f))
        GridCell("PACE", formatPace(state.paceSecPerKm), WearColors.YellowPace, Modifier.align(Alignment.TopEnd).offset(x = -w * 0.05f, y = h * 0.16f))

        // Row 2: Distance | Cadence
        GridCell("KM", formatDistanceKm(state.distanceM), WearColors.TealKm, Modifier.align(Alignment.CenterStart).offset(x = w * 0.05f, y = -h * 0.08f))
        GridCell("SPM", formatIntOrDash(state.cadence), WearColors.OrangeCadence, Modifier.align(Alignment.CenterEnd).offset(x = -w * 0.05f, y = -h * 0.08f))

        // Row 3: HR | Avg Pace
        GridCell("HR", formatIntOrDash(state.heartRate), WearColors.RedHr, Modifier.align(Alignment.BottomStart).offset(x = w * 0.05f, y = -h * 0.24f))
        GridCell("AVG PACE", formatPace(state.avgPaceSecPerKm), WearColors.YellowPace, Modifier.align(Alignment.BottomEnd).offset(x = -w * 0.05f, y = -h * 0.24f))

        // Divider lines
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cx = size.width / 2f
            drawLine(WearColors.DividerGray, androidx.compose.ui.geometry.Offset(0f, size.height * 0.38f), androidx.compose.ui.geometry.Offset(size.width, size.height * 0.38f))
            drawLine(WearColors.DividerGray, androidx.compose.ui.geometry.Offset(0f, size.height * 0.63f), androidx.compose.ui.geometry.Offset(size.width, size.height * 0.63f))
            drawLine(WearColors.DividerGray, androidx.compose.ui.geometry.Offset(cx, size.height * 0.14f), androidx.compose.ui.geometry.Offset(cx, size.height * 0.79f))
        }

        StatusBar(
            input = StatusBarInput(
                ephemeralMessage = state.statusMessage,
                isRunning = state.isRunning,
                gpsLost = state.gpsLost,
                isAuthenticated = state.isAuthenticated,
                isConnected = state.isPhoneConnected,
                offlineGraceElapsed = state.offlineGraceElapsed
            ),
            modifier = Modifier.align(Alignment.BottomCenter).offset(y = -h * 0.02f)
        )

        if (state.isPaused) {
            Text(
                text = "PAUSED",
                color = WearColors.OrangePaused,
                style = TextStyle(fontSize = 11.sp, textAlign = TextAlign.Center),
                modifier = Modifier.align(Alignment.TopCenter).offset(y = h * 0.02f)
            )
        }
        if (state.isRunning || state.isPaused) {
            PageDots(activePage = 1, modifier = Modifier.align(Alignment.BottomCenter).offset(y = -h * 0.10f))
        }
    }
}

@Composable
private fun GridCell(label: String, value: String, color: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    androidx.compose.foundation.layout.Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = label, color = color, style = TextStyle(fontSize = 8.sp, textAlign = TextAlign.Center))
        Text(text = value, color = WearColors.White, style = TextStyle(fontSize = 14.sp, textAlign = TextAlign.Center))
    }
}

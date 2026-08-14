package live.airuncoach.airuncoach.wear.ui.screens

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.RunScreenState
import live.airuncoach.airuncoach.wear.ui.StatusBarInput
import live.airuncoach.airuncoach.wear.ui.components.MetricRing
import live.airuncoach.airuncoach.wear.ui.components.PageDots
import live.airuncoach.airuncoach.wear.ui.components.StartHintArc
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
 * The default main screen — mirrors RunView.mc's Diamond Grid Dashboard: timer+cadence top
 * block, 3 metric rings (KM/PACE/HR), battery, status bar, paused banner, page dots, idle
 * start-hint arc.
 */
@Composable
fun DiamondDashboard(state: RunScreenState, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val w = maxWidth
        val h = maxHeight

        if (!state.isRunning && !state.isPaused) {
            StartHintArc(modifier = Modifier.fillMaxSize())
        }

        // ── Top block: timer + cadence ──
        val timerLabel: String
        val timerColor: androidx.compose.ui.graphics.Color
        val timerText: String
        when {
            state.isRunning || state.isPaused -> {
                timerLabel = "DURATION"
                timerColor = WearColors.DurationRunning
                timerText = formatElapsed(state.elapsedMs)
            }
            state.isFinished -> {
                timerLabel = "FINISHED"
                timerColor = WearColors.DurationFinished
                timerText = formatElapsed(state.elapsedMs)
            }
            else -> {
                timerLabel = ""
                timerColor = WearColors.White
                timerText = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            }
        }

        if (timerLabel.isNotEmpty()) {
            Text(
                text = timerLabel,
                color = timerColor,
                style = TextStyle(fontSize = 9.sp, textAlign = TextAlign.Center),
                modifier = Modifier.align(Alignment.TopCenter).offset(y = h * 0.06f)
            )
        }
        Text(
            text = timerText,
            color = if (timerLabel.isNotEmpty()) WearColors.White else WearColors.White,
            style = TextStyle(fontSize = 20.sp, textAlign = TextAlign.Center),
            modifier = Modifier.align(Alignment.TopCenter).offset(y = h * 0.12f)
        )
        Text(
            text = formatIntOrDash(state.cadence),
            color = WearColors.White,
            style = TextStyle(fontSize = 14.sp, textAlign = TextAlign.Center),
            modifier = Modifier.align(Alignment.TopCenter).offset(y = h * 0.24f)
        )
        Text(
            text = "SPM",
            color = WearColors.White,
            style = TextStyle(fontSize = 9.sp, textAlign = TextAlign.Center),
            modifier = Modifier.align(Alignment.TopCenter).offset(y = h * 0.34f)
        )

        // ── Rings: KM (left), PACE (right), HR (bottom) ──
        val ringDiameter = w * 0.34f
        MetricRing(
            label = "KM", value = formatDistanceKm(state.distanceM), color = WearColors.TealKm,
            diameter = ringDiameter,
            modifier = Modifier.align(Alignment.CenterStart).offset(x = w * 0.02f)
        )
        MetricRing(
            label = "PACE", value = formatPace(state.paceSecPerKm), color = WearColors.YellowPace,
            diameter = ringDiameter,
            modifier = Modifier.align(Alignment.CenterEnd).offset(x = -w * 0.02f)
        )
        MetricRing(
            label = "HR", value = formatIntOrDash(state.heartRate), color = WearColors.RedHr,
            diameter = ringDiameter,
            modifier = Modifier.align(Alignment.BottomCenter).offset(y = -h * 0.14f)
        )

        // ── Battery ──
        BatteryIndicator(modifier = Modifier.align(Alignment.CenterEnd).offset(x = -w * 0.02f, y = h * 0.20f))

        // ── Status bar ──
        StatusBar(
            input = StatusBarInput(
                ephemeralMessage = state.statusMessage,
                isRunning = state.isRunning,
                gpsLost = state.gpsLost,
                isAuthenticated = state.isAuthenticated,
                isConnected = state.isPhoneConnected,
                offlineGraceElapsed = state.offlineGraceElapsed
            ),
            modifier = Modifier.align(Alignment.BottomCenter).offset(y = -h * 0.04f)
        )

        // ── Paused banner ──
        if (state.isPaused) {
            Text(
                text = "PAUSED",
                color = WearColors.OrangePaused,
                style = TextStyle(fontSize = 11.sp, textAlign = TextAlign.Center),
                modifier = Modifier.align(Alignment.TopCenter).offset(y = h * 0.02f)
            )
        }

        // ── Page dots ──
        if (state.isRunning || state.isPaused) {
            PageDots(activePage = 0, modifier = Modifier.align(Alignment.BottomCenter).offset(y = -h * 0.02f))
        }
    }
}

@Composable
private fun BatteryIndicator(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var pct by remember { mutableStateOf<Int?>(null) }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        pct = readBatteryPercent(context)
    }
    pct?.let {
        Text(
            text = "$it%",
            color = when {
                it >= 50 -> WearColors.BatteryGood
                it >= 20 -> WearColors.BatteryLow
                else -> WearColors.BatteryCritical
            },
            style = TextStyle(fontSize = 8.sp, textAlign = TextAlign.Center),
            modifier = modifier
        )
    }
}

private fun readBatteryPercent(context: Context): Int? = try {
    val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
    bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
} catch (e: Exception) {
    null
}

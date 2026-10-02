package live.airuncoach.airuncoach.wear.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.RunScreenState
import live.airuncoach.airuncoach.wear.ui.components.GpsSignalBars
import live.airuncoach.airuncoach.wear.ui.components.OverlayHeader
import live.airuncoach.airuncoach.wear.ui.theme.WearColors
import java.util.Locale

/**
 * Ready-to-start screen: after GPS lock and the prepare step, before START. A Galaxy Watch's top
 * button is the system Home key and never reaches the app, so unlike Garmin's idle dashboard
 * ("PRESS START") this needs a real on-screen START — the same pattern as the Apple Watch app's
 * ReadyView. Shows what the phone prepared (gold, coached) or how this run will sync.
 */
@Composable
fun ReadyOverlay(state: RunScreenState, onStart: () -> Unit, modifier: Modifier = Modifier) {
    val coached = state.isPrepared
    val word = if (state.isWalk) "WALK" else "RUN"
    val accent = if (coached) WearColors.CoachedGold else WearColors.StartGreen

    Column(
        modifier = modifier.fillMaxSize().padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ) {
        OverlayHeader()

        if (coached) {
            Text(
                text = "COACHED $word",
                color = WearColors.CoachedGold,
                style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
            )
            val details = listOfNotNull(
                state.preparedDistanceKm?.let { String.format(Locale.US, "%.1f km", it) },
                state.preparedTargetPace?.let { "target $it /km" }
            ).joinToString("  ·  ")
            if (details.isNotEmpty()) {
                Text(
                    text = details,
                    color = WearColors.LightGray,
                    style = TextStyle(fontSize = 10.sp, textAlign = TextAlign.Center),
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
        } else {
            Text(
                text = "READY",
                color = WearColors.White,
                style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
            )
        }

        GpsSignalBars(quality = state.gpsQuality, modifier = Modifier.padding(top = 6.dp))

        PillButton("START $word", accent, WearColors.Background, onStart, Modifier.padding(top = 8.dp))

        val (hint, warn) = when {
            coached -> "Your coach talks to you through the phone" to false
            !state.isPhoneConnected && state.offlineGraceElapsed ->
                "No phone — the run saves here and syncs later" to true
            else -> "or prepare on your phone for AI coaching" to false
        }
        Text(
            text = hint,
            color = if (warn) WearColors.AmberWarning else WearColors.DimGray,
            style = TextStyle(fontSize = 9.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 6.dp, start = 34.dp, end = 34.dp)
        )
    }
}

package live.airuncoach.airuncoach.wear.ui.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.components.OverlayHeader
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * Prepare-on-phone screen — shown instead of the start screen while the watch is paired but the
 * phone hasn't sent a prepared session (RunScreenState.showPrepareGate). Deliberately plain, no
 * run instruments, so the one thing to do is obvious: prepare on the phone for live AI coaching,
 * or explicitly continue without it. A "preparedRun" from the phone replaces it with the start
 * screen automatically. Mirrors RunView.mc's _drawPrepareGate().
 */
@Composable
fun PrepareGateOverlay(
    isPhoneConnected: Boolean,
    onContinueWithoutCoaching: () -> Unit,
    modifier: Modifier = Modifier
) {
    val transition = rememberInfiniteTransition(label = "prepare-dots")
    val dotPhase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 4f,
        animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Restart),
        label = "dots"
    )
    val dots = ".".repeat(dotPhase.toInt().coerceIn(0, 3))

    Column(
        modifier = modifier.fillMaxSize().padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ) {
        OverlayHeader()
        Text(
            text = "Prepare on your phone",
            color = WearColors.White,
            style = TextStyle(fontSize = 12.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 2.dp, start = 22.dp, end = 22.dp)
        )
        Text(
            text = "for live AI coaching",
            color = WearColors.White,
            style = TextStyle(fontSize = 12.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 2.dp, start = 22.dp, end = 22.dp)
        )
        Text(
            text = if (isPhoneConnected) "Waiting for phone$dots" else "Phone not connected",
            color = if (isPhoneConnected) WearColors.LightGray else WearColors.AmberWarning,
            style = TextStyle(fontSize = 10.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 6.dp)
        )
        Chip(
            onClick = onContinueWithoutCoaching,
            label = {
                Text(
                    text = "Continue without coaching",
                    style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center),
                    modifier = Modifier.fillMaxWidth()
                )
            },
            colors = ChipDefaults.chipColors(backgroundColor = WearColors.TealKm, contentColor = WearColors.Background),
            modifier = Modifier.padding(top = 8.dp, start = 28.dp, end = 28.dp).fillMaxWidth().height(40.dp)
        )
    }
}

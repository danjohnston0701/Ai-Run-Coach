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
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.components.OverlayHeader
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * "Not authenticated" screen — mirrors RunView.mc's `_drawWaiting()`: green header, animated
 * "Waiting" dots, and instructions to open the phone app once.
 */
@Composable
fun WaitingOverlay(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "waiting-dots")
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
            text = "Waiting$dots",
            color = WearColors.White,
            style = TextStyle(fontSize = 13.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 14.dp)
        )
        Text(
            text = "Open Ai Run Coach on your\nphone to connect.",
            color = WearColors.DimGray,
            style = TextStyle(fontSize = 10.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 10.dp, start = 16.dp, end = 16.dp)
        )
        Text(
            text = "You only need to do this once.",
            color = WearColors.TealKm,
            style = TextStyle(fontSize = 10.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 12.dp, start = 16.dp, end = 16.dp)
        )
    }
}

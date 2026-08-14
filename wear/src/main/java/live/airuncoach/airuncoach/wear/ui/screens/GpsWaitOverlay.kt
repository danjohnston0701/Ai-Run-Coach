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
import live.airuncoach.airuncoach.wear.ui.components.GpsSignalBars
import live.airuncoach.airuncoach.wear.ui.components.OverlayHeader
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

private val QUALITY_LABELS = listOf("No signal", "Last known", "Poor", "Usable", "Good")

/**
 * "Acquiring GPS" screen — mirrors RunView.mc's `_drawGpsWait()`: shared header, 4-bar
 * quality indicator, quality label, animated "Acquiring" dots, "START disabled" warning.
 */
@Composable
fun GpsWaitOverlay(quality: Int, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "gps-dots")
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
            text = "GPS",
            color = WearColors.GpsBlue,
            style = TextStyle(fontSize = 15.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 8.dp)
        )
        GpsSignalBars(quality = quality, modifier = Modifier.padding(top = 8.dp))
        Text(
            text = QUALITY_LABELS.getOrElse(quality) { "No signal" },
            color = if (quality >= 3) WearColors.GreenRing else WearColors.DimGray,
            style = TextStyle(fontSize = 10.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 8.dp)
        )
        Text(
            text = "Acquiring$dots",
            color = WearColors.DimGray,
            style = TextStyle(fontSize = 11.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 6.dp)
        )
        Text(
            text = "Stand still outdoors",
            color = WearColors.DimGray,
            style = TextStyle(fontSize = 10.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 6.dp)
        )
        Text(
            text = "START disabled",
            color = WearColors.OrangeStartDisabled,
            style = TextStyle(fontSize = 10.sp, textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 6.dp)
        )
    }
}

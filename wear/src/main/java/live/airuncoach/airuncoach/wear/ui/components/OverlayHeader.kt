package live.airuncoach.airuncoach.wear.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * Shared header for the Waiting and GPS-wait overlays: green double-ring outline + "AI RUN
 * COACH" title + divider — mirrors the common header block both overlays draw in RunView.mc.
 */
@Composable
fun OverlayHeader(modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Canvas(modifier = Modifier.fillMaxWidth().height(28.dp)) {
            val r = size.height / 2f
            val center = androidx.compose.ui.geometry.Offset(size.width / 2f, r)
            listOf(r - 5f, r - 4f).forEach { radius ->
                drawCircle(color = WearColors.GreenRing, radius = radius, center = center, style = Stroke(width = 1.5f))
            }
        }
        Text(
            text = "AI RUN COACH",
            color = WearColors.White,
            style = TextStyle(fontSize = 11.sp, textAlign = TextAlign.Center)
        )
        Canvas(modifier = Modifier.fillMaxWidth().padding(horizontal = 40.dp, vertical = 6.dp).height(1.dp)) {
            drawLine(
                color = WearColors.DarkGray,
                start = androidx.compose.ui.geometry.Offset(0f, 0f),
                end = androidx.compose.ui.geometry.Offset(size.width, 0f),
                strokeWidth = 1f
            )
        }
    }
}

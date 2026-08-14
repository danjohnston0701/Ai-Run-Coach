package live.airuncoach.airuncoach.wear.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * One "ring" metric — a 3-concentric-circle-outline ring with a label above the value,
 * mirroring RunView.mc's `_drawRing()` exactly (KM/PACE/HR on the Diamond Dashboard).
 */
@Composable
fun MetricRing(
    label: String,
    value: String,
    color: Color,
    diameter: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.size(diameter)) {
            val r = size.minDimension / 2f
            val center = Offset(size.width / 2f, size.height / 2f)
            // 3 concentric outlines (r-1, r, r+1) matching the Monkey C ring-thickness trick.
            listOf(r - 3f, r, r + 3f).forEach { radius ->
                drawCircle(
                    color = color,
                    radius = radius,
                    center = center,
                    style = Stroke(width = 1.5f)
                )
            }
        }
        androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = label,
                color = WearColors.White,
                style = TextStyle(fontSize = 9.sp, textAlign = TextAlign.Center)
            )
            Text(
                text = value,
                color = WearColors.White,
                style = TextStyle(fontSize = 16.sp, textAlign = TextAlign.Center)
            )
        }
    }
}

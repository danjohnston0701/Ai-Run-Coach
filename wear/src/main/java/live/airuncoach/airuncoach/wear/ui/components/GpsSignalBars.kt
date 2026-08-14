package live.airuncoach.airuncoach.wear.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * 4-bar GPS quality indicator — mirrors RunView.mc's `_drawGpsWait()` bars exactly: increasing
 * heights (6/12/18/24px equivalent), lit bar colors [red, amber, green, green] indexed by
 * position, lit when `quality > barIndex`, unlit bars are gray with a dark outline.
 */
@Composable
fun GpsSignalBars(quality: Int, modifier: Modifier = Modifier) {
    val heights = listOf(6.dp, 12.dp, 18.dp, 24.dp)
    val litColors = listOf(WearColors.GpsBarRed, WearColors.GpsBarAmber, WearColors.GpsBarGreen, WearColors.GpsBarGreen)

    Row(modifier = modifier, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(4.dp)) {
        heights.forEachIndexed { i, h ->
            val lit = quality > i
            Canvas(modifier = Modifier.width(6.dp).height(24.dp)) {
                val barHeight = h.toPx()
                val top = size.height - barHeight
                drawRect(
                    color = if (lit) litColors[i] else WearColors.GpsBarUnlit,
                    topLeft = androidx.compose.ui.geometry.Offset(0f, top),
                    size = Size(size.width, barHeight)
                )
                if (lit) {
                    drawRect(
                        color = WearColors.DarkGray,
                        topLeft = androidx.compose.ui.geometry.Offset(0f, top),
                        size = Size(size.width, barHeight),
                        style = Stroke(width = 1f)
                    )
                }
            }
        }
    }
}

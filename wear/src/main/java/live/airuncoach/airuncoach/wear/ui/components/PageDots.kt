package live.airuncoach.airuncoach.wear.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * Two small page-indicator dots (Diamond vs Grid dashboard) — active page filled white,
 * inactive gray outline. Mirrors RunView.mc's `_drawPageDots()`; only shown while
 * running or paused (same as Garmin).
 */
@Composable
fun PageDots(activePage: Int, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp)) {
        for (page in 0..1) {
            Canvas(modifier = Modifier.size(6.dp)) {
                val r = size.minDimension / 2f
                val center = androidx.compose.ui.geometry.Offset(r, r)
                if (page == activePage) {
                    drawCircle(color = WearColors.White, radius = r, center = center)
                } else {
                    drawCircle(color = WearColors.DarkGray, radius = r, center = center, style = Stroke(width = 1f))
                }
            }
        }
    }
}

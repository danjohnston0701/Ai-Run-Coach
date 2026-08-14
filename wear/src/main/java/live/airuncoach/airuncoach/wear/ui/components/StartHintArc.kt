package live.airuncoach.airuncoach.wear.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import kotlin.math.cos
import kotlin.math.sin
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * Idle-only "start hint": a thick green crescent hugging the bezel from 32° to 88° (upper
 * right, around the watch's ~1 o'clock position) with a small play triangle at the midpoint —
 * mirrors RunView.mc's `_drawStartHint()`, drawn only while `!isRunning && !isPaused`.
 */
@Composable
fun StartHintArc(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val r = size.minDimension / 2f - 4f
        val center = Offset(size.width / 2f, size.height / 2f)
        val startAngle = 32f
        val sweep = 56f // 32 -> 88

        // 6 concentric arcs for bezel-hugging thickness, matching the Monkey C version.
        for (i in 0 until 6) {
            drawArc(
                color = WearColors.StartHintGreen,
                startAngle = startAngle,
                sweepAngle = sweep,
                useCenter = false,
                topLeft = Offset(center.x - r + i, center.y - r + i),
                size = Size((r - i) * 2f, (r - i) * 2f),
                style = Stroke(width = 3f)
            )
        }

        // Play triangle inset 16px from the arc, at the sweep's midpoint angle.
        val midAngleRad = Math.toRadians((startAngle + sweep / 2f).toDouble())
        val triR = r - 16f
        val tx = center.x + triR * cos(midAngleRad).toFloat()
        val ty = center.y + triR * sin(midAngleRad).toFloat()
        val triSize = 10f
        val path = Path().apply {
            moveTo(tx - triSize / 2f, ty - triSize / 2f)
            lineTo(tx - triSize / 2f, ty + triSize / 2f)
            lineTo(tx + triSize / 2f, ty)
            close()
        }
        drawPath(path, color = WearColors.StartHintGreen)
    }
}

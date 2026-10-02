package live.airuncoach.airuncoach.wear.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.RunScreenState
import live.airuncoach.airuncoach.wear.ui.formatDistanceKm
import live.airuncoach.airuncoach.wear.ui.formatElapsed
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * Paused: the run so far plus RESUME and FINISH. Touch controls for the same reason as
 * [ReadyOverlay] — the Galaxy Watch has no app-usable START button. The bottom (BACK) button
 * still opens the finish confirmation, as on Garmin.
 */
@Composable
fun PausedOverlay(state: RunScreenState, onResume: () -> Unit, onFinish: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "PAUSED",
            color = WearColors.OrangePaused,
            style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
        )
        Text(
            text = formatElapsed(state.elapsedMs),
            color = WearColors.White,
            style = TextStyle(fontSize = 24.sp),
            modifier = Modifier.padding(top = 2.dp)
        )
        Text(
            text = "${formatDistanceKm(state.distanceM)} km",
            color = WearColors.TealKm,
            style = TextStyle(fontSize = 12.sp)
        )
        PillButton("RESUME", WearColors.StartGreen, WearColors.Background, onResume, Modifier.padding(top = 10.dp))
        PillButton(
            if (state.isWalk) "FINISH WALK" else "FINISH RUN",
            WearColors.DividerGray, WearColors.White, onFinish, Modifier.padding(top = 6.dp)
        )
    }
}

@Composable
internal fun PillButton(label: String, background: Color, content: Color, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .padding(horizontal = 36.dp)
            .fillMaxWidth()
            .height(36.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(background)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(text = label, color = content, style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp))
    }
}

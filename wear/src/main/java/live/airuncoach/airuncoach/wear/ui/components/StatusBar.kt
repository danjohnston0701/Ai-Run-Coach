package live.airuncoach.airuncoach.wear.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.ui.StatusBarInput
import live.airuncoach.airuncoach.wear.ui.StatusTone
import live.airuncoach.airuncoach.wear.ui.resolveStatus
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/** Compose wrapper around the pure [resolveStatus] priority function. */
@Composable
fun StatusBar(input: StatusBarInput, modifier: Modifier = Modifier) {
    val resolved = resolveStatus(input)
    if (resolved.text != null) {
        Text(
            text = resolved.text,
            color = when (resolved.tone) {
                StatusTone.WARNING -> WearColors.AmberWarning
                StatusTone.DIM -> WearColors.DarkGray
                StatusTone.NEUTRAL -> WearColors.White
            },
            style = TextStyle(fontSize = 9.sp, textAlign = TextAlign.Center),
            modifier = modifier
        )
    }
}

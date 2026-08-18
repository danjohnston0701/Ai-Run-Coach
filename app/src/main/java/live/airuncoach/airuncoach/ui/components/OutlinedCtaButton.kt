package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * Secondary CTA: 56dp-tall outlined button, teal border/text, optional leading icon.
 * Shared across MapMyRunSetupScreen, RouteSelectionScreen, and WorkoutDetailScreen so the
 * radius/border/color stay a single source of truth instead of three hand-copied blocks
 * that had already drifted from each other (12dp/16dp/20dp corners, one hardcoded raw color).
 */
@Composable
fun OutlinedCtaButton(
    text: String,
    leadingIconRes: Int?,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp),
        shape = RoundedCornerShape(BorderRadius.lg),
        border = BorderStroke(1.5.dp, Colors.primary),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = Colors.primary,
            disabledContentColor = Colors.textMuted
        )
    ) {
        if (leadingIconRes != null) {
            Icon(
                painter = painterResource(id = leadingIconRes),
                contentDescription = null,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
        }
        Text(
            text = text,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
        )
    }
}

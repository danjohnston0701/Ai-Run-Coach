package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors

/**
 * Badge indicating that a run is part of a Coaching Plan
 * Shows the workout type and plan progress week
 */
@Composable
fun CoachingPlanBadge(
    workoutType: String?,
    planProgressWeek: Int?,
    totalWeeks: Int?,
    modifier: Modifier = Modifier
) {
    if (workoutType == null && planProgressWeek == null) {
        // Not part of a coaching plan
        return
    }

    val subtitle = buildString {
        if (!workoutType.isNullOrEmpty()) {
            append(formatWorkoutType(workoutType))
        }
        if (planProgressWeek != null && totalWeeks != null) {
            if (this.isNotEmpty()) append(" • ")
            append("Week $planProgressWeek/$totalWeeks")
        }
    }

    if (subtitle.isEmpty()) return

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(
                color = Colors.primary.copy(alpha = 0.12f),
                shape = RoundedCornerShape(12.dp)
            )
            .border(
                width = 1.dp,
                color = Colors.primary.copy(alpha = 0.35f),
                shape = RoundedCornerShape(12.dp)
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start
        ) {
            Icon(
                imageVector = Icons.Default.FitnessCenter,
                contentDescription = "Coaching Plan",
                tint = Colors.primary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text(
                    text = "Coaching Plan Session",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.primary
                )
                Text(
                    text = subtitle,
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Medium),
                    color = Colors.primary.copy(alpha = 0.8f)
                )
            }
        }
    }
}

/**
 * Format workout type to user-friendly display string
 * E.g., "long_run" → "Long Run", "intervals" → "Intervals"
 */
private fun formatWorkoutType(type: String): String {
    return type.replace("_", " ")
        .split(" ")
        .joinToString(" ") { word ->
            word.replaceFirstChar { it.uppercase() }
        }
}

package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.network.model.WorkoutDetails
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * Display status for workout card (today, overdue, completed, etc.)
 */
enum class WorkoutCardStatus {
    TODAY, OVERDUE, COMPLETED, REST_DAY
}

/**
 * Reusable card displaying a single workout with status handling
 * Used in both CoachingProgrammeScreen and DashboardScreen
 */
@Composable
fun TodayWorkoutCard(
    workout: WorkoutDetails,
    isLoading: Boolean = false,
    status: WorkoutCardStatus = WorkoutCardStatus.TODAY,
    onPrepare: () -> Unit = {},
    onComplete: () -> Unit = {},
    onSkip: () -> Unit = {},
    onViewDetail: () -> Unit = {}
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Status header (for overdue sessions)
            if (status == WorkoutCardStatus.OVERDUE) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Icon(
                        painterResource(R.drawable.icon_timer_vector),
                        null,
                        tint = Colors.warning,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(
                        "Missed Session",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.warning
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    Surface(
                        color = Colors.warning.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            "OVERDUE",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.sp),
                            color = Colors.warning,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.sm))
            }

            // Workout type badge and title
            WorkoutTypeBadge(workout.workoutType)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                workout.description ?: workoutTypeLabel(workout.workoutType),
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )

            // Instructions or warning text (for overdue)
            Spacer(modifier = Modifier.height(Spacing.sm))
            if (status == WorkoutCardStatus.OVERDUE) {
                Text(
                    "You have a session you haven't completed yet. Complete it now or it will be skipped.",
                    style = AppTextStyles.small,
                    color = Colors.textSecondary,
                    maxLines = 3
                )
            } else if (!workout.instructions.isNullOrEmpty()) {
                Text(
                    workout.instructions,
                    style = AppTextStyles.small,
                    color = Colors.textSecondary,
                    maxLines = 3
                )
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Workout stats chips
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                // Row 1: Distance or Duration
                if (isTimeBasedWorkout(workout)) {
                    workout.duration?.let { duration ->
                        formatWorkoutDuration(duration)?.let { formatted ->
                            PlanStatChip(R.drawable.icon_clock_vector, formatted)
                        }
                    }
                } else {
                    workout.distance?.let { PlanStatChip(R.drawable.icon_target_vector, "${it}km") }
                }
                // Row 2: Intensity
                workout.intensity?.let {
                    val zoneLabel = it.replace(Regex("^z([1-5])$")) { match -> "Zone ${match.groupValues[1].uppercase()}" }
                    PlanStatChip(R.drawable.icon_heart_vector, zoneLabel)
                }
                // Row 3: Pace (if available)
                workout.targetPace?.let { raw ->
                    val paceValue = raw.replace("/km", "").trim()
                    PlanStatChip(R.drawable.icon_timer_vector, "$paceValue min/km")
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Action buttons
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                OutlinedButton(
                    onClick = onComplete,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    enabled = !isLoading
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Colors.primary, strokeWidth = 2.dp)
                    } else {
                        Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Mark Done", style = AppTextStyles.small)
                    }
                }

                Button(
                    onClick = onPrepare,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (status == WorkoutCardStatus.OVERDUE) Colors.warning else Colors.primary
                    ),
                    shape = RoundedCornerShape(12.dp),
                    enabled = !isLoading
                ) {
                    Icon(painterResource(R.drawable.icon_play_vector), null, modifier = Modifier.size(16.dp), tint = Colors.buttonText)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Prepare Session", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                }
            }

            // Optional skip button (only for today's sessions)
            if (status == WorkoutCardStatus.TODAY && workout.workoutType != "rest") {
                Spacer(modifier = Modifier.height(Spacing.sm))
                OutlinedButton(
                    onClick = onSkip,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textMuted),
                    enabled = !isLoading
                ) {
                    Icon(painter = painterResource(R.drawable.icon_x_vector), null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Skip Session", style = AppTextStyles.small)
                }
            }
        }
    }
}

/**
 * Badge displaying the workout type with a background color
 */
@Composable
fun WorkoutTypeBadge(workoutType: String) {
    Surface(shape = RoundedCornerShape(6.dp), color = workoutTypeColor(workoutType).copy(alpha = 0.15f)) {
        Text(
            workoutTypeLabel(workoutType),
            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
            color = workoutTypeColor(workoutType),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

/**
 * Small chip displaying a workout stat with an icon
 */
@Composable
fun PlanStatChip(icon: Int, label: String, modifier: Modifier = Modifier) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .background(Colors.backgroundTertiary, RoundedCornerShape(8.dp))
            .padding(horizontal = Spacing.sm, vertical = Spacing.xs)
    ) {
        Icon(
            painterResource(icon),
            null,
            tint = Colors.textSecondary,
            modifier = Modifier.size(14.dp)
        )
        Text(label, style = AppTextStyles.small, color = Colors.textSecondary)
    }
}

/**
 * Get human-readable label for a workout type
 */
fun workoutTypeLabel(type: String): String = when (type) {
    "easy" -> "Easy Run"
    "tempo" -> "Tempo Run"
    "intervals" -> "Intervals"
    "long_run" -> "Long Run"
    "hill_repeats" -> "Hill Repeats"
    "recovery" -> "Recovery Run"
    "rest" -> "Rest Day"
    "cross_training" -> "Cross Training"
    else -> type.replace("_", " ").replaceFirstChar { it.uppercase() }
}

/**
 * Get color for a workout type
 */
fun workoutTypeColor(type: String): Color = when (type) {
    "easy", "recovery" -> Colors.success
    "tempo" -> Colors.warning
    "intervals", "hill_repeats" -> Colors.error
    "long_run" -> Colors.primary
    "rest" -> Colors.textMuted
    else -> Colors.primary
}

/**
 * Determine if a workout should display duration (time-based) vs distance
 */
fun isTimeBasedWorkout(workout: WorkoutDetails): Boolean {
    // If it has interval or rest duration, it's time-based
    if (workout.intervalDurationSeconds != null || workout.restDurationSeconds != null) {
        return true
    }
    // If distance is null or very small (< 0.5km), it's likely time-based
    return workout.distance == null || workout.distance < 0.5
}

/**
 * Format workout duration in human-readable format (e.g., "26 minutes", "1h 30m")
 */
fun formatWorkoutDuration(durationSeconds: Int?): String? {
    if (durationSeconds == null || durationSeconds <= 0) return null
    val minutes = durationSeconds / 60
    val seconds = durationSeconds % 60
    return when {
        minutes < 60 -> "$minutes min${if (seconds > 0) " ${seconds}s" else ""}"
        else -> {
            val hours = minutes / 60
            val mins = minutes % 60
            "$hours h${if (mins > 0) " ${mins}m" else ""}"
        }
    }
}

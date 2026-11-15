package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.domain.model.PlanSessionChoice
import live.airuncoach.airuncoach.network.model.WorkoutDetails
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors

/**
 * "You have a plan session today." Shown before a one-off AI session or a typed free run starts
 * on a day with an open plan session. The answer is saved on the run (runs.plan_session_choice):
 * "count" completes today's plan session too, "leave_open" leaves it for later.
 */
@Composable
fun PlanSessionChoiceDialog(
    planSession: WorkoutDetails,
    planGoalType: String?,
    onChoice: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sessionName = workoutTypeLabel(planSession.workoutType)
    val length = planSession.distance?.takeIf { it > 0 }?.let { "%.1f km".format(it).replace(".0 km", " km") }
        ?: planSession.duration?.takeIf { it > 0 }?.let { "${it / 60} min" }
    val planLabel = planGoalType?.takeIf { it.isNotBlank() && it != "single_session" }
        ?.let { " from your ${it.replace("_", " ").replace("half marathon", "half-marathon")} plan" } ?: " from your plan"

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Colors.backgroundSecondary,
        title = { Text("You have a plan session today", style = AppTextStyles.h3, color = Colors.textPrimary) },
        text = {
            Text(
                "\"$sessionName${length?.let { ", $it" } ?: ""}\"$planLabel is still open. Should this session count as completing it?",
                style = AppTextStyles.body,
                color = Colors.textSecondary,
            )
        },
        confirmButton = {
            Column {
                Button(
                    onClick = { onChoice(PlanSessionChoice.COUNT) },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Count it as done", color = Colors.buttonText) }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { onChoice(PlanSessionChoice.LEAVE_OPEN) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Leave it open", color = Colors.textPrimary) }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel", color = Colors.textMuted) }
        },
    )
}

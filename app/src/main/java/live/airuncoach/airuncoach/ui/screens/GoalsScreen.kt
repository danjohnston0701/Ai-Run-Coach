package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.GoalsUiState
import live.airuncoach.airuncoach.viewmodel.GoalsViewModel
import live.airuncoach.airuncoach.viewmodel.GoalsViewModelFactory

@Composable
fun GoalsScreen(
    onCreateGoal: () -> Unit = {},
    viewModel: GoalsViewModel = viewModel(factory = GoalsViewModelFactory(LocalContext.current))
) {
    val goalsState by viewModel.goalsState.collectAsState()
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        when (val state = goalsState) {
            is GoalsUiState.Loading -> {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = Colors.primary
                )
            }
            is GoalsUiState.Success -> {
                if (state.goals.isEmpty()) {
                    EmptyGoalsState(onCreateGoal = onCreateGoal)
                } else {
                    GoalsListContent(goals = state.goals, onCreateGoal = onCreateGoal)
                }
            }
            is GoalsUiState.Error -> {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(Spacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    Text(
                        text = "Error loading goals",
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.error
                    )
                    Text(
                        text = state.message,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                    Button(
                        onClick = { viewModel.loadGoals() },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        )
                    ) {
                        Text("Retry")
                    }
                }
            }
        }
    }
}

@Composable
fun EmptyGoalsState(onCreateGoal: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.lg)
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_target_vector),
                contentDescription = "Goals",
                tint = Colors.primary,
                modifier = Modifier.size(80.dp)
            )
            Text(
                text = "No active goals yet",
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Text(
                text = "Set a goal to track your progress",
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))
            Button(
                onClick = onCreateGoal,
                modifier = Modifier
                    .width(200.dp)
                    .height(50.dp),
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                )
            ) {
                Text(
                    text = "Create Goal",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
        }
    }
}

@Composable
fun GoalsListContent(goals: List<Goal>, onCreateGoal: () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.lg)
    ) {
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = Spacing.lg),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Your Goals",
                    style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Button(
                    onClick = onCreateGoal,
                    modifier = Modifier.height(40.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    )
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_play_vector),
                        contentDescription = "Add",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.xs))
                    Text("New Goal", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
        
        items(goals) { goal ->
            GoalCard(goal = goal)
            Spacer(modifier = Modifier.height(Spacing.md))
        }
    }
}

@Composable
fun GoalCard(goal: Goal) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = goal.title,
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    Text(
                        text = goal.type.replace("_", " ").lowercase().replaceFirstChar { it.uppercase() },
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }
                
                Icon(
                    painter = painterResource(id = R.drawable.icon_target_vector),
                    contentDescription = "Goal",
                    tint = Colors.primary,
                    modifier = Modifier.size(24.dp)
                )
            }
            
            if (goal.description?.isNotBlank() == true) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    text = goal.description,
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            }
            
            // Display type-specific information
            Spacer(modifier = Modifier.height(Spacing.md))
            when (goal.type) {
                "EVENT" -> {
                    if (goal.eventName?.isNotBlank() == true) {
                        GoalDetailRow(label = "Event", value = goal.eventName)
                    }
                    if (goal.eventLocation?.isNotBlank() == true) {
                        GoalDetailRow(label = "Location", value = goal.eventLocation)
                    }
                    if (goal.distanceTarget?.isNotBlank() == true) {
                        GoalDetailRow(label = "Distance", value = goal.distanceTarget)
                    }
                    if (goal.timeTargetSeconds != null && goal.timeTargetSeconds > 0) {
                        val hours = goal.timeTargetSeconds / 3600
                        val minutes = (goal.timeTargetSeconds % 3600) / 60
                        val seconds = goal.timeTargetSeconds % 60
                        val timeStr = String.format("%02d:%02d:%02d", hours, minutes, seconds)
                        GoalDetailRow(label = "Target Time", value = timeStr)
                    }
                }
                "DISTANCE_TIME" -> {
                    if (goal.distanceTarget?.isNotBlank() == true) {
                        GoalDetailRow(label = "Distance", value = goal.distanceTarget)
                    }
                    if (goal.timeTargetSeconds != null && goal.timeTargetSeconds > 0) {
                        val hours = goal.timeTargetSeconds / 3600
                        val minutes = (goal.timeTargetSeconds % 3600) / 60
                        val seconds = goal.timeTargetSeconds % 60
                        val timeStr = String.format("%02d:%02d:%02d", hours, minutes, seconds)
                        GoalDetailRow(label = "Target Time", value = timeStr)
                    }
                }
                "HEALTH_WELLBEING" -> {
                    if (goal.healthTarget?.isNotBlank() == true) {
                        GoalDetailRow(label = "Target", value = goal.healthTarget)
                    }
                }
                "CONSISTENCY" -> {
                    if (goal.weeklyRunTarget != null && goal.weeklyRunTarget > 0) {
                        GoalDetailRow(label = "Weekly Target", value = "${goal.weeklyRunTarget} runs per week")
                    }
                }
            }
            
            if (goal.targetDate?.isNotBlank() == true) {
                GoalDetailRow(label = "Target Date", value = goal.targetDate)
            }
        }
    }
}

@Composable
fun GoalDetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = AppTextStyles.body,
            color = Colors.textMuted
        )
        Text(
            text = value,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
            color = Colors.textPrimary
        )
    }
}

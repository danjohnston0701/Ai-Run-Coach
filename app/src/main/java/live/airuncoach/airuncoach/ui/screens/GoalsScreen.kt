
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
import androidx.compose.ui.graphics.Color
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
    val selectedTab by viewModel.selectedTab.collectAsState()

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCreateGoal,
                containerColor = Colors.primary
            ) {
                Icon(painter = painterResource(id = R.drawable.icon_play_vector), contentDescription = "Create Goal", tint = Colors.buttonText)
            }
        },
        containerColor = Colors.backgroundRoot
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(it)
        ) {
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Colors.backgroundRoot,
                contentColor = Colors.primary,
                indicator = { tabPositions ->
                    TabRowDefaults.Indicator(
                        Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
                        color = Colors.primary
                    )
                }
            ) {
                val tabs = listOf("Active", "Completed", "Abandoned")
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { viewModel.selectTab(index) },
                        text = { Text(title, style = AppTextStyles.h4) },
                        selectedContentColor = Colors.primary,
                        unselectedContentColor = Colors.textMuted
                    )
                }
            }

            when (val state = goalsState) {
                is GoalsUiState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally), color = Colors.primary)
                }
                is GoalsUiState.Success -> {
                    if (state.goals.isEmpty()) {
                        EmptyGoalsState(tab = selectedTab, onCreateGoal = onCreateGoal)
                    } else {
                        GoalsListContent(goals = state.goals)
                    }
                }
                is GoalsUiState.Error -> {
                    Text(text = state.message, color = Colors.error, modifier = Modifier.align(Alignment.CenterHorizontally))
                }
            }
        }
    }
}

@Composable
fun EmptyGoalsState(tab: Int, onCreateGoal: () -> Unit) {
    val message = when (tab) {
        0 -> "No active goals yet. Set a goal to get started!"
        1 -> "You haven't completed any goals yet."
        else -> "You have no abandoned goals."
    }

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
                tint = Colors.textMuted,
                modifier = Modifier.size(80.dp)
            )
            Text(
                text = message,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            if (tab == 0) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Button(
                    onClick = onCreateGoal,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    )
                ) {
                    Text("Create Goal")
                }
            }
        }
    }
}

@Composable
fun GoalsListContent(goals: List<Goal>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.lg)
    ) {
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
            Text(
                text = goal.title,
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
        }
    }
}

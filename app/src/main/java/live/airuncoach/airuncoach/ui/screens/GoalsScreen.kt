package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.GoalsUiState
import live.airuncoach.airuncoach.viewmodel.GoalsViewModel
import live.airuncoach.airuncoach.viewmodel.GoalsViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalsScreen(
    onCreateGoal: () -> Unit = {},
    onNavigateBack: (() -> Unit)? = null,
    viewModel: GoalsViewModel = viewModel(factory = GoalsViewModelFactory(LocalContext.current))
) {
    val goalsState by viewModel.goalsState.collectAsState()
    val selectedTab by viewModel.selectedTab.collectAsState()
    var goalToDelete by remember { mutableStateOf<Goal?>(null) }
    var showGoalDetails by remember { mutableStateOf<Goal?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "GOALS",
                            style = AppTextStyles.h2.copy(
                                fontWeight = FontWeight.Bold,
                                color = Colors.primary
                            )
                        )
                        Text(
                            text = "Track your running objectives",
                            style = AppTextStyles.small,
                            color = Colors.textSecondary
                        )
                    }
                },
                navigationIcon = {
                    if (onNavigateBack != null) {
                        IconButton(onClick = onNavigateBack) {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_arrow_left),
                                contentDescription = "Back",
                                tint = Colors.textPrimary
                            )
                        }
                    }
                },
                actions = {
                    // New Goal Button
                    Button(
                        onClick = onCreateGoal,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        ),
                        shape = RoundedCornerShape(BorderRadius.full),
                        modifier = Modifier.padding(end = 8.dp)
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_plus_vector),
                            contentDescription = "Add",
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("New Goal", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                )
            )
        },
        containerColor = Colors.backgroundRoot
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Tab Row with Active/Completed/Abandoned
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Colors.backgroundRoot,
                contentColor = Colors.primary,
                indicator = { tabPositions ->
                    if (selectedTab < tabPositions.size) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .wrapContentSize(Alignment.BottomStart)
                                .offset(x = tabPositions[selectedTab].left)
                                .width(tabPositions[selectedTab].width)
                                .padding(horizontal = 16.dp)
                                .height(3.dp)
                                .background(Colors.primary)
                        )
                    }
                },
                divider = {
                    HorizontalDivider(color = Colors.backgroundSecondary, thickness = 1.dp)
                }
            ) {
                val tabs = listOf("Active", "Completed", "Abandoned")
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { viewModel.selectTab(index) },
                        modifier = Modifier.padding(vertical = 12.dp),
                        selectedContentColor = Colors.primary,
                        unselectedContentColor = Color(0xFF8B9AA8) // Lighter gray for better visibility
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = title,
                                style = AppTextStyles.body.copy(
                                    fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal
                                ),
                                color = if (selectedTab == index) Colors.primary else Color(0xFF8B9AA8)
                            )
                            // Show count badge
                            val count = when (goalsState) {
                                is GoalsUiState.Success -> (goalsState as GoalsUiState.Success).goals.size
                                else -> 0
                            }
                            if (selectedTab == index && count > 0) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .background(Colors.primary.copy(alpha = 0.2f), CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = count.toString(),
                                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                        color = Colors.primary
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Content
            when (val state = goalsState) {
                is GoalsUiState.Loading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Colors.primary)
                    }
                }
                is GoalsUiState.Success -> {
                    if (state.goals.isEmpty()) {
                        EmptyGoalsState(tab = selectedTab, onCreateGoal = onCreateGoal)
                    } else {
                        GoalsListContent(
                            goals = state.goals,
                            onGoalClick = { goal -> showGoalDetails = goal },
                            onDeleteClick = { goal -> goalToDelete = goal }
                        )
                    }
                }
                is GoalsUiState.Error -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = state.message,
                                color = Colors.error,
                                style = AppTextStyles.body
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = { viewModel.loadGoals() },
                                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                            ) {
                                Text("Retry")
                            }
                        }
                    }
                }
            }
        }
    }

    // Delete Confirmation Dialog
    goalToDelete?.let { goal ->
        AlertDialog(
            onDismissRequest = { goalToDelete = null },
            title = { Text("Delete Goal?", style = AppTextStyles.h3) },
            text = {
                Text(
                    "Are you sure you want to delete \"${goal.title}\"? This action cannot be undone.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        goal.id?.let { viewModel.deleteGoal(it) }
                        goalToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.error)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { goalToDelete = null }) {
                    Text("Cancel", color = Colors.textPrimary)
                }
            },
            containerColor = Colors.backgroundSecondary
        )
    }

    // Goal Details Bottom Sheet
    showGoalDetails?.let { goal ->
        GoalDetailsBottomSheet(
            goal = goal,
            onDismiss = { showGoalDetails = null },
            onDelete = {
                goalToDelete = goal
                showGoalDetails = null
            }
        )
    }
}

@Composable
fun EmptyGoalsState(tab: Int, onCreateGoal: () -> Unit) {
    val (message, icon) = when (tab) {
        0 -> Pair("No active goals yet. Set a goal to get started!", R.drawable.icon_target_vector)
        1 -> Pair("You haven't completed any goals yet.", R.drawable.icon_trophy_vector)
        else -> Pair("You have no abandoned goals.", R.drawable.icon_x_circle)
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            modifier = Modifier.padding(Spacing.xxxl)
        ) {
            Icon(
                painter = painterResource(id = icon),
                contentDescription = "Empty state",
                tint = Colors.textMuted.copy(alpha = 0.5f),
                modifier = Modifier.size(80.dp)
            )
            Text(
                text = message,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            if (tab == 0) {
                Spacer(modifier = Modifier.height(Spacing.sm))
                Button(
                    onClick = onCreateGoal,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    ),
                    shape = RoundedCornerShape(BorderRadius.full)
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_plus_vector),
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Create Your First Goal")
                }
            }
        }
    }
}

@Composable
fun GoalsListContent(
    goals: List<Goal>,
    onGoalClick: (Goal) -> Unit,
    onDeleteClick: (Goal) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        items(goals) { goal ->
            GoalCard(
                goal = goal,
                onClick = { onGoalClick(goal) },
                onDeleteClick = { onDeleteClick(goal) }
            )
        }
    }
}

@Composable
fun GoalCard(
    goal: Goal,
    onClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Icon based on goal type
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(
                        color = getGoalIconColor(goal.type).copy(alpha = 0.15f),
                        shape = RoundedCornerShape(BorderRadius.md)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = getGoalIcon(goal.type)),
                    contentDescription = null,
                    tint = getGoalIconColor(goal.type),
                    modifier = Modifier.size(28.dp)
                )
            }

            Spacer(modifier = Modifier.width(Spacing.md))

            // Goal Info
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = goal.title,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                
                // Goal details based on type
                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    when (goal.type) {
                        "DISTANCE_TIME" -> {
                            goal.distanceTarget?.let {
                                Chip(text = it, icon = R.drawable.icon_map_pin_vector)
                            }
                            goal.timeTargetSeconds?.let {
                                val hours = it / 3600
                                val minutes = (it % 3600) / 60
                                val timeStr = if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
                                Chip(text = "Target: $timeStr", icon = R.drawable.icon_clock_vector)
                            }
                        }
                        "EVENT" -> {
                            goal.eventName?.let {
                                Chip(text = it, icon = R.drawable.icon_calendar_vector)
                            }
                        }
                        "CONSISTENCY" -> {
                            goal.weeklyRunTarget?.let {
                                Chip(text = "$it runs/week", icon = R.drawable.icon_repeat_vector)
                            }
                        }
                        "HEALTH_WELLBEING" -> {
                            goal.healthTarget?.let {
                                Chip(text = it, icon = R.drawable.icon_heart_vector)
                            }
                        }
                    }
                }

                // Progress Bar
                if (goal.currentProgress > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        LinearProgressIndicator(
                            progress = { (goal.currentProgress / 100f).coerceIn(0f, 1f) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = Colors.primary,
                            trackColor = Colors.backgroundTertiary,
                        )
                        Text(
                            text = "${goal.currentProgress.toInt()}% complete",
                            style = AppTextStyles.caption,
                            color = Colors.textMuted
                        )
                    }
                }
            }

            // Menu Button
            IconButton(onClick = onDeleteClick) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_more_vertical),
                    contentDescription = "Options",
                    tint = Colors.textMuted
                )
            }
        }
    }
}

@Composable
fun Chip(text: String, icon: Int) {
    Row(
        modifier = Modifier
            .background(
                color = Colors.backgroundTertiary,
                shape = RoundedCornerShape(BorderRadius.sm)
            )
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painter = painterResource(id = icon),
            contentDescription = null,
            tint = Colors.textSecondary,
            modifier = Modifier.size(12.dp)
        )
        Text(
            text = text,
            style = AppTextStyles.caption,
            color = Colors.textSecondary
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalDetailsBottomSheet(
    goal: Goal,
    onDismiss: () -> Unit,
    onDelete: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Colors.backgroundSecondary,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = 12.dp)
                    .size(width = 40.dp, height = 4.dp)
                    .background(Colors.textMuted.copy(alpha = 0.3f), RoundedCornerShape(2.dp))
            )
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            // Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .background(
                            color = getGoalIconColor(goal.type).copy(alpha = 0.15f),
                            shape = RoundedCornerShape(BorderRadius.md)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = getGoalIcon(goal.type)),
                        contentDescription = null,
                        tint = getGoalIconColor(goal.type),
                        modifier = Modifier.size(32.dp)
                    )
                }
                
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = goal.title,
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = getGoalTypeLabel(goal.type),
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))
            HorizontalDivider(color = Colors.backgroundTertiary)
            Spacer(modifier = Modifier.height(Spacing.lg))

            // Details
            goal.description?.let {
                DetailRow(label = "Description", value = it)
            }
            
            goal.targetDate?.let {
                DetailRow(label = "Target Date", value = it)
            }
            
            goal.distanceTarget?.let {
                DetailRow(label = "Distance", value = it)
            }
            
            goal.timeTargetSeconds?.let {
                val hours = it / 3600
                val minutes = (it % 3600) / 60
                val timeStr = if (hours > 0) "$hours hours $minutes minutes" else "$minutes minutes"
                DetailRow(label = "Time Target", value = timeStr)
            }
            
            goal.notes?.let {
                DetailRow(label = "Notes", value = it)
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Actions
            Button(
                onClick = onDelete,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.error),
                shape = RoundedCornerShape(BorderRadius.md)
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_trash_vector),
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete Goal")
            }
            
            Spacer(modifier = Modifier.height(Spacing.lg))
        }
    }
}

@Composable
fun DetailRow(label: String, value: String) {
    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        Text(
            text = label,
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
            color = Colors.textMuted
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = AppTextStyles.body,
            color = Colors.textPrimary
        )
    }
}

fun getGoalIcon(type: String): Int {
    return when (type) {
        "EVENT" -> R.drawable.icon_calendar_vector
        "DISTANCE_TIME" -> R.drawable.icon_target_vector
        "HEALTH_WELLBEING" -> R.drawable.icon_heart_vector
        "CONSISTENCY" -> R.drawable.icon_repeat_vector
        else -> R.drawable.icon_target_vector
    }
}

fun getGoalIconColor(type: String): Color {
    return when (type) {
        "EVENT" -> Color(0xFF00D4FF)
        "DISTANCE_TIME" -> Color(0xFF00FF85)
        "HEALTH_WELLBEING" -> Color(0xFFFF006B)
        "CONSISTENCY" -> Color(0xFFFFB800)
        else -> Colors.primary
    }
}

fun getGoalTypeLabel(type: String): String {
    return when (type) {
        "EVENT" -> "Event Goal"
        "DISTANCE_TIME" -> "Distance & Time Goal"
        "HEALTH_WELLBEING" -> "Health & Wellbeing Goal"
        "CONSISTENCY" -> "Consistency Goal"
        else -> "Goal"
    }
}

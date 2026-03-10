package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.network.model.TrainingPlanDetails
import live.airuncoach.airuncoach.network.model.TrainingPlanProgress
import live.airuncoach.airuncoach.network.model.TrainingPlanSummary
import live.airuncoach.airuncoach.network.model.WeekDetails
import live.airuncoach.airuncoach.network.model.WorkoutDetails
import live.airuncoach.airuncoach.network.model.TodayWorkoutResponse
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.util.WorkoutHolder
import live.airuncoach.airuncoach.util.WorkoutPlanContext
import live.airuncoach.airuncoach.viewmodel.PlanDetailState
import live.airuncoach.airuncoach.viewmodel.PlansListState
import live.airuncoach.airuncoach.viewmodel.TrainingPlanViewModel

// ─────────────────────────────────────────────────────────────────────────────
// Top-level entry: list of the user's plans, or empty state with CTA
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachingProgrammeScreen(
    onNavigateBack: () -> Unit,
    onCreatePlan: () -> Unit,
    onOpenPlan: (String) -> Unit  // planId
) {
    val viewModel: TrainingPlanViewModel = hiltViewModel()
    val state by viewModel.plansListState.collectAsState()
    val selectedTab by viewModel.selectedTab.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadUserPlans() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Coaching Programme", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                        Text("AI-designed training plans", style = AppTextStyles.small, color = Colors.textMuted)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(R.drawable.icon_arrow_back_vector), "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onCreatePlan, containerColor = Colors.primary) {
                Icon(painterResource(R.drawable.icon_plus_vector), "New plan", tint = Colors.buttonText)
            }
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Tab Row: Active / Completed / Abandoned
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
                                .padding(horizontal = Spacing.lg)
                                .height(3.dp)
                                .background(Colors.primary)
                        )
                    }
                },
                divider = { HorizontalDivider(color = Colors.backgroundSecondary, thickness = 1.dp) }
            ) {
                val tabs = listOf("Active", "Completed", "Abandoned")
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { viewModel.selectTab(index) },
                        modifier = Modifier.padding(vertical = Spacing.md),
                        selectedContentColor = Colors.primary,
                        unselectedContentColor = Colors.textMuted
                    ) {
                        Text(
                            text = title,
                            style = AppTextStyles.body.copy(
                                fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal
                            )
                        )
                    }
                }
            }

            Box(modifier = Modifier.fillMaxSize()) {
            when (val s = state) {
                is PlansListState.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = Colors.primary)

                is PlansListState.Empty -> NoPlanState(onCreatePlan)

                is PlansListState.Error -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(Spacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(s.message, style = AppTextStyles.body, color = Colors.textSecondary, textAlign = TextAlign.Center)
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Button(onClick = { viewModel.loadUserPlans() }, colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)) {
                        Text("Retry", color = Colors.buttonText)
                    }
                }

                is PlansListState.Success -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(Spacing.lg),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    item {
                        Text("Active Plans", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                        Spacer(modifier = Modifier.height(Spacing.sm))
                    }
                    items(s.plans) { plan ->
                        PlanSummaryCard(
                            plan = plan,
                            onClick = { onOpenPlan(plan.id) }
                        )
                    }
                }
            }
            }
        }
    }
}

@Composable
fun NoPlanState(onCreatePlan: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Gradient icon block
        Box(
            modifier = Modifier.size(100.dp).background(
                brush = Brush.radialGradient(listOf(Colors.primary.copy(alpha = 0.2f), Colors.primary.copy(alpha = 0f))),
                shape = RoundedCornerShape(50.dp)
            ),
            contentAlignment = Alignment.Center
        ) {
            Icon(painterResource(R.drawable.icon_ai_vector), null, tint = Colors.primary, modifier = Modifier.size(52.dp))
        }
        Spacer(modifier = Modifier.height(Spacing.lg))
        Text("No Training Plan Yet", style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary, textAlign = TextAlign.Center)
        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(
            "Let your AI coach design a personalised programme to help you reach your goals.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(Spacing.xl))
        Button(
            onClick = onCreatePlan,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
            shape = RoundedCornerShape(16.dp)
        ) {
            Icon(painterResource(R.drawable.icon_ai_vector), null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text("Generate My Training Plan", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
        }
    }
}

@Composable
fun PlanSummaryCard(
    plan: TrainingPlanSummary,
    onClick: () -> Unit
) {
    val goalLabel = formatGoalType(plan.goalType)
    // Use workout completion % instead of week progress
    val completionFraction = if (plan.totalWorkouts > 0) plan.completedWorkouts.toFloat() / plan.totalWorkouts.toFloat() else 0f

    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(goalLabel, style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    if (plan.targetDistance != null) {
                        Text("${plan.targetDistance}km", style = AppTextStyles.small, color = Colors.textMuted)
                    }
                    if (plan.targetTime != null) {
                        Text("Target: ${formatSeconds(plan.targetTime)}", style = AppTextStyles.small, color = Colors.primary)
                    }
                }
                Surface(shape = RoundedCornerShape(8.dp), color = planStatusColor(plan.status).copy(alpha = 0.15f)) {
                    Text(
                        plan.status.replaceFirstChar { it.uppercase() },
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                        color = planStatusColor(plan.status),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Progress bar — shows workout completion %
            Column {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${plan.completedWorkouts}/${plan.totalWorkouts} workouts done", style = AppTextStyles.small, color = Colors.textSecondary)
                    Text("${(completionFraction * 100).toInt()}%", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.primary)
                }
                Spacer(modifier = Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = { completionFraction.coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                    color = Colors.primary,
                    trackColor = Colors.backgroundTertiary
                )
            }

            Spacer(modifier = Modifier.height(Spacing.sm))
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                PlanStatChip(R.drawable.icon_calendar_vector, "${plan.daysPerWeek}x/week")
                PlanStatChip(R.drawable.icon_clock_vector, "${plan.totalWeeks} weeks")
                PlanStatChip(R.drawable.icon_trending_vector, plan.experienceLevel.replaceFirstChar { it.uppercase() })
            }
        }
    }
}

@Composable
fun PlanStatChip(icon: Int, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(painterResource(icon), null, tint = Colors.textMuted, modifier = Modifier.size(14.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text(label, style = AppTextStyles.small, color = Colors.textMuted)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Detail — shows today's workout + week view
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrainingPlanDashboardScreen(
    planId: String,
    onNavigateBack: () -> Unit,
    onStartWorkout: (WorkoutDetails) -> Unit,
    onViewWorkoutDetail: (WorkoutDetails) -> Unit
) {
    val viewModel: TrainingPlanViewModel = hiltViewModel()
    val state by viewModel.planDetailState.collectAsState()
    val actionLoading by viewModel.actionLoading.collectAsState()
    val actionError by viewModel.actionError.collectAsState()

    var showAbandonDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(planId) { viewModel.loadPlanDetail(planId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        when (val s = state) {
                            is PlanDetailState.Success -> formatGoalType(s.details.plan.goalType)
                            else -> "Training Plan"
                        },
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(R.drawable.icon_arrow_back_vector), "Back", tint = Colors.textPrimary)
                    }
                },
                actions = {
                    // Abandon and Delete buttons
                    if (state is PlanDetailState.Success) {
                        IconButton(onClick = { showAbandonDialog = true }) {
                            Icon(painterResource(R.drawable.icon_x_vector), "Abandon plan", tint = Colors.textPrimary)
                        }
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(painterResource(R.drawable.icon_trash_vector), "Delete plan", tint = Colors.error)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        when (val s = state) {
            is PlanDetailState.Loading -> Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Colors.primary)
            }
            is PlanDetailState.Error -> Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(s.message, style = AppTextStyles.body, color = Colors.textSecondary)
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Button(onClick = { viewModel.loadPlanDetail(planId) }, colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)) {
                        Text("Retry", color = Colors.buttonText)
                    }
                }
            }
            is PlanDetailState.Success -> PlanDashboardContent(
                details = s.details,
                progress = s.progress,
                todayWorkout = s.todayWorkout,
                actionLoading = actionLoading,
                actionError = actionError,
                onStartWorkout = onStartWorkout,
                onViewWorkoutDetail = onViewWorkoutDetail,
                onCompleteWorkout = { workout -> viewModel.completeWorkout(workout.id, null, planId) },
                onClearError = { viewModel.clearActionError() },
                modifier = Modifier.padding(padding)
            )
        }
    }

    // Abandon Plan Dialog
    if (showAbandonDialog && state is PlanDetailState.Success) {
        AlertDialog(
            onDismissRequest = { showAbandonDialog = false },
            title = { Text("Abandon Plan?", style = AppTextStyles.h3) },
            text = {
                Text(
                    "Are you sure you want to abandon this plan? Your progress will be saved, and the plan will move to the Abandoned tab.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.abandonPlan(planId)
                        showAbandonDialog = false
                        onNavigateBack()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    enabled = !actionLoading
                ) {
                    if (actionLoading) CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Colors.buttonText, strokeWidth = 2.dp)
                    else Text("Abandon")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAbandonDialog = false }) {
                    Text("Cancel", color = Colors.textPrimary)
                }
            },
            containerColor = Colors.backgroundSecondary
        )
    }

    // Delete Plan Dialog
    if (showDeleteDialog && state is PlanDetailState.Success) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete Plan?", style = AppTextStyles.h3) },
            text = {
                Text(
                    "Are you sure you want to permanently delete this plan? This action cannot be undone.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deletePlan(planId)
                        showDeleteDialog = false
                        onNavigateBack()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.error),
                    enabled = !actionLoading
                ) {
                    if (actionLoading) CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Colors.buttonText, strokeWidth = 2.dp)
                    else Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancel", color = Colors.textPrimary)
                }
            },
            containerColor = Colors.backgroundSecondary
        )
    }
}

@Composable
fun PlanDashboardContent(
    details: TrainingPlanDetails,
    progress: TrainingPlanProgress,
    todayWorkout: TodayWorkoutResponse?,
    actionLoading: Boolean,
    actionError: String?,
    onStartWorkout: (WorkoutDetails) -> Unit,
    onViewWorkoutDetail: (WorkoutDetails) -> Unit,
    onCompleteWorkout: (WorkoutDetails) -> Unit,
    onClearError: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Helpers that stamp plan context into WorkoutHolder before delegating to nav callbacks.
    // This allows WorkoutDetailScreen → run_session to build a plan-aware RunSetupConfig.
    val planContext = WorkoutPlanContext(
        planId = details.plan.id,
        goalType = details.plan.goalType,
        weekNumber = progress.currentWeek,
        totalWeeks = progress.totalWeeks
    )
    val startWithContext: (WorkoutDetails) -> Unit = { w ->
        WorkoutHolder.planContext = planContext
        onStartWorkout(w)
    }
    val viewWithContext: (WorkoutDetails) -> Unit = { w ->
        WorkoutHolder.planContext = planContext
        onViewWorkoutDetail(w)
    }

    LazyColumn(modifier = modifier.fillMaxSize(), contentPadding = PaddingValues(Spacing.lg)) {

        // ── Overall progress card ─────────────────────────────────────────────
        item {
            OverallProgressCard(progress)
            Spacer(modifier = Modifier.height(Spacing.lg))
        }

        // ── Error ─────────────────────────────────────────────────────────────
        if (actionError != null) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Colors.warning.copy(alpha = 0.15f)), modifier = Modifier.fillMaxWidth()) {
                    Row(modifier = Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                        Text(actionError, style = AppTextStyles.small, color = Colors.warning, modifier = Modifier.weight(1f))
                        IconButton(onClick = onClearError, modifier = Modifier.size(24.dp)) {
                            Icon(painterResource(R.drawable.icon_x_vector), "Dismiss", tint = Colors.warning, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.md))
            }
        }

        // ── Today's Workout ───────────────────────────────────────────────────
        item {
            Text("TODAY", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp), color = Colors.textMuted)
            Spacer(modifier = Modifier.height(Spacing.sm))
        }

        val workout = todayWorkout?.workout
        if (workout != null && !workout.isCompleted) {
            item {
                TodayWorkoutCard(
                    workout = workout,
                    isLoading = actionLoading,
                    onStart = { startWithContext(workout) },
                    onComplete = { onCompleteWorkout(workout) },
                    onViewDetail = { viewWithContext(workout) }
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
        } else {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary), modifier = Modifier.fillMaxWidth()) {
                    Row(modifier = Modifier.padding(Spacing.lg), verticalAlignment = Alignment.CenterVertically) {
                        Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.success, modifier = Modifier.size(24.dp))
                        Spacer(modifier = Modifier.width(Spacing.md))
                        Text("Great work! Today's workout is done.", style = AppTextStyles.body, color = Colors.textSecondary)
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
        }

        // ── Weekly plan ───────────────────────────────────────────────────────
        item {
            Text("THIS WEEK", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp), color = Colors.textMuted)
            Spacer(modifier = Modifier.height(Spacing.sm))
        }

        val currentWeekIndex = (progress.currentWeek - 1).coerceAtLeast(0)
        val currentWeek = details.weeks.getOrNull(currentWeekIndex) ?: details.weeks.firstOrNull()
        if (currentWeek != null) {
            item {
                WeekCard(week = currentWeek, onWorkoutTap = viewWithContext)
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
        }

        // ── All weeks overview ────────────────────────────────────────────────
        item {
            Text("FULL PROGRAMME", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp), color = Colors.textMuted)
            Spacer(modifier = Modifier.height(Spacing.sm))
        }
        items(details.weeks) { week ->
            WeekSummaryRow(week = week, isCurrent = week.weekNumber == progress.currentWeek)
            Spacer(modifier = Modifier.height(Spacing.sm))
        }
    }
}

@Composable
fun OverallProgressCard(progress: TrainingPlanProgress) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("Week ${progress.currentWeek} of ${progress.totalWeeks}", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Text(formatGoalType(progress.goalType), style = AppTextStyles.small, color = Colors.textMuted)
                }
                if (progress.targetTime != null) {
                    Surface(shape = RoundedCornerShape(8.dp), color = Colors.primary.copy(alpha = 0.15f)) {
                        Text(
                            "Target ${formatSeconds(progress.targetTime)}",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(Spacing.md))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${progress.completedWorkouts}/${progress.totalWorkouts} workouts done", style = AppTextStyles.small, color = Colors.textSecondary)
                Text("${(progress.overallCompletion * 100).toInt()}%", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.primary)
            }
            Spacer(modifier = Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = { progress.overallCompletion.toFloat().coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                color = Colors.primary,
                trackColor = Colors.backgroundTertiary
            )
        }
    }
}

@Composable
fun TodayWorkoutCard(
    workout: WorkoutDetails,
    isLoading: Boolean,
    onStart: () -> Unit,
    onComplete: () -> Unit,
    onViewDetail: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onViewDetail() },
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    WorkoutTypeBadge(workout.workoutType)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(workout.description ?: workoutTypeLabel(workout.workoutType), style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                }
                Icon(painterResource(R.drawable.icon_chevron_right_vector), null, tint = Colors.textMuted, modifier = Modifier.size(20.dp))
            }

            if (!workout.instructions.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(Spacing.sm))
                Text(workout.instructions, style = AppTextStyles.small, color = Colors.textSecondary, maxLines = 3)
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                workout.distance?.let { PlanStatChip(R.drawable.icon_target_vector, "${it}km") }
                workout.targetPace?.let { raw ->
                    // targetPace from DB already contains "/km" (e.g. "5:30/km") — strip it
                    // so we can append the friendly label "min/km"
                    val paceValue = raw.replace("/km", "").trim()
                    PlanStatChip(R.drawable.icon_timer_vector, "$paceValue min/km")
                }
                workout.intensity?.let { PlanStatChip(R.drawable.icon_heart_vector, it.uppercase()) }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                if (workout.workoutType != "rest") {
                    Button(
                        onClick = onStart,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                        enabled = !isLoading
                    ) {
                        Icon(painterResource(R.drawable.icon_play_vector), null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Start Workout", color = Colors.buttonText, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold))
                    }
                }
                OutlinedButton(
                    onClick = onComplete,
                    modifier = if (workout.workoutType == "rest") Modifier.fillMaxWidth() else Modifier.weight(1f),
                    enabled = !isLoading
                ) {
                    if (isLoading) CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Colors.primary, strokeWidth = 2.dp)
                    else {
                        Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(if (workout.workoutType == "rest") "Mark Rest Done" else "Manual Complete", style = AppTextStyles.small)
                    }
                }
            }
        }
    }
}

@Composable
fun WeekCard(week: WeekDetails, onWorkoutTap: (WorkoutDetails) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(week.weekDescription ?: "Week ${week.weekNumber}", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            week.focusArea?.let { Text(it.replace("_", " ").replaceFirstChar { c -> c.uppercase() }, style = AppTextStyles.small, color = Colors.primary) }
            Spacer(modifier = Modifier.height(Spacing.md))

            week.workouts.sortedBy { it.dayOfWeek }.forEach { workout ->
                WorkoutRow(workout = workout, onClick = { onWorkoutTap(workout) })
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
        }
    }
}

@Composable
fun WorkoutRow(workout: WorkoutDetails, onClick: () -> Unit) {
    val dayName = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat").getOrElse(workout.dayOfWeek) { "Day" }
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(dayName, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.width(36.dp))
        Spacer(modifier = Modifier.width(Spacing.sm))
        Box(modifier = Modifier.size(8.dp).background(workoutTypeColor(workout.workoutType), RoundedCornerShape(4.dp)))
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(
            workout.description ?: workoutTypeLabel(workout.workoutType),
            style = AppTextStyles.small,
            color = Colors.textPrimary,
            modifier = Modifier.weight(1f)
        )
        // Distance + pace stacked on the right
        Column(horizontalAlignment = Alignment.End) {
            workout.distance?.let {
                Text("${it}km", style = AppTextStyles.small, color = Colors.textMuted)
            }
            workout.targetPace?.let { raw ->
                val paceValue = raw.replace("/km", "").trim()
                Text("$paceValue/km", style = AppTextStyles.small.copy(fontSize = 10.sp), color = Colors.textMuted)
            }
        }
        if (workout.isCompleted) {
            Spacer(modifier = Modifier.width(Spacing.sm))
            Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.success, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
fun WeekSummaryRow(week: WeekDetails, isCurrent: Boolean) {
    val completedCount = week.workouts.count { it.isCompleted }
    val totalCount = week.workouts.size
    val fraction = if (totalCount > 0) completedCount.toFloat() / totalCount else 0f

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isCurrent) Colors.primary.copy(alpha = 0.08f) else Colors.backgroundSecondary
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.md), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Week ${week.weekNumber}", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = if (isCurrent) Colors.primary else Colors.textPrimary)
                    if (isCurrent) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Surface(shape = RoundedCornerShape(4.dp), color = Colors.primary.copy(alpha = 0.2f)) {
                            Text("Current", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.primary, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                        }
                    }
                }
                Text(week.weekDescription ?: week.focusArea?.replace("_", " ")?.replaceFirstChar { it.uppercase() } ?: "", style = AppTextStyles.small, color = Colors.textMuted)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("$completedCount/$totalCount", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textSecondary)
                LinearProgressIndicator(
                    progress = { fraction },
                    modifier = Modifier.width(60.dp).height(4.dp).clip(RoundedCornerShape(2.dp)),
                    color = Colors.primary,
                    trackColor = Colors.backgroundTertiary
                )
            }
        }
    }
}

@Composable
fun WorkoutTypeBadge(workoutType: String) {
    Surface(shape = RoundedCornerShape(6.dp), color = workoutTypeColor(workoutType).copy(alpha = 0.15f)) {
        Text(
            workoutTypeLabel(workoutType),
            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
            color = workoutTypeColor(workoutType),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

fun formatGoalType(goalType: String): String = when (goalType) {
    "5k" -> "5K Training Plan"
    "10k" -> "10K Training Plan"
    "half_marathon" -> "Half Marathon Plan"
    "marathon" -> "Marathon Plan"
    "ultra" -> "Ultra Marathon Plan"
    else -> "${goalType.replace("_", " ").replaceFirstChar { it.uppercase() }} Plan"
}

fun formatSeconds(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "${h}h ${m}m" else if (s == 0) "${m}min" else "${m}:${s.toString().padStart(2, '0')}"
}

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

@Composable
fun workoutTypeColor(type: String) = when (type) {
    "easy", "recovery" -> Colors.success
    "tempo" -> Colors.warning
    "intervals", "hill_repeats" -> Colors.error
    "long_run" -> Colors.primary
    "rest" -> Colors.textMuted
    else -> Colors.primary
}

@Composable
fun planStatusColor(status: String) = when (status) {
    "active" -> Colors.success
    "paused" -> Colors.warning
    "completed" -> Colors.primary
    else -> Colors.textMuted
}

package live.airuncoach.airuncoach.ui.screens

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import java.util.Locale
import org.json.JSONObject
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.HeartRateZones
import live.airuncoach.airuncoach.domain.model.Injury
import live.airuncoach.airuncoach.domain.model.InjuryStatus
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
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModel

// ─────────────────────────────────────────────────────────────────────────────
// Top-level entry: list of the user's plans, or empty state with CTA
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachingProgrammeScreen(
    onNavigateBack: () -> Unit,
    onCreatePlan: () -> Unit,
    onOpenPlan: (String) -> Unit,  // planId
    onNavigateToSubscription: () -> Unit = {},  // For upgrading subscription
    isActiveDestination: Boolean = true  // true when this route is the current nav destination
) {
    val trainingPlanViewModel: TrainingPlanViewModel = hiltViewModel()
    val subscriptionViewModel: SubscriptionViewModel = hiltViewModel()
    val state by trainingPlanViewModel.plansListState.collectAsState()
    val selectedTab by trainingPlanViewModel.selectedTab.collectAsState()
    val subscriptionTier = subscriptionViewModel.getSubscriptionTier()
    val isFreeTier = subscriptionTier == "free"

    // Reload the plans list whenever this screen becomes the active destination.
    // Using LaunchedEffect(isActiveDestination) is more reliable than a lifecycle
    // observer in Compose Navigation — it fires every time the value flips true
    // (i.e. when we pop back from training_plan or any child screen).
    // For free users, skip loading plans entirely to avoid unnecessary API calls
    val tabStatusMap = mapOf(0 to "active", 1 to "completed", 2 to "cancelled")
    LaunchedEffect(isActiveDestination) {
        if (isActiveDestination && !isFreeTier) {
            // Always select the "active" tab (tab 0) when returning to this screen
            // This ensures newly created plans are shown immediately
            trainingPlanViewModel.selectTab(0)
        }
    }

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
            // Hide FAB for free tier users
            if (!isFreeTier) {
                FloatingActionButton(onClick = onCreatePlan, containerColor = Colors.primary) {
                    Icon(painterResource(R.drawable.icon_plus_vector), "New plan", tint = Colors.buttonText)
                }
            }
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        // Show locked state for free tier users
        if (isFreeTier) {
            FreeUserCoachingPlanPlaceholder(onUpgradeClick = onNavigateToSubscription)
        } else {
            Column(modifier = Modifier.fillMaxSize().padding(top = padding.calculateTopPadding(), bottom = padding.calculateBottomPadding())) {
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
                    val tabs = listOf("Active", "Completed", "Cancelled")
                    tabs.forEachIndexed { index, title ->
                        Tab(
                            selected = selectedTab == index,
                            onClick = { trainingPlanViewModel.selectTab(index) },
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
                        Button(onClick = { trainingPlanViewModel.loadUserPlans() }, colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)) {
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
}

/**
 * Locked placeholder shown to Free tier users.
 * Displays a lock icon with explanation and upgrade button.
 */
@Composable
fun FreeUserCoachingPlanPlaceholder(onUpgradeClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Lock Icon
        Box(
            modifier = Modifier
                .size(100.dp)
                .background(
                    brush = Brush.radialGradient(listOf(Colors.primary.copy(alpha = 0.2f), Colors.primary.copy(alpha = 0f))),
                    shape = RoundedCornerShape(50.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Filled.Lock,
                contentDescription = "Locked",
                tint = Colors.primary,
                modifier = Modifier.size(52.dp)
            )
        }
        
        Spacer(modifier = Modifier.height(Spacing.lg))
        
        // Heading
        Text(
            "Paid Feature",
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(Spacing.sm))
        
        // Description
        Text(
            "AI Coaching Plans are only available on paid subscriptions. Upgrade to Lite or Standard to unlock personalized training programs designed around your goals.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(Spacing.xl))
        
        // Upgrade Button
        Button(
            onClick = onUpgradeClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
            shape = RoundedCornerShape(16.dp)
        ) {
            Icon(painterResource(R.drawable.icon_crown_vector), null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text("Upgrade Subscription", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
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
            "Let your Ai coach design a personalised programme to help you reach your goals.",
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
fun PlanStatChip(icon: Int, label: String, modifier: Modifier = Modifier) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier) {
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
    onViewWorkoutDetail: (WorkoutDetails) -> Unit,
    onViewAdaptations: (planId: String) -> Unit = {}
) {
    val viewModel: TrainingPlanViewModel = hiltViewModel()
    val state by viewModel.planDetailState.collectAsState()
    val actionLoading by viewModel.actionLoading.collectAsState()
    val actionError by viewModel.actionError.collectAsState()
    val pendingAdaptationsCount by viewModel.pendingAdaptationsCount.collectAsState()
    val planActionSuccess by viewModel.planActionSuccess.collectAsState()
    val blockStatus by viewModel.blockStatus.collectAsState()
    val nextBlockTriggering by viewModel.nextBlockTriggering.collectAsState()

    var showAbandonDialog by remember { mutableStateOf(false) }
    var showAddInjuryDialog by remember { mutableStateOf(false) }

    LaunchedEffect(planId) { viewModel.loadPlanDetail(planId) }

    // Navigate back once the API call has completed.
    // NOTE: We deliberately do NOT call clearPlanActionSuccess() here — the ViewModel is
    // scoped to this back-stack entry and gets destroyed on pop anyway. Clearing it early
    // creates a race condition where MainScreen's cross-VM LaunchedEffect sees 'false'
    // and skips calling loadUserPlans("active"), leaving the cancelled plan visible.
    LaunchedEffect(planActionSuccess) {
        if (planActionSuccess) {
            onNavigateBack()
        }
    }

    // Auto-open adaptation review screen when pending adaptations are present.
    // Fires once per plan opening — once navigated, the flag prevents re-triggering
    // if the user returns to this screen with adaptations still pending.
    var hasAutoNavigatedToAdaptations by remember { mutableStateOf(false) }
    LaunchedEffect(pendingAdaptationsCount) {
        if (pendingAdaptationsCount > 0 && !hasAutoNavigatedToAdaptations) {
            hasAutoNavigatedToAdaptations = true
            onViewAdaptations(planId)
        }
    }

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
                actions = {},
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize()) {
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
                onShowAbandonDialog = { showAbandonDialog = true },
                onAddInjury = { showAddInjuryDialog = true },
                onViewAdaptations = { onViewAdaptations(planId) },
                modifier = Modifier.fillMaxSize().padding(padding),
                pendingAdaptationsCount = pendingAdaptationsCount,
                viewModel = viewModel,
                blockStatus = blockStatus,
                onTriggerNextBlock = { viewModel.triggerNextBlock(planId) },
                nextBlockTriggering = nextBlockTriggering
            )
            }
        }
    }

    // Cancel Plan Dialog
    if (showAbandonDialog && state is PlanDetailState.Success) {
        AlertDialog(
            onDismissRequest = { showAbandonDialog = false },
            title = { Text("Cancel Plan?", style = AppTextStyles.h3) },
            text = {
                Text(
                    "Are you sure you want to cancel this plan? Your progress will be saved, and the plan will move to the Cancelled tab.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showAbandonDialog = false
                        viewModel.abandonPlan(planId)
                        // onNavigateBack() is called via LaunchedEffect(planActionSuccess)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    enabled = !actionLoading
                ) {
                    if (actionLoading) CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Colors.buttonText, strokeWidth = 2.dp)
                    else Text("Cancel Plan")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAbandonDialog = false }) {
                    Text("Keep Plan", color = Colors.textPrimary)
                }
            },
            containerColor = Colors.backgroundSecondary
        )
    }



    // Add Injury Dialog with Re-assessment option
    if (showAddInjuryDialog && state is PlanDetailState.Success) {
        AddInjuryRecalibrateDialog(
            onDismiss = { showAddInjuryDialog = false },
            onConfirm = { bodyPart, status, notes, shouldRecalculate ->
                // Save injury to user profile
                val sharedPrefs = viewModel.javaClass.getDeclaredField("context").let {
                    // Get context through viewModel - simplified approach
                }
                
                // For now, just show the dialog and save the injury
                // The recalculation would require a backend API call
                showAddInjuryDialog = false
                
                // TODO: Implement actual injury save and plan recalculation via API
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddInjuryRecalibrateDialog(
    onDismiss: () -> Unit,
    onConfirm: (String, InjuryStatus, String?, Boolean) -> Unit
) {
    var selectedBodyPart by remember { mutableStateOf("") }
    var selectedStatus by remember { mutableStateOf(InjuryStatus.RECOVERING) }
    var notes by remember { mutableStateOf("") }
    var recalculatePlan by remember { mutableStateOf(true) }
    
    val bodyParts = listOf("Knee", "Ankle", "Shin", "Hip", "Back", "Foot", "Calf", "Hamstring", "Quad", "Groin", "Shoulder", "Wrist", "Other")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Injury/Condition", style = AppTextStyles.h3) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                Text("We'll adjust your training plan to accommodate this injury.", style = AppTextStyles.body, color = Colors.textSecondary)
                
                // Body part dropdown
                Text("Body Part", style = AppTextStyles.small, color = Colors.textMuted)
                var expanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = it }
                ) {
                    OutlinedTextField(
                        value = selectedBodyPart,
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        bodyParts.forEach { part ->
                            DropdownMenuItem(
                                text = { Text(part) },
                                onClick = {
                                    selectedBodyPart = part
                                    expanded = false
                                }
                            )
                        }
                    }
                }

                // Status
                Text("Status", style = AppTextStyles.small, color = Colors.textMuted)
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    InjuryStatus.values().forEach { status ->
                        val selected = selectedStatus == status
                        FilterChip(
                            selected = selected,
                            onClick = { selectedStatus = status },
                            label = {
                                Text(
                                    when (status) {
                                        InjuryStatus.RECOVERING -> "Recovering"
                                        InjuryStatus.HEALED -> "Healed"
                                        InjuryStatus.CHRONIC -> "Chronic"
                                    }
                                )
                            }
                        )
                    }
                }

                // Notes
                Text("Notes (optional)", style = AppTextStyles.small, color = Colors.textMuted)
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    placeholder = { Text("e.g., Started in January, improving") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3
                )
                
                // Recalculate option
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { recalculatePlan = !recalculatePlan },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = recalculatePlan,
                        onCheckedChange = { recalculatePlan = it }
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Column {
                        Text("Re-calibrate training plan", style = AppTextStyles.body, color = Colors.textPrimary)
                        Text("The AI will adjust future workouts based on this injury", style = AppTextStyles.small, color = Colors.textMuted)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(selectedBodyPart, selectedStatus, notes.ifBlank { null }, recalculatePlan) },
                enabled = selectedBodyPart.isNotBlank()
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
        containerColor = Colors.backgroundSecondary
    )
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
    onShowAbandonDialog: () -> Unit,
    onAddInjury: () -> Unit,
    onViewAdaptations: () -> Unit,
    modifier: Modifier = Modifier,
    pendingAdaptationsCount: Int = 0,
    viewModel: TrainingPlanViewModel? = null,
    blockStatus: live.airuncoach.airuncoach.network.model.BlockStatus? = null,
    onTriggerNextBlock: () -> Unit = {},
    nextBlockTriggering: Boolean = false
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

        // ── AI Summary: What we know about you and what we're working on ──────
        item {
            AiPlanSummary(details = details)
            Spacer(modifier = Modifier.height(Spacing.lg))
        }

        // ── Overall progress card ─────────────────────────────────────────────
        item {
            OverallProgressCard(progress)
            Spacer(modifier = Modifier.height(Spacing.lg))
        }

        // ── Adaptations re-entry chip (shown after auto-open, so user can return) ────
        // The plan auto-opens AdaptationReviewScreen on first load when count > 0.
        // This chip remains visible so the user can re-open adaptations after returning.
        if (pendingAdaptationsCount > 0) {
            item {
                Surface(
                    onClick = onViewAdaptations,
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.medium,
                    color = Colors.primary.copy(alpha = 0.10f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Colors.primary.copy(alpha = 0.35f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        Text("📊", fontSize = 16.sp)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Plan Adaptations Available",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.primary
                            )
                            Text(
                                "$pendingAdaptationsCount recommendation${if (pendingAdaptationsCount > 1) "s" else ""} ready to review",
                                style = AppTextStyles.caption,
                                color = Colors.textSecondary
                            )
                        }
                        Icon(
                            painter = painterResource(R.drawable.icon_chevron_right_vector),
                            contentDescription = null,
                            tint = Colors.primary,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
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
        val isActuallyToday = todayWorkout?.isToday == true
        val isOverdue = todayWorkout?.isOverdue == true
        when {
            // ── Today's scheduled workout, not yet done ────────────────────────
            workout != null && isActuallyToday && !workout.isCompleted -> {
                item {
                    TodayWorkoutCard(
                        workout = workout,
                        isLoading = actionLoading,
                        onStart = { startWithContext(workout) },
                        onComplete = { onCompleteWorkout(workout) },
                        onSkip = { viewModel?.skipWorkout(workout.id, details.plan.id) },
                        onViewDetail = { viewWithContext(workout) }
                    )
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }
            }
            // ── Today's workout already done ───────────────────────────────────
            workout != null && isActuallyToday && workout.isCompleted -> {
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
            // ── Overdue: missed session from a previous day ────────────────────
            workout != null && isOverdue && !workout.isCompleted -> {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(modifier = Modifier.padding(Spacing.lg)) {
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                Icon(painterResource(R.drawable.icon_timer_vector), null, tint = Colors.warning, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(Spacing.sm))
                                Text("Missed Session", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.warning)
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
                            WorkoutTypeBadge(workout.workoutType)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(workout.description ?: workoutTypeLabel(workout.workoutType), style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary, maxLines = 2)
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("You have a session you haven't completed yet. Complete it now or it will be skipped.", style = AppTextStyles.small, color = Colors.textSecondary, maxLines = 3)
                            Spacer(modifier = Modifier.height(Spacing.md))
                            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.fillMaxWidth()) {
                                workout.distance?.let {
                                    PlanStatChip(R.drawable.icon_target_vector, "${it}km", modifier = Modifier.weight(1f))
                                }
                                workout.targetPace?.let { raw ->
                                    val paceValue = raw.replace("/km", "").trim()
                                    PlanStatChip(R.drawable.icon_timer_vector, "$paceValue min/km", modifier = Modifier.weight(1f))
                                }
                                workout.intensity?.let {
                                    val zoneLabel = it.replace(Regex("^z([1-5])$")) { match -> "Zone ${match.groupValues[1].uppercase()}" }
                                    PlanStatChip(R.drawable.icon_heart_vector, zoneLabel, modifier = Modifier.weight(1f))
                                }
                            }
                            Spacer(modifier = Modifier.height(Spacing.md))
                            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.fillMaxWidth()) {
                                OutlinedButton(
                                    onClick = { onCompleteWorkout(workout) },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Mark Done", style = AppTextStyles.small)
                                }
                                Button(
                                    onClick = { startWithContext(workout) },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = Colors.warning),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Icon(painterResource(R.drawable.icon_play_vector), null, modifier = Modifier.size(16.dp), tint = Colors.buttonText)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Start Now", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                                }
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }
            }
            // ── Rest day — nothing scheduled today, nothing overdue ────────────
            else -> {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary), modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(Spacing.lg)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(painterResource(R.drawable.icon_calendar_vector), null, tint = Colors.primary, modifier = Modifier.size(24.dp))
                                Spacer(modifier = Modifier.width(Spacing.md))
                                Text("Rest Day", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                            }
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("No session scheduled today. Take time to recover!", style = AppTextStyles.small, color = Colors.textSecondary)
                        }
                    }
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }
            }
        }

        // ── Weekly plan ───────────────────────────────────────────────────────
        item {
            Text("THIS WEEK", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp), color = Colors.textMuted)
            Spacer(modifier = Modifier.height(Spacing.sm))
        }

        // Calculate the actual current week based on plan creation date and today
        val actualCurrentWeek = calculateActualCurrentWeek(details.plan.createdAt)
        val currentWeekIndex = (actualCurrentWeek - 1).coerceAtLeast(0)
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
            ExpandableWeekCard(
                week = week,
                isCurrent = week.weekNumber == actualCurrentWeek,
                onWorkoutTap = { workout ->
                    // If completed, navigate to summary; else navigate to workout detail
                    if (workout.isCompleted && !workout.completedRunId.isNullOrBlank()) {
                        // TODO: Navigate to run summary with completedRunId
                        viewWithContext(workout)
                    } else {
                        // Show option to complete or start
                        viewWithContext(workout)
                    }
                },
                onCompleteWorkout = { workout ->
                    if (!workout.isCompleted) {
                        onCompleteWorkout(workout)
                    }
                },
                planId = details.plan.id,
                planCreatedAt = details.plan.createdAt,
                viewModel = viewModel
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
        }

        // ── Rolling block banner — shown after the last generated week ────────
        // Position here so the runner finishes reading the plan, then sees
        // the "next block coming" message right at the end of the generated weeks.
        if (blockStatus != null) {
            item {
                Spacer(modifier = Modifier.height(Spacing.sm))
                RollingBlockBanner(
                    blockStatus = blockStatus,
                    triggering = nextBlockTriggering,
                    onTriggerNextBlock = onTriggerNextBlock
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
        }

        // ── Abandon and Delete buttons at the bottom ───────────────────────────
        item {
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            // Add Injury button
            OutlinedButton(
                onClick = onAddInjury,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.warning)
            ) {
                Icon(painterResource(R.drawable.icon_heart_vector), null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text("Add Injury/Condition")
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            OutlinedButton(
                onClick = onShowAbandonDialog,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textSecondary),
                border = ButtonDefaults.outlinedButtonBorder.copy(brush = SolidColor(Colors.textSecondary))
            ) {
                Text("Cancel Plan")
            }
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
    onSkip: () -> Unit = {},
    onViewDetail: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Tapping the header area navigates to detail — buttons below are independent
            Row(
                modifier = Modifier.fillMaxWidth().clickable { onViewDetail() },
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
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
                workout.intensity?.let { 
                    // Convert "z1" to "Zone 1", "z2" to "Zone 2", etc.
                    val zoneLabel = it.replace(Regex("^z([1-5])$")) { match -> "Zone ${match.groupValues[1].uppercase()}" }
                    PlanStatChip(R.drawable.icon_heart_vector, zoneLabel)
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                // Primary actions: Start or Complete
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
                            Text("Start", color = Colors.buttonText, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold))
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
                            Text(if (workout.workoutType == "rest") "Mark Done" else "Mark Done", style = AppTextStyles.small)
                        }
                    }
                }
                
                // Secondary action: Skip
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
    val dayName = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat").getOrElse(((workout.dayOfWeek % 7) + 7) % 7) { "Day" }
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top
    ) {
        Text(dayName, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.width(36.dp).padding(top = 2.dp))
        Spacer(modifier = Modifier.width(Spacing.sm))
        Box(modifier = Modifier.size(8.dp).background(workoutTypeColor(workout.workoutType), RoundedCornerShape(4.dp)).padding(top = 4.dp))
        Spacer(modifier = Modifier.width(Spacing.sm))
        
        // Main content column: description on top, distance/pace below
        Column(modifier = Modifier.weight(1f)) {
            Text(
                workout.description ?: workoutTypeLabel(workout.workoutType),
                style = AppTextStyles.small,
                color = Colors.textPrimary
            )
            // Distance + pace instructions below the description
            if (workout.distance != null || workout.targetPace != null) {
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    workout.distance?.let {
                        Text("${it}km", style = AppTextStyles.small, color = Colors.textMuted)
                    }
                    workout.targetPace?.let { raw ->
                        val paceValue = raw.replace("/km", "").trim()
                        Text("$paceValue/km", style = AppTextStyles.small.copy(fontSize = 10.sp), color = Colors.textMuted)
                    }
                }
            }
        }
        
        // Completion checkmark on the right
        if (workout.isCompleted) {
            Spacer(modifier = Modifier.width(Spacing.sm))
            Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.success, modifier = Modifier.size(14.dp).padding(top = 2.dp))
        }
    }
}

@Composable
fun ExpandableWeekCard(
    week: WeekDetails,
    isCurrent: Boolean,
    onWorkoutTap: (WorkoutDetails) -> Unit,
    onCompleteWorkout: (WorkoutDetails) -> Unit,
    planId: String,
    planCreatedAt: String? = null,
    viewModel: TrainingPlanViewModel? = null
) {
    var isExpanded by remember { mutableStateOf(isCurrent) }
    var showChangeScheduleDialog by remember { mutableStateOf(false) }
    val actionLoading by (viewModel?.actionLoading?.collectAsState() ?: remember { mutableStateOf(false) })
    val skippedCount = week.workouts.count { it.isSkipped() }
    val completedCount = week.workouts.count { it.isCompleted && !it.isSkipped() }
    
    // Calculate scheduled vs missed based on date (device local timezone)
    // A workout is "scheduled" if it's today or in the future
    // A workout is "missed" only if it was due strictly before today (yesterday or earlier)
    val sdfWeek = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = java.util.TimeZone.getDefault()
    }
    val todayStartWeek = java.util.Calendar.getInstance().apply {
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }.timeInMillis

    val scheduledCount = week.workouts.count { workout ->
        !workout.isCompleted && !workout.isSkipped() &&
        !workout.workoutType.equals("rest", ignoreCase = true) &&
        workout.scheduledDate?.let { dateString ->
            try {
                val scheduledTime = sdfWeek.parse(dateString)?.time ?: Long.MAX_VALUE
                scheduledTime >= todayStartWeek // today or future → still scheduled
            } catch (_: Exception) { false }
        } ?: false
    }

    val missedCount = week.workouts.count { workout ->
        !workout.isCompleted && !workout.isSkipped() &&
        !workout.workoutType.equals("rest", ignoreCase = true) &&
        workout.scheduledDate?.let { dateString ->
            try {
                val scheduledTime = sdfWeek.parse(dateString)?.time ?: 0L
                scheduledTime < todayStartWeek // strictly before today → missed
            } catch (_: Exception) { false }
        } ?: false
    }
    
    val totalCount = week.workouts.size
    val fraction = if (totalCount > 0) completedCount.toFloat() / totalCount else 0f

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { isExpanded = !isExpanded },
        colors = CardDefaults.cardColors(
            containerColor = if (isCurrent) Colors.primary.copy(alpha = 0.08f) else Colors.backgroundSecondary
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            // Header (always visible)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Week ${week.weekNumber}",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                            color = if (isCurrent) Colors.primary else Colors.textPrimary
                        )
                        if (isCurrent) {
                            Spacer(modifier = Modifier.width(6.dp))
                            Surface(shape = RoundedCornerShape(4.dp), color = Colors.primary.copy(alpha = 0.2f)) {
                                Text(
                                    "Current",
                                    style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                                    color = Colors.primary,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                    Text(
                        week.weekDescription ?: week.focusArea?.replace("_", " ")?.replaceFirstChar { it.uppercase() } ?: "",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
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
                Spacer(modifier = Modifier.width(Spacing.sm))
                Icon(
                    painter = painterResource(if (isExpanded) R.drawable.icon_chevron_up_vector else R.drawable.icon_chevron_down_vector),
                    contentDescription = "Toggle",
                    tint = Colors.textMuted,
                    modifier = Modifier.size(20.dp)
                )
            }

            // Expanded content
            if (isExpanded) {
                HorizontalDivider(color = Colors.backgroundTertiary, thickness = 1.dp, modifier = Modifier.padding(horizontal = Spacing.lg))
                
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    // Summary stats — only show Skipped tile if there are skipped sessions
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = Spacing.md),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                    ) {
                        if (skippedCount > 0) {
                            // 4 chips: Scheduled, Completed, Missed, Skipped (each 1/4 width)
                            WeekStatChip("Scheduled", scheduledCount, Colors.primary, modifier = Modifier.weight(1f))
                            WeekStatChip("Completed", completedCount, Colors.success, modifier = Modifier.weight(1f))
                            WeekStatChip("Missed", missedCount, Colors.warning, modifier = Modifier.weight(1f))
                            WeekStatChip("Skipped", skippedCount, Colors.textMuted, modifier = Modifier.weight(1f))
                        } else {
                            // 3 chips: Scheduled, Completed, Missed (each 1/3 width)
                            WeekStatChip("Scheduled", scheduledCount, Colors.primary, modifier = Modifier.weight(1f))
                            WeekStatChip("Completed", completedCount, Colors.success, modifier = Modifier.weight(1f))
                            WeekStatChip("Missed", missedCount, Colors.warning, modifier = Modifier.weight(1f))
                        }
                    }

                    HorizontalDivider(color = Colors.backgroundTertiary, thickness = 1.dp, modifier = Modifier.padding(vertical = Spacing.md))

                    // Change Schedule Button
                    Button(
                        onClick = { showChangeScheduleDialog = true },
                        modifier = Modifier.fillMaxWidth().height(40.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary.copy(alpha = 0.1f)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(painterResource(R.drawable.icon_calendar_vector), null, modifier = Modifier.size(16.dp), tint = Colors.primary)
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("Change Schedule", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.primary)
                    }

                    Spacer(modifier = Modifier.height(Spacing.md))
                    HorizontalDivider(color = Colors.backgroundTertiary, thickness = 1.dp, modifier = Modifier.padding(vertical = Spacing.md))

                    // Workouts list
                    week.workouts.sortedBy { it.dayOfWeek }.forEach { workout ->
                        ExpandedWeekWorkoutRow(
                            workout = workout,
                            onClick = { onWorkoutTap(workout) },
                            onComplete = {
                                if (!workout.isCompleted) {
                                    onCompleteWorkout(workout)
                                }
                            },
                            onSkip = {
                                if (!workout.isCompleted && !workout.isSkipped()) {
                                    viewModel?.skipWorkout(workout.id, planId)
                                }
                            }
                        )
                        Spacer(modifier = Modifier.height(Spacing.sm))
                    }
                }
            }
        }
    }

    // Change Schedule Dialog
    if (showChangeScheduleDialog) {
        ChangeScheduleDialog(
            week = week,
            planCreatedAt = planCreatedAt,
            onDismiss = { showChangeScheduleDialog = false },
            onConfirm = { weekNumber, updates ->
                showChangeScheduleDialog = false
                viewModel?.rescheduleWeekSessions(planId, weekNumber, updates)
            },
            isLoading = actionLoading
        )
    }
}

@Composable
fun WeekStatChip(label: String, count: Int, color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = color.copy(alpha = 0.15f),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                count.toString(),
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = color
            )
            Text(
                label,
                style = AppTextStyles.small,
                color = color
            )
        }
    }
}

@Composable
fun ExpandedWeekWorkoutRow(
    workout: WorkoutDetails,
    onClick: () -> Unit,
    onComplete: () -> Unit,
    onSkip: () -> Unit
) {
    val dayName = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat").getOrElse(((workout.dayOfWeek % 7) + 7) % 7) { "Day" }
    
    // Determine status: scheduled, completed, missed, or skipped
    // "Missed" = strictly before today (yesterday or earlier) in the device's local timezone.
    // Today's session is always "Scheduled" until completed/skipped.
    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = java.util.TimeZone.getDefault()
    }
    val todayStart = java.util.Calendar.getInstance().apply {
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }.timeInMillis

    val isScheduled = !workout.isCompleted && !workout.isSkipped() &&
        workout.scheduledDate?.let { dateString ->
            try {
                val scheduledTime = sdf.parse(dateString)?.time ?: Long.MAX_VALUE
                scheduledTime >= todayStart // today or future → scheduled
            } catch (_: Exception) { false }
        } ?: false

    val isMissed = !workout.isCompleted && !workout.isSkipped() && !isScheduled &&
        workout.scheduledDate?.let { dateString ->
            try {
                val scheduledTime = sdf.parse(dateString)?.time ?: 0L
                scheduledTime < todayStart // strictly before today → missed
            } catch (_: Exception) { false }
        } ?: false
    
    val statusColor = when {
        workout.isCompleted -> Colors.success
        workout.isSkipped() -> Colors.textMuted
        isMissed -> Colors.warning
        else -> Colors.textMuted
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, statusColor.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
            .clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundRoot),
        shape = RoundedCornerShape(10.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Day and status indicator
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(50.dp)) {
                Text(dayName, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted)
                Spacer(modifier = Modifier.height(4.dp))
                when {
                    workout.isCompleted -> Icon(
                        painterResource(R.drawable.icon_check_vector),
                        null,
                        tint = Colors.success,
                        modifier = Modifier.size(16.dp)
                    )
                    isMissed -> Icon(
                        painterResource(R.drawable.icon_info_vector),
                        null,
                        tint = Colors.warning,
                        modifier = Modifier.size(16.dp)
                    )
                    workout.isSkipped() -> Icon(
                        painterResource(R.drawable.icon_x_vector),
                        null,
                        tint = Colors.textMuted,
                        modifier = Modifier.size(16.dp)
                    )
                    // No icon for scheduled sessions
                }
            }

            Spacer(modifier = Modifier.width(Spacing.md))

            // Workout details
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    workout.description ?: workoutTypeLabel(workout.workoutType),
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    workout.distance?.let {
                        Text("${it}km", style = AppTextStyles.small, color = Colors.textMuted)
                    }
                    workout.targetPace?.let { raw ->
                        val paceValue = raw.replace("/km", "").trim()
                        Text("$paceValue/km", style = AppTextStyles.small, color = Colors.textMuted)
                    }
                }
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
// Extension functions
// ─────────────────────────────────────────────────────────────────────────────

fun WorkoutDetails.isSkipped(): Boolean {
    // A workout is skipped if it's completed but has no completedRunId
    // (indicating it was marked done without actually running)
    return isCompleted && completedRunId.isNullOrBlank()
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

fun formatGoalWithTime(goalType: String, targetDistance: Double?, targetTimeSeconds: Int?): String {
    val distance = when (goalType) {
        "5k" -> "5km"
        "10k" -> "10km"
        "half_marathon" -> "Half Marathon"
        "marathon" -> "Marathon"
        "ultra" -> "Ultra Marathon"
        else -> "${targetDistance?.toInt() ?: ""}km"
    }
    
    return if (targetTimeSeconds != null && targetTimeSeconds > 0) {
        val time = formatSeconds(targetTimeSeconds)
        "Target $distance in $time"
    } else {
        "Target $distance"
    }
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
fun AiPlanSummary(details: TrainingPlanDetails) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Colors.primary.copy(alpha = 0.3f), RoundedCornerShape(16.dp)),
        colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.1f)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(R.drawable.icon_ai_vector), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text("Coaching Plan Summary", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.primary)
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            val baseline = details.performanceBaseline

            // ── Your Baseline (only when run history exists) ────────────────────
            if (baseline != null && baseline.hasHistory == true) {
                Text("Your Baseline", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                Spacer(modifier = Modifier.height(Spacing.sm))

                // Source label — tells the user exactly what data was used
                val sourceLabel = if (baseline.runsRecorded != null && !baseline.baselineWindow.isNullOrBlank()) {
                    val dateRange = if (!baseline.dateRange.isNullOrBlank()) " (${baseline.dateRange})" else ""
                    "Based on ${baseline.runsRecorded} runs from the ${baseline.baselineWindow}$dateRange"
                } else if (baseline.runsRecorded != null) {
                    "Based on ${baseline.runsRecorded} runs"
                } else null

                if (sourceLabel != null) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Colors.primary.copy(alpha = 0.08f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            sourceLabel,
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Medium),
                            color = Colors.primary,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.sm))
                }

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (!baseline.avgPace.isNullOrBlank()) {
                        BaselineRow(icon = R.drawable.icon_clock_vector, text = "Avg pace: ${baseline.avgPace} /km")
                    }
                    if (!baseline.runsPerWeek.isNullOrBlank()) {
                        BaselineRow(icon = R.drawable.icon_chart_vector, text = "Avg frequency: ${baseline.runsPerWeek} runs/week")
                    }
                    if (!baseline.avgDistance.isNullOrBlank()) {
                        // avgDistance is stored in metres — convert to km for display
                        val avgDistanceKm = baseline.avgDistance.toDoubleOrNull()
                            ?.let { String.format(Locale.US, "%.1f", it / 1000.0) }
                            ?: baseline.avgDistance
                        BaselineRow(icon = R.drawable.icon_map_pin_vector, text = "Avg run distance: $avgDistanceKm km")
                    }
                    if (!baseline.longestRun.isNullOrBlank()) {
                        val longestRunKm = baseline.longestRun.toDoubleOrNull()?.let { String.format(Locale.US, "%.1f", it) } ?: baseline.longestRun
                        val longestRunNote = if (baseline.longestRunSource == "all_time") " (all-time)" else ""
                        BaselineRow(icon = R.drawable.icon_trophy_vector, text = "Longest run: $longestRunKm km$longestRunNote")
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.md))
                HorizontalDivider(color = Colors.backgroundTertiary)
                Spacer(modifier = Modifier.height(Spacing.md))
            }

            // ── Plan Setup (always visible) ──────────────────────────────────────
            Text("Plan Setup", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Spacer(modifier = Modifier.height(Spacing.sm))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                BaselineRow(icon = R.drawable.icon_person, text = "${details.plan.experienceLevel.replaceFirstChar { it.uppercase() }} runner")
                BaselineRow(icon = R.drawable.icon_calendar_vector, text = "${details.plan.daysPerWeek} sessions per week")
                BaselineRow(icon = R.drawable.icon_clock_vector, text = "${details.plan.totalWeeks}-week programme")
                BaselineRow(icon = R.drawable.icon_target_vector, text = formatGoalWithTime(details.plan.goalType, details.plan.targetDistance, details.plan.targetTime))
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // What we're working on
            Text("Your Focus", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "This plan will build your aerobic base through consistent Zone 2 running, " +
                "develop your speed and power with targeted intensity sessions, " +
                "and prepare you to achieve your ${formatGoalType(details.plan.goalType).lowercase()} goal.",
                style = AppTextStyles.small,
                color = Colors.textSecondary,
                lineHeight = 18.sp
            )
            
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "💡 Tip: The majority of your running will be at an easy, conversational pace to build your aerobic foundation.",
                style = AppTextStyles.small.copy(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic),
                color = Colors.primary
            )

            // ── Safety Disclaimer (only shown for injury-modified plans) ──────────
            val safetyJson = details.plan.safetyDisclaimer
            if (!safetyJson.isNullOrBlank()) {
                val parsed = remember(safetyJson) {
                    try {
                        val obj = JSONObject(safetyJson)
                        val checks = buildList<String> {
                            obj.optJSONArray("prerequisiteChecks")?.let { arr ->
                                for (i in 0 until arr.length()) add(arr.getString(i))
                            }
                        }
                        val stops = buildList<String> {
                            obj.optJSONArray("stopCriteria")?.let { arr ->
                                for (i in 0 until arr.length()) add(arr.getString(i))
                            }
                        }
                        Triple(obj.optString("disclaimer", ""), checks, stops)
                    } catch (_: Exception) { null }
                }
                if (parsed != null) {
                    val (disclaimerText, prerequisites, stopCriteria) = parsed

                    Spacer(modifier = Modifier.height(Spacing.md))
                    HorizontalDivider(color = Colors.backgroundTertiary)
                    Spacer(modifier = Modifier.height(Spacing.md))

                    // Header row
                    val warningAmber = Color(0xFFF59E0B)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("⚠️", fontSize = 16.sp)
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text(
                            "Injury Modification — Important",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = warningAmber
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.sm))

                    // Disclaimer text
                    if (disclaimerText.isNotBlank()) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = warningAmber.copy(alpha = 0.08f),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                disclaimerText,
                                style = AppTextStyles.small,
                                color = Colors.textSecondary,
                                lineHeight = 17.sp,
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }

                    // Before you start checklist
                    if (prerequisites.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            "Before You Start",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        prerequisites.forEach { check ->
                            Row(
                                modifier = Modifier.padding(vertical = 2.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Text("✓ ", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = warningAmber)
                                Text(check, style = AppTextStyles.small, color = Colors.textSecondary, lineHeight = 16.sp)
                            }
                        }
                    }

                    // Stop criteria
                    if (stopCriteria.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            "Stop Immediately If",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        stopCriteria.forEach { criterion ->
                            Row(
                                modifier = Modifier.padding(vertical = 2.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Text("✕ ", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Color(0xFFEF4444))
                                Text(criterion, style = AppTextStyles.small, color = Colors.textSecondary, lineHeight = 16.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RollingBlockBanner(
    blockStatus: live.airuncoach.airuncoach.network.model.BlockStatus,
    triggering: Boolean,
    onTriggerNextBlock: () -> Unit
) {
    val generatedWeeks = blockStatus.generatedThroughWeek
    val totalWeeks = blockStatus.totalWeeks
    val canTriggerNow = blockStatus.nextBlockReady

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.08f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Colors.primary.copy(alpha = 0.25f))
    ) {
        Column(
            modifier = Modifier.padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Text("🔄", fontSize = 18.sp)
                Text(
                    "Adaptive ${totalWeeks}-Week Plan",
                    style = AppTextStyles.h4.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }

            Text(
                "Weeks 1–$generatedWeeks of $totalWeeks are ready. Your next training block will be generated on ${blockStatus.nextBlockAt?.let {
                    try {
                        val sdf = java.text.SimpleDateFormat("EEEE d MMMM", java.util.Locale.getDefault())
                        sdf.format(java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault()).parse(it.take(19)) ?: java.util.Date())
                    } catch (_: Exception) { "an upcoming date" }
                } ?: "an upcoming date"}, incorporating your real progress and adapting to your fitness development.",
                style = AppTextStyles.small,
                color = Colors.textSecondary,
                lineHeight = 18.sp
            )

            if (canTriggerNow) {
                Spacer(modifier = Modifier.height(4.dp))
                Button(
                    onClick = onTriggerNextBlock,
                    enabled = !triggering,
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    modifier = Modifier.fillMaxWidth().height(40.dp)
                ) {
                    if (triggering) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Colors.buttonText, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text(
                        if (triggering) "Generating your next block…" else "Generate Next Training Block",
                        style = AppTextStyles.small.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold),
                        color = Colors.buttonText
                    )
                }
            }
        }
    }
}

@Composable
private fun BaselineRow(@DrawableRes icon: Int, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Icon(
            painter = painterResource(id = icon),
            contentDescription = null,
            tint = Colors.primary,
            modifier = Modifier.size(16.dp)
        )
        Text(text, style = AppTextStyles.small, color = Colors.textSecondary)
    }
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

/**
 * Calculate the actual current week based on plan creation date and today.
 * Weeks start on Monday.
 */
fun calculateActualCurrentWeek(planCreatedAtString: String?): Int {
    if (planCreatedAtString == null) return 1
    
    try {
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
        val planCreatedDate = sdf.parse(planCreatedAtString) ?: return 1
        val today = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 0)
            set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }.time
        
        // Find the Monday of the week the plan was created
        val planCalendar = java.util.Calendar.getInstance().apply {
            time = planCreatedDate
            set(java.util.Calendar.HOUR_OF_DAY, 0)
            set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
            
            // Adjust to Monday of that week (0=Sunday, 1=Monday... 6=Saturday)
            val dayOfWeek = get(java.util.Calendar.DAY_OF_WEEK)
            val daysToMonday = if (dayOfWeek == 1) 6 else dayOfWeek - 2  // Sunday is 1, Mon is 2
            add(java.util.Calendar.DAY_OF_MONTH, -daysToMonday)
        }
        
        val planWeekStart = planCalendar.time
        val daysDiff = (today.time - planWeekStart.time) / (24 * 60 * 60 * 1000)
        val weeksDiff = (daysDiff / 7).toInt()
        
        return maxOf(1, weeksDiff + 1)
    } catch (e: Exception) {
        return 1
    }
}

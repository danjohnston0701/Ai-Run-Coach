package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.RegularSession
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.GeneratePlanState
import live.airuncoach.airuncoach.viewmodel.GeneratePlanViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GeneratePlanScreen(
    prefilledGoal: Goal? = null,
    onNavigateBack: () -> Unit,
    onPlanCreated: (String) -> Unit  // planId
) {
    val viewModel: GeneratePlanViewModel = hiltViewModel()
    val goalType by viewModel.goalType.collectAsState()
    val targetDistance by viewModel.targetDistance.collectAsState()
    val targetMinutes by viewModel.targetMinutes.collectAsState()
    val targetSeconds by viewModel.targetSeconds.collectAsState()
    val hasTimeGoal by viewModel.hasTimeGoal.collectAsState()
    val daysPerWeek by viewModel.daysPerWeek.collectAsState()
    val durationWeeks by viewModel.durationWeeks.collectAsState()
    val experienceLevel by viewModel.experienceLevel.collectAsState()
    val generateState by viewModel.generateState.collectAsState()
    val regularSessions by viewModel.regularSessions.collectAsState()
    val firstSessionStart by viewModel.firstSessionStart.collectAsState()

    // Dialog state for adding a regular session
    var showAddSessionDialog by remember { mutableStateOf(false) }

    // Pre-fill from linked goal
    LaunchedEffect(prefilledGoal) {
        prefilledGoal?.let { viewModel.prefillFromGoal(it) }
    }

    // Navigate on success
    LaunchedEffect(generateState) {
        if (generateState is GeneratePlanState.Success) {
            onPlanCreated((generateState as GeneratePlanState.Success).planId)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "AI Coaching Programme",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(R.drawable.icon_arrow_back_vector), "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        when (generateState) {
            is GeneratePlanState.Generating -> GeneratingScreen()
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .verticalScroll(rememberScrollState())
                        .padding(Spacing.lg)
                ) {
                    // Header — linked goal banner
                    prefilledGoal?.let { goal ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.12f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(Spacing.md),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(painterResource(R.drawable.icon_target_vector), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(Spacing.sm))
                                Column {
                                    Text("Based on your goal", style = AppTextStyles.small, color = Colors.primary)
                                    Text(goal.title, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    // ── Section 1: Goal Type ────────────────────────────────���───────────
                    SectionHeader(title = "What are you training for?", icon = R.drawable.icon_target_vector)
                    Spacer(modifier = Modifier.height(Spacing.md))

                    val goalOptions = listOf(
                        "5k" to "5K",
                        "10k" to "10K",
                        "half_marathon" to "Half Marathon",
                        "marathon" to "Marathon",
                        "custom" to "Custom Distance"
                    )
                    GoalTypeGrid(
                        options = goalOptions,
                        selected = goalType,
                        onSelect = { viewModel.setGoalType(it) }
                    )

                    if (goalType == "custom") {
                        Spacer(modifier = Modifier.height(Spacing.md))
                        OutlinedTextField(
                            value = targetDistance,
                            onValueChange = viewModel::setTargetDistance,
                            label = { Text("Distance (km)") },
                            modifier = Modifier.fillMaxWidth(),
                            colors = groupRunTextFieldColors()
                        )
                    }

                    Spacer(modifier = Modifier.height(Spacing.xl))

                    // ── Section 2: Time Goal ─────────────────────────────────────────────
                    SectionHeader(title = "Do you have a time target?", icon = R.drawable.icon_timer_vector)
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Target time", style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium), color = Colors.textPrimary)
                            Text("e.g. sub-20min for 5K", style = AppTextStyles.small, color = Colors.textMuted)
                        }
                        Switch(
                            checked = hasTimeGoal,
                            onCheckedChange = viewModel::setHasTimeGoal,
                            colors = SwitchDefaults.colors(checkedThumbColor = Colors.primary, checkedTrackColor = Colors.primary.copy(alpha = 0.4f))
                        )
                    }

                    AnimatedVisibility(visible = hasTimeGoal) {
                        Column {
                            Spacer(modifier = Modifier.height(Spacing.md))
                            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                OutlinedTextField(
                                    value = targetMinutes,
                                    onValueChange = viewModel::setTargetMinutes,
                                    label = { Text("Min") },
                                    modifier = Modifier.weight(1f),
                                    colors = groupRunTextFieldColors()
                                )
                                Text(
                                    ":",
                                    style = AppTextStyles.h3,
                                    color = Colors.textPrimary,
                                    modifier = Modifier.align(Alignment.CenterVertically)
                                )
                                OutlinedTextField(
                                    value = targetSeconds,
                                    onValueChange = viewModel::setTargetSeconds,
                                    label = { Text("Sec") },
                                    modifier = Modifier.weight(1f),
                                    colors = groupRunTextFieldColors()
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(Spacing.xl))

                    // ── Section 3: Experience Level ──────────────────────────────────────
                    SectionHeader(title = "Your current fitness level", icon = R.drawable.icon_trending_vector)
                    Spacer(modifier = Modifier.height(Spacing.md))

                    val levelOptions = listOf(
                        "beginner" to Triple("Beginner", "Running < 6 months", R.drawable.icon_play_vector),
                        "intermediate" to Triple("Intermediate", "Running 6–18 months", R.drawable.icon_chart_vector),
                        "advanced" to Triple("Advanced", "Running 18+ months", R.drawable.icon_trophy_vector)
                    )
                    levelOptions.forEach { (key, info) ->
                        val (label, subtitle, icon) = info
                        SelectableCard(
                            icon = icon,
                            title = label,
                            subtitle = subtitle,
                            selected = experienceLevel == key,
                            onClick = { viewModel.setExperienceLevel(key) }
                        )
                        Spacer(modifier = Modifier.height(Spacing.sm))
                    }

                    Spacer(modifier = Modifier.height(Spacing.xl))

                    // ── Section 4: Training Preferences ─────────────────────────────────
                    SectionHeader(title = "Training preferences", icon = R.drawable.icon_calendar_vector)
                    Spacer(modifier = Modifier.height(Spacing.md))

                    // Days per week
                    Text("Days per week: $daysPerWeek", style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium), color = Colors.textPrimary)
                    Slider(
                        value = daysPerWeek.toFloat(),
                        onValueChange = { viewModel.setDaysPerWeek(it.toInt()) },
                        valueRange = 3f..6f,
                        steps = 2,
                        colors = SliderDefaults.colors(thumbColor = Colors.primary, activeTrackColor = Colors.primary),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("3 days", style = AppTextStyles.small, color = Colors.textMuted)
                        Text("6 days", style = AppTextStyles.small, color = Colors.textMuted)
                    }

                    Spacer(modifier = Modifier.height(Spacing.lg))

                    // Programme duration
                    Text("Programme length: $durationWeeks weeks", style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium), color = Colors.textPrimary)
                    val maxWeeks = when (goalType) {
                        "marathon" -> 20
                        "half_marathon" -> 14
                        "10k" -> 10
                        else -> 8
                    }
                    Slider(
                        value = durationWeeks.toFloat(),
                        onValueChange = { viewModel.setDurationWeeks(it.toInt()) },
                        valueRange = 2f..maxWeeks.toFloat(),
                        steps = maxWeeks - 3,
                        colors = SliderDefaults.colors(thumbColor = Colors.primary, activeTrackColor = Colors.primary),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("2 weeks", style = AppTextStyles.small, color = Colors.textMuted)
                        Text("$maxWeeks weeks", style = AppTextStyles.small, color = Colors.textMuted)
                    }

                    Spacer(modifier = Modifier.height(Spacing.xl))

                    // ── Section 5: First Session Start ───────────────────────────────────
                    SectionHeader(title = "When do you want to start?", icon = R.drawable.icon_calendar_vector)
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        "Choose when your first coached session should be scheduled.",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))

                    val startOptions = listOf(
                        Triple("today", "Today", "First session scheduled for today"),
                        Triple("tomorrow", "Tomorrow", "Start fresh from tomorrow"),
                        Triple("flexible", "Flexible", "AI picks the best start day based on your schedule")
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        startOptions.forEach { (key, label, subtitle) ->
                            val selected = firstSessionStart == key
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { viewModel.setFirstSessionStart(key) }
                                    .border(
                                        width = if (selected) 2.dp else 1.dp,
                                        color = if (selected) Colors.primary else Colors.backgroundTertiary,
                                        shape = MaterialTheme.shapes.medium
                                    ),
                                colors = CardDefaults.cardColors(
                                    containerColor = if (selected) Colors.primary.copy(alpha = 0.1f)
                                    else Colors.backgroundSecondary
                                )
                            ) {
                                Row(
                                    modifier = Modifier.padding(Spacing.md),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            label,
                                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                            color = if (selected) Colors.primary else Colors.textPrimary
                                        )
                                        Text(
                                            subtitle,
                                            style = AppTextStyles.small,
                                            color = Colors.textMuted
                                        )
                                    }
                                    if (selected) {
                                        Icon(
                                            painterResource(R.drawable.icon_check_vector),
                                            null,
                                            tint = Colors.primary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(Spacing.xl))

                    // ── Section 6: Regular Running Sessions ──────────────────────────────
                    SectionHeader(title = "Your regular running sessions", icon = R.drawable.icon_repeat_vector)
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        "Add runs you do every week (e.g. Parkrun, running club) so your AI coach can build them into your programme.",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))

                    if (regularSessions.isEmpty()) {
                        // Empty state hint
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Colors.backgroundSecondary)
                                .border(1.dp, Colors.backgroundTertiary, RoundedCornerShape(12.dp))
                                .padding(Spacing.lg),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    painterResource(R.drawable.icon_repeat_vector),
                                    contentDescription = null,
                                    tint = Colors.textMuted,
                                    modifier = Modifier.size(28.dp)
                                )
                                Spacer(modifier = Modifier.height(Spacing.sm))
                                Text(
                                    "No regular sessions added yet",
                                    style = AppTextStyles.body,
                                    color = Colors.textMuted,
                                    textAlign = TextAlign.Center
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    "e.g. Parkrun every Saturday 8am",
                                    style = AppTextStyles.small,
                                    color = Colors.textMuted.copy(alpha = 0.6f),
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(Spacing.md))
                    } else {
                        regularSessions.forEach { session ->
                            RegularSessionCard(
                                session = session,
                                onToggleCounts = { viewModel.toggleSessionCountsTowardTotal(session.id) },
                                onRemove = { viewModel.removeRegularSession(session.id) }
                            )
                            Spacer(modifier = Modifier.height(Spacing.sm))
                        }
                        Spacer(modifier = Modifier.height(Spacing.sm))
                    }

                    OutlinedButton(
                        onClick = { showAddSessionDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Colors.primary.copy(alpha = 0.5f))
                    ) {
                        Icon(painterResource(R.drawable.icon_plus_vector), null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("Add regular session", style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium))
                    }

                    Spacer(modifier = Modifier.height(Spacing.xl))

                    // ── Error ────────────────────────────────────────────────────────────
                    if (generateState is GeneratePlanState.Error) {
                        Text(
                            (generateState as GeneratePlanState.Error).message,
                            style = AppTextStyles.small,
                            color = Colors.error,
                            modifier = Modifier.padding(bottom = Spacing.md)
                        )
                    }

                    // ── Generate CTA ─────────────────────────────────────────────────────
                    Button(
                        onClick = { viewModel.generatePlan() },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Icon(painterResource(R.drawable.icon_ai_vector), null, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text(
                            "Generate My ${durationWeeks}-Week Plan",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.buttonText
                        )
                    }

                    Spacer(modifier = Modifier.height(Spacing.xl))
                }
            }
        }
    }

    // ── Add Regular Session Dialog ────────────────────────────────────────────
    if (showAddSessionDialog) {
        AddRegularSessionDialog(
            onDismiss = { showAddSessionDialog = false },
            onConfirm = { session ->
                viewModel.addRegularSession(session)
                showAddSessionDialog = false
            }
        )
    }
}

@Composable
fun GeneratingScreen() {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.4f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "alpha"
    )

    // Cycle through progress messages to keep the user engaged during the ~60s wait
    val steps = listOf(
        "Analysing your fitness level...",
        "Reviewing your recent runs...",
        "Calculating optimal weekly load...",
        "Building your week-by-week schedule...",
        "Personalising training intensities...",
        "Adding rest & recovery days...",
        "Finalising your coaching plan..."
    )
    var stepIndex by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(7_000L)
            stepIndex = (stepIndex + 1) % steps.size
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            modifier = Modifier.padding(Spacing.xl)
        ) {
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .background(
                        brush = Brush.radialGradient(listOf(Colors.primary.copy(alpha = 0.3f), Colors.primary.copy(alpha = 0f))),
                        shape = RoundedCornerShape(50.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painterResource(R.drawable.icon_ai_vector),
                    contentDescription = null,
                    tint = Colors.primary.copy(alpha = alpha),
                    modifier = Modifier.size(52.dp)
                )
            }
            Text(
                "Your AI coach is building\nyour personalised plan...",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )
            CircularProgressIndicator(color = Colors.primary, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
            AnimatedContent(
                targetState = steps[stepIndex],
                label = "step"
            ) { step ->
                Text(
                    step,
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center
                )
            }
            Text(
                "This usually takes around 30–60 seconds.\nPlease keep the app open.",
                style = AppTextStyles.small,
                color = Colors.textSecondary.copy(alpha = 0.6f),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun GoalTypeGrid(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit
) {
    val rows = options.chunked(2)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        rows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                row.forEach { (key, label) ->
                    val isSelected = selected == key
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (isSelected) Colors.primary.copy(alpha = 0.15f) else Colors.backgroundSecondary
                            )
                            .border(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = if (isSelected) Colors.primary else Colors.backgroundTertiary,
                                shape = RoundedCornerShape(12.dp)
                            )
                            .clickable { onSelect(key) }
                            .padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            label,
                            style = AppTextStyles.body.copy(fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal),
                            color = if (isSelected) Colors.primary else Colors.textSecondary,
                            textAlign = TextAlign.Center
                        )
                    }
                }
                // Pad last row if odd number of options
                if (row.size == 1) Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun SelectableCard(
    icon: Int,
    title: String,
    subtitle: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) Colors.primary else Colors.backgroundTertiary,
                shape = MaterialTheme.shapes.medium
            ),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) Colors.primary.copy(alpha = 0.1f) else Colors.backgroundSecondary
        )
    ) {
        Row(
            modifier = Modifier.padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(painterResource(icon), null, tint = if (selected) Colors.primary else Colors.textMuted, modifier = Modifier.size(24.dp))
            Spacer(modifier = Modifier.width(Spacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = if (selected) Colors.primary else Colors.textPrimary)
                Text(subtitle, style = AppTextStyles.small, color = Colors.textMuted)
            }
            if (selected) {
                Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
            }
        }
    }
}

@Composable
fun SectionHeader(title: String, icon: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(painterResource(icon), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(title, style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regular session card
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun RegularSessionCard(
    session: RegularSession,
    onToggleCounts: () -> Unit,
    onRemove: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = if (session.countsTowardWeeklyTotal) Colors.primary.copy(alpha = 0.4f)
                        else Colors.backgroundTertiary,
                shape = RoundedCornerShape(12.dp)
            ),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    painterResource(R.drawable.icon_repeat_vector),
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        session.name,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "${session.dayName} · ${session.timeLabel} · ${session.distanceKm}km",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
                IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                    Icon(
                        painterResource(R.drawable.icon_trash_vector),
                        contentDescription = "Remove session",
                        tint = Colors.textMuted,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.sm))
            HorizontalDivider(color = Colors.backgroundTertiary, thickness = 1.dp)
            Spacer(modifier = Modifier.height(Spacing.sm))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Count towards weekly session total",
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.Medium),
                        color = Colors.textSecondary
                    )
                    Text(
                        if (session.countsTowardWeeklyTotal)
                            "Included in your ${
                                /* shown contextually */ ""
                            }weekly count"
                        else
                            "Extra — not counted in weekly target",
                        style = AppTextStyles.small,
                        color = if (session.countsTowardWeeklyTotal) Colors.primary else Colors.textMuted
                    )
                }
                Switch(
                    checked = session.countsTowardWeeklyTotal,
                    onCheckedChange = { onToggleCounts() },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Colors.primary,
                        checkedTrackColor = Colors.primary.copy(alpha = 0.4f)
                    )
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Regular Session Dialog
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddRegularSessionDialog(
    onDismiss: () -> Unit,
    onConfirm: (RegularSession) -> Unit
) {
    val days = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

    var name by remember { mutableStateOf("") }
    var selectedDay by remember { mutableIntStateOf(6) } // default Saturday
    var timeHour by remember { mutableStateOf("08") }
    var timeMinute by remember { mutableStateOf("00") }
    var distanceKm by remember { mutableStateOf("") }
    var countsTowardTotal by remember { mutableStateOf(true) }
    var nameError by remember { mutableStateOf(false) }
    var distanceError by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Colors.backgroundSecondary,
        titleContentColor = Colors.textPrimary,
        textContentColor = Colors.textSecondary,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painterResource(R.drawable.icon_repeat_vector),
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    "Add regular session",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {

                // Session name
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; nameError = false },
                    label = { Text("Session name") },
                    placeholder = { Text("e.g. Parkrun, Tuesday Running Club") },
                    isError = nameError,
                    supportingText = if (nameError) ({ Text("Please enter a name") }) else null,
                    modifier = Modifier.fillMaxWidth(),
                    colors = groupRunTextFieldColors()
                )

                // Day of week chips
                Text(
                    "Day of week",
                    style = AppTextStyles.small.copy(fontWeight = FontWeight.Medium),
                    color = Colors.textSecondary
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    days.forEachIndexed { index, day ->
                        val selected = selectedDay == index
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(
                                    if (selected) Colors.primary.copy(alpha = 0.18f)
                                    else Colors.backgroundTertiary
                                )
                                .border(
                                    width = if (selected) 1.5.dp else 1.dp,
                                    color = if (selected) Colors.primary else Colors.backgroundTertiary,
                                    shape = RoundedCornerShape(8.dp)
                                )
                                .clickable { selectedDay = index }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                day,
                                style = AppTextStyles.small.copy(
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
                                ),
                                color = if (selected) Colors.primary else Colors.textMuted
                            )
                        }
                    }
                }

                // Time row
                Text(
                    "Start time",
                    style = AppTextStyles.small.copy(fontWeight = FontWeight.Medium),
                    color = Colors.textSecondary
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = timeHour,
                        onValueChange = { v ->
                            if (v.length <= 2 && v.all { it.isDigit() }) timeHour = v
                        },
                        label = { Text("HH") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        colors = groupRunTextFieldColors()
                    )
                    Text(":", style = AppTextStyles.h3, color = Colors.textPrimary)
                    OutlinedTextField(
                        value = timeMinute,
                        onValueChange = { v ->
                            if (v.length <= 2 && v.all { it.isDigit() }) timeMinute = v
                        },
                        label = { Text("MM") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        colors = groupRunTextFieldColors()
                    )
                }

                // Distance
                OutlinedTextField(
                    value = distanceKm,
                    onValueChange = { distanceKm = it; distanceError = false },
                    label = { Text("Distance (km)") },
                    placeholder = { Text("e.g. 5.0") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    isError = distanceError,
                    supportingText = if (distanceError) ({ Text("Please enter a valid distance") }) else null,
                    modifier = Modifier.fillMaxWidth(),
                    colors = groupRunTextFieldColors()
                )

                // Counts toward total toggle
                HorizontalDivider(color = Colors.backgroundTertiary)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Count towards weekly total",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                            color = Colors.textPrimary
                        )
                        Text(
                            "Turn off to keep this as an extra run outside your AI plan count",
                            style = AppTextStyles.small,
                            color = Colors.textMuted
                        )
                    }
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Switch(
                        checked = countsTowardTotal,
                        onCheckedChange = { countsTowardTotal = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Colors.primary,
                            checkedTrackColor = Colors.primary.copy(alpha = 0.4f)
                        )
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    nameError = name.isBlank()
                    val dist = distanceKm.toDoubleOrNull()
                    distanceError = dist == null || dist <= 0.0
                    if (!nameError && !distanceError) {
                        onConfirm(
                            RegularSession(
                                name = name.trim(),
                                dayOfWeek = selectedDay,
                                timeHour = timeHour.toIntOrNull()?.coerceIn(0, 23) ?: 8,
                                timeMinute = timeMinute.toIntOrNull()?.coerceIn(0, 59) ?: 0,
                                distanceKm = dist!!,
                                countsTowardWeeklyTotal = countsTowardTotal
                            )
                        )
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Add session", color = Colors.buttonText, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Colors.textMuted)
            }
        }
    )
}

@file:OptIn(ExperimentalMaterial3Api::class)

package live.airuncoach.airuncoach.ui.screens


import android.content.Context
import android.content.Intent
import android.util.Log
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.*
import androidx.compose.ui.platform.LocalDensity
import kotlin.math.roundToInt
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.core.view.drawToBitmap
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.*
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.domain.model.DismissReason
import live.airuncoach.airuncoach.domain.model.StrugglePoint
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.domain.model.getDisplayText
import live.airuncoach.airuncoach.domain.model.AiCoachingNote
import live.airuncoach.airuncoach.network.model.BasicRunInsights
import live.airuncoach.airuncoach.network.model.ComprehensiveRunAnalysis
import live.airuncoach.airuncoach.network.model.GarminInsights
import live.airuncoach.airuncoach.network.model.TechnicalAnalysis
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.AiAnalysisState
import live.airuncoach.airuncoach.viewmodel.GoalsViewModel
import live.airuncoach.airuncoach.viewmodel.GoalsViewModelFactory
import live.airuncoach.airuncoach.viewmodel.RunSummaryViewModel
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** When true, charts should fill all available space instead of using a fixed height */
private val LocalFullscreenChart = compositionLocalOf { false }

/**
 * FLAGSHIP Run Summary Screen
 * - 3 tabs (Summary/Data/Achievements)
 * - Google Maps route
 * - Vico charts (1.13.1) with animated mode switch + styled container
 * - Expandable AI sections
 * - Shareable summary card (text share + optional bitmap share helper)
 * - Optional "lastRun" for delta stats (wire from VM later)
 */
@Composable
fun RunSummaryScreenFlagship(
    runId: String,
    onNavigateBack: () -> Unit = {},
    onNavigateToLogin: () -> Unit = {},
    onNavigateToShareImage: (String) -> Unit = {},
    viewModel: RunSummaryViewModel = hiltViewModel(),
    lastRunForDelta: RunSession? = null, // optional: wire later from your VM/store
) {
    val runSession by viewModel.runSession.collectAsState()
    val analysisState by viewModel.analysisState.collectAsState()
    val isLoadingRun by viewModel.isLoadingRun.collectAsState()
    val loadError by viewModel.loadError.collectAsState()
    val userPostRunComments by viewModel.userPostRunComments.collectAsState()
    val strugglePoints by viewModel.strugglePoints.collectAsState()
    val isAdmin = viewModel.isAdminUser()
    val isGarminConnected by viewModel.isGarminConnected.collectAsState()

    val context = LocalContext.current

    LaunchedEffect(runId) {
        if (runSession == null && loadError == null) {
            viewModel.loadRunById(runId)
        }
    }

    var selectedTab by remember { mutableStateOf(0) }
    var showRenameDialog by remember { mutableStateOf(false) }
    var runNameDraft by remember { mutableStateOf("") }
    
    // Goal celebration dialog state
    var showGoalCelebration by remember { mutableStateOf(false) }
    var achievedGoals by remember { mutableStateOf<List<live.airuncoach.airuncoach.domain.model.Goal>>(emptyList()) }
    var selectedGoalForCompletion by remember { mutableStateOf<live.airuncoach.airuncoach.domain.model.Goal?>(null) }
    
    // Create GoalsViewModel to check for achieved goals (using compose viewModel with factory)
    val goalsViewModel: GoalsViewModel = viewModel(factory = GoalsViewModelFactory(LocalContext.current))

    LaunchedEffect(runSession?.name) {
        runNameDraft = runSession?.name.orEmpty()
    }
    
    // Check for achieved goals when run session is loaded
    LaunchedEffect(runSession) {
        runSession?.let { session ->
            // Load goals first if not already loaded
            goalsViewModel.loadGoals()
            
            // Wait a bit for goals to load
            kotlinx.coroutines.delay(500)
            
            // Check if any goals were achieved by this run
            val runDurationSeconds = session.duration / 1000 // Convert milliseconds to seconds
            val goals = goalsViewModel.checkGoalsMetByRun(session.distance, runDurationSeconds, session.startTime)
            
            // Filter out goals that are already completed or already linked to this run session
            val validGoals = goals.filter { goal ->
                !goal.isCompleted && (goal.relatedRunSessionIds?.contains(session.id) != true)
            }
            
            if (validGoals.isNotEmpty()) {
                achievedGoals = validGoals
                selectedGoalForCompletion = validGoals.first()
                showGoalCelebration = true
            }
        }
    }

    Scaffold(
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0), // outer Scaffold already handles nav bar insets
        topBar = {
            RunSummaryTopBarFlagship(
                title = "Run Insights",
                subtitle = runSession?.let {
                    "${it.getFormattedDate()} • ${
                        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(it.startTime))
                    }"
                } ?: "",
                onBack = onNavigateBack,
                onRename = { showRenameDialog = true },
                onShare = {
                    viewModel.shareRunWithLink(context)
                },
                difficultyLabel = runSession?.let { formatTerrainLabel(it.getDifficultyLevel()) }
            )
        }
    ) { padding ->
        when {
            isLoadingRun -> CenterLoading(padding)
            loadError != null -> ErrorViewFlagship(loadError!!, onNavigateBack, onNavigateToLogin)
            runSession != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) {
                    when (selectedTab) {
                        0 -> AiInsightsTabContent(
                            run = runSession!!,
                            lastRunForDelta = lastRunForDelta,
                            analysisState = analysisState,
                            strugglePoints = strugglePoints,
                            comments = userPostRunComments,
                            onCommentsChange = viewModel::updatePostRunComments,
                            onGenerateAi = { viewModel.generateAIAnalysis() },
                            onRetryAi = { viewModel.retryAIAnalysis() },
                            isGarminConnected = isGarminConnected,
                            onEnrichWithGarmin = { viewModel.enrichRunWithGarminData() },
                            isEnrichingWithGarmin = viewModel.isEnrichingWithGarmin.collectAsState().value,
                            coachingNotes = runSession!!.aiCoachingNotes,
                            onShareCard = {
                                // share a “summary card” (text now; optional bitmap helper included below)
                                viewModel.shareRunWithLink(context)
                            },
                            onDelete = {
                                viewModel.deleteRun(
                                    onSuccess = { onNavigateBack() },
                                    onError = { error -> Log.e("RunSummaryScreen", "Delete error: $error") }
                                )
                            },
                            onStruggleComment = viewModel::updateStrugglePointComment,
                            onStruggleDismiss = viewModel::dismissStrugglePoint,
                            onStruggleRestore = viewModel::restoreStrugglePoint,
                            difficultyLabel = runSession?.let { formatTerrainLabel(it.getDifficultyLevel()) },
                            onCreateShareImage = { onNavigateToShareImage(runId) },
                            selectedTab = selectedTab,
                            onTabSelected = { selectedTab = it }
                        )

                        1 -> SummaryTabContent(
                            run = runSession!!,
                            lastRunForDelta = lastRunForDelta,
                            strugglePoints = strugglePoints,
                            onDelete = {
                                viewModel.deleteRun(
                                    onSuccess = { onNavigateBack() },
                                    onError = { error -> Log.e("RunSummaryScreen", "Delete error: $error") }
                                )
                            },
                            selectedTab = selectedTab,
                            onTabSelected = { selectedTab = it }
                        )

                        2 -> GraphsTabContent(
                            run = runSession!!,
                            onDelete = {
                                viewModel.deleteRun(
                                    onSuccess = { onNavigateBack() },
                                    onError = { error -> Log.e("RunSummaryScreen", "Delete error: $error") }
                                )
                            },
                            selectedTab = selectedTab,
                            onTabSelected = { selectedTab = it }
                        )

                        3 -> DataTabFlagship(
                            run = runSession!!,
                            onDelete = {
                                viewModel.deleteRun(
                                    onSuccess = { onNavigateBack() },
                                    onError = { error -> Log.e("RunSummaryScreen", "Delete error: $error") }
                                )
                            },
                            selectedTab = selectedTab,
                            onTabSelected = { selectedTab = it }
                        )
                        4 -> AchievementsTabFlagship(
                            run = runSession!!,
                            analysisState = analysisState,
                            onDelete = {
                                viewModel.deleteRun(
                                    onSuccess = { onNavigateBack() },
                                    onError = { error -> Log.e("RunSummaryScreen", "Delete error: $error") }
                                )
                            },
                            selectedTab = selectedTab,
                            onTabSelected = { selectedTab = it }
                        )
                    }
                }
                
                // Goal Achieved Celebration Dialog
                if (showGoalCelebration && selectedGoalForCompletion != null && runSession != null) {
                    val runDistance = runSession!!.getDistanceInKm()
                    val formattedDistance = if (runDistance >= 1) {
                        String.format(Locale.US, "%.2f km", runDistance)
                    } else {
                        String.format(Locale.US, "%.0f m", runSession!!.distance)
                    }
                    
                    GoalAchievedCelebrationDialog(
                        goalTitle = selectedGoalForCompletion!!.title,
                        goalType = selectedGoalForCompletion!!.type,
                        runDistance = formattedDistance,
                        onKeepActive = {
                            // Keep goal active and link this run session to it
                            selectedGoalForCompletion?.id?.let { goalId ->
                                goalsViewModel.linkRunSessionToGoal(goalId, runSession!!.id)
                            }
                            showGoalCelebration = false
                        },
                        onMarkComplete = {
                            // Mark goal as complete and link this run session to it
                            selectedGoalForCompletion?.id?.let { goalId ->
                                goalsViewModel.completeGoal(goalId, runSession!!.id, keepActive = false)
                            }
                            showGoalCelebration = false
                        },
                        onDismiss = { showGoalCelebration = false }
                    )
                }

                if (showRenameDialog) {
                    RenameDialogFlagship(
                        runNameDraft = runNameDraft,
                        onDraftChange = { runNameDraft = it },
                        onSave = {
                            viewModel.initializeRunSummary(
                                runSession = runSession!!.copy(name = runNameDraft.ifBlank { null }),
                                strugglePoints = viewModel.strugglePoints.value
                            )
                            showRenameDialog = false
                        },
                        onCancel = { showRenameDialog = false }
                    )
                }
            }
        }
    }
}

/* -------------------------------- TOP BAR -------------------------------- */

@Composable
private fun RunSummaryTopBarFlagship(
    title: String,
    subtitle: String,
    onBack: () -> Unit,
    onRename: () -> Unit,
    onShare: () -> Unit,
    difficultyLabel: String?
) {
    // Compact header pinned to top — uses statusBarsPadding to fill the status bar area
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Colors.backgroundRoot)
            .statusBarsPadding()
            .padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold), color = Colors.textPrimary)
            if (subtitle.isNotBlank()) {
                Text(subtitle, style = AppTextStyles.small, color = Colors.textSecondary)
            }
        }
        IconButton(onClick = onRename) {
            Icon(Icons.Default.Edit, contentDescription = "Rename", tint = Colors.textPrimary)
        }
    }
}

/** Format terrain label for display */
private fun formatTerrainLabel(terrain: String): String {
    return when (terrain.lowercase()) {
        "flat" -> "FLAT"
        "rolling" -> "ROLLING"
        "hilly" -> "HILLY"
        "steep" -> "STEEP"
        "extreme" -> "EXTREME"
        else -> terrain.uppercase()
    }
}

@Composable
private fun DifficultyPillFlagship(label: String) {
    Box(
        modifier = Modifier
            .padding(end = 8.dp)
            .background(Colors.primary.copy(alpha = 0.16f), RoundedCornerShape(999.dp))
            .border(1.dp, Colors.primary.copy(alpha = 0.35f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
            color = Colors.primary
        )
    }
}

@Composable
private fun RunTabsFlagship(selected: Int, onSelected: (Int) -> Unit) {
    val labels = listOf("Ai Insights", "Summary", "Graphs", "Data", "Badges")
    ScrollableTabRow(
        selectedTabIndex = selected,
        containerColor = Colors.backgroundRoot,
        contentColor = Colors.primary,
        edgePadding = Spacing.lg
    ) {
        labels.forEachIndexed { index, text ->
            Tab(
                selected = selected == index,
                onClick = { onSelected(index) },
                text = {
                    Text(
                        text = text,
                        style = AppTextStyles.caption.copy(
                            fontWeight = if (selected == index) FontWeight.Bold else FontWeight.Medium
                        )
                    )
                },
                selectedContentColor = Colors.primary,
                unselectedContentColor = Colors.textMuted
            )
        }
    }
}

/* ------------------------------- TAB: AI INSIGHTS ------------------------------ */

@Composable
private fun AiInsightsTabContent(
    run: RunSession,
    lastRunForDelta: RunSession?,
    analysisState: AiAnalysisState,
    strugglePoints: List<StrugglePoint> = emptyList(),
    comments: String,
    onCommentsChange: (String) -> Unit,
    onGenerateAi: () -> Unit,
    onRetryAi: () -> Unit = {},
    isGarminConnected: Boolean = false,
    onEnrichWithGarmin: () -> Unit = {},
    isEnrichingWithGarmin: Boolean = false,
    coachingNotes: List<AiCoachingNote> = emptyList(),
    onShareCard: () -> Unit,
    onDelete: () -> Unit,
    onStruggleComment: (String, String) -> Unit = { _, _ -> },
    onStruggleDismiss: (String, DismissReason) -> Unit = { _, _ -> },
    onStruggleRestore: (String) -> Unit = {},
    difficultyLabel: String? = null,
    onCreateShareImage: () -> Unit = {},
    selectedTab: Int = 0,
    onTabSelected: (Int) -> Unit = {},
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = Spacing.lg),
        contentPadding = PaddingValues(bottom = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg)
    ) {
        // Tabs for navigation
        item {
            RunTabsFlagship(selected = selectedTab, onSelected = onTabSelected)
        }

        // Run Completed banner with optional difficulty pill
        item {
            RunCompletedBannerWithDifficulty(difficultyLabel = difficultyLabel)
        }

        // Garmin recognition badge — shown just below the Run Completed banner
        if (isGarminConnected || run.externalSource == "garmin") {
            item {
                GarminPoweredByBadge(text = "Run data Powered by Garmin")
            }
        }

        item {
            ShareableSummaryCard(
                run = run,
                lastRunForDelta = lastRunForDelta,
                onShare = onShareCard
            )
        }

        // Create Share Image button
        item {
            CreateShareImageButton(onClick = onCreateShareImage)
        }

        // Struggle Point Analysis — moved above map for visibility
        if (strugglePoints.isNotEmpty()) {
            item {
                StrugglePointAnalysisSection(
                    strugglePoints = strugglePoints,
                    onComment = onStruggleComment,
                    onDismiss = onStruggleDismiss,
                    onRestore = onStruggleRestore
                )
            }
        } else {
            item { NoStrugglePointsBanner() }
        }

        // AI Analysis — moved above map for visibility
        item {
            Text(
                text = "AI Analysis",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
        }

        item {
            AiSectionFlagship(
                analysisState = analysisState,
                comments = comments,
                coachingNotes = coachingNotes,
                onCommentsChange = onCommentsChange,
                onGenerateAi = onGenerateAi,
                onRetryAi = onRetryAi
            )
        }

        // Delete run button at the bottom of the tab
        item {
            Spacer(modifier = Modifier.height(Spacing.md))
            OutlinedButton(
                onClick = onDelete,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Colors.error
                ),
                border = ButtonDefaults.outlinedButtonBorder.copy(
                    brush = SolidColor(Colors.error)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete",
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete Run", fontWeight = FontWeight.Medium)
            }
        }

        item { Spacer(modifier = Modifier.height(Spacing.sm)) }
    }
}

/* ------------------------------- TAB: SUMMARY (MAP + STATS) ------------------------------ */

@Composable
private fun SummaryTabContent(
    run: RunSession,
    lastRunForDelta: RunSession?,
    strugglePoints: List<StrugglePoint> = emptyList(),
    onDelete: () -> Unit,
    selectedTab: Int = 0,
    onTabSelected: (Int) -> Unit = {},
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = Spacing.lg),
        contentPadding = PaddingValues(bottom = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg)
    ) {
        // Tabs for navigation
        item {
            RunTabsFlagship(selected = selectedTab, onSelected = onTabSelected)
        }

        // Map
        item {
            if (run.routePoints.isNotEmpty()) {
                RouteMapCardFlagship(
                    points = run.routePoints,
                    strugglePoints = strugglePoints,
                    coachingNotes = run.aiCoachingNotes
                )
            }
        }

        item { HeaderDistanceBlockFlagship(run) }

        item {
            MainStatsGridFlagship(run = run, lastRunForDelta = lastRunForDelta)
        }

        item {
            if (run.kmSplits.isNotEmpty()) {
                KmSplitsCardFlagship(run.kmSplits)
            }
        }

        // Pace Consistency & Split Analysis
        item { PaceConsistencyCard(run = run) }

        item { SplitAnalysisCard(run = run) }

        // Km Splits Visual Bar Chart
        item {
            if (run.kmSplits.size >= 2) {
                KmSplitsVisualChart(kmSplits = run.kmSplits)
            }
        }

        // Effort Score / Training Load
        item { EffortScoreCard(run = run) }

        // Delete run button at the bottom of the tab
        item {
            Spacer(modifier = Modifier.height(Spacing.md))
            OutlinedButton(
                onClick = onDelete,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Colors.error
                ),
                border = ButtonDefaults.outlinedButtonBorder.copy(
                    brush = SolidColor(Colors.error)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete",
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete Run", fontWeight = FontWeight.Medium)
            }
        }

        item { Spacer(modifier = Modifier.height(Spacing.sm)) }
    }
}

/* ------------------------------- TAB: GRAPHS ------------------------------ */

@Composable
private fun GraphsTabContent(
    run: RunSession,
    onDelete: () -> Unit,
    selectedTab: Int = 0,
    onTabSelected: (Int) -> Unit = {},
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = Spacing.lg),
        contentPadding = PaddingValues(bottom = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg)
    ) {
        // Tabs for navigation
        item {
            RunTabsFlagship(selected = selectedTab, onSelected = onTabSelected)
        }

        item { ChartsSectionFlagship(run = run) }

        item { HeartRateZonesVisualCard(heartRateData = run.heartRateData) }

        // Intensity Distribution Donut
        item { IntensityDistributionCard(run = run) }

        // ===== UNIQUE DIFFERENTIATING FEATURES =====

        // (AI Coaching Replay Timeline - hidden for all users)

        // Pace Decay / Fatigue Curve
        item { FatigueCurveCard(run = run) }

        // Aerobic Decoupling
        item { AerobicDecouplingCard(run = run) }

        // Running Economy (Pace vs HR)
        item { RunningEconomyCard(run = run) }

        // Race Time Predictor
        item { RaceTimePredictorCard(run = run) }

        // Weather Performance Index
        item {
            if (run.weatherAtStart != null) {
                WeatherPerformanceCard(weather = run.weatherAtStart!!)
            }
        }

        // Delete run button at the bottom of the tab
        item {
            Spacer(modifier = Modifier.height(Spacing.md))
            OutlinedButton(
                onClick = onDelete,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Colors.error
                ),
                border = ButtonDefaults.outlinedButtonBorder.copy(
                    brush = SolidColor(Colors.error)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete",
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete Run", fontWeight = FontWeight.Medium)
            }
        }

        item { Spacer(modifier = Modifier.height(Spacing.sm)) }
    }
}

@Composable
private fun SuccessBannerFlagship() {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.success.copy(alpha = 0.12f)),
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.CheckCircle,
                contentDescription = null,
                tint = Colors.success,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "Run Complete!",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.success
            )
        }
    }
}

@Composable
private fun RunCompletedBannerWithDifficulty(difficultyLabel: String?) {
    val isUnknown = difficultyLabel.isNullOrBlank() || difficultyLabel.equals("UNKNOWN", ignoreCase = true)
    
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.success.copy(alpha = 0.12f)),
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (isUnknown) Arrangement.Center else Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.then(if (isUnknown) Modifier.fillMaxWidth() else Modifier)
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = Colors.success,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Run Complete!",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.success
                )
            }
            
            // Show difficulty pill only if not unknown
            if (!isUnknown) {
                DifficultyPillFlagship(label = difficultyLabel!!)
            }
        }
    }
}

/* -------------------------- SHAREABLE SUMMARY CARD ------------------------- */

@Composable
private fun CreateShareImageButton(onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Colors.primary,
            contentColor = Colors.buttonText
        )
    ) {
        Icon(
            imageVector = Icons.Default.AutoAwesome,
            contentDescription = null,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(
            text = "Create Share Image",
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
        )
    }
}

@Composable
private fun NoStrugglePointsBanner() {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.success.copy(alpha = 0.10f)),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.CheckCircle,
                contentDescription = null,
                tint = Colors.success,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "Great run! No struggle points identified.",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.success
            )
        }
    }
}

@Composable
private fun ShareableSummaryCard(
    run: RunSession,
    lastRunForDelta: RunSession?,
    onShare: () -> Unit
) {
    val distanceKm = run.distance / 1000.0
    val duration = formatDuration(run.duration)
    val avgPace = run.averagePace?.replace("/km", "") ?: "--:--"
    val avgCadence = if (run.cadence > 0) "${run.cadence} spm" else "-- spm"

    val deltaPace = remember(run, lastRunForDelta) {
        lastRunForDelta?.averagePace?.let { last ->
            paceDeltaString(lastPace = last, currentPace = run.averagePace)
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(1.dp, Colors.border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        listOf(
                            Colors.primary.copy(alpha = 0.14f),
                            Colors.backgroundSecondary
                        )
                    )
                )
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    Text(
                        text = run.name ?: "Run Summary",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = "${run.getFormattedDate()} • ${SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(run.startTime))}",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
                TextButton(onClick = onShare) {
                    Text("Share", color = Colors.primary, fontWeight = FontWeight.Bold)
                }
            }

            // 2x2 Stats Grid
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SummaryStatTile(
                        label = "Distance",
                        value = String.format(Locale.US, "%.2f km", distanceKm),
                        accent = Colors.primary,
                        modifier = Modifier.weight(1f)
                    )
                    SummaryStatTile(
                        label = "Duration",
                        value = duration,
                        accent = Colors.success,
                        modifier = Modifier.weight(1f)
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SummaryStatTile(
                        label = "Avg Pace",
                        value = "$avgPace /km",
                        accent = Colors.accent,
                        modifier = Modifier.weight(1f)
                    )
                    SummaryStatTile(
                        label = "Avg Cadence",
                        value = avgCadence,
                        accent = Color(0xFF8B5CF6),
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            if (!deltaPace.isNullOrBlank()) {
                Text(
                    text = "Trend vs last run: $deltaPace",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
private fun SummaryStatTile(
    label: String,
    value: String,
    accent: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(accent.copy(alpha = 0.10f))
            .border(1.dp, accent.copy(alpha = 0.18f), RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(label, style = AppTextStyles.caption, color = Colors.textMuted)
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            value,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold, fontSize = 15.sp),
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )
    }
}

/* ----------------------------- HEADER DISTANCE & TIME ------------------------ */

@Composable
private fun HeaderDistanceBlockFlagship(run: RunSession) {
    val distanceKm = run.distance / 1000.0
    val duration = run.getFormattedDuration()

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Time and Distance side by side
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom
        ) {
            // Time on the left
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = duration,
                    style = AppTextStyles.stat.copy(fontSize = 36.sp, lineHeight = 42.sp),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "time",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Medium),
                    color = Colors.textSecondary,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }

            // Distance on the right
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = String.format(Locale.US, "%.2f", distanceKm),
                    style = AppTextStyles.stat.copy(fontSize = 36.sp, lineHeight = 42.sp),
                    color = Colors.primary
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "km",
                    style = AppTextStyles.h3.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.textPrimary,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
        }

        // Difficulty chip below
        val difficulty = (run.difficulty ?: run.getDifficultyLevel())
        DifficultyChipFlagship(difficulty)
    }
}

@Composable
private fun DifficultyChipFlagship(difficulty: String) {
    val (color, label) = when (difficulty.lowercase(Locale.getDefault())) {
        "easy" -> Colors.success to "Easy"
        "moderate" -> Colors.warning to "Moderate"
        "challenging", "hard" -> Colors.accent to "Challenging"
        "extreme" -> Colors.error to "Extreme"
        else -> Colors.primary to difficulty.replaceFirstChar { it.uppercase() }
    }
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.16f), RoundedCornerShape(999.dp))
            .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(
            text = label,
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
            color = color
        )
    }
}

/* -------------------------------- STAT GRID ------------------------------- */

private data class StatTile(
    val label: String,
    val value: String,
    val iconRes: Int,
    val color: Color,
    val delta: String? = null,
)

@Composable
private fun MainStatsGridFlagship(run: RunSession, lastRunForDelta: RunSession?) {
    // Fixed 4-tile layout: Avg Pace, Avg Cadence, Elevation Gain, Max Incline
    // Duration removed — already shown in header
    val stats = remember(run, lastRunForDelta) {
        buildList {
            // Top left: Avg Pace
            add(
                StatTile(
                    "Avg Pace",
                    run.averagePace?.replace("/km", "") ?: "--:--",
                    R.drawable.icon_trending_vector,
                    Colors.accent,
                    delta = lastRunForDelta?.averagePace?.let { paceDeltaString(it, run.averagePace) }
                )
            )
            // Top right: Avg Cadence
            if (run.cadence > 0) {
                add(StatTile("Avg Cadence", "${run.cadence} spm", R.drawable.icon_repeat_vector, Colors.primary))
            } else {
                add(StatTile("Avg Cadence", "-- spm", R.drawable.icon_repeat_vector, Colors.textMuted))
            }
            // Bottom left: Elevation Gain
            if (run.totalElevationGain > 0) {
                add(StatTile("Elev Gain", "${run.totalElevationGain.roundToInt()} m", R.drawable.icon_trending_vector, Colors.success))
            } else {
                add(StatTile("Elev Gain", "0 m", R.drawable.icon_trending_vector, Colors.textMuted))
            }
            // Bottom right: Max Incline (steepest incline, converted from % to degrees: 0°=flat, 90°=vertical)
            // Fall back to maxGradient if steepestIncline is not available (older runs)
            val inclinePercent = (run.steepestIncline?.takeIf { it > 0 }) ?: (run.maxGradient.takeIf { it > 0 })
            if (inclinePercent != null && inclinePercent > 0) {
                val maxInclineDegrees = Math.toDegrees(Math.atan(inclinePercent / 100.0))
                add(StatTile("Max Incline", "${maxInclineDegrees.roundToInt()}°", R.drawable.icon_trending_vector, Colors.warning))
            } else {
                add(StatTile("Max Incline", "0°", R.drawable.icon_trending_vector, Colors.textMuted))
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        val rows = stats.chunked(2)
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                row.forEach { tile ->
                    StatCardFlagship(tile, Modifier.weight(1f))
                }
                if (row.size == 1) Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun StatCardFlagship(tile: StatTile, modifier: Modifier = Modifier) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        modifier = modifier.heightIn(min = 96.dp),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .background(tile.color.copy(alpha = 0.18f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(tile.iconRes),
                    contentDescription = null,
                    tint = tile.color,
                    modifier = Modifier.size(18.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(tile.label, style = AppTextStyles.caption, color = Colors.textMuted)
                Spacer(modifier = Modifier.height(4.dp))
                Text(tile.value, style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                if (!tile.delta.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(tile.delta, style = AppTextStyles.caption, color = Colors.textSecondary)
                }
            }
        }
    }
}

/* ---------------------------------- AI UI -------------------------------- */

@Composable
private fun AiSectionFlagship(
    analysisState: AiAnalysisState,
    comments: String,
    coachingNotes: List<AiCoachingNote> = emptyList(),
    onCommentsChange: (String) -> Unit,
    onGenerateAi: () -> Unit,
    onRetryAi: () -> Unit = {}
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.7f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        listOf(
                            Colors.backgroundSecondary,
                            Colors.backgroundSecondary.copy(alpha = 0.85f)
                        )
                    )
                )
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            when (analysisState) {
                is AiAnalysisState.Freeform -> {
                    FreeformAnalysisFlagship(
                        markdown = analysisState.markdown,
                        title = analysisState.title
                    )
                }

                is AiAnalysisState.Comprehensive -> {
                    ExpandableAiBlock(
                        title = "Comprehensive Insights",
                        badge = "FULL",
                        badgeColor = Colors.success
                    ) {
                        ComprehensiveAnalysisFlagship(analysisState.analysis)
                    }
                }

                is AiAnalysisState.Basic -> {
                    ExpandableAiBlock(
                        title = "Quick Insights",
                        badge = "BASIC",
                        badgeColor = Colors.primary
                    ) {
                        BasicAnalysisFlagship(analysisState.insights)
                    }
                }

                is AiAnalysisState.Loading -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            color = Colors.primary,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("Analyzing your run…", style = AppTextStyles.body, color = Colors.textSecondary)
                    }
                }

                is AiAnalysisState.Error -> {
                    // Show error with retry button
                    Text(
                        text = analysisState.message,
                        style = AppTextStyles.body,
                        color = Colors.error
                    )

                    PrimaryActionButtonFlagship(
                        text = "Retry AI Insights",
                        loading = false,
                        onClick = onRetryAi
                    )
                }

                AiAnalysisState.Idle -> {
                    Text(
                        text = "Get personalized insights from your AI coach about this run.",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )

                    OutlinedTextField(
                        value = comments,
                        onValueChange = onCommentsChange,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 90.dp),
                        placeholder = {
                            Text(
                                text = "Optional: add how you felt (e.g. hills felt strong, stitch at 3km)…",
                                color = Colors.textMuted
                            )
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Colors.textPrimary,
                            unfocusedTextColor = Colors.textPrimary,
                            focusedBorderColor = Colors.primary.copy(alpha = 0.6f),
                            unfocusedBorderColor = Colors.border,
                            cursorColor = Colors.primary,
                            focusedContainerColor = Colors.backgroundTertiary.copy(alpha = 0.25f),
                            unfocusedContainerColor = Colors.backgroundTertiary.copy(alpha = 0.20f),
                        ),
                        shape = RoundedCornerShape(14.dp)
                    )

                    PrimaryActionButtonFlagship(
                        text = "Generate AI Insights",
                        loading = false,
                        onClick = onGenerateAi
                    )

                    // Show Garmin enrichment button if Garmin is connected and run doesn't have Garmin data yet
                    if (isGarminConnected && run.hasGarminData != true) {
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        ElevatedButton(
                            onClick = onEnrichWithGarmin,
                            enabled = !isEnrichingWithGarmin,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.elevatedButtonColors(
                                containerColor = Colors.backgroundSecondary,
                                contentColor = Colors.textPrimary
                            )
                        ) {
                            if (isEnrichingWithGarmin) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                    color = Colors.primary
                                )
                                Spacer(modifier = Modifier.width(Spacing.sm))
                                Text("Updating with Garmin Data...")
                            } else {
                                Text("Update Run With Garmin Data")
                            }
                        }
                    }
                }
            }
        }

        // AI Coaching Logs - shown after the AI summary (excluding navigation prompts)
        if (coachingNotes.isNotEmpty()) {
            val filteredNotes = coachingNotes.filter { note ->
                // Exclude short navigation-like prompts (typically under 30 chars)
                // Navigation prompts are things like "Turn left", "Hill ahead", "Speed up"
                note.message.length >= 30 || 
                !note.message.contains("turn", ignoreCase = true) &&
                !note.message.contains("left", ignoreCase = true) &&
                !note.message.contains("right", ignoreCase = true) &&
                !note.message.contains("hill", ignoreCase = true) &&
                !note.message.contains("ahead", ignoreCase = true) &&
                !note.message.contains("speed", ignoreCase = true) &&
                !note.message.contains("slow", ignoreCase = true) &&
                !note.message.contains("meter", ignoreCase = true) &&
                !note.message.contains("metre", ignoreCase = true)
            }
            
            if (filteredNotes.isNotEmpty()) {
                Spacer(modifier = Modifier.height(Spacing.md))
                HorizontalDivider(color = Colors.border.copy(alpha = 0.4f))
                Spacer(modifier = Modifier.height(Spacing.md))
                
                Text(
                    text = "AI Coaching During Run",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                
                Spacer(modifier = Modifier.height(Spacing.sm))
                
                filteredNotes.forEach { note ->
                    val minutes = note.time / 60000
                    val seconds = (note.time % 60000) / 1000
                    val timeStr = String.format(Locale.US, "%d:%02d", minutes, seconds)
                    
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Colors.backgroundTertiary.copy(alpha = 0.4f)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Text(
                                text = timeStr,
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                color = Colors.primary
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = note.message,
                                style = AppTextStyles.body,
                                color = Colors.textPrimary
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(Spacing.sm))
                }
            }
        }
    }
}

/**
 * Freeform AI analysis — renders markdown as styled text.
 * Each run gets a unique, bespoke analysis.
 */
@Composable
private fun FreeformAnalysisFlagship(markdown: String, title: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!title.isNullOrBlank()) {
            Text(
                text = title,
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
        }

        // Parse and render markdown as styled text
        MarkdownText(markdown = markdown)
    }
}

/**
 * Simple markdown renderer — converts markdown text to styled composable text.
 * Handles: headers (## / ###), bold (**text**), bullet points (- item),
 * numbered lists, and paragraphs.
 */
@Composable
private fun MarkdownText(markdown: String) {
    val blocks = parseMarkdownBlocks(markdown)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (block in blocks) {
            when (block) {
                is MarkdownBlock.Header2 -> {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = block.text,
                        style = AppTextStyles.body.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        ),
                        color = Colors.primary
                    )
                }
                is MarkdownBlock.Header3 -> {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = block.text,
                        style = AppTextStyles.body.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        ),
                        color = Colors.textPrimary
                    )
                }
                is MarkdownBlock.BulletItem -> {
                    Row(modifier = Modifier.padding(start = 8.dp)) {
                        Text(
                            text = "\u2022 ",
                            style = AppTextStyles.body,
                            color = Colors.primary
                        )
                        Text(
                            text = parseInlineFormatting(block.text),
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
                is MarkdownBlock.NumberedItem -> {
                    Row(modifier = Modifier.padding(start = 8.dp)) {
                        Text(
                            text = "${block.number}. ",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary
                        )
                        Text(
                            text = parseInlineFormatting(block.text),
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
                is MarkdownBlock.Paragraph -> {
                    Text(
                        text = parseInlineFormatting(block.text),
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        lineHeight = 22.sp
                    )
                }
                is MarkdownBlock.Divider -> {
                    HorizontalDivider(
                        color = Colors.border.copy(alpha = 0.4f),
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }
            }
        }
    }
}

private sealed class MarkdownBlock {
    data class Header2(val text: String) : MarkdownBlock()
    data class Header3(val text: String) : MarkdownBlock()
    data class BulletItem(val text: String) : MarkdownBlock()
    data class NumberedItem(val number: Int, val text: String) : MarkdownBlock()
    data class Paragraph(val text: String) : MarkdownBlock()
    object Divider : MarkdownBlock()
}

private fun parseMarkdownBlocks(markdown: String): List<MarkdownBlock> {
    val blocks = mutableListOf<MarkdownBlock>()
    val lines = markdown.lines()
    val paragraphBuffer = StringBuilder()

    fun flushParagraph() {
        val text = paragraphBuffer.toString().trim()
        if (text.isNotEmpty()) {
            blocks.add(MarkdownBlock.Paragraph(text))
        }
        paragraphBuffer.clear()
    }

    for (line in lines) {
        val trimmed = line.trim()
        when {
            trimmed.isEmpty() -> flushParagraph()
            trimmed.startsWith("### ") -> {
                flushParagraph()
                blocks.add(MarkdownBlock.Header3(trimmed.removePrefix("### ").trim()))
            }
            trimmed.startsWith("## ") -> {
                flushParagraph()
                blocks.add(MarkdownBlock.Header2(trimmed.removePrefix("## ").trim()))
            }
            trimmed.startsWith("# ") -> {
                flushParagraph()
                blocks.add(MarkdownBlock.Header2(trimmed.removePrefix("# ").trim()))
            }
            trimmed.startsWith("---") || trimmed.startsWith("***") -> {
                flushParagraph()
                blocks.add(MarkdownBlock.Divider)
            }
            trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                flushParagraph()
                blocks.add(MarkdownBlock.BulletItem(trimmed.removePrefix("- ").removePrefix("* ").trim()))
            }
            trimmed.matches(Regex("^\\d+\\.\\s+.*")) -> {
                flushParagraph()
                val num = trimmed.substringBefore('.').toIntOrNull() ?: 1
                val text = trimmed.substringAfter('.').trim()
                blocks.add(MarkdownBlock.NumberedItem(num, text))
            }
            else -> {
                if (paragraphBuffer.isNotEmpty()) paragraphBuffer.append(" ")
                paragraphBuffer.append(trimmed)
            }
        }
    }
    flushParagraph()
    return blocks
}

/**
 * Parse inline markdown formatting (bold) into AnnotatedString.
 */
private fun parseInlineFormatting(text: String): AnnotatedString {
    return buildAnnotatedString {
        var remaining = text
        while (remaining.isNotEmpty()) {
            val boldStart = remaining.indexOf("**")
            if (boldStart == -1) {
                append(remaining)
                break
            }
            // Append text before bold
            append(remaining.substring(0, boldStart))
            remaining = remaining.substring(boldStart + 2)

            val boldEnd = remaining.indexOf("**")
            if (boldEnd == -1) {
                // No closing ** — just append the rest
                append("**")
                append(remaining)
                break
            }
            // Append bold text
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Colors.textPrimary)) {
                append(remaining.substring(0, boldEnd))
            }
            remaining = remaining.substring(boldEnd + 2)
        }
    }
}

@Composable
private fun ExpandableAiBlock(
    title: String,
    badge: String,
    badgeColor: Color,
    content: @Composable () -> Unit
) {
    var expanded by remember { mutableStateOf(true) }
    val chevronRotation by animateFloatAsState(if (expanded) 180f else 0f, label = "chev")

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .clickable { expanded = !expanded }
                .padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary,
                modifier = Modifier.weight(1f)
            )
            Box(
                modifier = Modifier
                    .background(badgeColor.copy(alpha = 0.16f), RoundedCornerShape(999.dp))
                    .border(1.dp, badgeColor.copy(alpha = 0.30f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            ) {
                Text(badge, style = AppTextStyles.caption, color = badgeColor)
            }
            Spacer(modifier = Modifier.width(8.dp))
            Icon(
                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = null,
                tint = Colors.textSecondary
            )
        }

        AnimatedVisibility(visible = expanded, enter = fadeIn(), exit = fadeOut()) {
            content()
        }
    }
}

@Composable
private fun PrimaryActionButtonFlagship(
    text: String,
    loading: Boolean,
    onClick: () -> Unit
) {
    val brush = Brush.horizontalGradient(listOf(Colors.primary, Colors.primaryDark))
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(brush)
            .clickable(enabled = !loading) { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = if (loading) "Analyzing…" else text,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                color = Colors.backgroundRoot
            )
            if (loading) {
                Spacer(modifier = Modifier.width(10.dp))
                CircularProgressIndicator(
                    color = Colors.backgroundRoot,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
private fun ComprehensiveAnalysisFlagship(analysis: ComprehensiveRunAnalysis) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PerformanceScoreCardFlagship(score = analysis.performanceScore)

        Text(
            text = analysis.summary,
            style = AppTextStyles.body,
            color = Colors.textSecondary
        )

        if (analysis.personalBests.isNotEmpty()) {
            PillHeaderFlagship("Personal Bests", Colors.warning)
            BulletListFlagship(analysis.personalBests, bulletColor = Colors.warning)
        }

        if (analysis.highlights.isNotEmpty()) {
            PillHeaderFlagship("Highlights", Colors.success)
            BulletListFlagship(analysis.highlights, bulletColor = Colors.success)
        }

        if (analysis.struggles.isNotEmpty()) {
            PillHeaderFlagship("Areas to Improve", Colors.accent)
            BulletListFlagship(analysis.struggles, bulletColor = Colors.accent)
        }

        if (analysis.improvementTips.isNotEmpty()) {
            PillHeaderFlagship("Coach Tips", Colors.primary)
            ParagraphListFlagship(analysis.improvementTips)
        }

        if (analysis.nextRunSuggestion.isNotBlank()) {
            PillHeaderFlagship("Next Run", Colors.textSecondary)
            Text(analysis.nextRunSuggestion, style = AppTextStyles.body, color = Colors.textSecondary)
        }

        if (analysis.trainingLoadAssessment.isNotBlank()) {
            SectionCardFlagship("Training Load", analysis.trainingLoadAssessment, tag = null)
        }
        if (analysis.recoveryAdvice.isNotBlank()) {
            SectionCardFlagship("Recovery", analysis.recoveryAdvice, tag = null)
        }
        if (analysis.wellnessImpact.isNotBlank()) {
            SectionCardFlagship("Wellness Impact", analysis.wellnessImpact, tag = "GARMIN")
        }

        TechnicalAnalysisCardsFlagship(analysis.technicalAnalysis)
        analysis.garminInsights?.let { GarminInsightsCardsFlagship(it) }
    }
}

@Composable
private fun BasicAnalysisFlagship(insights: BasicRunInsights) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PerformanceScoreCardFlagship(score = (insights.overallScore * 10).coerceIn(0, 100))
        Text(insights.summary, style = AppTextStyles.body, color = Colors.textSecondary)

        if (insights.highlights.isNotEmpty()) {
            PillHeaderFlagship("Highlights", Colors.success)
            BulletListFlagship(insights.highlights, bulletColor = Colors.success)
        }
        if (insights.struggles.isNotEmpty()) {
            PillHeaderFlagship("Areas to Improve", Colors.accent)
            BulletListFlagship(insights.struggles, bulletColor = Colors.accent)
        }
        if (insights.tips.isNotEmpty()) {
            PillHeaderFlagship("Coach Tips", Colors.primary)
            ParagraphListFlagship(insights.tips)
        }
    }
}

@Composable
private fun PerformanceScoreCardFlagship(score: Int) {
    val effort = effortLabelFromScore(score)
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(62.dp)
                    .background(Colors.success.copy(alpha = 0.18f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = score.toString(),
                    style = AppTextStyles.h3.copy(fontWeight = FontWeight.ExtraBold),
                    color = Colors.success
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text("Performance Score", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                Text(effort, style = AppTextStyles.caption, color = Colors.textMuted)
            }
        }
    }
}

@Composable
private fun PillHeaderFlagship(text: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .background(color.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
                .border(1.dp, color.copy(alpha = 0.28f), RoundedCornerShape(999.dp))
                .padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Text(text, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = color)
        }
    }
}

@Composable
private fun BulletListFlagship(items: List<String>, bulletColor: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach { line ->
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .size(6.dp)
                        .background(bulletColor, CircleShape)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(line, style = AppTextStyles.body, color = Colors.textSecondary, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ParagraphListFlagship(items: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { p ->
            Text(p, style = AppTextStyles.body, color = Colors.textSecondary, lineHeight = 22.sp)
        }
    }
}

@Composable
private fun SectionCardFlagship(title: String, body: String, tag: String?) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                if (tag != null) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(Colors.primary.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(tag, style = AppTextStyles.caption, color = Colors.primary)
                    }
                }
            }
            Text(body, style = AppTextStyles.body, color = Colors.textSecondary)
        }
    }
}

@Composable
private fun TechnicalAnalysisCardsFlagship(analysis: TechnicalAnalysis) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Technical Analysis", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)

        LabeledAnalysisCardFlagship("Pace", analysis.paceAnalysis, Colors.primary)
        LabeledAnalysisCardFlagship("Heart Rate", analysis.heartRateAnalysis, Colors.error)
        LabeledAnalysisCardFlagship("Cadence", analysis.cadenceAnalysis, Colors.warning)
        LabeledAnalysisCardFlagship("Running Dynamics", analysis.runningDynamics, Colors.accent)
        LabeledAnalysisCardFlagship("Elevation", analysis.elevationPerformance, Colors.success)
    }
}

@Composable
private fun GarminInsightsCardsFlagship(analysis: GarminInsights) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Garmin Insights", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .background(Colors.primary.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            ) {
                Text("FROM DEVICE", style = AppTextStyles.caption, color = Colors.primary)
            }
        }

        LabeledAnalysisCardFlagship("Training Effect", analysis.trainingEffect, Colors.primary, iconRes = R.drawable.icon_trending_vector)
        LabeledAnalysisCardFlagship("VO2 Max", analysis.vo2MaxTrend, Colors.success, iconRes = R.drawable.icon_trending_vector)
        LabeledAnalysisCardFlagship("Recovery Time", analysis.recoveryTime, Colors.warning, iconRes = R.drawable.icon_clock_vector)
    }
}

@Composable
private fun LabeledAnalysisCardFlagship(label: String, body: String, labelColor: Color, iconRes: Int? = null) {
    if (body.isBlank()) return
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (iconRes != null) {
                    Icon(
                        painter = painterResource(iconRes),
                        contentDescription = null,
                        tint = labelColor,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(label, style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = labelColor)
            }
            Text(body, style = AppTextStyles.small, color = Colors.textSecondary)
        }
    }
}

/* -------------------------------- MAP + ROUTE ------------------------------ */

/**
 * A colored polyline segment: two consecutive points with an assigned pace color.
 */
private data class PaceSegment(
    val start: LatLng,
    val end: LatLng,
    val color: Color,
    val paceSecPerKm: Double
)

/**
 * Maps a pace (sec/km) to a color on a green→yellow→orange→red gradient.
 * [fastPace] = fastest pace (green), [slowPace] = slowest pace (red).
 * Clamps values outside this range to the endpoints.
 */
private fun paceToColor(paceSecPerKm: Double, fastPace: Double, slowPace: Double): Color {
    if (fastPace >= slowPace) return Color(0xFF4CAF50) // all same pace → green
    val ratio = ((paceSecPerKm - fastPace) / (slowPace - fastPace)).coerceIn(0.0, 1.0)
    // Green → Yellow → Orange → Red
    return when {
        ratio < 0.33 -> {
            val t = (ratio / 0.33).toFloat()
            Color(
                red = lerp(0.30f, 1.0f, t),
                green = lerp(0.69f, 0.84f, t),
                blue = lerp(0.31f, 0.0f, t),
                alpha = 1f
            )
        }
        ratio < 0.66 -> {
            val t = ((ratio - 0.33) / 0.33).toFloat()
            Color(
                red = 1.0f,
                green = lerp(0.84f, 0.55f, t),
                blue = 0.0f,
                alpha = 1f
            )
        }
        else -> {
            val t = ((ratio - 0.66) / 0.34).toFloat()
            Color(
                red = lerp(1.0f, 0.90f, t),
                green = lerp(0.55f, 0.22f, t),
                blue = lerp(0.0f, 0.15f, t),
                alpha = 1f
            )
        }
    }
}

private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t

/**
 * Builds pace-colored segments from route points.
 * Groups GPS points into ~50m micro-segments and computes pace for each.
 * Returns the segments + the min/max pace for the legend.
 */
private fun buildPaceSegments(
    points: List<LocationPoint>
): Triple<List<PaceSegment>, Double, Double> {
    if (points.size < 2) return Triple(emptyList(), 0.0, 0.0)

    // First pass: compute raw pace for each consecutive pair, accumulate into ~50m buckets
    data class Bucket(
        val startIdx: Int,
        val endIdx: Int,
        val distanceM: Double,
        val durationSec: Double
    )

    val buckets = mutableListOf<Bucket>()
    var bucketStartIdx = 0
    var bucketDist = 0.0
    var bucketTime = 0.0
    val BUCKET_SIZE_M = 50.0

    for (i in 1 until points.size) {
        val prev = points[i - 1]
        val curr = points[i]
        val dtSec = (curr.timestamp - prev.timestamp) / 1000.0
        if (dtSec <= 0) continue

        val d = haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
        if (d < 0.5) continue

        bucketDist += d
        bucketTime += dtSec

        if (bucketDist >= BUCKET_SIZE_M) {
            buckets.add(Bucket(bucketStartIdx, i, bucketDist, bucketTime))
            bucketStartIdx = i
            bucketDist = 0.0
            bucketTime = 0.0
        }
    }
    // Add final partial bucket
    if (bucketDist > 5.0 && bucketTime > 0) {
        buckets.add(Bucket(bucketStartIdx, points.lastIndex, bucketDist, bucketTime))
    }

    if (buckets.isEmpty()) return Triple(emptyList(), 0.0, 0.0)

    // Calculate pace (sec/km) for each bucket
    val bucketPaces = buckets.map { b ->
        val speed = b.distanceM / b.durationSec // m/s
        if (speed > 0.3) 1000.0 / speed else 1200.0 // cap at 20:00/km for stopped periods
    }

    // Use percentiles to define the color range (ignore extreme outliers)
    val sortedPaces = bucketPaces.sorted()
    val p5 = sortedPaces[(sortedPaces.size * 0.05).toInt().coerceIn(0, sortedPaces.lastIndex)]
    val p95 = sortedPaces[(sortedPaces.size * 0.95).toInt().coerceIn(0, sortedPaces.lastIndex)]
    val fastPace = p5.coerceAtLeast(120.0)  // minimum 2:00/km to avoid noise
    val slowPace = p95.coerceAtMost(1200.0) // maximum 20:00/km

    // Build colored segments
    val segments = mutableListOf<PaceSegment>()
    buckets.forEachIndexed { idx, bucket ->
        val pace = bucketPaces[idx]
        val color = paceToColor(pace, fastPace, slowPace)
        // Draw a polyline from bucket start to bucket end through all intermediate points
        for (j in bucket.startIdx until bucket.endIdx) {
            val p1 = points[j]
            val p2 = points[j + 1]
            segments.add(
                PaceSegment(
                    start = LatLng(p1.latitude, p1.longitude),
                    end = LatLng(p2.latitude, p2.longitude),
                    color = color,
                    paceSecPerKm = pace
                )
            )
        }
    }

    return Triple(segments, fastPace, slowPace)
}

@Composable
private fun RouteMapCardFlagship(
    points: List<LocationPoint>,
    strugglePoints: List<StrugglePoint> = emptyList(),
    coachingNotes: List<AiCoachingNote> = emptyList()
) {
    val valid = remember(points) {
        points.filter { p ->
            p.latitude in -90.0..90.0 &&
                    p.longitude in -180.0..180.0 &&
                    !(p.latitude == 0.0 && p.longitude == 0.0)
        }
    }
    if (valid.size < 2) return

    val (paceSegments, fastPace, slowPace) = remember(valid) { buildPaceSegments(valid) }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(24.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(320.dp),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            val latLng = remember(valid) { valid.map { LatLng(it.latitude, it.longitude) } }
            val cameraState = rememberCameraPositionState {
                position = CameraPosition.fromLatLngZoom(latLng.first(), 14f)
            }

            LaunchedEffect(latLng) {
                val builder = LatLngBounds.builder()
                latLng.forEach { builder.include(it) }
                val bounds = builder.build()
                cameraState.move(CameraUpdateFactory.newLatLngBounds(bounds, 80))
            }

            GoogleMap(
                modifier = Modifier.fillMaxSize(),
                cameraPositionState = cameraState,
                properties = MapProperties(isMyLocationEnabled = false),
                uiSettings = MapUiSettings(
                    zoomControlsEnabled = true,
                    myLocationButtonEnabled = false,
                    compassEnabled = true,
                    mapToolbarEnabled = false,
                    scrollGesturesEnabled = true,
                    zoomGesturesEnabled = true,
                    tiltGesturesEnabled = false,
                    rotationGesturesEnabled = false,
                )
            ) {
                // Draw pace-colored polyline segments
                if (paceSegments.isNotEmpty()) {
                    // Group consecutive segments with the same color to reduce draw calls
                    var currentColor = paceSegments.first().color
                    var currentPoints = mutableListOf(paceSegments.first().start)

                    for (seg in paceSegments) {
                        if (seg.color == currentColor) {
                            currentPoints.add(seg.end)
                        } else {
                            // Flush the current batch
                            if (currentPoints.size >= 2) {
                                Polyline(
                                    points = currentPoints.toList(),
                                    color = currentColor,
                                    width = 8f
                                )
                            }
                            currentColor = seg.color
                            currentPoints = mutableListOf(seg.start, seg.end)
                        }
                    }
                    // Flush last batch
                    if (currentPoints.size >= 2) {
                        Polyline(
                            points = currentPoints.toList(),
                            color = currentColor,
                            width = 8f
                        )
                    }
                } else {
                    // Fallback: single-color polyline if pace segments couldn't be built
                    Polyline(points = latLng, color = Colors.primary, width = 6f)
                }

                Marker(
                    state = MarkerState(position = latLng.first()),
                    title = "Start",
                    icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_GREEN)
                )

                Marker(
                    state = MarkerState(position = latLng.last()),
                    title = "Finish",
                    icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_RED)
                )

                // Struggle point markers
                strugglePoints.forEach { sp ->
                    sp.location?.let { loc ->
                        if (loc.latitude != 0.0 && loc.longitude != 0.0) {
                            Marker(
                                state = MarkerState(
                                    position = LatLng(loc.latitude, loc.longitude)
                                ),
                                title = "Struggle (${String.format(Locale.US, "%.1f", sp.distanceMeters / 1000.0)} km)",
                                snippet = "Pace drop: ${String.format(Locale.US, "%.0f", sp.paceDropPercent)}%",
                                icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_ORANGE)
                            )
                        }
                    }
                }
            }

            // Pace legend overlay (bottom-left)
            if (paceSegments.isNotEmpty() && fastPace < slowPace) {
                PaceLegend(
                    fastPace = fastPace,
                    slowPace = slowPace,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(8.dp)
                )
            }

            // Reset view button (top-right) — resets camera to show full route
            val coroutineScope = rememberCoroutineScope()
            val bounds = remember(latLng) {
                LatLngBounds.builder().apply { latLng.forEach { include(it) } }.build()
            }

            Surface(
                onClick = {
                    coroutineScope.launch {
                        cameraState.animate(CameraUpdateFactory.newLatLngBounds(bounds, 80), 500)
                    }
                },
                shape = RoundedCornerShape(8.dp),
                color = Color.Black.copy(alpha = 0.65f),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .size(36.dp)
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "Reset map view",
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun PaceLegend(fastPace: Double, slowPace: Double, modifier: Modifier = Modifier) {
    val legendColors = remember(fastPace, slowPace) {
        // Build 5 color stops across the range
        (0..4).map { i ->
            val ratio = i / 4.0
            val pace = fastPace + ratio * (slowPace - fastPace)
            paceToColor(pace, fastPace, slowPace)
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Color.Black.copy(alpha = 0.7f)),
        shape = RoundedCornerShape(8.dp),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
            Text(
                "Pace",
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                color = Color.White
            )
            Spacer(Modifier.height(3.dp))
            // Gradient bar
            Box(
                modifier = Modifier
                    .width(80.dp)
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(
                        Brush.horizontalGradient(legendColors)
                    )
            )
            Spacer(Modifier.height(2.dp))
            // Labels
            Row(
                modifier = Modifier.width(80.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    formatPaceMinSec(fastPace),
                    style = AppTextStyles.caption.copy(fontSize = 9.sp),
                    color = Color.White.copy(alpha = 0.9f)
                )
                Text(
                    formatPaceMinSec(slowPace),
                    style = AppTextStyles.caption.copy(fontSize = 9.sp),
                    color = Color.White.copy(alpha = 0.9f)
                )
            }
        }
    }
}

/** Formats pace in sec/km to "M:SS" */
private fun formatPaceMinSec(paceSecPerKm: Double): String {
    val totalSec = paceSecPerKm.roundToInt().coerceIn(0, 5999)
    val min = totalSec / 60
    val sec = totalSec % 60
    return "$min:${sec.toString().padStart(2, '0')}"
}
/* --------------------------------- CHARTS (Pure Compose Canvas) -------------------------------- */

/* --------------------------------- TYPES -------------------------------- */

private enum class ChartMode { Time, Distance }

private data class LabeledSeries(
    val x: List<Double>,        // normalized x domain (we’ll use index-based layout anyway)
    val y: List<Double>,
    val labels: List<String>
)

/* --------------------------------- SECTION -------------------------------- */

@Composable
private fun ChartsSectionFlagship(run: RunSession) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Text(
            text = "Charts",
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )

        var mode by remember { mutableStateOf(ChartMode.Time) }
        ChartModeToggleFlagship(mode = mode, onMode = { mode = it })

        val paceSeries = remember(run.routePoints, run.kmSplits, mode) {
            buildPaceSeries(run.routePoints, run.kmSplits, mode)
        }

        if (paceSeries.y.size >= 2) {
            LineChartCardFlagship(
                title = "Pace",
                subtitleLeft = "Avg: ${run.averagePace ?: "—"}",
                subtitleRight = "Best: ${getBestPace(run.kmSplits)}",
                accent = Colors.primary
            ) {
                RunLineChartCanvas(
                    series = paceSeries,
                    lineColor = Colors.primary,
                    xTitle = if (mode == ChartMode.Time) "Time (min)" else "Distance (km)",
                    yFormatter = { secondsPerKm -> formatPaceSeconds(secondsPerKm.toLong()) },
                    yUnitHint = "min/km",
                    invertY = true  // Fastest pace (lower number) at top
                )
            }
        }

        val elevationSeries = remember(run.routePoints, mode) {
            buildElevationSeries(run.routePoints, mode)
        }

        if (elevationSeries.y.size >= 2) {
            val minAlt = elevationSeries.y.minOrNull() ?: 0.0
            val maxAlt = elevationSeries.y.maxOrNull() ?: 0.0
            if (maxAlt - minAlt >= 0.5) {
                LineChartCardFlagship(
                    title = "Elevation",
                    subtitleLeft = "Gain: ${run.totalElevationGain.roundToInt()} m",
                    subtitleRight = "Max: ${maxAlt.roundToInt()} m",
                    accent = Colors.success
                ) {
                    RunLineChartCanvas(
                        series = elevationSeries,
                        lineColor = Colors.success,
                        xTitle = if (mode == ChartMode.Time) "Time (min)" else "Distance (km)",
                        yFormatter = { v -> String.format(java.util.Locale.US, "%.0f", v) },
                        yUnitHint = "m"
                    )
                }
            }
        }

        // Heart Rate Chart
        val hrSeries = remember(run.routePoints, run.heartRateData, mode) {
            buildHeartRateSeries(run.routePoints, run.heartRateData, mode)
        }

        if (hrSeries.y.size >= 2) {
            val avgHr = hrSeries.y.average().roundToInt()
            val maxHr = hrSeries.y.maxOrNull()?.roundToInt() ?: 0
            LineChartCardFlagship(
                title = "Heart Rate",
                subtitleLeft = "Avg: $avgHr bpm",
                subtitleRight = "Max: $maxHr bpm",
                accent = Colors.error
            ) {
                RunLineChartCanvas(
                    series = hrSeries,
                    lineColor = Colors.error,
                    xTitle = if (mode == ChartMode.Time) "Time (min)" else "Distance (km)",
                    yFormatter = { v -> "${v.roundToInt()}" },
                    yUnitHint = "bpm"
                )
            }
        }

        // Cadence Chart
        val cadenceSeries = remember(run.routePoints, mode) {
            buildCadenceSeries(run.routePoints, mode)
        }

        if (cadenceSeries.y.size >= 2) {
            val avgCad = cadenceSeries.y.average().roundToInt()
            val maxCad = cadenceSeries.y.maxOrNull()?.roundToInt() ?: 0
            LineChartCardFlagship(
                title = "Cadence",
                subtitleLeft = "Avg: $avgCad spm",
                subtitleRight = "Max: $maxCad spm",
                accent = Color(0xFF9C27B0)
            ) {
                RunLineChartCanvas(
                    series = cadenceSeries,
                    lineColor = Color(0xFF9C27B0),
                    xTitle = if (mode == ChartMode.Time) "Time (min)" else "Distance (km)",
                    yFormatter = { v -> "${v.roundToInt()}" },
                    yUnitHint = "spm"
                )
            }
        }

        // ===== PACE vs ELEVATION (dual-axis overlay) =====
        val paceElevData = remember(run.routePoints, run.kmSplits) {
            buildPaceElevationDualSeries(run.routePoints, run.kmSplits)
        }

        if (paceElevData.paceY.size >= 2 && paceElevData.elevY.size >= 2) {
            LineChartCardFlagship(
                title = "Pace vs Elevation",
                subtitleLeft = "Pace: ${run.averagePace ?: "—"}",
                subtitleRight = "Gain: ${run.totalElevationGain.roundToInt()} m",
                accent = Colors.primary
            ) {
                DualAxisChartCanvas(
                    primaryY = paceElevData.paceY,
                    secondaryY = paceElevData.elevY,
                    labels = paceElevData.labels,
                    primaryColor = Colors.primary,
                    secondaryColor = Colors.success,
                    primaryLabel = "Pace",
                    secondaryLabel = "Elevation",
                    xTitle = "Distance (km)",
                    primaryFormatter = { v -> formatPaceSeconds(v.toLong()) },
                    secondaryFormatter = { v -> String.format(java.util.Locale.US, "%.0f", v) },
                    fillSecondary = true,
                    invertPrimary = true   // Faster pace (lower number) at top
                )
            }
        }

        // ===== CADENCE vs ELEVATION (dual-axis overlay) =====
        val cadElevData = remember(run.routePoints) {
            buildCadenceElevationDualSeries(run.routePoints)
        }

        if (cadElevData.paceY.size >= 2 && cadElevData.elevY.size >= 2) {
            val avgCadElev = cadElevData.paceY.average().roundToInt()
            LineChartCardFlagship(
                title = "Cadence vs Elevation",
                subtitleLeft = "Avg: $avgCadElev spm",
                subtitleRight = "Gain: ${run.totalElevationGain.roundToInt()} m",
                accent = Color(0xFF8B5CF6)
            ) {
                DualAxisChartCanvas(
                    primaryY = cadElevData.paceY,
                    secondaryY = cadElevData.elevY,
                    labels = cadElevData.labels,
                    primaryColor = Color(0xFF8B5CF6),
                    secondaryColor = Colors.success,
                    primaryLabel = "spm",
                    secondaryLabel = "m",
                    xTitle = "Distance (km)",
                    primaryFormatter = { v -> "${v.roundToInt()}" },
                    secondaryFormatter = { v -> String.format(java.util.Locale.US, "%.0f", v) },
                    fillSecondary = true
                )
            }
        }
    }
}

/* --------------------------------- TOGGLE -------------------------------- */

@Composable
private fun ChartModeToggleFlagship(mode: ChartMode, onMode: (ChartMode) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center
    ) {
        TogglePillFlagship("Time", selected = mode == ChartMode.Time) { onMode(ChartMode.Time) }
        Spacer(modifier = Modifier.width(Spacing.md))
        TogglePillFlagship("Distance", selected = mode == ChartMode.Distance) { onMode(ChartMode.Distance) }
    }
}

@Composable
private fun TogglePillFlagship(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) Colors.primary else Color.Transparent)
            .border(
                width = 1.dp,
                color = if (selected) Color.Transparent else Colors.textPrimary.copy(alpha = 0.25f),
                shape = RoundedCornerShape(12.dp)
            )
            .clickable { onClick() }
            .padding(horizontal = 18.dp, vertical = 10.dp)
    ) {
        Text(
            text = text,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = if (selected) Colors.backgroundRoot else Colors.textPrimary
        )
    }
}

/* --------------------------------- CARD -------------------------------- */

@Composable
private fun LineChartCardFlagship(
    title: String,
    subtitleLeft: String,
    subtitleRight: String,
    accent: Color,
    content: @Composable () -> Unit
) {
    var showFullscreen by remember { mutableStateOf(false) }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        title,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                        Text(subtitleLeft, style = AppTextStyles.caption, color = Colors.textSecondary)
                        Text(subtitleRight, style = AppTextStyles.caption, color = Colors.textSecondary)
                    }
                }
                // Expand button
                IconButton(
                    onClick = { showFullscreen = true },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_expand_vector),
                        contentDescription = "Expand chart",
                        tint = Colors.textMuted,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            content()
        }
    }

    // Fullscreen chart dialog
    if (showFullscreen) {
        FullscreenChartDialog(
            title = title,
            subtitleLeft = subtitleLeft,
            subtitleRight = subtitleRight,
            accent = accent,
            onDismiss = { showFullscreen = false },
            content = content
        )
    }
}

/**
 * Fullscreen dialog that shows a chart at maximum size.
 * Works in both portrait and landscape. The chart fills all available space.
 */
@Composable
private fun FullscreenChartDialog(
    title: String,
    subtitleLeft: String,
    subtitleRight: String,
    accent: Color,
    onDismiss: () -> Unit,
    content: @Composable () -> Unit
) {
    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundRoot)
                .systemBarsPadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                // Header row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            title,
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                            color = Colors.textPrimary
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                            Text(subtitleLeft, style = AppTextStyles.body, color = Colors.textSecondary)
                            Text(subtitleRight, style = AppTextStyles.body, color = Colors.textSecondary)
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_x_vector),
                            contentDescription = "Close",
                            tint = Colors.textPrimary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Chart fills remaining space — provide via LocalFullscreenChart
                CompositionLocalProvider(LocalFullscreenChart provides true) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(12.dp))
                    ) {
                        content()
                    }
                }
            }
        }
    }
}

/* --------------------------------- CANVAS CHART -------------------------------- */

@Composable
private fun RunLineChartCanvas(
    series: LabeledSeries,
    lineColor: Color,
    xTitle: String,
    yFormatter: (Double) -> String,
    yUnitHint: String,
    invertY: Boolean = false,  // When true, lower Y values at top (for pace: faster = top)
    modifier: Modifier = Modifier,
    height: Dp = 220.dp
) {
    val isFullscreen = LocalFullscreenChart.current
    if (series.y.size < 2) {
        Text("Not enough data to chart.", style = AppTextStyles.caption, color = Colors.textMuted)
        return
    }

    // animate whenever the dataset changes (size change is a good trigger)
    val animProgress by animateFloatAsState(
        targetValue = series.y.size.toFloat(),
        animationSpec = tween(durationMillis = 900, easing = FastOutSlowInEasing),
        label = "chartProgress"
    )
    val reveal = (animProgress / series.y.size.toFloat()).coerceIn(0f, 1f)

    val bgBrush = Brush.verticalGradient(
        colors = listOf(
            lineColor.copy(alpha = 0.12f),
            Colors.backgroundRoot.copy(alpha = 0.0f)
        )
    )

    // Chart container
    Box(
        modifier = modifier
            .fillMaxWidth()
            .then(if (isFullscreen) Modifier.fillMaxHeight() else Modifier.height(height))
            .clip(RoundedCornerShape(16.dp))
            .background(bgBrush)
            .border(1.dp, Colors.border.copy(alpha = 0.45f), RoundedCornerShape(16.dp))
            .padding(12.dp)
    ) {
        // Draw
        androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
            val n = series.y.size
            if (n < 2) return@Canvas

            val yVals = series.y

            // Use actual min/max values to ensure ALL data points fit on the chart
            // (Previously used 5th/95th percentile which clipped the actual extremes)
            val actualMin = yVals.minOrNull() ?: 0.0
            val actualMax = yVals.maxOrNull() ?: 1.0
            val dataRange = (actualMax - actualMin).coerceAtLeast(1.0)

            // For pace (invertY): slow pace is maxY. Add 25% of slowest pace value as padding
            // so consistent runs don't look erratic. For other charts use a 15% range buffer.
            val axisMinY: Double
            val axisMaxY: Double
            if (invertY) {
                // Pace: faster (lower num) at top, slower (higher num) at bottom
                // Fast end: small 2% of value buffer so the line doesn't hug the top
                axisMinY = actualMin * 0.98
                // Slow end: 15% padding above actual max so all data points fit
                axisMaxY = actualMax + (dataRange * 0.15)
            } else {
                // Other metrics: 15% padding on both sides
                val buf = dataRange * 0.15
                axisMinY = actualMin - buf
                axisMaxY = actualMax + buf
            }

            val minY = axisMinY
            val maxY = axisMaxY
            val rangeY = (maxY - minY).takeIf { it > 1e-9 } ?: 1.0

            // padding inside the canvas for axis labels
            val leftPadPx = 46.dp.toPx()
            val bottomPadPx = 40.dp.toPx()  // Increased to make room for axis title below values
            val topPadPx = 8.dp.toPx()
            val rightPadPx = 8.dp.toPx()

            val w = size.width
            val h = size.height

            val plotW = (w - leftPadPx - rightPadPx).coerceAtLeast(1f)
            val plotH = (h - topPadPx - bottomPadPx).coerceAtLeast(1f)

            fun xFor(i: Int): Float {
                return leftPadPx + (i.toFloat() / (n - 1).toFloat()) * plotW
            }

            fun yFor(v: Double): Float {
                val t = ((v - minY) / rangeY).toFloat() // 0..1
                // When inverted: lower values (e.g. faster pace) at top, higher values at bottom
                return if (invertY) topPadPx + t * plotH
                else topPadPx + (1f - t) * plotH
            }

            // --- gridlines + y labels (3 ticks) ---
            val gridPaint = Paint().apply {
                color = Colors.border.copy(alpha = 0.25f)
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f)
            }

            val ticks = 3
            for (i in 0..ticks) {
                val t = i / ticks.toFloat()
                val y = topPadPx + t * plotH
                drawLine(
                    color = Colors.border.copy(alpha = 0.22f),
                    start = Offset(leftPadPx, y),
                    end = Offset(leftPadPx + plotW, y),
                    strokeWidth = 1.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f)
                )

                // When inverted: top = minY (fastest), bottom = maxY (slowest)
                val value = if (invertY) minY + (t.toDouble() * rangeY)
                            else maxY - (t.toDouble() * rangeY)
                drawContext.canvas.nativeCanvas.apply {
                    val text = yFormatter(value)
                    val p = android.graphics.Paint().apply {
                        isAntiAlias = true
                        color = Colors.textMuted.copy(alpha = 0.9f).toArgb()
                        textSize = 11.sp.toPx()
                        textAlign = android.graphics.Paint.Align.RIGHT
                    }
                    drawText(text, leftPadPx - 8.dp.toPx(), y + 4.dp.toPx(), p)
                }
            }

            // --- line points (limited by reveal) ---
            val lastIndexToDraw = ((n - 1) * reveal).roundToInt().coerceIn(1, n - 1)

            val points = ArrayList<Offset>(lastIndexToDraw + 1)
            for (i in 0..lastIndexToDraw) {
                points.add(Offset(xFor(i), yFor(yVals[i])))
            }

            // Smooth curve path
            val linePath = buildSmoothPath(points)

            // Area fill path (close to baseline)
            val fillPath = Path().apply {
                addPath(linePath)
                lineTo(points.last().x, topPadPx + plotH)
                lineTo(points.first().x, topPadPx + plotH)
                close()
            }

            // Fill gradient — solid Garmin-style fill
            drawPath(
                path = fillPath,
                brush = Brush.verticalGradient(
                    colors = listOf(
                        lineColor.copy(alpha = 0.55f),
                        lineColor.copy(alpha = 0.35f),
                        lineColor.copy(alpha = 0.10f)
                    ),
                    startY = topPadPx,
                    endY = topPadPx + plotH
                )
            )

            // Stroke line
            drawPath(
                path = linePath,
                color = lineColor,
                style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            )

            // End dot
            val end = points.last()
            drawCircle(color = lineColor, radius = 4.dp.toPx(), center = end)
            drawCircle(color = Colors.backgroundRoot, radius = 2.dp.toPx(), center = end)

            // --- x labels (evenly spaced across the ACTUAL axis values, not data indices) ---
            // Show 4-5 evenly spaced labels using the real label values (km or minutes)
            val numXLabels = if (n > 10) 5 else 3
            val xLabelIndices = (0 until numXLabels).map { tick ->
                ((tick.toFloat() / (numXLabels - 1).toFloat()) * (n - 1)).roundToInt().coerceIn(0, n - 1)
            }.distinct()
            xLabelIndices.forEach { idx ->
                val label = series.labels.getOrNull(idx) ?: idx.toString()
                val x = xFor(idx)
                drawContext.canvas.nativeCanvas.apply {
                    val p = android.graphics.Paint().apply {
                        isAntiAlias = true
                        color = Colors.textMuted.copy(alpha = 0.9f).toArgb()
                        textSize = 11.sp.toPx()
                        textAlign = android.graphics.Paint.Align.CENTER
                    }
                    drawText(label, x, topPadPx + plotH + 14.dp.toPx(), p)
                }
            }

            // y unit hint (top-left)
            drawContext.canvas.nativeCanvas.apply {
                val p = android.graphics.Paint().apply {
                    isAntiAlias = true
                    color = Colors.textMuted.copy(alpha = 0.85f).toArgb()
                    textSize = 11.sp.toPx()
                    textAlign = android.graphics.Paint.Align.LEFT
                }
                drawText(yUnitHint, leftPadPx, 12.dp.toPx(), p)
            }

            // x title (bottom-right, below axis values)
            drawContext.canvas.nativeCanvas.apply {
                val p = android.graphics.Paint().apply {
                    isAntiAlias = true
                    color = Colors.textMuted.copy(alpha = 0.85f).toArgb()
                    textSize = 11.sp.toPx()
                    textAlign = android.graphics.Paint.Align.RIGHT
                }
                drawText(xTitle, leftPadPx + plotW, topPadPx + plotH + 30.dp.toPx(), p)
            }
        }
    }
}

/* --------------------------------- SMOOTH PATH -------------------------------- */

/**
 * Catmull-Rom-like smoothing converted to cubic Beziers.
 * Produces a clean “Strava style” smooth curve without external libs.
 */
private fun buildSmoothPath(points: List<Offset>): Path {
    val path = Path()
    if (points.isEmpty()) return path
    if (points.size == 1) {
        path.moveTo(points[0].x, points[0].y)
        return path
    }

    path.moveTo(points[0].x, points[0].y)

    for (i in 0 until points.size - 1) {
        val p0 = points.getOrNull(i - 1) ?: points[i]
        val p1 = points[i]
        val p2 = points[i + 1]
        val p3 = points.getOrNull(i + 2) ?: p2

        val c1 = Offset(
            x = p1.x + (p2.x - p0.x) / 6f,
            y = p1.y + (p2.y - p0.y) / 6f
        )
        val c2 = Offset(
            x = p2.x - (p3.x - p1.x) / 6f,
            y = p2.y - (p3.y - p1.y) / 6f
        )

        path.cubicTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y)
    }

    return path
}

/* ------------------------- SERIES BUILDERS (PACE/ELEV) ---------------------- */

private fun buildPaceSeries(
    routePoints: List<LocationPoint>,
    kmSplits: List<KmSplit>,
    mode: ChartMode
): LabeledSeries {
    val fromRoute = paceFromRoute(routePoints, mode)
    if (fromRoute.y.size >= 2) return fromRoute
    return paceFromSplits(kmSplits, mode)
}

private fun paceFromRoute(points: List<LocationPoint>, mode: ChartMode): LabeledSeries {
    if (points.size < 2) return LabeledSeries(emptyList(), emptyList(), emptyList())
    val valid = points.filter { it.latitude != 0.0 && it.longitude != 0.0 }
    if (valid.size < 2) return LabeledSeries(emptyList(), emptyList(), emptyList())

    // Pre-compute cumulative distance for ALL points so stepping doesn't lose distance
    val cumulativeDist = DoubleArray(valid.size)
    for (j in 1 until valid.size) {
        cumulativeDist[j] = cumulativeDist[j - 1] +
                haversineMeters(valid[j - 1].latitude, valid[j - 1].longitude,
                    valid[j].latitude, valid[j].longitude)
    }

    val xOut = mutableListOf<Double>()
    val yOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()

    val startTs = valid.first().timestamp
    // Use ~200 data points max for a clean chart
    val step = (valid.size / 200f).coerceAtLeast(1f).toInt()

    var i = step
    while (i < valid.size) {
        val prevIdx = i - step
        val prev = valid[prevIdx]
        val curr = valid[i]

        val dtSec = (curr.timestamp - prev.timestamp) / 1000.0
        if (dtSec <= 0) { i += step; continue }

        val d = cumulativeDist[i] - cumulativeDist[prevIdx]
        if (d < 1.0) { i += step; continue }

        val speed = d / dtSec
        if (speed <= 0) { i += step; continue }

        val paceSecPerKm = (1000.0 / speed)

        // Clamp outliers: ignore pace outside 2:00–15:00 min/km range (GPS spike protection)
        val clampedPace = paceSecPerKm.coerceIn(120.0, 900.0)

        val xLabel = if (mode == ChartMode.Time) {
            val minutes = ((curr.timestamp - startTs) / 1000.0 / 60.0)
            String.format(java.util.Locale.US, "%.0f", minutes)
        } else {
            val km = cumulativeDist[i] / 1000.0
            String.format(java.util.Locale.US, "%.1f", km)
        }

        xOut.add(xOut.size.toDouble())
        yOut.add(clampedPace)
        labels.add(xLabel)

        i += step
    }

    // Median-filter to remove remaining GPS spikes, then smooth with a wider window
    val medianFiltered = medianFilter(yOut, window = 5)
    val smoothedY = smoothY(medianFiltered, window = 15)
    return LabeledSeries(
        x = xOut,
        y = smoothedY,
        labels = labels.ifEmpty { List(smoothedY.size) { it.toString() } }
    )
}

private fun paceFromSplits(kmSplits: List<KmSplit>, mode: ChartMode): LabeledSeries {
    if (kmSplits.size < 2) return LabeledSeries(emptyList(), emptyList(), emptyList())

    val xOut = mutableListOf<Double>()
    val yOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()
    var cumulativeSec = 0.0

    kmSplits.forEachIndexed { idx, split ->
        val sec = (split.time / 1000.0).coerceAtLeast(1.0)
        cumulativeSec += sec

        val label = if (mode == ChartMode.Time) {
            val minutes = cumulativeSec / 60.0
            String.format(java.util.Locale.US, "%.0f", minutes)
        } else {
            String.format(java.util.Locale.US, "%.0f", (idx + 1).toDouble())
        }

        xOut.add(idx.toDouble())
        yOut.add(sec)
        labels.add(label)
    }

    return LabeledSeries(xOut, yOut, labels)
}

private fun buildElevationSeries(points: List<LocationPoint>, mode: ChartMode): LabeledSeries {
    if (points.size < 2) return LabeledSeries(emptyList(), emptyList(), emptyList())
    val valid = points.filter { it.latitude != 0.0 && it.longitude != 0.0 && it.altitude != null }
    if (valid.size < 2) return LabeledSeries(emptyList(), emptyList(), emptyList())

    // Pre-compute cumulative distance for ALL points so stepping doesn't lose distance
    val cumulativeDist = DoubleArray(valid.size)
    for (j in 1 until valid.size) {
        cumulativeDist[j] = cumulativeDist[j - 1] +
                haversineMeters(valid[j - 1].latitude, valid[j - 1].longitude,
                    valid[j].latitude, valid[j].longitude)
    }

    val xOut = mutableListOf<Double>()
    val yOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()

    val startTs = valid.first().timestamp
    val step = (valid.size / 260f).coerceAtLeast(1f).toInt()

    var i = 0
    while (i < valid.size) {
        val curr = valid[i]

        val alt = curr.altitude ?: run { i += step; continue }

        val xLabel = if (mode == ChartMode.Time) {
            val minutes = ((curr.timestamp - startTs) / 1000.0 / 60.0)
            String.format(java.util.Locale.US, "%.0f", minutes)
        } else {
            val km = cumulativeDist[i] / 1000.0
            String.format(java.util.Locale.US, "%.1f", km)
        }

        xOut.add(xOut.size.toDouble())
        yOut.add(alt.toDouble())
        labels.add(xLabel)

        i += step
    }

    val smoothedY = smoothY(yOut, window = 11)
    return LabeledSeries(
        x = xOut,
        y = smoothedY,
        labels = labels.ifEmpty { List(smoothedY.size) { it.toString() } }
    )
}

private fun smoothY(values: List<Double>, window: Int): List<Double> {
    if (values.size < window || window <= 1) return values
    val half = window / 2
    return values.mapIndexed { idx, _ ->
        val start = (idx - half).coerceAtLeast(0)
        val end = (idx + half).coerceAtMost(values.lastIndex)
        values.subList(start, end + 1).average()
    }
}

/**
 * Median filter — removes sharp spikes by replacing each value with the median of its neighbours.
 * Much better than averaging for GPS pace data because it doesn't let a single 2:00 spike
 * drag the average down. Applied before smoothY for a clean two-stage pipeline.
 */
private fun medianFilter(values: List<Double>, window: Int): List<Double> {
    if (values.size < window || window <= 1) return values
    val half = window / 2
    return values.mapIndexed { idx, _ ->
        val start = (idx - half).coerceAtLeast(0)
        val end = (idx + half).coerceAtMost(values.lastIndex)
        values.subList(start, end + 1).sorted().let { sorted ->
            sorted[sorted.size / 2] // median
        }
    }
}

private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6371000.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
    return r * (2 * atan2(sqrt(a), sqrt(1 - a)))
}

/* -------------------- HR / CADENCE SERIES BUILDERS -------------------- */

private fun buildHeartRateSeries(
    routePoints: List<LocationPoint>,
    heartRateData: List<Int>?,
    mode: ChartMode
): LabeledSeries {
    // Try from routePoints first (they have embedded HR from Garmin watch)
    val fromRoute = hrFromRoutePoints(routePoints, mode)
    if (fromRoute.y.size >= 2) return fromRoute

    // Fallback: use heartRateData array (index-based)
    val hr = heartRateData?.filter { it > 0 } ?: return LabeledSeries(emptyList(), emptyList(), emptyList())
    if (hr.size < 2) return LabeledSeries(emptyList(), emptyList(), emptyList())

    val step = (hr.size / 200f).coerceAtLeast(1f).toInt()
    val xOut = mutableListOf<Double>()
    val yOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()

    var i = 0
    while (i < hr.size) {
        xOut.add(xOut.size.toDouble())
        yOut.add(hr[i].toDouble())
        labels.add("${i + 1}")
        i += step
    }

    return LabeledSeries(xOut, smoothY(yOut, 11), labels)
}

private fun hrFromRoutePoints(points: List<LocationPoint>, mode: ChartMode): LabeledSeries {
    val valid = points.filter { it.heartRate != null && it.heartRate > 0 && it.latitude != 0.0 }
    if (valid.size < 2) return LabeledSeries(emptyList(), emptyList(), emptyList())

    // Pre-compute cumulative distance for ALL points so stepping doesn't lose distance
    val cumulativeDist = DoubleArray(valid.size)
    for (j in 1 until valid.size) {
        cumulativeDist[j] = cumulativeDist[j - 1] +
                haversineMeters(valid[j - 1].latitude, valid[j - 1].longitude,
                    valid[j].latitude, valid[j].longitude)
    }

    val xOut = mutableListOf<Double>()
    val yOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()
    val startTs = valid.first().timestamp
    val step = (valid.size / 200f).coerceAtLeast(1f).toInt()

    var i = 0
    while (i < valid.size) {
        val curr = valid[i]

        val xLabel = if (mode == ChartMode.Time) {
            String.format(java.util.Locale.US, "%.0f", (curr.timestamp - startTs) / 60000.0)
        } else {
            String.format(java.util.Locale.US, "%.1f", cumulativeDist[i] / 1000.0)
        }

        xOut.add(xOut.size.toDouble())
        yOut.add(curr.heartRate!!.toDouble())
        labels.add(xLabel)

        i += step
    }

    return LabeledSeries(xOut, smoothY(yOut, 11), labels)
}

private fun buildCadenceSeries(points: List<LocationPoint>, mode: ChartMode): LabeledSeries {
    val valid = points.filter { it.cadence != null && it.cadence > 0 && it.latitude != 0.0 }
    if (valid.size < 2) return LabeledSeries(emptyList(), emptyList(), emptyList())

    // Pre-compute cumulative distance for ALL points so stepping doesn't lose distance
    val cumulativeDist = DoubleArray(valid.size)
    for (j in 1 until valid.size) {
        cumulativeDist[j] = cumulativeDist[j - 1] +
                haversineMeters(valid[j - 1].latitude, valid[j - 1].longitude,
                    valid[j].latitude, valid[j].longitude)
    }

    val xOut = mutableListOf<Double>()
    val yOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()
    val startTs = valid.first().timestamp
    val step = (valid.size / 200f).coerceAtLeast(1f).toInt()

    var i = 0
    while (i < valid.size) {
        val curr = valid[i]

        val xLabel = if (mode == ChartMode.Time) {
            String.format(java.util.Locale.US, "%.0f", (curr.timestamp - startTs) / 60000.0)
        } else {
            String.format(java.util.Locale.US, "%.1f", cumulativeDist[i] / 1000.0)
        }

        xOut.add(xOut.size.toDouble())
        yOut.add(curr.cadence!!.toDouble())
        labels.add(xLabel)

        i += step
    }

    return LabeledSeries(xOut, smoothY(yOut, 11), labels)
}

/* -------------------- DUAL-AXIS SERIES DATA -------------------- */

private data class DualSeriesData(
    val paceY: List<Double>,   // primary axis (pace or cadence)
    val elevY: List<Double>,   // secondary axis (elevation)
    val labels: List<String>   // x-axis labels (distance in km)
)

/**
 * Build aligned pace + elevation series over distance.
 * Both series share the same x-axis (distance in km) and same number of data points.
 */
private fun buildPaceElevationDualSeries(
    points: List<LocationPoint>,
    kmSplits: List<KmSplit>
): DualSeriesData {
    val valid = points.filter {
        it.latitude != 0.0 && it.longitude != 0.0 && it.altitude != null && it.speed != null && it.speed > 0.2f
    }
    if (valid.size < 4) return DualSeriesData(emptyList(), emptyList(), emptyList())

    // Pre-compute cumulative distance for ALL points so stepping doesn't lose distance
    val cumulativeDist = DoubleArray(valid.size)
    for (j in 1 until valid.size) {
        cumulativeDist[j] = cumulativeDist[j - 1] +
                haversineMeters(valid[j - 1].latitude, valid[j - 1].longitude,
                    valid[j].latitude, valid[j].longitude)
    }

    val paceOut = mutableListOf<Double>()
    val elevOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()

    val step = (valid.size / 200f).coerceAtLeast(1f).toInt()

    var i = 0
    while (i < valid.size) {
        val curr = valid[i]

        val alt = curr.altitude ?: run { i += step; continue }
        val speed = curr.speed ?: run { i += step; continue }
        if (speed < 0.2f) { i += step; continue }

        // Pace in seconds per km
        val paceSecPerKm = 1000.0 / speed.toDouble()

        val km = cumulativeDist[i] / 1000.0
        labels.add(String.format(java.util.Locale.US, "%.1f", km))
        paceOut.add(paceSecPerKm)
        elevOut.add(alt.toDouble())

        i += step
    }

    if (paceOut.size < 2) return DualSeriesData(emptyList(), emptyList(), emptyList())

    return DualSeriesData(
        paceY = smoothY(medianFilter(paceOut, 5), 15),
        elevY = smoothY(elevOut, 11),
        labels = labels
    )
}

/**
 * Build aligned cadence + elevation series over distance.
 */
private fun buildCadenceElevationDualSeries(
    points: List<LocationPoint>
): DualSeriesData {
    val valid = points.filter {
        it.latitude != 0.0 && it.longitude != 0.0 && it.altitude != null &&
                it.cadence != null && it.cadence > 0
    }
    if (valid.size < 4) return DualSeriesData(emptyList(), emptyList(), emptyList())

    // Pre-compute cumulative distance for ALL points so stepping doesn't lose distance
    val cumulativeDist = DoubleArray(valid.size)
    for (j in 1 until valid.size) {
        cumulativeDist[j] = cumulativeDist[j - 1] +
                haversineMeters(valid[j - 1].latitude, valid[j - 1].longitude,
                    valid[j].latitude, valid[j].longitude)
    }

    val cadOut = mutableListOf<Double>()
    val elevOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()

    val step = (valid.size / 200f).coerceAtLeast(1f).toInt()

    var i = 0
    while (i < valid.size) {
        val curr = valid[i]

        val alt = curr.altitude ?: run { i += step; continue }
        val cad = curr.cadence ?: run { i += step; continue }

        val km = cumulativeDist[i] / 1000.0
        labels.add(String.format(java.util.Locale.US, "%.1f", km))
        cadOut.add(cad.toDouble())
        elevOut.add(alt.toDouble())

        i += step
    }

    if (cadOut.size < 2) return DualSeriesData(emptyList(), emptyList(), emptyList())

    return DualSeriesData(
        paceY = smoothY(cadOut, 11),
        elevY = smoothY(elevOut, 11),
        labels = labels
    )
}

/* -------------------- DUAL-AXIS CHART CANVAS -------------------- */

/**
 * Dual-axis line chart: primary line (left Y axis) + secondary filled area (right Y axis).
 * Used for Pace vs Elevation and Cadence vs Elevation overlays.
 */
@Composable
private fun DualAxisChartCanvas(
    primaryY: List<Double>,
    secondaryY: List<Double>,
    labels: List<String>,
    primaryColor: Color,
    secondaryColor: Color,
    primaryLabel: String,
    secondaryLabel: String,
    xTitle: String,
    primaryFormatter: (Double) -> String,
    secondaryFormatter: (Double) -> String,
    fillSecondary: Boolean = true,
    invertPrimary: Boolean = false,  // When true, lower Y values are at top (for pace: faster = top)
    modifier: Modifier = Modifier,
    height: Dp = 250.dp
) {
    val isFullscreen = LocalFullscreenChart.current
    val n = primaryY.size.coerceAtMost(secondaryY.size)
    if (n < 2) {
        Text("Not enough data to chart.", style = AppTextStyles.caption, color = Colors.textMuted)
        return
    }

    val animProgress by animateFloatAsState(
        targetValue = n.toFloat(),
        animationSpec = tween(durationMillis = 900, easing = FastOutSlowInEasing),
        label = "dualChartProgress"
    )
    val reveal = (animProgress / n.toFloat()).coerceIn(0f, 1f)

    val bgBrush = Brush.verticalGradient(
        colors = listOf(
            primaryColor.copy(alpha = 0.08f),
            Colors.backgroundRoot.copy(alpha = 0.0f)
        )
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .then(if (isFullscreen) Modifier.fillMaxHeight() else Modifier.height(height))
            .clip(RoundedCornerShape(16.dp))
            .background(bgBrush)
            .border(1.dp, Colors.border.copy(alpha = 0.45f), RoundedCornerShape(16.dp))
            .padding(12.dp)
    ) {
        androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
            if (n < 2) return@Canvas

            // Compute ranges
            val priMin = primaryY.take(n).minOrNull() ?: 0.0
            val priMax = primaryY.take(n).maxOrNull() ?: 0.0
            val priRange = (priMax - priMin).takeIf { it > 1e-9 } ?: 1.0

            val secMin = secondaryY.take(n).minOrNull() ?: 0.0
            val secMax = secondaryY.take(n).maxOrNull() ?: 0.0
            val secRange = (secMax - secMin).takeIf { it > 1e-9 } ?: 1.0

            val leftPadPx = 50.dp.toPx()
            val rightPadPx = 50.dp.toPx()
            val bottomPadPx = 22.dp.toPx()
            val topPadPx = 8.dp.toPx()

            val w = size.width
            val h = size.height
            val plotW = (w - leftPadPx - rightPadPx).coerceAtLeast(1f)
            val plotH = (h - topPadPx - bottomPadPx).coerceAtLeast(1f)

            fun xFor(i: Int): Float = leftPadPx + (i.toFloat() / (n - 1).toFloat()) * plotW
            fun priYFor(v: Double): Float {
                val t = ((v - priMin) / priRange).toFloat()
                // When inverted: lower values (faster pace) at top, higher values (slower) at bottom
                return if (invertPrimary) topPadPx + t * plotH
                else topPadPx + (1f - t) * plotH
            }
            fun secYFor(v: Double): Float {
                val t = ((v - secMin) / secRange).toFloat()
                return topPadPx + (1f - t) * plotH
            }

            // --- Left Y axis gridlines + labels (primary) ---
            val ticks = 3
            for (i in 0..ticks) {
                val t = i / ticks.toFloat()
                val y = topPadPx + t * plotH
                drawLine(
                    color = Colors.border.copy(alpha = 0.18f),
                    start = Offset(leftPadPx, y),
                    end = Offset(leftPadPx + plotW, y),
                    strokeWidth = 1.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f), 0f)
                )
                // When inverted: top = priMin (fast), bottom = priMax (slow)
                val value = if (invertPrimary) priMin + (t.toDouble() * priRange)
                            else priMax - (t.toDouble() * priRange)
                drawContext.canvas.nativeCanvas.apply {
                    val p = android.graphics.Paint().apply {
                        isAntiAlias = true
                        color = primaryColor.copy(alpha = 0.85f).toArgb()
                        textSize = 10.sp.toPx()
                        textAlign = android.graphics.Paint.Align.RIGHT
                    }
                    drawText(primaryFormatter(value), leftPadPx - 6.dp.toPx(), y + 4.dp.toPx(), p)
                }
            }

            // --- Right Y axis labels (secondary) ---
            for (i in 0..ticks) {
                val t = i / ticks.toFloat()
                val y = topPadPx + t * plotH
                val value = secMax - (t.toDouble() * secRange)
                drawContext.canvas.nativeCanvas.apply {
                    val p = android.graphics.Paint().apply {
                        isAntiAlias = true
                        color = secondaryColor.copy(alpha = 0.85f).toArgb()
                        textSize = 10.sp.toPx()
                        textAlign = android.graphics.Paint.Align.LEFT
                    }
                    drawText(secondaryFormatter(value), leftPadPx + plotW + 6.dp.toPx(), y + 4.dp.toPx(), p)
                }
            }

            val lastIdx = ((n - 1) * reveal).roundToInt().coerceIn(1, n - 1)

            // --- Secondary (elevation): filled area ---
            val secPoints = ArrayList<Offset>(lastIdx + 1)
            for (i in 0..lastIdx) {
                secPoints.add(Offset(xFor(i), secYFor(secondaryY[i])))
            }

            val secPath = buildSmoothPath(secPoints)

            if (fillSecondary) {
                val fillPath = Path().apply {
                    addPath(secPath)
                    lineTo(secPoints.last().x, topPadPx + plotH)
                    lineTo(secPoints.first().x, topPadPx + plotH)
                    close()
                }
                drawPath(
                    path = fillPath,
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            secondaryColor.copy(alpha = 0.22f),
                            secondaryColor.copy(alpha = 0.04f),
                            Color.Transparent
                        ),
                        startY = topPadPx,
                        endY = topPadPx + plotH
                    )
                )
            }

            // Secondary line (thin, behind primary)
            drawPath(
                path = secPath,
                color = secondaryColor.copy(alpha = 0.55f),
                style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            )

            // --- Primary line (pace / cadence): bold line on top ---
            val priPoints = ArrayList<Offset>(lastIdx + 1)
            for (i in 0..lastIdx) {
                priPoints.add(Offset(xFor(i), priYFor(primaryY[i])))
            }

            val priPath = buildSmoothPath(priPoints)
            drawPath(
                path = priPath,
                color = primaryColor,
                style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            )

            // End dots
            val priEnd = priPoints.last()
            drawCircle(color = primaryColor, radius = 4.dp.toPx(), center = priEnd)
            drawCircle(color = Colors.backgroundRoot, radius = 2.dp.toPx(), center = priEnd)

            // --- x labels (evenly spaced across chart) ---
            val numXLabels = if (n > 10) 5 else 3
            val xLabelIndices = (0 until numXLabels).map { tick ->
                ((tick.toFloat() / (numXLabels - 1).toFloat()) * (n - 1)).roundToInt().coerceIn(0, n - 1)
            }.distinct()
            xLabelIndices.forEach { idx ->
                val label = labels.getOrNull(idx) ?: idx.toString()
                val x = xFor(idx)
                drawContext.canvas.nativeCanvas.apply {
                    val p = android.graphics.Paint().apply {
                        isAntiAlias = true
                        color = Colors.textMuted.copy(alpha = 0.9f).toArgb()
                        textSize = 10.sp.toPx()
                        textAlign = android.graphics.Paint.Align.CENTER
                    }
                    drawText(label, x, topPadPx + plotH + 16.dp.toPx(), p)
                }
            }

            // Axis unit labels
            drawContext.canvas.nativeCanvas.apply {
                // Left axis label
                val pL = android.graphics.Paint().apply {
                    isAntiAlias = true
                    color = primaryColor.copy(alpha = 0.85f).toArgb()
                    textSize = 10.sp.toPx()
                    textAlign = android.graphics.Paint.Align.LEFT
                }
                drawText(primaryLabel, leftPadPx, 12.dp.toPx(), pL)

                // Right axis label
                val pR = android.graphics.Paint().apply {
                    isAntiAlias = true
                    color = secondaryColor.copy(alpha = 0.85f).toArgb()
                    textSize = 10.sp.toPx()
                    textAlign = android.graphics.Paint.Align.RIGHT
                }
                drawText(secondaryLabel, leftPadPx + plotW, 12.dp.toPx(), pR)

                // x-axis title
                val pX = android.graphics.Paint().apply {
                    isAntiAlias = true
                    color = Colors.textMuted.copy(alpha = 0.85f).toArgb()
                    textSize = 10.sp.toPx()
                    textAlign = android.graphics.Paint.Align.RIGHT
                }
                drawText(xTitle, leftPadPx + plotW, topPadPx + plotH + 16.dp.toPx(), pX)
            }
        }

        // Legend row
        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(primaryColor, CircleShape)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(primaryLabel, style = AppTextStyles.caption.copy(fontSize = 10.sp), color = primaryColor)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(secondaryColor, CircleShape)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(secondaryLabel, style = AppTextStyles.caption.copy(fontSize = 10.sp), color = secondaryColor)
            }
        }
    }
}

private fun parsePaceToSeconds(pace: String): Int {
    // Parse "M:SS" or "M:SS/km" to total seconds
    val cleaned = pace.replace("/km", "").trim()
    val parts = cleaned.split(":")
    if (parts.size != 2) return 0
    val min = parts[0].toIntOrNull() ?: return 0
    val sec = parts[1].toIntOrNull() ?: return 0
    return min * 60 + sec
}

/* --------------------------------- dp/sp helpers -------------------------------- */

@Composable
private fun Dp.toPx(): Float {
    val density = LocalDensity.current
    return with(density) { this@toPx.toPx() }
}

/* NOTE:
 * - formatPaceSeconds(...) and getBestPace(...) are assumed to be your existing helpers.
 * - Colors / Spacing / AppTextStyles are assumed to be your existing theme objects.
 */


/* ------------------------------ KM SPLITS CARD ----------------------------- */

@Composable
private fun KmSplitsCardFlagship(kmSplits: List<KmSplit>) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Text(
            text = "Km Splits",
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )

        Card(
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(),
            border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
        ) {
            Column {
                kmSplits.forEachIndexed { index, split ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Km ${index + 1}",
                            style = AppTextStyles.body,
                            color = Colors.textPrimary
                        )
                        Text(
                            text = if (split.pace.contains("/km")) split.pace else "${split.pace} /km",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary
                        )
                    }
                    if (index < kmSplits.lastIndex) {
                        HorizontalDivider(color = Colors.border, thickness = 1.dp)
                    }
                }
            }
        }
    }
}

/* ---------------------------- HR ZONES (BASIC) ----------------------------- */

@Composable
private fun HeartRateZonesCardFlagship(heartRateData: List<Int>?) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Text(
            text = "Heart Rate Zones",
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )

        Card(
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(),
            border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {

                val hr = heartRateData?.filter { it > 0 }.orEmpty()
                if (hr.isEmpty()) {
                    Text("No heart rate data recorded.", style = AppTextStyles.body, color = Colors.textSecondary)
                    return@Column
                }

                val maxObserved = hr.maxOrNull() ?: 0
                val maxHr = maxObserved.coerceAtLeast(160)
                val z2 = 0.60 * maxHr
                val z3 = 0.70 * maxHr
                val z4 = 0.80 * maxHr
                val z5 = 0.90 * maxHr

                fun pct(range: IntRange): Int {
                    val count = hr.count { it in range }
                    return ((count / hr.size.toDouble()) * 100).toInt()
                }

                val zones = listOf(
                    Triple("Zone 5", "Maximum", (z5.toInt()..maxHr)),
                    Triple("Zone 4", "Threshold", (z4.toInt()..(z5.toInt() - 1))),
                    Triple("Zone 3", "Aerobic", (z3.toInt()..(z4.toInt() - 1))),
                    Triple("Zone 2", "Easy", (z2.toInt()..(z3.toInt() - 1))),
                    Triple("Zone 1", "Warm Up", (0..(z2.toInt() - 1))),
                )

                zones.forEach { (name, label, range) ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("$name • $label", style = AppTextStyles.body, color = Colors.textSecondary)
                        Text("${pct(range)}%", style = AppTextStyles.body, color = Colors.textSecondary)
                    }
                }
            }
        }
    }
}

/* ---------------------- PACE CONSISTENCY SCORE CARD ---------------------- */

@Composable
private fun PaceConsistencyCard(run: RunSession) {
    if (run.kmSplits.size < 2) return

    val (score, label, color, description) = remember(run.kmSplits) {
        calculatePaceConsistency(run.kmSplits)
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Pace Consistency",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "How evenly you paced your run",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
                // Score badge
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .background(color.copy(alpha = 0.15f), CircleShape)
                        .border(2.dp, color.copy(alpha = 0.5f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "$score",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                        color = color
                    )
                }
            }

            // Rating pill
            Box(
                modifier = Modifier
                    .background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
                    .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(label, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = color)
            }

            Text(
                description,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )

            // Pace range indicator
            val paces = run.kmSplits.map { parsePaceToSeconds(it.pace) }.filter { it > 0 }
            if (paces.size >= 2) {
                val fastest = paces.min()
                val slowest = paces.max()
                val range = slowest - fastest
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("Fastest", style = AppTextStyles.caption, color = Colors.textMuted)
                        Text(
                            formatPaceSeconds(fastest.toLong()),
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Color(0xFF4CAF50)
                        )
                    }
                    Column {
                        Text("Slowest", style = AppTextStyles.caption, color = Colors.textMuted)
                        Text(
                            formatPaceSeconds(slowest.toLong()),
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.error
                        )
                    }
                    Column {
                        Text("Range", style = AppTextStyles.caption, color = Colors.textMuted)
                        Text(
                            "${range}s",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                    }
                }
            }
        }
    }
}

private data class PaceConsistencyResult(
    val score: Int,
    val label: String,
    val color: Color,
    val description: String
)

private fun calculatePaceConsistency(splits: List<KmSplit>): PaceConsistencyResult {
    val paces = splits.map { parsePaceToSeconds(it.pace).toDouble() }.filter { it > 0 }
    if (paces.size < 2) return PaceConsistencyResult(0, "N/A", Color.Gray, "Not enough data")

    val mean = paces.average()
    val variance = paces.map { (it - mean).pow(2) }.average()
    val stdDev = sqrt(variance)
    val cv = (stdDev / mean) * 100.0 // coefficient of variation as percentage

    // Score: 100 = perfect, 0 = all over the place
    // CV < 2% = excellent (95-100), CV 2-5% = good (80-95), CV 5-10% = average (60-80), CV > 10% = poor
    val score = (100 - cv * 5).coerceIn(0.0, 100.0).roundToInt()

    return when {
        score >= 90 -> PaceConsistencyResult(score, "Metronome", Color(0xFF4CAF50), "Exceptional pacing! You held a remarkably even effort throughout the run. Elite-level consistency.")
        score >= 75 -> PaceConsistencyResult(score, "Well Paced", Color(0xFF8BC34A), "Strong pacing strategy. Your splits are tight with minimal variation — this shows discipline.")
        score >= 60 -> PaceConsistencyResult(score, "Moderate", Color(0xFFFFC107), "Some variation between splits. Consider starting a touch slower to maintain even effort in the second half.")
        score >= 40 -> PaceConsistencyResult(score, "Variable", Color(0xFFFF9800), "Noticeable pace changes between kilometers. This could indicate terrain, fatigue, or inconsistent effort.")
        else -> PaceConsistencyResult(score, "Erratic", Colors.error, "Large pace swings detected. Focus on running by feel or use pace alerts to stay within your target zone.")
    }
}

/* ----------------------- SPLIT ANALYSIS CARD ----------------------- */

@Composable
private fun SplitAnalysisCard(run: RunSession) {
    if (run.kmSplits.size < 2) return

    val (splitType, firstHalfAvg, secondHalfAvg, differencePercent) = remember(run.kmSplits) {
        analyzeSplits(run.kmSplits)
    }

    val (color, icon, description) = when (splitType) {
        "NEGATIVE" -> Triple(
            Color(0xFF4CAF50),
            "🚀",
            "Negative split — you got faster as the run progressed! This is the gold standard for racing strategy."
        )
        "POSITIVE" -> Triple(
            Color(0xFFFF9800),
            "📉",
            "Positive split — you slowed as the run progressed. Consider starting 5-10s/km slower to have more energy for the finish."
        )
        else -> Triple(
            Colors.primary,
            "⚖️",
            "Even split — nearly identical first and second half. Excellent pacing discipline!"
        )
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, color.copy(alpha = 0.4f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(icon, style = AppTextStyles.h3)
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        "$splitType Split",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "${abs(differencePercent).roundToInt()}% difference",
                        style = AppTextStyles.caption,
                        color = color
                    )
                }
            }

            // Half comparison
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("1st Half", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        formatPaceSeconds(firstHalfAvg.toLong()),
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = if (splitType == "NEGATIVE") Colors.textSecondary else color
                    )
                    Text("/km avg", style = AppTextStyles.caption, color = Colors.textMuted)
                }
                // Arrow
                Text(
                    if (splitType == "NEGATIVE") "→ ⚡" else if (splitType == "POSITIVE") "→ 🐢" else "→ =",
                    style = AppTextStyles.h4,
                    modifier = Modifier.padding(top = 12.dp)
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("2nd Half", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        formatPaceSeconds(secondHalfAvg.toLong()),
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = if (splitType == "NEGATIVE") color else Colors.textSecondary
                    )
                    Text("/km avg", style = AppTextStyles.caption, color = Colors.textMuted)
                }
            }

            Text(
                description,
                style = AppTextStyles.small,
                color = Colors.textSecondary
            )
        }
    }
}

private data class SplitAnalysis(
    val type: String, // "NEGATIVE", "POSITIVE", "EVEN"
    val firstHalfAvg: Double,
    val secondHalfAvg: Double,
    val differencePercent: Double
)

private fun analyzeSplits(splits: List<KmSplit>): SplitAnalysis {
    val paces = splits.map { parsePaceToSeconds(it.pace).toDouble() }.filter { it > 0 }
    if (paces.size < 2) return SplitAnalysis("EVEN", 0.0, 0.0, 0.0)

    val mid = paces.size / 2
    val firstHalf = paces.subList(0, mid).average()
    val secondHalf = paces.subList(mid, paces.size).average()
    val diff = ((secondHalf - firstHalf) / firstHalf) * 100

    val type = when {
        diff < -2.0 -> "NEGATIVE"
        diff > 2.0 -> "POSITIVE"
        else -> "EVEN"
    }

    return SplitAnalysis(type, firstHalf, secondHalf, diff)
}

/* ---------------------- KM SPLITS VISUAL BAR CHART ---------------------- */

@Composable
private fun KmSplitsVisualChart(kmSplits: List<KmSplit>) {
    // Keep all splits including the last one — don't filter by pace validity
    // so a 5km run always shows 5 bars. Use 0 as fallback for missing pace.
    val splitData = remember(kmSplits) {
        kmSplits.mapIndexed { idx, split ->
            val paceSeconds = parsePaceToSeconds(split.pace).toDouble()
            Pair(split, paceSeconds)
        }
    }
    if (splitData.size < 2) return

    val validPaces = splitData.map { it.second }.filter { it > 0 }
    if (validPaces.isEmpty()) return

    // Average pace — use this as the baseline for coloring, not fastest vs slowest.
    // This way consistent km splits all look green/neutral rather than orange.
    val avgPace = validPaces.average()
    val minPace = validPaces.min()
    val maxPace = validPaces.max()
    val fastestIdx = splitData.indexOfFirst { it.second == minPace }
    val slowestIdx = splitData.indexOfFirst { it.second == maxPace }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                "Km Split Breakdown",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                color = Colors.textPrimary
            )

            splitData.forEachIndexed { idx, (split, pace) ->
                // Bar length: all splits get a meaningful bar. Use avg ± 20% as the
                // "full range" so consistent pacing gives similar-length bars.
                val axisMin = avgPace * 0.85   // 15% faster than avg = longest bar
                val axisMax = avgPace * 1.25   // 25% slower than avg = shortest bar
                val barFraction = if (pace > 0) {
                    val norm = ((pace - axisMin) / (axisMax - axisMin)).coerceIn(0.0, 1.0)
                    (1.0 - norm).toFloat().coerceIn(0.15f, 1f)
                } else 0.15f

                // Color relative to average: within ±5% = green, 5-12% slow = yellow,
                // 12-20% slow = orange, >20% slower = red. Fastest km = always green.
                val deviationFromAvg = if (avgPace > 0 && pace > 0) (pace - avgPace) / avgPace else 0.0
                val barColor = when {
                    idx == fastestIdx -> Color(0xFF4CAF50)
                    idx == slowestIdx && deviationFromAvg > 0.12 -> Colors.error
                    deviationFromAvg <= 0.05 -> Color(0xFF4CAF50)        // within 5% of avg = green
                    deviationFromAvg <= 0.12 -> Color(0xFFFFC107)        // 5–12% slower = yellow
                    deviationFromAvg <= 0.20 -> Color(0xFFFF9800)        // 12–20% slower = orange
                    else -> Colors.error                                  // >20% slower = red
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Km ${idx + 1}",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textMuted,
                        modifier = Modifier.width(42.dp)
                    )

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(20.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(Colors.backgroundTertiary.copy(alpha = 0.3f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(barFraction)
                                .clip(RoundedCornerShape(6.dp))
                                .background(barColor)
                        )
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    Text(
                        if (pace > 0) split.pace else "—",
                        style = AppTextStyles.caption.copy(
                            fontWeight = if (idx == fastestIdx || idx == slowestIdx) FontWeight.ExtraBold else FontWeight.Medium
                        ),
                        color = when {
                            idx == fastestIdx -> Color(0xFF4CAF50)
                            idx == slowestIdx && deviationFromAvg > 0.12 -> Colors.error
                            else -> Colors.textPrimary
                        },
                        modifier = Modifier.width(48.dp),
                        textAlign = TextAlign.End
                    )
                }
            }

            // Legend — explain what the colors mean
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).background(Color(0xFF4CAF50), CircleShape))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("On pace", style = AppTextStyles.caption, color = Colors.textMuted)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).background(Color(0xFFFFC107), CircleShape))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Slightly slower", style = AppTextStyles.caption, color = Colors.textMuted)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).background(Colors.error, CircleShape))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Notably slow", style = AppTextStyles.caption, color = Colors.textMuted)
                }
            }
        }
    }
}

/* ----------------------- EFFORT SCORE / TRAINING LOAD ---------------------- */

@Composable
private fun EffortScoreCard(run: RunSession) {
    val (effortScore, label, color, breakdown) = remember(run) {
        calculateEffortScore(run)
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Effort Score",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "Training load estimate",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }

                // Circular gauge
                Box(
                    modifier = Modifier.size(72.dp),
                    contentAlignment = Alignment.Center
                ) {
                    androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
                        val strokeWidth = 8.dp.toPx()
                        val radius = (size.minDimension - strokeWidth) / 2

                        // Background arc
                        drawArc(
                            color = color.copy(alpha = 0.15f),
                            startAngle = 135f,
                            sweepAngle = 270f,
                            useCenter = false,
                            style = Stroke(width = strokeWidth, cap = androidx.compose.ui.graphics.StrokeCap.Round),
                            topLeft = Offset(strokeWidth / 2, strokeWidth / 2),
                            size = androidx.compose.ui.geometry.Size(radius * 2, radius * 2)
                        )

                        // Filled arc
                        val sweep = (effortScore / 100f) * 270f
                        drawArc(
                            color = color,
                            startAngle = 135f,
                            sweepAngle = sweep,
                            useCenter = false,
                            style = Stroke(width = strokeWidth, cap = androidx.compose.ui.graphics.StrokeCap.Round),
                            topLeft = Offset(strokeWidth / 2, strokeWidth / 2),
                            size = androidx.compose.ui.geometry.Size(radius * 2, radius * 2)
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "$effortScore",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                            color = color
                        )
                        Text(
                            "/100",
                            style = AppTextStyles.caption.copy(fontSize = 9.sp),
                            color = Colors.textMuted
                        )
                    }
                }
            }

            // Label pill
            Box(
                modifier = Modifier
                    .background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
                    .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(label, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = color)
            }

            // Breakdown factors
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                breakdown.forEach { (factor, value) ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(factor, style = AppTextStyles.caption, color = Colors.textMuted)
                        Text(value, style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold), color = Colors.textPrimary)
                    }
                }
            }
        }
    }
}

private data class EffortResult(
    val score: Int,
    val label: String,
    val color: Color,
    val breakdown: List<Pair<String, String>>
)

private fun calculateEffortScore(run: RunSession): EffortResult {
    // Multi-factor effort score:
    // 1. Duration factor (longer = harder)
    // 2. Pace factor (faster = harder)
    // 3. Elevation factor (more gain = harder)
    // 4. Heart rate factor (higher avg HR = harder)

    val durationMin = run.duration / 60000.0
    val distanceKm = run.distance / 1000.0
    val factors = mutableListOf<Pair<String, String>>()

    // Duration: 0-20 pts (30 min = 10, 60 min = 18, 90 min = 20)
    val durationScore = (durationMin / 90.0 * 20.0).coerceIn(0.0, 20.0)
    factors.add("Duration" to "${durationMin.roundToInt()} min")

    // Distance: 0-20 pts
    val distanceScore = (distanceKm / 20.0 * 20.0).coerceIn(0.0, 20.0)
    factors.add("Distance" to String.format("%.1f km", distanceKm))

    // Pace intensity: 0-25 pts (based on pace relative to typical recreational ranges)
    val paceSecPerKm = if (distanceKm > 0 && durationMin > 0) {
        (durationMin * 60.0) / distanceKm
    } else 600.0
    // 3:00/km = elite = 25 pts, 7:00/km = easy jog = 5 pts
    val paceScore = ((420.0 - paceSecPerKm) / (420.0 - 180.0) * 25.0).coerceIn(0.0, 25.0)
    val paceMin = (paceSecPerKm / 60).toInt()
    val paceSec = (paceSecPerKm % 60).roundToInt()
    factors.add("Pace Intensity" to "$paceMin:${paceSec.toString().padStart(2, '0')}/km")

    // Elevation: 0-15 pts
    val elevScore = (run.totalElevationGain / 500.0 * 15.0).coerceIn(0.0, 15.0)
    if (run.totalElevationGain > 0) {
        factors.add("Elevation Gain" to "${run.totalElevationGain.roundToInt()} m")
    }

    // Heart Rate: 0-20 pts (if available)
    val hrScore = if (run.heartRate > 0) {
        // Assume max HR ~190 for generalization
        val hrPercent = (run.heartRate.toDouble() / 190.0) * 100.0
        ((hrPercent - 50) / 50.0 * 20.0).coerceIn(0.0, 20.0)
    } else {
        10.0 // neutral if no HR data
    }
    if (run.heartRate > 0) {
        factors.add("Avg Heart Rate" to "${run.heartRate} bpm")
    }

    val total = (durationScore + distanceScore + paceScore + elevScore + hrScore).roundToInt().coerceIn(0, 100)

    val (label, color) = when {
        total >= 80 -> "Maximum Effort" to Colors.error
        total >= 60 -> "Hard" to Color(0xFFFF9800)
        total >= 40 -> "Moderate" to Color(0xFFFFC107)
        total >= 20 -> "Easy" to Color(0xFF8BC34A)
        else -> "Recovery" to Color(0xFF4CAF50)
    }

    return EffortResult(total, label, color, factors)
}

/* --------------------- HEART RATE ZONES (VISUAL BARS) --------------------- */

@Composable
private fun HeartRateZonesVisualCard(heartRateData: List<Int>?) {
    val hr = heartRateData?.filter { it > 0 }.orEmpty()
    if (hr.isEmpty()) return

    val maxObserved = hr.maxOrNull() ?: 0
    val maxHr = maxObserved.coerceAtLeast(160)

    data class ZoneInfo(
        val name: String,
        val label: String,
        val color: Color,
        val range: IntRange,
        val percent: Int,
        val timeSeconds: Long
    )

    val totalSamples = hr.size
    val z2 = (0.60 * maxHr).toInt()
    val z3 = (0.70 * maxHr).toInt()
    val z4 = (0.80 * maxHr).toInt()
    val z5 = (0.90 * maxHr).toInt()

    // Estimate time per sample (roughly 1-2 sec per HR reading)
    val estimatedSecPerSample = 2L

    val zones = listOf(
        Triple("Zone 5", "Maximum", Color(0xFFE53935)) to (z5..maxHr),
        Triple("Zone 4", "Threshold", Color(0xFFFF9800)) to (z4 until z5),
        Triple("Zone 3", "Aerobic", Color(0xFFFFC107)) to (z3 until z4),
        Triple("Zone 2", "Easy", Color(0xFF4CAF50)) to (z2 until z3),
        Triple("Zone 1", "Warm Up", Color(0xFF42A5F5)) to (0 until z2),
    ).map { (info, range) ->
        val count = hr.count { it in range }
        val pct = ((count.toDouble() / totalSamples) * 100).roundToInt()
        val timeSec = count * estimatedSecPerSample
        ZoneInfo(info.first, info.second, info.third, range, pct, timeSec)
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                "Heart Rate Zones",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                color = Colors.textPrimary
            )

            Text(
                "Based on est. max HR: $maxHr bpm",
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )

            zones.forEach { zone ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "${zone.name} • ${zone.label}",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                            color = Colors.textPrimary
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                formatSecondsToHMS(zone.timeSeconds),
                                style = AppTextStyles.caption,
                                color = Colors.textSecondary
                            )
                            Text(
                                "${zone.percent}%",
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                color = zone.color
                            )
                        }
                    }

                    // Horizontal bar
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(10.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(Colors.backgroundTertiary.copy(alpha = 0.3f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth((zone.percent / 100f).coerceIn(0f, 1f))
                                .clip(RoundedCornerShape(5.dp))
                                .background(zone.color)
                        )
                    }

                    Text(
                        "${zone.range.first}-${zone.range.last} bpm",
                        style = AppTextStyles.caption.copy(fontSize = 9.sp),
                        color = Colors.textMuted
                    )
                }
            }
        }
    }
}

/* ------------------- INTENSITY DISTRIBUTION DONUT ------------------- */

@Composable
private fun IntensityDistributionCard(run: RunSession) {
    val hr = run.heartRateData?.filter { it > 0 }.orEmpty()
    if (hr.size < 10) return

    val maxHr = (hr.maxOrNull() ?: 160).coerceAtLeast(160)

    data class IntensityZone(val name: String, val color: Color, val percent: Float)

    val zones = remember(hr, maxHr) {
        val easy = hr.count { it < (0.70 * maxHr) }
        val moderate = hr.count { it in (0.70 * maxHr).toInt() until (0.80 * maxHr).toInt() }
        val hard = hr.count { it in (0.80 * maxHr).toInt() until (0.90 * maxHr).toInt() }
        val maximal = hr.count { it >= (0.90 * maxHr) }
        val total = hr.size.toFloat()

        listOf(
            IntensityZone("Easy", Color(0xFF4CAF50), easy / total),
            IntensityZone("Moderate", Color(0xFFFFC107), moderate / total),
            IntensityZone("Hard", Color(0xFFFF9800), hard / total),
            IntensityZone("Maximal", Color(0xFFE53935), maximal / total)
        )
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "Intensity Distribution",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                color = Colors.textPrimary
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Donut chart
                Box(
                    modifier = Modifier.size(120.dp),
                    contentAlignment = Alignment.Center
                ) {
                    androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
                        val strokeWidth = 20.dp.toPx()
                        val radius = (size.minDimension - strokeWidth) / 2
                        val arcSize = androidx.compose.ui.geometry.Size(radius * 2, radius * 2)
                        val topLeft = Offset(strokeWidth / 2, strokeWidth / 2)

                        var startAngle = -90f
                        zones.forEach { zone ->
                            val sweep = zone.percent * 360f
                            if (sweep > 0.5f) {
                                drawArc(
                                    color = zone.color,
                                    startAngle = startAngle,
                                    sweepAngle = sweep,
                                    useCenter = false,
                                    style = Stroke(width = strokeWidth, cap = androidx.compose.ui.graphics.StrokeCap.Butt),
                                    topLeft = topLeft,
                                    size = arcSize
                                )
                            }
                            startAngle += sweep
                        }
                    }
                    // Center text
                    val dominantZone = zones.maxByOrNull { it.percent }
                    if (dominantZone != null) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "${(dominantZone.percent * 100).roundToInt()}%",
                                style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                                color = dominantZone.color
                            )
                            Text(
                                dominantZone.name,
                                style = AppTextStyles.caption.copy(fontSize = 10.sp),
                                color = Colors.textMuted
                            )
                        }
                    }
                }

                // Legend
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    zones.forEach { zone ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .background(zone.color, CircleShape)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                zone.name,
                                style = AppTextStyles.caption,
                                color = Colors.textSecondary,
                                modifier = Modifier.width(60.dp)
                            )
                            Text(
                                "${(zone.percent * 100).roundToInt()}%",
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                color = Colors.textPrimary
                            )
                        }
                    }
                }
            }
        }
    }
}

/* =================== AI COACHING REPLAY TIMELINE =================== */

@Composable
private fun CoachingReplayTimeline(
    coachingNotes: List<AiCoachingNote>,
    routePoints: List<LocationPoint>,
    totalDuration: Long
) {
    if (coachingNotes.isEmpty()) return

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.primary.copy(alpha = 0.4f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🤖", style = AppTextStyles.h3)
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        "AI Coaching Replay",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "${coachingNotes.size} coaching moments during your run",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            // Timeline
            coachingNotes.forEachIndexed { idx, note ->
                Row(modifier = Modifier.fillMaxWidth()) {
                    // Timeline column
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.width(48.dp)
                    ) {
                        // Time badge
                        Box(
                            modifier = Modifier
                                .background(Colors.primary.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                                .padding(horizontal = 6.dp, vertical = 3.dp)
                        ) {
                            Text(
                                formatDuration(note.time),
                                style = AppTextStyles.caption.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold
                                ),
                                color = Colors.primary
                            )
                        }
                        // Vertical line (not on last item)
                        if (idx < coachingNotes.size - 1) {
                            Box(
                                modifier = Modifier
                                    .width(2.dp)
                                    .height(20.dp)
                                    .background(Colors.primary.copy(alpha = 0.2f))
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    // Coaching message
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = Colors.primary.copy(alpha = 0.06f)
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            note.message,
                            style = AppTextStyles.small,
                            color = Colors.textSecondary,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }
            }
        }
    }
}

/* =================== PACE DECAY / FATIGUE CURVE =================== */

@Composable
private fun FatigueCurveCard(run: RunSession) {
    if (run.kmSplits.size < 3) return

    val paces = run.kmSplits.map { parsePaceToSeconds(it.pace).toDouble() }.filter { it > 0 }
    if (paces.size < 3) return

    val thirdSize = (paces.size / 3).coerceAtLeast(1)
    val middleThirdAvg = paces.drop(thirdSize).take(thirdSize).average()
    val lastThirdAvg = paces.takeLast(thirdSize).average()

    // Fatigue = how much slower the last third is vs the MIDDLE third.
    // Using middle→last avoids penalising a fast start — it measures whether
    // the runner actually slowed down from their sustainable cruising pace.
    val totalFatiguePercent = ((lastThirdAvg - middleThirdAvg) / middleThirdAvg * 100)

    val (rating, color) = when {
        totalFatiguePercent <= 0 -> "Negative split!" to Color(0xFF4CAF50)
        totalFatiguePercent <= 3 -> "Strong fatigue resistance" to Color(0xFF8BC34A)
        totalFatiguePercent <= 6 -> "Normal fatigue" to Color(0xFFFFC107)
        totalFatiguePercent <= 10 -> "Moderate fatigue" to Color(0xFFFF9800)
        else -> "Significant fatigue" to Colors.error
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                "Fatigue Analysis",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                color = Colors.textPrimary
            )

            // Visual: pace trend bars — colored relative to average pace
            // so a consistent run shows mostly green regardless of fast start
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(60.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                val avgPace = paces.average()
                // Axis: ±25% around average so bars have consistent visual scale
                val axisMin = avgPace * 0.85
                val axisMax = avgPace * 1.25
                val axisRange = (axisMax - axisMin).coerceAtLeast(1.0)

                paces.forEachIndexed { _, pace ->
                    // Height: shorter bar = slower pace (more fatigued)
                    val heightFraction = (1.0 - ((pace - axisMin) / axisRange).coerceIn(0.0, 1.0))
                        .toFloat().coerceIn(0.15f, 1f)

                    // Color relative to average (not fastest→slowest)
                    val dev = if (avgPace > 0) (pace - avgPace) / avgPace else 0.0
                    val barColor = when {
                        dev <= 0.05 -> Color(0xFF4CAF50)   // within 5% of avg = green
                        dev <= 0.12 -> Color(0xFFFFC107)   // 5–12% slower = yellow
                        dev <= 0.20 -> Color(0xFFFF9800)   // 12–20% slower = orange
                        else -> Colors.error               // >20% slower = red
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(heightFraction)
                            .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                            .background(barColor)
                    )
                }
            }

            // Km labels
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Km 1", style = AppTextStyles.caption.copy(fontSize = 9.sp), color = Colors.textMuted)
                Text("Km ${paces.size}", style = AppTextStyles.caption.copy(fontSize = 9.sp), color = Colors.textMuted)
            }

            HorizontalDivider(color = Colors.border.copy(alpha = 0.3f))

            // Stats — Decay is middle→last so a fast start doesn't count as fatigue
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Mid Avg", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        formatPaceSeconds(middleThirdAvg.toLong()) + "/km",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Decay", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        "${if (totalFatiguePercent >= 0) "+" else ""}${String.format(Locale.US, "%.1f", totalFatiguePercent)}%",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = color
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Last Avg", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        formatPaceSeconds(lastThirdAvg.toLong()) + "/km",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = if (totalFatiguePercent > 6) Colors.error else Colors.textPrimary
                    )
                }
            }

            Box(
                modifier = Modifier
                    .background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
                    .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(rating, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = color)
            }
        }
    }
}

/* =================== AEROBIC DECOUPLING =================== */

@Composable
private fun AerobicDecouplingCard(run: RunSession) {
    val hr = run.heartRateData?.filter { it > 0 }.orEmpty()
    if (hr.size < 10 || run.kmSplits.size < 2) return

    val paces = run.kmSplits.map { parsePaceToSeconds(it.pace).toDouble() }.filter { it > 0 }
    if (paces.size < 2) return

    // Split HR and pace into halves
    val hrMid = hr.size / 2
    val paceMid = paces.size / 2

    val firstHalfHr = hr.subList(0, hrMid).average()
    val secondHalfHr = hr.subList(hrMid, hr.size).average()
    val firstHalfPace = paces.subList(0, paceMid).average()
    val secondHalfPace = paces.subList(paceMid, paces.size).average()

    val hrDrift = ((secondHalfHr - firstHalfHr) / firstHalfHr) * 100
    val paceDrift = ((secondHalfPace - firstHalfPace) / firstHalfPace) * 100
    val decoupling = hrDrift + paceDrift // combined drift percentage

    val (rating, color, advice) = when {
        decoupling < 3.0 -> Triple(
            "Excellent",
            Color(0xFF4CAF50),
            "Your aerobic system handled this effort efficiently. Strong fitness indicator."
        )
        decoupling < 5.0 -> Triple(
            "Good",
            Color(0xFF8BC34A),
            "Minimal cardiac drift — your aerobic base is solid for this pace."
        )
        decoupling < 8.0 -> Triple(
            "Moderate",
            Color(0xFFFFC107),
            "Some HR-pace decoupling detected. More aerobic base work (easy runs) would help."
        )
        else -> Triple(
            "High",
            Colors.error,
            "Significant decoupling — either the effort was above threshold or aerobic fitness needs development."
        )
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🔬", style = AppTextStyles.h3)
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        "Aerobic Decoupling",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "Heart rate vs pace drift analysis",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            // Decoupling percentage with gauge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("HR Drift", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        "${if (hrDrift >= 0) "+" else ""}${String.format(Locale.US, "%.1f", hrDrift)}%",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = if (hrDrift > 5) Colors.error else Colors.textPrimary
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Pace Drift", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        "${if (paceDrift >= 0) "+" else ""}${String.format(Locale.US, "%.1f", paceDrift)}%",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = if (paceDrift > 3) Color(0xFFFF9800) else Colors.textPrimary
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Decoupling", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        "${String.format(Locale.US, "%.1f", decoupling)}%",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                        color = color
                    )
                }
            }

            Box(
                modifier = Modifier
                    .background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
                    .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(rating, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = color)
            }

            Text(advice, style = AppTextStyles.small, color = Colors.textSecondary)
        }
    }
}

/* =================== RUNNING ECONOMY (PACE vs HR) =================== */

@Composable
private fun RunningEconomyCard(run: RunSession) {
    if (run.heartRate <= 0 || run.distance < 500) return

    val paceSecPerKm = if (run.distance > 0) {
        (run.duration / 1000.0) / (run.distance / 1000.0)
    } else return

    // Running economy = pace per heartbeat (lower = more efficient)
    // Speed per HR beat: (m/s) / bpm
    val speedMs = run.distance / (run.duration / 1000.0)
    val economyIndex = (speedMs / run.heartRate) * 1000 // meters per beat

    val (rating, color) = when {
        economyIndex > 7.0 -> "Elite Economy" to Color(0xFF4CAF50)
        economyIndex > 5.5 -> "Good Economy" to Color(0xFF8BC34A)
        economyIndex > 4.0 -> "Average Economy" to Color(0xFFFFC107)
        else -> "Developing" to Color(0xFFFF9800)
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                "Running Economy",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                color = Colors.textPrimary
            )
            Text(
                "How efficiently you convert cardiac output to speed",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        String.format(Locale.US, "%.1f", economyIndex),
                        style = AppTextStyles.stat.copy(fontSize = 36.sp),
                        color = color
                    )
                    Text("m per heartbeat", style = AppTextStyles.caption, color = Colors.textMuted)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        formatPaceSeconds(paceSecPerKm.toLong()) + "/km",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text("at ${run.heartRate} bpm avg", style = AppTextStyles.caption, color = Colors.textMuted)
                }
            }

            Box(
                modifier = Modifier
                    .background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
                    .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(rating, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = color)
            }

            Text(
                "Track this metric over time — improving economy means you're getting faster at the same heart rate, or maintaining pace with less cardiac effort.",
                style = AppTextStyles.small,
                color = Colors.textSecondary
            )
        }
    }
}

/* =================== RACE TIME PREDICTOR =================== */

@Composable
private fun RaceTimePredictorCard(run: RunSession) {
    if (run.distance < 1000 || run.duration < 60000) return

    val distanceKm = run.distance / 1000.0
    val durationMin = run.duration / 60000.0

    // Riegel formula: T2 = T1 * (D2/D1)^1.06
    data class RacePrediction(
        val name: String,
        val distanceKm: Double,
        val predictedMinutes: Double
    )

    val predictions = remember(distanceKm, durationMin) {
        listOf(
            RacePrediction("5K", 5.0, durationMin * (5.0 / distanceKm).pow(1.06)),
            RacePrediction("10K", 10.0, durationMin * (10.0 / distanceKm).pow(1.06)),
            RacePrediction("Half Marathon", 21.0975, durationMin * (21.0975 / distanceKm).pow(1.06)),
            RacePrediction("Marathon", 42.195, durationMin * (42.195 / distanceKm).pow(1.06))
        ).filter { it.distanceKm > distanceKm * 0.8 } // Only show predictions for distances at/above current
    }

    if (predictions.isEmpty()) return

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.primary.copy(alpha = 0.3f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🏆", style = AppTextStyles.h3)
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        "Race Time Predictor",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "Based on today's ${String.format(Locale.US, "%.1f", distanceKm)}km effort (Riegel formula)",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            predictions.forEach { pred ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        pred.name,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textPrimary,
                        modifier = Modifier.width(110.dp)
                    )

                    // Predicted time
                    val totalSec = (pred.predictedMinutes * 60).toLong()
                    val hours = totalSec / 3600
                    val mins = (totalSec % 3600) / 60
                    val secs = totalSec % 60
                    val timeStr = if (hours > 0) {
                        String.format(Locale.US, "%d:%02d:%02d", hours, mins, secs)
                    } else {
                        String.format(Locale.US, "%d:%02d", mins, secs)
                    }

                    Text(
                        timeStr,
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.primary
                    )

                    // Predicted pace
                    val paceSecPerKm = (pred.predictedMinutes * 60 / pred.distanceKm)
                    Text(
                        formatPaceSeconds(paceSecPerKm.toLong()) + "/km",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }

                if (pred != predictions.last()) {
                    HorizontalDivider(color = Colors.border.copy(alpha = 0.2f))
                }
            }

            Text(
                "Predictions assume similar race conditions and a taper. Actual race performance depends on training, nutrition, and pacing strategy.",
                style = AppTextStyles.caption.copy(fontSize = 10.sp),
                color = Colors.textMuted
            )
        }
    }
}

/* =================== WEATHER PERFORMANCE INDEX =================== */

@Composable
private fun WeatherPerformanceCard(weather: WeatherData) {
    // Calculate weather impact score
    data class WeatherFactor(val name: String, val impact: String, val penalty: Double, val color: Color)

    val factors = remember(weather) {
        buildList {
            // Temperature impact
            val temp = weather.temperature
            val tempPenalty = when {
                temp < 5 -> abs(temp - 12) * 0.3  // Cold penalty
                temp in 5.0..15.0 -> 0.0           // Optimal
                temp in 15.0..20.0 -> (temp - 15) * 0.5
                temp in 20.0..25.0 -> (temp - 15) * 0.8
                temp in 25.0..30.0 -> (temp - 15) * 1.2
                else -> (temp - 15) * 1.5          // Hot
            }
            val tempLabel = when {
                temp < 5 -> "Cold"
                temp in 5.0..15.0 -> "Optimal"
                temp in 15.0..25.0 -> "Warm"
                else -> "Hot"
            }
            val tempColor = when {
                temp < 5 -> Color(0xFF42A5F5)
                temp in 5.0..15.0 -> Color(0xFF4CAF50)
                temp in 15.0..25.0 -> Color(0xFFFFC107)
                else -> Colors.error
            }
            add(WeatherFactor("Temperature", "${temp.toInt()}°C ($tempLabel)", tempPenalty, tempColor))

            // Humidity impact
            val humidity = weather.humidity
            val humidityPenalty = when {
                humidity < 40 -> 0.0
                humidity in 40.0..60.0 -> (humidity - 40) * 0.1
                humidity in 60.0..80.0 -> (humidity - 40) * 0.2
                else -> (humidity - 40) * 0.3
            }
            val humColor = if (humidity > 70) Color(0xFFFF9800) else Color(0xFF4CAF50)
            add(WeatherFactor("Humidity", "${humidity.toInt()}%", humidityPenalty, humColor))

            // Wind impact
            val wind = weather.windSpeed
            val windPenalty = when {
                wind < 10 -> 0.0
                wind in 10.0..20.0 -> (wind - 10) * 0.3
                else -> (wind - 10) * 0.5
            }
            val windColor = if (wind > 20) Colors.error else if (wind > 10) Color(0xFFFFC107) else Color(0xFF4CAF50)
            add(WeatherFactor("Wind", "${wind.toInt()} km/h", windPenalty, windColor))
        }
    }

    val totalPenalty = factors.sumOf { it.penalty }
    val performancePercent = (100 - totalPenalty).coerceIn(70.0, 100.0)
    val overallColor = when {
        performancePercent >= 95 -> Color(0xFF4CAF50)
        performancePercent >= 85 -> Color(0xFF8BC34A)
        performancePercent >= 75 -> Color(0xFFFFC107)
        else -> Color(0xFFFF9800)
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Weather Performance",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "How conditions affected your run",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
                // Performance percentage
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .background(overallColor.copy(alpha = 0.15f), CircleShape)
                        .border(2.dp, overallColor.copy(alpha = 0.5f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "${performancePercent.roundToInt()}%",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.ExtraBold),
                        color = overallColor
                    )
                }
            }

            factors.forEach { factor ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(factor.name, style = AppTextStyles.caption, color = Colors.textMuted, modifier = Modifier.width(90.dp))
                    Text(
                        factor.impact,
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                        color = factor.color
                    )
                    if (factor.penalty > 0.5) {
                        Text(
                            "-${String.format(Locale.US, "%.0f", factor.penalty)}%",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                            color = Colors.error
                        )
                    } else {
                        Text(
                            "Optimal",
                            style = AppTextStyles.caption,
                            color = Color(0xFF4CAF50)
                        )
                    }
                }
            }

            val desc = weather.condition ?: weather.description
            if (desc.isNotBlank()) {
                Text(
                    "Conditions: $desc",
                    style = AppTextStyles.small,
                    color = Colors.textMuted
                )
            }
        }
    }
}

/* -------------------------------- TAB: DATA -------------------------------- */

@Composable
private fun DataTabFlagship(
    run: RunSession,
    onDelete: () -> Unit = {},
    selectedTab: Int = 0,
    onTabSelected: (Int) -> Unit = {},
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = Spacing.md),
        contentPadding = PaddingValues(bottom = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        // Tabs for navigation
        item {
            RunTabsFlagship(selected = selectedTab, onSelected = onTabSelected)
        }

        // ==================== PACE SECTION ====================
        item {
            val bestPace = run.kmSplits.minByOrNull { parsePaceToSeconds(it.pace) }
            val worstPace = run.kmSplits.maxByOrNull { parsePaceToSeconds(it.pace) }
            
            DataSectionCard(
                title = "Pace",
                icon = "⏱️",
                metrics = buildList {
                    run.averagePace?.let { add("Avg Pace" to "$it/km") }
                    run.currentPace?.let { add("Current Pace" to "$it/km") }
                    if (bestPace != null) add("Best Km Pace" to bestPace.pace.replace("/km", "") + "/km")
                    if (worstPace != null) add("Slowest Km Pace" to worstPace.pace.replace("/km", "") + "/km")
                }
            )
        }

        // ==================== SPEED SECTION ====================
        item {
            // Detect if speed is already in km/h (>30 = clearly not m/s) or needs conversion from m/s
            // New runs from the app store in m/s, old runs from backend may be in km/h
            // Cap at 50 km/h to filter out garbage data (max human running speed ~45 km/h)
            val rawAvgSpeed = run.avgSpeed ?: run.averageSpeed
            val avgSpeedKmh = when {
                rawAvgSpeed <= 0 -> 0f
                rawAvgSpeed > 50 -> 0f // Invalid data - show nothing
                rawAvgSpeed > 30 -> rawAvgSpeed // Likely already km/h
                else -> rawAvgSpeed * 3.6f // Convert from m/s
            }
            
            val rawMaxSpeed = run.maxSpeed
            val maxSpeedKmh = when {
                rawMaxSpeed <= 0 -> 0f
                rawMaxSpeed > 50 -> 0f // Invalid data
                rawMaxSpeed > 30 -> rawMaxSpeed
                else -> rawMaxSpeed * 3.6f
            }
            
            // Calculate fastest and slowest speeds from km splits (pace is in min/km)
            val fastestPaceSeconds = run.kmSplits.minOfOrNull { parsePaceToSeconds(it.pace) } ?: 0
            val slowestPaceSeconds = run.kmSplits.maxOfOrNull { parsePaceToSeconds(it.pace) } ?: 0
            val fastestSpeedKmh = if (fastestPaceSeconds > 0) 60.0 / (fastestPaceSeconds / 60.0) else 0.0
            val slowestSpeedKmh = if (slowestPaceSeconds > 0) 60.0 / (slowestPaceSeconds / 60.0) else 0.0
            
            DataSectionCard(
                title = "Speed",
                icon = "⚡",
                metrics = buildList {
                    if (avgSpeedKmh > 0) add("Avg Speed" to String.format(Locale.US, "%.1f km/h", avgSpeedKmh))
                    if (fastestSpeedKmh > 0) add("Fastest Speed" to String.format(Locale.US, "%.1f km/h", fastestSpeedKmh))
                    if (slowestSpeedKmh > 0) add("Slowest Speed" to String.format(Locale.US, "%.1f km/h", slowestSpeedKmh))
                    if (maxSpeedKmh > 0) add("Max Speed" to String.format(Locale.US, "%.1f km/h", maxSpeedKmh))
                }
            )
        }

        // ==================== TIME SECTION ====================
        item {
            DataSectionCard(
                title = "Time",
                icon = "🕐",
                metrics = buildList {
                    add("Total Time" to run.getFormattedDuration())
                    run.movingTime?.let { add("Moving Time" to formatSecondsToHMS(it)) }
                    run.elapsedTime?.let { add("Elapsed Time" to formatMillisToHMS(it)) }
                }
            )
        }

        // ==================== RUNNING DYNAMICS SECTION ====================
        item {
            DataSectionCard(
                title = "Running Dynamics",
                icon = "👟",
                metrics = buildList {
                    if (run.cadence > 0) add("Avg Cadence" to "${run.cadence} spm")
                    run.maxCadence?.let { add("Max Cadence" to "$it spm") }
                    run.avgStrideLength?.let { add("Avg Stride Length" to String.format("%.0f cm", it * 100)) }
                }
            )
        }

        // ==================== HEART RATE SECTION ====================
        item {
            DataSectionCard(
                title = "Heart Rate",
                icon = "❤️",
                metrics = buildList {
                    if (run.heartRate > 0) add("Avg Heart Rate" to "${run.heartRate} bpm")
                    run.minHeartRate?.let { add("Min Heart Rate" to "$it bpm") }
                }
            )
        }

        // ==================== ELEVATION SECTION ====================
        item {
            DataSectionCard(
                title = "Elevation",
                icon = "⛰️",
                metrics = buildList {
                    if (run.totalElevationGain > 0) add("Total Ascent" to "${run.totalElevationGain.roundToInt()} m")
                    if (run.totalElevationLoss > 0) add("Total Descent" to "${run.totalElevationLoss.roundToInt()} m")
                    run.minElevation?.let { add("Min Elevation" to "${it.toInt()} m") }
                    run.maxElevation?.let { add("Max Elevation" to "${it.toInt()} m") }
                    // Convert percentage to degrees: 0°=flat, 90°=vertical
                    // Fall back to maxGradient for older runs that don't have steepest fields
                    val incline = run.steepestIncline ?: run.maxGradient.takeIf { it > 0 }
                    incline?.let {
                        val degrees = Math.toDegrees(Math.atan(it / 100.0))
                        add("Steepest Incline" to "${degrees.roundToInt()}°")
                    }
                    run.steepestDecline?.let { 
                        val degrees = Math.toDegrees(Math.atan(it / 100.0))
                        add("Steepest Decline" to "${degrees.roundToInt()}°") 
                    }
                }
            )
        }

        // ==================== DISTANCE SECTION ====================
        item {
            DataSectionCard(
                title = "Distance",
                icon = "📏",
                metrics = buildList {
                    add("Total Distance" to String.format("%.2f km", run.distance / 1000))
                }
            )
        }

        // ==================== STEPS SECTION ====================
        item {
            DataSectionCard(
                title = "Steps",
                icon = "👟",
                metrics = buildList {
                    run.totalSteps?.let { 
                        add("Total Steps" to "$it steps")
                        // Estimate calories from steps (roughly 0.04 kcal per step for running)
                        val estimatedCalories = (it * 0.04).toInt()
                        add("Est. Calories" to "$estimatedCalories kcal")
                    }
                    if (run.totalSteps == null || run.totalSteps == 0) {
                        add("Total Steps" to "-- steps")
                    }
                }
            )
        }

        // ==================== WEATHER SECTION ====================
        item {
            if (run.weatherAtStart != null) {
                WeatherCardFlagship(run.weatherAtStart!!)
            }
        }

        // ==================== TARGET SECTION ====================
        item {
            if (run.targetDistance != null || run.targetTime != null) {
                DataSectionCard(
                    title = "Goals",
                    icon = "🎯",
                    metrics = buildList {
                        run.targetDistance?.let { add("Target Distance" to String.format("%.2f km", it)) }
                        run.targetTime?.let { add("Target Time" to formatMillisToHMS(it)) }
                        run.wasTargetAchieved?.let { 
                            add("Target Achieved" to if (it) "✅ Yes" else "❌ No") 
                        }
                    }
                )
            }
        }

        // ==================== KM SPLITS SECTION ====================
        item {
            if (run.kmSplits.isNotEmpty()) {
                KmSplitsCard(run.kmSplits)
            }
        }

        // Delete run button at the bottom of the tab
        item {
            Spacer(modifier = Modifier.height(Spacing.md))
            OutlinedButton(
                onClick = onDelete,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Colors.error
                ),
                border = ButtonDefaults.outlinedButtonBorder.copy(
                    brush = SolidColor(Colors.error)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete",
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete Run", fontWeight = FontWeight.Medium)
            }
        }

        item { Spacer(modifier = Modifier.height(Spacing.sm)) }
    }
}

@Composable
private fun DataSectionCard(
    title: String,
    icon: String,
    metrics: List<Pair<String, String>>
) {
    if (metrics.isEmpty()) return
    
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.5f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(bottom = 12.dp)
            ) {
                Text(icon, style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    title, 
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), 
                    color = Colors.textPrimary
                )
            }
            
            // Metrics grid - 2 columns
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                metrics.chunked(2).forEach { rowMetrics ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        rowMetrics.forEach { (label, value) ->
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    label, 
                                    style = AppTextStyles.caption, 
                                    color = Colors.textMuted
                                )
                                Text(
                                    value, 
                                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), 
                                    color = Colors.textPrimary
                                )
                            }
                        }
                        // Fill empty space if odd number of items
                        if (rowMetrics.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun KmSplitsCard(kmSplits: List<KmSplit>) {
    // split.time is already the duration of just that km in milliseconds — no subtraction needed
    
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.5f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(bottom = 12.dp)
            ) {
                Text("📊", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    "Km Splits", 
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), 
                    color = Colors.textPrimary
                )
            }
            
            // Header row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Km", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(0.8f))
                Text("Time", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(1f))
                Text("Pace", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(1f))
            }
            
            HorizontalDivider(color = Colors.border.copy(alpha = 0.3f), modifier = Modifier.padding(vertical = 8.dp))
            
            // Show all splits — split.time is ms, divide by 1000 to get seconds
            kmSplits.forEach { split ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("${split.km}", style = AppTextStyles.body, color = Colors.textSecondary, modifier = Modifier.weight(0.8f))
                    Text(formatSecondsToHMS(split.time / 1000), style = AppTextStyles.body, color = Colors.textSecondary, modifier = Modifier.weight(1f))
                    Text("${split.pace}/km", style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.primary, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

private fun formatSecondsToHMS(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, s) else String.format("%d:%02d", m, s)
}

private fun formatMillisToHMS(millis: Long): String = formatSecondsToHMS(millis / 1000)

@Composable
private fun DataGroupCardFlagship(
    title: String,
    rows: List<Pair<String, String>>
) {
    if (rows.isEmpty()) return
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)

            rows.forEachIndexed { idx, (label, value) ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(label, style = AppTextStyles.body, color = Colors.textSecondary)
                    Text(value, style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.textPrimary)
                }
                if (idx < rows.lastIndex) {
                    HorizontalDivider(color = Colors.border.copy(alpha = 0.8f))
                }
            }
        }
    }
}

@Composable
private fun WeatherCardFlagship(weather: WeatherData) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Weather Conditions", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                WeatherMetricFlagship("Temp", "${weather.temperature.toInt()}°C")
                WeatherMetricFlagship("Humidity", "${weather.humidity.toInt()}%")
                WeatherMetricFlagship("Wind", "${weather.windSpeed.toInt()} km/h")
            }

            val desc = weather.condition ?: weather.description
            if (!desc.isNullOrBlank()) {
                Text(desc, style = AppTextStyles.body, color = Colors.textSecondary)
            }
        }
    }
}

@Composable
private fun WeatherMetricFlagship(label: String, value: String) {
    Column {
        Text(label, style = AppTextStyles.caption, color = Colors.textMuted)
        Text(value, style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.textPrimary)
    }
}

/* ---------------------------- TAB: ACHIEVEMENTS ---------------------------- */

@Composable
private fun AchievementsTabFlagship(
    run: RunSession,
    analysisState: AiAnalysisState,
    onDelete: () -> Unit = {},
    selectedTab: Int = 0,
    onTabSelected: (Int) -> Unit = {},
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = Spacing.lg),
        contentPadding = PaddingValues(bottom = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg)
    ) {
        // Tabs for navigation
        item {
            RunTabsFlagship(selected = selectedTab, onSelected = onTabSelected)
        }

        item {
            Text(
                text = "Badges",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.ExtraBold),
                color = Colors.textPrimary
            )
        }

        item {
            when (analysisState) {
                is AiAnalysisState.Comprehensive -> {
                    if (analysisState.analysis.personalBests.isNotEmpty()) {
                        PersonalBestsCardFlagship(analysisState.analysis.personalBests)
                    } else {
                        EmptyStateCardFlagship("No personal bests detected on this run.")
                    }
                }

                is AiAnalysisState.Basic -> EmptyStateCardFlagship("Generate comprehensive insights to detect personal bests.")
                else -> EmptyStateCardFlagship("Generate AI insights to see badges and personal bests.")
            }
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth(),
                border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Rate This Run", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Text("Add ratings and badges here later.", style = AppTextStyles.body, color = Colors.textSecondary)
                }
            }
        }

        // Delete run button at the bottom of the tab
        item {
            Spacer(modifier = Modifier.height(Spacing.md))
            OutlinedButton(
                onClick = onDelete,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Colors.error
                ),
                border = ButtonDefaults.outlinedButtonBorder.copy(
                    brush = SolidColor(Colors.error)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete",
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete Run", fontWeight = FontWeight.Medium)
            }
        }

        item { Spacer(modifier = Modifier.height(Spacing.sm)) }
    }
}

@Composable
private fun PersonalBestsCardFlagship(items: List<String>) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, Colors.warning),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Personal Bests", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.warning)
            BulletListFlagship(items, bulletColor = Colors.warning)
        }
    }
}

@Composable
private fun EmptyStateCardFlagship(text: String) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Text(
            text = text,
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            modifier = Modifier.padding(16.dp)
        )
    }
}

/* --------------------------------- DIALOGS -------------------------------- */

@Composable
private fun RenameDialogFlagship(
    runNameDraft: String,
    onDraftChange: (String) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Rename Run", color = Colors.textPrimary) },
        text = {
            OutlinedTextField(
                value = runNameDraft,
                onValueChange = onDraftChange,
                placeholder = { Text("e.g., Morning tempo", color = Colors.textMuted) },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Colors.textPrimary,
                    unfocusedTextColor = Colors.textPrimary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Colors.border,
                    cursorColor = Colors.primary
                )
            )
        },
        confirmButton = { TextButton(onClick = onSave) { Text("Save", color = Colors.primary) } },
        dismissButton = { TextButton(onClick = onCancel) { Text("Cancel", color = Colors.textSecondary) } },
        containerColor = Colors.backgroundSecondary
    )
}

/* --------------------------------- ERROR/LOADING --------------------------- */

@Composable
private fun CenterLoading(padding: PaddingValues) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(color = Colors.primary)
    }
}

@Composable
private fun ErrorViewFlagship(
    error: String,
    onBack: () -> Unit,
    onLogin: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(Spacing.xl)
        ) {
            Text(
                text = "Error",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.ExtraBold),
                color = Colors.error
            )
            Spacer(modifier = Modifier.height(Spacing.md))
            Text(
                text = error,
                style = AppTextStyles.body,
                color = Colors.textSecondary,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(Spacing.lg))
            Button(
                onClick = if (error.contains("log in", ignoreCase = true)) onLogin else onBack,
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                shape = RoundedCornerShape(14.dp)
            ) {
                Text(
                    text = if (error.contains("log in", ignoreCase = true)) "Log In" else "Go Back",
                    color = Colors.backgroundRoot,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                )
            }
        }
    }
}

/* -------------------------------- GARMIN RECOGNITION --------------------------------- */

@Composable
private fun GarminPoweredByBadge(text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.md, vertical = Spacing.xs),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_garmin_connect_logo),
            contentDescription = "Garmin Connect",
            modifier = Modifier.size(20.dp),
            contentScale = ContentScale.Fit
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = text,
            style = AppTextStyles.caption.copy(
                fontSize = 11.sp,
                color = Color(0xFF8E9BAE),
                letterSpacing = 0.3.sp
            )
        )
    }
}

/* -------------------------------- HELPERS --------------------------------- */

private fun shareRunText(context: Context, session: RunSession?) {
    val msg = buildShareMessage(session)
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, msg)
    }
    context.startActivity(Intent.createChooser(shareIntent, "Share run"))
}

private fun buildShareMessage(session: RunSession?): String {
    if (session == null) return "Tracked with AI Run Coach!"
    val distance = String.format(Locale.US, "%.2f", session.getDistanceInKm())
    val duration = formatDuration(session.duration)
    val pace = session.averagePace?.replace("/km", "") ?: "--:--"
    return "I just completed a $distance km run in $duration! Average pace: $pace/km. Tracked with AI Run Coach!"
}

/**
 * Optional: share a bitmap of a Composable “card”.
 * You can wire this later if you want true “share image”.
 */
private fun viewToBitmap(view: View): Bitmap {
    // If you embed a ComposeView, you can call drawToBitmap() directly.
    // This helper stays here for future wiring.
    return view.drawToBitmap()
}

private fun formatDuration(millis: Long): String {
    val seconds = millis / 1000
    val minutes = seconds / 60
    val hours = minutes / 60
    return if (hours > 0) {
        String.format(Locale.US, "%d:%02d:%02d", hours, minutes % 60, seconds % 60)
    } else {
        String.format(Locale.US, "%d:%02d", minutes, seconds % 60)
    }
}

private fun formatPaceSeconds(secondsPerKm: Long): String {
    val s = secondsPerKm.coerceAtLeast(0)
    val m = s / 60
    val sec = s % 60
    return String.format(Locale.US, "%d:%02d", m, sec)
}

private fun getBestPace(splits: List<KmSplit>): String {
    return if (splits.isNotEmpty()) {
        val best = splits.minByOrNull { it.time }
        best?.pace?.let { if (it.contains("/km")) it else "$it/km" } ?: "—"
    } else "—"
}

private fun effortLabelFromScore(score: Int): String {
    return when {
        score >= 85 -> "Max effort"
        score >= 70 -> "Hard effort"
        score >= 55 -> "Moderate effort"
        score >= 40 -> "Easy effort"
        else -> "Very easy effort"
    }
}

private fun paceDeltaString(lastPace: String, currentPace: String?): String? {
    val cur = currentPace ?: return null
    val lastSec = paceStringToSeconds(lastPace) ?: return null
    val curSec = paceStringToSeconds(cur) ?: return null
    val diff = curSec - lastSec // positive = slower, negative = faster
    val abs = kotlin.math.abs(diff)
    val mm = abs / 60
    val ss = abs % 60
    return if (diff < 0) "▲ ${mm}:${ss.toString().padStart(2, '0')} faster /km"
    else if (diff > 0) "▼ ${mm}:${ss.toString().padStart(2, '0')} slower /km"
    else "• same pace"
}

private fun paceStringToSeconds(pace: String): Int? {
    // accepts "5:12/km" or "5:12"
    val clean = pace.replace("/km", "").trim()
    val parts = clean.split(":")
    if (parts.size != 2) return null
    val m = parts[0].toIntOrNull() ?: return null
    val s = parts[1].toIntOrNull() ?: return null
    return (m * 60 + s)
}

/* ------------------------- SERIES BUILDERS (PACE/ELEV) ---------------------- */

private fun buildPaceSeriesVico2(
    routePoints: List<LocationPoint>,
    kmSplits: List<KmSplit>,
    mode: ChartMode
): LabeledSeries {

    if (kmSplits.size < 2) {
        return LabeledSeries(emptyList(), emptyList(), emptyList())
    }

    val x = mutableListOf<Double>()
    val y = mutableListOf<Double>()
    val labels = mutableListOf<String>()

    var cumulativeSec = 0.0

    kmSplits.forEachIndexed { index, split ->
        val sec = (split.time / 1000.0).coerceAtLeast(1.0)
        cumulativeSec += sec

        x.add(index.toDouble())
        y.add(sec)

        val label = if (mode == ChartMode.Time) {
            val minutes = cumulativeSec / 60.0
            String.format(Locale.US, "%.0f", minutes)
        } else {
            (index + 1).toString()
        }

        labels.add(label)
    }

    return LabeledSeries(x, y, labels)
}

/* ==================== STRUGGLE POINT ANALYSIS SECTION ==================== */

@Composable
private fun StrugglePointAnalysisSection(
    strugglePoints: List<StrugglePoint>,
    onComment: (String, String) -> Unit,
    onDismiss: (String, DismissReason) -> Unit,
    onRestore: (String) -> Unit
) {
    val relevant = strugglePoints.filter { it.isRelevant }
    val dismissed = strugglePoints.filter { !it.isRelevant }
    var showDismissed by remember { mutableStateOf(false) }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.warning.copy(alpha = 0.4f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("⚠️", style = AppTextStyles.h3)
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            "Struggle Point Analysis",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                            color = Colors.textPrimary
                        )
                        Text(
                            "${relevant.size} detected • ${dismissed.size} dismissed",
                            style = AppTextStyles.caption,
                            color = Colors.textMuted
                        )
                    }
                }
                // Summary badge
                Box(
                    modifier = Modifier
                        .background(Colors.warning.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
                        .border(1.dp, Colors.warning.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        "${strugglePoints.size} total",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = Colors.warning
                    )
                }
            }

            Text(
                "Moments where your pace dropped significantly. Add context to help your AI coach understand why.",
                style = AppTextStyles.small,
                color = Colors.textSecondary
            )

            // Relevant struggle points
            relevant.forEachIndexed { index, point ->
                StrugglePointCard(
                    point = point,
                    index = index + 1,
                    onComment = onComment,
                    onDismiss = onDismiss
                )
            }

            // Dismissed struggle points (collapsible)
            if (dismissed.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { showDismissed = !showDismissed }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Dismissed (${dismissed.size})",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textMuted,
                        modifier = Modifier.weight(1f)
                    )
                    Icon(
                        imageVector = if (showDismissed) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        tint = Colors.textMuted,
                        modifier = Modifier.size(18.dp)
                    )
                }

                AnimatedVisibility(visible = showDismissed, enter = fadeIn(), exit = fadeOut()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        dismissed.forEach { point ->
                            DismissedStrugglePointRow(
                                point = point,
                                onRestore = onRestore
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StrugglePointCard(
    point: StrugglePoint,
    index: Int,
    onComment: (String, String) -> Unit,
    onDismiss: (String, DismissReason) -> Unit
) {
    var expanded by remember { mutableStateOf(true) }
    var commentDraft by remember(point.userComment) { mutableStateOf(point.userComment ?: "") }
    var showDismissOptions by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundTertiary.copy(alpha = 0.3f)),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Colors.warning.copy(alpha = 0.25f))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            // Main row — always visible
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { expanded = !expanded },
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Index circle
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(Colors.warning.copy(alpha = 0.2f), CircleShape)
                        .border(1.dp, Colors.warning.copy(alpha = 0.4f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "$index",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.warning
                    )
                }

                Spacer(modifier = Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            String.format(Locale.US, "%.2f km", point.distanceMeters / 1000.0),
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        // Pace drop badge
                        Box(
                            modifier = Modifier
                                .background(Colors.error.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(
                                "↓ ${String.format(Locale.US, "%.0f", point.paceDropPercent)}%",
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                color = Colors.error
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(2.dp))

                    // Pace comparison
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            "${point.paceAtStruggle}/km",
                            style = AppTextStyles.caption,
                            color = Colors.error
                        )
                        Text("vs", style = AppTextStyles.caption, color = Colors.textMuted)
                        Text(
                            "${point.baselinePace}/km baseline",
                            style = AppTextStyles.caption,
                            color = Color(0xFF4CAF50)
                        )
                    }

                    // Additional context
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (point.heartRate != null && point.heartRate > 0) {
                            Text(
                                "❤️ ${point.heartRate} bpm",
                                style = AppTextStyles.caption,
                                color = Colors.textMuted
                            )
                        }
                        if (point.currentGrade != null && abs(point.currentGrade) > 1.0) {
                            Text(
                                "⛰️ ${String.format(Locale.US, "%.1f", point.currentGrade)}% grade",
                                style = AppTextStyles.caption,
                                color = Colors.textMuted
                            )
                        }
                    }

                    // Show saved comment if present
                    if (!point.userComment.isNullOrBlank() && !expanded) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "💬 ${point.userComment}",
                            style = AppTextStyles.caption,
                            color = Colors.primary
                        )
                    }
                }

                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = "Expand",
                    tint = Colors.textMuted,
                    modifier = Modifier.size(20.dp)
                )
            }

            // Expanded section: comment input + dismiss options
            AnimatedVisibility(visible = expanded, enter = fadeIn(), exit = fadeOut()) {
                Column(
                    modifier = Modifier.padding(top = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Comment input
                    OutlinedTextField(
                        value = commentDraft,
                        onValueChange = { commentDraft = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 56.dp),
                        placeholder = {
                            Text(
                                "Why did you slow down here? (e.g. traffic light, stitch, hill...)",
                                color = Colors.textMuted,
                                style = AppTextStyles.caption
                            )
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Colors.textPrimary,
                            unfocusedTextColor = Colors.textPrimary,
                            focusedBorderColor = Colors.primary.copy(alpha = 0.6f),
                            unfocusedBorderColor = Colors.border,
                            cursorColor = Colors.primary,
                            focusedContainerColor = Colors.backgroundSecondary,
                            unfocusedContainerColor = Colors.backgroundSecondary,
                        ),
                        shape = RoundedCornerShape(10.dp),
                        textStyle = AppTextStyles.caption
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Save comment button
                        Button(
                            onClick = {
                                onComment(point.id, commentDraft)
                                expanded = false
                            },
                            enabled = commentDraft.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Colors.primary,
                                disabledContainerColor = Colors.primary.copy(alpha = 0.3f)
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(vertical = 8.dp)
                        ) {
                            Text(
                                "Save Comment",
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                color = Colors.backgroundRoot
                            )
                        }

                        // Dismiss button
                        OutlinedButton(
                            onClick = { showDismissOptions = !showDismissOptions },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(vertical = 8.dp),
                            border = ButtonDefaults.outlinedButtonBorder.copy(
                                brush = SolidColor(Colors.textMuted.copy(alpha = 0.5f))
                            )
                        ) {
                            Text(
                                "Mark Irrelevant",
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.textSecondary
                            )
                        }
                    }

                    // Dismiss reason chips
                    AnimatedVisibility(visible = showDismissOptions) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                "Why was this not a real struggle?",
                                style = AppTextStyles.caption,
                                color = Colors.textMuted
                            )
                            // Chip flow
                            val reasons = DismissReason.entries
                            val rows = reasons.chunked(3)
                            rows.forEach { rowReasons ->
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    rowReasons.forEach { reason ->
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(999.dp))
                                                .background(Colors.backgroundSecondary)
                                                .border(
                                                    1.dp,
                                                    Colors.textMuted.copy(alpha = 0.3f),
                                                    RoundedCornerShape(999.dp)
                                                )
                                                .clickable { onDismiss(point.id, reason) }
                                                .padding(horizontal = 10.dp, vertical = 6.dp)
                                        ) {
                                            Text(
                                                reason.getDisplayText(),
                                                style = AppTextStyles.caption,
                                                color = Colors.textSecondary
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DismissedStrugglePointRow(
    point: StrugglePoint,
    onRestore: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Colors.backgroundTertiary.copy(alpha = 0.15f))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                String.format(Locale.US, "%.2f km — ${point.paceAtStruggle}/km", point.distanceMeters / 1000.0),
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )
            point.dismissReason?.let {
                Text(
                    "Reason: ${it.getDisplayText()}",
                    style = AppTextStyles.caption.copy(fontSize = 10.sp),
                    color = Colors.textMuted.copy(alpha = 0.7f)
                )
            }
        }
        TextButton(
            onClick = { onRestore(point.id) },
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
        ) {
            Text(
                "Restore",
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.primary
            )
        }
    }
}
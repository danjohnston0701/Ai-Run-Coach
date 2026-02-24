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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Edit
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import live.airuncoach.airuncoach.domain.model.StrugglePoint
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.network.model.BasicRunInsights
import live.airuncoach.airuncoach.network.model.ComprehensiveRunAnalysis
import live.airuncoach.airuncoach.network.model.GarminInsights
import live.airuncoach.airuncoach.network.model.TechnicalAnalysis
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.AiAnalysisState
import live.airuncoach.airuncoach.viewmodel.RunSummaryViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

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

    val context = LocalContext.current

    LaunchedEffect(runId) {
        if (runSession == null && loadError == null) {
            viewModel.loadRunById(runId)
        }
    }

    var selectedTab by remember { mutableStateOf(0) }
    var showRenameDialog by remember { mutableStateOf(false) }
    var runNameDraft by remember { mutableStateOf("") }

    LaunchedEffect(runSession?.name) {
        runNameDraft = runSession?.name.orEmpty()
    }

    Scaffold(
        containerColor = Colors.backgroundRoot,
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
                    shareRunText(context, runSession)
                },
                difficultyLabel = runSession?.let { (it.difficulty ?: it.getDifficultyLevel()).uppercase(Locale.getDefault()) }
            )
        }
    ) { padding ->
        when {
            isLoadingRun -> CenterLoading(padding)
            loadError != null -> ErrorViewFlagship(loadError!!, onNavigateBack, onNavigateToLogin)
            runSession != null -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) {
                    RunTabsFlagship(
                        selected = selectedTab,
                        onSelected = { selectedTab = it }
                    )

                    when (selectedTab) {
                        0 -> SummaryTabFlagship(
                            run = runSession!!,
                            lastRunForDelta = lastRunForDelta,
                            analysisState = analysisState,
                            strugglePoints = strugglePoints,
                            comments = userPostRunComments,
                            onCommentsChange = viewModel::updatePostRunComments,
                            onGenerateAi = { viewModel.generateAIAnalysis() },
                            onShareCard = {
                                // share a “summary card” (text now; optional bitmap helper included below)
                                shareRunText(context, runSession)
                            },
                            isAdmin = isAdmin,
                            onDelete = {
                                viewModel.deleteRun(
                                    onSuccess = { onNavigateBack() },
                                    onError = { error -> Log.e("RunSummaryScreen", "Delete error: $error") }
                                )
                            }
                        )

                        1 -> DataTabFlagship(runSession!!)
                        2 -> AchievementsTabFlagship(runSession!!, analysisState)
                    }
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
    TopAppBar(
        title = {
            Column {
                Text(title, style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold))
                if (subtitle.isNotBlank()) {
                    Text(subtitle, style = AppTextStyles.small, color = Colors.textSecondary)
                }
            }
        },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
            }
        },
        actions = {
            IconButton(onClick = onRename) {
                Icon(Icons.Default.Edit, contentDescription = "Rename", tint = Colors.textPrimary)
            }
            IconButton(onClick = onShare) {
                Icon(
                    painter = painterResource(R.drawable.icon_share_vector),
                    contentDescription = "Share",
                    tint = Colors.textPrimary
                )
            }
            if (!difficultyLabel.isNullOrBlank()) {
                DifficultyPillFlagship(label = difficultyLabel)
                Spacer(modifier = Modifier.width(Spacing.sm))
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Colors.backgroundRoot,
            titleContentColor = Colors.textPrimary
        )
    )
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
    val labels = listOf("Summary", "Data", "Achievements")
    TabRow(
        selectedTabIndex = selected,
        containerColor = Colors.backgroundRoot,
        contentColor = Colors.primary,
        divider = { HorizontalDivider(color = Colors.border) }
    ) {
        labels.forEachIndexed { index, text ->
            Tab(
                selected = selected == index,
                onClick = { onSelected(index) },
                text = {
                    Text(
                        text = text,
                        style = AppTextStyles.body.copy(
                            fontWeight = if (selected == index) FontWeight.Bold else FontWeight.Medium
                        )
                    )
                }
            )
        }
    }
}

/* ------------------------------- TAB: SUMMARY ------------------------------ */

@Composable
private fun SummaryTabFlagship(
    run: RunSession,
    lastRunForDelta: RunSession?,
    analysisState: AiAnalysisState,
    strugglePoints: List<StrugglePoint> = emptyList(),
    comments: String,
    onCommentsChange: (String) -> Unit,
    onGenerateAi: () -> Unit,
    onShareCard: () -> Unit,
    onDelete: () -> Unit,
    isAdmin: Boolean = false,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = Spacing.lg),
        contentPadding = PaddingValues(vertical = Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg)
    ) {
        item { SuccessBannerFlagship() }

        item {
            ShareableSummaryCard(
                run = run,
                lastRunForDelta = lastRunForDelta,
                onShare = onShareCard
            )
        }

        item {
            if (run.routePoints.isNotEmpty()) {
                RouteMapCardFlagship(points = run.routePoints)
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

        // Struggle Point Analysis
        if (strugglePoints.isNotEmpty()) {
            item {
                Text(
                    text = "Struggle Points",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
                strugglePoints.forEachIndexed { index, point ->
                    StrugglePointRow(point = point, index = index + 1)
                    if (index < strugglePoints.size - 1) {
                        Spacer(modifier = Modifier.height(Spacing.sm))
                    }
                }
            }
        }

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
                onCommentsChange = onCommentsChange,
                onGenerateAi = onGenerateAi
            )
        }

        item { ChartsSectionFlagship(run = run) }

        item { HeartRateZonesCardFlagship(heartRateData = run.heartRateData) }

        // Delete run button at the bottom of the screen
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

        // AI Coaching Log - only visible to admin users
        if (isAdmin && run.aiCoachingNotes.isNotEmpty()) {
            item {
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    text = "AI Coaching Log",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
            }

            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(Spacing.md)) {
                        run.aiCoachingNotes.forEach { note ->
                            val timeStr = formatDuration(note.time)
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = Spacing.sm)
                            ) {
                                Text(
                                    text = timeStr,
                                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                    color = Colors.primary
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = note.message,
                                    style = AppTextStyles.body,
                                    color = Colors.textSecondary
                                )
                            }
                            HorizontalDivider(
                                color = Colors.textMuted.copy(alpha = 0.1f),
                                modifier = Modifier.padding(vertical = Spacing.xs)
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
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

/* -------------------------- SHAREABLE SUMMARY CARD ------------------------- */

@Composable
private fun ShareableSummaryCard(
    run: RunSession,
    lastRunForDelta: RunSession?,
    onShare: () -> Unit
) {
    val distanceKm = run.distance / 1000.0
    val duration = formatDuration(run.duration)
    val avgPace = run.averagePace?.replace("/km", "") ?: "--:--"

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

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                SummaryMiniStat("Distance", String.format(Locale.US, "%.2f km", distanceKm), Colors.primary)
                SummaryMiniStat("Duration", duration, Colors.success)
                SummaryMiniStat("Avg Pace", "$avgPace /km", Colors.accent)
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
private fun SummaryMiniStat(label: String, value: String, accent: Color) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(accent.copy(alpha = 0.10f))
            .border(1.dp, accent.copy(alpha = 0.18f), RoundedCornerShape(14.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Text(label, style = AppTextStyles.caption, color = Colors.textMuted)
        Text(value, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
    }
}

/* ----------------------------- HEADER DISTANCE ----------------------------- */

@Composable
private fun HeaderDistanceBlockFlagship(run: RunSession) {
    val distanceKm = run.distance / 1000.0
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = String.format(Locale.US, "%.2f", distanceKm),
                style = AppTextStyles.stat.copy(fontSize = 48.sp, lineHeight = 54.sp),
                color = Colors.primary
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "km",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary,
                modifier = Modifier.padding(bottom = 6.dp)
            )
        }

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
    val stats = remember(run, lastRunForDelta) {
        buildList {
            add(StatTile("Duration", formatDuration(run.duration), R.drawable.icon_clock_vector, Colors.primary))
            add(
                StatTile(
                    "Avg Pace",
                    run.averagePace?.replace("/km", "") ?: "--:--",
                    R.drawable.icon_trending_vector,
                    Colors.accent,
                    delta = lastRunForDelta?.averagePace?.let { paceDeltaString(it, run.averagePace) }
                )
            )
            if (run.heartRate > 0) add(StatTile("Avg HR", "${run.heartRate} bpm", R.drawable.icon_heart_vector, Colors.error))
            if (run.calories > 0) add(StatTile("Calories", "${run.calories} kcal", R.drawable.icon_target_vector, Colors.warning))
            if (run.totalElevationGain > 0) add(StatTile("Elev Gain", "${run.totalElevationGain.roundToInt()} m", R.drawable.icon_trending_vector, Colors.success))
            if (run.cadence > 0) add(StatTile("Cadence", "${run.cadence} spm", R.drawable.icon_repeat_vector, Colors.primary))
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
    onCommentsChange: (String) -> Unit,
    onGenerateAi: () -> Unit
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

                is AiAnalysisState.Error,
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
                        loading = analysisState is AiAnalysisState.Loading,
                        onClick = onGenerateAi
                    )

                    if (analysisState is AiAnalysisState.Error) {
                        Text(
                            text = analysisState.message,
                            style = AppTextStyles.caption,
                            color = Colors.error
                        )
                    }
                }
            }
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
private fun RouteMapCardFlagship(points: List<LocationPoint>) {
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
            .height(260.dp),
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
                    zoomControlsEnabled = false,
                    myLocationButtonEnabled = false,
                    compassEnabled = false,
                    mapToolbarEnabled = false,
                    scrollGesturesEnabled = false,
                    zoomGesturesEnabled = false,
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
                    yUnitHint = "min/km"
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
                        title,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                        Text(subtitleLeft, style = AppTextStyles.caption, color = Colors.textSecondary)
                        Text(subtitleRight, style = AppTextStyles.caption, color = Colors.textSecondary)
                    }
                }
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(accent, CircleShape)
                )
            }

            content()
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
    modifier: Modifier = Modifier,
    height: Dp = 220.dp
) {
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
            .height(height)
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
            val minY = yVals.minOrNull() ?: 0.0
            val maxY = yVals.maxOrNull() ?: 0.0
            val rangeY = (maxY - minY).takeIf { it > 1e-9 } ?: 1.0

            // padding inside the canvas for axis labels
            val leftPadPx = 46.dp.toPx()
            val bottomPadPx = 22.dp.toPx()
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
                return topPadPx + (1f - t) * plotH
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

                val value = maxY - (t.toDouble() * rangeY)
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

            // Fill gradient
            drawPath(
                path = fillPath,
                brush = Brush.verticalGradient(
                    colors = listOf(
                        lineColor.copy(alpha = 0.22f),
                        lineColor.copy(alpha = 0.02f),
                        Color.Transparent
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

            // --- x labels (start / mid / end) ---
            val xLabelIndices = listOf(0, (n - 1) / 2, n - 1).distinct()
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
                    drawText(label, x, topPadPx + plotH + 16.dp.toPx(), p)
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

            // x title (bottom-right)
            drawContext.canvas.nativeCanvas.apply {
                val p = android.graphics.Paint().apply {
                    isAntiAlias = true
                    color = Colors.textMuted.copy(alpha = 0.85f).toArgb()
                    textSize = 11.sp.toPx()
                    textAlign = android.graphics.Paint.Align.RIGHT
                }
                drawText(xTitle, leftPadPx + plotW, topPadPx + plotH + 16.dp.toPx(), p)
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

    val xOut = mutableListOf<Double>()
    val yOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()

    val startTs = valid.first().timestamp
    var cumulativeMeters = 0.0
    val step = (valid.size / 260f).coerceAtLeast(1f).toInt()

    var i = 1
    while (i < valid.size) {
        val prev = valid[i - 1]
        val curr = valid[i]

        val dtSec = (curr.timestamp - prev.timestamp) / 1000.0
        if (dtSec <= 0) { i += step; continue }

        val d = haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
        if (d < 1.0) { i += step; continue }

        cumulativeMeters += d
        val speed = d / dtSec
        if (speed <= 0) { i += step; continue }

        val paceSecPerKm = (1000.0 / speed)

        val xLabel = if (mode == ChartMode.Time) {
            val minutes = ((curr.timestamp - startTs) / 1000.0 / 60.0)
            String.format(java.util.Locale.US, "%.0f", minutes)
        } else {
            val km = cumulativeMeters / 1000.0
            String.format(java.util.Locale.US, "%.1f", km)
        }

        xOut.add(xOut.size.toDouble())
        yOut.add(paceSecPerKm)
        labels.add(xLabel)

        i += step
    }

    val smoothedY = smoothY(yOut, window = 7)
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

    val xOut = mutableListOf<Double>()
    val yOut = mutableListOf<Double>()
    val labels = mutableListOf<String>()

    val startTs = valid.first().timestamp
    var cumulativeMeters = 0.0
    val step = (valid.size / 260f).coerceAtLeast(1f).toInt()

    var i = 1
    while (i < valid.size) {
        val prev = valid[i - 1]
        val curr = valid[i]

        cumulativeMeters += haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude)

        val alt = curr.altitude ?: run { i += step; continue }

        val xLabel = if (mode == ChartMode.Time) {
            val minutes = ((curr.timestamp - startTs) / 1000.0 / 60.0)
            String.format(java.util.Locale.US, "%.0f", minutes)
        } else {
            val km = cumulativeMeters / 1000.0
            String.format(java.util.Locale.US, "%.1f", km)
        }

        xOut.add(xOut.size.toDouble())
        yOut.add(alt.toDouble())
        labels.add(xLabel)

        i += step
    }

    val smoothedY = smoothY(yOut, window = 5)
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

private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6371000.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
    return r * (2 * atan2(sqrt(a), sqrt(1 - a)))
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

/* -------------------------------- TAB: DATA -------------------------------- */

@Composable
private fun DataTabFlagship(run: RunSession) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = Spacing.md),
        contentPadding = PaddingValues(vertical = Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        // ==================== PACE SECTION ====================
        item {
            DataSectionCard(
                title = "Pace",
                icon = "⏱️",
                metrics = buildList {
                    run.averagePace?.let { add("Avg Pace" to "$it/km") }
                    run.averagePace?.let { add("Avg Moving Pace" to "$it/km") } // Using avg as proxy for now
                    run.currentPace?.let { add("Current Pace" to "$it/km") }
                    add("Best Km Pace" to (run.kmSplits.minByOrNull { it.pace }?.pace?.replace("/km", "") ?: "--:--") + "/km")
                }
            )
        }

        // ==================== SPEED SECTION ====================
        item {
            val avgSpeedKmh = run.averageSpeed * 3.6f
            val maxSpeedKmh = run.maxSpeed * 3.6f
            DataSectionCard(
                title = "Speed",
                icon = "⚡",
                metrics = buildList {
                    if (run.averageSpeed > 0) add("Avg Speed" to String.format("%.1f km/h", avgSpeedKmh))
                    if (run.avgSpeed != null && run.avgSpeed > 0) add("Avg Moving Speed" to String.format("%.1f km/h", run.avgSpeed * 3.6))
                    if (run.maxSpeed > 0) add("Max Speed" to String.format("%.1f km/h", maxSpeedKmh))
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
                    run.steepestIncline?.let { add("Steepest Incline" to "${it.toInt()}%") }
                    run.steepestDecline?.let { add("Steepest Decline" to "${-it.toInt()}%") }
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

        // ==================== CALORIES SECTION ====================
        item {
            DataSectionCard(
                title = "Calories",
                icon = "🔥",
                metrics = buildList {
                    if (run.calories > 0) add("Total Calories" to "${run.calories} kcal")
                    run.activeCalories?.let { add("Active Calories" to "$it kcal") }
                    run.restingCalories?.let { add("Resting Calories" to "$it kcal") }
                    run.estSweatLoss?.let { add("Est. Sweat Loss" to String.format("%.1f L", it)) }
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

        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
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
                Text("Km", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(1f))
                Text("Time", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(1f))
                Text("Pace", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(1f))
            }
            
            HorizontalDivider(color = Colors.border.copy(alpha = 0.3f), modifier = Modifier.padding(vertical = 8.dp))
            
            kmSplits.take(10).forEach { split ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("${split.km}", style = AppTextStyles.body, color = Colors.textSecondary, modifier = Modifier.weight(1f))
                    Text(formatSecondsToHMS(split.time), style = AppTextStyles.body, color = Colors.textSecondary, modifier = Modifier.weight(1f))
                    Text("${split.pace}/km", style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.primary, modifier = Modifier.weight(1f))
                }
            }
            
            if (kmSplits.size > 10) {
                Text("+ ${kmSplits.size - 10} more km splits", style = AppTextStyles.caption, color = Colors.textMuted, modifier = Modifier.padding(top = 8.dp))
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
private fun AchievementsTabFlagship(run: RunSession, analysisState: AiAnalysisState) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = Spacing.lg),
        contentPadding = PaddingValues(vertical = Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg)
    ) {
        item {
            Text(
                text = "Achievements",
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
                else -> EmptyStateCardFlagship("Generate AI insights to see achievements and personal bests.")
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

        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
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

/* ============================ STRUGGLE POINT ROW ============================ */

@Composable
private fun StrugglePointRow(point: StrugglePoint, index: Int) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Struggle #$index",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                    color = Colors.warning
                )
                Text(
                    text = String.format(Locale.US, "%.1f km", point.distanceMeters / 1000.0),
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Pace dropped ${String.format(Locale.US, "%.0f%%", point.paceDropPercent)} " +
                       "(${point.paceAtStruggle} vs ${point.baselinePace})",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            if (point.heartRate != null && point.heartRate > 0) {
                Text(
                    text = "Heart rate: ${point.heartRate} bpm",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
            }
        }
    }
}
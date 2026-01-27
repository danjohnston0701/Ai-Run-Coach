package live.airuncoach.airuncoach.ui.screens

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.ui.components.*
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.RunSummaryUiState
import live.airuncoach.airuncoach.viewmodel.RunSummaryViewModel
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RunSummaryScreen(
    runSession: RunSession,
    strugglePoints: List<StrugglePoint>,
    onNavigateBack: () -> Unit,
    viewModel: RunSummaryViewModel = hiltViewModel()
) {
    // Initialize viewmodel with run data
    LaunchedEffect(Unit) {
        viewModel.initializeRunSummary(runSession, strugglePoints)
    }

    val currentStrugglePoints by viewModel.strugglePoints.collectAsState()
    val analysisState by viewModel.analysisState.collectAsState()
    val userComments by viewModel.userPostRunComments.collectAsState()
    
    val context = LocalContext.current
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Overview", "Insights", "Struggles", "Comments", "AI Analysis", "Raw Data")
    
    var showShareDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "Run Summary",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            painterResource(id = R.drawable.icon_close_vector),
                            contentDescription = "Close",
                            tint = Colors.textPrimary
                        )
                    }
                },
                actions = {
                    // Share button
                    IconButton(onClick = { showShareDialog = true }) {
                        Icon(
                            painterResource(id = R.drawable.icon_play_vector), // TODO: Add share icon
                            contentDescription = "Share",
                            tint = Colors.textPrimary
                        )
                    }
                    // Delete button
                    IconButton(onClick = { showDeleteDialog = true }) {
                        Icon(
                            painterResource(id = R.drawable.icon_close_vector),
                            contentDescription = "Delete",
                            tint = Colors.error
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                )
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Tab Row
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Colors.backgroundRoot,
                contentColor = Colors.primary
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = {
                            Text(
                                title,
                                style = AppTextStyles.body.copy(fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal)
                            )
                        }
                    )
                }
            }

            // Tab Content
            when (selectedTab) {
                0 -> RunOverviewTab(runSession)
                1 -> InsightsTab(runSession)
                2 -> StrugglePointsTab(currentStrugglePoints, viewModel)
                3 -> PostRunCommentsTab(userComments, viewModel)
                4 -> AIAnalysisTab(analysisState, viewModel)
                5 -> RawDataTab(runSession)
            }
        }
    }
    
    // Share Dialog
    if (showShareDialog) {
        ShareRunDialog(
            shareText = viewModel.getShareText(),
            onDismiss = { showShareDialog = false },
            onShare = { platform ->
                shareToSocial(context, viewModel.getShareText(), platform)
                showShareDialog = false
            }
        )
    }
    
    // Delete Confirmation Dialog
    if (showDeleteDialog) {
        DeleteRunDialog(
            onDismiss = { showDeleteDialog = false },
            onConfirm = {
                viewModel.deleteRun(
                    onSuccess = {
                        Toast.makeText(context, "Run deleted", Toast.LENGTH_SHORT).show()
                        onNavigateBack()
                    },
                    onError = { error ->
                        Toast.makeText(context, "Error: $error", Toast.LENGTH_SHORT).show()
                    }
                )
                showDeleteDialog = false
            }
        )
    }
}

@Composable
fun InsightsTab(runSession: RunSession) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        item {
            Text(
                "Performance Analytics",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Text(
                "Deep dive into your run data",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
        }

        // ========== ELITE METRICS ==========
        
        // Training Load & VO2 Max
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                TrainingLoadCard(
                    runSession = runSession,
                    modifier = Modifier.weight(1f)
                )
                VO2MaxEstimationCard(
                    runSession = runSession,
                    userAge = null, // TODO: Get from user profile
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Negative/Positive Split Analysis
        item {
            SplitAnalysisChart(kmSplits = runSession.kmSplits)
        }

        // Fatigue Index
        item {
            FatigueIndexChart(kmSplits = runSession.kmSplits)
        }

        // ========== STANDARD CHARTS ==========
        
        // Pace Chart
        item {
            PaceChart(routePoints = runSession.routePoints)
        }

        // Elevation Profile
        item {
            ElevationChart(routePoints = runSession.routePoints)
        }

        // Km Splits Chart
        item {
            SplitsChart(kmSplits = runSession.kmSplits)
        }

        // ========== ADVANCED ANALYTICS ==========
        
        // Heart Rate Efficiency
        if (runSession.heartRate > 0) {
            item {
                HeartRatePaceCorrelationChart(routePoints = runSession.routePoints)
            }
        }

        // Heart Rate Zones
        if (runSession.heartRate > 0) {
            item {
                HeartRateZonesChart(heartRateData = listOf(runSession.heartRate))
            }
        }

        // Cadence Analysis
        if (runSession.cadence > 0) {
            item {
                CadenceAnalysisChart(
                    routePoints = runSession.routePoints,
                    avgCadence = runSession.cadence
                )
            }
        }

        // Effort Distribution
        item {
            EffortHeatmapCard(routePoints = runSession.routePoints)
        }

        // Weather Progression
        if (runSession.weatherAtStart != null && runSession.weatherAtEnd != null) {
            item {
                WeatherProgressionChart(
                    weatherAtStart = runSession.weatherAtStart,
                    weatherAtEnd = runSession.weatherAtEnd
                )
            }
        }

        // ========== KEY INSIGHTS SUMMARY ==========
        
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.primary.copy(alpha = 0.1f)
                )
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            painterResource(id = R.drawable.icon_target_vector),
                            contentDescription = null,
                            tint = Colors.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text(
                            "Quick Stats",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    InsightRow("Fastest Km", runSession.kmSplits.minByOrNull { it.time }?.let { "${it.km}km - ${it.pace}" } ?: "N/A")
                    InsightRow("Slowest Km", runSession.kmSplits.maxByOrNull { it.time }?.let { "${it.km}km - ${it.pace}" } ?: "N/A")
                    InsightRow("Avg Elevation", String.format("%.1f%%", runSession.averageGradient))
                    InsightRow("Max Elevation", String.format("%.1f%%", runSession.maxGradient))
                    InsightRow("Terrain Type", runSession.terrainType.name.lowercase().replaceFirstChar { it.uppercase() })
                }
            }
        }
    }
}

@Composable
fun InsightRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = AppTextStyles.body, color = Colors.textSecondary)
        Text(value, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
    }
}

@Composable
fun ShareRunDialog(
    shareText: String,
    onDismiss: () -> Unit,
    onShare: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Share Your Run",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold)
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                SharePlatformOption("Share Anywhere", "generic") { onShare("generic") }
                SharePlatformOption("Instagram Story", "instagram") { onShare("instagram") }
                SharePlatformOption("Facebook", "facebook") { onShare("facebook") }
                SharePlatformOption("Twitter/X", "twitter") { onShare("twitter") }
                SharePlatformOption("Copy to Clipboard", "copy") { onShare("copy") }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Colors.textSecondary)
            }
        },
        containerColor = Colors.backgroundRoot
    )
}

@Composable
fun SharePlatformOption(name: String, platform: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painterResource(id = R.drawable.icon_play_vector), // TODO: Platform-specific icons
                contentDescription = null,
                tint = Colors.primary,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.md))
            Text(
                name,
                style = AppTextStyles.body,
                color = Colors.textPrimary
            )
        }
    }
}

@Composable
fun DeleteRunDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                painterResource(id = R.drawable.icon_close_vector),
                contentDescription = null,
                tint = Colors.error,
                modifier = Modifier.size(48.dp)
            )
        },
        title = {
            Text(
                "Delete Run?",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
        },
        text = {
            Text(
                "This run will be permanently deleted. This action cannot be undone.",
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.error,
                    contentColor = Color.White
                )
            ) {
                Text("Delete", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Colors.textSecondary)
            }
        },
        containerColor = Colors.backgroundRoot
    )
}

/**
 * Share run to social media
 */
private fun shareToSocial(context: Context, shareText: String, platform: String) {
    when (platform) {
        "copy" -> {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("Run Stats", shareText)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
        }
        "instagram" -> {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, shareText)
                setPackage("com.instagram.android")
            }
            try {
                context.startActivity(intent)
            } catch (e: Exception) {
                // Fallback to generic share
                shareGeneric(context, shareText)
            }
        }
        "facebook" -> {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, shareText)
                setPackage("com.facebook.katana")
            }
            try {
                context.startActivity(intent)
            } catch (e: Exception) {
                shareGeneric(context, shareText)
            }
        }
        "twitter" -> {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, shareText)
                setPackage("com.twitter.android")
            }
            try {
                context.startActivity(intent)
            } catch (e: Exception) {
                shareGeneric(context, shareText)
            }
        }
        else -> {
            shareGeneric(context, shareText)
        }
    }
}

private fun shareGeneric(context: Context, shareText: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, shareText)
    }
    context.startActivity(Intent.createChooser(intent, "Share Run"))
        }
    }
}

@Composable
fun RunOverviewTab(runSession: RunSession) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        item {
            // Main Stats Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(BorderRadius.md),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Text(
                        "Run Statistics",
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        StatItem("Distance", String.format("%.2f km", runSession.getDistanceInKm()))
                        StatItem("Duration", runSession.getFormattedDuration())
                        StatItem("Avg Pace", runSession.averagePace)
                    }
                }
            }
        }

        item {
            // Secondary Stats
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Card(
                    modifier = Modifier.weight(1f),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(
                        modifier = Modifier.padding(Spacing.md),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            painterResource(id = R.drawable.icon_chart_vector),
                            contentDescription = null,
                            tint = Colors.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.height(Spacing.xs))
                        Text(
                            "${runSession.calories}",
                            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Text("Calories", style = AppTextStyles.caption, color = Colors.textSecondary)
                    }
                }
                
                Card(
                    modifier = Modifier.weight(1f),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(
                        modifier = Modifier.padding(Spacing.md),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            painterResource(id = R.drawable.icon_trending_vector),
                            contentDescription = null,
                            tint = Colors.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.height(Spacing.xs))
                        Text(
                            String.format("%.0fm", runSession.totalElevationGain),
                            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Text("Elevation", style = AppTextStyles.caption, color = Colors.textSecondary)
                    }
                }
            }
        }

        item {
            if (runSession.heartRate > 0) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(Spacing.lg),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painterResource(id = R.drawable.icon_timer_vector),
                                contentDescription = null,
                                tint = Colors.error,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.md))
                            Column {
                                Text("Heart Rate", style = AppTextStyles.caption, color = Colors.textSecondary)
                                Text("${runSession.heartRate} bpm", style = AppTextStyles.h4, color = Colors.textPrimary)
                            }
                        }
                        if (runSession.cadence > 0) {
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Cadence", style = AppTextStyles.caption, color = Colors.textSecondary)
                                Text("${runSession.cadence} spm", style = AppTextStyles.h4, color = Colors.textPrimary)
                            }
                        }
                    }
                }
            }
        }

        item {
            // Km Splits
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Text(
                        "Km Splits",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    runSession.kmSplits.forEach { split ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = Spacing.xs),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Km ${split.km}", style = AppTextStyles.body, color = Colors.textSecondary)
                            Text(split.pace, style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium), color = Colors.textPrimary)
                        }
                        if (split != runSession.kmSplits.last()) {
                            Divider(modifier = Modifier.padding(vertical = Spacing.xs), color = Colors.textMuted.copy(alpha = 0.2f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StrugglePointsTab(
    strugglePoints: List<StrugglePoint>,
    viewModel: RunSummaryViewModel
) {
    val (relevant, dismissed) = viewModel.getStrugglePointStats()
    
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.primary.copy(alpha = 0.1f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            "Struggle Points Detected",
                            style = AppTextStyles.caption,
                            color = Colors.textSecondary
                        )
                        Text(
                            "$relevant relevant • $dismissed dismissed",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                    }
                    Icon(
                        painterResource(id = R.drawable.icon_trending_vector),
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }
        }

        if (strugglePoints.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = Spacing.xl),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            painterResource(id = R.drawable.icon_target_vector),
                            contentDescription = null,
                            tint = Colors.textMuted,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(Spacing.md))
                        Text(
                            "No struggle points detected!",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                        Text(
                            "Great pacing throughout your run",
                            style = AppTextStyles.caption,
                            color = Colors.textMuted
                        )
                    }
                }
            }
        }

        itemsIndexed(strugglePoints) { index, point ->
            StrugglePointCard(
                strugglePoint = point,
                index = index + 1,
                onCommentChanged = { comment ->
                    viewModel.updateStrugglePointComment(point.id, comment)
                },
                onDismiss = { reason ->
                    viewModel.dismissStrugglePoint(point.id, reason)
                },
                onRestore = {
                    viewModel.restoreStrugglePoint(point.id)
                }
            )
        }
    }
}

@Composable
fun StrugglePointCard(
    strugglePoint: StrugglePoint,
    index: Int,
    onCommentChanged: (String) -> Unit,
    onDismiss: (DismissReason) -> Unit,
    onRestore: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    var showDismissDialog by remember { mutableStateOf(false) }
    var commentText by remember { mutableStateOf(strugglePoint.userComment ?: "") }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { expanded = !expanded },
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = if (strugglePoint.isRelevant) 
                Colors.backgroundSecondary 
            else 
                Colors.textMuted.copy(alpha = 0.1f)
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(BorderRadius.full))
                            .background(if (strugglePoint.isRelevant) Colors.error else Colors.textMuted)
                            .padding(Spacing.xs),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "#$index",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                    }
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Column {
                        Text(
                            String.format("%.2f km", strugglePoint.distanceMeters / 1000),
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Text(
                            "Pace dropped ${String.format("%.1f", strugglePoint.paceDropPercent)}%",
                            style = AppTextStyles.caption,
                            color = Colors.textSecondary
                        )
                    }
                }
                
                if (!strugglePoint.isRelevant) {
                    Chip(
                        text = strugglePoint.dismissReason?.getDisplayText() ?: "Dismissed",
                        backgroundColor = Colors.textMuted.copy(alpha = 0.2f)
                    )
                } else {
                    Icon(
                        painterResource(id = if (expanded) R.drawable.icon_pause_vector else R.drawable.icon_play_vector),
                        contentDescription = if (expanded) "Collapse" else "Expand",
                        tint = Colors.textMuted,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }

            if (expanded) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Divider(color = Colors.textMuted.copy(alpha = 0.2f))
                Spacer(modifier = Modifier.height(Spacing.md))

                // Pace Info
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("Baseline Pace", style = AppTextStyles.caption, color = Colors.textSecondary)
                        Text(strugglePoint.baselinePace, style = AppTextStyles.body, color = Colors.textPrimary)
                    }
                    Column {
                        Text("Pace at Struggle", style = AppTextStyles.caption, color = Colors.textSecondary)
                        Text(strugglePoint.paceAtStruggle, style = AppTextStyles.body, color = Colors.error)
                    }
                }

                if (strugglePoint.currentGrade != null) {
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Gradient", style = AppTextStyles.caption, color = Colors.textSecondary)
                        Text(
                            String.format("%.1f%%", strugglePoint.currentGrade),
                            style = AppTextStyles.body,
                            color = Colors.textPrimary
                        )
                    }
                }

                if (strugglePoint.heartRate != null && strugglePoint.heartRate > 0) {
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Heart Rate", style = AppTextStyles.caption, color = Colors.textSecondary)
                        Text(
                            "${strugglePoint.heartRate} bpm",
                            style = AppTextStyles.body,
                            color = Colors.textPrimary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.md))

                // Comment Input
                if (strugglePoint.isRelevant) {
                    OutlinedTextField(
                        value = commentText,
                        onValueChange = {
                            commentText = it
                            onCommentChanged(it)
                        },
                        label = { Text("Add note (optional)", style = AppTextStyles.caption) },
                        placeholder = { Text("e.g., Stopped for traffic light", style = AppTextStyles.caption) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Colors.backgroundRoot,
                            unfocusedContainerColor = Colors.backgroundRoot,
                            focusedIndicatorColor = Colors.primary,
                            unfocusedIndicatorColor = Colors.textMuted
                        ),
                        textStyle = AppTextStyles.body
                    )

                    Spacer(modifier = Modifier.height(Spacing.sm))

                    // Dismiss Button
                    Button(
                        onClick = { showDismissDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.textMuted.copy(alpha = 0.2f),
                            contentColor = Colors.textPrimary
                        ),
                        shape = RoundedCornerShape(BorderRadius.md)
                    ) {
                        Icon(
                            painterResource(id = R.drawable.icon_close_vector),
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.xs))
                        Text("Dismiss from Analysis", style = AppTextStyles.body)
                    }
                } else {
                    // Restore Button
                    Button(
                        onClick = onRestore,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        ),
                        shape = RoundedCornerShape(BorderRadius.md)
                    ) {
                        Text("Restore to Analysis", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
                    }
                }
            }
        }
    }

    // Dismiss Reason Dialog
    if (showDismissDialog) {
        DismissReasonDialog(
            onDismiss = { showDismissDialog = false },
            onReasonSelected = { reason ->
                onDismiss(reason)
                showDismissDialog = false
            }
        )
    }
}

@Composable
fun DismissReasonDialog(
    onDismiss: () -> Unit,
    onReasonSelected: (DismissReason) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Why did you slow down?", style = AppTextStyles.h4) },
        text = {
            Column {
                DismissReason.values().forEach { reason ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = Spacing.xs)
                            .clickable { onReasonSelected(reason) },
                        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                    ) {
                        Text(
                            reason.getDisplayText(),
                            modifier = Modifier.padding(Spacing.md),
                            style = AppTextStyles.body,
                            color = Colors.textPrimary
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Colors.textSecondary)
            }
        },
        containerColor = Colors.backgroundRoot
    )
}

@Composable
fun PostRunCommentsTab(
    userComments: String,
    viewModel: RunSummaryViewModel
) {
    var commentsText by remember { mutableStateOf(userComments) }
    
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.primary.copy(alpha = 0.1f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Spacing.lg),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        painterResource(id = R.drawable.icon_profile_vector),
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier.size(40.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Column {
                        Text(
                            "Share Your Experience",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Text(
                            "Your insights help AI provide better analysis",
                            style = AppTextStyles.caption,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Text(
                        "How did your run feel?",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    
                    OutlinedTextField(
                        value = commentsText,
                        onValueChange = {
                            commentsText = it
                            viewModel.updatePostRunComments(it)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp),
                        placeholder = {
                            Text(
                                "e.g., \"Felt strong in the first half but struggled with the heat. Legs felt tired from yesterday's workout.\"",
                                style = AppTextStyles.caption,
                                color = Colors.textMuted
                            )
                        },
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Colors.backgroundRoot,
                            unfocusedContainerColor = Colors.backgroundRoot,
                            focusedIndicatorColor = Colors.primary,
                            unfocusedIndicatorColor = Colors.textMuted
                        ),
                        textStyle = AppTextStyles.body
                    )
                }
            }
        }

        item {
            Text(
                "💡 Pro Tips",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
        }

        item {
            TipCard(
                title = "Energy Levels",
                description = "How did you feel? Strong, tired, sluggish?",
                icon = R.drawable.icon_chart_vector
            )
        }

        item {
            TipCard(
                title = "External Factors",
                description = "Weather, terrain, sleep quality, nutrition",
                icon = R.drawable.icon_timer_vector
            )
        }

        item {
            TipCard(
                title = "Mental State",
                description = "Motivated, stressed, distracted, focused?",
                icon = R.drawable.icon_target_vector
            )
        }

        item {
            Button(
                onClick = { viewModel.generateAIAnalysis() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                ),
                shape = RoundedCornerShape(BorderRadius.lg)
            ) {
                Icon(
                    painterResource(id = R.drawable.icon_play_vector),
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    "Generate AI Analysis",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
        }
    }
}

@Composable
fun TipCard(
    title: String,
    description: String,
    icon: Int
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painterResource(id = icon),
                contentDescription = null,
                tint = Colors.primary,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.md))
            Column {
                Text(
                    title,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Text(
                    description,
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
fun AIAnalysisTab(
    analysisState: RunSummaryUiState,
    viewModel: RunSummaryViewModel
) {
    Box(modifier = Modifier.fillMaxSize()) {
        when (analysisState) {
            is RunSummaryUiState.Loading -> {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(Spacing.lg),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    CircularProgressIndicator(
                        color = Colors.primary,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(Spacing.lg))
                    Text(
                        "Analyzing your run...",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "AI is crunching the numbers",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }
            is RunSummaryUiState.Success -> {
                ComprehensiveAIAnalysisContent(analysisState.analysis)
            }
            is RunSummaryUiState.Error -> {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(Spacing.lg),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        painterResource(id = R.drawable.icon_close_vector),
                        contentDescription = null,
                        tint = Colors.error,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        "Failed to generate analysis",
                        style = AppTextStyles.h4,
                        color = Colors.textPrimary
                    )
                    Text(
                        analysisState.message,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                    Spacer(modifier = Modifier.height(Spacing.lg))
                    Button(
                        onClick = { viewModel.generateAIAnalysis() },
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                    ) {
                        Text("Retry", color = Colors.buttonText)
                    }
                }
            }
        }
    }
}

@Composable
fun ComprehensiveAIAnalysisContent(analysis: live.airuncoach.airuncoach.network.model.RunAnalysisResponse) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        // Executive Summary
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.primary.copy(alpha = 0.1f)
                )
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            painterResource(id = R.drawable.icon_target_vector),
                            contentDescription = null,
                            tint = Colors.primary,
                            modifier = Modifier.size(32.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.md))
                        Text(
                            "Executive Summary",
                            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        analysis.executiveSummary,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }
        }

        // Performance Scores
        item {
            Text(
                "Performance Scores",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                ScoreCard(
                    title = "Overall",
                    score = analysis.overallPerformanceScore,
                    modifier = Modifier.weight(1f)
                )
                ScoreCard(
                    title = "Pace",
                    score = analysis.paceConsistencyScore,
                    modifier = Modifier.weight(1f)
                )
                ScoreCard(
                    title = "Effort",
                    score = analysis.effortScore,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        if (analysis.mentalToughnessScore != null) {
            item {
                ScoreCard(
                    title = "Mental Toughness",
                    score = analysis.mentalToughnessScore,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Demographic Comparison
        analysis.demographicComparison?.let { demographic ->
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = Colors.primary.copy(alpha = 0.15f)
                    )
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painterResource(id = R.drawable.icon_profile_vector),
                                contentDescription = null,
                                tint = Colors.primary,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                "Demographic Comparison",
                                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                                color = Colors.textPrimary
                            )
                        }
                        Spacer(modifier = Modifier.height(Spacing.md))
                        
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(BorderRadius.md))
                                .background(Colors.primary.copy(alpha = 0.2f))
                                .padding(Spacing.lg),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    "${demographic.percentile}th",
                                    style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                                    color = Colors.primary
                                )
                                Text(
                                    "Percentile",
                                    style = AppTextStyles.caption,
                                    color = Colors.textSecondary
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(Spacing.md))
                        Text(
                            demographic.comparisonText,
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
        }

        // Comparison to Previous Runs
        analysis.comparisonToPreviousRuns?.let { comparison ->
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painterResource(id = R.drawable.icon_chart_vector),
                                contentDescription = null,
                                tint = Colors.primary,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                "Similar Route Comparison",
                                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                                color = Colors.textPrimary
                            )
                        }
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            comparison,
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
        }

        // Strengths
        item {
            AnalysisSection(
                title = "What Went Well",
                items = analysis.strengths,
                iconRes = R.drawable.icon_target_vector,
                color = Colors.primary
            )
        }

        // Areas for Improvement
        item {
            AnalysisSection(
                title = "Areas for Improvement",
                items = analysis.areasForImprovement,
                iconRes = R.drawable.icon_trending_vector,
                color = Colors.error
            )
        }

        // Training Recommendations
        if (analysis.trainingRecommendations.isNotEmpty()) {
            item {
                Text(
                    "Training Recommendations",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }

            items(analysis.trainingRecommendations) { recommendation ->
                TrainingRecommendationCard(recommendation)
            }
        }

        // Goals Progress
        if (analysis.goalsProgress.isNotEmpty()) {
            item {
                Text(
                    "Goals Progress",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }

            items(analysis.goalsProgress) { goalProgress ->
                GoalProgressCard(goalProgress)
            }
        }

        // Target Achievement Analysis
        analysis.targetAchievementAnalysis?.let { targetAnalysis ->
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painterResource(id = R.drawable.icon_timer_vector),
                                contentDescription = null,
                                tint = Colors.primary,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                "Target Achievement",
                                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                                color = Colors.textPrimary
                            )
                        }
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            targetAnalysis,
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
        }

        // Weather Impact Analysis
        analysis.weatherImpactAnalysis?.let { weatherImpact ->
            item {
                WeatherImpactCard(weatherImpact)
            }
        }

        // Terrain Analysis
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            painterResource(id = R.drawable.icon_trending_vector),
                            contentDescription = null,
                            tint = Colors.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text(
                            "Terrain Analysis",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        analysis.terrainAnalysis,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }
        }

        // Struggle Points Insight
        analysis.strugglePointsInsight?.let { insight ->
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = Colors.error.copy(alpha = 0.1f)
                    )
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painterResource(id = R.drawable.icon_chart_vector),
                                contentDescription = null,
                                tint = Colors.error,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                "Struggle Points Insight",
                                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                                color = Colors.textPrimary
                            )
                        }
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            insight,
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
        }

        // Recovery & Next Run
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Text(
                        "Recovery Advice",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        analysis.recoveryAdvice,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                    
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Divider(color = Colors.textMuted.copy(alpha = 0.2f))
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    Text(
                        "Next Run Suggestion",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        analysis.nextRunSuggestion,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }
        }

        // Motivational Message
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.primary.copy(alpha = 0.1f)
                )
            ) {
                Column(
                    modifier = Modifier.padding(Spacing.lg),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "💪",
                        style = AppTextStyles.h1
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        analysis.coachMotivationalMessage,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                        color = Colors.textPrimary
                    )
                }
            }
        }
    }
}

@Composable
fun AnalysisSection(
    title: String,
    items: List<String>,
    iconRes: Int,
    color: Color
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painterResource(id = iconRes),
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    title,
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }
            Spacer(modifier = Modifier.height(Spacing.md))
            
            items.forEachIndexed { index, item ->
                Row(
                    modifier = Modifier.padding(vertical = Spacing.xs),
                    verticalAlignment = Alignment.Top
                ) {
                    Text(
                        "•",
                        style = AppTextStyles.body,
                        color = color,
                        modifier = Modifier.padding(end = Spacing.sm)
                    )
                    Text(
                        item,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }
        }
    }
}

@Composable
fun ScoreCard(
    title: String,
    score: Float,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                title,
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.xs))
            Text(
                String.format("%.1f", score * 10),
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.primary
            )
            Text(
                "/10",
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )
        }
    }
}

@Composable
fun Chip(
    text: String,
    backgroundColor: Color
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(BorderRadius.full))
            .background(backgroundColor)
            .padding(horizontal = Spacing.md, vertical = Spacing.xs)
    ) {
        Text(
            text,
            style = AppTextStyles.caption,
            color = Colors.textPrimary
        )
    }
}

@Composable
fun StatItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            label,
            style = AppTextStyles.caption,
            color = Colors.textSecondary
        )
        Text(
            value,
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
    }
}

@Composable
fun TrainingRecommendationCard(recommendation: live.airuncoach.airuncoach.network.model.TrainingRecommendation) {
    val priorityColor = when (recommendation.priority.toLowerCase(Locale.ROOT)) {
        "high" -> Colors.error
        "medium" -> Colors.primary
        else -> Colors.textMuted
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    recommendation.category.replaceFirstChar { it.uppercase() },
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Chip(
                    text = "${recommendation.priority} priority",
                    backgroundColor = priorityColor.copy(alpha = 0.2f)
                )
            }
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                recommendation.recommendation,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            
            recommendation.specificWorkout?.let { workout ->
                Spacer(modifier = Modifier.height(Spacing.md))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(BorderRadius.sm))
                        .background(Colors.primary.copy(alpha = 0.1f))
                        .padding(Spacing.md)
                ) {
                    Column {
                        Text(
                            "Suggested Workout",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary
                        )
                        Spacer(modifier = Modifier.height(Spacing.xs))
                        Text(
                            workout,
                            style = AppTextStyles.caption,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun GoalProgressCard(goalProgress: live.airuncoach.airuncoach.network.model.GoalProgress) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    goalProgress.goalType.replaceFirstChar { it.uppercase() },
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Icon(
                    painterResource(
                        id = if (goalProgress.onTrack) R.drawable.icon_target_vector else R.drawable.icon_trending_vector
                    ),
                    contentDescription = null,
                    tint = if (goalProgress.onTrack) Colors.primary else Colors.error,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                goalProgress.progressUpdate,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            
            goalProgress.adjustmentNeeded?.let { adjustment ->
                Spacer(modifier = Modifier.height(Spacing.md))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(BorderRadius.sm))
                        .background(Colors.error.copy(alpha = 0.1f))
                        .padding(Spacing.md)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            painterResource(id = R.drawable.icon_chart_vector),
                            contentDescription = null,
                            tint = Colors.error,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.xs))
                        Text(
                            adjustment,
                            style = AppTextStyles.caption,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun WeatherImpactCard(weatherImpact: live.airuncoach.airuncoach.network.model.WeatherImpactAnalysis) {
    val impactColor = when (weatherImpact.overallImpact.toLowerCase(Locale.ROOT)) {
        "positive" -> Colors.primary
        "negative" -> Colors.error
        else -> Colors.textMuted
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = impactColor.copy(alpha = 0.1f)
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        painterResource(id = R.drawable.icon_timer_vector),
                        contentDescription = null,
                        tint = impactColor,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(
                        "Weather Impact",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
                
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(BorderRadius.full))
                        .background(impactColor.copy(alpha = 0.2f))
                        .padding(horizontal = Spacing.md, vertical = Spacing.xs)
                ) {
                    Text(
                        String.format("%.1f", weatherImpact.impactScore),
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = impactColor
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            Text(
                weatherImpact.detailedAnalysis,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            
            Spacer(modifier = Modifier.height(Spacing.md))
            Divider(color = Colors.textMuted.copy(alpha = 0.2f))
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Individual impact factors
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                WeatherFactorRow("Temperature", weatherImpact.temperatureImpact)
                weatherImpact.windImpact?.let { wind ->
                    WeatherFactorRow("Wind", wind)
                }
                weatherImpact.humidityImpact?.let { humidity ->
                    WeatherFactorRow("Humidity", humidity)
                }
            }
            
            weatherImpact.adjustedPerformanceScore?.let { adjustedScore ->
                Spacer(modifier = Modifier.height(Spacing.md))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(BorderRadius.sm))
                        .background(Colors.primary.copy(alpha = 0.1f))
                        .padding(Spacing.md)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "Weather-Adjusted Score",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Text(
                            String.format("%.1f/10", adjustedScore),
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun WeatherFactorRow(factor: String, impact: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            factor,
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Text(
            impact,
            style = AppTextStyles.caption,
            color = Colors.textSecondary
        )
    }
}

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.CoachingPlanSummary
import live.airuncoach.airuncoach.viewmodel.MyDataViewModel
import live.airuncoach.airuncoach.viewmodel.TimePeriod
import live.airuncoach.airuncoach.viewmodel.TrendDataPoint
import java.util.Locale

/**
 * Format duration in milliseconds to HH:MM:SS format
 */
private fun formatDuration(durationMs: Long): String {
    val totalSeconds = durationMs / 1000
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    
    return if (hours > 0) {
        String.format(Locale.getDefault(), "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(Locale.getDefault(), "%d:%02d", minutes, seconds)
    }
}

/**
 * Format duration in seconds to HH:MM:SS format
 */
private fun formatLongDuration(durationSec: Long): String {
    val hours = durationSec / 3600
    val minutes = (durationSec % 3600) / 60
    val seconds = durationSec % 60
    
    return if (hours > 0) {
        String.format(Locale.getDefault(), "%d:%02d:%02d", hours, minutes, seconds)
    } else if (minutes > 0) {
        String.format(Locale.getDefault(), "%d:%02d", minutes, seconds)
    } else {
        String.format(Locale.getDefault(), "%d s", seconds)
    }
}

/**
 * Format date from ISO format (yyyy-MM-dd) to DD/MM/YYYY
 */
private fun formatDateToDDMMYYYY(isoDate: String): String {
    return try {
        val dateFormat = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val date = dateFormat.parse(isoDate)
        val outputFormat = java.text.SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        if (date != null) outputFormat.format(date) else isoDate
    } catch (_: Exception) {
        isoDate
    }
}

/**
 * My Data Screen - Market-leading performance analytics
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterialApi::class)
@Composable
fun MyDataScreen(
    onNavigateBack: () -> Unit = {},
    viewModel: MyDataViewModel = hiltViewModel()
) {
    val selectedPeriod by viewModel.selectedTimePeriod.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val personalBests by viewModel.personalBests.collectAsState()
    val stats by viewModel.currentPeriodStats.collectAsState()
    val allTimeStats by viewModel.allTimeStats.collectAsState()
    val coachingSummary by viewModel.coachingSummary.collectAsState()
    val aiCoachReview by viewModel.aiCoachReview.collectAsState()
    val aiCoachReviewUpdatedAt by viewModel.aiCoachReviewUpdatedAt.collectAsState()
    
    val pullRefreshState = rememberPullRefreshState(
        refreshing = isLoading,
        onRefresh = { viewModel.refreshData() }
    )

    Scaffold(
        containerColor = Colors.backgroundRoot,
        // Prevent double insets — the outer MainScreen Scaffold already consumes
        // status bar and bottom nav bar padding via Modifier.padding(innerPadding)
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "My Data",
                        style = AppTextStyles.h2,
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Colors.textPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                ),
                windowInsets = WindowInsets(0)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .pullRefresh(pullRefreshState)
        ) {
            when {
                isLoading && personalBests.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Colors.primary)
                    }
                }
                error != null && personalBests.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = error ?: "Something went wrong",
                            color = Colors.textSecondary,
                            style = AppTextStyles.body
                        )
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(Spacing.md)
                    ) {
                        // Section 0: AI Coach's Review — living profile summary
                        if (!aiCoachReview.isNullOrBlank()) {
                            item {
                                AiCoachReviewSection(
                                    review = aiCoachReview!!,
                                    updatedAt = aiCoachReviewUpdatedAt
                                )
                                Spacer(modifier = Modifier.height(Spacing.lg))
                            }
                        }

                        // Section 1: Personal Records (All-Time)
                        item {
                            SectionHeader(title = "🏆 Personal Records")
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            PersonalRecordsSection(personalBests = personalBests)
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }

                        // Section 2: All-Time Achievements (All-Time totals)
                        item {
                            SectionHeader(title = "⭐ All-Time Achievements")
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            AllTimeAchievementsSection(allTimeStats = allTimeStats)
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }

                        // Section 3: Time Period Selector (for trends and stats)
                        item {
                            SectionHeader(title = "📈 View Trends Over Time")
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            TimePeriodSelector(
                                selectedPeriod = selectedPeriod,
                                onPeriodSelected = { viewModel.selectTimePeriod(it) }
                            )
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }

                        // Section 4: Performance Trends (filtered by selected period)
                        item {
                            SectionHeader(title = "📊 Performance Trends (${selectedPeriod.label})")
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            PerformanceTrendsSection(viewModel = viewModel)
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }

                        // Section 5: Period Statistics (filtered by selected period)
                        if (stats != null) {
                            item {
                                SectionHeader(title = "📈 Statistics (${selectedPeriod.label})")
                                Spacer(modifier = Modifier.height(Spacing.sm))
                                PeriodStatisticsSection(stats = stats!!)
                                Spacer(modifier = Modifier.height(Spacing.lg))
                            }
                        }

                        // Section 6: Coaching Plan Summary
                        if (coachingSummary != null) {
                            item {
                                SectionHeader(title = "🎯 Coaching Plan Summary (${selectedPeriod.label})")
                                Spacer(modifier = Modifier.height(Spacing.sm))
                                CoachingPlanSummarySection(summary = coachingSummary!!)
                                Spacer(modifier = Modifier.height(Spacing.xl))
                            }
                        }
                    }
                }
            }
            
            PullRefreshIndicator(
                refreshing = isLoading,
                state = pullRefreshState,
                modifier = Modifier.align(Alignment.TopCenter),
                backgroundColor = Colors.backgroundSecondary,
                contentColor = Colors.primary
            )
        }
    }
}

@Composable
private fun TimePeriodSelector(
    selectedPeriod: TimePeriod,
    onPeriodSelected: (TimePeriod) -> Unit
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        items(TimePeriod.entries) { period ->
            PeriodButton(
                period = period,
                isSelected = period == selectedPeriod,
                onClick = { onPeriodSelected(period) }
            )
        }
    }
}

@Composable
private fun PeriodButton(
    period: TimePeriod,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(20.dp)),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) Colors.primary else Colors.backgroundTertiary,
            contentColor = if (isSelected) Color.White else Colors.textSecondary
        ),
        contentPadding = PaddingValues(horizontal = Spacing.md, vertical = Spacing.sm)
    ) {
        Text(
            text = period.label,
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
            fontSize = 12.sp
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = AppTextStyles.h3,
        color = Colors.textPrimary,
        fontWeight = FontWeight.Bold
    )
}

/**
 * Format ISO 8601 timestamp to a human-readable "last updated" date.
 * Example: "2024-06-21T15:30:45.123Z" → "Updated Jun 21, 2024"
 */
private fun formatLastUpdatedDate(isoTimestamp: String?): String {
    if (isoTimestamp.isNullOrBlank()) return ""
    return try {
        val dateFormat = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
        val date = dateFormat.parse(isoTimestamp.take(19))
        val outputFormat = java.text.SimpleDateFormat("MMM d, yyyy", Locale.getDefault())
        if (date != null) "Updated ${outputFormat.format(date)}" else ""
    } catch (_: Exception) {
        ""
    }
}

/**
 * AI Coach's Review — displays the living "What I know about you" runner profile.
 * This is the accumulated AI coach intelligence: patterns, tendencies, and
 * observations that have built up from every post-run analysis.
 * Only shown when a profile has been generated (requires at least one completed run).
 */
@Composable
private fun AiCoachReviewSection(review: String, updatedAt: String? = null) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(
                // Subtle gradient-style background — slightly warmer than the standard card
                // to signal this is AI-generated insight, not raw stats
                Colors.backgroundSecondary
            )
            .padding(Spacing.md)
    ) {
        // Header row with coach icon
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            // Coach brain/spark icon — using a Unicode symbol for compatibility
            Text(
                text = "🧠",
                fontSize = 20.sp
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "AI Coach's Review",
                    style = AppTextStyles.h3,
                    color = Colors.textPrimary,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "What your coach knows about you",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
                // Last updated timestamp — subtle and smaller
                if (!updatedAt.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = formatLastUpdatedDate(updatedAt),
                        style = AppTextStyles.caption,
                        color = Colors.textMuted,
                        fontSize = 10.sp
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(Spacing.sm))

        // Divider
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Colors.backgroundTertiary)
        )

        Spacer(modifier = Modifier.height(Spacing.sm))

        // The AI-generated profile text
        Text(
            text = review,
            style = AppTextStyles.body,
            color = Colors.textPrimary,
            lineHeight = 22.sp
        )
    }
}

// All 7 standard PB categories — always shown, blank if no PB yet
private val PB_CATEGORIES = listOf(
    Triple("1K",           "1K",            1.0),
    Triple("Mile",         "Mile",          1.609),
    Triple("5K",           "5K",            5.0),
    Triple("10K",          "10K",           10.0),
    Triple("20K",          "20K",           20.0),
    Triple("Half Marathon","Half Marathon",  21.1),
    Triple("Marathon",     "Marathon",       42.2)
)

@Composable
private fun PersonalRecordsSection(
    personalBests: List<live.airuncoach.airuncoach.viewmodel.PersonalBest>
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary)
            .padding(vertical = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        PB_CATEGORIES.forEachIndexed { index, (_, label, _) ->
            val pb = personalBests.find { it.category == label }
            PersonalBestRow(label = label, pb = pb)
            if (index < PB_CATEGORIES.size - 1) {
                HorizontalDivider(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.md),
                    color = Colors.backgroundTertiary,
                    thickness = 1.dp
                )
            }
        }
    }
}

@Composable
private fun PersonalBestRow(
    label: String,
    pb: live.airuncoach.airuncoach.viewmodel.PersonalBest?
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Left: category label
        Text(
            text = label,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.textPrimary,
            modifier = Modifier.weight(1f)
        )

        // Right: best time + date OR "Not set"
        if (pb != null) {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = formatDuration(pb.duration),
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary,
                    fontSize = 15.sp
                )
                if (pb.date.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = formatDateToDDMMYYYY(pb.date),
                        style = AppTextStyles.caption,
                        color = Colors.textMuted,
                        fontSize = 11.sp
                    )
                }
            }
        } else {
            Text(
                text = "Not set",
                style = AppTextStyles.body,
                color = Colors.textMuted,
                fontSize = 14.sp
            )
        }
    }
}

@Composable
private fun PeriodStatisticsSection(
    stats: live.airuncoach.airuncoach.viewmodel.PeriodStatistics
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        // Top row: Key metrics
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            StatCard(
                label = "Runs",
                value = stats.totalRuns.toString(),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Distance",
                value = String.format(Locale.getDefault(), "%.1f km", stats.totalDistance),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Elevation",
                value = String.format(Locale.getDefault(), "%.0f m", stats.totalElevationGain),
                modifier = Modifier.weight(1f)
            )
        }

        HorizontalDivider(
            modifier = Modifier.fillMaxWidth(),
            color = Colors.backgroundTertiary,
            thickness = 1.dp
        )

        // Second row: Averages
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            StatCard(
                label = "Avg Pace",
                value = stats.averagePace,
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Avg HR",
                value = "${stats.averageHeartRate} bpm",
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Avg Cadence",
                value = "${stats.averageCadence} spm",
                modifier = Modifier.weight(1f)
            )
        }

        HorizontalDivider(
            modifier = Modifier.fillMaxWidth(),
            color = Colors.backgroundTertiary,
            thickness = 1.dp
        )

        // Third row: Extremes
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            StatCard(
                label = "Longest",
                value = String.format(Locale.getDefault(), "%.1f km", stats.longestRun),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Total Calories",
                value = "${stats.totalCalories}",
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Consistency",
                value = String.format(Locale.getDefault(), "%.0f%%", stats.consistencyScore),
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun StatCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Colors.backgroundTertiary)
            .padding(Spacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = value,
            style = AppTextStyles.h3,
            color = Colors.primary,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            maxLines = 1
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = label,
            style = AppTextStyles.caption,
            color = Colors.textMuted,
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            maxLines = 2
        )
    }
}

@Composable
private fun PerformanceTrendsSection(
    viewModel: MyDataViewModel
) {
    val pacesTrend by viewModel.pacesTrend.collectAsState()
    val hrTrend by viewModel.hrTrend.collectAsState()
    val elevationTrend by viewModel.elevationTrend.collectAsState()
    val cadenceTrend by viewModel.cadenceTrend.collectAsState()
    val selectedPeriod by viewModel.selectedTimePeriod.collectAsState()

    val allEmpty = pacesTrend.isEmpty() && hrTrend.isEmpty() &&
            elevationTrend.isEmpty() && cadenceTrend.isEmpty()

    if (allEmpty) {
        EmptyStateCard(message = "No run data for this period.\nComplete a run to see your trends!")
        return
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        if (pacesTrend.isNotEmpty()) {
            TrendBarChart(
                title = "⚡ Avg Pace (min/km)",
                points = pacesTrend,
                unit = "/km",
                period = selectedPeriod,
                invertColors = true,
                usePerformanceGradient = true
            )
        }
        if (hrTrend.isNotEmpty()) {
            TrendBarChart(title = "❤️ Avg Heart Rate (bpm)", points = hrTrend, unit = " bpm", period = selectedPeriod)
        }
        if (cadenceTrend.isNotEmpty()) {
            TrendBarChart(
                title = "👟 Avg Cadence (spm)",
                points = cadenceTrend,
                unit = " spm",
                period = selectedPeriod,
                usePerformanceGradient = true
            )
        }
        if (elevationTrend.isNotEmpty()) {
            TrendBarChart(title = "⛰️ Elevation Gain (m)", points = elevationTrend, unit = " m", period = selectedPeriod)
        }
    }
}

/**
 * A sophisticated Compose line chart showing trend data with smooth curves and gradient fill.
 * For shorter periods (1-3 months): groups by week
 * For longer periods (6-12 months): groups by month
 * invertColors = true means lower value is better (pace: lower = faster = green).
 * Features:
 * - Smooth curves using Bézier interpolation
 * - Gradient area fill under the line
 * - Interactive hover tooltips with values
 * - Y-axis grid lines for readability
 * - Color-coded performance indicator (green = good, red = needs improvement)
 */
@Composable
private fun TrendBarChart(
    title: String,
    points: List<TrendDataPoint>,
    unit: String,
    period: TimePeriod = TimePeriod.MONTH,
    invertColors: Boolean = false,
    usePerformanceGradient: Boolean = false
) {
    if (points.isEmpty()) return

    // Group data by week or month based on period
    val display = groupTrendDataByPeriod(points, period)
    
    if (display.isEmpty()) return

    val maxVal = display.maxOf { it.value }
    val minVal = display.minOf { it.value }
    val avgVal = display.map { it.value }.average()
    
    // Calculate Y-axis scale with padding
    val yAxisMax = (maxVal * 1.15).toInt()
    val yAxisMin = (minVal * 0.85).coerceAtLeast(0.0).toInt()
    val yAxisRange = yAxisMax - yAxisMin
    val yAxisStep = (yAxisRange / 4).coerceAtLeast(1)

    // Determine the primary line color based on trend
    val primaryColor = if (invertColors) {
        Color(0xFF4CAF50) // Lower is better (pace) → green
    } else {
        Color(0xFF4CAF50) // Higher is better → green
    }
    
    val accentColor = Color(0xFFF44336) // Accent for warnings

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.md)
    ) {
        // Title
        Text(
            text = title,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.textPrimary,
            fontSize = 13.sp
        )
        Spacer(modifier = Modifier.height(Spacing.sm))

        // Line chart with grid
        SophisticatedLineChart(
            data = display,
            yAxisMax = yAxisMax.toDouble(),
            yAxisMin = yAxisMin.toDouble(),
            yAxisStep = yAxisStep,
            primaryColor = primaryColor,
            invertColors = invertColors,
            usePerformanceGradient = usePerformanceGradient
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Summary statistics row
        Row(
            modifier = Modifier
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            SummaryStatItem(
                label = "Min",
                value = String.format(Locale.getDefault(), "%.1f", minVal),
                unit = unit,
                color = accentColor
            )
            SummaryStatItem(
                label = "Avg",
                value = String.format(Locale.getDefault(), "%.1f", avgVal),
                unit = unit,
                color = primaryColor
            )
            SummaryStatItem(
                label = "Max",
                value = String.format(Locale.getDefault(), "%.1f", maxVal),
                unit = unit,
                color = primaryColor
            )
            SummaryStatItem(
                label = "Periods",
                value = "${display.size}",
                unit = "",
                color = Colors.textSecondary
            )
        }
    }
}

@Composable
private fun SummaryStatItem(
    label: String,
    value: String,
    unit: String,
    color: Color
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = label,
            style = AppTextStyles.caption,
            color = Colors.textMuted,
            fontSize = 9.sp
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = "$value$unit",
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
            color = color,
            fontSize = 12.sp
        )
    }
}

/**
 * Maps a 0f..1f "goodness" fraction to a red → orange → green color, used to visually
 * encode whether a trend point represents better or worse performance.
 * 0f = worst (red), 0.5f = mid (orange), 1f = best (green).
 */
private fun performanceGradientColor(goodness: Float): Color {
    val g = goodness.coerceIn(0f, 1f)
    val red = Color(0xFFFF5252)
    val orange = Color(0xFFFF9800)
    val green = Color(0xFF4CAF50)
    return if (g <= 0.5f) {
        lerpColor(red, orange, g / 0.5f)
    } else {
        lerpColor(orange, green, (g - 0.5f) / 0.5f)
    }
}

private fun lerpColor(start: Color, end: Color, fraction: Float): Color {
    val t = fraction.coerceIn(0f, 1f)
    return Color(
        red = start.red + (end.red - start.red) * t,
        green = start.green + (end.green - start.green) * t,
        blue = start.blue + (end.blue - start.blue) * t,
        alpha = 1f
    )
}

@Composable
private fun SophisticatedLineChart(
    data: List<live.airuncoach.airuncoach.viewmodel.GroupedTrendDataPoint>,
    yAxisMax: Double,
    yAxisMin: Double,
    yAxisStep: Int,
    primaryColor: Color,
    invertColors: Boolean = false,
    usePerformanceGradient: Boolean = false
) {
    if (data.isEmpty()) return

    val chartHeight = 180.dp
    val yAxisRange = yAxisMax - yAxisMin

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(chartHeight),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Y-axis labels with grid
        Column(
            modifier = Modifier
                .width(40.dp)
                .fillMaxHeight(),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.End
        ) {
            repeat(5) { index ->
                val yValue = yAxisMax - (index * yAxisStep)
                Text(
                    text = yValue.toInt().toString(),
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    fontSize = 8.sp
                )
            }
        }

        // Chart area with line and fill
        Canvas(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
        ) {
            val canvasWidth = size.width
            val canvasHeight = size.height
            val xStep = canvasWidth / (data.size - 1).coerceAtLeast(1)

            // Draw grid lines (horizontal)
            repeat(5) { index ->
                val yValue = yAxisMax - (index * yAxisStep)
                val yPx = canvasHeight - ((yValue - yAxisMin) / yAxisRange * canvasHeight).toFloat()
                drawLine(
                    color = Colors.backgroundTertiary.copy(alpha = 0.5f),
                    start = androidx.compose.ui.geometry.Offset(0f, yPx),
                    end = androidx.compose.ui.geometry.Offset(canvasWidth, yPx),
                    strokeWidth = 0.5f
                )
            }

            // Calculate point positions
            val points = mutableListOf<androidx.compose.ui.geometry.Offset>()
            data.forEachIndexed { index, point ->
                val x = index * xStep
                val normalizedValue = (point.value - yAxisMin) / yAxisRange
                val y = canvasHeight - (normalizedValue * canvasHeight).toFloat()
                points.add(androidx.compose.ui.geometry.Offset(x, y))
            }

            // Per-point performance color (red = worst, orange = mid, green = best).
            // Which end is "best" depends on whether lower values are better
            // (e.g. pace) or higher values are better (e.g. cadence).
            val pointGoodness: List<Float> = data.map { point ->
                val fraction = if (invertColors) {
                    (yAxisMax - point.value) / yAxisRange
                } else {
                    (point.value - yAxisMin) / yAxisRange
                }
                fraction.toFloat().coerceIn(0f, 1f)
            }
            val pointColors: List<Color> = if (usePerformanceGradient) {
                pointGoodness.map { performanceGradientColor(it) }
            } else {
                data.map { primaryColor }
            }

            // Create smooth curve using Catmull-Rom spline
            if (points.size >= 2) {
                if (usePerformanceGradient) {
                    // Draw both the fill and the line as a series of small segments,
                    // each blended between the two performance colors of its endpoints.
                    // This produces a continuous red → orange → green (or reverse)
                    // gradient along the line AND matching fill as performance improves
                    // or declines across the period. Each segment's fill uses a diagonal
                    // brush (top-left endpoint color → bottom-right endpoint color) so it
                    // picks up the same left-to-right hue shift as the line while still
                    // fading vertically down toward the baseline, just like a normal area
                    // chart fill.
                    for (i in 1 until points.size) {
                        val p1 = points[i - 1]
                        val p2 = points[i]
                        val p0 = points[i - 1]
                        val p3 = if (i < points.size - 1) points[i + 1] else points[i]

                        val cp1x = p1.x + (p2.x - p0.x) / 6
                        val cp1y = p1.y + (p2.y - p0.y) / 6
                        val cp2x = p2.x - (p3.x - p1.x) / 6
                        val cp2y = p2.y - (p3.y - p1.y) / 6

                        // Fill quad under this curve segment, down to the baseline.
                        val segmentFillPath = androidx.compose.ui.graphics.Path()
                        segmentFillPath.moveTo(p1.x, p1.y)
                        segmentFillPath.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
                        segmentFillPath.lineTo(p2.x, canvasHeight)
                        segmentFillPath.lineTo(p1.x, canvasHeight)
                        segmentFillPath.close()

                        drawPath(
                            path = segmentFillPath,
                            brush = androidx.compose.ui.graphics.Brush.linearGradient(
                                colors = listOf(
                                    pointColors[i - 1].copy(alpha = 0.25f),
                                    pointColors[i].copy(alpha = 0.05f)
                                ),
                                start = androidx.compose.ui.geometry.Offset(p1.x, 0f),
                                end = androidx.compose.ui.geometry.Offset(p2.x, canvasHeight)
                            )
                        )

                        val segmentPath = androidx.compose.ui.graphics.Path()
                        segmentPath.moveTo(p1.x, p1.y)
                        segmentPath.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)

                        drawPath(
                            path = segmentPath,
                            brush = androidx.compose.ui.graphics.Brush.linearGradient(
                                colors = listOf(pointColors[i - 1], pointColors[i]),
                                start = p1,
                                end = p2
                            ),
                            style = androidx.compose.ui.graphics.drawscope.Stroke(
                                width = 2.5f,
                                cap = androidx.compose.ui.graphics.StrokeCap.Round,
                                join = androidx.compose.ui.graphics.StrokeJoin.Round
                            )
                        )
                    }
                } else {
                    // Create gradient path (smooth curve + fill area down to the baseline)
                    val gradientPath = androidx.compose.ui.graphics.Path()
                    gradientPath.moveTo(points.first().x, points.first().y)

                    for (i in 1 until points.size) {
                        val p1 = points[i - 1]
                        val p2 = points[i]
                        val p0 = points[i - 1]
                        val p3 = if (i < points.size - 1) points[i + 1] else points[i]

                        val cp1x = p1.x + (p2.x - p0.x) / 6
                        val cp1y = p1.y + (p2.y - p0.y) / 6
                        val cp2x = p2.x - (p3.x - p1.x) / 6
                        val cp2y = p2.y - (p3.y - p1.y) / 6

                        gradientPath.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
                    }

                    gradientPath.lineTo(points.last().x, canvasHeight)
                    gradientPath.lineTo(points.first().x, canvasHeight)
                    gradientPath.close()

                    // Draw gradient fill using the flat primaryColor tint
                    drawPath(
                        path = gradientPath,
                        brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                            colors = listOf(
                                primaryColor.copy(alpha = 0.25f),
                                primaryColor.copy(alpha = 0.05f)
                            ),
                            startY = 0f,
                            endY = canvasHeight
                        )
                    )

                    val composePath = androidx.compose.ui.graphics.Path()
                    composePath.moveTo(points[0].x, points[0].y)

                    for (i in 1 until points.size) {
                        val p1 = points[i - 1]
                        val p2 = points[i]
                        val p0 = points[i - 1]
                        val p3 = if (i < points.size - 1) points[i + 1] else points[i]

                        val cp1x = p1.x + (p2.x - p0.x) / 6
                        val cp1y = p1.y + (p2.y - p0.y) / 6
                        val cp2x = p2.x - (p3.x - p1.x) / 6
                        val cp2y = p2.y - (p3.y - p1.y) / 6

                        composePath.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
                    }

                    drawPath(
                        path = composePath,
                        color = primaryColor,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                            width = 2.5f,
                            cap = androidx.compose.ui.graphics.StrokeCap.Round,
                            join = androidx.compose.ui.graphics.StrokeJoin.Round
                        )
                    )
                }

                // Draw data points as dots, colored to match the performance gradient
                points.forEachIndexed { index, point ->
                    val dotColor = pointColors[index]
                    drawCircle(
                        color = dotColor,
                        radius = 3.5f,
                        center = point
                    )
                    // Draw white background for better visibility
                    drawCircle(
                        color = Colors.backgroundSecondary,
                        radius = 2.5f,
                        center = point
                    )
                    drawCircle(
                        color = dotColor,
                        radius = 1.5f,
                        center = point
                    )
                }
            }
        }
    }

    Spacer(modifier = Modifier.height(8.dp))

    // X-axis labels
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        data.forEach { point ->
            Text(
                text = point.label,
                modifier = Modifier.weight(1f),
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 8.sp,
                textAlign = TextAlign.Center,
                maxLines = 1
            )
        }
    }
}

/**
 * Group trend data by week (for <=3 months) or by month (for >=6 months)
 */
private fun groupTrendDataByPeriod(
    points: List<TrendDataPoint>,
    period: TimePeriod
): List<live.airuncoach.airuncoach.viewmodel.GroupedTrendDataPoint> {
    if (points.isEmpty()) return emptyList()

    return when {
        period == TimePeriod.MONTH || period == TimePeriod.QUARTER -> groupByWeek(points)
        else -> groupByMonth(points)
    }
}

/**
 * Group trend data by week, showing Monday date of that week
 */
private fun groupByWeek(points: List<TrendDataPoint>): List<live.airuncoach.airuncoach.viewmodel.GroupedTrendDataPoint> {
    val grouped = mutableMapOf<String, MutableList<Double>>()
    val dateFormat = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    
    points.forEach { point ->
        try {
            val date = dateFormat.parse(point.date)
            if (date != null) {
                val calendar = java.util.Calendar.getInstance()
                calendar.time = date
                
                // Get Monday of this week
                val dayOfWeek = calendar.get(java.util.Calendar.DAY_OF_WEEK)
                val daysToSubtract = if (dayOfWeek == java.util.Calendar.SUNDAY) 6 else dayOfWeek - 2
                calendar.add(java.util.Calendar.DAY_OF_MONTH, -daysToSubtract)
                
                val weekKey = String.format(Locale.getDefault(), "%02d/%02d/%02d",
                    calendar.get(java.util.Calendar.DAY_OF_MONTH),
                    calendar.get(java.util.Calendar.MONTH) + 1,
                    calendar.get(java.util.Calendar.YEAR) % 100
                )
                
                grouped.getOrPut(weekKey) { mutableListOf() }.add(point.value)
            }
        } catch (_: Exception) {
            // Skip invalid dates
        }
    }
    
    return grouped.map { (label, values) ->
        live.airuncoach.airuncoach.viewmodel.GroupedTrendDataPoint(
            label = label,
            value = values.average()
        )
    }.sortedBy { it.label }
}

/**
 * Group trend data by month - showing month names (Jan, Feb, Mar, etc.)
 */
private fun groupByMonth(points: List<TrendDataPoint>): List<live.airuncoach.airuncoach.viewmodel.GroupedTrendDataPoint> {
    val grouped = mutableMapOf<String, Pair<Int, MutableList<Double>>>() // label -> (sortOrder, values)
    val dateFormat = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    val monthNames = arrayOf("", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    
    points.forEach { point ->
        try {
            val date = dateFormat.parse(point.date)
            if (date != null) {
                val calendar = java.util.Calendar.getInstance()
                calendar.time = date
                val month = calendar.get(java.util.Calendar.MONTH) + 1
                val year = calendar.get(java.util.Calendar.YEAR)
                val key = "${monthNames[month]} ${(year % 100).toString().padStart(2, '0')}"
                val sortOrder = year * 100 + month // For sorting
                
                grouped.getOrPut(key) { Pair(sortOrder, mutableListOf()) }
                    .second.add(point.value)
            }
        } catch (_: Exception) {
            // Skip invalid dates
        }
    }
    
    return grouped.map { (label, pair) ->
        live.airuncoach.airuncoach.viewmodel.GroupedTrendDataPoint(
            label = label,
            value = pair.second.average()
        )
    }.sortedBy { it.label }
}



@Composable
private fun AllTimeAchievementsSection(
    allTimeStats: Map<String, Any>
) {
    if (allTimeStats.isEmpty()) {
        EmptyStateCard(message = "No achievements yet. Start running!")
    } else {
        val achievements = listOf(
            Triple("🔥", "Most Consecutive Runs", allTimeStats["mostConsecutiveRuns"]?.toString() ?: "0"),
            Triple("📏", "Longest Run", "${allTimeStats["longestRunKm"]?.toString() ?: "-"} km"),
            Triple("⏱️", "Longest Run Time", formatLongDuration((allTimeStats["longestRunTimeSec"] as? Number)?.toLong() ?: 0L)),
            Triple("⛰️", "Highest Elevation", "${allTimeStats["highestElevationM"]?.toString() ?: "-"} m"),
            Triple("🎯", "Goals Achieved", allTimeStats["goalsAchieved"]?.toString() ?: "0")
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Colors.backgroundSecondary)
                .padding(vertical = Spacing.md),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            achievements.forEachIndexed { index, (icon, title, value) ->
                AchievementItem(icon = icon, title = title, value = value)
                if (index < achievements.size - 1) {
                    HorizontalDivider(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = Spacing.md),
                        color = Colors.backgroundTertiary,
                        thickness = 1.dp
                    )
                }
            }
        }
    }
}

@Composable
private fun AchievementItem(
    icon: String,
    title: String,
    value: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.md, vertical = Spacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            Text(text = icon, fontSize = 24.sp)
            Text(
                text = title,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
        }
        Text(
            text = value,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.primary,
            fontWeight = FontWeight.Bold
        )
    }
}

// ─────────────────────────── COACHING PLAN SUMMARY ───────────────────────────

/**
 * Coaching Plan Summary section — only shown when the user has coaching plan sessions.
 * Shows target achievement rate, intensity mix, workout type breakdown,
 * progression trend, and the best coached run.
 */
@Composable
private fun CoachingPlanSummarySection(summary: CoachingPlanSummary) {
    if (!summary.hasCoachingSessions) {
        EmptyStateCard(message = "No coaching plan sessions in this period.\nStart a training plan to see insights here!")
        return
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        // ── Top stats row ────────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            StatCard(
                label = "Sessions",
                value = summary.sessionsThisPeriod.toString(),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Avg/Week",
                value = String.format(Locale.getDefault(), "%.1f", summary.avgWeeklyCoachingSessions),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Target Hit",
                value = "${summary.targetAchievementRate}%",
                modifier = Modifier.weight(1f)
            )
        }

        // ── Pace + Distance row ──────────────────────────────────────────────
        if (summary.avgPaceDisplay.isNotBlank() && summary.avgPaceDisplay != "--") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                StatCard(
                    label = "Avg Pace",
                    value = summary.avgPaceDisplay,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    label = "Distance",
                    value = String.format(Locale.getDefault(), "%.1f km", summary.totalDistanceKm),
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    label = "All-Time",
                    value = "${summary.totalSessions} sessions",
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // ── Progression trend card ────────────────────────────────────────────
        val trendColor = when (summary.progressionTrend) {
            "IMPROVING" -> Color(0xFF4CAF50)
            "DECLINING" -> Color(0xFFF44336)
            else        -> Colors.textSecondary
        }
        val trendIcon = when (summary.progressionTrend) {
            "IMPROVING" -> "↑"
            "DECLINING" -> "↓"
            else        -> "→"
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Colors.backgroundSecondary)
                .padding(Spacing.md)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                Text(
                    text = trendIcon,
                    fontSize = 22.sp,
                    color = trendColor
                )
                Column {
                    Text(
                        text = "Progression",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted,
                        fontSize = 11.sp
                    )
                    Text(
                        text = summary.progressionNote,
                        style = AppTextStyles.body,
                        color = Colors.textPrimary,
                        fontSize = 13.sp
                    )
                }
            }
        }

        // ── Intensity breakdown ───────────────────────────────────────────────
        val intensityTotal = (summary.intensityBreakdown.easy +
                summary.intensityBreakdown.moderate +
                summary.intensityBreakdown.hard +
                summary.intensityBreakdown.unset).coerceAtLeast(1)

        if (intensityTotal > 0 && summary.intensityBreakdown.unset < intensityTotal) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Colors.backgroundSecondary)
                    .padding(Spacing.md),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "Intensity Mix",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.textMuted,
                    fontSize = 11.sp
                )
                CoachingIntensityBar(
                    easy     = summary.intensityBreakdown.easy,
                    moderate = summary.intensityBreakdown.moderate,
                    hard     = summary.intensityBreakdown.hard,
                    total    = intensityTotal
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    CoachingIntensityLegend(color = Color(0xFF4CAF50), label = "Easy",     count = summary.intensityBreakdown.easy)
                    CoachingIntensityLegend(color = Color(0xFFFF9800), label = "Moderate", count = summary.intensityBreakdown.moderate)
                    CoachingIntensityLegend(color = Color(0xFFF44336), label = "Hard",     count = summary.intensityBreakdown.hard)
                }
            }
        }

        // ── Workout type breakdown (if populated) ────────────────────────────
        val hasTypes = summary.workoutTypeBreakdown.isNotEmpty() &&
                summary.workoutTypeBreakdown.keys.any { it != "other" && it.isNotBlank() }

        if (hasTypes) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Colors.backgroundSecondary)
                    .padding(Spacing.md),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "Session Types",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.textMuted,
                    fontSize = 11.sp
                )
                val typeOrder = listOf("easy_run", "long_run", "tempo", "intervals",
                    "hill_repeats", "recovery", "other")
                val typeLabels = mapOf(
                    "easy_run"     to "Easy Run",
                    "long_run"     to "Long Run",
                    "tempo"        to "Tempo",
                    "intervals"    to "Intervals",
                    "hill_repeats" to "Hill Repeats",
                    "recovery"     to "Recovery",
                    "other"        to "Other"
                )
                typeOrder.forEach { key ->
                    val cnt = summary.workoutTypeBreakdown[key] ?: 0
                    if (cnt > 0) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = typeLabels[key] ?: key.replace('_', ' ').replaceFirstChar { it.uppercase() },
                                style = AppTextStyles.caption,
                                color = Colors.textSecondary,
                                fontSize = 12.sp,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = "$cnt",
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                color = Colors.primary,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        }

        // ── Best coaching run ─────────────────────────────────────────────────
        summary.bestCoachingRun?.let { best ->
            if (best.runId.isNotBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Colors.backgroundSecondary)
                        .padding(Spacing.md)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "⭐ Best Coached Run",
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.textMuted,
                                fontSize = 11.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = String.format(
                                    Locale.getDefault(),
                                    "%.2f km  ·  %s/km",
                                    best.distanceKm,
                                    best.pace
                                ),
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.textPrimary,
                                fontSize = 14.sp
                            )
                        }
                        if (best.date.isNotBlank()) {
                            Text(
                                text = formatDateToDDMMYYYY(best.date),
                                style = AppTextStyles.caption,
                                color = Colors.textMuted,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Segmented intensity bar (green/orange/red) */
@Composable
private fun CoachingIntensityBar(easy: Int, moderate: Int, hard: Int, total: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(10.dp)
            .clip(RoundedCornerShape(5.dp))
    ) {
        if (easy > 0) Box(
            modifier = Modifier
                .weight(easy.toFloat() / total)
                .fillMaxHeight()
                .background(Color(0xFF4CAF50))
        )
        if (moderate > 0) Box(
            modifier = Modifier
                .weight(moderate.toFloat() / total)
                .fillMaxHeight()
                .background(Color(0xFFFF9800))
        )
        if (hard > 0) Box(
            modifier = Modifier
                .weight(hard.toFloat() / total)
                .fillMaxHeight()
                .background(Color(0xFFF44336))
        )
    }
}

@Composable
private fun CoachingIntensityLegend(color: Color, label: String, count: Int) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(color)
        )
        Text(
            text = "$label ($count)",
            style = AppTextStyles.caption,
            color = Colors.textMuted,
            fontSize = 10.sp
        )
    }
}

@Composable
private fun EmptyStateCard(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.lg),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = message,
            style = AppTextStyles.body,
            color = Colors.textMuted,
            textAlign = TextAlign.Center
        )
    }
}

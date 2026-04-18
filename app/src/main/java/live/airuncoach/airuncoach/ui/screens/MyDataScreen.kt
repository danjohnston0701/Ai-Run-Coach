package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
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
    viewModel: MyDataViewModel = hiltViewModel()
) {
    val selectedPeriod by viewModel.selectedTimePeriod.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val personalBests by viewModel.personalBests.collectAsState()
    val stats by viewModel.currentPeriodStats.collectAsState()
    val allTimeStats by viewModel.allTimeStats.collectAsState()
    
    val pullRefreshState = rememberPullRefreshState(
        refreshing = isLoading,
        onRefresh = { viewModel.refreshData() }
    )

    Scaffold(
        containerColor = Colors.backgroundRoot,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "My Data",
                        style = AppTextStyles.h2,
                        color = Colors.textPrimary
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                )
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

// The 6 standard race categories with their target distances
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
            TrendBarChart(title = "⚡ Avg Pace (min/km)", points = pacesTrend, unit = "/km", period = selectedPeriod, invertColors = true)
        }
        if (hrTrend.isNotEmpty()) {
            TrendBarChart(title = "❤️ Avg Heart Rate (bpm)", points = hrTrend, unit = " bpm", period = selectedPeriod)
        }
        if (elevationTrend.isNotEmpty()) {
            TrendBarChart(title = "⛰️ Elevation Gain (m)", points = elevationTrend, unit = " m", period = selectedPeriod)
        }
        if (cadenceTrend.isNotEmpty()) {
            TrendBarChart(title = "👟 Avg Cadence (spm)", points = cadenceTrend, unit = " spm", period = selectedPeriod)
        }
    }
}

/**
 * A native Compose bar chart showing trend data with grouped aggregation.
 * For shorter periods (1-3 months): groups by week
 * For longer periods (6-12 months): groups by month
 * invertColors = true means lower value is better (pace: lower = faster = green).
 */
@Composable
private fun TrendBarChart(
    title: String,
    points: List<TrendDataPoint>,
    unit: String,
    period: TimePeriod = TimePeriod.MONTH,
    invertColors: Boolean = false
) {
    if (points.isEmpty()) return

    // Group data by week or month based on period
    val display = groupTrendDataByPeriod(points, period)
    
    if (display.isEmpty()) return

    val maxVal = display.maxOf { it.value }
    val minVal = display.minOf { it.value }
    val range = if (maxVal - minVal < 0.001) 1.0 else maxVal - minVal
    
    // Calculate Y-axis scale
    val yAxisMax = (maxVal * 1.1).toInt()
    val yAxisStep = (yAxisMax / 4).coerceAtLeast(1)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.md)
    ) {
        Text(
            text = title,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.textPrimary,
            fontSize = 13.sp
        )
        Spacer(modifier = Modifier.height(Spacing.sm))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // Y-axis labels
            Column(
                modifier = Modifier
                    .width(35.dp)
                    .height(140.dp),
                verticalArrangement = Arrangement.SpaceBetween,
                horizontalAlignment = Alignment.End
            ) {
                repeat(5) { index ->
                    val yValue = yAxisMax - (index * yAxisStep)
                    Text(
                        text = yValue.toString(),
                        style = AppTextStyles.caption,
                        color = Colors.textMuted,
                        fontSize = 8.sp
                    )
                }
            }

            // Chart area with bars
            Column(
                modifier = Modifier.weight(1f)
            ) {
                // Bar chart
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(110.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    display.forEach { point ->
                        val fraction = ((point.value - minVal) / range).coerceIn(0.1, 1.0)
                        val barColor = if (invertColors) {
                            lerp(Color(0xFF4CAF50), Color(0xFFF44336), fraction.toFloat())
                        } else {
                            lerp(Color(0xFFF44336), Color(0xFF4CAF50), fraction.toFloat())
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(fraction.toFloat())
                                .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                .background(barColor)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // X-axis labels
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    display.forEach { point ->
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
        }

        Spacer(modifier = Modifier.height(6.dp))

        // Summary: min / max values
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "Min: ${String.format(Locale.getDefault(), "%.1f", minVal)}$unit",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 10.sp
            )
            Text(
                text = "${display.size} periods",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 10.sp
            )
            Text(
                text = "Max: ${String.format(Locale.getDefault(), "%.1f", maxVal)}$unit",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 10.sp
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

/** Linear interpolation between two colors */
private fun lerp(a: Color, b: Color, t: Float): Color {
    val tc = t.coerceIn(0f, 1f)
    return Color(
        red   = a.red   + (b.red   - a.red)   * tc,
        green = a.green + (b.green - a.green) * tc,
        blue  = a.blue  + (b.blue  - a.blue)  * tc,
        alpha = 1f
    )
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

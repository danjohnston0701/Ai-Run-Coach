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
import java.util.Locale

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
                        // Section 1: Time Period Selector
                        item {
                            TimePeriodSelector(
                                selectedPeriod = selectedPeriod,
                                onPeriodSelected = { viewModel.selectTimePeriod(it) }
                            )
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }

                        // Section 2: Personal Records
                        item {
                            SectionHeader(title = "🏆 Personal Records")
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            PersonalRecordsSection(personalBests = personalBests)
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }

                        // Section 3: Period Statistics
                        if (stats != null) {
                            item {
                                SectionHeader(title = "📊 Statistics (${selectedPeriod.label})")
                                Spacer(modifier = Modifier.height(Spacing.sm))
                                PeriodStatisticsSection(stats = stats!!)
                                Spacer(modifier = Modifier.height(Spacing.lg))
                            }
                        }

                        // Section 4: Performance Trends
                        item {
                            SectionHeader(title = "📈 Performance Trends")
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            PerformanceTrendsSection(viewModel = viewModel)
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }

                        // Section 5: All-Time Achievements
                        item {
                            SectionHeader(title = "⭐ All-Time Achievements")
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            AllTimeAchievementsSection(allTimeStats = allTimeStats)
                            Spacer(modifier = Modifier.height(Spacing.xl))
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

@Composable
private fun PersonalRecordsSection(
    personalBests: List<live.airuncoach.airuncoach.viewmodel.PersonalBest>
) {
    if (personalBests.isEmpty()) {
        EmptyStateCard(message = "No personal records yet. Keep running!")
    } else {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Colors.backgroundSecondary)
                .padding(vertical = Spacing.md),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            personalBests.forEachIndexed { index, pb ->
                PersonalBestCard(pb = pb)
                if (index < personalBests.size - 1) {
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
private fun PersonalBestCard(
    pb: live.airuncoach.airuncoach.viewmodel.PersonalBest
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = pb.category,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = pb.date,
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )
        }

        Column(
            horizontalAlignment = Alignment.End
        ) {
            Text(
                text = pb.pace,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.primary,
                fontSize = 16.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = String.format(Locale.getDefault(), "%.1f km", pb.distance),
                style = AppTextStyles.caption,
                color = Colors.textMuted
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

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg)
    ) {
        if (pacesTrend.isNotEmpty()) {
            TrendCard(
                title = "Pace Trend",
                emoji = "⚡",
                trend = pacesTrend
            )
        }

        if (hrTrend.isNotEmpty()) {
            TrendCard(
                title = "Heart Rate Trend",
                emoji = "❤️",
                trend = hrTrend
            )
        }

        if (elevationTrend.isNotEmpty()) {
            TrendCard(
                title = "Elevation Trend",
                emoji = "⛰️",
                trend = elevationTrend
            )
        }

        if (cadenceTrend.isNotEmpty()) {
            TrendCard(
                title = "Cadence Trend",
                emoji = "👟",
                trend = cadenceTrend
            )
        }
    }
}

@Composable
private fun TrendCard(
    title: String,
    emoji: String,
    trend: List<live.airuncoach.airuncoach.viewmodel.PeriodData>
) {
    Column(
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = "$emoji $title",
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.textPrimary
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            trend.forEach { period ->
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Colors.backgroundTertiary)
                        .padding(Spacing.sm),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = period.trend,
                        style = AppTextStyles.h3,
                        color = when (period.trend) {
                            "↑" -> Color(0xFF4CAF50) // Green - improvement
                            "↓" -> Color(0xFFF44336) // Red - decline
                            else -> Colors.primary
                        },
                        fontSize = 18.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = String.format(Locale.getDefault(), "%.1f", period.value),
                        style = AppTextStyles.caption,
                        color = Colors.textPrimary,
                        fontSize = 11.sp
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = period.period.label,
                        style = AppTextStyles.caption,
                        color = Colors.textMuted,
                        fontSize = 9.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun AllTimeAchievementsSection(
    allTimeStats: Map<String, Any>
) {
    if (allTimeStats.isEmpty()) {
        EmptyStateCard(message = "No achievements yet. Start running!")
    } else {
        val achievements = listOf(
            Triple("🏃", "Total Runs", allTimeStats["totalRuns"]?.toString() ?: "-"),
            Triple("🌍", "Total Distance", "${allTimeStats["totalDistanceKm"]?.toString() ?: "-"} km"),
            Triple("⏱️", "Total Time Running", allTimeStats["totalHours"]?.toString() ?: "-"),
            Triple("🔥", "Total Calories Burned", "${allTimeStats["totalCalories"]?.toString() ?: "-"} kcal")
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

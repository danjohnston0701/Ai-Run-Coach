package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.PreviousRunsViewModel
import live.airuncoach.airuncoach.viewmodel.WeatherImpactData
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun PreviousRunsScreen(
    onNavigateToRunSummary: (String) -> Unit,
    onNavigateBack: () -> Unit = {},
    viewModel: PreviousRunsViewModel = hiltViewModel()
) {
    val runs by viewModel.runs.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val weatherImpact by viewModel.weatherImpactData.collectAsState()
    val selectedFilter by viewModel.selectedFilter.collectAsState()
    
    var isWeatherImpactExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.fetchRuns()
        viewModel.calculateWeatherImpact()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
                .padding(top = Spacing.xl),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onNavigateBack) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_arrow_left),
                    contentDescription = "Back",
                    tint = Colors.textPrimary
                )
            }
            
            Spacer(modifier = Modifier.width(Spacing.sm))
            
            Column {
                Text(
                    text = "RUN HISTORY",
                    style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
                Text(
                    text = "Review your performance insights",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            }
        }
        
        Spacer(modifier = Modifier.height(Spacing.lg))
        
        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Colors.primary)
            }
        } else if (error != null) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = error ?: "Unknown error",
                    style = AppTextStyles.body,
                    color = Colors.error
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.md)
            ) {
                // Time Filter Dropdown
                item {
                    TimeFilterDropdown(
                        selectedFilter = selectedFilter,
                        onFilterSelected = viewModel::setTimeFilter
                    )
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }
                
                // Summary Stats
                item {
                    SummaryStatsCard(runs = runs)
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
                
                // Weather Impact Analysis (Collapsible)
                item {
                    weatherImpact?.let { impact ->
                        WeatherImpactAnalysisCard(
                            weatherImpact = impact,
                            isExpanded = isWeatherImpactExpanded,
                            onToggleExpanded = { isWeatherImpactExpanded = !isWeatherImpactExpanded }
                        )
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }
                }
                
                // Run List
                items(runs) { run ->
                    RunListItem(run = run, onClick = { onNavigateToRunSummary(run.id) })
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
            }
        }
    }
}

@Composable
fun TimeFilterDropdown(
    selectedFilter: String,
    onFilterSelected: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val filters = listOf("Last 7 Days", "Last 30 Days", "Last 3 Months", "All Time")
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { expanded = true },
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.6f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_calendar_vector),
                    contentDescription = "Filter",
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    text = selectedFilter,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.textPrimary
                )
            }
            
            Icon(
                painter = painterResource(id = R.drawable.icon_arrow_left),
                contentDescription = "Dropdown",
                tint = Colors.textMuted,
                modifier = Modifier.size(16.dp)
            )
        }
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            filters.forEach { filter ->
                DropdownMenuItem(
                    text = { Text(filter) },
                    onClick = {
                        onFilterSelected(filter)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
fun SummaryStatsCard(runs: List<RunSession>) {
    val totalSessions = runs.size
    val totalDistance = runs.sumOf { it.distance / 1000.0 }
    val totalTime = runs.sumOf { it.duration }
    val hours = totalTime / (1000 * 60 * 60)
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        StatCard(
            title = "SESSIONS",
            value = totalSessions.toString(),
            modifier = Modifier.weight(1f)
        )
        Spacer(modifier = Modifier.width(Spacing.md))
        StatCard(
            title = "DISTANCE",
            value = String.format("%.1f", totalDistance),
            unit = "KM",
            modifier = Modifier.weight(1f)
        )
        Spacer(modifier = Modifier.width(Spacing.md))
        StatCard(
            title = "TIME",
            value = "${hours}h",
            unit = "TOTAL",
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
fun StatCard(
    title: String,
    value: String,
    unit: String? = null,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.6f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = title,
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )
            Spacer(modifier = Modifier.height(Spacing.xs))
            Text(
                text = value,
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.primary
            )
            if (unit != null) {
                Text(
                    text = unit,
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
            }
        }
    }
}

@Composable
fun WeatherImpactAnalysisCard(
    weatherImpact: WeatherImpactData,
    isExpanded: Boolean,
    onToggleExpanded: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggleExpanded() },
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.6f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_trending_vector),
                        contentDescription = "Weather Impact",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(
                        text = "WEATHER IMPACT ANALYSIS",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
                
                Icon(
                    painter = painterResource(id = R.drawable.icon_arrow_left),
                    contentDescription = if (isExpanded) "Collapse" else "Expand",
                    tint = Colors.textMuted,
                    modifier = Modifier.size(16.dp)
                )
            }
            
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column {
                    Spacer(modifier = Modifier.height(Spacing.lg))
                    
                    // Weather impact content
                    Text(
                        text = "WEATHER IMPACT ANALYSIS",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                    Text(
                        text = "Based on ${weatherImpact.totalRuns} runs",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    // Best/Worst Conditions
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        // Best Condition
                        Card(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(BorderRadius.sm),
                            colors = CardDefaults.cardColors(
                                containerColor = Colors.success.copy(alpha = 0.1f)
                            )
                        ) {
                            Column(modifier = Modifier.padding(Spacing.md)) {
                                Text(
                                    text = "BEST CONDITION",
                                    style = AppTextStyles.caption,
                                    color = Colors.success
                                )
                                Text(
                                    text = weatherImpact.bestCondition.condition,
                                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                    color = Colors.textPrimary
                                )
                                Text(
                                    text = "${weatherImpact.bestCondition.percentageDiff}% faster",
                                    style = AppTextStyles.small,
                                    color = Colors.success
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.width(Spacing.md))
                        
                        // Toughest Condition
                        Card(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(BorderRadius.sm),
                            colors = CardDefaults.cardColors(
                                containerColor = Colors.error.copy(alpha = 0.1f)
                            )
                        ) {
                            Column(modifier = Modifier.padding(Spacing.md)) {
                                Text(
                                    text = "TOUGHEST CONDITION",
                                    style = AppTextStyles.caption,
                                    color = Colors.error
                                )
                                Text(
                                    text = weatherImpact.toughestCondition.condition,
                                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                    color = Colors.textPrimary
                                )
                                Text(
                                    text = "${weatherImpact.toughestCondition.percentageDiff}% slower",
                                    style = AppTextStyles.small,
                                    color = Colors.error
                                )
                            }
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    Text(
                        text = "Overall Average Pace: ${weatherImpact.overallAveragePace}",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }
        }
    }
}

@Composable
fun RunListItem(run: RunSession, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.6f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_calendar_vector),
                        contentDescription = "Date",
                        tint = Colors.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(
                        text = run.getFormattedDate(),
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(
                        text = SimpleDateFormat("HH:mm", Locale.getDefault())
                            .format(Date(run.startTime)),
                        style = AppTextStyles.body,
                        color = Colors.textMuted
                    )
                    
                    // Garmin badge if synced from Garmin
                    if (run.externalSource == "garmin") {
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Icon(
                            painter = painterResource(id = R.drawable.ic_garmin_logo),
                            contentDescription = "Synced from Garmin Connect",
                            tint = Color.Unspecified,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    
                    // Garmin badge if AI Run Coach run was uploaded TO Garmin
                    if (run.uploadedToGarmin == true && run.externalSource != "garmin") {
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Row(
                            modifier = Modifier
                                .background(
                                    color = Color(0xFF00A0DC).copy(alpha = 0.1f),
                                    shape = RoundedCornerShape(4.dp)
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                painter = painterResource(id = R.drawable.ic_garmin_logo),
                                contentDescription = null,
                                tint = Color.Unspecified,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = "Synced",
                                modifier = Modifier.size(12.dp),
                                tint = Color(0xFF00A0DC)
                            )
                        }
                    }
                }
                
                Icon(
                    painter = painterResource(id = R.drawable.icon_arrow_left),
                    contentDescription = "View Details",
                    tint = Colors.textMuted,
                    modifier = Modifier.size(16.dp)
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.sm))
            
            // Difficulty Badge
            val difficulty = run.getDifficultyLevel()
            Text(
                text = difficulty.uppercase(),
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                color = when (difficulty) {
                    "easy" -> Colors.success
                    "hard" -> Colors.error
                    else -> Colors.warning
                },
                modifier = Modifier
                    .background(
                        color = when (difficulty) {
                            "easy" -> Colors.success.copy(alpha = 0.2f)
                            "hard" -> Colors.error.copy(alpha = 0.2f)
                            else -> Colors.warning.copy(alpha = 0.2f)
                        },
                        shape = RoundedCornerShape(4.dp)
                    )
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            )
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Stats Grid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Distance
                Column {
                    Text(
                        text = "DISTANCE",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = String.format("%.1f", run.distance / 1000.0),
                            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary
                        )
                        Spacer(modifier = Modifier.width(2.dp))
                        Text(
                            text = "km",
                            style = AppTextStyles.caption,
                            color = Colors.textMuted
                        )
                    }
                }
                
                // Avg Pace
                Column {
                    Text(
                        text = "AVG PACE",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = run.averagePace?.replace("/km", "") ?: "--:--",
                            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary
                        )
                        Spacer(modifier = Modifier.width(2.dp))
                        Text(
                            text = "/km",
                            style = AppTextStyles.caption,
                            color = Colors.textMuted
                        )
                    }
                }
                
                // Duration
                Column {
                    Text(
                        text = "DURATION",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                    Text(
                        text = run.getFormattedDuration(),
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary
                    )
                }
            }
        }
    }
}

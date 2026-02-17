package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.network.model.BucketAnalysis
import live.airuncoach.airuncoach.network.model.ConditionAnalysis
import live.airuncoach.airuncoach.network.model.WeatherImpactData
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.PreviousRunsViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.min

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
                
                // Weather Impact Analysis (only show if enough real data)
                item {
                    weatherImpact?.let { impact ->
                        if (impact.hasEnoughData) {
                            WeatherImpactAnalysisCard(
                                weatherImpact = impact,
                                isExpanded = isWeatherImpactExpanded,
                                onToggleExpanded = { isWeatherImpactExpanded = !isWeatherImpactExpanded }
                            )
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }
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

// ====================== WEATHER IMPACT ANALYSIS COMPONENTS ======================

/**
 * Helper to format pace from seconds per km to "M:SS" format
 */
private fun formatPace(secondsPerKm: Int?): String {
    if (secondsPerKm == null) return "—"
    val minutes = secondsPerKm / 60
    val seconds = secondsPerKm % 60
    return String.format("%d:%02d", minutes, seconds)
}

/**
 * PaceBar component - a horizontal diverging bar chart showing pace vs average
 */
@Composable
private fun PaceBar(
    label: String,
    runCount: Int,
    paceVsAvg: Float?,
    modifier: Modifier = Modifier
) {
    val percentage = paceVsAvg ?: 0f
    val isFaster = percentage < 0
    val absPercentage = abs(percentage)
    
    // Animate bar width
    val animatedWidth by animateFloatAsState(
        targetValue = (min(absPercentage * 5, 100f) / 100f),
        animationSpec = tween(durationMillis = 500),
        label = "barWidth"
    )
    
    Column(modifier = modifier.fillMaxWidth()) {
        // Label and run count
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = label,
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )
            Text(
                text = "$runCount runs",
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )
        }
        
        Spacer(modifier = Modifier.height(4.dp))
        
        // Bar row
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Bar background with center line
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(24.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.White.copy(alpha = 0.05f))
            ) {
                // Center line
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .width(1.dp)
                        .fillMaxHeight()
                        .background(Color.White.copy(alpha = 0.2f))
                )
                
                // Colored bar
                if (animatedWidth > 0) {
                    val barColor = if (isFaster) Color(0xFF22C55E).copy(alpha = 0.6f) else Color(0xFFEF4444).copy(alpha = 0.6f)
                    val barAlignment = if (isFaster) Alignment.CenterEnd else Alignment.CenterStart
                    
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth(animatedWidth)
                            .align(barAlignment)
                            .background(barColor, RoundedCornerShape(8.dp))
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(8.dp))
            
            // Percentage text
            val percentColor = if (isFaster) Color(0xFF4ADE80) else Color(0xFFF87171)
            val percentText = if (isFaster) "${absPercentage.toInt()}% faster" else "${absPercentage.toInt()}% slower"
            Text(
                text = percentText,
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Medium),
                color = percentColor
            )
        }
    }
}

/**
 * Summary Card - the main card showing best/worst conditions and overall stats
 */
@Composable
private fun WeatherSummaryCard(
    weatherImpact: WeatherImpactData,
    modifier: Modifier = Modifier
) {
    val gradient = Brush.verticalGradient(
        colors = listOf(
            Color(0xFF1E3A5F).copy(alpha = 0.3f),
            Color(0xFF2D1B69).copy(alpha = 0.3f)
        )
    )
    
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(gradient)
                .border(1.dp, Color(0xFF3B82F6).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                .padding(16.dp)
        ) {
            Column {
                // Header with icon
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.BarChart,
                        contentDescription = null,
                        tint = Color(0xFF60A5FA),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "WEATHER IMPACT ANALYSIS",
                            style = AppTextStyles.caption.copy(letterSpacing = 1.sp),
                            color = Colors.textMuted
                        )
                        Text(
                            text = "Based on ${weatherImpact.runsAnalyzed} runs",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // Best and Toughest conditions side by side
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Best Condition
                    val bestCondition = weatherImpact.insights?.bestCondition
                    ConditionBox(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.TrendingUp,
                        label = "BEST CONDITION",
                        conditionLabel = bestCondition?.label ?: "—",
                        performanceText = bestCondition?.improvement?.let { "$it faster" } ?: "—",
                        iconColor = Color(0xFF4ADE80),
                        backgroundColor = Color(0xFF22C55E).copy(alpha = 0.1f),
                        borderColor = Color(0xFF22C55E).copy(alpha = 0.2f),
                        textColor = Color(0xFF4ADE80)
                    )
                    
                    // Toughest Condition
                    val worstCondition = weatherImpact.insights?.worstCondition
                    ConditionBox(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.TrendingDown,
                        label = "TOUGHEST CONDITION",
                        conditionLabel = worstCondition?.label ?: "—",
                        performanceText = worstCondition?.slowdown?.let { "$it slower" } ?: "—",
                        iconColor = Color(0xFFF87171),
                        backgroundColor = Color(0xFFEF4444).copy(alpha = 0.1f),
                        borderColor = Color(0xFFEF4444).copy(alpha = 0.2f),
                        textColor = Color(0xFFF87171)
                    )
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                
                // Divider
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(Color.White.copy(alpha = 0.1f))
                )
                
                Spacer(modifier = Modifier.height(12.dp))
                
                // Overall average pace
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "Overall Average Pace: ",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                    Text(
                        text = "${formatPace(weatherImpact.overallAvgPace)} /km",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Color.White
                    )
                }
            }
        }
    }
}

@Composable
private fun ConditionBox(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    label: String,
    conditionLabel: String,
    performanceText: String,
    iconColor: Color,
    backgroundColor: Color,
    borderColor: Color,
    textColor: Color
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(backgroundColor)
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .padding(12.dp)
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = label,
                    style = AppTextStyles.caption.copy(letterSpacing = 0.5.sp),
                    color = textColor
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = conditionLabel,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                color = Color.White
            )
            Text(
                text = performanceText,
                style = AppTextStyles.caption,
                color = textColor
            )
        }
    }
}

/**
 * Generic factor card (Temperature, Humidity, Wind, Time of Day)
 */
@Composable
private fun WeatherFactorCard(
    title: String,
    icon: ImageVector,
    iconColor: Color,
    gradientFrom: Color,
    borderColor: Color,
    analysis: List<BucketAnalysis>?,
    modifier: Modifier = Modifier
) {
    val gradient = Brush.verticalGradient(
        colors = listOf(
            gradientFrom.copy(alpha = 0.2f),
            Color(0xFF1A1A2E).copy(alpha = 0.3f)
        )
    )
    
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(gradient)
                .border(1.dp, borderColor.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                .padding(16.dp)
        ) {
            Column {
                // Header
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = iconColor,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = title,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp),
                        color = Color.White
                    )
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                
                // Pace bars
                if (analysis.isNullOrEmpty()) {
                    Text(
                        text = "No data available",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                } else {
                    analysis.forEach { bucket ->
                        PaceBar(
                            label = bucket.label,
                            runCount = bucket.runCount,
                            paceVsAvg = bucket.paceVsAvg,
                            modifier = Modifier.padding(vertical = 6.dp)
                        )
                    }
                }
            }
        }
    }
}

/**
 * Conditions card - shows weather conditions (sunny, cloudy, rainy)
 */
@Composable
private fun WeatherConditionsCard(
    conditions: List<ConditionAnalysis>?,
    modifier: Modifier = Modifier
) {
    val gradient = Brush.verticalGradient(
        colors = listOf(
            Color(0xFF78350F).copy(alpha = 0.2f),
            Color(0xFF1A1A2E).copy(alpha = 0.3f)
        )
    )
    
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(gradient)
                .border(1.dp, Color(0xFFEAB308).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                .padding(16.dp)
        ) {
            Column {
                // Header
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.WbSunny,
                        contentDescription = null,
                        tint = Color(0xFFFACC15),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "CONDITIONS",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp),
                        color = Color.White
                    )
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                
                // Conditions list
                if (conditions.isNullOrEmpty()) {
                    Text(
                        text = "No data available",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                } else {
                    conditions.forEach { condition ->
                        val isFaster = condition.paceVsAvg < 0
                        val percentColor = if (isFaster) Color(0xFF4ADE80) else Color(0xFFF87171)
                        val percentText = if (isFaster) "${abs(condition.paceVsAvg).toInt()}% faster" else "${abs(condition.paceVsAvg).toInt()}% slower"
                        
                        // Choose icon based on condition name
                        val conditionIcon = when {
                            condition.condition.contains("rain", ignoreCase = true) ||
                            condition.condition.contains("drizzle", ignoreCase = true) ||
                            condition.condition.contains("shower", ignoreCase = true) -> Icons.Default.Grain
                            condition.condition.contains("cloud", ignoreCase = true) ||
                            condition.condition.contains("overcast", ignoreCase = true) -> Icons.Default.Cloud
                            else -> Icons.Default.WbSunny
                        }
                        val conditionIconColor = when {
                            condition.condition.contains("rain", ignoreCase = true) -> Color(0xFF60A5FA)
                            condition.condition.contains("cloud", ignoreCase = true) -> Color(0xFF9CA3AF)
                            else -> Color(0xFFFACC15)
                        }
                        
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = conditionIcon,
                                    contentDescription = null,
                                    tint = conditionIconColor,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = condition.condition,
                                    style = AppTextStyles.body,
                                    color = Colors.textMuted
                                )
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "${condition.runCount} runs",
                                    style = AppTextStyles.caption,
                                    color = Colors.textMuted
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = percentText,
                                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                                    color = percentColor
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
 * Main Weather Impact Analysis Card - contains all 6 sub-cards
 */
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
            // Header - always visible
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.BarChart,
                        contentDescription = "Weather Impact",
                        tint = Color(0xFF60A5FA),
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
                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (isExpanded) "Collapse" else "Expand",
                    tint = Colors.textMuted,
                    modifier = Modifier.size(24.dp)
                )
            }
            
            // Summary always visible
            Spacer(modifier = Modifier.height(Spacing.md))
            WeatherSummaryCard(weatherImpact = weatherImpact)
            
            // Expandable content
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column(
                    modifier = Modifier.padding(top = Spacing.md),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Temperature
                    WeatherFactorCard(
                        title = "TEMPERATURE",
                        icon = Icons.Default.Thermostat,
                        iconColor = Color(0xFFFB923C),
                        gradientFrom = Color(0xFF7C2D12),
                        borderColor = Color(0xFFF97316),
                        analysis = weatherImpact.temperatureAnalysis
                    )
                    
                    // Humidity
                    WeatherFactorCard(
                        title = "HUMIDITY",
                        icon = Icons.Default.WaterDrop,
                        iconColor = Color(0xFF22D3EE),
                        gradientFrom = Color(0xFF164E63),
                        borderColor = Color(0xFF06B6D4),
                        analysis = weatherImpact.humidityAnalysis
                    )
                    
                    // Wind
                    WeatherFactorCard(
                        title = "WIND",
                        icon = Icons.Default.Air,
                        iconColor = Color(0xFF9CA3AF),
                        gradientFrom = Color(0xFF1F2937),
                        borderColor = Color(0xFF6B7280),
                        analysis = weatherImpact.windAnalysis
                    )
                    
                    // Conditions
                    WeatherConditionsCard(conditions = weatherImpact.conditionAnalysis)
                    
                    // Time of Day
                    WeatherFactorCard(
                        title = "TIME OF DAY",
                        icon = Icons.Default.Schedule,
                        iconColor = Color(0xFFC084FC),
                        gradientFrom = Color(0xFF581C87),
                        borderColor = Color(0xFFA855F7),
                        analysis = weatherImpact.timeOfDayAnalysis
                    )
                }
            }
            
            // Not enough data message
            if (!weatherImpact.hasEnoughData) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    text = weatherImpact.message ?: "Not enough data. Runs analyzed: ${weatherImpact.runsAnalyzed} (need at least 3)",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
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

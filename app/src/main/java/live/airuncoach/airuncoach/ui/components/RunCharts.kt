package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.patrykandpatrick.vico.compose.axis.horizontal.rememberBottomAxis
import com.patrykandpatrick.vico.compose.axis.vertical.rememberStartAxis
import com.patrykandpatrick.vico.compose.chart.Chart
import com.patrykandpatrick.vico.compose.chart.line.lineChart
import com.patrykandpatrick.vico.compose.chart.column.columnChart
import com.patrykandpatrick.vico.compose.style.ProvideChartStyle
import com.patrykandpatrick.vico.core.entry.ChartEntryModelProducer
import com.patrykandpatrick.vico.core.entry.FloatEntry
import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.ui.theme.*

/**
 * Pace over time line chart
 */
@Composable
fun PaceChart(
    routePoints: List<LocationPoint>,
    modifier: Modifier = Modifier
) {
    if (routePoints.isEmpty()) {
        EmptyChartPlaceholder("No pace data available", modifier)
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(
                "Pace Over Distance",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "Track your pace consistency throughout the run",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            // Create chart entries from route points
            val chartEntries = remember(routePoints) {
                routePoints.mapIndexed { index, point ->
                    FloatEntry(
                        x = index.toFloat(),
                        y = point.speed ?: 0f
                    )
                }
            }

            if (chartEntries.isNotEmpty()) {
                val chartEntryModelProducer = remember { ChartEntryModelProducer(chartEntries) }
                val model = chartEntryModelProducer.getModel()
                
                if (model != null) {
                    ProvideChartStyle {
                        Chart(
                            chart = lineChart(),
                            model = model,
                            startAxis = rememberStartAxis(),
                            bottomAxis = rememberBottomAxis(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp)
                        )
                    }
                } else {
                    EmptyChartPlaceholder("No pace data available")
                }
            }
        }
    }
}

/**
 * Elevation profile chart
 */
@Composable
fun ElevationChart(
    routePoints: List<LocationPoint>,
    modifier: Modifier = Modifier
) {
    if (routePoints.isEmpty() || routePoints.none { it.altitude != null }) {
        EmptyChartPlaceholder("No elevation data available", modifier)
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(
                "Elevation Profile",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "Terrain changes throughout your route",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            val chartEntries = remember(routePoints) {
                routePoints.mapIndexedNotNull { index, point ->
                    point.altitude?.let { altitude ->
                        FloatEntry(x = index.toFloat(), y = altitude.toFloat())
                    }
                }
            }

            if (chartEntries.isNotEmpty()) {
                val chartEntryModelProducer = remember { ChartEntryModelProducer(chartEntries) }
                val model = chartEntryModelProducer.getModel()
                
                if (model != null) {
                    ProvideChartStyle {
                        Chart(
                            chart = lineChart(),
                            model = model,
                            startAxis = rememberStartAxis(),
                            bottomAxis = rememberBottomAxis(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp)
                        )
                    }
                } else {
                    EmptyChartPlaceholder("No elevation data available")
                }
            }
        }
    }
}

/**
 * Km splits bar chart
 */
@Composable
fun SplitsChart(
    kmSplits: List<KmSplit>,
    modifier: Modifier = Modifier
) {
    if (kmSplits.isEmpty()) {
        EmptyChartPlaceholder("No split data available", modifier)
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(
                "Km Split Times",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "Compare your pace across each kilometer",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            val chartEntries = remember(kmSplits) {
                kmSplits.map { split ->
                    FloatEntry(
                        x = split.km.toFloat(),
                        y = (split.time / 1000f / 60f) // Convert to minutes
                    )
                }
            }

            if (chartEntries.isNotEmpty()) {
                val chartEntryModelProducer = remember { ChartEntryModelProducer(chartEntries) }
                val model = chartEntryModelProducer.getModel()
                
                if (model != null) {
                    ProvideChartStyle {
                        Chart(
                            chart = columnChart(),
                            model = model,
                            startAxis = rememberStartAxis(),
                            bottomAxis = rememberBottomAxis(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp)
                        )
                    }
                } else {
                    EmptyChartPlaceholder("No split data available")
                }
            }
        }
    }
}

/**
 * Heart rate zones chart
 */
@Composable
fun HeartRateZonesChart(
    heartRateData: List<Int>,
    modifier: Modifier = Modifier
) {
    if (heartRateData.isEmpty() || heartRateData.all { it == 0 }) {
        EmptyChartPlaceholder("No heart rate data available", modifier)
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(
                "Heart Rate Zones",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "Time spent in each training zone",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            // Calculate zone distribution
            val zones = remember(heartRateData) {
                calculateHRZones(heartRateData)
            }

            // Display zone bars
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                zones.forEach { (zone, percentage) ->
                    HeartRateZoneBar(zone, percentage)
                }
            }
        }
    }
}

@Composable
private fun HeartRateZoneBar(zone: HRZone, percentage: Float) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            zone.name,
            style = AppTextStyles.caption,
            color = Colors.textPrimary,
            modifier = Modifier.width(80.dp)
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(24.dp)
                .clip(RoundedCornerShape(BorderRadius.sm))
                .background(Colors.textMuted.copy(alpha = 0.2f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(percentage)
                    .clip(RoundedCornerShape(BorderRadius.sm))
                    .background(zone.color)
            )
        }
        Text(
            String.format("%.0f%%", percentage * 100),
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary,
            modifier = Modifier.padding(start = Spacing.sm).width(40.dp)
        )
    }
}

@Composable
internal fun EmptyChartPlaceholder(message: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp)
                .padding(Spacing.lg),
            contentAlignment = Alignment.Center
        ) {
            Text(
                message,
                style = AppTextStyles.body,
                color = Colors.textMuted
            )
        }
    }
}

/**
 * Heart rate zone data class
 */
data class HRZone(
    val name: String,
    val color: Color,
    val range: IntRange
)

/**
 * Calculate heart rate zones distribution
 */
private fun calculateHRZones(heartRateData: List<Int>): List<Pair<HRZone, Float>> {
    val zones = listOf(
        HRZone("Zone 1", Color(0xFF64B5F6), 0..120),      // Recovery - Blue
        HRZone("Zone 2", Color(0xFF81C784), 121..140),    // Endurance - Green
        HRZone("Zone 3", Color(0xFFFFD54F), 141..160),    // Tempo - Yellow
        HRZone("Zone 4", Color(0xFFFF8A65), 161..180),    // Threshold - Orange
        HRZone("Zone 5", Color(0xFFE57373), 181..220)     // Max - Red
    )

    val total = heartRateData.size.toFloat()
    
    return zones.map { zone ->
        val count = heartRateData.count { hr -> hr in zone.range }
        val percentage = if (total > 0) count / total else 0f
        zone to percentage
    }
}

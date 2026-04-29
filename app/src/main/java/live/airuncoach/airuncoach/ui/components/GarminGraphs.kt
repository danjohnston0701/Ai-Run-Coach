package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.foundation.Canvas
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.ui.theme.*

/**
 * Heart Rate Zone vs Pace Chart
 * 
 * Shows how heart rate effort aligns with pace targets (running efficiency)
 * 
 * X-axis: Pace (min/km) - faster left, slower right
 * Y-axis: Heart Rate (bpm) - with intelligent margin handling
 * Color: Zone (Z1=blue, Z2=green, Z3=yellow, Z4=orange, Z5=red)
 * Size: Training effect magnitude
 */
@Composable
fun HeartRateZonePaceChart(
    run: RunSession,
    modifier: Modifier = Modifier
) {
    // Extract pace and HR data from run
    val data = remember(run) {
        // Build list of (pace, heartRate, zone) from run data
        // This would typically come from LocationPoint time-series or watch biometric samples
        emptyList<Triple<Float, Float, Int>>()  // TODO: Extract from run data
    }
    
    if (data.isEmpty()) {
        Card(
            modifier = modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
        ) {
            Column(modifier = Modifier.padding(Spacing.lg)) {
                Text(
                    "Heart Rate Zone vs Pace",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    "Heart rate data not available for this run",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            }
        }
        return
    }
    
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Title
            Text(
                "Heart Rate Zone vs Pace",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Chart
            HRZonePaceScatterPlot(data = data, modifier = Modifier.fillMaxWidth())
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Insight card
            HRZonePaceInsight(run = run)
        }
    }
}

/**
 * Scatter plot visualization of HR vs Pace with zone coloring
 */
@Composable
private fun HRZonePaceScatterPlot(
    data: List<Triple<Float, Float, Int>>,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp)
    ) {
        val padding = 50f
        val chartWidth = size.width - padding * 2
        val chartHeight = size.height - padding * 2
        
        // Extract pace and HR values
        val paces = data.map { it.first }
        val hrs = data.map { it.second }
        
        // Calculate axis configs with intelligent margins
        val paceConfig = calculateAxisConfig(
            paces,
            typicalMin = 4f,
            typicalMax = 7f,
            minSpreadPercentage = 0.10f
        )
        
        val hrConfig = calculateAxisConfig(
            hrs,
            typicalMin = 140f,
            typicalMax = 180f,
            minSpreadPercentage = 0.10f
        )
        
        // Draw background zone bands
        drawZoneBands(
            paceConfig = paceConfig,
            chartWidth = chartWidth,
            chartHeight = chartHeight,
            padding = padding
        )
        
        // Draw axes
        drawLine(
            color = Colors.border,
            start = Offset(padding, padding),
            end = Offset(padding, size.height - padding),
            strokeWidth = 2f
        )
        
        drawLine(
            color = Colors.border,
            start = Offset(padding, size.height - padding),
            end = Offset(size.width - padding, size.height - padding),
            strokeWidth = 2f
        )
        
        // Draw grid lines
        drawAxisLabelsAndGrid(
            paceConfig = paceConfig,
            hrConfig = hrConfig,
            padding = padding,
            chartWidth = chartWidth,
            chartHeight = chartHeight
        )
        
        // Draw data points
        data.forEach { (pace, hr, zone) ->
            val x = scaleToCanvas(pace, paceConfig, padding, chartWidth)
            val y = size.height - padding - ((hr - hrConfig.visualMin) / hrConfig.range) * chartHeight
            
            val color = getZoneColor(zone)
            val radius = 8f  // Could be scaled by training effect
            
            drawCircle(
                color = color,
                radius = radius,
                center = Offset(x, y)
            )
        }
    }
}

/**
 * Draw HR zone background bands
 */
@Suppress("UNUSED_PARAMETER")
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawZoneBands(
    paceConfig: AxisConfig,
    chartWidth: Float,
    chartHeight: Float,
    padding: Float
) {
    // Zone thresholds as % of max HR
    // Z1: <50% (Blue), Z2: 50-60% (Green), Z3: 60-75% (Yellow)
    // Z4: 75-85% (Orange), Z5: >85% (Red)
    
    // TODO: Draw zone bands as horizontal rectangles based on HR range
}

/**
 * Draw axis labels and grid lines
 */
@Suppress("UNUSED_PARAMETER")
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawAxisLabelsAndGrid(
    paceConfig: AxisConfig,
    hrConfig: AxisConfig,
    padding: Float,
    chartWidth: Float,
    chartHeight: Float
) {
    // TODO: Draw pace labels (bottom) with grid lines
    val paceStep = calculateLabelStep(paceConfig.range)
    var pace = paceConfig.visualMin
    while (pace <= paceConfig.visualMax) {
        // Label + grid line
        pace += paceStep
    }
    
    // TODO: Draw HR labels (left) with grid lines
    val hrStep = calculateLabelStep(hrConfig.range)
    var hr = hrConfig.visualMin
    while (hr <= hrConfig.visualMax) {
        // Label + grid line
        hr += hrStep
    }
}

/**
 * Calculate sensible label step size for axis
 */
private fun calculateLabelStep(range: Float): Float {
    return when {
        range <= 5 -> 0.5f
        range <= 10 -> 1f
        range <= 20 -> 2f
        range <= 50 -> 5f
        range <= 100 -> 10f
        else -> 20f
    }
}

/**
 * Get zone color
 */
private fun getZoneColor(zone: Int): Color {
    return when (zone) {
        1 -> Color(0xFF4A90E2)   // Z1: Blue
        2 -> Color(0xFF7ED321)   // Z2: Green
        3 -> Color(0xFFF5A623)   // Z3: Yellow
        4 -> Color(0xFFFF6B35)   // Z4: Orange
        5 -> Color(0xFFD0021B)   // Z5: Red
        else -> Colors.textSecondary
    }
}

/**
 * Insight card for HR vs Pace analysis
 */
@Composable
@Suppress("UNUSED_PARAMETER")
private fun HRZonePaceInsight(
    run: RunSession,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.8f)
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = Colors.success,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    "Pacing Efficiency",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Zone breakdown
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = Spacing.sm),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                ZoneBreakdownItem(zone = "Z1", percentage = 0f, color = Color(0xFF4A90E2))
                ZoneBreakdownItem(zone = "Z2", percentage = 15f, color = Color(0xFF7ED321))
                ZoneBreakdownItem(zone = "Z3", percentage = 65f, color = Color(0xFFF5A623))
                ZoneBreakdownItem(zone = "Z4", percentage = 20f, color = Color(0xFFFF6B35))
                ZoneBreakdownItem(zone = "Z5", percentage = 0f, color = Color(0xFFD0021B))
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            Text(
                "You maintained excellent pace discipline, staying in Zone 3 for the entire run. This consistent effort level shows great pacing strategy.",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
        }
    }
}

/**
 * Zone breakdown item (small badge)
 */
@Composable
private fun ZoneBreakdownItem(
    zone: String,
    percentage: Float,
    color: Color
) {
    Column(
        modifier = Modifier
            .background(color.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
            .padding(Spacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            zone,
            style = AppTextStyles.caption.copy(fontSize = 10.sp, fontWeight = FontWeight.Bold),
            color = color
        )
        Text(
            "${percentage.toInt()}%",
            style = AppTextStyles.caption.copy(fontSize = 11.sp),
            color = color
        )
    }
}

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
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.ui.extensions.getHeartRateZoneDistribution
import live.airuncoach.airuncoach.ui.theme.*
import java.util.Locale

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
    // Build (pace min/km, heartRate, zone) triples by interleaving paceData + heartRateData.
    // Both lists are uniformly sampled so we align them by index ratio.
    val data = remember(run) {
        val hrList   = run.heartRateData
        val paceList = run.paceData
        if (hrList.isNullOrEmpty()) return@remember emptyList()

        // Use observed peak as a lower bound, clamped to at least 185 bpm so that
        // easy runs (where peak is e.g. 148 bpm) don't compress all zone thresholds
        // to nonsensical values. Standard 5-zone model: Z1<60%, Z2 60-70%,
        // Z3 70-80%, Z4 80-90%, Z5 ≥90% of max HR (matches RunningMetricsConfig).
        val maxHr = (hrList.maxOrNull() ?: 185).coerceAtLeast(185)
        fun hrToZone(hr: Int): Int = when {
            hr < maxHr * 0.60f -> 1
            hr < maxHr * 0.70f -> 2
            hr < maxHr * 0.80f -> 3
            hr < maxHr * 0.90f -> 4
            else               -> 5
        }

        hrList.mapIndexed { idx, hr ->
            // Map pace sample by ratio (pace list may be shorter/longer than HR list)
            val paceSecPerKm = if (!paceList.isNullOrEmpty()) {
                val paceIdx = (idx.toFloat() / hrList.size * paceList.size)
                    .toInt().coerceIn(0, paceList.size - 1)
                paceList[paceIdx].toFloat()
            } else {
                // Fall back: derive pace from overall average
                val avgPaceSec = run.elapsedTime?.let { t ->
                    if (run.distance > 0) (t / (run.distance / 1000.0)).toFloat() else 360f
                } ?: 360f
                avgPaceSec
            }
            Triple(paceSecPerKm / 60f, hr.toFloat(), hrToZone(hr))
        }
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
    val textMeasurer = rememberTextMeasurer()
    
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
            chartHeight = chartHeight,
            textMeasurer = textMeasurer
        )
        
        // Draw data points
        data.forEach { (pace, hr, zone) ->
            // REVERSED pace axis: higher pace values (slower) go to the left
            val xReversed = padding + chartWidth * (1f - (pace - paceConfig.visualMin) / paceConfig.range)
            val y = size.height - padding - ((hr - hrConfig.visualMin) / hrConfig.range) * chartHeight
            
            val color = getZoneColor(zone)
            val radius = 8f  // Could be scaled by training effect
            
            drawCircle(
                color = color,
                radius = radius,
                center = Offset(xReversed, y)
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
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawAxisLabelsAndGrid(
    paceConfig: AxisConfig,
    hrConfig: AxisConfig,
    padding: Float,
    chartWidth: Float,
    chartHeight: Float,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    // Draw pace labels (bottom) with grid lines - REVERSED axis
    // Slower pace (higher min/km) on LEFT, faster pace (lower min/km) on RIGHT
    val paceLabels = generatePaceLabels(paceConfig.visualMin, paceConfig.visualMax)
    paceLabels.forEach { pace ->
        // REVERSED: higher pace value = further left on canvas
        val xReversed = padding + chartWidth * (1f - (pace - paceConfig.visualMin) / paceConfig.range)
        
        // Draw vertical grid line
        drawLine(
            color = Colors.border.copy(alpha = 0.2f),
            start = Offset(xReversed, padding),
            end = Offset(xReversed, size.height - padding),
            strokeWidth = 1f
        )
        
        // Draw pace label (format as min:sec)
        val label = formatPaceMinutes(pace)
        val textLayoutResult = textMeasurer.measure(label, TextStyle(fontSize = 12.sp))
        drawText(
            textLayoutResult,
            color = Colors.textSecondary,
            topLeft = Offset(xReversed - textLayoutResult.size.width / 2f, size.height - padding + 10f)
        )
    }
    
    // Draw HR labels (left) with grid lines
    val hrStep = calculateLabelStep(hrConfig.range)
    var hr = hrConfig.visualMin
    while (hr <= hrConfig.visualMax) {
        val y = size.height - padding - ((hr - hrConfig.visualMin) / hrConfig.range) * chartHeight
        
        // Draw horizontal grid line
        drawLine(
            color = Colors.border.copy(alpha = 0.2f),
            start = Offset(padding, y),
            end = Offset(size.width - padding, y),
            strokeWidth = 1f
        )
        
        // Draw HR label
        val label = "${hr.toInt()} bpm"
        val textLayoutResult = textMeasurer.measure(label, TextStyle(fontSize = 12.sp))
        drawText(
            textLayoutResult,
            color = Colors.textSecondary,
            topLeft = Offset(padding - textLayoutResult.size.width - 10f, y - textLayoutResult.size.height / 2f)
        )
        
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
private fun HRZonePaceInsight(
    run: RunSession,
    modifier: Modifier = Modifier
) {
    // Real zone distribution derived from heartRateData
    val zones = remember(run) { run.getHeartRateZoneDistribution() }
    // Dominant zone by time
    val dominantZone = zones.maxByOrNull { it.value }?.key ?: "Z3"
    val dominantPct  = zones[dominantZone]?.toInt() ?: 0
    val efficiencyText = when (dominantZone) {
        "Z1", "Z2" -> "Easy effort run — good for recovery and aerobic base building."
        "Z3"       -> "Aerobic effort — solid steady-state training, efficient pacing."
        "Z4"       -> "Threshold effort — pushing hard, great for race fitness."
        "Z5"       -> "Max effort — high intensity, monitor recovery carefully."
        else       -> "Mixed effort across heart rate zones."
    }

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

            // Real zone breakdown
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = Spacing.sm),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                ZoneBreakdownItem("Z1", zones["Z1"] ?: 0f, Color(0xFF4A90E2))
                ZoneBreakdownItem("Z2", zones["Z2"] ?: 0f, Color(0xFF7ED321))
                ZoneBreakdownItem("Z3", zones["Z3"] ?: 0f, Color(0xFFF5A623))
                ZoneBreakdownItem("Z4", zones["Z4"] ?: 0f, Color(0xFFFF6B35))
                ZoneBreakdownItem("Z5", zones["Z5"] ?: 0f, Color(0xFFD0021B))
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            Text(
                if (dominantPct > 0) "$dominantPct% in $dominantZone — $efficiencyText"
                else efficiencyText,
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

/**
 * Generate pace labels for the axis (at least 5 labels across the range)
 * Each label maintains 1 decimal place for consistency
 */
private fun generatePaceLabels(minPace: Float, maxPace: Float): List<Float> {
    val range = maxPace - minPace
    if (range <= 0) return listOf(minPace)
    
    // Generate at least 5 labels by choosing appropriate step size
    val desiredLabelCount = 5
    val rawStep = range / (desiredLabelCount - 1)
    
    // Round step to a sensible value (0.1, 0.2, 0.5, 1.0, etc.)
    val step = when {
        rawStep <= 0.1 -> 0.1f
        rawStep <= 0.2 -> 0.2f
        rawStep <= 0.5 -> 0.5f
        rawStep <= 1.0 -> 1.0f
        else -> 1.0f
    }
    
    val labels = mutableListOf<Float>()
    var pace = (minPace / step).toInt().toFloat() * step
    
    while (pace <= maxPace + step * 0.01f) {
        if (pace >= minPace - step * 0.01f) {
            labels.add((pace * 10).toInt() / 10f)  // Round to 1 decimal place
        }
        pace += step
    }
    
    return labels.distinctBy { (it * 10).toInt() }  // Remove duplicates from rounding
}

/**
 * Format pace (in min/km) as min:sec display format
 * Input: 4.5 (4 min 30 sec per km)
 * Output: "4:30"
 */
private fun formatPaceMinutes(paceMinPerKm: Float): String {
    val minutes = paceMinPerKm.toInt()
    val seconds = ((paceMinPerKm - minutes) * 60).toInt()
    return String.format(Locale.US, "%d:%02d", minutes, seconds)
}

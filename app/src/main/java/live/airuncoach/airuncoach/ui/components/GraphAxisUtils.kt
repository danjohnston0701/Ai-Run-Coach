package live.airuncoach.airuncoach.ui.components

/**
 * Utilities for intelligent axis configuration that prevents visual distortion
 * while honestly representing data spread.
 *
 * Key Principle:
 * - Consistent data should look consistent (not artificially erratic)
 * - Variable data should show real variation
 * - Use smart margins to balance data presentation
 */

/**
 * Configuration for a graph axis with smart margin calculation
 *
 * @param min The actual minimum value in the dataset
 * @param max The actual maximum value in the dataset
 * @param visualMin The axis minimum to display (may include margin)
 * @param visualMax The axis maximum to display (may include margin)
 * @param range The total visual range (visualMax - visualMin)
 * @param hasMargin Whether a margin buffer was added (true = data was very consistent)
 */
data class AxisConfig(
    val min: Float,
    val max: Float,
    val visualMin: Float,
    val visualMax: Float,
    val range: Float,
    val hasMargin: Boolean
)

/**
 * Alert level for data consistency
 */
enum class DataConsistencyLevel {
    VERY_CONSISTENT,    // Spread < 50% of threshold (needs margin)
    CONSISTENT,          // Spread < threshold (add small margin)
    VARIABLE,            // Spread >= threshold (use actual range + margin)
    HIGHLY_VARIABLE      // Spread >= 3x threshold
}

/**
 * Calculate intelligent axis configuration that prevents visual distortion
 * of consistent data while showing real variation when present.
 *
 * @param values The data points to analyze
 * @param typicalMin The lower bound of what's typical for this metric
 * @param typicalMax The upper bound of what's typical for this metric
 * @param minSpreadPercentage How much of the typical range counts as "minimal spread" (default 10%)
 * @param baseMargin Base margin percentage to add to visual range (default 5%)
 * @return AxisConfig with calculated visual axis bounds
 *
 * Example - Heart Rate (typical 140-180 bpm, actual data 142-146):
 * - Spread: 4 bpm
 * - Threshold: (180-140) × 0.10 = 4 bpm
 * - 4 = 4 (borderline, add margin)
 * - Buffer: (4-4)/2 = 0 (no extra buffer)
 * - Visual: 137-149 bpm (5% margin on range)
 * Result: Data looks stable, not erratic
 */
fun calculateAxisConfig(
    values: List<Float>,
    typicalMin: Float,
    typicalMax: Float,
    minSpreadPercentage: Float = 0.10f,
    baseMargin: Float = 0.05f
): AxisConfig {
    // Handle empty data
    if (values.isEmpty()) {
        return AxisConfig(
            min = typicalMin,
            max = typicalMax,
            visualMin = typicalMin,
            visualMax = typicalMax,
            range = typicalMax - typicalMin,
            hasMargin = false
        )
    }
    
    val min = values.minOrNull() ?: 0f
    val max = values.maxOrNull() ?: 0f
    
    // Handle single value
    if (min == max) {
        val margin = (typicalMax - typicalMin) * minSpreadPercentage / 2
        return AxisConfig(
            min = min,
            max = max,
            visualMin = min - margin,
            visualMax = max + margin,
            range = 2 * margin,
            hasMargin = true
        )
    }
    
    val spread = max - min
    val typicalRange = typicalMax - typicalMin
    val threshold = typicalRange * minSpreadPercentage
    
    val (visualMin, visualMax, hasMarginFlag) = if (spread < threshold) {
        // Data is very consistent - add margin to prevent distortion
        val buffer = (threshold - spread) / 2
        Triple(
            min - buffer,
            max + buffer,
            true
        )
    } else {
        // Data has good spread - show it with standard margin
        val margin = spread * baseMargin
        Triple(
            min - margin,
            max + margin,
            false
        )
    }
    
    return AxisConfig(
        min = min,
        max = max,
        visualMin = visualMin,
        visualMax = visualMax,
        range = visualMax - visualMin,
        hasMargin = hasMarginFlag
    )
}

/**
 * Determine data consistency level for insight generation
 */
fun getDataConsistencyLevel(
    values: List<Float>,
    typicalMin: Float,
    typicalMax: Float,
    minSpreadPercentage: Float = 0.10f
): DataConsistencyLevel {
    if (values.isEmpty() || values.size < 2) return DataConsistencyLevel.CONSISTENT
    
    val min = values.minOrNull() ?: return DataConsistencyLevel.CONSISTENT
    val max = values.maxOrNull() ?: return DataConsistencyLevel.CONSISTENT
    val spread = max - min
    
    if (spread == 0f) return DataConsistencyLevel.VERY_CONSISTENT
    
    val typicalRange = typicalMax - typicalMin
    val threshold = typicalRange * minSpreadPercentage
    
    return when {
        spread < threshold * 0.5 -> DataConsistencyLevel.VERY_CONSISTENT
        spread < threshold -> DataConsistencyLevel.CONSISTENT
        spread < threshold * 3 -> DataConsistencyLevel.VARIABLE
        else -> DataConsistencyLevel.HIGHLY_VARIABLE
    }
}

/**
 * Scale a value to fit within canvas space using the axis configuration
 *
 * @param value The actual data value
 * @param axisConfig The axis configuration (from calculateAxisConfig)
 * @param canvasStart Where the axis starts (e.g., padding amount)
 * @param canvasSize The total available canvas space
 * @return The scaled coordinate for drawing
 */
fun scaleToCanvas(
    value: Float,
    axisConfig: AxisConfig,
    canvasStart: Float,
    canvasSize: Float
): Float {
    // Guard against zero range (single-value data or equal min/max) to avoid NaN/Inf
    if (axisConfig.range == 0f) return canvasStart + canvasSize / 2f
    return canvasStart + ((value - axisConfig.visualMin) / axisConfig.range) * canvasSize
}

/**
 * Common axis configurations for Garmin running metrics
 * These define the typical ranges for each metric
 */
object GarminMetricDefaults {
    // Heart Rate (bpm) - typical 140-180
    data class HeartRate(val min: Float = 140f, val max: Float = 180f)
    
    // Ground Contact Time (ms) - typical 200-280
    data class GroundContactTime(val min: Float = 200f, val max: Float = 280f)
    
    // Vertical Oscillation (cm) - typical 6-10
    data class VerticalOscillation(val min: Float = 6f, val max: Float = 10f)
    
    // Vertical Ratio (%) - typical 8-11
    data class VerticalRatio(val min: Float = 8f, val max: Float = 11f)
    
    // Stride Length (m) - typical 1.35-1.50
    data class StrideLength(val min: Float = 1.35f, val max: Float = 1.50f)
    
    // Cadence (spm) - typical 160-190
    data class Cadence(val min: Float = 160f, val max: Float = 190f)
    
    // Pace (min/km) - typical 4:00-7:00
    data class Pace(val min: Float = 4f, val max: Float = 7f)
    
    // VO2 Max (ml/kg/min) - typical 40-70
    data class VO2Max(val min: Float = 40f, val max: Float = 70f)
}

/**
 * Insight text generator based on data consistency
 */
fun getConsistencyInsight(level: DataConsistencyLevel, metricName: String): String {
    return when (level) {
        DataConsistencyLevel.VERY_CONSISTENT ->
            "$metricName was extremely stable throughout the run"
        
        DataConsistencyLevel.CONSISTENT ->
            "$metricName was very consistent - excellent control"
        
        DataConsistencyLevel.VARIABLE ->
            "$metricName showed normal variation across the run"
        
        DataConsistencyLevel.HIGHLY_VARIABLE ->
            "$metricName varied significantly - check conditions and effort"
    }
}

/**
 * Percentage change from baseline
 *
 * @param current Current value
 * @param baseline Baseline/reference value
 * @return Percentage change (e.g., 5.5 for +5.5%, -3.2 for -3.2%)
 */
fun calculatePercentChange(current: Float, baseline: Float): Float {
    if (baseline == 0f) return 0f
    return ((current - baseline) / baseline) * 100f
}

/**
 * Format percentage change for display
 */
fun formatPercentChange(change: Float): String {
    val sign = if (change >= 0) "+" else ""
    return "$sign${String.format(java.util.Locale.US, "%.1f", change)}%"
}

/**
 * Interpret percentage change as good/bad for a metric
 * Some metrics improve with higher values (VO2 Max), others with lower (GCT, VO)
 */
fun isChangePositive(change: Float, isHigherBetter: Boolean): Boolean {
    return if (isHigherBetter) change > 0 else change < 0
}

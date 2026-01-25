package live.airuncoach.airuncoach.domain.model

/**
 * Contains elevation metrics for a route
 * @param gain Total elevation gain in meters
 * @param loss Total elevation loss in meters
 * @param maxGradientPercent Steepest gradient as percentage (e.g., 8.5%)
 * @param maxGradientDegrees Steepest gradient in degrees (e.g., 4.9°)
 */
data class ElevationData(
    val gain: Int,
    val loss: Int,
    val maxGradientPercent: Double,
    val maxGradientDegrees: Double
)

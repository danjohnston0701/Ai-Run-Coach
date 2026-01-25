package live.airuncoach.airuncoach.domain.model

/**
 * Contains validation metrics for a circuit route
 * @param valid True if route meets circuit criteria (angular spread >= 180° and backtrack <= 35%)
 * @param backtrackRatio Percentage of route that retraces its own path (0.0 - 1.0)
 * @param angularSpread Compass coverage in degrees (0° - 360°)
 */
data class RouteValidation(
    val valid: Boolean,
    val backtrackRatio: Double,
    val angularSpread: Double
)

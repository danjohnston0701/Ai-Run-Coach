package live.airuncoach.airuncoach.domain.model

/**
 * Represents a single waypoint in a geometric template pattern
 * @param bearing Direction from start point in degrees (0° = North, 90° = East, etc.)
 * @param radiusMultiplier How far from start relative to base radius (1.0 = base radius)
 */
data class TemplateWaypoint(
    val bearing: Double,
    val radiusMultiplier: Double
)

/**
 * Defines a geometric pattern for route generation using waypoints
 * @param name Human-readable name of the pattern (e.g., "North Loop", "Pentagon")
 * @param waypoints List of waypoints that define the route shape
 */
data class TemplatePattern(
    val name: String,
    val waypoints: List<TemplateWaypoint>
)

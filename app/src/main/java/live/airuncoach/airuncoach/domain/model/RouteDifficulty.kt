package live.airuncoach.airuncoach.domain.model

/**
 * Difficulty rating for a route
 */
enum class RouteDifficulty {
    EASY,       // Low backtracking, no major roads, minimal elevation
    MODERATE,   // Some backtracking or major roads, moderate elevation
    HARD        // High elevation gain (>200m) regardless of other factors
}

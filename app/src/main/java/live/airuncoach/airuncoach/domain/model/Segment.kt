package live.airuncoach.airuncoach.domain.model

import java.time.LocalDateTime

/**
 * SEGMENT LEADERBOARDS
 * Compete on specific route sections like Strava
 */

/**
 * A defined segment of a route (e.g., "Hill Climb on Main St")
 */
data class Segment(
    val id: String,
    val name: String,
    val distance: Double,              // meters
    val elevationGain: Double,         // meters
    val averageGrade: Float,           // percentage
    val startPoint: LocationPoint,
    val endPoint: LocationPoint,
    val routePoints: List<LocationPoint>,
    val createdBy: String,
    val createdAt: LocalDateTime,
    val attempts: Int,                 // Total attempts on this segment
    val category: SegmentCategory,
    val hazards: List<String> = emptyList() // "Traffic lights", "Intersection", etc.
)

enum class SegmentCategory {
    CLIMB,          // > 3% average grade
    SPRINT,         // < 1km, flat
    FLAT,           // < 2% grade
    DESCENT,        // Negative grade
    MIXED           // Varied terrain
}

/**
 * Your effort on a segment
 */
data class SegmentEffort(
    val id: String,
    val segmentId: String,
    val userId: String,
    val runId: String,
    val startTime: LocalDateTime,
    val elapsedTime: Long,            // milliseconds
    val movingTime: Long,             // milliseconds (excluding stops)
    val averageHeartRate: Int?,
    val maxHeartRate: Int?,
    val averageCadence: Int?,
    val averagePower: Int?,           // Watts (if power meter)
    val calories: Int,
    val isPR: Boolean,                // Personal Record
    val isKOM: Boolean,               // King/Queen of Mountain (overall #1)
    val leaderboardRank: Int,
    val percentileRank: Float         // Top X%
)

/**
 * Leaderboard entry
 */
data class LeaderboardEntry(
    val rank: Int,
    val userId: String,
    val userName: String,
    val userPhoto: String?,
    val elapsedTime: Long,
    val averagePace: String,
    val averageHeartRate: Int?,
    val completedAt: LocalDateTime,
    val isCurrentUser: Boolean = false,
    val isPR: Boolean = false
)

/**
 * Full segment leaderboard
 */
data class SegmentLeaderboard(
    val segment: Segment,
    val allTimeTop: List<LeaderboardEntry>,
    val thisYearTop: List<LeaderboardEntry>,
    val thisMonthTop: List<LeaderboardEntry>,
    val yourEfforts: List<SegmentEffort>,
    val yourBestEffort: SegmentEffort?,
    val yourRank: Int?,
    val komTime: Long,                // Fastest time ever
    val komHolder: String
)

/**
 * Segment discovery - find nearby segments
 */
data class NearbySegment(
    val segment: Segment,
    val distanceFromYou: Double,      // meters
    val yourAttempts: Int,
    val yourBestTime: Long?,
    val komTime: Long
)

/**
 * Segment matching for a run
 */
data class SegmentMatch(
    val segment: Segment,
    val effort: SegmentEffort,
    val improvement: Long?,           // milliseconds faster than previous PR
    val improvementPercent: Float?,
    val newPR: Boolean,
    val movedUpRanks: Int?           // Climbed X positions on leaderboard
)

/**
 * Segment achievements
 */
data class SegmentAchievement(
    val type: AchievementType,
    val segment: Segment,
    val effort: SegmentEffort,
    val description: String
)

enum class AchievementType {
    FIRST_ATTEMPT,
    NEW_PR,
    TOP_10,
    KOM,
    CENTURY,              // 100th attempt
    CONSISTENCY           // 10 attempts within 5% of each other
}

/**
 * Segment statistics
 */
data class SegmentStats(
    val totalAttempts: Int,
    val averageTime: Long,
    val bestTime: Long,
    val worstTime: Long,
    val consistency: Float,           // Standard deviation
    val improvementRate: Float,       // % improvement over time
    val favoriteTimeOfDay: String,    // When you perform best
    val bestWeatherConditions: String
)

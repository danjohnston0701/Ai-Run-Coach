package live.airuncoach.airuncoach.domain.model

import java.time.LocalDate
import java.time.LocalDateTime

/**
 * SOCIAL FEED
 * Community engagement like Strava
 */

/**
 * Activity in the feed
 */
data class FeedActivity(
    val id: String,
    val user: User,
    val type: FeedActivityType,
    val runSession: RunSession?,
    val achievement: Achievement?,
    val comment: String?,
    val mediaUrls: List<String> = emptyList(),
    val timestamp: LocalDateTime,
    val reactions: List<Reaction>,
    val comments: List<ActivityComment>,
    val isLikedByCurrentUser: Boolean = false
)

enum class FeedActivityType {
    COMPLETED_RUN,
    ACHIEVED_PR,
    COMPLETED_GOAL,
    SEGMENT_KOM,
    STREAK_MILESTONE,
    JOINED_CHALLENGE,
    CUSTOM_POST
}

/**
 * Achievement to showcase
 */
data class Achievement(
    val type: AchievementBadge,
    val title: String,
    val description: String,
    val iconUrl: String,
    val earnedAt: LocalDateTime
)

enum class AchievementBadge {
    FIRST_5K,
    FIRST_10K,
    FIRST_HALF_MARATHON,
    FIRST_MARATHON,
    CENTURY_CLUB,        // 100km in a month
    CONSISTENCY_KING,    // 30 day streak
    SPEED_DEMON,         // Sub-4min km
    HILL_CLIMBER,        // 1000m elevation in one run
    EARLY_BIRD,          // 10 runs before 6am
    NIGHT_OWL,           // 10 runs after 9pm
    WEATHER_WARRIOR,     // Ran in rain/snow
    EXPLORER              // 50 unique routes
}

/**
 * Reaction to an activity
 */
data class Reaction(
    val id: String,
    val userId: String,
    val userName: String,
    val type: ReactionType,
    val timestamp: LocalDateTime
)

enum class ReactionType {
    KUDOS,              // 👏 Standard Strava "like"
    FIRE,               // 🔥 Awesome run
    STRONG,             // 💪 Beast mode
    INSPIRING,          // ✨ Motivational
    SUPPORTIVE          // ❤️ Keep going!
}

/**
 * Comment on an activity
 */
data class ActivityComment(
    val id: String,
    val userId: String,
    val userName: String,
    val userPhoto: String?,
    val text: String,
    val timestamp: LocalDateTime,
    val likes: Int
)

/**
 * Running club
 */
data class Club(
    val id: String,
    val name: String,
    val description: String,
    val coverPhoto: String?,
    val memberCount: Int,
    val isPrivate: Boolean,
    val adminIds: List<String>,
    val location: String?,
    val weeklyGoal: Double?,        // km
    val createdAt: LocalDateTime
)

/**
 * Challenge
 */
data class Challenge(
    val id: String,
    val name: String,
    val description: String,
    val coverImage: String?,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val goal: ChallengeGoal,
    val participants: Int,
    val yourProgress: Float,        // 0.0 to 1.0
    val leaderboard: List<ChallengeRank>,
    val prize: String?,
    val isJoined: Boolean = false
)

data class ChallengeGoal(
    val type: ChallengeType,
    val target: Double,
    val unit: String
)

enum class ChallengeType {
    TOTAL_DISTANCE,
    TOTAL_ELEVATION,
    NUMBER_OF_RUNS,
    LONGEST_SINGLE_RUN,
    FASTEST_5K,
    CONSISTENCY_STREAK
}

data class ChallengeRank(
    val rank: Int,
    val userId: String,
    val userName: String,
    val userPhoto: String?,
    val progress: Double,
    val isCurrentUser: Boolean = false
)

/**
 * Friend request
 */
data class FriendRequest(
    val id: String,
    val fromUser: User,
    val timestamp: LocalDateTime,
    val status: RequestStatus
)

enum class RequestStatus {
    PENDING,
    ACCEPTED,
    DECLINED
}

/**
 * Notification
 */
data class Notification(
    val id: String,
    val type: NotificationType,
    val title: String,
    val message: String,
    val timestamp: LocalDateTime,
    val isRead: Boolean,
    val actionUrl: String?,
    val user: User?
)

enum class NotificationType {
    NEW_KUDOS,
    NEW_COMMENT,
    NEW_FOLLOWER,
    FRIEND_REQUEST,
    ACHIEVEMENT_UNLOCKED,
    CHALLENGE_REMINDER,
    SEGMENT_KOM_LOST,
    SEGMENT_KOM_WON,
    FRIEND_COMPLETED_RUN,
    CLUB_INVITATION
}

package live.airuncoach.airuncoach.domain.model

/**
 * Represents a friend in the user's network
 * Used for Live Tracking and Group Run invitations
 */
data class Friend(
    val userId: String,
    val userName: String,
    val fullName: String?,
    val profilePicUrl: String?,
    val isFriend: Boolean = true,
    val addedAt: Long
)

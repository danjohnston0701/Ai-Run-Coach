package live.airuncoach.airuncoach.domain.model

/**
 * Represents a friend/user who is observing a live run session
 */
data class LiveTrackingObserver(
    val userId: String,
    val userName: String,
    val profilePicUrl: String?,
    val invitedAt: Long,  // Timestamp
    val status: ObserverStatus
)

enum class ObserverStatus {
    INVITED,    // Invitation sent but not yet accepted
    WATCHING,   // Actively watching the run session
    DECLINED    // Declined the invitation
}

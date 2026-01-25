package live.airuncoach.airuncoach.domain.model

/**
 * Represents a group run session with multiple participants
 */
data class GroupRun(
    val sessionId: String,
    val creatorId: String,
    val creatorName: String,
    val routeId: String?,              // null if "Run without route"
    val hasRoute: Boolean,              // true if using generated route
    val participants: List<GroupRunParticipant>,
    val createdAt: Long,
    val startedAt: Long?,
    val status: GroupRunStatus,
    val shareLink: String?              // Generated link to join
)

/**
 * Individual participant in a group run
 */
data class GroupRunParticipant(
    val userId: String,
    val userName: String,
    val profilePicUrl: String?,
    val status: ParticipantStatus,
    val location: LatLng?,              // Current location if running
    val distance: Double?,              // Distance covered in km
    val pace: String?,                  // Current pace
    val heartRate: Int?                 // Current heart rate if available
)

enum class GroupRunStatus {
    PENDING,      // Created but not started
    IN_PROGRESS,  // Currently running
    COMPLETED,    // Finished
    CANCELLED     // Cancelled before starting
}

enum class ParticipantStatus {
    INVITED,      // Invitation sent
    JOINED,       // Accepted and ready
    RUNNING,      // Currently running
    FINISHED,     // Completed their run
    DECLINED      // Declined invitation
}

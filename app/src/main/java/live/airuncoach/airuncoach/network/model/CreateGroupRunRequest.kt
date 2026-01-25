package live.airuncoach.airuncoach.network.model

data class CreateGroupRunRequest(
    val name: String,
    val meetingPoint: String,
    val description: String,
    val distance: Float,
    val maxParticipants: Int,
    val dateTime: String
)

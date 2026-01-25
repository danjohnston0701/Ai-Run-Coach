package live.airuncoach.airuncoach.domain.model

data class GroupRun(
    val id: String,
    val name: String,
    val meetingPoint: String,
    val description: String,
    val distance: Float,
    val maxParticipants: Int,
    val dateTime: String,
    val participants: List<String> = emptyList()
)

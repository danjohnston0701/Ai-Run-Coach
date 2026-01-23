package live.airuncoach.airuncoach.domain.model

data class Goal(
    val id: Long,
    val title: String,
    val description: String,
    val target: Float,
    val currentProgress: Float
)

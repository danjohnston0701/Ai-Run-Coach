package live.airuncoach.airuncoach.domain.model

data class Friend(
    val id: String,
    val name: String,
    val email: String,
    val profilePic: String? = null,
    val fitnessLevel: String? = null,
    val distanceScale: String? = null
)

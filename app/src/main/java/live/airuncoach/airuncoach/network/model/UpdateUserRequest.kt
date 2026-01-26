package live.airuncoach.airuncoach.network.model

data class UpdateUserRequest(
    val name: String?,
    val email: String?,
    val dob: String?,
    val gender: String?,
    val weight: Double?,
    val height: Double?,
    val fitnessLevel: String?,
    val distanceScale: String?
)

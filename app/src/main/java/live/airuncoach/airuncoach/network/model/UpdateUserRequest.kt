package live.airuncoach.airuncoach.network.model

data class UpdateUserRequest(
    val name: String? = null,
    val email: String? = null,
    val dob: String? = null,
    val gender: String? = null,
    val weight: Double? = null,
    val height: Double? = null,
    val fitnessLevel: String? = null,
    val distanceScale: String? = null,
    val subscriptionTier: String? = null,
    val subscriptionStatus: String? = null
)

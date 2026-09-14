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
    val subscriptionStatus: String? = null,
    val defaultSessionType: String? = null,
    /** When true the target-distance control accepts decimals (up to 3 dp); otherwise whole km. */
    val distanceDecimalsEnabled: Boolean? = null
)

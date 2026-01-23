package live.airuncoach.airuncoach.domain.model

data class User(
    val id: String,
    val email: String,
    val name: String,
    val dob: String? = null,
    val gender: String? = null,
    val height: String? = null,
    val weight: String? = null,
    val fitnessLevel: String? = null,
    val desiredFitnessLevel: String? = null,
    val coachName: String = "AI Coach",
    val coachGender: String = "male",
    val coachAccent: String = "british",
    val coachTone: String = "energetic",
    val profilePic: String? = null,
    val distanceMinKm: Float = 0f,
    val distanceMaxKm: Float = 50f,
    val distanceDecimalsEnabled: Boolean = false,
    val subscriptionTier: String? = null,
    val subscriptionStatus: String? = null
)

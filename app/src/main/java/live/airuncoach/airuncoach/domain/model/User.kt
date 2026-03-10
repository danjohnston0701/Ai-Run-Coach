package live.airuncoach.airuncoach.domain.model

data class User(
    val id: String,
    val email: String,
    val name: String,
    val shortUserId: String? = null, // Short ID for friend sharing (e.g., "ABC123")
    val location: String? = null,
    val age: Int? = null,
    val dob: String? = null,
    val gender: String? = null,
    val height: Double? = null,
    val weight: Double? = null,
    val fitnessLevel: String? = null,
    val desiredFitnessLevel: String? = null,
    val coachName: String = "AI Coach",
    val coachGender: String = "male",
    val coachAccent: String = "british",
    val coachTone: String = "energetic",
    val nicknameStyle: String = "occasional",  // "none" | "occasional" | "frequent"
    val profilePic: String? = null,
    val distanceMinKm: Float = 0f,
    val distanceMaxKm: Float = 50f,
    val distanceDecimalsEnabled: Boolean = false,
    val subscriptionTier: String? = null,
    val subscriptionStatus: String? = null,
    val distanceScale: String? = null,
    // In-Run AI Coaching feature preferences (synced with server)
    // Nullable so Gson null → we treat as "default enabled" in loadFromUser()
    val coachPaceEnabled: Boolean? = null,
    val coachNavigationEnabled: Boolean? = null,
    val coachElevationEnabled: Boolean? = null,
    val coachHeartRateEnabled: Boolean? = null,
    val coachCadenceStrideEnabled: Boolean? = null,
    val coachKmSplitsEnabled: Boolean? = null,
    val coachStruggleEnabled: Boolean? = null,
    val coachMotivationalEnabled: Boolean? = null,
    val coachHalfKmCheckInEnabled: Boolean? = null,
    val coachKmSplitIntervalKm: Int? = null
)

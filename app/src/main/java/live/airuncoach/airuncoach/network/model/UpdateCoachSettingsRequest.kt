package live.airuncoach.airuncoach.network.model

data class UpdateCoachSettingsRequest(
    val coachName: String,
    val coachGender: String,
    val coachAccent: String,
    val coachTone: String
)

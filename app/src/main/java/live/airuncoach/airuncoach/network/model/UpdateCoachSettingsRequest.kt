package live.airuncoach.airuncoach.network.model

data class UpdateCoachSettingsRequest(
    val coachName: String,
    val coachGender: String,
    val coachAccent: String,
    val coachTone: String,
    // In-Run AI Coaching feature preferences
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

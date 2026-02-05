package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class PhaseCoachingUpdate(
    @SerializedName("phase") val phase: String,
    @SerializedName("distance") val distance: Double,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("elapsedTime") val elapsedTime: Long,
    @SerializedName("currentPace") val currentPace: String,
    @SerializedName("currentGrade") val currentGrade: Double?,
    @SerializedName("totalElevationGain") val totalElevationGain: Double?,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("activityType") val activityType: String
)

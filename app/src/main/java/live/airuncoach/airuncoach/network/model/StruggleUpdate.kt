package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class StruggleUpdate(
    @SerializedName("distance") val distance: Double,
    @SerializedName("elapsedTime") val elapsedTime: Long,
    @SerializedName("currentPace") val currentPace: String,
    @SerializedName("baselinePace") val baselinePace: String,
    @SerializedName("paceDropPercent") val paceDropPercent: Double,
    @SerializedName("currentGrade") val currentGrade: Double?,
    @SerializedName("totalElevationGain") val totalElevationGain: Double?,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("hasRoute") val hasRoute: Boolean = false
)

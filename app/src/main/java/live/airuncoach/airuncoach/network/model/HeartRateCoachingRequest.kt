package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class HeartRateCoachingRequest(
    @SerializedName("currentHR") val currentHR: Int,
    @SerializedName("avgHR") val avgHR: Int,
    @SerializedName("maxHR") val maxHR: Int,
    @SerializedName("targetZone") val targetZone: Int,
    @SerializedName("elapsedMinutes") val elapsedMinutes: Int,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?
)

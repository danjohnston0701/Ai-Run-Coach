package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class ElevationCoachingRequest(
    @SerializedName("eventType") val eventType: String, // uphill, downhill, hill_top
    @SerializedName("distance") val distance: Double,
    @SerializedName("elapsedTime") val elapsedTime: Long,
    @SerializedName("currentGrade") val currentGrade: Double,
    @SerializedName("segmentDistanceMeters") val segmentDistanceMeters: Double,
    @SerializedName("totalElevationGain") val totalElevationGain: Double,
    @SerializedName("totalElevationLoss") val totalElevationLoss: Double,
    @SerializedName("hasRoute") val hasRoute: Boolean,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("activityType") val activityType: String
)
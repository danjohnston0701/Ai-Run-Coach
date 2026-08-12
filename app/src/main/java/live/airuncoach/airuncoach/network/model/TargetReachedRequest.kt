package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

// One-time congratulatory message fired the moment a standalone run/walk crosses its
// target distance or target time (e.g. "You crushed that 5K!"). See
// RunTrackingService.checkForKmSplit()'s hasReachedTarget branch for the call site.
data class TargetReachedRequest(
    @SerializedName("distance") val distance: Double,           // km
    @SerializedName("targetDistance") val targetDistance: Double?, // km
    @SerializedName("elapsedTime") val elapsedTime: Long,        // seconds
    @SerializedName("targetTime") val targetTime: Int?,          // seconds
    @SerializedName("currentPace") val currentPace: String?,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("runnerName") val runnerName: String?,
    @SerializedName("activityType") val activityType: String,
    @SerializedName("userId") val userId: String? = null
)

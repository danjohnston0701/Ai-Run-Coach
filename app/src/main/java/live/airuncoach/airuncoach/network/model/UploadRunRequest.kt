package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LocationPoint

data class UploadRunRequest(
    @SerializedName("routeId") val routeId: String? = null,
    @SerializedName("distance") val distance: Double,
    @SerializedName("duration") val duration: Long, // milliseconds
    @SerializedName("avgPace") val avgPace: String,
    @SerializedName("avgHeartRate") val avgHeartRate: Int?,
    @SerializedName("maxHeartRate") val maxHeartRate: Int?,
    @SerializedName("minHeartRate") val minHeartRate: Int?,
    @SerializedName("calories") val calories: Int,
    @SerializedName("cadence") val cadence: Int?,
    @SerializedName("elevation") val elevation: Double?,
    @SerializedName("difficulty") val difficulty: String?,
    @SerializedName("startLat") val startLat: Double,
    @SerializedName("startLng") val startLng: Double,
    @SerializedName("gpsTrack") val gpsTrack: List<LocationPoint>,
    @SerializedName("completedAt") val completedAt: Long, // timestamp
    @SerializedName("elevationGain") val elevationGain: Double?,
    @SerializedName("elevationLoss") val elevationLoss: Double?,
    @SerializedName("tss") val tss: Int? = 0,
    @SerializedName("gap") val gap: String? = null,
    @SerializedName("isPublic") val isPublic: Boolean = true,
    @SerializedName("strugglePoints") val strugglePoints: List<StrugglePointUpload>? = null,
    @SerializedName("kmSplits") val kmSplits: List<KmSplit>? = null,
    @SerializedName("terrainType") val terrainType: String? = null,
    @SerializedName("userComments") val userComments: String? = null,
    // Run goals - target tracking
    @SerializedName("targetDistance") val targetDistance: Double? = null,
    @SerializedName("targetTime") val targetTime: Long? = null,
    @SerializedName("wasTargetAchieved") val wasTargetAchieved: Boolean? = null
)

data class StrugglePointUpload(
    @SerializedName("timestamp") val timestamp: Long,
    @SerializedName("distanceMeters") val distanceMeters: Double,
    @SerializedName("paceDropPercent") val paceDropPercent: Double
)

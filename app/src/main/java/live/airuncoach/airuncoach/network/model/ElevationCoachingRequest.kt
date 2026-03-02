package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class ElevationCoachingRequest(
    @SerializedName("eventType") val eventType: String, // uphill, downhill, hill_top, downhill_finish, flat_terrain
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
    @SerializedName("activityType") val activityType: String,

    // Cross-metric context: how the runner is performing RIGHT NOW
    @SerializedName("currentPace") val currentPace: String? = null,
    @SerializedName("averagePace") val averagePace: String? = null,
    @SerializedName("heartRate") val heartRate: Int? = null,
    @SerializedName("cadence") val cadence: Int? = null,
    @SerializedName("avgCadence") val avgCadence: Int? = null,

    // Per-km split data with elevation context
    @SerializedName("kmSplitSummaries") val kmSplitSummaries: List<KmSplitElevation>? = null,

    // Terrain classification for the run so far
    @SerializedName("terrainProfile") val terrainProfile: String? = null, // flat, undulating, hilly, mountainous
    @SerializedName("elevationPerKm") val elevationPerKm: Double? = null, // avg metres gained per km
    @SerializedName("maxGradientSoFar") val maxGradientSoFar: Double? = null,

    // Segment-specific elevation context
    @SerializedName("segmentElevationGain") val segmentElevationGain: Double? = null,
    @SerializedName("segmentElevationLoss") val segmentElevationLoss: Double? = null,

    // Pace consistency — how steady have they been?
    @SerializedName("paceSpreadSeconds") val paceSpreadSeconds: Int? = null, // fastest-to-slowest split spread
    @SerializedName("isNegativeSplitting") val isNegativeSplitting: Boolean? = null
)

data class KmSplitElevation(
    @SerializedName("km") val km: Int,
    @SerializedName("pace") val pace: String,
    @SerializedName("elevGain") val elevGain: Int, // metres gained in this km
    @SerializedName("elevLoss") val elevLoss: Int, // metres lost in this km
    @SerializedName("avgGrade") val avgGrade: Double // average gradient %
)
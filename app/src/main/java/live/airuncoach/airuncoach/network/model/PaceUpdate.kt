package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.KmSplit

data class PaceUpdate(
    @SerializedName("distance") val distance: Double,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("currentPace") val currentPace: String,
    @SerializedName("elapsedTime") val elapsedTime: Long,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("isSplit") val isSplit: Boolean,
    @SerializedName("splitKm") val splitKm: Int?,
    @SerializedName("splitPace") val splitPace: String?,
    @SerializedName("currentGrade") val currentGrade: Double?,
    @SerializedName("totalElevationGain") val totalElevationGain: Double?,
    @SerializedName("isOnHill") val isOnHill: Boolean?,
    @SerializedName("kmSplits") val kmSplits: List<KmSplit>,
    // Additional context for richer split coaching
    @SerializedName("heartRate") val heartRate: Int? = null,
    @SerializedName("cadence") val cadence: Int? = null,
    @SerializedName("targetTime") val targetTime: Int? = null,
    @SerializedName("targetPace") val targetPace: String? = null,
    @SerializedName("averagePace") val averagePace: String? = null,
    // Stride analysis
    @SerializedName("strideLength") val strideLength: Double? = null,
    @SerializedName("strideZone") val strideZone: String? = null,
    @SerializedName("optimalStrideMin") val optimalStrideMin: Double? = null,
    @SerializedName("optimalStrideMax") val optimalStrideMax: Double? = null,
    @SerializedName("terrainContext") val terrainContext: String? = null,
    @SerializedName("isFatigued") val isFatigued: Boolean? = null
)

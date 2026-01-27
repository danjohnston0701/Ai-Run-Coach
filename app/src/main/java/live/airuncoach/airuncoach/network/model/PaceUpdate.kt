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
    @SerializedName("isSplit") val isSplit: Boolean,
    @SerializedName("splitKm") val splitKm: Int?,
    @SerializedName("splitPace") val splitPace: String?,
    @SerializedName("currentGrade") val currentGrade: Double?,
    @SerializedName("totalElevationGain") val totalElevationGain: Double?,
    @SerializedName("isOnHill") val isOnHill: Boolean?,
    @SerializedName("kmSplits") val kmSplits: List<KmSplit>
)

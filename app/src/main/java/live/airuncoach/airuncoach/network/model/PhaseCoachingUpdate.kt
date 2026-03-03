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
    @SerializedName("heartRate") val heartRate: Int?,
    @SerializedName("cadence") val cadence: Int?,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("activityType") val activityType: String,
    // Additional context for richer coaching
    @SerializedName("triggerType") val triggerType: String? = null, // "500m_checkin", "phase_change"
    @SerializedName("targetTime") val targetTime: Int? = null,
    @SerializedName("targetPace") val targetPace: String? = null,
    @SerializedName("kmSplits") val kmSplits: List<live.airuncoach.airuncoach.domain.model.KmSplit>? = null,
    // Stride analysis
    @SerializedName("strideLength") val strideLength: Double? = null,
    @SerializedName("strideZone") val strideZone: String? = null, // "OPTIMAL", "OVERSTRIDING", "UNDERSTRIDING"
    @SerializedName("optimalStrideMin") val optimalStrideMin: Double? = null,
    @SerializedName("optimalStrideMax") val optimalStrideMax: Double? = null,
    @SerializedName("terrainContext") val terrainContext: String? = null,
    @SerializedName("isFatigued") val isFatigued: Boolean? = null,
    @SerializedName("hasRoute") val hasRoute: Boolean = false,
    // Navigation coaching context
    @SerializedName("navigationInstruction") val navigationInstruction: String? = null,
    @SerializedName("navigationDistance") val navigationDistance: Int? = null, // meters to turn
    // Pace coaching context
    @SerializedName("paceDeviationPercent") val paceDeviationPercent: Double? = null,          // +ve = slower than target, -ve = faster
    @SerializedName("rollingPaceDeviationPercent") val rollingPaceDeviationPercent: Double? = null, // Recent ~500m pace vs target
    @SerializedName("projectedFinishSeconds") val projectedFinishSeconds: Double? = null,       // ETA at current pace
    @SerializedName("currentAvgPaceSecondsPerKm") val currentAvgPaceSecondsPerKm: Double? = null, // Overall avg pace
    @SerializedName("rollingPaceSecondsPerKm") val rollingPaceSecondsPerKm: Double? = null,     // Recent rolling pace
    @SerializedName("progressPercent") val progressPercent: Double? = null                       // 0-100 how far through the run
)

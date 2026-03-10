package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Request for the elite coaching endpoint — handles technique, milestones,
 * positive reinforcement, target ETA, pace trends, and elevation insights.
 */
data class EliteCoachingRequest(
    @SerializedName("coachingType") val coachingType: String,
    @SerializedName("distance") val distance: Double,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("currentPace") val currentPace: String,
    @SerializedName("averagePace") val averagePace: String,
    @SerializedName("elapsedTime") val elapsedTime: Long, // seconds
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("nicknameStyle") val nicknameStyle: String? = "occasional",  // "none" | "occasional" | "frequent"
    @SerializedName("hasRoute") val hasRoute: Boolean,

    // Optional context
    @SerializedName("heartRate") val heartRate: Int? = null,
    @SerializedName("cadence") val cadence: Int? = null,
    @SerializedName("currentGrade") val currentGrade: Double? = null,
    @SerializedName("totalElevationGain") val totalElevationGain: Double? = null,
    @SerializedName("totalElevationLoss") val totalElevationLoss: Double? = null,
    @SerializedName("targetTime") val targetTime: Long? = null, // seconds
    @SerializedName("targetPace") val targetPace: String? = null,

    // Type-specific context
    @SerializedName("milestonePercent") val milestonePercent: Int? = null,
    @SerializedName("kmSplits") val kmSplits: List<KmSplitBrief>? = null,
    @SerializedName("paceTrendDirection") val paceTrendDirection: String? = null,
    @SerializedName("paceTrendDeltaPerKm") val paceTrendDeltaPerKm: Int? = null,
    @SerializedName("projectedFinishTime") val projectedFinishTime: Long? = null, // seconds
    @SerializedName("consecutiveConsistentSplits") val consecutiveConsistentSplits: Int? = null,
    @SerializedName("isNegativeSplitting") val isNegativeSplitting: Boolean? = null,
    @SerializedName("fastestSplitKm") val fastestSplitKm: Int? = null,
    @SerializedName("fastestSplitPace") val fastestSplitPace: String? = null,
    @SerializedName("targetTimeCategory") val targetTimeCategory: String? = null,
    @SerializedName("etaOverTargetPercent") val etaOverTargetPercent: Double? = null,
    @SerializedName("remainingMeters") val remainingMeters: Int? = null,
    @SerializedName("remainingDistanceFormatted") val remainingDistanceFormatted: String? = null,  // e.g., "4 km" or "3.4 km"
    @SerializedName("distanceCompletedFormatted") val distanceCompletedFormatted: String? = null,  // e.g., "3.4 km"

    // Technique coaching — specific category and contextual hint for the AI
    @SerializedName("techniqueCategory") val techniqueCategory: String? = null,
    @SerializedName("techniqueHint") val techniqueHint: String? = null,
    @SerializedName("runPhase") val runPhase: String? = null,  // EARLY, BUILDING, SUSTAINING, FINISHING
    @SerializedName("isOnHill") val isOnHill: Boolean? = null,
    @SerializedName("isUphill") val isUphill: Boolean? = null,
    @SerializedName("fatigueLevel") val fatigueLevel: String? = null,  // FRESH, MODERATE, FATIGUED
    @SerializedName("recentTechniqueCategories") val recentTechniqueCategories: List<String>? = null,

    // Coaching programme context — populated when this run is a scheduled plan workout
    @SerializedName("trainingPlanId") val trainingPlanId: String? = null,
    @SerializedName("workoutId") val workoutId: String? = null,
    @SerializedName("workoutType") val workoutType: String? = null,        // easy / tempo / intervals / long_run
    @SerializedName("workoutDescription") val workoutDescription: String? = null,
    @SerializedName("planGoalType") val planGoalType: String? = null,      // 5k / 10k / half_marathon / marathon
    @SerializedName("planWeekNumber") val planWeekNumber: Int? = null,
    @SerializedName("planTotalWeeks") val planTotalWeeks: Int? = null
)

data class KmSplitBrief(
    @SerializedName("km") val km: Int,
    @SerializedName("pace") val pace: String
)

data class EliteCoachingResponse(
    @SerializedName("message") val message: String,
    @SerializedName("audio") val audio: String? = null,
    @SerializedName("format") val format: String? = "mp3"
)

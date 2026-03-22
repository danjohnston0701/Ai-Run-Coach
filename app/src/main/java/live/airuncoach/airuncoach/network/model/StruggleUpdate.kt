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
    @SerializedName("hasRoute") val hasRoute: Boolean = false,
    // User profile for personalisation
    @SerializedName("fitnessLevel") val fitnessLevel: String? = null,
    @SerializedName("runnerName") val runnerName: String? = null,
    @SerializedName("runnerAge") val runnerAge: Int? = null,
    // Historical run context
    @SerializedName("runHistory") val runHistory: RunHistoryStats? = null,
    // ========== Session Coaching Context (Phase 1) ==========
    @SerializedName("linked_workout_id") val linkedWorkoutId: String? = null,
    @SerializedName("session_coaching_tone") val sessionCoachingTone: String? = null,
    @SerializedName("session_coaching_intensity") val sessionCoachingIntensity: String? = null,
    @SerializedName("session_structure") val sessionStructure: SessionStructure? = null,
    @SerializedName("expected_metrics_filters") val expectedMetricsFilters: InsightFilters? = null
)

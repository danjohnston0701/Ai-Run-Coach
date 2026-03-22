package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class HeartRateCoachingRequest(
    @SerializedName("currentHR") val currentHR: Int,
    @SerializedName("avgHR") val avgHR: Int,
    @SerializedName("maxHR") val maxHR: Int,
    @SerializedName("targetZone") val targetZone: Int,
    @SerializedName("elapsedMinutes") val elapsedMinutes: Int,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String? = null,
    @SerializedName("coachAccent") val coachAccent: String? = null,
    // User profile for personalised zone calculation
    @SerializedName("runnerAge") val runnerAge: Int? = null,
    @SerializedName("fitnessLevel") val fitnessLevel: String? = null,
    @SerializedName("runnerName") val runnerName: String? = null,
    // Coaching plan context — allows HR coaching to know if runner is in target zone
    @SerializedName("workoutIntensity") val workoutIntensity: String? = null,  // "z1"–"z5" from plan
    @SerializedName("workoutType") val workoutType: String? = null,            // easy/tempo/intervals/etc.
    // ========== Session Coaching Context (Phase 1) ==========
    @SerializedName("session_coaching_tone") val sessionCoachingTone: String? = null,
    @SerializedName("linked_workout_id") val linkedWorkoutId: String? = null
)

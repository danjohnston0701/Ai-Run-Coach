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
    // ========== Session Coaching Context ==========
    @SerializedName("session_coaching_tone") val sessionCoachingTone: String? = null,
    @SerializedName("linked_workout_id") val linkedWorkoutId: String? = null,

    // ── Session memory — coaching continuity ──────────────────────────────────
    @SerializedName("topicsDiscussed") val topicsDiscussed: List<String>? = null,
    @SerializedName("topicsNotCovered") val topicsNotCovered: List<String>? = null,
    @SerializedName("sessionCueCount") val sessionCueCount: Int? = null,
    @SerializedName("lastCueTriggerType") val lastCueTriggerType: String? = null,
    @SerializedName("minutesSinceLastCue") val minutesSinceLastCue: Double? = null,
    @SerializedName("recentCoachingMessages") val recentCoachingMessages: List<String>? = null,

    // ── Sensor confidence ─────────────────────────────────────────────────────
    @SerializedName("hrConfidence") val hrConfidence: String? = null,       // "high" | "medium" | "low"
    @SerializedName("gpsConfidence") val gpsConfidence: String? = null,     // "high" | "medium" | "low"

    // ── Physiological response to last cue ────────────────────────────────────
    @SerializedName("lastCueHrDelta") val lastCueHrDelta: Int? = null,      // bpm change since last cue (negative = fell)
    @SerializedName("lastCuePaceDelta") val lastCuePaceDelta: Int? = null,  // sec/km change since last cue (negative = faster)
    @SerializedName("athleteRespondedToLastCue") val athleteRespondedToLastCue: Boolean? = null,

    // ── Terrain context (cross-platform parity with iOS TERRAIN_AWARENESS_SPEC) ──
    // Confirmed terrain state from the 150m-hysteresis classifier so the HR coach
    // can contextualise elevated HR ("HR high because you're on a steep climb" vs
    // "HR high on flat terrain — check effort").
    // Values: flat | rolling | gradual_climb | steep_climb | gradual_descent | steep_descent
    @SerializedName("terrain_context") val terrainContext: String? = null,

    // "run" | "walk" — controls walk/run vocabulary in the generated coaching line
    @SerializedName("activityType") val activityType: String? = null,
    // The live Garmin-companion session ID (shared table/endpoints for Garmin AND Wear OS —
    // see GarminWatchManager/SamsungWatchManager.activeCompanionSessionId), when a watch is
    // actually paired and streaming. Lets the backend enrich this coaching prompt with the
    // watch's live running-dynamics data (ground contact time, vertical oscillation, stride
    // length, running power, respiration rate, training effect) from garminRealtimeData.
    // Null for phone-only runs — the prompt is then built exactly as before, with no enrichment.
    @SerializedName("garminCompanionSessionId") val garminCompanionSessionId: String? = null
)

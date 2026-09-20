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
    @SerializedName("expected_metrics_filters") val expectedMetricsFilters: InsightFilters? = null,
    // Coaching plan session type — tells the AI this is a training run, not a race/goal attempt.
    // Reframes the coaching message around the training objective rather than race goal pace.
    @SerializedName("workoutType") val workoutType: String? = null,
    // "run" | "walk" — was previously never sent, so struggle coaching always defaulted to
    // running vocabulary for walk sessions. See RunTrackingService.currentActivityType.
    @SerializedName("activityType") val activityType: String? = null,
    // The live Garmin-companion session ID (shared table/endpoints for Garmin AND Wear OS —
    // see GarminWatchManager/SamsungWatchManager.activeCompanionSessionId), when a watch is
    // actually paired and streaming. Lets the backend enrich this coaching prompt with the
    // watch's live running-dynamics data (ground contact time, vertical oscillation, stride
    // length, running power, respiration rate, training effect) from garminRealtimeData.
    // Null for phone-only runs — the prompt is then built exactly as before, with no enrichment.
    @SerializedName("garminCompanionSessionId") val garminCompanionSessionId: String? = null,

    // ── Live environment context (2026-09-20) ─────────────────────────────────
    // Wind at the run's start fix, with its relationship to the current heading — see WindContext.
    @SerializedName("wind") val wind: WindContext? = null,
    // Altitude range covered so far (highest point − lowest point, metres). This is the
    // "elevation" figure the product shows the runner; totalElevationGain is the accumulation of
    // every rise and is far larger on undulating ground (224 m of "climbing" on a course with a
    // 22 m range). Prompts should describe the course with this, not the accumulation.
    @SerializedName("elevationRangeM") val elevationRangeM: Double? = null
)

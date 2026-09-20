package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.KmSplit

data class HRZoneTarget(
    @SerializedName("min") val min: Int? = null,
    @SerializedName("max") val max: Int? = null,
)

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
    @SerializedName("heartRateZoneTarget") val heartRateZoneTarget: HRZoneTarget? = null,
    @SerializedName("cadence") val cadence: Int? = null,
    @SerializedName("targetTime") val targetTime: Int? = null,
    @SerializedName("targetPace") val targetPace: String? = null,
    @SerializedName("averagePace") val averagePace: String? = null,
    @SerializedName("terrainContext") val terrainContext: String? = null,
    @SerializedName("isFatigued") val isFatigued: Boolean? = null,
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
    @SerializedName("current_session_phase") val currentSessionPhase: String? = null,
    // Coaching plan session type — when set, suppresses race-goal pace comparison and uses
    // training-session framing instead ("building aerobic base", "tempo effort", etc.)
    @SerializedName("workoutType") val workoutType: String? = null,
    // ========== Route Memory Engine ==========
    @SerializedName("routeIntelligence") val routeIntelligence: RouteIntelligenceContext? = null,
    @SerializedName("lastKmSplitSeconds") val lastKmSplitSeconds: Int? = null,
    // Session target pace from the coaching plan — used to compare km splits against the session's
    // prescribed pace (not the long-term race goal). Provided in seconds/km.
    @SerializedName("sessionTargetPaceMin") val sessionTargetPaceMin: Int? = null,
    @SerializedName("sessionTargetPaceMax") val sessionTargetPaceMax: Int? = null,
    // "run" | "walk" — was previously never sent, so split/500m-check-in coaching always
    // defaulted to running vocabulary for walk sessions. See RunTrackingService.currentActivityType.
    @SerializedName("activityType") val activityType: String? = null,
    // The live Garmin-companion session ID (shared table/endpoints for Garmin AND Wear OS —
    // see GarminWatchManager/SamsungWatchManager.activeCompanionSessionId), when a watch is
    // actually paired and streaming. Lets the backend enrich this coaching prompt with the
    // watch's live running-dynamics data (ground contact time, vertical oscillation, stride
    // length, running power) from garminRealtimeData. Null for phone-only runs — the prompt
    // is then built exactly as before, with no enrichment.
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

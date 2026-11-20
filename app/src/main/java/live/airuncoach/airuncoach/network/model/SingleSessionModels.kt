package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

// One-off AI-designed sessions (server/routes-single-sessions.ts) and the
// "you have a plan session today" check shared with typed free runs.

/** POST /api/single-sessions — exactly one of durationMinutes / distanceKm. */
data class CreateSingleSessionRequest(
    @SerializedName("workoutType") val workoutType: String,
    @SerializedName("durationMinutes") val durationMinutes: Int? = null,
    @SerializedName("distanceKm") val distanceKm: Double? = null,
    @SerializedName("notes") val notes: String? = null,
)

data class CreateSingleSessionResponse(
    @SerializedName("workout") val workout: WorkoutDetails,
    @SerializedName("planId") val planId: String,
    @SerializedName("name") val name: String?,
    @SerializedName("todayPlanSession") val todayPlanSession: OpenPlanSession? = null,
)

/** One row of GET /api/single-sessions. */
data class SingleSessionItem(
    @SerializedName("workout") val workout: WorkoutDetails,
    @SerializedName("planId") val planId: String,
    @SerializedName("name") val name: String?,
    @SerializedName("createdAt") val createdAt: String?,
)

/** GET /api/plan-sessions/open-today — workout is null when there's nothing open today. */
data class OpenPlanSessionTodayResponse(
    @SerializedName("date") val date: String?,
    @SerializedName("workout") val workout: WorkoutDetails?,
    @SerializedName("planId") val planId: String? = null,
    @SerializedName("goalType") val goalType: String? = null,
    @SerializedName("weekNumber") val weekNumber: Int? = null,
    @SerializedName("totalWeeks") val totalWeeks: Int? = null,
)

data class OpenPlanSession(
    @SerializedName("workout") val workout: WorkoutDetails,
    @SerializedName("planId") val planId: String,
    @SerializedName("goalType") val goalType: String?,
)

// ── Confirm session: suggested paces (POST /api/sessions/suggest-paces, server/session-pace-suggest.ts) ──

data class SuggestPacesRequest(
    @SerializedName("sessionType") val sessionType: String,
    @SerializedName("reps") val reps: Int,
    @SerializedName("workSeconds") val workSeconds: Int? = null,
    @SerializedName("workMeters") val workMeters: Int? = null,
    @SerializedName("restSeconds") val restSeconds: Int? = null,
    @SerializedName("restMeters") val restMeters: Int? = null,
    @SerializedName("warmupMinutes") val warmupMinutes: Int = 0,
    @SerializedName("cooldownMinutes") val cooldownMinutes: Int = 0,
)

/** Pace band in sec/km; min is the faster end. */
data class PaceBandDto(
    @SerializedName("min") val min: Int,
    @SerializedName("max") val max: Int,
)

data class SuggestedPacesResponse(
    /** "history" (worked out from the runner's runs) or "none" (nothing to base them on). */
    @SerializedName("source") val source: String,
    @SerializedName("basis") val basis: String? = null,
    @SerializedName("workPace") val workPace: PaceBandDto? = null,
    @SerializedName("easyPace") val easyPace: PaceBandDto? = null,
    @SerializedName("workNote") val workNote: String? = null,
)

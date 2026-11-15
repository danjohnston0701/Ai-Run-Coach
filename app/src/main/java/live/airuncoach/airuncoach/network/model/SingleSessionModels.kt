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

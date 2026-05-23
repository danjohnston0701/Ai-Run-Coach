package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.GroupRun

/** Wrapper returned by GET /api/group-runs */
data class GroupRunsResponse(
    @SerializedName("groupRuns") val groupRuns: List<GroupRun>,
    @SerializedName("count") val count: Int = 0,
    @SerializedName("total") val total: Int = 0
)

/** POST /api/group-runs request body */
data class CreateGroupRunRequest(
    @SerializedName("name") val name: String,
    @SerializedName("description") val description: String,
    @SerializedName("meetingPoint") val meetingPoint: String?,
    @SerializedName("meetingLat") val meetingLat: Double?,
    @SerializedName("meetingLng") val meetingLng: Double?,
    @SerializedName("distance") val distance: Double,
    @SerializedName("dateTime") val dateTime: String,
    @SerializedName("maxParticipants") val maxParticipants: Int = 10,
    @SerializedName("isPublic") val isPublic: Boolean = true
)

/** POST /api/group-runs/:id/invite request body */
data class InviteFriendsRequest(
    @SerializedName("userIds") val userIds: List<String>
)

/** POST /api/group-runs/:id/respond request body */
data class GroupRunRespondRequest(
    @SerializedName("response") val response: String // "accepted" | "declined"
)

/** POST /api/group-runs/:id/complete request body */
data class GroupRunCompleteRequest(
    @SerializedName("runId") val runId: String
)

/** GET /api/group-runs/:id/results */
data class GroupRunResultsResponse(
    @SerializedName("groupRunId") val groupRunId: String,
    @SerializedName("groupRunName") val groupRunName: String?,
    @SerializedName("results") val results: List<GroupRunParticipantResult>
)

data class GroupRunParticipantResult(
    @SerializedName("userId") val userId: String,
    @SerializedName("userName") val userName: String,
    @SerializedName("profilePic") val profilePic: String?,
    @SerializedName("runId") val runId: String?,
    @SerializedName("completedAt") val completedAt: String?,
    @SerializedName("isCurrentUser") val isCurrentUser: Boolean,
    @SerializedName("stats") val stats: GroupRunStats?
)

data class GroupRunStats(
    @SerializedName("distance") val distance: Double,
    @SerializedName("duration") val duration: Int,
    @SerializedName("avgPace") val avgPace: String?,
    @SerializedName("avgHeartRate") val avgHeartRate: Int?,
    @SerializedName("calories") val calories: Int?,
    @SerializedName("avgCadence") val avgCadence: Int? = null,
    @SerializedName("totalElevationGain") val totalElevationGain: Double? = null
)

/** GET /api/group-runs/by-run/:runId — look up which group run a specific run belongs to */
data class GroupRunLookupResponse(
    @SerializedName("groupRunId") val groupRunId: String,
    @SerializedName("groupRunName") val groupRunName: String?
)

/** POST /api/group-runs/:id/debrief — AI narrative post-run group debrief */
data class GroupRunDebriefResponse(
    @SerializedName("debrief") val debrief: String,
    @SerializedName("rank") val rank: Int? = null,
    @SerializedName("totalFinishers") val totalFinishers: Int? = null
)

// ─── Race Predictor ──────────────────────────────────────────────────────────

/** GET /api/runs/:runId/race-predictions */
data class RacePredictionsResponse(
    @SerializedName("sourceRunId") val sourceRunId: String,
    @SerializedName("sourceDistanceKm") val sourceDistanceKm: Double,
    @SerializedName("sourceDurationSeconds") val sourceDurationSeconds: Int,
    @SerializedName("sourcePace") val sourcePace: String,
    @SerializedName("predictions") val predictions: List<RacePrediction>,
    @SerializedName("disclaimer") val disclaimer: String
)

data class RacePrediction(
    @SerializedName("race") val race: String,
    @SerializedName("distanceKm") val distanceKm: Double,
    @SerializedName("predictedTimeSeconds") val predictedTimeSeconds: Int,
    @SerializedName("predictedTime") val predictedTime: String,
    @SerializedName("predictedPace") val predictedPace: String,
    @SerializedName("reliable") val reliable: Boolean
)

// ─── Training Load / Recovery ─────────────────────────────────────────────────

/** GET /api/fitness/current/:userId */
data class TrainingLoadResponse(
    @SerializedName("ctl") val ctl: Double,           // Chronic Training Load (fitness)
    @SerializedName("atl") val atl: Double,           // Acute Training Load (fatigue)
    @SerializedName("tsb") val tsb: Double,           // Training Stress Balance (form)
    @SerializedName("status") val status: String,     // optimal / maintaining / productive / overtrained / detraining / no_data
    @SerializedName("trainingLoad") val trainingLoad: Double? = null,
    @SerializedName("injuryRisk") val injuryRisk: String? = null,
    @SerializedName("rampRate") val rampRate: Double? = null,
    @SerializedName("recommendations") val recommendations: List<String>? = null,
    @SerializedName("message") val message: String? = null
) {
    /** Human-readable recovery status */
    fun recoveryLabel(): String = when (status) {
        "optimal"     -> "Race Ready"
        "maintaining" -> "Maintaining"
        "productive"  -> "Building Fitness"
        "overtrained" -> "Overreached"
        "detraining"  -> "Too Easy"
        else          -> "No Data"
    }
    fun recoveryEmoji(): String = when (status) {
        "optimal"     -> "🟢"
        "maintaining" -> "🔵"
        "productive"  -> "🟡"
        "overtrained" -> "🔴"
        "detraining"  -> "⚪"
        else          -> "⚫"
    }
}

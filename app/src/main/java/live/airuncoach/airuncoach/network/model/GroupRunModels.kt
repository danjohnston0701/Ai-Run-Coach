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
    @SerializedName("calories") val calories: Int?
)

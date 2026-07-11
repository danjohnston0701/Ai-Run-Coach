package live.airuncoach.airuncoach.domain.model

import com.google.gson.annotations.SerializedName

data class GroupRun(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String?,
    @SerializedName("description") val description: String? = null,
    @SerializedName("creatorId") val creatorId: String? = null,
    @SerializedName("creatorName") val creatorName: String? = null,
    @SerializedName("meetingPoint") val meetingPoint: String? = null,
    @SerializedName("meetingLat") val meetingLat: Double? = null,
    @SerializedName("meetingLng") val meetingLng: Double? = null,
    @SerializedName("distance") val distance: Double? = null,
    @SerializedName("dateTime") val dateTime: String? = null,
    @SerializedName("maxParticipants") val maxParticipants: Int? = null,
    @SerializedName("currentParticipants") val currentParticipants: Int? = null,
    @SerializedName("isPublic") val isPublic: Boolean = true,
    @SerializedName("status") val status: String? = null,
    @SerializedName("isJoined") val isJoined: Boolean = false,
    @SerializedName("isOrganiser") val isOrganiser: Boolean = false,
    @SerializedName("myInvitationStatus") val myInvitationStatus: String? = null, // "pending"|"accepted"|"declined"
    @SerializedName("participants") val participants: List<GroupRunParticipant>? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("inviteToken") val inviteToken: String? = null
)

data class GroupRunParticipant(
    @SerializedName("userId") val userId: String,
    @SerializedName("userName") val userName: String,
    @SerializedName("profilePic") val profilePic: String? = null,
    @SerializedName("invitationStatus") val invitationStatus: String, // "pending"|"accepted"|"declined"
    @SerializedName("role") val role: String = "participant",         // "organiser"|"participant"
    @SerializedName("runId") val runId: String? = null,               // linked run session after run
    @SerializedName("readyToStart") val readyToStart: Boolean = false,
    @SerializedName("completedAt") val completedAt: String? = null    // when they finished their run
)

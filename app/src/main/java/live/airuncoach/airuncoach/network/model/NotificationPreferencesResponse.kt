package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Strongly-typed model for GET /api/notification-preferences/:userId
 */
data class NotificationPreferencesResponse(
    @SerializedName("friendRequest") val friendRequest: Boolean = true,
    @SerializedName("friendAccepted") val friendAccepted: Boolean = true,
    @SerializedName("groupRunInvite") val groupRunInvite: Boolean = true,
    @SerializedName("groupRunStarting") val groupRunStarting: Boolean = true,
    @SerializedName("runCompleted") val runCompleted: Boolean = false,
    @SerializedName("weeklyProgress") val weeklyProgress: Boolean = false,
    @SerializedName("liveRunInvite") val liveRunInvite: Boolean = true,
    @SerializedName("liveObserverJoined") val liveObserverJoined: Boolean = true,
    @SerializedName("coachingPlanReminder") val coachingPlanReminder: Boolean = true,
)

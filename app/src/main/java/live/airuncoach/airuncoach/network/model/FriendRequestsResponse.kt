package live.airuncoach.airuncoach.network.model

data class FriendRequestsResponse(
    val sent: List<FriendRequestItem>,
    val received: List<FriendRequestItem>
)

data class FriendRequestItem(
    val id: String,
    val requesterId: String,
    val addresseeId: String,
    val requesterName: String?,
    val requesterProfilePic: String?,
    val addresseeName: String?,
    val addresseeProfilePic: String?,
    val status: String,
    val message: String?,
    val createdAt: String
)

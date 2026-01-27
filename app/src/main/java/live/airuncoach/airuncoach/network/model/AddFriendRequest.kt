package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class AddFriendRequest(
    @SerializedName("userId") val userId: String,
    @SerializedName("friendId") val friendId: String
)

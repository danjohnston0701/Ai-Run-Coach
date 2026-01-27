package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class TalkToCoachResponse(
    @SerializedName("message") val message: String
)

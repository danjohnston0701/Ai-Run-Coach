package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class PreRunBriefingResponse(
    @SerializedName("audio") val audio: String,
    @SerializedName("format") val format: String,
    @SerializedName("voice") val voice: String,
    @SerializedName("text") val text: String
)

package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class PaceUpdateResponse(
    @SerializedName("message") val message: String,
    @SerializedName("nextPace") val nextPace: String,
    @SerializedName("audio") val audio: String? = null,
    @SerializedName("format") val format: String? = "mp3"
)

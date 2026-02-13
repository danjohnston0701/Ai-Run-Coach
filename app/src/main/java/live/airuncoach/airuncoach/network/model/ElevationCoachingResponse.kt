package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class ElevationCoachingResponse(
    @SerializedName("message") val message: String,
    @SerializedName("audio") val audio: String? = null,
    @SerializedName("format") val format: String? = "mp3"
)
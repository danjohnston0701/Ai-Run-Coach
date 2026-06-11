package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class GenerateTtsRequest(
    @SerializedName("text") val text: String,
    @SerializedName("coachGender") val coachGender: String? = null,
    @SerializedName("coachAccent") val coachAccent: String? = null
)

data class GenerateTtsResponse(
    @SerializedName("audio") val audio: String,   // base64-encoded mp3
    @SerializedName("format") val format: String  // always "mp3"
)

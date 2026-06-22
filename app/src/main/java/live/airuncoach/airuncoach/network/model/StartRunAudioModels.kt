package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Request for generating motivational start run announcement audio via Polly TTS
 */
data class StartRunAudioRequest(
    @SerializedName("motivationalText") val motivationalText: String
)

/**
 * Response containing Polly TTS audio for the start run motivation statement
 */
data class StartRunAudioResponse(
    @SerializedName("audio") val audio: String?,  // Base64-encoded MP3 audio
    @SerializedName("format") val format: String?,  // "mp3"
    @SerializedName("text") val text: String?  // The motivational text that was synthesized
)

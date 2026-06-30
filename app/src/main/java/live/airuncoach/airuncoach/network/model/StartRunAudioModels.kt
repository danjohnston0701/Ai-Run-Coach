package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Request for generating motivational start run announcement audio via Polly TTS.
 * Voice preferences are forwarded so the server-side TTS (AWS Polly) can select the
 * closest matching voice to the user's configured coach voice — keeping the opening
 * brief consistent with the rest of the session's coaching audio.
 */
data class StartRunAudioRequest(
    @SerializedName("motivationalText") val motivationalText: String,
    @SerializedName("coachAccent")      val coachAccent: String? = null,   // e.g. "irish", "british", "australian"
    @SerializedName("coachGender")      val coachGender: String? = null,   // "male" | "female"
    @SerializedName("coachName")        val coachName: String? = null      // e.g. "Saoirse", "James"
)

/**
 * Response containing Polly TTS audio for the start run motivation statement
 */
data class StartRunAudioResponse(
    @SerializedName("audio") val audio: String?,  // Base64-encoded MP3 audio
    @SerializedName("format") val format: String?,  // "mp3"
    @SerializedName("text") val text: String?  // The motivational text that was synthesized
)

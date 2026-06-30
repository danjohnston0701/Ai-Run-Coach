package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Request to pre-generate Polly TTS audio for a batch of coaching messages.
 *
 * Called after [PrepareSessionCoachingResponse] is received so that every in-run coaching
 * cue plays instantly with the Polly voice — no Android TTS fallback, no network latency
 * during the run.
 */
data class BatchTTSRequest(
    /** All coaching texts to synthesize (trigger messages + alternatives + preRunBrief). */
    @SerializedName("texts") val texts: List<String>,
    /** Coach accent (e.g. "irish", "british"). Falls back to user profile if null. */
    @SerializedName("accent") val accent: String?,
    /** Coach gender ("male" or "female"). Falls back to user profile if null. */
    @SerializedName("gender") val gender: String?
)

/** One result item in a [BatchTTSResponse]. */
data class BatchTTSResult(
    /** The original text that was synthesized. */
    @SerializedName("text") val text: String,
    /** Base64-encoded MP3 audio, or null if synthesis failed for this item. */
    @SerializedName("audio") val audio: String?,
    /** Audio format — always "mp3" from Polly. */
    @SerializedName("format") val format: String?
)

data class BatchTTSResponse(
    @SerializedName("audios") val audios: List<BatchTTSResult>
)

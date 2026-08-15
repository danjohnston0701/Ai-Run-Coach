package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class HeartRateCoachingResponse(
    @SerializedName("message") val message: String,
    @SerializedName("audio") val audio: String? = null,
    @SerializedName("format") val format: String? = "mp3",
    // Server returns {skipped:true, reason, retryAfter} with no `message` when the shared
    // per-user coaching cooldown rejects this call — Gson silently sets `message` to null
    // in that case despite its non-null type, so callers MUST check this before using message.
    @SerializedName("skipped") val skipped: Boolean = false
)

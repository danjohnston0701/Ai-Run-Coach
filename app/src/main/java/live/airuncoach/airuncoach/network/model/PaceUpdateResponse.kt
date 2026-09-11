package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class PaceUpdateResponse(
    @SerializedName("message") val message: String,
    @SerializedName("nextPace") val nextPace: String,
    @SerializedName("audio") val audio: String? = null,
    @SerializedName("format") val format: String? = "mp3",
    // See HeartRateCoachingResponse.skipped — same shared-cooldown skip contract.
    @SerializedName("skipped") val skipped: Boolean = false,
    // Why it was skipped: "split_interval" (user's own km-interval setting — genuinely nothing
    // to say), "generation_failed" (AI call failed/empty — a km split must still be announced
    // locally), or a cooldown reason.
    @SerializedName("reason") val reason: String? = null
)

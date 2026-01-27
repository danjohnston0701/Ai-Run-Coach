package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.CoachingContext

data class TalkToCoachRequest(
    @SerializedName("message") val message: String,
    @SerializedName("context") val context: CoachingContext
)

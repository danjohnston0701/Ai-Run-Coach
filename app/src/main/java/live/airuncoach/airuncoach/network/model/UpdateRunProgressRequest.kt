package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.StrugglePoint

data class UpdateRunProgressRequest(
    @SerializedName("runId") val runId: String,
    @SerializedName("userComments") val userComments: String?,
    @SerializedName("strugglePoints") val strugglePoints: List<StrugglePoint>
)
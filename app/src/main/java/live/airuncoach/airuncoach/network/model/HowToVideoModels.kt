package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Response from GET /api/how-to-videos?platform=android — the watch + phone demo videos linked
 * from the Connected Devices tiles. Only published videos are listed (server-side flag), so a
 * tile shows its link only once its video is live.
 */
data class HowToVideosResponse(
    @SerializedName("videos") val videos: List<HowToVideo> = emptyList(),
)

data class HowToVideo(
    @SerializedName("id")          val id: String,
    /** "garmin" | "apple_watch" */
    @SerializedName("watch")       val watch: String,
    @SerializedName("title")       val title: String,
    @SerializedName("subtitle")    val subtitle: String = "",
    @SerializedName("url")         val url: String,
    @SerializedName("posterUrl")   val posterUrl: String? = null,
    @SerializedName("durationSec") val durationSec: Int = 0,
)

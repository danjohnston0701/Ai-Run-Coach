package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Live wind context attached to in-session coaching requests (km split, HR, elite, struggle).
 *
 * The weather fetched at the first GPS fix has always carried wind speed and direction, and the
 * post-run Weather Impact card already scores it — but no live coaching prompt ever saw it, so a
 * pace drift into a 35 km/h headwind was coached as fatigue or "pushing too hard". [relative] is
 * the wind's relationship to the runner's current heading: "headwind" (running into it),
 * "tailwind" (wind at their back) or "crosswind".
 */
data class WindContext(
    @SerializedName("speedKmh") val speedKmh: Int,
    @SerializedName("directionDeg") val directionDeg: Int? = null,   // meteorological: direction the wind blows FROM
    @SerializedName("relative") val relative: String? = null         // "headwind" | "tailwind" | "crosswind"
)

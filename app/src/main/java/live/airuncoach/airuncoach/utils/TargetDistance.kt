package live.airuncoach.airuncoach.utils

import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Helpers for the user's target-distance decimal-places setting (0–3, see
 * `User.targetDistanceDecimals`).
 *
 * 0 and 1 places keep the distance slider (whole km, or tenths); 2 and 3 replace it with a
 * numeric field, because a slider can't usefully express 21.0975 km and a 1–50 km range at
 * 0.001 resolution is 49,000 steps.
 */
object TargetDistance {
    /** Whether the target-distance control should be a typed field rather than a slider. */
    fun usesTextEntry(decimals: Int): Boolean = decimals >= 2

    /**
     * Widest slider span (max − min) the user may configure at a given precision — 50 km of whole
     * kilometres or 25 km of tenths keeps every slider position reachable by touch. Users who
     * want to target more than 50 km move the window (e.g. 20–70 km) rather than widen it.
     * Irrelevant at 2–3 dp, where there is no slider.
     */
    fun maxSliderSpanKm(decimals: Int): Int = if (decimals >= 1) 25 else 50

    const val DEFAULT_MIN_KM = 1
    const val DEFAULT_MAX_KM = 50

    /** Validate a min/max pair for the slider; null when acceptable, else a user-facing reason. */
    fun rangeError(minKm: Int?, maxKm: Int?, decimals: Int): String? {
        if (minKm == null || maxKm == null) return "Enter both a minimum and a maximum distance"
        if (minKm < DEFAULT_MIN_KM) return "Minimum must be at least 1 km"
        if (maxKm <= minKm) return "Maximum must be greater than the minimum"
        if (usesTextEntry(decimals)) return null
        val span = maxSliderSpanKm(decimals)
        if (maxKm - minKm > span) {
            return "At $decimals decimal place${if (decimals == 1) "" else "s"} the slider can cover at most $span km — e.g. $minKm–${minKm + span} km"
        }
        return null
    }

    /** Round to the configured number of places, avoiding float drift like 9.9999 → 9. */
    fun round(distanceKm: Float, decimals: Int): Float {
        val d = decimals.coerceIn(0, 3)
        if (d == 0) return distanceKm.roundToInt().toFloat()
        val factor = 10.0.pow(d)
        return ((distanceKm * factor).roundToInt() / factor).toFloat()
    }

    /** "21", "21.1", "21.10", "21.098" — fixed to the configured places so the setting is visible. */
    fun format(distanceKm: Float, decimals: Int): String =
        "%.${decimals.coerceIn(0, 3)}f".format(distanceKm)

    /**
     * Filter raw keyboard input down to digits plus one dot with at most [decimals] places after
     * it. Kept as text while editing so partial input ("21." on the way to "21.098") survives
     * keystrokes instead of being round-tripped through Float and snapping back.
     */
    fun sanitizeInput(raw: String, decimals: Int): String {
        val cleaned = raw.filter { it.isDigit() || it == '.' }
        val dot = cleaned.indexOf('.')
        return if (dot >= 0) {
            cleaned.substring(0, dot + 1) +
                cleaned.substring(dot + 1).filter { it.isDigit() }.take(decimals.coerceIn(0, 3))
        } else cleaned
    }
}

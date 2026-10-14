package live.airuncoach.airuncoach.utils

import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Timing rules for progress check-ins: the free-run 25/50/75% milestones and any coaching-plan
 * trigger keyed on `distance_pct`. These cues are spoken on time or not at all.
 *
 * A progress check-in only means something at the point it describes. "Halfway" at 60%, or
 * "25% done" at 1.4 km of a 3 km run, is wrong rather than late. So a cue that can't go out
 * (another cue playing, a km split, a GPS gap) is never kept to be said later. Each milestone
 * gets a short window just after the runner crosses it, about [SPEAK_WINDOW_SEC] of travel at
 * their current speed. It fires inside that window only if the audio slot is clear, and it is
 * dropped once the window closes. The generated audio also has to arrive within
 * [DELIVERY_DEADLINE_MS] and find the slot still clear, or it is discarded unspoken.
 *
 * Mirrored by `ProgressMilestones` in the iOS project (HomeScreens.swift). Change both together.
 */
object ProgressMilestones {
    val PERCENTS = listOf(25, 50, 75)

    /** Seconds of travel past the milestone during which the cue may still start. */
    const val SPEAK_WINDOW_SEC = 8.0
    const val MIN_WINDOW_M = 20.0
    const val MAX_WINDOW_M = 50.0

    /** The cue's text + audio must come back within this long of being requested, or it is dropped. */
    const val DELIVERY_DEADLINE_MS = 8_000L

    /** Quiet needed since the last cue was requested before a milestone may start. */
    const val QUIET_BEFORE_MS = 5_000L

    /** On round targets a milestone this close to a km marker is left to the km-split cue. */
    const val KM_MARKER_OVERLAP_M = 200.0

    enum class Window { NOT_YET, OPEN, MISSED }

    /** Window length in metres: ~8 s at the runner's speed, so walkers and runners both get ~8 s. */
    fun windowMeters(speedMps: Double): Double {
        val speed = if (speedMps.isFinite() && speedMps > 0) speedMps else 0.0
        return (speed * SPEAK_WINDOW_SEC).coerceIn(MIN_WINDOW_M, MAX_WINDOW_M)
    }

    fun window(milestoneM: Double, distanceM: Double, speedMps: Double): Window = when {
        distanceM < milestoneM -> Window.NOT_YET
        distanceM - milestoneM <= windowMeters(speedMps) -> Window.OPEN
        else -> Window.MISSED
    }

    /**
     * True when the milestone point lands within [KM_MARKER_OVERLAP_M] of a whole km (from 1 km
     * on). The km-split cue speaks there, so the milestone would only repeat it or clash with it.
     */
    fun overlapsKmMarker(milestoneM: Double): Boolean {
        if (milestoneM < 1000.0) return false
        val nearestKmM = (milestoneM / 1000.0).roundToLong() * 1000.0
        return abs(milestoneM - nearestKmM) <= KM_MARKER_OVERLAP_M
    }

    /**
     * True when the milestone point is already inside the final stretch, where only the
     * final 500 m / 250 m / 100 m cues speak (e.g. 75% of 2 km = 500 m to go).
     */
    fun insideFinalStretch(milestoneM: Double, targetM: Double, finalStretchM: Double): Boolean =
        targetM - milestoneM <= finalStretchM

    private val DISTANCE_PCT_THRESHOLD = Regex("""distance_pct\s*(?:>=|>)\s*(\d+(?:\.\d+)?)""")

    /**
     * Percent from a plan trigger condition such as `distance_pct > 50`, or
     * `distance_pct >= 75 && phase == main`. Returns null when the condition has no distance_pct
     * lower bound, meaning it isn't a progress milestone.
     */
    fun distancePctThreshold(condition: String?): Double? =
        condition?.let { DISTANCE_PCT_THRESHOLD.find(it)?.groupValues?.get(1)?.toDoubleOrNull() }
}

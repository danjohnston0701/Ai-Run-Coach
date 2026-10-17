package live.airuncoach.airuncoach.utils

import java.util.Calendar

/**
 * Default run names — a line-for-line port of `defaultRunName()` in
 * server/utils/run-derivation.ts (and iOS RunNaming.swift); change all three together.
 *
 * The server names every run at save time, so this only covers runs saved before it did, or a
 * name cleared by the runner: a planned workout is named for the session ("Tempo Run",
 * "Hill Repeats"), anything else for the local time of day ("Morning Run", "Evening Walk").
 */
object RunNaming {
    private val NON_PLAN_WORKOUT_TYPES = setOf("free", "watch_standalone")

    private val PLAN_WORKOUT_NAMES = mapOf(
        "easy" to "Easy Run",
        "easy_run" to "Easy Run",
        "easy_with_strides" to "Easy Run + Strides",
        "easy_strides" to "Easy Run + Strides",
        "long" to "Long Run",
        "long_run" to "Long Run",
        "back_to_back_long" to "Back-to-Back Long Run",
        "walk_run" to "Walk/Run",
        "interval" to "Intervals",
        "intervals" to "Intervals",
        "short_interval" to "Intervals",
        "park_run" to "parkrun",
        "pre_race_shakeout" to "Pre-Race Shakeout",
    )

    /** Words that already make a name read as a session; anything else gets " Run" appended. */
    private val SESSION_NOUNS = Regex("""\b(run|race|intervals|repeats|strides|fartlek|shakeout|walk|parkrun)$""", RegexOption.IGNORE_CASE)

    fun planWorkoutName(workoutType: String?): String? {
        val key = workoutType.orEmpty().trim().lowercase().replace(Regex("""[\s-]+"""), "_")
        if (key.isEmpty() || key in NON_PLAN_WORKOUT_TYPES) return null
        PLAN_WORKOUT_NAMES[key]?.let { return it }
        val name = key.split("_").filter { it.isNotEmpty() }
            .joinToString(" ") { if (it == "parkrun") it else it.replaceFirstChar(Char::uppercaseChar) }
        return if (SESSION_NOUNS.containsMatchIn(name)) name else "$name Run"
    }

    /** Morning 05–11, Lunch 12–13, Afternoon 14–16, Evening 17–20, Night otherwise. */
    fun timeOfDayLabel(hour: Int): String = when (hour) {
        in 5..11 -> "Morning"
        in 12..13 -> "Lunch"
        in 14..16 -> "Afternoon"
        in 17..20 -> "Evening"
        else -> "Night"
    }

    fun defaultName(sessionType: String?, startHour: Int, workoutType: String?): String {
        val isWalk = sessionType.equals("walk", ignoreCase = true)
        planWorkoutName(workoutType)?.let { planned ->
            return if (isWalk && planned != "Walk/Run") planned.replace(Regex("""\bRun$"""), "Walk") else planned
        }
        return "${timeOfDayLabel(startHour)} ${if (isWalk) "Walk" else "Run"}"
    }

    /** The run's own name, or its default — start hour in the device's time zone. */
    fun displayName(name: String?, sessionType: String?, startTimeMs: Long, workoutType: String?): String {
        if (!name.isNullOrBlank()) return name
        val hour = Calendar.getInstance().apply { timeInMillis = startTimeMs }.get(Calendar.HOUR_OF_DAY)
        return defaultName(sessionType, hour, workoutType)
    }
}

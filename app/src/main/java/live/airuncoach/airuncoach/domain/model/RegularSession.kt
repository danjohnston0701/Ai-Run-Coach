package live.airuncoach.airuncoach.domain.model

import java.util.UUID

/**
 * Represents a recurring run the user does regularly outside of their AI-generated plan
 * (e.g. Parkrun every Saturday 8am, running club on Tuesday evenings).
 *
 * The AI coach uses these when building the training schedule so that:
 *  - The session can be placed on the correct day/time in the plan
 *  - [countsTowardWeeklyTotal] controls whether it counts against the user's chosen
 *    weekly session target (e.g. "I want 3 AI sessions but Parkrun is extra")
 */
data class RegularSession(
    val id: String = UUID.randomUUID().toString(),
    val name: String,                          // e.g. "Parkrun 5K", "Tuesday Running Club"
    val dayOfWeek: Int,                        // 0 = Sunday … 6 = Saturday
    val timeHour: Int,                         // 0–23
    val timeMinute: Int,                       // 0–59
    val distanceKm: Double,                    // approximate distance in km
    val countsTowardWeeklyTotal: Boolean = true // false = exclude from AI session count
) {
    /** Human-readable day name */
    val dayName: String get() = when (dayOfWeek) {
        0 -> "Sunday"
        1 -> "Monday"
        2 -> "Tuesday"
        3 -> "Wednesday"
        4 -> "Thursday"
        5 -> "Friday"
        6 -> "Saturday"
        else -> "Unknown"
    }

    /** e.g. "08:00" */
    val timeLabel: String get() =
        "${timeHour.toString().padStart(2, '0')}:${timeMinute.toString().padStart(2, '0')}"
}

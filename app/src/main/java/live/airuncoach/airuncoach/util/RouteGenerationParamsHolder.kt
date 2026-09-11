package live.airuncoach.airuncoach.util

/**
 * Holder for route generation parameters
 *
 * Used to pass parameters from MapMyRunSetupScreen through the availability check
 * to the actual route generation screen, similar to how GoalPlanHolder and RunConfigHolder work.
 */
object RouteGenerationParamsHolder {
    private var params: RouteGenerationParams? = null

    fun setParams(
        distance: Float,
        hasTime: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int,
        latitude: Double,
        longitude: Double,
        aiCoachEnabled: Boolean = false,
        liveTrackingEnabled: Boolean = false,
        liveTrackingObservers: List<String> = emptyList(),
        isGroupRun: Boolean = false,
        groupRunParticipants: List<String> = emptyList()
    ) {
        params = RouteGenerationParams(
            distance = distance,
            hasTime = hasTime,
            hours = hours,
            minutes = minutes,
            seconds = seconds,
            latitude = latitude,
            longitude = longitude,
            aiCoachEnabled = aiCoachEnabled,
            liveTrackingEnabled = liveTrackingEnabled,
            liveTrackingObservers = liveTrackingObservers,
            isGroupRun = isGroupRun,
            groupRunParticipants = groupRunParticipants
        )
    }

    fun consume(): RouteGenerationParams? {
        val result = params
        params = null
        return result
    }

    fun peek(): RouteGenerationParams? = params

    fun clear() {
        params = null
    }
}

data class RouteGenerationParams(
    val distance: Float,
    val hasTime: Boolean,
    val hours: Int,
    val minutes: Int,
    val seconds: Int,
    val latitude: Double,
    val longitude: Double,
    val aiCoachEnabled: Boolean = false,
    val liveTrackingEnabled: Boolean = false,
    val liveTrackingObservers: List<String> = emptyList(),
    val isGroupRun: Boolean = false,
    val groupRunParticipants: List<String> = emptyList()
)

package live.airuncoach.airuncoach.util

/**
 * Holder for route generation parameters
 *
 * Used to pass parameters from MapMyRunSetupScreen through the availability check
 * to the actual route generation screen, similar to how GoalPlanHolder and RunConfigHolder work.
 */
object RouteGenerationParamsHolder {
    private var params: RouteGenerationParams? = null

    /**
     * Session type / reps / plan-session answer picked on the setup screen for this routed run.
     * Set every time Generate Routes is pressed (NONE for a free run) and read when the chosen
     * route is started — kept separately because the route VM consumes [params] long before that.
     */
    var chosenSession: live.airuncoach.airuncoach.domain.model.ChosenSession =
        live.airuncoach.airuncoach.domain.model.ChosenSession.NONE

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
        groupRunParticipants: List<String> = emptyList(),
        activityType: String = "RUN"
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
            groupRunParticipants = groupRunParticipants,
            activityType = activityType
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
    val groupRunParticipants: List<String> = emptyList(),
    /** "RUN" | "WALK" — the setup screen's toggle, carried through to the routed session. */
    val activityType: String = "RUN"
)

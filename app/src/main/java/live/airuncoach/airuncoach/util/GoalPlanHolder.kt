package live.airuncoach.airuncoach.util

import live.airuncoach.airuncoach.domain.model.Goal

/**
 * Holds a Goal to prefill the GeneratePlanScreen wizard.
 * Set before navigating to generate_plan route, consumed in the screen.
 */
object GoalPlanHolder {
    var prefilledGoal: Goal? = null

    fun consume(): Goal? {
        val g = prefilledGoal
        prefilledGoal = null
        return g
    }
}

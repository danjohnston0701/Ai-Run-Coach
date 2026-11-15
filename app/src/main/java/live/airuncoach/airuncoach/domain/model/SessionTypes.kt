package live.airuncoach.airuncoach.domain.model

/**
 * Session types a runner can pick on the run setup screen (feature 1: they run it themselves)
 * or ask the AI to design as a one-off (feature 2, POST /api/single-sessions).
 *
 * Keys are the same vocabulary as AI plan sessions (planned_workouts.workout_type), so the
 * coaching engine, the AI prompts and the saved run's workout_type all read them the same way.
 * Server mirror: SINGLE_SESSION_TYPES in server/routes-single-sessions.ts. iOS mirror to come
 * (SessionTypes.swift) — change them together.
 */
enum class SessionKind {
    /** No type chosen — today's behaviour (Free Run / Free Walk). */
    FREE,
    /** Sustained effort: km splits framed around the session, pace coaching stays on. */
    CONTINUOUS,
    /** Reps and recoveries: no km splits, pace consistency or finish ETA — HR, form, motivation. */
    REPS,
    /** Race day: coached as a race (goal pace, finish ETA), not as a training session. */
    RACE,
}

data class SessionTypeOption(
    /** workout_type sent to the server; null for Free Run / Free Walk. */
    val key: String?,
    val label: String,
    val activity: PhysicalActivityType,
    val kind: SessionKind,
    /** Offered as a one-off AI-designed session (feature 2). */
    val aiDesignable: Boolean,
    val blurb: String,
)

object SessionTypes {
    val FREE_RUN = SessionTypeOption(null, "Free Run", PhysicalActivityType.RUN, SessionKind.FREE, false, "Just run — full coaching")
    val FREE_WALK = SessionTypeOption(null, "Free Walk", PhysicalActivityType.WALK, SessionKind.FREE, false, "Just walk — full coaching")
    /** AI-designed walk (feature 2 only; on the setup screen Free Walk covers it). */
    private val WALK = SessionTypeOption("walk", "Walk", PhysicalActivityType.WALK, SessionKind.CONTINUOUS, true, "A coach-designed walk")

    val all: List<SessionTypeOption> = listOf(
        FREE_RUN,
        FREE_WALK,
        SessionTypeOption("easy", "Easy Run", PhysicalActivityType.RUN, SessionKind.CONTINUOUS, true, "Relaxed, conversational effort"),
        SessionTypeOption("long_run", "Long Run", PhysicalActivityType.RUN, SessionKind.CONTINUOUS, true, "Steady aerobic endurance"),
        SessionTypeOption("tempo", "Tempo Run", PhysicalActivityType.RUN, SessionKind.CONTINUOUS, true, "Comfortably hard, sustained"),
        SessionTypeOption("threshold", "Threshold", PhysicalActivityType.RUN, SessionKind.CONTINUOUS, true, "Hard, controlled effort"),
        SessionTypeOption("recovery", "Recovery Run", PhysicalActivityType.RUN, SessionKind.CONTINUOUS, true, "Very easy, shake the legs out"),
        SessionTypeOption("race_pace", "Race Pace", PhysicalActivityType.RUN, SessionKind.CONTINUOUS, true, "Practise your goal race pace"),
        SessionTypeOption("intervals", "Intervals", PhysicalActivityType.RUN, SessionKind.REPS, true, "Fast reps with recoveries"),
        SessionTypeOption("hill_repeats", "Hill Repeats", PhysicalActivityType.RUN, SessionKind.REPS, true, "Uphill efforts, easy back down"),
        SessionTypeOption("fartlek", "Fartlek", PhysicalActivityType.RUN, SessionKind.REPS, true, "Unstructured surges"),
        SessionTypeOption("walk_run", "Walk-Run", PhysicalActivityType.RUN, SessionKind.REPS, true, "Run intervals with walk breaks"),
        SessionTypeOption("race", "Run Race Day", PhysicalActivityType.RUN, SessionKind.RACE, false, "Coached as a race"),
        SessionTypeOption("walk_race", "Walk Race Day", PhysicalActivityType.WALK, SessionKind.RACE, false, "Coached as a race"),
    )

    /** Types the AI can design as a one-off session. */
    val aiDesignable: List<SessionTypeOption> = all.filter { it.aiDesignable } + WALK

    /** Lookup by workout_type; null key → Free Run. */
    fun byKey(key: String?): SessionTypeOption? = (all + WALK).firstOrNull { it.key == key }

    /** Interval-style types: what the self-managed (no plan) coaching gate keys on. */
    val REP_KEYS: Set<String> = all.filter { it.kind == SessionKind.REPS }.mapNotNull { it.key }.toSet()
    val RACE_KEYS: Set<String> = all.filter { it.kind == SessionKind.RACE }.mapNotNull { it.key }.toSet()

    /** The setup screen's starting pick for the profile's default run/walk preference. */
    fun defaultFor(activity: PhysicalActivityType): SessionTypeOption =
        if (activity == PhysicalActivityType.WALK) FREE_WALK else FREE_RUN
}

/**
 * Optional "Configure session" structure for a REPS type picked on the setup screen. When set,
 * the phone builds a small local coaching plan (SelfConfiguredSessionPlan) so the existing phase
 * engine calls each rep and recovery; when absent the runner manages the reps themselves.
 * Exactly one of workSeconds / workMeters, and of restSeconds / restMeters, is set.
 */
data class ManualSessionStructure(
    val reps: Int,
    val workSeconds: Int? = null,
    val workMeters: Int? = null,
    val restSeconds: Int? = null,
    val restMeters: Int? = null,
    val warmupMinutes: Int = 0,
    val cooldownMinutes: Int = 0,
) {
    fun isValid(): Boolean =
        reps in 1..50 &&
            ((workSeconds ?: 0) > 0) != ((workMeters ?: 0) > 0) &&
            ((restSeconds ?: 0) > 0) != ((restMeters ?: 0) > 0) &&
            warmupMinutes in 0..60 && cooldownMinutes in 0..60

    /** "6 × 400 m, 90 s recovery" — shown on the setup screen and sent to the AI as the session description. */
    fun summary(): String {
        val work = workMeters?.let { "$it m" } ?: workSeconds?.let { formatSecs(it) } ?: "?"
        val rest = restSeconds?.let { "${formatSecs(it)} recovery" } ?: restMeters?.let { "$it m recovery" } ?: ""
        val wu = if (warmupMinutes > 0) "$warmupMinutes min warm-up, " else ""
        val cd = if (cooldownMinutes > 0) ", $cooldownMinutes min cool-down" else ""
        return "$wu$reps × $work, $rest$cd"
    }

    // "90 s", "2 min", "2:30" — seconds read best under two minutes.
    private fun formatSecs(s: Int): String = when {
        s >= 60 && s % 60 == 0 -> "${s / 60} min"
        s < 120 -> "$s s"
        else -> "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
    }
}

/** The runner's answer to "You have a plan session today — should this count?" (runs.plan_session_choice). */
object PlanSessionChoice {
    const val COUNT = "count"
    const val LEAVE_OPEN = "leave_open"
}

/** What the setup screen hands on with a free run: the picked type, optional reps, plan-session answer. */
data class ChosenSession(
    val workoutType: String?,
    val structure: ManualSessionStructure?,
    val planSessionChoice: String?,
) {
    val isReps: Boolean get() = SessionTypes.byKey(workoutType)?.kind == SessionKind.REPS

    companion object {
        val NONE = ChosenSession(null, null, null)
    }
}

/** Applies a setup-screen session to a free-run config. Rep sessions have no distance/time goal. */
fun RunSetupConfig.withChosenSession(c: ChosenSession): RunSetupConfig = copy(
    chosenWorkoutType = c.workoutType,
    manualStructure = c.structure,
    planSessionChoice = c.planSessionChoice,
    targetDistance = if (c.isReps) null else targetDistance,
    hasTargetTime = hasTargetTime && !c.isReps,
)

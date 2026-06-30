package live.airuncoach.airuncoach.network.model

/**
 * Session Coaching Models for Phase 1 Integration
 * 
 * These models support dynamic, session-specific coaching determined by the AI
 * based on session type, user athletic level, and training plan goals.
 */

/**
 * Response from GET /api/workouts/{workoutId}/session-instructions
 * 
 * Contains AI-determined coaching plan for a specific workout including:
 * - Pre-run brief explaining what to expect
 * - Session structure with phases and coaching triggers
 * - Optimal coaching tone and style for this session
 * - Metric filters (what to focus on, what to ignore)
 */
data class SessionInstructionsResponse(
    val workoutId: String,
    val preRunBrief: String,
    val sessionStructure: SessionStructure,
    val aiDeterminedTone: String,  // "light_fun", "direct", "motivational", "calm", "serious", "playful"
    val aiDeterminedIntensity: String,  // "relaxed", "moderate", "intense"
    val coachingStyle: CoachingStyle,
    val insightFilters: InsightFilters,
    val toneReasoning: String?  // Why AI chose this tone
)

/**
 * Session structure with phases and coaching triggers
 */
data class SessionStructure(
    val type: String,  // "interval_training", "zone_2", "recovery", "tempo", "long_run", etc
    val goal: String?,  // "build_fitness", "develop_speed", "active_recovery", "endurance"
    val phases: List<SessionPhase>?,
    val coachingTriggers: List<CoachingTrigger>?
)

/**
 * A phase within the session (warmup, main set, cooldown, recovery, etc)
 */
data class SessionPhase(
    val name: String,  // "warmup", "interval_1_of_6", "recovery", "cooldown", etc
    val durationKm: Double?,
    val durationSeconds: Int?,
    val description: String?,
    val repetitions: Int?
)

/**
 * When and how coaching should be triggered during this session
 */
data class CoachingTrigger(
    val phase: String,  // Which phase this trigger applies to
    val trigger: String,  // "at_start", "at_end", "rep_start", "rep_end", "every_km", "pace_deviation", etc
    val message: String?  // Suggested coaching message for this trigger
)

/**
 * Coaching style configuration for this session
 */
data class CoachingStyle(
    val tone: String,  // The tone to use
    val encouragementLevel: String,  // "low", "moderate", "high"
    val detailDepth: String,  // "minimal", "moderate", "detailed"
    val technicalDepth: String?  // "simple", "moderate", "advanced"
)

/**
 * Which metrics to focus on and which to ignore during this session
 */
data class InsightFilters(
    val include: List<String>?,  // ["pace_deviation", "effort_level", "recovery_quality"]
    val exclude: List<String>?   // ["500m_summary", "km_splits", "generic_motivation"]
)

/**
 * Event logged during a run to track what coaching was delivered
 * 
 * POST to /api/coaching/session-events to log each coaching event
 * This data is used for:
 * - Post-run comprehensive analysis
 * - Coaching effectiveness tracking
 * - Adaptive coaching optimization
 */
data class CoachingSessionEvent(
    val runId: String,
    val plannedWorkoutId: String?,  // If run is linked to a plan
    val eventType: String,  // "interval_start", "pace_coaching", "recovery_guidance", "struggle_coaching", etc
    val eventPhase: String?,  // "warmup", "interval_2_of_6", "recovery", etc
    val coachingMessage: String?,  // The actual message delivered
    val coachingAudioUrl: String?,  // URL to audio if generated
    val userMetrics: Map<String, Any>?,  // Current metrics at time of coaching (pace, HR, distance, etc)
    val toneUsed: String?,  // The tone actually used
    val userEngagement: String? = null  // "positive", "neutral", "struggled" — optional user rating
)

/**
 * Helper extension to convert session instructions to runtime context
 */
data class SessionCoachingContext(
    val instructions: SessionInstructionsResponse,
    val tone: String,
    val intensity: String,
    val targetPace: Double?  // If available from workout metadata
)

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Dynamic Bespoke Session Coaching Models
//
// These models support the new unified generateSessionCoaching() system where
// every session type (new or existing) gets bespoke AI coaching.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Response from POST /api/workouts/{workoutId}/prepare-coaching
 *
 * Contains the full bespoke SessionCoachingPlan generated for this workout.
 * Returned at "Prepare Run" time and cached for the run.
 */
data class PrepareCoachingResponse(
    val workoutId: String,
    val plan: DynamicSessionCoachingPlan,
    val cueingStrategy: String,   // "interval" | "threshold" | "paced" | "freerun"
    val coachingTone: String,
    val preRunBrief: String,
    val whyThisSession: String,
    val phasesCount: Int,
    val triggersCount: Int
)

/**
 * Response from GET /api/workouts/{workoutId}/coaching-plan
 */
data class CoachingPlanResponse(
    val workoutId: String,
    val plan: DynamicSessionCoachingPlan
)

/**
 * The full dynamic coaching plan — works for ANY session type.
 * Contains phases, triggers, and metadata needed by the live run engine.
 */
data class DynamicSessionCoachingPlan(
    val sessionType: String,
    val sessionGoal: String,
    val coachingTone: String,
    val cueingStrategy: String,       // "interval" | "threshold" | "paced" | "freerun"
    val preRunBrief: String,
    val whyThisSession: String,
    val phases: List<DynamicCoachingPhase>,
    val triggers: List<DynamicCoachingTrigger>,
    val targetMetrics: DynamicTargetMetrics
)

/**
 * A phase in the coaching plan.
 *
 * For simple sessions: warmup + main_effort + cooldown.
 * For interval sessions: use `repetitions > 1` on the work and recovery phases rather than
 * listing each rep individually. Consecutive phases with `repetitions > 1` are treated as a
 * group and interleaved: (work rep 1, recovery rep 1, work rep 2, recovery rep 2, …).
 * This keeps the coaching plan compact for high-rep sessions (e.g. 10× intervals stay at
 * 4 phases instead of 20).
 */
data class DynamicCoachingPhase(
    val name: String,               // "warmup", "work", "recovery_walk", "cooldown", etc.
    val order: Int,                 // 0-indexed execution order
    val durationMinutes: Double?,
    val distanceKm: Double?,
    val targetPaceMin: Int?,        // sec/km  e.g. 330 = 5:30/km
    val targetPaceMax: Int?,        // sec/km
    val targetHRMin: Int?,          // BPM
    val targetHRMax: Int?,          // BPM
    val effort: String,             // "easy" | "moderate" | "threshold" | "hard" | "max"
    val coachingFocus: String,      // "relaxation" | "power" | "rhythm" | "endurance" | "speed"
    val phaseInstructions: String?,
    val repetitions: Int? = null    // > 1 for repeating interval phases (e.g. 10 for 10× reps)
)

/**
 * A trigger that fires a coaching cue during the run.
 * Evaluated against live metrics by the run tracking engine.
 *
 * ## Trigger types supported by the engine:
 * - `phase_start`    — fires once when a phase begins
 * - `phase_end`      — fires 5-12 seconds before a time-based phase ends
 * - `rep_start`      — fires at the start of each work-interval rep
 * - `rep_end`        — fires when a work-interval rep ends
 * - `recovery_start` — fires at the start of each recovery phase
 * - `hr_zone_high`   — fires when live HR > targetHRMax for current phase
 * - `hr_zone_low`    — fires when live HR < targetHRMin for current phase
 * - `pace_too_fast`  — fires when pace is faster than target by >15 sec/km
 * - `pace_too_slow`  — fires when pace is slower than target by >15 sec/km
 * - `cadence_low`    — fires when cadence < targetCadence for current phase (if set)
 * - `periodic`       — fires every `frequencySeconds` seconds regardless of conditions
 * - `milestone`      — fires at key distance percentages (e.g. distance_pct > 50)
 *
 * ## Message templates — live data substitution:
 * Messages may include these placeholders which the engine replaces with live values:
 * - `{hr}`           → current heart rate in bpm  (e.g. "142")
 * - `{hrZone}`       → current HR zone (1-5)       (e.g. "3")
 * - `{pace}`         → current pace formatted       (e.g. "5:30")
 * - `{cadence}`      → current cadence in spm       (e.g. "168")
 * - `{repNum}`       → current rep number           (e.g. "2")
 * - `{totalReps}`    → total reps in this interval  (e.g. "4")
 * - `{repsLeft}`     → reps remaining               (e.g. "2")
 * - `{elapsedMin}`   → elapsed run time in minutes  (e.g. "12")
 * - `{distKm}`       → distance covered in km       (e.g. "1.8")
 * - `{targetHRMax}`  → target HR max for this phase (e.g. "145")
 * - `{targetHRMin}`  → target HR min for this phase (e.g. "120")
 *
 * ## Frequency:
 * - `"once"`          → fires the first time only (phase_start, milestones)
 * - `"on_condition"`  → fires whenever condition is true, max once per 90 seconds
 * - `"periodic"`      → fires every `frequencySeconds` seconds (requires `frequencySeconds` set)
 */
data class DynamicCoachingTrigger(
    val id: String,                           // Unique identifier
    val type: String,                         // See trigger types above
    val condition: String,                    // e.g. "pace > targetPaceMax + 30" or "phase == warmup"
    val message: String,                      // Coaching cue — may include {hr}, {pace}, {cadence} etc.
    val frequency: String,                    // "once" | "on_condition" | "periodic"
    val frequencySeconds: Int? = null,        // For "periodic" triggers: seconds between fires (e.g. 120)
    val alternativeMessages: List<String>?,   // Variations to rotate through — may also use templates
    val alertType: String?,                   // "vibrate" | "audio" | "none"
    val suppressWhenIntensity: List<String>?, // e.g. ["z1"] = don't fire during recovery phases
    val targetCadence: Int? = null            // For cadence_low triggers: minimum spm threshold
)

/**
 * Metrics targets and session classification.
 * Used by the live run engine to know what to measure and compare.
 */
data class DynamicTargetMetrics(
    val totalDurationMinutes: Int,
    val totalDistanceKm: Double,
    val primaryMetric: String,          // "pace" | "heart_rate" | "effort" | "distance" | "time"
    val secondaryMetric: String?,
    val mainEffortPaceMin: Int?,        // sec/km
    val mainEffortPaceMax: Int?,        // sec/km
    val mainEffortHRMin: Int?,          // BPM
    val mainEffortHRMax: Int?,          // BPM
    val structure: String,              // "continuous" | "repeats" | "progression" | "threshold_block"
    val isSpeedWork: Boolean,
    val isEnduranceWork: Boolean,
    val isStrengthWork: Boolean,
    val isRecovery: Boolean
)

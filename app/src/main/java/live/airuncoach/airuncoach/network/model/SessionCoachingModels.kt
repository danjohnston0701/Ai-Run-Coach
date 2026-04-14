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
 * For intervals: one phase per rep + one per recovery jog.
 * For continuous runs: warmup + main_effort + cooldown.
 */
data class DynamicCoachingPhase(
    val name: String,               // "warmup", "hill_rep_1", "recovery_jog_1", "cooldown", etc.
    val order: Int,                 // 0-indexed execution order
    val durationMinutes: Double?,
    val distanceKm: Double?,
    val targetPaceMin: Int?,        // sec/km  e.g. 330 = 5:30/km
    val targetPaceMax: Int?,        // sec/km
    val targetHRMin: Int?,          // BPM
    val targetHRMax: Int?,          // BPM
    val effort: String,             // "easy" | "moderate" | "threshold" | "hard" | "max"
    val coachingFocus: String,      // "relaxation" | "power" | "rhythm" | "endurance" | "speed"
    val phaseInstructions: String?
)

/**
 * A trigger that fires a coaching cue during the run.
 * Evaluated against live metrics by the run tracking engine.
 */
data class DynamicCoachingTrigger(
    val id: String,                         // Unique identifier
    val type: String,                       // "phase_start" | "phase_end" | "pace_deviation" | "hr_zone" | "milestone"
    val condition: String,                  // e.g. "pace > targetPaceMax + 30" or "phase == warmup"
    val message: String,                    // Coaching cue to display/speak
    val frequency: String,                  // "once" | "on_condition" | "repeating_Nmin"
    val alternativeMessages: List<String>?, // Optional variations to rotate through
    val alertType: String?,                 // "vibrate" | "audio" | "none"
    val suppressWhenIntensity: List<String>? // e.g. ["z1"] = don't fire during recovery
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

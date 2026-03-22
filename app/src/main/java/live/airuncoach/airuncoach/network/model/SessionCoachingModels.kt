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

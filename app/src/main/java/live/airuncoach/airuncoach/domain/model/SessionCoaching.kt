package live.airuncoach.airuncoach.domain.model

import java.time.Instant

/**
 * SessionCoaching
 *
 * Represents the complete coaching plan for a single training session.
 * Generated dynamically by AI, works for ANY session type (current or future).
 *
 * Key principles:
 * - No hardcoded branches by session type
 * - All sessions use this same structure
 * - Phases + Triggers define the coaching experience
 * - "freerun" cueingStrategy can reuse simple coaching patterns
 */
data class SessionCoaching(
    val id: String,
    val sessionId: String,
    val workoutId: String,
    val sessionType: String,  // "easy", "interval", "tempo", "long_run", "recovery", etc. (ANY type)
    val sessionGoal: String,  // "speed", "endurance", "recovery", "threshold", "power"
    
    // Phase breakdown (warmup, main effort, cooldown, reps, etc.)
    val phases: List<SessionCoachingPhase>,
    
    // Triggers that fire during the run
    val triggers: List<CoachingTrigger>,
    
    // Overall session targets
    val targetMetrics: TargetMetrics,
    
    // How should we coach this session?
    val coachingTone: String,  // "encouraging", "technical", "calm", "motivational"
    val cueingStrategy: String,  // "interval", "threshold", "paced", "freerun"
    
    // Pre-run coaching
    val preRunBrief: String,  // e.g., "Today's an easy aerobic run. Keep it conversational."
    val whyThisSession: String,  // e.g., "Builds aerobic base and recovery"
    
    // Session instructions for reference
    val sessionInstructions: String?,
    
    // Metadata
    val createdAt: Instant,
    val generatedBy: String = "AI",  // "AI" or "user_custom"
)

/**
 * SessionCoachingPhase
 *
 * Represents a distinct phase of the session (warmup, interval rep, recovery, cooldown, etc.)
 * Each phase has its own targets and coaching approach.
 * Named SessionCoachingPhase to avoid collision with CoachingPhase enum.
 */
data class SessionCoachingPhase(
    val name: String,  // "warmup", "interval_rep_1", "recovery_jog", "main_effort", "cooldown"
    val order: Int,  // Phase sequence (0-indexed)
    val durationMinutes: Int?,  // Optional: e.g., 10 for a 10-min warmup
    val distanceKm: Double?,  // Optional: e.g., 2.0 for a 2km interval rep
    val targetPaceMin: Double?,  // min sec/km (e.g., 360 = 6:00/km)
    val targetPaceMax: Double?,  // max sec/km
    val targetHRMin: Int?,  // min BPM
    val targetHRMax: Int?,  // max BPM
    val effort: String,  // "easy", "steady", "moderate", "hard", "threshold", "race", "recovery"
    val coachingFocus: String,  // "relaxation", "rhythm", "power", "pace_control", "endurance"
    
    // Optional: instructions specific to this phase
    val phaseInstructions: String?,
)

/**
 * CoachingTrigger
 *
 * A condition that fires during the run to send a coaching cue.
 * Examples: pace deviation, HR zone change, phase transition, milestone
 */
data class CoachingTrigger(
    val id: String,
    val type: String,  // "phase_start", "phase_end", "pace_deviation", "hr_zone", "milestone", "custom"
    
    // Condition that triggers this cue
    // e.g., "pace > target + 30 sec", "hr < 120", "time = 5:00"
    val condition: String,
    
    // AI-generated coaching message
    val message: String,
    
    // How often should this fire?
    // "once" = fire once per phase
    // "repeating_3min" = every 3 minutes while condition is true
    // "on_condition" = every time the condition changes
    val frequency: String,
    
    // Optional: alternative messages for variety
    val alternativeMessages: List<String> = emptyList(),
    
    // Should this trigger sound an alert/vibration?
    val alertType: String? = null,  // "vibrate", "tone", "none"
    
    // Suppress if already in this intensity zone
    val suppressWhenIntensity: List<String>? = null,  // ["z1", "z2"]
)

/**
 * TargetMetrics
 *
 * Overall session targets and characteristics.
 * Used for live coaching comparisons.
 */
data class TargetMetrics(
    val sessionType: String,  // e.g., "intervals", "long_run", "recovery"
    val totalDurationMinutes: Int,
    val totalDistanceKm: Double,
    
    // Primary focus
    val primaryMetric: String,  // "pace", "heart_rate", "effort", "distance", "time"
    val secondaryMetric: String?,  // "pace", "heart_rate", "cadence"
    
    // Expected pace range for the main effort
    val mainEffortPaceMin: Double?,
    val mainEffortPaceMax: Double?,
    
    // Expected HR zone
    val mainEffortHRMin: Int?,
    val mainEffortHRMax: Int?,
    
    // How the session is structured
    val structure: String,  // "continuous", "repeats", "progression", "threshold_block"
    
    // Key characteristics
    val isSpeedWork: Boolean = false,
    val isEnduranceWork: Boolean = false,
    val isStrengthWork: Boolean = false,
    val isRecovery: Boolean = false,
)

/**
 * LiveCoachingState
 *
 * Used during a run to track which phase is active and which triggers have fired.
 */
data class LiveCoachingState(
    val sessionCoachingId: String,
    val currentPhaseIndex: Int,
    val firedTriggerIds: Set<String> = emptySet(),
    val lastCoachingCueAt: Instant? = null,
    val totalCuesGiven: Int = 0,
)

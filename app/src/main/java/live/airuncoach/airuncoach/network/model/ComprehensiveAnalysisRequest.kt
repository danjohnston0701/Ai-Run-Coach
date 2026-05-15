package live.airuncoach.airuncoach.network.model

/**
 * Request body for comprehensive AI run analysis endpoint.
 *
 * This request includes:
 * - Garmin watch data summary (only if the run has Garmin data)
 * - User profile including "What I know about you" for personalization
 *
 * CRITICAL: Only non-null values should be included in garminDataSummary.
 * Never pass null values to the AI prompt — it prevents hallucinations.
 */
data class ComprehensiveAnalysisRequest(
    val runId: String,
    
    /**
     * Garmin-sourced metrics for this run.
     * NULL if run does not have Garmin data (standard GPS + phone sensors only).
     * This prevents null values being sent to Claude AI.
     */
    val garminDataSummary: GarminDataSummary? = null,
    
    /**
     * User profile including personalization context ("What I know about you").
     * Used to make AI responses personal and contextual.
     */
    val userProfile: UserProfileForAI? = null
)

/**
 * Summary of Garmin watch data collected during this run.
 * All fields are nullable — only non-null fields should be populated.
 */
data class GarminDataSummary(
    /**
     * Whether this run includes Garmin watch data.
     * If false, all other fields should be null.
     */
    val hasGarminData: Boolean,
    
    /**
     * Friendly name of the Garmin device used (e.g., "Fenix 7X", "VivoActive 4").
     */
    val deviceName: String? = null,
    
    // ── RUNNING DYNAMICS ──────────────────────────────────────────────────────
    // All running dynamics metrics are optional — only include if we collected them
    
    /**
     * Average ground contact time (milliseconds) during the run.
     * Normal range: 200-300ms. Higher = overstriding or fatigue.
     */
    val avgGroundContactTime: Float? = null,
    
    /**
     * Minimum ground contact time during the run (best contact time).
     */
    val minGroundContactTime: Float? = null,
    
    /**
     * Maximum ground contact time during the run (worst contact time).
     */
    val maxGroundContactTime: Float? = null,
    
    /**
     * Ground contact balance (%) — left/right symmetry.
     * 50% = perfectly balanced. <48% or >52% = asymmetry warning.
     */
    val avgGroundContactBalance: Float? = null,
    
    /**
     * Average vertical oscillation (cm) — torso bounce per step.
     * Ideal: 6-8cm. >10cm = wasted energy.
     */
    val avgVerticalOscillation: Float? = null,
    
    /**
     * Maximum vertical oscillation during the run (peak bounce).
     */
    val maxVerticalOscillation: Float? = null,
    
    /**
     * Vertical ratio (%) — oscillation ÷ stride.
     * Ideal: 8-10%. Efficiency metric.
     */
    val avgVerticalRatio: Float? = null,
    
    /**
     * Average stride length (meters) during the run.
     */
    val avgStrideLength: Float? = null,
    
    /**
     * Minimum stride length during the run (e.g., on steep hills).
     */
    val minStrideLength: Float? = null,
    
    /**
     * Maximum stride length during the run (e.g., on descents).
     */
    val maxStrideLength: Float? = null,
    
    // ── TRAINING EFFECT & RECOVERY ────────────────────────────────────────────
    
    /**
     * Aerobic training effect (0-5 scale).
     * Indicates aerobic load of this session.
     */
    val aerobicTrainingEffect: Float? = null,
    
    /**
     * Anaerobic training effect (0-5 scale).
     * Indicates anaerobic/sprint load of this session.
     */
    val anaerobicTrainingEffect: Float? = null,
    
    /**
     * Recommended recovery time (minutes) until fully recovered.
     */
    val recoveryTimeMinutes: Int? = null,
    
    /**
     * VO2 Max estimate (ml/kg/min) from this session.
     * Updated by Garmin after quality training runs.
     */
    val vo2MaxEstimate: Float? = null,
    
    // ── POWER & RESPIRATION ────────────────────────────────────────────────────
    
    /**
     * Average running power (watts) during the run.
     * Only available on Fenix 7+, FR965, or with running power app.
     * Same power at faster pace = improved efficiency.
     */
    val avgRunningPower: Int? = null,
    
    /**
     * Maximum running power (watts) during the run (peak power exertion).
     */
    val maxRunningPower: Int? = null,
    
    /**
     * Average respiration rate (breaths per minute) during the run.
     * Only available on Fenix 7+, FR965 series.
     * Easy: 30-35, Tempo: 40-50, VO2 Max: 50-65.
     */
    val avgRespirationRate: Float? = null,
    
    // ── ENVIRONMENTAL ────────────────────────────────────────────────────────
    
    /**
     * Average ambient pressure (Pascals) during the run.
     * ~101325 Pa at sea level. Used for altitude verification and weather context.
     */
    val avgAmbientPressure: Float? = null,
    
    /**
     * Average bearing (degrees) during the run.
     * 0° = North, 90° = East, 180° = South, 270° = West.
     */
    val avgBearing: Float? = null,
    
    // ── COMPUTED SUMMARIES ────────────────────────────────────────────────────
    
    /**
     * Human-readable terrain summary (e.g., "rolling with 150m elevation").
     * Computed on the phone from altitude deltas.
     * Used to provide context to the AI about the run's terrain.
     */
    val terrainSummary: String? = null,
    
    /**
     * Estimated fatigue level (0-100) computed from multiple biometric signals.
     * 0 = fresh, 100 = exhausted.
     * Used to contextualize form analysis.
     */
    val estimatedFatigue: Int? = null
)

/**
 * User profile context for AI personalization.
 * Includes "What I know about you" + computed baselines for personalized coaching.
 */
data class UserProfileForAI(
    val userId: String,
    
    /**
     * Free-text runner profile written by user or AI.
     * Example: "John is a consistent base-builder who prefers steady-state runs.
     * Morning runner with track background. Recently improved VO2 max."
     *
     * This is included in every AI prompt to personalize responses.
     * Gets auto-updated after Garmin runs to include watch data insights.
     */
    val whatIKnowAboutYou: String = "",
    
    /**
     * Latest auto-generated Garmin insights appended to profile.
     * Example: "Ground contact time typically 245ms, showing efficient form.
     * Prefers Zone 3 pace of 5:25-5:35/km. Strong climber."
     *
     * Tracked separately so we can replace old insights with new ones
     * without losing the hand-written runner profile.
     */
    val garminInsights: String? = null,
    
    // ── BASELINE METRICS (4-week rolling average) ──────────────────────────────
    // These are optional — only include if we have 4+ weeks of Garmin data
    
    /**
     * User's baseline ground contact time (ms) from recent runs.
     * Used to contextualize current run's GCT.
     */
    val baselineGCT: Float? = null,
    
    /**
     * User's baseline vertical oscillation (cm) from recent runs.
     */
    val baselineVO: Float? = null,
    
    /**
     * User's baseline stride length (m) from recent runs.
     */
    val baselineStride: Float? = null,
    
    /**
     * User's baseline cadence (steps/min) from recent runs.
     */
    val baselineCadence: Int? = null,
    
    /**
     * User's baseline VO2 Max estimate from recent runs.
     */
    val baselineVO2Max: Float? = null
)

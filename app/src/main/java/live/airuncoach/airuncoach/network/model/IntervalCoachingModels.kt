package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Request for interval-specific coaching (work phase vs recovery phase)
 */
data class IntervalCoachingRequest(
    @SerializedName("run_id")
    val runId: String,
    
    @SerializedName("current_interval")
    val currentInterval: Int,
    
    @SerializedName("total_intervals")
    val totalIntervals: Int,
    
    @SerializedName("is_work_phase")
    val isWorkPhase: Boolean,
    
    @SerializedName("current_pace")
    val currentPace: String, // mm:ss/km
    
    @SerializedName("target_pace")
    val targetPace: String?, // mm:ss/km
    
    @SerializedName("distance_in_phase")
    val distanceInPhase: Double, // km
    
    @SerializedName("phase_duration_target")
    val phaseDurationTarget: Double?, // km or seconds
    
    @SerializedName("heart_rate")
    val heartRate: Int?,
    
    @SerializedName("target_hr_min")
    val targetHRMin: Int?,
    
    @SerializedName("target_hr_max")
    val targetHRMax: Int?,
    
    @SerializedName("cadence")
    val cadence: Int?,
    
    @SerializedName("fatigue_level")
    val fatigueLevel: String?, // "fresh" | "moderate" | "high"
    
    @SerializedName("training_plan_id")
    val trainingPlanId: String?,
    
    @SerializedName("workout_type")
    val workoutType: String?, // "intervals", "repeats", "fartlek"
    
    @SerializedName("elevation_gain")
    val elevationGain: Double?, // meters
    
    @SerializedName("wellness_context")
    val wellnessContext: WellnessPayload?,
    
    // ========== Session Coaching Context (Phase 1) ==========
    @SerializedName("session_coaching_tone")
    val sessionCoachingTone: String? = null,
    
    @SerializedName("current_phase")
    val currentPhase: String? = null,
    
    @SerializedName("rep_number")
    val repNumber: Int? = null
)

/**
 * Response with interval-specific coaching message and guidance
 */
data class IntervalCoachingResponse(
    @SerializedName("message")
    val message: String,
    
    @SerializedName("audio_url")
    val audioUrl: String?,
    
    @SerializedName("message_type")
    val messageType: String, // "interval_start" | "work_phase" | "recovery_start" | "recovery_phase" | "interval_complete" | "push"
    
    @SerializedName("emphasis")
    val emphasis: String?, // "pace" | "hr" | "form" | "breathing"
    
    @SerializedName("immediate_actions")
    val immediateActions: List<String>?, // ["speed_up", "slow_down", "relax", "push"]
    
    @SerializedName("next_interval_preview")
    val nextIntervalPreview: String? // Prep message for next interval if on final reps
)

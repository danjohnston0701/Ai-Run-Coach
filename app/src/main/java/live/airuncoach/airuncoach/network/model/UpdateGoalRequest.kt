package live.airuncoach.airuncoach.network.model

data class UpdateGoalRequest(
    val title: String,
    val description: String? = null,
    val notes: String? = null,
    val targetDate: String? = null,
    
    // Event-specific fields
    val eventName: String? = null,
    val eventLocation: String? = null,
    
    // Distance/Time fields
    val distanceTarget: String? = null,
    val timeTargetSeconds: Int? = null,
    
    // Health & Wellbeing fields
    val healthTarget: String? = null,
    val targetWeightKg: Double? = null,
    val startingWeightKg: Double? = null,
    
    // Consistency fields
    val weeklyRunTarget: Int? = null,
    
    // Status fields
    val isActive: Boolean? = null,
    val isCompleted: Boolean? = null,
    val currentProgress: Float? = null,
    val completedAt: String? = null,
    
    // Related run sessions
    val relatedRunSessionIds: List<String>? = null
)
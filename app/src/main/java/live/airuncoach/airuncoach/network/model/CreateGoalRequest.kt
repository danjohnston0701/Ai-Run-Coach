package live.airuncoach.airuncoach.network.model

data class CreateGoalRequest(
    val userId: String,
    val type: String,
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
    
    // Consistency fields
    val weeklyRunTarget: Int? = null
)

package live.airuncoach.airuncoach.domain.model

data class Goal(
    val id: String? = null,
    val userId: String,
    val type: String, // EVENT, DISTANCE_TIME, HEALTH_WELLBEING, CONSISTENCY
    val title: String,
    val description: String? = null,
    val notes: String? = null,
    val targetDate: String? = null, // ISO format date
    
    // Event-specific fields
    val eventName: String? = null,
    val eventLocation: String? = null,
    
    // Distance/Time fields
    val distanceTarget: String? = null, // "5K", "10K", "Half Marathon", "Marathon", "Ultra Marathon", or custom
    val timeTargetSeconds: Int? = null, // Total seconds for time target
    
    // Health & Wellbeing fields
    val healthTarget: String? = null, // "Improve fitness", "Improve endurance", etc.
    
    // Consistency fields
    val weeklyRunTarget: Int? = null, // Number of runs per week
    
    // Progress tracking
    val currentProgress: Float = 0f,
    val isActive: Boolean = true,
    val isCompleted: Boolean = false,
    
    // Metadata
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val completedAt: String? = null
)

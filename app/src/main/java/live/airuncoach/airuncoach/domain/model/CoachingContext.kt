package live.airuncoach.airuncoach.domain.model

data class CoachingContext(
    // Run metrics
    val distance: Double?,
    val duration: Int?,
    val pace: String?,
    val totalDistance: Double?,
    
    // Biometrics
    val heartRate: Int?,
    val cadence: Int?,
    
    // Terrain
    val elevation: Double?,
    val elevationChange: String?,
    val currentGrade: Double?,
    val totalElevationGain: Double?,
    
    // Environment
    val weather: WeatherData?,
    
    // State
    val phase: CoachingPhase?,
    val isStruggling: Boolean?,
    
    // Settings
    val activityType: String?,
    val userFitnessLevel: String?,
    val coachTone: String?,
    val coachAccent: String?,
    
    // Wellness (from Garmin)
    val wellness: WellnessContext?
)

data class WellnessContext(
    val sleepHours: Double?,
    val sleepQuality: String?,
    val sleepScore: Int?,
    val bodyBattery: Int?,
    val stressLevel: Int?,
    val stressQualifier: String?,
    val hrvStatus: String?,
    val hrvFeedback: String?,
    val restingHeartRate: Int?,
    val readinessScore: Int?,
    val readinessRecommendation: String?
)

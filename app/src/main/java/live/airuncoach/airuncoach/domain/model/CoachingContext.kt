package live.airuncoach.airuncoach.domain.model

data class CoachingContext(
    // ── Current Run Metrics ─────────────────────────────────────────────
    val distance: Double?,
    val duration: Int?,
    val pace: String?,                    // Average pace (M:SS)
    val currentPace: String?,             // Real-time pace
    val targetPace: String?,              // Target pace
    val totalDistance: Double?,
    
    // ── Heart Rate & Effort ─────────────────────────────────────────────
    val heartRate: Int?,                  // Current HR
    val avgHeartRate: Int?,               // Average HR
    val maxHeartRate: Int?,               // Max HR
    val minHeartRate: Int?,               // Min HR
    
    // ── Cadence & Running Dynamics ───────────────────────────────────────
    val cadence: Int?,                    // Current cadence (spm)
    val avgCadence: Int?,                 // Average cadence
    val maxCadence: Int?,                 // Max cadence
    val avgStrideLength: Double?,         // Meters
    val avgGroundContactTime: Float?,     // ms
    val avgVerticalOscillation: Float?,   // cm
    
    // ── Elevation & Terrain ──────────────────────────────────────────────
    val elevation: Double?,               // Current elevation (meters)
    val elevationChange: String?,         // "flat"|"hilly"|"mountainous"
    val elevationGain: Double?,           // Total elevation climbed
    val elevationLoss: Double?,           // Total elevation descended
    val avgGradient: Float?,              // Average gradient %
    val maxGradient: Float?,              // Steepest gradient %
    val currentGrade: Double?,            // Current slope %
    val totalElevationGain: Double?,      // For backwards compatibility
    
    // ── Time Tracking ──────────────────────────────────────────────────
    val targetTime: Long?,                // Target finish time (milliseconds)
    val elapsedTime: Int?,                // Elapsed time (seconds)
    val movingTime: Int?,                 // Moving time (seconds)
    
    // ── Environment & Weather ────────────────────────────────────────────
    val weather: WeatherData?,
    
    // ── Run State & Phase ────────────────────────────────────────────────
    val phase: CoachingPhase?,
    val isStruggling: Boolean?,
    
    // ── Training Context ─────────────────────────────────────────────────
    val activityType: String?,
    val workoutType: String?,             // "easy"|"tempo"|"intervals"|etc
    val workoutIntensity: String?,        // "z1"-"z5"
    
    // ── Energy & Training Effect ──────────────────────────────────────────
    val calories: Int?,                   // Estimated calorie burn
    val aerobicTrainingEffect: Float?,    // 0-5 scale
    val anaerobicTrainingEffect: Float?,  // 0-5 scale
    val trainingEffectLabel: String?,     // "Recovery"|"Base"|"Tempo"|etc
    val recoveryTimeMinutes: Int?,        // Minutes until recovery
    val vo2MaxEstimate: Float?,           // ml/kg/min
    
    // ── Runner Profile ───────────────────────────────────────────────────
    val runnerAge: Int?,
    val runnerHeight: Int?,               // cm
    val runnerWeight: Int?,               // kg
    val userFitnessLevel: String?,
    val coachName: String?,
    val coachTone: String?,
    val coachGender: String?,
    val coachAccent: String?,
    
    // ── Wellness (from Garmin) ───────────────────────────────────��──────
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

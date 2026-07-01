package live.airuncoach.airuncoach.network.model

import live.airuncoach.airuncoach.domain.model.AiCoachingNote
import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.domain.model.StrugglePoint
import live.airuncoach.airuncoach.domain.model.WeatherData
import com.google.gson.annotations.SerializedName

data class UploadRunRequest(
    val routeId: String?,
    val startTime: Long,
    val distance: Double,
    val duration: Long,
    val avgPace: String,
    val avgHeartRate: Int?,
    val maxHeartRate: Int?,
    val minHeartRate: Int?,
    val calories: Int,
    val cadence: Int?,
    val maxCadence: Int?,
    val elevation: Double,
    val difficulty: String,
    val startLat: Double,
    val startLng: Double,
    val gpsTrack: List<LocationPoint>,
    val completedAt: Long,
    val elevationGain: Double,
    val elevationLoss: Double,
    val tss: Int,
    val gap: String?,
    val isPublic: Boolean,
    val strugglePoints: List<StrugglePoint>,
    val kmSplits: List<KmSplit>,
    val terrainType: String,
    val userComments: String?,
    val targetDistance: Double?,
    val targetTime: Long?,
    val wasTargetAchieved: Boolean?,
    val aiCoachingNotes: List<AiCoachingNote>? = null,
    // Extended elevation metrics
    val maxInclinePercent: Float? = null,
    val maxDeclinePercent: Float? = null,
    val minElevation: Double? = null,
    val maxElevation: Double? = null,
    // Additional metrics
    val totalSteps: Int? = null,
    val activeCalories: Int? = null,
    val avgSpeed: Float? = null,
    val maxSpeed: Float? = null,      // peak speed (m/s) — from RunSession.maxSpeed
    val movingTime: Long? = null,
    val elapsedTime: Long? = null,
    val avgStrideLength: Float? = null,
    // Weather conditions at start of run (for weather impact analysis)
    @SerializedName("weatherData")
    val weatherData: WeatherData? = null,
    // Training plan coaching context (if this run is part of a coached programme)
    val linkedWorkoutId: String? = null,
    val linkedPlanId: String? = null,
    val planProgressWeek: Int? = null,
    val planProgressWeeks: Int? = null,
    val workoutType: String? = null,
    val workoutIntensity: String? = null,
    val workoutDescription: String? = null,
    // Group run context (if this run is part of a group run)
    val groupRunId: String? = null,
    // Garmin device info — set to true if run was completed on Garmin companion watch
    val hasGarminData: Boolean = false,
    val garminDeviceName: String? = null,
    // ── Running Dynamics (averaged over the run) ──────────────────────────────
    val avgGroundContactTime: Float? = null,
    val minGroundContactTime: Float? = null,
    val maxGroundContactTime: Float? = null,
    val avgGroundContactBalance: Float? = null,
    val avgVerticalOscillation: Float? = null,
    val maxVerticalOscillation: Float? = null,
    val avgVerticalRatio: Float? = null,
    val minStrideLength: Float? = null,
    val maxStrideLength: Float? = null,
    // ── Training Effect & Recovery ────────────────────────────────────────────
    val aerobicTrainingEffect: Float? = null,
    val anaerobicTrainingEffect: Float? = null,
    val trainingEffectLabel: String? = null,
    val recoveryTimeMinutes: Int? = null,
    val vo2MaxEstimate: Float? = null,
    // ── Power & Respiration (device-dependent, null if unsupported) ───────────
    val avgRunningPower: Int? = null,
    val maxRunningPower: Int? = null,
    val avgRespirationRate: Float? = null,
    // ── Environmental ─────────────────────────────────────────────────────────
    val avgAmbientPressure: Float? = null,
    val avgBearing: Float? = null,
    // ── Time-series data for graphs ─────────���─────────────────────────────────
    val heartRateData: List<Int>? = null,         // bpm samples (one per ~2s watch frame)
    val cadenceData: List<Int>? = null,           // spm samples
    val altitudeData: List<Float>? = null,        // metres (barometric preferred, GPS fallback)
    val groundContactTimeData: List<Float>? = null,
    val groundContactBalanceData: List<Float>? = null,
    val verticalOscillationData: List<Float>? = null,
    val verticalRatioData: List<Float>? = null,
    val strideLengthData: List<Float>? = null,
    val runningPowerData: List<Int>? = null,      // watts
    val respirationRateData: List<Float>? = null, // br/min
    val bearingData: List<Float>? = null
)

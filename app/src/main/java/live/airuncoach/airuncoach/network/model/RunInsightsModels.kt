package live.airuncoach.airuncoach.network.model

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

/**
 * Basic AI insights (fallback).
 * All fields nullable to guard against Gson ignoring Kotlin default values on null JSON.
 */
data class BasicRunInsights(
    @SerializedName("highlights") val highlights: List<String>? = null,
    @SerializedName("struggles") val struggles: List<String>? = null,
    @SerializedName("tips") val tips: List<String>? = null,
    @SerializedName("overallScore") val overallScore: Int = 0,
    @SerializedName("summary") val summary: String? = null
)

/**
 * Comprehensive AI analysis (primary).
 *
 * NOTE: All String fields are nullable (String?) even where the API contract says they
 * should always be present. Gson ignores Kotlin default values during deserialization —
 * if the backend returns null or omits a field (e.g. older saved runs before a field was
 * added), Gson will set it to null regardless of any `= ""` default. Making fields
 * nullable lets the UI safely handle missing data with `.isNullOrBlank()` / `.orEmpty()`.
 */
data class ComprehensiveRunAnalysis(
    @SerializedName("summary") val summary: String? = null,
    @SerializedName("performanceScore") val performanceScore: Int = 0,
    @SerializedName("highlights") val highlights: List<String>? = null,
    @SerializedName("struggles") val struggles: List<String>? = null,
    @SerializedName("personalBests") val personalBests: List<String>? = null,
    @SerializedName("improvementTips") val improvementTips: List<String>? = null,
    @SerializedName("trainingLoadAssessment") val trainingLoadAssessment: String? = null,
    @SerializedName("recoveryAdvice") val recoveryAdvice: String? = null,
    @SerializedName("nextRunSuggestion") val nextRunSuggestion: String? = null,
    @SerializedName("wellnessImpact") val wellnessImpact: String? = null,
    @SerializedName("technicalAnalysis") val technicalAnalysis: TechnicalAnalysis? = null,
    @SerializedName("garminInsights") val garminInsights: GarminInsights? = null
)

data class TechnicalAnalysis(
    @SerializedName("paceAnalysis") val paceAnalysis: String? = null,
    @SerializedName("heartRateAnalysis") val heartRateAnalysis: String? = null,
    @SerializedName("cadenceAnalysis") val cadenceAnalysis: String? = null,
    @SerializedName("runningDynamics") val runningDynamics: String? = null,
    @SerializedName("elevationPerformance") val elevationPerformance: String? = null
)

data class GarminInsights(
    @SerializedName("trainingEffect") val trainingEffect: String? = null,
    @SerializedName("vo2MaxTrend") val vo2MaxTrend: String? = null,
    @SerializedName("recoveryTime") val recoveryTime: String? = null
)

/**
 * Response from comprehensive analysis endpoint.
 */
data class ComprehensiveAnalysisResponse(
    @SerializedName("success") val success: Boolean = true,
    @SerializedName("analysis") val analysis: ComprehensiveRunAnalysis
)

/**
 * Run analysis record saved in DB.
 */
data class RunAnalysisRecord(
    @SerializedName("id") val id: String,
    @SerializedName("runId") val runId: String,
    @SerializedName("analysis") val analysis: JsonElement?
)

data class SaveRunAnalysisRequest(
    @SerializedName("analysis") val analysis: JsonElement
)

/**
 * Freeform AI analysis — the AI writes a bespoke, unique analysis
 * in markdown format rather than filling structured JSON fields.
 * Every run gets a completely different analysis based on what's interesting.
 */
data class FreeformAnalysisRequest(
    // Run Data
    @SerializedName("runId") val runId: String,
    @SerializedName("distance") val distance: Double, // meters
    @SerializedName("duration") val duration: Long, // milliseconds
    @SerializedName("averagePace") val averagePace: String?,
    @SerializedName("averageHeartRate") val averageHeartRate: Int?,
    @SerializedName("maxHeartRate") val maxHeartRate: Int?,
    @SerializedName("averageCadence") val averageCadence: Int?,
    @SerializedName("elevationGain") val elevationGain: Double,
    @SerializedName("elevationLoss") val elevationLoss: Double,
    @SerializedName("calories") val calories: Int,
    @SerializedName("terrainType") val terrainType: String?,
    @SerializedName("maxGradient") val maxGradient: Float?,
    @SerializedName("steepestIncline") val steepestIncline: Float?,
    @SerializedName("steepestDecline") val steepestDecline: Float?,

    // Splits & struggle points
    @SerializedName("kmSplits") val kmSplits: List<KmSplitData>,
    @SerializedName("strugglePoints") val strugglePoints: List<StrugglePointData>,

    // Weather (raw data from the run)
    @SerializedName("weatherAtStart") val weatherAtStart: WeatherConditions?,
    @SerializedName("weatherAtEnd") val weatherAtEnd: WeatherConditions?,

    // Weather Performance Index (calculated impact on this run)
    @SerializedName("weatherPerformancePercent") val weatherPerformancePercent: Double?,
    @SerializedName("weatherImpactFactors") val weatherImpactFactors: List<WeatherImpactFactor>?,

    // User's historical weather performance trends (how they perform across conditions)
    @SerializedName("userWeatherInsights") val userWeatherInsights: UserWeatherInsights?,

    // User's own words
    @SerializedName("userPostRunComments") val userPostRunComments: String?,

    // Target (if user set a distance/time goal for this run)
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("targetTime") val targetTime: Long?,

    // User Profile (demographics)
    @SerializedName("userName") val userName: String?,
    @SerializedName("userAge") val userAge: Int?,
    @SerializedName("userGender") val userGender: String?,
    @SerializedName("userWeight") val userWeight: Double?,
    @SerializedName("userHeight") val userHeight: Double?,
    @SerializedName("userFitnessLevel") val userFitnessLevel: String?,

    // Active Goals (full detail)
    @SerializedName("activeGoals") val activeGoals: List<FreeformGoalData>,

    // Coach Settings
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("coachTone") val coachTone: String?,

    // Historical context (optional — last similar run)
    @SerializedName("lastSimilarRun") val lastSimilarRun: LastSimilarRunData?,

    // Garmin connected
    @SerializedName("isGarminConnected") val isGarminConnected: Boolean = false,

    // AI coaching notes from during the run (if any)
    @SerializedName("aiCoachingNotes") val aiCoachingNotes: String?
)

data class FreeformGoalData(
    @SerializedName("type") val type: String,
    @SerializedName("title") val title: String,
    @SerializedName("description") val description: String?,
    @SerializedName("notes") val notes: String?,
    @SerializedName("targetDate") val targetDate: String?,
    @SerializedName("eventName") val eventName: String?,
    @SerializedName("distanceTarget") val distanceTarget: String?,
    @SerializedName("timeTargetSeconds") val timeTargetSeconds: Int?,
    @SerializedName("currentProgress") val currentProgress: Float?,
    @SerializedName("isActive") val isActive: Boolean
)

data class LastSimilarRunData(
    @SerializedName("date") val date: String,
    @SerializedName("distance") val distance: Double,
    @SerializedName("duration") val duration: Long,
    @SerializedName("averagePace") val averagePace: String?
)

/**
 * Individual weather factor and its impact on performance for this run.
 */
data class WeatherImpactFactor(
    @SerializedName("factor") val factor: String, // "Temperature", "Humidity", "Wind"
    @SerializedName("value") val value: String, // "28°C (Hot)", "85%", "15 km/h"
    @SerializedName("impact") val impact: String, // "positive", "neutral", "negative"
    @SerializedName("penaltyPercent") val penaltyPercent: Double // 0.0 = no impact, higher = worse
)

/**
 * User's historical weather performance trends — helps the AI understand
 * how THIS runner typically performs in different conditions.
 */
data class UserWeatherInsights(
    @SerializedName("runsAnalyzed") val runsAnalyzed: Int,
    @SerializedName("optimalTempRange") val optimalTempRange: String?, // e.g. "10-15°C"
    @SerializedName("bestCondition") val bestCondition: String?, // e.g. "Clear"
    @SerializedName("worstCondition") val worstCondition: String?, // e.g. "Rain"
    @SerializedName("heatSensitivity") val heatSensitivity: String?, // "low", "moderate", "high"
    @SerializedName("overallAvgPace") val overallAvgPace: Int?, // seconds per km
    @SerializedName("summary") val summary: String? // Brief text from the weather impact API
)

/**
 * Response: just the AI's freeform markdown analysis.
 * No rigid structure — the AI writes what's most relevant.
 */
data class FreeformAnalysisResponse(
    @SerializedName("analysis") val analysis: String, // Markdown text
    @SerializedName("title") val title: String? = null // Optional short title/headline
)

/**
 * Request: update a struggle point's user comment.
 */
data class UpdateStrugglePointCommentRequest(
    @SerializedName("userComment") val userComment: String
)
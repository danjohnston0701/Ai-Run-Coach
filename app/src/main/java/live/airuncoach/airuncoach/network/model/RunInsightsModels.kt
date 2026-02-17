package live.airuncoach.airuncoach.network.model

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

/**
 * Basic AI insights (fallback).
 */
data class BasicRunInsights(
    @SerializedName("highlights") val highlights: List<String> = emptyList(),
    @SerializedName("struggles") val struggles: List<String> = emptyList(),
    @SerializedName("tips") val tips: List<String> = emptyList(),
    @SerializedName("overallScore") val overallScore: Int = 0,
    @SerializedName("summary") val summary: String = ""
)

/**
 * Comprehensive AI analysis (primary).
 */
data class ComprehensiveRunAnalysis(
    @SerializedName("summary") val summary: String,
    @SerializedName("performanceScore") val performanceScore: Int,
    @SerializedName("highlights") val highlights: List<String> = emptyList(),
    @SerializedName("struggles") val struggles: List<String> = emptyList(),
    @SerializedName("personalBests") val personalBests: List<String> = emptyList(),
    @SerializedName("improvementTips") val improvementTips: List<String> = emptyList(),
    @SerializedName("trainingLoadAssessment") val trainingLoadAssessment: String = "",
    @SerializedName("recoveryAdvice") val recoveryAdvice: String = "",
    @SerializedName("nextRunSuggestion") val nextRunSuggestion: String = "",
    @SerializedName("wellnessImpact") val wellnessImpact: String = "",
    @SerializedName("technicalAnalysis") val technicalAnalysis: TechnicalAnalysis,
    @SerializedName("garminInsights") val garminInsights: GarminInsights? = null
)

data class TechnicalAnalysis(
    @SerializedName("paceAnalysis") val paceAnalysis: String = "",
    @SerializedName("heartRateAnalysis") val heartRateAnalysis: String = "",
    @SerializedName("cadenceAnalysis") val cadenceAnalysis: String = "",
    @SerializedName("runningDynamics") val runningDynamics: String = "",
    @SerializedName("elevationPerformance") val elevationPerformance: String = ""
)

data class GarminInsights(
    @SerializedName("trainingEffect") val trainingEffect: String = "",
    @SerializedName("vo2MaxTrend") val vo2MaxTrend: String = "",
    @SerializedName("recoveryTime") val recoveryTime: String = ""
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
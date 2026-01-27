package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Comprehensive request body for post-run AI analysis
 * Includes all context needed for market-leading insights
 */
data class RunAnalysisRequest(
    // Current Run Data
    @SerializedName("runId") val runId: String,
    @SerializedName("distance") val distance: Double,
    @SerializedName("duration") val duration: Long,
    @SerializedName("averagePace") val averagePace: String,
    @SerializedName("averageHeartRate") val averageHeartRate: Int?,
    @SerializedName("maxHeartRate") val maxHeartRate: Int?,
    @SerializedName("averageCadence") val averageCadence: Int?,
    @SerializedName("elevationGain") val elevationGain: Double,
    @SerializedName("elevationLoss") val elevationLoss: Double,
    @SerializedName("terrainType") val terrainType: String,
    @SerializedName("maxGradient") val maxGradient: Float?,
    @SerializedName("calories") val calories: Int,
    
    // Weather Data
    @SerializedName("weatherAtStart") val weatherAtStart: WeatherConditions?,
    @SerializedName("weatherAtEnd") val weatherAtEnd: WeatherConditions?,
    
    // Performance Metrics
    @SerializedName("kmSplits") val kmSplits: List<KmSplitData>,
    @SerializedName("relevantStrugglePoints") val relevantStrugglePoints: List<StrugglePointData>,
    
    // User Context
    @SerializedName("userPostRunComments") val userPostRunComments: String?,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("targetTime") val targetTime: Long?,
    @SerializedName("wasTargetAchieved") val wasTargetAchieved: Boolean?,
    
    // User Profile for Demographic Comparison
    @SerializedName("userProfile") val userProfile: UserProfileData,
    
    // Active Goals
    @SerializedName("activeGoals") val activeGoals: List<GoalData>,
    
    // Historical Context - Similar Routes
    @SerializedName("previousRunsOnSimilarRoute") val previousRunsOnSimilarRoute: List<HistoricalRunData>,
    
    // Coach Settings
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?
)

data class KmSplitData(
    @SerializedName("km") val km: Int,
    @SerializedName("time") val time: Long,
    @SerializedName("pace") val pace: String
)

data class StrugglePointData(
    @SerializedName("timestamp") val timestamp: Long,
    @SerializedName("distanceMeters") val distanceMeters: Double,
    @SerializedName("paceDropPercent") val paceDropPercent: Double,
    @SerializedName("currentGrade") val currentGrade: Double?,
    @SerializedName("heartRate") val heartRate: Int?,
    @SerializedName("userComment") val userComment: String?
)

/**
 * Weather conditions data
 */
data class WeatherConditions(
    @SerializedName("temperature") val temperature: Double,
    @SerializedName("feelsLike") val feelsLike: Double,
    @SerializedName("humidity") val humidity: Int,
    @SerializedName("windSpeed") val windSpeed: Double,
    @SerializedName("windDirection") val windDirection: Int?,
    @SerializedName("condition") val condition: String,
    @SerializedName("uvIndex") val uvIndex: Int?
)

/**
 * User profile data for demographic comparison
 */
data class UserProfileData(
    @SerializedName("age") val age: Int?,
    @SerializedName("gender") val gender: String?,
    @SerializedName("fitnessLevel") val fitnessLevel: String?,
    @SerializedName("weight") val weight: Double?,
    @SerializedName("height") val height: Double?,
    @SerializedName("experienceLevel") val experienceLevel: String?, // beginner, intermediate, advanced, elite
    @SerializedName("weeklyMileage") val weeklyMileage: Double?
)

/**
 * Active goal data
 */
data class GoalData(
    @SerializedName("type") val type: String, // distance, time, pace, weight, frequency
    @SerializedName("target") val target: String,
    @SerializedName("current") val current: String?,
    @SerializedName("deadline") val deadline: String?,
    @SerializedName("progress") val progress: Float? // 0.0 to 1.0
)

/**
 * Historical run data for comparison
 */
data class HistoricalRunData(
    @SerializedName("date") val date: String,
    @SerializedName("distance") val distance: Double,
    @SerializedName("duration") val duration: Long,
    @SerializedName("averagePace") val averagePace: String,
    @SerializedName("elevationGain") val elevationGain: Double,
    @SerializedName("weatherTemperature") val weatherTemperature: Double?,
    @SerializedName("weatherCondition") val weatherCondition: String?,
    @SerializedName("routeSimilarity") val routeSimilarity: Float // 0.0 to 1.0
)

/**
 * Comprehensive AI analysis response
 */
data class RunAnalysisResponse(
    // Executive Summary
    @SerializedName("executiveSummary") val executiveSummary: String,
    
    // Performance Analysis
    @SerializedName("strengths") val strengths: List<String>,
    @SerializedName("areasForImprovement") val areasForImprovement: List<String>,
    
    // Scores & Metrics
    @SerializedName("overallPerformanceScore") val overallPerformanceScore: Float, // 0-10
    @SerializedName("paceConsistencyScore") val paceConsistencyScore: Float, // 0-10
    @SerializedName("effortScore") val effortScore: Float, // 0-10
    @SerializedName("mentalToughnessScore") val mentalToughnessScore: Float?, // 0-10
    
    // Comparisons
    @SerializedName("comparisonToPreviousRuns") val comparisonToPreviousRuns: String?,
    @SerializedName("demographicComparison") val demographicComparison: DemographicComparison?,
    @SerializedName("personalBestAnalysis") val personalBestAnalysis: String?,
    
    // Training Insights
    @SerializedName("trainingRecommendations") val trainingRecommendations: List<TrainingRecommendation>,
    @SerializedName("recoveryAdvice") val recoveryAdvice: String,
    @SerializedName("nextRunSuggestion") val nextRunSuggestion: String,
    
    // Goals Progress
    @SerializedName("goalsProgress") val goalsProgress: List<GoalProgress>,
    @SerializedName("targetAchievementAnalysis") val targetAchievementAnalysis: String?,
    
    // Environmental Analysis
    @SerializedName("weatherImpactAnalysis") val weatherImpactAnalysis: WeatherImpactAnalysis?,
    @SerializedName("terrainAnalysis") val terrainAnalysis: String,
    
    // Struggle Points Insights
    @SerializedName("strugglePointsInsight") val strugglePointsInsight: String?,
    
    // Motivational Closing
    @SerializedName("coachMotivationalMessage") val coachMotivationalMessage: String
)

/**
 * Demographic comparison data
 */
data class DemographicComparison(
    @SerializedName("percentile") val percentile: Int, // Where user ranks (0-100)
    @SerializedName("averagePaceForDemographic") val averagePaceForDemographic: String,
    @SerializedName("comparisonText") val comparisonText: String
)

/**
 * Training recommendation with priority
 */
data class TrainingRecommendation(
    @SerializedName("category") val category: String, // endurance, speed, strength, technique
    @SerializedName("recommendation") val recommendation: String,
    @SerializedName("priority") val priority: String, // high, medium, low
    @SerializedName("specificWorkout") val specificWorkout: String?
)

/**
 * Goal progress update
 */
data class GoalProgress(
    @SerializedName("goalType") val goalType: String,
    @SerializedName("progressUpdate") val progressUpdate: String,
    @SerializedName("onTrack") val onTrack: Boolean,
    @SerializedName("adjustmentNeeded") val adjustmentNeeded: String?
)

/**
 * Detailed weather impact analysis
 */
data class WeatherImpactAnalysis(
    @SerializedName("overallImpact") val overallImpact: String, // positive, neutral, negative
    @SerializedName("impactScore") val impactScore: Float, // -5 to +5 (negative = harder conditions)
    @SerializedName("temperatureImpact") val temperatureImpact: String,
    @SerializedName("windImpact") val windImpact: String?,
    @SerializedName("humidityImpact") val humidityImpact: String?,
    @SerializedName("adjustedPerformanceScore") val adjustedPerformanceScore: Float?, // Performance adjusted for weather
    @SerializedName("detailedAnalysis") val detailedAnalysis: String
)

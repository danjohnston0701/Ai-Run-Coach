package live.airuncoach.airuncoach.shared

import kotlinx.serialization.Serializable

/* ------------------------------------------------------------ */
/* API Request Models */
/* ------------------------------------------------------------ */

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val name: String
)

@Serializable
data class SaveRunRequest(
    val userId: String,
    val distance: Double,
    val duration: Long,
    val avgPace: String? = null,
    val avgHeartRate: Int? = null,
    val maxHeartRate: Int? = null,
    val calories: Int? = null,
    val cadence: Int? = null,
    val elevation: Double? = null,
    val difficulty: String? = null,
    val startLat: Double? = null,
    val startLng: Double? = null,
    val gpsTrack: List<LocationPoint>? = null,
    val heartRateData: List<Int>? = null,
    val paceData: List<Double>? = null,
    val aiInsights: String? = null,
    val aiCoachingNotes: List<AiCoachingNote>? = null,
    val weatherData: WeatherData? = null,
    val routeId: String? = null,
    val name: String? = null,
    val aiCoachEnabled: Boolean = true,
    val runDate: String? = null,
    val runTime: String? = null,
    val elevationGain: Double? = null,
    val elevationLoss: Double? = null,
    val targetDistance: Double? = null,
    val targetTime: Long? = null,
    val wasTargetAchieved: Boolean? = null,
    val userComments: String? = null
)

@Serializable
data class GenerateRouteRequest(
    val userId: String,
    val startLat: Double,
    val startLng: Double,
    val distanceKm: Double,
    val difficulty: RouteDifficulty = RouteDifficulty.MODERATE,
    val terrainType: String? = null,
    val returnToStart: Boolean = true
)

@Serializable
data class GetAiInsightsRequest(
    val runSession: RunSession,
    val userId: String,
    val strugglePoints: List<StrugglePoint> = emptyList()
)

@Serializable
data class UpdateUserRequest(
    val name: String? = null,
    val dob: String? = null,
    val gender: String? = null,
    val height: String? = null,
    val weight: String? = null,
    val fitnessLevel: String? = null,
    val desiredFitnessLevel: String? = null,
    val coachName: String? = null,
    val coachGender: String? = null,
    val coachAccent: String? = null,
    val coachTone: String? = null
)

/* ------------------------------------------------------------ */
/* API Response Models */
/* ------------------------------------------------------------ */

@Serializable
data class AuthResponse(
    val token: String,
    val user: User
)

@Serializable
data class RunResponse(
    val id: String,
    val userId: String,
    val routeId: String? = null,
    val distance: Double,
    val duration: Long,
    val avgPace: String? = null,
    val avgHeartRate: Int? = null,
    val maxHeartRate: Int? = null,
    val calories: Int? = null,
    val cadence: Int? = null,
    val elevation: Double? = null,
    val difficulty: String? = null,
    val startLat: Double? = null,
    val startLng: Double? = null,
    val gpsTrack: List<LocationPoint>? = null,
    val heartRateData: List<Int>? = null,
    val paceData: List<Double>? = null,
    val aiInsights: String? = null,
    val aiCoachingNotes: List<AiCoachingNote>? = null,
    val completedAt: Long = 0L,
    val weatherData: WeatherData? = null,
    val name: String? = null,
    val strugglePoints: List<StrugglePoint> = emptyList(),
    val targetDistance: Double? = null,
    val targetTime: Long? = null,
    val wasTargetAchieved: Boolean? = null,
    val userComments: String? = null,
    val elevationGain: Double? = null,
    val elevationLoss: Double? = null
)

@Serializable
data class RouteResponse(
    val id: String,
    val name: String? = null,
    val distance: Double,
    val difficulty: String,
    val startLat: Double,
    val startLng: Double,
    val endLat: Double? = null,
    val endLng: Double? = null,
    val waypoints: List<RouteWaypoint> = emptyList(),
    val elevation: Double? = null,
    val estimatedTime: Int? = null,
    val terrainType: String? = null,
    val polyline: String? = null,
    val elevationGain: Double? = null,
    val elevationLoss: Double? = null,
    val elevationProfile: List<ElevationPoint> = emptyList(),
    val startLocationLabel: String? = null,
    val maxInclinePercent: Double? = null,
    val maxDeclinePercent: Double? = null,
    val turnInstructions: List<TurnInstruction> = emptyList()
)

@Serializable
data class AiInsightsResponse(
    val insights: String,
    val coachingNotes: List<AiCoachingNote> = emptyList(),
    val performanceSummary: PerformanceSummary? = null
)

@Serializable
data class PerformanceSummary(
    val overallScore: Int, // 0-100
    val paceConsistency: String,
    val heartRateZone: String,
    val elevationHandling: String,
    val strengths: List<String>,
    val improvements: List<String>
)

/* ------------------------------------------------------------ */
/* Paginated Responses */
/* ------------------------------------------------------------ */

@Serializable
data class PaginatedRunsResponse(
    val runs: List<RunResponse>,
    val total: Int,
    val page: Int,
    val pageSize: Int
)

@Serializable
data class PaginatedRoutesResponse(
    val routes: List<RouteResponse>,
    val total: Int,
    val page: Int,
    val pageSize: Int
)

/* ------------------------------------------------------------ */
/* Error Response */
/* ------------------------------------------------------------ */

@Serializable
data class ApiError(
    val message: String,
    val code: String? = null
)

/* ------------------------------------------------------------ */
/* Utility Functions */
/* ------------------------------------------------------------ */

fun RunResponse.toRunSession(): RunSession {
    return RunSession(
        id = id,
        startTime = completedAt - duration,
        endTime = completedAt,
        duration = duration,
        distance = distance,
        averagePace = avgPace,
        calories = calories ?: 0,
        cadence = cadence ?: 0,
        heartRate = avgHeartRate ?: 0,
        routePoints = gpsTrack ?: emptyList(),
        difficulty = difficulty,
        weatherAtStart = weatherData,
        strugglePoints = strugglePoints,
        userComments = userComments,
        heartRateData = heartRateData,
        paceData = paceData,
        aiCoachingNotes = aiCoachingNotes ?: emptyList(),
        targetDistance = targetDistance,
        targetTime = targetTime,
        wasTargetAchieved = wasTargetAchieved,
        totalElevationGain = elevationGain ?: 0.0,
        totalElevationLoss = elevationLoss ?: 0.0
    )
}
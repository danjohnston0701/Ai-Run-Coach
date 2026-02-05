package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.*
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

sealed class RunSummaryUiState {
    object Loading : RunSummaryUiState()
    data class Success(val analysis: RunAnalysisResponse) : RunSummaryUiState()
    data class Error(val message: String) : RunSummaryUiState()
}

@HiltViewModel
class RunSummaryViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService
) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    private val _runSession = MutableStateFlow<RunSession?>(null)
    val runSession: StateFlow<RunSession?> = _runSession.asStateFlow()

    private val _strugglePoints = MutableStateFlow<List<StrugglePoint>>(emptyList())
    val strugglePoints: StateFlow<List<StrugglePoint>> = _strugglePoints.asStateFlow()
    
    private val _userPostRunComments = MutableStateFlow("")
    val userPostRunComments: StateFlow<String> = _userPostRunComments.asStateFlow()

    private val _analysisState = MutableStateFlow<RunSummaryUiState>(RunSummaryUiState.Loading)
    val analysisState: StateFlow<RunSummaryUiState> = _analysisState.asStateFlow()
    
    private val _isLoadingRun = MutableStateFlow(false)
    val isLoadingRun: StateFlow<Boolean> = _isLoadingRun.asStateFlow()
    
    private val _loadError = MutableStateFlow<String?>(null)
    val loadError: StateFlow<String?> = _loadError.asStateFlow()
    
    // Target info from run setup
    private var targetDistance: Double? = null
    private var targetTime: Long? = null

    /**
     * Load run by ID from backend API
     */
    fun loadRunById(runId: String) {
        viewModelScope.launch {
            _isLoadingRun.value = true
            _loadError.value = null
            
            try {
                val session = apiService.getRunById(runId)
                _runSession.value = session
                
                // Initialize struggle points (empty for now - can be enhanced later)
                _strugglePoints.value = emptyList()
                
                _isLoadingRun.value = false
            } catch (e: Exception) {
                val errorMsg = if (e.message?.contains("401") == true || e.message?.contains("Unauthorized") == true) {
                    "Session expired. Please log in again."
                } else {
                    e.message ?: "Failed to load run data"
                }
                _loadError.value = errorMsg
                _isLoadingRun.value = false
                android.util.Log.e("RunSummaryViewModel", "Error loading run: $errorMsg", e)
            }
        }
    }
    
    /**
     * Initialize the summary with run data and detected struggle points
     * (Used when coming directly from RunTrackingService)
     */
    fun initializeRunSummary(
        runSession: RunSession,
        strugglePoints: List<StrugglePoint>,
        targetDistance: Double? = null,
        targetTime: Long? = null
    ) {
        _runSession.value = runSession
        _strugglePoints.value = strugglePoints
        this.targetDistance = targetDistance
        this.targetTime = targetTime
        
        // Don't auto-generate - wait for user to add comments if they want
        // They can manually trigger generation
    }
    
    /**
     * Update user's post-run comments
     */
    fun updatePostRunComments(comments: String) {
        _userPostRunComments.value = comments
    }

    /**
     * Update a struggle point with user comment
     */
    fun updateStrugglePointComment(strugglePointId: String, comment: String) {
        _strugglePoints.value = _strugglePoints.value.map { point ->
            if (point.id == strugglePointId) {
                point.copy(userComment = comment)
            } else {
                point
            }
        }
    }

    /**
     * Mark a struggle point as irrelevant with a reason
     */
    fun dismissStrugglePoint(strugglePointId: String, reason: DismissReason) {
        _strugglePoints.value = _strugglePoints.value.map { point ->
            if (point.id == strugglePointId) {
                point.copy(
                    isRelevant = false,
                    dismissReason = reason
                )
            } else {
                point
            }
        }
        
        // Regenerate analysis after dismissing a point
        generateAIAnalysis()
    }

    /**
     * Restore a previously dismissed struggle point
     */
    fun restoreStrugglePoint(strugglePointId: String) {
        _strugglePoints.value = _strugglePoints.value.map { point ->
            if (point.id == strugglePointId) {
                point.copy(
                    isRelevant = true,
                    dismissReason = null
                )
            } else {
                point
            }
        }
        
        // Regenerate analysis after restoring a point
        generateAIAnalysis()
    }

    /**
     * Generate comprehensive AI analysis with all context
     */
    fun generateAIAnalysis() {
        val session = _runSession.value ?: return
        
        viewModelScope.launch {
            _analysisState.value = RunSummaryUiState.Loading
            try {
                // Get user profile
                val user = getUserFromPrefs()
                
                // Get active goals
                val activeGoals = try {
                    apiService.getGoals(user?.id ?: "")
                        .filter { it.isActive }
                        .map { goal ->
                            // Determine target based on goal type
                            val target = when (goal.type) {
                                "EVENT" -> goal.eventName ?: "Unknown Event"
                                "DISTANCE_TIME" -> goal.distanceTarget ?: "Unknown Distance"
                                "HEALTH_WELLBEING" -> goal.healthTarget ?: "Health Goal"
                                "CONSISTENCY" -> "${goal.weeklyRunTarget ?: 0} runs/week"
                                else -> goal.title
                            }
                            
                            GoalData(
                                type = goal.type,
                                target = target,
                                current = goal.currentProgress.toString(),
                                deadline = goal.targetDate,
                                progress = goal.currentProgress
                            )
                        }
                } catch (e: Exception) {
                    emptyList()
                }
                
                // Get historical runs on similar route
                val historicalRuns = getHistoricalSimilarRuns(session)
                
                // Filter out dismissed struggle points
                val relevantStrugglePoints = _strugglePoints.value
                    .filter { it.isRelevant }
                    .map { point ->
                        StrugglePointData(
                            timestamp = point.timestamp,
                            distanceMeters = point.distanceMeters,
                            paceDropPercent = point.paceDropPercent,
                            currentGrade = point.currentGrade,
                            heartRate = point.heartRate,
                            userComment = point.userComment
                        )
                    }

                // Build comprehensive request
                val request = RunAnalysisRequest(
                    // Current run data
                    runId = session.id,
                    distance = session.distance,
                    duration = session.duration,
                    averagePace = session.averagePace,
                    averageHeartRate = if (session.heartRate > 0) session.heartRate else null,
                    maxHeartRate = null, // TODO: Track max HR during run
                    averageCadence = if (session.cadence > 0) session.cadence else null,
                    elevationGain = session.totalElevationGain,
                    elevationLoss = session.totalElevationLoss,
                    terrainType = session.terrainType.name,
                    maxGradient = session.maxGradient,
                    calories = session.calories,
                    
                    // Weather data
                    weatherAtStart = session.weatherAtStart?.let { weather ->
                        WeatherConditions(
                            temperature = weather.temperature,
                            feelsLike = weather.feelsLike ?: weather.temperature,
                            humidity = weather.humidity.toInt(),
                            windSpeed = weather.windSpeed,
                            windDirection = weather.windDirection,
                            condition = weather.condition ?: weather.description,
                            uvIndex = weather.uvIndex
                        )
                    },
                    weatherAtEnd = session.weatherAtEnd?.let { weather ->
                        WeatherConditions(
                            temperature = weather.temperature,
                            feelsLike = weather.feelsLike ?: weather.temperature,
                            humidity = weather.humidity.toInt(),
                            windSpeed = weather.windSpeed,
                            windDirection = weather.windDirection,
                            condition = weather.condition ?: weather.description,
                            uvIndex = weather.uvIndex
                        )
                    },
                    
                    // Performance metrics
                    kmSplits = session.kmSplits.map { split ->
                        KmSplitData(
                            km = split.km,
                            time = split.time,
                            pace = split.pace
                        )
                    },
                    relevantStrugglePoints = relevantStrugglePoints,
                    
                    // User context
                    userPostRunComments = _userPostRunComments.value.ifBlank { null },
                    targetDistance = targetDistance,
                    targetTime = targetTime,
                    wasTargetAchieved = calculateTargetAchievement(session),
                    
                    // User profile for demographic comparison
                    userProfile = UserProfileData(
                        age = user?.age,
                        gender = user?.gender,
                        fitnessLevel = user?.fitnessLevel,
                        weight = user?.weight,
                        height = user?.height,
                        experienceLevel = determineExperienceLevel(user),
                        weeklyMileage = null // TODO: Calculate from recent runs
                    ),
                    
                    // Active goals
                    activeGoals = activeGoals,
                    
                    // Historical context
                    previousRunsOnSimilarRoute = historicalRuns,
                    
                    // Coach settings
                    coachName = user?.coachName,
                    coachTone = user?.coachTone
                )

                val analysis = apiService.getRunAnalysis(request)
                _analysisState.value = RunSummaryUiState.Success(analysis)

            } catch (e: Exception) {
                _analysisState.value = RunSummaryUiState.Error(
                    e.message ?: "Failed to generate run analysis"
                )
            }
        }
    }
    
    /**
     * Get user from SharedPreferences
     */
    private fun getUserFromPrefs(): User? {
        val userJson = sharedPrefs.getString("user", null)
        return if (userJson != null) {
            gson.fromJson(userJson, User::class.java)
        } else {
            null
        }
    }
    
    /**
     * Calculate if target was achieved
     */
    private fun calculateTargetAchievement(session: RunSession): Boolean? {
        val distanceAchieved = targetDistance?.let { session.distance >= it } ?: true
        val timeAchieved = targetTime?.let { session.duration <= it } ?: true
        
        return if (targetDistance != null || targetTime != null) {
            distanceAchieved && timeAchieved
        } else {
            null
        }
    }
    
    /**
     * Determine user's experience level from profile
     */
    private fun determineExperienceLevel(user: User?): String? {
        return user?.fitnessLevel?.let { level ->
            when (level.lowercase()) {
                "beginner" -> "beginner"
                "intermediate" -> "intermediate"
                "advanced" -> "advanced"
                else -> "intermediate"
            }
        }
    }
    
    /**
     * Get historical runs on similar routes for comparison
     * TODO: Implement actual historical data fetching from backend
     */
    private suspend fun getHistoricalSimilarRuns(currentRun: RunSession): List<HistoricalRunData> {
        // Placeholder - in production, fetch from backend
        // Filter runs by route similarity score > 0.7
        return emptyList()
    }

    /**
     * Get count of relevant vs dismissed struggle points
     */
    fun getStrugglePointStats(): Pair<Int, Int> {
        val relevant = _strugglePoints.value.count { it.isRelevant }
        val dismissed = _strugglePoints.value.count { !it.isRelevant }
        return Pair(relevant, dismissed)
    }
    
    /**
     * Delete this run
     */
    fun deleteRun(onSuccess: () -> Unit, onError: (String) -> Unit) {
        val session = _runSession.value ?: return
        
        viewModelScope.launch {
            try {
                apiService.deleteRun(session.id)
                onSuccess()
            } catch (e: Exception) {
                onError(e.message ?: "Failed to delete run")
            }
        }
    }
    
    /**
     * Generate share text for social media
     */
    fun getShareText(): String {
        val session = _runSession.value ?: return ""
        
        val distance = String.format("%.2f km", session.getDistanceInKm())
        val duration = session.getFormattedDuration()
        val pace = session.averagePace
        
        return """
            🏃‍♂️ Just finished an amazing run! 
            
            📊 Stats:
            📏 Distance: $distance
            ⏱️ Time: $duration
            ⚡ Avg Pace: $pace/km
            ${if (session.totalElevationGain > 0) "⛰️ Elevation: ${String.format("%.0fm", session.totalElevationGain)}\n" else ""}
            ${if (session.calories > 0) "🔥 Calories: ${session.calories}\n" else ""}
            
            #Running #Fitness #AIRunCoach
        """.trimIndent()
    }
}

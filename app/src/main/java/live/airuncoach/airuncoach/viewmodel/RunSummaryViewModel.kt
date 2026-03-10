package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.service.RunTrackingService
import live.airuncoach.airuncoach.network.model.*
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

sealed class AiAnalysisState {
    object Idle : AiAnalysisState()
    object Loading : AiAnalysisState()
    data class Freeform(val markdown: String, val title: String?) : AiAnalysisState()
    data class Comprehensive(val analysis: ComprehensiveRunAnalysis) : AiAnalysisState()
    data class Basic(val insights: BasicRunInsights) : AiAnalysisState()
    data class Error(val message: String) : AiAnalysisState()
}

@HiltViewModel
class RunSummaryViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService
) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val adminEmail = "danjohnston0701@gmail.com"

    private val _runSession = MutableStateFlow<RunSession?>(null)
    val runSession: StateFlow<RunSession?> = _runSession.asStateFlow()

    private var currentRunId: String? = null // Stored for API calls

    private val _strugglePoints = MutableStateFlow<List<StrugglePoint>>(emptyList())
    val strugglePoints: StateFlow<List<StrugglePoint>> = _strugglePoints.asStateFlow()
    
    private val _userPostRunComments = MutableStateFlow("")
    val userPostRunComments: StateFlow<String> = _userPostRunComments.asStateFlow()

    private val _analysisState = MutableStateFlow<AiAnalysisState>(AiAnalysisState.Idle)
    val analysisState: StateFlow<AiAnalysisState> = _analysisState.asStateFlow()
    
    private val _isLoadingRun = MutableStateFlow(false)
    val isLoadingRun: StateFlow<Boolean> = _isLoadingRun.asStateFlow()
    
    private val _loadError = MutableStateFlow<String?>(null)
    val loadError: StateFlow<String?> = _loadError.asStateFlow()

    private val _isGarminConnected = MutableStateFlow(false)
    val isGarminConnected: StateFlow<Boolean> = _isGarminConnected.asStateFlow()
    
    // Target info from run setup
    private var targetDistance: Double? = null
    private var targetTime: Long? = null

    init {
        checkGarminConnection()
    }

    private fun checkGarminConnection() {
        viewModelScope.launch {
            try {
                val devices = apiService.getConnectedDevices()
                _isGarminConnected.value = devices.any { it.deviceType == "garmin" && it.isActive == true }
            } catch (_: Exception) {
                _isGarminConnected.value = false
            }
        }
    }

    /**
     * Load run by ID from backend API.
     * Falls back to local run data from RunTrackingService if the backend fetch fails
     * (e.g. 404 after a failed upload, or NumberFormatException from date parsing).
     */
    fun loadRunById(runId: String) {
        currentRunId = runId // Store for API calls
        viewModelScope.launch {
            _isLoadingRun.value = true
            _loadError.value = null
            
            try {
                val session = apiService.getRunById(runId)
                _runSession.value = session
                
                // Initialize struggle points + comments from run payload (if available)
                _strugglePoints.value = session.strugglePoints.ifEmpty { inferStrugglePointsFromSplits(session) }
                _userPostRunComments.value = session.userComments.orEmpty()
                _analysisState.value = AiAnalysisState.Idle

                // Load any saved AI analysis for this run (if present)
                loadSavedAnalysis(runId)
                
                _isLoadingRun.value = false
            } catch (e: Exception) {
                Log.w("RunSummaryViewModel", "Backend fetch failed for run $runId, trying local data", e)
                
                // Fallback: try to use the local run data from RunTrackingService
                val localSession = RunTrackingService.currentRunSession?.value
                if (localSession != null && localSession.distance > 0) {
                    Log.d("RunSummaryViewModel", "Using local run data (distance: ${localSession.distance}m)")
                    _runSession.value = localSession
                    _strugglePoints.value = localSession.strugglePoints.ifEmpty { inferStrugglePointsFromSplits(localSession) }
                    _userPostRunComments.value = localSession.userComments.orEmpty()
                    _analysisState.value = AiAnalysisState.Idle
                    _isLoadingRun.value = false
                } else {
                    // No local data available either - show error
                    val errorMsg = when {
                        e.message?.contains("404") == true -> "Run not found. It may have been deleted or not saved properly."
                        e.message?.contains("401") == true || e.message?.contains("Unauthorized") == true -> "Session expired. Please log in again."
                        e.message?.contains("network") == true -> "Network error. Please check your connection."
                        else -> e.message ?: "Failed to load run data"
                    }
                    _loadError.value = errorMsg
                    _isLoadingRun.value = false
                    Log.e("RunSummaryViewModel", "Error loading run (no local fallback): $errorMsg", e)
                }
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
        _analysisState.value = AiAnalysisState.Idle
        
        // Don't auto-generate - wait for user to add comments if they want
        // They can manually trigger generation
    }
    
    /**
     * Update user's post-run comments
     */
    fun updatePostRunComments(comments: String) {
        _userPostRunComments.value = comments
    }

    fun isAdminUser(): Boolean {
        val userJson = sharedPrefs.getString("user", null) ?: return false
        return try {
            val user = gson.fromJson(userJson, User::class.java)
            user.email.equals(adminEmail, ignoreCase = true)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Persists the current struggle points list (with isRelevant + userComment state) to Neon.
     * Called immediately whenever any struggle point is changed so the DB is always in sync.
     */
    private fun persistStrugglePoints() {
        val runId = currentRunId ?: _runSession.value?.id ?: return
        val points = _strugglePoints.value
        viewModelScope.launch {
            try {
                apiService.updateRunProgress(
                    UpdateRunProgressRequest(
                        runId = runId,
                        userComments = _userPostRunComments.value.ifBlank { null },
                        strugglePoints = points
                    )
                )
            } catch (e: Exception) {
                Log.e("RunSummaryViewModel", "Failed to persist struggle points", e)
            }
        }
    }

    /**
     * Update a struggle point with a user comment and immediately save to Neon.
     */
    fun updateStrugglePointComment(strugglePointId: String, comment: String) {
        // Update local state immediately for responsiveness
        _strugglePoints.value = _strugglePoints.value.map { point ->
            if (point.id == strugglePointId) point.copy(userComment = comment) else point
        }
        // Persist the full updated list (captures isRelevant + all comments in one call)
        persistStrugglePoints()
    }

    /**
     * Mark a struggle point as dismissed with a reason and immediately save to Neon.
     */
    fun dismissStrugglePoint(strugglePointId: String, reason: DismissReason) {
        _strugglePoints.value = _strugglePoints.value.map { point ->
            if (point.id == strugglePointId) {
                point.copy(isRelevant = false, dismissReason = reason)
            } else {
                point
            }
        }
        persistStrugglePoints()
    }

    /**
     * Restore a previously dismissed struggle point and immediately save to Neon.
     */
    fun restoreStrugglePoint(strugglePointId: String) {
        _strugglePoints.value = _strugglePoints.value.map { point ->
            if (point.id == strugglePointId) {
                point.copy(isRelevant = true, dismissReason = null)
            } else {
                point
            }
        }
        persistStrugglePoints()
    }

    /**
     * Whether an AI analysis has already been generated for this run.
     * Used by UI to hide the generate button once analysis exists.
     */
    fun hasAnalysis(): Boolean {
        val state = _analysisState.value
        return state is AiAnalysisState.Freeform || state is AiAnalysisState.Comprehensive || state is AiAnalysisState.Basic
    }

    /**
     * Generate a freeform AI analysis — sends ALL run context to the backend
     * and gets back a unique, bespoke markdown analysis. No rigid structure.
     */
    fun generateAIAnalysis() {
        val session = _runSession.value ?: return

        // Don't re-generate if we already have a successful analysis
        // Allow retry if in Error or Idle state
        if (hasAnalysis()) return

        viewModelScope.launch {
            _analysisState.value = AiAnalysisState.Loading
            try {
                // Persist self-assessment and struggle points to the run record first
                val updateRequest = UpdateRunProgressRequest(
                    runId = session.id,
                    userComments = _userPostRunComments.value.ifBlank { null },
                    strugglePoints = _strugglePoints.value
                )
                try { apiService.updateRunProgress(updateRequest) } catch (_: Exception) {}

                // Use the comprehensive analysis endpoint (provides structured insights)
                try {
                    Log.d("RunSummaryViewModel", "Calling comprehensive analysis for run ${session.id}...")
                    val response = withTimeout(60_000L) {
                        apiService.getComprehensiveRunAnalysis(session.id)
                    }
                    Log.d("RunSummaryViewModel", "Comprehensive analysis received")
                    _analysisState.value = AiAnalysisState.Comprehensive(response.analysis)

                    // Save analysis for future loading
                    val saveJson = gson.toJsonTree(mapOf(
                        "comprehensive" to true,
                        "analysis" to response.analysis
                    ))
                    try { apiService.saveRunAnalysis(session.id, SaveRunAnalysisRequest(saveJson)) } catch (_: Exception) {}
                } catch (analysisError: Exception) {
                    Log.w("RunSummaryViewModel", "Comprehensive analysis failed: ${analysisError.message}", analysisError)
                    _analysisState.value = AiAnalysisState.Error(
                        "AI analysis unavailable. Tap to try again."
                    )
                }

            } catch (e: Exception) {
                Log.e("RunSummaryViewModel", "Analysis failed: ${e.message}", e)
                _analysisState.value = AiAnalysisState.Error(
                    e.message ?: "Failed to generate AI analysis. Tap to try again."
                )
            }
        }
    }

    /**
     * Force retry — resets state to Idle so generateAIAnalysis() can run again.
     */
    fun retryAIAnalysis() {
        _analysisState.value = AiAnalysisState.Idle
        generateAIAnalysis()
    }

    /**
     * Build the FreeformAnalysisRequest with every piece of context we have.
     */
    private suspend fun buildFreeformRequest(
        session: RunSession,
        user: User?,
        goals: List<Goal>
    ): FreeformAnalysisRequest {
        // Calculate weather performance index for this run
        val weatherResult = calculateWeatherPerformance(session.weatherAtStart)
        val userWeatherInsights = loadUserWeatherInsights(user)

        return FreeformAnalysisRequest(
            runId = session.id,
            distance = session.distance,
            duration = session.duration,
            averagePace = session.averagePace,
            averageHeartRate = session.heartRate.takeIf { it > 0 },
            maxHeartRate = session.heartRateData?.maxOrNull(),
            averageCadence = session.cadence.takeIf { it > 0 },
            elevationGain = session.totalElevationGain,
            elevationLoss = session.totalElevationLoss,
            calories = session.calories,
            terrainType = session.terrainType?.name ?: "UNKNOWN",
            maxGradient = session.maxGradient,
            steepestIncline = session.steepestIncline,
            steepestDecline = session.steepestDecline,

            kmSplits = session.kmSplits.map { split ->
                KmSplitData(km = split.km, time = split.time, pace = split.pace)
            },
            strugglePoints = _strugglePoints.value.filter { it.isRelevant }.map { sp ->
                StrugglePointData(
                    timestamp = sp.timestamp,
                    distanceMeters = sp.distanceMeters,
                    paceDropPercent = sp.paceDropPercent,
                    currentGrade = sp.currentGrade,
                    heartRate = sp.heartRate,
                    userComment = sp.userComment
                )
            },

            weatherAtStart = session.weatherAtStart?.let {
                WeatherConditions(
                    temperature = it.temperature,
                    feelsLike = it.feelsLike ?: it.temperature,
                    humidity = it.humidity.toInt(),
                    windSpeed = it.windSpeed,
                    windDirection = it.windDirection,
                    condition = it.condition ?: it.description,
                    uvIndex = it.uvIndex
                )
            },
            weatherAtEnd = session.weatherAtEnd?.let {
                WeatherConditions(
                    temperature = it.temperature,
                    feelsLike = it.feelsLike ?: it.temperature,
                    humidity = it.humidity.toInt(),
                    windSpeed = it.windSpeed,
                    windDirection = it.windDirection,
                    condition = it.condition ?: it.description,
                    uvIndex = it.uvIndex
                )
            },

            weatherPerformancePercent = weatherResult?.first,
            weatherImpactFactors = weatherResult?.second,
            userWeatherInsights = userWeatherInsights,

            userPostRunComments = _userPostRunComments.value.ifBlank { null },
            targetDistance = targetDistance,
            targetTime = targetTime,

            userName = user?.name,
            userAge = user?.age,
            userGender = user?.gender,
            userWeight = user?.weight,
            userHeight = user?.height,
            userFitnessLevel = user?.fitnessLevel,

            activeGoals = goals.filter { it.isActive }.map { goal ->
                FreeformGoalData(
                    type = goal.type,
                    title = goal.title,
                    description = goal.description,
                    notes = goal.notes,
                    targetDate = goal.targetDate,
                    eventName = goal.eventName,
                    distanceTarget = goal.distanceTarget,
                    timeTargetSeconds = goal.timeTargetSeconds,
                    currentProgress = goal.currentProgress,
                    isActive = goal.isActive
                )
            },

            coachName = user?.coachName,
            coachGender = user?.coachGender,
            coachAccent = user?.coachAccent,
            coachTone = user?.coachTone,

            lastSimilarRun = null, // TODO: fetch last similar run from backend
            isGarminConnected = _isGarminConnected.value,
            aiCoachingNotes = session.aiCoachingNotes.takeIf { it.isNotEmpty() }
                ?.joinToString("\n") { it.message }
        )
    }

    /**
     * Load active goals for the current user.
     */
    private suspend fun loadActiveGoals(user: User?): List<Goal> {
        return try {
            val userId = sharedPrefs.getString("userId", null) ?: user?.id ?: return emptyList()
            apiService.getGoals(userId).filter { it.isActive }
        } catch (e: Exception) {
            Log.w("RunSummaryViewModel", "Failed to load goals for analysis", e)
            emptyList()
        }
    }

    /**
     * Calculate weather performance index for this run.
     * Returns (performancePercent, list of factors) or null if no weather data.
     */
    private fun calculateWeatherPerformance(
        weather: WeatherData?
    ): Pair<Double, List<WeatherImpactFactor>>? {
        weather ?: return null
        val factors = mutableListOf<WeatherImpactFactor>()

        // Temperature impact
        val temp = weather.temperature
        val tempPenalty = when {
            temp < 5 -> kotlin.math.abs(temp - 12) * 0.3
            temp in 5.0..15.0 -> 0.0
            temp in 15.0..20.0 -> (temp - 15) * 0.5
            temp in 20.0..25.0 -> (temp - 15) * 0.8
            temp in 25.0..30.0 -> (temp - 15) * 1.2
            else -> (temp - 15) * 1.5
        }
        val tempLabel = when {
            temp < 5 -> "Cold"
            temp in 5.0..15.0 -> "Optimal"
            temp in 15.0..25.0 -> "Warm"
            else -> "Hot"
        }
        val tempImpact = when {
            tempPenalty <= 0.5 -> "positive"
            tempPenalty <= 3.0 -> "neutral"
            else -> "negative"
        }
        factors.add(WeatherImpactFactor("Temperature", "${temp.toInt()}°C ($tempLabel)", tempImpact, tempPenalty))

        // Humidity impact
        val humidity = weather.humidity
        val humidityPenalty = when {
            humidity < 40 -> 0.0
            humidity in 40.0..60.0 -> (humidity - 40) * 0.1
            humidity in 60.0..80.0 -> (humidity - 40) * 0.2
            else -> (humidity - 40) * 0.3
        }
        val humImpact = if (humidity > 70) "negative" else if (humidity > 50) "neutral" else "positive"
        factors.add(WeatherImpactFactor("Humidity", "${humidity.toInt()}%", humImpact, humidityPenalty))

        // Wind impact
        val wind = weather.windSpeed
        val windPenalty = when {
            wind < 10 -> 0.0
            wind in 10.0..20.0 -> (wind - 10) * 0.3
            else -> (wind - 10) * 0.5
        }
        val windImpact = if (wind > 20) "negative" else if (wind > 10) "neutral" else "positive"
        factors.add(WeatherImpactFactor("Wind", "${wind.toInt()} km/h", windImpact, windPenalty))

        val totalPenalty = factors.sumOf { it.penaltyPercent }
        val performancePercent = (100 - totalPenalty).coerceIn(70.0, 100.0)

        return Pair(performancePercent, factors)
    }

    /**
     * Load the user's historical weather impact data — how they perform across different conditions.
     */
    private suspend fun loadUserWeatherInsights(user: User?): UserWeatherInsights? {
        return try {
            val userId = sharedPrefs.getString("userId", null) ?: user?.id ?: return null
            val data = apiService.getWeatherImpact(userId)
            if (!data.hasEnoughData) return null

            // Find optimal temperature range (bucket with best avg pace)
            val bestTempBucket = data.temperatureAnalysis
                ?.filter { (it.avgPace ?: Int.MAX_VALUE) > 0 }
                ?.minByOrNull { it.avgPace ?: Int.MAX_VALUE }
            val worstTempBucket = data.temperatureAnalysis
                ?.filter { (it.avgPace ?: 0) > 0 }
                ?.maxByOrNull { it.avgPace ?: 0 }

            // Find best/worst weather condition
            val bestCondition = data.conditionAnalysis
                ?.filter { (it.avgPace ?: Int.MAX_VALUE) > 0 }
                ?.minByOrNull { it.avgPace ?: Int.MAX_VALUE }
            val worstCondition = data.conditionAnalysis
                ?.filter { (it.avgPace ?: 0) > 0 }
                ?.maxByOrNull { it.avgPace ?: 0 }

            // Determine heat sensitivity
            val heatSensitivity = if (bestTempBucket != null && worstTempBucket != null) {
                val bestPace = bestTempBucket.avgPace ?: 0
                val worstPace = worstTempBucket.avgPace ?: 0
                val pctDiff = if (bestPace > 0) ((worstPace - bestPace).toDouble() / bestPace * 100) else 0.0
                when {
                    pctDiff > 15 -> "high"
                    pctDiff > 8 -> "moderate"
                    else -> "low"
                }
            } else null

            UserWeatherInsights(
                runsAnalyzed = data.runsAnalyzed,
                optimalTempRange = bestTempBucket?.label,
                bestCondition = bestCondition?.condition,
                worstCondition = worstCondition?.condition,
                heatSensitivity = heatSensitivity,
                overallAvgPace = data.overallAvgPace,
                summary = data.insights?.let { insights ->
                    buildString {
                        insights.bestCondition?.let { append("Fastest in ${it.label}. ") }
                        insights.worstCondition?.let { append("Slowest in ${it.label}.") }
                    }.ifBlank { null }
                }
            )
        } catch (e: Exception) {
            Log.w("RunSummaryViewModel", "Failed to load weather insights", e)
            null
        }
    }

    private fun loadSavedAnalysis(runId: String) {
        viewModelScope.launch {
            try {
                val record = apiService.getRunAnalysisRecord(runId) ?: return@launch
                val analysisJson = record.analysis ?: return@launch
                var obj = analysisJson.asJsonObject

                // Check for freeform format first (new approach)
                if (obj.has("freeform") && obj.get("freeform").asBoolean) {
                    val markdown = obj.get("markdown")?.asString ?: return@launch
                    val title = obj.get("title")?.asString
                    _analysisState.value = AiAnalysisState.Freeform(markdown, title)
                    return@launch
                }

                // Handle legacy double-nested format: { analysis: { performanceScore: ... } }
                if (!obj.has("performanceScore") && !obj.has("overallScore") && obj.has("analysis")) {
                    val inner = obj.getAsJsonObject("analysis")
                    if (inner != null) obj = inner
                }

                // Legacy structured formats
                if (obj.has("performanceScore")) {
                    val comprehensive = gson.fromJson(obj, ComprehensiveRunAnalysis::class.java)
                    _analysisState.value = AiAnalysisState.Comprehensive(comprehensive)
                } else if (obj.has("overallScore")) {
                    val basic = gson.fromJson(obj, BasicRunInsights::class.java)
                    _analysisState.value = AiAnalysisState.Basic(basic)
                }
            } catch (e: Exception) {
                Log.w("RunSummaryViewModel", "Failed to load saved analysis for run $runId", e)
                // Ignore parse errors; keep Idle
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
     * Fallback: infer struggle points from km splits (when backend has no stored struggle points).
     * Detects a split-to-split slowdown of >= 15% as a "struggle point".
     */
    private fun inferStrugglePointsFromSplits(session: RunSession): List<StrugglePoint> {
        val splits = session.kmSplits
        if (splits.size < 2) return emptyList()

        // Split.time is stored as millis in-app; pace string is already present
        val inferred = mutableListOf<StrugglePoint>()
        var cumulativeDistanceMeters = 0.0
        for (i in 1 until splits.size) {
            val prev = splits[i - 1]
            val curr = splits[i]
            cumulativeDistanceMeters = curr.km.toDouble() * 1000.0

            val prevSec = (prev.time / 1000.0).coerceAtLeast(1.0)
            val currSec = (curr.time / 1000.0).coerceAtLeast(1.0)
            val paceDropPercent = ((currSec - prevSec) / prevSec) * 100.0

            if (paceDropPercent >= 15.0) {
                inferred.add(
                    StrugglePoint(
                        id = "inferred_${session.id}_${curr.km}",
                        timestamp = session.startTime + splits.take(i).sumOf { it.time },
                        distanceMeters = cumulativeDistanceMeters,
                        paceAtStruggle = curr.pace,
                        baselinePace = prev.pace,
                        paceDropPercent = paceDropPercent,
                        currentGrade = null,
                        heartRate = null,
                        location = null,
                    )
                )
            }
        }
        return inferred
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
        
        val distance = String.format(Locale.US, "%.2f", session.getDistanceInKm())
        val duration = session.getFormattedDuration()
        val pace = session.averagePace?.replace("/km", "") ?: "--:--"
        return "I just completed a $distance km run in $duration! Average pace: $pace/km. Tracked with AI Run Coach!"
    }

    // Share link state
    private val _shareUrl = MutableStateFlow<String?>(null)
    val shareUrl: StateFlow<String?> = _shareUrl.asStateFlow()
    private val _isCreatingShareLink = MutableStateFlow(false)
    val isCreatingShareLink: StateFlow<Boolean> = _isCreatingShareLink.asStateFlow()

    /**
     * Create a shareable link and fire a share intent with branded content
     */
    fun shareRunWithLink(context: android.content.Context) {
        val session = _runSession.value ?: return

        viewModelScope.launch {
            _isCreatingShareLink.value = true
            try {
                val response = apiService.createShareLink(session.id)
                _shareUrl.value = response.shareUrl

                val distance = String.format(Locale.US, "%.2f", session.getDistanceInKm())
                val duration = session.getFormattedDuration()
                val pace = session.averagePace?.replace("/km", "") ?: "--:--"

                val shareText = buildString {
                    appendLine("\uD83C\uDFC3\u200D♂\uFE0F AI Run Coach")
                    appendLine()
                    appendLine("\uD83D\uDCCF $distance km  \u23F1\uFE0F $duration  \u26A1 $pace/km")
                    appendLine()
                    appendLine("View my run:")
                    appendLine(response.shareUrl)
                    appendLine()
                    appendLine("Track your runs with elite AI coaching \uD83D\uDE80")
                }

                val shareIntent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(android.content.Intent.EXTRA_SUBJECT, "Check out my run on AI Run Coach!")
                    putExtra(android.content.Intent.EXTRA_TEXT, shareText)
                }
                context.startActivity(
                    android.content.Intent.createChooser(shareIntent, "Share your run")
                        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (e: Exception) {
                Log.e("RunSummaryVM", "Failed to create share link", e)
                // Fall back to basic share without link
                shareRunTextFallback(context, session)
            } finally {
                _isCreatingShareLink.value = false
            }
        }
    }

    private fun shareRunTextFallback(context: android.content.Context, session: RunSession) {
        val distance = String.format(Locale.US, "%.2f", session.getDistanceInKm())
        val duration = session.getFormattedDuration()
        val pace = session.averagePace?.replace("/km", "") ?: "--:--"

        val shareText = buildString {
            appendLine("\uD83C\uDFC3\u200D♂\uFE0F AI Run Coach")
            appendLine()
            appendLine("\uD83D\uDCCF $distance km  \u23F1\uFE0F $duration  \u26A1 $pace/km")
            appendLine()
            appendLine("Track your runs with elite AI coaching \uD83D\uDE80")
        }

        val shareIntent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(android.content.Intent.EXTRA_TEXT, shareText)
        }
        context.startActivity(
            android.content.Intent.createChooser(shareIntent, "Share your run")
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}

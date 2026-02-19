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
    
    // Target info from run setup
    private var targetDistance: Double? = null
    private var targetTime: Long? = null

    /**
     * Load run by ID from backend API.
     * Falls back to local run data from RunTrackingService if the backend fetch fails
     * (e.g. 404 after a failed upload, or NumberFormatException from date parsing).
     */
    fun loadRunById(runId: String) {
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
            _analysisState.value = AiAnalysisState.Loading
            try {
                // Persist self-assessment and struggle points to the run record first
                val updateRequest = UpdateRunProgressRequest(
                    runId = session.id,
                    userComments = _userPostRunComments.value.ifBlank { null },
                    strugglePoints = _strugglePoints.value
                )
                apiService.updateRunProgress(updateRequest)

                // Primary: comprehensive analysis (Garmin-aware)
                val comprehensive = apiService.getComprehensiveRunAnalysis(session.id)
                _analysisState.value = AiAnalysisState.Comprehensive(comprehensive.analysis)
            } catch (e: Exception) {
                // Fallback: basic AI insights
                try {
                    val insights = apiService.getBasicRunInsights(session.id)
                    _analysisState.value = AiAnalysisState.Basic(insights)

                    // Persist basic insights to analysis table
                    val json = gson.toJsonTree(insights)
                    apiService.saveRunAnalysis(session.id, SaveRunAnalysisRequest(json))
                } catch (inner: Exception) {
                    _analysisState.value = AiAnalysisState.Error(inner.message ?: "Failed to generate run analysis")
                }
            }
        }
    }

    private fun loadSavedAnalysis(runId: String) {
        viewModelScope.launch {
            try {
                val record = apiService.getRunAnalysisRecord(runId) ?: return@launch
                val analysisJson = record.analysis ?: return@launch
                val obj = analysisJson.asJsonObject

                if (obj.has("performanceScore")) {
                    val comprehensive = gson.fromJson(analysisJson, ComprehensiveRunAnalysis::class.java)
                    _analysisState.value = AiAnalysisState.Comprehensive(comprehensive)
                } else if (obj.has("overallScore")) {
                    val basic = gson.fromJson(analysisJson, BasicRunInsights::class.java)
                    _analysisState.value = AiAnalysisState.Basic(basic)
                }
            } catch (_: Exception) {
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
}

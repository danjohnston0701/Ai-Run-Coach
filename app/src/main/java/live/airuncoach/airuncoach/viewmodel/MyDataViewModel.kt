package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

/**
 * Time period for analytics calculations
 */
enum class TimePeriod(val label: String, val days: Int) {
    MONTH("1 Month", 30),
    QUARTER("3 Months", 90),
    HALF_YEAR("6 Months", 180),
    YEAR("1 Year", 365)
}

/**
 * Personal best record
 */
data class PersonalBest(
    val category: String,           // "1K", "5K", "10K", "Half Marathon", "Marathon"
    val pace: String,               // in min/km
    val distance: Double,           // in km
    val duration: Long,             // in milliseconds
    val date: String,               // ISO date
    val runId: String               // link to run
)

/**
 * Aggregated statistics for a time period
 */
data class PeriodStatistics(
    val period: TimePeriod,
    val totalRuns: Int,
    val totalDistance: Double,      // km
    val totalDuration: Long,        // ms
    val totalElevationGain: Double, // meters
    val averagePace: String,        // min/km
    val averageHeartRate: Int,      // bpm
    val averageCadence: Int,        // steps/min
    val averageRunDuration: Long,   // ms
    val fastestRun: Double,         // km
    val slowestRun: Double,         // km
    val longestRun: Double,         // km
    val totalCalories: Int,
    val averageCalories: Int,
    val consistencyScore: Float     // 0-100, based on run frequency
)

/**
 * Overall performance trend (legacy, kept for compatibility)
 */
data class PeriodData(
    val period: TimePeriod,
    val value: Double,
    val trend: String               // "↑", "↓", "→" for up, down, stable
)

/**
 * A single data point for a run-by-run trend graph
 */
data class TrendDataPoint(
    val date: String,   // e.g. "2024-03-15"
    val value: Double   // metric value for that run
)

/**
 * Grouped trend data point for weekly/monthly aggregation
 */
data class GroupedTrendDataPoint(
    val label: String,  // e.g. "Week 1", "Mar 2024"
    val value: Double   // aggregated average value for that period
)

/**
 * Intensity count breakdown for coaching sessions
 */
data class IntensityBreakdown(
    val easy: Int     = 0,
    val moderate: Int = 0,
    val hard: Int     = 0,
    val unset: Int    = 0,
)

/**
 * The best coaching session within the selected period
 */
data class BestCoachingRun(
    val runId: String,
    val date: String,
    val distanceKm: Double,
    val pace: String,
)

/**
 * Coaching-plan specific analytics shown in the Coaching Plan Summary section
 */
data class CoachingPlanSummary(
    val hasCoachingSessions: Boolean,
    val totalSessions: Int,
    val sessionsThisPeriod: Int,
    val totalDistanceKm: Double,
    val avgPaceDisplay: String,
    val targetAchievementRate: Int,         // 0-100%
    val avgWeeklyCoachingSessions: Double,
    val intensityBreakdown: IntensityBreakdown,
    val workoutTypeBreakdown: Map<String, Int>,
    val progressionTrend: String,           // "IMPROVING" | "DECLINING" | "STABLE"
    val progressionNote: String,
    val bestCoachingRun: BestCoachingRun?,
)

@HiltViewModel
class MyDataViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val tag = "MyDataViewModel"
    
    // UI State
    private val _selectedTimePeriod = MutableStateFlow(TimePeriod.MONTH)
    val selectedTimePeriod: StateFlow<TimePeriod> = _selectedTimePeriod.asStateFlow()
    
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()
    
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    
    // Personal Bests
    private val _personalBests = MutableStateFlow<List<PersonalBest>>(emptyList())
    val personalBests: StateFlow<List<PersonalBest>> = _personalBests.asStateFlow()
    
    // Statistics
    private val _currentPeriodStats = MutableStateFlow<PeriodStatistics?>(null)
    val currentPeriodStats: StateFlow<PeriodStatistics?> = _currentPeriodStats.asStateFlow()
    
    // Trends (run-by-run data points for graphing)
    private val _pacesTrend = MutableStateFlow<List<TrendDataPoint>>(emptyList())
    val pacesTrend: StateFlow<List<TrendDataPoint>> = _pacesTrend.asStateFlow()
    
    private val _hrTrend = MutableStateFlow<List<TrendDataPoint>>(emptyList())
    val hrTrend: StateFlow<List<TrendDataPoint>> = _hrTrend.asStateFlow()
    
    private val _elevationTrend = MutableStateFlow<List<TrendDataPoint>>(emptyList())
    val elevationTrend: StateFlow<List<TrendDataPoint>> = _elevationTrend.asStateFlow()
    
    private val _cadenceTrend = MutableStateFlow<List<TrendDataPoint>>(emptyList())
    val cadenceTrend: StateFlow<List<TrendDataPoint>> = _cadenceTrend.asStateFlow()
    
    // All-time stats
    private val _allTimeStats = MutableStateFlow<Map<String, Any>>(emptyMap())
    val allTimeStats: StateFlow<Map<String, Any>> = _allTimeStats.asStateFlow()

    // Coaching plan summary
    private val _coachingSummary = MutableStateFlow<CoachingPlanSummary?>(null)
    val coachingSummary: StateFlow<CoachingPlanSummary?> = _coachingSummary.asStateFlow()
    
    // Cache with TTL (5 minutes)
    private var lastLoadTime = 0L
    private val cacheValidityMs = 5 * 60 * 1000
    private var cacheValid = false
    
    init {
        loadMyData()
    }
    
    fun selectTimePeriod(period: TimePeriod) {
        _selectedTimePeriod.value = period
        // Only reload period-sensitive data, not personal bests (those are all-time)
        loadPeriodStatistics()
        loadDetailedTrends()
        loadCoachingSummary()
    }
    
    fun refreshData() {
        cacheValid = false
        loadMyData()
    }
    
    private fun loadMyData() {
        // Check if cache is still valid (for non-period changes)
        val now = System.currentTimeMillis()
        if (cacheValid && now - lastLoadTime < cacheValidityMs && _personalBests.value.isNotEmpty()) {
            Log.d(tag, "Using cached My Data")
            return
        }
        
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            
            try {
                // Fetch all data in parallel
                val pbTask = loadPersonalBests()
                val statsTask = loadPeriodStatistics()
                val trendsTask = loadDetailedTrends()
                val allTimeTask = loadAllTimeStats()
                val coachingTask = loadCoachingSummary()
                
                // Wait for all to complete
                try {
                    pbTask.join()
                } catch (e: Exception) {
                    Log.e(tag, "Error joining pbTask", e)
                }
                
                try {
                    statsTask.join()
                } catch (e: Exception) {
                    Log.e(tag, "Error joining statsTask", e)
                }
                
                try {
                    trendsTask.join()
                } catch (e: Exception) {
                    Log.e(tag, "Error joining trendsTask", e)
                }
                
                try {
                    allTimeTask.join()
                } catch (e: Exception) {
                    Log.e(tag, "Error joining allTimeTask", e)
                }

                try {
                    coachingTask.join()
                } catch (e: Exception) {
                    Log.e(tag, "Error joining coachingTask", e)
                }
                
                lastLoadTime = System.currentTimeMillis()
                cacheValid = true
                Log.d(tag, "Successfully loaded My Data")
            } catch (e: Exception) {
                Log.e(tag, "Error loading My Data", e)
                // Only show error if we don't have cached data
                if (_personalBests.value.isEmpty()) {
                    _error.value = "Unable to load your data. Please check your connection."
                }
            } finally {
                _isLoading.value = false
            }
        }
    }
    
    private fun loadPersonalBests() = viewModelScope.launch {
        try {
            // API endpoint to fetch all runs and calculate personal bests
            val response = apiService.getMyDataPersonalBests()
            if (response.isSuccessful) {
                // Server wraps array as { data: { personalBests: [...] } }
                val bests = (response.body()?.data?.get("personalBests") as? List<*>)?.mapNotNull { item ->
                    val pb = item as? Map<*, *> ?: return@mapNotNull null
                    PersonalBest(
                        category = pb["category"] as? String ?: "",
                        pace = pb["pace"] as? String ?: "",
                        distance = (pb["distance"] as? Number)?.toDouble() ?: 0.0,
                        duration = (pb["duration"] as? Number)?.toLong() ?: 0L,
                        date = pb["date"] as? String ?: "",
                        runId = pb["runId"] as? String ?: ""
                    )
                } ?: emptyList()
                _personalBests.value = bests
                Log.d(tag, "Loaded ${bests.size} personal bests")
            } else {
                Log.w(tag, "Personal bests response not successful: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Error loading personal bests", e)
            // Keep existing data on error
        }
    }
    
    private fun loadPeriodStatistics() = viewModelScope.launch {
        try {
            val period = _selectedTimePeriod.value
            val response = apiService.getMyDataStatistics(period.days)
            
            if (response.isSuccessful) {
                val data = response.body()?.data ?: emptyMap()
                val stats = PeriodStatistics(
                    period = period,
                    totalRuns = (data["totalRuns"] as? Number)?.toInt() ?: 0,
                    totalDistance = (data["totalDistance"] as? Number)?.toDouble() ?: 0.0,
                    totalDuration = (data["totalDuration"] as? Number)?.toLong() ?: 0L,
                    totalElevationGain = (data["totalElevationGain"] as? Number)?.toDouble() ?: 0.0,
                    averagePace = data["averagePace"] as? String ?: "--",
                    averageHeartRate = (data["averageHeartRate"] as? Number)?.toInt() ?: 0,
                    averageCadence = (data["averageCadence"] as? Number)?.toInt() ?: 0,
                    averageRunDuration = (data["averageRunDuration"] as? Number)?.toLong() ?: 0L,
                    fastestRun = (data["fastestRun"] as? Number)?.toDouble() ?: 0.0,
                    slowestRun = (data["slowestRun"] as? Number)?.toDouble() ?: 0.0,
                    longestRun = (data["longestRun"] as? Number)?.toDouble() ?: 0.0,
                    totalCalories = (data["totalCalories"] as? Number)?.toInt() ?: 0,
                    averageCalories = (data["averageCalories"] as? Number)?.toInt() ?: 0,
                    consistencyScore = (data["consistencyScore"] as? Number)?.toFloat() ?: 0f
                )
                _currentPeriodStats.value = stats
                Log.d(tag, "Loaded period statistics for ${period.label}: ${stats.totalRuns} runs")
            } else {
                Log.w(tag, "Period statistics response not successful: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Error loading period statistics", e)
            // Keep existing data on error
        }
    }
    
    private fun loadDetailedTrends() = viewModelScope.launch {
        try {
            val period = _selectedTimePeriod.value
            val days = period.days
            val response = apiService.getMyDataDetailedTrends(days)
            
            if (response.isSuccessful) {
                val data = response.body()?.data ?: emptyMap()
                
                // Helper to parse a list of {date, value} into TrendDataPoint
                fun parsePoints(key: String) = (data[key] as? List<*>)?.mapNotNull { item ->
                    val map = item as? Map<*, *> ?: return@mapNotNull null
                    val value = (map["value"] as? Number)?.toDouble() ?: return@mapNotNull null
                    TrendDataPoint(
                        date = map["date"] as? String ?: "",
                        value = value
                    )
                } ?: emptyList()

                _pacesTrend.value = parsePoints("paceTrend")
                _hrTrend.value = parsePoints("hrTrend")
                _elevationTrend.value = parsePoints("elevationTrend")
                _cadenceTrend.value = parsePoints("cadenceTrend")
                
                Log.d(tag, "Loaded detailed trends for ${period.label}: pace=${_pacesTrend.value.size} runs")
            } else {
                Log.w(tag, "Detailed trends response not successful: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Error loading detailed trends", e)
            // Keep existing data on error
        }
    }
    
    private fun loadAllTimeStats() = viewModelScope.launch {
        try {
            val response = apiService.getMyDataAllTimeStats()
            
            if (response.isSuccessful) {
                val data = response.body()?.data ?: emptyMap()
                _allTimeStats.value = data
                Log.d(tag, "Loaded all-time statistics")
            } else {
                Log.w(tag, "All-time stats response not successful: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Error loading all-time stats", e)
            // Keep existing data on error
        }
    }

    fun loadCoachingSummary() = viewModelScope.launch {
        try {
            val days = _selectedTimePeriod.value.days
            val response = apiService.getMyDataCoachingSummary(days)

            if (response.isSuccessful) {
                val d = response.body()?.data ?: emptyMap()

                @Suppress("UNCHECKED_CAST")
                fun asInt(key: String) = (d[key] as? Number)?.toInt() ?: 0
                fun asDouble(key: String) = (d[key] as? Number)?.toDouble() ?: 0.0
                fun asString(key: String) = d[key] as? String ?: ""
                fun asBool(key: String)   = d[key] as? Boolean ?: false

                val intensityMap = d["intensityBreakdown"] as? Map<*, *>
                val intensity = IntensityBreakdown(
                    easy     = (intensityMap?.get("easy")     as? Number)?.toInt() ?: 0,
                    moderate = (intensityMap?.get("moderate") as? Number)?.toInt() ?: 0,
                    hard     = (intensityMap?.get("hard")     as? Number)?.toInt() ?: 0,
                    unset    = (intensityMap?.get("unset")    as? Number)?.toInt() ?: 0,
                )

                val typeMap = d["workoutTypeBreakdown"] as? Map<*, *>
                val workoutTypes = typeMap?.entries?.mapNotNull { (k, v) ->
                    val key = k as? String ?: return@mapNotNull null
                    val count = (v as? Number)?.toInt() ?: 0
                    key to count
                }?.toMap() ?: emptyMap()

                val bestRunMap = d["bestCoachingRun"] as? Map<*, *>
                val bestRun = bestRunMap?.let {
                    BestCoachingRun(
                        runId      = it["runId"]      as? String ?: "",
                        date       = it["date"]       as? String ?: "",
                        distanceKm = (it["distanceKm"] as? Number)?.toDouble() ?: 0.0,
                        pace       = it["pace"]       as? String ?: "--",
                    )
                }

                _coachingSummary.value = CoachingPlanSummary(
                    hasCoachingSessions       = asBool("hasCoachingSessions"),
                    totalSessions             = asInt("totalSessions"),
                    sessionsThisPeriod        = asInt("sessionsThisPeriod"),
                    totalDistanceKm           = asDouble("totalDistanceKm"),
                    avgPaceDisplay            = asString("avgPaceDisplay"),
                    targetAchievementRate     = asInt("targetAchievementRate"),
                    avgWeeklyCoachingSessions = asDouble("avgWeeklyCoachingSessions"),
                    intensityBreakdown        = intensity,
                    workoutTypeBreakdown      = workoutTypes,
                    progressionTrend          = asString("progressionTrend"),
                    progressionNote           = asString("progressionNote"),
                    bestCoachingRun           = bestRun,
                )
                Log.d(tag, "Loaded coaching summary: ${_coachingSummary.value?.sessionsThisPeriod} sessions")
            } else {
                Log.w(tag, "Coaching summary response not successful: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Error loading coaching summary", e)
        }
    }
}

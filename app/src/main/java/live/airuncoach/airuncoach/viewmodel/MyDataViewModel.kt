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
 * Overall performance trend
 */
data class PeriodData(
    val period: TimePeriod,
    val value: Double,
    val trend: String               // "↑", "↓", "→" for up, down, stable
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
    
    // Trends
    private val _pacesTrend = MutableStateFlow<List<PeriodData>>(emptyList())
    val pacesTrend: StateFlow<List<PeriodData>> = _pacesTrend.asStateFlow()
    
    private val _hrTrend = MutableStateFlow<List<PeriodData>>(emptyList())
    val hrTrend: StateFlow<List<PeriodData>> = _hrTrend.asStateFlow()
    
    private val _elevationTrend = MutableStateFlow<List<PeriodData>>(emptyList())
    val elevationTrend: StateFlow<List<PeriodData>> = _elevationTrend.asStateFlow()
    
    private val _cadenceTrend = MutableStateFlow<List<PeriodData>>(emptyList())
    val cadenceTrend: StateFlow<List<PeriodData>> = _cadenceTrend.asStateFlow()
    
    // All-time stats
    private val _allTimeStats = MutableStateFlow<Map<String, Any>>(emptyMap())
    val allTimeStats: StateFlow<Map<String, Any>> = _allTimeStats.asStateFlow()
    
    // Cache with TTL (5 minutes)
    private var lastLoadTime = 0L
    private val cacheValidityMs = 5 * 60 * 1000
    private var cacheValid = false
    
    init {
        loadMyData()
    }
    
    fun selectTimePeriod(period: TimePeriod) {
        _selectedTimePeriod.value = period
        loadMyData()
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
                val trendsTask = loadTrends()
                val allTimeTask = loadAllTimeStats()
                
                // Wait for all to complete
                pbTask.join()
                statsTask.join()
                trendsTask.join()
                allTimeTask.join()
                
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
                val bests = (response.body()?.data as? List<*>)?.mapNotNull { item ->
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
    
    private fun loadTrends() = viewModelScope.launch {
        try {
            val response = apiService.getMyDataTrends()
            
            if (response.isSuccessful) {
                val data = response.body()?.data ?: emptyMap()
                
                // Parse pace trend
                val paceTrendData = (data["paceTrend"] as? List<*>)?.mapNotNull { item ->
                    val map = item as? Map<*, *> ?: return@mapNotNull null
                    PeriodData(
                        period = TimePeriod.valueOf(map["period"] as? String ?: "MONTH"),
                        value = (map["value"] as? Number)?.toDouble() ?: 0.0,
                        trend = map["trend"] as? String ?: "→"
                    )
                } ?: emptyList()
                _pacesTrend.value = paceTrendData
                
                // Parse HR trend
                val hrTrendData = (data["hrTrend"] as? List<*>)?.mapNotNull { item ->
                    val map = item as? Map<*, *> ?: return@mapNotNull null
                    PeriodData(
                        period = TimePeriod.valueOf(map["period"] as? String ?: "MONTH"),
                        value = (map["value"] as? Number)?.toDouble() ?: 0.0,
                        trend = map["trend"] as? String ?: "→"
                    )
                } ?: emptyList()
                _hrTrend.value = hrTrendData
                
                // Parse elevation trend
                val elevTrendData = (data["elevationTrend"] as? List<*>)?.mapNotNull { item ->
                    val map = item as? Map<*, *> ?: return@mapNotNull null
                    PeriodData(
                        period = TimePeriod.valueOf(map["period"] as? String ?: "MONTH"),
                        value = (map["value"] as? Number)?.toDouble() ?: 0.0,
                        trend = map["trend"] as? String ?: "→"
                    )
                } ?: emptyList()
                _elevationTrend.value = elevTrendData
                
                // Parse cadence trend
                val cadenceTrendData = (data["cadenceTrend"] as? List<*>)?.mapNotNull { item ->
                    val map = item as? Map<*, *> ?: return@mapNotNull null
                    PeriodData(
                        period = TimePeriod.valueOf(map["period"] as? String ?: "MONTH"),
                        value = (map["value"] as? Number)?.toDouble() ?: 0.0,
                        trend = map["trend"] as? String ?: "→"
                    )
                } ?: emptyList()
                _cadenceTrend.value = cadenceTrendData
                
                Log.d(tag, "Loaded performance trends")
            } else {
                Log.w(tag, "Trends response not successful: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Error loading trends", e)
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
}

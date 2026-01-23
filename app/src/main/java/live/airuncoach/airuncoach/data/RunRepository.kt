package live.airuncoach.airuncoach.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import live.airuncoach.airuncoach.domain.model.RunSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Repository for managing run session data
 * Currently uses SharedPreferences for storage
 * TODO: Migrate to Room database for better performance and querying
 */
class RunRepository(context: Context) {
    
    private val sharedPrefs = context.getSharedPreferences("run_data", Context.MODE_PRIVATE)
    private val gson = Gson()
    
    private val _runSessions = MutableStateFlow<List<RunSession>>(emptyList())
    val runSessions: Flow<List<RunSession>> = _runSessions.asStateFlow()
    
    init {
        loadRunSessions()
    }
    
    /**
     * Saves a completed run session
     */
    fun saveRunSession(runSession: RunSession) {
        val sessions = _runSessions.value.toMutableList()
        sessions.add(runSession)
        _runSessions.value = sessions
        
        // Persist to SharedPreferences
        val json = gson.toJson(sessions)
        sharedPrefs.edit().putString("sessions", json).apply()
    }
    
    /**
     * Loads all saved run sessions
     */
    private fun loadRunSessions() {
        val json = sharedPrefs.getString("sessions", null)
        if (json != null) {
            try {
                val type = object : TypeToken<List<RunSession>>() {}.type
                val sessions: List<RunSession> = gson.fromJson(json, type)
                _runSessions.value = sessions
            } catch (e: Exception) {
                e.printStackTrace()
                _runSessions.value = emptyList()
            }
        }
    }
    
    /**
     * Gets run sessions for the current week
     */
    fun getWeeklyRunSessions(): List<RunSession> {
        val oneWeekAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L)
        return _runSessions.value.filter { it.startTime >= oneWeekAgo }
    }
    
    /**
     * Calculates weekly statistics
     */
    fun getWeeklyStats(): WeeklyStats {
        val weeklySessions = getWeeklyRunSessions()
        
        val totalRuns = weeklySessions.size
        val totalDistance = weeklySessions.sumOf { it.distance }
        val longestRun = weeklySessions.maxOfOrNull { it.distance } ?: 0.0
        
        val averagePace = if (weeklySessions.isNotEmpty()) {
            val totalDuration = weeklySessions.sumOf { it.duration }
            val avgSpeed = (totalDistance / (totalDuration / 1000.0)).toFloat()
            calculatePace(avgSpeed)
        } else {
            "0:00"
        }
        
        return WeeklyStats(
            totalRuns = totalRuns,
            totalDistanceKm = totalDistance / 1000.0,
            averagePace = averagePace,
            longestRunKm = longestRun / 1000.0
        )
    }
    
    private fun calculatePace(speedMetersPerSecond: Float): String {
        if (speedMetersPerSecond <= 0) return "0:00"
        
        val paceSecondsPerKm = 1000.0 / speedMetersPerSecond
        val minutes = (paceSecondsPerKm / 60).toInt()
        val seconds = (paceSecondsPerKm % 60).toInt()
        
        return String.format("%d:%02d", minutes, seconds)
    }
    
    /**
     * Deletes all run sessions (for testing/debugging)
     */
    fun clearAllSessions() {
        _runSessions.value = emptyList()
        sharedPrefs.edit().remove("sessions").apply()
    }
}

data class WeeklyStats(
    val totalRuns: Int,
    val totalDistanceKm: Double,
    val averagePace: String,
    val longestRunKm: Double
)

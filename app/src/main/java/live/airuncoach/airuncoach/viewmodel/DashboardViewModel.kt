package live.airuncoach.airuncoach.viewmodel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.RunRepository
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.data.WeatherRepository
import live.airuncoach.airuncoach.domain.model.GarminConnection
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.network.RetrofitClient
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DashboardViewModel(private val context: Context) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    
    // Repositories for real data
    private val weatherRepository = WeatherRepository(context)
    private val runRepository = RunRepository(context)
    
    // API service for fetching goals from backend
    private val sessionManager = SessionManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()
    
    private val _garminConnection = MutableStateFlow<GarminConnection?>(null)
    val garminConnection: StateFlow<GarminConnection?> = _garminConnection.asStateFlow()

    private val _weatherData = MutableStateFlow<WeatherData?>(null)
    val weatherData: StateFlow<WeatherData?> = _weatherData

    private val _goals = MutableStateFlow<List<Goal>>(emptyList())
    val goals: StateFlow<List<Goal>> = _goals

    private val _currentTime = MutableStateFlow("")
    val currentTime: StateFlow<String> = _currentTime.asStateFlow()

    // Weekly stats
    private val _weeklyRuns = MutableStateFlow(0)
    val weeklyRuns: StateFlow<Int> = _weeklyRuns.asStateFlow()

    private val _weeklyDistance = MutableStateFlow(0.0)
    val weeklyDistance: StateFlow<Double> = _weeklyDistance.asStateFlow()

    private val _averagePace = MutableStateFlow("0:00")
    val averagePace: StateFlow<String> = _averagePace.asStateFlow()

    private val _longestRun = MutableStateFlow(0.0)
    val longestRun: StateFlow<Double> = _longestRun.asStateFlow()

    // State for Target Distance
    private val _targetDistance = MutableStateFlow(5f)
    val targetDistance: StateFlow<Float> = _targetDistance.asStateFlow()

    // State for Target Time toggle
    private val _isTargetTimeEnabled = MutableStateFlow(false)
    val isTargetTimeEnabled: StateFlow<Boolean> = _isTargetTimeEnabled.asStateFlow()

    // State for Target Time values
    private val _targetHours = MutableStateFlow("00")
    val targetHours: StateFlow<String> = _targetHours.asStateFlow()

    private val _targetMinutes = MutableStateFlow("25")
    val targetMinutes: StateFlow<String> = _targetMinutes.asStateFlow()

    private val _targetSeconds = MutableStateFlow("00")
    val targetSeconds: StateFlow<String> = _targetSeconds
    
    // Location permission state
    private val _hasLocationPermission = MutableStateFlow(false)
    val hasLocationPermission: StateFlow<Boolean> = _hasLocationPermission
    
    init {
        checkLocationPermission()
    }
    
    /**
     * Check if location permissions are granted
     */
    fun checkLocationPermission() {
        val fineLocation = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        val coarseLocation = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        
        _hasLocationPermission.value = fineLocation == PackageManager.PERMISSION_GRANTED || 
                                       coarseLocation == PackageManager.PERMISSION_GRANTED
    }

    init {
        loadUser()
        loadGarminConnection()
        loadDashboardData()
        startTimeUpdater()
    }

    private fun loadUser() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            _user.value = gson.fromJson(userJson, User::class.java)
        }
    }
    
    private fun loadGarminConnection() {
        val connectionJson = sharedPrefs.getString("garmin_connection", null)
        if (connectionJson != null) {
            try {
                val connection = gson.fromJson(connectionJson, GarminConnection::class.java)
                // Only show if actually connected
                if (connection.isConnected) {
                    _garminConnection.value = connection
                }
            } catch (e: Exception) {
                e.printStackTrace()
                _garminConnection.value = null
            }
        }
    }
    
    fun updateGarminConnection(connection: GarminConnection?) {
        _garminConnection.value = connection
        if (connection != null) {
            val json = gson.toJson(connection)
            sharedPrefs.edit().putString("garmin_connection", json).apply()
        } else {
            sharedPrefs.edit().remove("garmin_connection").apply()
        }
    }

    private fun loadDashboardData() {
        viewModelScope.launch {
            // Load REAL weather data based on device GPS location
            val weather = weatherRepository.getCurrentWeather()
            _weatherData.value = weather ?: WeatherData(21.0, 80.0, 5.0, "Unknown") // Fallback if API fails
            
            // Load REAL goals from Neon database via API
            try {
                val userId = _user.value?.id
                if (userId != null) {
                    val goals = apiService.getGoals(userId)
                    _goals.value = goals
                } else {
                    _goals.value = emptyList()
                }
            } catch (e: Exception) {
                // If API call fails, show empty list
                _goals.value = emptyList()
                android.util.Log.e("DashboardViewModel", "Failed to load goals: ${e.message}")
            }

            // Load REAL weekly stats from saved run sessions
            val weeklyStats = runRepository.getWeeklyStats()
            _weeklyRuns.value = weeklyStats.totalRuns
            _weeklyDistance.value = weeklyStats.totalDistanceKm
            _averagePace.value = weeklyStats.averagePace
            _longestRun.value = weeklyStats.longestRunKm
        }
    }

    private fun startTimeUpdater() {
        viewModelScope.launch {
            while (isActive) {
                val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
                _currentTime.value = timeFormat.format(Date())
                delay(1000) // Update every second
            }
        }
    }

    fun onDistanceChanged(newDistance: Float) {
        _targetDistance.value = newDistance
    }

    fun onTargetTimeToggled(isEnabled: Boolean) {
        _isTargetTimeEnabled.value = isEnabled
    }

    fun onTargetHoursChanged(value: String) {
        // Only allow 2 digits, max 23
        val filtered = value.filter { it.isDigit() }.take(2)
        if (filtered.isEmpty() || filtered.toIntOrNull()?.let { it <= 23 } == true) {
            _targetHours.value = filtered.padStart(2, '0')
        }
    }

    fun onTargetMinutesChanged(value: String) {
        // Only allow 2 digits, max 59
        val filtered = value.filter { it.isDigit() }.take(2)
        if (filtered.isEmpty() || filtered.toIntOrNull()?.let { it <= 59 } == true) {
            _targetMinutes.value = filtered.padStart(2, '0')
        }
    }

    fun onTargetSecondsChanged(value: String) {
        // Only allow 2 digits, max 59
        val filtered = value.filter { it.isDigit() }.take(2)
        if (filtered.isEmpty() || filtered.toIntOrNull()?.let { it <= 59 } == true) {
            _targetSeconds.value = filtered.padStart(2, '0')
        }
    }

    fun getTargetTimeSeconds(): Int {
        val hours = _targetHours.value.toIntOrNull() ?: 0
        val minutes = _targetMinutes.value.toIntOrNull() ?: 0
        val seconds = _targetSeconds.value.toIntOrNull() ?: 0
        return (hours * 3600) + (minutes * 60) + seconds
    }
    
    fun getLastRunSession(): live.airuncoach.airuncoach.domain.model.RunSession? {
        // Get the most recent completed run from weekly sessions
        val weeklyRuns = runRepository.getWeeklyRunSessions()
        return weeklyRuns.filter { !it.isActive }
            .maxByOrNull { it.startTime }
    }
}

class DashboardViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(DashboardViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return DashboardViewModel(context) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}

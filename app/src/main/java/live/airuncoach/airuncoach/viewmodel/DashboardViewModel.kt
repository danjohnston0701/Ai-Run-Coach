package live.airuncoach.airuncoach.viewmodel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.GarminConnection
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.network.ApiService
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    private val _garminConnection = MutableStateFlow<GarminConnection?>(null)
    val garminConnection: StateFlow<GarminConnection?> = _garminConnection.asStateFlow()

    private val _weatherData = MutableStateFlow<WeatherData?>(null)
    val weatherData: StateFlow<WeatherData?> = _weatherData.asStateFlow()

    private val _goals = MutableStateFlow<List<Goal>>(emptyList())
    val goals: StateFlow<List<Goal>> = _goals.asStateFlow()

    private val _currentTime = MutableStateFlow("")
    val currentTime: StateFlow<String> = _currentTime.asStateFlow()

    private val _targetDistance = MutableStateFlow(5f)
    val targetDistance: StateFlow<Float> = _targetDistance.asStateFlow()

    private val _isTargetTimeEnabled = MutableStateFlow(false)
    val isTargetTimeEnabled: StateFlow<Boolean> = _isTargetTimeEnabled.asStateFlow()

    private val _targetHours = MutableStateFlow("00")
    val targetHours: StateFlow<String> = _targetHours.asStateFlow()

    private val _targetMinutes = MutableStateFlow("00")
    val targetMinutes: StateFlow<String> = _targetMinutes.asStateFlow()

    private val _targetSeconds = MutableStateFlow("00")
    val targetSeconds: StateFlow<String> = _targetSeconds.asStateFlow()

    private val _hasLocationPermission = MutableStateFlow(false)
    val hasLocationPermission: StateFlow<Boolean> = _hasLocationPermission.asStateFlow()

    private val _recentRun = MutableStateFlow<RunSession?>(null)
    val recentRun: StateFlow<RunSession?> = _recentRun.asStateFlow()

    private val _isAiCoachEnabled = MutableStateFlow(true)
    val isAiCoachEnabled: StateFlow<Boolean> = _isAiCoachEnabled.asStateFlow()
    
    // Track active run session
    val activeRunSession: StateFlow<RunSession?> = 
        live.airuncoach.airuncoach.service.RunTrackingService.currentRunSession

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val fusedLocationClient: FusedLocationProviderClient = 
        LocationServices.getFusedLocationProviderClient(context)

    init {
        // Don't block UI - use IO dispatcher for all blocking operations
        viewModelScope.launch(Dispatchers.IO) {
            try {
                loadUser()
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "Error loading user: ${e.message}", e)
            }
        }
        
        viewModelScope.launch(Dispatchers.IO) {
            try {
                updateTime()
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "Error updating time: ${e.message}", e)
            }
        }
        
        viewModelScope.launch(Dispatchers.IO) {
            try {
                checkLocationPermission()
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "Error checking location permission: ${e.message}", e)
            }
        }
        
        viewModelScope.launch(Dispatchers.IO) {
            try {
                loadAiCoachPreference()
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "Error loading AI coach preference: ${e.message}", e)
            }
        }
        
        viewModelScope.launch {
            try {
                loadWeather()
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "Error loading weather: ${e.message}", e)
            }
        }
    }
    
    private fun loadAiCoachPreference() {
        _isAiCoachEnabled.value = sharedPrefs.getBoolean("ai_coach_enabled", true)
    }
    
    private fun loadWeather() {
        viewModelScope.launch {
            try {
                // Get device's current location
                val location = getCurrentLocation()
                
                if (location != null) {
                    android.util.Log.d("DashboardViewModel", "Location: ${location.latitude}, ${location.longitude}")
                    
                    // Fetch weather for actual device location
                    val weather = live.airuncoach.airuncoach.network.WeatherRetrofitClient.weatherApiService
                        .getCurrentWeather(
                            latitude = location.latitude,
                            longitude = location.longitude,
                            apiKey = live.airuncoach.airuncoach.BuildConfig.WEATHER_API_KEY,
                            units = "metric"
                        )
                    
                    _weatherData.value = WeatherData(
                        temperature = weather.main.temperature,
                        condition = weather.weather.firstOrNull()?.main ?: "Clear",
                        description = weather.weather.firstOrNull()?.description ?: "",
                        humidity = weather.main.humidity.toDouble(),
                        windSpeed = weather.wind.speed
                    )
                    android.util.Log.d("DashboardViewModel", "Weather loaded for location: ${weather.main.temperature}°C, ${weather.weather.firstOrNull()?.description}")
                } else {
                    android.util.Log.w("DashboardViewModel", "Location unavailable, using default weather")
                    setDefaultWeather()
                }
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "Failed to load weather: ${e.message}", e)
                // Don't crash - just set null weather
                _weatherData.value = null
            }
        }
    }
    
    private suspend fun getCurrentLocation(): android.location.Location? {
        // Check if location permissions are granted
        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            android.util.Log.w("DashboardViewModel", "Location permission not granted")
            return null
        }
        
        return try {
            // Try to get current location with high accuracy
            val cancellationToken = CancellationTokenSource()
            fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                cancellationToken.token
            ).await()
        } catch (e: Exception) {
            android.util.Log.w("DashboardViewModel", "Failed to get current location, trying last known location")
            try {
                // Fallback to last known location
                fusedLocationClient.lastLocation.await()
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "Failed to get last known location: ${e.message}")
                null
            }
        }
    }
    
    private fun setDefaultWeather() {
        // Don't set default weather - leave as null to show "No weather data available"
        _weatherData.value = null
    }

    private fun loadUser() {
        try {
            val userJson = sharedPrefs.getString("user", null)
            if (userJson != null) {
                _user.value = gson.fromJson(userJson, User::class.java)
                android.util.Log.d("DashboardViewModel", "User loaded: ${_user.value?.name}")
                // Load goals after user is loaded
                try {
                    loadGoals()
                } catch (e: Exception) {
                    android.util.Log.e("DashboardViewModel", "Error loading goals: ${e.message}", e)
                }
            } else {
                android.util.Log.w("DashboardViewModel", "No user data found in SharedPreferences")
            }
        } catch (e: Exception) {
            android.util.Log.e("DashboardViewModel", "Error in loadUser: ${e.message}", e)
        }
    }
    
    private fun loadGoals() {
        viewModelScope.launch {
            try {
                val userId = _user.value?.id
                android.util.Log.d("DashboardViewModel", "=== LOADING GOALS ===")
                android.util.Log.d("DashboardViewModel", "User ID: $userId")
                if (userId != null) {
                    android.util.Log.d("DashboardViewModel", "Fetching goals from API...")
                    val allGoals = apiService.getGoals(userId)
                    android.util.Log.d("DashboardViewModel", "API returned ${allGoals.size} goals")
                    // Filter to only show active goals on dashboard
                    val activeGoals = allGoals.filter { it.isActive && !it.isCompleted }
                    _goals.value = activeGoals
                    android.util.Log.d("DashboardViewModel", "✅ Loaded ${activeGoals.size} active goals (${allGoals.size} total)")
                    
                    // Log each goal
                    activeGoals.forEachIndexed { index, goal ->
                        android.util.Log.d("DashboardViewModel", "Goal $index: ${goal.title} - ${goal.type}")
                    }
                } else {
                    android.util.Log.w("DashboardViewModel", "❌ Cannot load goals: User ID is null")
                    android.util.Log.w("DashboardViewModel", "User object: ${_user.value}")
                }
            } catch (e: com.google.gson.JsonSyntaxException) {
                android.util.Log.e("DashboardViewModel", "❌ JSON parsing error loading goals: ${e.message}", e)
                android.util.Log.e("DashboardViewModel", "Backend may have returned HTML or invalid JSON")
                _goals.value = emptyList()
            } catch (e: retrofit2.HttpException) {
                val errorBody = try {
                    e.response()?.errorBody()?.string() ?: "No error body"
                } catch (ex: Exception) {
                    "Could not read error body"
                }
                android.util.Log.e("DashboardViewModel", "❌ HTTP ${e.code()} loading goals: ${e.message()}", e)
                android.util.Log.e("DashboardViewModel", "Error body: $errorBody")
                if (e.code() == 404) {
                    // No goals yet - this is okay
                    _goals.value = emptyList()
                    android.util.Log.d("DashboardViewModel", "No goals found (404) - setting empty list")
                }
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "❌ Failed to load goals: ${e.javaClass.simpleName} - ${e.message}", e)
                e.printStackTrace()
            }
        }
    }
    
    fun checkLocationPermission() {
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        android.util.Log.d("DashboardViewModel", "Location permission status: $hasPermission")
        _hasLocationPermission.value = hasPermission
    }

    private fun updateTime() {
        val sdf = SimpleDateFormat("h:mm a", Locale.getDefault())
        _currentTime.value = sdf.format(Date())
    }

    fun onDistanceChanged(distance: Float) {
        _targetDistance.value = distance
    }

    fun onTargetTimeToggled(enabled: Boolean) {
        _isTargetTimeEnabled.value = enabled
    }

    fun onTargetHoursChanged(hours: String) {
        _targetHours.value = hours
    }

    fun onTargetMinutesChanged(minutes: String) {
        _targetMinutes.value = minutes
    }

    fun onTargetSecondsChanged(seconds: String) {
        _targetSeconds.value = seconds
    }

    fun fetchRecentRun() {
        viewModelScope.launch {
            try {
                val userId = _user.value?.id
                if (userId != null) {
                    android.util.Log.d("DashboardViewModel", "Fetching runs for user: $userId")
                    val runs = apiService.getRunsForUser(userId)
                    _recentRun.value = runs.maxByOrNull { it.startTime }
                    android.util.Log.d("DashboardViewModel", "Fetched ${runs.size} runs, most recent: ${_recentRun.value?.id}")
                } else {
                    android.util.Log.w("DashboardViewModel", "Cannot fetch runs: User ID is null")
                }
            } catch (e: Exception) {
                android.util.Log.e("DashboardViewModel", "Failed to fetch recent run: ${e.message}", e)
            }
        }
    }
    
    // Public method to refresh goals (e.g., when returning from goals screen)
    fun refreshGoals() {
        loadGoals()
    }
    
    fun toggleAiCoach(enabled: Boolean) {
        _isAiCoachEnabled.value = enabled
        sharedPrefs.edit().putBoolean("ai_coach_enabled", enabled).apply()
        android.util.Log.d("DashboardViewModel", "AI Coach ${if (enabled) "enabled" else "disabled"}")
    }

    fun getLastRunSession(): RunSession? {
        return null // Placeholder
    }
}

package live.airuncoach.airuncoach.viewmodel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import live.airuncoach.airuncoach.BuildConfig
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.GarminConnection
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.WeatherRetrofitClient
import live.airuncoach.airuncoach.service.RunTrackingService
import retrofit2.HttpException
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
        RunTrackingService.currentRunSession

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
                Log.e("DashboardViewModel", "Error loading user: ${e.message}", e)
            }
        }
        
        viewModelScope.launch(Dispatchers.IO) {
            try {
                updateTime()
            } catch (e: Exception) {
                Log.e("DashboardViewModel", "Error updating time: ${e.message}", e)
            }
        }
        
        viewModelScope.launch(Dispatchers.IO) {
            try {
                checkLocationPermission()
            } catch (e: Exception) {
                Log.e("DashboardViewModel", "Error checking location permission: ${e.message}", e)
            }
        }
        
        viewModelScope.launch(Dispatchers.IO) {
            try {
                loadAiCoachPreference()
            } catch (e: Exception) {
                Log.e("DashboardViewModel", "Error loading AI coach preference: ${e.message}", e)
            }
        }
        
        viewModelScope.launch {
            try {
                loadWeather()
            } catch (e: Exception) {
                Log.e("DashboardViewModel", "Error loading weather: ${e.message}", e)
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
                    Log.d("DashboardViewModel", "Location: ${location.latitude}, ${location.longitude}")
                    
                    // Fetch weather for actual device location
                    val weather = WeatherRetrofitClient.weatherApiService
                        .getCurrentWeather(
                            latitude = location.latitude,
                            longitude = location.longitude,
                            apiKey = BuildConfig.WEATHER_API_KEY,
                            units = "metric"
                        )
                    
                    _weatherData.value = WeatherData(
                        temperature = weather.main.temperature,
                        condition = weather.weather.firstOrNull()?.main ?: "Clear",
                        description = weather.weather.firstOrNull()?.description ?: "",
                        humidity = weather.main.humidity.toDouble(),
                        windSpeed = weather.wind.speed
                    )
                    Log.d("DashboardViewModel", "Weather loaded for location: ${weather.main.temperature}°C, ${weather.weather.firstOrNull()?.description}")
                } else {
                    Log.w("DashboardViewModel", "Location unavailable, using default weather")
                    setDefaultWeather()
                }
            } catch (e: Exception) {
                Log.e("DashboardViewModel", "Failed to load weather: ${e.message}", e)
                // Don't crash - just set null weather
                _weatherData.value = null
            }
        }
    }
    
    private suspend fun getCurrentLocation(): Location? {
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
            Log.w("DashboardViewModel", "Location permission not granted")
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
            Log.w("DashboardViewModel", "Failed to get current location, trying last known location")
            try {
                // Fallback to last known location
                fusedLocationClient.lastLocation.await()
            } catch (e: Exception) {
                Log.e("DashboardViewModel", "Failed to get last known location: ${e.message}")
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
                Log.d("DashboardViewModel", "User loaded: ${_user.value?.name}")
                // Load goals after user is loaded
                try {
                    loadGoals()
                } catch (e: Exception) {
                    Log.e("DashboardViewModel", "Error loading goals: ${e.message}", e)
                }
                // Load recent run once user is available
                try {
                    fetchRecentRun()
                } catch (e: Exception) {
                    Log.e("DashboardViewModel", "Error loading recent run: ${e.message}", e)
                }
            } else {
                Log.w("DashboardViewModel", "No user data found in SharedPreferences")
            }
        } catch (e: Exception) {
            Log.e("DashboardViewModel", "Error in loadUser: ${e.message}", e)
        }
    }
    
    private fun loadGoals() {
        viewModelScope.launch {
            try {
                val userId = _user.value?.id
                Log.d("DashboardViewModel", "=== LOADING GOALS ===")
                Log.d("DashboardViewModel", "User ID: $userId")
                if (userId != null) {
                    Log.d("DashboardViewModel", "Fetching goals from API...")
                    val allGoals = apiService.getGoals(userId)
                    Log.d("DashboardViewModel", "API returned ${allGoals.size} goals")
                    // Filter to only show active goals on dashboard
                    val activeGoals = allGoals.filter { it.isActive && !it.isCompleted }
                    _goals.value = activeGoals
                    Log.d("DashboardViewModel", "✅ Loaded ${activeGoals.size} active goals (${allGoals.size} total)")
                    
                    // Log each goal
                    activeGoals.forEachIndexed { index, goal ->
                        Log.d("DashboardViewModel", "Goal $index: ${goal.title} - ${goal.type}")
                    }
                } else {
                    Log.w("DashboardViewModel", "❌ Cannot load goals: User ID is null")
                    Log.w("DashboardViewModel", "User object: ${_user.value}")
                }
            } catch (e: JsonSyntaxException) {
                Log.e("DashboardViewModel", "❌ JSON parsing error loading goals: ${e.message}", e)
                Log.e("DashboardViewModel", "Backend may have returned HTML or invalid JSON")
                _goals.value = emptyList()
            } catch (e: HttpException) {
                val errorBody = try {
                    e.response()?.errorBody()?.string() ?: "No error body"
                } catch (ex: Exception) {
                    "Could not read error body"
                }
                Log.e("DashboardViewModel", "❌ HTTP ${e.code()} loading goals: ${e.message()}", e)
                Log.e("DashboardViewModel", "Error body: $errorBody")
                if (e.code() == 404) {
                    // No goals yet - this is okay
                    _goals.value = emptyList()
                    Log.d("DashboardViewModel", "No goals found (404) - setting empty list")
                }
            } catch (e: Exception) {
                Log.e("DashboardViewModel", "❌ Failed to load goals: ${e.javaClass.simpleName} - ${e.message}", e)
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
        
        Log.d("DashboardViewModel", "Location permission status: $hasPermission")
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
                    Log.d("DashboardViewModel", "Fetching runs for user: $userId")
                    val runs = apiService.getRunsForUser(userId)
                    _recentRun.value = runs.maxByOrNull { it.startTime }
                    Log.d("DashboardViewModel", "Fetched ${runs.size} runs, most recent: ${_recentRun.value?.id}")
                } else {
                    Log.w("DashboardViewModel", "Cannot fetch runs: User ID is null")
                }
            } catch (e: Exception) {
                Log.e("DashboardViewModel", "Failed to fetch recent run: ${e.message}", e)
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
        Log.d("DashboardViewModel", "AI Coach ${if (enabled) "enabled" else "disabled"}")
    }

    fun getLastRunSession(): RunSession? {
        return null // Placeholder
    }
}

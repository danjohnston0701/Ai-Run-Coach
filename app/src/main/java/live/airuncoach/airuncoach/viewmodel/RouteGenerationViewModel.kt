package live.airuncoach.airuncoach.viewmodel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.RouteGenerationRequest
import live.airuncoach.airuncoach.network.model.RouteOption

/**
 * ViewModel for Route Generation flow
 * Manages user location, route generation, and route selection
 */
class RouteGenerationViewModel(
    private val context: Context,
    private val apiService: ApiService
) : ViewModel() {
    
    // UI State
    private val _uiState = MutableStateFlow<RouteGenerationState>(RouteGenerationState.Setup)
    val uiState: StateFlow<RouteGenerationState> = _uiState.asStateFlow()
    
    // User location
    private val _userLocation = MutableStateFlow<Pair<Double, Double>?>(null)
    val userLocation: StateFlow<Pair<Double, Double>?> = _userLocation.asStateFlow()
    
    // AI Coach enabled state
    private val _aiCoachEnabled = MutableStateFlow(true) // Default enabled
    val aiCoachEnabled: StateFlow<Boolean> = _aiCoachEnabled.asStateFlow()
    
    // Generated routes
    private val _routes = MutableStateFlow<List<RouteOption>>(emptyList())
    val routes: StateFlow<List<RouteOption>> = _routes.asStateFlow()
    
    // Selected route
    private val _selectedRoute = MutableStateFlow<RouteOption?>(null)
    val selectedRoute: StateFlow<RouteOption?> = _selectedRoute.asStateFlow()
    
    // Error message
    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()
    
    init {
        // Get user location on init
        getUserLocation()
    }
    
    /**
     * Get user's current location
     */
    fun getUserLocation() {
        viewModelScope.launch {
            try {
                // Check location permission
                val fineLocationPermission = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION
                )
                
                if (fineLocationPermission != PackageManager.PERMISSION_GRANTED) {
                    _errorMessage.value = "Location permission required"
                    return@launch
                }
                
                val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
                val location = fusedLocationClient.lastLocation.await()
                
                // Force Cambridge, NZ for emulator testing (emulator defaults to California)
                // Check if we're on emulator by seeing if location is near Mountain View, CA
                val isEmulatorLocation = location != null && 
                    (location.latitude > 37.0 && location.latitude < 38.0) &&
                    (location.longitude < -121.0 && location.longitude > -123.0)
                
                if (location != null && !isEmulatorLocation) {
                    android.util.Log.d("RouteGen", "📍 Using actual device location: ${location.latitude}, ${location.longitude}")
                    _userLocation.value = Pair(location.latitude, location.longitude)
                } else {
                    // Default location for emulator/testing (Cambridge, New Zealand)
                    android.util.Log.d("RouteGen", "📍 Using fallback location: Cambridge, NZ")
                    _userLocation.value = Pair(-37.898367, 175.484444)
                }
            } catch (e: Exception) {
                _errorMessage.value = "Failed to get location: ${e.message}"
                // Default location fallback (Cambridge, New Zealand)
                _userLocation.value = Pair(-37.898367, 175.484444)
            }
        }
    }
    
    /**
     * Generate routes from backend
     */
    fun generateRoutes(
        distance: Float,
        activityType: String = "run",
        targetTimeEnabled: Boolean = false,
        hours: Int = 0,
        minutes: Int = 0,
        seconds: Int = 0,
        liveTrackingEnabled: Boolean = false,
        isGroupRun: Boolean = false
    ) {
        viewModelScope.launch {
            try {
                android.util.Log.d("RouteGen", "🗺️ Starting route generation for ${distance}km")
                _uiState.value = RouteGenerationState.Loading
                _errorMessage.value = null
                
                // Get user location if not already available
                if (_userLocation.value == null) {
                    android.util.Log.d("RouteGen", "📍 Getting user location...")
                    getUserLocation()
                }
                
                val location = _userLocation.value ?: run {
                    android.util.Log.e("RouteGen", "❌ Location not available")
                    _errorMessage.value = "Location not available"
                    _uiState.value = RouteGenerationState.Setup
                    return@launch
                }
                
                android.util.Log.d("RouteGen", "📍 Using location: ${location.first}, ${location.second}")
                
                val request = RouteGenerationRequest(
                    startLat = location.first,
                    startLng = location.second,
                    distance = distance.toDouble(),
                    activityType = activityType,
                    avoidHills = false
                )
                
                android.util.Log.d("RouteGen", "🤖 Calling AI Route Generation API:")
                android.util.Log.d("RouteGen", "   📍 Location: ${request.startLat}, ${request.startLng}")
                android.util.Log.d("RouteGen", "   📏 Distance: ${request.distance}km")
                android.util.Log.d("RouteGen", "   🎨 OpenAI designing intelligent circuits")
                android.util.Log.d("RouteGen", "   ✨ Google executing routes with navigation")
                val response = apiService.generateAIRoutes(request)
                
                android.util.Log.d("RouteGen", "✅ Got ${response.routes.size} routes from API")
                
                if (response.routes.isEmpty()) {
                    android.util.Log.w("RouteGen", "⚠️ No routes returned from API")
                    _errorMessage.value = "No routes generated. Try adjusting distance."
                    _uiState.value = RouteGenerationState.Setup
                } else {
                    _routes.value = response.routes
                    _uiState.value = RouteGenerationState.Success(response.routes)
                    android.util.Log.d("RouteGen", "🎉 Route generation successful!")
                }
                
            } catch (e: Exception) {
                android.util.Log.e("RouteGen", "❌ Route generation failed: ${e.message}", e)
                _errorMessage.value = "Failed to generate routes: ${e.message}"
                _uiState.value = RouteGenerationState.Error(e.message ?: "Unknown error")
            }
        }
    }
    
    /**
     * Select a route
     */
    fun selectRoute(route: RouteOption) {
        _selectedRoute.value = route
    }
    
    /**
     * Clear selected route
     */
    fun clearSelectedRoute() {
        _selectedRoute.value = null
    }
    
    /**
     * Regenerate routes with same parameters
     */
    fun regenerateRoutes() {
        // Will trigger route generation again
        _uiState.value = RouteGenerationState.Setup
        _routes.value = emptyList()
        _selectedRoute.value = null
    }
    
    /**
     * Reset to setup state
     */
    fun resetToSetup() {
        _uiState.value = RouteGenerationState.Setup
        _routes.value = emptyList()
        _selectedRoute.value = null
        _errorMessage.value = null
    }
    
    /**
     * Clear error message
     */
    fun clearError() {
        _errorMessage.value = null
    }
    
    /**
     * Toggle AI Coach enabled/disabled
     * When disabled, AI features (voice coaching, real-time feedback) are turned off
     */
    fun toggleAiCoach() {
        _aiCoachEnabled.value = !_aiCoachEnabled.value
        android.util.Log.d("RouteGen", "🤖 AI Coach ${if (_aiCoachEnabled.value) "ENABLED" else "DISABLED"}")
    }
}

/**
 * UI State for route generation flow
 */
sealed class RouteGenerationState {
    object Setup : RouteGenerationState()
    object Loading : RouteGenerationState()
    data class Success(val routes: List<RouteOption>) : RouteGenerationState()
    data class Error(val message: String) : RouteGenerationState()
}

/**
 * Factory for creating RouteGenerationViewModel
 */
class RouteGenerationViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(RouteGenerationViewModel::class.java)) {
            val sessionManager = SessionManager(context)
            val apiService = RetrofitClient(context, sessionManager).instance
            return RouteGenerationViewModel(context, apiService) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}

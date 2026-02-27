package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.GeneratedRoute
import live.airuncoach.airuncoach.domain.model.LatLng
import live.airuncoach.airuncoach.domain.model.RouteDifficulty
import live.airuncoach.airuncoach.domain.model.TurnInstruction
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.RouteGenerationRequest
import live.airuncoach.airuncoach.network.model.RouteOption
import live.airuncoach.airuncoach.network.model.IntelligentRouteRequest
import live.airuncoach.airuncoach.network.model.IntelligentRoute
import retrofit2.HttpException
import java.net.ConnectException
import java.net.SocketTimeoutException
import javax.inject.Inject

@HiltViewModel
class RouteGenerationViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _routes = MutableStateFlow<List<GeneratedRoute>>(emptyList())
    val routes: StateFlow<List<GeneratedRoute>> = _routes.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun generateRoutes(request: RouteGenerationRequest) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val response = apiService.generateAIRoutes(request)
                _routes.value = response.routes.map { it.toGeneratedRoute() }
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Generate intelligent routes using GraphHopper + OSM intelligence
     * Returns 3 validated circuit routes with no dead ends
     */
    fun generateIntelligentRoutes(
        latitude: Double,
        longitude: Double,
        distanceKm: Double,
        activityType: String = "run",
        preferTrails: Boolean = true,
        avoidHills: Boolean = false,
        targetTime: Int? = null,
        aiCoachEnabled: Boolean = true
    ) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            
            Log.d("RouteGeneration", "🚀 Starting GraphHopper route generation...")
            Log.d("RouteGeneration", "📍 Location: ($latitude, $longitude)")
            Log.d("RouteGeneration", "📏 Distance: ${distanceKm}km")
            Log.d("RouteGeneration", "🌲 Prefer trails: $preferTrails")
            Log.d("RouteGeneration", "⛰️ Avoid hills: $avoidHills")
            
            try {
                val request = IntelligentRouteRequest(
                    latitude = latitude,
                    longitude = longitude,
                    distanceKm = distanceKm,
                    activityType = activityType,
                    preferTrails = preferTrails,
                    avoidHills = avoidHills,
                    targetTime = targetTime,
                    aiCoachEnabled = aiCoachEnabled
                )
                
                Log.d("RouteGeneration", "📡 Sending request to /api/routes/generate-intelligent...")
                val response = apiService.generateIntelligentRoutes(request)
                
                Log.d("RouteGeneration", "✅ Received ${response.routes.size} routes from GraphHopper")
                _routes.value = response.routes.map { it.toGeneratedRoute() }
                Log.d("RouteGeneration", "🎉 Routes converted successfully!")
            } catch (e: SocketTimeoutException) {
                val errorMsg = "Request timed out. The backend or routing service may be slow. Please try again."
                _error.value = errorMsg
                Log.e("RouteGeneration", "⏱️ TIMEOUT ERROR", e)
            } catch (e: ConnectException) {
                val errorMsg = "Cannot connect to backend. Please check your internet connection."
                _error.value = errorMsg
                Log.e("RouteGeneration", "🔌 CONNECTION ERROR", e)
            } catch (e: HttpException) {
                // Try to extract the server error message for user-friendly errors
                var serverMessage: String? = null
                try {
                    val errorBody = e.response()?.errorBody()?.string()
                    if (errorBody != null) {
                        Log.e("RouteGeneration", "Error response: $errorBody")
                        // Parse JSON error body to get the message
                        val jsonObj = org.json.JSONObject(errorBody)
                        serverMessage = jsonObj.optString("error", "").ifEmpty { null }
                    }
                } catch (ex: Exception) {
                    Log.e("RouteGeneration", "Could not read error body", ex)
                }

                val errorMsg = when (e.code()) {
                    400 -> serverMessage ?: "Unable to generate routes in this area. The location may not have enough suitable paths or roads for a ${distanceKm}km route."
                    422 -> serverMessage ?: "No suitable running routes found in this area. Try a different distance or location with more connected paths and trails."
                    404 -> "Route generation service not found. Please try again later."
                    500 -> "Server error while generating routes. Please try again."
                    503 -> "Route generation service is temporarily unavailable. Please try again later."
                    else -> "Failed to generate routes (HTTP ${e.code()}). Please try again."
                }
                _error.value = errorMsg
                Log.e("RouteGeneration", "❌ HTTP ERROR ${e.code()}: ${e.message()}", e)
            } catch (e: Exception) {
                _error.value = "An unexpected error occurred while generating routes. Please try again."
                Log.e("RouteGeneration", "❌ UNEXPECTED ERROR: ${e.message}", e)
                e.printStackTrace()
            } finally {
                _isLoading.value = false
                Log.d("RouteGeneration", "🏁 Generation finished")
            }
        }
    }
    
    fun clearRoutes() {
        _routes.value = emptyList()
    }

    private fun RouteOption.toGeneratedRoute(): GeneratedRoute {
        return GeneratedRoute(
            id = this.id ?: "route-${System.currentTimeMillis()}",
            name = this.name,
            distance = this.distance,
            duration = this.estimatedTime,
            polyline = this.polyline,
            waypoints = this.waypoints.map { LatLng(it.lat, it.lng) },
            difficulty = when (this.difficulty.lowercase()) {
                "easy" -> RouteDifficulty.EASY
                "moderate" -> RouteDifficulty.MODERATE
                "hard" -> RouteDifficulty.HARD
                else -> RouteDifficulty.MODERATE
            },
            elevationGain = this.elevation?.gain ?: 0.0,
            elevationLoss = this.elevation?.loss ?: 0.0,
            maxGradientPercent = 0.0,
            maxGradientDegrees = 0.0,
            instructions = emptyList(),
            turnInstructions = this.turnInstructions?.map { 
                TurnInstruction(
                    instruction = it.instruction,
                    latitude = it.lat,
                    longitude = it.lng,
                    distance = it.distance ?: 0.0
                )
            } ?: emptyList(),
            backtrackRatio = 0.0,
            angularSpread = 0.0,
            templateName = this.name,
            hasMajorRoads = this.hasMajorRoads ?: false
        )
    }

    /**
     * Convert IntelligentRoute (from GraphHopper) to GeneratedRoute (for UI)
     */
    private fun IntelligentRoute.toGeneratedRoute(): GeneratedRoute {
        val distanceKm = (distance ?: 5000.0) / 1000.0
        val durationMinutes = (estimatedTime ?: 30.0) / 60
        val difficultyStr = difficulty ?: "moderate"
        
        return GeneratedRoute(
            id = this.id ?: "unknown",
            name = "Route ${(distanceKm).toInt()}km - ${difficultyStr.replaceFirstChar { it.uppercase() }}",
            distance = distanceKm, // Convert meters to kilometers
            duration = durationMinutes, // Convert seconds to minutes
            polyline = this.polyline ?: "",
            waypoints = emptyList(), // GraphHopper routes are circuits, waypoints in polyline
            difficulty = when (difficultyStr.lowercase()) {
                "easy" -> RouteDifficulty.EASY
                "moderate" -> RouteDifficulty.MODERATE
                "hard" -> RouteDifficulty.HARD
                else -> RouteDifficulty.MODERATE
            },
            elevationGain = this.elevationGain ?: 0.0, // Already in meters
            elevationLoss = this.elevationLoss ?: 0.0, // Already in meters
            maxGradientPercent = 0.0, // Could be calculated from elevation data
            maxGradientDegrees = 0.0,
            instructions = listOf("Circuit route - %.1f km, ~$durationMinutes minutes".format(distanceKm)),
            turnInstructions = emptyList(), // Turn-by-turn available from backend if needed
            backtrackRatio = 1.0 - (qualityScore ?: 0.5), // Quality score inverted
            angularSpread = (popularityScore ?: 0.5) * 360.0, // Use popularity as spread indicator
            templateName = "Intelligent Route",
            hasMajorRoads = false // GraphHopper uses foot/hike profile
        )
    }
}

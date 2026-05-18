package live.airuncoach.android.strava

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import android.content.Context
import android.content.Intent
import android.net.Uri
import dagger.hilt.android.lifecycle.HiltViewModel
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

data class StravaConnection(
    val connected: Boolean,
    val athleteName: String? = null,
    val athleteId: String? = null,
    val lastSync: String? = null,
    val tokenExpired: Boolean = false
)

data class StravaPublishResult(
    val success: Boolean,
    val uploadId: Long? = null,
    val activityId: String? = null,
    val stravaUrl: String? = null,
    val message: String? = null,
    val error: String? = null
)

data class StravaActivity(
    val id: String,
    val name: String,
    val distance: Double,
    val duration: Int,
    val completedAt: String,
    val stravaUrl: String,
    val stravaId: String
)

@HiltViewModel
class StravaViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _connectionStatus = MutableStateFlow<StravaConnection>(
        StravaConnection(connected = false)
    )
    val connectionStatus: StateFlow<StravaConnection> = _connectionStatus

    private val _publishResult = MutableStateFlow<StravaPublishResult?>(null)
    val publishResult: StateFlow<StravaPublishResult?> = _publishResult

    private val _stravaActivities = MutableStateFlow<List<StravaActivity>>(emptyList())
    val stravaActivities: StateFlow<List<StravaActivity>> = _stravaActivities

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    init {
        checkStravaConnection()
    }

    /**
     * Check current Strava connection status
     */
    fun checkStravaConnection() {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                val response = apiService.checkStravaConnection()
                _connectionStatus.value = StravaConnection(
                    connected = response.connected,
                    athleteName = response.athleteName,
                    athleteId = response.athleteId,
                    lastSync = response.lastSync,
                    tokenExpired = response.tokenExpired
                )
                _error.value = null
            } catch (e: Exception) {
                _error.value = "Failed to check Strava connection: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Initiate Strava OAuth flow
     */
    fun initiateStravaAuth(context: Context) {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                val response = apiService.initiateStravaAuth()
                
                if (response.authUrl.isNotEmpty()) {
                    // Open Strava OAuth in browser
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(response.authUrl))
                    context.startActivity(intent)
                } else {
                    _error.value = "Failed to get Strava auth URL"
                }
            } catch (e: Exception) {
                _error.value = "Failed to initiate Strava auth: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Disconnect Strava account
     */
    fun disconnectStrava() {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                apiService.disconnectStrava()
                _connectionStatus.value = StravaConnection(connected = false)
                _stravaActivities.value = emptyList()
                _error.value = null
            } catch (e: Exception) {
                _error.value = "Failed to disconnect Strava: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Publish a run to Strava
     */
    fun publishToStrava(runId: String) {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                _publishResult.value = null
                
                val response = apiService.publishRunToStrava(runId)
                
                _publishResult.value = StravaPublishResult(
                    success = response.success,
                    activityId = response.activityId,
                    stravaUrl = response.stravaUrl,
                    error = response.error
                )
                _error.value = null
                
                // Refresh activities list after a delay to allow Strava to process
                if (response.success) {
                    kotlinx.coroutines.delay(3000)
                    fetchStravaActivities()
                }
            } catch (e: Exception) {
                _publishResult.value = StravaPublishResult(
                    success = false,
                    error = "Failed to publish run: ${e.message}"
                )
                _error.value = "Failed to publish run: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Fetch list of published Strava activities
     */
    fun fetchStravaActivities() {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                
                val response = apiService.getStravaActivities()
                
                val activities = response.activities.mapNotNull { activity ->
                    try {
                        StravaActivity(
                            id = activity.id,
                            name = activity.name,
                            distance = activity.distance,
                            duration = activity.duration,
                            completedAt = activity.completedAt,
                            stravaUrl = activity.stravaUrl,
                            stravaId = activity.stravaId
                        )
                    } catch (e: Exception) {
                        null
                    }
                }
                
                _stravaActivities.value = activities
                _error.value = null
            } catch (e: Exception) {
                _error.value = "Failed to fetch Strava activities: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Clear error message
     */
    fun clearError() {
        _error.value = null
    }

    /**
     * Clear publish result
     */
    fun clearPublishResult() {
        _publishResult.value = null
    }
}

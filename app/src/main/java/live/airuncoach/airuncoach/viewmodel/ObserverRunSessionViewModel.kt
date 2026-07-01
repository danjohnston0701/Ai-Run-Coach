package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.ui.screens.GpsPoint
import live.airuncoach.airuncoach.ui.screens.ObserverLiveRunSession
import javax.inject.Inject

@HiltViewModel
class ObserverRunSessionViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _liveSession = MutableStateFlow<ObserverLiveRunSession?>(null)
    val liveSession = _liveSession.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private var pollingJob: kotlinx.coroutines.Job? = null

    fun loadRunnerSession(sessionId: String) {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                _error.value = null

                Log.d("ObserverVM", "Fetching live session: $sessionId")
                val session = apiService.getLiveSession(sessionId)
                
                // Convert from API response to UI model
                val uiSession = convertToObserverSession(session)
                _liveSession.value = uiSession

                Log.d("ObserverVM", "Session loaded. hasStarted=${uiSession.hasStarted}")

                // Start polling for updates if session is active
                if (uiSession.hasStarted && uiSession.id.isNotBlank()) {
                    startPollingUpdates(sessionId)
                } else if (!uiSession.hasStarted) {
                    // Poll while waiting for start
                    startWaitingPolling(sessionId)
                }

                _isLoading.value = false
            } catch (e: Exception) {
                Log.e("ObserverVM", "Failed to load session: ${e.message}", e)
                _error.value = "Failed to load session: ${e.message}"
                _isLoading.value = false
            }
        }
    }

    private fun startPollingUpdates(sessionId: String) {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (isActive && _liveSession.value?.isActive != false) {
                try {
                    delay(2000)  // Poll every 2 seconds
                    val updated = apiService.getLiveSession(sessionId)
                    val uiSession = convertToObserverSession(updated)
                    _liveSession.value = uiSession
                    Log.d("ObserverVM", "Updated session: distance=${uiSession.distanceCovered}km, time=${uiSession.elapsedTime}s, active=${uiSession.isActive}")
                    // Stop polling once the run has ended
                    if (!uiSession.isActive) {
                        Log.d("ObserverVM", "Run ended — stopping poll")
                        break
                    }
                } catch (e: Exception) {
                    Log.w("ObserverVM", "Failed to fetch updates: ${e.message}")
                    // Continue polling on error
                }
            }
        }
    }

    private fun startWaitingPolling(sessionId: String) {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (isActive && _liveSession.value?.hasStarted != true) {
                try {
                    delay(3000)  // Poll every 3 seconds while waiting
                    val updated = apiService.getLiveSession(sessionId)
                    val uiSession = convertToObserverSession(updated)
                    _liveSession.value = uiSession
                    
                    // If runner has started, switch to active polling
                    if (uiSession.hasStarted) {
                        Log.d("ObserverVM", "Runner started! Switching to active polling")
                        startPollingUpdates(sessionId)
                    }
                } catch (e: Exception) {
                    Log.w("ObserverVM", "Failed to fetch updates while waiting: ${e.message}")
                }
            }
        }
    }

    private fun convertToObserverSession(apiResponse: LiveSessionApiResponse): ObserverLiveRunSession {
        return ObserverLiveRunSession(
            id = apiResponse.id,
            userId = apiResponse.userId,
            runnerName = apiResponse.runnerName ?: "Runner",
            currentLat = when (apiResponse.currentLat) {
                is Double -> apiResponse.currentLat
                is String -> (apiResponse.currentLat as String).toDoubleOrNull()
                else -> null
            },
            currentLng = when (apiResponse.currentLng) {
                is Double -> apiResponse.currentLng
                is String -> (apiResponse.currentLng as String).toDoubleOrNull()
                else -> null
            },
            distanceCovered = when (apiResponse.distanceCovered) {
                is Double -> apiResponse.distanceCovered
                is String -> (apiResponse.distanceCovered as String).toDoubleOrNull() ?: 0.0
                is Number -> apiResponse.distanceCovered.toDouble()
                else -> 0.0
            },
            elapsedTime = when (apiResponse.elapsedTime) {
                is Int -> apiResponse.elapsedTime
                is String -> (apiResponse.elapsedTime as String).toIntOrNull() ?: 0
                is Number -> apiResponse.elapsedTime.toInt()
                else -> 0
            },
            currentPace = apiResponse.currentPace,
            currentHeartRate = when (apiResponse.currentHeartRate) {
                is Int -> apiResponse.currentHeartRate
                is String -> (apiResponse.currentHeartRate as String).toIntOrNull()
                is Number -> apiResponse.currentHeartRate.toInt()
                else -> null
            },
            hasStarted = apiResponse.hasStarted ?: false,
            isActive = apiResponse.isActive ?: true,
            startedAt = when (apiResponse.startedAt) {
                is Long -> apiResponse.startedAt
                is String -> (apiResponse.startedAt as String).toLongOrNull()
                is Number -> apiResponse.startedAt.toLong()
                else -> null
            },
            routeId = apiResponse.routeId,
            gpsTrack = parseGpsTrack(apiResponse.gpsTrack)
        )
    }

    private fun parseGpsTrack(gpsTrackJson: Any?): List<GpsPoint>? {
        return try {
            if (gpsTrackJson == null) return null
            
            when (gpsTrackJson) {
                is List<*> -> {
                    gpsTrackJson.mapNotNull { point ->
                        if (point is Map<*, *>) {
                            try {
                                GpsPoint(
                                    lat = (point["lat"] as? Number)?.toDouble() ?: 0.0,
                                    lng = (point["lng"] as? Number)?.toDouble() ?: 0.0,
                                    timestamp = (point["timestamp"] as? Number)?.toLong() ?: 0L,
                                    altitude = (point["altitude"] as? Number)?.toDouble()
                                )
                            } catch (e: Exception) {
                                Log.w("ObserverVM", "Failed to parse GPS point: $point", e)
                                null
                            }
                        } else null
                    }
                }
                else -> null
            }
        } catch (e: Exception) {
            Log.w("ObserverVM", "Failed to parse GPS track: $gpsTrackJson", e)
            null
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollingJob?.cancel()
    }
}

// API response data class - matches what the server returns
data class LiveSessionApiResponse(
    val id: String,
    val userId: String,
    val runnerName: String? = null,
    val currentLat: Any?,  // Could be Double or String
    val currentLng: Any?,  // Could be Double or String
    val currentPace: String?,
    val currentHeartRate: Any?,  // Could be Int or String
    val elapsedTime: Any?,  // Could be Int or String
    val distanceCovered: Any?,  // Could be Double or String
    val hasStarted: Boolean?,
    val startedAt: Any?,
    val sessionKey: String? = null,
    val difficulty: String? = null,
    val cadence: Int? = null,
    val gpsTrack: Any? = null,  // JSONB parsed as List or Map
    val kmSplits: Any? = null,
    val routeId: String? = null,
    val sharedWithFriends: Boolean? = null,
    val isActive: Boolean? = null,
    val observers: Any? = null,
    val lastSyncedAt: String? = null
)

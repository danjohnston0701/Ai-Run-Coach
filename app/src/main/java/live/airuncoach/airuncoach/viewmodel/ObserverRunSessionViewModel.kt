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

                // Register this user as an active viewer so the runner's panel
                // shows real viewer count (not just invited observers)
                try {
                    apiService.joinLiveSession(sessionId)
                    Log.d("ObserverVM", "Joined live session: $sessionId")
                } catch (e: Exception) {
                    Log.w("ObserverVM", "joinLiveSession failed (non-fatal): ${e.message}")
                    // Non-fatal — continue loading the session
                }

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
                    // Stop polling once the run has ended — after a short grace period for the
                    // runner's phone to link the session to its uploaded run (resultRunId),
                    // which lands a few seconds after the end sync once the upload completes.
                    if (!uiSession.isActive) {
                        Log.d("ObserverVM", "Run ended — polling briefly for the result run link")
                        awaitResultRunLink(sessionId)
                        break
                    }
                } catch (e: Exception) {
                    Log.w("ObserverVM", "Failed to fetch updates: ${e.message}")
                    // Continue polling on error
                }
            }
        }
    }

    /** Up to ~90 s of 3 s polls after the run ends, stopping as soon as resultRunId appears. */
    private suspend fun awaitResultRunLink(sessionId: String) {
        if (_liveSession.value?.resultRunId != null) return
        repeat(30) {
            delay(3000)
            try {
                val uiSession = convertToObserverSession(apiService.getLiveSession(sessionId))
                _liveSession.value = uiSession
                if (uiSession.resultRunId != null) {
                    Log.d("ObserverVM", "Result run linked: ${uiSession.resultRunId}")
                    return
                }
            } catch (e: Exception) {
                Log.w("ObserverVM", "Result-run link poll failed: ${e.message}")
            }
        }
        Log.d("ObserverVM", "No result run link within grace period — stopping poll")
    }

    private fun startWaitingPolling(sessionId: String) {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (isActive && _liveSession.value?.hasStarted != true && _liveSession.value?.isActive != false) {
                try {
                    delay(3000)  // Poll every 3 seconds while waiting
                    val updated = apiService.getLiveSession(sessionId)
                    val uiSession = convertToObserverSession(updated)
                    _liveSession.value = uiSession

                    // Runner cancelled before starting (or the server timed the session out) —
                    // the screen shows its ended state; nothing more to poll for.
                    if (!uiSession.isActive) {
                        Log.d("ObserverVM", "Session ended before it started — stopping wait poll")
                        break
                    }
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
            gpsTrack = parseGpsTrack(apiResponse.gpsTrack),
            isPaused = apiResponse.isPaused ?: false,
            resultRunId = apiResponse.resultRunId,
            lastSyncedAtMs = parseIsoMillis(apiResponse.lastSyncedAt)
        )
    }

    /** Server timestamps arrive as ISO-8601 strings (Drizzle `timestamp` → JSON). */
    private fun parseIsoMillis(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        return try {
            java.time.OffsetDateTime.parse(value).toInstant().toEpochMilli()
        } catch (e: Exception) {
            try {
                java.time.Instant.parse(value).toEpochMilli()
            } catch (e2: Exception) {
                null
            }
        }
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
    val observers: Any? = null,       // list of invited observers
    val viewerCount: Int? = null,     // DB column — defaults to 0 and nothing writes it (the /join endpoint it was for doesn't exist)
    // The server's real live count, computed passively from who polled GET /api/live-sessions/:id
    // in the last 10 s (observer-tracking.ts) and bolted onto the response in snake_case
    // (routes.ts `responseSession.observer_count = ...`). This is the one to trust.
    @com.google.gson.annotations.SerializedName("observer_count") val observerCount: Int? = null,
    val lastSyncedAt: String? = null,
    val isPaused: Boolean? = null,
    val resultRunId: String? = null    // set by the runner's phone after upload — opens the full run summary
)

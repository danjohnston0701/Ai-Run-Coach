package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.GarminAuthManager
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.util.GarminConnectionState
import live.airuncoach.airuncoach.util.StravaConnectionState
import javax.inject.Inject

@HiltViewModel
class ConnectedDevicesViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val garminAuthManager: GarminAuthManager,
    private val apiService: ApiService
) : ViewModel() {

    // ── Garmin ────────────────────────────────────────────────────────────────

    private val _garminConnectionStatus = MutableStateFlow("disconnected")
    val garminConnectionStatus: StateFlow<String> = _garminConnectionStatus

    private val _garminDeviceName = MutableStateFlow("")
    val garminDeviceName: StateFlow<String> = _garminDeviceName

    // ── Strava ────────────────────────────────────────────────────────────────

    private val _stravaConnected = MutableStateFlow(false)
    val stravaConnected: StateFlow<Boolean> = _stravaConnected

    private val _stravaAthleteName = MutableStateFlow<String?>(null)
    val stravaAthleteName: StateFlow<String?> = _stravaAthleteName

    private val _stravaImportStatus = MutableStateFlow<String?>(null)
    val stravaImportStatus: StateFlow<String?> = _stravaImportStatus

    private val _stravaLoading = MutableStateFlow(false)
    val stravaLoading: StateFlow<Boolean> = _stravaLoading

    companion object {
        private const val TAG = "ConnectedDevicesVM"
    }

    init {
        checkGarminConnection()
        checkStravaConnection()

        // Re-check whenever MainActivity signals a successful Garmin OAuth callback
        viewModelScope.launch {
            GarminConnectionState.refreshTick.collect { tick ->
                if (tick > 0) checkGarminConnection()
            }
        }

        // Re-check whenever MainActivity signals a successful Strava OAuth callback
        viewModelScope.launch {
            StravaConnectionState.refreshTick.collect { tick ->
                if (tick > 0) checkStravaConnection()
            }
        }
    }

    // ── Garmin methods ────────────────────────────────────────────────────────

    private fun checkGarminConnection() {
        viewModelScope.launch {
            try {
                val devices = apiService.getConnectedDevices()
                val garminDevice = devices.find { it.deviceType == "garmin" && it.isActive == true }
                _garminConnectionStatus.value = if (garminDevice != null) "connected" else "disconnected"
                _garminDeviceName.value = garminDevice?.deviceName ?: ""
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Garmin connection", e)
                _garminConnectionStatus.value = "disconnected"
                _garminDeviceName.value = ""
            }
        }
    }

    fun connectGarmin(historyDays: Int = 30) {
        viewModelScope.launch {
            try {
                val appRedirect = "airuncoach://connected-devices"
                val response = apiService.initiateGarminAuth(appRedirect, historyDays)
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(response.authUrl))
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error initiating Garmin connection", e)
                _garminConnectionStatus.value = "error"
            }
        }
    }

    fun disconnectGarmin() {
        viewModelScope.launch {
            try {
                Log.d(TAG, "Disconnecting Garmin device...")
                apiService.disconnectGarminDevice()
                Log.d(TAG, "Garmin disconnected successfully")
                _garminConnectionStatus.value = "disconnected"
                _garminDeviceName.value = ""
            } catch (e: Exception) {
                Log.e(TAG, "Error disconnecting Garmin device", e)
                _garminConnectionStatus.value = "disconnected"
                _garminDeviceName.value = ""
            }
        }
    }

    fun refreshGarminStatus() {
        Log.d(TAG, "Refreshing Garmin connection status...")
        checkGarminConnection()
    }

    // ── Strava methods ────────────────────────────────────────────────────────

    fun checkStravaConnection() {
        viewModelScope.launch {
            try {
                val status = apiService.checkStravaConnection()
                _stravaConnected.value = status.connected
                _stravaAthleteName.value = status.athleteName
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Strava connection", e)
                _stravaConnected.value = false
                _stravaAthleteName.value = null
            }
        }
    }

    fun connectStrava() {
        viewModelScope.launch {
            try {
                _stravaLoading.value = true
                val response = apiService.initiateStravaAuth()
                if (response.authUrl.isNotEmpty()) {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(response.authUrl))
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    context.startActivity(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error initiating Strava connection", e)
            } finally {
                _stravaLoading.value = false
            }
        }
    }

    fun disconnectStrava() {
        viewModelScope.launch {
            try {
                _stravaLoading.value = true
                apiService.disconnectStrava()
                _stravaConnected.value = false
                _stravaAthleteName.value = null
                Log.d(TAG, "Strava disconnected successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Error disconnecting Strava", e)
                // Still clear local state so the UI reflects disconnected
                _stravaConnected.value = false
                _stravaAthleteName.value = null
            } finally {
                _stravaLoading.value = false
            }
        }
    }

    fun importStravaHistory() {
        viewModelScope.launch {
            try {
                _stravaLoading.value = true
                _stravaImportStatus.value = "importing"
                val response = apiService.importStravaHistory()
                _stravaImportStatus.value = if (response.success)
                    "Imported ${response.imported} runs from Strava"
                else
                    "Import failed: ${response.error}"
            } catch (e: Exception) {
                Log.e(TAG, "Error importing Strava history", e)
                _stravaImportStatus.value = "Import failed: ${e.message}"
            } finally {
                _stravaLoading.value = false
            }
        }
    }

    fun clearStravaImportStatus() {
        _stravaImportStatus.value = null
    }
}

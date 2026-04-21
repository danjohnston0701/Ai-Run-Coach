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
import javax.inject.Inject

@HiltViewModel
class ConnectedDevicesViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val garminAuthManager: GarminAuthManager,
    private val apiService: ApiService
) : ViewModel() {

    private val _garminConnectionStatus = MutableStateFlow("disconnected")
    val garminConnectionStatus: StateFlow<String> = _garminConnectionStatus

    companion object {
        private const val TAG = "ConnectedDevicesVM"
    }

    init {
        checkGarminConnection()
        // Re-check whenever MainActivity signals a successful Garmin OAuth callback
        viewModelScope.launch {
            GarminConnectionState.refreshTick.collect { tick ->
                if (tick > 0) checkGarminConnection()
            }
        }
    }

    private fun checkGarminConnection() {
        viewModelScope.launch {
            try {
                // Check if connected via API
                val devices = apiService.getConnectedDevices()
                val hasGarmin = devices.any { it.deviceType == "garmin" && it.isActive == true }
                _garminConnectionStatus.value = if (hasGarmin) "connected" else "disconnected"
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Garmin connection", e)
                _garminConnectionStatus.value = "disconnected"
            }
        }
    }

    fun connectGarmin(historyDays: Int = 30) {
        viewModelScope.launch {
            try {
                // Call backend to initiate OAuth with history_days parameter
                val appRedirect = "airuncoach://connected-devices"
                val response = apiService.initiateGarminAuth(appRedirect, historyDays)
                
                // Open the auth URL in browser
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
                
                // Get connected devices
                val devices = apiService.getConnectedDevices()
                val garminDevice = devices.find { it.deviceType == "garmin" && it.isActive == true }
                
                if (garminDevice != null) {
                    // Call backend to disconnect the device
                    apiService.disconnectDevice(garminDevice.id)
                    Log.d(TAG, "Garmin device disconnected successfully")
                    _garminConnectionStatus.value = "disconnected"
                } else {
                    Log.w(TAG, "No active Garmin device found to disconnect")
                    _garminConnectionStatus.value = "disconnected"
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error disconnecting Garmin device", e)
                // Still update status to allow retry
                _garminConnectionStatus.value = "disconnected"
            }
        }
    }

    /**
     * Refresh the Garmin connection status from the server.
     * Call this when returning from OAuth flow or after a deep link callback.
     */
    fun refreshGarminStatus() {
        Log.d(TAG, "Refreshing Garmin connection status...")
        checkGarminConnection()
    }
}

package live.airuncoach.airuncoach.viewmodel

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.GarminAuthManager
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

@HiltViewModel
class ConnectedDevicesViewModel @Inject constructor(
    application: Application,
    private val garminAuthManager: GarminAuthManager,
    private val apiService: ApiService
) : AndroidViewModel(application) {

    private val _garminConnectionStatus = MutableStateFlow("disconnected")
    val garminConnectionStatus: StateFlow<String> = _garminConnectionStatus

    companion object {
        private const val TAG = "ConnectedDevicesVM"
    }

    init {
        checkGarminConnection()
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
                getApplication<Application>().startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error initiating Garmin connection", e)
                _garminConnectionStatus.value = "error"
            }
        }
    }
}

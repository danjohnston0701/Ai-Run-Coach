package live.airuncoach.airuncoach.viewmodel

import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.ConnectedDevice
import live.airuncoach.airuncoach.network.RetrofitClient

data class DeviceUI(
    val id: String?,
    val name: String,
    val description: String,
    val connected: Boolean,
    val deviceType: String,
    val lastSyncAt: String?
)

sealed class DevicesUiState {
    object Loading : DevicesUiState()
    data class Success(val devices: List<DeviceUI>) : DevicesUiState()
    data class Error(val message: String) : DevicesUiState()
}

class ConnectedDevicesViewModel : ViewModel() {

    private val _uiState = MutableStateFlow<DevicesUiState>(DevicesUiState.Loading)
    val uiState: StateFlow<DevicesUiState> = _uiState.asStateFlow()
    
    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()
    
    private val _showCompanionPrompt = MutableStateFlow(false)
    val showCompanionPrompt: StateFlow<Boolean> = _showCompanionPrompt.asStateFlow()
    
    private val apiService = RetrofitClient.apiService

    init {
        loadDevices()
    }
    
    fun checkIfShouldShowCompanionPrompt(justConnected: Boolean = false) {
        viewModelScope.launch {
            try {
                // Check if user has companion app installed
                // For now, show prompt if they just connected and haven't seen it
                if (justConnected) {
                    // TODO: Check SharedPreferences to see if they've dismissed this before
                    _showCompanionPrompt.value = true
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
    
    fun dismissCompanionPrompt() {
        _showCompanionPrompt.value = false
    }
    
    fun onCompanionAppInstalled() {
        _showCompanionPrompt.value = false
        // TODO: Store preference that companion app is installed
    }
    
    fun onMaybeLater() {
        _showCompanionPrompt.value = false
        // TODO: Store preference to show again later
    }

    fun loadDevices() {
        viewModelScope.launch {
            try {
                _uiState.value = DevicesUiState.Loading
                
                val connectedDevices = apiService.getConnectedDevices()
                
                // Create UI list with all possible devices
                val allDevices = mutableListOf<DeviceUI>()
                
                // Garmin
                val garminDevice = connectedDevices.find { device -> 
                    device.deviceType == "garmin" && device.isActive 
                }
                allDevices.add(
                    DeviceUI(
                        id = garminDevice?.id,
                        name = "Garmin",
                        description = if (garminDevice != null) {
                            val syncTime = formatSyncTime(garminDevice.lastSyncAt)
                            "Connected - Last sync: $syncTime"
                        } else {
                            "Connect via OAuth for wellness data & activity sync"
                        },
                        connected = garminDevice != null,
                        deviceType = "garmin",
                        lastSyncAt = garminDevice?.lastSyncAt
                    )
                )
                
                // Samsung (coming soon)
                allDevices.add(
                    DeviceUI(
                        id = null,
                        name = "Samsung Galaxy Watch",
                        description = "Coming soon - Real-time heart rate via Samsung Health SDK",
                        connected = false,
                        deviceType = "samsung",
                        lastSyncAt = null
                    )
                )
                
                // COROS (coming soon)
                allDevices.add(
                    DeviceUI(
                        id = null,
                        name = "COROS",
                        description = "Coming soon - Activity sync via COROS API",
                        connected = false,
                        deviceType = "coros",
                        lastSyncAt = null
                    )
                )
                
                // Strava (coming soon)
                allDevices.add(
                    DeviceUI(
                        id = null,
                        name = "Strava",
                        description = "Coming soon - Activity sync via Strava API",
                        connected = false,
                        deviceType = "strava",
                        lastSyncAt = null
                    )
                )
                
                _uiState.value = DevicesUiState.Success(allDevices)
                
            } catch (e: Exception) {
                e.printStackTrace()
                _uiState.value = DevicesUiState.Error("Failed to load devices: ${e.message}")
            }
        }
    }
    
    fun connectGarmin(): Intent? {
        // This function should not be synchronous - we need to make an API call first
        // Instead, we'll handle this in connectGarminAsync()
        return null
    }
    
    fun connectGarminAsync(onAuthUrlReceived: (String) -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                // Call API to get Garmin auth URL (with JWT token)
                val response = apiService.initiateGarminAuth("airuncoach://connected-devices")
                
                // Return the auth URL to be opened in browser
                onAuthUrlReceived(response.authUrl)
                
            } catch (e: Exception) {
                e.printStackTrace()
                onError("Failed to connect: ${e.message}")
            }
        }
    }
    
    fun disconnectDevice(deviceId: String) {
        viewModelScope.launch {
            try {
                apiService.disconnectDevice(deviceId)
                
                // Reload devices
                loadDevices()
                
            } catch (e: Exception) {
                e.printStackTrace()
                _uiState.value = DevicesUiState.Error("Failed to disconnect: ${e.message}")
            }
        }
    }
    
    fun syncGarminWellness() {
        viewModelScope.launch {
            try {
                _isSyncing.value = true
                
                val response = apiService.syncGarminWellness()
                
                if (response.success) {
                    // Refresh devices to show updated sync time
                    loadDevices()
                } else {
                    _uiState.value = DevicesUiState.Error("Sync failed: ${response.message}")
                }
                
            } catch (e: Exception) {
                e.printStackTrace()
                _uiState.value = DevicesUiState.Error("Sync failed: ${e.message}")
            } finally {
                _isSyncing.value = false
            }
        }
    }
    
    private fun formatSyncTime(lastSyncAt: String?): String {
        if (lastSyncAt == null) return "Never"
        
        // Simple time formatting (can be improved)
        try {
            // Parse ISO timestamp and show relative time
            // For now, just show as-is
            return lastSyncAt.take(10) // Just the date part
        } catch (e: Exception) {
            return "Unknown"
        }
    }
}

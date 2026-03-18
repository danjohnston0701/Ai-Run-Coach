package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.GarminPermissionItem
import javax.inject.Inject

data class GarminPermissionsUiState(
    val deviceName: String = "",
    val connectedSince: String = "",
    val lastSyncAt: String = "",
    val grantedCount: Int = 0,
    val totalCount: Int = 0,
    val permissions: List<GarminPermissionItem> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val reauthorizeInProgress: Boolean = false
)

@HiltViewModel
class GarminPermissionsViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow(GarminPermissionsUiState())
    val uiState: StateFlow<GarminPermissionsUiState> = _uiState

    companion object {
        private const val TAG = "GarminPermissionsVM"
    }

    init {
        loadPermissions()
    }

    fun loadPermissions() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true, error = null)
                
                // Call backend to get permissions and device info
                val response = apiService.getGarminPermissions()
                
                // Extract granted count
                val grantedCount = response.permissions.count { it.isGranted }
                
                _uiState.value = GarminPermissionsUiState(
                    deviceName = response.deviceName ?: "Garmin Device",
                    connectedSince = response.connectedSince ?: "Unknown",
                    lastSyncAt = response.lastSyncAt ?: "Unknown",
                    grantedCount = grantedCount,
                    totalCount = response.permissions.size,
                    permissions = response.permissions,
                    isLoading = false
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error loading permissions", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Failed to load permissions: ${e.message}"
                )
            }
        }
    }

    fun reauthorizeGarmin() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(reauthorizeInProgress = true, error = null)
                
                // Call backend to get reauthorization URL
                val response = apiService.getGarminReauthorizationUrl()
                
                // The URL will be opened by the UI
                _uiState.value = _uiState.value.copy(reauthorizeInProgress = false)
                
                Log.d(TAG, "Reauthorization URL obtained: ${response.authUrl}")
            } catch (e: Exception) {
                Log.e(TAG, "Error initiating reauthorization", e)
                _uiState.value = _uiState.value.copy(
                    reauthorizeInProgress = false,
                    error = "Failed to initiate reauthorization: ${e.message}"
                )
            }
        }
    }

    fun disconnectGarmin() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true, error = null)
                
                // Call backend to disconnect
                apiService.disconnectGarminDevice()
                
                _uiState.value = GarminPermissionsUiState(
                    isLoading = false,
                    error = null
                )
                
                Log.d(TAG, "Garmin device disconnected successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Error disconnecting Garmin", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Failed to disconnect: ${e.message}"
                )
            }
        }
    }
}

package live.airuncoach.airuncoach.viewmodel

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.GarminAuthManager
import javax.inject.Inject

@HiltViewModel
class ConnectedDevicesViewModel @Inject constructor(
    application: Application,
    private val garminAuthManager: GarminAuthManager
) : AndroidViewModel(application) {

    private val _garminConnectionStatus = MutableStateFlow("disconnected")
    val garminConnectionStatus: StateFlow<String> = _garminConnectionStatus

    init {
        checkGarminConnection()
    }

    private fun checkGarminConnection() {
        viewModelScope.launch {
            val isConnected = garminAuthManager.isAuthenticated()
            _garminConnectionStatus.value = if (isConnected) "connected" else "disconnected"
        }
    }

    fun connectGarmin(historyDays: Int = 30) {
        viewModelScope.launch {
            garminAuthManager.startOAuthFlow().onSuccess { authUrl ->
                // Append history days parameter to auth URL
                val fullAuthUrl = if (authUrl.contains("?")) {
                    "$authUrl&history_days=$historyDays"
                } else {
                    "$authUrl?history_days=$historyDays"
                }
                
                // Open OAuth URL in browser
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullAuthUrl))
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                getApplication<Application>().startActivity(intent)
            }.onFailure {
                _garminConnectionStatus.value = "error"
            }
        }
    }
}

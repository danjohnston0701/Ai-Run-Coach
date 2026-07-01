package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import retrofit2.HttpException
import javax.inject.Inject

/**
 * ViewModel for non-registered observers entering their invite token.
 *
 * Flow:
 * 1. User enters token from email or deep link provides it
 * 2. ViewModel validates token via GET /api/observe/{token}
 * 3. If valid, exposes the resolved session ID for navigation
 * 4. Caller navigates to ObserverRunSessionScreen with that session ID
 */
@HiltViewModel
class ObserverLoginViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _token = MutableStateFlow("")
    val token = _token.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    // Exposed session ID once token is validated — UI uses this to navigate
    private val _resolvedSessionId = MutableStateFlow<String?>(null)
    val resolvedSessionId = _resolvedSessionId.asStateFlow()

    fun setToken(newToken: String) {
        _token.value = newToken
        // Reset state when user edits the token
        _resolvedSessionId.value = null
        _error.value = null
    }

    fun validateAndLoadSession(token: String) {
        if (token.isBlank()) {
            _error.value = "Please enter a token"
            return
        }

        _isLoading.value = true
        _error.value = null
        _resolvedSessionId.value = null

        viewModelScope.launch {
            try {
                Log.d("ObserverLoginVM", "Validating token: $token")

                val response = apiService.getObserveSession(token)

                // Extract the session ID from the session data
                val sessionId = response.sessionData.id
                if (sessionId.isBlank()) {
                    _error.value = "Run session data is invalid. Please try again."
                    return@launch
                }

                Log.d("ObserverLoginVM", "✅ Token valid — session ID: $sessionId")
                _resolvedSessionId.value = sessionId

            } catch (e: HttpException) {
                Log.e("ObserverLoginVM", "❌ HTTP ${e.code()} validating token", e)
                _error.value = when (e.code()) {
                    404 -> "Token not found. Check the token in your email and try again."
                    410 -> "This token has expired. Ask the runner to send a new invite."
                    else -> "Could not load the run session (error ${e.code()}). Please try again."
                }
            } catch (e: Exception) {
                Log.e("ObserverLoginVM", "❌ Token validation failed: ${e.message}", e)
                _error.value = when {
                    e.message?.contains("Unable to resolve host") == true ||
                    e.message?.contains("timeout") == true ->
                        "No internet connection. Please check your connection and try again."
                    else -> "Failed to load the run session. Please try again."
                }
            } finally {
                _isLoading.value = false
            }
        }
    }
}

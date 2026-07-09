package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

data class ForgotPasswordState(
    val email: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val isEmailSent: Boolean = false
)

@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _state = MutableStateFlow(ForgotPasswordState())
    val state = _state.asStateFlow()

    fun onEmailChange(email: String) {
        _state.update { it.copy(email = email, error = null) }
    }

    fun sendResetEmail() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            
            try {
                val email = _state.value.email.trim().lowercase()
                
                if (email.isBlank()) {
                    _state.update { it.copy(isLoading = false, error = "Please enter your email address") }
                    return@launch
                }
                
                if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
                    _state.update { it.copy(isLoading = false, error = "Please enter a valid email address") }
                    return@launch
                }
                
                android.util.Log.d("ForgotPasswordViewModel", "📧 Requesting password reset for: $email")
                
                apiService.forgotPassword(live.airuncoach.airuncoach.network.model.ForgotPasswordRequest(email))
                
                android.util.Log.d("ForgotPasswordViewModel", "✅ Password reset email sent successfully!")
                _state.update { it.copy(isLoading = false, error = null, isEmailSent = true) }
                
            } catch (e: retrofit2.HttpException) {
                val errorBody = e.response()?.errorBody()?.string()
                android.util.Log.e("ForgotPasswordViewModel", "❌ HTTP Error ${e.code()}: $errorBody", e)
                
                val errorMessage = try {
                    val json = com.google.gson.JsonParser.parseString(errorBody).asJsonObject
                    json.get("error")?.asString ?: json.get("message")?.asString ?: "Failed to send reset email"
                } catch (_: Exception) {
                    "Failed to send reset email"
                }
                
                val userFriendlyError = when (e.code()) {
                    400 -> "Invalid email address. Please check and try again."
                    500 -> "Server error. Please try again later."
                    else -> "Error (${e.code()}): $errorMessage"
                }
                
                _state.update { it.copy(isLoading = false, error = userFriendlyError) }
            } catch (e: java.net.UnknownHostException) {
                android.util.Log.e("ForgotPasswordViewModel", "❌ Network error: Cannot reach server", e)
                _state.update { it.copy(isLoading = false, error = "Cannot reach server. Check your internet connection.") }
            } catch (e: Exception) {
                android.util.Log.e("ForgotPasswordViewModel", "❌ Failed to send reset email: ${e.javaClass.simpleName} - ${e.message}", e)
                _state.update { it.copy(isLoading = false, error = e.message ?: "Failed to send reset email") }
            }
        }
    }
}

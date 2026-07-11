package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.ChangePasswordRequest
import javax.inject.Inject

@HiltViewModel
class ChangePasswordViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    sealed class ChangePasswordState {
        object Idle : ChangePasswordState()
        object Loading : ChangePasswordState()
        object Success : ChangePasswordState()
        data class Error(val message: String) : ChangePasswordState()
    }

    private val _state = MutableStateFlow<ChangePasswordState>(ChangePasswordState.Idle)
    val state: StateFlow<ChangePasswordState> = _state

    fun changePassword(
        currentPassword: String,
        newPassword: String,
        confirmPassword: String
    ) {
        // Validation
        if (currentPassword.isBlank()) {
            _state.value = ChangePasswordState.Error("Please enter your current password")
            return
        }
        if (newPassword.isBlank()) {
            _state.value = ChangePasswordState.Error("Please enter a new password")
            return
        }
        if (newPassword.length < 6) {
            _state.value = ChangePasswordState.Error("Password must be at least 6 characters")
            return
        }
        if (newPassword != confirmPassword) {
            _state.value = ChangePasswordState.Error("Passwords do not match")
            return
        }
        if (currentPassword == newPassword) {
            _state.value = ChangePasswordState.Error("New password must be different from current password")
            return
        }

        viewModelScope.launch {
            _state.value = ChangePasswordState.Loading
            try {
                val request = ChangePasswordRequest(
                    currentPassword = currentPassword,
                    newPassword = newPassword,
                    confirmPassword = confirmPassword
                )
                val response = apiService.changePassword(request)
                if (response.isSuccessful) {
                    _state.value = ChangePasswordState.Success
                } else {
                    _state.value = ChangePasswordState.Error(
                        response.errorBody()?.string() ?: "Failed to change password"
                    )
                }
            } catch (e: Exception) {
                _state.value = ChangePasswordState.Error(
                    e.message ?: "An error occurred while changing password"
                )
            }
        }
    }

    fun resetState() {
        _state.value = ChangePasswordState.Idle
    }
}

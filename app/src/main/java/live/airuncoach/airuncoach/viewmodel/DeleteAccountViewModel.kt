package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.data.SessionManager
import javax.inject.Inject

@HiltViewModel
class DeleteAccountViewModel @Inject constructor(
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {

    sealed class DeleteAccountState {
        object Idle : DeleteAccountState()
        object Loading : DeleteAccountState()
        object Success : DeleteAccountState()
        data class Error(val message: String) : DeleteAccountState()
    }

    private val _state = MutableStateFlow<DeleteAccountState>(DeleteAccountState.Idle)
    val state: StateFlow<DeleteAccountState> = _state

    fun deleteAccount(userId: String) {
        viewModelScope.launch {
            _state.value = DeleteAccountState.Loading
            try {
                val response = apiService.deleteUser(userId)
                if (response.isSuccessful) {
                    // Clear user authentication data
                    sessionManager.clearSession()
                    _state.value = DeleteAccountState.Success
                } else {
                    _state.value = DeleteAccountState.Error(
                        response.errorBody()?.string() ?: "Failed to delete account"
                    )
                }
            } catch (e: Exception) {
                _state.value = DeleteAccountState.Error(
                    e.message ?: "An error occurred while deleting account"
                )
            }
        }
    }

    fun resetState() {
        _state.value = DeleteAccountState.Idle
    }
}

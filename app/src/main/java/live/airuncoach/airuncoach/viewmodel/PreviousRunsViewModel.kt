package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

@HiltViewModel
class PreviousRunsViewModel @Inject constructor(
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _runs = MutableStateFlow<List<RunSession>>(emptyList())
    val runs: StateFlow<List<RunSession>> = _runs.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun fetchRuns() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val userId = sessionManager.getAuthToken() // Assuming the token is the user ID for simplicity
                if (userId != null) {
                    _runs.value = apiService.getRunsForUser(userId)
                }
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _isLoading.value = false
            }
        }
    }
}

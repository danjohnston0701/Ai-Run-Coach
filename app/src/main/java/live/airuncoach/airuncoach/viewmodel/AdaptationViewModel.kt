package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.PendingAdaptation
import javax.inject.Inject

@HiltViewModel
class AdaptationViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _pendingAdaptations = MutableStateFlow<List<PendingAdaptation>>(emptyList())
    val pendingAdaptations: StateFlow<List<PendingAdaptation>> = _pendingAdaptations.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _successMessage = MutableStateFlow<String?>(null)
    val successMessage: StateFlow<String?> = _successMessage.asStateFlow()

    /**
     * Load pending adaptations for a training plan.
     */
    fun loadPendingAdaptations(planId: String) {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                _errorMessage.value = null

                Log.d("AdaptationViewModel", "Starting to fetch pending adaptations for plan $planId")
                
                val response = apiService.getPendingAdaptations(planId)
                _pendingAdaptations.value = response.adaptations

                Log.d(
                    "AdaptationViewModel",
                    "✅ Loaded ${response.count} pending adaptations for plan $planId"
                )
            } catch (error: Exception) {
                Log.e("AdaptationViewModel", "❌ Failed to load adaptations", error)
                error.printStackTrace()
                _errorMessage.value = "Error: ${error.message ?: "Failed to load adaptations"}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Accept and apply an adaptation to the training plan.
     */
    fun acceptAdaptation(adaptationId: String) {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                _errorMessage.value = null

                val response = apiService.acceptAdaptation(adaptationId)

                if (response.isSuccessful) {
                    Log.d("AdaptationViewModel", "✅ Adaptation accepted: $adaptationId")
                    _successMessage.value = response.body()?.message ?: "Adaptation applied!"

                    // Remove from pending list
                    _pendingAdaptations.value = _pendingAdaptations.value.filter {
                        it.id != adaptationId
                    }

                    // Clear success message after 3 seconds
                    viewModelScope.launch {
                        kotlinx.coroutines.delay(3000)
                        _successMessage.value = null
                    }
                } else {
                    _errorMessage.value =
                        response.errorBody()?.string() ?: "Failed to accept adaptation"
                }
            } catch (error: Exception) {
                Log.e("AdaptationViewModel", "Error accepting adaptation", error)
                _errorMessage.value = error.message ?: "Error accepting adaptation"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Decline an adaptation without applying it.
     */
    fun declineAdaptation(adaptationId: String) {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                _errorMessage.value = null

                val response = apiService.declineAdaptation(adaptationId)

                if (response.isSuccessful) {
                    Log.d("AdaptationViewModel", "⏭️ Adaptation declined: $adaptationId")
                    _successMessage.value = "Adaptation declined"

                    // Remove from pending list
                    _pendingAdaptations.value = _pendingAdaptations.value.filter {
                        it.id != adaptationId
                    }

                    // Clear success message after 2 seconds
                    viewModelScope.launch {
                        kotlinx.coroutines.delay(2000)
                        _successMessage.value = null
                    }
                } else {
                    _errorMessage.value =
                        response.errorBody()?.string() ?: "Failed to decline adaptation"
                }
            } catch (error: Exception) {
                Log.e("AdaptationViewModel", "Error declining adaptation", error)
                _errorMessage.value = error.message ?: "Error declining adaptation"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Clear error message.
     */
    fun clearError() {
        _errorMessage.value = null
    }

    /**
     * Clear success message.
     */
    fun clearSuccess() {
        _successMessage.value = null
    }
}


package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

sealed class GroupRunsUiState {
    object Loading : GroupRunsUiState()
    data class Success(val groupRuns: List<GroupRun>) : GroupRunsUiState()
    data class Error(val message: String) : GroupRunsUiState()
}

@HiltViewModel
class GroupRunsViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _groupRunsState = MutableStateFlow<GroupRunsUiState>(GroupRunsUiState.Loading)
    val groupRunsState: StateFlow<GroupRunsUiState> = _groupRunsState.asStateFlow()

    init {
        loadGroupRuns()
    }

    fun loadGroupRuns() {
        viewModelScope.launch {
            _groupRunsState.value = GroupRunsUiState.Loading
            try {
                val groupRuns = apiService.getGroupRuns()
                _groupRunsState.value = GroupRunsUiState.Success(groupRuns)
            } catch (e: Exception) {
                _groupRunsState.value = GroupRunsUiState.Error(e.message ?: "Failed to load group runs")
            }
        }
    }
}

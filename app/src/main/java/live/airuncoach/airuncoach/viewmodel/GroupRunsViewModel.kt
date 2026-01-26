
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.network.RetrofitClient

sealed class GroupRunsUiState {
    object Loading : GroupRunsUiState()
    data class Success(val groupRuns: List<GroupRun>) : GroupRunsUiState()
    data class Error(val message: String) : GroupRunsUiState()
}

class GroupRunsViewModel(private val context: Context) : ViewModel() {

    private val sessionManager = SessionManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance

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

class GroupRunsViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(GroupRunsViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return GroupRunsViewModel(context) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}

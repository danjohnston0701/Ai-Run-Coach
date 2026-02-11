
package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.JsonSyntaxException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.network.ApiService
import retrofit2.HttpException
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
                Log.d("GroupRunsViewModel", "📡 Fetching group runs...")
                val groupRuns = apiService.getGroupRuns()
                Log.d("GroupRunsViewModel", "✅ Fetched ${groupRuns.size} group runs")
                _groupRunsState.value = GroupRunsUiState.Success(groupRuns)
            } catch (e: JsonSyntaxException) {
                // JSON parsing error - backend likely returning HTML instead of JSON
                Log.e("GroupRunsViewModel", "❌ JSON parsing error: Backend returned HTML instead of JSON", e)
                Log.e("GroupRunsViewModel", "💡 The /api/group-runs endpoint is not implemented on the backend yet")
                _groupRunsState.value = GroupRunsUiState.Error(
                    "Group Runs feature coming soon! 🏃\n\nThis feature is currently being developed on the backend."
                )
            } catch (e: HttpException) {
                Log.e("GroupRunsViewModel", "❌ HTTP error loading group runs: ${e.code()} - ${e.message()}", e)
                _groupRunsState.value = when (e.code()) {
                    401, 403 -> GroupRunsUiState.Error("Please log in to view group runs")
                    404 -> GroupRunsUiState.Error("Group Runs feature coming soon! 🏃\n\nThis feature is currently being developed.")
                    else -> GroupRunsUiState.Error("Failed to load group runs. Please try again.")
                }
            } catch (e: Exception) {
                Log.e("GroupRunsViewModel", "❌ Error loading group runs: ${e.message}", e)
                _groupRunsState.value = GroupRunsUiState.Error(e.message ?: "Failed to load group runs")
            }
        }
    }
}

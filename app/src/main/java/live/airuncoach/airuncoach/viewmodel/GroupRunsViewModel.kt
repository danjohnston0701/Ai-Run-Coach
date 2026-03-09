package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.GroupRunRespondRequest
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

    // All runs loaded from API
    private var allGroupRuns: List<GroupRun> = emptyList()

    // Active tab: "upcoming" | "my" | "past"
    private val _selectedTab = MutableStateFlow("upcoming")
    val selectedTab: StateFlow<String> = _selectedTab.asStateFlow()

    init {
        loadGroupRuns()
    }

    fun loadGroupRuns() {
        viewModelScope.launch {
            _groupRunsState.value = GroupRunsUiState.Loading
            try {
                Log.d("GroupRunsViewModel", "📡 Fetching group runs...")
                val response = apiService.getGroupRuns()
                allGroupRuns = response.groupRuns
                Log.d("GroupRunsViewModel", "✅ Fetched ${allGroupRuns.size} group runs")
                applyTab(_selectedTab.value)
            } catch (e: HttpException) {
                Log.e("GroupRunsViewModel", "❌ HTTP error: ${e.code()} - ${e.message()}", e)
                _groupRunsState.value = when (e.code()) {
                    401, 403 -> GroupRunsUiState.Error("Please log in to view group runs")
                    else -> GroupRunsUiState.Error("Failed to load group runs. Please try again.")
                }
            } catch (e: Exception) {
                Log.e("GroupRunsViewModel", "❌ Error loading group runs: ${e.message}", e)
                _groupRunsState.value = GroupRunsUiState.Error(e.message ?: "Failed to load group runs")
            }
        }
    }

    fun selectTab(tab: String) {
        _selectedTab.value = tab
        applyTab(tab)
    }

    private fun applyTab(tab: String) {
        val filtered = when (tab) {
            "my" -> allGroupRuns.filter { it.isOrganiser || it.isJoined || it.myInvitationStatus == "pending" }
            "past" -> allGroupRuns.filter { it.status == "completed" || it.status == "cancelled" }
            else -> allGroupRuns.filter { it.status != "completed" && it.status != "cancelled" }
        }
        _groupRunsState.value = GroupRunsUiState.Success(filtered)
    }

    fun respondToInvite(groupRunId: String, accept: Boolean) {
        viewModelScope.launch {
            try {
                val response = if (accept) "accepted" else "declined"
                apiService.respondToGroupRun(groupRunId, GroupRunRespondRequest(response))
                loadGroupRuns()
            } catch (e: Exception) {
                Log.e("GroupRunsViewModel", "❌ Failed to respond to invite: ${e.message}", e)
            }
        }
    }

    fun joinGroupRun(groupRunId: String) {
        viewModelScope.launch {
            try {
                apiService.respondToGroupRun(groupRunId, GroupRunRespondRequest("accepted"))
                loadGroupRuns()
            } catch (e: Exception) {
                Log.e("GroupRunsViewModel", "❌ Failed to join group run: ${e.message}", e)
            }
        }
    }
}

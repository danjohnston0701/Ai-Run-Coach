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
import live.airuncoach.airuncoach.network.model.InviteFriendsRequest
import retrofit2.HttpException
import javax.inject.Inject

sealed class GroupRunDetailState {
    object Loading : GroupRunDetailState()
    data class Success(val groupRun: GroupRun) : GroupRunDetailState()
    data class Error(val message: String) : GroupRunDetailState()
}

@HiltViewModel
class GroupRunDetailViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _state = MutableStateFlow<GroupRunDetailState>(GroupRunDetailState.Loading)
    val state: StateFlow<GroupRunDetailState> = _state.asStateFlow()

    private val _actionLoading = MutableStateFlow(false)
    val actionLoading: StateFlow<Boolean> = _actionLoading.asStateFlow()

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    private val _startedGroupRunId = MutableStateFlow<String?>(null)
    /** Non-null when organiser has started the run — triggers navigation to run screen */
    val startedGroupRunId: StateFlow<String?> = _startedGroupRunId.asStateFlow()

    fun loadGroupRun(groupRunId: String) {
        viewModelScope.launch {
            _state.value = GroupRunDetailState.Loading
            try {
                val gr = apiService.getGroupRun(groupRunId)
                _state.value = GroupRunDetailState.Success(gr)
            } catch (e: HttpException) {
                _state.value = GroupRunDetailState.Error("Failed to load group run (${e.code()})")
            } catch (e: Exception) {
                _state.value = GroupRunDetailState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun respond(groupRunId: String, accept: Boolean) {
        viewModelScope.launch {
            _actionLoading.value = true
            _actionError.value = null
            try {
                val gr = apiService.respondToGroupRun(
                    groupRunId,
                    GroupRunRespondRequest(if (accept) "accepted" else "declined")
                )
                _state.value = GroupRunDetailState.Success(gr)
            } catch (e: Exception) {
                _actionError.value = "Failed to update response: ${e.message}"
                Log.e("GroupRunDetailVM", "respond error", e)
            } finally {
                _actionLoading.value = false
            }
        }
    }

    fun markReady(groupRunId: String) {
        viewModelScope.launch {
            _actionLoading.value = true
            try {
                val gr = apiService.markReadyToStart(groupRunId)
                _state.value = GroupRunDetailState.Success(gr)
            } catch (e: Exception) {
                _actionError.value = "Failed to mark ready: ${e.message}"
            } finally {
                _actionLoading.value = false
            }
        }
    }

    fun startRun(groupRunId: String) {
        viewModelScope.launch {
            _actionLoading.value = true
            try {
                apiService.startGroupRun(groupRunId)
                _startedGroupRunId.value = groupRunId
            } catch (e: Exception) {
                _actionError.value = "Failed to start run: ${e.message}"
            } finally {
                _actionLoading.value = false
            }
        }
    }

    fun inviteFriends(groupRunId: String, userIds: List<String>) {
        viewModelScope.launch {
            _actionLoading.value = true
            try {
                apiService.inviteFriendsToGroupRun(groupRunId, InviteFriendsRequest(userIds))
                loadGroupRun(groupRunId)
            } catch (e: Exception) {
                _actionError.value = "Failed to invite friends: ${e.message}"
            } finally {
                _actionLoading.value = false
            }
        }
    }

    fun clearActionError() {
        _actionError.value = null
    }

    fun clearStartedRun() {
        _startedGroupRunId.value = null
    }
}

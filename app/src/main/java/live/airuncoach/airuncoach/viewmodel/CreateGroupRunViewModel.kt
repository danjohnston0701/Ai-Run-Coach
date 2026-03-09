package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.CreateGroupRunRequest
import live.airuncoach.airuncoach.network.model.InviteFriendsRequest
import live.airuncoach.airuncoach.data.SessionManager
import javax.inject.Inject

sealed class CreateGroupRunState {
    object Idle : CreateGroupRunState()
    object Loading : CreateGroupRunState()
    data class Success(val groupRun: GroupRun) : CreateGroupRunState()
    data class Error(val message: String) : CreateGroupRunState()
}

@HiltViewModel
class CreateGroupRunViewModel @Inject constructor(
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {

    // Form fields
    private val _runName = MutableStateFlow("")
    val runName: StateFlow<String> = _runName.asStateFlow()

    private val _meetingPoint = MutableStateFlow("")
    val meetingPoint: StateFlow<String> = _meetingPoint.asStateFlow()

    private val _description = MutableStateFlow("")
    val description: StateFlow<String> = _description.asStateFlow()

    private val _distance = MutableStateFlow("")
    val distance: StateFlow<String> = _distance.asStateFlow()

    private val _maxParticipants = MutableStateFlow("10")
    val maxParticipants: StateFlow<String> = _maxParticipants.asStateFlow()

    private val _dateTime = MutableStateFlow("")
    val dateTime: StateFlow<String> = _dateTime.asStateFlow()

    private val _isPublic = MutableStateFlow(true)
    val isPublic: StateFlow<Boolean> = _isPublic.asStateFlow()

    // Invite friends
    private val _friends = MutableStateFlow<List<Friend>>(emptyList())
    val friends: StateFlow<List<Friend>> = _friends.asStateFlow()

    private val _selectedFriendIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedFriendIds: StateFlow<Set<String>> = _selectedFriendIds.asStateFlow()

    private val _loadingFriends = MutableStateFlow(false)
    val loadingFriends: StateFlow<Boolean> = _loadingFriends.asStateFlow()

    // Validation
    private val _validationError = MutableStateFlow<String?>(null)
    val validationError: StateFlow<String?> = _validationError.asStateFlow()

    // Create state
    private val _createState = MutableStateFlow<CreateGroupRunState>(CreateGroupRunState.Idle)
    val createState: StateFlow<CreateGroupRunState> = _createState.asStateFlow()

    init {
        loadFriends()
    }

    private fun loadFriends() {
        viewModelScope.launch {
            _loadingFriends.value = true
            try {
                val userId = sessionManager.getUserId() ?: return@launch
                _friends.value = apiService.getFriends(userId)
            } catch (e: Exception) {
                Log.e("CreateGroupRunVM", "Failed to load friends: ${e.message}", e)
            } finally {
                _loadingFriends.value = false
            }
        }
    }

    fun onRunNameChanged(name: String) { _runName.value = name }
    fun onMeetingPointChanged(point: String) { _meetingPoint.value = point }
    fun onDescriptionChanged(desc: String) { _description.value = desc }
    fun onDistanceChanged(dist: String) { _distance.value = dist }
    fun onMaxParticipantsChanged(participants: String) { _maxParticipants.value = participants }
    fun onDateTimeChanged(dt: String) { _dateTime.value = dt }
    fun onIsPublicChanged(public: Boolean) { _isPublic.value = public }

    fun toggleFriendSelected(friendId: String) {
        _selectedFriendIds.value = _selectedFriendIds.value.toMutableSet().also { set ->
            if (set.contains(friendId)) set.remove(friendId) else set.add(friendId)
        }
    }

    fun clearValidationError() { _validationError.value = null }

    fun createGroupRun() {
        val name = _runName.value.trim()
        val distanceStr = _distance.value.trim()
        val dt = _dateTime.value.trim()

        // Validate required fields
        if (name.isEmpty()) {
            _validationError.value = "Run name is required"
            return
        }
        val distanceKm = distanceStr.toDoubleOrNull()
        if (distanceKm == null || distanceKm <= 0) {
            _validationError.value = "Please enter a valid distance"
            return
        }
        if (dt.isEmpty()) {
            _validationError.value = "Please set a date and time"
            return
        }

        viewModelScope.launch {
            _createState.value = CreateGroupRunState.Loading
            try {
                val request = CreateGroupRunRequest(
                    name = name,
                    description = _description.value.trim(),
                    meetingPoint = _meetingPoint.value.trim().ifEmpty { null },
                    meetingLat = null,
                    meetingLng = null,
                    distance = distanceKm,
                    dateTime = dt,
                    maxParticipants = _maxParticipants.value.toIntOrNull() ?: 10,
                    isPublic = _isPublic.value
                )
                val created = apiService.createGroupRun(request)

                // Invite selected friends if any
                val selectedIds = _selectedFriendIds.value.toList()
                if (selectedIds.isNotEmpty()) {
                    try {
                        apiService.inviteFriendsToGroupRun(created.id, InviteFriendsRequest(selectedIds))
                    } catch (e: Exception) {
                        Log.w("CreateGroupRunVM", "Created run but failed to invite friends: ${e.message}")
                    }
                }

                _createState.value = CreateGroupRunState.Success(created)
            } catch (e: Exception) {
                Log.e("CreateGroupRunVM", "Failed to create group run: ${e.message}", e)
                _createState.value = CreateGroupRunState.Error(e.message ?: "Failed to create group run")
            }
        }
    }
}


package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.FriendRequestItem
import retrofit2.HttpException

sealed class FriendsUiState {
    object Loading : FriendsUiState()
    data class Success(val friends: List<Friend>) : FriendsUiState()
    data class Error(val message: String) : FriendsUiState()
}

sealed class SearchUiState {
    object Idle : SearchUiState()
    object Loading : SearchUiState()
    data class Success(val users: List<Friend>) : SearchUiState()
    data class Error(val message: String) : SearchUiState()
}

sealed class PendingRequestsUiState {
    object Loading : PendingRequestsUiState()
    data class Success(val sent: List<FriendRequestItem>, val received: List<FriendRequestItem>) : PendingRequestsUiState()
    data class Error(val message: String) : PendingRequestsUiState()
}

class FriendsViewModel(private val context: Context) : ViewModel() {

    private val sessionManager = SessionManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance
    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val _user = MutableStateFlow<User?>(null)

    private val _friendsState = MutableStateFlow<FriendsUiState>(FriendsUiState.Loading)
    val friendsState: StateFlow<FriendsUiState> = _friendsState.asStateFlow()

    private val _searchState = MutableStateFlow<SearchUiState>(SearchUiState.Idle)
    val searchState: StateFlow<SearchUiState> = _searchState.asStateFlow()

    private val _pendingRequestsState = MutableStateFlow<PendingRequestsUiState>(PendingRequestsUiState.Loading)
    val pendingRequestsState: StateFlow<PendingRequestsUiState> = _pendingRequestsState.asStateFlow()

    private val _addedFriendIds = MutableStateFlow<Set<String>>(emptySet())
    val addedFriendIds: StateFlow<Set<String>> = _addedFriendIds.asStateFlow()

    init {
        loadUser()
    }

    private fun loadUser() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            _user.value = gson.fromJson(userJson, User::class.java)
            loadFriends()
            loadPendingRequests()
        }
    }

    fun loadFriends() {
        viewModelScope.launch {
            _friendsState.value = FriendsUiState.Loading
            try {
                val userId = _user.value?.id
                if (userId != null) {
                    val friends = apiService.getFriends(userId)
                    _friendsState.value = FriendsUiState.Success(friends)
                } else {
                    _friendsState.value = FriendsUiState.Error("User not logged in")
                }
            } catch (e: HttpException) {
                val errorMsg = when (e.code()) {
                    500 -> "Server error: Friends endpoint not implemented or has a bug. Check backend logs."
                    404 -> "Friends endpoint not found. Backend needs to implement GET /api/friends/{userId}"
                    else -> "Failed to load friends: ${e.message()}"
                }
                _friendsState.value = FriendsUiState.Error(errorMsg)
            } catch (e: Exception) {
                _friendsState.value = FriendsUiState.Error("Network error: ${e.message ?: "Failed to load friends"}")
            }
        }
    }

    fun loadPendingRequests() {
        viewModelScope.launch {
            _pendingRequestsState.value = PendingRequestsUiState.Loading
            try {
                val userId = _user.value?.id
                if (userId != null) {
                    val response = apiService.getFriendRequests(userId)
                    _pendingRequestsState.value = PendingRequestsUiState.Success(response.sent, response.received)
                } else {
                    _pendingRequestsState.value = PendingRequestsUiState.Error("User not logged in")
                }
            } catch (e: Exception) {
                Log.e("FriendsViewModel", "Failed to load pending requests", e)
                _pendingRequestsState.value = PendingRequestsUiState.Error("Failed to load pending requests")
            }
        }
    }

    fun searchUsers(query: String) {
        viewModelScope.launch {
            _searchState.value = SearchUiState.Loading
            try {
                if (query.isBlank()) {
                    _searchState.value = SearchUiState.Idle
                    return@launch
                }
                val users = apiService.searchUsers(query)
                _searchState.value = SearchUiState.Success(users)
            } catch (e: Exception) {
                _searchState.value = SearchUiState.Error("Failed to search for users")
            }
        }
    }

    fun sendFriendRequest(friendId: String) {
        viewModelScope.launch {
            val userId = _user.value?.id
            if (userId == null) {
                return@launch
            }

            try {
                val request = mapOf("addresseeId" to friendId)
                apiService.sendFriendRequest(request)
                _addedFriendIds.update { it + friendId }
                // Refresh pending requests to show the new request
                loadPendingRequests()
            } catch (e: Exception) {
                Log.e("FriendsViewModel", "Failed to send friend request", e)
            }
        }
    }

    fun acceptFriendRequest(requestId: String) {
        viewModelScope.launch {
            try {
                apiService.acceptFriendRequest(requestId)
                // Refresh both friends and pending requests
                loadFriends()
                loadPendingRequests()
            } catch (e: Exception) {
                Log.e("FriendsViewModel", "Failed to accept friend request", e)
            }
        }
    }

    fun declineFriendRequest(requestId: String) {
        viewModelScope.launch {
            try {
                apiService.declineFriendRequest(requestId)
                // Refresh pending requests
                loadPendingRequests()
            } catch (e: Exception) {
                Log.e("FriendsViewModel", "Failed to decline friend request", e)
            }
        }
    }

    fun cancelSentRequest(requestId: String) {
        viewModelScope.launch {
            try {
                apiService.declineFriendRequest(requestId)
                // Refresh pending requests
                loadPendingRequests()
            } catch (e: Exception) {
                Log.e("FriendsViewModel", "Failed to cancel friend request", e)
            }
        }
    }
}

class FriendsViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(FriendsViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return FriendsViewModel(context) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}

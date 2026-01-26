
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient

sealed class FriendsUiState {
    object Loading : FriendsUiState()
    data class Success(val friends: List<Friend>) : FriendsUiState()
    data class Error(val message: String) : FriendsUiState()
}

sealed class FindFriendsUiState {
    object Idle : FindFriendsUiState()
    object Loading : FindFriendsUiState()
    data class Success(val users: List<Friend>) : FindFriendsUiState()
    data class Error(val message: String) : FindFriendsUiState()
}

class FriendsViewModel(private val context: Context) : ViewModel() {

    private val sessionManager = SessionManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance
    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val _user = MutableStateFlow<User?>(null)

    private val _friendsState = MutableStateFlow<FriendsUiState>(FriendsUiState.Loading)
    val friendsState: StateFlow<FriendsUiState> = _friendsState.asStateFlow()

    private val _findFriendsState = MutableStateFlow<FindFriendsUiState>(FindFriendsUiState.Idle)
    val findFriendsState: StateFlow<FindFriendsUiState> = _findFriendsState.asStateFlow()

    init {
        loadUser()
    }

    private fun loadUser() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            _user.value = gson.fromJson(userJson, User::class.java)
            loadFriends()
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
            } catch (e: Exception) {
                _friendsState.value = FriendsUiState.Error(e.message ?: "Failed to load friends")
            }
        }
    }

    fun searchUsers(query: String) {
        viewModelScope.launch {
            _findFriendsState.value = FindFriendsUiState.Loading
            try {
                if (query.isBlank()) {
                    _findFriendsState.value = FindFriendsUiState.Idle
                    return@launch
                }
                val users = apiService.searchUsers(query)
                _findFriendsState.value = FindFriendsUiState.Success(users)
            } catch (e: Exception) {
                _findFriendsState.value = FindFriendsUiState.Error("Failed to search for users")
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


package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.Friend

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

class FriendsViewModel : ViewModel() {

    private val _friendsState = MutableStateFlow<FriendsUiState>(FriendsUiState.Loading)
    val friendsState: StateFlow<FriendsUiState> = _friendsState.asStateFlow()

    private val _findFriendsState = MutableStateFlow<FindFriendsUiState>(FindFriendsUiState.Idle)
    val findFriendsState: StateFlow<FindFriendsUiState> = _findFriendsState.asStateFlow()

    init {
        loadFriends()
    }

    fun loadFriends() {
        viewModelScope.launch {
            _friendsState.value = FriendsUiState.Loading
            try {
                // Mocked friends list
                val friends = listOf<Friend>(
                    // Friend("1", "Jane Doe", "https://randomuser.me/api/portraits/women/68.jpg"),
                    // Friend("2", "John Smith", "https://randomuser.me/api/portraits/men/32.jpg")
                )
                _friendsState.value = FriendsUiState.Success(friends)
            } catch (e: Exception) {
                _friendsState.value = FriendsUiState.Error("Failed to load friends")
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
                // Mocked search results
                val users = listOf(
                    Friend("3", "John Appleseed", "https://randomuser.me/api/portraits/men/45.jpg"),
                    Friend("4", "Peter Jones", "https://randomuser.me/api/portraits/men/46.jpg")
                ).filter { it.name.contains(query, ignoreCase = true) }
                _findFriendsState.value = FindFriendsUiState.Success(users)
            } catch (e: Exception) {
                _findFriendsState.value = FindFriendsUiState.Error("Failed to search for users")
            }
        }
    }
}

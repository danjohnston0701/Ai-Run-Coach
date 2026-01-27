
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.ApiService
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    private val _friendCount = MutableStateFlow(0)
    val friendCount: StateFlow<Int> = _friendCount.asStateFlow()

    init {
        loadUser()
        loadFriendCount()
    }

    private fun loadUser() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            _user.value = gson.fromJson(userJson, User::class.java)
        }
    }

    fun uploadProfilePicture(imageUri: Uri) {
        viewModelScope.launch {
            try {
                val user = _user.value ?: return@launch
                val inputStream = context.contentResolver.openInputStream(imageUri)
                val imageBytes = inputStream?.readBytes()
                inputStream?.close()

                if (imageBytes != null) {
                    val requestFile = imageBytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                    val body = MultipartBody.Part.createFormData("profilePic", "profile.jpg", requestFile)

                    val updatedUser = apiService.uploadProfilePicture(user.id, body)

                    val userJson = gson.toJson(updatedUser)
                    sharedPrefs.edit().putString("user", userJson).apply()
                    _user.value = updatedUser
                }
            } catch (e: Exception) {
                // Handle error
            }
        }
    }

    private fun loadFriendCount() {
        viewModelScope.launch {
            try {
                val user = _user.value ?: return@launch
                val friends = apiService.getFriends(user.id)
                _friendCount.value = friends.size
            } catch (e: Exception) {
                // Silently fail - friend count is not critical
                _friendCount.value = 0
            }
        }
    }

    // Public method to refresh user data from SharedPreferences
    fun refreshUser() {
        loadUser()
        loadFriendCount()
    }

    fun logout() {
        sessionManager.clearAuthToken()
        sharedPrefs.edit().remove("user").apply()
        _user.value = null
        _friendCount.value = 0
    }
}

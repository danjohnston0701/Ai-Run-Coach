
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.UploadProfilePictureRequest
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
        android.util.Log.d("ProfileViewModel", "🔍 Loading user from SharedPreferences")
        android.util.Log.d("ProfileViewModel", "User JSON exists: ${userJson != null}")
        if (userJson != null) {
            try {
                val user = gson.fromJson(userJson, User::class.java)
                _user.value = user
                android.util.Log.d("ProfileViewModel", "✅ User loaded: ${user.name} (ID: ${user.id})")
            } catch (e: Exception) {
                android.util.Log.e("ProfileViewModel", "❌ Failed to parse user JSON: ${e.message}")
                android.util.Log.e("ProfileViewModel", "JSON was: $userJson")
            }
        } else {
            android.util.Log.w("ProfileViewModel", "⚠️ No user data found in SharedPreferences")
            val token = sessionManager.getAuthToken()
            android.util.Log.w("ProfileViewModel", "Auth token exists: ${token != null}")
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
                    // Convert to base64
                    val base64Image = android.util.Base64.encodeToString(imageBytes, android.util.Base64.NO_WRAP)
                    val imageData = "data:image/jpeg;base64,$base64Image"

                    val request = UploadProfilePictureRequest(imageData)
                    val updatedUser = apiService.uploadProfilePicture(user.id, request)

                    val userJson = gson.toJson(updatedUser)
                    sharedPrefs.edit().putString("user", userJson).apply()
                    _user.value = updatedUser
                    
                    Log.d("ProfileViewModel", "✅ Profile picture uploaded successfully")
                }
            } catch (e: JsonSyntaxException) {
                Log.e("ProfileViewModel", "❌ Backend returned HTML instead of JSON - endpoint not deployed")
                Log.e("ProfileViewModel", "💡 The profile picture upload endpoint needs to be deployed to the backend server")
            } catch (e: Exception) {
                Log.e("ProfileViewModel", "❌ Failed to upload profile picture: ${e.message}", e)
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

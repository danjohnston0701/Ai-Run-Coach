
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.Coil
import coil.annotation.ExperimentalCoilApi
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

    private val _isGarminConnected = MutableStateFlow(false)
    val isGarminConnected: StateFlow<Boolean> = _isGarminConnected.asStateFlow()

    // Cache buster timestamp to force image reload
    private val _profilePicCacheBuster = MutableStateFlow(System.currentTimeMillis())
    val profilePicCacheBuster: StateFlow<Long> = _profilePicCacheBuster.asStateFlow()

    init {
        loadUser()
        loadFriendCount()
        checkGarminConnection()
    }

    private fun checkGarminConnection() {
        viewModelScope.launch {
            try {
                val devices = apiService.getConnectedDevices()
                _isGarminConnected.value = devices.any { it.deviceType == "garmin" && it.isActive == true }
            } catch (_: Exception) {
                _isGarminConnected.value = false
            }
        }
    }

    private fun loadUser() {
        val userJson = sharedPrefs.getString("user", null)
        android.util.Log.d("ProfileViewModel", "🔍 Loading user from SharedPreferences")
        android.util.Log.d("ProfileViewModel", "User JSON exists: ${userJson != null}")
        if (userJson != null) {
            try {
                val user = gson.fromJson(userJson, User::class.java)
                // Get or generate short user ID for friend sharing
                val shortUserId = sessionManager.getShortUserId()
                // Create a new user object with the shortUserId attached
                val userWithShortId = user.copy(shortUserId = shortUserId)
                _user.value = userWithShortId
                android.util.Log.d("ProfileViewModel", "✅ User loaded: ${user.name} (ID: ${user.id}, ShortID: $shortUserId)")
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

    @OptIn(ExperimentalCoilApi::class)
    fun uploadProfilePicture(imageUri: Uri) {
        viewModelScope.launch {
            try {
                val user = _user.value ?: return@launch
                val inputStream = context.contentResolver.openInputStream(imageUri)
                val imageBytes = inputStream?.readBytes()
                inputStream?.close()

                if (imageBytes != null) {
                    // Check image size (2MB limit before base64 encoding)
                    if (imageBytes.size > 2 * 1024 * 1024) {
                        Log.e("ProfileViewModel", "❌ Image too large: ${imageBytes.size} bytes (max 2MB)")
                        return@launch
                    }

                    // Convert to base64 (without data URL prefix - backend handles that)
                    val base64Image = android.util.Base64.encodeToString(imageBytes, android.util.Base64.NO_WRAP)
                    
                    // Backend now expects just the base64 without prefix
                    val request = UploadProfilePictureRequest(base64Image)
                    val updatedUser = apiService.uploadProfilePicture(user.id, request)

                    // 1. Clear Coil image cache to force fresh load
                    Coil.imageLoader(context).memoryCache?.clear()
                    Coil.imageLoader(context).diskCache?.clear()
                    Log.d("ProfileViewModel", "🧹 Coil cache cleared")

                    // 2. Update cache buster to force image reload
                    _profilePicCacheBuster.value = System.currentTimeMillis()

                    // 3. Refresh user from API to get fresh data (don't trust response alone)
                    refreshUserFromApi()

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

    /**
     * Refresh user data from API instead of relying on upload response
     * This ensures we get the latest profilePic with proper cache busting
     */
    private fun refreshUserFromApi() {
        viewModelScope.launch {
            try {
                val freshUser = apiService.getCurrentUser()
                
                // Get short user ID
                val shortUserId = sessionManager.getShortUserId()
                val userWithShortId = freshUser.copy(shortUserId = shortUserId)
                
                // Save to SharedPreferences
                val userJson = gson.toJson(userWithShortId)
                sharedPrefs.edit().putString("user", userJson).apply()
                
                // Update UI state
                _user.value = userWithShortId
                
                Log.d("ProfileViewModel", "🔄 User refreshed from API: ${freshUser.name}")
            } catch (e: Exception) {
                Log.e("ProfileViewModel", "❌ Failed to refresh user from API: ${e.message}")
                // Fallback: at least try to reload from SharedPreferences
                loadUser()
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

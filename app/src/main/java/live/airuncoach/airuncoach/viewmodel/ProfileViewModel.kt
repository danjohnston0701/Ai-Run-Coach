
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.UploadProfilePictureRequest
import java.io.ByteArrayOutputStream
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

    // Upload state
    private val _isUploadingProfilePic = MutableStateFlow(false)
    val isUploadingProfilePic: StateFlow<Boolean> = _isUploadingProfilePic.asStateFlow()

    private val _profilePicUploadError = MutableStateFlow<String?>(null)
    val profilePicUploadError: StateFlow<String?> = _profilePicUploadError.asStateFlow()

    private val _profilePicUploadSuccess = MutableStateFlow(false)
    val profilePicUploadSuccess: StateFlow<Boolean> = _profilePicUploadSuccess.asStateFlow()

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
            val user = _user.value ?: return@launch
            _isUploadingProfilePic.value = true
            _profilePicUploadError.value = null
            _profilePicUploadSuccess.value = false

            try {
                // Compress and resize the image on IO thread
                val base64Image = withContext(Dispatchers.IO) {
                    val inputStream = context.contentResolver.openInputStream(imageUri)
                        ?: throw Exception("Could not open image")

                    // Decode bitmap from stream
                    val originalBitmap = BitmapFactory.decodeStream(inputStream)
                    inputStream.close()

                    if (originalBitmap == null) throw Exception("Could not decode image")

                    // Resize to max 800×800 preserving aspect ratio
                    val maxDim = 800
                    val (w, h) = originalBitmap.width to originalBitmap.height
                    val scale = minOf(maxDim.toFloat() / w, maxDim.toFloat() / h, 1f)
                    val resized = if (scale < 1f) {
                        Bitmap.createScaledBitmap(
                            originalBitmap,
                            (w * scale).toInt(),
                            (h * scale).toInt(),
                            true
                        )
                    } else originalBitmap

                    // Compress to JPEG bytes (quality 75 → typically < 200KB)
                    val out = ByteArrayOutputStream()
                    resized.compress(Bitmap.CompressFormat.JPEG, 75, out)
                    val imageBytes = out.toByteArray()

                    Log.d("ProfileViewModel", "📸 Compressed to ${imageBytes.size / 1024}KB")

                    android.util.Base64.encodeToString(imageBytes, android.util.Base64.NO_WRAP)
                }

                val request = UploadProfilePictureRequest(base64Image)
                apiService.uploadProfilePicture(user.id, request)

                // Clear Coil cache so the new image loads fresh
                Coil.imageLoader(context).memoryCache?.clear()
                Coil.imageLoader(context).diskCache?.clear()

                // Bump cache buster so ProfileHeader recomposes with new key
                _profilePicCacheBuster.value = System.currentTimeMillis()

                // Fetch fresh user object (has updated profilePic)
                refreshUserFromApi()

                _profilePicUploadSuccess.value = true
                Log.d("ProfileViewModel", "✅ Profile picture uploaded successfully")

            } catch (e: JsonSyntaxException) {
                val msg = "Server error — profile picture endpoint not deployed"
                Log.e("ProfileViewModel", "❌ $msg")
                _profilePicUploadError.value = msg
            } catch (e: Exception) {
                val msg = e.message ?: "Unknown error"
                Log.e("ProfileViewModel", "❌ Failed to upload profile picture: $msg", e)
                _profilePicUploadError.value = "Upload failed: $msg"
            } finally {
                _isUploadingProfilePic.value = false
            }
        }
    }

    fun clearProfilePicUploadSuccess() { _profilePicUploadSuccess.value = false }
    fun clearProfilePicUploadError() { _profilePicUploadError.value = null }

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

package live.airuncoach.airuncoach.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SessionManager(context: Context) {

    // 1. Create the MasterKey using the modern API (MasterKey, not MasterKeys)
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    // 2. Initialize EncryptedSharedPreferences with error handling for corrupted keys
    private val sharedPreferences: SharedPreferences = try {
        EncryptedSharedPreferences.create(
            context,
            "session_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        // Corrupted encryption keys - clear and recreate
        android.util.Log.e("SessionManager", "EncryptedPrefs corrupted, clearing: ${e.message}")
        context.deleteSharedPreferences("session_prefs")
        EncryptedSharedPreferences.create(
            context,
            "session_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    /**
     * Saves the authentication token to the encrypted preferences.
     */
    fun saveAuthToken(token: String?) {
        if (token.isNullOrBlank()) {
            return // Don't save null or empty tokens
        }
        sharedPreferences.edit {
            putString("auth_token", token)
        }
    }

    /**
     * Retrieves the authentication token from the encrypted preferences.
     */
    fun getAuthToken(): String? {
        return try {
            sharedPreferences.getString("auth_token", null)
        } catch (e: Exception) {
            android.util.Log.e("SessionManager", "Failed to get auth token: ${e.message}")
            null
        }
    }

    /**
     * Clears the authentication token from the encrypted preferences.
     */
    fun clearAuthToken() {
        sharedPreferences.edit {
            remove("auth_token")
            remove("user_id")
        }
    }
    
    /**
     * Saves the user ID to the encrypted preferences.
     */
    fun saveUserId(userId: String?) {
        if (userId.isNullOrBlank()) {
            return
        }
        sharedPreferences.edit {
            putString("user_id", userId)
        }
    }
    
    /**
     * Retrieves the user ID from the encrypted preferences.
     */
    fun getUserId(): String? {
        return try {
            sharedPreferences.getString("user_id", null)
        } catch (e: Exception) {
            Log.e("SessionManager", "Failed to get user ID: ${e.message}")
            null
        }
    }
}

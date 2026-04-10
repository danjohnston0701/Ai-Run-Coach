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
            remove("short_user_id")
            remove("user_name")
        }
    }

    /**
     * Saves the user's display name so it can be sent to the Garmin watch
     * companion app without an additional API call.
     */
    fun saveUserName(name: String?) {
        if (name.isNullOrBlank()) return
        sharedPreferences.edit {
            putString("user_name", name)
        }
    }

    /**
     * Retrieves the user's display name saved at login.
     */
    fun getUserName(): String? {
        return try {
            sharedPreferences.getString("user_name", null)
        } catch (e: Exception) {
            Log.e("SessionManager", "Failed to get user name: ${e.message}")
            null
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

    /**
     * Generates a short user ID for friend sharing (6 characters, alphanumeric uppercase).
     */
    fun generateShortUserId(): String {
        val characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return (1..6).map { characters.random() }.joinToString("")
    }

    /**
     * Saves the short user ID to the encrypted preferences.
     */
    fun saveShortUserId(shortUserId: String?) {
        if (shortUserId.isNullOrBlank()) {
            return
        }
        sharedPreferences.edit {
            putString("short_user_id", shortUserId)
        }
    }

    /**
     * Retrieves the short user ID from the encrypted preferences.
     * If not set, generates and saves a new one.
     */
    fun getShortUserId(): String? {
        return try {
            var shortId = sharedPreferences.getString("short_user_id", null)
            if (shortId.isNullOrBlank()) {
                shortId = generateShortUserId()
                saveShortUserId(shortId)
            }
            shortId
        } catch (e: Exception) {
            Log.e("SessionManager", "Failed to get short user ID: ${e.message}")
            generateShortUserId()
        }
    }

    // ===== Onboarding Flags =====

    /**
     * Marks user as needing profile setup (first time registration)
     */
    fun setNeedsProfileSetup(needs: Boolean) {
        sharedPreferences.edit {
            putBoolean("needs_profile_setup", needs)
        }
    }

    /**
     * Checks if user needs to complete profile setup
     */
    fun needsProfileSetup(): Boolean {
        return sharedPreferences.getBoolean("needs_profile_setup", false)
    }

    /**
     * Marks user as needing coach settings setup
     */
    fun setNeedsCoachSetup(needs: Boolean) {
        sharedPreferences.edit {
            putBoolean("needs_coach_setup", needs)
        }
    }

    /**
     * Checks if user needs to complete coach settings
     */
    fun needsCoachSetup(): Boolean {
        return sharedPreferences.getBoolean("needs_coach_setup", false)
    }

    /**
     * Clears onboarding flags (called after user completes all setup)
     */
    fun clearOnboardingFlags() {
        sharedPreferences.edit {
            remove("needs_profile_setup")
            remove("needs_coach_setup")
        }
    }
}

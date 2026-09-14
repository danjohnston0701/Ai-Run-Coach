package live.airuncoach.airuncoach.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.firebase.crashlytics.FirebaseCrashlytics

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
        // Detach Crashlytics reports from this user now that they're logged out —
        // FirebaseCrashlytics has no "unset", so blank is the documented way to clear it.
        FirebaseCrashlytics.getInstance().setUserId("")
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
        // Tag every subsequent Crashlytics report (crash, ANR, or recordException) with this
        // user so a beta tester's own bug report can be matched to a real stack trace instead
        // of guessed at from a paraphrased description.
        FirebaseCrashlytics.getInstance().setUserId(userId)
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
     * Whether the user still has no fitness level recorded.
     *
     * Fitness level had no completion signal of its own — it merely sat inside the
     * "profile setup" segment, so the three routes that jump straight to coach setup when
     * only needsCoachSetup() is true (sign-up, location permission, and landing on MAIN)
     * skipped straight past it. Derived from the cached user rather than a separate flag so
     * it cannot drift out of sync with what the account actually holds, and so a user whose
     * save failed is asked again rather than being silently marked done.
     */
    fun needsFitnessLevel(): Boolean {
        val userJson = sharedPreferences.getString("user", null) ?: return false
        return try {
            val level = com.google.gson.Gson()
                .fromJson(userJson, live.airuncoach.airuncoach.domain.model.User::class.java)
                ?.fitnessLevel
            level.isNullOrBlank()
        } catch (e: Exception) {
            // A malformed cache must never block a signed-in user out of the app.
            false
        }
    }

    /**
     * Whether this device has finished the feature tour.
     *
     * The server already records `onboardingTourCompletedAt` on the user, but it's written
     * fire-and-forget and isn't mirrored on the local user model, so it can't gate UI the
     * instant the tour ends. This can: it's set the moment the tour reaches its natural end and
     * read by OnboardingSubscriptionScreen to hide the "take a tour" card. Per-device by design
     * — onboarding is a per-install experience — and deliberately NOT set when the tour is
     * skipped, since skipping isn't doing it.
     *
     * Deliberately NOT cleared by clearOnboardingFlags(): that runs every time the user passes
     * back through onboarding, which is exactly the path that re-shows the card.
     */
    /**
     * Local mirror of the user's distanceDecimalsEnabled preference.
     *
     * The run-setup screen needs this before its first frame to decide whether to render a
     * slider or a numeric field, and it has no user object of its own — only SharedPreferences,
     * which is already where it keeps the last target distance. Written whenever the profile
     * toggle is saved; the server value remains the source of truth on next sign-in.
     */
    fun distanceDecimalsEnabled(): Boolean =
        sharedPreferences.getBoolean("distance_decimals_enabled", false)

    fun setDistanceDecimalsEnabled(enabled: Boolean) {
        sharedPreferences.edit { putBoolean("distance_decimals_enabled", enabled) }
    }

    fun hasCompletedOnboardingTour(): Boolean =
        sharedPreferences.getBoolean("onboarding_tour_completed", false)

    fun setOnboardingTourCompleted() {
        sharedPreferences.edit { putBoolean("onboarding_tour_completed", true) }
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

    // ===== Local JWT Token Validation =====

    /**
     * Checks whether the stored JWT token has expired, using only the local
     * token payload — no network call required.
     *
     * JWTs are signed by the server and contain an `exp` (expiry) claim in
     * the payload. We can safely trust this value for the purpose of deciding
     * whether to send the user to the login screen; the server will still
     * reject an invalid/tampered token with 401 if someone forges an `exp`.
     *
     * @return true if no token exists OR the token's exp is in the past.
     */
    fun isTokenExpired(): Boolean {
        val token = getAuthToken() ?: return true
        return try {
            // JWT format: header.payload.signature (all base64url-encoded)
            val parts = token.split(".")
            if (parts.size != 3) return true

            // Pad to a valid base64 length and convert base64url → base64
            val padded = parts[1]
                .replace('-', '+')
                .replace('_', '/')
                .let { it.padEnd((it.length + 3) / 4 * 4, '=') }

            val payloadJson = String(android.util.Base64.decode(padded, android.util.Base64.DEFAULT))
            val exp = org.json.JSONObject(payloadJson).getLong("exp")
            val nowSeconds = System.currentTimeMillis() / 1000

            exp < nowSeconds
        } catch (e: Exception) {
            Log.w("SessionManager", "Could not parse JWT exp — treating as expired: ${e.message}")
            true
        }
    }

    /**
     * Returns true if the session is valid: a token exists and has not expired.
     * Use this on app startup to decide whether to skip the login screen.
     */
    fun isSessionValid(): Boolean = !isTokenExpired()

    /**
     * Clears the entire session when user logs out or deletes their account.
     * Removes all auth tokens, user IDs, and onboarding flags.
     */
    fun clearSession() {
        sharedPreferences.edit {
            remove("auth_token")
            remove("user_id")
            remove("short_user_id")
            remove("user_name")
            remove("needs_profile_setup")
            remove("needs_coach_setup")
        }
    }
}

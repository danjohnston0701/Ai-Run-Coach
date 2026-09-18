package live.airuncoach.airuncoach.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.firebase.crashlytics.FirebaseCrashlytics
import live.airuncoach.airuncoach.utils.TargetDistance

class SessionManager(context: Context) {

    // 1. Create the MasterKey using the modern API (MasterKey, not MasterKeys)
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    // 2. Initialize EncryptedSharedPreferences with error handling for corrupted keys
    // Plain prefs shared with the view models — holds the cached "user" JSON.
    private val userPrefs: SharedPreferences =
        context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)

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
            // Every successful login/sign-up lands here, so this is the one place to record
            // that this install has had an account on it. Deliberately NOT removed by
            // clearSession(): a signed-out device is still a returning device and should get
            // the sign-in form, not the fresh-install "Create a Free Account" welcome.
            putBoolean("has_ever_logged_in", true)
        }
    }

    /**
     * Whether any account has ever signed in on this install. False means a fresh download
     * that has never got past the login screen — the audience LoginScreen's create-account
     * welcome exists for.
     */
    fun hasEverLoggedIn(): Boolean = sharedPreferences.getBoolean("has_ever_logged_in", false)

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
    /**
     * The cached user object, as written by login/profile flows. Lives in the plain
     * "user_prefs" file (key "user"), NOT in the encrypted session store this class otherwise
     * uses — the earlier needsFitnessLevel() read the wrong file and so never fired.
     */
    private fun cachedUser(): live.airuncoach.airuncoach.domain.model.User? {
        val userJson = userPrefs.getString("user", null) ?: return null
        return try {
            com.google.gson.Gson()
                .fromJson(userJson, live.airuncoach.airuncoach.domain.model.User::class.java)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * The athlete's profile walk/run preference ("run"/"walk", any case) from the cached user,
     * or null when unknown. Used only where a session has no run/walk toggle of its own (a
     * coaching-plan workout with an ambiguous type) — a toggle, where one exists, always wins.
     */
    fun defaultSessionType(): String? = cachedUser()?.defaultSessionType

    fun needsFitnessLevel(): Boolean {
        // A malformed or missing cache must never block a signed-in user out of the app.
        val user = cachedUser() ?: return false
        return user.fitnessLevel.isNullOrBlank()
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
     * Decimal places (0–3) for the target-distance control, from the cached user. The dashboard
     * and run-setup screens need this before their first frame to decide whether to render a
     * slider or a numeric field; reading the cached user (rather than a separate mirror) means
     * it's correct straight after sign-in and after every profile save, with nothing to sync.
     */
    fun targetDistanceDecimals(): Int =
        (cachedUser()?.targetDistanceDecimals ?: 0).coerceIn(0, 3)

    /**
     * Slider window (min..max km) for the target distance, from the cached user. Legacy rows
     * default to 0–50, so a min below 1 km is lifted to 1 and an inverted pair falls back to
     * the 1–50 default rather than producing an empty slider.
     */
    fun targetDistanceRange(): ClosedFloatingPointRange<Float> {
        val user = cachedUser()
        val min = (user?.distanceMinKm ?: 0f).coerceAtLeast(TargetDistance.DEFAULT_MIN_KM.toFloat())
        val max = user?.distanceMaxKm ?: TargetDistance.DEFAULT_MAX_KM.toFloat()
        return if (max > min) min..max
        else TargetDistance.DEFAULT_MIN_KM.toFloat()..TargetDistance.DEFAULT_MAX_KM.toFloat()
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

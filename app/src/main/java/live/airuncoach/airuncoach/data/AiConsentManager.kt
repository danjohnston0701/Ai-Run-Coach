package live.airuncoach.airuncoach.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

/**
 * Manages the user's explicit consent to AI coaching features.
 *
 * Per App Store guidelines (Guideline 5.1.1 — Third-Party AI Service), the app must obtain
 * explicit consent before sending workout data to OpenAI. This manager stores:
 *  - Whether the consent screen has been shown this install
 *  - Whether the user granted or declined AI data sharing
 *
 * Choice is stored locally in plain SharedPreferences (non-sensitive — it is a user preference,
 * not a credential). The consent screen is shown once per install in the auth flow and again
 * every time the master AI toggle is turned on in Coach Settings.
 */
class AiConsentManager(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREFS_NAME = "ai_consent_prefs"

        /** Whether the user has seen the consent screen at least once this install. */
        const val KEY_CONSENT_SEEN = "ai_consent_seen"

        /** Whether the user has actively granted consent to AI data sharing. */
        const val KEY_CONSENT_GRANTED = "ai_consent_granted"
    }

    /** Returns true if the user has already been shown the consent screen. */
    fun hasSeenConsent(): Boolean =
        prefs.getBoolean(KEY_CONSENT_SEEN, false)

    /** Returns true if the user has explicitly allowed AI coaching data sharing. */
    fun isAiConsentGranted(): Boolean =
        prefs.getBoolean(KEY_CONSENT_GRANTED, false)

    /**
     * Marks the consent screen as seen and stores the user's choice.
     *
     * @param granted true if the user tapped "Allow AI Coaching", false if they declined.
     */
    fun setConsent(granted: Boolean) {
        prefs.edit {
            putBoolean(KEY_CONSENT_SEEN, true)
            putBoolean(KEY_CONSENT_GRANTED, granted)
        }
    }

    /**
     * Resets consent to not-granted without clearing the seen flag.
     * Used when the master AI toggle is turned off.
     */
    fun revokeConsent() {
        prefs.edit {
            putBoolean(KEY_CONSENT_GRANTED, false)
        }
    }

    /**
     * Clears all consent data (e.g. on account deletion or full app reset).
     */
    fun clearConsent() {
        prefs.edit { clear() }
    }
}

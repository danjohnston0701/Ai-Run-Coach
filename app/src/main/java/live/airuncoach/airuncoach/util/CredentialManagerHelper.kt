package live.airuncoach.airuncoach.util

import android.app.Activity
import android.util.Log
import androidx.credentials.CreatePasswordRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPasswordOption
import androidx.credentials.PasswordCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException

/**
 * Handles credential saving and retrieval for password managers.
 * Supports Samsung Pass, Google Password Manager, and all Android credential providers.
 *
 * Usage after successful login:
 *   CredentialManagerHelper.saveCredential(activity, email, password)
 *
 * Usage on login screen load (to offer autofill):
 *   val saved = CredentialManagerHelper.getSavedCredential(activity)
 *   if (saved != null) { /* pre-fill email + password */ }
 */
object CredentialManagerHelper {

    private const val TAG = "CredentialManager"

    /**
     * Saves credentials to the device's credential store (Samsung Pass / Google PM etc.)
     * Shows the system "Save password?" bottom sheet after a successful login.
     *
     * Must be called from an Activity context (not Application context).
     * Failures are logged but never propagated — login success is never blocked by this.
     */
    suspend fun saveCredential(activity: Activity, email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            Log.w(TAG, "Skipping credential save — email or password is blank")
            return
        }
        try {
            val credentialManager = CredentialManager.create(activity)
            val request = CreatePasswordRequest(
                id = email,
                password = password
            )
            credentialManager.createCredential(
                context = activity,
                request = request
            )
            Log.d(TAG, "✅ Credentials saved to password manager for $email")
        } catch (e: CreateCredentialCancellationException) {
            // User dismissed the "Save password?" dialog — perfectly fine
            Log.d(TAG, "ℹ️ User declined to save credentials")
        } catch (e: CreateCredentialException) {
            // No credential provider installed or provider returned an error — silently skip
            Log.w(TAG, "⚠️ Could not save credentials: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Unexpected error saving credentials: ${e.message}")
        }
    }

    /**
     * Retrieves a previously saved password credential (for autofill on login screen).
     * Returns a Pair(email, password) if the user selects a saved account, null otherwise.
     *
     * Call this on login screen load to pre-fill credentials if available.
     */
    suspend fun getSavedCredential(activity: Activity): Pair<String, String>? {
        return try {
            val credentialManager = CredentialManager.create(activity)
            val request = GetCredentialRequest(
                credentialOptions = listOf(GetPasswordOption())
            )
            val result = credentialManager.getCredential(
                context = activity,
                request = request
            )
            val credential = result.credential
            if (credential is PasswordCredential) {
                Log.d(TAG, "✅ Retrieved saved credential for ${credential.id}")
                Pair(credential.id, credential.password)
            } else {
                null
            }
        } catch (e: NoCredentialException) {
            // No saved credentials — silently return null
            null
        } catch (e: GetCredentialCancellationException) {
            // User dismissed the picker
            null
        } catch (e: GetCredentialException) {
            Log.w(TAG, "Could not retrieve credentials: ${e.message}")
            null
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error retrieving credentials: ${e.message}")
            null
        }
    }
}

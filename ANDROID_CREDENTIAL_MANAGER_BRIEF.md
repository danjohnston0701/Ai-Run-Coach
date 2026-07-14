# Android Credential Manager Implementation Brief

**Status**: Ready for Implementation  
**Priority**: Medium (improves UX, not critical for MVP)  
**Estimated Time**: 2-3 hours  
**API Level**: Android 4.1+ (credential manager works on all versions; best on Android 13+)

---

## Overview

Enable Samsung Pass, Google Password Manager, and other Android password managers to save & autofill login credentials. This is a **seamless UX improvement** — no extra UI needed, just backend support.

---

## What This Does

Users see a **"Save password?"** prompt after successful login:
- Samsung devices → Samsung Pass dialog
- Google devices → Google Password Manager dialog
- Other devices → Generic Android credential manager
- Users can choose to save or skip

On next login:
- Password field shows autofill suggestions
- One tap to fill email & password
- Faster repeat logins, better UX

---

## Implementation Plan

### Step 1: Add Dependencies (5 min)

In `build.gradle.kts`:

```kotlin
dependencies {
    // Credential Manager (Android 13+, backport to Android 4.1+)
    implementation("androidx.credentials:credentials:1.2.2")
    implementation("androidx.credentials:credentials-play-services-auth:1.2.2")
    implementation("com.google.android.gms:play-services-auth:20.7.0")
}
```

### Step 2: Create Credential Helper (20 min)

Create new file: `util/CredentialManagerHelper.kt`

```kotlin
package live.airuncoach.airuncoach.util

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CreatePasswordRequest
import androidx.credentials.CreatePasswordResponse
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Handles credential saving for password managers (Samsung Pass, Google PM, etc.)
 */
class CredentialManagerHelper(private val context: Context) {

    private val credentialManager = CredentialManager.create(context)

    /**
     * Save login credentials to the device's credential manager.
     * Shows appropriate UI for Samsung Pass / Google Password Manager / etc.
     *
     * @param email User's email (used as username for credential)
     * @param password User's password
     * @return true if save was successful or user approved it
     */
    suspend fun saveCredential(email: String, password: String): Boolean {
        return try {
            val request = CreatePasswordRequest(
                id = email,           // Username is the email
                password = password,
                signInMethod = "email" // Identifies this as email-based login
            )

            val result = suspendCancellableCoroutine<CreatePasswordResponse?> { continuation ->
                try {
                    credentialManager.createCredentialAsync(
                        context,
                        request,
                        object : androidx.credentials.CredentialManagerCallback<CreatePasswordResponse, androidx.credentials.CreateCredentialException> {
                            override fun onSuccess(result: CreatePasswordResponse) {
                                continuation.resume(result)
                            }

                            override fun onError(e: androidx.credentials.CreateCredentialException) {
                                Log.d("CredentialManager", "User cancelled save or error: ${e.message}")
                                // Don't crash — user may have declined to save
                                continuation.resume(null)
                            }
                        }
                    )
                } catch (e: Exception) {
                    Log.e("CredentialManager", "Error in saveCredential: ${e.message}")
                    continuation.resumeWithException(e)
                }
            }

            result != null
        } catch (e: Exception) {
            Log.e("CredentialManager", "Failed to save credential: ${e.message}")
            false // Don't crash login if credential save fails
        }
    }
}
```

### Step 3: Inject into LoginViewModel (10 min)

In `LoginViewModel.kt`:

```kotlin
@HiltViewModel
class LoginViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager,
    private val garminWatchManager: GarminWatchManager,
    // NEW: Add credential manager
    private val credentialManager: CredentialManagerHelper = CredentialManagerHelper(context)
) : ViewModel() {
    // ... existing code ...
    
    fun login() {
        viewModelScope.launch {
            _loginState.update { it.copy(isLoading = true, error = null) }
            try {
                val email = _loginState.value.email.trim().lowercase()
                val password = _loginState.value.password
                
                // ... existing login logic ...
                
                // After successful login and token save (around line 155):
                _loginState.update { it.copy(isLoading = false, error = null, isLoginSuccessful = true) }
                
                // NEW: Save credential (non-blocking, don't crash login if it fails)
                viewModelScope.launch {
                    val saved = credentialManager.saveCredential(email, password)
                    if (saved) {
                        Log.d("LoginViewModel", "✅ Credentials saved to password manager")
                    } else {
                        Log.d("LoginViewModel", "User declined to save credentials or credential manager unavailable")
                    }
                }
                
                // ... rest of login logic ...
            } catch (e: Exception) {
                // ... existing error handling ...
            }
        }
    }
}
```

### Step 4: Handle Autofill Hints in UI (15 min)

In `LoginScreen.kt`, add autofill hints to the email and password fields:

```kotlin
TextField(
    value = loginState.email,
    onValueChange = { viewModel.onEmailChange(it) },
    modifier = Modifier
        .fillMaxWidth()
        .bringIntoViewRequester(emailBringIntoView)
        .onFocusEvent { ... }
        // NEW: Add autofill hint
        .semantics {
            contentDescription = "Email address"
        },
    keyboardOptions = KeyboardOptions(
        keyboardType = KeyboardType.Email,
        imeAction = ImeAction.Next
    ),
    autofillTypes = listOf(AutofillType.EmailAddress), // NEW
    // ... rest of config ...
)

TextField(
    value = loginState.password,
    onValueChange = { viewModel.onPasswordChange(it) },
    modifier = Modifier
        .fillMaxWidth()
        .bringIntoViewRequester(passwordBringIntoView)
        .onFocusEvent { ... }
        // NEW: Add autofill hint
        .semantics {
            contentDescription = "Password"
        },
    keyboardOptions = KeyboardOptions(
        keyboardType = KeyboardType.Password,
        imeAction = ImeAction.Go
    ),
    autofillTypes = listOf(AutofillType.Password), // NEW
    // ... rest of config ...
)
```

### Step 5: AndroidManifest.xml (2 min)

Ensure you have the credential manager permission (usually automatic, but verify):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- Credential Manager is implicit — no permission needed -->
```

---

## How It Works (User Experience)

### First Login
1. User enters email & password
2. Taps "Log In"
3. Login succeeds
4. **"Save password in [Samsung Pass / Google Password Manager]?"** prompt appears
5. User taps "Save" or dismisses
6. Login completes

### Second Login
1. User taps email field
2. **Autofill suggestions appear** with their email
3. User taps the suggestion
4. Email auto-fills
5. User taps password field
6. **Password suggestions appear**
7. User taps the suggestion
8. Password auto-fills
9. User taps "Log In" (or password field shows "Manage passwords" option)

---

## Testing Checklist

- [ ] Build project (new dependencies don't break)
- [ ] Login successfully
- [ ] After successful login, credential manager prompt appears (may vary by device)
- [ ] Tapping "Save" doesn't crash
- [ ] Dismissing prompt doesn't crash
- [ ] New login screen shows autofill suggestions
- [ ] Tapping autofill suggestion fills fields correctly
- [ ] Login works normally even if credential manager is unavailable
- [ ] Works on:
  - [ ] Samsung device (Samsung Pass)
  - [ ] Google device (Google Password Manager)
  - [ ] Other Android devices (system password manager)
  - [ ] Older Android versions (gracefully degrades)

---

## Important Notes

### Non-Blocking (Critical!)
**The credential save must NOT block or crash login.** If the credential manager fails:
- Login still completes ✅
- User never sees an error
- App logs the failure silently
- User can still manually save in settings

This is why we wrap it in a separate `viewModelScope.launch` after the main login succeeds.

### Privacy Safe
- Credentials are stored in Android's **encrypted credential storage**
- Samsung Pass: Encrypted by Samsung Knox (hardware-backed)
- Google Password Manager: Encrypted by Google Play Services
- App can **never read saved passwords** — only request save
- App can **never access** Samsung Pass or Google PM data directly

### Graceful Degradation
Works on ALL Android versions:
- **Android 13+**: Full integration with system UI
- **Android 4.1-12**: Credential Manager lib provides backport
- **No Play Services**: Silently fails, login still works

---

## Optional Enhancements (Future)

1. **Auto-login on app launch** — If credential available, auto-fill and login
2. **"Forgot password?" integration** — Link to password reset
3. **Multiple accounts** — Show all saved credentials on login screen
4. **Biometric unlock** — Samsung Pass + Face/Fingerprint

For now, just implement basic save/autofill.

---

## Code Locations to Modify

1. **`build.gradle.kts`** — Add dependencies
2. **`util/CredentialManagerHelper.kt`** — NEW file, credential logic
3. **`viewmodel/LoginViewModel.kt`** — Add credential save call
4. **`ui/screens/LoginScreen.kt`** — Add autofill hints

That's it! No activity-level changes, no special permissions.

---

## Benefits

✅ **Better UX** — Faster repeated logins  
✅ **User trust** — Shows professional credential handling  
✅ **Samsung integration** — Works seamlessly with Samsung Pass  
✅ **Google integration** — Works with Google Password Manager  
✅ **Platform standard** — Expected behavior on modern Android  
✅ **No friction** — Optional, users can decline  
✅ **Secure** — Uses OS-level encryption  

---

## Questions?

This is a non-critical nice-to-have feature. Implement after core pricing/onboarding work is done.

If credential save fails, login still works — there's no risk.

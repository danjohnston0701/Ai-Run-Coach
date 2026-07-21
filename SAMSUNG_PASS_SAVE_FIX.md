# Samsung Pass Save Prompt Fix

## Issue
When a user logged in using Samsung Pass autofill (retrieving saved credentials), the app would then immediately prompt them to save those same credentials again, creating a confusing UX.

## Root Cause
The login flow was:
1. User taps Samsung Pass and autofills email/password
2. Login succeeds
3. App calls `CredentialManagerHelper.saveCredential()` unconditionally
4. Samsung Pass shows "Save password?" dialog for credentials that were just auto-filled

This resulted in a redundant prompt to save credentials the user already had saved.

## Solution
Added credential source tracking to distinguish between:
- **Manually entered credentials** → Show save prompt after successful login
- **Autofilled credentials from password manager** → Skip save prompt since they're already saved

### Changes Made

#### 1. **LoginState.kt** - Track credential source
```kotlin
// Track if credentials came from Samsung Pass / password manager autofill
val credentialsFromPasswordManager: Boolean = false
```

#### 2. **LoginViewModel.kt** - Reset flag on manual changes
- `onEmailChange()` and `onPasswordChange()` now reset the flag to `false`
- This allows re-prompting if the user manually edits the autofilled credentials
- New method `markCredentialsFromPasswordManager(Boolean)` to set the flag

#### 3. **LoginScreen.kt** - Two key updates

**On screen load** (credential retrieval):
```kotlin
val saved = CredentialManagerHelper.getSavedCredential(activity)
if (saved != null) {
    viewModel.onEmailChange(saved.first)
    viewModel.onPasswordChange(saved.second)
    // Mark credentials as coming from password manager
    viewModel.markCredentialsFromPasswordManager(true)
}
```

**On successful login** (credential saving):
```kotlin
if (!loginState.credentialsFromPasswordManager) {
    // Only save if NOT from password manager
    CredentialManagerHelper.saveCredential(activity, email, password)
} else {
    Log.d("LoginScreen", "Credentials from password manager — skipping save prompt")
}
```

## Behavior After Fix

### Scenario 1: Login with saved Samsung Pass credentials
1. User opens app → credentials auto-fill from Samsung Pass ✓
2. Login succeeds → NO save prompt (credentials already saved)
3. Smooth experience ✓

### Scenario 2: Login with manually entered credentials
1. User opens app → empty fields
2. User types email and password → fields populated manually
3. Login succeeds → save prompt appears ✓
4. User can save to Samsung Pass ✓

### Scenario 3: Login with auto-filled + manual edits
1. User opens app → credentials auto-fill
2. User edits email or password → flag resets to `false`
3. Login succeeds → save prompt appears with new credentials ✓

## Technical Details
- No breaking changes to `CredentialManagerHelper`
- Flag resets automatically when user makes any manual change
- Clean separation of concerns (screen handles UX flow, helper handles credential API)
- Logging added for debugging the credential source

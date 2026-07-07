---
name: Android auth token storage
description: Canonical source of the JWT in the Android app
---
The Android JWT is stored by `SessionManager` (data/SessionManager.kt) in **EncryptedSharedPreferences** named **"session_prefs"**, key **"auth_token"**. The Retrofit interceptor (network/RetrofitClient.kt) reads it via `SessionManager.getAuthToken()` — that is why native API calls carry a valid Bearer token.

**Trap:** there is also a plain unencrypted `getSharedPreferences("user_prefs")` used for other data (the user JSON blob under key "user", config flags). The auth token is NOT there. Reading `user_prefs.getString("auth_token")` returns empty and silently breaks auth.

**How to apply:** any code (e.g. a WebView that must forward auth into a React page) needs the token — get it from `SessionManager(context).getAuthToken()`, never from `user_prefs`.

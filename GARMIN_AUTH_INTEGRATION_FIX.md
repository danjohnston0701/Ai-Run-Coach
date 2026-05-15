# 🔐 Garmin Watch App Authentication Integration - Issue & Solution

## Problem Identified

When you log in on the Android phone app, the watch shows "Waiting for phone..." but never receives authentication credentials. 

### Root Cause

The `LoginViewModel.kt` file:
1. ✅ Successfully authenticates with backend
2. ✅ Saves auth token locally to phone
3. ✅ Updates login UI state
4. ❌ **NEVER sends the auth token to the Garmin watch app**

The Garmin watch app (`StartView.mc`) is listening for a message with:
- `type: "auth"`
- `authToken`: (JWT token)
- `runnerName`: (user's name)

But this message is never sent!

---

## The Fix: Send Auth Token to Watch

You need to add **Garmin phone app integration** that sends the authentication message to the connected watch.

### What Needs to Be Added

1. **Garmin ConnectIQ SDK Integration** (Android library)
2. **Message Sender Service** (sends auth token to watch)
3. **Permission Setup** (allow app to communicate with watch)
4. **Integration Point** (call after successful login)

---

## Implementation Steps

### Step 1: Add Garmin ConnectIQ Dependency

Edit `app/build.gradle.kts`:

```gradle
dependencies {
    // ... existing dependencies ...
    
    // Garmin Connect IQ SDK
    implementation 'com.garmin:connectiq:5.4.0'  // Check for latest version
}
```

### Step 2: Create GarminMessenger Service

Create file: `app/src/main/java/live/airuncoach/airuncoach/service/GarminMessenger.kt`

```kotlin
package live.airuncoach.airuncoach.service

import android.content.Context
import android.util.Log
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQDevice
import com.garmin.android.connectiq.exception.ServiceUnavailableException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class GarminMessenger(private val context: Context) {
    
    private var connectIQ: ConnectIQ? = null
    private var devices: List<IQDevice> = emptyList()
    
    suspend fun initialize() = withContext(Dispatchers.Default) {
        try {
            connectIQ = ConnectIQ.getInstance(context, ConnectIQ.IQConnectType.WIRELESS)
            connectIQ?.initialize(object : ConnectIQ.ConnectIQListener {
                override fun onSdkReady() {
                    Log.d("GarminMessenger", "ConnectIQ SDK ready")
                }
                
                override fun onInitializationComplete(successful: Boolean) {
                    Log.d("GarminMessenger", "ConnectIQ initialization: $successful")
                }
                
                override fun onSdkShutDown() {
                    Log.d("GarminMessenger", "ConnectIQ SDK shut down")
                }
            })
            
            devices = connectIQ?.connectedDevices ?: emptyList()
            Log.d("GarminMessenger", "Found ${devices.size} connected Garmin devices")
            
        } catch (e: ServiceUnavailableException) {
            Log.e("GarminMessenger", "ConnectIQ Service not available", e)
        } catch (e: Exception) {
            Log.e("GarminMessenger", "Failed to initialize ConnectIQ", e)
        }
    }
    
    suspend fun sendAuthToken(
        authToken: String,
        runnerName: String
    ) = withContext(Dispatchers.Default) {
        try {
            // Refresh device list
            devices = connectIQ?.connectedDevices ?: emptyList()
            
            if (devices.isEmpty()) {
                Log.w("GarminMessenger", "No connected Garmin devices")
                return@withContext false
            }
            
            val message = mapOf(
                "type" to "auth",
                "authToken" to authToken,
                "runnerName" to runnerName
            )
            
            var sentSuccessfully = false
            
            for (device in devices) {
                try {
                    // Send message to AI Run Coach app (UUID: C7BF12555C184F9FB1F82B49E72E20A2)
                    connectIQ?.sendMessage(
                        device,
                        "C7BF12555C184F9FB1F82B49E72E20A2",  // Production UUID
                        message,
                        object : ConnectIQ.IQSendMessageListener {
                            override fun onMessageStatus(device: IQDevice?, requestId: Int, status: ConnectIQ.IQMessageStatus?) {
                                if (status == ConnectIQ.IQMessageStatus.SUCCESS) {
                                    Log.d("GarminMessenger", "✅ Auth message sent to ${device?.friendlyName}")
                                    sentSuccessfully = true
                                } else {
                                    Log.e("GarminMessenger", "❌ Failed to send auth message: $status")
                                }
                            }
                        }
                    )
                } catch (e: Exception) {
                    Log.e("GarminMessenger", "Error sending message to device", e)
                }
            }
            
            sentSuccessfully
            
        } catch (e: Exception) {
            Log.e("GarminMessenger", "Failed to send auth token", e)
            false
        }
    }
    
    fun shutdown() {
        try {
            connectIQ?.shutdown(context)
        } catch (e: Exception) {
            Log.e("GarminMessenger", "Error shutting down ConnectIQ", e)
        }
    }
}
```

### Step 3: Add Permissions

Edit `app/src/main/AndroidManifest.xml`:

```xml
<manifest ...>
    <!-- Existing permissions -->
    
    <!-- Garmin ConnectIQ Permissions -->
    <uses-permission android:name="com.garmin.android.connectiq.permission.BROADCAST_INTENT_ACTION" />
    
    <!-- Bluetooth/Network (already needed) -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.INTERNET" />
    
    ...
</manifest>
```

### Step 4: Integrate into LoginViewModel

Edit `app/src/main/java/live/airuncoach/airuncoach/viewmodel/LoginViewModel.kt`:

Add this import at the top:
```kotlin
import live.airuncoach.airuncoach.service.GarminMessenger
```

Modify the `login()` function - after line 153 where it sets `isLoginSuccessful = true`:

```kotlin
_loginState.update { it.copy(isLoading = false, error = null, isLoginSuccessful = true) }
android.util.Log.d("LoginViewModel", "🎉 Login state updated to successful!")

// 🆕 NEW: Send auth token to connected Garmin watch
try {
    val garminMessenger = GarminMessenger(context)
    garminMessenger.initialize()
    
    val messageSent = garminMessenger.sendAuthToken(
        authToken = token,
        runnerName = user.name
    )
    
    if (messageSent) {
        android.util.Log.d("LoginViewModel", "✅ Auth token sent to Garmin watch!")
    } else {
        android.util.Log.w("LoginViewModel", "⚠️ Could not send auth token to watch (may not be connected)")
    }
    
    garminMessenger.shutdown()
} catch (e: Exception) {
    android.util.Log.w("LoginViewModel", "Garmin messenger failed: ${e.message}")
}

// Upload FCM token now that we're authenticated
uploadFcmToken()
```

Also add to the `register()` function at the same location (after line 308).

---

## How It Will Work

### Before (Current Broken Flow)
```
1. Open Garmin app on watch
   → Shows "Waiting for phone..."
2. Log into Android app
   → Phone authenticates ✅
   → Token saved locally ✅
   → Watch never receives token ❌
   → Watch stays in "Waiting" state 😢
```

### After (Fixed Flow)
```
1. Open Garmin app on watch
   → Shows "Waiting for phone..."
2. Log into Android app
   → Phone authenticates ✅
   → Token saved locally ✅
   → Phone sends auth message to watch ✅
3. Watch receives auth message
   → Saves token & name locally ✅
   → Shows "READY" with your name ✅
   → Press START to run 🏃
```

---

## Testing the Fix

### On Android:
1. Make sure Bluetooth is ON
2. Make sure Garmin watch is **paired** with phone
3. Make sure Garmin watch has the AI Run Coach app installed
4. Log in to AI Run Coach app

### On Watch:
1. Open AI Run Coach app
2. Should change from "Waiting for phone..." to "READY" with your name
3. Connection dot (top-right) should turn green

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Watch still says "Waiting..." | Check watch has app installed, Bluetooth is on, devices are paired |
| "Connection dot" not green | Phone and watch must be connected via Bluetooth |
| Message doesn't send | Check Garmin ConnectIQ app is installed on phone |
| App crashes on login | Check all imports are correct, Garmin SDK is added |

---

## Dependencies Required

Add to `build.gradle.kts`:

```gradle
dependencies {
    // Garmin ConnectIQ SDK
    implementation 'com.garmin:connectiq:5.4.0'
}
```

Check latest version: https://maven.garmin.com/

---

## Production UUID Reference

**App ID for sending messages**: `C7BF12555C184F9FB1F82B49E72E20A2`

This is the same UUID we extracted from the production IQ file earlier.

---

## Summary

The issue is that **nothing is sending the auth token to the watch**. Once you add the Garmin messenger code and call it after login, the watch will immediately receive authentication and show "READY" instead of "Waiting for phone...".

This is the missing piece that completes the Garmin integration! 🎯


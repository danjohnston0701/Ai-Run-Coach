# Garmin Watch Communication Issue - Missing Phone App Implementation

## Problem

The Garmin watch companion app shows **"Waiting for phone"** and never connects, even though:
- ✅ The watch companion app is installed
- ✅ Bluetooth is connected between phone and watch
- ✅ The watch is registered with Garmin
- ❌ **The Android phone app is NOT sending authentication tokens to the watch**

## Root Cause

**Missing Implementation**: The phone app (client) doesn't have code to send Garmin ConnectIQ messages to the watch.

### What Exists:
- `garmin-companion-app/source/views/StartView.mc` - Watch waiting for "auth" message type
- `server/routes.ts` lines 7866+ - Backend companion session endpoints
- `garmin-companion-app/source/networking/PhoneLink.mc` - Watch-side message receiver

### What's Missing:
- **Phone app code to send authentication token to the watch**
- **Garmin ConnectIQ SDK integration in the phone app**
- **Message broadcast to the companion app after login**

## How It Should Work

```
1. User logs into phone app
2. Phone app calls: GET /api/auth/garmin/callback (gets auth token)
3. Phone app initializes Garmin ConnectIQ connection
4. Phone app sends Bluetooth message to watch:
   {
     "type": "auth",
     "authToken": "<JWT token>",
     "runnerName": "<user's name>"
   }
5. Watch receives message and stores token
6. Watch shows "Ready" screen with green dot (connected)
7. User can start a run on watch, which syncs to phone
```

## What Needs to Be Implemented

### 1. Add Garmin ConnectIQ SDK to Android App

```gradle
// In android/app/build.gradle.kts
dependencies {
    implementation("com.garmin.connectiq:ciq-companion-app-sdk:3.0.0")
}
```

### 2. Create GarminWatchManager.kt (or similar)

```kotlin
class GarminWatchManager(context: Context) {
    
    private var connectIQ: ConnectIQ? = null
    
    fun initialize() {
        // Initialize Garmin ConnectIQ SDK
        connectIQ = ConnectIQ.getInstance()
        connectIQ?.initialize(...)
    }
    
    fun sendAuthToWatch(authToken: String, runnerName: String) {
        val device = getConnectedDevice() // Get paired watch
        val appId = "your-app-id" // From Garmin Developer
        
        val message = mapOf(
            "type" to "auth",
            "authToken" to authToken,
            "runnerName" to runnerName
        )
        
        connectIQ?.sendMessage(device, appId, message) { success ->
            if (success) {
                Log.d("Garmin", "Auth sent to watch")
            }
        }
    }
}
```

### 3. Hook into Login Flow

In your phone app's login/authentication flow:

```typescript
// After successful authentication
const authToken = sessionManager.getAuthToken();
const userName = user.name;

// Send to watch
garminWatchManager.sendAuthToWatch(authToken, userName);
```

### 4. Alternative: Use Expo Native Module

If you're using Expo, you'll need to:
1. Create an Expo module with Garmin SDK
2. Or use `expo-managed` workflow with EAS build

## Implementation Files Needed

- `android/app/src/main/java/com/airuncoach/garmin/GarminWatchManager.kt` - Main manager class
- `android/app/src/main/java/com/airuncoach/garmin/CompanionMessenger.kt` - Message handler
- Update to app startup code - Initialize Garmin SDK
- Update to auth flow - Send token after successful login

## Testing the Fix

1. **Build and deploy the updated Android app**
2. **Login on the phone**
3. **Watch should receive the auth message**
4. **Watch screen changes from "Waiting for phone" to "Ready"**
5. **Green dot appears in top-right corner of watch**
6. **User can press START on watch to begin run**

## Backend Endpoints (Already Implemented)

Your backend is ready with these endpoints:

- `POST /api/garmin-companion/auth` - Authenticate companion session
- `POST /api/garmin-companion/session/start` - Start a run session on watch
- `POST /api/garmin-companion/session/link` - Link watch session to phone run

See `server/routes.ts` lines 7866-8050 for implementation.

## Important Notes

- **Garmin Developer Account**: You need an account with app ID and keys
- **SDK Version**: Use ConnectIQ SDK 3.0+ for best compatibility
- **Manifest**: Update `garmin-companion-app/manifest.xml` with correct app ID and permissions
- **Build Process**: The watch app must be built with matching app ID as the Android app

## References

- Garmin ConnectIQ SDK: https://developer.garmin.com/connect-iq/overview/
- Your watch implementation: `garmin-companion-app/source/views/StartView.mc` (lines 46-47, 66-100)
- Your backend API: `server/routes.ts` (lines 7866-8050)

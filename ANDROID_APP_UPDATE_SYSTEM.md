# Android App Update System

## Overview

The Android App Update System provides a way to notify all users about new app versions available on Google Play Store. It combines:

1. **Firebase Cloud Messaging (FCM)** - Push notifications to users with FCM tokens
2. **In-App Notifications** - Notifications shown to all users (even without FCM tokens)
3. **Google Play In-App Update API** - Integrated prompt in the app to update

---

## Architecture

### Backend Flow

```
Admin executes script
        ↓
POST /api/admin/app-update/broadcast
        ↓
Notification Service
        ├─ Creates in-app notification for ALL users
        └─ Sends Firebase push to users with FCM tokens
        ↓
Firebase Cloud Messaging
        ↓
User's Android Device
```

### Android App Flow

```
App receives Firebase push notification
        ↓
MainActivity.onMessageReceived() processes it
        ↓
Creates in-app notification (if app is in background/killed)
        ↓
LoginViewModel.checkForAppUpdates() (after login)
        ├─ Fetches /api/app/version endpoint
        └─ Passes version to AppUpdateManager
        ↓
AppUpdateChecker.checkForUpdates()
        ├─ Checks against Google Play's version
        └─ Prompts user with update dialog
        ↓
User taps "Update" → Opens Google Play Store
```

---

## Backend Setup

### 1. Environment Variable

Ensure you have `ADMIN_API_KEY` set on your server (Replit):

```bash
# In Replit Secrets
ADMIN_API_KEY=your-secret-admin-token
```

This is the same key used for Garmin watch app updates.

### 2. API Endpoint

**Endpoint**: `POST /api/admin/app-update/broadcast`

**Authentication**: `X-Admin-Key` header (must match `ADMIN_API_KEY`)

**Request Body**:
```json
{
  "version": "1.4.3",
  "title": "Critical Update",
  "releaseNote": "Please update to fix login issues",
  "dryRun": false
}
```

**Response (Success)**:
```json
{
  "success": true,
  "version": "1.4.3",
  "title": "Critical Update",
  "releaseNote": "Please update to fix login issues",
  "targeted": 150,
  "pushSent": 145,
  "pushFailed": 5,
  "inAppSent": 150,
  "message": "Broadcast sent to 150 Android users (145 push, 150 in-app)"
}
```

---

## Using the Shell Script

### Quick Start

```bash
# 1. Set your admin token
export ADMIN_TOKEN="your-secret-admin-token-from-server"

# 2. Run the script
./server/scripts/send-android-app-update.sh 1.4.3 "Critical Update" "Please update to fix login issues"
```

### Examples

**Normal broadcast:**
```bash
export ADMIN_TOKEN="secret-key"
./server/scripts/send-android-app-update.sh 1.4.3 "Update Available" "New features added"
```

**Dry run (check who would be notified):**
```bash
export ADMIN_TOKEN="secret-key"
./server/scripts/send-android-app-update.sh 1.4.3 "Update Available" "New features added" --dry-run
```

**Custom server:**
```bash
export ADMIN_TOKEN="secret-key"
./server/scripts/send-android-app-update.sh 1.4.3 "Update" "New features" --server https://custom.server.com
```

### Script Output

**Successful broadcast:**
```
📱 Android App Update Broadcast
────────────────────────────────────────────────
Server:       https://airuncoach.live
Version:      1.4.3
Title:        Critical Update
Release Note: Please update to fix login issues
Dry Run:      false
────────────────────────────────────────────────

🚀 Broadcasting update to all Android users...

✅ Broadcast successful!

{
  "success": true,
  "version": "1.4.3",
  "targeted": 150,
  "pushSent": 145,
  "pushFailed": 5,
  "inAppSent": 150,
  ...
}

📊 Summary:
  • Targeted Users: 150
  • Push Notifications Sent: 145
  • In-App Messages Sent: 150
```

**Dry run:**
```
📱 Android App Update Broadcast
────────────────────────────────────────────────
Dry Run:      true
────────────────────────────────────────────────

🔍 DRY RUN - Checking target user count...

✅ Dry run complete - here's what would be targeted:

📊 Target Summary:
  • Total Users: 150
  • With FCM Token (will receive push): 145
  • Without FCM Token (in-app only): 5
```

---

## Android App Integration

### Components Added

#### 1. **AppUpdateChecker.kt**
Location: `app/src/main/java/live/airuncoach/airuncoach/util/AppUpdateManager.kt`

Manages Google Play's In-App Update API. Features:
- `checkForUpdates()` - Check if update is available
- `startFlexibleUpdate()` - Start the update flow
- `isUpdateReadyToInstall()` - Check if update is downloaded
- `promptUserToCompleteUpdate()` - Prompt user to install

#### 2. **AppVersionResponse.kt**
Location: `app/src/main/java/live/airuncoach/airuncoach/network/model/AppVersionResponse.kt`

API response model for `/api/app/version` endpoint.

#### 3. **ApiService.kt Update**
Added endpoint:
```kotlin
@GET("/api/app/version")
suspend fun getAppVersion(): AppVersionResponse
```

#### 4. **LoginViewModel.kt Update**
After successful login:
```kotlin
checkForAppUpdates() // Checks for updates in background
```

### How It Works

1. **After Login**: `LoginViewModel` calls `checkForAppUpdates()` in the background
2. **Version Check**: App fetches `/api/app/version` from backend
3. **Google Play Check**: App uses Google Play Core library to compare versions
4. **User Prompt**: If update is available, Google Play shows an in-app dialog
5. **User Updates**: User taps "Update" → Opens Google Play Store

### Dependencies

Added to `build.gradle.kts`:
```kotlin
implementation("com.google.android.play:core:1.10.3")
```

### ProGuard Rules

Added to `app/proguard-rules.pro`:
```proguard
-keep class com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**
```

---

## Backend Notification Service

### New Function: `broadcastAndroidAppUpdate()`

```kotlin
export async function broadcastAndroidAppUpdate(
  version: string,
  title: string,
  releaseNote: string
): Promise<{ targeted: number; inAppSent: number; pushSent: number; pushFailed: number }>
```

**What it does:**
1. Fetches all users from database
2. Creates in-app notification for all users
3. Sends Firebase push to users with FCM tokens
4. Handles stale tokens and errors gracefully

**Called by**: `POST /api/admin/app-update/broadcast` endpoint

---

## Testing

### Step 1: Test the Backend Endpoint

```bash
# Set your admin token
export ADMIN_TOKEN="your-secret-token"

# Dry run first to see who would be targeted
./server/scripts/send-android-app-update.sh 1.4.3 "Test Update" "This is a test" --dry-run

# If output looks good, do the actual broadcast
./server/scripts/send-android-app-update.sh 1.4.3 "Test Update" "This is a test"
```

### Step 2: Verify Firebase Message

Check your Replit console for logs like:
```
[AndroidAppUpdate] Broadcasting v1.4.3 update to 150 users...
[AndroidAppUpdate] Done — in-app: 150, push sent: 145, push failed: 5
```

### Step 3: Test on Device

1. **Install the new APK** on your test device
2. **Log in** to trigger `checkForAppUpdates()`
3. **Check Notifications**: You should see in-app notification in notification center
4. **Check App**: Should show update prompt (since Google Play has newer version)

### Step 4: Real Google Play Testing

1. **Upload v1.4.3 to Play Store Internal Testing**
2. **Install from Internal Testing track** on your device
3. **Log in** to trigger update check
4. **Send notification**: 
   ```bash
   export ADMIN_TOKEN="secret"
   ./server/scripts/send-android-app-update.sh 1.4.4 "Update Available" "New features"
   ```
5. **Verify**: You receive notification + in-app dialog shows update available

---

## Important Notes

### Security
- Admin token is **sensitive** — treat like a password
- Never commit `ADMIN_API_KEY` to git
- Always use HTTPS for requests
- Only admins should have access to the broadcast endpoint

### Best Practices
1. **Always dry-run first** to see who would be affected
2. **Version must be higher** than current version in production
3. **Release notes should be concise** (shown in notification)
4. **Test with internal testers first** before rolling out to production
5. **Monitor crash reports** after sending update notification

### Limitations
- Doesn't force updates (Google Play decides installation)
- Flexible updates can be deferred by users
- Requires Google Play Store (doesn't work on sideloaded APKs)
- FCM tokens expire if app isn't used for 30+ days

### Troubleshooting

**"Broadcast failed" with 401 error:**
- Check your `ADMIN_TOKEN` is correct
- Verify `ADMIN_API_KEY` is set on server

**Push notifications not arriving:**
- Check if users have FCM tokens (`hasFcmToken` in response)
- Users must have the app installed
- Google Play must be functional on device

**In-app notification not showing:**
- Notifications are created in database but may not be visible in UI
- Check that UI is calling `getUnreadNotifications()` on startup

---

## Next Steps

When you're ready to announce v1.4.3:

```bash
export ADMIN_TOKEN="your-secret-token"

# 1. Dry run to confirm target count
./server/scripts/send-android-app-update.sh 1.4.3 "Critical Update" "Fixes login issues" --dry-run

# 2. If happy, send to all users
./server/scripts/send-android-app-update.sh 1.4.3 "Critical Update" "Fixes login issues"

# 3. Monitor Replit logs for delivery status
```

---

## Files Modified

- ✅ `app/build.gradle.kts` - Added Google Play Core dependency
- ✅ `app/src/main/java/live/airuncoach/airuncoach/util/AppUpdateManager.kt` - New update checker
- ✅ `app/src/main/java/live/airuncoach/airuncoach/network/model/AppVersionResponse.kt` - New response model
- ✅ `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt` - Added `/api/app/version` endpoint
- ✅ `app/src/main/java/live/airuncoach/airuncoach/viewmodel/LoginViewModel.kt` - Added `checkForAppUpdates()`
- ✅ `app/proguard-rules.pro` - Added Google Play Core rules
- ✅ `server/notification-service.ts` - Added `broadcastAndroidAppUpdate()`
- ✅ `server/routes.ts` - Added `/api/admin/app-update/broadcast` endpoint
- ✅ `server/scripts/send-android-app-update.sh` - New shell script for easy broadcasting

---

## Backend Endpoint Reference

### Broadcast Endpoint

```
POST /api/admin/app-update/broadcast
```

**Headers:**
```
X-Admin-Key: your-admin-token
Content-Type: application/json
```

**Body:**
```json
{
  "version": "1.4.3",
  "title": "Critical Update",
  "releaseNote": "Please update to fix login issues",
  "dryRun": false
}
```

**Success Response (200):**
```json
{
  "success": true,
  "version": "1.4.3",
  "title": "Critical Update",
  "releaseNote": "Please update to fix login issues",
  "targeted": 150,
  "pushSent": 145,
  "pushFailed": 5,
  "inAppSent": 150,
  "message": "Broadcast sent to 150 Android users (145 push, 150 in-app)"
}
```

**Dry Run Response (200):**
```json
{
  "dryRun": true,
  "version": "1.4.3",
  "title": "Critical Update",
  "releaseNote": "Please update to fix login issues",
  "targeted": 150,
  "withFcmToken": 145,
  "withoutFcmToken": 5
}
```

**Error Responses:**
- `400` - Missing required field
- `401` - Invalid admin token
- `503` - Admin API not configured on server
- `500` - Server error during broadcast

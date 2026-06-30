# Push Notification Testing & Debugging Guide

This guide covers **testing push notifications between Android phones** and debugging when notifications aren't being received.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Full Test Checklist](#full-test-checklist)
3. [Testing Methods](#testing-methods)
4. [Debugging Steps](#debugging-steps)
5. [Common Issues & Solutions](#common-issues--solutions)
6. [Monitoring & Logging](#monitoring--logging)

---

## Prerequisites

Before testing, ensure:

✅ **Firebase Console Setup**
- Project created in [Firebase Console](https://console.firebase.google.com/)
- Android app added with package ID: `live.airuncoach.airuncoach`
- `google-services.json` in `app/` directory
- Firebase messaging enabled
- `FIREBASE_SERVICE_ACCOUNT_JSON` env var set on backend

✅ **App Configuration**
- `app/build.gradle.kts` has `id("com.google.gms.google-services")` uncommented
- Root `build.gradle.kts` has `id("com.google.gms.google-services") version "4.4.2" apply false` uncommented
- App is built and deployed to test devices

✅ **Device Requirements**
- Android 6.0+ (push notifications)
- Android 13+ (POST_NOTIFICATIONS permission required)
- Google Play Services installed
- Internet connectivity

---

## Full Test Checklist

### Phase 1: Local Debugging (Single Device)

- [ ] **Build & Install Debug APK**
  ```bash
  ./gradlew assembleDebug
  # Or deploy from Android Studio
  ```

- [ ] **Grant Notification Permission**
  - On Android 13+: Settings → Permissions → Notifications → Enable
  - Check `NotificationPermissionHelper.kt` handles this properly

- [ ] **Verify FCM Token Registration**
  - Open Android Studio Logcat filter: `AiRunCoachFCM`
  - Should see: `New FCM token — uploading to server`
  - Backend will log: `FCM token saved ✅`

- [ ] **Check Backend Registration**
  - SSH to your backend (Replit/cloud)
  - Query database: `SELECT id, fcmToken FROM users WHERE id = '{userId}'`
  - Token should be populated (not NULL)

### Phase 2: Backend to Device Testing (Push from Server)

- [ ] **Send Test Push from Console**
  - Firebase Console → Cloud Messaging → Send your first message
  - Target: Android app (live.airuncoach.airuncoach)
  - Title: "Test Notification"
  - Logcat should show: `FCM message received: {data}`
  - Notification should appear in system tray

- [ ] **Send Test Push from Backend API**
  - Use your backend's notification endpoint (test/debug)
  - Check backend logs for `[Firebase Push] ✅ Sent to user`
  - Verify notification arrives on device

- [ ] **Send Real Notification Flow**
  - Trigger a real event (e.g., Garmin activity import, friend request)
  - Backend logs should show notification sent
  - Device should receive and display notification

### Phase 3: Multi-Device Testing

- [ ] **Test Between Two Phones (A & B)**
  - Both logged in with separate accounts
  - Phone A sends event (e.g., friend request to Phone B's user)
  - Backend creates notification
  - Phone B receives push
  - Tap notification → app opens with correct deep link

- [ ] **Test While App is Backgrounded**
  - Phone A sends notification while Phone B's app is closed
  - Push should still arrive and display
  - Tapping it should launch app and navigate correctly

- [ ] **Test with App Killed**
  - Kill Phone B's app completely (not just backgrounded)
  - Phone A sends notification
  - Push should arrive (Firebase caches it)
  - Tapping notification should launch app

---

## Testing Methods

### 1. Firebase Console (Simplest)

**For quick testing without backend code:**

```
Firebase Console
  → Cloud Messaging
  → Send your first message
  → Title: "Test"
  → Body: "Does this work?"
  → Target: Android app → live.airuncoach.airuncoach
  → Send
```

✅ **Pros**: Simple, no code needed
❌ **Cons**: No data fields, no deep linking, no advanced features

---

### 2. Backend API Endpoint (Recommended for Testing)

**Create a test endpoint to send notifications:**

```typescript
// Add to server/routes.ts (under admin/test routes)
router.post("/test/send-notification", async (req, res) => {
  const { userId, title, body } = req.body;

  if (!userId || !title) {
    return res.status(400).json({ error: "userId and title required" });
  }

  try {
    const { sendFirebasePush } = await import('./notification-service');
    const success = await sendFirebasePush(
      userId,
      title,
      body || "Test notification",
      { type: "test", timestamp: new Date().toISOString() }
    );

    res.json({
      success,
      message: success ? "Notification sent" : "Failed to send",
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
```

**Test with curl:**

```bash
curl -X POST http://localhost:5000/test/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-id-here",
    "title": "Test Notification",
    "body": "This is a test from the API"
  }'
```

✅ **Pros**: Full control, test data fields, test deep linking
❌ **Cons**: Need backend code, harder to debug if endpoint not set up

---

### 3. Programmatic Test (Advanced)

**Send notification directly from Node.js:**

```javascript
// scripts/test-notification.js
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function sendTestNotification(userId, fcmToken) {
  const message = {
    token: fcmToken,
    notification: {
      title: "📱 Test Notification",
      body: "If you see this, FCM is working!",
    },
    data: {
      type: "test",
      timestamp: new Date().toISOString(),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "general",
        sound: "default",
      },
    },
  };

  try {
    const messageId = await admin.messaging().send(message);
    console.log("✅ Sent to", userId, "messageId:", messageId);
  } catch (error) {
    console.error("❌ Error sending to", userId, error);
  }
}

// Usage:
sendTestNotification(
  "user-id-from-db",
  "fcmToken-from-db"
);
```

**Run:**

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"...json..."}' node scripts/test-notification.js
```

---

### 4. Simulated Activity Events (Production Test)

**Test the actual notification flow:**

1. **Import a Garmin activity** (or create test activity in DB)
   - Backend processes activity
   - Matches to run
   - Sends `run_enriched` notification
   - Phone receives it

2. **Send a friend request**
   - User A initiates friend request to User B
   - Backend sends `friend_request` notification
   - User B receives it

3. **Trigger coaching session reminder**
   - User has coaching plan with scheduled workout
   - Scheduler triggers at 8am
   - Notification sent
   - User receives it

---

## Debugging Steps

### Step 1: Verify FCM Token is Registered

**On Device (Logcat):**
```
Filter: "AiRunCoachFCM"
Look for: "New FCM token — uploading to server"
          "FCM token saved ✅"
```

**In Backend Logs:**
```
Filter: "FCM token"
Look for: "FCM token saved ✅"
          Or error messages indicating why it failed
```

**In Database:**
```sql
SELECT id, email, fcmToken FROM users WHERE id = 'user-id';
```
- If `fcmToken` is NULL → **Token not registered**
- If `fcmToken` has value → **Token registered ✅**

---

### Step 2: Check Backend Notification Sending

**Backend Logs:**
```
Filter: "Firebase Push"
Look for: "[Firebase Push] Sending to user {userId}..."
          "[Firebase Push] ✅ Sent to user {userId}"
          Or error messages
```

**Common Backend Errors:**
- `[Firebase Push] Firebase not initialized` → `FIREBASE_SERVICE_ACCOUNT_JSON` not set
- `[Firebase Push] No FCM token for user` → Token is NULL in DB
- `[Firebase Push] Error sending: messaging/registration-token-not-registered` → Token is stale

---

### Step 3: Check Device Notification Permissions

**On Device:**
1. Settings → Apps → AI Run Coach
2. Permissions → Notifications → **Enabled**
3. For Android 13+: `NotificationPermissionHelper.kt` should request POST_NOTIFICATIONS

**In Code:**
```kotlin
// In MainActivity or initial screen:
if (NotificationPermissionHelper.shouldRequestPermission()) {
  // Request permission
  requestPermissions(
    arrayOf(NotificationPermissionHelper.getPermissionString()),
    REQUEST_NOTIFICATION_PERMISSION
  )
}
```

---

### Step 4: Check Logcat for FCM Messages

**Full Logcat Filter:**
```
Filter: "AiRunCoachFCM|Firebase Push|messaging"
```

**Expected Sequence:**
```
[Device] AiRunCoachFCM: New FCM token — uploading to server
[Backend] FCM token saved ✅
[Backend] Firebase Push: Sending to user {userId}...
[Backend] Firebase Push: ✅ Sent to user {userId}
[Device] AiRunCoachFCM: FCM message received: {type=run_enriched, ...}
[Device] Notification displayed in system tray
```

If sequence breaks anywhere → That's where the issue is.

---

### Step 5: Check Network Connectivity

**On Device:**
```
adb shell: ping 8.8.8.8
adb shell: dumpsys connectivity
```

**On Backend:**
```
ping fcm.googleapis.com
curl https://fcm.googleapis.com/v1/projects/your-project/messages:send
```

---

### Step 6: Check Notification Channels (Android 8+)

**On Device Settings:**
```
Settings → Apps → AI Run Coach → Notifications
Look for channels: "Garmin Sync", "Garmin Watch Updates", "AI Run Coach"
```

**In Code** (`AiRunCoachMessagingService.kt`):
```kotlin
private fun ensureNotificationChannel(channelId: String) {
  val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  if (nm.getNotificationChannel(channelId) != null) return
  // Creates channel with importance = IMPORTANCE_HIGH
}
```

If a channel doesn't exist → notification may be silently dropped.

---

## Common Issues & Solutions

### ❌ Issue: "No notifications arriving"

**Checklist:**
1. [ ] Device has internet connection?
2. [ ] App has POST_NOTIFICATIONS permission (Android 13+)?
3. [ ] FCM token registered in DB?
4. [ ] Backend logs show `[Firebase Push] ✅ Sent`?
5. [ ] `google-services.json` in `app/` directory?
6. [ ] Firebase messaging enabled in console?

**Solution Steps:**
```
1. Check Logcat: "AiRunCoachFCM" filter
   → Should see "New FCM token"
   → If not → App didn't initialize Firebase

2. Check backend: SELECT fcmToken FROM users WHERE id = ?
   → If NULL → Token not uploaded to server

3. Check backend logs: "Firebase Push" filter
   → If "Firebase not initialized" → FIREBASE_SERVICE_ACCOUNT_JSON missing
   → If "No FCM token" → Token not in DB
   → If error code → See "Firebase Error Codes" below

4. Manually trigger: Curl the test endpoint
   → See if backend can send to the token
```

---

### ❌ Issue: "Firebase not initialized"

**Error in logs:**
```
[Firebase Push] Firebase not initialized — cannot send to user...
```

**Causes:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` env var not set on backend
- JSON is malformed
- Service account key is invalid/expired

**Solution:**
1. Get valid service account JSON from Firebase Console:
   - Project Settings → Service Accounts → Generate New Private Key
2. Set env var on backend:
   ```bash
   export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
   # Or in .env file (Replit/Cloud)
   ```
3. Restart backend
4. Check logs: `[Firebase] Admin SDK initialised ✅`

---

### ❌ Issue: "messaging/registration-token-not-registered"

**Error in logs:**
```
[Firebase Push] Stale FCM token for user {userId} — clearing
```

**Causes:**
- Device uninstalled and reinstalled app (new token generated)
- User switched to different device
- Token hasn't been used in 60 days
- Google Play Services not properly installed

**Solution:**
1. Reinstall app on device
2. App will generate new FCM token
3. Token is uploaded to server on next launch
4. Wait 1-2 minutes for token to sync
5. Try sending again

---

### ❌ Issue: "Notification appears but doesn't respond to tap"

**Problem:** Notification shows but tapping it doesn't open app or navigates to wrong screen.

**Causes:**
- `PendingIntent` not created correctly
- Deep link extras not passed
- MainActivity not handling intent extras

**Solution:**
1. Check `AiRunCoachMessagingService.kt` lines 114-178:
   ```kotlin
   val pendingIntent = when {
     type == "garmin_watch_update" -> { ... }
     type == "live_run_invite" -> { ... }
     type == "friend_request" -> { ... }
     else -> { ... }
   }
   ```

2. Verify intent extras are set:
   ```kotlin
   mainIntent.putExtra("deeplink_run_id", runId)
   mainIntent.putExtra("deeplink_friends", true)
   ```

3. Check `MainActivity.kt` handles these extras in `onCreate()`:
   ```kotlin
   override fun onCreate(...) {
     val runId = intent.getStringExtra("deeplink_run_id")
     val friends = intent.getBooleanExtra("deeplink_friends", false)
     // Navigate accordingly
   }
   ```

---

### ❌ Issue: "Notification received but doesn't display visually"

**Logcat shows message received but no notification appears:**

**Causes:**
- Notification channel not created
- Importance level too low
- Notification settings disabled in system settings
- Duplicate notification ID (showing same notification)

**Solution:**
1. Check Android 8+ notification channels:
   ```kotlin
   val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
   val channel = nm.getNotificationChannel("garmin_sync")
   // Should not be null
   ```

2. Set importance high:
   ```kotlin
   NotificationChannel(
     "garmin_sync",
     "Garmin Sync",
     NotificationManager.IMPORTANCE_HIGH  // Not LOW
   )
   ```

3. Check device settings:
   - Settings → Apps → AI Run Coach → Notifications
   - Channels should be enabled

4. Use unique notification IDs:
   ```kotlin
   // In showNotification():
   nm.notify(System.currentTimeMillis().toInt(), notification)
   // NOT: nm.notify(0, notification) — that overwrites!
   ```

---

### ❌ Issue: "Notification shows but sound/vibration not working"

**Causes:**
- Notification priority not set to HIGH
- Android priority not set in FCM message
- Device has notifications muted

**Solution:**
1. Check `AiRunCoachMessagingService.kt` line 186:
   ```kotlin
   .setPriority(NotificationCompat.PRIORITY_HIGH)
   ```

2. Check `notification-service.ts` line 176-177:
   ```typescript
   android: {
     priority: "high",  // Must be "high"
   }
   ```

3. Device settings:
   - Mute switch should be OFF (if physical)
   - Settings → Sound → Notifications volume not muted

---

## Monitoring & Logging

### Backend Logging

**Key Log Statements to Monitor:**

```typescript
// notification-service.ts

// Token registration:
console.log(`[Notification] In-app notification created for user ${userId}`);
console.log(`[Firebase Push] Sending to user ${userId} with token: ...`);
console.log(`[Firebase Push] ✅ Sent to user ${userId}`);

// Token errors:
console.warn(`[Firebase Push] No FCM token for user ${userId}`);
console.warn(`[Firebase Push] Stale FCM token for user ${userId} — clearing`);
```

**Filter for Problems:**
```bash
# On backend logs
grep -i "firebase push.*error" logs/*.log
grep -i "no fcm token" logs/*.log
grep -i "stale token" logs/*.log
```

---

### Device Logcat Logging

**Essential Filters:**

```bash
# All FCM-related logs
adb logcat | grep "AiRunCoachFCM"

# Firebase library logs
adb logcat | grep -i "firebase"

# Notification display logs
adb logcat | grep -i "notification"

# Combined filter (all)
adb logcat | grep -E "AiRunCoachFCM|Firebase Push|messaging"
```

**Save to file for analysis:**
```bash
adb logcat > notification_debug_$(date +%s).log &
# ... trigger event ...
# Ctrl+C to stop
```

---

### Database Monitoring

**Check FCM token registration:**
```sql
-- Monitor tokens over time
SELECT id, email, fcmToken, created_at, updated_at
FROM users
WHERE fcmToken IS NOT NULL
ORDER BY updated_at DESC
LIMIT 10;

-- Find users without tokens
SELECT id, email
FROM users
WHERE fcmToken IS NULL
ORDER BY created_at DESC
LIMIT 10;

-- Count by registration status
SELECT 
  COUNT(*) as total,
  COUNT(fcmToken) as with_token,
  COUNT(*) - COUNT(fcmToken) as without_token
FROM users;
```

---

### Creating a Test Log Summary

**For each test, capture:**

```markdown
## Test: [Description]
**Date:** 2026-06-30
**Devices:** Phone A (Samsung S21, Android 13), Phone B (Pixel 6, Android 14)

### Setup
- [ ] Both apps installed and logged in
- [ ] POST_NOTIFICATIONS permission granted
- [ ] FCM tokens registered (check DB)

### Test Steps
1. User A triggers event (e.g., sends friend request to User B)
2. Backend processes event
3. Backend sends notification to User B

### Results
- Backend logs: [paste relevant logs]
- Device Logcat: [paste relevant logs]
- Notification received? YES / NO
- Deep link worked? YES / NO / N/A

### Issues Found
- Issue 1: ...
- Issue 2: ...

### Resolution
- ...
```

---

## Quick Troubleshooting Flowchart

```
Notification not received?
├─ Is FCM token in DB?
│  ├─ NO → Token registration failed
│  │   └─ Check: "New FCM token" in Logcat
│  │   └─ Check: google-services.json exists
│  │   └─ Reinstall app
│  │
│  └─ YES → Token registered ✅
│      └─ Does backend log "✅ Sent"?
│         ├─ NO → Backend sending failed
│         │   └─ Check: Firebase initialized? (FIREBASE_SERVICE_ACCOUNT_JSON set)
│         │   └─ Check: User has token? (SELECT fcmToken FROM users WHERE id=?)
│         │
│         └─ YES ��� Backend sent ✅
│             └─ Does device Logcat show "FCM message received"?
│                ├─ NO → Device didn't receive (network/FCM issue)
│                │   └─ Check: Device internet connection
│                │   └─ Check: Google Play Services installed
│                │
│                └─ YES → Device received ✅
│                    └─ Does notification display visually?
│                       ├─ NO → Notification channel or permissions issue
│                       │   └─ Check: POST_NOTIFICATIONS permission granted
│                       │   └─ Check: Notification channel exists (IMPORTANCE_HIGH)
│                       │
│                       └─ YES → Notification displays ✅
│                           └─ Does tap work correctly?
│                              ├─ NO → PendingIntent misconfigured
│                              │   └─ Check: Intent extras in onMessageReceived()
│                              │   └─ Check: MainActivity handles intent extras
│                              │
│                              └─ YES → All working ✅
```

---

## Pre-Launch Checklist

Before going live on Play Store:

- [ ] **Testing completed** on minimum 2 different devices
- [ ] **Permission handling** works (POST_NOTIFICATIONS on Android 13+)
- [ ] **FCM token registration** verified in logs
- [ ] **Backend notification sending** verified in logs
- [ ] **Deep linking** tested (notification tap navigates correctly)
- [ ] **Different notification types** tested (garmin_sync, friend_request, etc.)
- [ ] **Foreground/background/killed states** tested
- [ ] **Notification channels** appear in app settings
- [ ] **Sound/vibration** working
- [ ] **Stale token handling** works (reinstalled app → new token → still receives)
- [ ] **Error cases handled gracefully** (no crashes if FCM unavailable)

---

## Support Resources

- **Firebase Documentation**: https://firebase.google.com/docs/cloud-messaging/android/client
- **Android Notifications**: https://developer.android.com/develop/ui/views/notifications
- **FCM Troubleshooting**: https://firebase.google.com/docs/cloud-messaging/ios/certs
- **Your Backend**: `server/notification-service.ts`
- **Your App**: `app/src/main/java/live/airuncoach/airuncoach/service/AiRunCoachMessagingService.kt`


# Push Notifications Setup & Troubleshooting Guide

## System Overview

Your AI Run Coach app has **complete push notification infrastructure** in place:

- ✅ **Android client**: `AiRunCoachMessagingService` receives & displays notifications
- ✅ **Server notification service**: `notification-service.ts` handles Firebase Cloud Messaging (FCM)
- ✅ **Database**: `users.fcmToken` stores device tokens
- ✅ **Integration**: Notifications triggered when:
  - New Garmin activity is synced → `new_activity`
  - Existing run is enriched with Garmin data → `run_enriched`
  - Coaching plan reminder scheduled → `coaching_plan_reminder`

---

## Configuration Checklist

### 1. **Firebase Service Account (Replit - CRITICAL)**

✅ You've already set `FIREBASE_SERVICE_ACCOUNT_JSON` on Replit. This is the most critical step!

**To verify it's working:**
```bash
# On Replit, check the environment variable is set (don't print it for security)
echo "Firebase env var is set: $([[ -z "$FIREBASE_SERVICE_ACCOUNT_JSON" ]] && echo 'NO' || echo 'YES')"
```

### 2. **Android google-services.json**

✅ Located at: `app/google-services.json`

Contains:
- Project ID: `ai-run-coach-c1b8c`
- Android package: `live.airuncoach.airuncoach`
- Messaging sender ID: `1072067743986`

### 3. **build.gradle Configuration**

✅ Already configured in `app/build.gradle.kts`:
```kotlin
implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
implementation("com.google.firebase:firebase-messaging-ktx")
```

✅ Root `build.gradle.kts` has:
```kotlin
id("com.google.gms.google-services") version "4.4.2" apply false
```

✅ App `build.gradle.kts` has:
```kotlin
id("com.google.gms.google-services")
```

### 4. **AndroidManifest.xml**

✅ All required:
```xml
<!-- Permission for Android 13+ notifications -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Firebase Cloud Messaging service -->
<service android:name=".service.AiRunCoachMessagingService" android:exported="false">
  <intent-filter>
    <action android:name="com.google.firebase.MESSAGING_EVENT" />
  </intent-filter>
</service>

<!-- Default notification channel -->
<meta-data
  android:name="com.google.firebase.messaging.default_notification_channel_id"
  android:value="garmin_sync" />
```

---

## Testing Your Setup

### **Quick Test: Send a Test Push Notification**

Use the new test endpoint I added:

```bash
# 1. First, make sure you're logged in on your Android device
# 2. Then run this curl command:

curl -X POST https://your-replit-url.replit.dev/api/test/push-notification \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "your-email@example.com",
    "title": "Test Notification",
    "body": "If you see this, push notifications are working! 🎉"
  }'
```

**Success response** (device will receive notification):
```json
{
  "success": true,
  "message": "Test push notification sent to user@example.com",
  "userEmail": "user@example.com",
  "hasToken": true,
  "tokenPreview": "cJ7Bv_pQi4k2..."
}
```

**Failure responses & solutions:**

| Response | Cause | Solution |
|----------|-------|----------|
| `"User not found"` | Email doesn't match | Check exact email in database |
| `"No FCM token"` | User never logged in or notification permission denied | User needs to: 1) Login again, 2) Grant `POST_NOTIFICATIONS` permission |
| `"Failed to send" + error` | Firebase not initialized on server | Check `FIREBASE_SERVICE_ACCOUNT_JSON` is set on Replit (redeploy if just added) |

---

## Debugging Checklist

### **Step 1: Android Client - Verify FCM Token Upload**

After logging in, check Android logcat:

```bash
adb logcat | grep -i "fcm\|AiRunCoachFCM"
```

Look for:
```
✅ D/AiRunCoachFCM: New FCM token — uploading to server
✅ D/AiRunCoachFCM: FCM token saved ✅
```

❌ If you see:
```
W/AiRunCoachFCM: FCM token save failed: ...
```

Check:
1. Device has internet connection
2. Server is running (test with: `curl https://your-server.com/health`)
3. User is authenticated (token in SharedPreferences)

### **Step 2: Database - Verify Token is Stored**

```bash
# Run on your database (psql or similar)
SELECT id, email, 
       CASE WHEN fcmToken IS NOT NULL THEN 'YES ✅' ELSE 'NO ❌' END as has_fcm_token,
       SUBSTRING(fcmToken, 1, 30) as token_preview
FROM users
WHERE email = 'your-email@example.com'
LIMIT 1;
```

Expected output:
```
id          | email                   | has_fcm_token | token_preview
-----------|-------------------------|---------------|----------------------------
abc123...  | user@example.com        | YES ✅        | cJ7Bv_pQi4k2fX9lM3nQ...
```

### **Step 3: Server - Verify Firebase Initialization**

Check server logs when it starts:

```
✅ [Firebase] Initializing with project: ai-run-coach-c1b8c
✅ [Firebase] Admin SDK initialised ✅
```

If you see:
```
⚠️ [Firebase] FIREBASE_SERVICE_ACCOUNT_JSON env var not set — push notifications disabled
```

**Fix:** 
1. Go to Replit Secrets
2. Add `FIREBASE_SERVICE_ACCOUNT_JSON` with the full service account JSON
3. Click "Rerun" to restart the server

### **Step 4: Server - Verify Notification Sending**

When a Garmin activity is synced, check logs for:

```
✅ [Notification] In-app notification created for user abc123: "🏃 Activity Recorded!"
✅ [Firebase Push] Sending to user abc123 with token: cJ7Bv_pQi4k2...
✅ [Firebase Push] ✅ Sent to user abc123 (messageId: 0:123456...): "🏃 Activity Recorded!"
```

If you see:
```
⚠️ [Firebase Push] No FCM token for user abc123 — skipping push
```

→ User hasn't logged in or token wasn't saved (see Step 2)

If you see:
```
❌ [Firebase Push] Error sending to user abc123: messaging/registration-token-not-registered
```

→ Token is stale (app will auto-clear it; user needs to re-login)

---

## Notification Flow Diagram

```
Garmin Watch Activity
         ↓
  [Garmin API Webhook]
         ↓
  [Server: /api/garmin/webhook]
         ↓
  [Activity Merge Service]
  - Match with existing run? → type='run_enriched'
  - Create new run? → type='new_activity'
         ↓
  [sendActivityNotification(userId, activity, type)]
         ↓
  ┌─────────────────────────────────────┐
  │ 1. In-App Notification               │
  │    (always created)                  │
  │    └→ storage.createNotification()   │
  │       └→ Users see in-app UI         │
  └─────────────────────────────────────┘
         ↓
  ┌─────────────────────────────────────┐
  │ 2. Firebase Push Notification        │
  │    (if token exists)                 │
  │    └→ Fetch user.fcmToken            │
  │    └→ admin.messaging().send()       │
  │       └→ Android device receives     │
  │          notification (if app open)  │
  └─────────────────────────────────────┘
         ↓
  [AiRunCoachMessagingService.onMessageReceived()]
         ↓
  [showNotification(title, body, type, runId)]
         ↓
  💬 User sees notification on device
```

---

## Common Issues & Solutions

### **Issue: Notifications don't appear on device**

**Diagnosis checklist:**
1. Is FCM token saved? → Check database (Step 2 above)
2. Is Firebase initialized? → Check server logs (Step 3 above)
3. Is notification permission granted?
   - Android 13+: Check Settings → Apps → AI Run Coach → Notifications (ON)
   - Android <13: Should work by default
4. Is the device in Do Not Disturb mode?

**Test with**:
```bash
curl -X POST https://your-server/api/test/push-notification \
  -H "Content-Type: application/json" \
  -d '{"userEmail":"user@example.com","title":"Test","body":"Test"}'
```

---

### **Issue: "No FCM token for user" error**

The user hasn't logged in with notification permissions granted.

**Fix:**
1. Have user re-login to the app
2. When prompted, grant `POST_NOTIFICATIONS` permission
3. Wait ~2 seconds for token to upload
4. Check logcat: `adb logcat | grep FCM`
5. Verify in database (Step 2 above)

---

### **Issue: Firebase initialization fails on startup**

Server logs show:
```
❌ [Firebase] Failed to initialise Admin SDK: ...
```

**Causes:**
1. `FIREBASE_SERVICE_ACCOUNT_JSON` is malformed JSON
2. JSON is missing required fields (project_id, private_key, etc.)
3. Quotes or escaping issues in environment variable

**Fix:**
1. Download fresh service account JSON from [Firebase Console](https://console.firebase.google.com/) → Project Settings → Service Accounts
2. Use online JSON validator to check syntax: `https://jsonlint.com`
3. On Replit: Remove old secret, paste new JSON
4. Click "Rerun" server

---

## Production Checklist

Before deploying to production:

- [ ] Firebase service account is set on your server (Replit)
- [ ] Test push notification works: `POST /api/test/push-notification`
- [ ] Create a test Garmin activity and verify:
  - Device receives "🏃 Activity Recorded!" notification
  - In-app notification appears in notification center
- [ ] Database has FCM tokens for active users
- [ ] Server logs show `[Firebase] Admin SDK initialised ✅` at startup
- [ ] Notification channels are created on device:
  - Settings → Apps → AI Run Coach → Notifications:
    - "Garmin Sync" (HIGH priority)
    - "AI Run Coach" (DEFAULT priority)

---

## Revert Changes

If you want to temporarily disable push notifications while debugging:

In `notification-service.ts`, change:
```typescript
export async function sendFirebasePush(...): Promise<boolean> {
  const app = getFirebaseApp();
  if (!app) return false;  // ← Currently skips if no Firebase
```

All notification functions gracefully degrade:
- In-app notifications still appear ✅
- Push notifications are skipped (just logged) ✅
- App continues working normally ✅

---

## Support

If push notifications still aren't working:

1. **Run the test endpoint** and share the response
2. **Share recent server logs** (especially lines with `[Firebase]` or `[Notification]`)
3. **Share Android logcat** (`adb logcat | grep -i fcm`)
4. **Confirm**: 
   - Replit env var is set
   - Google-services.json exists in `app/`
   - User has logged in recently

---

## Resources

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Admin SDK Initialization](https://firebase.google.com/docs/admin/setup)
- [Android Notification Channels (Android 8+)](https://developer.android.com/develop/ui/views/notifications/channels)
- [POST_NOTIFICATIONS Permission (Android 13+)](https://developer.android.com/about/versions/13/changes/notification-permission)

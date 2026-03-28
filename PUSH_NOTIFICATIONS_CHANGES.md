# Push Notifications - Changes & Improvements

## Summary

Enhanced push notification debugging and testing infrastructure. Your system has all the required components in place, but I've added better logging and a test endpoint to help diagnose issues.

## Changes Made

### 1. **Enhanced Server Logging** (`server/notification-service.ts`)

#### Firebase Initialization
- Added project ID logging when Firebase initializes
- Better error messages if `FIREBASE_SERVICE_ACCOUNT_JSON` is missing

**Before:**
```
[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON env var not set
```

**After:**
```
[Firebase] Initializing with project: ai-run-coach-c1b8c
[Firebase] Admin SDK initialised ✅
```

#### Push Send Logging
- Log Firebase error codes and stack traces (first 3 lines)
- Show token preview (first 20 chars) when sending
- Return message ID when successful
- Better detection of which step failed (Firebase init, user lookup, token lookup, or send)

**Example improved logs:**
```
[Firebase Push] Sending to user abc123 with token: cJ7Bv_pQi4k2...
[Firebase Push] ✅ Sent to user abc123 (messageId: 0:123456...): "🏃 Activity Recorded!"
```

### 2. **New Test Endpoint** (`server/routes.ts`)

Added `POST /api/test/push-notification` to manually test push notifications without waiting for a Garmin activity.

**Usage:**
```bash
curl -X POST https://your-server.com/api/test/push-notification \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "user@example.com",
    "title": "Test Notification",
    "body": "If you see this, push notifications are working!"
  }'
```

**Response examples:**
```json
{
  "success": true,
  "message": "Test push notification sent to user@example.com",
  "userEmail": "user@example.com",
  "hasToken": true,
  "tokenPreview": "cJ7Bv_pQi4k2..."
}
```

Or if there's an issue:
```json
{
  "error": "User user@example.com has no FCM token registered",
  "hint": "User needs to login with notification permissions granted"
}
```

### 3. **Test Script** (`test-push-notifications.sh`)

Created a bash script for easy testing from command line:

**Usage:**
```bash
./test-push-notifications.sh https://airuncoach.replit.dev user@example.com
./test-push-notifications.sh http://localhost:3000 user@example.com "Custom Title" "Custom Body"
```

**Features:**
- Checks server connectivity first
- Sends test notification
- Parses response and provides helpful error messages
- Guides users through debugging steps

**Example output:**
```
=== AI Run Coach Push Notifications Test ===

Server URL: https://airuncoach.replit.dev
User Email: user@example.com
Title: Test Notification

Step 1: Checking server connectivity...
✅ Server is responding

Step 2: Sending test push notification...
{
  "success": true,
  "message": "Test push notification sent to user@example.com",
  "hasToken": true,
  "tokenPreview": "cJ7Bv_pQi4k2..."
}

✅ Push notification sent successfully!

Next steps:
  1. Check your Android device for the notification
  2. If notification doesn't appear within 10 seconds:
     - Check device is unlocked
     - Check Settings → Apps → AI Run Coach → Notifications is ON
```

### 4. **Comprehensive Documentation** (`PUSH_NOTIFICATIONS_SETUP.md`)

Created detailed guide covering:
- System overview
- Configuration checklist
- Testing procedures
- Debugging checklist (4-step process)
- Notification flow diagram
- Common issues & solutions
- Production checklist
- Resources & links

## How to Use

### **Quick Test (Recommended)**

1. Make sure Replit has `FIREBASE_SERVICE_ACCOUNT_JSON` set (you said it is ✅)
2. Ensure your app is running
3. On your Android device, open the app and log in
4. Grant notification permission when prompted
5. Run the test:

```bash
./test-push-notifications.sh https://your-replit-url.replit.dev your-email@example.com
```

6. Check your Android device for the test notification

### **If Still Not Working**

Follow the 4-step debugging checklist in `PUSH_NOTIFICATIONS_SETUP.md`:

1. **Android Client**: Check logcat for FCM token upload
   ```bash
   adb logcat | grep -i "fcm\|AiRunCoachFCM"
   ```

2. **Database**: Verify token is stored
   ```sql
   SELECT id, email, fcmToken FROM users WHERE email = 'your-email@example.com' LIMIT 1;
   ```

3. **Server**: Verify Firebase initialization
   ```
   Check logs for: "[Firebase] Admin SDK initialised ✅"
   ```

4. **Notification Sending**: Check logs when activity syncs
   ```
   Check logs for: "[Firebase Push] ✅ Sent to user..."
   ```

## What Was Already Working ✅

Your system already has everything needed:
- ✅ Android client (AiRunCoachMessagingService) properly configured
- ✅ FCM dependencies in build.gradle
- ✅ google-services.json file present
- ✅ AndroidManifest.xml has all required permissions & services
- ✅ Server notification functions (sendActivityNotification, sendFirebasePush)
- ✅ Database schema with fcmToken column
- ✅ Notification permission request flow in LoginScreen
- ✅ Firebase service account env var set on Replit

## What I Improved 🚀

- **Better logging**: Now you can see exactly what's happening at each step
- **Test endpoint**: No need to wait for Garmin activity to test
- **Test script**: One-liner to verify everything works
- **Documentation**: Step-by-step troubleshooting guide

## No Breaking Changes

All changes are **additive** and **non-breaking**:
- Enhanced logging doesn't change behavior
- New endpoint is optional testing only
- Existing notification flow unchanged
- Script is standalone utility

## Next Steps

1. Run the test script
2. Check if notification appears on device
3. If it works → You're all set! 🎉
4. If it doesn't → Follow the 4-step debugging guide
5. Let me know which step fails and I can help debug

---

**Files Changed:**
- `server/notification-service.ts` - Enhanced logging
- `server/routes.ts` - Added test endpoint
- `test-push-notifications.sh` - New test script
- `PUSH_NOTIFICATIONS_SETUP.md` - New documentation
- `PUSH_NOTIFICATIONS_CHANGES.md` - This file

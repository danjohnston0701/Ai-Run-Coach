# Push Notifications — Diagnostic Guide

## Quick Overview

Your system has **3 layers** of notifications:

### 1. ✅ **Android App** (Fully Configured)
- `AiRunCoachMessagingService` is set up to **receive** FCM messages
- Notification channels are created
- `google-services.json` is in place
- Firebase dependencies are installed

### 2. ✅ **Server Infrastructure** (Fully Configured)
- `notification-service.ts` has functions to send push notifications
- Garmin enrichment endpoint calls `sendActivityNotification()`
- Creates both in-app + push notifications
- Handles Firebase Admin SDK initialization

### 3. ❓ **Firebase Configuration** (Need to Verify)
- Requires `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable
- This is the service account private key from Firebase Console

---

## Why You Might Not Be Getting Push Notifications

The system sends notifications in this flow:

```
Garmin Activity Received
    ↓
Server checks: Does activity match a run?
    ↓
If YES: enrich run with Garmin data
    ↓
Call sendActivityNotification(userId)
    ↓
Check: Is FIREBASE_SERVICE_ACCOUNT_JSON env var set?
    ├─ NO → Log warning, skip push (in-app still created)
    └─ YES → Fetch user's fcmToken from database
        ├─ NO token → Log "No FCM token", skip push
        └─ YES → Send push notification ✅
```

---

## What to Check

### ✅ Check 1: Is Firebase Service Account JSON Set?

**On your server (Replit/production):**
```bash
echo $FIREBASE_SERVICE_ACCOUNT_JSON
```

If empty, you need to:
1. Go to Firebase Console → Your Project → Project Settings
2. Go to "Service Accounts" tab
3. Click "Generate New Private Key"
4. Copy the entire JSON
5. Set it as an environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`

### ✅ Check 2: Does Your User Have an FCM Token?

Run this SQL query on Neon:
```sql
SELECT id, email, fcm_token FROM users WHERE id = 'YOUR_USER_ID';
```

If `fcm_token` is **NULL**, the token wasn't uploaded from your Android app. This happens when:
- User hasn't opened the app yet (token generated on first launch)
- Permission to send notifications was denied
- App crashed before uploading token

### ✅ Check 3: Check Server Logs

Look for these log messages when you sync a Garmin activity:

**Good signs:**
```
[Firebase] Admin SDK initialised ✅
[Firebase Push] Sent to user <userId>: "✨ Run Enriched with Garmin Data"
[Garmin Webhook] Notification sent: run_enriched (inApp: true, push: true)
```

**Problems:**
```
[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON env var not set — push notifications disabled
[Firebase Push] No FCM token for user <userId> — skipping push
[Firebase Push] Stale FCM token for user <userId> — clearing
```

---

## Step-by-Step Fix

### Step 1: Verify Android App Is Requesting Permission

The MainScreen asks for notification permission on launch. Check that you **granted** it when prompted.

If you denied it, go to:
- **Android Settings** → **Apps** → **AI Run Coach** → **Notifications** → **Allow notifications**

### Step 2: Verify Token Is Uploaded

After granting permission and launching the app, your token should be uploaded automatically. Check server logs for:
```
[AiRunCoachFCM] New FCM token — uploading to server
[AiRunCoachFCM] FCM token saved ✅
```

### Step 3: Set Firebase Service Account

Get the Firebase service account JSON from Firebase Console and set it as env var on your server.

### Step 4: Test Syncing Again

Try syncing your Garmin activity again. Check server logs for the notification being sent.

---

## In-App Notifications (Fallback)

**Important:** Even if push notifications aren't working, **in-app notifications are always created and stored in the database**. You'll see them in the app's notification center (when we add that UI).

The push notification is a bonus — it wakes up your phone with an alert. But the data is still there.

---

## Manual Test (Without Garmin)

Once Firebase is configured, you can test push notifications directly via the API:

```bash
curl -X POST http://localhost:3000/api/test/send-notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "body": "Does this show up?"}'
```

(You'd need to create this endpoint, but it's a useful debugging tool.)

---

## Quick Checklist

- [ ] Did you grant notification permission when the app asked?
- [ ] Check: `SELECT fcmToken FROM users WHERE id = 'your_id'` — Is it NOT NULL?
- [ ] Check: Is `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable set on server?
- [ ] Check: Server logs show `[Firebase] Admin SDK initialised ✅`?
- [ ] Check: When you sync, logs show `[Firebase Push] Sent to user...`?

If all above ✅, push notifications should work!

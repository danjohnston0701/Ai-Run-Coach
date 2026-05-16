# 📱 iOS Brief: Garmin Watch App Update Broadcast Notifications

## Overview

The backend now supports broadcasting a push notification to every user who
has the AI Run Coach Garmin companion (Connect IQ) watch app installed. When
a new version of the watch app is published, an admin API call sends a push
notification to all those users. Tapping the notification opens the Connect IQ
store listing so they can update their watch app.

This brief covers **everything the iOS app needs to implement** to participate
in this system. The backend is already complete and shared with Android — iOS
just needs to handle the incoming notification correctly.

---

## Connect IQ Store URL

```
https://apps.garmin.com/en-NZ/apps/91452a05-d077-4707-a9a3-0e98277f6017
```

This is the URL the notification tap should open. It is also sent dynamically
in the FCM payload as `storeUrl` in case it changes in the future.

---

## How It Works (End-to-End)

```
User logs into AI Run Coach from Garmin watch companion app
  → Backend sets has_garmin_watch_app = true on their account
  → Backend records garmin_watch_app_first_seen_at / last_seen_at

Admin publishes new IQ version → calls admin broadcast API:
  POST /api/admin/garmin-watch-app/broadcast-update
  { "version": "2.4.0", "releaseNote": "Better metrics and auth fixes" }

  → Backend queries all users WHERE has_garmin_watch_app = true
  → Sends FCM push to each user's registered device token
  → Creates in-app notification for each user

User receives push notification on phone
  → Taps it → Connect IQ store URL opens in browser/Safari
  → User taps "Update" on store page → new IQ file installs on watch
```

---

## FCM Notification Payload

The push notification sent by the backend has this structure:

```json
{
  "notification": {
    "title": "⌚ Garmin Watch App v2.4.0 Available",
    "body": "A new version of the AI Run Coach watch app is ready. Tap to update on your Garmin."
  },
  "data": {
    "type": "garmin_watch_update",
    "version": "2.4.0",
    "storeUrl": "https://apps.garmin.com/en-NZ/apps/91452a05-d077-4707-a9a3-0e98277f6017",
    "action": "open_connect_iq_store",
    "timestamp": "2026-05-16T00:00:00.000Z"
  }
}
```

**Key fields:**
- `type = "garmin_watch_update"` — identifies this as a watch update notification
- `storeUrl` — the URL to open when the notification is tapped
- `action = "open_connect_iq_store"` — explicit action indicator

---

## What iOS Needs to Implement

### 1. Notification Category: Handle `garmin_watch_update` type

In the existing FCM/APNs notification handler (`AppDelegate` or
`UNUserNotificationCenterDelegate`), add a branch for `garmin_watch_update`:

```swift
// In UNUserNotificationCenterDelegate
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
) {
    let userInfo = response.notification.request.content.userInfo
    let type = userInfo["type"] as? String

    switch type {
    case "garmin_watch_update":
        // Open the Connect IQ store URL
        let urlString = (userInfo["storeUrl"] as? String)
            ?? "https://apps.garmin.com/en-NZ/apps/91452a05-d077-4707-a9a3-0e98277f6017"
        if let url = URL(string: urlString) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }

    case "new_activity", "run_enriched":
        // Existing behaviour: navigate to run summary
        let runId = userInfo["runId"] as? String
        // ... existing run deep-link logic ...

    default:
        // Default: open app to dashboard
        break
    }

    completionHandler()
}
```

### 2. Foreground notification display for `garmin_watch_update`

When the app is in the foreground and a watch update notification arrives,
show a banner:

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
) {
    let type = notification.request.content.userInfo["type"] as? String
    if type == "garmin_watch_update" {
        // Always show banner + sound for update notifications, even when app is open
        completionHandler([.banner, .sound, .badge])
    } else {
        // Existing foreground notification logic
        completionHandler([.banner, .sound])
    }
}
```

### 3. Notification category constant

Add a constant to wherever you define notification types:

```swift
enum NotificationType: String {
    case newActivity      = "new_activity"
    case runEnriched      = "run_enriched"
    case garminWatchUpdate = "garmin_watch_update"   // ← ADD THIS
    case coachingReminder = "coaching_plan_reminder"
    // ... others ...
}

// Connect IQ store URL constant
enum GarminConstants {
    static let connectIQStoreURL = "https://apps.garmin.com/en-NZ/apps/91452a05-d077-4707-a9a3-0e98277f6017"
}
```

### 4. In-App Notification Screen

The backend also creates an **in-app notification** (visible in the
Notifications screen inside the app). The in-app notification has
`type = "garmin_watch_update"`.

In the notifications list / notification cell, if the notification type is
`garmin_watch_update`, tapping the cell should open the Connect IQ store URL
in Safari rather than navigating to a run summary.

```swift
// In NotificationsView / NotificationCell tap handler
if notification.type == "garmin_watch_update" {
    let urlString = notification.data?["storeUrl"]
        ?? GarminConstants.connectIQStoreURL
    if let url = URL(string: urlString) {
        UIApplication.shared.open(url)
    }
} else {
    // Existing in-app notification tap logic
}
```

---

## What is Already Done (No iOS Action Required)

These are handled entirely on the backend and Android — iOS gets the same
notifications automatically:

- ✅ Detecting which users have the Garmin watch app (`has_garmin_watch_app` flag)
- ✅ Setting the flag when a user authenticates from the watch companion app
- ✅ The broadcast API endpoint (`POST /api/admin/garmin-watch-app/broadcast-update`)
- ✅ Querying all eligible users and sending FCM messages
- ✅ In-app notification creation in the database

---

## Backend Admin API (Reference Only — No iOS Changes Needed)

When you publish a new IQ file to the Connect IQ store, trigger the broadcast:

```bash
curl -X POST https://airuncoach.live/api/admin/garmin-watch-app/broadcast-update \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "2.4.0",
    "releaseNote": "Better metrics and auth fixes"
  }'
```

Response:
```json
{
  "success": true,
  "version": "2.4.0",
  "targeted": 247,
  "pushSent": 231,
  "pushFailed": 3,
  "inAppSent": 247,
  "message": "Broadcast sent to 247 Garmin watch app users (231 push, 247 in-app)"
}
```

Dry run (preview without sending):
```bash
curl -X POST .../broadcast-update \
  -H "X-Admin-Key: ..." \
  -d '{"version":"2.4.0","dryRun":true}'
```

---

## Summary of iOS Changes Required

| File | Change |
|------|--------|
| `AppDelegate.swift` or notification delegate | Handle `garmin_watch_update` type → open Connect IQ store URL |
| Foreground notification handler | Show banner for `garmin_watch_update` even when app is open |
| `NotificationType` enum (or equivalent) | Add `garminWatchUpdate = "garmin_watch_update"` case |
| Constants file | Add `GarminConstants.connectIQStoreURL` |
| Notifications screen / cell tap handler | For `garmin_watch_update` type, open store URL instead of run deep-link |

**That's it — 5 small changes, all in the notification handling layer.
No API changes, no schema changes, no new screens required.**

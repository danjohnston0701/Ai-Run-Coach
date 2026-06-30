# Cross-Platform Push Notifications — Implementation Checklist

## Summary

Android and iOS push notifications work through **Firebase Cloud Messaging (FCM)** as the unified routing layer:

- **Firebase** automatically bridges FCM messages to APNs for iOS
- **Backend** only calls `sendFirebasePush()` once
- **Both platforms** handle `type: "friend_request"` → navigate to Friends

---

## Android Implementation ✅

### FCM Token Registration
- **Service:** `AiRunCoachMessagingService.kt`
- **Method:** `onNewToken(token)`
- **Endpoint:** `POST /api/users/me/fcm-token` (legacy) or `POST /api/notifications/register-device` (new unified)
- **Storage:** `users.fcmToken` column

### Friend Request Notification Handling
- **File:** `AiRunCoachMessagingService.kt:152-163`
- **Type:** `friend_request`
- **Action:** Sets `deeplink_friends = true` intent extra
- **Navigation:** `MainActivity.kt:120, 128` → routes to `"friends"` deeplink

### Test
- Device receives friend request push → notification tap → opens Friends screen
- ✅ Tested and working

---

## iOS Implementation ✅

### APNs Token Registration
- **Manager:** `PushNotificationManager.swift`
- **Method:** Registers APNs token with Firebase → Firebase returns FCM token
- **Endpoint:** `POST /api/notifications/register-device` with `{ deviceToken: "...", platform: "ios" }`
- **Storage:** `users.fcmToken` column (same as Android)

### Friend Request Notification Handling
- **File:** `PushNotificationManager.swift`
- **Method:** `handleNotificationTap()`
- **Type:** `friend_request`
- **Current Action:** Posts `.friendRequestTapped` → navigates to profile tab
- **⚠️  Potential Issue:** Profile tab root may not show pending Friends section immediately

### Test (Before P8 Key Upload)
Use Xcode Simulator push notification:
```json
{
  "aps": {
    "alert": {
      "title": "Test Friend Request",
      "body": "testuser sent you a friend request"
    },
    "sound": "default"
  },
  "type": "friend_request",
  "requestId": "test-request-123",
  "requesterId": "test-requester-456"
}
```

Test locally:
1. Simulator → tap notification
2. Verify it navigates directly to Friends tab with pending requests visible
3. **If needed:** Update navigation to explicitly show `FriendsView()` or `.friends` route, not just the profile tab

---

## Server Implementation ✅

### Friend Request Flow
1. **Endpoint:** `POST /api/friend-requests`
2. **Action:** Create or upsert friend request
3. **Push:** Calls `sendFirebasePush(addresseeId, message, data)` with:
   ```
   type: "friend_request"
   requestId: <request_id>
   requesterId: <requester_id>
   ```

### Push Service
- **File:** `server/notification-service.ts:124-203`
- **Method:** `sendFirebasePush(userId, title, body, data)`
- **Query:** Fetches `users.fcmToken` from database
- **Send:** Firebase Admin SDK routes to:
  - **Android:** Direct FCM delivery
  - **iOS:** Converted to APNs via Firebase's P8 key bridge

### Device Token Endpoints
- **Old:** `POST /api/users/me/fcm-token` (Android)
- **New:** `POST /api/notifications/register-device` (iOS + Android unified)
- Both store the token as `users.fcmToken`

---

## Critical One-Time Setup Required

### Firebase Console Configuration
**Status:** ⏳ **NOT YET DONE** — Required before iOS notifications work

1. **Upload APNs P8 Key**
   - Firebase Console → Project Settings → Cloud Messaging → Apple app configuration
   - Upload your Apple Developer P8 key (from Apple Developer account)
   - Without this: Firebase can't forward FCM messages to APNs, iOS won't receive notifications

2. **Verify Firebase Project**
   - Both Android and iOS apps are registered in the same Firebase project
   - (Android: `google-services.json` is in place; iOS: already configured)

---

## Cross-Platform Testing Scenarios

### Scenario 1: Android → iOS Friend Request
- **Sender:** Android user sends friend request
- **Result:** ✅ Should work once P8 key is uploaded
  1. Server calls `sendFirebasePush(ios_user_id, message)`
  2. Firebase converts FCM to APNs
  3. iOS device receives notification
  4. User taps notification → navigates to Friends screen

### Scenario 2: iOS → Android Friend Request
- **Sender:** iOS user sends friend request
- **Result:** ✅ Already working
  1. Server calls `sendFirebasePush(android_user_id, message)`
  2. Firebase sends as FCM
  3. Android device receives notification
  4. User taps notification → navigates to Friends screen

### Scenario 3: Same Platform (Android → Android or iOS → iOS)
- **Result:** ✅ Already working

---

## Next Steps

### For iOS Agent
1. **Verify Navigation:** Test that tapping friend request notification navigates to Friends tab showing pending requests
   - If not: Update `handleNotificationTap()` to explicitly deep-link to Friends screen section
   - Use Xcode Simulator push notification test (JSON payload above)

2. **Confirm API Compatibility:** Verify `POST /api/notifications/register-device` endpoint works
   - Body format: `{ deviceToken: "...", platform: "ios" }`
   - Verify token is stored and retrieval works

### For Backend
1. **Upload P8 Key to Firebase**
   - Once done, iOS notifications will be delivered in production
   - Timeline: Can be done anytime before first cross-platform friend request test

2. **Monitoring**
   - Server logs show `[Firebase Push] ✅ Sent to user X` for successful sends
   - Server logs show stale token cleanup in case of failures

---

## Debug & Troubleshooting

### Android
- Check `AiRunCoachMessagingService` logs for FCM token updates
- Check `MainActivity` logs for deeplink handling
- If notification doesn't tap: verify `NotificationCompat.setContentIntent()` is set correctly

### iOS
- Check `PushNotificationManager` logs for FCM token registration
- Verify `handleNotificationTap()` fires when notification is tapped
- Use Xcode Simulator to test local push notifications before P8 key setup

### Server
- Check `notification-service.ts` logs for Firebase sends
- Check `routes.ts` logs for friend request creation
- Verify `users.fcmToken` is populated after device registration

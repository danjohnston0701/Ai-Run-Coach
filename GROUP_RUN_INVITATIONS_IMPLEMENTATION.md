# Group Run Invitations — Implementation Complete (Android) + TODO (iOS)

**Status:** Backend ✅ | Android ✅ | iOS ⏳

---

## What Users Can Do Now

1. **Host creates a group run** → `POST /api/group-runs`
2. **Host invites specific users** → `POST /api/group-runs/:id/invite`
   - Invited users receive push notification immediately
   - Message: "[Host name] invited you to run "[run name]" on [date]"
3. **Invited user taps notification** → Opens that specific group run
4. **User accepts/declines** → `POST /api/group-runs/:id/respond-invite`
   - Status updated in database (participant record)

---

## Backend Implementation ✅

### Endpoints

#### POST /api/group-runs/:id/invite
**Host invites users to their group run**

```
Headers: Authorization: Bearer {token}
Body: {
  "invitedUserIds": ["user-id-1", "user-id-2", ...]
}

Response: {
  "success": true,
  "message": "Invited 2 user(s)",
  "invited": 2,
  "failed": 0
}
```

**Behavior:**
- Verifies requester is the group run host
- Skips users already invited/participating
- Creates `groupRunParticipants` row with `status: "invited"`
- Sends Firebase push notification to each invitee
- Notification includes `groupRunId` in data payload

#### POST /api/group-runs/:id/respond-invite
**Invited user accepts or declines invitation**

```
Headers: Authorization: Bearer {token}
Body: {
  "accept": true  // or false to decline
}

Response: {
  "success": true,
  "status": "accepted"  // or "declined"
}
```

**Behavior:**
- Updates participant `status` to "accepted" or "declined"
- Sets `respondedAt` timestamp
- No push notification back to host (for now)

### Database Schema

Uses existing `groupRunParticipants` table with new fields:
- `status` enum: "pending" | "invited" | "accepted" | "declined"
- `invitedByUserId` (who sent the invite)
- `invitedAt` (when invite was sent)
- `respondedAt` (when user accepted/declined)

### Push Notification Format

```json
{
  "notification": {
    "title": "You're invited to a group run!",
    "body": "[Host name] invited you to run "[run name]" on [date]"
  },
  "data": {
    "type": "group_run_invite",
    "groupRunId": "gr-uuid-123",
    "hostUserId": "user-uuid-456",
    "runName": "Morning 5K"
  }
}
```

---

## Android Implementation ✅

### How Notifications Are Handled

**File:** `AiRunCoachMessagingService.kt`

```kotlin
type == "group_run_invite" -> {
    val mainIntent = Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        val groupRunId = data["groupRunId"] ?: ""
        if (groupRunId.isNotEmpty()) {
            putExtra("deeplink_group_run_id", groupRunId)
        }
    }
    PendingIntent.getActivity(...)
}
```

**File:** `MainActivity.kt`

```kotlin
val groupRunId = intent?.getStringExtra("deeplink_group_run_id")
when {
    ...
    groupRunId != null && groupRunId.isNotEmpty() -> 
        pendingDeepLink.value = "group_run_detail/$groupRunId"
    ...
}
```

**Flow:**
1. User receives push notification
2. Taps notification → `AiRunCoachMessagingService.showNotification()`
3. Extracts `groupRunId` from notification data
4. Sets `deeplink_group_run_id` intent extra
5. `MainActivity` catches it and routes to `group_run_detail/{groupRunId}`
6. That screen opens the specific group run for acceptance/decline

---

## iOS Implementation ⏳

### What Needs To Be Done

The iOS app already has the infrastructure to handle this. You need to:

1. **Update `handleNotificationTap()`** in `PushNotificationManager.swift`
   - Check for `type == "group_run_invite"`
   - Extract `groupRunId` from notification data
   - Post event (like `.groupRunInviteTapped(groupRunId: String)`)
   - Or deep-link to the group run details screen

2. **Example code structure:**
   ```swift
   if type == "group_run_invite",
      let groupRunId = data["groupRunId"] {
       // Option A: Post notification for MainTabRoot to catch
       // NotificationCenter.default.post(
       //     name: NSNotification.Name("groupRunInviteTapped"),
       //     object: groupRunId
       // )
       
       // Option B: Direct deep-link
       // navigate(to: .groupRunDetail(id: groupRunId))
   }
   ```

3. **Test with Xcode Simulator** (before real notifications):
   ```json
   {
     "aps": {
       "alert": {
         "title": "You're invited to a group run!",
         "body": "Jane invited you to run \"Morning 5K\" on Jul 5"
       },
       "sound": "default"
     },
     "type": "group_run_invite",
     "groupRunId": "test-group-run-id-123",
     "hostUserId": "host-user-id",
     "runName": "Morning 5K"
   }
   ```

4. **Verify navigation**
   - Tap notification in Simulator
   - Confirm app opens to the group run detail screen
   - User should see accept/decline buttons

---

## Cross-Platform Testing

### Scenario: Android User Invites iOS User

1. Android host creates group run "Morning 5K"
2. Android host invites iOS user via invite endpoint
3. iOS device receives push notification (via Firebase → APNs bridge)
4. iOS user taps notification
5. **Expected:** iOS app opens to group run detail screen
6. iOS user taps "Accept" button
7. Server updates participant status to "accepted"

### Scenario: iOS User Invites Android User

1. iOS host creates group run (via app UI)
2. iOS host invites Android user
3. Android device receives push notification (via FCM)
4. Android user taps notification
5. **Expected:** Android app opens to group run detail screen
6. Android user taps "Accept" button
7. Server updates participant status to "accepted"

---

## API Testing (curl examples)

### Invite users to a group run
```bash
curl -X POST https://your-server/api/group-runs/GROUP_RUN_ID/invite \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invitedUserIds": ["user-id-1", "user-id-2"]
  }'
```

### Accept invitation
```bash
curl -X POST https://your-server/api/group-runs/GROUP_RUN_ID/respond-invite \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accept": true
  }'
```

### Decline invitation
```bash
curl -X POST https://your-server/api/group-runs/GROUP_RUN_ID/respond-invite \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accept": false
  }'
```

---

## Logs to Monitor

### Server
- `[GroupRunInvite] Invited user X to group run Y (push sent: true)`
- `[GroupRunInvite] User X accepted invitation to group run Y`
- `[GroupRunInvite] User X declined invitation to group run Y`

### Android
- `[AiRunCoachFCM] FCM message received: {type=group_run_invite, groupRunId=...}`
- `[MainActivity] Launch to group run detail: GROUP_RUN_ID`

### iOS
- Check logs in Xcode console for notification handling

---

## Next Steps

1. **iOS Agent:** Implement `handleNotificationTap()` for `type: "group_run_invite"`
2. **iOS Agent:** Test with Xcode Simulator push notification
3. **Both Platforms:** Test cross-platform invitations in staging
4. **Optional:** Add host-side feedback when user accepts/declines (could send push back to host)

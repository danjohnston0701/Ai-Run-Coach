# Live Tracking Observers — Quick Reference

## ✅ UI Complete

The expandable Live Tracking observer section is **fully implemented** in `MapMyRunSetupScreen.kt`.

### What Users See

```
┌─ PREPARE RUN SCREEN ────────────���─┐
│ Social                            │
│ ┌─────────────────────────────┐   │
│ │ 👥 Live Tracking        [ON]│   │
│ │    Share your location      │   │
│ ├─────────────────────────────┤   │
│ │ Who can watch?              │   │
│ │                             │   │
│ │ [+ Add Friend]              │   │
│ │ [📧 Add email address...] ✓ │   │
│ │                             │   │
│ │ jane@example.com         [x]│   │
│ │ john (friend)            [x]│   │
│ └─────────────────────────────┘   │
└───────────────────────────────────┘
```

## 🔧 Technical Details

### Files Modified
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MapMyRunSetupScreen.kt`

### New Composable
- `LiveTrackingObserverSection(observers, onObserversChanged)`

### New State Variable
```kotlin
var liveTrackingObservers by remember { mutableStateOf<List<String>>(emptyList()) }
```

### Data Flow
```
liveTrackingObservers (UI state)
         ↓
   RunSetupConfig
         ↓
   RunSessionViewModel
         ↓
   Observer invites sent when run starts
```

## 📋 What's Working Now

✅ Toggle Live Tracking on/off  
✅ Expandable observer picker section  
✅ Email input + validation  
✅ Observer list display  
✅ Remove individual observers  
✅ State persists through run creation  

## ⏳ What Needs Implementation

1. **Friend Picker Dialog** (Component)
   - Location: `LiveTrackingObserverSection`
   - Trigger: "Add Friend" button click
   - Returns: Friend user ID (added to observers list)

2. **Send Invites on Run Start** (Logic)
   - Location: `RunSessionViewModel.startRun()`
   - Get sessionId from RunTrackingService
   - Call `POST /api/live-sessions/:sessionId/invite-observer` for each observer
   - Handle both friendId (user ID) and email parameters

3. **API Client Methods** (Retrofit)
   - Add to `ApiService.kt`:
   ```kotlin
   suspend fun inviteObserverByFriendId(sessionId: String, friendId: String)
   suspend fun inviteObserverByEmail(sessionId: String, email: String)
   ```

## 🎯 Integration Checklist

- [ ] Implement FriendPickerDialog
- [ ] Get sessionId from RunTrackingService after service start
- [ ] Add API client methods for inviting observers
- [ ] Call sendObserverInvites() in RunSessionViewModel.startRun()
- [ ] Add error handling + user feedback (toasts)
- [ ] Test: Add friend → Start run → Friend gets push notification
- [ ] Test: Add email → Start run → Email recipient gets email link

## 📞 Key Files

| File | Purpose |
|------|---------|
| `MapMyRunSetupScreen.kt` | Observer picker UI (expandable section) |
| `RunSessionViewModel.kt` | Run state + invite sending logic (TO DO) |
| `ApiService.kt` | API client methods (TO DO) |
| `RunTrackingService.kt` | Live session creation + sessionId |
| Backend: `routes.ts` | `POST /api/live-sessions/:sessionId/invite-observer` ✅ |

## 🚀 Ready to Build?

See `LIVE_TRACKING_OBSERVER_IMPLEMENTATION.md` for the complete implementation guide with code examples and architecture details.

Estimated time to complete:
- Friend Picker: 2-3 hours
- Invite Sending: 3-4 hours  
- Testing: 2-3 hours
- **Total: 7-10 hours**


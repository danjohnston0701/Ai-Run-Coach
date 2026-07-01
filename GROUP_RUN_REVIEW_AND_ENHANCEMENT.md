# Group Run Feature — Review & Enhancement Plan

**Date**: July 1, 2026  
**Status**: Current implementation reviewed, enhancement plan created

---

## 📊 Current State Analysis

### What Exists ✅

**Group Run Management (Profile Tab)**
- ✅ `GroupRunsScreen.kt` — Shows upcoming, my runs, past tabs
- ✅ `CreateGroupRunScreen.kt` — Full creation flow with friend selection
- ✅ `GroupRunDetailScreen.kt` — Shows group run details
- ✅ Friend picker in CreateGroupRunScreen (multi-select with checkboxes)
- ✅ Date/time picker for scheduling
- ✅ Meeting point, description, distance, max participants
- ✅ Push notifications sent when group run is created

**Group Run in Prepare Screen**
- ❌ Toggle exists but is "visual only"
- ❌ No friend selection when toggle is enabled
- ❌ Participants list always `emptyList()`
- ❌ No actual group run functionality

### Architecture Question

**Two Different Flows:**

1. **Profile Tab → CreateGroupRunScreen**
   - Create a group run BEFORE preparing/starting your own run
   - Invite specific friends to join you
   - Schedule for future date/time
   - Friends get push notification + can join from upcoming events

2. **Prepare Run Screen → Group Run Toggle**
   - Enable "Group Run" while setting up YOUR individual run
   - Add friends to run with you RIGHT NOW
   - Start run immediately with those friends
   - Friends get push notification to join

---

## 🤔 Key Question: Do We Need Both?

### Option 1: Keep Both Flows (Recommended)

**Profile Tab (Create Group Run)**
- **When**: Runner wants to organize a group run for a future date
- **Who**: Runner creates the event, invites friends
- **Flow**: Plan → Invite → Wait for friends to join → Start together

**Prepare Run Screen (Group Run Toggle)**
- **When**: Runner is ready to run NOW and wants friends to join
- **Who**: Runner adds friends to their run
- **Flow**: Add friends → Start → Friends see push notif → Join live

**Why Both?**
- Different use cases (planned events vs. spontaneous runs)
- Planned events need scheduling, meeting points, descriptions
- Spontaneous runs just need quick friend selection
- This matches how real runners use group runs:
  - Plan Thursday's 6AM park run (Profile tab)
  - Friday afternoon, decide to run and invite 2 friends (Prepare screen)

### Option 2: Single Flow Only (Not Recommended)

**Keep only Profile Tab:**
- Everything goes through CreateGroupRunScreen
- More structured, planned events
- Loses spontaneous group runs
- Less flexible

**Keep only Prepare Screen:**
- Quick, spontaneous groups
- Loses scheduled events
- Missing features (meeting point, capacity limits)
- Less professional

---

## ✅ Proposed Enhancement

### The Prepare Run Screen Group Run Toggle Should:

Match the **Live Tracking** pattern we just built.

```
Current State:
├─ Toggle "Group Run" ON
│  └─ (nothing happens)
│  └─ groupRunParticipants = emptyList()

Enhanced State:
├─ Toggle "Group Run" ON
│  ├─ Expandable section appears
│  ├─ "Add Friends" button (opens friend picker)
│  ├─ Friend list shows
│  ├─ Remove buttons on each friend
│  └─ groupRunParticipants = [friend-id-1, friend-id-2, ...]
│
├─ When run starts:
│  └─ All selected friends get PUSH notification
│  └─ Push says: "[Runner] started a group run"
│  └─ Friends can tap → Join live observer screen
│  └─ Friends can also see in upcoming events
```

---

## 🏗️ Implementation Plan

### Phase 1: Enhance Prepare Screen (2-3 hours)

**File**: `MapMyRunSetupScreen.kt`

**What to Add**:
1. Replace "visual toggle only for now" comment with actual logic
2. Add expandable group run section (like Live Tracking)
3. Reuse `FriendPickerDialog` from Live Tracking
4. Pass selected friends to `RunSetupConfig.groupRunParticipants`

**Code Changes**:
```kotlin
// Current (line 106)
var isGroupRunEnabled by remember { mutableStateOf(false) } // visual toggle only for now
var groupRunParticipants by remember { mutableStateOf<List<String>>(emptyList()) } // NEW

// Current (line 388-389)
isGroupRun = isGroupRunEnabled,
groupRunParticipants = emptyList()  // Change to: groupRunParticipants

// New composable
private fun GroupRunParticipantSection(
    participants: List<String>,
    onParticipantsChanged: (List<String>) -> Unit,
    friends: List<Friend>
)
```

**UI Flow**:
- Add friends via picker (same dialog as Live Tracking)
- Show selected friends with remove buttons
- Pass to RunSetupConfig when starting run

### Phase 2: Enhance Push Notifications (1-2 hours)

**File**: `RunSessionViewModel.kt` or new `GroupRunInviteService.kt`

**What to Add**:
1. Check if group run is enabled
2. When run starts, send push notifications to all participants
3. Different message than live tracking:
   - Live Tracking: "Watch [runner]'s live run"
   - Group Run: "Join [runner]'s group run"

**Code Changes**:
```kotlin
fun startRun() {
    // ... existing code ...
    
    // NEW: Send group run invites if enabled
    runConfig?.let { config ->
        if (config.isGroupRun && config.groupRunParticipants.isNotEmpty()) {
            sendGroupRunInvites(config.groupRunParticipants)
        }
    }
}

private fun sendGroupRunInvites(participantIds: List<String>) {
    // For each participant ID:
    // POST to /api/group-runs/:groupRunId/invite-participant (or similar)
    // Or: POST push notification directly
}
```

### Phase 3: Update API (if needed) (1 hour)

**Check**: Does backend support adding participants during run start?

If not, add endpoint:
```
POST /api/group-runs/{groupRunId}/invite-participant
Body: { participantIds: [id1, id2, ...] }
```

Or use existing group run endpoints.

---

## 🎯 Final Architecture

### Two Complementary Flows

**Flow 1: Profile Tab (Planned Group Runs)**
```
Profile Tab
  └─ "Group Runs" screen
     └─ [+ Create Group Run] button
        └─ CreateGroupRunScreen
           ├─ Run name, description
           ├─ Meeting point, date/time
           ├─ Distance, max participants
           ├─ Select friends to invite
           └─ Create group run
              └─ Friends get push: "Invited to group run [name]"
              └─ Friends see in "Upcoming" tab
              └─ Friends can join from upcoming events
```

**Flow 2: Prepare Screen (Spontaneous Group Runs)**
```
Prepare Run Screen
  └─ "Social" section
     ├─ Live Tracking toggle
     │  └─ (expands to add observers)
     │
     └─ Group Run toggle
        └─ (NEW: expands to add participants)
           ├─ "Add Friends" button
           ├─ Friend list
           └─ Start run
              └─ All participants get push: "Join [runner]'s group run"
              └─ All can watch in real-time
```

---

## 📋 Comparison: Live Tracking vs Group Run

| Feature | Live Tracking | Group Run |
|---------|---|---|
| **Purpose** | Watch runner's metrics | Run together as group |
| **Invitees** | Friends + emails | Friends only |
| **Entry Point** | Prepare screen (spontaneous) | Profile OR prepare screen |
| **When Active** | During run only | During + after run |
| **Observer Role** | Spectator | Participant/competitor |
| **Push Notif** | "Watch live run" | "Join group run" |
| **Follow-up** | Run ends | Can see results together |
| **Meetup** | No meetup | Yes (meeting point) |

---

## ✨ Recommendation

**YES, keep both flows.** But enhance the Prepare Screen group run toggle to match Live Tracking:

1. **Short-term** (Current): Live Tracking is elite, Group Run toggle is stubbed
2. **Enhancement** (Suggested): 
   - Add friend picker to group run toggle
   - Send push notifications when run starts
   - Match Live Tracking's polish and functionality

3. **Result**: Runners get two powerful options:
   - **Spontaneous**: "Hey, I'm running now, wanna join?" (Prepare screen)
   - **Planned**: "I'm organizing a group run Thursday 6AM" (Profile tab)

---

## 🔧 Implementation Effort

**If you want Group Run toggle to match Live Tracking quality:**

- **Phase 1** (Prepare Screen): 2-3 hours
  - Copy friend picker pattern from Live Tracking
  - Add participant selection UI
  - Pass to RunSetupConfig

- **Phase 2** (Push Notifications): 1-2 hours
  - Send invites when group run starts
  - Match Live Tracking notification handling

- **Phase 3** (Polish): 1 hour
  - Handle errors gracefully
  - Add logging
  - Match Live Tracking's level of polish

**Total**: ~4-6 hours to achieve feature parity

---

## 📞 Questions for You

1. **Which approach do you prefer?**
   - Keep both flows (Profile + Prepare)
   - Or consolidate to one?

2. **Priority?**
   - Build it now to match Live Tracking quality?
   - Or leave as-is for now?

3. **Features?**
   - Should group run invites from Prepare screen trigger the "reminder when prepares" flow?
   - Or just simple push notifications?

---

## Summary

**Group Run feature is functional but incomplete.**

- ✅ Profile tab works well (planned group runs)
- ❌ Prepare screen toggle is stubbed (needs friend selection)

**Recommendation**: Enhance the Prepare screen toggle to match Live Tracking's polish and functionality. This gives runners two distinct, powerful ways to organize group runs.

Would you like me to proceed with implementing the enhanced group run toggle?


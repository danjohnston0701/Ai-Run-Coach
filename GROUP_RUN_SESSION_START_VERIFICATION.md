# Group Run Session Start Behavior - Verification Report

## ✅ Current Implementation Summary

Based on code analysis of the Android codebase, **the current implementation is CORRECT** - all users are responsible for starting their own sessions on group runs, and they can start from their watch device.

---

## 📋 How Group Runs Work Today

### 1. **Organizer Behavior** ❌ Auto-Start Disabled
- Organizer can click **"Start Group Run"** button in the group run detail screen
- This calls `GroupRunDetailViewModel.startRun()` → `apiService.startGroupRun(groupRunId)`
- **⚠️ IMPORTANT**: Starting the group run DOES NOT automatically start sessions for participants
- The organizer is responsible for starting their own separate run session on their phone/watch

**Code Reference**:
```
GroupRunDetailScreenEnhanced.kt (lines 649-669)
- Button labeled "Start Group Run" visible only to organizer
- onStartRun = { viewModel.startRun(groupRunId) }
- This only marks the group run as "active" in the backend
```

### 2. **Participant Behavior** ✅ Manual Start Required
Each participant must manually start their own run session:

**Before Organizer Starts**:
- Participants can mark themselves as "Ready" via `onMarkReady()` button
- This signals they're prepared to start

**After Organizer Starts** (group run status = "active"):
- Participants see updated UI: **"I'm Ready — Start My Run"** button
- Participants manually tap this button to enter the run session screen
- Each participant is responsible for starting their own GPS tracking and run

**Code References**:
```
GroupRunDetailScreenEnhanced.kt (lines 672-689)
- Shows different UI states based on group run status and invitation status
- Participants see "I'm Ready — Start My Run" ONLY when status == "active"

RunSessionScreen.kt (line 272)
- onStart = { viewModel.startRun() }
- Participants tap this to start their individual session
```

### 3. **Watch Support** ✅ Users CAN Start from Watch
Group run participants can start their run session on their watch device:

**Watch Mode Flow**:
1. User opens the group run detail screen
2. Taps "I'm Ready — Start My Run" or similar button
3. Navigates to `RunSessionScreen` with `groupRunId` parameter
4. RunSessionScreen passes groupRunId to ViewModel: `viewModel.setGroupRunId(groupRunId)`
5. User can prepare the run on watch via watch app
6. User starts the run from their watch device

**Code References**:
```
RunSessionScreen.kt (lines 156-158)
- LaunchedEffect(groupRunId) { groupRunId?.let { viewModel.setGroupRunId(it) } }
- Group run context is preserved throughout the session

RunSessionViewModel.kt (lines 131-136)
- private var groupRunId: String? = null
- fun setGroupRunId(id: String) { groupRunId = id }

RunSessionViewModel.kt (lines 408-463)
- prepareServiceForWatch() starts the service in standby
- Allows watch to send "start" command which triggers startRun()
```

---

## 🎯 Current User Flows (All Correct)

### Flow A: Phone-to-Phone Group Run
```
1. Organizer creates group run
2. Participants join and mark ready
3. Organizer taps "Start Group Run" → group marked as active
4. Participants each tap "I'm Ready — Start My Run" 
5. Each participant enters their run session screen
6. Each participant taps "Start" button to begin GPS tracking
7. All users running independently but connected to the same group run
```

### Flow B: Watch-Enabled Group Run
```
1. Same as above through step 5
2. After entering run session screen, participants can:
   - [Watch Option A] Tap "Prepare for Watch" button
   - [Watch Option B] Start directly from phone and sync to watch
3. User starts on watch device when ready
4. Watch sends "start" command to phone service
5. Run begins on both watch and phone simultaneously
```

### Flow C: Organizer on Watch
```
1. Organizer prepares the group run on phone
2. Marks run as ready for watch
3. Organizer taps "Start Group Run" from phone
   - This marks the group run as "active" in backend
4. Organizer uses watch app to start their own running session
   - Watch session is independent but linked to group run ID
5. Participants follow their own flows (A or B above)
```

---

## 🔍 Key Code Locations

| Component | File | Behavior |
|-----------|------|----------|
| **Group Run Detail** | `GroupRunDetailScreenEnhanced.kt` | Shows "Start Group Run" button (organizer only), "I'm Ready" button (participants) |
| **Group Run ViewModel** | `GroupRunDetailViewModel.kt` | `startRun(groupRunId)` - marks group as active, does NOT start participant sessions |
| **Run Session Screen** | `RunSessionScreen.kt` | Entry point with `groupRunId` parameter, shows manual start button |
| **Run Session ViewModel** | `RunSessionViewModel.kt` | `setGroupRunId()`, `prepareServiceForWatch()`, `startRun()` for manual start |
| **Navigation** | `MainScreen.kt` line 1148 | Routes: `run_session/group/{groupRunId}` |
| **Control Buttons** | `RunSessionScreen.kt` line 2304+ | Bottom bar with "Start" button that users must tap |

---

## ✅ Verification Results

### Requirements Met

1. ✅ **Organizer auto-start disabled**: Organizer clicking "Start Group Run" only marks the group as active, does NOT auto-start participant sessions
2. ✅ **Participants manual start required**: Each participant must manually tap "Start" button to begin their session
3. ✅ **Watch support available**: Participants can start their session from watch device via `prepareServiceForWatch()` + watch app integration
4. ✅ **Group run context preserved**: `groupRunId` is passed through all layers and available in run tracking service

### Current Behavior is Correct ✅

No changes needed. The implementation correctly allows:
- Participants to join group runs
- Organizer to signal group run start
- **Each participant to independently start their own session**
- Participants to start from phone, watch, or both
- All sessions to be linked to the same group run in the backend

---

## 📝 Summary

**The app is functioning as intended.** All users are responsible for starting their own sessions on group runs, and they have the capability to start from their watch device using the same flow as a normal run. The organizer's "Start Group Run" button only marks the group as active in the backend—it does not trigger automatic session creation for participants.

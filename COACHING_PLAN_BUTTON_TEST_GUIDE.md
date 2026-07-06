# Coaching Plan Dashboard - Button Testing Guide

## How to Verify the Buttons Are Working

### Step 1: Open a Coaching Plan with an Active Session
1. Navigate to **Ai Plans** tab
2. Open an **Active** plan
3. Look for the **"TODAY" section** at the top of the plan details

### Step 2: Verify "Prepare Session" Button

**✅ Button should appear if:**
- There is a workout scheduled for **TODAY**
- The workout is **NOT already completed**
- It's showing under the "TODAY" section

**Action**: Tap the **blue "Prepare Session"** button
- You should navigate to the **Workout Detail** screen
- The workout description, distance, and pace should be displayed
- You should see options to "Prepare for Run", "Mark as Done", or skip

**If nothing happens:**
- Check if `isLoading` is showing (spinning icon on the button)
- Check logcat for: `navigate("workout_detail")`
- Verify plan has a workout scheduled for today

### Step 3: Verify "Mark as Done" Button

**✅ Button should appear if:**
- Same conditions as "Prepare Session"
- Workout is **NOT yet completed**

**Action**: Tap the **outlined "Mark Done"** button
- You should see a loading spinner appear on the button
- The button should become disabled
- After 2-3 seconds, you should return to the plan dashboard
- The "TODAY" section should show "Great work! Today's workout is done."
- The workout should no longer appear in "THIS WEEK" as incomplete

**If nothing happens:**
- Check logcat for: `Marking workout ... as complete`
- Look for HTTP errors in logcat
- Check if the network request succeeded

---

## Logcat Output to Watch For

### Successful "Prepare Session" Flow
```
D/CoachingProgrammeScreen: Navigating to workout_detail...
D/WorkoutDetailScreen: Loaded workout: [workout description]
D/MainScreen: Navigating to run_session
```

### Successful "Mark as Done" Flow
```
D/TrainingPlanVM: Marking workout [id] as complete...
D/TrainingPlanVM: ✅ Workout marked complete — isCompleted=true
D/TrainingPlanVM: ✅ Reloading plan details for planId=...
D/TrainingPlanVM: ✅ Plan detail state updated
```

### Common Errors
```
E/TrainingPlanVM: ❌ Completion failed: 400
E/TrainingPlanVM: Error body: [server error message]

E/TrainingPlanVM: Error completing workout: [exception message]

E/MainScreen: Deep-link navigation failed: [route]
```

---

## Troubleshooting Decision Tree

```
"Prepare Session" button not working?
├── Button appears but doesn't respond to taps?
│   ├── Check: Is isLoading=true (spinning indicator)?
│   │   ├── YES → Wait for loading to finish
│   │   └── NO → Check logcat for clicks being registered
│   └── Check: Is button disabled (grayed out)?
│       ├── YES → Enable condition failed
│       └── NO → onClick handler not wired
│
└── Button doesn't appear at all?
    ├── Check: Is there text showing "TODAY"?
    │   ├── NO → No workout for today
    │   └── YES → Workout exists, check next
    ├── Check: Is the workout already completed?
    │   ├── YES → Show "Great work!" message instead
    │   └── NO → Check next
    └── Check: Is it showing under "THIS WEEK"?
        ├── YES → Wrong section, should be under "TODAY"
        └── NO → Workout loaded successfully

"Mark as Done" button not working?
├── Button appears but doesn't respond?
    ├── Check: Is isLoading=true?
    │   ├── YES → Request in progress, wait
    │   └── NO → onClick handler issue
    └── Check logcat: Look for "Marking workout... as complete"
└── Button doesn't appear?
    └── Check: Same as "Prepare Session" above

Plan not updating after "Mark Done"?
├── Check logcat: Look for "✅ Workout marked complete"
├── Check logcat: Look for "Reloading plan details"
└── If you see these but plan doesn't update:
    └── Check: planDetailState update in UI
        └── Force refresh by navigating away and back
```

---

## Expected UI States

### Before Any Action
```
TODAY
┌─────────────────────────────────────┐
│ [Badge: Easy Run]                   │
│ Easy Run Description                │
│ 5km                                 │
│ Zone 2                              │
│ 5:20 min/km                         │
│                                     │
│ [Mark Done Button] [Prepare Session]│
│ [Skip Session]                      │
└─────────────────────────────────────┘
```

### After "Mark Done"
```
TODAY
┌───────��─────────────────────────────┐
│ ✅                                   │
│ Great work! Today's workout is done.│
└─────────────────────────────────────┘
```

### Navigating to Workout Detail
```
[Workout Detail Screen appears]
Easy Run
5km • Zone 2 • 5:20/km

[Prepare for Run]
[Mark as Done (no GPS)]
[Skip Workout]
```

---

## Quick Test Checklist

- [ ] Open Ai Plans → Select Active Plan
- [ ] Scroll to "TODAY" section
- [ ] "Prepare Session" button is visible and tappable
- [ ] Tapping "Prepare Session" navigates to Workout Detail
- [ ] "Mark Done" button is visible and tappable  
- [ ] Tapping "Mark Done" shows loading then updates plan
- [ ] Plan shows "Great work!" message after marking done
- [ ] Check logcat for any errors or warnings

---

## If Still Not Working

1. **Gather information:**
   - Screenshot of the plan dashboard
   - Full logcat output (use: `adb logcat | grep -E "TrainingPlanVM|CoachingProgramme|WorkoutDetail"`)
   - Note what happens when you tap each button

2. **Common fixes:**
   - Rebuild and re-run the app: `./gradlew clean build && run`
   - Clear app data: Settings → Apps → AI Run Coach → Storage → Clear
   - Check internet connection for API calls

3. **Verify backend:**
   - Test `/training-plan/{planId}/today-workout` endpoint
   - Verify the response has `isToday: true`
   - Check if `POST /workout/{workoutId}/complete` is returning 200

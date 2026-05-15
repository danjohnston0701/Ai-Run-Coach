# 🔐 Production UUID Authentication Bug - ROOT CAUSE & FIX

## You Were Absolutely Right!

**The problem IS in the Garmin watch code** - not the Android app (well, partially).

---

## Root Cause

When the app architecture changed to use **RunView as the initial screen** (instead of StartView), the authentication message handler was **not migrated** to RunView's `onPhoneMessage()` function.

### What Happened:

1. **Beta Version**: Used `StartView` as initial screen
   - ✅ StartView.onPhoneMessage() handles "auth" messages
   - ✅ Works perfectly with beta UUID

2. **Production UUID**: Changed to use `RunView` as initial screen
   - ❌ RunView.onPhoneMessage() does NOT handle "auth" messages
   - ❌ Only handles: runUpdate, statusMessage, coachingCue, sessionEnded
   - ❌ Breaks authentication flow

### The Bug Location:

**File**: `garmin-companion-app/source/views/RunView.mc`
**Function**: `onPhoneMessage(data)` - lines 308-339
**Missing Handler**: The `"auth"` message type

---

## The Fix

### Add This Code to RunView.onPhoneMessage()

In `garmin-companion-app/source/views/RunView.mc`, add the authentication handler BEFORE the other message types:

```monkey-c
function onPhoneMessage(data) {
    if (data == null) { return; }
    var t = data.get("type");
    if (t == null) { return; }

    // ✅ NEW: Handle authentication message (production UUID)
    if (t.equals("auth")) {
        var token = data.get("authToken");
        var rname = data.get("runnerName");
        if (token != null && token.length() > 0) {
            App.Storage.setValue("authToken", token);
            _isAuthenticated = true;
            _isConnected     = true;
            _overlayState    = OVERLAY_GPS_WAIT;
            Sys.println("✅ Auth token received from phone (production UUID)");
        }
        if (rname != null) {
            App.Storage.setValue("runnerName", rname);
            Sys.println("✅ Runner name: " + rname);
        }
        Ui.requestUpdate();

    } else if (t.equals("runUpdate")) {
        // ... existing code ...
    }
    // ... rest of handlers ...
}
```

### Full Updated Function

See `RunView_UPDATED.mc` for the complete corrected onPhoneMessage() function.

---

## Why This Bug Happened

```
Timeline:
─────────
2025: Beta app built with StartView as initial screen
      ✅ StartView handles all messages including "auth"
      ✅ Works perfectly

2026 (Recent): Refactored to RunView as initial screen
      - Removed StartView code
      - Added RunView UI redesign
      - ❌ Forgot to add "auth" handler to RunView.onPhoneMessage()
      - ❌ Only copied runUpdate/statusMessage/coachingCue handlers

Result:
      ✅ RunView works for live updates (runUpdate)
      ❌ RunView doesn't work for authentication (auth)
      ✅ Works with beta UUID (which uses StartView in old build)
      ❌ Breaks with production UUID (which uses RunView in new build)
```

---

## Implementation Steps

### Step 1: Backup Current RunView

```bash
cp garmin-companion-app/source/views/RunView.mc \
   garmin-companion-app/source/views/RunView.mc.backup
```

### Step 2: Add Auth Handler

Edit `garmin-companion-app/source/views/RunView.mc` line 308:

Find this section:
```monkey-c
    function onPhoneMessage(data) {
        if (data == null) { return; }
        var t = data.get("type");
        if (t == null) { return; }

        if (t.equals("runUpdate")) {
```

Replace with:
```monkey-c
    function onPhoneMessage(data) {
        if (data == null) { return; }
        var t = data.get("type");
        if (t == null) { return; }

        if (t.equals("auth")) {
            var token = data.get("authToken");
            var rname = data.get("runnerName");
            if (token != null && token.length() > 0) {
                App.Storage.setValue("authToken", token);
                _isAuthenticated = true;
                _isConnected     = true;
                _overlayState    = OVERLAY_GPS_WAIT;
                Sys.println("✅ Auth token received");
            }
            if (rname != null) {
                App.Storage.setValue("runnerName", rname);
                Sys.println("✅ Runner name: " + rname);
            }
            Ui.requestUpdate();

        } else if (t.equals("runUpdate")) {
```

### Step 3: Update the Manifest UUID (Already Done)

✅ Already set to production UUID: `C7BF12555C184F9FB1F82B49E72E20A2`

### Step 4: Rebuild IQ File

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
bash build-iq-automated.sh
```

This will create: `garmin-companion-app/bin/AiRunCoach_new.iq`

### Step 5: Test

1. Install updated IQ file on watch
2. Make sure Bluetooth is connected to phone
3. Log in on Android app
4. Watch should immediately change from "Waiting..." to "READY"

---

## What This Fix Does

```
BEFORE (Broken):
  Android → Phone sends auth message
           Watch receives message ✅
           RunView.onPhoneMessage() called ✅
           "auth" handler checks... ❌ NOT FOUND
           Message is silently ignored ❌
           Watch stays in "Waiting..." ❌

AFTER (Fixed):
  Android → Phone sends auth message
           Watch receives message ✅
           RunView.onPhoneMessage() called ✅
           "auth" handler found ✅
           Token stored ✅
           _isAuthenticated = true ✅
           _overlayState = OVERLAY_GPS_WAIT ✅
           Watch shows "READY" ✅
```

---

## Why Android Sender Code is Also Needed

Even though this IS a watch code bug, you ALSO need to update the Android app because:

1. **Watch Code Bug**: RunView wasn't listening for "auth"
2. **Android Code Bug**: Android wasn't sending "auth" to the watch

Both need to be fixed:
- ✅ **Watch**: Add auth handler to RunView (this document)
- ✅ **Android**: Add Garmin messenger to send auth token (GARMIN_AUTH_INTEGRATION_FIX.md)

---

## Summary

| Aspect | Status | Details |
|--------|--------|---------|
| **Root Cause** | ✅ Found | RunView missing "auth" handler |
| **Why It Worked in Beta** | ✅ Explained | Beta used StartView which had handler |
| **Why It Broke in Production** | ✅ Explained | Production uses RunView which doesn't have handler |
| **Fix Required** | ✅ Provided | Add 20 lines to RunView.onPhoneMessage() |
| **UUID** | ✅ Correct | C7BF12555C184F9FB1F82B49E72E20A2 (production UUID) |

---

## Files to Update

1. **`garmin-companion-app/source/views/RunView.mc`**
   - Add "auth" handler to onPhoneMessage() function
   - ~20 lines of code
   - Location: Line 308, before "runUpdate" handler

2. **Rebuild IQ File**
   - Run: `bash build-iq-automated.sh`
   - Output: `garmin-companion-app/bin/AiRunCoach_new.iq`

3. **Install on Watch**
   - Transfer updated IQ file to watch
   - Clear app cache if needed
   - Reinstall app

---

## Thank You for Catching This!

You were 100% correct - the bug IS in the watch code, specifically in the architectural change from StartView to RunView. The authentication handler was lost in the transition.

This is a critical bug that prevents authentication with the new production UUID.


# 🎮 Garmin Connect IQ Simulator Guide

**Date:** February 5, 2026  
**Status:** ✅ Simulator Running  

---

## 🚀 Quick Start

### Launch Simulator (Easy Way):

```bash
./launch-garmin-simulator.sh
```

This script automatically:
- ✅ Starts the Connect IQ Simulator
- ✅ Loads the Fenix 7 device
- ✅ Loads your AI Run Coach app
- ✅ Shows you the controls

### Manual Start (If Needed):

```bash
# Start simulator
/Users/danieljohnston/Library/Application\ Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-8.4.0-2025-12-03-5122605dc/bin/connectiq &

# Load app on Fenix 7
cd garmin-companion-app
/Users/danieljohnston/Library/Application\ Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-8.4.0-2025-12-03-5122605dc/bin/monkeydo bin/AiRunCoach.prg fenix7
```

---

## 🎮 Simulator Status

### What's Running:
- ✅ **Connect IQ Simulator** launched
- ✅ **Fenix 7** device loaded
- ✅ **AI Run Coach app** loaded (`AiRunCoach.prg`, 107 KB)
- ✅ **Build date:** January 30, 2026 (21:57)

**Simulator Window:** Should be visible on your screen with a Fenix 7 watch face!

---

## 🎨 App Design Overview

### Screen 1: Start View (Pre-Run)

**Layout:**
```
┌─────────────────────┐
│                     │
│   AI Run Coach      │  ← Title (Large, White)
│                     │
│   Ready to Start    │  ← Status (Green if auth'd, Yellow if not)
│                     │
│  Press START        │  ← Instructions (Light Gray, Small)
│  to begin           │
│                     │
└─────────────────────┘
```

**Features:**
- **Authentication check** on startup
- Shows "Not Connected" if no auth token
- Shows "Ready to Start" when authenticated
- Green status = Ready, Yellow = Connecting

**Interactions:**
- **START button** → Begins run activity
- **BACK button** → Exits app

---

### Screen 2: Run View (During Activity)

**Layout:**
```
┌─────────────────────┐
│                     │
│       165           │  ← Heart Rate (HUGE, Color-coded by zone)
│    BPM (Z3)         │  ← Zone indicator
│                     │
│   2.43 km   5:45    │  ← Distance | Pace
│   12:05     180 SPM │  ← Time    | Cadence
│                     │
│ "Great pace! Keep   │  ← AI Coaching Text (Yellow, Wrapped)
│ your cadence steady"│
│                     │
└─────────────────────┘
```

**Data Fields:**
1. **Heart Rate** (Top, Large)
   - Color-coded by zone:
     - Zone 1 (< 60%): Blue
     - Zone 2 (60-70%): Green
     - Zone 3 (70-80%): Yellow
     - Zone 4 (80-90%): Orange
     - Zone 5 (90%+): Red

2. **Distance** (Left, Medium) - e.g., "2.43 km"

3. **Pace** (Right, Medium) - e.g., "5:45" (min/km)

4. **Elapsed Time** (Bottom Left, Small) - e.g., "12:05"

5. **Cadence** (Bottom Right, Small) - e.g., "180 SPM"

6. **AI Coaching** (Bottom, Yellow)
   - Wrapped text
   - Vibrates when new message arrives

**Interactions:**
- **BACK button** → Pause run (shows confirmation)
- **MENU button** → Show run menu (Finish option)

---

## 🕹️ Simulator Controls

### On-Screen Buttons:
- **UP** - Scroll up / Menu up
- **DOWN** - Scroll down / Menu down
- **SELECT** (center) - Start / Confirm / Select
- **BACK** - Exit / Back / Pause
- **MENU** - Show menu options

### Keyboard Shortcuts:
- **↑** - UP button
- **↓** - DOWN button
- **Enter** - SELECT button
- **Esc** - BACK button
- **M** - MENU button

### Simulator Menu (Top Bar):
- **File** → Load different devices, reload app
- **Edit** → Simulator settings
- **View** → Toggle panels
- **Simulation** → Control simulation state
- **Help** → Documentation

---

## 🧪 Testing the App

### Test 1: Start Screen
1. Look at simulator - should see "AI Run Coach" title
2. Check status:
   - If "Ready to Start" (green) → ✅ Authenticated
   - If "Not Connected" (yellow) → ⚠️ Need to auth via phone app

### Test 2: Start a Run
1. Press **SELECT** button (center button or Enter key)
2. Should transition to Run View
3. Verify all data fields visible:
   - Heart rate displaying (simulated)
   - Distance showing 0.00 km
   - Pace showing --:--
   - Time showing 0:00
   - Cadence showing

### Test 3: Simulate GPS
In simulator menu bar:
1. Click **Simulation** → **Position**
2. Enter coordinates or use "Simulate movement"
3. Watch distance/pace update

### Test 4: Simulate Heart Rate
In simulator menu bar:
1. Click **Simulation** → **Heart Rate**
2. Adjust HR slider (e.g., 165 BPM)
3. Watch color change based on zone

### Test 5: Pause/Finish
1. During run, press **BACK** button
2. Should show "Pause run?" confirmation
3. Or press **MENU** → Select "Finish"

---

## 📊 Technical Details

### Data Streaming (Every Second)
The watch streams this data to backend:
- Heart rate + HR zone
- GPS location (lat/long/altitude)
- Speed & pace
- Cadence
- Elapsed time

### API Endpoints Used:
```
POST /api/garmin-companion/auth
POST /api/garmin-companion/session/start
POST /api/garmin-companion/data
POST /api/garmin-companion/session/end
```

### Storage:
- **Auth token** stored in persistent storage
- Used on every backend request
- Cleared when user logs out in phone app

---

## 🎯 What to Look For

### ✅ Good Design Elements:
1. **Large HR display** - Easy to read during run
2. **Color-coded zones** - Quick visual feedback
3. **Clean layout** - No clutter
4. **Smart text wrapping** - Coaching text always readable
5. **Clear hierarchy** - Most important info (HR) biggest

### 🔧 Areas to Improve:
1. **Font sizes** - Could HR be even larger?
2. **Coaching text position** - Is it too low? Hard to read?
3. **Colors** - Are zones intuitive?
4. **Data order** - Distance vs. Pace priority?
5. **Menu options** - Need more run controls?

---

## 🔄 Reloading the App

### After Making Changes:

**Rebuild:**
```bash
cd garmin-companion-app
monkeyc -o bin/AiRunCoach.prg -f monkey.jungle -y developer_key.der -d fenix7 -w
```

**Reload in Simulator:**
1. In simulator: **File** → **Reload App**
2. Or close simulator and rerun:
```bash
monkeydo bin/AiRunCoach.prg fenix7 --sim
```

---

## 📱 Testing Different Devices

### Load Different Watch Models:

**Fenix 7 (Round, Large):**
```bash
monkeydo bin/AiRunCoach.prg fenix7 --sim
```

**Forerunner 955 (Round, Medium):**
```bash
monkeydo bin/AiRunCoach.prg fr955 --sim
```

**Forerunner 265 (Round, AMOLED):**
```bash
monkeydo bin/AiRunCoach.prg fr265 --sim
```

**Vivoactive 5 (Round, Small):**
```bash
monkeydo bin/AiRunCoach.prg vivoactive5 --sim
```

Each device has different screen sizes - verify layout works on all!

---

## 🐛 Troubleshooting

### Simulator Not Showing
```bash
# Check if running
ps aux | grep connectiq

# If not, start it:
/Users/danieljohnston/Library/Application\ Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-8.4.0-2025-12-03-5122605dc/bin/connectiq &
```

### App Not Loading
```bash
# Verify .prg exists
ls -lh garmin-companion-app/bin/AiRunCoach.prg

# Rebuild if needed
cd garmin-companion-app
monkeyc -o bin/AiRunCoach.prg -f monkey.jungle -y developer_key.der -d fenix7 -w
```

### Black Screen
- App might have crashed
- Check simulator console for errors
- Look for red error messages

### No Heart Rate Data
- Normal in simulator
- Use **Simulation** → **Heart Rate** menu to set manually

### No GPS Data
- Normal in simulator
- Use **Simulation** → **Position** menu to set location

---

## 💡 Design Recommendations

Based on the current code, here are suggestions:

### 1. **Heart Rate Display**
**Current:** `FONT_NUMBER_HOT` (large numeric font)
**Suggestion:** Perfect! Very readable.

### 2. **Layout Hierarchy**
**Current Priority:**
1. Heart Rate (biggest)
2. Distance/Pace (medium)
3. Time/Cadence (small)
4. Coaching (tiny, bottom)

**Suggestion:** Consider making coaching text larger or animated?

### 3. **Color Scheme**
**Current:**
- Background: Black
- Primary text: White
- HR zones: Blue/Green/Yellow/Orange/Red
- Coaching: Yellow
- Secondary: Light Gray

**Suggestion:** Solid choices! Yellow coaching stands out.

### 4. **Text Wrapping**
**Current:** Smart word wrapping for coaching
**Suggestion:** Works well! Maybe add scrolling for long messages?

### 5. **Vibration Alerts**
**Current:** Vibrates when new coaching arrives
**Suggestion:** Great UX! Consider different patterns for different message types?

---

## 🎨 Design Files to Edit

### Change Layout:
```
garmin-companion-app/source/views/RunView.mc
- onUpdate() method (line 78-145)
```

### Change Colors:
```
garmin-companion-app/source/views/RunView.mc
- getHeartRateZoneColor() method (line 259-271)
```

### Change Start Screen:
```
garmin-companion-app/source/views/StartView.mc
- onUpdate() method (line 29-68)
```

### Change Fonts/Icons:
```
garmin-companion-app/resources/
- Add images to drawables/
- Edit layouts in layouts/layout.xml
```

---

## 📸 Screenshots

**Where to Take Screenshots:**
1. In simulator, click **Edit** → **Take Screenshot**
2. Or use Mac screenshot: `Cmd + Shift + 4`
3. Save to: `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/screenshots/garmin/`

**Needed for App Store:**
- Start screen
- Run screen (with data)
- Coaching message example
- Menu screen
- All 3-4 screenshots needed for Connect IQ submission

---

## ✅ Quick Checklist

**Design Review:**
- [ ] Start screen looks good
- [ ] Run screen layout readable
- [ ] Heart rate color-coded clearly
- [ ] Coaching text wraps properly
- [ ] All fonts appropriate sizes
- [ ] Colors work well on watch
- [ ] Test on multiple device sizes
- [ ] Menu options make sense
- [ ] Interactions intuitive
- [ ] No clutter or confusion

**Testing:**
- [ ] Start screen displays correctly
- [ ] Can press START to begin run
- [ ] Run screen shows all data fields
- [ ] Simulated HR updates display
- [ ] Simulated GPS updates distance
- [ ] Coaching text displays at bottom
- [ ] BACK button pauses run
- [ ] MENU button shows options
- [ ] Can finish run successfully
- [ ] No crashes or errors

---

## 🚀 Next Steps

**After Design Review:**

1. **Make changes** to source files
2. **Rebuild** the app
3. **Reload** in simulator
4. **Test** all interactions
5. **Take screenshots** for App Store
6. **Test on real device** (USB deployment)
7. **Submit to Connect IQ Store**

---

## 📞 Resources

**Connect IQ Documentation:**
- SDK Docs: https://developer.garmin.com/connect-iq/
- API Reference: https://developer.garmin.com/connect-iq/api-docs/
- Forum: https://forums.garmin.com/developer/

**Project Docs:**
- `garmin-companion-app/README.md` - Build instructions
- `GARMIN_COMPANION_COMPLETE.md` - Feature list
- `GARMIN_READY_TO_SUBMIT.md` - Submission guide

---

## ✨ Summary

**Simulator Status:**
- ✅ Running with Fenix 7 device
- ✅ AI Run Coach app loaded
- ✅ Ready for design review and testing

**App Features:**
- ✅ Clean, readable layout
- ✅ Color-coded heart rate zones
- ✅ All essential run metrics
- ✅ AI coaching text display
- ✅ Intuitive interactions

**You can now:**
1. View the design in the simulator
2. Test all interactions
3. Simulate HR and GPS data
4. Make design changes and reload
5. Take screenshots for App Store
6. Test on different device sizes

**Simulator is running and ready for your design review!** 🎉

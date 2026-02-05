# 🚀 Quick Start: Garmin Watch App

## ⚡ 3-Step Process to Connect IQ Store

### Step 1: Install SDK (5 minutes)

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
./install-garmin-sdk.sh
```

**Follow the prompts:**
1. Download SDK from: https://developer.garmin.com/connect-iq/sdk/
2. Script will install it to `/Developer/connectiq`
3. Restart terminal or run: `source ~/.zshrc`

**Verify:**
```bash
monkeyc --version
# Should show: Connect IQ Compiler X.X.X
```

---

### Step 2: Build & Test (10 minutes)

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
./build-watch-app.sh
```

**This will:**
- ✅ Generate developer key
- ✅ Build for 7+ device types
- ✅ Create universal `.prg` package
- ✅ Output to `garmin-companion-app/bin/`

**Test on simulator:**
```bash
connectiq
# Then:
# File → Load Device → fenix7
# File → Load App → garmin-companion-app/bin/AiRunCoach.prg
```

**Take screenshots for store submission!**

---

### Step 3: Submit to Store (30 minutes)

1. **Create developer account:**
   - Go to: https://developer.garmin.com/
   - Sign up (free)

2. **Create app listing:**
   - Go to: https://apps.garmin.com/developer/dashboard
   - Click "Add a new app"
   - Upload: `garmin-companion-app/bin/AiRunCoach.prg`

3. **Add details:**
   - Name: "AI Run Coach"
   - Category: Health & Fitness
   - Description: (see CONNECT_IQ_SUBMISSION_GUIDE.md)
   - Screenshots: 3-5 from simulator

4. **Submit for review:**
   - Review time: 3-5 business days
   - You'll get email when approved

**Full guide:** See `CONNECT_IQ_SUBMISSION_GUIDE.md`

---

## 📁 What's Included

Your watch app is **already built** and ready to compile! Here's what you have:

### Source Code (Monkey C)
```
garmin-companion-app/
├── source/
│   ├── AiRunCoachApp.mc          # Main app entry
│   ├── views/
│   │   ├── StartView.mc          # Pre-run screen
│   │   └── RunView.mc            # Active run screen
│   └── networking/
│       └── DataStreamer.mc       # Backend communication
├── resources/
│   ├── strings/strings.xml       # UI text
│   ├── layouts/layouts.xml       # UI layouts
│   └── menus/menus.xml          # Menu definitions
└── manifest.xml                  # App configuration
```

### Build Scripts
```
install-garmin-sdk.sh            # Installs Garmin SDK
build-watch-app.sh               # Builds watch app
```

### Documentation
```
CONNECT_IQ_SUBMISSION_GUIDE.md   # Full submission guide
QUICK_START_GARMIN.md            # This file
garmin-companion-app/README.md   # Technical details
```

---

## 🎯 Features Already Implemented

Your watch app includes:

✅ **Real-time data streaming:**
- Heart rate + HR zones (1-5)
- GPS location (lat/long/altitude)
- Pace & speed calculation
- Cadence tracking
- Distance & time

✅ **Backend integration:**
- Authentication with AI Run Coach backend
- Session start/stop
- Real-time data upload
- AI coaching text display

✅ **UI/UX:**
- Clean start screen
- Live run display with HR zones
- Pause/resume functionality
- Finish run menu

✅ **Multi-device support:**
- Fenix 6/7 series
- Forerunner 55/245/255/265/745/945/955/965
- Vivoactive 4/5
- Venu/Venu 2/Venu 3

---

## 🔧 Common Issues

### "monkeyc: command not found"
**Fix:**
```bash
source ~/.zshrc
# Or restart terminal
```

### "No such file or directory: /Developer/connectiq"
**Fix:**
```bash
./install-garmin-sdk.sh
```

### Build errors
**Fix:**
```bash
# Check SDK version
monkeyc --version

# Should be 3.2.0 or higher
# If not, re-run install-garmin-sdk.sh
```

### Simulator won't load app
**Fix:**
- Make sure you built successfully (`./build-watch-app.sh`)
- Check that `garmin-companion-app/bin/AiRunCoach.prg` exists
- Try loading a different device (fenix7, forerunner955)

---

## 📊 What Happens Next

### After Building:
1. ✅ You'll have `.prg` files in `garmin-companion-app/bin/`
2. ✅ Test on simulator to verify it works
3. ✅ Take screenshots for store submission

### After Submitting:
1. **Automated validation** (1-2 hours)
   - Garmin checks your package format
   - Verifies device compatibility

2. **Manual review** (3-5 business days)
   - Garmin staff test your app
   - Check for crashes, UI issues, battery drain

3. **Approved!** (Email notification)
   - App goes live in Connect IQ Store
   - You get a store URL
   - Users can install

4. **Update Android app:**
   - Add your store URL to `GarminCompanionPromptScreen.kt`
   - Users can click "Install on Watch" → goes to store

---

## 🎉 Summary

**Time to store submission: ~45 minutes of work**
- 5 min: Install SDK
- 10 min: Build & test
- 30 min: Submit

**Review time: 3-5 business days**

**Total: ~1 week from now to live in store!**

---

## 💡 Pro Tips

### Tip 1: Use Real Device Testing
If you have a Garmin watch:
1. Settings → System → About
2. Tap top number 5 times (enables developer mode)
3. Connect via USB
4. Run: `monkeydo bin/AiRunCoach.prg fenix7`

### Tip 2: Create Good Screenshots
- Show the app in action (not static mockups)
- Highlight key features (HR zones, coaching)
- Use different screens (start, run, summary)
- Minimum 3, maximum 8

### Tip 3: Write Clear Description
- Focus on benefits, not features
- Use bullet points
- Mention "AI coaching" prominently
- Mention "works with phone app"

### Tip 4: Respond to Review Feedback
If rejected:
- Garmin will tell you why
- Fix the issue
- Resubmit (faster review 2nd time)

---

## 📞 Need Help?

**Garmin Resources:**
- Forums: https://forums.garmin.com/developer/connect-iq/
- Docs: https://developer.garmin.com/connect-iq/
- Email: developer@garmin.com

**Your Documentation:**
- Full guide: `CONNECT_IQ_SUBMISSION_GUIDE.md`
- Technical docs: `garmin-companion-app/README.md`

---

## ✅ Checklist

**Before you start:**
- [ ] macOS with Homebrew installed
- [ ] OpenSSL installed (usually default on macOS)
- [ ] Internet connection

**Installation:**
- [ ] Run `./install-garmin-sdk.sh`
- [ ] Verify with `monkeyc --version`
- [ ] Restart terminal

**Build:**
- [ ] Run `./build-watch-app.sh`
- [ ] Check `garmin-companion-app/bin/` for `.prg` files
- [ ] Verify universal package exists

**Test:**
- [ ] Run `connectiq` to start simulator
- [ ] Load fenix7 device
- [ ] Load `AiRunCoach.prg`
- [ ] Test start/pause/finish flow
- [ ] Take 3-5 screenshots

**Submit:**
- [ ] Create Garmin developer account
- [ ] Create app listing
- [ ] Upload `.prg` file
- [ ] Upload screenshots
- [ ] Add description
- [ ] Submit for review

**After approval:**
- [ ] Get store URL
- [ ] Update Android app with URL
- [ ] Test end-to-end flow

---

**Ready to go? Start with: `./install-garmin-sdk.sh`**

**Questions? Check the full guide: `CONNECT_IQ_SUBMISSION_GUIDE.md`**

🚀 Let's get your watch app in the Connect IQ Store!

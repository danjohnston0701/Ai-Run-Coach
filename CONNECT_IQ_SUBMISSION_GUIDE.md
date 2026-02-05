# 🏪 Connect IQ Store Submission Guide

## 📋 Pre-Submission Checklist

Before submitting your watch app to the Connect IQ Store, ensure you have:

- [x] ✅ Built the watch app successfully (`./build-watch-app.sh`)
- [ ] ⚠️ Tested on simulator (see below)
- [ ] ⚠️ Tested on real device (optional but recommended)
- [ ] ⚠️ Created 3-5 screenshots
- [ ] ⚠️ Created app icon (144x144 PNG)
- [ ] ⚠️ Prepared app description
- [ ] ⚠️ Created Garmin developer account

---

## 🎮 Step 1: Test on Simulator (REQUIRED)

### 1.1 Launch Connect IQ Simulator

```bash
# Start the simulator
connectiq
```

This will open the Connect IQ simulator application.

### 1.2 Load a Device

In the simulator:
1. Click **File** → **Load Device**
2. Choose a device (recommended: **fenix7** or **forerunner955**)
3. Wait for device to load

### 1.3 Load Your App

1. Click **File** → **Load App**
2. Navigate to: `garmin-companion-app/bin/AiRunCoach.prg`
3. Click **Open**

### 1.4 Test the App

**Initial Load:**
- ✅ App should display "AI Run Coach" title
- ✅ Should show "Ready to Start" or "Not Connected"

**Start Run (Click SELECT button):**
- ✅ Should transition to run view
- ✅ Should show heart rate zones (simulated)
- ✅ Should display distance/pace/time

**Menu (Click MENU button):**
- ✅ Should show "Finish Run" option

**Finish Run:**
- ✅ Should save activity
- ✅ Should return to start screen

### 1.5 Take Screenshots

While the app is running in the simulator:
1. Click **Edit** → **Capture Screenshot**
2. Save as PNG
3. Take 3-5 different screenshots showing:
   - Start screen
   - Active run view
   - Heart rate zones display
   - Coaching text (if visible)
   - Summary screen

**Required:** Minimum 3 screenshots, maximum 8

---

## 🎨 Step 2: Create App Assets

### 2.1 App Icon (Required)

**Specifications:**
- Size: **144x144 pixels**
- Format: PNG
- Background: Solid color or gradient
- No transparency

**Design Tips:**
- Use your app's main color (looks like blue/teal based on your brand)
- Include a simple running icon or "AI" symbol
- Keep it legible at small sizes

**Quick creation:**
```bash
# Use macOS Preview, Figma, Canva, or any design tool
# Save as: garmin-companion-app/resources/launcher_icon.png
```

### 2.2 Screenshots (3-5 required)

You already captured these from the simulator. Make sure they show:
1. **Start screen** - Shows app name and "Ready to Start"
2. **Active run** - Shows HR, pace, distance
3. **HR zones** - Shows heart rate zone display
4. **Coaching** (optional) - Shows AI coaching text
5. **Summary** (optional) - Post-run summary

---

## 🔐 Step 3: Create Garmin Developer Account

### 3.1 Register

1. Go to: **https://developer.garmin.com/**
2. Click **Sign In** → **Create Account**
3. Fill in:
   - Email
   - Password
   - Developer information
4. Verify your email

### 3.2 Accept Developer Agreement

1. Log in to developer portal
2. Go to: **https://apps.garmin.com/developer/**
3. Read and accept the Connect IQ Developer Agreement

---

## 📝 Step 4: Create App Listing

### 4.1 Go to Developer Dashboard

1. Visit: **https://apps.garmin.com/developer/dashboard**
2. Click **"Add a new app"**

### 4.2 Basic Information

**App Name:**
```
AI Run Coach
```

**App Type:**
```
Watch App
```

**Category:**
```
Health & Fitness
```

**Short Description (140 characters):**
```
Get real-time AI coaching during your runs with personalized feedback based on heart rate, pace, and running dynamics.
```

**Long Description (1000 characters):**
```
AI Run Coach brings the power of artificial intelligence to your Garmin watch! Get personalized, real-time coaching during your runs.

🏃 REAL-TIME AI COACHING
• Personalized feedback based on your heart rate zones
• Pace guidance and motivation throughout your run
• Running form analysis with cadence metrics

💓 COMPREHENSIVE DATA STREAMING
• Heart rate monitoring with zones (1-5)
• GPS location and elevation tracking
• Cadence, stride length, and running dynamics
• Running power (on compatible devices)

📱 SEAMLESS PHONE INTEGRATION
• Connects to AI Run Coach mobile app
• Watch data streams to your phone's live map
• All coaching delivered right to your wrist

⚡ ADVANCED FEATURES
• Audio and text coaching on your watch
• Automatic session syncing
• Post-run AI analysis
• Zone-based training guidance

Compatible with Forerunner, Fenix, Venu, and Vivoactive series watches.

Requires AI Run Coach account (free to create in mobile app).
```

### 4.3 App Details

**Version:**
```
1.0.0
```

**Min SDK Version:**
```
3.2.0
```

**Languages:**
```
English
```

**Permissions Required:**
- ✅ Positioning (GPS)
- ✅ Sensor (Heart Rate, Cadence)
- ✅ Sensor History
- ✅ Communications (Data streaming)
- ✅ Persisted Content (Save settings)

### 4.4 Supported Devices

Select all devices listed in your `manifest.xml`:
- Fenix 6, 6 Pro, 6S, 6S Pro, 6X Pro
- Fenix 7, 7S, 7X, 7 Pro, 7S Pro, 7X Pro
- Forerunner 55, 245, 255, 265, 745, 945, 955, 965
- Vivoactive 4, 5
- Venu, Venu 2, Venu 2 Plus, Venu 3

---

## 📤 Step 5: Upload App Package

### 5.1 Upload .prg File

1. In the app listing, find **"Upload App Package"**
2. Click **"Choose File"**
3. Select: `garmin-companion-app/bin/AiRunCoach.prg`
4. Click **"Upload"**

**Wait for validation:** Garmin will verify your app package (takes 1-2 minutes).

### 5.2 Upload Screenshots

1. Click **"Add Screenshot"**
2. Upload your 3-5 screenshots from Step 2
3. Add captions for each (optional but recommended):
   - "Start your run with AI guidance"
   - "Real-time heart rate zones"
   - "Live pace and distance tracking"
   - "AI coaching on your wrist"

### 5.3 Upload App Icon

1. Click **"Upload App Icon"**
2. Select your 144x144 PNG icon
3. Preview to ensure it looks good

---

## 🧪 Step 6: App Testing (Garmin's Internal Review)

### 6.1 What Garmin Tests

Garmin will test your app for:
- ✅ **Stability** - No crashes or freezes
- ✅ **UI** - Proper layout on all devices
- ✅ **Permissions** - Only uses declared permissions
- ✅ **Battery** - Reasonable power consumption
- ✅ **Memory** - Doesn't exceed device limits

### 6.2 Common Rejection Reasons

**Avoid these issues:**
- ❌ App crashes on startup
- ❌ Excessive battery drain
- ❌ UI elements overlap or cut off
- ❌ Memory leaks
- ❌ Missing required screenshots
- ❌ Poor/misleading description

---

## ✅ Step 7: Submit for Review

### 7.1 Final Check

Before submitting, verify:
- [ ] App package uploaded
- [ ] All screenshots uploaded (3-5)
- [ ] App icon uploaded
- [ ] Description complete
- [ ] Supported devices selected
- [ ] Permissions declared

### 7.2 Submit

1. Click **"Submit for Review"**
2. Review your submission
3. Click **"Confirm Submission"**

---

## ⏱️ Review Timeline

| Stage | Duration | Status |
|-------|----------|--------|
| **Submission** | Instant | ✅ |
| **Automated Checks** | 1-2 hours | 🤖 |
| **Manual Review** | 3-5 business days | 👤 |
| **Published** | Instant | 🎉 |

**Total time: 3-5 business days**

### During Review

You'll receive emails at each stage:
1. ✅ **Submission Received** - Instant
2. 🔍 **In Review** - Within 24 hours
3. ✅ **Approved** - 3-5 days
   **OR**
4. ❌ **Rejected** - 3-5 days (with reasons)

---

## 🎉 Step 8: After Approval

### 8.1 Your App is Live!

Once approved:
- ✅ App appears in Connect IQ Store
- ✅ Users can search and install
- ✅ App has unique store URL

### 8.2 Get Your App ID

1. Go to your developer dashboard
2. Find your app listing
3. Copy the **App ID** (format: `abc123def456`)
4. Copy the **Store URL** (e.g., `https://apps.garmin.com/en-US/apps/YOUR_APP_ID`)

### 8.3 Update Android App

**Important:** Update the Connect IQ Store link in your Android app.

Edit: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GarminCompanionPromptScreen.kt`

Find line ~195 and update:
```kotlin
val connectIQUrl = "https://apps.garmin.com/en-US/apps/YOUR_ACTUAL_APP_ID"
```

---

## 📊 Post-Launch

### Monitor Your App

**Developer Dashboard:**
- View download count
- Check user ratings/reviews
- Monitor crash reports
- See device distribution

**Common Metrics:**
- Downloads per day
- Active users
- Average rating
- Device compatibility

### Respond to Reviews

- Thank users for positive reviews
- Address issues in negative reviews
- Use feedback for future updates

---

## 🔄 Updating Your App

### For Future Updates:

1. Increment version in `manifest.xml`:
   ```xml
   version="1.0.1"
   ```

2. Rebuild:
   ```bash
   ./build-watch-app.sh
   ```

3. Upload new `.prg` to existing app listing

4. Add changelog describing changes

5. Submit new version for review (1-2 days)

---

## 🆘 Troubleshooting

### Build Issues

**"monkeyc: command not found"**
- Run: `source ~/.zshrc`
- Or restart terminal

**"Invalid developer key"**
- Delete `developer_key.der`
- Run `./build-watch-app.sh` again

### Submission Issues

**"App package invalid"**
- Ensure you built with `-w` flag (warnings as errors)
- Check manifest.xml for errors
- Verify all required resources exist

**"Screenshot doesn't meet requirements"**
- Must be PNG format
- Minimum 3 screenshots required
- Should show actual app UI (not mockups)

**"App ID already exists"**
- Each app needs unique ID
- Update manifest.xml with your assigned ID

---

## 📚 Resources

**Garmin Developer Portal:**
- SDK Download: https://developer.garmin.com/connect-iq/sdk/
- API Docs: https://developer.garmin.com/connect-iq/api-docs/
- Sample Apps: https://github.com/garmin/connectiq-samples

**Connect IQ Store:**
- Developer Dashboard: https://apps.garmin.com/developer/
- Store Guidelines: https://developer.garmin.com/connect-iq/connect-iq-basics/app-guidelines/

**Support:**
- Forums: https://forums.garmin.com/developer/connect-iq/
- Email: developer@garmin.com

---

## 🎯 Quick Reference Commands

**Build app:**
```bash
./build-watch-app.sh
```

**Test on simulator:**
```bash
connectiq
# Then load device and app via File menu
```

**Test on real device:**
```bash
# Enable developer mode on watch first!
monkeydo bin/AiRunCoach.prg fenix7
```

**Check SDK version:**
```bash
monkeyc --version
```

---

## ✅ Current Status

Based on what we've completed:

- [x] ✅ Watch app code complete
- [x] ✅ Build scripts created
- [x] ✅ Developer key generation automated
- [x] ✅ Multi-device build support
- [ ] ⏳ SDK installation (run `./install-garmin-sdk.sh`)
- [ ] ⏳ Build app (run `./build-watch-app.sh`)
- [ ] ⏳ Test on simulator
- [ ] ⏳ Create app listing
- [ ] ⏳ Submit for review

---

**Ready to submit? Follow this guide step-by-step!**

**Questions? Check the Resources section or reach out to Garmin developer support.**

Good luck with your submission! 🚀

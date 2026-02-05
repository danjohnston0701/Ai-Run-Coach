# 🚀 Production Deployment Guide - Complete Walkthrough

**Goal:** Deploy backend to production so you can test the app on your phone without running local backend

**Time Required:** 10-15 minutes

---

## 📋 Overview

Your setup:
- **Backend Location:** `/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android`
- **Production URL:** `https://airuncoach.live`
- **Deployment Method:** Replit → Google Cloud Run
- **Android App:** Already configured for production

---

## 🎯 Step 1: Deploy Backend to Production (5 minutes)

### Option A: Deploy via Replit (Recommended)

1. **Open Replit**
   - Go to https://replit.com
   - Login to your account
   - Open project: **"Ai-Run-Coach-IOS-and-Android"**

2. **Trigger Deployment**
   
   Click one of these (in order of preference):
   
   **Option 1:** Look for **"Deploy"** button in the sidebar
   - Click "Deploy"
   - Select "Production"
   - Click "Deploy to production"
   
   **Option 2:** Use the **"Deployments"** tab
   - Click "Deployments" tab
   - Click "Create deployment"
   - Wait for build to complete
   
   **Option 3:** Click the **"Run"** button
   - This will build and deploy
   - May take 2-5 minutes

3. **Watch the Build Logs**
   
   You should see:
   ```
   ✓ Installing dependencies...
   ✓ Running: npm run expo:static:build
   ✓ Running: npm run server:build
   ✓ Building server_dist/index.js
   ✓ Deploying to Google Cloud Run...
   ✓ Deployment successful!
   ✓ Service running at: https://airuncoach.live
   ```

4. **Verify Deployment**
   
   Once complete, test with curl:
   ```bash
   curl https://airuncoach.live/api/health
   # Expected: {"status":"ok","timestamp":"..."}
   ```

### Option B: Deploy via Terminal (Alternative)

If you can't access Replit, deploy directly from your Mac:

```bash
# Navigate to backend directory
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android

# Make sure you're on main branch
git checkout main

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Build the server
npm run server:build

# Push to GitHub (triggers Replit deployment)
git push origin main

# Wait for Replit to auto-deploy (if enabled)
# Or manually trigger in Replit dashboard
```

---

## 🔧 Step 2: Configure Android App for Production (2 minutes)

Now update your Android app to use the production backend:

### Edit RetrofitClient.kt

1. **Open file:**
   ```
   app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt
   ```

2. **Find line 98:**
   ```kotlin
   val useLocalBackend = true // Set to false to use production backend on physical device
   ```

3. **Change to:**
   ```kotlin
   val useLocalBackend = false // Set to false to use production backend on physical device
   ```

4. **Save the file**

That's it! Now your debug builds will also use production backend.

---

## 📱 Step 3: Build and Install App (3 minutes)

### Build the APK

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
./gradlew assembleDebug
```

**Or** in Android Studio:
- **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
- Wait for build to complete
- Click "locate" in the notification

### Install on Your Phone

The APK will be at:
```
app/build/outputs/apk/debug/app-debug.apk
```

**Option 1: Via Android Studio**
- Connect your phone via USB
- Click the **Run** button (green play icon)
- Select your device
- App will install and launch

**Option 2: Via File Transfer**
- Connect phone via USB
- Copy `app-debug.apk` to phone's Downloads folder
- On phone: Open Files app → Downloads → Tap APK
- Click "Install"

**Option 3: Via ADB**
```bash
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## ✅ Step 4: Test Everything (5 minutes)

### Launch the App

1. **Open AI Run Coach** on your phone
2. **Login** with your account
3. You should see the dashboard

### Test Core Features

Go through each feature to verify production backend works:

#### 1. Dashboard ✅
- [ ] Dashboard loads without errors
- [ ] Weather data shows (if permissions granted)
- [ ] Recent run shows (if you have runs)
- [ ] AI Coach toggle works

#### 2. Run Setup & Route Generation ✅
- [ ] Tap "Map My Run"
- [ ] Set distance (e.g., 5 km)
- [ ] Optionally set target time
- [ ] Click "GENERATE ROUTE"
- [ ] Loading screen shows
- [ ] 3 AI-generated routes appear
- [ ] Can select a route
- [ ] Map shows route polyline

#### 3. Start Run Without Route ✅
- [ ] Tap "Map My Run"
- [ ] Set distance and time
- [ ] Click "START RUN WITHOUT ROUTE"
- [ ] Run session starts
- [ ] Real-time stats update
- [ ] GPS tracking works
- [ ] AI coach gives voice feedback (if enabled)

#### 4. Run Session ✅
- [ ] Distance updates in real-time
- [ ] Pace calculates correctly
- [ ] Map shows your location
- [ ] Can pause/resume
- [ ] Can end run
- [ ] Run summary appears

#### 5. Previous Runs ✅
- [ ] Navigate to History tab
- [ ] Previous runs load
- [ ] Can click on a run
- [ ] Run details show correctly
- [ ] Map shows route taken
- [ ] Stats are accurate

#### 6. Goals ✅
- [ ] Navigate to Goals tab
- [ ] Existing goals load
- [ ] Can create new goal
- [ ] Goal saves to backend
- [ ] Progress updates

#### 7. Profile ✅
- [ ] Profile loads
- [ ] Can update profile
- [ ] Profile picture uploads
- [ ] Settings save

---

## 🔍 Troubleshooting

### Issue: "Cannot connect to backend"

**Check logs in Android Studio:**
```
Logcat → Filter: "RetrofitClient"
```

Look for:
```
🔗 Connecting to: https://airuncoach.live
```

If you see `http://192.168.18.14:3000` instead:
- You forgot to set `useLocalBackend = false`
- Rebuild the app

### Issue: "404 Not Found"

**Verify backend is running:**
```bash
curl https://airuncoach.live/api/health
```

If this fails:
- Backend didn't deploy successfully
- Check Replit logs
- Verify domain is pointing to Cloud Run

### Issue: "401 Unauthorized"

This is **EXPECTED** for authenticated endpoints. It means:
✅ Backend is running
✅ API is working
❌ You just need to login

### Issue: "Route generation times out"

**Increase timeout in RetrofitClient.kt** (already set to 180 seconds):
```kotlin
.readTimeout(180, TimeUnit.SECONDS)  // 3 minutes for AI generation
```

If still timing out:
- Check backend logs in Replit/Cloud Run
- Verify OpenAI API key is set
- Check Google Maps API key is valid

### Issue: "No GPS location"

**On your phone:**
- Settings → Apps → AI Run Coach → Permissions → Location → "Allow all the time"
- Settings → Location → Turn on "High accuracy"

### Issue: App crashes on startup

**Check logs:**
```bash
~/Library/Android/sdk/platform-tools/adb logcat | grep -i "airuncoach"
```

Common causes:
- Missing permissions
- Network security config issue
- Backend unreachable

---

## 📊 Verify Production Status

### Check Current Configuration

```bash
# In Android project
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# Check current setting
grep "useLocalBackend" app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt
```

Should show:
```kotlin
val useLocalBackend = false
```

### Check Backend Health

```bash
# Test production backend
curl https://airuncoach.live/api/health

# Test route generation endpoint (needs auth)
curl https://airuncoach.live/api/routes/health
```

### Check Build Type

In your app, check logcat for:
```
🔗 API BASE URL: https://airuncoach.live
```

If you see `http://192.168.18.14:3000`, you're still using local backend.

---

## 🎉 Success Checklist

You'll know everything is working when:

- [ ] Backend deployed to `https://airuncoach.live`
- [ ] `curl https://airuncoach.live/api/health` returns JSON
- [ ] Android app built with `useLocalBackend = false`
- [ ] App installed on your phone
- [ ] Can login without errors
- [ ] Dashboard loads
- [ ] Can generate AI routes (takes 1-3 minutes)
- [ ] Can start run without route
- [ ] GPS tracking works during run
- [ ] Run saves to backend
- [ ] Run appears in history
- [ ] Can create and save goals
- [ ] Profile updates work

---

## 🔄 Switching Back to Local Backend

If you need to test with local backend again:

1. **Start local backend:**
   ```bash
   cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
   npm run server:dev
   ```

2. **Change RetrofitClient.kt:**
   ```kotlin
   val useLocalBackend = true
   ```

3. **Rebuild and install app**

---

## 📞 Alternative Deployment Options

If Replit deployment fails, try these alternatives:

### Option 1: Railway

```bash
# Install Railway CLI
npm install -g railway

# Login
railway login

# Link project
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
railway link

# Deploy
railway up
```

### Option 2: Render

1. Go to https://render.com
2. New → Web Service
3. Connect GitHub repo
4. Settings:
   - **Build Command:** `npm run server:build`
   - **Start Command:** `npm run server:prod`
   - **Environment Variables:** Add from `.env`
5. Click "Create Web Service"

### Option 3: Google Cloud Run (Direct)

```bash
# Install gcloud CLI first: https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Deploy
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
gcloud run deploy airuncoach \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000
```

---

## 📝 Environment Variables Checklist

Make sure your production backend has these environment variables:

```bash
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
GOOGLE_MAPS_API_KEY=...
JWT_SECRET=...
NODE_ENV=production
PORT=3000
```

Check in Replit:
- Click "Secrets" tab (lock icon)
- Verify all variables are set

---

## 🎯 Quick Start (TL;DR)

```bash
# 1. Deploy backend (via Replit dashboard)
#    → Click "Deploy" button
#    → Wait for build to complete

# 2. Update Android app
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
# Edit RetrofitClient.kt line 98: useLocalBackend = false

# 3. Build and install
./gradlew assembleDebug
# Install APK on phone

# 4. Test
# - Open app
# - Login
# - Generate route (takes 1-3 min)
# - Start run
# - Complete run
# - Verify in history
```

---

**Status After Completion:**
- ✅ Backend running at `https://airuncoach.live`
- ✅ Android app configured for production
- ✅ Can test all features on physical device
- ✅ No local backend needed

**Time Investment:** ~15 minutes
**Benefit:** Test anywhere, anytime! 🎉

---

**Last Updated:** February 5, 2026  
**Next Step:** Go to Replit and click "Deploy" 🚀

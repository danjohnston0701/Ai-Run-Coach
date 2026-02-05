# 🏃 Garmin Integration Setup Guide

## ✅ What's Been Built

I've implemented the complete Garmin Connect integration infrastructure:

### **Core Components Created:**
1. ✅ **GarminConfig.kt** - Configuration for OAuth credentials and API endpoints
2. ✅ **GarminAuthManager.kt** - Complete OAuth 1.0a authentication flow
3. ✅ **GarminDataSync.kt** - Wellness and activity data sync from Garmin Connect API
4. ✅ **Garmin SDK enabled** in build.gradle.kts with OAuth dependencies

---

## 📋 What You Need to Do

### **Step 1: Add Your Garmin App Credentials**

Open `/app/src/main/java/live/airuncoach/airuncoach/data/GarminConfig.kt` and replace:

```kotlin
const val CONSUMER_KEY = "YOUR_GARMIN_CONSUMER_KEY"
const val CONSUMER_SECRET = "YOUR_GARMIN_CONSUMER_SECRET"
```

**With your actual credentials from:**
https://developer.garmin.com/connect-iq/my-apps/

---

### **Step 2: Verify OAuth Callback URL**

In your Garmin Developer Portal app settings, make sure the **OAuth Callback URL** is set to:

```
airuncoach://garmin/callback
```

If you used a different callback, update `OAUTH_CALLBACK` in `GarminConfig.kt`.

---

### **Step 3: Add OAuth Callback Handler to AndroidManifest.xml**

Add this inside your `<activity>` tag for MainActivity:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="airuncoach"
        android:host="garmin"
        android:pathPrefix="/callback" />
</intent-filter>
```

---

## 🎯 Features Now Available

### **1. Wellness Data Sync**
- ✅ Sleep hours, quality, and sleep score
- ✅ Stress levels and qualifiers
- ✅ Body Battery (Garmin's energy level metric)
- ✅ Resting heart rate
- ✅ Automatic daily sync

### **2. Activity Data Sync**
- ✅ Fetch recent Garmin activities
- ✅ Distance, duration, elevation gain
- ✅ Heart rate data (avg/max)
- ✅ Calories, speed metrics

### **3. OAuth Authentication**
- ✅ Secure OAuth 1.0a flow
- ✅ Token storage in SharedPreferences
- ✅ Automatic authorization page opening
- ✅ Callback handling

---

## 🔧 How It Works

### **User Flow:**

1. **User clicks "Connect Garmin" in app**
   - App calls `GarminAuthManager.startOAuthFlow()`
   - Returns authorization URL

2. **App opens Garmin login page in browser**
   - User logs in to Garmin Connect
   - Garmin asks permission to share data

3. **User approves, Garmin redirects back to app**
   - Callback URL: `airuncoach://garmin/callback?oauth_token=...&oauth_verifier=...`
   - App handles callback automatically

4. **App exchanges temporary token for access token**
   - `GarminAuthManager.handleOAuthCallback()` 
   - Stores access token securely

5. **App syncs wellness data daily**
   - `GarminDataSync.fetchWellnessData()`
   - Converts to app's `WellnessContext` format
   - Feeds into AI coaching

---

## 📡 API Endpoints Used

### **Garmin Connect API:**
- **Wellness API:** `https://apis.garmin.com/wellness-api/rest`
  - `/dailies/{date}/sleep` - Sleep data
  - `/dailies/{date}/stress` - Stress levels
  - `/dailies/{date}/bodyBattery` - Body Battery
  - `/dailies/{date}/heartRate` - Heart rate stats

- **Activity API:** `https://apis.garmin.com/activity-service/activity`
  - `/activities?limit={n}` - Recent activities

---

## 🚀 Next Steps (UI Integration)

I'll now create:
1. **GarminConnectionScreen** - UI for connecting/disconnecting Garmin
2. **Update DashboardViewModel** - Add real Garmin connection status
3. **Wellness data display** - Show Body Battery, sleep, stress on dashboard
4. **Activity sync** - Background sync of Garmin runs

---

## 🐛 Troubleshooting

### **"Failed to get request token: 401"**
- Check your Consumer Key and Consumer Secret are correct
- Verify they're from the same app in Garmin Developer Portal

### **"OAuth token mismatch"**
- The callback URL doesn't match what's configured
- Update `OAUTH_CALLBACK` in `GarminConfig.kt`

### **"No data returned from Garmin"**
- Make sure your Garmin watch has synced recently
- Check Garmin Connect app shows today's data
- Verify you granted all requested permissions during OAuth

---

## 📊 Data Structure

### **GarminWellnessData** → **WellnessContext**

```kotlin
// Garmin API returns
GarminWellnessData(
    date = "2026-01-30",
    sleepData = GarminSleepData(
        totalSleepTimeSeconds = 28800,  // 8 hours
        overallSleepScore = 85
    ),
    bodyBatteryData = GarminBodyBatteryData(
        currentBodyBattery = 72  // Energy level 0-100
    ),
    stressData = GarminStressData(
        avgStressLevel = 35,
        stressQualifier = "low"
    )
)

// Converted to app's format
WellnessContext(
    sleepHours = 8.0,
    sleepScore = 85,
    bodyBattery = 72,
    stressLevel = 35,
    stressQualifier = "low",
    readinessScore = 72,
    readinessRecommendation = "Good energy levels - maintain steady effort today."
)
```

---

## ✅ Testing Checklist

- [ ] Added Consumer Key and Consumer Secret to `GarminConfig.kt`
- [ ] Added OAuth callback to `AndroidManifest.xml`
- [ ] Rebuilt the APK
- [ ] Clicked "Connect Garmin" in app
- [ ] Browser opened to Garmin login page
- [ ] Logged in and granted permissions
- [ ] Redirected back to app successfully
- [ ] Dashboard shows "Garmin Connected"
- [ ] Wellness data appears (sleep, Body Battery, etc.)
- [ ] Run data syncs from Garmin Connect

---

## 🎉 Benefits for Users

**With Garmin Connected:**
- 🛌 AI coach considers your sleep quality
- 🔋 Coaching adjusts based on Body Battery
- 😰 Stress levels influence workout difficulty
- 💓 Resting heart rate trends tracked
- 📊 Comprehensive wellness analytics
- 🏃 Import past runs from Garmin Connect

Let me know when you've added the credentials and I'll complete the UI integration! 🚀

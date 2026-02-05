# 🔐 Garmin OAuth with HTTPS Callback - Complete Setup

## ✅ The Solution: Backend Bridge Pattern

Since Garmin requires **HTTPS callbacks** (not custom URL schemes), we use your **backend as a bridge**:

```
User → App → Garmin → Backend Callback → Mobile Deep Link → App
```

---

## 📋 What You Need to Configure

### **1. Garmin Developer Portal Settings**

Go to: https://developer.garmin.com/connect-iq/my-apps/

**OAuth Callback URL:**
```
https://airuncoach.live/garmin/callback
```

---

### **2. Backend Environment Variables**

Add to `/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android/.env`:

```bash
GARMIN_CONSUMER_KEY="your_actual_consumer_key_here"
GARMIN_CONSUMER_SECRET="your_actual_consumer_secret_here"
```

**Replace with your actual credentials from Garmin Developer Portal.**

---

### **3. Android App Configuration**

Already done! The app is configured to use:
- **OAuth Callback (for Garmin):** `https://airuncoach.live/garmin/callback`
- **Deep Link (for app):** `airuncoach://garmin/auth-complete`

File: `/app/src/main/java/live/airuncoach/airuncoach/data/GarminConfig.kt`

---

## 🔄 Complete OAuth Flow

### **Step-by-Step:**

1. **User taps "Connect Garmin" in app**
   - App calls `GarminAuthManager.startOAuthFlow()`
   - Returns: `https://connect.garmin.com/oauthConfirm?oauth_token=...`

2. **App opens Garmin login page in browser**
   - User logs in to Garmin Connect
   - User authorizes data sharing

3. **Garmin redirects to backend**
   - URL: `https://airuncoach.live/garmin/callback?oauth_token=ABC&oauth_verifier=XYZ`
   - **Backend receives the callback** (NOT the mobile app!)

4. **Backend exchanges token**
   - Backend calls Garmin API
   - Exchanges `oauth_verifier` for `access_token`
   - Stores token temporarily (5 minutes)
   - Generates temp token ID: `tempToken123`

5. **Backend redirects to mobile deep link**
   - URL: `airuncoach://garmin/auth-complete?success=true&token=tempToken123`
   - **This opens your mobile app!**

6. **App retrieves access token**
   - App calls: `GET https://airuncoach.live/api/garmin/token/tempToken123`
   - Backend returns: `{"accessToken": "...", "accessTokenSecret": "..."}`
   - App stores tokens securely

7. **✅ Garmin Connected!**

---

## 🗂️ Files Modified/Created

### **Backend (Node.js):**
```
server/
├── garmin-oauth-bridge.ts (NEW) - OAuth callback handler
├── routes.ts (MODIFIED) - Registered Garmin router
└── .env (MODIFIED) - Added Garmin credentials
```

### **Android App:**
```
app/src/main/java/live/airuncoach/airuncoach/
├── data/
│   ├── GarminConfig.kt (MODIFIED) - Changed callback to HTTPS
│   └── GarminAuthManager.kt (MODIFIED) - Added fetchStoredToken()
├── MainActivity.kt (MODIFIED) - Updated callback handler
└── AndroidManifest.xml (MODIFIED) - Changed deep link path
```

---

## 🚀 Testing Steps

### **1. Start Backend Server**

```bash
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
npm run server:dev
```

**Verify it's running:**
- Server should be on port 3000
- Check logs for "Server listening"

### **2. Test Backend Endpoint**

```bash
# Test the callback endpoint exists
curl http://localhost:3000/garmin/callback
# Should return: redirect to airuncoach://garmin/auth-complete?success=false&error=missing_params
```

### **3. Build Android APK**

```bash
# In Android Studio:
Build → Clean Project
Build → Rebuild Project  
Build → Build APK(s)
```

### **4. Test OAuth Flow**

1. Install APK on your phone
2. Make sure phone and Mac are on same WiFi
3. Open app → Settings → Connect Garmin
4. Browser opens to Garmin login
5. Log in and authorize
6. **Garmin redirects to your backend**
7. **Backend redirects to app**
8. App should show "Garmin Connected"

---

## 🐛 Troubleshooting

### **Issue: "Can't reach https://airuncoach.live"**

**Problem:** Backend server isn't accessible from the internet  
**Solution:** For testing, use ngrok to expose your local backend:

```bash
# Install ngrok (if not installed)
brew install ngrok

# Expose port 3000
ngrok http 3000

# Use the HTTPS URL ngrok provides
# Example: https://abc123.ngrok.io
```

Then update:
1. **Garmin Developer Portal:** Callback = `https://abc123.ngrok.io/garmin/callback`
2. **GarminAuthManager.kt:** Line 270 = `https://abc123.ngrok.io/api/garmin/token/$tempToken`

---

### **Issue: "Failed to fetch token"**

**Problem:** Backend can't exchange OAuth token  
**Solutions:**
- Check `GARMIN_CONSUMER_KEY` and `GARMIN_CONSUMER_SECRET` are correct in `.env`
- Check backend logs for OAuth errors
- Verify Garmin Developer Portal has correct callback URL

---

### **Issue: App doesn't open after authorization**

**Problem:** Deep link not working  
**Solutions:**
- Check AndroidManifest.xml has `airuncoach://garmin/auth-complete` intent filter
- Rebuild APK after any manifest changes
- Check device logs: `adb logcat | grep "airuncoach"`

---

## 📊 API Endpoints

### **Backend Endpoints (Node.js):**

```
GET /garmin/callback
  ↳ Receives OAuth callback from Garmin
  ↳ Exchanges for access token
  ↳ Redirects to: airuncoach://garmin/auth-complete?success=true&token={id}

GET /api/garmin/token/:tempTokenId
  ↳ Returns stored access token
  ↳ Response: {"accessToken": "...", "accessTokenSecret": "..."}
  ↳ Token deleted after retrieval (one-time use)
```

---

## ✅ Checklist

Before testing, ensure:

**Garmin Developer Portal:**
- [ ] OAuth Callback URL set to: `https://airuncoach.live/garmin/callback`
- [ ] All API scopes enabled (Activities, Wellness, Sleep, etc.)

**Backend:**
- [ ] `GARMIN_CONSUMER_KEY` added to `.env`
- [ ] `GARMIN_CONSUMER_SECRET` added to `.env`
- [ ] Backend server running (`npm run server:dev`)
- [ ] `/garmin/callback` endpoint accessible

**Android App:**
- [ ] APK rebuilt after changes
- [ ] Installed on phone
- [ ] Phone can reach backend (same WiFi or ngrok)

---

## 🎉 What Happens After Connection

Once connected, the app will:
- ✅ Sync wellness data daily (sleep, Body Battery, stress)
- ✅ Fetch recent activities from Garmin Connect
- ✅ Use wellness data in AI coaching
- ✅ Display Body Battery on dashboard
- ✅ Adjust workout recommendations based on recovery

---

## 💡 Production Deployment

For production (`airuncoach.live`):

1. **Deploy backend with Garmin OAuth endpoint**
2. **Ensure HTTPS is enabled** (already is)
3. **Set callback in Garmin Portal to:** `https://airuncoach.live/garmin/callback`
4. **Use production credentials** (not testing credentials)
5. **Consider Redis** for token storage instead of in-memory Map

---

## 🚀 Ready to Test!

Once you've:
1. ✅ Added credentials to `.env`
2. ✅ Configured Garmin Developer Portal callback
3. ✅ Restarted backend server
4. ✅ Rebuilt Android APK

**Test the OAuth flow and you should be connected!** 🎉

# Production Backend Fix - Goals & Runs 404 Errors

## 🔴 Problem Identified

The APK is connecting to `https://airuncoach.live` which is **not properly serving API endpoints**.

**Test Results:**
- ❌ `/api/goals/:userId` → 404 Not Found
- ❌ `/api/runs/user/:userId` → Returns HTML instead of JSON
- ✅ Endpoints exist in backend code at `/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android/server/routes.ts`

## ✅ Solutions

### Option 1: Redeploy Production Backend (Recommended)

1. **Navigate to backend directory:**
   ```bash
   cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
   ```

2. **Build the server:**
   ```bash
   npm run server:build
   ```

3. **Deploy to production:**
   - If using a hosting service (Railway, Render, DigitalOcean, etc.), push the code:
     ```bash
     git add .
     git commit -m "Deploy updated API endpoints for goals and runs"
     git push production main
     ```
   - Or manually upload `server_dist/` folder to your hosting service

4. **Verify deployment:**
   ```bash
   # Test goals endpoint
   curl -H "Authorization: Bearer YOUR_TOKEN" https://airuncoach.live/api/goals/YOUR_USER_ID
   
   # Test runs endpoint
   curl -H "Authorization: Bearer YOUR_TOKEN" https://airuncoach.live/api/runs/user/YOUR_USER_ID
   ```

### Option 2: Test with Local Backend (Quick Testing)

If you need to test the app right now without waiting for production deployment:

1. **Start local backend:**
   ```bash
   cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
   npm run server:dev
   ```

2. **Enable local backend in Android app:**
   - Open: `app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt`
   - Change line 80: `val useLocalBackend = true`
   - Make sure your Mac's IP is correct on line 94 (currently `192.168.18.14`)

3. **Rebuild and test APK:**
   ```bash
   ./gradlew assembleDebug
   ```

4. **Get your Mac's current IP (if needed):**
   ```bash
   ipconfig getifaddr en0  # For WiFi
   # or
   ipconfig getifaddr en1  # For Ethernet
   ```

### Option 3: Add Better Error Handling (Long-term Fix)

Even after fixing the backend, we should improve error messages in the app.

## 🔍 Why This Happened

The production backend at `https://airuncoach.live` is likely:
1. Running an older version of the code without goals/runs endpoints
2. Misconfigured to serve static HTML instead of API responses
3. Missing environment variables or routing configuration

## 📋 Next Steps

1. ✅ **Immediate:** Deploy updated backend to production
2. ✅ **Testing:** Verify endpoints work with authentication
3. ✅ **Long-term:** Add health check endpoint (`/api/health`) to monitor backend status
4. ✅ **Monitoring:** Set up logging to catch similar issues early

## 🛠️ Backend Deployment Checklist

- [ ] Backend code is built (`npm run server:build`)
- [ ] Environment variables are set (`.env` file)
- [ ] Database connection is working
- [ ] API endpoints respond with JSON (not HTML)
- [ ] Authentication middleware is working
- [ ] SSL certificate is valid for `https://airuncoach.live`

## 📱 App Testing After Fix

1. Install APK on device
2. Login/Register
3. Navigate to Goals screen → Should load without 404
4. Navigate to Previous Runs → Should load without errors
5. Create a goal → Should save successfully
6. Complete a run → Should appear in history

---

**Last Updated:** January 30, 2026
**Issue Status:** Pending production deployment

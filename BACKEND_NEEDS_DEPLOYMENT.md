# Backend Deployment Needed - Profile Picture Upload

## 🔴 Issue

**Problem:** Profile picture upload fails because the backend endpoint returns HTML instead of JSON.

**Root Cause:** The local backend code has the `/api/users/:id/profile-picture` endpoint, but it **hasn't been deployed to Replit yet**.

---

## 🧪 Test Results

```bash
# Testing the endpoint on Replit:
curl -X POST https://ai-run-coach.replit.app/api/users/test-id/profile-picture \
  -H "Content-Type: application/json" \
  -d '{"imageData":"test"}'

# Returns: HTML (1712 bytes) ❌
# Expected: JSON User object ✅
```

---

## ✅ Solution: Deploy Backend to Replit

### Option 1: Git Pull (Recommended)

If you've already pushed the latest backend code to GitHub:

```bash
# In Replit Shell:
cd ~/workspace
git pull origin main
pkill -f "tsx.*server"
npm run dev
```

### Option 2: Git Commit & Push (If not pushed yet)

If you haven't pushed the local backend changes:

```bash
# On your local machine (backend repo):
cd ~/Desktop/Ai-Run-Coach-IOS-and-Android
git add server/routes.ts server/storage.ts
git commit -m "Add getAllGroupRuns endpoint and profile picture upload"
git push origin main

# Then in Replit Shell:
cd ~/workspace
git pull origin main
pkill -f "tsx.*server"
npm run dev
```

---

## 📋 What Needs to be Deployed

### Endpoints That Need Deployment:

1. ✅ **`GET /api/group-runs`** - Already fixed locally, needs deploy
2. ✅ **`POST /api/users/:id/profile-picture`** - Already exists locally, needs deploy

### Backend Code Status:

| File | Local Status | Replit Status | Action Needed |
|------|-------------|---------------|---------------|
| `server/routes.ts` | ✅ Has group-runs endpoint | ❌ Missing | Deploy |
| `server/storage.ts` | ✅ Has getAllGroupRuns() | ❌ Missing | Deploy |
| `server/routes.ts` (line 184) | ✅ Has profile-picture endpoint | ❓ Unknown | Verify & Deploy |

---

## 🔍 Verify Deployment

After deploying, test the endpoints:

### Test 1: Group Runs
```bash
curl https://ai-run-coach.replit.app/api/group-runs
# Should return: JSON array ✅
```

### Test 2: Profile Picture (needs auth token)
```bash
curl -X POST https://ai-run-coach.replit.app/api/users/YOUR_USER_ID/profile-picture \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"imageData":"data:image/jpeg;base64,..."}'
# Should return: User JSON object ✅
```

---

## 🤖 Android App Status

**Current behavior:**
- ✅ Camera permission now works correctly
- ✅ Can select image from gallery
- ❌ Upload fails with "Backend returned HTML instead of JSON"

**After backend deployment:**
- ✅ Profile picture upload will work

---

## 📱 Testing After Deploy

1. Install latest APK:
   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

2. Test profile picture upload:
   - Profile → Click profile picture
   - Choose "Take Photo" or "Choose from Gallery"
   - Select/capture image
   - Image should upload and display ✅

---

## 🚀 Quick Deploy Commands (Copy/Paste into Replit)

```bash
# Pull latest code
git pull origin main

# Restart server
pkill -f "tsx.*server" && npm run dev

# Wait 5 seconds
sleep 5

# Test endpoints
echo "Testing group-runs..."
curl -s https://ai-run-coach.replit.app/api/group-runs | head -c 100
echo ""
echo ""
echo "✅ Backend deployed! Test your Android app now."
```

---

## 📝 Notes

- The profile picture endpoint **exists in local code** at line 184 of `server/routes.ts`
- It expects `{ imageData: string }` in the request body (base64 encoded image)
- It returns a `User` object without the password field
- Android app is already configured correctly to call this endpoint

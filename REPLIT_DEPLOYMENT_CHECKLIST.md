# Replit Deployment Checklist - Goals Fix

## ✅ Pre-Deployment Checks

### 1. Verify Replit Secrets (CRITICAL!)

Click 🔒 **Secrets** in Replit sidebar and verify:

**Must have:**
- ✅ `EXTERNAL_DATABASE_URL` = `postgresql://neondb_owner:npg_XaRU3vYEyg4p@ep-restless-grass-ahppspy3-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require`

**Must NOT have:**
- ❌ `DATABASE_URL` (should be deleted)

If `EXTERNAL_DATABASE_URL` is missing → **ADD IT NOW**

---

### 2. Pull Latest Code

In Replit Shell:
```bash
git pull origin main
```

Expected output:
```
Already up to date.
```
OR
```
Updating xxx..ce12a91
Fast-forward
 (files listed)
```

---

### 3. Verify Code Changes

Check `server/db.ts`:
```bash
cat server/db.ts | head -15
```

Should show:
```typescript
// ALWAYS use EXTERNAL_DATABASE_URL (Neon database)
// DO NOT use DATABASE_URL as it points to wrong database
const connectionString = process.env.EXTERNAL_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "EXTERNAL_DATABASE_URL must be set. This should point to the Neon PostgreSQL database.",
  );
}

console.log("🔌 Connecting to database:", connectionString.substring(0, 30) + "...");
```

---

## 🚀 Deployment Steps

### 1. Stop Current Process (if running)
- Click the **Stop** button (square icon) in Replit

### 2. Clear Build Cache (Optional but Recommended)
In Replit Shell:
```bash
rm -rf node_modules/.cache
rm -rf dist
rm -rf build
```

### 3. Rebuild
```bash
npm run server:build
```

Should see:
```
✓ Building server...
✓ Build complete
```

### 4. Deploy
Click **"Deploy"** button (or **"Run"** button)

---

## 📊 Verify Deployment

### 1. Check Startup Logs

Look for this line in the logs:
```
🔌 Connecting to database: postgresql://neondb_owner:npg_...
```

**If you see this** → ✅ Connecting to Neon correctly

**If you DON'T see this** → ❌ Problem with deployment

---

### 2. Check for Errors

**Good startup:**
```
🔌 Connecting to database: postgresql://neondb_owner:npg_...
Server listening on port 5000
✓ Ready
```

**Bad startup (missing EXTERNAL_DATABASE_URL):**
```
Error: EXTERNAL_DATABASE_URL must be set. This should point to the Neon PostgreSQL database.
```
→ **FIX:** Add `EXTERNAL_DATABASE_URL` to Replit Secrets

---

### 3. Test Health Endpoint

In Replit Shell:
```bash
curl http://localhost:5000/api/health
```

Expected:
```json
{"status":"ok"}
```

---

### 4. Test Goals Endpoint

In Replit Shell:
```bash
# Get your auth token from Android app logs, then:
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/goals/8d898742-dd4e-4b3b-b612-6f34e11778a8
```

**Expected (if you have goals):**
```json
[
  {
    "id": "621d4992-d8ca-4383-8a8...",
    "userId": "8d898742-dd4e-4b3b-b612-6f34e11778a8",
    "type": "DISTANCE_TIME",
    "title": "run 5km in 22 minutes",
    ...
  }
]
```

**Expected (if no goals):**
```json
[]
```

**BAD (if EXTERNAL_DATABASE_URL wrong):**
```json
{"error":"Failed to get goals"}
```

---

## 🐛 Troubleshooting

### Error: "EXTERNAL_DATABASE_URL must be set"

**Cause:** Secret not configured in Replit

**Fix:**
1. Click 🔒 Secrets
2. Click "New Secret"
3. Key: `EXTERNAL_DATABASE_URL`
4. Value: `postgresql://neondb_owner:npg_XaRU3vYEyg4p@ep-restless-grass-ahppspy3-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require`
5. Click "Add Secret"
6. Redeploy

---

### Still Getting 404 on /api/goals/:userId

**Check Replit Logs for:**
```
[GET /api/goals/:userId] Fetching goals for userId: xxx
```

**If you see this:**
- ✅ Route is registered
- ✅ Request is reaching backend
- Problem is in database query

**If you DON'T see this:**
- ❌ Route not registered
- ❌ Backend crashed during startup
- Check for startup errors in logs

---

### Database Connection Issues

**Check logs for:**
```
🔌 Connecting to database: postgresql://neondb_owner:npg_...
```

**If using wrong database (Replit's internal):**
```
🔌 Connecting to database: postgresql://localhost:5432...
```
→ **FIX:** `EXTERNAL_DATABASE_URL` not set correctly

---

### Android App Still Showing 404

**Possible causes:**

1. **Old backend still running**
   - Stop and restart deployment
   - Clear Replit build cache

2. **Android app cached old response**
   - Force close Android app
   - Clear app data
   - Reinstall APK

3. **Wrong backend URL in app**
   - Check `RetrofitClient.kt`
   - Should be: `https://airuncoach.live`
   - Not: `http://localhost` or `http://192.168...`

---

## ✅ Success Checklist

After deployment, verify:

- [ ] Replit logs show: `🔌 Connecting to database: postgresql://neondb_owner:npg_...`
- [ ] Replit logs show: `Server listening on port 5000`
- [ ] Health check works: `curl http://localhost:5000/api/health`
- [ ] Goals endpoint returns data (or empty array)
- [ ] Android app loads goals screen without errors
- [ ] Dashboard shows goals

---

## 📝 Common Mistakes

1. ❌ Forgetting to add `EXTERNAL_DATABASE_URL` to Replit Secrets
2. ❌ Adding `EXTERNAL_DATABASE_URL` but with wrong value
3. ❌ Not pulling latest code before deploying
4. ❌ Deploying but not waiting for build to complete
5. ❌ Testing with old Android APK (not rebuilt)

---

## 🆘 Still Not Working?

Share these details:

1. **Replit startup logs** (first 20 lines)
2. **Android LogCat error** (full error message)
3. **Result of:** `curl http://localhost:5000/api/health` (in Replit Shell)
4. **Screenshot of Replit Secrets** (showing EXTERNAL_DATABASE_URL exists)

---

**Last Updated:** February 6, 2026

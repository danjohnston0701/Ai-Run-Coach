# 🚀 Quick Start - Goals Feature Testing

## Start in 2 Steps!

### Step 1: Start Backend Server (Terminal)

```bash
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
npm run server:dev
```

✅ Server running on http://localhost:3000

### Step 2: Run Android App (Android Studio)

1. Open Android Studio
2. Run app in **DEBUG mode**
3. Login/Register
4. Go to **Goals tab**
5. Click **"Create Goal"**
6. Fill in details and submit
7. See your goal in the list!

---

## That's It! 🎉

Your goals are now:
- ✅ Saved to Neon.com database
- ✅ Persistent across sessions
- ✅ Accessible from any device

---

## Quick Test Commands

### Test Backend API
```bash
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
node test-goals-api.js
```

### Check Server Status
```bash
ps aux | grep tsx | grep server
```

### View Server Logs
```bash
tail -f /tmp/server.log
```

### Stop Server
```bash
kill $(cat /tmp/server.pid)
```

---

## Need More Info?

- **Full Documentation**: `GOALS_FEATURE_COMPLETE.md`
- **Backend Guide**: `~/Desktop/Ai-Run-Coach-IOS-and-Android/BACKEND_GOALS_COMPLETED.md`
- **Database Schema**: `GOALS_DATABASE_SCHEMA.md`
- **Implementation Summary**: `GOALS_IMPLEMENTATION_SUMMARY.md`

---

## Troubleshooting in 3 Seconds

**Problem**: Android app can't connect

**Solution**:
1. Server running? → `ps aux | grep tsx`
2. If not → `cd ~/Desktop/Ai-Run-Coach-IOS-and-Android && npm run server:dev`
3. Run Android app in DEBUG mode (not Release)

Done! ✅

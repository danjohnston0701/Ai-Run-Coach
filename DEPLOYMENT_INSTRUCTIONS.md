# Deploy Push Notification Updates to Replit

## What Changed
✅ Enhanced push notification logging
✅ Added test endpoint for manual testing
✅ No breaking changes - all additive

## Deployment Steps

### Step 1: Push to GitHub
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
git push origin main
```

### Step 2: On Replit, Pull Latest Changes
1. Go to https://replit.com → your AI Run Coach project
2. Click **"Tools"** (bottom left corner)
3. Select **"Git"** → **"Pull"**
4. Wait for pull to complete

Or if you prefer the terminal on Replit:
```bash
git pull origin main
```

### Step 3: Server Automatically Restarts
Replit will detect changes and restart the server automatically.

Watch for these logs to confirm deployment:
```
✅ [Firebase] Initializing with project: ai-run-coach-c1b8c
✅ [Firebase] Admin SDK initialised ✅
```

### Step 4: Test the New Endpoint

Once deployed, the test endpoint will work:

```bash
./test-push-notifications.sh https://airuncoach.live danjohnston0701@gmail.com
```

Or with curl:
```bash
curl -X POST https://airuncoach.live/api/test/push-notification \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "danjohnston0701@gmail.com",
    "title": "Test Notification",
    "body": "If you see this, push notifications are working! 🎉"
  }'
```

## Expected Response

**Success:**
```json
{
  "success": true,
  "message": "Test push notification sent to danjohnston0701@gmail.com",
  "userEmail": "danjohnston0701@gmail.com",
  "hasToken": true,
  "tokenPreview": "cJ7Bv_pQi4k2..."
}
```

Your Android device will receive the notification within 10 seconds.

---

## Commit Deployed
```
commit: Add push notification testing infrastructure and enhanced debugging
- Test endpoint (POST /api/test/push-notification)
- Enhanced logging in notification-service.ts
- Bash test script (test-push-notifications.sh)
- Comprehensive setup documentation
```

---

## Troubleshooting Deployment

If the endpoint still returns "Cannot POST":

1. **Check Replit logs** for deployment errors
2. **Verify git pull succeeded** - should see new files in file explorer
3. **Restart Replit server** manually (click "Run")
4. **Clear browser cache** (test endpoint should now work)

If you still see errors, share the Replit console output and I can help debug further.

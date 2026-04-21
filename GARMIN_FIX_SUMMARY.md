# Garmin OAuth 401 Error - Fix Summary

## What's Wrong

Your server is getting a **401 Unauthorized** error with the message:
```
Invalid signature for signature method HMAC-SHA1
```

This happens when Garmin receives your OAuth request but rejects the signature because the **Consumer Key and/or Consumer Secret are missing or incorrect**.

## The Fix (3 Steps)

### 1️⃣ Get Garmin OAuth Credentials

If you haven't already:

1. Visit [Garmin Developer Portal](https://developer.garmin.com/)
2. Sign up or log in
3. Go to "My Applications"
4. Create a new application
5. Choose **OAuth 1.0a** (not 2.0)
6. Set callback URL to: `https://your-server.repl.co/api/auth/garmin/callback`
7. Copy your **Consumer Key** and **Consumer Secret**

### 2️⃣ Set Environment Variables

**If using Replit:**
1. Click the 🔒 (Secrets) icon in left sidebar
2. Add secret: `GARMIN_CONSUMER_KEY` = (paste your consumer key)
3. Add secret: `GARMIN_CONSUMER_SECRET` = (paste your consumer secret)
4. Restart your server

**If using local .env:**
```bash
# Create .env file in project root
GARMIN_CONSUMER_KEY=your_key_here
GARMIN_CONSUMER_SECRET=your_secret_here
```

### 3️⃣ Verify Callback URL Matches

The callback URL in Garmin Developer Portal MUST exactly match:
```
https://your-server-url/api/auth/garmin/callback
```

## What I Did

I've added **better error messages and diagnostics** to help you identify the issue:

1. ✅ **Enhanced error logging** in `server/garmin-service.ts`
   - Shows if credentials are loaded
   - Displays credential lengths
   - Provides specific 401 error guidance

2. 📄 **Created GARMIN_OAUTH_SETUP.md**
   - Step-by-step setup instructions
   - Common mistakes to avoid
   - Verification checklist

3. 📋 **Created GARMIN_DIAGNOSTICS.md**
   - Detailed troubleshooting guide
   - How to check each component
   - Solutions for common issues

4. 🧪 **Created GARMIN_TEST_COMMANDS.sh**
   - Shell script to test your setup
   - Checks if credentials are set
   - Tests the OAuth endpoint

## How to Test the Fix

### Quick Test
```bash
# Run this to check if credentials are set
echo "Consumer Key: $GARMIN_CONSUMER_KEY"
echo "Consumer Secret: $GARMIN_CONSUMER_SECRET"
```

If either shows empty, go to Step 2 above.

### Full Test
1. Start your server
2. Try to initiate Garmin OAuth
3. Watch the server logs for:
   ```
   [Garmin OAuth 1.0a] ✅ Credentials loaded
   [Garmin OAuth 1.0a] Requesting token from Garmin...
   ```
4. If you see these, then watch for:
   ```
   [Garmin OAuth 1.0a] Auth URL: https://connect.garmin.com/oauthConfirm?oauth_token=...
   ```

If you see the Auth URL, the fix worked! ✅

If still getting 401, follow the troubleshooting steps in **GARMIN_DIAGNOSTICS.md**.

## Files Modified

- `server/garmin-service.ts`
  - Added diagnostic logging
  - Better error messages for 401 errors
  - Shows credential lengths and hints

## New Files Created

- `GARMIN_OAUTH_SETUP.md` — Complete setup guide
- `GARMIN_DIAGNOSTICS.md` — Troubleshooting guide
- `GARMIN_TEST_COMMANDS.sh` — Test script
- `GARMIN_FIX_SUMMARY.md` — This file

## Next Steps

1. **Get your Garmin OAuth credentials** (if you don't have them)
2. **Set the environment variables** in Replit Secrets
3. **Restart your server**
4. **Test the OAuth flow** and watch for success messages
5. **If still broken**, follow **GARMIN_DIAGNOSTICS.md** for detailed troubleshooting

## Key Points

⚠️ **Important:**
- Use **OAuth 1.0a** credentials, not OAuth 2.0
- The callback URL must be **HTTPS** (not HTTP)
- The callback URL must **exactly match** what's registered with Garmin
- There must be **no whitespace** in credentials (common copy-paste error!)
- Credentials are **case-sensitive**

## Support Resources

- [Garmin Developer Portal](https://developer.garmin.com/)
- [Garmin OAuth 1.0a Docs](https://developer.garmin.com/connect-iq/overview/)
- Your implementation: `server/garmin-service.ts` (lines 146-204)
- Your routes: `server/routes.ts` (lines 2830-2875)

---

**Good luck! Once you set the credentials, the 401 error should be gone.** 🚀

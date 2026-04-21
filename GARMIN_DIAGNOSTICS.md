# Garmin OAuth Diagnostics Guide

## Quick Diagnostic Checklist

Run through this checklist to identify why the 401 error is occurring.

### ✅ Step 1: Verify Credentials Are Loaded

**What to check**: Server logs during OAuth initiation should show:
```
[Garmin OAuth 1.0a] ✅ Credentials loaded
[Garmin OAuth 1.0a] Consumer Key length: 16
[Garmin OAuth 1.0a] Consumer Secret length: 32
```

**If you see instead:**
```
❌ GARMIN_CONSUMER_KEY: NOT SET
❌ GARMIN_CONSUMER_SECRET: NOT SET
```

**Solution:**
1. Go to your Replit Secrets (click 🔒 in left sidebar)
2. Add `GARMIN_CONSUMER_KEY` with your key from Garmin Developer Portal
3. Add `GARMIN_CONSUMER_SECRET` with your secret
4. Restart your server
5. Try again

---

### ✅ Step 2: Verify Credential Format

Your credentials should look like this:
- **Consumer Key**: Random alphanumeric string, 16-20 characters
  - Example: `abc123def456ghi7`
  - NOT: `My App Key` or `garmin-key-12345`

- **Consumer Secret**: Longer random string, 20-40+ characters
  - Example: `xyz789abc123def456ghi789jkl012mno345pqr`
  - NOT: `password` or `secret123`

**If your credentials look like text words**, they're wrong. Get them from the Garmin Developer Portal.

---

### ✅ Step 3: Check for Whitespace

OAuth signatures are extremely sensitive to whitespace.

**Check for these common errors:**
- ` abc123def456ghi7` (leading space)
- `abc123def456ghi7 ` (trailing space)
- `abc 123 def 456 ghi 7` (spaces in the middle)

**How to verify:**
1. Open Replit Secrets
2. Click on `GARMIN_CONSUMER_KEY`
3. Look at the exact text — any spaces?
4. If yes, delete and re-paste without any spaces

**The easiest solution:**
When copying from Garmin Portal:
1. Click the copy button next to the key
2. In Replit Secrets, paste immediately
3. Look to make sure there are no extra spaces before/after

---

### ✅ Step 4: Verify Callback URL Matches

The callback URL registered with Garmin MUST exactly match what your server sends.

**In your Garmin Developer Portal:**
- Go to your app settings
- Look for "Callback URL" or "Authorized Redirect URIs"
- Copy the exact URL listed

**In your server logs:**
When OAuth is initiated, look for:
```
[Garmin OAuth 1.0a] Callback URL: https://your-replit-slug.repl.co/api/auth/garmin/callback?state=...
```

**They must match exactly:**
- ✅ `https://yourapp.repl.co/api/auth/garmin/callback` matches `https://yourapp.repl.co/api/auth/garmin/callback`
- ❌ `https://yourapp.repl.co/api/auth/garmin/callback` does NOT match `https://yourapp.repl.co/api/callback`
- ❌ `https://yourapp.repl.co/api/auth/garmin/callback` does NOT match `http://yourapp.repl.co/api/auth/garmin/callback`
- ❌ `https://yourapp.repl.co/api/auth/garmin/callback` does NOT match `https://yourapp.repl.co:3000/api/auth/garmin/callback`

**If they don't match:**
1. Update your Garmin app settings with the correct callback URL
2. Or update your server code to use the registered URL
3. Garmin may take a few minutes to propagate the change

---

### ✅ Step 5: Check App Status in Developer Portal

Some new apps need approval.

**What to check:**
1. Log into [Garmin Developer Portal](https://developer.garmin.com/)
2. Click "My Applications"
3. Find your app
4. Check the status:
   - ✅ **Active** — Ready to use
   - 🟡 **Pending Approval** — Wait 24-48 hours
   - ❌ **Inactive** — Click to activate it

**If status is "Pending Approval":**
- Your credentials exist but Garmin hasn't approved your app yet
- Try again in a few hours
- Check your email for any approval requirements

---

### ✅ Step 6: Verify OAuth 1.0a (not 2.0)

This is critical! Garmin Connect API only supports OAuth 1.0a.

**In your Garmin Developer Portal:**
1. Open your app settings
2. Look for "OAuth Version" or similar
3. Make sure it says **"1.0a"**, NOT "2.0"

**If it says "2.0":**
- You're using the wrong type of credentials
- You need to either:
  - Find the 1.0a credentials for this app, OR
  - Create a new app with 1.0a support

---

### ✅ Step 7: Check Server Logs for Detailed Error

When the 401 error occurs, your server should log:

```
[Garmin OAuth 1.0a] ❌ Request token FAILED
[Garmin OAuth 1.0a] HTTP Status: 401
[Garmin OAuth 1.0a] Response body: <html>...Invalid signature...</html>
[Garmin OAuth 1.0a] Diagnostic info:
  - Consumer Key set: true
  - Consumer Secret set: true
  - OAuth nonce: abc12345...
  - Timestamp: 1713700391
[Garmin OAuth 1.0a] ⚠️  401 UNAUTHORIZED — This usually means:
  1. Consumer Key or Consumer Secret is incorrect
  2. Credentials don't match what's registered with Garmin
  3. Keys have leading/trailing whitespace
```

**This confirms:**
- ✅ Credentials are loaded
- ✅ Server is trying to authenticate
- ❌ But Garmin rejected the signature

**Next steps:**
1. Triple-check credentials for typos
2. Verify there's no whitespace
3. Go back to Garmin Developer Portal and regenerate credentials
4. Copy/paste fresh credentials

---

## If Everything Looks Good But Still Getting 401

### Option A: Regenerate Credentials in Garmin Portal

1. Go to Garmin Developer Portal
2. Open your app settings
3. Look for a "Regenerate" or "Reset Credentials" button
4. Click it to get NEW Consumer Key and Secret
5. Copy the new credentials
6. Update them in Replit Secrets
7. Try again

### Option B: Check if App Needs Re-registration

Sometimes Garmin requires app re-authorization:

1. Go to Garmin Developer Portal
2. Deactivate your app (if possible)
3. Wait 5 minutes
4. Reactivate it
5. Copy fresh credentials
6. Try again

### Option C: Contact Garmin Support

If you've verified everything above and still getting 401:
1. Go to [Garmin Developer Support](https://developer.garmin.com/support/)
2. Describe the issue
3. Provide:
   - Your app name
   - Consumer Key (first 8 chars visible, rest masked)
   - The 401 error message
   - Your callback URL

---

## Testing After Fix

Once you've made changes:

1. **Restart your server**
2. **Try the OAuth flow again**
3. **Watch the server logs** for these success messages:
   ```
   [Garmin OAuth 1.0a] ✅ Credentials loaded
   [Garmin OAuth 1.0a] Requesting token from Garmin...
   [Garmin OAuth 1.0a] Request token request made
   [Garmin OAuth 1.0a] Auth URL: https://connect.garmin.com/oauthConfirm?oauth_token=...
   ```

4. **If you see the Auth URL**, the 401 error is FIXED! ✅

---

## Related Files

- `GARMIN_OAUTH_SETUP.md` — Complete setup instructions
- `GARMIN_TEST_COMMANDS.sh` — Commands to test the OAuth flow
- `server/garmin-service.ts` — OAuth implementation
- `server/routes.ts` (lines 2830-2875) — OAuth endpoints

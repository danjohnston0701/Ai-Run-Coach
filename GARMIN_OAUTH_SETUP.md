# Garmin OAuth 1.0a Setup Guide

## Problem
Getting `401 Unauthorized — Invalid signature for signature method HMAC-SHA1` error when trying to authenticate with Garmin Connect API.

## Root Cause
**Missing or incorrect Garmin Consumer Key and Consumer Secret environment variables.**

The error message indicates that Garmin received your request but the HMAC-SHA1 signature doesn't match what they computed using the credentials they have on file. This happens when:

1. ❌ `GARMIN_CONSUMER_KEY` is not set in environment
2. ❌ `GARMIN_CONSUMER_SECRET` is not set in environment  
3. ❌ The values don't match the credentials registered with Garmin Developer Portal
4. ❌ There's whitespace or encoding issues in the credentials

## Solution

### Step 1: Register Your App with Garmin Developer Portal

1. Go to [Garmin Developer Portal](https://developer.garmin.com/)
2. Log in or create an account
3. Navigate to **"My Applications"**
4. Click **"Create New Application"**
5. Fill in the form:
   - **Application Name**: "AI Run Coach"
   - **Application Type**: "Web"
   - **Description**: "AI-powered running coach that syncs with Garmin Connect"
   - **App ID**: Should be auto-generated or provide a unique identifier
6. In the OAuth settings:
   - Select **OAuth 1.0a** (not 2.0)
   - Set **Callback URL** to your server:
     - For Replit: `https://{your-replit-slug}.repl.co/api/auth/garmin/callback`
     - For production: `https://yourdomain.com/api/auth/garmin/callback`
7. Click **Submit**
8. You'll receive:
   - **Consumer Key** (looks like `abcd1234efgh5678`)
   - **Consumer Secret** (looks like `zyxw9876vutsrq5432`)

### Step 2: Set Environment Variables

**Option A: If using Replit Secrets**
1. Open your Replit project
2. Click the **"Secrets"** icon (lock icon) in the left sidebar
3. Add two new secrets:
   - **Key**: `GARMIN_CONSUMER_KEY`
     **Value**: (paste your Consumer Key from Garmin)
   - **Key**: `GARMIN_CONSUMER_SECRET`
     **Value**: (paste your Consumer Secret from Garmin)
4. Click **"Add Secret"** for each

**Option B: If using Local .env file (development only)**
```bash
# Create .env file in your project root
GARMIN_CONSUMER_KEY=your_consumer_key_here
GARMIN_CONSUMER_SECRET=your_consumer_secret_here
```

Then load it in your server startup:
```typescript
import dotenv from 'dotenv';
dotenv.config();
```

### Step 3: Verify Configuration

Add debug logging to verify the credentials are loaded:

In `server/garmin-service.ts` around line 147:
```typescript
export async function getGarminAuthUrl(redirectUri: string, state: string, nonce: string): Promise<string> {
  if (!GARMIN_CONSUMER_KEY || !GARMIN_CONSUMER_SECRET) {
    console.error('❌ GARMIN_CONSUMER_KEY:', GARMIN_CONSUMER_KEY ? '***SET***' : 'NOT SET');
    console.error('❌ GARMIN_CONSUMER_SECRET:', GARMIN_CONSUMER_SECRET ? '***SET***' : 'NOT SET');
    throw new Error(
      'GARMIN_CONSUMER_KEY / GARMIN_CONSUMER_SECRET not set in environment. ' +
      'Add them as Replit Secrets (Settings → Secrets).'
    );
  }
  
  console.log('✅ Garmin credentials loaded successfully');
  // ... rest of function
}
```

### Step 4: Verify Callback URL

⚠️ **CRITICAL**: The callback URL you provide to Garmin MUST exactly match what your server is expecting.

In your code (around line 2852 in routes.ts):
```typescript
const baseUrl = `https://${host}`;
const redirectUri = `${baseUrl}/api/auth/garmin/callback`;
```

This must match exactly what you registered in the Garmin Developer Portal:
- ✅ `https://yourdomain.com/api/auth/garmin/callback`
- ❌ `https://yourdomain.com/api/auth/garmin/` (wrong — missing `/callback`)
- ❌ `http://yourdomain.com/api/auth/garmin/callback` (wrong — must be HTTPS)
- ❌ `https://yourdomain.com:8000/api/auth/garmin/callback` (wrong — port number differs)

### Step 5: Test the OAuth Flow

1. **Start your server**
2. **Make a request to initiate Garmin OAuth**:
   ```bash
   curl https://your-server/api/auth/garmin/start \
     -H "Content-Type: application/json" \
     -d '{"redirectUri":"https://your-server/api/auth/garmin/callback","appRedirect":"airuncoach://connected-devices"}'
   ```

3. **Check the server logs** for these debug messages:
   ```
   ✅ Garmin credentials loaded successfully
   [Garmin OAuth 1.0a] Requesting token from Garmin...
   [Garmin OAuth 1.0a] Callback URL: https://your-server/api/auth/garmin/callback?state=...
   ```

4. **Look for this error if it fails**:
   ```
   [Garmin OAuth 1.0a] Request token failed: 401 Invalid signature for signature method HMAC-SHA1
   ```

### Step 6: If Still Getting 401 Error

**Check these common issues:**

1. **Trailing whitespace in secrets**
   - Garmin's portal might add spaces when copying
   - Verify in Replit Secrets there's no leading/trailing whitespace

2. **Copy-paste error**
   - Ensure you copied the ENTIRE key/secret with no characters missing
   - Garmin Consumer Keys are typically 16-20 characters
   - Consumer Secrets are typically 20-40 characters

3. **Wrong credentials type**
   - Make sure you're using **OAuth 1.0a** credentials, not OAuth 2.0
   - OAuth 2.0 credentials won't work — Garmin Connect API only supports 1.0a

4. **Registered callback URL mismatch**
   - The callback URL must be EXACTLY what Garmin registered
   - If you're testing locally, you may need to update it in the portal
   - Garmin requires HTTPS (except for localhost in some cases)

5. **Check Garmin App Status**
   - Some apps need to be "approved" by Garmin
   - Check the Developer Portal to see if your app status is "Active" or "Pending"
   - Personal/test apps usually activate immediately

### Step 7: Alternative — Use Garmin's Test Keys

If you don't have production credentials yet, Garmin provides test credentials:
1. In Developer Portal, there's often a "Sandbox" or "Test" section
2. Use those credentials to test the OAuth flow
3. Once working, switch to production credentials

## Debugging Checklist

- [ ] Garmin Consumer Key is set in environment: `echo $GARMIN_CONSUMER_KEY`
- [ ] Garmin Consumer Secret is set in environment: `echo $GARMIN_CONSUMER_SECRET`
- [ ] Keys have no leading/trailing whitespace
- [ ] Callback URL registered in Garmin Portal matches your server's redirect URI
- [ ] Using HTTPS for callback (unless localhost testing)
- [ ] App status in Garmin Developer Portal is "Active"
- [ ] Server logs show "✅ Garmin credentials loaded successfully"

## References

- [Garmin Developer Portal](https://developer.garmin.com/)
- [Garmin OAuth 1.0a Documentation](https://developer.garmin.com/connect-iq/overview/)
- Your implementation: `server/garmin-service.ts` (lines 146-204)
- Your routes: `server/routes.ts` (lines 2830-2875)

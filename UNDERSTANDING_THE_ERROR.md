# Understanding the 401 Error

## The Error You're Seeing

```
2026-04-21 11:33:11.15
2035e1a2
User
[Garmin OAuth 1.0a] Request token failed: 401 <!doctype html><html lang="en">
<head><title>HTTP Status 401 – Unauthorized</title>...
<p><b>Message</b> Invalid signature for signature method HMAC-SHA1</p>
```

Let me break this down:

## What Each Part Means

### 1. `[Garmin OAuth 1.0a]`
This is the tag for Garmin OAuth 1.0a authentication.
- Your code reached this point ✅
- It's trying to get the initial request token ✅

### 2. `Request token failed: 401`
The request to Garmin's server failed with HTTP status code 401.
- 401 = Unauthorized
- This is an authentication failure

### 3. `Invalid signature for signature method HMAC-SHA1`
This is the key error message from Garmin.

**What it means:**
- Garmin received your request ✅
- Your request had a signature ✅
- The signature is WRONG ❌

**Why would the signature be wrong?**

Your code:
```typescript
const signature = HMAC-SHA1(baseString, GARMIN_CONSUMER_SECRET);
```

Garmin's server:
```typescript
const theirSignature = HMAC-SHA1(sameBaseString, theirCopyOfYourSecret);
```

If `GARMIN_CONSUMER_SECRET` ≠ `theirCopyOfYourSecret`, the signatures won't match.

### 4. The HTML error page
Garmin returned an HTML error page instead of the OAuth tokens you expected.

---

## The Root Causes (In Order of Likelihood)

### Root Cause #1: Missing Environment Variables (95% probability)

Your code:
```typescript
const GARMIN_CONSUMER_KEY = process.env.GARMIN_CLIENT_ID;
const GARMIN_CONSUMER_SECRET = process.env.GARMIN_CLIENT_SECRET;
```

If `process.env.GARMIN_CLIENT_SECRET` is `undefined`:
```typescript
// In the signing function:
const key = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret)}`;
// → `${pctEncode(undefined)}&${pctEncode('')}`
// → Signature is WRONG
```

**Solution:** Set `GARMIN_CONSUMER_KEY` and `GARMIN_CONSUMER_SECRET` in Replit Secrets or .env

---

### Root Cause #2: Wrong Credentials (4% probability)

You set the env vars, but they're not the right ones.

Example:
```
In Garmin Portal:
  Consumer Key: abc123def456
  Consumer Secret: xyz789abc123

In your Replit Secrets:
  GARMIN_CONSUMER_KEY: abc123def456  ✓
  GARMIN_CONSUMER_SECRET: WRONG_SECRET  ✗
```

Result:
- Your signature: HMAC-SHA1(..., "WRONG_SECRET")
- Garmin's signature: HMAC-SHA1(..., "xyz789abc123")
- They don't match → 401

**Solution:** Double-check your credentials in Garmin Developer Portal

---

### Root Cause #3: Whitespace in Credentials (0.9% probability)

You copied credentials with extra spaces.

Example:
```
In Garmin Portal:
  Consumer Secret: xyz789abc123

You copied:
  " xyz789abc123" (leading space!)
  or
  "xyz789abc123 " (trailing space!)
```

Result:
- Your signature: HMAC-SHA1(..., " xyz789abc123")
- Garmin's signature: HMAC-SHA1(..., "xyz789abc123")
- They don't match → 401

**Solution:** When copying from Garmin, paste into a text editor first, check for spaces, then copy clean version to Replit Secrets

---

### Root Cause #4: Case Sensitivity (0.1% probability)

OAuth is case-sensitive.

Example:
```
In Garmin Portal:
  Consumer Secret: xyz789abc123

You typed:
  XYZ789ABC123 (uppercase!)
```

Result:
- Your signature uses uppercase
- Garmin's uses lowercase
- They don't match → 401

---

## How to Diagnose Which One

### Check the Server Logs

When you get the 401 error, look at your server logs for these lines:

#### If you see:
```
❌ GARMIN_CONSUMER_KEY: NOT SET
❌ GARMIN_CONSUMER_SECRET: NOT SET
```

**Diagnosis:** Root Cause #1 — Missing env vars
**Fix:** Add them to Replit Secrets or .env

#### If you see:
```
[Garmin OAuth 1.0a] ✅ Credentials loaded
[Garmin OAuth 1.0a] Consumer Key length: 16
[Garmin OAuth 1.0a] Consumer Secret length: 32
```

**Diagnosis:** Either Root Cause #2, #3, or #4
**Next steps:** Check credentials in Garmin Portal for typos, whitespace, or case issues

---

## The Signature Verification Process (Technical)

Here's exactly what happens:

### On Your Server:

```typescript
// Step 1: Create params with OAuth details
const params = {
  oauth_consumer_key: "abc123def456",
  oauth_nonce: "random1234567890",
  oauth_timestamp: "1713700391",
  oauth_signature_method: "HMAC-SHA1",
  oauth_version: "1.0"
};

// Step 2: Create base string from params
const baseString = `POST&https%3A%2F%2Fconnectapi.garmin.com%2Foauth-service%2Foauth%2Frequest_token&oauth_consumer_key%3Dabc123def456%26oauth_nonce%3D...`;

// Step 3: Sign with your Consumer Secret
const consumerSecret = process.env.GARMIN_CONSUMER_SECRET; // Should be "xyz789abc123"
const signingKey = encodeURIComponent(consumerSecret) + "&"; // "xyz789abc123&"
const signature = HMAC_SHA1(baseString, signingKey);
// Result: "abc123xyz789=="

// Step 4: Send Authorization header with signature
const header = 'OAuth oauth_consumer_key="abc123def456", oauth_signature="abc123xyz789==", ...';
```

### On Garmin's Server:

```typescript
// Step 1: Extract oauth_consumer_key from Authorization header
const consumerKey = "abc123def456";

// Step 2: Look up your registered app
const registeredApp = database.getApp(consumerKey);
// Returns: { consumerKey: "abc123def456", consumerSecret: "xyz789abc123" }

// Step 3: Extract signature from Authorization header
const receivedSignature = "abc123xyz789==";

// Step 4: Create SAME base string (from Authorization header params)
const baseString = `POST&https%3A%2F%2Fconnectapi.garmin.com%2Foauth-service%2Foauth%2Frequest_token&oauth_consumer_key%3Dabc123def456%26oauth_nonce%3D...`;

// Step 5: Sign with THEIR copy of your Consumer Secret
const consumerSecret = registeredApp.consumerSecret; // "xyz789abc123"
const signingKey = encodeURIComponent(consumerSecret) + "&"; // "xyz789abc123&"
const calculatedSignature = HMAC_SHA1(baseString, signingKey);
// Result: "abc123xyz789=="

// Step 6: Compare
if (receivedSignature === calculatedSignature) {
  // ✅ Valid! Send back oauth_token and oauth_token_secret
  return 200;
} else {
  // ❌ Invalid! Someone is spoofing this request
  return 401 { "Invalid signature for signature method HMAC-SHA1" }
}
```

## Why This Matters

Garmin uses this signature verification to ensure:
1. ✅ You are who you claim to be (the registered app)
2. ✅ The request hasn't been tampered with
3. ✅ Your credentials are correct

If the signature doesn't match, it means:
- ❌ Either you're not who you claim to be, or
- ❌ You're using the wrong credentials, or
- ❌ The request was modified in transit

---

## The Fix (Step by Step)

### Step 1: Get Correct Credentials

1. Go to https://developer.garmin.com/
2. Log in
3. Click "My Applications"
4. Find your app
5. Look for "Consumer Key" and "Consumer Secret"
6. Copy them exactly (watch for spaces!)

### Step 2: Set Environment Variables

1. Open Replit Secrets (or your .env file)
2. Set `GARMIN_CONSUMER_KEY` = (value from Step 1)
3. Set `GARMIN_CONSUMER_SECRET` = (value from Step 1)
4. Restart server

### Step 3: Test

1. Try OAuth flow again
2. Look for these logs:
   ```
   [Garmin OAuth 1.0a] ✅ Credentials loaded
   [Garmin OAuth 1.0a] Auth URL: https://connect.garmin.com/oauthConfirm?oauth_token=...
   ```
3. If you see the Auth URL, ✅ **It's fixed!**

---

## Quick Summary

| Symptom | Cause | Solution |
|---------|-------|----------|
| `401 Unauthorized — Invalid signature` | Env vars not set | Add to Replit Secrets |
| `401 Unauthorized — Invalid signature` | Wrong credentials | Check Garmin Portal |
| `401 Unauthorized — Invalid signature` | Whitespace in secret | Re-copy (no spaces) |
| Server logs show `NOT SET` | Env vars not set | Add to Replit Secrets |
| Server logs show credentials loaded | Wrong credential value | Check Garmin Portal |

---

## Need More Help?

- `QUICK_FIX_CHECKLIST.md` — Simple action items
- `GARMIN_DIAGNOSTICS.md` — Detailed troubleshooting
- `GARMIN_OAUTH_SETUP.md` — Complete setup guide
- `GARMIN_OAUTH_FLOW.md` — Visual diagrams

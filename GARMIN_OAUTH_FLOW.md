# Garmin OAuth 1.0a Flow Diagram

## The Full OAuth Flow (What Should Happen)

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: User clicks "Connect Garmin" in app                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Phone app makes request to server:                      │
│ POST /api/auth/garmin/start                                     │
│   body: {                                                        │
│     "redirectUri": "https://server/api/auth/garmin/callback",  │
│     "appRedirect": "airuncoach://connected-devices"            │
│   }                                                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Server initiates OAuth (getGarminAuthUrl)              │
│                                                                  │
│ YOUR SERVER:                     GARMIN:                        │
│ ┌──────────────────────┐        ┌──────────────────┐           │
│ │ 1. Load credentials:  │        │ 2. Verify        │           │
│ │    - CONSUMER_KEY    ├───────►│    signature     │           │
│ │    - CONSUMER_SECRET │        │    using         │           │
│ │                      │        │    CONSUMER_      │           │
│ │ 2. Create request    │        │    SECRET        │           │
│ │    with OAuth params │        │                  │           │
│ │                      │        │ 3. If valid:     │           │
│ │ 3. Sign with HMAC-   │        │    Return:       │           │
│ │    SHA1 (using       │        │    oauth_token   │           │
│ │    CONSUMER_SECRET)  │        │    oauth_token_  │           │
│ │                      │        │    secret        │           │
│ │ 4. Send Authorization│        │                  │           │
│ │    header to Garmin  │        │ ❌ If INVALID:   │           │
│ └──────────────────────┘        │ 401 UNAUTHORIZED │           │
│                                 │ Invalid signature│           │
│                                 └──────────────────┘           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │ ✅ SUCCESS                           │
        │ Return auth URL with oauth_token     │
        │ https://connect.garmin.com/oauthConf│
        │ irm?oauth_token=abc123              │
        │                                      │
        │ OR                                   │
        │                                      │
        │ ❌ FAILED (401 ERROR)                │
        │ Invalid signature for signature      │
        │ method HMAC-SHA1                     │
        └──────────────────────────────────────┘
```

## Where the 401 Error Happens

```
STEP 3: OAuth Signature Generation and Verification

YOUR SERVER:                              GARMIN API:
────────────────────────────────────────────────────────────────

1. Read credentials from env:
   GARMIN_CONSUMER_KEY = "abc123def456"
   GARMIN_CONSUMER_SECRET = "xyz789abc123xyz"

2. Create base string:
   "POST&https%3A%2F%2Fconnectapi.garmin.com%2Foauth..."
   + "oauth_callback=...&oauth_consumer_key=abc123..."
   + "oauth_nonce=...&oauth_timestamp=..."

3. Sign with HMAC-SHA1:
   signature = HMAC-SHA1(baseString, secret)
   → produces: "4k8x...abc123...xyz" (base64 encoded)

4. Send Authorization header:
   Authorization: OAuth oauth_consumer_key="abc123...",
                       oauth_signature="4k8x...abc123..."
   ──────────────────────────────────────────────────►
                                        
                                        5. Garmin receives request
                                           
                                        6. Garmin looks up your app
                                           using Consumer Key: "abc123..."
                                           
                                        7. Garmin gets YOUR registered
                                           Consumer Secret
                                           
                                        8. Garmin creates SAME base string
                                           
                                        9. Garmin signs with THEIR copy
                                           of your Consumer Secret:
                                           theirSignature = HMAC-SHA1(baseString, theirSecret)
                                           → produces: "4k8x...abc123...xyz"?
                                           
                                        10. Compare signatures:
                                            yourSignature == theirSignature?
                                            
                                            ✅ YES → Return 200 with tokens
                                            ❌ NO → Return 401 UNAUTHORIZED
                                                   "Invalid signature..."
                   ◄──────────────────────────────────
   5. Receive response

```

## Why You Get 401: Common Causes

### Cause 1: Missing Credentials
```
YOUR CODE:
const GARMIN_CONSUMER_KEY = process.env.GARMIN_CONSUMER_KEY;  // undefined!

If undefined → Can't create proper signature
→ Garmin rejects it
→ 401 UNAUTHORIZED
```

### Cause 2: Wrong Credentials
```
YOUR APP IN GARMIN PORTAL:
Consumer Key: abc123def456
Consumer Secret: xyz789abc123xyz

YOUR ENV VARS:
GARMIN_CONSUMER_KEY = "abc123def456"
GARMIN_CONSUMER_SECRET = "WRONG_SECRET"  ← Different!

Your signature: HMAC-SHA1(..., "WRONG_SECRET")
Garmin's signature: HMAC-SHA1(..., "xyz789abc123xyz")

They don't match → 401 UNAUTHORIZED
```

### Cause 3: Whitespace in Credentials
```
YOUR ENV VARS:
GARMIN_CONSUMER_KEY = " abc123def456"  ← Leading space!
GARMIN_CONSUMER_SECRET = "xyz789abc123xyz "  ← Trailing space!

Your signature uses: " abc123def456" and "xyz789abc123xyz "
Garmin expects: "abc123def456" and "xyz789abc123xyz"

They don't match → 401 UNAUTHORIZED
```

### Cause 4: Case Mismatch
```
YOUR ENV VARS:
GARMIN_CONSUMER_KEY = "ABC123DEF456"  ← Uppercase!

Garmin's registered key: "abc123def456"

Your signature uses: "ABC123DEF456"
Garmin expects: "abc123def456"

They don't match → 401 UNAUTHORIZED
```

## The Fix

### Check 1: Are credentials set?
```typescript
if (!GARMIN_CONSUMER_KEY || !GARMIN_CONSUMER_SECRET) {
  console.error("❌ Credentials not set!");
  // Solution: Add to Replit Secrets or .env
}
```

### Check 2: Are they correct?
```
In Garmin Developer Portal:
  Consumer Key: abc123def456
  Consumer Secret: xyz789abc123xyz

In your Replit Secrets (or .env):
  GARMIN_CONSUMER_KEY: abc123def456  ← Exact match?
  GARMIN_CONSUMER_SECRET: xyz789abc123xyz  ← Exact match?
```

### Check 3: Is there whitespace?
```
Copy/paste from Garmin Portal:
  ✅ Correct: abc123def456
  ❌ Wrong: " abc123def456" (has space!)
  ❌ Wrong: "abc123def456 " (has space!)
```

## Success Flow (After Fix)

```
1. User clicks "Connect Garmin"
   │
2. Phone app → Server: /api/auth/garmin/start
   │
3. Server loads credentials (✅ SET correctly)
   │
4. Server creates OAuth signature
   │
5. Server sends to Garmin with Authorization header
   │
6. Garmin verifies signature (✅ MATCHES!)
   │
7. Garmin returns oauth_token and oauth_token_secret
   │
8. Server returns auth URL to phone app
   │
9. Phone opens: https://connect.garmin.com/oauthConfirm?oauth_token=...
   │
10. User logs in on Garmin website
    │
11. Garmin redirects to: https://server/api/auth/garmin/callback?oauth_token=...&oauth_verifier=...
    │
12. Server exchanges oauth_verifier for access_token
    │
13. Access token stored in database
    │
14. Phone app redirected to: airuncoach://connected-devices
    │
15. ✅ Garmin is now connected!
```

## Your Implementation

**File**: `server/garmin-service.ts` lines 146-204

```typescript
// 1. Load credentials
const GARMIN_CONSUMER_KEY = process.env.GARMIN_CLIENT_ID;
const GARMIN_CONSUMER_SECRET = process.env.GARMIN_CLIENT_SECRET;

// 2. Check they're set
if (!GARMIN_CONSUMER_KEY || !GARMIN_CONSUMER_SECRET) {
  throw new Error('Credentials not set');
}

// 3. Create OAuth params
const oauthParams = {
  oauth_consumer_key: GARMIN_CONSUMER_KEY,
  oauth_nonce: crypto.randomBytes(16).toString('hex'),
  oauth_signature_method: 'HMAC-SHA1',
  oauth_timestamp: Math.floor(Date.now() / 1000),
  oauth_version: '1.0'
};

// 4. Build base string
const baseString = buildOAuth1BaseString('POST', GARMIN_REQUEST_TOKEN_URL, oauthParams);

// 5. Sign with HMAC-SHA1
const signature = signOAuth1(baseString, GARMIN_CONSUMER_SECRET, '');

// 6. Create Authorization header
const authHeader = buildOAuth1Header(oauthParams, signature);

// 7. Send to Garmin
const response = await fetch(GARMIN_REQUEST_TOKEN_URL, {
  method: 'POST',
  headers: { Authorization: authHeader }
});

// 8. Handle response
if (!response.ok) {
  // ❌ 401 UNAUTHORIZED means signature didn't match
  throw new Error(`401 — Invalid signature`);
}
```

## Action Items

- [ ] Get Consumer Key and Secret from Garmin Developer Portal
- [ ] Add `GARMIN_CONSUMER_KEY` to Replit Secrets (exact value, no spaces)
- [ ] Add `GARMIN_CONSUMER_SECRET` to Replit Secrets (exact value, no spaces)
- [ ] Restart server
- [ ] Test OAuth flow
- [ ] Watch logs for success: `Auth URL: https://connect.garmin.com/oauthConfirm?oauth_token=...`
- [ ] If still 401: Follow GARMIN_DIAGNOSTICS.md

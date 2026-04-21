# Quick Fix Checklist for Garmin 401 Error

## The Problem
```
❌ 401 Unauthorized — Invalid signature for signature method HMAC-SHA1
```

## The Solution (Follow in Order)

### Phase 1: Get Credentials (5 minutes)

- [ ] Go to https://developer.garmin.com/
- [ ] Log in (create account if needed)
- [ ] Click "My Applications"
- [ ] Click "Create New Application"
- [ ] Fill in form:
  - Name: "AI Run Coach"
  - Type: "Web"
  - OAuth: Select "1.0a" (⚠️ NOT 2.0!)
  - Callback URL: https://your-replit-url/api/auth/garmin/callback
- [ ] Copy **Consumer Key** somewhere safe
- [ ] Copy **Consumer Secret** somewhere safe

### Phase 2: Set Environment Variables (2 minutes)

**If using Replit:**
- [ ] Click 🔒 (Secrets) in left sidebar
- [ ] Click "New Secret"
- [ ] Key: `GARMIN_CONSUMER_KEY`
- [ ] Value: (paste Consumer Key from above)
- [ ] Click "Add Secret"
- [ ] Click "New Secret" again
- [ ] Key: `GARMIN_CONSUMER_SECRET`
- [ ] Value: (paste Consumer Secret from above)
- [ ] Click "Add Secret"

**If using .env file:**
- [ ] Create file `.env` in project root
- [ ] Add:
  ```
  GARMIN_CONSUMER_KEY=your_key_here
  GARMIN_CONSUMER_SECRET=your_secret_here
  ```

### Phase 3: Verify & Test (3 minutes)

- [ ] Restart your server (stop and start)
- [ ] Try to connect Garmin in your app
- [ ] Watch server logs for this line:
  ```
  [Garmin OAuth 1.0a] ✅ Credentials loaded
  ```
- [ ] Then watch for:
  ```
  [Garmin OAuth 1.0a] Auth URL: https://connect.garmin.com/oauthConfirm?oauth_token=...
  ```

**If you see the Auth URL:**
- ✅ **FIXED!** The 401 error is gone!

**If you still see 401:**
- [ ] Check `GARMIN_DIAGNOSTICS.md` for troubleshooting

---

## Verification Questions

### Q1: Did you copy the exact credentials (no spaces)?
- [ ] Yes, I copied exactly from Garmin Developer Portal
- [ ] No, I'm not sure → Go back and re-copy carefully

### Q2: Are credentials set in Replit Secrets or .env?
- [ ] Yes, I added them to Replit Secrets
- [ ] Yes, I added them to .env file
- [ ] No → Do Phase 2 above

### Q3: Did you restart the server after adding credentials?
- [ ] Yes, I restarted (stop and start)
- [ ] No → Stop and start your server now

### Q4: Does your callback URL match?
- [ ] Yes, my server URL matches what I registered in Garmin Portal
- [ ] No, I registered a different URL → Update in Garmin Portal

### Q5: Is the app status "Active" in Garmin Portal?
- [ ] Yes, status shows "Active"
- [ ] Status shows "Pending" → Wait a few hours for approval
- [ ] I'm not sure → Check "My Applications" in Garmin Portal

---

## Common Mistakes (Double-Check These)

- [ ] ❌ Used OAuth 2.0 credentials instead of 1.0a
  - Fix: Get 1.0a credentials from Garmin Portal

- [ ] ❌ Has leading/trailing spaces in credentials
  - Fix: Re-copy from Garmin, paste into Secrets, check for spaces

- [ ] ❌ Callback URL doesn't match
  - Fix: Copy exact URL from server logs, update in Garmin Portal

- [ ] ❌ Didn't restart server after setting env vars
  - Fix: Stop and start your server

- [ ] ❌ Created an app but it's still "Pending Approval"
  - Fix: Wait 24 hours for Garmin to approve

---

## Emergency Checklist

If you've done everything above and STILL getting 401:

- [ ] Open Replit Secrets and copy the Consumer Key
  - Does it look like random letters/numbers? ✅
  - Does it look like words? ❌ (Wrong credential type)

- [ ] Open Replit Secrets and copy the Consumer Secret
  - Does it look like random letters/numbers? ✅
  - Does it look like a password? ❌ (Wrong credential type)

- [ ] Check server logs during 401 error:
  ```
  [Garmin OAuth 1.0a] Consumer Key set: true
  [Garmin OAuth 1.0a] Consumer Secret set: true
  ```
  - Both true? ✅ (Go to GARMIN_DIAGNOSTICS.md)
  - One false? ❌ (Go back to Phase 2)

---

## Success Indicators

When the fix works, you'll see:

✅ Server logs show:
```
[Garmin OAuth 1.0a] ✅ Credentials loaded
[Garmin OAuth 1.0a] Requesting token from Garmin...
[Garmin OAuth 1.0a] Auth URL: https://connect.garmin.com/oauthConfirm?oauth_token=abc123...
```

✅ No 401 error

✅ You can click the Garmin auth link and log in

✅ After login, you get redirected back to your app

---

## Next Steps (After Fix)

Once 401 error is gone:

1. Complete the OAuth callback (log in on Garmin)
2. Verify token is stored in database
3. Verify Garmin data is syncing
4. Test activity upload (if implemented)

---

## Support

- Read: `GARMIN_FIX_SUMMARY.md` — Overview
- Read: `GARMIN_OAUTH_SETUP.md` — Detailed setup
- Read: `GARMIN_OAUTH_FLOW.md` — How OAuth works
- Read: `GARMIN_DIAGNOSTICS.md` — Troubleshooting
- Check: `server/garmin-service.ts` lines 146-204
- Check: `server/routes.ts` lines 2830-2875

---

**That's it! You've got this.** 🚀

Most 401 errors are just missing/wrong credentials. Once you set them, it should work.

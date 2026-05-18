# 🔐 Strava Integration - Replit Secrets Setup

## Using Replit Secrets Instead of .env

Since you're using Replit Secrets, here's the updated setup:

---

## Step 1: Create Strava API Application

1. Go to: https://www.strava.com/settings/api
2. Click "Create New Application"
3. Fill in:
   - **Name**: AI Run Coach
   - **Website**: https://airuncoach.com
   - **Category**: Training
4. Accept terms and create
5. **Copy these values**:
   - Client ID
   - Client Secret

---

## Step 2: Add to Replit Secrets

In your Replit project:

1. Click the **"Secrets"** icon (lock icon) in the left sidebar
2. Click **"Add new secret"**
3. Add **two secrets** (the redirect URI has a default value):

### Secret 1: STRAVA_CLIENT_ID
```
Key: STRAVA_CLIENT_ID
Value: [paste your Client ID from Strava]
```

### Secret 2: STRAVA_CLIENT_SECRET
```
Key: STRAVA_CLIENT_SECRET
Value: [paste your Client Secret from Strava]
```

**That's it!** ✅

The `STRAVA_REDIRECT_URI` has a default value of `https://api.airuncoach.com/strava/callback` built into the code, so you don't need to add it as a secret unless you want to override it.

**Only add the 3rd secret if:**
- Your Replit URL is different
- You want to customize the redirect URI
- You need a specific callback domain

Otherwise, just add the 2 secrets above and you're good to go!

---

## Step 3: Access Secrets in Code

The secrets are automatically available as environment variables. Your code already accesses them like this:

```typescript
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const STRAVA_REDIRECT_URI = process.env.STRAVA_REDIRECT_URI || 'https://api.airuncoach.com/strava/callback';
```

This code is **already in** `server/strava-oauth-service.ts`, so you don't need to change anything!

---

## Step 4: Verify Setup

Run your server:

```bash
npm run dev
```

If you see no errors about missing Strava credentials, you're good to go!

---

## Summary

✅ **What you need to do:**
1. Create Strava API app (5 min)
2. Add 3 secrets to Replit (2 min)
3. That's it!

No .env file needed, no code changes needed. Replit Secrets are perfect for this!

---

## Important Notes

- **Keep secrets private** - Never commit them to git
- **Replit handles this** - Secrets are never shown or logged
- **Access everywhere** - All services can access `process.env.STRAVA_*`
- **Auto-loaded** - Replit automatically makes them available

---

## Your Strava Secrets

Once you add them, you can verify they're working by checking that the OAuth endpoints work:

```bash
curl http://localhost:3000/api/strava/auth/authorize \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json"
```

Should return a response with an `authUrl` instead of a "credentials not configured" error.

---

**That's all you need!** 🎉

The backend will automatically use your Replit Secrets.

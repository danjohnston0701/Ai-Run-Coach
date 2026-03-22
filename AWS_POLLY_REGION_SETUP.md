# AWS Polly Region-Specific Configuration Guide

> **TL;DR:** Each voice now automatically routes to its optimal AWS region. The Irish voice now works properly, and New Zealand/Australian are set to `ap-southeast-2`. You only need to set region overrides if you want different behavior.

## Quick Setup

### Minimum Configuration (Recommended)

Just set your AWS credentials - regions are automatic:

```
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
```

That's it! The system will automatically route voices to their optimal regions.

### Full Configuration (If you need custom regions)

```
# AWS Credentials (REQUIRED)
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here

# Optional: Override default regions per accent
# (These are only needed if you want non-standard regions)

# EU Accents (default: eu-west-1)
AWS_REGION_BRITISH=eu-west-1
AWS_REGION_IRISH=eu-west-1          # ⚠️ MUST be eu-west-1 or us-east-1
AWS_REGION_SOUTH_AFRICAN=eu-west-1
AWS_REGION_INDIAN=eu-west-1

# AP-Pacific Accents (default: ap-southeast-2)
AWS_REGION_AUSTRALIAN=ap-southeast-2  # ⚠️ MUST be ap-southeast-2 or us-east-1
AWS_REGION_NEW_ZEALAND=ap-southeast-2 # ⚠️ MUST be ap-southeast-2 or us-east-1

# US Accent (default: us-east-1)
AWS_REGION_AMERICAN=us-east-1
```

## How It Works

### Default Routing (Automatic)

When you synthesize speech, the system routes to the optimal region:

```
voice="irish"        → uses eu-west-1 (Irish voice only available here)
voice="new_zealand"  → uses ap-southeast-2 (Aria only available here)
voice="australian"   → uses ap-southeast-2 (Olivia/Stephen only available here)
voice="british"      → uses eu-west-1
voice="american"     → uses us-east-1
```

### Custom Routing (If Needed)

You can override any default by setting environment variables:

```bash
# Force Australian to use us-east-1 instead of ap-southeast-2
export AWS_REGION_AUSTRALIAN=us-east-1

# Force Irish to use us-east-1 instead of eu-west-1
export AWS_REGION_IRISH=us-east-1
```

## Region Constraints

Some voices **only work in specific regions** - don't change these:

| Voice | Only Works In |
|-------|---------------|
| **Sean** (Irish male) | eu-west-1, us-east-1 |
| **Niamh** (Irish female) | eu-west-1, us-east-1 |
| **Aria** (New Zealand) | ap-southeast-2, us-east-1 |
| **Olivia** (Australian female) | ap-southeast-2, us-east-1 |
| **Stephen** (Australian male) | ap-southeast-2, us-east-1 |
| **Ayanda** (South African) | eu-west-1, us-east-1 |
| **Kajal** (Indian) | eu-west-1, us-east-1 |

If you try to use a voice in a region that doesn't support it (e.g., Irish in `ap-southeast-2`), the synthesis will fail and fall back to OpenAI.

## Implementation Details

### How the Code Works

The code in `server/polly-service.ts` now:

1. **Determines region based on accent**
   ```typescript
   const region = getRegionForAccent(accent)
   // Returns: eu-west-1 for irish, ap-southeast-2 for new_zealand, etc.
   ```

2. **Creates/reuses regional Polly clients**
   ```typescript
   const pollyClient = getPollyClient(region)
   // Reuses existing client for that region or creates new one
   ```

3. **Synthesizes with the regional client**
   ```typescript
   const response = await pollyClient.send(command)
   // Uses client configured for the correct region
   ```

### Per-Region Client Caching

The system maintains a cache of Polly clients by region:
- First call for `eu-west-1` → creates client
- Second call for `eu-west-1` → reuses existing client
- First call for `ap-southeast-2` → creates new client
- Subsequent calls → reuse appropriate client

This improves performance by avoiding unnecessary client recreation.

## Examples

### Example 1: Irish Coach (Default)
```javascript
synthesizeSpeech(
  "Keep pushing, you've got this!",
  accent="irish",    // → routes to eu-west-1
  gender="male"      // → uses Sean
)
```

### Example 2: New Zealand Coach (Default)
```javascript
synthesizeSpeech(
  "Great effort out there!",
  accent="new_zealand",  // → routes to ap-southeast-2
  gender="female"        // → uses Aria
)
```

### Example 3: Australian Coach (Override Region)
```bash
# Set environment variable
export AWS_REGION_AUSTRALIAN=us-east-1
```

```javascript
synthesizeSpeech(
  "You're running strong!",
  accent="australian",   // → routes to us-east-1 (overridden)
  gender="female"        // → uses Olivia
)
```

## Testing Your Setup

To verify everything is working:

1. **Check Replit Secrets** (or your `.env` file):
   ```
   AWS_ACCESS_KEY_ID=xxx
   AWS_SECRET_ACCESS_KEY=xxx
   ```

2. **Make a request with Irish voice:**
   ```bash
   curl http://localhost:3000/api/tts \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "text": "Hello from Ireland!",
       "accent": "irish",
       "gender": "male"
     }'
   ```

3. **Check server logs** - you should see:
   ```
   Polly TTS synthesis: irish voice (Sean) in region eu-west-1
   ```

4. **Try New Zealand:**
   ```bash
   curl http://localhost:3000/api/tts \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "text": "Hello from New Zealand!",
       "accent": "new_zealand",
       "gender": "female"
     }'
   ```

5. **Check server logs:**
   ```
   Polly TTS synthesis: new_zealand voice (Aria) in region ap-southeast-2
   ```

## Troubleshooting

### New Zealand voice not working?
- ✅ Check `AWS_REGION_NEW_ZEALAND=ap-southeast-2` (not eu-west-1)
- ✅ Verify AWS credentials are correct
- ✅ Check AWS IAM user has `polly:SynthesizeSpeech` permission
- ✅ Look at server logs for the actual error

### Irish voice not working?
- ✅ Check `AWS_REGION_IRISH=eu-west-1` (not ap-southeast-2)
- ✅ Verify AWS credentials are correct
- ✅ Check AWS IAM user has `polly:SynthesizeSpeech` permission

### Need to debug which region is being used?
1. Check server logs - should show region being used
2. Look for lines like: `Polly TTS synthesis: irish voice (Sean) in region eu-west-1`
3. If region is wrong, set the appropriate override variable

## Summary

✅ **Before your changes:** All voices used one region (eu-west-1 or ap-southeast-2)  
✅ **After your changes:** Each voice uses its optimal region automatically  
✅ **Irish voice:** Now correctly uses eu-west-1  
✅ **New Zealand voice:** Now correctly uses ap-southeast-2  
✅ **Australian voices:** Now correctly use ap-southeast-2  
✅ **All other voices:** Route to optimal regions automatically  

**No code changes needed in your applications** - the routing is transparent!

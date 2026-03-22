# AWS Polly Neural TTS Integration

## Overview

Your AI Run Coach now supports **AWS Polly Neural TTS** for authentic regional English accents with native speakers. This replaces OpenAI TTS with superior voice quality and true regional characteristics.

## Setup Instructions

### 1. Create AWS Account & Get Credentials

1. Go to [AWS Console](https://console.aws.amazon.com)
2. Navigate to **IAM** → **Users**
3. Create a new IAM user with these permissions:
   - `polly:SynthesizeSpeech` (required)
   - `polly:DescribeVoices` (optional, for management)
4. Generate **Access Key ID** and **Secret Access Key**
5. Keep these credentials secure

### 2. Configure Environment Variables

Add these to your **Replit Secrets** (or `.env` file for local development):

```
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
```

**Per-Voice Region Configuration (Optional):**

Each voice is automatically routed to its optimal AWS region. You can override defaults per accent using these environment variables:

```
# EU accents (default to eu-west-1)
AWS_REGION_BRITISH=eu-west-1          # Brian, Amy
AWS_REGION_IRISH=eu-west-1            # Sean, Niamh (only works in eu-west-1)
AWS_REGION_SOUTH_AFRICAN=eu-west-1    # Ayanda (only works in eu-west-1)
AWS_REGION_INDIAN=eu-west-1           # Kajal (only works in eu-west-1)

# AP-Pacific accents (default to ap-southeast-2)
AWS_REGION_AUSTRALIAN=ap-southeast-2  # Stephen, Olivia
AWS_REGION_NEW_ZEALAND=ap-southeast-2 # Aria (only works in ap-southeast-2)

# US accent (default to us-east-1)
AWS_REGION_AMERICAN=us-east-1         # Matthew, Joanna
```

**Default Region Mapping:**
| Accent | Default Region | Available Regions |
|--------|---------------|--------------------|
| **Irish** | eu-west-1 | eu-west-1, us-east-1 only |
| **British** | eu-west-1 | eu-west-1, us-east-1 |
| **South African** | eu-west-1 | eu-west-1, us-east-1 only |
| **Indian** | eu-west-1 | eu-west-1, us-east-1 only |
| **Australian** | ap-southeast-2 | ap-southeast-2, us-east-1 |
| **New Zealand** | ap-southeast-2 | ap-southeast-2, us-east-1 only |
| **American** | us-east-1 | us-east-1, eu-west-1, ap-southeast-2 |

> ⚠️ **Important:** 
> - **Irish, South African, Indian** Neural voices are **ONLY** available in `eu-west-1` and `us-east-1`
> - **New Zealand (Aria)** is **ONLY** available in `ap-southeast-2` and `us-east-1`
> - **Australian (Olivia, Stephen)** are **ONLY** available in `ap-southeast-2` and `us-east-1`
> - Using the wrong region for these voices will cause synthesis to fail and fall back to OpenAI

### 3. Verify Setup

The system will automatically:
- ✅ Check for AWS credentials on startup
- ✅ Use Polly if configured
- ✅ Fall back to OpenAI if Polly is unavailable
- ✅ Log which TTS engine is being used

## Supported Voices

Your AI Coach now supports **7 authentic English accents** via AWS Polly Neural:

| Accent | Language | Male Voice | Female Voice | Notes |
|--------|----------|-----------|--------------|-------|
| **British** | en-GB | Brian | Amy | |
| **American** | en-US | Matthew | Joanna | |
| **Australian** | en-AU | Stephen | Olivia | Russell is Standard-only (not Neural) |
| **Irish** | en-IE | Sean | Niamh | |
| **South African** | en-ZA | Ayanda | Ayanda | Only one Neural voice available |
| **Indian** | en-IN | Kajal | Kajal | Only one Neural voice available |
| **New Zealand** | en-NZ | Aria | Aria | No male Neural NZ voice exists |

## Features

✅ **Native Speaker Quality** - All voices recorded by native speakers  
✅ **Neural Engine** - High-quality neural synthesis  
✅ **Automatic Fallback** - Falls back to OpenAI if Polly unavailable  
✅ **Logging** - Console logs show which TTS engine is being used  
✅ **No Breaking Changes** - Existing code continues to work  

## Cost Estimate

**AWS Polly Pricing** (as of 2025):
- Standard voices: $0.016 per 1M characters
- Neural voices: $0.0275 per 1M characters

**Per coaching session** (~20 messages, ~3000 characters):
- Estimated: **~$0.08 per run**

**Per active user per month** (10 runs):
- Estimated: **~$0.80 per user**

**Compared to OpenAI**: About 2-3x more expensive, but vastly superior voice quality

## Fallback Behavior

If AWS credentials are not configured:
1. System logs: `[TTS] Polly is not configured, using OpenAI TTS`
2. All TTS calls automatically fall back to OpenAI's `gpt-4o-mini-tts`
3. No errors or warnings - seamless fallback
4. Users with OpenAI TTS will notice slightly different voice characteristics

## Troubleshooting

### "Polly synthesis failed for Irish/New Zealand/Australian voices"
This typically means the voice is being synthesized in the wrong region.

**Solution:**
1. Check that your region overrides are set correctly:
   - Irish → must use `eu-west-1` (not `ap-southeast-2`)
   - New Zealand → must use `ap-southeast-2` (not `eu-west-1`)
   - Australian → must use `ap-southeast-2` (not `eu-west-1`)

2. Example fix for New Zealand (Aria):
   ```
   AWS_REGION_NEW_ZEALAND=ap-southeast-2
   ```

3. Example fix for Irish (Sean, Niamh):
   ```
   AWS_REGION_IRISH=eu-west-1
   ```

### "Polly synthesis failed, falling back to OpenAI"
- ✅ Check AWS credentials are set in environment
- ✅ Verify the accent's region is correct (see table above)
- ✅ Check AWS IAM user has `polly:SynthesizeSpeech` permission
- ✅ Ensure accent parameter is valid
- ✅ Check AWS account has not exceeded Polly quota
- ✅ Verify internet connectivity to AWS

### "No audio stream returned from Polly"
- Verify the selected region supports the voice (see default region mapping table)
- Check AWS account has not exceeded Polly quota
- Verify internet connectivity to AWS
- Check AWS IAM credentials have proper permissions

### Regional Voice Availability Reference
**If these fail, it's likely a region mismatch:**

```
Irish (Sean/Niamh)         → ONLY eu-west-1 or us-east-1
New Zealand (Aria)         → ONLY ap-southeast-2 or us-east-1
Australian (Olivia/Stephen) → ONLY ap-southeast-2 or us-east-1
British (Brian/Amy)         → eu-west-1, us-east-1, ap-southeast-2
American (Matthew/Joanna)   → eu-west-1, us-east-1, ap-southeast-2
South African (Ayanda)      → ONLY eu-west-1 or us-east-1
Indian (Kajal)              → ONLY eu-west-1 or us-east-1
```

## Architecture

```
User requests TTS audio with accent (e.g., "irish", "new_zealand")
    ↓
Is Polly configured? 
    ├─ YES → Determine optimal AWS region for accent
    │        ├─ Irish → eu-west-1 (or override with AWS_REGION_IRISH)
    │        ├─ New Zealand → ap-southeast-2 (or override with AWS_REGION_NEW_ZEALAND)
    │        ├─ Australian → ap-southeast-2 (or override with AWS_REGION_AUSTRALIAN)
    │        └─ etc.
    │        ↓
    │        Create region-specific Polly client
    │        ↓
    │        Synthesize with Neural voice using optimal region
    │        (Sean/Niamh for Irish, Aria for NZ, Olivia/Stephen for Australian)
    │
    └─ NO  → Fall back to OpenAI gpt-4o-mini-tts
    ↓
Return audio as base64 MP3
```

### Per-Region Client Management

The system automatically manages separate AWS Polly clients for each region:
- **One client per region** (lazy-initialized on first use)
- **Shared credentials** across all region clients
- **Automatic routing** based on accent
- **Client reuse** for performance (no recreating clients for same region)

## Future Improvements

Potential enhancements:
- [ ] Add voice selection UI (choose specific voice, not just accent/gender)
- [ ] Implement caching for repeated messages
- [ ] Add pitch/rate adjustments via SSML
- [ ] Support for other languages beyond English
- [ ] Analytics on TTS engine usage

## References

- [AWS Polly Documentation](https://docs.aws.amazon.com/polly/)
- [AWS Polly Voices](https://docs.aws.amazon.com/polly/latest/dg/VoicesList.html)
- [AWS SDK for Node.js](https://docs.aws.amazon.com/sdk-for-javascript/)
- [Pricing Calculator](https://aws.amazon.com/polly/pricing/)

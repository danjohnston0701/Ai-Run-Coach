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
AWS_REGION=eu-west-1
```

**Region Options:**
- `eu-west-1` (EU - Ireland) ← **Default, required for Irish/NZ/Indian/South African neural voices**
- `us-east-1` (US East) — also supports all neural voices
- `ap-southeast-2` (Australia - Sydney) — **does NOT support Irish, NZ, Indian, South African neural voices**

> ⚠️ **Important:** The Irish (Sean, Niamh), New Zealand (Aria), South African (Ayanda), and Indian (Kajal) Neural voices are only available in `eu-west-1` and `us-east-1`. Using `ap-southeast-2` will cause these voices to fail and fall back to OpenAI.

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

### "Polly synthesis failed, falling back to OpenAI"
- ✅ Check AWS credentials are set in environment
- ✅ Verify AWS_REGION is correct
- ✅ Check AWS IAM user has `polly:SynthesizeSpeech` permission
- ✅ Ensure accent parameter is valid

### "No audio stream returned from Polly"
- Check AWS account has not exceeded Polly quota
- Verify internet connectivity to AWS

### Region Selection
- **For users in Australia**: Use `ap-southeast-2` (lowest latency)
- **For global users**: Use `us-east-1` (most available)

## Architecture

```
User requests TTS audio
    ↓
Is Polly configured? 
    ├─ YES → Use AWS Polly Neural with authentic voice
    │         (Brian/Amy for British, Matthew/Joanna for American, etc.)
    └─ NO  → Fall back to OpenAI gpt-4o-mini-tts
    ↓
Return audio as base64 MP3
```

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

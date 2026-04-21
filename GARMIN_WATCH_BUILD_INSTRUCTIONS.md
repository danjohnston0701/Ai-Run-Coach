# Building the Garmin Watch App (.iq file)

## Current Status

The Garmin watch app source is at: `garmin-companion-app/`

**Last compiled:** April 19, 2026  
**Latest source changes:** 
- `d766bf8` - Restore Garmin OAuth 2.0 (revert failed OAuth 1.0a rewrite)
- `70e740c` - GPS wait screen on Garmin watch + fix Garmin OAuth 500 error

**Note:** The `.iq` file needs to be rebuilt to include these changes.

## Prerequisites

The build requires the **Garmin ConnectIQ SDK** to be installed locally:

### On macOS:

1. **Download the SDK:**
   ```bash
   # Go to https://developer.garmin.com/connect-iq/download/
   # Download the macOS version
   ```

2. **Extract and setup:**
   ```bash
   # Usually extracts to ~/GarminSDK or similar
   # Follow Garmin's setup guide
   ```

3. **Add to PATH:**
   ```bash
   # Add to ~/.zshrc:
   export PATH="$PATH:~/GarminSDK/bin"
   
   # Then:
   source ~/.zshrc
   ```

4. **Verify installation:**
   ```bash
   monkeyc --version
   ```

## Building the App

Once the SDK is installed:

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
bash build-watch-app.sh
```

This will:
1. ✅ Verify the Garmin SDK is installed
2. ✅ Generate developer keys (if needed)
3. ✅ Compile for multiple device types
4. ✅ Create `bin/AiRunCoach.prg` (universal package)
5. ✅ Create device-specific `.prg` files

## Output Files

**Universal Package** (compatible with all devices):
- `garmin-companion-app/bin/AiRunCoach.prg`

**Device-specific builds:**
- `garmin-companion-app/bin/AiRunCoach-fenix7.prg`
- `garmin-companion-app/bin/AiRunCoach-fenix6pro.prg`
- `garmin-companion-app/bin/AiRunCoach-forerunner955.prg`
- And others...

## After Building

### Option 1: Upload to Connect IQ Store
```
1. Go to https://apps.garmin.com/developer/
2. Upload: garmin-companion-app/bin/AiRunCoach.prg
3. Add screenshots and description
4. Submit for review
```

### Option 2: Test on Simulator
```bash
connectiq
# Then in the app:
# File → Load Device → fenix7
# File → Load App → garmin-companion-app/bin/AiRunCoach.prg
```

### Option 3: Test on Real Device
```bash
# First, enable Developer Mode on watch:
# Settings → System → About
# Tap top number 5 times

# Then deploy:
monkeydo garmin-companion-app/bin/AiRunCoach-fenix7.prg fenix7
```

## Troubleshooting

**Error: "monkeyc: command not found"**
- The Garmin SDK is not installed or not in PATH
- Run `which monkeyc` to verify
- Add to `.zshrc` and `source ~/.zshrc`

**Build fails for specific devices**
- This is normal if the SDK doesn't have all device definitions
- The universal package (`AiRunCoach.prg`) should still work for all devices

**Key already exists**
- Delete `garmin-companion-app/developer_key.der` and `developer_key.pem`
- Rerun the build script to generate new keys

## Related Files

- **Source code:** `garmin-companion-app/source/`
- **Build config:** `garmin-companion-app/monkey.jungle`
- **Manifest:** `garmin-companion-app/manifest.xml`
- **Build script:** `build-watch-app.sh`

## Next Steps

1. **Install Garmin SDK** (requires developer account at developer.garmin.com)
2. **Run build script:** `bash build-watch-app.sh`
3. **Upload to Connect IQ Store** or test on device

# Build New IQ File for Elite Watch UI — Step-by-Step

## ⚠️ Current Status

The Garmin SDK (`monkeyc` compiler) is **NOT installed** on your system.

You have two options:
1. **Install Garmin SDK locally** (recommended)
2. **Use Docker** (if you prefer containerization)

---

## Option 1: Install Garmin SDK (Recommended)

### Step 1: Download SDK
Visit: https://developer.garmin.com/connect-iq/sdk/

1. Go to the Garmin Developer Portal
2. Download the Connect IQ SDK for **macOS**
3. The file will be something like: `connectiq-sdk-mac-5.x.x.dmg`

### Step 2: Install
```bash
# Mount the DMG
hdiutil attach ~/Downloads/connectiq-sdk-mac-5.x.x.dmg

# Copy to Applications
cp -r /Volumes/ConnectIQ\ SDK/ConnectIQ\ SDK /Applications/

# Unmount
hdiutil detach /Volumes/ConnectIQ\ SDK

# Add to PATH in ~/.zshrc or ~/.bash_profile
echo 'export PATH="/Applications/ConnectIQ SDK/bin:$PATH"' >> ~/.zshrc

# Reload shell
source ~/.zshrc

# Verify installation
monkeyc -v  # Should show version info
```

### Step 3: Test Installation
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app
monkeyc -v
# Should output something like: "Monkey C Compiler version 5.x.x"
```

---

## Once SDK is Installed: Build the IQ File

### Step 1: Navigate to project
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app
```

### Step 2: Run build command
```bash
rm -f bin/AiRunCoach.iq && \
monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r \
  2>&1 | tail -20 && \
ls -lh bin/AiRunCoach.iq
```

### Step 3: Verify output
You should see:
```
55 OUT OF 55 DEVICES BUILT
BUILD SUCCESSFUL
-rw-r--r--  1 user  staff  1.0M  Apr 29 12:34 bin/AiRunCoach.iq
```

### Step 4: Check file type
```bash
file bin/AiRunCoach.iq
# Should show: "7-zip archive data"
```

---

## What This Build Does

✅ **Compiles** all Monkey C source code
✅ **Processes** resources (icons, strings, layouts)
✅ **Signs** the app with your developer key (`developer_key.der`)
✅ **Packages** as proper 7-zip for Garmin Store
✅ **Optimizes** with `-r` flag (release, no debug symbols)
✅ **Supports** 55 Garmin watch models (Fenix, VivoActive, FR series, etc.)

---

## Build Flags Explained

| Flag | Meaning | Purpose |
|------|---------|---------|
| `-o bin/AiRunCoach.iq` | Output file | Where to save compiled app |
| `-f monkey.jungle` | Config file | Build configuration with device list |
| `-y developer_key.der` | Developer key | Private key to sign app (yours is already in repo) |
| `-e` | **Package-app (CRITICAL)** | Creates 7-zip format for Garmin Store |
| `-r` | Release build | Strips debug symbols, smaller file size |

**⚠️ The `-e` flag is CRITICAL** — without it, the file won't be recognized by Garmin Store.

---

## Troubleshooting

### "monkeyc: command not found"
```bash
# SDK not installed or not in PATH
# Solution: Complete the installation steps above, then:
source ~/.zshrc
monkeyc -v
```

### "The app ID within the manifest file deviates..."
```bash
# App ID mismatch between manifest.xml and Garmin Developer Portal
# Verify:
cat garmin-companion-app/manifest.xml | grep "id="
# It should match the ID in your portal app registration
```

### "file is 126 KB instead of 1.0 MB"
```bash
# Missing -e flag
# Solution: Always use: monkeyc ... -e -r
```

### "File type is 'data' instead of '7-zip'"
```bash
# You didn't use the -e flag
# Solution: Rebuild with -e flag
```

---

## Upload to Garmin Store

Once build is successful:

1. Go to: https://apps.garmin.com/en-US/developer/
2. Log in with your Garmin Developer account
3. Find **"AI Run Coach"** app by ID: `F05F6F7A3B2347668CCACE4B043DB794`
4. Click **"Update App"** or **"Submit New Version"**
5. Upload the `bin/AiRunCoach.iq` file
6. Fill in release notes:
   ```
   v2.X.X - Elite Watch UI Redesign
   
   Improvements:
   • Dramatic visual hierarchy with massive hero timer
   • Premium golden coaching cue overlay
   • Refined typography and spacing
   • Enhanced animations (timer cyan flash, paused pulse)
   • New glance footer (date, battery, GPS)
   • Professional, elite sports watch aesthetic
   
   All Garmin watches now supported with beautiful UI.
   ```
7. Submit for review

---

## Version Bumping

Before uploading a new version, increment the version in manifest.xml:

```bash
cd garmin-companion-app
nano manifest.xml

# Change this line:
# <iq:application ... version="2.0.0">
# To:
# <iq:application ... version="2.1.0">

# Save and close (Ctrl+X, Y, Enter)

# Then rebuild
rm -f bin/AiRunCoach.iq && monkeyc ... -e -r
```

---

## Summary

### To Build:
1. ✅ Install Garmin SDK (one-time setup)
2. ✅ Run `monkeyc ... -e -r` command
3. ✅ Verify `bin/AiRunCoach.iq` is ~1.0 MB
4. ✅ Verify file type is "7-zip"
5. ✅ Upload to Garmin Developer Portal

### Expected Result:
```
Elite Watch UI with:
✓ Hero timer at top (NUMBER_HOT, massive)
✓ Cyan flash on high intensity zones
✓ Golden coaching cue overlay
✓ Glance footer (date, battery, GPS)
✓ Pulsing paused animation
✓ Perfect visual hierarchy
✓ Professional, premium aesthetic
```

---

## Need Help?

If SDK installation fails:
1. Check: https://developer.garmin.com/connect-iq/sdk/
2. Verify your macOS version is compatible
3. Ensure you have space (SDK is ~3 GB)
4. Try: `brew install garmin-connectiq-sdk` (if available)

Once installed, the build command is straightforward! 🚀

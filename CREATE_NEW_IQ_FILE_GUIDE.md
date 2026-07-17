# How to Create a New IQ File for Garmin Connect IQ Store

This guide walks you through building a new `.iq` file for the AI Run Coach Garmin watch app that's ready for submission to the Garmin Connect IQ Store.

---

## Prerequisites

Before you start, you need:

1. **Garmin Connect IQ SDK** installed on your machine
   - Download from: https://developer.garmin.com/connect-iq/sdk/
   - Must be installed locally (not available via this build system)

2. **Your developer key** (already in the repo)
   - Located at: `garmin-companion-app/developer_key.der`
   - This is used to cryptographically sign your app

3. **Source code** (already in the repo)
   - Monkey C source files in `garmin-companion-app/source/`
   - Resources in `garmin-companion-app/resources/`

---

## Step 1: Install Garmin SDK (One-Time Setup)

### On macOS:

```bash
# 1. Download the SDK from Garmin
# Visit: https://developer.garmin.com/connect-iq/sdk/
# Download "ConnectIQ SDK for macOS" (~3 GB)

# 2. Mount and install
hdiutil attach ~/Downloads/connectiq-sdk-mac-*.dmg
cp -r /Volumes/ConnectIQ\ SDK/ConnectIQ\ SDK /Applications/
hdiutil detach /Volumes/ConnectIQ\ SDK

# 3. Add to PATH
echo 'export PATH="/Applications/ConnectIQ SDK/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 4. Verify installation
monkeyc -v
# Should output: "Monkey C Compiler version X.X.X"
```

### On Windows:

```bash
# 1. Download the SDK from Garmin
# Visit: https://developer.garmin.com/connect-iq/sdk/
# Download "ConnectIQ SDK for Windows" (~3 GB)

# 2. Run the installer
# Double-click connectiq-sdk-windows-*.exe
# Follow the installer

# 3. Verify installation
monkeyc -v
```

### On Linux:

```bash
# 1. Download the SDK from Garmin
# Visit: https://developer.garmin.com/connect-iq/sdk/
# Download "ConnectIQ SDK for Linux" (~3 GB)

# 2. Extract and add to PATH
tar -xzf connectiq-sdk-linux-*.tar.gz
mv connectiq-sdk-linux-* ~/connectiq-sdk
echo 'export PATH="$HOME/connectiq-sdk/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# 3. Verify installation
monkeyc -v
```

---

## Step 2: Update Version Number

Before building, update the app version in the manifest file.

### Edit the manifest:

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app
nano manifest.xml
```

### Find this line:
```xml
<iq:application ... version="3.1.8">
```

### Change to your new version:
```xml
<iq:application ... version="3.1.9">
```

**Version numbering** follows semantic versioning:
- `3.1.9` = Major.Minor.Patch
- Increment patch for bug fixes
- Increment minor for new features
- Increment major for breaking changes

### Save and exit:
- Press `Ctrl+X`
- Press `Y` to confirm
- Press `Enter` to save

---

## Step 3: Build the IQ File

Navigate to the garmin-companion-app directory and run the build command:

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

# Clean previous build (optional but recommended)
rm -f bin/AiRunCoach.iq

# Build for all 24 supported Garmin devices
monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r
```

### What each flag does:

| Flag | Purpose |
|------|---------|
| `-o bin/AiRunCoach.iq` | Output file location |
| `-f monkey.jungle` | Build configuration (device list) |
| `-y developer_key.der` | Your private signing key |
| `-e` | **CRITICAL** — creates 7-zip format for Store |
| `-r` | Release build (strips debug symbols, smaller) |

**⚠️ The `-e` flag is absolutely critical.** Without it, the Garmin Store will reject your upload.

---

## Step 4: Verify the Build Succeeded

You should see output like:

```
........
Compiling for fenix7x...
Compiling for fr55...
Compiling for fr255...
Compiling for fr265...
Compiling for fr945...
Compiling for fr955...
Compiling for fr965...
Compiling for vivoactive4...
Compiling for vivoactive5...
Compiling for venu...
Compiling for venu2...
Compiling for venu2plus...
Compiling for venu3...

BUILD SUCCESSFUL
```

### Verify the output file:

```bash
# Check file size (should be ~1.0-1.8 MB)
ls -lh bin/AiRunCoach.iq

# Check file type (should be "7-zip archive data")
file bin/AiRunCoach.iq

# List contents (should see BUNDLE-METADATA and base/ folder)
unzip -l bin/AiRunCoach.iq | head -30
```

---

## Step 5: Upload to Garmin Store

Once you have a successful build:

1. **Go to Garmin Developer Portal:**
   - Visit: https://apps.garmin.com/developer/dashboard
   - Log in with your Garmin Developer account

2. **Find your app:**
   - Search for "AI Run Coach"
   - App ID: `C7BF12555C184F9FB1F82B49E72E20A2`

3. **Upload the new version:**
   - Click "Edit" → "New Version"
   - Click "Upload Binary"
   - Select `bin/AiRunCoach.iq` from your computer
   - The portal auto-reads the version from the manifest

4. **Add release notes:**

   ```
   v3.1.9 - Bug Fixes and Improvements
   
   Improvements:
   • Fixed [your fix]
   • Improved [your improvement]
   • Added [your new feature]
   
   All Garmin watches (24 models) fully supported.
   ```

5. **Submit for review:**
   - Click "Submit for Review" (not just "Save Draft")
   - You'll receive an approval email (typically 1-2 hours)

---

## Supported Devices

Your app compiles for **24 Garmin watch models**:

### Fenix Series:
- Fenix 6, 6 Pro, 6S, 6S Pro, 6X Pro
- Fenix 7, 7S, 7X, 7 Pro, 7S Pro, 7X Pro

### Forerunner Series:
- FR 55, 245, 255, 265
- FR 945, 955, 965

### VivoActive Series:
- VivoActive 4, 5

### Venu Series:
- Venu, Venu 2, Venu 2 Plus, Venu 3

---

## Troubleshooting

### "monkeyc: command not found"
```bash
# SDK not installed or not in PATH
# Solution:
source ~/.zshrc  # Reload your shell
monkeyc -v       # Verify it works
```

### Build output is 126 KB (too small)
```bash
# You forgot the -e flag
# Solution: Rebuild with: monkeyc ... -e -r
```

### File type shows "data" instead of "7-zip"
```bash
# You didn't use the -e flag
# Solution: Rebuild with -e flag
file bin/AiRunCoach.iq  # Should say "7-zip archive data"
```

### "The app ID within the manifest file deviates..."
```bash
# App ID mismatch with Garmin portal
# Verify your manifest app ID:
grep 'id="' garmin-companion-app/manifest.xml | head -1
# It should be: C7BF12555C184F9FB1F82B49E72E20A2
```

### "BUILD FAILED" with cryptic error
```bash
# Common causes:
# 1. Syntax error in source code
# 2. Missing resource file
# 3. Invalid manifest.xml

# Check for syntax errors:
monkeyc ... 2>&1 | grep -i error

# Validate manifest:
cat garmin-companion-app/manifest.xml | head -5
```

---

## Full Build Script (Optional)

If you want to automate the process, create a script:

```bash
#!/bin/bash

set -e

cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

echo "🏗️  Building AI Run Coach IQ File..."

# Verify SDK is installed
if ! command -v monkeyc &> /dev/null; then
    echo "❌ Garmin SDK not installed!"
    echo "Visit: https://developer.garmin.com/connect-iq/sdk/"
    exit 1
fi

echo "✅ SDK found: $(monkeyc -v)"

# Clean previous build
rm -f bin/AiRunCoach.iq

# Build
echo "🔨 Compiling for 24 devices..."
monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r

# Verify output
if [ -f bin/AiRunCoach.iq ]; then
    SIZE=$(ls -lh bin/AiRunCoach.iq | awk '{print $5}')
    TYPE=$(file bin/AiRunCoach.iq | grep -o "7-zip\|data")
    echo "✨ BUILD SUCCESSFUL!"
    echo "📦 Output: bin/AiRunCoach.iq"
    echo "📊 Size: $SIZE"
    echo "📝 Type: $TYPE archive"
    echo ""
    echo "Next: Upload to https://apps.garmin.com/developer/dashboard"
else
    echo "❌ BUILD FAILED - IQ file not created"
    exit 1
fi
```

Save as `build-iq.sh` and run:
```bash
bash build-iq.sh
```

---

## Important Notes

✅ **The manifest, developer key, and monkey.jungle are already configured correctly**
- Don't modify `manifest.xml` structure
- Don't move `developer_key.der`
- Don't edit `monkey.jungle` device list

✅ **The build includes all source files**
- `source/AiRunCoachApp.mc` (main app)
- `source/views/*.mc` (UI screens)
- `source/networking/*.mc` (backend communication)
- `resources/` (icons, strings, layouts)

✅ **Version numbering matters**
- Each upload must have a unique version
- Garmin Store rejects duplicate versions
- Always increment before submitting

---

## Summary

### Quick Reference:

```bash
# 1. Install SDK (one-time)
brew install garmin-connectiq-sdk  # or download from Garmin

# 2. Update version
nano garmin-companion-app/manifest.xml
# Change version="X.X.X" to version="X.X.Y"

# 3. Build
cd garmin-companion-app
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r

# 4. Verify
file bin/AiRunCoach.iq
ls -lh bin/AiRunCoach.iq

# 5. Upload
# Go to: https://apps.garmin.com/developer/dashboard
# Select "AI Run Coach" → "New Version" → Upload bin/AiRunCoach.iq
```

### Expected Result:
- ✅ IQ file created at `garmin-companion-app/bin/AiRunCoach.iq`
- ✅ File size: 1.0-1.8 MB
- ✅ File type: 7-zip archive
- ✅ Ready for Garmin Store upload
- ✅ Supports all 24 Garmin watch models

---

## Getting Help

- **Garmin SDK Issues:** https://developer.garmin.com/connect-iq/sdk/
- **Monkey C Reference:** https://developer.garmin.com/connect-iq/api-docs/Monkey-C/
- **Store Submission:** https://apps.garmin.com/developer/
- **Community:** https://forums.garmin.com/developer/connect-iq

Good luck with your build! 🚀

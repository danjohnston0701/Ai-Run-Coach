# IQ Build Command Reference

All commands needed to build and submit IQ files.

---

## 🏃 Super Quick (2 Commands)

```bash
# Update version
nano garmin-companion-app/manifest.xml

# Build everything
bash build-new-iq-file.sh
```

Done! ✅

---

## ⚡ All Commands

### Setup (One-Time)

#### macOS
```bash
# 1. Download from https://developer.garmin.com/connect-iq/sdk/
# 2. Mount
hdiutil attach ~/Downloads/connectiq-sdk-mac-*.dmg

# 3. Install
cp -r /Volumes/ConnectIQ\ SDK/ConnectIQ\ SDK /Applications/

# 4. Unmount
hdiutil detach /Volumes/ConnectIQ\ SDK

# 5. Add to PATH (~/.zshrc)
echo 'export PATH="/Applications/ConnectIQ SDK/bin:$PATH"' >> ~/.zshrc

# 6. Reload
source ~/.zshrc

# 7. Verify
monkeyc -v
```

#### Windows
```bash
# 1. Download from https://developer.garmin.com/connect-iq/sdk/
# 2. Run connectiq-sdk-windows-*.exe
# 3. Follow installer
# 4. Verify: monkeyc -v
```

#### Linux
```bash
# 1. Download from https://developer.garmin.com/connect-iq/sdk/
tar -xzf connectiq-sdk-linux-*.tar.gz
mv connectiq-sdk-linux-* ~/connectiq-sdk

# 2. Add to PATH (~/.bashrc)
echo 'export PATH="$HOME/connectiq-sdk/bin:$PATH"' >> ~/.bashrc

# 3. Reload
source ~/.bashrc

# 4. Verify
monkeyc -v
```

---

### Before Every Build

#### Check Current Version
```bash
grep version garmin-companion-app/manifest.xml | head -1
```

#### Update Version
```bash
cd garmin-companion-app
nano manifest.xml
# Change: version="3.1.8" to version="3.1.9"
# Save: Ctrl+X → Y → Enter
```

#### Using sed to update version (automation)
```bash
cd garmin-companion-app
sed -i.bak 's/version="[^"]*"/version="3.1.9"/' manifest.xml
rm manifest.xml.bak
```

---

### Build Commands

#### Using Build Script (Recommended)
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# Keep current version
bash build-new-iq-file.sh

# Override with specific version
bash build-new-iq-file.sh 3.1.9
```

#### Manual Build (One Line)
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app && \
rm -f bin/AiRunCoach.iq && \
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r && \
echo "✅ BUILD COMPLETE" && \
ls -lh bin/AiRunCoach.iq
```

#### Manual Build (Multi-line for clarity)
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

# Clean previous
rm -f bin/AiRunCoach.iq

# Build
monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r

# Show result
ls -lh bin/AiRunCoach.iq
```

#### Build with Debug Output
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r 2>&1 | tee build.log
```

---

### Verification Commands

#### Check File Exists
```bash
ls -lh garmin-companion-app/bin/AiRunCoach.iq
```

#### Verify File Type
```bash
file garmin-companion-app/bin/AiRunCoach.iq
# Should output: "7-zip archive data"
```

#### Check File Size
```bash
du -h garmin-companion-app/bin/AiRunCoach.iq
# Should be 1.0-1.8 MB
```

#### View Archive Contents
```bash
unzip -l garmin-companion-app/bin/AiRunCoach.iq | head -30
```

#### Verify All Devices Compiled
```bash
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r 2>&1 | grep -E "(BUILT|BUILD)"
# Should show: "BUILD SUCCESSFUL"
```

---

### Cleanup Commands

#### Remove Old Build
```bash
rm -f garmin-companion-app/bin/AiRunCoach.iq
```

#### Remove All Build Artifacts
```bash
rm -rf garmin-companion-app/bin/*.iq
rm -rf garmin-companion-app/bin/*.prg*
```

#### Reset to Clean State
```bash
cd garmin-companion-app
rm -f bin/AiRunCoach.iq
rm -f bin/*.prg*
# Source files unchanged
```

---

### Development Commands

#### Verify SDK Installation
```bash
monkeyc -v
```

#### Check Manifest Validity
```bash
cat garmin-companion-app/manifest.xml | head -5
```

#### View Build Configuration
```bash
cat garmin-companion-app/monkey.jungle | head -20
```

#### Check Developer Key
```bash
ls -l garmin-companion-app/developer_key.der
```

#### View Last Build Result
```bash
ls -lh garmin-companion-app/bin/AiRunCoach.iq && \
file garmin-companion-app/bin/AiRunCoach.iq
```

---

### Upload Commands (Manual)

#### Show file ready for upload
```bash
echo "Ready to upload:"
ls -lh garmin-companion-app/bin/AiRunCoach.iq
echo ""
echo "Upload to: https://apps.garmin.com/developer/dashboard"
echo "File: garmin-companion-app/bin/AiRunCoach.iq"
```

#### Copy to Desktop for upload
```bash
cp garmin-companion-app/bin/AiRunCoach.iq ~/Desktop/AiRunCoach.iq
echo "Copied to Desktop"
```

#### Get file hash for verification
```bash
md5 garmin-companion-app/bin/AiRunCoach.iq
shasum garmin-companion-app/bin/AiRunCoach.iq
```

---

## 🎯 Common Workflows

### Workflow 1: Quick Build (No Version Change)
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
bash build-new-iq-file.sh
```

### Workflow 2: Build with Version Update
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
bash build-new-iq-file.sh 3.2.0
```

### Workflow 3: Manual Build (Complete)
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

# Update version
nano manifest.xml

# Build
rm -f bin/AiRunCoach.iq
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r

# Verify
file bin/AiRunCoach.iq
ls -lh bin/AiRunCoach.iq
```

### Workflow 4: Build and Verify Everything
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# Update version
nano garmin-companion-app/manifest.xml

# Build
bash build-new-iq-file.sh

# Run all verifications
echo "File type:"
file garmin-companion-app/bin/AiRunCoach.iq

echo ""
echo "File size:"
ls -lh garmin-companion-app/bin/AiRunCoach.iq

echo ""
echo "Archive contents:"
unzip -l garmin-companion-app/bin/AiRunCoach.iq | head -20

echo ""
echo "Ready for upload to: https://apps.garmin.com/developer/dashboard"
```

### Workflow 5: Clean Build (Start from Scratch)
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# Clean
rm -f garmin-companion-app/bin/AiRunCoach.iq

# Update version
nano garmin-companion-app/manifest.xml

# Build
bash build-new-iq-file.sh

# Verify
file garmin-companion-app/bin/AiRunCoach.iq
```

---

## 📋 Build Flags Explained

```bash
monkeyc \
  -o bin/AiRunCoach.iq        # Output file path and name
  -f monkey.jungle            # Build configuration file with device list
  -y developer_key.der        # Private key to sign the app
  -e                          # CRITICAL: Package as 7-zip for Store
  -r                          # Release mode: strip debug, optimize
```

### Flag Details

| Flag | Meaning | Required? | Notes |
|------|---------|-----------|-------|
| `-o` | Output file | ✅ Yes | Where to save the .iq file |
| `-f` | Config file | ✅ Yes | Contains device list & resources |
| `-y` | Developer key | ✅ Yes | Signs app with your key |
| `-e` | Package app | ✅ YES | Creates 7-zip format for Store |
| `-r` | Release build | ✅ Yes | Optimizes, removes debug symbols |
| `-w` | Debug | ❌ No | For testing, not for store |
| `-d` | Device | ❌ No | For single device, `-f` builds all |

**⚠️ The `-e` flag is CRITICAL** - Without it, Garmin Store rejects the file!

---

## 🔍 Troubleshooting Commands

### Check if SDK is installed
```bash
which monkeyc
monkeyc -v
```

### Rebuild with debug output
```bash
cd garmin-companion-app
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r 2>&1 | tail -50
```

### Find compilation errors
```bash
cd garmin-companion-app
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r 2>&1 | grep -i error
```

### Check manifest syntax
```bash
grep -n 'version=' garmin-companion-app/manifest.xml
```

### Verify all files exist
```bash
echo "Checking required files..."
ls garmin-companion-app/manifest.xml || echo "❌ manifest.xml missing"
ls garmin-companion-app/developer_key.der || echo "❌ developer_key.der missing"
ls garmin-companion-app/monkey.jungle || echo "❌ monkey.jungle missing"
ls garmin-companion-app/source/*.mc || echo "❌ source files missing"
echo "✅ All files present"
```

### Get full build output
```bash
cd garmin-companion-app
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r > build.log 2>&1
echo "Build output saved to: build.log"
cat build.log
```

---

## 💾 Script Versions

### Simplest Version (just build)
```bash
#!/bin/bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app
rm -f bin/AiRunCoach.iq
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r
ls -lh bin/AiRunCoach.iq
```

### With Verification
```bash
#!/bin/bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app
rm -f bin/AiRunCoach.iq
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r && \
file bin/AiRunCoach.iq && \
ls -lh bin/AiRunCoach.iq && \
echo "✅ Build successful"
```

### Full Automated Version
See: `build-new-iq-file.sh`

---

## 📱 Device List (for reference)

All 24 devices compile with `monkey.jungle`:

```
fenix6          fenix7          fr55
fenix6pro       fenix7s         fr245
fenix6s         fenix7x         fr255
fenix6spro      fenix7pro       fr265
fenix6xpro      fenix7spro      fr945
                fenix7xpro      fr955
                                fr965
vivoactive4     venu
vivoactive5     venu2
                venu2plus
                venu3
```

---

## 🚀 Summary

### To Build:
```bash
bash build-new-iq-file.sh
```

### To Build with Version:
```bash
bash build-new-iq-file.sh 3.1.9
```

### To Verify:
```bash
file garmin-companion-app/bin/AiRunCoach.iq
```

### To Upload:
Go to: https://apps.garmin.com/developer/dashboard

That's it! 🎉

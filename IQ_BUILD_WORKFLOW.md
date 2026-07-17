# Complete IQ Build Workflow

Complete reference for building and submitting IQ files to Garmin Store.

---

## 📋 Overview

```
┌─────────────────────────────────────────────────────┐
│ 1. Install SDK (one-time, ~15 minutes)              │
├─────────────────────────────────────────────────────┤
│ 2. Update version in manifest.xml (2 minutes)       │
├─────────────────────────────────────────────────────┤
│ 3. Build IQ file using monkeyc (2 minutes)          │
├─────────────────────────────────────────────────────┤
│ 4. Verify output file (1 minute)                    │
├─────────────────────────────────────────────────────┤
│ 5. Upload to Garmin Developer Portal (5 minutes)    │
├─────────────────────────────────────────────────────┤
│ 6. Wait for Garmin review (1-2 hours)               │
├─────────────────────────────────────────────────────┤
│ 7. Published on Garmin Connect IQ Store!            │
└─────────────────────────────────────────────────────┘
```

---

## 1️⃣ Install SDK (One-Time Setup)

### macOS Installation

```bash
# 1a. Download from Garmin
#     Visit: https://developer.garmin.com/connect-iq/sdk/
#     Download: "ConnectIQ SDK for macOS"

# 1b. Mount and install
hdiutil attach ~/Downloads/connectiq-sdk-mac-*.dmg
cp -r /Volumes/ConnectIQ\ SDK/ConnectIQ\ SDK /Applications/
hdiutil detach /Volumes/ConnectIQ\ SDK

# 1c. Add to PATH (add this line to ~/.zshrc)
export PATH="/Applications/ConnectIQ SDK/bin:$PATH"

# 1d. Reload shell
source ~/.zshrc

# 1e. Verify
monkeyc -v
# Output: "Monkey C Compiler version X.X.X"
```

### Windows Installation

```bash
# 1. Download from: https://developer.garmin.com/connect-iq/sdk/
# 2. Download: "ConnectIQ SDK for Windows"
# 3. Run connectiq-sdk-windows-*.exe
# 4. Follow installer
# 5. Verify: monkeyc -v
```

### Linux Installation

```bash
# 1. Download from: https://developer.garmin.com/connect-iq/sdk/
# 2. Download: "ConnectIQ SDK for Linux"
tar -xzf connectiq-sdk-linux-*.tar.gz
mv connectiq-sdk-linux-* ~/connectiq-sdk

# 3. Add to PATH (add to ~/.bashrc)
export PATH="$HOME/connectiq-sdk/bin:$PATH"

source ~/.bashrc
monkeyc -v
```

---

## 2️⃣ Update Version

Every submission requires a unique version number.

### Edit manifest.xml

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

# Open the manifest
nano manifest.xml

# Find line 4:
# <iq:application ... version="3.1.8">

# Change to:
# <iq:application ... version="3.1.9">

# Save: Ctrl+X → Y → Enter
```

### Version Format

Use semantic versioning: `MAJOR.MINOR.PATCH`

- `3.1.9` ← Patch: small bug fix
- `3.2.0` ← Minor: new features
- `4.0.0` ← Major: breaking changes

**Important**: Each version must be unique. Garmin Store rejects duplicate versions.

---

## 3️⃣ Build IQ File

### Using the Build Script (Recommended)

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# Option A: Keep current version
bash build-new-iq-file.sh

# Option B: Set specific version
bash build-new-iq-file.sh 3.1.9
```

The script will:
1. ✅ Verify SDK is installed
2. ✅ Update manifest version (if provided)
3. ✅ Clean previous build
4. ✅ Compile for all 24 Garmin devices
5. ✅ Verify output is 7-zip
6. ✅ Show upload instructions

### Manual Build (If Script Fails)

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

# Verify SDK
monkeyc -v

# Clean previous build
rm -f bin/AiRunCoach.iq

# Build for all devices
monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r

# Expected output:
# BUILD SUCCESSFUL
```

### What Gets Compiled

- ✅ All source code (`source/*.mc`)
- ✅ All resources (`resources/`)
- ✅ All 24 device variants
- ✅ Signed with your developer key

---

## 4️⃣ Verify Output

### Check File Exists

```bash
ls -lh /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app/bin/AiRunCoach.iq

# Should output something like:
# -rw-r--r--  1 user  staff  1.3M  Jul 16 12:34 bin/AiRunCoach.iq
```

### Verify File Format

```bash
file /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app/bin/AiRunCoach.iq

# Must show:
# 7-zip archive data
```

**⚠️ CRITICAL**: If this shows "data" instead of "7-zip", the build failed to use the `-e` flag.

### Preview Contents

```bash
unzip -l /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app/bin/AiRunCoach.iq | head -30

# Should show structure like:
# BUNDLE-METADATA/
# base/
#   dex/classes.dex
#   manifest/AndroidManifest.xml
#   lib/
#   res/
```

### Expected Size

- ✅ Normal: 1.0 - 1.8 MB
- ❌ Too small (< 500 KB): Missing `-e` flag
- ❌ Too large (> 2.0 MB): Includes debug symbols

---

## 5️⃣ Upload to Garmin Store

### Step 1: Access Developer Portal

1. Go to: https://apps.garmin.com/developer/dashboard
2. Log in with your Garmin Developer account
3. Search for "AI Run Coach"

### Step 2: Upload New Version

1. Click "Edit" next to the app
2. Click "New Version"
3. Click "Upload Binary"
4. Select: `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app/bin/AiRunCoach.iq`
5. Portal auto-reads version from manifest

### Step 3: Add Release Notes

Provide clear, concise release notes:

```
v3.1.9 - Performance Improvements and Bug Fixes

Improvements:
• Improved battery efficiency in RunView
• Fixed HR zone color flickering
• Optimized data streaming frequency
• Reduced memory footprint by 15%

Bug Fixes:
• Fixed crash on app resume
• Fixed GPS timeout handling
• Fixed Bluetooth reconnection logic

All 24 Garmin watch models fully supported.
```

### Step 4: Submit for Review

⚠️ **IMPORTANT**: Click **"Submit for Review"**, not just "Save Draft"

- "Save Draft" = only saves, no review email sent
- "Submit for Review" = triggers Garmin's review process

### Step 5: Confirmation

You'll see: "Submitted for Review"
- Check your email for confirmation
- Garmin reviews typically within 1-2 hours
- You'll get approval or rejection email

---

## 6️⃣ Garmin Review

Garmin's review process typically:

| Step | Time | Status |
|------|------|--------|
| Receive submission | Immediate | ✅ Automatic |
| Queue for review | 30 min | ⏳ Auto |
| Initial review | 30-60 min | 👤 Human |
| Testing (if needed) | 15 min | 🧪 QA |
| Approval | Immediate | ✅ Auto |
| **Total** | **1-2 hours** | |

### Common Review Issues

✅ **Approved** - App goes live on Garmin Store  
⚠️ **Rejected** - You'll get detailed feedback  
❌ **Suspended** - Won't proceed, check for policy violations  

If rejected, fix the issue and resubmit.

---

## 7️⃣ Published on Garmin Store

Once approved:

1. ✅ App visible on Garmin Connect IQ Store
2. ✅ Users can install via Garmin app
3. ✅ Version number shown on store page
4. ✅ Release notes visible to users
5. ✅ Auto-updates for existing users

---

## 🔧 Build Configuration Reference

### Files Involved

```
garmin-companion-app/
├── manifest.xml              ← Version here
├── monkey.jungle             ← Device list (don't edit)
├── developer_key.der         ← Your signing key (don't edit)
├── source/                   ← Source code
│   ├── AiRunCoachApp.mc
│   ├── views/
│   │   ├── StartView.mc
│   │   └── RunView.mc
│   └── networking/
│       └── DataStreamer.mc
├── resources/                ← Icons, strings, layouts
│   ├── drawables/
│   ├── strings/
│   ├── layouts/
│   └── menus/
└── bin/
    └── AiRunCoach.iq        ← Output file (generated)
```

### Manifest Details

```xml
<iq:application 
    entry="AiRunCoachApp"
    id="C7BF12555C184F9FB1F82B49E72E20A2"
    launcherIcon="@Drawables.LauncherIcon"
    minApiLevel="3.2.0"
    name="@Strings.AppName"
    type="watch-app"
    version="3.1.9"  ← UPDATE THIS
>
```

### Build Flags

```bash
monkeyc \
  -o bin/AiRunCoach.iq      # Output file
  -f monkey.jungle          # Config (device list)
  -y developer_key.der      # Signing key
  -e                        # CRITICAL: Package as 7-zip
  -r                        # Release (strip debug)
```

---

## 📊 Supported Devices (24 Total)

**Fenix Series** (11 devices)
```
Fenix 6, 6 Pro, 6S, 6S Pro, 6X Pro
Fenix 7, 7S, 7X, 7 Pro, 7S Pro, 7X Pro
```

**Forerunner Series** (7 devices)
```
FR 55, 245, 255, 265, 945, 955, 965
```

**VivoActive Series** (2 devices)
```
VivoActive 4, 5
```

**Venu Series** (4 devices)
```
Venu, Venu 2, Venu 2 Plus, Venu 3
```

---

## 🚨 Troubleshooting

### Issue: "monkeyc: command not found"

**Cause**: Garmin SDK not installed or not in PATH

**Fix**:
```bash
# 1. Install SDK from Garmin
# 2. Add to PATH in ~/.zshrc:
export PATH="/Applications/ConnectIQ SDK/bin:$PATH"

# 3. Reload:
source ~/.zshrc

# 4. Verify:
monkeyc -v
```

### Issue: Build output is 126 KB (too small)

**Cause**: Missing `-e` flag

**Fix**: Always use: `monkeyc ... -e -r`

### Issue: File type is "data" not "7-zip"

**Cause**: Missing `-e` flag or build failed

**Fix**:
```bash
# Verify file type
file bin/AiRunCoach.iq

# Should say: "7-zip archive data"

# If not, rebuild with -e flag
```

### Issue: Garmin Store rejects upload with "ID mismatch"

**Cause**: App ID in manifest doesn't match portal

**Fix**: Check manifest.xml:
```bash
grep 'id="' garmin-companion-app/manifest.xml | head -1

# Should be: C7BF12555C184F9FB1F82B49E72E20A2
```

### Issue: "BUILD FAILED" with syntax error

**Cause**: Code error in source files

**Fix**:
```bash
cd garmin-companion-app
monkeyc ... 2>&1 | grep -i error

# Fix the file mentioned in error
# Try again
```

### Issue: Build succeeds but file is incomplete

**Cause**: Some devices didn't compile

**Fix**:
```bash
# Look for:
# "55 OUT OF 55 DEVICES BUILT" (or 24 for your case)

# If less than 24, check error messages
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r 2>&1 | tail -50
```

---

## ✅ Quick Checklist

Before uploading:

- [ ] SDK installed and `monkeyc -v` works
- [ ] Version updated in manifest.xml
- [ ] Build completes successfully
- [ ] Output file exists and is 7-zip
- [ ] File size is 1.0-1.8 MB
- [ ] Release notes prepared
- [ ] Logged into Garmin Developer Portal

---

## 📚 Resources

| Resource | URL |
|----------|-----|
| **Garmin SDK** | https://developer.garmin.com/connect-iq/sdk/ |
| **Monkey C Docs** | https://developer.garmin.com/connect-iq/api-docs/Monkey-C/ |
| **Developer Portal** | https://apps.garmin.com/developer/dashboard |
| **Complete Guide** | `CREATE_NEW_IQ_FILE_GUIDE.md` |
| **Quick Start** | `IQ_FILE_BUILD_QUICK_START.md` |

---

## 🎯 Summary

```bash
# 1. One-time: Install SDK
# https://developer.garmin.com/connect-iq/sdk/

# 2. Every build: Update version
nano garmin-companion-app/manifest.xml

# 3. Every build: Build IQ file
bash build-new-iq-file.sh

# 4. Every upload: Verify
file garmin-companion-app/bin/AiRunCoach.iq

# 5. Every upload: Submit to store
# https://apps.garmin.com/developer/dashboard
```

You're all set! 🚀

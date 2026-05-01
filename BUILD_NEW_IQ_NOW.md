# Build New IQ File NOW — With Updated Icon

## Quick Start (You Need to Run This Locally)

The Garmin SDK (`monkeyc`) is not installed in this build environment. Run these commands **on your Mac** to build the new IQ file with the updated running icon:

### Step 1: Install Garmin SDK (One-time setup)

If you don't already have it installed:

```bash
# 1. Download from Garmin
#    Visit: https://developer.garmin.com/connect-iq/sdk/
#    Download for macOS

# 2. Install (once downloaded)
hdiutil attach ~/Downloads/connectiq-sdk-mac-5.*.dmg
cp -r /Volumes/ConnectIQ\ SDK/ConnectIQ\ SDK /Applications/
hdiutil detach /Volumes/ConnectIQ\ SDK

# 3. Add to PATH in ~/.zshrc
echo 'export PATH="/Applications/ConnectIQ SDK/bin:$PATH"' >> ~/.zshrc

# 4. Reload shell
source ~/.zshrc

# 5. Verify
monkeyc -v
# Should show: "Monkey C Compiler version 5.x.x"
```

### Step 2: Build the IQ File

Once SDK is installed, run this **from the project root**:

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# Clean old build
rm -f garmin-companion-app/bin/AiRunCoach.iq

# Build with the new icon
monkeyc \
  -o garmin-companion-app/bin/AiRunCoach.iq \
  -f garmin-companion-app/monkey.jungle \
  -y garmin-companion-app/developer_key.der \
  -e \
  -r
```

### Step 3: Verify the Build

```bash
# Check file exists and size
ls -lh garmin-companion-app/bin/AiRunCoach.iq

# Should show: ~1.0-1.2 MB

# Verify it's a 7-zip file
file garmin-companion-app/bin/AiRunCoach.iq

# Should show: "7-zip archive data"
```

### Success Indicators ✅

You'll see output like:
```
Parsing resources for fenix7...
Building fenix7...
Parsing resources for forerunner955...
Building forerunner955...
... (for all 55 devices)
55 OUT OF 55 DEVICES BUILT
BUILD SUCCESSFUL
```

---

## What's New in This Build

✅ **New Icon**: Clean running stick figure on teal (#00CFFF) background
✅ **Cleaner UI**: No more "AI" text cluttering the watch face
✅ **Professional Look**: Instantly recognizable as a running app
✅ **Better Scaling**: Looks great on all screen sizes (40-46mm watches)

---

## Next: Upload to Garmin Store

Once you verify the IQ file is built correctly:

1. **Go to**: https://apps.garmin.com/en-US/developer/
2. **Find**: "AI Run Coach" app
3. **Click**: "Update App"
4. **Upload**: `garmin-companion-app/bin/AiRunCoach.iq`
5. **Version**: Bump to 2.2.0 in manifest.xml (optional, but recommended)
6. **Submit**: For review

### Optional: Update Version First

Before uploading, you might want to bump the version in the manifest:

```bash
# Edit the version
nano garmin-companion-app/manifest.xml

# Find line 4, change:
# version="2.1.0"
# To:
# version="2.2.0"

# Save (Ctrl+X, Y, Enter)

# Then rebuild
monkeyc \
  -o garmin-companion-app/bin/AiRunCoach.iq \
  -f garmin-companion-app/monkey.jungle \
  -y garmin-companion-app/developer_key.der \
  -e \
  -r
```

---

## Troubleshooting

### "monkeyc: command not found"
```bash
# Make sure SDK is in PATH
echo $PATH
# Should include: /Applications/ConnectIQ SDK/bin

# If not, reload shell:
source ~/.zshrc
```

### Build fails with device errors
```bash
# Try rebuilding with verbose output:
monkeyc \
  -o garmin-companion-app/bin/AiRunCoach.iq \
  -f garmin-companion-app/monkey.jungle \
  -y garmin-companion-app/developer_key.der \
  -e \
  -r \
  -w  # add -w for warnings
```

### File size is wrong (too small)
```bash
# You probably forgot the -e flag
# Always use: monkeyc ... -e -r
```

---

## Done! 🎉

Once you've built the IQ file and verified it's correct, you're ready to upload to the Garmin Store for your users!

The new icon will appear on every watch that installs the app. Much better than the old "AI" logo! 🏃‍♂️⌚

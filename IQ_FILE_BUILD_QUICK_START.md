# Quick Start: Build New IQ File for Garmin Store

**Time to complete**: 5-10 minutes (after SDK is installed)

---

## Prerequisites Checklist

- [ ] Garmin Connect IQ SDK installed
- [ ] `monkeyc` command works (`monkeyc -v`)
- [ ] You have the repo cloned locally

---

## Fast Path (If SDK is Already Installed)

```bash
# 1. Navigate to project
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# 2. Run the build script (handles everything)
bash build-new-iq-file.sh

# 3. Your IQ file is ready at:
# garmin-companion-app/bin/AiRunCoach.iq
```

That's it! ✅

---

## Step-by-Step (Manual)

### Step 1: Update Version

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

# Edit manifest.xml
nano manifest.xml

# Find: version="3.1.8"
# Change to: version="3.1.9"

# Save: Ctrl+X → Y → Enter
```

### Step 2: Build

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r
```

### Step 3: Verify

```bash
# Check file exists and is 7-zip
file bin/AiRunCoach.iq
# Should output: "7-zip archive data"

# Check size (should be 1.0-1.8 MB)
ls -lh bin/AiRunCoach.iq
```

### Step 4: Upload

1. Go to: https://apps.garmin.com/developer/dashboard
2. Find "AI Run Coach"
3. Click "Edit" → "New Version" → "Upload Binary"
4. Select: `garmin-companion-app/bin/AiRunCoach.iq`
5. Add release notes
6. Click "Submit for Review"

---

## Build Script Usage

The `build-new-iq-file.sh` script automates everything:

### Basic usage (keeps current version):
```bash
bash build-new-iq-file.sh
```

### With version override:
```bash
bash build-new-iq-file.sh 3.1.9
```

### What it does:
✅ Verifies SDK is installed  
✅ Updates version (if provided)  
✅ Cleans previous build  
✅ Compiles for all 24 devices  
✅ Verifies output is 7-zip  
✅ Shows upload instructions  

---

## Troubleshooting

### ❌ "monkeyc: command not found"

The Garmin SDK is not installed. Download and install from:
https://developer.garmin.com/connect-iq/sdk/

**On macOS:**
```bash
hdiutil attach ~/Downloads/connectiq-sdk-mac-*.dmg
cp -r /Volumes/ConnectIQ\ SDK/ConnectIQ\ SDK /Applications/
hdiutil detach /Volumes/ConnectIQ\ SDK
echo 'export PATH="/Applications/ConnectIQ SDK/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### ❌ "BUILD FAILED"

Check for syntax errors:
```bash
cd garmin-companion-app
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r 2>&1 | tail -20
```

### ❌ File is only 126 KB

You forgot the `-e` flag. Rebuild with:
```bash
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r
```

### ❌ "Garmin Store rejected upload"

Check:
1. ✅ File is 7-zip (not just data)
2. ✅ Version is unique (not already uploaded)
3. ✅ App ID matches: `C7BF12555C184F9FB1F82B49E72E20A2`

---

## File Information

**Current Version**: 3.1.8  
**Location**: `garmin-companion-app/manifest.xml`  
**Output**: `garmin-companion-app/bin/AiRunCoach.iq`  
**File Type**: 7-zip archive  
**Expected Size**: 1.0-1.8 MB  

**Supported Devices** (24 total):
- Fenix 6, 6 Pro, 6S, 6S Pro, 6X Pro
- Fenix 7, 7S, 7X, 7 Pro, 7S Pro, 7X Pro
- Forerunner 55, 245, 255, 265, 945, 955, 965
- VivoActive 4, 5
- Venu, Venu 2, Venu 2 Plus, Venu 3

---

## Common Commands

```bash
# Check current version
grep version garmin-companion-app/manifest.xml

# Build with script
bash build-new-iq-file.sh

# Build manually
cd garmin-companion-app && monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r

# Verify build
file garmin-companion-app/bin/AiRunCoach.iq

# View archive contents
unzip -l garmin-companion-app/bin/AiRunCoach.iq | head -30

# Clean build directory
rm -f garmin-companion-app/bin/AiRunCoach.iq
```

---

## Tips

✅ **Always increment version** before uploading  
✅ **Use the `-e` flag** to create 7-zip format  
✅ **Use the `-r` flag** for release build (smaller file)  
✅ **Test locally first** before uploading to store  
✅ **Save release notes** in a document for each version  

---

## Next Steps

1. **Build**: `bash build-new-iq-file.sh`
2. **Verify**: `file garmin-companion-app/bin/AiRunCoach.iq`
3. **Upload**: https://apps.garmin.com/developer/dashboard
4. **Wait**: Garmin reviews (1-2 hours typically)
5. **Done**: Users can download from Garmin Store

---

## Resources

- **Complete Guide**: `CREATE_NEW_IQ_FILE_GUIDE.md`
- **Garmin SDK**: https://developer.garmin.com/connect-iq/sdk/
- **Monkey C Docs**: https://developer.garmin.com/connect-iq/api-docs/Monkey-C/
- **Developer Portal**: https://apps.garmin.com/developer/
- **Sandbox Testing**: Use Connect IQ simulator before publishing

---

## Questions?

Refer to `CREATE_NEW_IQ_FILE_GUIDE.md` for detailed troubleshooting and explanations.

Happy building! 🚀

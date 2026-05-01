# Install Garmin SDK & Build New IQ File

## Summary

The new running icon is ready in the codebase, but we need the **Garmin Connect IQ SDK** to build the IQ file. This is a one-time installation on your machine.

---

## Step 1: Download & Install Garmin SDK (5-10 minutes)

### On macOS:

1. **Visit**: https://developer.garmin.com/connect-iq/sdk/
2. **Download**: The macOS SDK (DMG file)
3. **Mount and Install**:
   ```bash
   # Mount the DMG
   hdiutil attach ~/Downloads/connectiq-sdk-mac-*.dmg
   
   # Copy to Applications
   cp -r /Volumes/ConnectIQ\ SDK/ConnectIQ\ SDK /Applications/
   
   # Unmount
   hdiutil detach /Volumes/ConnectIQ\ SDK
   ```

4. **Add to PATH**:
   ```bash
   # Edit ~/.zshrc (or ~/.bash_profile if using bash)
   nano ~/.zshrc
   
   # Add this line at the end:
   export PATH="/Applications/ConnectIQ SDK/bin:$PATH"
   
   # Save (Ctrl+X, Y, Enter)
   ```

5. **Reload shell**:
   ```bash
   source ~/.zshrc
   ```

6. **Verify installation**:
   ```bash
   monkeyc -v
   # Should output: Monkey C Compiler version 5.x.x
   ```

---

## Step 2: Build the New IQ File (2 minutes)

Once the SDK is installed, run this command in your terminal:

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# Run the automated build script
bash build-iq-automated.sh
```

**That's it!** The script will:
- ✅ Verify the SDK is installed
- ✅ Check all project files
- ✅ Compile the Monkey C code
- ✅ Bundle the new icon
- ✅ Package for all 55 Garmin devices
- ✅ Create `garmin-companion-app/bin/AiRunCoach.iq`

---

## Step 3: Verify the Build

After the script completes successfully, you should see:

```
📊 Step 5: Verifying output...
✓ File created: /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app/bin/AiRunCoach.iq
  Size: 1.1M (1155000 bytes)
✓ File type: 7-zip archive (correct)
✓ File size is reasonable

✨ BUILD SUCCESSFUL! ✨
```

**Verify manually**:
```bash
ls -lh garmin-companion-app/bin/AiRunCoach.iq
# Should show: -rw-r--r--  1 user  staff  1.1M  May  1 20:00 AiRunCoach.iq

file garmin-companion-app/bin/AiRunCoach.iq
# Should show: 7-zip archive data
```

---

## Step 4: Upload to Garmin Store (Optional)

Once the IQ file is built:

1. **Go to**: https://apps.garmin.com/en-US/developer/
2. **Login** with your Garmin Developer account
3. **Find**: "AI Run Coach" app
4. **Click**: "Update App" (or "Submit New Version")
5. **Upload**: `garmin-companion-app/bin/AiRunCoach.iq`
6. **Release Notes** (example):
   ```
   v2.2.0 - New Icon & UI Refresh
   
   ✨ Improvements:
   • New clean running icon on teal background
   • Better visual recognition on watch home screen
   • All other features unchanged
   ```
7. **Submit** for review (24-48 hours typical)

---

## Troubleshooting

### "monkeyc: command not found"
```bash
# Verify SDK location
ls /Applications/ConnectIQ\ SDK/bin/monkeyc
# Should exist

# Verify PATH
echo $PATH
# Should include: /Applications/ConnectIQ SDK/bin

# If not in PATH, make sure you:
# 1. Edited ~/.zshrc (or ~/.bash_profile)
# 2. Reloaded shell: source ~/.zshrc
```

### Build fails with "device errors"
```bash
# Try verbose output
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e -r -w 2>&1 | tail -50
```

### File size is too small (< 500 KB)
```bash
# You likely forgot the -e flag (package-app)
# The -e flag is CRITICAL for Garmin Store submission
# Always use: monkeyc ... -e -r
```

### "7-zip not found" error in build script
```bash
# This is usually fine - the monkeyc compiler handles the 7-zip internally
# Just verify the file is 7-zip:
file garmin-companion-app/bin/AiRunCoach.iq
# Should show: 7-zip archive data
```

---

## What's New in This Build

✅ **Running Icon**: Clean white stick figure on teal (#00CFFF) background
✅ **Better Branding**: No more cluttered "AI" text
✅ **Professional Look**: Instantly recognizable as a running app
✅ **All Devices**: Works on all 55 supported Garmin watches

---

## Files Involved

| File | Purpose |
|------|---------|
| `garmin-companion-app/resources/drawables/launcher_icon.png` | **NEW** running icon |
| `garmin-companion-app/manifest.xml` | App metadata (icon reference) |
| `garmin-companion-app/source/**/*.mc` | Monkey C source code |
| `garmin-companion-app/bin/AiRunCoach.iq` | **Output** - Compiled IQ file |
| `build-iq-automated.sh` | Automated build script |

---

## Complete Command Reference

### One-time setup (install SDK):
```bash
# Download from https://developer.garmin.com/connect-iq/sdk/
# Install to /Applications/
# Add to ~/.zshrc: export PATH="/Applications/ConnectIQ SDK/bin:$PATH"
# Reload: source ~/.zshrc
```

### Build the IQ file:
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
bash build-iq-automated.sh
```

### Manual build (if you prefer):
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app

monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r
```

### Verify the build:
```bash
ls -lh garmin-companion-app/bin/AiRunCoach.iq
file garmin-companion-app/bin/AiRunCoach.iq
```

---

## Next Steps

1. **Install the SDK** (visit https://developer.garmin.com/connect-iq/sdk/)
2. **Run** `bash build-iq-automated.sh`
3. **Upload** to Garmin Store when ready
4. **Done!** Users will see the new icon 🏃‍♂️⌚

---

## Support

If you get stuck:
1. Check that monkeyc is in your PATH: `which monkeyc`
2. Verify SDK is installed: `ls /Applications/ConnectIQ\ SDK/bin/`
3. Check build log: `/tmp/monkeyc_build.log`
4. Re-read this guide carefully

The build process is straightforward once the SDK is installed!

---

**You're almost there!** Just install the SDK and run one command. 🚀

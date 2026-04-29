# 🛠️ Manual Garmin SDK Installation — Complete Guide

## Status

Garmin SDK is **NOT** installed on your system. You need to install it to build the IQ file.

---

## Why You Need the SDK

The `monkeyc` compiler (part of the Garmin SDK) is required to:
1. Compile your Monkey C source code
2. Package for all 55 Garmin watch devices
3. Sign the app with your developer key
4. Create the proper 7-zip format for Garmin Store

---

## Step 1: Download the SDK

### Option A: Direct Download (Recommended)
1. Go to: https://developer.garmin.com/connect-iq/sdk/
2. Click **"Download SDK"** for **macOS**
3. You'll get: `connectiq-sdk-mac-5.x.x.dmg` (~3 GB)
4. Save to: `~/Downloads/`

### Option B: Using curl (If direct download doesn't work)
```bash
# Download latest SDK
curl -L -o ~/Downloads/connectiq-sdk-mac.dmg \
  https://developer.garmin.com/downloads/connect-iq/sdks/connectiq-sdk-mac-5.1.3.dmg

# Verify download
ls -lh ~/Downloads/connectiq-sdk-mac.dmg
```

---

## Step 2: Install the SDK

Once you have the DMG file:

```bash
# Mount the DMG
hdiutil attach ~/Downloads/connectiq-sdk-mac-5.x.x.dmg

# This will open Finder showing the SDK installer

# OR from command line:
hdiutil mount ~/Downloads/connectiq-sdk-mac-5.x.x.dmg -mountpoint /Volumes/ConnectIQ

# Copy to Applications folder
sudo cp -r /Volumes/ConnectIQ/ConnectIQ\ SDK /Applications/

# Unmount
hdiutil detach /Volumes/ConnectIQ
```

---

## Step 3: Add to PATH

The SDK needs to be in your system PATH for the compiler to be accessible.

### For Zsh (macOS default):
```bash
# Edit your shell config
nano ~/.zshrc

# Add this line at the end:
export PATH="/Applications/ConnectIQ SDK/bin:$PATH"

# Save (Ctrl+X, Y, Enter)
# Reload shell
source ~/.zshrc
```

### For Bash (if you use bash):
```bash
# Edit your shell config
nano ~/.bash_profile

# Add this line at the end:
export PATH="/Applications/ConnectIQ SDK/bin:$PATH"

# Save and reload
source ~/.bash_profile
```

---

## Step 4: Verify Installation

```bash
# Check that monkeyc is available
which monkeyc
# Should output: /Applications/ConnectIQ SDK/bin/monkeyc

# Check version
monkeyc -v
# Should output: Monkey C Compiler version X.X.X

# If it still says "command not found":
# 1. Reload terminal (close and reopen)
# 2. Check PATH:
echo $PATH
# 3. Verify the SDK folder exists:
ls -la "/Applications/ConnectIQ SDK/bin/monkeyc"
```

---

## Troubleshooting

### "monkeyc: command not found" after installation

**Solution 1: Close and reopen terminal**
- The PATH might not have reloaded
- Completely close Terminal.app
- Open a new Terminal window
- Try again: `monkeyc -v`

**Solution 2: Check PATH manually**
```bash
# See what's in your PATH
echo $PATH

# If you don't see "/Applications/ConnectIQ SDK/bin", add it:
nano ~/.zshrc  # or ~/.bash_profile

# Make sure this line is at the end:
export PATH="/Applications/ConnectIQ SDK/bin:$PATH"

# Save, close terminal, reopen, try again
```

**Solution 3: Create a symlink (alternative)**
```bash
# If the above doesn't work, create a symlink:
sudo ln -s "/Applications/ConnectIQ SDK/bin/monkeyc" /usr/local/bin/monkeyc

# Verify:
which monkeyc
monkeyc -v
```

### Download is slow or fails

**Solution:**
```bash
# Try downloading from the mirror/alternative link
# Or download manually from: https://developer.garmin.com/connect-iq/sdk/

# Then install from command line:
hdiutil attach ~/Downloads/connectiq-sdk-mac-5.1.3.dmg
sudo cp -r /Volumes/ConnectIQ/ConnectIQ\ SDK /Applications/
hdiutil detach /Volumes/ConnectIQ
```

### DMG won't mount

**Solution:**
```bash
# Try alternative mount method:
open ~/Downloads/connectiq-sdk-mac-5.1.3.dmg

# This will open Finder
# Then double-click the installer in Finder
```

---

## Once SDK is Installed: Build IQ File

After successful installation:

```bash
# Navigate to project
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

# Build the IQ file
./build-iq.sh

# OR manually:
cd garmin-companion-app
monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r

# Verify output
ls -lh garmin-companion-app/bin/AiRunCoach.iq
```

---

## Expected Output After Build

```
✅ 55 OUT OF 55 DEVICES BUILT
✅ BUILD SUCCESSFUL
✅ -rw-r--r-- 1 user staff 1.0M Apr 29 HH:MM bin/AiRunCoach.iq
✅ file type: 7-zip archive data
```

If you see this, you're ready to upload to Garmin Store! ✅

---

## File Location

After installation, the SDK will be at:
```
/Applications/ConnectIQ SDK/
├─ bin/             (compiler & tools)
├─ docs/            (documentation)
├─ sdkcore.car      (SDK resources)
└─ ...
```

And `monkeyc` will be at:
```
/Applications/ConnectIQ SDK/bin/monkeyc
```

---

## Size & Time

- **SDK Download**: ~3 GB
- **Installation**: ~5-10 minutes (depending on disk speed)
- **Total setup**: ~15-30 minutes (one-time)
- **Build time**: 2-3 minutes (every build)

---

## Getting Help

If you're stuck:

1. Check Garmin Developer Documentation:
   https://developer.garmin.com/connect-iq/

2. Common issues:
   - SDK download from official site: https://developer.garmin.com/connect-iq/sdk/
   - Make sure to reload terminal after adding to PATH
   - Use the correct Shell config file (.zshrc for Zsh, .bash_profile for Bash)

3. Verify installation:
   ```bash
   monkeyc -v
   which monkeyc
   ```

---

## Summary

1. ⬇️ **Download** SDK from Garmin (~3 GB)
2. 📦 **Install** to `/Applications/ConnectIQ SDK/`
3. 🔧 **Add to PATH** in `~/.zshrc`
4. ✅ **Verify** with `monkeyc -v`
5. 🚀 **Build** with `./build-iq.sh`
6. ⬆️ **Upload** to Garmin Developer Portal

Once the SDK is installed, building the IQ file is just 2-3 minutes! ⚡

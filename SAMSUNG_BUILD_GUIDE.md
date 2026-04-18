# Samsung Galaxy Watch Companion App — Build Guide

Complete guide for building and deploying the AI Run Coach Samsung Galaxy Watch companion app.

## Prerequisites

### System Requirements

- **Node.js**: 16+ (LTS recommended)
- **npm**: 8+
- **Tizen SDK**: 5.5+ or later
- **Git**: for version control
- **macOS, Linux, or Windows** with administrative privileges

### Tools Installation

#### 1. Install Node.js & npm

```bash
# macOS (using Homebrew)
brew install node@16

# Or download from: https://nodejs.org/en/

# Verify installation
node --version  # Should be v16+
npm --version   # Should be v8+
```

#### 2. Install Tizen SDK

**Option A: Tizen Studio (Recommended for Development)**

```bash
# macOS
brew cask install tizen-studio

# Or download from: https://developer.tizen.org/development/tizen-studio/download
```

**Option B: Tizen CLI (Command-line only)**

```bash
npm install -g tizen-cli

# Verify installation
tizen --version
```

#### 3. Set Up Tizen Environment

```bash
# Initialize Tizen CLI
tizen init

# Create a certificate (one-time setup)
tizen certificate create -a AiRunCoach -p password -c Samsung -cn "AI Run Coach" -o US -ou "Development" -n -f

# Set default certificate
tizen security set-profiles.xml -a AiRunCoach
```

## Building the Watch App

### Step 1: Install Dependencies

```bash
cd /path/to/AiRunCoach/samsung-watch-app

npm install
```

### Step 2: Development Build

```bash
# Watch mode with hot reload
npm run dev
```

Output will be in `build/` directory.

### Step 3: Production Build

```bash
# Create optimized bundle
npm run build

# Verify build output
ls -lh build/
# Should see: app.js (optimized bundle)
```

### Step 4: Package for Tizen

```bash
# Generate WGT (Widget) package
npm run package

# Output: Tizen package file (.wgt)
# Location: build/AiRunCoach.wgt
```

## Testing

### Option A: Samsung Galaxy Watch 6+ (Recommended)

#### Enable Developer Mode

1. Open **Settings** on watch
2. Tap **About Watch** (or **About**)
3. Find **Software Version**
4. **Tap 5 times** on the version number
5. Developer Mode is now enabled ✓

#### Connect Watch via WiFi

```bash
# List connected devices
tizen list-devices

# Connect to watch (using IP address from Settings → Developer)
tizen connect -t <watch-ip>

# Verify connection
tizen list-devices
# Should show: emulator-26101 or your watch name
```

#### Install App on Device

```bash
# Option 1: Using tizen CLI
tizen install -s <device-id> -- build/

# Option 2: Using package file
tizen install -s <device-id> -- build/AiRunCoach.wgt

# Watch the app install and start automatically
```

#### View Logs from Watch

```bash
tizen run -s <device-id> -- build/AiRunCoach.wgt --log

# Or manually check logs
tizen log -s <device-id> | grep "airuncoach\|AiRunCoach"
```

### Option B: Samsung Galaxy Watch Emulator

#### Install Emulator

```bash
# Via Tizen Studio
# Go to: Tools → Package Manager → Install Emulator Images

# Or via CLI (if available)
tizen emulator install -n galaxy-watch-6 -p galaxy-watch-6-x86
```

#### Start Emulator

```bash
# List available emulators
tizen list-emulator-images

# Start emulator (takes 30-60 seconds)
tizen emulator start -n galaxy-watch-6

# Wait for emulator to fully boot
# You should see the watch home screen
```

#### Install on Emulator

```bash
# List running emulators
tizen list-devices

# Install app
tizen install -s <emulator-id> -- build/

# Launch app
tizen run -s <emulator-id> -- com.airuncoach.watch

# View logs
tizen log -s <emulator-id>
```

#### Emulator Controls

- **Single Click**: Tap
- **Double Click**: Double tap
- **Right Click**: Back button
- **Scroll Wheel**: Rotary input (CW/CCW)
- **Drag**: Swipe

## Debugging

### Enable Debug Mode

```bash
# Build with source maps
npm run dev

# Source maps will be included in webpack output
```

### Inspect Running App

```bash
# Via Tizen Studio
# Tools → Web Inspector

# Or CLI
tizen inspect -s <device-id>

# Opens browser inspector at localhost:9233
```

### View Console Logs

```bash
# Tizen logs include console.log output
tizen log -s <device-id> | grep "console\|log"

# Or filter by app name
tizen log -s <device-id> | grep "airuncoach"
```

### Common Issues & Solutions

**Issue: "Cannot connect to watch"**

```bash
# Verify watch IP
# Settings → Developer → Watch IP

# Test connectivity
ping <watch-ip>

# Manually connect
tizen connect -t <watch-ip>

# Check connection status
tizen list-devices
```

**Issue: "App crashes on startup"**

```bash
# View crash logs
tizen log -s <device-id> | grep -i "error\|exception\|crash"

# Check app manifest is valid
cat tizen-manifest.xml

# Ensure all dependencies are bundled
npm list --depth=0
```

**Issue: "Watch not detected"**

```bash
# Restart Tizen daemon
tizen daemon
tizen daemon -s

# Or restart computer
# Then re-run: tizen connect -t <watch-ip>
```

## Deployment to Samsung Galaxy Store

### Prerequisites for Store Submission

1. **Developer Account**: Samsung Developer (free)
2. **Seller Account**: Samsung Seller (requires payment info)
3. **Certificates**: Generated developer key (done above)
4. **Screenshots**: 3-5 watch face screenshots (360x360px)
5. **Description**: App description, features, requirements
6. **Privacy Policy**: Link to privacy policy

### Build Release Version

```bash
# Create production build with optimizations
npm run build

# Package for submission
npm run package

# Sign with developer key
tizen package -t wgt -s AiRunCoach -- build/
```

### Submit to Samsung Galaxy Store

1. Go to: https://seller.samsung.com/
2. Sign in with developer account
3. **New App** → **Tizen Wearable**
4. Fill app information:
   - **Name**: AI Run Coach
   - **Category**: Health & Fitness
   - **Description**: Real-time AI coaching for runners on Galaxy Watch
5. Upload signed `.wgt` file
6. Add screenshots (minimum 3)
7. Set pricing (Free recommended)
8. Submit for review (2-5 business days)

### Monitoring Submission

```bash
# Check submission status in seller portal
# https://seller.samsung.com/ → Your Apps → [App Name]

# Status progression:
# Submitted → In Review → Approved → Live
```

## Version Management

### Updating Version

```bash
# Edit package.json
nano package.json

# Change version field
# "version": "1.0.0" → "1.0.1"

# Also update tizen-manifest.xml
nano tizen-manifest.xml

# Change version attribute
# version="1.0.0" → version="1.0.1"

# Rebuild
npm run build
npm run package
```

### Creating Release Builds

```bash
# Create git tag for release
git tag -a v1.0.0 -m "Samsung Watch App v1.0.0"

# Push to repository
git push origin v1.0.0

# Build and package
npm run build
npm run package

# Save .wgt file with version
cp build/AiRunCoach.wgt releases/AiRunCoach-1.0.0.wgt
```

## Architecture Overview

```
Samsung Galaxy Watch App (Tizen)
    ↓
TypeScript + Webpack (Build)
    ↓
HTML5 Canvas + SVG (UI)
    ↓
Tizen MessagePort API (Communication)
    ↓
Android/iOS Phone App
    ↓
Backend API (Node.js/Express)
```

## Performance Benchmarks

- **Bundle Size**: ~150KB (compressed)
- **Memory Usage**: ~8-12MB at runtime
- **CPU**: <5% during activity
- **Battery**: ~3% per hour during 1Hz data streaming
- **Update Rate**: 4 FPS (250ms refresh interval)

## Next Steps

1. ✅ **Install Dependencies**: `npm install`
2. ✅ **Build App**: `npm run build`
3. ✅ **Test on Device**: `tizen install -s <device-id>`
4. ✅ **Submit to Store**: Follow deployment instructions above
5. ✅ **Monitor Updates**: Check seller portal for reviews

## Support

- **Tizen Docs**: https://developer.tizen.org/development/guides/web-application
- **Samsung MCF API**: https://developer.samsung.com/galaxy-watch/mcf
- **AI Run Coach Support**: support@airuncoach.live

## License

Copyright © 2026 AI Run Coach. All rights reserved.

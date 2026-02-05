# AI Run Coach - Garmin Connect IQ Companion App

This is the Garmin watch app that pairs with the AI Run Coach Android/iOS app to provide real-time AI coaching directly on your wrist.

## Features

- ✅ Real-time heart rate monitoring with zone display
- ✅ Live GPS tracking and pace calculation
- ✅ Cadence and running dynamics
- ✅ AI coaching text displayed on watch
- ✅ Audio coaching playback
- ✅ Automatic data streaming to phone app
- ✅ Complete activity recording

## Requirements

- Garmin watch with Connect IQ 3.2.0+
- AI Run Coach account (created in phone app)
- Bluetooth connection to phone

## Supported Devices

- Fenix 6/7 series
- Forerunner 55/245/255/265/745/945/955/965
- Vivoactive 4/5
- Venu/Venu 2/Venu 3

## Building

### Prerequisites

1. Install Garmin Connect IQ SDK: https://developer.garmin.com/connect-iq/sdk/
2. Install VS Code with Monkey C extension OR Eclipse with Connect IQ plugin

### Build Steps

```bash
# Generate developer key (one-time)
openssl genrsa -out developer_key.pem 4096
openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt

# Build for specific device
monkeyc -o bin/AiRunCoach.prg -f monkey.jungle -y developer_key.der -d fenix7 -w

# Or build for all devices
monkeyc -o bin/AiRunCoach.prg -f monkey.jungle -y developer_key.der -w
```

### Testing on Simulator

```bash
# Start simulator
connectiq

# Load device (fenix7, forerunner955, etc.)
# File → Load Device → fenix7

# Load app
# File → Load App → bin/AiRunCoach.prg
```

### Testing on Real Device

1. Enable Developer Mode on watch:
   - Settings → System → About
   - Tap top number 5 times

2. Connect watch via USB

3. Install app:
```bash
monkeydo bin/AiRunCoach.prg fenix7
```

## Architecture

```
Watch App (Monkey C)
    ↓
    ├─ AiRunCoachApp.mc (Main entry)
    ├─ StartView.mc (Pre-run screen)
    ├─ RunView.mc (Activity tracking)
    └─ DataStreamer.mc (Backend communication)
    
    ↓ Real-time data streaming
    
Backend Server (Node.js)
    ├─ /api/garmin-companion/auth
    ├─ /api/garmin-companion/session/start
    ├─ /api/garmin-companion/data
    └─ /api/garmin-companion/session/end
    
    ↓ AI coaching generation
    
Phone App (Android/iOS)
    ├─ Live map display
    ├─ Detailed stats
    └─ Route overlay
```

## Data Streamed (Every Second)

- Heart rate + HR zone
- GPS location (lat/long/altitude)
- Speed & pace
- Cadence
- Stride length*
- Ground contact time*
- Vertical oscillation*
- Running power*

*If watch supports advanced metrics

## First-Time Setup

1. Install watch app from Garmin Connect IQ Store
2. Open AI Run Coach phone app
3. Connect Garmin account
4. Phone app shows "Install Companion App" prompt
5. Tap "Install on Garmin Watch"
6. Follow on-screen instructions
7. Open watch app
8. Watch displays "Open phone app to connect"
9. Phone app generates auth token
10. Watch authenticates automatically
11. Start running!

## Troubleshooting

### "Not Connected" on watch
- Make sure phone app is open
- Check Bluetooth connection
- Try disconnecting and reconnecting Garmin account in phone app

### No data streaming
- Check internet connection on phone
- Verify backend is running (https://airuncoach.live)
- Check watch logs: `monkeydo bin/AiRunCoach.prg fenix7 --sim`

### GPS not working
- Allow location permissions on watch
- Wait 30-60 seconds for GPS lock
- Go outside for better signal

## Development

### File Structure
```
garmin-companion-app/
├── manifest.xml              # App metadata
├── monkey.jungle             # Build configuration
├── source/
│   ├── AiRunCoachApp.mc     # Main app entry
│   ├── views/
│   │   ├── StartView.mc     # Pre-run screen
│   │   └── RunView.mc       # Activity tracking
│   └── networking/
│       └── DataStreamer.mc  # Backend communication
├── resources/
│   ├── strings/strings.xml  # Localization
│   ├── layouts/layouts.xml  # UI layouts
│   ├── menus/menus.xml      # Menu definitions
│   └── drawables/           # Icons & images
└── bin/                      # Build output
```

### Adding New Features

1. Edit source files in `source/`
2. Update layouts in `resources/layouts/`
3. Rebuild with `monkeyc`
4. Test on simulator
5. Test on real device

### Debugging

**View logs:**
```bash
# Simulator logs appear in terminal
monkeydo bin/AiRunCoach.prg fenix7 --sim

# Real device logs
adb logcat | grep "AiRunCoach"
```

**Add debug prints:**
```monkey-c
Sys.println("Debug message: " + value);
```

## Publishing

1. Build release version:
```bash
monkeyc -o bin/AiRunCoach.prg -f monkey.jungle -y developer_key.der -w -r
```

2. Go to: https://apps.garmin.com/en-US/developer/
3. Click "Submit for Publishing"
4. Upload `.prg` file
5. Add screenshots (minimum 3)
6. Add description
7. Submit for review (3-5 business days)

## License

Copyright © 2026 AI Run Coach. All rights reserved.

## Support

- Email: support@airuncoach.live
- Docs: https://docs.airuncoach.live
- Forums: https://community.airuncoach.live

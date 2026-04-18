# AI Run Coach - Samsung Galaxy Watch Companion App

Real-time AI coaching for runners on Samsung Galaxy Watch, paired with the AI Run Coach phone app.

## Features

- ✅ Real-time heart rate monitoring with zone display
- ✅ Live GPS tracking and pace calculation
- ✅ Cadence and running dynamics
- ✅ AI coaching text displayed on watch
- ✅ Audio coaching playback
- ✅ Automatic data streaming to phone app
- ✅ Complete activity recording

## Supported Devices

- Samsung Galaxy Watch 4 / 4 Classic
- Samsung Galaxy Watch 5 / 5 Pro
- Samsung Galaxy Watch 6
- Samsung Galaxy Watch 6 Classic
- Future Galaxy Watch models (Tizen OS)

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Tizen OS 9+
- **Build**: Webpack + Babel
- **UI**: HTML5 Canvas + SVG
- **Communication**: Tizen MessagePort API

## Project Structure

```
samsung-watch-app/
├── src/
│   ├── index.ts                 # Entry point
│   ├── App.ts                   # Main app controller
│   ├── components/
│   │   ├── RunScreen.ts         # Main UI dashboard
│   │   └── ZoneArc.ts           # Heart rate zone arc visualization
│   ├── services/
│   │   ├── PhoneLink.ts         # Phone app communication
│   │   └── DataStreamer.ts      # Backend API communication
│   ├── utils/
│   │   ├── formatting.ts        # Display formatting helpers
│   │   └── storage.ts           # Local storage management
│   ├── types/
│   │   └── index.ts             # TypeScript type definitions
│   └── styles/
│       └── global.css           # Global styles
├── index.html                   # Watch app UI
├── tizen-manifest.xml           # Tizen app manifest
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
├── webpack.config.js            # Build config
└── README.md
```

## Building

### Prerequisites

1. Install Node.js 16+ and npm
2. Install Tizen SDK:
   ```bash
   npm install -g tizen-cli
   ```

### Development Build

```bash
npm install
npm run dev        # Webpack watch mode
```

### Production Build

```bash
npm run build      # Webpack production bundle
npm run package    # Package for Tizen
```

## Testing

### Emulator

```bash
# Start Tizen emulator
tizen emulator start -n galaxy-watch-6

# Launch app in emulator
tizen run -s emulator-26101
```

### Real Device

```bash
# Enable developer mode on watch:
# Settings → About → Software Version → tap 5 times → Developer Mode ON

# Connect watch via USB and run:
tizen run -s <device-id>
```

## Communication Protocol

### Phone → Watch (MessagePort)

```json
{
  "type": "auth | preparedRun | runUpdate | coachingCue | disconnect | sessionEnded",
  "data": { /* message payload */ }
}
```

**Examples:**

**Auth:**
```json
{
  "type": "auth",
  "data": {
    "authToken": "abc123...",
    "runnerName": "John Doe"
  }
}
```

**Prepared Run:**
```json
{
  "type": "preparedRun",
  "data": {
    "runType": "route",
    "targetPace": "5:30",
    "workoutType": "tempo",
    "workoutDesc": "Tempo run at target pace",
    "distance": 10
  }
}
```

**Coaching Cue:**
```json
{
  "type": "coachingCue",
  "data": {
    "cue": "Increase cadence — aim for 180 spm"
  }
}
```

### Watch → Backend API

Sends run metrics every second during activity:

```
POST /api/garmin-companion/data
Authorization: Bearer {authToken}

{
  "sessionId": "session-123",
  "timestamp": 1681234567890,
  "metrics": {
    "heartRate": 152,
    "heartRateZone": 3,
    "distance": 1250,
    "pace": 285,
    "cadence": 175,
    "elapsedTime": 310,
    "latitude": 37.7749,
    "longitude": -122.4194,
    "altitude": 42
  }
}
```

## Architecture

```
Samsung Galaxy Watch App
    ↓
    ├─ RunScreen.ts (UI dashboard)
    ├─ ZoneArc.ts (HR zone visualization)
    ├─ PhoneLink.ts (MessagePort communication)
    └─ DataStreamer.ts (Backend communication)
    
    ↓ Real-time data streaming (1 Hz)
    
Backend Server (Node.js)
    ├─ /api/garmin-companion/auth
    ├─ /api/garmin-companion/session/start
    ├─ /api/garmin-companion/data
    └─ /api/garmin-companion/session/end
    
    ↓ AI coaching generation
    
Android/iOS Phone App
    ├─ Live map display
    ├─ Detailed stats
    └─ Route overlay
```

## UI Layout (Circular 360px Display)

```
                    Timer (00:25)
                    ─────────────
    ╭─ MIN / KM ─╮
    │   PACE     │  (Primary metric)
    │  5:30 /KM  │
    │            │
    │ KM    BPM  │  (Secondary metrics)
    │ 1.25  152  │
    ╰────────────╯
      -- spm      (Cadence)
```

**Zone Arc** (top 240°):
- Blue (Z1): 60-70% MHR
- Green (Z2): 70-80% MHR
- Amber (Z3): 80-90% MHR
- Orange (Z4): 90-100% MHR
- Red (Z5): >100% MHR

## Color Palette

- **Primary Cyan**: #00CFFF
- **Zone Blue**: #2979FF
- **Zone Green**: #00E676
- **Zone Amber**: #FFD740
- **Zone Orange**: #FF6D00
- **Zone Red**: #F44336
- **Text White**: #FFFFFF
- **Background**: #000000

## Data Streaming

- **Frequency**: 1 Hz (every 1000ms)
- **Metrics**: HR, HR Zone, Distance, Pace, Cadence, Elapsed Time, GPS, Altitude
- **Authentication**: Bearer token in Authorization header
- **Retry**: Automatic retry on network errors (up to 3 attempts)

## First-Time Setup

1. Install watch app from Galaxy Store or sideload
2. Open AI Run Coach phone app
3. Connect Samsung account
4. Phone app shows "Install Companion App" prompt
5. Tap "Install on Galaxy Watch"
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
- Try disconnecting and reconnecting Samsung account in phone app

### No data streaming

- Check internet connection on phone
- Verify backend is running
- Check watch logs: `tizen run -s device-id --log`

### GPS not working

- Allow location permissions on watch
- Wait 30-60 seconds for GPS lock
- Go outside for better signal

## Development

### Adding New Features

1. Edit TypeScript files in `src/`
2. Update types in `src/types/index.ts`
3. Rebuild: `npm run build`
4. Test on emulator or device

### Debugging

**Watch logs:**
```bash
tizen run -s device-id --log
```

**Storage inspection:**
```typescript
import { storage } from '@utils/storage';
console.log(storage.getValue('authToken'));
```

## Performance Optimization

- **Metrics smoothing**: 150ms exponential smoothing for stable display
- **Update interval**: 250ms (4 fps) — balances responsiveness and battery
- **Data compression**: Metrics are quantized and sent as numbers
- **Memory**: ~8MB heap usage during activity

## License

Copyright © 2026 AI Run Coach. All rights reserved.

## Support

- Email: support@airuncoach.live
- Docs: https://docs.airuncoach.live
- Forums: https://community.airuncoach.live

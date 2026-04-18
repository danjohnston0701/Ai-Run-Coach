# Samsung Galaxy Watch App — Quick Start

## Installation (2 minutes)

```bash
cd samsung-watch-app
npm install
```

## Development (Live Reload)

```bash
npm run dev
# Watches for changes, auto-rebuilds
```

## Build for Testing

```bash
npm run build
npm run package
# Creates build/AiRunCoach.wgt
```

## Deploy to Watch

```bash
# 1. Enable Developer Mode on watch
# Settings → About → Tap version 5x

# 2. Connect watch (WiFi)
tizen connect -t <watch-ip>

# 3. List connected devices
tizen list-devices

# 4. Install app
tizen install -s <device-id> -- build/

# 5. View logs
tizen log -s <device-id>
```

## File Structure at a Glance

```
src/
├── App.ts                 ← Main app (watch controller)
├── components/
│   ├── RunScreen.ts       ← UI dashboard
│   └── ZoneArc.ts         ← HR zone arc
├── services/
│   ├── PhoneLink.ts       ← Phone communication
│   └── DataStreamer.ts    ← Backend API
├── utils/
│   ├── formatting.ts      ← Display formatting
│   └── storage.ts         ← Local storage
└── types/
    └── index.ts           ← TypeScript types
```

## Key Features

| Feature | How It Works |
|---------|--------------|
| **Timer** | Displayed at top in cyan (MM:SS format) |
| **Pace** | Center large text, color-coded by coaching |
| **Distance** | Left bottom metrics |
| **Heart Rate** | Right bottom metrics, color by zone |
| **Cadence** | Bottom center (spm) |
| **Zone Arc** | 240° arc at top, shows active HR zone |
| **Coaching** | Green banner with cue text |

## Communication Diagram

```
Watch ←→ Phone (MessagePort) ←→ Backend API
  ↓         ↓                      ↓
Auth    Coaching cues          Metrics store
Metrics    Control flow         AI generation
```

## Backend API Endpoints

All mirror Garmin API but under `/api/samsung-companion/`:

```
POST /api/samsung-companion/auth
POST /api/samsung-companion/session/start
POST /api/samsung-companion/data
POST /api/samsung-companion/session/end
GET  /api/samsung-companion/status
POST /api/samsung-companion/coaching-cue
```

## Environment

- **Node.js**: 16+
- **Tizen SDK**: 5.5+
- **Package Manager**: npm

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Build fails | `npm install --force` |
| Watch not found | `tizen daemon -s` then reconnect |
| App crashes | Check logs: `tizen log -s <id>` |
| Phone not communicating | Enable MCF in Android, initialize SamsungWatchManager |

## Next: Integration

### Android Phone (SamsungWatchManager)

```kotlin
val watchManager = SamsungWatchManager(context)
watchManager.setListener(object : SamsungWatchManager.WatchConnectedListener {
    override fun onWatchConnected(watchName: String) {
        println("Watch connected: $watchName")
    }
    override fun onMessageReceived(message: String) {
        println("Message from watch: $message")
    }
})
watchManager.initialize()

// Send auth token
watchManager.sendAuthToken(authToken, runnerName)
```

## Git Workflow

```bash
# New branch for Samsung work
git checkout -b feature/samsung-watch

# When ready to merge
git push origin feature/samsung-watch
# Create PR on GitHub
```

## Deployment Checklist

- [ ] App builds without errors (`npm run build`)
- [ ] Works on emulator (`tizen install -s emulator`)
- [ ] Works on real device (Galaxy Watch 4+)
- [ ] Connects to phone via MCF
- [ ] Receives auth token from phone
- [ ] Streams data to backend
- [ ] Displays coaching cues
- [ ] Completes full run session

## Version Info

- **App**: AI Run Coach
- **Watch Package ID**: com.airuncoach.watch
- **Garmin App ID**: F05F6F7A3B2347668CCACE4B043DB794 (reference)
- **Samsung Target**: Galaxy Watch 4+
- **Tizen OS**: 9.0+

## Resources

- **Detailed Guide**: See `SAMSUNG_BUILD_GUIDE.md`
- **Full Docs**: See `samsung-watch-app/README.md`
- **Architecture**: See `SAMSUNG_WATCH_APP_SUMMARY.md`

---

**TL;DR**: `npm install` → `npm run build` → `tizen install -s <device-id>` → Done! 🎉

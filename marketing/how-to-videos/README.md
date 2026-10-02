# Watch + phone how-to videos

Four setup explainers, one per watch/phone combination, shown in the apps from the Connected
Devices tiles ("Watch the demo") and usable on YouTube/Reels:

| Video | Folder | Edit composition | In-app file |
|---|---|---|---|
| Garmin + iPhone | `garmin-iphone/` | `Long` (16:9) + `Short` (9:16) | `assets/videos/how-to/garmin-iphone.mp4` |
| Garmin + Android | `garmin-android/` | `GarminAndroid` | `assets/videos/how-to/garmin-android.mp4` |
| Apple Watch + iPhone | `applewatch-iphone/` | `AppleWatchIphone` | `assets/videos/how-to/applewatch-iphone.mp4` |
| Galaxy Watch + Android | `galaxywatch-android/` | `GalaxyWatchAndroid` | `assets/videos/how-to/galaxywatch-android.mp4` |

Each folder has the script (`SCRIPT.md`) and how its footage was recorded (`RECORDING.md`, tools
in `tools/`, raw takes in the git-ignored `takes/`). The edit is one shared Remotion project in
`edit/`; voiceover is AWS Polly neural "Olivia" (`generate-voiceover.mjs` for the three newer videos,
`garmin-iphone/generate-voiceover.mjs` for the first).

**In the apps:** `GET /api/how-to-videos?platform=ios|android` (`server/routes-how-to-videos.ts`)
lists only *published* videos; a tile shows its link only then. The in-app files are 720p
fast-start MP4s made from the renders:

```bash
ffmpeg -i edit/out/<render>.mp4 -vf scale=1280:720 -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart ../../assets/videos/how-to/<id>.mp4
```

**All four videos share one deterministic 5 km run** (speed/HR/cadence formula in the iOS
`VideoDemoMode.swift`, the watch app's `WatchVideoDemoMode.swift`, Android `VideoDemoMode.kt`, the
Wear OS app's `WearVideoDemoMode.kt` and the Garmin `(:video)` build — change all five together), so footage from different devices and
takes lines up by elapsed time. Demo runs this creates land in the developer's account — delete
them once a video is signed off.

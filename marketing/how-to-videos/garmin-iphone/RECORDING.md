# Recording + editing the Garmin + iPhone video

Everything here runs from this folder. Raw takes live in `takes/` (git-ignored, large); the edit
is the shared Remotion project in `../edit/` (all three how-to videos — see `../README.md`).

## 1. Simulators

**iPhone** — iPhone 17 Pro simulator `A51070DA-94AD-4BB6-9CC6-A35CD96D9735`, iOS debug build of
the app from `~/Desktop/Ai-Run-Coach-iOS/Ai Run Coach`:

```bash
cd ~/Desktop/Ai-Run-Coach-iOS/"Ai Run Coach"
xcodebuild build -workspace "Ai Run Coach.xcworkspace" -scheme "Ai Run Coach" \
  -destination "platform=iOS Simulator,id=A51070DA-94AD-4BB6-9CC6-A35CD96D9735" \
  -configuration Debug -derivedDataPath ~/Library/Caches/arc-video-dd
xcrun simctl install booted ~/Library/Caches/arc-video-dd/Build/Products/Debug-iphonesimulator/"Ai Run Coach.app"
```

`VideoDemoMode.swift` (DEBUG only) fakes a paired Forerunner 965 when launched with
`-ARCVideoDemo` (add `-ARCVideoDemoUnpaired` for the pairing scene), and streams the scripted
run when sent `notifyutil -p live.airuncoach.videodemo.start`. Signed in as the developer account.

The dashboard's 5 km / 26:40 target lives in the **app container's** prefs, not the simulator's
global domain — `simctl spawn defaults write live.airuncoach.Ai-Run-Coach …` silently writes the
wrong file. Write it through cfprefsd with the container path:

```bash
D=$(xcrun simctl get_app_container booted live.airuncoach.Ai-Run-Coach data)
xcrun simctl spawn booted defaults write "$D/Library/Preferences/live.airuncoach.Ai-Run-Coach" targetMinutes -int 26
xcrun simctl spawn booted defaults write "$D/Library/Preferences/live.airuncoach.Ai-Run-Coach" targetSeconds -int 40
```

**Watch** — Connect IQ simulator, Forerunner 965, the `(:video)` build (never upload it):

```bash
cd ../../../garmin-companion-app
monkeyc -f monkey_video.jungle -d fr965 -o bin/AiRunCoach_video.prg -y developer_key.der -r
```

It shows a fixed pairing code (482 913) and plays the real screens on a timer: code → "Prepare on
your phone" → GPS → ready → START → a deterministic 5 km run (same speed/HR/cadence formula as
`VideoDemoMode.swift`, so both devices show the same numbers at the same elapsed second) →
FINISHED. `VIDEO_SKIP_SEC` in `RunView.mc` fast-forwards the run (e.g. 1590 to film the finish
in a minute) — set it back to 0 afterwards. Battery is set to 86% via Settings → Set Battery
Status. `tools/watch-restart.sh` gives a clean simulator restart (it wedges easily).

## 2. Takes — `tools/record-take.sh`

- `pairing` — watch pairing clip, then the phone pairing flow (unpaired mode).
- `watch-pairing` — just the watch half.
- `main` — both: prepare → START (phone START fired the moment the watch logs `startRun()`) → full
  27-minute 5 km run.

Phone: `simctl io recordVideo` (its own framebuffer). Watch: `tools/watchcap.sh`, which grabs the
Connect IQ **window** with `screencapture -l` — it records correctly even with other windows on
top. (Screen-region capture was tried first and filmed a video call that was covering the watch.)
Maestro flows are in `tools/flows/`.

The simulator's recordings are variable-frame-rate; re-encode the parts you use to constant 30 fps
before picking timestamps or editing (`takes/cfr/`), otherwise timestamps and seeking drift:

```bash
ffmpeg -i takes/phone-main-XXXX.mp4 -ss 0 -to 140 -vf fps=30 -c:v libx264 -crf 16 -pix_fmt yuv420p takes/cfr/phone-main-start.mp4
```

`tools/contact.py <video> <out.png> [start end step cols width]` makes a timestamped contact sheet
for finding in/out points (needs Pillow). `tools/make-watch-skin.py` cut the watch body out of a
simulator frame into `../edit/public/watch/skin.png` (strap recoloured, display left transparent).

## 2b. Watch-only re-takes — `tools/watch-take.sh`

`tools/watch-take.sh <name> <skip-sec> <seconds-after-START>` rebuilds the `(:video)` build with
`VIDEO_SKIP_SEC` patched (restored to 0 afterwards), restarts the simulator and films one take,
logging wall-clock times of recording start and START. The 2026-10-01 re-film (calm HR-zone
colours, prompt-free FINISHED screen) used `watch-start 0 25`, `watch-run 200 150`,
`watch-run2 930 30` and `watch-finish 1590 45`. Captures are 2× (Retina) — scale to 682×968 when
cutting clips. The phone footage was kept: the run is deterministic, so new watch clips line up
with it by elapsed time (`watch-run-1` is trimmed to start at elapsed 3:41, as before).

**2026-10-03 re-film (red HR ring, zone as a number only):** the same four takes again. Clips were
cut at the old clips' offsets shifted by the change in START time (found by frame-matching the old
clips against `takes/old-calm/`): `watch-start` 0.06 s / 72.5 s, `watch-run` 69.51 / 129,
`watch-run2` 50.155 / 28.1, `watch-finish` 1.09 / 93 — so every in-point in the edits still
holds. The previous clips are in `takes/cfr/old-calm/`.

## 3. Edit — `../edit/`

```bash
cd ../edit
npm install
npm run studio          # preview / scrub in the browser
npm run render:long     # → out/garmin-iphone-long.mp4  (16:9)
npm run render:short    # → out/garmin-iphone-short.mp4 (9:16, burned-in captions)
```

Clips are hard links in `../edit/public/clips/` (symlinks break when Remotion copies `public/`).
In/out points and tap positions are in `src/clips.ts`; scenes in `src/Long.tsx` / `src/Short.tsx`.
Concurrency is capped at 2 in `remotion.config.ts` — this is a 16 GB Mac that has already run out
of memory once on this project; don't run an Xcode build alongside a render.

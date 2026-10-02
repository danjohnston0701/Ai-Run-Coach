# Recording the Apple Watch + iPhone video

**Simulators:** iPhone 17 Pro `A51070DA-…` (iOS 26.2, signed in as the developer account) paired
with a watch simulator created for this, "AW Video 46mm" `86AEC8D1-…` (Series 11, watchOS 26.4):
`xcrun simctl pair <watch> <phone>`. WatchConnectivity works between them (messages, application
context); **file transfers never complete**, which is why demo mode syncs the run as a message.

**Build** (iOS repo): the iOS scheme embeds the watch app; install both:

```bash
xcodebuild build -workspace "Ai Run Coach.xcworkspace" -scheme "Ai Run Coach" \
  -destination "platform=iOS Simulator,id=A51070DA-94AD-4BB6-9CC6-A35CD96D9735" \
  -configuration Debug -derivedDataPath ~/Library/Caches/arc-video-dd
xcrun simctl install <phone> ".../Debug-iphonesimulator/Ai Run Coach.app"
xcrun simctl install <watch> ".../Ai Run Coach.app/Watch/Ai Run Coach Watch App.app"
```

**Watch demo mode** (`WatchVideoDemoMode.swift`, DEBUG only, launch arg `-ARCVideoDemo`): no
HealthKit/location prompts, GPS lock after 3 s, and START plays the shared deterministic 5 km run
through the real state machine, recordings and phone messages. Buttons are Darwin notifications:
`simctl spawn <watch> notifyutil -p live.airuncoach.videodemo.start` / `.end`; it pauses itself at
5 km. `-ARCVideoDemoSkip <s>` fast-forwards. The phone runs unmodified (real Prepare for Watch,
real mirroring); `tools/phone-gps.sh` walks the iPhone's location round the same loop.

**Gotcha — the watch recorder:** `simctl io recordVideo` on a watch simulator drops frames and
squeezes the timeline whenever the screen is static (a 30 s waiting screen came out as 1 s; the
first seconds after START went missing). Demo mode therefore flickers one corner pixel between two
near-identical blacks (`VideoDemoKeepAlivePixel`). Always convert takes to constant 30 fps with
sequential decoding before picking in-points — seeking the raw files is unreliable.

**Takes:** `tools/record-take.sh devices | main | summary` (main ≈ 30 min, aborts before START
if Prepare for Watch didn't reach "Waiting for Watch"; it now waits ~45 s after reinstalling the
watch app, since a phone launched too soon only offers "PREPARE RUN"). The current edit pairs the
2026-10-03 10:06 watch take (red heart rate, zone as a number only — `takes/cfr/watch-full-red.mp4`)
with the 2026-10-01 19:23 phone take — the same run, aligned by elapsed time (notes in
`edit/src/AppleWatchIphone.tsx`). The 10:06 phone recording isn't used. Previous watch clips
(calm zone colours) are in `takes/cfr/old-calm/`.

Demo runs created in the developer's account (delete after sign-off): `dc8bd1b0…`,
`1ea786ed…`, `d391e8a7…` (5.00 km, 1 Oct 2026), plus the 3 Oct 2026 ~10:06 NZDT re-take's run.

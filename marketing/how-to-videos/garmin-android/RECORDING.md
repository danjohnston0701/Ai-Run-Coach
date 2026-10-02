# Recording the Garmin + Android video

**Phone:** Android emulator `Medium_Phone_API_36.1` (1080×2400), debug build signed in as the
developer account. **Watch:** the Garmin + iPhone video's Connect IQ takes
(`../garmin-iphone/tools/watch-take.sh`) — same `(:video)` build and deterministic run.

**Android demo mode** (`VideoDemoMode.kt`, debug builds only), driven by adb broadcasts:

```bash
adb shell am broadcast -p live.airuncoach.airuncoach -a live.airuncoach.videodemo.ENABLE  # fake linked Forerunner 965
adb shell am broadcast -p live.airuncoach.airuncoach -a live.airuncoach.videodemo.START   # watch START + 1 Hz frames
adb shell am broadcast -p live.airuncoach.airuncoach -a live.airuncoach.videodemo.STOP
```

START goes through the real watch-message handler; frames are paced by the wall clock (an
earlier per-callback timer drifted a minute behind on a busy machine). Demo mode never fetches a
companion session — a stale "active" one once got the demo merged into a real run.

**Takes:** `tools/record-take.sh devices | main | finish | summary`. The emulator console's own
recorder (`adb emu screenrecord`, VP9 webm) has no 3-minute cap; convert to constant 30 fps mp4.
The script sets System UI demo mode (9:41, full battery), exempts the app from battery
optimisation (otherwise "Let app always run in background?" pops up mid-run), taps "Wait" on any
ANR dialog, and aborts before START if Prepare for Watch didn't reach "Waiting for Watch". The
26:40 target is written into the app's `user_prefs` (`target_minutes`/`target_seconds`).

Footage used: start + mid from the 19:36 take (mid: elapsed = t + 198), finish + summary from the
re-take (see `edit/src/GarminAndroid.tsx`).

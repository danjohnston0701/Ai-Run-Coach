# Recording the Galaxy Watch + Android video

**Phone:** Android emulator `Medium_Phone_API_36.1` (1080×2400), debug build signed in, 5.0 km
with a 26:40 target time (written into the app's `user_prefs`: `target_time_enabled`,
`target_minutes` 26, `target_seconds` 40 — `run-as` the debug package, force-stop first).
**Watch:** Wear OS emulator `Wear_OS_Large_Round` (454×454), debug build of `wear/`.

Neither emulator can talk to the other (no Data Layer pairing between emulators), so both run in
video mode, driven by adb broadcasts from `tools/record-take.sh`:

- Phone — `VideoDemoMode.kt` with `--es watch samsung`: SamsungWatchManager reports a linked
  "Galaxy Watch7"; START/STOP and 1 Hz watchData frames go through the real watch-message handler.
- Watch — `WearVideoDemoMode.kt`: ENABLE (pairing screen) → LINK (prepare-on-phone) → PREPARE
  (coached 5 km, target 5:20, GPS locks over ~8 s) → START → the shared deterministic run. Nothing
  is sent to the server or phone from the watch in this mode.

**Takes** (`tools/record-take.sh devices | main | finish | solo`, emulator console screenrecord,
VP9 webm → CFR 30 fps mp4 in `edit/public/clips/galaxywatch-android/`):

- `devices` — Profile → Connected Devices → Samsung card → Get Watch App.
- `main` — both devices: pairing → prepare → START together → real-time 5 km (~27 min), filmed at
  the start, elapsed 3:20–7:50 (1 km coach message ~5:30) and 26:00 → 5 km, then Run Summary.
- `finish` — watch only, `skip 1585`: bottom button pauses at 26:39 / 5.00 km (the second before
  the run hits 5 km, where video mode would finish on its own) → Finish Run → Yes → FINISHED.
- `solo` — watch only, phone "not connected" → Continue without coaching → GPS → START.

The main take saves a demo run to the signed-in account (2026-10-03, ~08:58 NZDT) — delete it.

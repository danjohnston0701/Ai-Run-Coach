# Galaxy Watch + Android setup video — script v1 (2026-10-03)

One cut: **long (16:9, ~1:40)**, for the in-app "Watch the demo" link on the Samsung / Wear OS
tile (Android Connected Devices), YouTube, and the Wear OS app's Play Store listing. Voiceover
lines live in `../generate-voiceover.mjs` — edit both. Phone = Android emulator (Medium Phone,
API 36.1); watch = Wear OS emulator (Wear_OS_Large_Round, 454×454) running the debug Wear app's
video mode (`WearVideoDemoMode.kt`). Same deterministic 5 km as the other videos.

Galaxy Watch only works with Android phones (Galaxy Watch4+ can't pair with an iPhone), so there
is no iPhone version. Differences from the Garmin videos: the watch links over the Wear OS Data
Layer (no code, no Garmin Connect), and START / FINISH are on-screen buttons — a Galaxy Watch's
top button is the system Home key, so the bottom button pauses and Finish Run is tapped.

| # | Voiceover | Shot |
|---|-----------|------|
| 1 | Your Galaxy Watch tracks the run. Your Android phone coaches you through it. Here's how to get them working together. | Watch + phone, run in progress. |
| 2 | First, add the free Ai Run Coach app to your watch. In the app, open Profile, then Connected Devices, and tap Get Watch App to install it from Google Play. | Phone: Profile → Connected Devices → Samsung card → Get Watch App → "Install on Galaxy Watch". |
| 3 | Open Ai Run Coach on the watch while the app is open on your phone, and they link automatically — there's no code to type. The watch then asks you to prepare on your phone. That's what switches on live coaching. | Watch: "Waiting…" → "Prepare on your phone". |
| 4 | Now set up your run on the phone as you normally would — a distance, a target time, or a session from your training plan. Then tap Prepare for Watch. Your coach gets the session ready and sends it to your wrist. | Phone: 5 km · 26:40 → Run Without Route → Prepare for Watch. Watch: coached session, GPS lock, ready. |
| 5 | Your phone now waits for the watch. Keep it with you — your coach talks to you through your headphones. | Phone: "Waiting for Watch". |
| 6 | Once GPS locks, tap Start Run on the watch. Your phone starts at exactly the same moment. | Watch: ready → START. Phone flips to the live run. |
| 7 | Your watch shows pace, distance and heart rate, and your coach uses that same data to guide you — when to hold steady, when to push, how your splits are looking. | Watch + phone live; coach cue caption. |
| 8 | When you're done, press the bottom button to pause, then tap Finish Run. The run saves straight to the app, with your splits, charts and your coach's review waiting on your phone. | Watch: pause → Finish Run → FINISHED. Phone: Run Summary. |
| 9 | Out without your phone? Tap Continue without coaching. The watch records the run on its own and uploads it when you're back in range. | Watch: prepare screen → Continue without coaching. |
| 10 | Ai Run Coach. Your watch, your phone, one coach. | End card + Google Play badge. |

How it was recorded: `RECORDING.md`.

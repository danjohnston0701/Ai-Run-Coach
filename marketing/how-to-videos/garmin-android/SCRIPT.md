# Garmin + Android setup video — script v1 (2026-10-01)

One cut: **long (16:9, ~1:40)**, for the in-app "Watch the demo" link on the Garmin tile
(Android Connected Devices) and YouTube. Voiceover lines live in `../generate-voiceover.mjs` — edit
both. Phone = Android emulator (Medium Phone, API 36.1); the watch footage is reused from the
Garmin + iPhone takes (`../garmin-iphone`) — same (:video) Forerunner 965 build and the same
deterministic run, so the numbers match at the same elapsed second.

Differences from the iPhone version: no pairing code on Android — the watch gets its token from
the phone over Garmin Connect (ConnectIQ) as soon as the watch app opens with the phone app running,
so scene 3 is "it links itself" rather than "type the code".

| # | Voiceover | Shot |
|---|-----------|------|
| 1 | Your Garmin tracks the run. Your Android phone coaches you through it. Here's how to get them working together. | Watch + phone, run in progress. |
| 2 | First, add the free Ai Run Coach app to your watch. In the app, open Profile, then Connected Devices, and tap Get Watch App to install it from the Connect IQ Store. | Phone: Profile → "Connected Devices" → Garmin card → "Get Watch App" → "Install on Garmin Watch". |
| 3 | Your watch links to your phone through the Garmin Connect app, so there's no code to type. Open Ai Run Coach on the watch while the app is open on your phone, and it's ready. | Watch: "Prepare on Phone" screen. |
| 4 | Now set up your run on the phone as you normally would — a distance, a target time, or a session from your training plan. Then tap Prepare for Watch. Your coach gets the session ready and sends it to your wrist. | Phone: 5 km · 26:40 → "RUN WITHOUT ROUTE" → "Prepare for Watch". Watch: coached start screen. |
| 5 | Your phone now waits for the watch. Keep it with you — your coach talks to you through your headphones. | Phone: "Waiting for Watch". |
| 6 | On the watch, stand still outdoors until GPS locks, then press START. Your phone starts at exactly the same moment. | Watch: GPS → ready → START. Phone flips to the live run. |
| 7 | Your watch shows pace, distance and heart rate on your wrist, and your coach uses that same data to guide you — when to ease off, when to push, how your splits are looking. | Watch + phone live; coach cue caption. |
| 8 | When you're done, finish on the watch. The run saves straight to the app, with your splits, charts and your coach's review waiting on your phone. | Watch: "FINISHED". Phone: Run Summary. |
| 9 | Leaving your phone at home? The watch records the run on its own and uploads everything once you're back in range. | Watch alone. |
| 10 | Ai Run Coach. Your watch, your phone, one coach. | End card + Connect IQ badge. |

How it was recorded: `RECORDING.md`.

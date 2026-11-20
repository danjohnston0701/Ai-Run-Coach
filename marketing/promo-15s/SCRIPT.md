# 15 s paid-social promo (9:16)

Content pack for assembling the ad in Gemini or any editor. Use real screen recordings and the
real logo. Don't generate the UI with AI: it warps the screens and the branding.

## Timeline

| Time | Picture | Audio | On-screen text |
|---|---|---|---|
| 0:00–0:03 | Runner puts in an earbud, then the phone taps **Start Run** with the coach on | Music only | **A running coach in your ear.** |
| 0:03–0:08 | Runner in motion (not talking), cut with the live run screen | `vo/coach-split-olivia.mp3` | **Real-time coaching, every km** |
| 0:08–0:12 | Scroll through the run summary: splits, heart-rate zones, pace chart | `vo/coach-finish-olivia.mp3` (or music only) | **Every run analysed. Zero guesswork.** |
| 0:12–0:15 | Logo centred on the dark background | `vo/outro-olivia.mp3` | **Download free on iOS & Android** |

Make the coach audio sound like it's in the runner's earbud: a little high-pass and a light
"phone speaker" EQ, with the music ducked under it. Nobody on camera should mouth the words.

## Voiceover files (`vo/`)

Generated with `node marketing/promo-15s/generate-voiceover.mjs`, using the app's own Polly coach
voices. Olivia (Australian female) fits the slots best. Brian (British male, the app's default
coach) is about 1.5 s longer per line.

| File | Line | Olivia | Brian |
|---|---|---|---|
| `coach-split-*` | "Five nineteen pace. Eight seconds quicker than last time. Hold it there." | 5.0 s | 6.5 s |
| `coach-hill-*` | "Hill ahead. Short, quick steps. Drive your arms." (alternative for 0:03–0:08) | 4.3 s | 5.8 s |
| `coach-finish-*` | "Final five hundred metres. You're beating your target. Finish strong." | 4.7 s | 6.1 s |
| `outro-*` | "Ai Run Coach. Download free on iOS and Android." | 4.0 s | 4.8 s |

These are written in the app's coaching style. Pace and splits are compared with the runner's
last run, and the coach never tells a runner to "slow down" or "conserve energy". If you edit the
lines, keep that rule.

## Logo (`logo/`)

- `logo-with-text.png`: 1536×1024, transparent, for the outro card.
- `logo-transparent.png`: 1024×1024, transparent mark only.
- `logo-runner.png`: 300×300, small mark (watermark, corner bug).

## Screen recordings still needed (record on the phone, vertical, 5–10 s each)

1. **Start Run**: the run setup screen with the coach on, then tap Start.
2. **Live run screen**: distance, pace and heart rate ticking. Android debug builds can drive a
   steady, believable demo run from adb (`VideoDemoMode.kt`; see
   `marketing/how-to-videos/garmin-android/RECORDING.md`). That gives clean numbers without
   running, and the same System UI demo mode (9:41, full battery).
3. **Run summary**: a slow scroll through splits, the heart-rate zone chart and the pace chart.
   Use a real run with nice-looking data, not a demo run.

## B-roll needed

- Earbud going in, or shoelaces being tied.
- Runner moving smoothly on a road or trail, mouth closed.
- A glance at the phone or watch mid-run, or a smile at the finish.

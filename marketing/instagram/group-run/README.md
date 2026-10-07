# Instagram — Group Runs launch post

| File | What | Spec |
|---|---|---|
| `slide-1.png` … `slide-6.png` | Carousel: run screen with coach message → group detail → "1 finished" mid-run → live results → AI debrief → CTA | 1080×1350 (4:5) |
| `reel.mp4` | Reel: hook → plan → start → run screen + group line → results filling in live → AI debrief → end card | 1080×1920, 30 fps, 47 s, **no audio** (add a track in Instagram) |

**Every phone screen is a real recording / screenshot of the Android app** — the debug build on the
`Medium_Phone_API_36.1` emulator, signed in as a demo runner against a **local** copy of the server
with a throwaway Postgres (nothing touches production). Only the headline copy, phone frame and
background are added. Runner names (Alex, Priya, Sam, Jordan, Mia) are fictional.

**Post only once the 2026-10-07 group-run changes are live** (Replit redeploy + app builds): the
one-line "GROUP RUN · N runners · N finished" indicator, the `#rank` / "N of M finished · updating
live" results and the corrected coach toggle are all from this build.

## How it was shot (re-shoot recipe)

- Local server: `TZ=UTC EXTERNAL_DATABASE_URL=postgresql://…localhost… PORT=5055 npx tsx --env-file .env server/index.ts`
  against an `embedded-postgres` DB **set to UTC** (a NZ-time DB made the server's 30 s
  rapid-duplicate check span 13 h and merged runs together).
- App → local server: debug-only `debug_api_base_url` in the app's `user_prefs` (`RetrofitClient.debugApiBaseUrlOverride`).
- Demo group: `tools/seed` via the real API (register → group → invite → accept); `tools/reset.cjs` resets it.
- Alex's run: the existing `VideoDemoMode` (simulated Garmin, the same deterministic 5 km / 26:40
  as the how-to videos). Emulator `geo fix` can't be used — it reports speed 0, so the app rightly
  drops every point as stationary drift.
- The other four: `tools/crew.cjs` posts their runs through `POST /api/runs` with `groupRunId`.
- Takes: `tools/take-a.sh` (list → detail → start → watch START), `tools/take-run.sh` + `take-b.sh`
  (last minutes → "1 finished" → finish), `take-c.sh` (Run Summary › Group Run tab while the
  remaining runners are linked via `POST /complete` → AI debrief). `tools/ui.py` drives the UI via adb.
- Edit: `marketing/how-to-videos/edit/src/GroupRunReel.tsx` (`npm run render:group-run-reel`), clips in
  `edit/public/clips/group-run/`. Carousel: `carousel.html` + `./render.sh`, screenshots in `screens/`.

Two demo-environment corrections, both disclosed here: the overloaded emulator processed the simulated
watch's STOP ~5 min late, so Alex's stored duration was set back to the watch's 26:40 in the local DB;
and for take C the three later finishers' runs were un-linked and re-linked one at a time so their
arrival could be filmed (the app's own 15 s poll picks each up — nothing in the app was faked).
The detail screenshot predates the "5 of 5 going" label fix (it reads "5 going • 5 invited").

## Caption

> Run together. Wherever you are. 🏃‍♀️🏃🏃‍♂️
>
> Group Runs are here in Ai Run Coach:
> 1️⃣ Set up a group run and invite your crew
> 2️⃣ Everyone records their own run on their phone or watch — with their own AI coach
> 3️⃣ Your run screen stays the same, plus one line showing your group and who's finished
> 4️⃣ Results fill in live as each runner gets home — then get an AI debrief on how you ran against the group
>
> Works on iPhone, Android, Garmin, Apple Watch and Galaxy Watch.
> Download free — link in bio 🔗
>
> #running #runningcommunity #runclub #grouprun #runwithfriends #runnersofinstagram #aicoach #trainingapp #garmin #applewatch #5k

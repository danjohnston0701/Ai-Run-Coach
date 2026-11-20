# 30 s ad: InVideo brief (9:16, plus a 1:1 export)

Every coach line is a real cue the app spoke on Daniel's own runs, trimmed to fit its slot.
Audio is in `../promo-15s/vo/real-*.mp3` (app Polly voices; Olivia fits the slots, Brian is
~1.5 s longer). Regenerate with `node marketing/promo-15s/generate-voiceover.mjs`.

## Paste into InVideo

**Product:** Ai Run Coach is a running app for iOS and Android. It gives you a real-time AI coach that talks to you through your earbuds while you run. It builds a personalised training plan from your own running history, then analyses every run afterwards with splits, heart-rate zones and pace charts. It works with Garmin, Apple Watch and Samsung Galaxy Watch.

**Format:** 30 seconds, vertical 9:16 for Reels, TikTok and Shorts. Also export a 1:1 version.

**Audience:** Everyday runners aged 25–50, from beginners building up to a first 5K to people training for a half marathon. They want to improve but don't have a personal coach.

**Tone:** Energetic, motivating and confident, never preachy. It should feel like having a supportive coach right beside you. Use real outdoor running: dawn or golden-hour roads, park paths, trails. Show a diverse mix of runners. Keep it clean and modern.

**Brand look:** Dark navy-black background (#0A0F1A), bright cyan accent (#00D4FF) and warm orange for highlights and the call to action (#FF6B35). Use a bold sans-serif font in white with clean, minimal text animation. Write the name exactly as **"Ai Run Coach"** (lowercase "i").

**Music:** An upbeat, driving electronic or indie-pop track, about 120–130 BPM, building towards the end. Duck it under all voice.

**Voices:** A warm, confident narrator for the narrator lines. **For the coach lines, use my uploaded audio files, not a generated voice.** They're the app's real coach voice. Make them sound like they're coming through an earbud: slightly compressed, with a light "phone speaker" EQ. Nobody on camera should mouth the words.

| Time | Visual | Audio | On-screen text |
|---|---|---|---|
| 0:00–0:03 | Close-up of a runner putting in an earbud at dawn, then a cut to their feet hitting the road | Narrator: "What if your coach came on every run?" | **A running coach in your ear** |
| 0:03–0:09 | Runner in smooth motion on a city road, cut with my uploaded live-run screen recording | Coach file `real-splits-consistent-olivia.mp3`: "Four thirty-seven, four thirty-eight, four thirty-six. That's disciplined running!" | **Real-time coaching, every km** |
| 0:09–0:14 | A different runner climbing a hill on a trail, arms driving | Coach file `real-hill-olivia.mp3`: "Stay focused, you're halfway through the hill." | **Coaching that reacts to your run** |
| 0:14–0:19 | Runner at home or in a café scrolling through a weekly training plan on their phone (my upload) | Narrator: "A training plan built from your running, not a template." | **Your plan. Your level. Your goal.** |
| 0:19–0:23 | A wrist glance at a smartwatch mid-run, then my run summary recording (splits, heart-rate charts) | Narrator: "Works with Garmin, Apple Watch and Galaxy Watch." | **Garmin · Apple Watch · Galaxy Watch** |
| 0:23–0:26 | Runner sprinting the final stretch, finishing with a smile and a fist pump | Coach file `real-final-100-olivia.mp3`: "Final one hundred metres. Give it everything you've got!" | **Real coaching from a real run** |
| 0:26–0:30 | Ai Run Coach logo centred on the dark navy background with a cyan glow | `outro-olivia.mp3`: "Ai Run Coach. Download free on iOS and Android." | **Download free · iOS & Android** (orange button style) |

**Rules:**
- Don't generate fake app screens or phone UI. Use my uploaded screen recordings and logo wherever a phone or watch screen appears.
- Don't rewrite or re-voice the coach lines. Use the uploaded files as they are.
- No real brand logos on clothing or shoes, apart from the watch brands named in the text.
- The total length is exactly 30 seconds.

## Upload to InVideo

- `../promo-15s/vo/real-splits-consistent-olivia.mp3`, `real-hill-olivia.mp3`, `real-final-100-olivia.mp3`, `outro-olivia.mp3`
- `../promo-15s/logo/logo-with-text.png`, `logo-transparent.png`
- Screen recordings: live run, training plan, run summary (see the 15 s `SCRIPT.md` checklist).
  The live-run screen at 0:03–0:09 should show a pace around 4:36–4:38 so it matches the cue.

## Real cues: sources and alternatives

All from `runs.ai_coaching_notes` on Daniel's account. "Min" is elapsed run time.

| File | Line (as spoken) | Olivia | Source | Trim |
|---|---|---|---|---|
| `real-splits-consistent` | "Four thirty-seven, four thirty-eight, four thirty-six. That's disciplined running!" | 4.9 s | Cambridge half, 09-19, min 16 | Dropped the "Fantastic job, Daniel" opener and the form tip after |
| `real-hill` | "Stay focused, you're halfway through the hill." | 2.5 s | Hill session, 08-11, min 7 | Verbatim |
| `real-final-100` | "Final one hundred metres. Give it everything you've got!" | 3.4 s | Hill session, 08-11, min 17 | Verbatim |
| `real-metronome` | "Nine consistent splits. It's like you've got a metronome in your head!" | 4.0 s | Cambridge half, min 46 | Trimmed; alt for 0:09–0:14 |
| `real-split` | "Kilometre fifteen. Five forty-two pace. You're dead on target. Mighty work!" | 6.1 s | Cambridge half, min 75 | Condensed from the km-15 split; alt for 0:03–0:09, a bit long |
| `real-eta` | "You're projected to finish seventeen minutes ahead of your target. Keep that rhythm steady!" | 4.6 s | Cambridge half, min 68 | Condensed |
| `real-hr` | "Heart rate back in zone. Good response." | 2.9 s | Easy run, 07-16 | Verbatim; good under a watch shot |
| `real-final-250` | "Two hundred and fifty metres to go! Feel the finish line pulling you in!" | 4.1 s | 5K, 08-18, min 20 | Two sentences of the original |
| `real-finish` | "You danced through that 5K in twenty-one minutes and thirty-eight seconds. Talk about running like the wind!" | 5.6 s | 5K, 08-18, finish | First sentence, name removed; too long for 30 s, fine for a 45–60 s cut |

Left out on purpose: the many "ease back / settle into your target pace" cues (they break the
coaching effort rule), the 09-30 to 10-02 runs (a flat 5:20–5:21 every km, which looks like test
runs), and the km-20 hill cue, which calls a 5.6 % grade "steep" (the coach now keeps "steep" for
10 %+). Runner names are removed from every line.

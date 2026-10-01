// Source clips (public/clips, hard links into ../takes) and the in/out points picked from them.
// Times are seconds into each clip. Phone clips are the simulator recordings re-encoded to a
// constant 30 fps (takes/cfr) — the raw simctl files are variable-rate and seek unreliably.
//
// Run shots are aligned by run-elapsed time: the watch and phone use the same deterministic
// speed/HR/cadence formula, so at the same elapsed second they show the same numbers.
//   phone-mid t  ↔ elapsed t + 223 s       watch-run-1 t ↔ elapsed t + 221 s  (so watch = phone + 2)
export const CLIPS = {
  phonePair: "clips/phone-pairing.mp4", // dashboard → Profile → Connected Devices → pair → code → linked
  phoneStart: "clips/phone-start.mp4", // dashboard → Run Setup → Prepare for Watch → Waiting → live at 56.3
  phoneMid: "clips/phone-mid.mp4", // live run, elapsed 3:43–7:43 (1 km coach message at 103.5–115)
  phoneEnd: "clips/phone-end.mp4", // live 26:28 at 44 → 26:39 at 55 → Run Saving (then the failed-upload screen — don't use)
  phoneSummary: "clips/phone-summary.mp4", // Run Insights → Summary tab (map, splits) → Graphs
  phoneSummaryAi: "clips/phone-summary-ai.mp4", // AI review: Performance Score 85/100
  watchStart: "clips/watch-start.mp4", // code 0–17.5 → prepare on phone 18–32.5 → GPS 33–40 → ready → START 47.8
  watchRun1: "clips/watch-run-1.mp4", // elapsed 3:41–5:45
  watchRun2: "clips/watch-run-2.mp4", // elapsed ~5:50 → finish (old FINISHED layout — don't use the end)
  watchFinish: "clips/watch-finish.mp4", // fast-forwarded to 26:30 → FINISHED at 57.9 (fixed layout)

  phoneLive: 56.3, // phone-start: flips from Waiting for Watch to the live run
  watchStartPress: 47.8, // watch-start: START pressed
  coachCue:
    "You're cruising along at 5 minutes and 20 seconds per kilometre after 1 kilometre. Your cadence of 170 steps per minute is looking grand too — steady and strong!",
};

/** Phone-screen tap positions (px in the 1206×2622 recording). */
export const TAPS = {
  profileTab: { x: 1022, y: 2452 },
  connectedDevices: { x: 600, y: 1747 },
  getWatchApp: { x: 601, y: 840 },
  pairGarmin: { x: 637, y: 1018 },
  enterCode: { x: 601, y: 2296 },
  linkWatch: { x: 601, y: 1643 },
  runWithoutRoute: { x: 603, y: 1253 },
  prepareForWatch: { x: 603, y: 1694 },
};

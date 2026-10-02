// Voiceover for the Garmin + Android, Apple Watch + iPhone and Galaxy Watch + Android how-to videos, one MP3 (+ word
// timings for captions) per scene, AWS Polly neural "Olivia" (en-AU) — the same voice as the
// Garmin + iPhone video (garmin-iphone/generate-voiceover.mjs). Lines must match each video's
// SCRIPT.md. Needs AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in the repo .env. Writes straight into
// edit/public/vo/<video>/.
//
//   node marketing/how-to-videos/generate-voiceover.mjs [garmin-android|applewatch-iphone|galaxywatch-android]   (from the repo root)
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);

const LINES = {
  "garmin-android": [
    "Your Garmin tracks the run. Your Android phone coaches you through it. Here's how to get them working together.",
    "First, add the free Ai Run Coach app to your watch. In the app, open Profile, then Connected Devices, and tap Get Watch App to install it from the Connect IQ Store.",
    "Your watch links to your phone through the Garmin Connect app, so there's no code to type. Open Ai Run Coach on the watch while the app is open on your phone, and it's ready.",
    "Now set up your run on the phone as you normally would — a distance, a target time, or a session from your training plan. Then tap Prepare for Watch. Your coach gets the session ready and sends it to your wrist.",
    "Your phone now waits for the watch. Keep it with you — your coach talks to you through your headphones.",
    "On the watch, stand still outdoors until GPS locks, then press START. Your phone starts at exactly the same moment.",
    "Your watch shows pace, distance and heart rate on your wrist, and your coach uses that same data to guide you — when to ease off, when to push, how your splits are looking.",
    "When you're done, finish on the watch. The run saves straight to the app, with your splits, charts and your coach's review waiting on your phone.",
    "Leaving your phone at home? The watch records the run on its own and uploads everything once you're back in range.",
    "Ai Run Coach. Your watch, your phone, one coach.",
  ],
  "applewatch-iphone": [
    "Your Apple Watch tracks the run. Your iPhone coaches you through it. Here's how to set them up.",
    "Ai Run Coach usually installs on your watch automatically. If it doesn't, open Apple's Watch app on your iPhone, find it under Available Apps, and tap Install. In Profile, Connected Devices, the Apple Watch card shows Connected once it's ready.",
    "Open Ai Run Coach on your watch. It asks you to prepare on your iPhone — that's what switches on live coaching.",
    "On your phone, set up your run — a distance, a target time, or a session from your training plan — and tap Prepare for Watch. The session lands on your wrist, ready to go.",
    "Your phone now waits for the watch. Keep it with you — your coach talks to you through your headphones.",
    "Tap Start Coached Run on the watch, and your phone starts at exactly the same moment.",
    "Your watch shows pace, distance and heart rate, and your coach uses that same data to guide you — when to ease off, when to push, how your splits are looking.",
    "When you're done, pause and stop on the watch. The run syncs to the app, with your splits, charts and your coach's review waiting on your phone.",
    "Out without your phone? Tap Continue without coaching, and the watch records the run on its own and syncs it when you're back.",
    "Ai Run Coach. Your watch, your phone, one coach.",
  ],
  "galaxywatch-android": [
    "Your Galaxy Watch tracks the run. Your Android phone coaches you through it. Here's how to get them working together.",
    "First, add the free Ai Run Coach app to your watch. In the app, open Profile, then Connected Devices, and tap Get Watch App to install it from Google Play.",
    "Open Ai Run Coach on the watch while the app is open on your phone, and they link automatically — there's no code to type. The watch then asks you to prepare on your phone. That's what switches on live coaching.",
    "Now set up your run on the phone as you normally would — a distance, a target time, or a session from your training plan. Then tap Prepare for Watch. Your coach gets the session ready and sends it to your wrist.",
    "Your phone now waits for the watch. Keep it with you — your coach talks to you through your headphones.",
    "Once GPS locks, tap Start Run on the watch. Your phone starts at exactly the same moment.",
    "Your watch shows pace, distance and heart rate, and your coach uses that same data to guide you — when to hold steady, when to push, how your splits are looking.",
    "When you're done, press the bottom button to pause, then tap Finish Run. The run saves straight to the app, with your splits, charts and your coach's review waiting on your phone.",
    "Out without your phone? Tap Continue without coaching. The watch records the run on its own and uploads it when you're back in range.",
    "Ai Run Coach. Your watch, your phone, one coach.",
  ],
};

const polly = new PollyClient({
  region: "us-east-1",
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});

const only = process.argv[2];
for (const [video, lines] of Object.entries(LINES)) {
  if (only && only !== video) continue;
  const dir = new URL(`edit/public/vo/${video}/`, import.meta.url);
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, text] of lines.entries()) {
    const name = `scene-${String(i + 1).padStart(2, "0")}`;
    const res = await polly.send(new SynthesizeSpeechCommand({
      Text: text, VoiceId: "Olivia", Engine: "neural", OutputFormat: "mp3", SampleRate: "24000",
    }));
    fs.writeFileSync(new URL(`${name}.mp3`, dir), Buffer.from(await res.AudioStream.transformToByteArray()));
    const marks = await polly.send(new SynthesizeSpeechCommand({
      Text: text, VoiceId: "Olivia", Engine: "neural", OutputFormat: "json", SpeechMarkTypes: ["word"],
    }));
    const ls = Buffer.from(await marks.AudioStream.transformToByteArray()).toString().trim().split("\n");
    fs.writeFileSync(new URL(`${name}.words.json`, dir),
      JSON.stringify(ls.map((l) => { const m = JSON.parse(l); return { t: m.time, w: m.value }; })));
    console.log(video, i + 1, "ok");
  }
}

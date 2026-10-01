// Generates the voiceover for the Garmin + iPhone setup video, one MP3 per scene, using
// AWS Polly neural "Olivia" (en-AU) — the voice picked from voice-samples/ on 2026-09-30.
// Lines must match SCRIPT.md. Needs AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in the repo .env.
//
//   node marketing/garmin-iphone-video/generate-voiceover.mjs   (from the repo root)
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
  long: [
    "Your Garmin tracks the run. Your iPhone coaches you through it. Here's how to get them working together — it takes about two minutes.",
    "First, add the free Ai Run Coach app to your watch. On your iPhone, open Profile, then Connected Devices, and tap Get Watch App to download it from the Connect IQ Store.",
    "Open the app on your watch and it'll show a six-digit code. Back on your phone, tap Pair Garmin Device, then Enter Code From Watch, and type it in. That's it — you only ever do this once.",
    "Now set up your run on the phone as you normally would — a distance, a target time, or a session from your training plan. Then tap Prepare for Watch. Your coach gets the session ready and sends it to your wrist.",
    "Your phone now waits for the watch. Lock it and pop it in your pocket — your coach still talks to you through your headphones.",
    "On the watch, stand still outdoors until GPS locks, then press START. Your phone starts at exactly the same moment.",
    "Your watch shows pace, distance and heart rate on your wrist, and your coach uses that same data to guide you — when to ease off, when to push, how your splits are looking.",
    "When you're done, pause and finish on the watch. The run saves straight to the app, with your splits, charts and your coach's review waiting on your phone.",
    "Leaving your phone at home? The watch records the run on its own and uploads everything once you're back in range.",
    "Ai Run Coach. Your watch, your phone, one coach.",
  ],
  short: [
    "Garmin on your wrist, a coach in your ear. Here's the setup.",
    "Get Ai Run Coach from the Connect IQ Store, then pair your watch with the six-digit code — once, and you're done.",
    "Set up your run on your phone and tap Prepare for Watch.",
    "Pocket the phone. Press START on the watch — both start together.",
    "Your watch tracks every metre. Your coach talks you through it.",
    "Finish on the watch, and your full breakdown is waiting on your phone.",
    "Ai Run Coach.",
  ],
};

const polly = new PollyClient({
  region: "us-east-1",
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});

for (const [cut, lines] of Object.entries(LINES)) {
  const dir = new URL(`voiceover/${cut}/`, import.meta.url);
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, text] of lines.entries()) {
    const res = await polly.send(new SynthesizeSpeechCommand({
      Text: text, VoiceId: "Olivia", Engine: "neural", OutputFormat: "mp3", SampleRate: "24000",
    }));
    const file = new URL(`scene-${String(i + 1).padStart(2, "0")}.mp3`, dir);
    fs.writeFileSync(file, Buffer.from(await res.AudioStream.transformToByteArray()));
    // Word timings (ms) for burned-in captions.
    const marks = await polly.send(new SynthesizeSpeechCommand({
      Text: text, VoiceId: "Olivia", Engine: "neural", OutputFormat: "json", SpeechMarkTypes: ["word"],
    }));
    const lines = Buffer.from(await marks.AudioStream.transformToByteArray()).toString().trim().split("\n");
    fs.writeFileSync(new URL(`scene-${String(i + 1).padStart(2, "0")}.words.json`, dir),
      JSON.stringify(lines.map((l) => { const m = JSON.parse(l); return { t: m.time, w: m.value }; })));
    console.log(cut, i + 1, "ok");
  }
}

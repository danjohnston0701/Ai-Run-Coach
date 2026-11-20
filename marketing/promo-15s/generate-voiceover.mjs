// Voiceover for the 15 s paid-social promo (SCRIPT.md). Coach lines use two of the app's own
// coach voices (polly-service.ts: British male "Brian" is the default, Australian female "Olivia"
// is the how-to videos' voice), so the ad sounds like the real product. Needs AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY in the repo .env. Writes vo/<line>-<voice>.mp3.
//
//   node marketing/promo-15s/generate-voiceover.mjs   (from the repo root)
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
  "coach-split": "Five nineteen pace. Eight seconds quicker than last time. Hold it there.",
  "coach-hill": "Hill ahead. Short, quick steps. Drive your arms.",
  "coach-finish": "Final five hundred metres. You're beating your target. Finish strong.",
  "outro": "Ai Run Coach. Download free on iOS and Android.",
  // Real cues from Daniel's own runs (runs.ai_coaching_notes), trimmed to fit a slot. Source
  // run and minute are in the 30 s brief (marketing/promo-30s/BRIEF.md). Own runs only: other
  // runners' cues are personal data.
  "real-split": "Kilometre fifteen. Five forty-two pace. You're dead on target. Mighty work!",
  "real-splits-consistent": "Four thirty-seven, four thirty-eight, four thirty-six. That's disciplined running!",
  "real-metronome": "Nine consistent splits. It's like you've got a metronome in your head!",
  "real-hill": "Stay focused, you're halfway through the hill.",
  "real-hr": "Heart rate back in zone. Good response.",
  "real-eta": "You're projected to finish seventeen minutes ahead of your target. Keep that rhythm steady!",
  "real-final-250": "Two hundred and fifty metres to go! Feel the finish line pulling you in!",
  "real-final-100": "Final one hundred metres. Give it everything you've got!",
  "real-finish": "You danced through that 5K in twenty-one minutes and thirty-eight seconds. Talk about running like the wind!",
};
const VOICES = ["Brian", "Olivia"];

// "Ai Run Coach": Polly reads "Ai" as the word "eye"; it's the letters A-I.
// A touch quicker than the app's live cues: each line has to fit a ~4 s slot in the edit.
const ssml = (text) => '<speak><prosody rate="108%">' + text
  .replace(/\bAi Run Coach\b/g, '<say-as interpret-as="characters">AI</say-as> Run Coach')
  + "</prosody></speak>";

const polly = new PollyClient({
  region: "us-east-1",
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});

const dir = new URL("vo/", import.meta.url);
fs.mkdirSync(dir, { recursive: true });
for (const [name, text] of Object.entries(LINES)) {
  for (const voice of VOICES) {
    const res = await polly.send(new SynthesizeSpeechCommand({
      Text: ssml(text), TextType: "ssml", VoiceId: voice, Engine: "neural", OutputFormat: "mp3", SampleRate: "24000",
    }));
    fs.writeFileSync(new URL(`${name}-${voice.toLowerCase()}.mp3`, dir), Buffer.from(await res.AudioStream.transformToByteArray()));
    console.log(name, voice, "ok");
  }
}

// Instagram Reel (9:16, no voiceover — add music in Instagram) promoting Group Runs.
// Every phone shot is a real screen recording of the Android app (debug build against a local
// demo server with fictional runners — see marketing/instagram/group-run/README.md). Only the
// captions, the phone frame and the background are added in the edit.
import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile } from "remotion";
import { AndroidPhone, BRAND, FONT, Background, Enter, SceneFade, Seg, segsLen } from "./components";

const FPS = 30;
const C = { cyan: "#00D4FF", mint: "#2FF5B0", text: "#FFFFFF", text2: "#A0AEC0", muted: "#718096" };
const grad = `linear-gradient(90deg, ${C.cyan}, ${C.mint})`;

const TAKE_A = "clips/group-run/takeA.mp4"; // list → detail → start → setup → waiting for watch → run live
const TAKE_B = "clips/group-run/takeB.mp4"; // last minutes of the run → Priya home → "1 finished"
const TAKE_C = "clips/group-run/takeC.mp4"; // Run Summary › Group Run tab filling in live → AI debrief

// Source timings (seconds into each recording) — see the events logs in takes/.
export const SEGS = {
  plan: [
    { from: 1.0, to: 3.2, src: TAKE_A },                 // Group Runs list
    { from: 15.5, to: 19.0, src: TAKE_A, rate: 1.3 },    // group detail
  ] as Seg[],
  start: [
    { from: 92.5, to: 94.5, src: TAKE_A },               // Waiting for Watch
    { from: 128.0, to: 132.5, src: TAKE_A },             // run live (~00:30) — GROUP RUN · 5 runners
  ] as Seg[],
  during: [
    { from: 81.5, to: 88.5, src: TAKE_B },               // 24:58 → Priya home: "5 runners · 1 finished" (flip ~85)
  ] as Seg[],
  results: [
    { from: 22.0, to: 28.5, src: TAKE_C, rate: 1.4 },    // "2 of 5 finished · updating live" → Sam appears (~26)
    { from: 38.5, to: 43.5, src: TAKE_C, rate: 1.4 },    // Jordan appears (~41)
    { from: 68.0, to: 74.0, src: TAKE_C, rate: 1.4 },    // Mia appears (~71) → "All 5 finished"
  ] as Seg[],
  debrief: [
    { from: 89.0, to: 96.5, src: TAKE_C },               // AI Debrief · Finished #2 of 5
  ] as Seg[],
};

const PH = 1440; // phone outer height

const Caption: React.FC<{ kicker: string; a: string; b: string }> = ({ kicker, a, b }) => (
  <div style={{ position: "absolute", left: 70, right: 70, top: 120, fontFamily: FONT, textAlign: "center" }}>
    <Enter delay={0.05} dist={16}><div style={{ color: C.cyan, fontSize: 30, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>{kicker}</div></Enter>
    <Enter delay={0.15} dist={24}><div style={{ color: C.text, fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginTop: 14 }}>{a}</div></Enter>
    <Enter delay={0.3} dist={24}><div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, background: grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{b}</div></Enter>
  </div>
);

const PhoneShot: React.FC<{ segs: Seg[] }> = ({ segs }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top: 420, display: "flex", justifyContent: "center" }}>
    <Enter delay={0} dist={60}>
      <AndroidPhone src={segs[0].src!} segs={segs} height={PH} />
    </Enter>
  </div>
);

const Hook: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, textAlign: "center" }}>
    <Enter delay={0.05} dist={20}><div style={{ color: C.cyan, fontSize: 32, fontWeight: 700, letterSpacing: "0.2em" }}>NEW · GROUP RUNS</div></Enter>
    <Enter delay={0.3}><div style={{ color: C.text, fontSize: 136, fontWeight: 800, letterSpacing: -4, marginTop: 30, lineHeight: 1 }}>Run<br />together.</div></Enter>
    <Enter delay={0.9}><div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3, marginTop: 24, lineHeight: 1.05, background: grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Wherever<br />you are.</div></Enter>
  </AbsoluteFill>
);

const End: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, textAlign: "center" }}>
    <Enter delay={0.1}><Img src={staticFile("brand/app-icon.png")} style={{ width: 240, height: 240, borderRadius: 56, boxShadow: "0 30px 80px rgba(0,212,255,.3)" }} /></Enter>
    <Enter delay={0.4}><div style={{ color: C.text, fontSize: 110, fontWeight: 800, letterSpacing: -3, marginTop: 60, lineHeight: 1 }}>Your crew.</div></Enter>
    <Enter delay={0.7}><div style={{ fontSize: 110, fontWeight: 800, letterSpacing: -3, lineHeight: 1.08, background: grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>One run.</div></Enter>
    <Enter delay={1.1}><div style={{ color: C.text2, fontSize: 40, marginTop: 34 }}>Group Runs — live now in Ai Run Coach</div></Enter>
    <Enter delay={1.5}><div style={{ marginTop: 70, padding: "28px 56px", borderRadius: 999, fontSize: 40, fontWeight: 800, background: grad, color: "#04111C" }}>Download free · link in bio</div></Enter>
    <Enter delay={1.9}><div style={{ color: C.muted, fontSize: 26, marginTop: 34, letterSpacing: "0.06em" }}>iPHONE · ANDROID · GARMIN · APPLE WATCH · GALAXY WATCH</div></Enter>
  </AbsoluteFill>
);

const pad = 0.5; // hold after each shot's footage before the cut
const shot = (kicker: string, a: string, b: string, segs: Seg[]) => ({
  dur: segsLen(segs) + pad,
  el: <AbsoluteFill><Caption kicker={kicker} a={a} b={b} /><PhoneShot segs={segs} /></AbsoluteFill>,
});

const scenes = () => [
  { dur: 2.6, el: <Hook /> },
  shot("Plan", "Set up a run,", "invite your crew.", SEGS.plan),
  shot("Run", "Everyone records", "their own run.", SEGS.start),
  ...(SEGS.during.length ? [shot("On the run", "Same run screen,", "plus your group.", SEGS.during)] : []),
  ...(SEGS.results.length ? [shot("After", "Results fill in", "as runners finish.", SEGS.results)] : []),
  ...(SEGS.debrief.length ? [shot("Debrief", "Your AI coach", "reads the group.", SEGS.debrief)] : []),
  { dur: 3.8, el: <End /> },
];

export const groupRunReelDuration = Math.round(scenes().reduce((a, s) => a + s.dur, 0) * FPS);

export const GroupRunReel: React.FC = () => {
  let at = 0;
  const list = scenes();
  return (
    <AbsoluteFill style={{ background: BRAND.bg }}>
      <Background />
      {list.map((s, i) => {
        const from = Math.round(at * FPS);
        at += s.dur;
        return (
          <Sequence key={i} from={from} durationInFrames={Math.round(s.dur * FPS)} name={`Scene ${i + 1}`}>
            <SceneFade dur={s.dur} fadeIn={0.3} fadeOut={i === list.length - 1 ? 0.6 : 0.3}>{s.el}</SceneFade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, Easing } from "remotion";
import { BRAND, FONT, Background, Enter, Phone, SceneFade, Tap, Watch, WatchPress } from "./components";
import { CLIPS as C, TAPS } from "./clips";
import w1 from "../public/vo/short/scene-01.words.json";
import w2 from "../public/vo/short/scene-02.words.json";
import w3 from "../public/vo/short/scene-03.words.json";
import w4 from "../public/vo/short/scene-04.words.json";
import w5 from "../public/vo/short/scene-05.words.json";
import w6 from "../public/vo/short/scene-06.words.json";
import w7 from "../public/vo/short/scene-07.words.json";

const FPS = 30;
const VO_LEAD = 0.3;
type Word = { t: number; w: string };
// The voiceover lines (generate-voiceover.mjs) — used only for their punctuation, so caption
// phrases break at sentence/clause ends rather than mid-thought.
const LINES = [
  "Garmin on your wrist, a coach in your ear. Here's the setup.",
  "Get Ai Run Coach from the Connect IQ Store, then pair your watch with the six-digit code — once, and you're done.",
  "Set up your run on your phone and tap Prepare for Watch.",
  "Pocket the phone. Press START on the watch — both start together.",
  "Your watch tracks every metre. Your coach talks you through it.",
  "Finish on the watch, and your full breakdown is waiting on your phone.",
  "Ai Run Coach."
];
type Scene = { dur: number; vo: string; words: Word[]; el: React.ReactNode };

/** For each spoken word, whether the script has a clause break (.,!?— etc.) right after it. */
function breaksFor(words: Word[], line: string): boolean[] {
  const raw = line.split(/\s+/);
  const out: boolean[] = [];
  for (const tok of raw) {
    if (/[A-Za-z0-9]/.test(tok)) out.push(/[.,!?;:—]$/.test(tok));
    else if (out.length) out[out.length - 1] = true; // a standalone dash
  }
  return out.length === words.length ? out : words.map(() => false);
}

/** Phone behind on the right, watch in front on the lower left. */
const Stack: React.FC<{ phone: React.ReactNode; watch: React.ReactNode }> = ({ phone, watch }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: 452, top: 150 }}>{phone}</div>
    <div style={{ position: "absolute", left: 20, top: 560 }}>{watch}</div>
  </AbsoluteFill>
);
const SPH = 1180;
const SWH = 720;

const Push: React.FC<{ dur: number; to?: number; children: React.ReactNode }> = ({ dur, to = 1.05, children }) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame, [0, dur * FPS], [1, to], { easing: Easing.out(Easing.quad) });
  return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: "50% 40%" }}>{children}</AbsoluteFill>;
};

/** Burned-in captions: up to four words at a time, the spoken word in brand cyan. */
const Captions: React.FC<{ words: Word[]; line: string }> = ({ words, line }) => {
  const frame = useCurrentFrame();
  const ms = (frame / FPS - VO_LEAD) * 1000;
  if (ms < -150) return null;
  let cur = 0;
  for (let i = 0; i < words.length; i++) if (words[i].t <= ms) cur = i;
  // Chunk into phrases of ≤4 words, breaking after punctuation-ish long gaps.
  const brk = breaksFor(words, line);
  const chunks: number[][] = [];
  let c: number[] = [];
  words.forEach((_, i) => {
    if (c.length >= 4 || (c.length > 0 && brk[i - 1])) {
      chunks.push(c);
      c = [];
    }
    c.push(i);
  });
  if (c.length) chunks.push(c);
  const chunk = chunks.find((k) => k.includes(cur)) ?? chunks[0];
  const last = words[words.length - 1];
  if (ms > last.t + 900) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 1480,
        textAlign: "center",
        fontFamily: FONT,
        fontSize: 76,
        fontWeight: 800,
        lineHeight: 1.12,
        letterSpacing: -0.5,
        textShadow: "0 4px 24px rgba(0,0,0,0.6)",
      }}
    >
      {chunk.map((i) => (
        <span key={i} style={{ color: i === cur ? BRAND.cyan : BRAND.text, marginRight: 22, display: "inline-block" }}>
          {words[i].w.replace(/[.,—]$/, "")}
        </span>
      ))}
    </div>
  );
};

const T = TAPS;
const SCENES: Scene[] = [
  {
    dur: 4.9,
    vo: "vo/short/scene-01.mp3",
    words: w1,
    el: (
      <Push dur={4.9}>
        <Stack
          phone={<Enter delay={0.1}><Phone src={C.phoneMid} segs={[{ from: 76.3, to: 82.3 }]} height={SPH} /></Enter>}
          watch={<Enter delay={0.3}><Watch src={C.watchRun1} segs={[{ from: 78.3, to: 84.3 }]} height={SWH} /></Enter>}
        />
      </Push>
    ),
  },
  {
    dur: 7.4,
    vo: "vo/short/scene-02.mp3",
    words: w2,
    el: (
      <Stack
        phone={
          <Enter>
            <Phone
              src={C.phonePair}
              height={SPH}
              segs={[
                { from: 48.6, to: 51.4, rate: 1.4 },
                { from: 96.2, to: 114.8, rate: 3.5 },
              ]}
            >
              <Tap {...T.getWatchApp} at={1.0} />
              <Tap {...T.linkWatch} at={5.95} />
            </Phone>
          </Enter>
        }
        watch={<Enter delay={0.2}><Watch src={C.watchStart} segs={[{ from: 0.5, to: 10 }]} height={SWH} /></Enter>}
      />
    ),
  },
  {
    dur: 4.0,
    vo: "vo/short/scene-03.mp3",
    words: w3,
    el: (
      <Stack
        phone={
          <Phone src={C.phoneStart} height={SPH} segs={[{ from: 41.5, to: 44.2, rate: 1.5 }, { from: 44.2, to: 50.0, rate: 2.6 }]}>
            <Tap {...T.runWithoutRoute} at={1.6} />
            <Tap {...T.prepareForWatch} at={3.5} />
          </Phone>
        }
        watch={<Watch src={C.watchStart} segs={[{ from: 29.0, to: 33.5 }]} height={SWH} />}
      />
    ),
  },
  {
    dur: 5.0,
    vo: "vo/short/scene-04.mp3",
    words: w4,
    el: (
      <Stack
        phone={<Phone src={C.phoneStart} height={SPH} segs={[{ from: C.phoneLive - 4.0, to: C.phoneLive + 3 }]} />}
        watch={
          <Watch src={C.watchStart} segs={[{ from: 43.5, to: 50.2 }]} height={SWH}>
            <WatchPress at={3.9} height={SWH} />
          </Watch>
        }
      />
    ),
  },
  {
    dur: 4.6,
    vo: "vo/short/scene-05.mp3",
    words: w5,
    el: (
      <Push dur={4.6} to={1.04}>
        <Stack
          phone={<Phone src={C.phoneMid} height={SPH} segs={[{ from: 101.0, to: 107 }]} />}
          watch={<Watch src={C.watchRun1} segs={[{ from: 103.6, to: 109.6 }]} height={SWH} />}
        />
      </Push>
    ),
  },
  {
    dur: 5.0,
    vo: "vo/short/scene-06.mp3",
    words: w6,
    el: (
      <Stack
        phone={
          <Phone
            src={C.phoneSummary}
            height={SPH}
            segs={[{ from: 53.2, to: 55.9, src: C.phoneEnd }, { from: 28.5, to: 29.6 }, { from: 0.6, to: 1.8, src: C.phoneSummaryAi }]}
          />
        }
        watch={<Watch src={C.watchFinish} segs={[{ from: 55.5, to: 62.5 }]} height={SWH} />}
      />
    ),
  },
  {
    dur: 3.6,
    vo: "vo/short/scene-07.mp3",
    words: w7,
    el: (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <Enter>
          <Img src={staticFile("brand/app-icon.png")} style={{ width: 260, height: 260, borderRadius: 60, boxShadow: "0 20px 60px rgba(0,212,255,0.25)" }} />
        </Enter>
        <Enter delay={0.3}>
          <div style={{ color: BRAND.text, fontSize: 92, fontWeight: 800, marginTop: 44, letterSpacing: -1 }}>Ai Run Coach</div>
        </Enter>
        <Enter delay={0.7}>
          <div style={{ color: BRAND.muted, fontSize: 44, marginTop: 16 }}>Your watch, your phone, one coach.</div>
        </Enter>
        <Enter delay={1.1} style={{ marginTop: 64 }}>
          <Img src={staticFile("brand/available-connect-iq-badge.png")} style={{ height: 84 }} />
        </Enter>
      </AbsoluteFill>
    ),
  },
];

export const shortDuration = Math.round(SCENES.reduce((a, s) => a + s.dur, 0) * FPS);

export const Short: React.FC = () => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: BRAND.bg }}>
      <Background />
      {SCENES.map((s, i) => {
        const from = Math.round(at * FPS);
        const len = Math.round(s.dur * FPS);
        at += s.dur;
        return (
          <Sequence key={i} from={from} durationInFrames={len} name={`Scene ${i + 1}`}>
            <SceneFade dur={s.dur} fadeIn={i === 0 ? 0.4 : 0.25} fadeOut={i === SCENES.length - 1 ? 0.6 : 0.25}>
              {s.el}
            </SceneFade>
            {i < SCENES.length - 1 && <Captions words={s.words} line={LINES[i]} />}
            <Sequence from={Math.round(VO_LEAD * FPS)} layout="none">
              <Audio src={staticFile(s.vo)} />
            </Sequence>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

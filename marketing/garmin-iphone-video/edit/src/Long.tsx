import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import {
  BRAND,
  FONT,
  Background,
  Caption,
  Enter,
  Phone,
  SceneFade,
  Tap,
  Watch,
  phoneWidthFor,
  useCamera,
  Zoom,
  ZoomTo,
  WatchPress,
} from "./components";
import { CLIPS as C, TAPS } from "./clips";

const FPS = 30;
const VO_LEAD = 0.35; // seconds of picture before each voiceover line

type Scene = { dur: number; vo: string; el: React.ReactNode };

/** Camera over a whole scene (scale around a focus point, in 0–1 of the 1920×1080 frame). */
const Cam: React.FC<{ keys?: Zoom[]; children: React.ReactNode }> = ({ keys, children }) => {
  const c = useCamera(keys);
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${c.scale})`,
        transformOrigin: `${c.x * 100}% ${c.y * 100}%`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Slow constant push-in. */
const Push: React.FC<{ from?: number; to?: number; dur: number; children: React.ReactNode }> = ({ from = 1, to = 1.06, dur, children }) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame, [0, dur * FPS], [from, to], { easing: Easing.out(Easing.quad) });
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};

const PH = 930; // phone height in two-device layouts
const WH = 800; // watch height
const Duo: React.FC<{ watch: React.ReactNode; phone: React.ReactNode; caption?: React.ReactNode; x?: number }> = ({
  watch,
  phone,
  caption,
}) => (
  <AbsoluteFill>
    {caption && <div style={{ position: "absolute", left: 110, top: 0, bottom: 0, width: 470, display: "flex", alignItems: "center" }}>{caption}</div>}
    <div style={{ position: "absolute", left: caption ? 620 : 330, top: (1080 - WH) / 2 }}>{watch}</div>
    <div style={{ position: "absolute", left: caption ? 1290 : 1110, top: (1080 - PH) / 2 }}>{phone}</div>
  </AbsoluteFill>
);

/** Phone on the right, caption on the left. */
const Solo: React.FC<{ phone: React.ReactNode; caption: React.ReactNode }> = ({ phone, caption }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: 160, top: 0, bottom: 0, width: 700, display: "flex", alignItems: "center" }}>{caption}</div>
    <div style={{ position: "absolute", left: 1130, top: (1080 - 960) / 2 }}>{phone}</div>
  </AbsoluteFill>
);

const T = TAPS;
const SCENES: Scene[] = [
  // 1 — hook: a run in progress on both (elapsed 4:59).
  {
    dur: 9.2,
    vo: "vo/long/scene-01.mp3",
    el: (
      <Push dur={9.2} from={1.0} to={1.07}>
        <Duo
          watch={<Enter delay={0.1}><Watch src={C.watchRun1} segs={[{ from: 78.3, to: 88.3 }]} height={WH} /></Enter>}
          phone={<Enter delay={0.3}><Phone src={C.phoneMid} segs={[{ from: 76.3, to: 86.3 }]} height={PH} /></Enter>}
        />
      </Push>
    ),
  },
  // 2 — install from the Connect IQ Store.
  {
    dur: 11.8,
    vo: "vo/long/scene-02.mp3",
    el: (
      <Solo
        caption={
          <div>
            <Caption step="Step 1 · Once" title="Add the watch app" sub="Profile → Connected Devices → Get Watch App" />
            <Enter delay={1.2} style={{ marginTop: 40 }}>
              <Img src={staticFile("brand/available-connect-iq-badge.png")} style={{ height: 64 }} />
            </Enter>
          </div>
        }
        phone={
          <Enter>
            <ZoomTo at={9.1} x={0.5} y={0.3} scale={1.16}>
              <Phone
                src={C.phonePair}
                height={960}
                segs={[
                  { from: 20.4, to: 22.4 }, // dashboard → Profile
                  { from: 28.4, to: 30.4 }, // → Connected Devices
                  { from: 30.4, to: 46.4, rate: 3.2 }, // scroll to the Garmin card
                  { from: 48.6, to: 51.4 }, // Get Watch App
                ]}
              >
                <Tap {...T.profileTab} at={0.7} />
                <Tap {...T.connectedDevices} at={3.3} />
                <Tap {...T.getWatchApp} at={10.4} />
              </Phone>
            </ZoomTo>
          </Enter>
        }
      />
    ),
  },
  // 3 — pair with the six-digit code.
  {
    dur: 14.6,
    vo: "vo/long/scene-03.mp3",
    el: (
      <Duo
        caption={<Caption step="Step 2 · Once" title="Pair with the code on your watch" sub="Pair Garmin Device → Enter Code From Watch" size={48} />}
        watch={<Enter><Watch src={C.watchStart} segs={[{ from: 0.5, to: 16.5 }]} height={WH} /></Enter>}
        phone={
          <Enter delay={0.2}>
            <Phone
              src={C.phonePair}
              height={PH}
              segs={[
                { from: 51.2, to: 53.2 }, // tap Pair Garmin Device
                { from: 53.2, to: 62.8, rate: 2.4 }, // sheet → Enter Code From Watch Instead
                { from: 63.0, to: 64.0 }, // code sheet
                { from: 96.2, to: 114.8, rate: 2.6 }, // type 482913 → Link → linked
              ]}
            >
              <Tap {...T.pairGarmin} at={1.1} />
              <Tap {...T.enterCode} at={5.4} />
              <Tap {...T.linkWatch} at={12.3} />
            </Phone>
          </Enter>
        }
      />
    ),
  },
  // 4 — set up the run, Prepare for Watch; the watch receives the session.
  {
    dur: 13.4,
    vo: "vo/long/scene-04.mp3",
    el: (
      <Duo
        caption={<Caption step="Every run" title="Set up your run, then Prepare for Watch" sub="Distance, target time, or a plan session" size={48} />}
        watch={<Enter><Watch src={C.watchStart} segs={[{ from: 21.0, to: 34.4 }]} height={WH} /></Enter>}
        phone={
          <Enter delay={0.2}>
            <Phone
              src={C.phoneStart}
              height={PH}
              segs={[
                { from: 35.5, to: 44.2, rate: 1.5 }, // 5 km · 26:40 → Run Without Route
                { from: 44.2, to: 50.8 }, // Run Setup → Prepare for Watch → Waiting for Watch
              ]}
            >
              <Tap {...T.runWithoutRoute} at={5.6} />
              <Tap {...T.prepareForWatch} at={10.3} />
            </Phone>
          </Enter>
        }
      />
    ),
  },
  // 5 — phone waits; lock it and pocket it.
  {
    dur: 7.6,
    vo: "vo/long/scene-05.mp3",
    el: <PocketScene />,
  },
  // 6 — GPS lock, START on the watch; the phone starts with it.
  {
    dur: 9.4,
    vo: "vo/long/scene-06.mp3",
    el: (
      <Duo
        caption={<Caption step="Start" title="Press START on the watch" sub="Your phone starts at the same moment" size={48} />}
        watch={
          <Enter>
            <Watch src={C.watchStart} segs={[{ from: 36.0, to: 41.0, rate: 2.5 }, { from: 43.8, to: 56 }]} height={WH}>
              <WatchPress at={5.9} height={WH} />
            </Watch>
          </Enter>
        }
        phone={<Enter delay={0.2}><Phone src={C.phoneStart} height={PH} segs={[{ from: C.phoneLive - 6.0, to: C.phoneLive + 4 }]} /></Enter>}
      />
    ),
  },
  // 7 — running: wrist data, coach in your ear (the 1 km message appears on the phone).
  {
    dur: 10.4,
    vo: "vo/long/scene-07.mp3",
    el: (
      <Push dur={10.4} from={1.0} to={1.04}>
        <Duo
          caption={<CoachCue />}
          watch={<Watch src={C.watchRun1} segs={[{ from: 103.6, to: 115.6 }]} height={WH} />}
          phone={<Phone src={C.phoneMid} height={PH} segs={[{ from: 101.0, to: 113 }]} />}
        />
      </Push>
    ),
  },
  // 8 — finish on the watch; splits, charts and the coach's review on the phone.
  {
    dur: 13.2,
    vo: "vo/long/scene-08.mp3",
    el: (
      <Duo
        caption={<Caption step="Finish" title="Stop on the watch, review on your phone" sub="Splits, charts and your coach's review" size={48} />}
        watch={<Enter><Watch src={C.watchFinish} segs={[{ from: 53.6, to: 66 }]} height={WH} /></Enter>}
        phone={
          <Enter delay={0.2}>
            <Phone
              src={C.phoneSummary}
              height={PH}
              segs={[
                { from: 51.4, to: 55.9, src: C.phoneEnd }, // last seconds live, 26:35 → 26:39 (switches after the watch finishes)
                { from: 0.4, to: 2.0 }, // Run Complete — 5.00 km · 26:40 · 5:19
                { from: 28.5, to: 30.5 }, // Summary: route map (loaded by 28.5)
                { from: 31.8, to: 33.4 }, // km splits
                { from: 45.2, to: 46.5 }, // Graphs
                { from: 0.6, to: 2.8, src: C.phoneSummaryAi }, // AI review — score 85/100
              ]}
            />
          </Enter>
        }
      />
    ),
  },
  // 9 — no phone: the watch records alone.
  {
    dur: 7.4,
    vo: "vo/long/scene-09.mp3",
    el: (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 160, top: 0, bottom: 0, width: 760, display: "flex", alignItems: "center" }}>
          <Caption step="No phone? No problem" title="The watch records on its own" sub="Everything uploads when you're back in range" />
        </div>
        <div style={{ position: "absolute", left: 1100, top: (1080 - 880) / 2 }}>
          <Enter><Watch src={C.watchRun2} segs={[{ from: 600, to: 609 }]} height={880} /></Enter>
        </div>
      </AbsoluteFill>
    ),
  },
  // 10 — end card.
  { dur: 6.2, vo: "vo/long/scene-10.mp3", el: <EndCard /> },
];

function PocketScene() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const dim = interpolate(t, [3.2, 4.2], [0, 0.92], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drop = interpolate(t, [4.6, 6.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  return (
    <Solo
      caption={<Caption step="Then" title="Lock it and pop it in your pocket" sub="Your coach keeps talking through your headphones" />}
      phone={
        <div style={{ transform: `translateY(${drop * 1100}px) rotate(${drop * 8}deg)` }}>
          <Phone src={C.phoneStart} height={960} segs={[{ from: 50.0, to: 53.8 }]} dim={dim} />
        </div>
      }
    />
  );
}

function CoachCue() {
  return (
    <div>
      <Caption step="On the run" title="Your coach uses your watch's data" size={48} />
      <Enter delay={3.4} style={{ marginTop: 44 }}>
        <div
          style={{
            fontFamily: FONT,
            background: "rgba(0,212,255,0.10)",
            border: "1.5px solid rgba(0,212,255,0.45)",
            borderRadius: 22,
            padding: "22px 26px",
            color: BRAND.text,
            fontSize: 27,
            lineHeight: 1.4,
          }}
        >
          <div style={{ color: BRAND.cyan, fontSize: 17, fontWeight: 700, letterSpacing: 2.5, marginBottom: 8 }}>🎧 COACH</div>
          {C.coachCue}
        </div>
      </Enter>
    </div>
  );
}

function EndCard() {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <Enter delay={0.1}>
        <Img src={staticFile("brand/app-icon.png")} style={{ width: 190, height: 190, borderRadius: 44, boxShadow: "0 20px 60px rgba(0,212,255,0.25)" }} />
      </Enter>
      <Enter delay={0.45}>
        <div style={{ color: BRAND.text, fontSize: 76, fontWeight: 800, marginTop: 40, letterSpacing: -1 }}>Ai Run Coach</div>
      </Enter>
      <Enter delay={0.9}>
        <div style={{ color: BRAND.muted, fontSize: 36, marginTop: 14 }}>Your watch, your phone, one coach.</div>
      </Enter>
      <Enter delay={1.5} style={{ marginTop: 56 }}>
        <Img src={staticFile("brand/available-connect-iq-badge.png")} style={{ height: 66 }} />
      </Enter>
    </AbsoluteFill>
  );
}

export const LONG_SCENES = SCENES;
export const longDuration = Math.round(SCENES.reduce((a, s) => a + s.dur, 0) * FPS);

export const Long: React.FC = () => {
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
            <SceneFade dur={s.dur} fadeIn={i === 0 ? 0.6 : 0.35} fadeOut={i === SCENES.length - 1 ? 0.8 : 0.35}>
              {s.el}
            </SceneFade>
            <Sequence from={Math.round(VO_LEAD * FPS)} layout="none">
              <Audio src={staticFile(s.vo)} />
            </Sequence>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const phoneW = phoneWidthFor;

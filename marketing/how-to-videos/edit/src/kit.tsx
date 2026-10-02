// Shared 16:9 layout pieces for the Garmin + Android and Apple Watch + iPhone cuts (the
// Garmin + iPhone cut in Long.tsx predates this file and keeps its own copies).
import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, Easing } from "remotion";
import { BRAND, FONT, Background, Caption, Enter, SceneFade } from "./components";

export const FPS = 30;
const VO_LEAD = 0.35; // seconds of picture before each voiceover line

export type Scene = { dur: number; vo: string; el: React.ReactNode };

/** Slow constant push-in. */
export const Push: React.FC<{ from?: number; to?: number; dur: number; children: React.ReactNode }> = ({ from = 1, to = 1.06, dur, children }) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame, [0, dur * FPS], [from, to], { easing: Easing.out(Easing.quad) });
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};

/** Watch and phone side by side, optional caption column on the left. Sizes are outer px. */
export const Duo: React.FC<{
  watch: React.ReactNode;
  phone: React.ReactNode;
  caption?: React.ReactNode;
  watchH: number;
  watchW: number;
  phoneH: number;
  phoneW: number;
}> = ({ watch, phone, caption, watchH, watchW, phoneH, phoneW }) => {
  const gap = 70;
  const left = caption ? 600 : 0;
  const total = watchW + gap + phoneW;
  const x0 = left + (1920 - left - total) / 2;
  return (
    <AbsoluteFill>
      {caption && <div style={{ position: "absolute", left: 110, top: 0, bottom: 0, width: 470, display: "flex", alignItems: "center" }}>{caption}</div>}
      <div style={{ position: "absolute", left: x0, top: (1080 - watchH) / 2 }}>{watch}</div>
      <div style={{ position: "absolute", left: x0 + watchW + gap, top: (1080 - phoneH) / 2 }}>{phone}</div>
    </AbsoluteFill>
  );
};

/** One device on the right, caption on the left. */
export const Solo: React.FC<{ device: React.ReactNode; caption: React.ReactNode; deviceH: number; left?: number }> = ({
  device,
  caption,
  deviceH,
  left = 1130,
}) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: 160, top: 0, bottom: 0, width: 760, display: "flex", alignItems: "center" }}>{caption}</div>
    <div style={{ position: "absolute", left, top: (1080 - deviceH) / 2 }}>{device}</div>
  </AbsoluteFill>
);

/** The lock-and-pocket beat: screen dims, then the device drops out of frame. */
export const Pocket: React.FC<{ children: (dim: number) => React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const dim = interpolate(t, [3.2, 4.2], [0, 0.92], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drop = interpolate(t, [4.6, 6.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  return <div style={{ transform: `translateY(${drop * 1100}px) rotate(${drop * 8}deg)` }}>{children(dim)}</div>;
};

/** Caption plus the coach's spoken message, as it appeared on the phone. */
export const CoachCue: React.FC<{ title: string; cue: string }> = ({ title, cue }) => (
  <div>
    <Caption step="On the run" title={title} size={48} />
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
        {cue}
      </div>
    </Enter>
  </div>
);

export const EndCard: React.FC<{ badge?: string; footer?: React.ReactNode }> = ({ badge, footer }) => (
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
    {badge && (
      <Enter delay={1.5} style={{ marginTop: 56 }}>
        <Img src={staticFile(badge)} style={{ height: 66 }} />
      </Enter>
    )}
    {footer && <Enter delay={1.5} style={{ marginTop: 56 }}>{footer}</Enter>}
  </AbsoluteFill>
);

/** Plays scenes back to back with a cross-fade and each scene's voiceover line. */
export const SceneTrack: React.FC<{ scenes: Scene[] }> = ({ scenes }) => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: BRAND.bg }}>
      <Background />
      {scenes.map((s, i) => {
        const from = Math.round(at * FPS);
        const len = Math.round(s.dur * FPS);
        at += s.dur;
        return (
          <Sequence key={i} from={from} durationInFrames={len} name={`Scene ${i + 1}`}>
            <SceneFade dur={s.dur} fadeIn={i === 0 ? 0.6 : 0.35} fadeOut={i === scenes.length - 1 ? 0.8 : 0.35}>
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

export const scenesDuration = (scenes: Scene[]) => Math.round(scenes.reduce((a, s) => a + s.dur, 0) * FPS);

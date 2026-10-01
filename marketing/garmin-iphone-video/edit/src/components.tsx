import React from "react";
import {
  AbsoluteFill,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

export const BRAND = {
  cyan: "#00D4FF",
  orange: "#FF6B35",
  bg: "#0A0F1A",
  bg2: "#111827",
  text: "#F3F6FA",
  muted: "#9AA7B8",
};

export const FONT =
  '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

const ease = Easing.bezier(0.33, 0, 0.2, 1);

/** Dark brand background with two slow, soft light pools. */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const x1 = 30 + 6 * Math.sin(t / 7);
  const y1 = 35 + 5 * Math.cos(t / 9);
  const x2 = 72 + 5 * Math.cos(t / 8);
  const y2 = 70 + 6 * Math.sin(t / 10);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 55% at ${x1}% ${y1}%, rgba(0,212,255,0.13), transparent 70%),
          radial-gradient(50% 50% at ${x2}% ${y2}%, rgba(46,94,255,0.10), transparent 70%),
          linear-gradient(160deg, #0C1322 0%, ${BRAND.bg} 55%, #070B14 100%)`,
      }}
    />
  );
};

export type Zoom = { at: number; x: number; y: number; scale: number; dur?: number };

/** Interpolates a camera (focus x/y in 0–1 of the element, scale) through keyframes (seconds). */
export function useCamera(keys: Zoom[] | undefined) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (!keys || keys.length === 0) return { x: 0.5, y: 0.5, scale: 1 };
  let cur = { x: 0.5, y: 0.5, scale: 1 };
  for (const k of keys) {
    const dur = k.dur ?? 0.9;
    if (t <= k.at) break;
    const p = ease(Math.min(1, (t - k.at) / dur));
    cur = {
      x: cur.x + (k.x - cur.x) * p,
      y: cur.y + (k.y - cur.y) * p,
      scale: cur.scale + (k.scale - cur.scale) * p,
    };
  }
  return cur;
}


export type Seg = { from: number; to: number; rate?: number; src?: string }; // src overrides the clip
export const segLen = (s: Seg) => (s.to - s.from) / (s.rate ?? 1);
export const segsLen = (segs: Seg[]) => segs.reduce((a, s) => a + segLen(s), 0);

/** Plays source segments back to back (hard cuts), then holds the last frame. */
export const SegVideo: React.FC<{ src: string; segs: Seg[]; style: React.CSSProperties }> = ({ src, segs, style }) => {
  const { fps } = useVideoConfig();
  let at = 0;
  const parts = segs.map((sg, i) => {
    const len = Math.max(1, Math.round(segLen(sg) * fps));
    const el = (
      <Sequence key={i} from={at} durationInFrames={len} layout="none">
        <OffthreadVideo src={staticFile(sg.src ?? src)} startFrom={Math.round(sg.from * fps)} playbackRate={sg.rate ?? 1} muted style={style} />
      </Sequence>
    );
    at += len;
    return el;
  });
  const last = segs[segs.length - 1];
  return (
    <>
      {parts}
      <Sequence from={at} layout="none">
        <Freeze frame={0}>
          <OffthreadVideo src={staticFile(last.src ?? src)} startFrom={Math.max(0, Math.round(last.to * fps) - 1)} muted style={style} />
        </Freeze>
      </Sequence>
    </>
  );
};

export const PHONE_W = 1206;
export const PHONE_H = 2622;

/** iPhone 17 Pro-style frame around a simulator recording. `height` is the outer height in px. */
export const Phone: React.FC<{
  src: string;
  segs: Seg[];
  height: number;
  children?: React.ReactNode; // overlays in screen coordinates (0..PHONE_W x 0..PHONE_H)
  dim?: number; // 0..1 darken the screen (lock)
}> = ({ src, segs, height, children, dim = 0 }) => {
  const bezel = height * 0.018;
  const screenH = height - bezel * 2;
  const screenW = (screenH * PHONE_W) / PHONE_H;
  const width = screenW + bezel * 2;
  const r = height * 0.075;
  const s = screenH / PHONE_H;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: r,
        padding: bezel,
        boxSizing: "border-box",
        background: "linear-gradient(145deg, #5b6068 0%, #2a2d33 30%, #1a1c20 60%, #4a4e55 100%)",
        boxShadow:
          "0 40px 90px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.35), inset 0 0 0 1.5px rgba(255,255,255,0.10)",
        position: "relative",
      }}
    >
      <div
        style={{
          width: screenW,
          height: screenH,
          borderRadius: r - bezel,
          overflow: "hidden",
          position: "relative",
          background: "#000",
          boxShadow: "0 0 0 2px #000",
        }}
      >
        <SegVideo src={src} segs={segs} style={{ width: screenW, height: screenH, display: "block", position: "absolute", left: 0, top: 0 }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: PHONE_W,
            height: PHONE_H,
            transform: `scale(${s})`,
            transformOrigin: "0 0",
          }}
        >
          {children}
        </div>
        {dim > 0 && (
          <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />
        )}
      </div>
      {/* side buttons */}
      <div style={{ position: "absolute", right: -3, top: height * 0.25, width: 4, height: height * 0.1, borderRadius: 3, background: "#3a3e45" }} />
      <div style={{ position: "absolute", left: -3, top: height * 0.2, width: 4, height: height * 0.06, borderRadius: 3, background: "#3a3e45" }} />
      <div style={{ position: "absolute", left: -3, top: height * 0.28, width: 4, height: height * 0.06, borderRadius: 3, background: "#3a3e45" }} />
    </div>
  );
};

export const phoneWidthFor = (height: number) => {
  const bezel = height * 0.018;
  return ((height - bezel * 2) * PHONE_W) / PHONE_H + bezel * 2;
};

/** Forerunner 965 (simulator skin, strap recoloured) with the live display recording inside. */
export const WATCH = { w: 682, h: 968, cx: 341, cy: 486, r: 228 };
export const Watch: React.FC<{ src: string; segs: Seg[]; height: number; children?: React.ReactNode }> = ({ src, segs, height, children }) => {
  const s = height / WATCH.h;
  return (
    <div style={{ width: WATCH.w * s, height, position: "relative", filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.55))" }}>
      <div
        style={{
          position: "absolute",
          left: (WATCH.cx - WATCH.r) * s,
          top: (WATCH.cy - WATCH.r) * s,
          width: WATCH.r * 2 * s,
          height: WATCH.r * 2 * s,
          borderRadius: "50%",
          overflow: "hidden",
          background: "#000",
        }}
      >
        <SegVideo
          src={src}
          segs={segs}
          style={{
            position: "absolute",
            left: -(WATCH.cx - WATCH.r) * s,
            top: -(WATCH.cy - WATCH.r) * s,
            width: WATCH.w * s,
            height: WATCH.h * s,
          }}
        />
      </div>
      <Img src={staticFile("watch/skin.png")} style={{ position: "absolute", left: 0, top: 0, width: WATCH.w * s, height }} />
      {children}
    </div>
  );
};

/** Entrance: fade + rise, driven by a spring from `delay` seconds. */
export const Enter: React.FC<{ delay?: number; dist?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  dist = 40,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay * fps, fps, config: { damping: 200, mass: 0.9 } });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * dist}px)`, ...style }}>{children}</div>
  );
};

/** Step caption: small numbered kicker + title, lower left. */
export const Caption: React.FC<{ step?: string; title: string; sub?: string; delay?: number; align?: "left" | "center"; size?: number }> = ({
  step,
  title,
  sub,
  delay = 0.25,
  align = "left",
  size = 54,
}) => (
  <Enter delay={delay} dist={24} style={{ textAlign: align, fontFamily: FONT }}>
    {step && (
      <div style={{ color: BRAND.cyan, fontSize: size * 0.4, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>
        {step}
      </div>
    )}
    <div style={{ color: BRAND.text, fontSize: size, fontWeight: 700, lineHeight: 1.12, letterSpacing: -0.5 }}>{title}</div>
    {sub && <div style={{ color: BRAND.muted, fontSize: size * 0.46, marginTop: 16, lineHeight: 1.4 }}>{sub}</div>}
  </Enter>
);

/** Touch ripple in phone-screen pixel coordinates, at `at` seconds into the sequence. */
export const Tap: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - at;
  if (t < -0.15 || t > 0.7) return null;
  const press = interpolate(t, [-0.15, 0, 0.12], [0, 1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = interpolate(t, [0.1, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = 130 + out * 90;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `rgba(255,255,255,${0.35 * press * (1 - out)})`,
        border: `4px solid rgba(255,255,255,${0.6 * press * (1 - out)})`,
      }}
    />
  );
};

/** Fades a whole scene in and out. */
export const SceneFade: React.FC<{ dur: number; children: React.ReactNode; fadeIn?: number; fadeOut?: number }> = ({
  dur,
  children,
  fadeIn = 0.35,
  fadeOut = 0.35,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const o = Math.min(
    fadeIn > 0 ? interpolate(t, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" }) : 1,
    fadeOut > 0 ? interpolate(t, [dur - fadeOut, dur], [1, 0], { extrapolateLeft: "clamp" }) : 1
  );
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

/** Eases a child from scale 1 to `scale` around (x, y) — fractions of the child's box — at `at` s. */
export const ZoomTo: React.FC<{ at: number; x: number; y: number; scale: number; dur?: number; back?: number; children: React.ReactNode }> = ({
  at,
  x,
  y,
  scale,
  dur = 0.9,
  back,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let p = interpolate(t, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  if (back !== undefined) p *= interpolate(t, [back, back + dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const s = 1 + (scale - 1) * p;
  return <div style={{ transform: `scale(${s})`, transformOrigin: `${x * 100}% ${y * 100}%` }}>{children}</div>;
};

/** A press on the watch's START button: a soft cyan pulse at the button (watch-skin px). */
export const WatchPress: React.FC<{ at: number; height: number; x?: number; y?: number }> = ({ at, height, x = 598, y = 336 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - at;
  if (t < -0.2 || t > 0.9) return null;
  const s = height / WATCH.h;
  const a = interpolate(t, [-0.2, 0, 0.9], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const r = (26 + 40 * interpolate(t, [0, 0.9], [0, 1], { extrapolateLeft: "clamp" })) * s;
  return (
    <div
      style={{
        position: "absolute",
        left: x * s - r,
        top: y * s - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        border: `${4 * s}px solid rgba(0,212,255,${a})`,
        background: `rgba(0,212,255,${a * 0.25})`,
      }}
    />
  );
};

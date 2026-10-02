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

// ── Android phone (Garmin + Android video) ───────────────────────────────────────────────────

export const ANDROID_W = 1080;
export const ANDROID_H = 2400;

/** Pixel-style frame around an emulator recording. `height` is the outer height in px. */
export const AndroidPhone: React.FC<{
  src: string;
  segs: Seg[];
  height: number;
  children?: React.ReactNode; // overlays in screen coordinates (0..ANDROID_W x 0..ANDROID_H)
  dim?: number;
}> = ({ src, segs, height, children, dim = 0 }) => {
  const bezel = height * 0.016;
  const screenH = height - bezel * 2;
  const screenW = (screenH * ANDROID_W) / ANDROID_H;
  const width = screenW + bezel * 2;
  const r = height * 0.052;
  const s = screenH / ANDROID_H;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: r,
        padding: bezel,
        boxSizing: "border-box",
        background: "linear-gradient(150deg, #3b3f46 0%, #1c1e22 35%, #121316 65%, #34383e 100%)",
        boxShadow:
          "0 40px 90px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.35), inset 0 0 0 1.5px rgba(255,255,255,0.08)",
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
        }}
      >
        <SegVideo src={src} segs={segs} style={{ width: screenW, height: screenH, display: "block", position: "absolute", left: 0, top: 0 }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: ANDROID_W, height: ANDROID_H, transform: `scale(${s})`, transformOrigin: "0 0" }}>
          {/* punch-hole camera, centred in the status bar */}
          <div style={{ position: "absolute", left: ANDROID_W / 2 - 22, top: 26, width: 44, height: 44, borderRadius: "50%", background: "#050505", boxShadow: "0 0 0 3px rgba(255,255,255,0.05)" }} />
          {children}
        </div>
        {dim > 0 && <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />}
      </div>
      <div style={{ position: "absolute", right: -3, top: height * 0.22, width: 4, height: height * 0.07, borderRadius: 3, background: "#2c2f35" }} />
      <div style={{ position: "absolute", right: -3, top: height * 0.32, width: 4, height: height * 0.12, borderRadius: 3, background: "#2c2f35" }} />
    </div>
  );
};

export const androidWidthFor = (height: number) => {
  const bezel = height * 0.016;
  return ((height - bezel * 2) * ANDROID_W) / ANDROID_H + bezel * 2;
};

// ── Apple Watch (Apple Watch + iPhone video) ─────────────────────────────────────────────────

/** Series 11 46 mm simulator framebuffer. */
export const AW_W = 416;
export const AW_H = 496;

/**
 * Apple Watch case + band drawn in CSS around a watch-simulator recording. `height` is the
 * height of the case (the band extends above and below it). Overlays are in screen px.
 */
export const AppleWatch: React.FC<{ src: string; segs: Seg[]; height: number; children?: React.ReactNode }> = ({
  src,
  segs,
  height,
  children,
}) => {
  const caseH = height;
  const caseW = caseH * 0.84;
  const bezel = caseH * 0.075;
  const screenW = caseW - bezel * 2;
  const screenH = caseH - bezel * 2;
  const s = screenW / AW_W; // the framebuffer's aspect matches screenW/screenH closely
  const bandW = caseW * 0.74;
  const bandH = caseH * 0.42;
  const band: React.CSSProperties = {
    position: "absolute",
    left: (caseW - bandW) / 2,
    width: bandW,
    height: bandH,
    background: "linear-gradient(90deg, #12161d 0%, #1d232c 50%, #12161d 100%)",
  };
  return (
    <div style={{ width: caseW + caseH * 0.06, height: caseH + bandH * 2 - caseH * 0.1, position: "relative", filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.55))" }}>
      <div style={{ ...band, top: 0, borderRadius: `${bandW * 0.12}px ${bandW * 0.12}px 0 0` }} />
      <div style={{ ...band, bottom: 0, borderRadius: `0 0 ${bandW * 0.12}px ${bandW * 0.12}px` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: bandH - caseH * 0.05,
          width: caseW,
          height: caseH,
          borderRadius: caseW * 0.3,
          background: "linear-gradient(145deg, #4a4f57 0%, #22252a 35%, #15171a 65%, #3e434a 100%)",
          boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.12)",
          padding: bezel,
          boxSizing: "border-box",
        }}
      >
        <div style={{ width: screenW, height: screenH, borderRadius: caseW * 0.3 - bezel * 0.8, overflow: "hidden", position: "relative", background: "#000" }}>
          <SegVideo src={src} segs={segs} style={{ position: "absolute", left: 0, top: (screenH - AW_H * s) / 2, width: AW_W * s, height: AW_H * s }} />
          <div style={{ position: "absolute", left: 0, top: (screenH - AW_H * s) / 2, width: AW_W, height: AW_H, transform: `scale(${s})`, transformOrigin: "0 0" }}>
            {children}
          </div>
        </div>
        {/* Digital Crown + side button */}
        <div style={{ position: "absolute", right: -caseH * 0.045, top: caseH * 0.2, width: caseH * 0.06, height: caseH * 0.16, borderRadius: caseH * 0.02, background: "linear-gradient(90deg, #2a2d33, #5a5f68 60%, #2a2d33)" }} />
        <div style={{ position: "absolute", right: -caseH * 0.022, top: caseH * 0.48, width: caseH * 0.03, height: caseH * 0.2, borderRadius: caseH * 0.015, background: "#2f3238" }} />
      </div>
    </div>
  );
};

/** Outer width/height of <AppleWatch height={h}> including crown and band. */
export const appleWatchBox = (h: number) => ({ w: h * 0.84 + h * 0.06, h: h + h * 0.42 * 2 - h * 0.1 });

// ── Galaxy Watch (Galaxy Watch + Android video) ──────────────────────────────────────────────

/** Wear OS emulator (Wear_OS_Large_Round) framebuffer. */
export const GW_PX = 454;

/**
 * Round Galaxy Watch–style case around a Wear OS emulator recording: brushed case, thin black
 * bezel ring, Home (top) and Back (bottom) buttons on the right, strap above and below.
 * `height` is the case diameter; children are overlays in screen px (0..GW_PX).
 */
export const GalaxyWatch: React.FC<{ src: string; segs: Seg[]; height: number; children?: React.ReactNode }> = ({
  src,
  segs,
  height,
  children,
}) => {
  const box = galaxyWatchBox(height);
  const caseD = height;
  const ring = caseD * 0.055; // metal case rim
  const bezel = caseD * 0.035; // black glass border
  const screenD = caseD - (ring + bezel) * 2;
  const s = screenD / GW_PX;
  const bandW = caseD * 0.5;
  const bandH = caseD * 0.38;
  const band: React.CSSProperties = {
    position: "absolute",
    left: (caseD - bandW) / 2,
    width: bandW,
    height: bandH,
    background: "linear-gradient(90deg, #11151b 0%, #1c2129 50%, #11151b 100%)",
  };
  const top = bandH - caseD * 0.08;
  const btn = (y: number): React.CSSProperties => ({
    position: "absolute",
    left: caseD * 0.5 + Math.cos(y) * caseD * 0.5 - caseD * 0.03,
    top: top + caseD * 0.5 - Math.sin(y) * caseD * 0.5 - caseD * 0.055,
    width: caseD * 0.06,
    height: caseD * 0.11,
    borderRadius: caseD * 0.02,
    transform: `rotate(${-(y * 180) / Math.PI}deg)`,
    background: "linear-gradient(90deg, #2a2d33, #5a5f68 60%, #2a2d33)",
  });
  return (
    <div style={{ width: box.w, height: box.h, position: "relative", filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.55))" }}>
      <div style={{ ...band, top: 0, borderRadius: `${bandW * 0.18}px ${bandW * 0.18}px 0 0` }} />
      <div style={{ ...band, bottom: 0, borderRadius: `0 0 ${bandW * 0.18}px ${bandW * 0.18}px` }} />
      <div style={btn((28 * Math.PI) / 180)} />
      <div style={btn((-28 * Math.PI) / 180)} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top,
          width: caseD,
          height: caseD,
          borderRadius: "50%",
          background: "linear-gradient(145deg, #5a5f68 0%, #2a2d33 35%, #1a1c20 65%, #4a4f57 100%)",
          boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.14)",
          padding: ring,
          boxSizing: "border-box",
        }}
      >
        <div style={{ width: caseD - ring * 2, height: caseD - ring * 2, borderRadius: "50%", background: "#050607", padding: bezel, boxSizing: "border-box" }}>
          <div style={{ width: screenD, height: screenD, borderRadius: "50%", overflow: "hidden", position: "relative", background: "#000" }}>
            <SegVideo src={src} segs={segs} style={{ position: "absolute", left: 0, top: 0, width: screenD, height: screenD }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: GW_PX, height: GW_PX, transform: `scale(${s})`, transformOrigin: "0 0" }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Outer width/height of <GalaxyWatch height={h}> including buttons and strap. */
export const galaxyWatchBox = (h: number) => ({ w: h * 1.04, h: h + (h * 0.38 - h * 0.08) * 2 });

/** A press on the Galaxy Watch's bottom (Back) button: a soft cyan pulse beside the case. */
export const GalaxyBackPress: React.FC<{ at: number; height: number }> = ({ at, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - at;
  if (t < -0.2 || t > 0.9) return null;
  const top = height * 0.38 - height * 0.08;
  const ang = (-28 * Math.PI) / 180;
  const x = height * 0.5 + Math.cos(ang) * height * 0.5;
  const y = top + height * 0.5 - Math.sin(ang) * height * 0.5;
  const a = interpolate(t, [-0.2, 0, 0.9], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const r = height * (0.05 + 0.07 * interpolate(t, [0, 0.9], [0, 1], { extrapolateLeft: "clamp" }));
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        border: `${height * 0.006}px solid rgba(0,212,255,${a})`,
        background: `rgba(0,212,255,${a * 0.25})`,
      }}
    />
  );
};

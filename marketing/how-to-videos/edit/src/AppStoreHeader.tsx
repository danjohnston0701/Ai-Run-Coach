// App Store product page header video (iOS 27): 21:9, 3840×1646, 30 fps, 12 s seamless loop,
// muted. Apple's art safe area for this canvas (measured from the official PSD template) is
// x 1097–2742, y 493–1153 — the lockup and the phone sit inside it; the background and the
// decorative run rings bleed to the edges. The phone plays the real iPhone simulator recording
// of the demo 5 km run (1 km coach message appears at phone-mid 103.5 s).
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FONT, Phone, phoneWidthFor } from "./components";

export const HEADER_W = 3840;
export const HEADER_H = 1646;
const FPS = 30;
const LOOP = 12; // seconds
export const appStoreHeaderDuration = LOOP * FPS;

const SAFE = { x1: 1097, y1: 493, x2: 2742, y2: 1153 };
const C = { cyan: "#00D4FF", mint: "#2FF5B0", text: "#FFFFFF", text2: "#A0AEC0" };
const RING_COLOURS = ["#2FD69A", "#3B82F6", "#FFC21A", "#FF3355"]; // run-screen rings

/** The run screen's 2×2 ring cluster, breathing on a period that divides the loop (seamless). */
const Rings: React.FC<{ cx: number; cy: number; r: number; stroke: number; phase: number }> = ({ cx, cy, r, stroke, phase }) => {
  const t = useCurrentFrame() / FPS;
  const d = r * 2.2;
  return (
    <>
      {RING_COLOURS.map((col, i) => {
        const breathe = 1 + 0.035 * Math.sin((2 * Math.PI * (t / LOOP)) * 2 + phase + i * 0.9);
        const op = 0.18 + 0.06 * Math.sin((2 * Math.PI * (t / LOOP)) + phase + i);
        const x = cx + (i % 2 ? d / 2 : -d / 2);
        const y = cy + (i > 1 ? d / 2 : -d / 2);
        return (
          <div key={i} style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%",
            border: `${stroke}px solid ${col}`, opacity: op, transform: `scale(${breathe})` }} />
        );
      })}
    </>
  );
};

export const AppStoreHeader: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  // Light pool drifts on a full-loop cycle so frame 0 == frame N.
  const a = (2 * Math.PI * t) / LOOP;
  const px = 64 + 4 * Math.cos(a), py = 46 + 5 * Math.sin(a);
  // Phone screen dips to dark across the loop seam so the recording's jump isn't visible.
  const seam = Math.min(interpolate(t, [0, 0.4], [1, 0], { extrapolateRight: "clamp" }), 1) +
    interpolate(t, [LOOP - 0.4, LOOP], [0, 1], { extrapolateLeft: "clamp" });
  const ph = 640; // phone outer height — fits the 660 px safe height
  const pw = phoneWidthFor(ph);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background:
      `radial-gradient(ellipse 55% 70% at ${px}% ${py}%, rgba(0,212,255,.22) 0%, rgba(0,212,255,0) 62%),
       radial-gradient(ellipse 45% 60% at 18% 85%, rgba(47,245,176,.12) 0%, rgba(47,245,176,0) 70%),
       linear-gradient(160deg, #0E1628 0%, #0A0F1A 52%, #060A12 100%)` }}>
      <Rings cx={260} cy={900} r={300} stroke={40} phase={0} />
      <Rings cx={3580} cy={900} r={300} stroke={40} phase={Math.PI} />

      {/* Lockup + phone, all inside the art safe area */}
      <div style={{ position: "absolute", left: SAFE.x1, top: SAFE.y1, width: SAFE.x2 - SAFE.x1, height: SAFE.y2 - SAFE.y1,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
          <Img src={staticFile("brand/app-icon.png")} style={{ width: 230, height: 230, borderRadius: 52, boxShadow: "0 28px 80px rgba(0,212,255,.25)" }} />
          <div>
            <div style={{ color: C.text, fontSize: 132, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>Your AI</div>
            <div style={{ fontSize: 132, fontWeight: 800, lineHeight: 1.06, letterSpacing: -3,
              background: `linear-gradient(90deg, ${C.cyan}, ${C.mint})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>running coach.</div>
            <div style={{ color: C.text2, fontSize: 56, marginTop: 22 }}>Live in your ear, every run.</div>
          </div>
        </div>
        <div style={{ width: pw, height: ph, flex: "none", position: "relative" }}>
          <Phone src="clips/phone-mid.mp4" segs={[{ from: 101.0, to: 101.0 + LOOP }]} height={ph} dim={0.92 * Math.min(1, seam)} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

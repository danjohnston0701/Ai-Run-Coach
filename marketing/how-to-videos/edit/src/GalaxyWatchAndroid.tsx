// Galaxy Watch + Android how-to (16:9). Script: ../../galaxywatch-android/SCRIPT.md. Phone = Android
// emulator, watch = Wear OS emulator running the Wear app's video mode (WearVideoDemoMode.kt). Both
// play the same deterministic run, so the numbers match at the same elapsed second.
import React from "react";
import { AbsoluteFill } from "remotion";
import { AndroidPhone, Caption, Enter, GalaxyBackPress, GalaxyWatch, Seg, Tap, androidWidthFor, galaxyWatchBox } from "./components";
import { BRAND, FONT } from "./components";
import { CoachCue, Duo, EndCard, FPS, Pocket, Push, Scene, SceneTrack, Solo, scenesDuration } from "./kit";

const C = "clips/galaxywatch-android/";
const A = {
  devices: C + "phone-devices.mp4", // dashboard → Profile 19.1 → Connected Devices 27.5 → Get Watch App 39.9 → prompt
  start: C + "phone-start.mp4", // Run Without Route 17.4 → Prepare for Watch 23.3 → Waiting 24.8 → live at 52.1
  mid: C + "phone-mid.mp4", // elapsed ≈ t + 201; 1 km coach message from 129.7
  end: C + "phone-end.mp4", // elapsed ≈ t + 1560; 5.00 km at ~41, Run Saving ~46, Run Insights ~49
  summary: C + "phone-summary.mp4", // Run Insights; Summary tab with km splits from ~28
};
const W = {
  main: C + "watch-main.mp4", // pairing 0 → linked 4.1 → prepared 49.8 → GPS → ready → START 64.0
  mid: C + "watch-mid.mp4", // same window as phone-mid
  finish: C + "watch-finish.mp4", // 26:27 run → bottom button 12.2 (26:39, 5.00 km) → Finish Run 15.6 → Yes 18.0 → FINISHED
  solo: C + "watch-solo.mp4", // no phone → Continue without coaching 4.2 → GPS → ready → START 16.3
};
/** Phone-screen tap positions (px in the 1080×2400 recording). */
const T = {
  profileTab: { x: 980, y: 2160 },
  connectedDevices: { x: 360, y: 1504 },
  getWatchApp: { x: 540, y: 1164 },
  runWithoutRoute: { x: 540, y: 1828 },
  prepareForWatch: { x: 540, y: 1504 },
};
/** Watch-screen tap positions (px in the 454×454 recording). */
const WT = {
  start: { x: 227, y: 288 },
  continue: { x: 227, y: 280 },
  finishRun: { x: 227, y: 338 },
  yes: { x: 227, y: 215 },
};
const CUE =
  "Grand job on completing the first kilometre, Daniel! You're nailing that split pace of 5 minutes and 20 seconds per kilometer, which is right on target. Keep that focus, and let's see where this takes you!";

const PH = 930;
const PW = androidWidthFor(PH);
const WD = 500; // watch case diameter beside the phone
const WB = galaxyWatchBox(WD);
const duo = { watchH: WB.h, watchW: WB.w, phoneH: PH, phoneW: PW };
const BIG = 600; // case diameter when the watch is shown alone
const BIGB = galaxyWatchBox(BIG);

/** A smaller Tap ripple for the watch screen. */
const WatchTap: React.FC<{ x: number; y: number; at: number }> = (p) => (
  <div style={{ transform: "scale(0.5)", transformOrigin: `${p.x}px ${p.y}px`, position: "absolute", inset: 0 }}>
    <Tap {...p} />
  </div>
);

/** The watch with an optional bottom-button press, which sits outside the screen. */
const Watch: React.FC<{ src: string; segs: Seg[]; d: number; back?: number; children?: React.ReactNode }> = ({ src, segs, d, back, children }) => (
  <div style={{ position: "relative" }}>
    <GalaxyWatch src={src} segs={segs} height={d}>{children}</GalaxyWatch>
    {back !== undefined && <GalaxyBackPress at={back} height={d} />}
  </div>
);

/** One watch, large, with the caption on the left. */
const WatchSolo: React.FC<{ caption: React.ReactNode; children: React.ReactNode }> = ({ caption, children }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: 160, top: 0, bottom: 0, width: 760, display: "flex", alignItems: "center" }}>{caption}</div>
    <div style={{ position: "absolute", left: 1120, top: (1080 - BIGB.h) / 2 }}>{children}</div>
  </AbsoluteFill>
);

const PlayBadge: React.FC = () => (
  <div
    style={{
      fontFamily: FONT,
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 30px",
      borderRadius: 16,
      border: "1.5px solid rgba(255,255,255,0.35)",
      background: "#000",
      color: BRAND.text,
    }}
  >
    <svg width="34" height="38" viewBox="0 0 34 38">
      <path d="M2 2 L20 19 L2 36 Z" fill="#00D4FF" />
      <path d="M2 2 L26 15 L20 19 Z" fill="#2ED48A" />
      <path d="M2 36 L26 23 L20 19 Z" fill="#FF3355" />
      <path d="M26 15 L32 19 L26 23 L20 19 Z" fill="#FFC94D" />
    </svg>
    <div>
      <div style={{ fontSize: 15, letterSpacing: 1.5, color: BRAND.muted }}>FREE ON</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: -2 }}>Google Play · Galaxy Watch4+</div>
    </div>
  </div>
);

// Scene 8's phone: the last seconds live (26:35 → 5.00 km as the watch finishes), Run Insights,
// then the km splits.
const FINISH_SEGS: Seg[] = [
  { from: 37.5, to: 43.5 },
  { from: 50.0, to: 53.0 },
  { from: 28.0, to: 30.6, src: A.summary },
];

const SCENES: Scene[] = [
  {
    dur: 8.0,
    vo: "vo/galaxywatch-android/scene-01.mp3",
    el: (
      <Push dur={8.0} from={1.0} to={1.07}>
        <Duo
          {...duo}
          watch={<Enter delay={0.1}><Watch src={W.main} segs={[{ from: 72.0, to: 80.0 }]} d={WD} /></Enter>}
          phone={<Enter delay={0.3}><AndroidPhone src={A.start} segs={[{ from: 60.0, to: 68.0 }]} height={PH} /></Enter>}
        />
      </Push>
    ),
  },
  {
    dur: 12.0,
    vo: "vo/galaxywatch-android/scene-02.mp3",
    el: (
      <Solo
        deviceH={960}
        caption={<Caption step="Step 1 · Once" title="Add the watch app" sub="Profile → Connected Devices → Get Watch App" />}
        device={
          <Enter>
            <AndroidPhone
              src={A.devices}
              height={960}
              segs={[
                { from: 17.5, to: 19.6 }, // dashboard → Profile
                { from: 26.5, to: 28.6 }, // → Connected Devices
                { from: 28.6, to: 37.6, rate: 3.0 }, // scroll to the Samsung card
                { from: 38.8, to: 46.0, rate: 1.4 }, // Get Watch App → install screen
              ]}
            >
              <Tap {...T.profileTab} at={1.6} />
              <Tap {...T.connectedDevices} at={3.1} />
              <Tap {...T.getWatchApp} at={8.0} />
            </AndroidPhone>
          </Enter>
        }
      />
    ),
  },
  {
    dur: 12.6,
    vo: "vo/galaxywatch-android/scene-03.mp3",
    el: (
      <WatchSolo caption={<Caption step="Step 2 · Automatic" title="It links itself" sub="Open the app on both — then prepare on your phone for live coaching" />}>
        <Enter><Watch src={W.main} segs={[{ from: 0.5, to: 13.1 }]} d={BIG} /></Enter>
      </WatchSolo>
    ),
  },
  {
    dur: 13.2,
    vo: "vo/galaxywatch-android/scene-04.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Every run" title="Set up your run, then Prepare for Watch" sub="Distance, target time, or a plan session" size={48} />}
        watch={<Enter><Watch src={W.main} segs={[{ from: 41.0, to: 54.2 }]} d={WD} /></Enter>}
        phone={
          <Enter delay={0.2}>
            <AndroidPhone
              src={A.start}
              height={PH}
              segs={[
                { from: 15.5, to: 25.5 }, // 5 km · 26:40 → Run Without Route → Prepare for Watch
                { from: 25.5, to: 28.7 }, // Waiting for Watch
              ]}
            >
              <Tap {...T.runWithoutRoute} at={1.9} />
              <Tap {...T.prepareForWatch} at={7.8} />
            </AndroidPhone>
          </Enter>
        }
      />
    ),
  },
  {
    dur: 7.2,
    vo: "vo/galaxywatch-android/scene-05.mp3",
    el: (
      <Solo
        deviceH={960}
        caption={<Caption step="Then" title="Keep your phone with you" sub="Your coach talks to you through your headphones" />}
        device={<Pocket>{(dim) => <AndroidPhone src={A.start} height={960} segs={[{ from: 26.0, to: 33.2 }]} dim={dim} />}</Pocket>}
      />
    ),
  },
  {
    dur: 8.0,
    vo: "vo/galaxywatch-android/scene-06.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Start" title="Tap Start Run on the watch" sub="Your phone starts at the same moment" size={48} />}
        watch={
          <Enter>
            <Watch src={W.main} segs={[{ from: 58.0, to: 66.0 }]} d={WD}>
              <WatchTap {...WT.start} at={6.0} />
            </Watch>
          </Enter>
        }
        phone={<Enter delay={0.2}><AndroidPhone src={A.start} height={PH} segs={[{ from: 46.0, to: 54.0 }]} /></Enter>}
      />
    ),
  },
  {
    dur: 10.4,
    vo: "vo/galaxywatch-android/scene-07.mp3",
    el: (
      <Push dur={10.4} from={1.0} to={1.04}>
        <Duo
          {...duo}
          caption={<CoachCue title="Your coach uses your watch's data" cue={CUE} />}
          watch={<Watch src={W.mid} segs={[{ from: 127.1, to: 137.5 }]} d={WD} />}
          phone={<AndroidPhone src={A.mid} height={PH} segs={[{ from: 127.0, to: 137.4 }]} />}
        />
      </Push>
    ),
  },
  {
    dur: 11.6,
    vo: "vo/galaxywatch-android/scene-08.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Finish" title="Pause with the bottom button, then Finish Run" sub="Splits, charts and your coach's review on your phone" size={46} />}
        watch={
          <Enter>
            <Watch src={W.finish} segs={[{ from: 10.5, to: 22.1 }]} d={WD} back={1.7}>
              <WatchTap {...WT.finishRun} at={5.1} />
              <WatchTap {...WT.yes} at={7.5} />
            </Watch>
          </Enter>
        }
        phone={<Enter delay={0.2}><AndroidPhone src={A.end} height={PH} segs={FINISH_SEGS} /></Enter>}
      />
    ),
  },
  {
    dur: 9.0,
    vo: "vo/galaxywatch-android/scene-09.mp3",
    el: (
      <WatchSolo caption={<Caption step="No phone? No problem" title="The watch records on its own" sub="Tap Continue without coaching — it uploads when you're back" />}>
        <Enter>
          <Watch src={W.solo} segs={[{ from: 1.0, to: 6.0 }, { from: 14.0, to: 18.0 }]} d={BIG}>
            <WatchTap {...WT.continue} at={3.2} />
            <WatchTap {...WT.start} at={7.3} />
          </Watch>
        </Enter>
      </WatchSolo>
    ),
  },
  {
    dur: 5.8,
    vo: "vo/galaxywatch-android/scene-10.mp3",
    el: <EndCard footer={<PlayBadge />} />,
  },
];

export const galaxyWatchAndroidDuration = scenesDuration(SCENES);
export const GalaxyWatchAndroid: React.FC = () => <SceneTrack scenes={SCENES} />;

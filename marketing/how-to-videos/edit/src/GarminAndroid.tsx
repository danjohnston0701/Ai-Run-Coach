// Garmin + Android how-to (16:9). Script: ../../garmin-android/SCRIPT.md. Phone = Android emulator,
// watch = the Garmin + iPhone video's Connect IQ takes (same deterministic run, so the numbers match
// at the same elapsed second).
import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile } from "remotion";
import { AndroidPhone, Caption, Enter, Seg, Tap, Watch, WATCH, WatchPress, androidWidthFor } from "./components";
import { CoachCue, Duo, EndCard, FPS, Pocket, Push, Scene, SceneTrack, Solo, scenesDuration } from "./kit";
import { CLIPS as G } from "./clips";

const A = {
  devices: "clips/garmin-android/phone-devices.mp4", // dashboard → Profile 18 → Connected Devices 25.6 → Get Watch App 36.6 → prompt
  start: "clips/garmin-android/phone-start.mp4", // Run Without Route 19 → Prepare for Watch 27 → Waiting 29 → live at 46.1
  mid: "clips/garmin-android/phone-mid.mp4", // elapsed = t + 198; 1 km coach message 128–140
  end: "clips/garmin-android/phone-end.mp4", // live → watch finish → Run Summary
  summary: "clips/garmin-android/phone-summary.mp4", // Run Insights: Summary tab, route map from ~200
  aiReview: "clips/garmin-android/phone-summary-ai.png", // AI review, Performance Score 78
};
/** Phone-screen tap positions (px in the 1080×2400 recording). */
const T = {
  profileTab: { x: 980, y: 2160 },
  connectedDevices: { x: 360, y: 1504 },
  getWatchApp: { x: 540, y: 1320 },
  runWithoutRoute: { x: 540, y: 1828 },
  prepareForWatch: { x: 540, y: 1504 },
};
const CUE =
  "Well done, Daniel! You've just completed the first kilometre with a split pace of 5 minutes and 20 seconds per kilometer, which is dead on your target pace. Keep riding that rhythm!";

const PH = 930;
const PW = androidWidthFor(PH);
const WH = 800;
const WW = (WATCH.w * WH) / WATCH.h;
const duo = { watchH: WH, watchW: WW, phoneH: PH, phoneW: PW };

// Scene 8's phone: the last seconds live (handing over as the watch finishes), then the summary.
// End clip: elapsed = t + 1560 (26:39 at 39); watch FINISHED (elapsed 26:40) is at scene 4.4.
const FINISH_SEGS: Seg[] = [
  { from: 35.6, to: 42.0 }, // 26:35 → 5.00 km, finished on the watch
  { from: 84.0, to: 87.0 }, // Run Insights — Run Complete, 5.00 km
  { from: 205.0, to: 207.5, src: "clips/garmin-android/phone-summary.mp4" }, // route map round the lake
];

const SCENES: Scene[] = [
  {
    dur: 8.0,
    vo: "vo/garmin-android/scene-01.mp3",
    el: (
      <Push dur={8.0} from={1.0} to={1.07}>
        <Duo
          {...duo}
          watch={<Enter delay={0.1}><Watch src={G.watchRun1} segs={[{ from: 78.3, to: 88.3 }]} height={WH} /></Enter>}
          phone={<Enter delay={0.3}><AndroidPhone src={A.mid} segs={[{ from: 101.3, to: 111.3 }]} height={PH} /></Enter>}
        />
      </Push>
    ),
  },
  {
    dur: 11.8,
    vo: "vo/garmin-android/scene-02.mp3",
    el: (
      <Solo
        deviceH={960}
        caption={
          <div>
            <Caption step="Step 1 · Once" title="Add the watch app" sub="Profile → Connected Devices → Get Watch App" />
            <Enter delay={1.2} style={{ marginTop: 40 }}>
              <Img src={staticFile("brand/available-connect-iq-badge.png")} style={{ height: 64 }} />
            </Enter>
          </div>
        }
        device={
          <Enter>
            <AndroidPhone
              src={A.devices}
              height={960}
              segs={[
                { from: 16.5, to: 18.6 }, // dashboard → Profile
                { from: 24.0, to: 26.4 }, // → Connected Devices
                { from: 26.4, to: 33.4, rate: 2.8 }, // scroll to the Garmin card
                { from: 33.4, to: 40.4 }, // Get Watch App → install screen
              ]}
            >
              <Tap {...T.profileTab} at={1.4} />
              <Tap {...T.connectedDevices} at={3.7} />
              <Tap {...T.getWatchApp} at={8.1} />
            </AndroidPhone>
          </Enter>
        }
      />
    ),
  },
  {
    dur: 10.4,
    vo: "vo/garmin-android/scene-03.mp3",
    el: (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 160, top: 0, bottom: 0, width: 760, display: "flex", alignItems: "center" }}>
          <Caption step="Step 2 · Automatic" title="It links itself" sub="Through the Garmin Connect app — no code to type" />
        </div>
        <div style={{ position: "absolute", left: 1100, top: (1080 - 880) / 2 }}>
          <Enter><Watch src={G.watchStart} segs={[{ from: 18.5, to: 31.0, rate: 1.2 }]} height={880} /></Enter>
        </div>
      </AbsoluteFill>
    ),
  },
  {
    dur: 13.6,
    vo: "vo/garmin-android/scene-04.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Every run" title="Set up your run, then Prepare for Watch" sub="Distance, target time, or a plan session" size={48} />}
        watch={<Enter><Watch src={G.watchStart} segs={[{ from: 20.5, to: 30.8 }, { from: 31.3, to: 34.6 }]} height={WH} /></Enter>}
        phone={
          <Enter delay={0.2}>
            <AndroidPhone
              src={A.start}
              height={PH}
              segs={[
                { from: 15.0, to: 19.5, rate: 1.5 }, // 5 km · 26:40 → Run Without Route
                { from: 19.5, to: 27.2 }, // Configure → Prepare for Watch
                { from: 29.5, to: 32.5 }, // Waiting for Watch
              ]}
            >
              <Tap {...T.runWithoutRoute} at={2.7} />
              <Tap {...T.prepareForWatch} at={10.3} />
            </AndroidPhone>
          </Enter>
        }
      />
    ),
  },
  {
    dur: 7.4,
    vo: "vo/garmin-android/scene-05.mp3",
    el: (
      <Solo
        deviceH={960}
        caption={<Caption step="Then" title="Keep your phone with you" sub="Your coach talks to you through your headphones" />}
        device={<Pocket>{(dim) => <AndroidPhone src={A.start} height={960} segs={[{ from: 33.0, to: 40.4 }]} dim={dim} />}</Pocket>}
      />
    ),
  },
  {
    dur: 9.2,
    vo: "vo/garmin-android/scene-06.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Start" title="Press START on the watch" sub="Your phone starts at the same moment" size={48} />}
        watch={
          <Enter>
            <Watch src={G.watchStart} segs={[{ from: 36.0, to: 41.0, rate: 2.5 }, { from: 43.5, to: 55.7 }]} height={WH}>
              <WatchPress at={5.9} height={WH} />
            </Watch>
          </Enter>
        }
        phone={<Enter delay={0.2}><AndroidPhone src={A.start} height={PH} segs={[{ from: 40.1, to: 50.1 }]} /></Enter>}
      />
    ),
  },
  {
    dur: 10.6,
    vo: "vo/garmin-android/scene-07.mp3",
    el: (
      <Push dur={10.6} from={1.0} to={1.04}>
        <Duo
          {...duo}
          caption={<CoachCue title="Your coach uses your watch's data" cue={CUE} />}
          watch={<Watch src={G.watchRun1} segs={[{ from: 103.6, to: 115.6 }]} height={WH} />}
          phone={<AndroidPhone src={A.mid} height={PH} segs={[{ from: 126.6, to: 138.6 }]} />}
        />
      </Push>
    ),
  },
  {
    dur: 12.4,
    vo: "vo/garmin-android/scene-08.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Finish" title="Finish on the watch, review on your phone" sub="Splits, charts and your coach's review" size={48} />}
        watch={<Enter><Watch src={G.watchFinish} segs={[{ from: 53.6, to: 66 }]} height={WH} /></Enter>}
        phone={
          <Enter delay={0.2}>
            <AndroidPhone src={A.end} height={PH} segs={FINISH_SEGS}>
              <Sequence from={Math.round(11.9 * FPS)} layout="none">
                <Img src={staticFile(A.aiReview)} style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 2400 }} />
              </Sequence>
            </AndroidPhone>
          </Enter>
        }
      />
    ),
  },
  {
    dur: 7.6,
    vo: "vo/garmin-android/scene-09.mp3",
    el: (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 160, top: 0, bottom: 0, width: 760, display: "flex", alignItems: "center" }}>
          <Caption step="No phone? No problem" title="The watch records on its own" sub="Everything uploads when you're back in range" />
        </div>
        <div style={{ position: "absolute", left: 1100, top: (1080 - 880) / 2 }}>
          <Enter><Watch src={G.watchRun2} segs={[{ from: 4, to: 13 }]} height={880} /></Enter>
        </div>
      </AbsoluteFill>
    ),
  },
  { dur: 6.2, vo: "vo/garmin-android/scene-10.mp3", el: <EndCard badge="brand/available-connect-iq-badge.png" /> },
];

export const garminAndroidDuration = scenesDuration(SCENES);
export const GarminAndroid: React.FC = () => <SceneTrack scenes={SCENES} />;

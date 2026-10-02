// Apple Watch + iPhone how-to (16:9). Script: ../../applewatch-iphone/SCRIPT.md. Phone = iPhone 17 Pro
// simulator, watch = a paired Apple Watch Series 11 simulator (WatchVideoDemoMode). The watch
// clips come from the 2026-10-03 10:06 take (red heart rate, zone as a number only); the phone
// clips from the 2026-10-01 19:23 take — same deterministic run, aligned by elapsed time (see the
// clip notes below).
import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile } from "remotion";
import { AppleWatch, Caption, Enter, Phone, Tap, ZoomTo, appleWatchBox, phoneWidthFor } from "./components";
import { CoachCue, Duo, EndCard, Pocket, Push, Scene, SceneTrack, Solo, FPS, scenesDuration } from "./kit";

const D = "clips/applewatch-iphone/";
const C = {
  // phone (19:23 take)
  devices: D + "phone-devices.mp4", // dashboard → Profile 21.5 → Connected Devices 29.5 → Apple Watch card 36–46
  start: D + "phone-start.mp4", // Run Without Route 30.5 → Prepare for Watch 34.5 → Waiting → live at 48.6
  mid: D + "phone-mid.mp4", // elapsed = t + 281; 1 km coach message 48–60
  end: D + "phone-end.mp4", // elapsed = t + 1561; watch paused 36.4, stop 42.2, Run Saving 44, summary 48
  summary: D + "phone-summary.mp4", // Run Insights: route map 26–30, km splits 32–36, graphs 44–48
  aiReview: D + "phone-summary-ai.png", // AI review, Performance Score 85/100
  // watch (2026-10-03 10:06 take)
  wStart: D + "watch-start.mp4", // "Prepare on your iPhone" 0–41.4 → COACHED RUN · READY 41.4–53.9 → START 53.9
  wMid: D + "watch-mid.mp4", // same elapsed as phone-mid at the same t
  wEnd: D + "watch-end.mp4", // same elapsed as phone-end; PAUSED ~39, STOP 43.2, DONE after
};
/** Phone taps (px in the 1206×2622 recording); watch taps (px in the 416×496 watch framebuffer). */
const T = {
  profileTab: { x: 1022, y: 2452 },
  connectedDevices: { x: 600, y: 1747 },
  runWithoutRoute: { x: 603, y: 1253 },
  prepareForWatch: { x: 603, y: 1694 },
  watchStart: { x: 208, y: 452 },
  watchStop: { x: 312, y: 390 },
};
const CUE =
  "Grand start, Daniel! You're cruising at a pace of 5 minutes and 21 seconds per kilometer, right at the one-kilometre mark. That cadence of 171 steps per minute is looking mighty solid too!";

const PH = 930;
const PW = phoneWidthFor(PH);
const WCASE = 470; // Apple Watch case height
const WBOX = appleWatchBox(WCASE);
const duo = { watchH: WBOX.h, watchW: WBOX.w, phoneH: PH, phoneW: PW };
const BIG = 560; // case height when the watch is shown alone
const BIGBOX = appleWatchBox(BIG);

/** A smaller version of the Tap ripple, sized for the watch screen. */
const WatchTap: React.FC<{ x: number; y: number; at: number }> = (p) => (
  <div style={{ transform: "scale(0.45)", transformOrigin: `${p.x}px ${p.y}px`, position: "absolute", inset: 0 }}>
    <Tap {...p} />
  </div>
);

/** Shows the AI review still over the phone screen from `at` seconds into the scene. */
const AiReview: React.FC<{ at: number }> = ({ at }) => (
  <Sequence from={Math.round(at * FPS)} layout="none">
    <Img src={staticFile(C.aiReview)} style={{ position: "absolute", left: 0, top: 0, width: 1206, height: 2622 }} />
  </Sequence>
);

const SCENES: Scene[] = [
  {
    dur: 7.4,
    vo: "vo/applewatch-iphone/scene-01.mp3",
    el: (
      <Push dur={7.4} from={1.0} to={1.07}>
        <Duo
          {...duo}
          watch={<Enter delay={0.1}><AppleWatch src={C.wMid} segs={[{ from: 30, to: 40 }]} height={WCASE} /></Enter>}
          phone={<Enter delay={0.3}><Phone src={C.mid} segs={[{ from: 30, to: 40 }]} height={PH} /></Enter>}
        />
      </Push>
    ),
  },
  {
    dur: 16.4,
    vo: "vo/applewatch-iphone/scene-02.mp3",
    el: (
      <Solo
        deviceH={960}
        caption={<Caption step="Step 1 · Once" title="Get the app on your watch" sub="Usually automatic. If not: Watch app on your iPhone → Available Apps → Install" />}
        device={
          <Enter>
            <ZoomTo at={11.6} x={0.5} y={0.42} scale={1.14}>
              <Phone
                src={C.devices}
                height={960}
                segs={[
                  { from: 19.5, to: 22.5 }, // dashboard → Profile
                  { from: 26.0, to: 31.0 }, // → Connected Devices
                  { from: 31.0, to: 36.0, rate: 1.6 }, // scroll to the Apple Watch card
                  { from: 36.0, to: 46.3 }, // "Connected · Watch app is active and syncing."
                ]}
              >
                <Tap {...T.profileTab} at={2.0} />
                <Tap {...T.connectedDevices} at={6.5} />
              </Phone>
            </ZoomTo>
          </Enter>
        }
      />
    ),
  },
  {
    dur: 8.0,
    vo: "vo/applewatch-iphone/scene-03.mp3",
    el: (
      <Solo
        deviceH={BIGBOX.h}
        left={1180}
        caption={<Caption step="Step 2" title="Open Ai Run Coach on your watch" sub="It asks you to prepare on your iPhone — that switches on live coaching" />}
        device={<Enter><AppleWatch src={C.wStart} segs={[{ from: 2, to: 10.5 }]} height={BIG} /></Enter>}
      />
    ),
  },
  {
    dur: 12.6,
    vo: "vo/applewatch-iphone/scene-04.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Every run" title="Set up your run, then Prepare for Watch" sub="Distance, target time, or a plan session" size={48} />}
        watch={<Enter><AppleWatch src={C.wStart} segs={[{ from: 33.8, to: 46.4 }]} height={WCASE} /></Enter>}
        phone={
          <Enter delay={0.2}>
            <Phone
              src={C.start}
              height={PH}
              segs={[
                { from: 26.0, to: 30.8 }, // 5 km · 26:40 → Run Without Route
                { from: 30.8, to: 35.5 }, // Run Setup → Prepare for Watch
                { from: 35.5, to: 39.2 }, // Waiting for Watch
              ]}
            >
              <Tap {...T.runWithoutRoute} at={4.5} />
              <Tap {...T.prepareForWatch} at={8.5} />
            </Phone>
          </Enter>
        }
      />
    ),
  },
  {
    dur: 7.2,
    vo: "vo/applewatch-iphone/scene-05.mp3",
    el: (
      <Solo
        deviceH={960}
        caption={<Caption step="Then" title="Keep your phone with you" sub="Your coach talks to you through your headphones" />}
        device={<Pocket>{(dim) => <Phone src={C.start} height={960} segs={[{ from: 38.0, to: 45.2 }]} dim={dim} />}</Pocket>}
      />
    ),
  },
  {
    dur: 6.6,
    vo: "vo/applewatch-iphone/scene-06.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Start" title="Tap Start Coached Run" sub="Your phone starts at the same moment" size={48} />}
        watch={
          <Enter>
            <AppleWatch src={C.wStart} segs={[{ from: 49.9, to: 56.5 }]} height={WCASE}>
              <WatchTap {...T.watchStart} at={3.9} />
            </AppleWatch>
          </Enter>
        }
        phone={<Enter delay={0.2}><Phone src={C.start} height={PH} segs={[{ from: 44.6, to: 51.2 }]} /></Enter>}
      />
    ),
  },
  {
    dur: 10.4,
    vo: "vo/applewatch-iphone/scene-07.mp3",
    el: (
      <Push dur={10.4} from={1.0} to={1.04}>
        <Duo
          {...duo}
          caption={<CoachCue title="Your coach uses your watch's data" cue={CUE} />}
          watch={<AppleWatch src={C.wMid} segs={[{ from: 46.5, to: 58.5 }]} height={WCASE} />}
          phone={<Phone src={C.mid} height={PH} segs={[{ from: 46.5, to: 58.5 }]} />}
        />
      </Push>
    ),
  },
  {
    dur: 13.2,
    vo: "vo/applewatch-iphone/scene-08.mp3",
    el: (
      <Duo
        {...duo}
        caption={<Caption step="Finish" title="Pause and stop on the watch" sub="Splits, charts and your coach's review on your phone" size={48} />}
        watch={
          <Enter>
            <AppleWatch src={C.wEnd} segs={[{ from: 36.0, to: 45.0 }, { from: 45.0, to: 49.2 }]} height={WCASE}>
              <WatchTap {...T.watchStop} at={7.2} />
            </AppleWatch>
          </Enter>
        }
        phone={
          <Enter delay={0.2}>
            <Phone
              src={C.end}
              height={PH}
              segs={[
                { from: 35.2, to: 44.8 }, // last seconds live → paused → Run Saving
                { from: 26.5, to: 28.6, src: C.summary }, // route map
              ]}
            >
              <AiReview at={11.7} />
            </Phone>
          </Enter>
        }
      />
    ),
  },
  {
    dur: 8.4,
    vo: "vo/applewatch-iphone/scene-09.mp3",
    el: (
      <Solo
        deviceH={BIGBOX.h}
        left={1180}
        caption={<Caption step="No phone? No problem" title="The watch records on its own" sub="Tap Continue without coaching — it syncs when you're back" />}
        device={<Enter><AppleWatch src={C.wStart} segs={[{ from: 12, to: 20.4 }]} height={BIG} /></Enter>}
      />
    ),
  },
  { dur: 6.2, vo: "vo/applewatch-iphone/scene-10.mp3", el: <EndCard /> },
];

export const appleWatchIphoneDuration = scenesDuration(SCENES);
export const AppleWatchIphone: React.FC = () => <SceneTrack scenes={SCENES} />;

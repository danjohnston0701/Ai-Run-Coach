import React from "react";
import { Composition } from "remotion";
import { Long, longDuration } from "./Long";
import { Short, shortDuration } from "./Short";
import { GarminAndroid, garminAndroidDuration } from "./GarminAndroid";
import { AppleWatchIphone, appleWatchIphoneDuration } from "./AppleWatchIphone";
import { GalaxyWatchAndroid, galaxyWatchAndroidDuration } from "./GalaxyWatchAndroid";

export const Root: React.FC = () => (
  <>
    {/* Garmin + iPhone (ids kept from the first video: Long = 16:9, Short = 9:16) */}
    <Composition id="Long" component={Long} durationInFrames={longDuration} fps={30} width={1920} height={1080} />
    <Composition id="Short" component={Short} durationInFrames={shortDuration} fps={30} width={1080} height={1920} />
    <Composition id="GarminAndroid" component={GarminAndroid} durationInFrames={garminAndroidDuration} fps={30} width={1920} height={1080} />
    <Composition id="AppleWatchIphone" component={AppleWatchIphone} durationInFrames={appleWatchIphoneDuration} fps={30} width={1920} height={1080} />
    <Composition id="GalaxyWatchAndroid" component={GalaxyWatchAndroid} durationInFrames={galaxyWatchAndroidDuration} fps={30} width={1920} height={1080} />
  </>
);

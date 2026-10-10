import React from "react";
import { Composition } from "remotion";
import { Long, longDuration } from "./Long";
import { Short, shortDuration } from "./Short";
import { GarminAndroid, garminAndroidDuration } from "./GarminAndroid";
import { AppleWatchIphone, appleWatchIphoneDuration } from "./AppleWatchIphone";
import { GalaxyWatchAndroid, galaxyWatchAndroidDuration } from "./GalaxyWatchAndroid";
import { GroupRunReel, groupRunReelDuration } from "./GroupRunReel";
import { AppStoreHeader, appStoreHeaderDuration, HEADER_W, HEADER_H } from "./AppStoreHeader";

export const Root: React.FC = () => (
  <>
    {/* Garmin + iPhone (ids kept from the first video: Long = 16:9, Short = 9:16) */}
    <Composition id="Long" component={Long} durationInFrames={longDuration} fps={30} width={1920} height={1080} />
    <Composition id="Short" component={Short} durationInFrames={shortDuration} fps={30} width={1080} height={1920} />
    <Composition id="GarminAndroid" component={GarminAndroid} durationInFrames={garminAndroidDuration} fps={30} width={1920} height={1080} />
    <Composition id="AppleWatchIphone" component={AppleWatchIphone} durationInFrames={appleWatchIphoneDuration} fps={30} width={1920} height={1080} />
    {/* iOS 27 App Store product page header video (marketing/app-store/ios-creative-assets) */}
    <Composition id="AppStoreHeader" component={AppStoreHeader} durationInFrames={appStoreHeaderDuration} fps={30} width={HEADER_W} height={HEADER_H} />
    {/* Instagram Reel promoting Group Runs (marketing/instagram/group-run/) */}
    <Composition id="GroupRunReel" component={GroupRunReel} durationInFrames={groupRunReelDuration} fps={30} width={1080} height={1920} />
    <Composition id="GalaxyWatchAndroid" component={GalaxyWatchAndroid} durationInFrames={galaxyWatchAndroidDuration} fps={30} width={1920} height={1080} />
  </>
);

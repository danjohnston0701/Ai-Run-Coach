import React from "react";
import { Composition } from "remotion";
import { Long, longDuration } from "./Long";
import { Short, shortDuration } from "./Short";

export const Root: React.FC = () => (
  <>
    <Composition id="Long" component={Long} durationInFrames={longDuration} fps={30} width={1920} height={1080} />
    <Composition id="Short" component={Short} durationInFrames={shortDuration} fps={30} width={1080} height={1920} />
  </>
);

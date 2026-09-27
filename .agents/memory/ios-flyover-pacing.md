---
name: iOS flyover frame pacing
description: Why the iOS run-share video is rendered frame-by-frame (stepped) while Android records in real time, and what not to undo.
---

iOS records the run flyover in **stepped mode** (`STEPPED_RENDER` in `client/src/pages/RunVideoShare.tsx`): for each output frame the timeline advances exactly 1/30s, the camera/route/marker are set, the page waits for MapLibre's `idle` event (camera drawn with every tile loaded, capped by `STEP_FRAME_TIMEOUT_MS`), then composites and encodes that frame via WebCodecs with an explicit timestamp. Output is perfectly smooth at any device speed; slow devices only take longer to generate. iOS uses the SAME renderer as Android: 1080×1920, terrain (exaggeration 2.4), 76° pitch, MapLibre WebGL route/marker layers.

**Why:** The old real-time recorder drove the camera by wall-clock time and captured whatever frames got drawn. Android renders the 3D scene at ~60fps so it looked smooth; iPhone WebKit drops frames, so the camera lurched between them and half-loaded tiles popped in. The earlier iOS workaround (720p, terrain off, 58° pitch, 2D-canvas route overlay) was rejected: it downgraded iOS to 2D, and its `/iPhone|iPad|iPod/` check never matched inside the iOS app anyway — `RunVideoView.swift` gives the WKWebView a desktop-Mac user agent — so detection is now "iPhone/iPad UA OR Macintosh UA with touch points". The claim that WKWebView blocks MapLibre's blob-URL workers (GeoJSON `setData`) is false — verified 2026-09-27 in iOS Simulator Safari: terrain, route line and marker all render, and a stepped export came out at exactly 30fps with no dropped/duplicated frames.

**How to apply:**
- Don't reintroduce iOS-specific downgrades (lower resolution, no terrain, flatter pitch, 2D route overlay) to "fix" jank — jank means frames aren't being waited for, not that the scene is too heavy.
- Satellite `raster-fade-duration` is 0 in stepped mode so tiles aren't captured mid-fade.
- Android intentionally still records in real time (`STEPPED_RENDER = isIOS`); switching Android to stepped is possible but untested there.
- The MediaRecorder fallback (no WebCodecs) can't be stepped — it stays real-time on every platform.
- Still needs confirmation on a real iPhone inside the app (generation time especially — ~5 min in the Simulator, whose WebGL is far slower than a device).

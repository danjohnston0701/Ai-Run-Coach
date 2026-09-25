---
name: iOS flyover frame pacing
description: Why iOS run-share video capture differs from Android and how to keep its map, route, and video clock synchronized.
---

Keep iOS canvas compositing paired with a completed MapLibre repaint after each camera move. On iOS, the route and marker are projected by the 2D canvas fallback rather than MapLibre layers, so projecting them against a new camera while copying the previous WebGL map frame makes the route appear to lag or jump. For WebCodecs recording, use fixed video-time increments per rendered frame, not elapsed wall time; for MediaRecorder fallback, limit route-clock advances when the browser stalls. Preserve Android's WebGL layers and existing real-time timing.

**Why:** WKWebView can take longer than a frame to render satellite terrain and project a dense route. Wall-time animation skips large route distances after slow frames, while immediate post-camera compositing combines mismatched camera frames.

**How to apply:** When changing video rendering, check both map repaint/canvas projection synchronization and the encoded timeline. Avoid dynamic progress-dependent route subsampling strides because those reshuffle line vertices as the route grows. iOS on-device export still needs real-device verification; a desktop preview does not exercise WKWebView performance.

Keep the iOS canvas-overlay renderer on a non-terrain satellite plane unless replacing its projection strategy. Keep Android's terrain renderer independent.

**Why:** Render-event synchronization alone did not resolve reported iOS jumping. MapLibre's public `project()` samples live DEM elevation when terrain is enabled; tile refinement can shift projected points and camera elevation even when capture follows a completed render. Removing terrain is an intentional stability/visual-detail tradeoff, not a verified on-device cure.

**How to apply:** Do not re-enable raised terrain on iOS just to match Android's appearance without verifying elevation stability on an actual iPhone. Camera smoothing should use logical animation-time deltas so preview and fixed-step encoding have comparable response.
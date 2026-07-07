---
name: Flyover video share format
description: How the run-flyover "Share Run Video" export must be encoded so it plays and shares on Android.
---

# Flyover video export (RunVideoShare.tsx) — hard-won rules

The "Share Run Video" flyover is rendered to a `<canvas>` and exported as a file, then
handed to the Android app through a WebView blob bridge (anchor `.click()` interception →
base64 → native save/share sheet). It only runs in the real Android WebView on
airuncoach.live — you CANNOT preview it in the dev environment.

## Rule 1 — Output must be MP4/H.264 end-to-end
Instagram / WhatsApp / iMessage reject WebM (VP8/VP9). The `.mp4` container + `video/mp4`
MIME must be consistent at EVERY layer:
- Web: the `Blob` type AND the download filename extension.
- Android (`RunVideoScreen.kt`): the share `Intent` type AND the `MediaScanner` MIME must
  be derived from the saved file extension, NOT hardcoded to `video/webm`.

## Rule 2 — Encode with WebCodecs + mp4-muxer, NOT MediaRecorder
Android WebView's `MediaRecorder` MP4 writes broken/missing duration metadata → players and
Instagram show only ~3s even though all frames are present (preview looks fine; the file is
the problem). Correct path: `VideoEncoder` + `VideoFrame` → `mp4-muxer`
(`fastStart:"in-memory"`, H.264 Baseline e.g. `avc1.42E029`). Keep `MediaRecorder` only as a
last-resort fallback for WebViews without WebCodecs.

## Rule 3 — Every VideoFrame needs an explicit `duration` (THE big gotcha)
`new VideoFrame(canvas, {timestamp})` with no `duration` → `EncodedVideoChunk.duration` is
`null`. mp4-muxer's `addVideoChunk` rejects a non-finite duration (`Number.isFinite(null)` is
false) and throws — and this check runs BEFORE it stores samples or the decoderConfig. The
throw happens inside the async encoder `output` callback, so it's SWALLOWED: no samples, no
decoderConfig, and `finalize()` then crashes with "Cannot read properties of null (reading
'colorSpace')". Always create frames with a duration, e.g.
`new VideoFrame(canvas, {timestamp: Math.round(t*1000), duration: Math.round(1e6/30)})`.
**Why it fooled us for so long:** the mount self-test inspects `meta.decoderConfig` directly
and never feeds a muxer, so it always passed; and `firstTimestampBehavior` / decoderConfig
theories were downstream of this earlier throw.

## Rule 4 — mp4-muxer needs `decoderConfig.description`; prove it, and seed it
mp4-muxer only sets `track.info.decoderConfig` when a chunk's meta carries `decoderConfig`
(the avcC / SPS+PPS "description"). If it stays null, `finalize()` crashes on `.colorSpace`.
Two defenses (keep both):
- Pass `avc:{format:"avc"}` to `configure()` (forces AVCC + a description).
- Some WebViews emit the description only on a `flush()` of one keyframe (the self-test) but
  NOT during continuous streaming. So capture the proven `decoderConfig` (deep-copy the
  description bytes, respecting byteOffset/byteLength) during the self-test, and in the real
  encoder `output` callback seed the FIRST chunk with it when a live chunk lacks one. Safe:
  same codec+resolution ⇒ identical SPS/PPS.
- Also set `firstTimestampBehavior:"offset"` on the Muxer (rAF's first frame timestamp is
  never exactly 0; "strict" would throw). Defense-in-depth.

## Rule 5 — Gate WebCodecs on a REAL runtime self-test, not `isConfigSupported()`
`isConfigSupported()` LIES on some Android WebViews (returns true, then real encoding yields
zero frames). At mount, actually `encode()` + `await flush()` one `VideoFrame` at the true
output resolution (1080×1920) walking a codec ladder, and only enable WebCodecs if a chunk
truly comes out AND a `decoderConfig.description` is captured; store the proven codec + config.
Disable the Record button until the probe finishes. On-device `console.error` is invisible, so
surface the real failure reason in the UI (encoder/frame/finalize message + frame count +
`seeded: yes/no`) — that diagnostic is what let us finally distinguish these failure modes.

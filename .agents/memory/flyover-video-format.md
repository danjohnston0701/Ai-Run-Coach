---
name: Flyover video share format
description: The run flyover video must be MP4/H.264 end-to-end or social apps reject it.
---

# Flyover video must be MP4/H.264, not WebM

The "Share Run Video" flyover is recorded in-browser via `MediaRecorder` on a
`<canvas>.captureStream()`, then handed to the Android app through a WebView blob
bridge (anchor `.click()` interception → base64 → native save/share sheet).

**Rule:** the output must end up as an `.mp4` (H.264) file with a `video/mp4` MIME
type at *every* layer. Instagram Messenger / WhatsApp / iMessage reject WebM (VP8/VP9).

**Why:** WebM was the original default. Users got an error trying to send the
downloaded video on Instagram — the container/codec was unsupported, not the app.

**How to apply — keep these consistent, they're in two different repos/files:**
- Web (`RunVideoShare.tsx`): `MediaRecorder` picks the first supported mime from an
  MP4-first candidate list (`video/mp4;codecs=avc1.42E01E` → `h264` → `mp4` → webm…),
  and sets the `Blob` type **and** the download filename extension to match.
- Android (`RunVideoScreen.kt`): the share `Intent` `type` and the `MediaScanner`
  MIME must NOT be hardcoded to `video/webm` — derive from the saved file extension
  (`.mp4` → `video/mp4`). The JS bridge already forwards `blob.type` + `lnk.download`.

**Do NOT record with `MediaRecorder` MP4 as the primary path.** Android WebView's
MP4 muxer writes broken/missing duration metadata → players (and Instagram) show only
~3s even though all frames are present. Preview looks full-length; the file is the problem.

**Correct approach:** encode with **WebCodecs (`VideoEncoder` + `VideoFrame`) → `mp4-muxer`**
(`fastStart:'in-memory'`, codec `avc1.42E029` H.264 Baseline L4.1). Stamp each frame with an
explicit `timestamp` (µs) in the rAF loop, throttle to ~30fps, keyframe periodically, then
`await encoder.flush()` → `muxer.finalize()` → Blob(`video/mp4`). This yields correct duration.
Keep `MediaRecorder` only as a last-resort fallback for WebViews without WebCodecs.
**Why:** explicit per-frame timestamps + a real (non-fragmented) moov are what fix the duration.

**Do NOT gate WebCodecs on `isConfigSupported()` alone — it LIES on some Android WebViews**
(returns `supported:true`, then real encoding yields zero frames / async encoder error → the
share dead-ends with "Recording failed"). Gate on a **real runtime self-test**: at mount,
actually `encode()` + `await flush()` one `VideoFrame` at the true output resolution
(1080×1920), walking a codec ladder (`avc1.42E029`→`42E028`→`42001F`→`4D0029`→`640029`), and
only enable WebCodecs if a chunk truly comes out; store the proven codec and use it for the real
recording. Disable the Record button until the probe finishes (else a fast tap skips WebCodecs).
Because on-device client `console.error` is invisible, surface the actual failure reason in the
UI (encoder/frame/finalize message + frame count) so device-only bugs are diagnosable.
**Why:** WebView WebCodecs capability reporting is unreliable; a real encode is the only proof.

**mp4-muxer needs `decoderConfig.description` — some Android WebView encoders never emit it.**
Symptom: hundreds of frames encode fine, then `muxer.finalize()` throws "cannot read properties
of null (reading 'colorSpace')". Cause: mp4-muxer only sets `track.info.decoderConfig` when a
chunk's metadata carries `decoderConfig` (the avcC / SPS+PPS "description"); if the encoder emits
Annex-B chunks with no description, decoderConfig stays null and finalize crashes reading it.
**Fix:** pass `avc: { format: "avc" }` to `encoder.configure()` (forces AVCC + description), AND
make the mount self-test require BOTH a chunk *and* `meta.decoderConfig.description` before
enabling WebCodecs — otherwise fall back to MediaRecorder instead of dead-ending at finalize.
**Why:** WebCodecs default format can be Annex-B on some devices; the description is mandatory for
a valid MP4 moov, so proving it's emitted (not just that frames come out) is what prevents the crash.

**Self-test can PASS yet real encode still crash at finalize — flush emits the description, streaming doesn't.**
Even with `avc:{format:"avc"}` and the self-test gated on `decoderConfig.description`, some Android
WebViews emit the description only on a `flush()` of a single keyframe (the self-test), but during
continuous real-time encoding they hand back chunks with NO `decoderConfig`. So the self-test enables
WebCodecs (proving the encoder CAN emit it), yet every live chunk lacks it → muxer's decoderConfig stays
null → finalize crashes on `.colorSpace`. Tell: crash persists AND the MediaRecorder fallback note never
appears (self-test passed).
**Fix:** during the self-test, deep-copy the proven `decoderConfig` (codec/codedWidth/codedHeight +
`description` bytes, respecting byteOffset/byteLength) into a ref; in the real encoder's `output`
callback, if a live chunk arrives without `decoderConfig`, seed the FIRST chunk (a keyframe) with the
saved proven config before `muxer.addVideoChunk`. Safe because same codec+resolution → identical SPS/PPS,
and `format:"avc"` means the sample data is AVCC (consistent with the injected avcC description).
**Why:** the description is per-codec/resolution, not per-stream, so reusing the self-test's is valid and
guarantees the muxer always has a non-null decoderConfig regardless of streaming quirks.

**REAL ROOT CAUSE of the persistent finalize `colorSpace` crash: non-zero FIRST timestamp + mp4-muxer strict mode.**
The rAF loop stamps each frame `timestamp = (now - startTs)` µs, so the FIRST frame is ~16000µs, never 0.
mp4-muxer defaults to `firstTimestampBehavior:"strict"`, which THROWS if the first chunk's DTS≠0 — and
because that throw happens inside the async `VideoEncoder` output callback it's swallowed (invisible on
device). Result: NO samples and NO decoderConfig are ever stored, so `finalize()` crashes reading
`.colorSpace` off a null decoderConfig. The mount self-test passed only because its single frame used
`timestamp:0` exactly. Symptom that pinpoints this vs the description issue: crash still fires with
`seeded: yes` (our injected config "reached" addVideoChunk but the chunk was rejected before storage).
**Fix:** pass `firstTimestampBehavior:"offset"` to the `Muxer` (rebases all timestamps so the first is 0).
Keep the decoderConfig seeding too — they're complementary (offset lets chunks in; seeding covers encoders
that still omit the description). **Why:** timestamp validation runs BEFORE decoderConfig storage in
mp4-muxer's createSampleForTrack, so a first-timestamp throw silently defeats everything downstream.

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

**Known limitation:** older Android WebViews without MP4 `MediaRecorder` support fall
back to WebM (still broken on IG). Modern Chrome-based WebView records MP4 fine.

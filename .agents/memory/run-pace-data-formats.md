---
name: Run paceData format ambiguity
description: runs.pace_data jsonb holds 3 different shapes; any consumer must detect the shape before use
---
The `runs.pace_data` jsonb column stores one of THREE shapes depending on upload path:
1. Km splits: `[{km, pace: "6:27", paceSeconds}]`
2. Raw per-second samples: `[{time: elapsedSec, value: paceSecPerKm}]` (Garmin offline batch)
3. Flat `number[]` (phone watchPaceSeries, 1 sample/sec, sec/km)

**Why:** Treating raw samples as km splits once drew hundreds of km-marker circles on share images; conversely discarding them loses fine-grained pace colouring.

**How to apply:** Detect the shape via the first element (object with paceSeconds/pace = splits; object with time/value = samples; number = flat series). For route colouring, prefer per-point `speed` (m/s) embedded in gpsTrack points (Garmin runs), then samples, then splits — see computePointPaces in the share-image service, which mirrors the Android summary map's per-point colouring.

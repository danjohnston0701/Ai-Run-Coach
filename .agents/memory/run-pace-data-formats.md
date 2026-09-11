---
name: Run paceData format ambiguity
description: runs.pace_data jsonb holds 3 different shapes; any consumer must detect the shape before use
---
The `runs.pace_data` jsonb column stores one of THREE shapes depending on upload path:
1. Km splits: `[{km, pace: "6:27", paceSeconds}]`
2. Raw per-second samples: `[{time: elapsedSec, value: paceSecPerKm}]` (Garmin offline batch)
3. Flat `number[]` (phone watchPaceSeries, 1 sample/sec, sec/km)

GPS tracks and pace samples may also use incompatible time domains: GPS timestamps can be absolute milliseconds while flat pace samples are implicitly elapsed seconds (`0, 1, 2…`). Comparing those directly advances every GPS point to the final pace sample and produces a solid-colour route.

**Why:** Treating raw samples as km splits once drew hundreds of km-marker circles; aligning elapsed-second samples against absolute-millisecond GPS timestamps flattened an entire share route to one pace.

**How to apply:** Detect the shape via the first element. For route colouring, prefer per-point speed/pace, then derive ~50m buckets from GPS coordinates and timestamps (matching Android), then align samples only when time domains overlap; otherwise align by relative index. Use splits last.

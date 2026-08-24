# iOS GPS Distance Filter & Km-Split Audit Brief

Written 2026-08-24, following an Android investigation into a walk-session distance
over-count reported by a beta tester (Nino) on an Oppo/ColorOS phone: AiRunCoach reported
5.46km / Garmin reported 4.32km for the same walk. Root cause on Android: the GPS
teleport-rejection filter in `RunTrackingService.kt`'s `onNewLocation()` used a flat
40 km/h implied-speed cap with no activity-type awareness, so ~30 signal-reacquisition
"teleport" jumps (20-95m over 3-9s, implying 32-40 km/h — impossible for a walker, but
under the running-tuned cap) were accepted, inflating distance by ~1.5km. This also
caused downstream km-split corruption (splits 1-3 showed `pace: "0:00"`, `time: ~0`) because
the burst of jumped distance crossed multiple km boundaries within seconds.

Fixed on Android: the speed cap is now activity-aware (15 km/h for walks, 35 km/h for runs,
down from a flat 40). This brief documents what was found checking the equivalent iOS code
(`HomeScreens.swift`, the file containing `RunSessionViewModel`) for the same class of bug —
so whoever is next in the actual Xcode project can decide what, if anything, to port.

## 1. iOS's GPS-jump filter is structurally different, and better in one way, but has the
   same activity-awareness gap

`processNewLocation()` (~`HomeScreens.swift:2890`) does NOT use a flat km/h cap. Instead,
while "moving" (`location.speed >= stationarySpeedThreshold`, i.e. >= 0.5 m/s):

```swift
let speedProjectedDelta = location.speed * secondsSinceLast * 2.5
let accuracyBuffer = max(0, location.horizontalAccuracy) + max(0, last.horizontalAccuracy)
maxReasonableDelta = max(75.0, min(300.0, speedProjectedDelta + accuracyBuffer))
```

This scales the acceptance window off the *current fix's own reported speed*, which is a
smarter design in principle than a static cap. But:

- **No `isWalk`/`exerciseType` branch anywhere in this function.** Same conceptual gap as
  the Android bug — the acceptance window doesn't know it's looking at a walk vs a run.
- **The `max(75.0, ...)` floor is generous for a walk.** Even if `speedProjectedDelta`
  computes small (e.g. a low-but-still-"moving" speed reading), the floor still accepts up
  to 75m in a single point-to-point delta. A GPS artifact of the same shape Nino hit on
  Android (20-95m jump) would likely still clear this floor on iOS.
- **Self-referential risk**: the acceptance threshold is derived from `location.speed` on
  the *same* fix being evaluated. A degraded/noisy fix reporting a bogus high Doppler speed
  could validate its own oversized jump. Worth considering whether the threshold should be
  derived from the *previous accepted* speed/pace instead, or a rolling average, rather than
  the incoming point's own value.

**Recommendation**: add an `isWalk` (or `exerciseType`) branch to this filter — tighter
`speedProjectedDelta` multiplier and/or floor for walks, mirroring the Android fix's intent
(walking tops out ~7-8 km/h in the real world; 15 km/h was chosen there as generous headroom).
Exact numbers need iOS-side GPS-track validation before committing (see #2).

## 2. There's already an active, related iOS investigation — use it

Directly above the filter is a temp diagnostic-logging block (`distanceDebugLogURL`,
`startDistanceDebugLog()`, `logDistanceDebug()`) with this comment already in the code:

> Diagnoses reports of iOS phone-GPS distance running ~100m over Android/Garmin on the same
> route... Logs every accept/reject decision from processNewLocation()'s distance filter to
> a per-run JSON-lines file so the real speed/accuracy/delta pattern can be reviewed after a
> run without a tethered Xcode session.

That's a smaller-magnitude, but same-family, distance-drift symptom already flagged before
this brief existed. Before tuning thresholds blind: pull one of those `distance-debug-*.jsonl`
files (see the doc comment for the retrieval steps via Xcode's Devices & Simulators pane) and
check for the same signature found in Nino's Android GPS track — short gaps (3-9s) immediately
followed by an accepted delta of tens of meters at an implied speed well above the activity's
real pace. If that pattern is present, it's the same bug family and the walk-specific fix
above should resolve both.

## 3. Same structural km-split bug as Android (pre-fix)

`checkKmSplits()` (~`HomeScreens.swift:7909`):

```swift
let currentSplitIndex = Int(distanceMeters / splitFrequency)
let lastSplitIndex = Int(lastSplitDistance / splitFrequency)

if currentSplitIndex > lastSplitIndex && currentSplitIndex > 0 {
    // ... records ONE split, for currentSplitIndex, computed against lastSplitTime
```

Single `if`, not a loop. If `distanceMeters` ever jumps across more than one split boundary
between calls (the same failure mode as #1/#2), only the highest-index split gets recorded,
with `splitDuration = elapsedSeconds - lastSplitTime` potentially near-zero — the same
"0:00 pace" corruption Nino saw on Android. This was not fixed on Android either (the Android
fix addressed the root-cause distance inflation, not this structural gap) — flagging here so
it's tracked on both platforms, not fixed on neither.

**One thing iOS already does better than Android**: `pendingKmSplitCoachings` is a real
`Array` (`.append` / `.removeFirst()`), not Android's single nullable field. Android's
equivalent (`pendingKmSplitCoaching: KmSplit?`) can have a later split silently overwrite an
earlier cooldown-deferred one before it retries — which is the likely cause of Nino hearing
"Km 6" announced before "Km 3". iOS's FIFO queue shouldn't reproduce that specific symptom,
even if the underlying split-skipping issue above still needs the same "loop instead of single
if" fix eventually.

## 4. Settings text — no action needed, iOS is already correct

`CoachingPromptsSettingsScreen.swift` / `CoachSettingsScreen.swift` (~line 181-184 / 470-473)
already branch the "500m Check-In" description on `isWalkDefault`:
`"...into your session"` vs `"...into your run"`. Android had a hardcoded "...into your run"
regardless of activity type until this same investigation (now fixed to neutral "500 metres
in"). No iOS change needed here.

## 5. Minor parity gaps noticed in passing (not part of this investigation, worth a decision)

- The two iOS split-interval selectors disagree with each other:
  `CoachingPromptsSettingsScreen.swift:25` → `[1, 2, 5]`, `CoachSettingsScreen.swift:47` →
  `[1, 2, 5, 10]`. Neither matches Android's `[1, 2, 3, 5, 10]` in
  `CoachSettingsViewModel.kt:81`. Worth reconciling to one canonical list across all three
  screens (two iOS + one Android) — not urgent, just inconsistent.
- Android's `checkForKmSplit()` auto-overrides to a 500m cadence for free walks
  (`currentActivityType == "walk" && !isCoachingPlanActive`), independent of the configured
  km-interval setting. iOS's `checkKmSplits()` has no equivalent — a walk on iOS just uses
  whatever `kmSplitIntervalKm` is configured (default 1km). Whether iOS walks should get the
  same automatic 500m cadence is a product call, not something this brief is recommending
  unilaterally — flagging so it's a deliberate decision rather than an accidental gap.

## 6. OEM background-restriction whitelisting (Oppo/ColorOS) does not apply to iOS

Apple's platform doesn't permit the OEM-layered background-killer behavior ColorOS/MIUI/etc.
have on Android, so there's no iOS equivalent of the new `OemBatteryHelper` /
`ColorOSSetupScreen` work needed. iOS's existing `evaluateDataQuality()`
(`HomeScreens.swift:2830`) already covers the platform-appropriate version of "why is my
tracking degraded" — Low Power Mode, Precise Location (reduced accuracy), and
`authorizedAlways` vs `authorizedWhenInUse` — and looks adequate as-is. No gap found.

# iOS brief: session-type picker and one-off AI sessions (2026-11-15)

Android and the server have both features built; nothing on iOS yet. Port line for line, then
build-verify with `xcodebuild` (see CLAUDE.md). Android files are named on each item.

## 1. Session-type picker on the run setup screen (the runner runs it themselves)

**What changed on Android**
- The RUN / WALK toggle is now a "Session Type" picker (`ui/components/SessionTypePicker.kt`,
  catalogue in `domain/model/SessionTypes.kt`). Options and keys (= `planned_workouts.workout_type`
  vocabulary, saved as `runs.workout_type`):
  - Free: Free Run (`null`), Free Walk (`null`, activity walk) — identical to the old toggle.
  - Steady: `easy`, `long_run`, `tempo`, `threshold`, `recovery`, `race_pace`.
  - Reps: `intervals`, `hill_repeats`, `fartlek`, `walk_run`.
  - Race day: `race` (run), `walk_race` (walk).
- Rep types hide the target distance and time cards and send no distance/time goal
  (`RunSetupConfig.withChosenSession`). Group runs only offer the Free types.
- Rep types show an optional **Configure session** card: reps, work (time or distance), recovery
  (time or distance), warm-up and cool-down minutes. Off by default.

**In-run coaching rules** (`RunTrackingService`)
- `coachingWorkoutType` = plan type, else the picked type, **except race-day picks** (sent as no
  type, so they're coached as a race: goal pace, finish ETA). It replaces `planWorkoutType` in the
  four AI coaching requests. The saved run uses the picked type including race (`savedWorkoutType`).
- `isSelfManagedRepSession` = no coaching plan loaded and the pick is a rep type. When true:
  no km-split callout (the split is still recorded), no pace coaching, no struggle cues, no
  25/50/75 % or 500 m check-ins, no phase-change cue, no inferred target distance, no split
  lockout, and elite coaching skips target-ETA and pace-trend.
  Since 2026-11-19 the opening lockout doesn't wait for the 500 m check-in either (it never
  plays in these sessions, so before that it muted the HR/form/encouragement cues all session). HR timer, cadence/technique and
  positive reinforcement stay on.
- **Configure session** builds a local plan on the phone (`domain/model/SelfConfiguredSessionPlan.kt`):
  phases warm-up → work×N / recovery×N (walk-run: `jog` / `walk`) → cool-down, plus triggers:
  warm-up/cool-down `phase_start`, `hr_zone_high` on `hr > targetHRMax` (only when age is known;
  zone tops from Tanaka max HR: work = max, recovery = 70 % or 80 %), a 240 s `periodic` form
  check, and `session_complete` on `elapsed_min >= total` (all timed) or `distance >= total` (all
  distance). `sessionGoal = "self_configured"` marks it; the service treats it as a free run for
  config recovery. It's passed as the normal dynamic coaching plan, so the existing phase engine
  calls each rep through the live coach. Unit-tested in `app/src/test/.../domain/SessionTypesTest.kt`.

**Run naming**: `race` → "Race Day", `walk_race` → "Walk Race Day" added to Android
`RunNaming.kt` and server `run-derivation.ts`. Add the same two entries to iOS `RunNaming.swift`.

## 2. One-off AI-designed sessions

**Server** (`server/routes-single-sessions.ts`, live after the redeploy)
- `POST /api/single-sessions` `{ workoutType, durationMinutes? | distanceKm?, notes? }` →
  `201 { workout, planId, name, todayPlanSession }`. `workoutType` must be one of the AI types
  (steady + reps + `walk`; not race days). 10–300 min or 1–60 km. Takes ~20–40 s (design + enrichment).
  Errors: `400 invalid_workout_type|missing_length`, `402 trial_expired`, `403 ai_plans_not_included`,
  `429 monthly_limit_reached` — each with a `message` to show as-is.
- `GET /api/single-sessions` → `[{ workout, planId, name, createdAt }]`, newest first.
- `DELETE /api/single-sessions/:workoutId` → soft delete (runs keep their link).
- `GET /api/features/singleSessionsGenerated/available` → allowance (same shape as plans).
- `workout` has exactly the plan-session workout shape, so the existing workout detail screen and
  `POST /api/workouts/:id/prepare-coaching` work on it unchanged.

**Android UI**
- Coaching Programme: 4th tab **Sessions** (`SingleSessionsTab`), and the + button offers
  "Full training plan" / "Single session" (on the Sessions tab it goes straight to the session).
- `CreateSingleSessionScreen`: type picker (AI types), Time / Distance length, optional notes,
  "N of M AI sessions left this month", Design → spinner → opens the normal workout detail with
  `WorkoutPlanContext(planId, goalType = "single_session", 1, 1)`.
- Allowance: Lite 5 / Standard 15 a month, 4 for the whole free trial (since 2026-11-18), 0 on the no-AI-plan SKUs
  (`server/tier-limits.ts`), spent when the session is designed.

## 3. "You have a plan session today" (both features)

- `GET /api/plan-sessions/open-today?date=YYYY-MM-DD` → `{ date, workout | null, planId, goalType, weekNumber, totalWeeks }`.
- Android asks before a **typed** setup-screen session starts (not Free Run / Free Walk) and before a
  **one-off AI session** starts (`WorkoutDetailScreen`, only when `planContext.goalType == "single_session"`).
  Dialog: "Count it as done" / "Leave it open" / Cancel (`PlanSessionChoiceDialog`). The check
  times out after 4 s and never blocks the run.
- The answer goes on the run upload as `planSessionChoice: "count" | "leave_open"` (also through the
  offline sync queue). Server stores it in `runs.plan_session_choice` and `plan-run-sync.ts` honours
  it on every save path: `count` completes today's plan session too (a one-off run stays linked to
  its one-off, the plan session records it as its completing run); `leave_open` skips all automatic
  plan matching for that run, orientation included.

## iOS checklist
- [x] `SessionTypes.swift` catalogue + picker replacing the run/walk toggle; hide distance/time for reps; free types only for group runs (2026-11-19).
- [x] Configure-session card + local plan builder, line-for-line with `SelfConfiguredSessionPlan.kt` (2026-11-19, `SessionTypes.swift`).
- [x] Self-managed rep gates in `RunSessionViewModel` mirroring the list above; race picks not sent as a type (2026-11-19: `isSelfManagedRepSession`, `coachingWorkoutType`, `savedWorkoutType`, `configureChosenSession`).
- [x] `planSessionChoice` on the run upload (phone, offline queue, crash recovery, Apple Watch mirror) + open-today check and dialog for one-off sessions (2026-11-19, `WorkoutDetailScreen.withPlanSessionCheck`, models in `SingleSessionScreens.swift`).
- [x] Same check for typed setup-screen runs (2026-11-19, `RunSetupScreen.withPlanSessionCheck`).
- [x] Sessions tab, + menu, create screen, list/delete, open in the workout detail screen (2026-11-18, `SingleSessionScreens.swift`).
- [x] `RunNaming.swift`: `race` / `walk_race` names.

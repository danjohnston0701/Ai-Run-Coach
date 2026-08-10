# iOS brief: walk/run activity-type audit (backend + Android parity work)

## Context

For months, walk sessions on Android/Garmin have intermittently gotten running-themed AI coaching ("enjoy the run", runner vocabulary mid-walk, running-specific technique cues on a walk). Root cause, confirmed by reading `server/ai-service.ts` end to end: the backend's ~30 coaching-prompt functions each independently derived "is this a walk?" from inconsistent request fields (`activityType` in some, `sessionType` in others, sometimes both with no fallback), with no shared vocabulary — so every time a new coaching trigger was added, whoever wrote it had to remember to re-invent the walk/run branch, and often didn't.

This document is the backend-side fix, so the Xcode agent can (a) confirm iOS already meets the request contract described below, and (b) independently audit the iOS coaching call sites and any client-side fallback/prompt text for the same failure pattern — rather than assume server-side history means iOS is fine. Assume nothing is inherited; verify each item below against the actual iOS source.

## What changed on the backend

Three new files in `server/`:

- **`coaching-activity.ts`** — single source of truth. `resolveActivityType(body)` reads `body.activityType` (preferred) with `body.sessionType` as a legacy fallback; anything other than `"walk"` resolves to `"run"`. `activityVocab(type)` returns a structured vocabulary object (`person`, `personCap`, `actLabel`, `noun`, `coachLabel`, `prohibition`) instead of every function inventing its own `isWalkX ? 'walker' : 'runner'` locals.
- **`coaching-prompts-run.ts`** / **`coaching-prompts-walk.ts`** — the actual prompt templates for the highest-traffic coaching triggers, physically forked into separate files (not just a shared template with word-swap ternaries) so a run-only prompt change can never accidentally touch walk sessions, and vice versa. Covers: pace-update, struggle-coaching, phase-coaching (navigation-turn / live pace-coaching / phase+500m-checkin), interval-coaching, cadence-coaching (run's biomechanics-target coaching and walk's posture/rhythm coaching are treated as genuinely different content domains, not a word-swap of the same text), elevation-coaching, heart-rate-coaching, run-summary.

`ai-service.ts` itself is unchanged in its exported function signatures — every route handler and caller still works the same way. Internally, each of the above functions now does `(isWalk ? walkPrompts : runPrompts).xPrompt(context)` instead of building one shared template with inline ternaries.

## `activityType` vs `sessionType` — this is a real two-layer distinction, not a rename

The DB schema (`shared/schema.ts`) and everything that writes a persisted run record use `sessionType` end to end: `runs.sessionType` (column `session_type`), `users.defaultSessionType`, `plannedWorkouts.sessionType`, and Android's own `UploadRunRequest.sessionType`. That contract is untouched by this work — do not rename anything there.

Separately, the *live, in-session coaching trigger* request bodies (pace-update, struggle-coaching, phase-coaching, etc.) predominantly use `activityType` — this predates this refactor; it was already the majority convention across 9 of 11 coaching endpoints before any of these changes, and matches Android's internal `currentActivityType` variable in `RunTrackingService.kt`. `resolveActivityType()` checks `activityType` first, `sessionType` second, purely to match what most of these endpoints already expected — it is not a statement that `sessionType` is deprecated.

**Do not rename iOS's existing `sessionType` usage in live-coaching call sites to `activityType`.** The resolver treats them identically, so either works, and this split is arguably a real, meaningful distinction worth keeping rather than collapsing: `sessionType` is the whole-session classification that gets persisted; `activityType` is what's happening in *this specific coaching moment*. Today those are always the same value for an entire session, but if this app ever supports a mixed session (e.g. a walking recovery phase inside a run-type interval workout — flagged as a future consideration during the backend review, not built yet), they would diverge: `sessionType = "run"` on the DB record, `activityType = "walk"` for that one trigger's wording. Keeping them separately named now avoids a second rename later.

**The actual bug to check for on iOS is a field being absent entirely** (this is what happened with Android's pace-update and struggle-coaching — the field wasn't in the request model at all, not that it had the "wrong" name) — not which of the two names is used.

## The request contract iOS needs to satisfy

Every `/api/coaching/*` endpoint that generates a live coaching message should include one of these two fields in its request body (see above for which one fits your existing code better):

```
activityType: "run" | "walk"
// or, equally valid:
sessionType: "run" | "walk"
```

Either field name works (see the section above) — what matters is that it's present and populated with the session's actual activity type on every one of these requests, not which name is used.

**Endpoints, and what was found on the Android side when audited (use this as the checklist for iOS — do not assume iOS already got this right just because Android eventually did):**

| Endpoint | Field the backend reads | Was it actually being sent? |
|---|---|---|
| `/api/coaching/pace-update` | `activityType` (resolver also checks `sessionType`) | **Android was NOT sending it at all** — `PaceUpdate.kt` had no such field. Added it. Check the iOS pace-update request model for the same gap. |
| `/api/coaching/struggle-coaching` | `activityType` (resolver also checks `sessionType`) | **Android was NOT sending it at all** — `StruggleUpdate.kt` had no such field. Added it. Check iOS. |
| `/api/coaching/talk-to-coach` | `context.activityType` | Android *was* sending it, but the server-side prompt builder (`buildCoachingSystemPrompt`) was silently never reading it — dead on arrival. Fixed server-side; no iOS action needed here, but worth confirming iOS's talk-to-coach request also includes `context.activityType`. |
| `/api/coaching/session-trigger-live` | `activityType` | Android was sending it correctly. |
| `/api/coaching/cadence-coaching` | `activityType` **or** `exercise_type === "WALKING"` **or** `cadence_role === "context_only"` | Three equivalent signals accepted (this matches the cross-platform `WALKING_COACHING_SPEC` naming iOS uses — see below). |
| `/api/coaching/elevation-coaching` | `activityType` | Android was sending it correctly. |
| `/api/coaching/elite-coaching` | `activityType` | Android was sending it correctly. |
| `/api/coaching/phase-coaching` | `activityType` | Android was sending it correctly. |
| `/api/coaching/interval-coaching` | `activityType` | Sent by `RunSessionViewModel.kt`, but this endpoint is **never actually called from `RunTrackingService.kt`** on Android — i.e. interval coaching may not be firing live during a run at all on Android. Worth checking whether iOS's interval-coaching call site is wired up correctly, since this looked like a pre-existing gap unrelated to walk/run. |
| `/api/coaching/hr-coaching` | `activityType` | Android was sending it correctly (this was the one endpoint with explicit server-side field extraction rather than an implicit spread — a good pattern to copy). |
| `/api/coaching/run-analysis` | `sessionType` | Server-authoritative — read from the DB's `runs.sessionType` column, not the client. No client action needed. |

## Cadence-coaching cross-platform contract (already partially exists — confirm iOS matches)

`generateCadenceCoaching` accepts three equivalent ways to signal a walk, matching what the code comments call `WALKING_COACHING_SPEC` parity between Android and iOS:

```
activityType: "walk"          // Android naming
exercise_type: "WALKING"      // iOS naming, per existing spec
cadence_role: "context_only"  // spec-canonical flag
```

When any of these is true, the backend takes a completely separate code path — not "same prompt, told not to mention cadence targets," but a different function entirely (`walkCadenceCoachingPrompt`) that never computes or mentions a numeric spm target at all. If iOS already implements `WALKING_COACHING_SPEC`, this should already work; just confirm the field name/values iOS actually sends match one of the three above exactly (case-sensitive).

## Bugs found and fixed server-side that have no iOS action required, but explain *why* this mattered

These were confirmed by an external review pass and are worth knowing about because they illustrate exactly the failure mode to check for on iOS — a function can look activity-aware at the top (a `isWalk` variable, a vocabulary swap) while a chunk of it further down stays unconditionally running-flavored:

1. **`getElevationCoaching`** — the four terrain branches for climbing/descending (`gradual_climb`, `steep_climb`, `gradual_descent`, `steep_descent`) were unconditionally injecting running-specific technique text regardless of activity type: *"keep cadence up (target 160-170 spm)"*, *"high cadence (175-185+)"*, *"shorten stride dramatically"*. This directly contradicted a walk-session prohibition stated elsewhere in the same prompt ("do NOT give spm/cadence targets"), so the model was receiving self-contradictory instructions. Fixed — walk sessions now get posture/effort cues with no numeric step targets.
2. **`generateWellnessAwarePreRunBriefing`** (the pre-run/pre-walk briefing generator) — the route-terrain gradient description was also unconditional: a walk pre-briefing on a hilly route would have said *"noticeable hill, shorten your stride and maintain effort."* Fixed. This function backs the `/api/coaching/pre-run-briefing-audio` / `/api/coaching/pre-walk-briefing-audio` split, which — if iOS has an equivalent shared briefing-prompt function feeding both a run and walk endpoint — is exactly the kind of place to check for the same "endpoint is split correctly, but the shared prompt-building code underneath still has unconditional running text" issue.

**The lesson for the iOS audit:** don't just check that a coaching call site sends `activityType` — check that *every* piece of text in the resulting prompt (not just the opening "you are a coach" line) is actually conditioned on it, including any technique/terrain/cadence sub-templates nested inside a larger prompt builder.

## What to actually do on the iOS side

1. **Grep the iOS coaching networking layer** for every request model backing an endpoint in the table above. Confirm each one has an `activityType` (or `sessionType`) field, and that it's actually populated from the session's activity type at the call site — not just declared and left nil/default.
2. **Grep for any place iOS independently decides walk-vs-run wording** — Swift-side prompt construction, cached/local fallback coaching strings (used when the network call fails or times out), watch complication text, notification text. If iOS has anything resembling Android's `RunTrackingService.kt` local fallback phrase banks (e.g. hardcoded "Let's go! You've got this." style arrays used when Polly TTS or the network call fails), audit those for the same running-vocabulary-leak pattern found in Android's `generateStartPromptByTone`/`fireStartCoachingFallback` (still open on the Android side as of this writing, tracked separately — not yet fixed, but the pattern to check for is: hardcoded phrase banks that never branch on activity type at all).
3. **If iOS has its own single-source-of-truth vocabulary helper already, use it as the model for consistency** — if not, consider a Swift equivalent of `coaching-activity.ts` (a single `resolveActivityType` + vocabulary struct) rather than ad-hoc `isWalk` checks scattered through the coaching layer, for the same reason it mattered on the backend: consistency is what prevents the next new feature from silently regressing.
4. **Fallback message audit** — for every coaching call site, check what iOS displays/speaks if the network call fails or times out. None of the current backend fallback strings contain literal "run"/"runner"/"running" (audited), but several are activity-neutral wording shared across both activities (e.g. "Keep it steady!") rather than activity-flavored — decide if that's acceptable for iOS's fallback layer too, or if it should match the backend's per-activity fallback split (already done for pace-update, struggle-coaching, cadence-coaching, run-summary; not done for phase-coaching, interval-coaching, HR-coaching, elevation-coaching, since those fallbacks are already activity-neutral rather than run-flavored).

## Explicitly out of scope for this pass (flagged, not fixed)

- Separating "factual data the AI interprets" from "prescribed behavioral directives" from "literal words the AI is told to produce" in prompt design — a real architectural question raised during review, but independent of the walk/run contamination issue and not attempted here.
- The distinction between **session activity type** (walk vs run for the whole session) and **current movement phase** (e.g. a walking recovery interval inside a run-type interval workout) — today's codebase derives interval-coaching's walk/run wording from the session-level `activityType` only; there is no "walking recovery inside a run session" mechanic yet. Worth keeping in mind if that feature is ever built, on either platform.
- `generateEliteCoaching`'s `technique_form` case unconditionally surfaces a raw `Current cadence: X spm` context line, and only redirects 3 of ~9 technique categories away from running-biomechanics framing for walk sessions; the rest pass through a `techniqueHint` string generated by Android's own technique-rotation system, which this audit could not verify from server code alone. **If iOS has an equivalent technique-hint rotation system, this is worth checking directly in the iOS source** — does it ever generate a running-worded hint (e.g. "drive your knees") for a walk session?

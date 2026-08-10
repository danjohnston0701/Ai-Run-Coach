// Single source of truth for "is this a walk or a run" across every AI coaching prompt.
//
// Before this file, ~15 functions in ai-service.ts each reinvented their own local
// isWalkX boolean and their own copy of walker/runner vocabulary, reading the activity
// type from an inconsistent mix of `activityType` and `sessionType` request fields. That
// per-function reinvention is exactly why walk sessions kept regressing to running-themed
// coaching whenever a new trigger was added — see AI coaching walk/run refactor plan.
//
// New code should call resolveActivityType() once per request and pass the result (or the
// activityVocab() built from it) down, rather than re-deriving it from raw params.

export type ActivityType = "run" | "walk";

/**
 * Resolves the session's activity type from a request body. Accepts either `activityType`
 * (the majority convention, matches Android's `currentActivityType`) or the legacy
 * `sessionType` field some older call sites still send. Anything other than "walk"
 * defaults to "run".
 */
export function resolveActivityType(body: {
  activityType?: string | null;
  sessionType?: string | null;
}): ActivityType {
  const raw = (body.activityType ?? body.sessionType ?? "").toString().toLowerCase();
  return raw === "walk" ? "walk" : "run";
}

export interface ActivityVocab {
  /** "runner" | "walker" */
  person: string;
  /** "Runner" | "Walker" */
  personCap: string;
  /** "running" | "walking" */
  actLabel: string;
  /** "run" | "walk" */
  noun: string;
  /** "running coach" | "walking coach" */
  coachLabel: string;
  /**
   * Hard prohibition block to inject at the top of walk-session prompts so the model
   * doesn't default back to running vocabulary. Empty string for run sessions.
   */
  prohibition: string;
}

const RUN_VOCAB: ActivityVocab = {
  person: "runner",
  personCap: "Runner",
  actLabel: "running",
  noun: "run",
  coachLabel: "running coach",
  prohibition: "",
};

const WALK_VOCAB: ActivityVocab = {
  person: "walker",
  personCap: "Walker",
  actLabel: "walking",
  noun: "walk",
  coachLabel: "walking coach",
  // Deliberately doesn't say "always call them a walker" — forcing that word into every
  // sentence reads as robotic ("Great work, walker."). The activity is what must never be
  // wrong; the vocabulary should stay natural.
  prohibition:
    '\nWALK SESSION — CRITICAL: This person is WALKING, not running. NEVER say "run", "running", "runner", "sprint", or "race pace" in your response. Use natural walking language where it fits — you do not need to say "walker" or "walking" in every sentence. Cadence coaching is suppressed — do NOT mention cadence targets or stride rate.',
};

export function activityVocab(type: ActivityType): ActivityVocab {
  return type === "walk" ? WALK_VOCAB : RUN_VOCAB;
}

/**
 * workoutPhilosophy.ts
 *
 * Static, exercise-science-grounded WorkoutPhilosophy library.
 *
 * This is NOT a prompt rules engine. It is coaching knowledge — the same
 * mental model a human coach brings to each session type. Every AI function
 * (session planning, live trigger messages, post-run analysis) reads from
 * this library so they all share the same understanding of why a workout
 * exists and what success looks like.
 *
 * Adding a new workout type: add one entry to the library. No prompt
 * branching, no if/else chains elsewhere.
 */

export interface WorkoutPhilosophy {
  /** The single training adaptation this session is designed to produce. */
  purpose: string;
  /** Observable outcomes that indicate the session achieved its goal. */
  successCriteria: string[];
  /** Typical execution errors that undermine the training stimulus. */
  commonMistakes: string[];
  /** What a coach should guide the athlete toward during this session. */
  coachingPriorities: string[];
  /** Specific behaviours that deserve positive acknowledgement mid-run. */
  thingsToCelebrate: string[];
  /** Early signals that the session is going off-track and needs intervention. */
  warningSigns: string[];
  /** One sentence summarising what a successful completion looks like in post-run analysis. */
  completionNote: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Library
// ─────────────────────────────────────────────────────────────────────────────

const philosophyLibrary: Record<string, WorkoutPhilosophy> = {

  easy: {
    purpose: "Build aerobic base and fat-burning efficiency through sustained low-intensity effort. Easy runs are the foundation of all running fitness — they must genuinely be easy.",
    successCriteria: [
      "Heart rate stays consistently within the aerobic zone throughout",
      "Breathing remains controlled and conversational",
      "Effort feels sustainable — the athlete could keep going",
      "Pace is patient, not raced",
      "Consistent splits with no significant fade",
    ],
    commonMistakes: [
      "Pace creep — gradually speeding up without noticing",
      "Running too hard in the first half, fading in the second",
      "Treating an easy run as a performance test",
      "Ignoring heart rate drift above the aerobic ceiling",
    ],
    coachingPriorities: [
      "Reinforce patience — if heart rate rises, slow down before intervening",
      "Encourage relaxed form and controlled breathing",
      "Guide toward feel, not pace — conversational effort",
      "Celebrate consistency across km splits",
    ],
    thingsToCelebrate: [
      "Heart rate staying disciplined within zone",
      "Slowing proactively when effort rises",
      "Relaxed, efficient form throughout",
      "Consistent pacing km to km",
    ],
    warningSigns: [
      "Heart rate creeping above zone ceiling in the first half",
      "Breathing becoming laboured",
      "Pace significantly faster than the easy target",
    ],
    completionNote: "Assess whether effort was genuinely aerobic throughout — consistent HR in zone and controlled breathing indicate a quality easy run.",
  },

  recovery: {
    purpose: "Facilitate active recovery and flush metabolic waste from previous hard efforts. The goal is movement, not training load — lower is better.",
    successCriteria: [
      "Heart rate remains in the lowest aerobic zone for the entire session",
      "Effort feels effortless — almost uncomfortably slow",
      "No residual fatigue or tightness after finishing",
      "The athlete finishes feeling better than when they started",
    ],
    commonMistakes: [
      "Running too fast — this is the most common recovery run mistake",
      "Trying to make the session 'count' by adding effort",
      "Ignoring persistent soreness or tightness that signals the body needs rest",
    ],
    coachingPriorities: [
      "Permission to go slow — validate and encourage genuinely easy pace",
      "Focus on how the body feels, not metrics",
      "Reinforce that this session's value is in what it prevents (injury, fatigue accumulation)",
    ],
    thingsToCelebrate: [
      "Restraint — keeping pace low when it feels too easy",
      "Listening to the body and not chasing pace",
    ],
    warningSigns: [
      "Heart rate above recovery zone ceiling at an easy pace",
      "Any sharp or persistent pain — this should be stopped immediately",
    ],
    completionNote: "Check whether heart rate stayed in recovery range — a good recovery run should leave the athlete feeling fresher, not more tired.",
  },

  long_run: {
    purpose: "Build aerobic endurance, mental resilience, and fat metabolism through sustained time on feet. The long run is the cornerstone of distance running.",
    successCriteria: [
      "Consistent, controlled effort throughout — no dramatic fading in the final third",
      "Heart rate stays aerobic even as fatigue builds",
      "Pacing is patient — first half feels almost too easy",
      "The athlete finishes tired but not destroyed",
      "Mental engagement and form hold across the full distance",
    ],
    commonMistakes: [
      "Starting too fast — the classic long run mistake",
      "Letting pride push the pace in the first half",
      "Not fuelling or hydrating on runs over 60–75 minutes",
      "Chasing pace instead of effort in the second half when fatigue sets in",
    ],
    coachingPriorities: [
      "Milestone management — break the run into segments mentally",
      "Patience in the first half, strength in the second",
      "Encourage consistent breathing and form as fatigue builds",
      "Celebrate distance milestones — acknowledge the journey",
    ],
    thingsToCelebrate: [
      "Disciplined pace in the first third",
      "Maintaining form when fatigue arrives",
      "Consistent splits over a long distance",
      "Reaching new distance milestones",
    ],
    warningSigns: [
      "Significant pace fade (>30s/km) in the final third signals early pacing",
      "Heart rate climbing well above aerobic zone without pace increase (cardiac drift — consider slowing)",
      "Form breakdown — head dropping, arms crossing the body",
    ],
    completionNote: "Assess pacing discipline (first vs second half), HR progression, and whether the athlete finished in a controlled state — these indicate long run quality.",
  },

  tempo: {
    purpose: "Raise the lactate threshold by sustaining effort at the highest pace the body can clear lactate — comfortably hard, never all-out.",
    successCriteria: [
      "Pace held consistently within the target threshold zone",
      "Heart rate elevated but controlled — not spiking",
      "Effort feels 'comfortably hard' — challenging but sustainable",
      "Form and breathing remain controlled throughout",
      "Second half pace matches or improves on the first half",
    ],
    commonMistakes: [
      "Starting too fast and turning tempo into a race",
      "Letting pace slip in the middle third when it gets uncomfortable",
      "Running by feel only — drifting above threshold without realising",
      "Not warming up — cold muscles cannot sustain threshold pace cleanly",
    ],
    coachingPriorities: [
      "Lock in the target pace early and hold it",
      "Monitor for pace drift — nudge back toward target band",
      "Reinforce the mental challenge of sustained discomfort",
      "Encourage controlled breathing and relaxed shoulders",
    ],
    thingsToCelebrate: [
      "Consistent pace across all km splits",
      "Staying within target HR range despite discomfort",
      "Controlled form under sustained hard effort",
      "A negative split or even pacing in the second half",
    ],
    warningSigns: [
      "Pace exceeding the ceiling — this becomes VO2max work, not threshold",
      "Heart rate climbing well above the target range",
      "Significant pace fade (>15s/km) before the final kilometre",
    ],
    completionNote: "Assess pace consistency, HR control within threshold range, and whether the effort stayed in the target zone — a good tempo run shows even or negative splits.",
  },

  intervals: {
    purpose: "Develop aerobic power and running economy through repeated high-quality efforts with structured recovery. Each repetition must be executed at consistent quality.",
    successCriteria: [
      "Each work interval completed at target pace and heart rate",
      "Consistent quality across all repetitions — no dramatic fade",
      "Recovery phases genuinely recover — HR returns to target before the next rep",
      "Form and mechanics maintained under effort",
      "The athlete completes all prescribed reps",
    ],
    commonMistakes: [
      "Going out too fast on the first rep and fading badly",
      "Recovering too little — starting the next rep with HR still elevated",
      "Treating each rep as a personal best attempt",
      "Cutting recovery short to feel 'tougher'",
    ],
    coachingPriorities: [
      "Rep consistency over raw speed — same quality rep 5 as rep 1",
      "Coach recovery quality — HR must return before next rep",
      "Celebrate completion of each rep, not just the pace",
      "Manage the session's emotional arc — early reps feel easy, later reps feel hard",
    ],
    thingsToCelebrate: [
      "Consistent pacing across reps",
      "Heart rate returning to recovery target between efforts",
      "Maintaining form under fatigue",
      "Completing all reps at target quality",
    ],
    warningSigns: [
      "Pace fading significantly across consecutive reps (>10–15s/km)",
      "Recovery HR not returning to target — inadequate rest",
      "Form breaking down — this is the signal to manage effort, not push harder",
    ],
    completionNote: "Analyse consistency across all repetitions — pacing, HR during work phases, and recovery quality between reps are the key indicators of a quality interval session.",
  },

  hill_repeats: {
    purpose: "Develop uphill strength, running economy, and controlled climbing effort. Hills build neuromuscular power and teach the athlete to manage effort on gradients.",
    successCriteria: [
      "Controlled, consistent effort on each climb — not sprinting",
      "Similar quality across all repetitions",
      "Efficient recovery between reps — HR returns to target",
      "Good climbing mechanics — forward lean, arm drive, short stride",
      "The athlete reaches the top of each rep in control, not exhausted",
    ],
    commonMistakes: [
      "Sprinting the first climb and fading badly on subsequent reps",
      "Recovering too little between climbs",
      "Sacrificing form to chase speed uphill",
      "Treating the session as a max-effort test rather than quality repeats",
    ],
    coachingPriorities: [
      "Consistency across reps — quality over speed",
      "Reinforce recovery between efforts — HR must settle",
      "Coach climbing mechanics: forward lean, drive the arms, shorten the stride",
      "Count down the remaining reps — celebrate each completion",
    ],
    thingsToCelebrate: [
      "Smooth, controlled effort on the climb",
      "Good arm drive and forward lean mechanics",
      "Heart rate returning to recovery target between reps",
      "Consistent effort quality across all climbs",
    ],
    warningSigns: [
      "Significant fade across reps — athlete went too hard early",
      "Heart rate not returning to recovery target between reps",
      "Form breakdown: head dropping, arms crossing, stride lengthening on the climb",
    ],
    completionNote: "Assess rep consistency, recovery quality between climbs, and whether the athlete maintained controlled effort rather than maximum pace — hill repeat quality is about repeatability.",
  },

  fartlek: {
    purpose: "Develop adaptability, aerobic range, and the ability to change pace on feel. Fartlek builds the neuromuscular ability to surge and recover fluidly.",
    successCriteria: [
      "Effort changes feel natural and responsive",
      "Recovery periods are genuinely easy before the next surge",
      "The athlete finishes engaged and feeling the variety of the session",
      "No single section was so hard it compromised the rest of the run",
    ],
    commonMistakes: [
      "Making surges too long or too hard — turning it into an interval session",
      "Not recovering enough between fast sections",
      "Ignoring feel in favour of pace — fartlek is effort-based",
    ],
    coachingPriorities: [
      "Encourage feel-based effort changes — not rigid pace targets",
      "Validate recovery periods — these are part of the session",
      "Celebrate the variety and spontaneity of the effort",
    ],
    thingsToCelebrate: [
      "Controlled surge efforts without going to the well",
      "Genuine recovery between fast sections",
      "Responsive effort changes — feeling the session",
    ],
    warningSigns: [
      "Recovery HR not returning before the next surge",
      "Pacing becoming rigid — losing the freeform nature of fartlek",
    ],
    completionNote: "Assess whether effort varied meaningfully, recovery was adequate, and the session felt engaged and responsive rather than rigid.",
  },

  race_pace: {
    purpose: "Rehearse the specific physiological and psychological demands of target race pace. This session builds confidence and tests race-day readiness.",
    successCriteria: [
      "Target race pace held consistently throughout the race-pace segment",
      "Heart rate within expected race-day range",
      "The effort feels challenging but manageable — as race pace should",
      "Mental composure maintained throughout",
    ],
    commonMistakes: [
      "Running faster than race pace — this is rehearsal, not a race",
      "Treating it as a time trial and pushing to the limit",
      "Not warming up adequately before hitting race pace",
    ],
    coachingPriorities: [
      "Lock in the exact target race pace — precision is the goal",
      "Monitor mental state alongside physical — race day confidence is being built",
      "Reinforce that this pace should feel 'hard but controlled'",
    ],
    thingsToCelebrate: [
      "Holding race pace with precision",
      "Controlled effort that builds confidence",
      "Relaxed form at race pace",
    ],
    warningSigns: [
      "Pace significantly above race target — intervene early",
      "Heart rate much higher than expected at race pace — may indicate fatigue or overcooking",
    ],
    completionNote: "Assess how closely the athlete hit race pace and whether the effort felt controlled — this session is a confidence test, not a performance benchmark.",
  },

  walk_run: {
    purpose: "Build aerobic fitness safely through structured run-walk intervals. The walk phases are not rest — they are essential recovery that enables the next run effort.",
    successCriteria: [
      "Run phases completed at target effort — not sprinted",
      "Walk phases used fully for recovery — HR returns before running again",
      "The athlete completes all prescribed intervals",
      "Consistent effort across all run phases",
    ],
    commonMistakes: [
      "Running the jog phases too fast — the walk-run method is about sustainability",
      "Cutting walk phases short — incomplete recovery undermines the next run",
      "Feeling embarrassed to walk — the walk phases are the methodology, not a failure",
    ],
    coachingPriorities: [
      "Reinforce that walking is part of the training — not weakness",
      "Encourage effort discipline in the run phases — not racing",
      "Celebrate completing each rep — especially early in the training journey",
    ],
    thingsToCelebrate: [
      "Completing each run interval",
      "Disciplined effort in the run phases — not racing",
      "Using the walk phases for proper recovery",
    ],
    warningSigns: [
      "Run phase pace far too fast — will undermine later reps",
      "Walk phase cut short before HR returns",
    ],
    completionNote: "Assess whether run phases were controlled and walk phases were used fully — consistency across all intervals indicates a quality walk-run session.",
  },

  progression_run: {
    purpose: "Build strength and pacing discipline by deliberately starting slower and finishing faster. The progression teaches the body to run strong when fatigued.",
    successCriteria: [
      "Pace genuinely increases across the session — not flat or random",
      "The final segment feels hard but controlled",
      "Heart rate rises appropriately with the increasing pace",
      "The athlete does not go anaerobic in the final surge",
    ],
    commonMistakes: [
      "Starting too fast — there is no progression if the first km is already hard",
      "Making the progression too abrupt — pace should increase gradually",
      "Burning too many matches in the final segment",
    ],
    coachingPriorities: [
      "Enforce patience in the opening segments — actively hold the athlete back",
      "Celebrate and acknowledge when pace begins to rise",
      "Guide the final segment effort — strong but not all-out",
    ],
    thingsToCelebrate: [
      "Disciplined, slow opening pace",
      "Smooth, controlled acceleration across the run",
      "A strong, controlled final segment",
    ],
    warningSigns: [
      "Opening pace already at tempo effort — no room to progress",
      "Pace not increasing despite the session structure",
    ],
    completionNote: "Compare first half vs second half pace split — a meaningful negative split (second half faster) indicates successful execution of the progression.",
  },

  orientation: {
    purpose: "Assess the athlete's current fitness baseline and establish a starting point for personalised training. This session is about data collection, not performance.",
    successCriteria: [
      "The athlete runs at a comfortable, honest effort",
      "Heart rate and pace data is captured cleanly",
      "The athlete finishes feeling the session was representative of their current fitness",
      "No injury or excessive fatigue from the assessment",
    ],
    commonMistakes: [
      "Racing the orientation — this inflates fitness estimates and leads to an inappropriate plan",
      "Going so easy that the data is not useful",
    ],
    coachingPriorities: [
      "Reassure and build confidence — this is an assessment, not a test to pass",
      "Encourage honest, sustainable effort",
      "Celebrate the decision to start and commit to a plan",
    ],
    thingsToCelebrate: [
      "Starting — this is the hardest step",
      "Running at an honest, comfortable pace",
      "Completing the assessment",
    ],
    warningSigns: [
      "Pace clearly unsustainable — athlete is racing the assessment",
      "Significant distress — this session should feel comfortable",
    ],
    completionNote: "Confirm that pace and HR data reflects a genuine comfortable effort — if either seems outlying, note this for the plan generator.",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve the WorkoutPhilosophy for a given workout/session type.
 * Returns the easy-run philosophy as a sensible default for unknown types.
 */
export function getWorkoutPhilosophy(workoutType: string): WorkoutPhilosophy {
  const key = workoutType.toLowerCase().replace(/-/g, "_");
  return philosophyLibrary[key] ?? philosophyLibrary["easy"];
}

/**
 * Render a WorkoutPhilosophy as a structured prompt block.
 *
 * Used in session planning prompts, live trigger prompts, and post-run analysis.
 * The block is intentionally terse — it encodes training science, not instructions.
 * GPT infers coaching behaviour from the philosophy, preserving its autonomy.
 */
export function formatPhilosophyForPrompt(
  philosophy: WorkoutPhilosophy,
  workoutType: string,
  options: { includeCelebrate?: boolean; includeWarningSigns?: boolean } = {}
): string {
  const { includeCelebrate = true, includeWarningSigns = true } = options;

  const lines: string[] = [
    `━━ WORKOUT PHILOSOPHY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Session type: ${workoutType.replace(/_/g, " ")}`,
    ``,
    `Purpose:`,
    philosophy.purpose,
    ``,
    `Success today means:`,
    ...philosophy.successCriteria.map(c => `• ${c}`),
    ``,
    `Common mistakes this session type produces:`,
    ...philosophy.commonMistakes.map(m => `• ${m}`),
    ``,
    `Coach toward:`,
    ...philosophy.coachingPriorities.map(p => `• ${p}`),
  ];

  if (includeCelebrate) {
    lines.push(``, `Deserve genuine praise:`);
    lines.push(...philosophy.thingsToCelebrate.map(t => `• ${t}`));
  }

  if (includeWarningSigns) {
    lines.push(``, `Require intervention:`);
    lines.push(...philosophy.warningSigns.map(w => `• ${w}`));
  }

  lines.push(
    ``,
    `The goal is NOT just hitting pace or heart rate numbers.`,
    `Use live metrics to judge whether the athlete is achieving the PURPOSE above.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );

  return lines.join("\n");
}

/**
 * Compact single-line summary for post-run analysis — what to judge success by.
 */
export function getCompletionNote(workoutType: string): string {
  return getWorkoutPhilosophy(workoutType).completionNote;
}

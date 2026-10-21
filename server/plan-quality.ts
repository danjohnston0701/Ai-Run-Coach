// ─────────────────────────────────────────────────────────────────────────────
// PLAN QUALITY — deterministic starting point, load rules, and repair for AI plans
//
// The model writes the plan; this module decides what the athlete can actually do
// today and holds the plan to it. Three paying customers' plans had to be fixed by
// hand (2026-10) because the generator invented a 20 km/week baseline for anyone
// with no run history, only checked progression for novices, and ignored the one
// real effort it had. Julie (Regular, one 5 km run at ~6:40/km) got walk-run
// sessions AND 9–11 km long runs in weeks 1–2.
//
// Flow (block 1 and every later block, all fitness levels):
//   1. Starting point: weekly volume, longest continuous run, easy pace — from run
//      history when there is enough, from the athlete's own fitness level otherwise.
//   2. buildLoadRulesPrompt() states the numbers to the model as mandatory rules.
//   3. findLoadViolations() checks the output; violations go back to the model.
//   4. repairPlanLoad() fixes whatever is still wrong, so a bad plan never ships.
// Novice / injured athletes keep their stricter time-based rules
// (findProgressionViolations in training-plan-service.ts) on top of this.
// ─────────────────────────────────────────────────────────────────────────────

export interface LevelBaseline {
  weeklyKm: number;
  longestRunMin: number;
  easyPaceSecs: number; // s/km
}

// What each fitness level means in the apps' own words (FitnessLevelViewModel.kt):
// "Regular — Running 2–3 times a week, comfortable at 5–10 km", etc. Conservative
// end of each description: a plan that starts slightly easy self-corrects; one that
// starts too hard injures people.
const LEVEL_BASELINES: Record<string, LevelBaseline> = {
  newcomer:     { weeklyKm: 0,  longestRunMin: 2,   easyPaceSecs: 600 },
  beginner:     { weeklyKm: 5,  longestRunMin: 20,  easyPaceSecs: 540 },
  novice:       { weeklyKm: 5,  longestRunMin: 20,  easyPaceSecs: 540 },
  casual:       { weeklyKm: 8,  longestRunMin: 30,  easyPaceSecs: 480 },
  regular:      { weeklyKm: 15, longestRunMin: 45,  easyPaceSecs: 450 },
  intermediate: { weeklyKm: 15, longestRunMin: 45,  easyPaceSecs: 450 },
  committed:    { weeklyKm: 20, longestRunMin: 60,  easyPaceSecs: 405 },
  competitive:  { weeklyKm: 30, longestRunMin: 75,  easyPaceSecs: 360 },
  advanced:     { weeklyKm: 45, longestRunMin: 100, easyPaceSecs: 330 },
  elite:        { weeklyKm: 70, longestRunMin: 120, easyPaceSecs: 285 },
  professional: { weeklyKm: 90, longestRunMin: 130, easyPaceSecs: 270 },
};

// Longest single session allowed relative to the goal distance. Long runs past race distance
// are normal for a runner who can already cover it (they build the aerobic engine a faster
// 5K/10K needs), but there's a ceiling: twice the race at most, less for newer runners.
// Novices on a completion goal are held to the goal distance itself (buildProgressionSafetyRules).
const LONG_RUN_GOAL_FACTOR: Record<string, number> = {
  newcomer: 1.0, beginner: 1.0, novice: 1.0, casual: 1.4,
  regular: 1.8, intermediate: 1.8, committed: 1.8,
  competitive: 2.0, advanced: 2.0, elite: 2.0, professional: 2.0,
};

export function longRunCeilingKm(goalKm: number | null | undefined, level?: string | null): number | undefined {
  if (!goalKm || goalKm <= 0) return undefined;
  const factor = LONG_RUN_GOAL_FACTOR[String(level ?? "").trim().toLowerCase()] ?? 1.8;
  return Math.round(goalKm * factor * 2) / 2;
}

const goalLabel = (km: number) => (Number.isInteger(km) ? `${km}K` : `${km} km`);

/**
 * A runner who picked a 5K plan and sees a 7 km session reasonably assumes the app got it
 * wrong. Say why on every session longer than the goal distance.
 */
export function explainLongerThanGoal(weeks: any[], goalKm: number | null | undefined, easyPaceSecs: number): void {
  if (!goalKm || goalKm <= 0 || goalKm > 21.1) return;
  const note = `Longer than your ${goalLabel(goalKm)} on purpose: these slow, easy kilometres build the aerobic engine that lets you hold a faster pace for the whole ${goalLabel(goalKm)}.`;
  for (const week of weeks) {
    for (const wo of week.workouts ?? []) {
      if (classifySession(wo.workoutType, wo.effortLabel) !== "long") continue;
      if (sessionKm(wo, easyPaceSecs) <= goalKm + 0.25) continue;
      const text = String(wo.instructions ?? "").trim();
      if (text.includes("on purpose")) continue;
      wo.instructions = text ? `${text} ${note}` : note;
    }
  }
}

export function levelBaseline(level?: string | null): LevelBaseline {
  return LEVEL_BASELINES[String(level ?? "").trim().toLowerCase()] ?? LEVEL_BASELINES.regular;
}

// ── Performance anchor ──────────────────────────────────────────────────────

export interface PaceBand { min: number; max: number } // s/km, min = faster

export interface PaceAnchor {
  sourceKm: number;
  sourceSecs: number;
  sourceDate: Date | null;
  est5kSecs: number;
  easy: PaceBand;
  recovery: PaceBand;
  tempo: PaceBand;
  interval: PaceBand;
  /** Run segments of a walk-run session: around the runner's whole-session pace. */
  walkRun: PaceBand;
}

export interface AnchorRun {
  distance: number | null;
  duration: number | null;
  movingTime?: number | null;
  completedAt?: Date | string | null;
}

export const fmtPace = (secs: number): string => {
  const s = Math.round(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const fmtDuration = (secs: number): string => {
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

/** runs.distance is km (legacy rows > 200 are metres). */
export const anchorRunKm = (r: AnchorRun): number | null =>
  r.distance ? (r.distance > 200 ? r.distance / 1000 : r.distance) : null;

/** Running time in seconds: moving time when it's plausible, else duration (legacy ms rows > 100000). */
export const anchorRunSecs = (r: AnchorRun): number | null => {
  const dur = r.duration ? (r.duration > 100000 ? r.duration / 1000 : r.duration) : null;
  const moving = r.movingTime && r.movingTime > 0 ? r.movingTime : null;
  if (dur && moving && moving <= dur && moving >= dur * 0.7) return moving;
  return dur ?? moving;
};

/**
 * Best recent effort of 3 km or more, projected to 5 km (Riegel, exponent 1.06), and
 * training-pace bands relative to that 5K pace. A recorded run is at least as fast as
 * the athlete can go, so the anchor never overstates fitness.
 */
export function derivePaceAnchor(runs: AnchorRun[]): PaceAnchor | null {
  let best: { km: number; secs: number; est5k: number; date: Date | null } | null = null;
  for (const r of runs) {
    const km = anchorRunKm(r);
    const secs = anchorRunSecs(r);
    if (!km || !secs || km < 3 || km > 50) continue;
    const pace = secs / km;
    if (pace < 180 || pace > 720) continue; // GPS glitches / walks
    const est5k = secs * Math.pow(5 / km, 1.06);
    if (!best || est5k < best.est5k) {
      best = { km, secs, est5k, date: r.completedAt ? new Date(r.completedAt) : null };
    }
  }
  if (!best) return null;
  const p = best.est5k / 5;
  return {
    sourceKm: best.km,
    sourceSecs: best.secs,
    sourceDate: best.date,
    est5kSecs: best.est5k,
    easy: { min: p + 55, max: p + 110 },
    recovery: { min: p + 90, max: p + 150 },
    tempo: { min: p + 12, max: p + 30 },
    interval: { min: p - 12, max: p + 5 },
    // A newcomer's anchor is usually a walk-run whose walk breaks slow the average, so the
    // running bits are at or faster than it. Damion (2026-10): 9:00/km walk-runs were given
    // 11:18/km run segments, slower than his walking-included average.
    walkRun: { min: p - 30, max: p + 45 },
  };
}

export function describeAnchor(a: PaceAnchor): string {
  const band = (b: PaceBand) => `${fmtPace(b.min)}–${fmtPace(b.max)}/km`;
  const when = a.sourceDate ? ` on ${a.sourceDate.toDateString()}` : "";
  return `Best recent effort: ${a.sourceKm.toFixed(1)} km in ${fmtDuration(a.sourceSecs)}${when} → estimated current 5K ≈ ${fmtDuration(a.est5kSecs)} (${fmtPace(a.est5kSecs / 5)}/km). A recorded training run is a floor, not a maximum — the athlete may be a little fitter.
Training paces from this anchor: easy/long ${band(a.easy)}, recovery ${band(a.recovery)}, tempo/threshold ${band(a.tempo)}, 5K-pace intervals ${band(a.interval)}, walk-run running segments ${band(a.walkRun)}.`;
}

// ── Session classification ──────────────────────────────────────────────────

export type SessionCategory = "walk_run" | "recovery" | "long" | "tempo" | "interval" | "easy" | "rest" | "orientation" | "other";

export function classifySession(workoutType?: string | null, effortLabel?: string | null): SessionCategory {
  const t = String(workoutType ?? "").toLowerCase();
  const l = String(effortLabel ?? "").toLowerCase();
  if (t === "rest") return "rest";
  if (t === "orientation") return "orientation";
  if (t.includes("walk_run") || t.includes("run_walk") || l.includes("walk_run")) return "walk_run";
  if (t.includes("recovery") || l.includes("recovery")) return "recovery";
  if (t.includes("long") || l.includes("long")) return "long";
  // An easy run finished with a few short strides — easy for zones, load and spacing.
  if (t.includes("stride") || l.includes("stride")) return "easy";
  if (/tempo|threshold|lactate|cruise/.test(t) || /tempo|threshold|lactate|cruise/.test(l)) return "tempo";
  if (/interval|vo2|repeat|hill|fartlek|speed|track|stride|race_pace|time_trial/.test(t) ||
      /interval|vo2|speed|neuromuscular|stride|hill|race_pace/.test(l)) return "interval";
  if (/easy|aerobic|base|jog/.test(t) || /easy|aerobic|base/.test(l)) return "easy";
  return "other";
}

const isQuality = (c: SessionCategory) => c === "tempo" || c === "interval";

/** HR zone each category should carry. Tempo/threshold is Zone 4 (80–90% max HR) — the
 *  generator used to label it z3, giving 122–140 bpm "threshold" targets. */
export function normaliseIntensity(wo: any): void {
  const c = classifySession(wo.workoutType, wo.effortLabel);
  const zone = parseInt(String(wo.intensity ?? "").replace(/\D/g, ""), 10);
  if (c === "tempo" && zone !== 4) wo.intensity = "z4";
  else if ((c === "easy" || c === "long") && (!zone || zone > 2)) wo.intensity = "z2";
  else if (c === "recovery" && (!zone || zone > 2)) wo.intensity = "z1";
  else if (c === "interval" && (!zone || zone < 4)) wo.intensity = "z5";
}

// ── Load maths ──────────────────────────────────────────────────────────────

/** Minutes of continuous running a session asks for, at the athlete's easy pace. */
export function continuousRunMin(wo: any, easyPaceSecs: number): number {
  const c = classifySession(wo.workoutType, wo.effortLabel);
  if (c === "rest" || c === "orientation" || String(wo.sessionType ?? "").toLowerCase() === "walk") return 0;
  if (c === "walk_run") return (Number(wo.intervalDurationSeconds) || 0) / 60;
  const durationSec = Number(wo.duration) || 0;
  if (durationSec > 0) return durationSec / 60;
  const km = Number(wo.distance) || 0;
  return km > 0 ? (km * easyPaceSecs) / 60 : 0;
}

/** Approximate running km a session represents (time-based sessions converted at easy pace). */
export function sessionKm(wo: any, easyPaceSecs: number): number {
  const c = classifySession(wo.workoutType, wo.effortLabel);
  if (c === "rest") return 0;
  const km = Number(wo.distance) || 0;
  if (km > 0) return km;
  const durationSec = Number(wo.duration) || 0;
  if (durationSec <= 0) return 0;
  if (c === "walk_run") {
    const run = Number(wo.intervalDurationSeconds) || 0;
    const rest = Number(wo.restDurationSeconds) || 0;
    const runShare = run + rest > 0 ? run / (run + rest) : 0.5;
    return (durationSec * runShare) / easyPaceSecs;
  }
  return durationSec / easyPaceSecs;
}

export const weekKm = (week: any, easyPaceSecs: number): number =>
  (Array.isArray(week.workouts) ? week.workouts : []).reduce((s: number, wo: any) => s + sessionKm(wo, easyPaceSecs), 0);

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundHalf = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

/** Week totals from the sessions themselves — the model's own totalDistance is often wrong. */
export function recomputeWeekTotals(weeks: any[], easyPaceSecs: number): void {
  for (const week of weeks) week.totalDistance = round1(weekKm(week, easyPaceSecs));
}

// ── Load rules ──────────────────────────────────────────────────────────────

export interface LoadRuleOptions {
  daysPerWeek: number;
  baselineWeeklyKm: number;        // current weekly volume (history or level)
  startingLongestRunMin: number;   // longest continuous run the athlete has done / can do
  easyPaceSecs: number;
  continuousCapable: boolean;      // can already run 25+ min without walking (and not injured)
  sparseHistory: boolean;          // < 3 runs in the last 30 days — be conservative in week 1
  priorWeeklyKms?: number[];       // later blocks: earlier weeks' volumes, oldest first
  longRunCeilingKm?: number;       // no session longer than this (longRunCeilingKm())
  fixedSessions?: FixedSession[];  // regular club/group runs that count toward the plan
}

/** A regular session the runner does every week (club run). dayOfWeek 1=Mon … 7=Sun. */
export interface FixedSession { name: string; dayOfWeek: number }

// Matching a plan session to a regular session by name: its first distinctive word
// ("Sands Salisbury Runners" → "sands", "TWR Salisbury" → "twr").
const GENERIC_NAME_WORDS = new Set(["run", "runs", "runner", "runners", "running", "club", "group", "the", "and", "with", "session", "weekly"]);
const fixedKey = (name: string): string | null =>
  name.toLowerCase().split(/[^a-z0-9]+/).find(t => t.length >= 3 && !GENERIC_NAME_WORDS.has(t)) ?? null;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function fixedSessionOf(wo: any, opts: LoadRuleOptions): FixedSession | null {
  const text = `${wo.description ?? ""} ${wo.name ?? ""}`.toLowerCase();
  for (const f of opts.fixedSessions ?? []) {
    const key = fixedKey(f.name);
    if (key && new RegExp(`\\b${key}\\b`).test(text)) return f;
  }
  return null;
}

/** Shortest long run outside a deload week: what the athlete already runs, but never above the goal ceiling. */
const longRunFloorMin = (opts: { startingLongestRunMin: number; easyPaceSecs: number; longRunCeilingKm?: number }) =>
  Math.min(opts.startingLongestRunMin * 0.85, opts.longRunCeilingKm ? (opts.longRunCeilingKm * opts.easyPaceSecs) / 60 : Infinity);
const longRunAllowance = (longestSoFar: number) => Math.max(longestSoFar * 1.2, longestSoFar + 10);
const weekVolumeCap = (peakSoFar: number, isFirstPlanWeek: boolean) =>
  isFirstPlanWeek ? Math.max(peakSoFar * 1.3, peakSoFar + 5) : Math.max(peakSoFar * 1.25, peakSoFar + 4);
const longRunShareCap = (daysPerWeek: number) => (daysPerWeek <= 3 ? 0.55 : 0.45);
// The volume cap never goes below the smallest week the other rules allow: n − 1 minimum-length
// runs plus the long-run floor. Emma (2026-10, ~4 km/week lately, 3 days) got a 9 km cap that
// can't hold three 30-minute runs, so the trim undid the minimum and left 22-minute sessions.
const minimumWeekKm = (opts: LoadRuleOptions, sessions: number): number => {
  if (!opts.continuousCapable || sessions <= 0) return 0;
  const easyKm = (MIN_EASY_MIN * 60) / opts.easyPaceSecs;
  const longKm = (Math.max(MIN_EASY_MIN, longRunFloorMin(opts)) * 60) / opts.easyPaceSecs;
  return (sessions - 1) * easyKm + longKm;
};
const volumeCap = (peakSoFar: number, isFirstPlanWeek: boolean, opts: LoadRuleOptions, sessions: number) =>
  Math.max(weekVolumeCap(peakSoFar, isFirstPlanWeek), minimumWeekKm(opts, sessions));
const runningSessions = (week: any) =>
  (Array.isArray(week.workouts) ? week.workouts : []).filter((wo: any) => classifySession(wo.workoutType, wo.effortLabel) !== "rest").length;
// A runner who already runs continuously gains little from a 15-minute jog: easy and long
// runs are at least 30 min, recovery runs at least 20 (Julie's corrected plan had 2 km
// "recovery runs" before this).
const MIN_EASY_MIN = 30;
const MIN_RECOVERY_MIN = 20;
const minSessionMin = (c: SessionCategory): number =>
  c === "recovery" ? MIN_RECOVERY_MIN : c === "easy" || c === "long" || c === "other" ? MIN_EASY_MIN : 0;

const dayOffset = (wo: any) => (((Number(wo.dayOfWeek) || 0) % 7) + 6) % 7; // 0=Mon … 6=Sun
// Sunday is written as 7, not 0: both apps sort a week by dayOfWeek and 7 keeps Sunday last.
const offsetToDayOfWeek = (offset: number) => (offset === 6 ? 7 : offset + 1);

/** Running sessions across the whole block on one timeline (week index × 7 + day offset). */
function blockTimeline(weeks: any[]): Array<{ abs: number; wo: any; weekIdx: number }> {
  const out: Array<{ abs: number; wo: any; weekIdx: number }> = [];
  weeks.forEach((week, weekIdx) => {
    for (const wo of week.workouts ?? []) {
      if (classifySession(wo.workoutType, wo.effortLabel) === "rest") continue;
      out.push({ abs: weekIdx * 7 + dayOffset(wo), wo, weekIdx });
    }
  });
  return out.sort((a, b) => a.abs - b.abs);
}

/** First day (absolute) that completes three running days in a row, or null. */
function firstTriple(weeks: any[]): number | null {
  const days = Array.from(new Set(blockTimeline(weeks).map(e => e.abs))).sort((a, b) => a - b);
  for (let i = 2; i < days.length; i++) {
    if (days[i - 1] === days[i] - 1 && days[i - 2] === days[i] - 2) return days[i];
  }
  return null;
}

export function buildLoadRulesPrompt(opts: LoadRuleOptions, anchor: PaceAnchor | null, baselineSource: string): string {
  const priors = opts.priorWeeklyKms ?? [];
  const peak = Math.max(opts.baselineWeeklyKm, ...priors, 0);
  const firstCap = volumeCap(peak, priors.length === 0, opts, opts.daysPerWeek);
  const firstLongMin = longRunAllowance(opts.startingLongestRunMin);
  const easy = opts.easyPaceSecs;
  const kmAt = (min: number) => (min * 60) / easy;
  return `━━━ STARTING POINT & LOAD RULES (MANDATORY — plans that break these are rejected) ━━━━━━━━━━

Where this athlete is today (${baselineSource}):
- Current running volume: ~${Math.round(peak)} km/week
- Longest continuous run: ~${Math.round(opts.startingLongestRunMin)} min (~${kmAt(opts.startingLongestRunMin).toFixed(1)} km at easy pace)
- Easy pace used for time ↔ distance: ~${fmtPace(easy)}/km
${anchor ? `- ${describeAnchor(anchor)}\n` : ""}
1. WEEKLY VOLUME: the first week of this block totals at most ${Math.round(firstCap)} km. After that a week may be at most 25% (or 4 km) above the highest week so far.
2. LONG RUN: the longest session in the first week of this block is at most ${Math.round(firstLongMin)} min (~${kmAt(firstLongMin).toFixed(1)} km at easy pace). The longest run may then grow by at most 20% or 10 minutes (whichever is larger) per week over the longest so far.
3. The long run is the longest session of its week, at least ~${Math.round(longRunFloorMin(opts))} min outside a deload week (no shorter than what the athlete already runs), and at most ${Math.round(longRunShareCap(opts.daysPerWeek) * 100)}% of that week's volume.
${opts.longRunCeilingKm ? `3b. No session longer than ${opts.longRunCeilingKm} km in this plan, however far the build goes.\n` : ""}${opts.continuousCapable ? "4. This athlete already runs continuously — do NOT prescribe walk_run sessions. Easy days are easy continuous runs.\n" : ""}${opts.continuousCapable ? `4b. Minimum session length: easy and long runs at least ${MIN_EASY_MIN} min (~${kmAt(MIN_EASY_MIN).toFixed(1)} km), recovery runs at least ${MIN_RECOVERY_MIN} min. Shorter runs add little for this athlete — use fewer, proper sessions instead.\n` : ""}${opts.daysPerWeek <= 4 ? `4c. Spread the sessions: never three running days in a row. If few days are left in the first week, schedule FEWER sessions that week rather than cramming them together.\n` : ""}5. At most 2 quality sessions (tempo/threshold/intervals/hills/fartlek) per week${opts.sparseHistory && priors.length === 0 ? " — at most 1 in the first week while the coach learns this athlete" : ""}. Never put two hard days (quality or long run) back to back.
6. A deload week reduces BOTH weekly volume AND the long run compared with the week before.
7. Intensity labels: easy/long = "z2", recovery = "z1", tempo/threshold = "z4", intervals = "z5".
8. Each session's distance must match its description — don't describe a 9 km run and set distance 6.
${(opts.fixedSessions ?? []).length ? `9. Regular sessions stay on their own day every week: ${opts.fixedSessions!.map(f => `"${f.name}" on ${DAY_NAMES[dayOffset(f)]} (dayOfWeek ${offsetToDayOfWeek(dayOffset(f))})`).join(", ")}. Name the session after it so the athlete recognises it.\n` : ""}
These rules are for you, not the athlete: don't quote them in session instructions.`;
}

/** Deterministic load checks for any athlete. Empty = OK. Phrased to be fed back to the model. */
export function findLoadViolations(weeks: any[], opts: LoadRuleOptions): string[] {
  const violations: string[] = [];
  const priors = opts.priorWeeklyKms ?? [];
  let peak = Math.max(opts.baselineWeeklyKm, ...priors, 0);
  let longestSoFar = opts.startingLongestRunMin;
  let prevVol: number | null = priors.length ? priors[priors.length - 1] : null;
  let prevLongest: number | null = null;

  weeks.forEach((week, idx) => {
    const n = week.weekNumber ?? idx + 1;
    const workouts: any[] = Array.isArray(week.workouts) ? week.workouts : [];
    const vol = weekKm(week, opts.easyPaceSecs);
    const cap = volumeCap(peak, idx === 0 && priors.length === 0, opts, runningSessions(week));
    if (vol > cap + 0.5) {
      violations.push(`Week ${n}: ~${vol.toFixed(1)} km total, but the most allowed is ${cap.toFixed(1)} km (rule 1).`);
    }

    const allowedLong = longRunAllowance(longestSoFar);
    let weekLongest = 0;
    let qualityCount = 0;
    const hardDays: number[] = [];
    for (const wo of workouts) {
      const c = classifySession(wo.workoutType, wo.effortLabel);
      const mins = continuousRunMin(wo, opts.easyPaceSecs);
      const label = `Week ${n} "${wo.description ?? wo.workoutType}"`;
      if (mins > allowedLong + 0.5) {
        violations.push(`${label}: ~${Math.round(mins)} min (~${sessionKm(wo, opts.easyPaceSecs).toFixed(1)} km) of continuous running, but the most allowed this week is ${Math.round(allowedLong)} min (~${((allowedLong * 60) / opts.easyPaceSecs).toFixed(1)} km) (rule 2).`);
      }
      if (opts.longRunCeilingKm && sessionKm(wo, opts.easyPaceSecs) > opts.longRunCeilingKm + 0.25) {
        violations.push(`${label}: ${sessionKm(wo, opts.easyPaceSecs).toFixed(1)} km — no session in this plan may exceed ${opts.longRunCeilingKm} km (rule 3b).`);
      }
      if (c === "walk_run" && opts.continuousCapable) {
        violations.push(`${label}: walk_run session, but this athlete already runs continuously — make it an easy continuous run (rule 4).`);
      }
      if (isQuality(c)) qualityCount++;
      if (isQuality(c) || c === "long") hardDays.push((((Number(wo.dayOfWeek) || 0) % 7) + 6) % 7);
      weekLongest = Math.max(weekLongest, mins);
    }

    const longRuns = workouts.filter(wo => classifySession(wo.workoutType, wo.effortLabel) === "long");
    const otherMaxKm = Math.max(0, ...workouts.filter(wo => !longRuns.includes(wo)).map(wo => sessionKm(wo, opts.easyPaceSecs)));
    const isDeload = prevVol != null && vol < prevVol * 0.85;
    for (const wo of longRuns) {
      const mins = continuousRunMin(wo, opts.easyPaceSecs);
      if (!isDeload && mins < longRunFloorMin(opts) - 0.5) {
        violations.push(`Week ${n} "${wo.description ?? wo.workoutType}": long run of only ~${Math.round(mins)} min — this athlete already runs ~${Math.round(opts.startingLongestRunMin)} min, so it should be at least ${Math.round(longRunFloorMin(opts))} min (rule 3).`);
      }
      if (sessionKm(wo, opts.easyPaceSecs) < otherMaxKm - 0.25) {
        violations.push(`Week ${n} "${wo.description ?? wo.workoutType}": the long run (${sessionKm(wo, opts.easyPaceSecs).toFixed(1)} km) is shorter than another session that week (${otherMaxKm.toFixed(1)} km) (rule 3).`);
      }
    }
    const longestKm = Math.max(0, ...workouts.map(wo => sessionKm(wo, opts.easyPaceSecs)));
    if (vol >= 15 && longestKm > vol * longRunShareCap(opts.daysPerWeek) + 0.5) {
      violations.push(`Week ${n}: longest session ${longestKm.toFixed(1)} km is ${Math.round((longestKm / vol) * 100)}% of the week's ${vol.toFixed(1)} km (rule 3).`);
    }
    const maxQuality = idx === 0 && priors.length === 0 && opts.sparseHistory ? 1 : 2;
    if (qualityCount > maxQuality) {
      violations.push(`Week ${n}: ${qualityCount} quality sessions — at most ${maxQuality} allowed (rule 5).`);
    }
    if (opts.continuousCapable) {
      for (const wo of workouts) {
        const c = classifySession(wo.workoutType, wo.effortLabel);
        const min = minSessionMin(c);
        const mins = continuousRunMin(wo, opts.easyPaceSecs);
        if (min > 0 && mins > 0 && mins < min - 0.5) {
          violations.push(`Week ${n} "${wo.description ?? wo.workoutType}": only ~${Math.round(mins)} min — at least ${min} min for this athlete (rule 4b).`);
        }
      }
    }
    hardDays.sort((a, b) => a - b);
    for (let i = 1; i < hardDays.length; i++) {
      if (hardDays[i] - hardDays[i - 1] === 1) {
        violations.push(`Week ${n}: two hard days (quality or long run) back to back (rule 5).`);
        break;
      }
    }
    if (prevVol != null && prevLongest != null && vol < prevVol * 0.85 && weekLongest > prevLongest + 0.5) {
      violations.push(`Week ${n}: deload week (volume down) but its long run is longer than the week before (rule 6).`);
    }

    peak = Math.max(peak, vol);
    longestSoFar = Math.max(longestSoFar, Math.min(weekLongest, allowedLong));
    prevVol = vol;
    prevLongest = weekLongest;
  });
  if (opts.daysPerWeek <= 4) {
    const third = firstTriple(weeks);
    if (third != null) {
      const w = weeks[Math.floor(third / 7)];
      const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      violations.push(`Week ${w?.weekNumber ?? Math.floor(third / 7) + 1}: three running days in a row ending ${names[third % 7]} (sessions across the end of one week and the start of the next count too) — spread the sessions out${priors.length === 0 ? "; in the first, partial week schedule fewer sessions rather than cramming them" : ""} (rule 4c).`);
    }
  }
  for (const m of misplacedFixedSessions(weeks, opts)) {
    violations.push(`Week ${m.weekNumber} "${m.wo.description ?? m.wo.workoutType}": "${m.fixed.name}" is on ${DAY_NAMES[dayOffset(m.wo)]}, but the athlete does it on ${DAY_NAMES[dayOffset(m.fixed)]} — keep it on that day (rule 9).`);
  }
  return violations;
}

/** Plan sessions named after a regular session but scheduled on another day. The first week
 *  of a new plan is exempt: its regular day may already have passed. */
function misplacedFixedSessions(weeks: any[], opts: LoadRuleOptions): Array<{ weekIdx: number; weekNumber: number; wo: any; fixed: FixedSession }> {
  const out: Array<{ weekIdx: number; weekNumber: number; wo: any; fixed: FixedSession }> = [];
  if (!(opts.fixedSessions ?? []).length) return out;
  const firstExempt = (opts.priorWeeklyKms ?? []).length === 0;
  weeks.forEach((week, weekIdx) => {
    if (weekIdx === 0 && firstExempt) return;
    for (const wo of week.workouts ?? []) {
      const fixed = fixedSessionOf(wo, opts);
      if (fixed && dayOffset(wo) !== dayOffset(fixed)) out.push({ weekIdx, weekNumber: week.weekNumber ?? weekIdx + 1, wo, fixed });
    }
  });
  return out;
}

/**
 * Last line of defence after the model's correction attempts: make the plan obey the
 * load rules. Returns what was changed (for logs). Mutates `weeks`.
 */
export function repairPlanLoad(weeks: any[], opts: LoadRuleOptions): string[] {
  const repairs: string[] = [];
  const easy = opts.easyPaceSecs;
  const priors = opts.priorWeeklyKms ?? [];
  let peak = Math.max(opts.baselineWeeklyKm, ...priors, 0);
  let longestSoFar = opts.startingLongestRunMin;
  let prevVol: number | null = priors.length ? priors[priors.length - 1] : null;
  let prevLongest: number | null = null;

  weeks.forEach((week, idx) => {
    const n = week.weekNumber ?? idx + 1;
    const workouts: any[] = Array.isArray(week.workouts) ? week.workouts : [];

    // Walk-run for someone who already runs continuously → easy continuous run of the same time.
    if (opts.continuousCapable) {
      for (const wo of workouts) {
        if (classifySession(wo.workoutType, wo.effortLabel) !== "walk_run") continue;
        const totalSec = Number(wo.duration) ||
          (Number(wo.intervalCount) || 0) * ((Number(wo.intervalDurationSeconds) || 0) + (Number(wo.restDurationSeconds) || 0));
        const km = roundHalf(Math.max(totalSec, 20 * 60) / easy);
        Object.assign(wo, {
          workoutType: "easy", effortLabel: "easy_aerobic", intensity: "z2", distance: km, duration: null,
          intervalCount: null, intervalDurationSeconds: null, intervalDistanceMeters: null, restDurationSeconds: null,
          description: "Easy Aerobic Run",
          instructions: "Easy, continuous running at a relaxed, conversational pace — you should be able to talk in full sentences throughout. Keep it smooth and unhurried; this builds your aerobic base without adding fatigue.",
        });
        repairs.push(`Week ${n}: walk-run → ${km} km easy run`);
      }
    }

    // Too-short easy/recovery runs → raise to the minimum.
    if (opts.continuousCapable) {
      for (const wo of workouts) {
        const min = minSessionMin(classifySession(wo.workoutType, wo.effortLabel));
        const mins = continuousRunMin(wo, easy);
        if (min <= 0 || mins <= 0 || mins >= min - 0.5) continue;
        if (Number(wo.distance) > 0) {
          wo.distance = Math.ceil(((min * 60) / easy) * 2) / 2;
          if (Number(wo.duration) > 0) wo.duration = Math.round(wo.distance * easy);
        } else {
          wo.duration = min * 60;
        }
        repairs.push(`Week ${n} "${wo.description ?? wo.workoutType}": ${Math.round(mins)} min → ${min} min`);
      }
    }

    // Long-run growth cap.
    const allowedLong = longRunAllowance(longestSoFar);
    for (const wo of workouts) {
      const mins = continuousRunMin(wo, easy);
      if (mins <= allowedLong + 0.5) continue;
      if (Number(wo.duration) > 0 && !(Number(wo.distance) > 0)) {
        wo.duration = Math.round(allowedLong * 60);
      } else {
        wo.distance = Math.max(1, Math.floor(((allowedLong * 60) / easy) * 2) / 2);
        if (Number(wo.duration) > 0) wo.duration = Math.round(wo.distance * easy);
      }
      repairs.push(`Week ${n} "${wo.description ?? wo.workoutType}": ${Math.round(mins)} min → ${Math.round(continuousRunMin(wo, easy))} min`);
    }

    // Ceiling relative to the goal distance.
    if (opts.longRunCeilingKm) {
      for (const wo of workouts) {
        if (sessionKm(wo, easy) <= opts.longRunCeilingKm + 0.25) continue;
        if (Number(wo.distance) > 0) {
          wo.distance = opts.longRunCeilingKm;
          if (Number(wo.duration) > 0) wo.duration = Math.round(wo.distance * easy);
        } else {
          wo.duration = Math.round(opts.longRunCeilingKm * easy);
        }
        repairs.push(`Week ${n} "${wo.description ?? wo.workoutType}": capped at ${opts.longRunCeilingKm} km`);
      }
    }

    // The long run must be the week's longest session (within the growth allowance).
    const longs = workouts.filter(wo => classifySession(wo.workoutType, wo.effortLabel) === "long" && Number(wo.distance) > 0);
    const othersMax = Math.max(0, ...workouts.filter(wo => !longs.includes(wo)).map(wo => sessionKm(wo, easy)));
    const deloadWeek = prevVol != null && weekKm(week, easy) < prevVol * 0.85;
    const floorKm = deloadWeek ? 0 : Math.min(Math.ceil(((longRunFloorMin(opts) * 60) / easy) * 2) / 2, opts.longRunCeilingKm ?? Infinity);
    for (const wo of longs) {
      const wantKm = Math.max(othersMax + 0.5, floorKm);
      if (Number(wo.distance) >= othersMax - 0.25 && Number(wo.distance) >= floorKm - 0.1) continue;
      const maxKm = Math.min(Math.floor(((allowedLong * 60) / easy) * 2) / 2, opts.longRunCeilingKm ?? Infinity);
      wo.distance = Math.min(maxKm, roundHalf(wantKm));
      repairs.push(`Week ${n}: long run raised to ${wo.distance} km`);
    }

    // Too many quality sessions → the later ones become easy runs of the same distance.
    const maxQuality = idx === 0 && priors.length === 0 && opts.sparseHistory ? 1 : 2;
    const quality = workouts.filter(wo => isQuality(classifySession(wo.workoutType, wo.effortLabel)));
    for (const wo of quality.slice(maxQuality)) {
      const km = roundHalf(sessionKm(wo, easy) || 5);
      Object.assign(wo, {
        workoutType: "easy", effortLabel: "easy_aerobic", intensity: "z2", distance: km, duration: null,
        intervalCount: null, intervalDurationSeconds: null, intervalDistanceMeters: null, restDurationSeconds: null,
        description: "Easy Aerobic Run",
        instructions: "Easy, continuous running at a relaxed, conversational pace. Recovery between this week's harder sessions is what makes them work.",
      });
      repairs.push(`Week ${n}: extra quality session → ${km} km easy run`);
    }

    // Weekly volume cap — trim easy/long running (never the quality sessions' structure).
    const cap = volumeCap(peak, idx === 0 && priors.length === 0, opts, runningSessions(week));
    let vol = weekKm(week, easy);
    if (vol > cap + 0.5) {
      const trimmable = workouts.filter(wo => {
        const c = classifySession(wo.workoutType, wo.effortLabel);
        return (c === "easy" || c === "long" || c === "recovery" || c === "other") && Number(wo.distance) > 0;
      });
      const trimmableKm = trimmable.reduce((s, wo) => s + Number(wo.distance), 0);
      const excess = vol - cap;
      if (trimmableKm > 0) {
        const factor = Math.max(0.4, (trimmableKm - excess) / trimmableKm);
        for (const wo of trimmable) {
          // Never back under the session's minimum length (or the long-run floor) — see minimumWeekKm.
          const c = classifySession(wo.workoutType, wo.effortLabel);
          const floorMin = !opts.continuousCapable ? 0
            : c === "long" ? Math.max(MIN_EASY_MIN, longRunFloorMin(opts)) : minSessionMin(c);
          const floorKm = Math.ceil(((floorMin * 60) / easy) * 2) / 2;
          wo.distance = Math.max(2, floorKm, roundHalf(Number(wo.distance) * factor));
          if (Number(wo.duration) > 0) wo.duration = Math.round(wo.distance * easy);
        }
        repairs.push(`Week ${n}: ${vol.toFixed(1)} km → ${weekKm(week, easy).toFixed(1)} km (cap ${cap.toFixed(1)})`);
      }
      vol = weekKm(week, easy);
    }

    // Deload week's long run must not exceed the previous week's.
    let weekLongest = Math.max(0, ...workouts.map(wo => continuousRunMin(wo, easy)));
    if (prevVol != null && prevLongest != null && vol < prevVol * 0.85 && weekLongest > prevLongest + 0.5) {
      const target = prevLongest * 0.8;
      for (const wo of workouts) {
        if (continuousRunMin(wo, easy) <= target + 0.5 || !(Number(wo.distance) > 0)) continue;
        wo.distance = Math.max(2, Math.floor(((target * 60) / easy) * 2) / 2);
        repairs.push(`Week ${n}: deload long run shortened to ${wo.distance} km`);
      }
      vol = weekKm(week, easy);
      weekLongest = Math.max(0, ...workouts.map(wo => continuousRunMin(wo, easy)));
    }

    peak = Math.max(peak, vol);
    longestSoFar = Math.max(longestSoFar, weekLongest);
    prevVol = vol;
    prevLongest = weekLongest;
  });

  // Regular sessions back on their own day; a session already on that day takes the old slot.
  for (const m of misplacedFixedSessions(weeks, opts)) {
    const from = m.wo.dayOfWeek;
    const occupant = (weeks[m.weekIdx].workouts ?? []).find((o: any) => o !== m.wo && dayOffset(o) === dayOffset(m.fixed));
    m.wo.dayOfWeek = offsetToDayOfWeek(dayOffset(m.fixed));
    if (occupant) occupant.dayOfWeek = from;
    repairs.push(`Week ${m.weekNumber}: "${m.fixed.name}" moved back to ${DAY_NAMES[dayOffset(m.fixed)]}`);
  }

  // Three running days in a row (also across week boundaries): move an easy session to a
  // free later day in its own week; in the first, partial week drop it instead.
  if (opts.daysPerWeek <= 4) {
    for (let guard = 0; guard < 12; guard++) {
      const third = firstTriple(weeks);
      if (third == null) break;
      const timeline = blockTimeline(weeks);
      const involved = timeline
        .filter(e => e.abs >= third - 2 && e.abs <= third)
        .filter(e => ["easy", "recovery", "other"].includes(classifySession(e.wo.workoutType, e.wo.effortLabel)))
        .filter(e => !fixedSessionOf(e.wo, opts)) // a club run can't move; move the session around it
        .sort((a, b) => b.abs - a.abs);
      let fixed = false;
      for (const e of involved) {
        const week = weeks[e.weekIdx];
        const taken = new Set((week.workouts ?? []).filter((o: any) => o !== e.wo).map(dayOffset));
        for (const shift of [1, 2, -1, -2]) {
          const target = dayOffset(e.wo) + shift;
          if (target < 0 || target > 6 || taken.has(target)) continue;
          const before = e.wo.dayOfWeek;
          e.wo.dayOfWeek = offsetToDayOfWeek(target);
          if (firstTriple(weeks) == null || firstTriple(weeks)! > third) {
            repairs.push(`Week ${week.weekNumber ?? e.weekIdx + 1}: moved "${e.wo.description ?? e.wo.workoutType}" to spread sessions out`);
            fixed = true;
            break;
          }
          e.wo.dayOfWeek = before;
        }
        if (fixed) break;
      }
      if (!fixed && priors.length === 0) {
        const first = involved.find(e => e.weekIdx === 0);
        if (first) {
          weeks[0].workouts = weeks[0].workouts.filter((o: any) => o !== first.wo);
          repairs.push(`Week ${weeks[0].weekNumber ?? 1}: dropped "${first.wo.description ?? first.wo.workoutType}" — three running days in a row`);
          fixed = true;
        }
      }
      if (!fixed) break;
    }
  }

  for (const week of weeks) for (const wo of week.workouts ?? []) normaliseIntensity(wo);
  recomputeWeekTotals(weeks, easy);
  return repairs;
}

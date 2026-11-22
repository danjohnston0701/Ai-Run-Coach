// The orientation run is the first session of a new runner's plan: it collects the pace and
// heart-rate data that weeks 1-2 are enriched from (plan-run-sync.ts enrichWeeksAfterOrientation).
//
// The prompt asks for it, but nothing checked it survived. Week-1 sessions on days already past are
// dropped when the plan is saved, so a plan created on a Sunday (Jade, 2026-11-22, twice) lost the
// Monday orientation and started with a 7 km long run that evening — and with no orientation
// session, the targets every session promised ("once your orientation run is complete") never came.
// `ensureOrientationFirst` runs on the final weeks just before they're saved.

export const ORIENTATION_EFFORT_LABEL = "orientation_calibration";

const RUN_INSTRUCTIONS =
  "Easy exploration run. Start at a comfortable pace and let it settle naturally over the first kilometre. Run the whole session at a conversational effort — you should be able to speak in full sentences throughout. Your coach will use your pace and heart rate data from today to calibrate all future session targets specifically to you.";
const WALK_RUN_INSTRUCTIONS =
  "Gentle walk-run to see how your body responds. Walk briskly for 5 minutes, then alternate 1 minute of very easy jogging with 2 minutes of walking. Walk whenever you need to — there is no target pace. Your coach will use today's data to set your personalised targets.";

const dayIndex = (dow: number) => ((Number(dow) || 1) + 6) % 7; // Mon=0 … Sun=6 (7 and 0 = Sunday)

/**
 * Makes the first session the runner will actually see an orientation run.
 * `isDropped(weekNumber, dayOfWeek)` mirrors the save loop's "week-1 day already past" skip.
 * Returns a log line when it changed something, else null.
 */
export function ensureOrientationFirst(
  weeks: any[],
  opts: { walkRun: boolean; isDropped: (weekNumber: number, dayOfWeek: number) => boolean },
): string | null {
  const kept: Array<{ wo: any; weekNumber: number }> = [];
  const dropped: any[] = [];
  for (const week of weeks) {
    const sorted = [...(week.workouts ?? [])].sort((a, b) => dayIndex(a.dayOfWeek) - dayIndex(b.dayOfWeek));
    for (const wo of sorted) {
      if (String(wo.workoutType ?? "").toLowerCase() === "rest") continue;
      if (opts.isDropped(week.weekNumber, wo.dayOfWeek)) dropped.push(wo);
      else kept.push({ wo, weekNumber: week.weekNumber });
    }
  }
  if (kept.length === 0) return null;
  // Already one the runner will see: the first run after the plan is created completes it
  // wherever it sits (linkRunToPendingOrientation).
  if (kept.some(k => String(k.wo.workoutType).toLowerCase() === "orientation")) return null;

  const first = kept[0].wo;
  const before = `${first.workoutType} ${first.distance ?? "?"} km "${first.description ?? ""}"`;
  const template = dropped.find(d => String(d.workoutType).toLowerCase() === "orientation");

  first.workoutType = "orientation";
  first.effortLabel = ORIENTATION_EFFORT_LABEL;
  first.intensity = "z2";
  first.targetPace = null;
  first.sessionIntent = "orientation_run"; // gets the orientation-specific coaching (training-plan-service)
  if (opts.walkRun) {
    first.distance = template?.distance ?? 2;
    first.duration = template?.duration ?? 1200;
    first.intervalCount = 6;
    first.intervalDurationSeconds = 60;
    first.restDurationSeconds = 120;
    first.description = template?.description ?? "Orientation Walk-Run — Getting to Know You";
    first.instructions = template?.instructions ?? WALK_RUN_INSTRUCTIONS;
  } else {
    const km = Number(template?.distance ?? first.distance) || 4;
    first.distance = Math.min(5, Math.max(3, km));
    first.duration = null;
    for (const k of ["intervalCount", "intervalDistanceMeters", "intervalDurationSeconds", "restDistanceMeters", "restDurationSeconds", "intervalTargetPace", "restTargetPace"]) {
      first[k] = null;
    }
    first.description = template?.description ?? "Orientation Run — Getting to Know Your Running";
    first.instructions = template?.instructions ?? RUN_INSTRUCTIONS;
  }
  return `week ${kept[0].weekNumber} day ${first.dayOfWeek}: ${before} → orientation ${first.distance} km${template ? " (the AI's orientation fell on a day already past)" : " (the AI left it out)"}`;
}

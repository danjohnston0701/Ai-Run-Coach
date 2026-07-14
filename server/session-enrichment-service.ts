/**
 * Session Enrichment Service
 *
 * Enriches planned workout sessions with precise, runner-specific numeric targets
 * AFTER the AI coaching plan has been generated.
 *
 * WHY THIS EXISTS:
 *   Plan generation (GPT) is excellent at coaching structure — session types,
 *   periodisation, progression logic. It is unreliable at assigning specific
 *   numeric targets (exact paces, BPM ranges) because it doesn't have real
 *   pace-to-zone correlation data for this specific runner.
 *
 *   This service solves that by:
 *   1. Deriving the runner's actual zone-pace correlation from their run history
 *   2. Passing that data + the original session intent to GPT
 *   3. GPT assigns numeric targets that are internally consistent with the runner's physiology
 *   4. Writing those targets back to planned_workouts
 *   5. Regenerating session instructions so they reflect the enriched targets
 *
 * WHEN IT RUNS:
 *   - Immediately at plan creation for returning users (weeks 1-2)
 *   - After orientation session completes for new users (weeks 1-2)
 *   - Daily scheduler: enriches next 2-week block when calendar passes end of current block
 *
 * STAGGERED ENRICHMENT MODEL:
 *   - Weeks 1-2: enriched at plan creation (or after orientation)
 *   - Weeks 3-4: enriched when calendar reaches end of week 2
 *   - Weeks 5-6: enriched when calendar reaches end of week 4
 *   - ... and so on
 *
 *   This means future weeks always reflect actual performance data from the
 *   preceding weeks — genuinely adaptive, not guessed at day one.
 */

import OpenAI from "openai";
import { db } from "./db";
import {
  plannedWorkouts,
  weeklyPlans,
  trainingPlans,
  runs,
  users,
} from "@shared/schema";
import { eq, and, inArray, desc, isNotNull } from "drizzle-orm";
import { getOrGenerateSessionCoaching } from "./session-coaching-service";
import { HeartRateZones } from "./heart-rate-zones";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Pace helpers ─────────────────────────────────────────────────────────────

function parsePaceToSecs(pace: string | null | undefined): number | null {
  if (!pace) return null;
  const clean = pace.replace(/\/km.*/, "").trim();
  const parts = clean.split(":");
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

function formatSecsAsPace(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Zone-pace correlation ─────────────────────────────────────────────────────

interface ZonePaceData {
  summary: string;
  hasRealData: boolean;
  runsWithBothMetrics: number;
}

function buildZonePaceCorrelation(
  runsData: Array<{ avgPace: string | null; avgHeartRate: number | null; maxHeartRate: number | null }>,
  maxHR: number
): ZonePaceData {
  const zoneRuns: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  for (const run of runsData) {
    if (!run.avgPace || !run.avgHeartRate || run.avgHeartRate < 80) continue;
    const paceSecs = parsePaceToSecs(run.avgPace);
    if (!paceSecs || paceSecs < 180 || paceSecs > 1200) continue;

    const hrPct = run.avgHeartRate / maxHR;
    const zone =
      hrPct < 0.60 ? 1 :
      hrPct < 0.70 ? 2 :
      hrPct < 0.80 ? 3 :
      hrPct < 0.90 ? 4 : 5;
    zoneRuns[zone].push(paceSecs);
  }

  const runsWithBothMetrics = Object.values(zoneRuns).flat().length;

  const zoneLabels: Record<number, string> = {
    1: "Very easy/recovery",
    2: "Aerobic base (Zone 2)",
    3: "Tempo/threshold",
    4: "Hard/VO2max",
    5: "Max sprint effort",
  };

  const lines: string[] = [];
  for (let z = 1; z <= 5; z++) {
    const paces = zoneRuns[z];
    if (paces.length === 0) continue;
    const avg = Math.round(paces.reduce((a, b) => a + b, 0) / paces.length);
    const minP = Math.min(...paces);
    const maxP = Math.max(...paces);
    lines.push(
      `  Zone ${z} — ${zoneLabels[z]}: ${formatSecsAsPace(minP)}–${formatSecsAsPace(maxP)}/km (avg ${formatSecsAsPace(avg)}/km across ${paces.length} run${paces.length !== 1 ? "s" : ""})`
    );
  }

  if (lines.length === 0) {
    return {
      summary: "No HR+pace correlation data available — estimate from fitness level only.",
      hasRealData: false,
      runsWithBothMetrics: 0,
    };
  }

  return {
    summary: `Actual zone-pace correlation from ${runsWithBothMetrics} runs with heart rate data:\n${lines.join("\n")}`,
    hasRealData: true,
    runsWithBothMetrics,
  };
}

// ─── Max HR estimation ──────────────────────────────────────────────────────

function estimateMaxHR(
  runsData: Array<{ maxHeartRate: number | null; avgHeartRate: number | null }>,
  age: number
): { maxHR: number; source: string } {
  const tanakaMax = Math.round(208 - 0.7 * age);

  const peaks = runsData
    .map(r => r.maxHeartRate ?? r.avgHeartRate ?? 0)
    .filter(hr => hr > 100 && hr < 230);

  if (peaks.length >= 3) {
    const sorted = [...peaks].sort((a, b) => b - a);
    const p95Index = Math.max(0, Math.floor(sorted.length * 0.05));
    const observed = sorted[p95Index];
    // Clamp within ±15 bpm below / +25 bpm above Tanaka estimate
    const clamped = Math.max(tanakaMax - 15, Math.min(tanakaMax + 25, observed));
    return { maxHR: Math.round(clamped), source: "run history" };
  }

  return { maxHR: tanakaMax, source: "Tanaka formula" };
}

// ─── Main enrichment function ──────────────────────────────────────────────

export async function enrichWorkoutBlock(
  userId: string,
  workoutIds: string[]
): Promise<{ enriched: number; failed: number }> {
  if (workoutIds.length === 0) return { enriched: 0, failed: 0 };

  console.log(`[Enrichment] Starting enrichment for user ${userId}, ${workoutIds.length} workouts`);

  // Load user
  const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
  if (!user) throw new Error(`[Enrichment] User not found: ${userId}`);

  // Load recent runs — include ALL sources (Garmin, Strava, native) for enrichment
  // enrichment needs the best possible data, not just AI Run Coach runs
  const recentRuns = await db
    .select({
      avgPace: runs.avgPace,
      avgHeartRate: runs.avgHeartRate,
      maxHeartRate: runs.maxHeartRate,
      distance: runs.distance,
    })
    .from(runs)
    .where(eq(runs.userId, userId))
    .orderBy(desc(runs.completedAt))
    .limit(60);

  // ── Estimate max HR and build zone-pace correlation ──────────────────────────
  const hasDOB = !!user.dateOfBirth;
  const userAge = hasDOB
    ? Math.floor((Date.now() - new Date(user.dateOfBirth as string).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : (user as any).age ?? 35;

  const { maxHR, source: maxHRSource } = estimateMaxHR(recentRuns, userAge);
  const zonePaceData = buildZonePaceCorrelation(recentRuns, maxHR);
  const fitnessLevel = (user as any).fitnessLevel ?? "intermediate";

  // ── 3-tier HR knowledge system ─────────────────────────────────────────────
  // Tier 1: Real HR+pace correlation from run history (most accurate)
  // Tier 2: Tanaka formula from DOB (physiologically grounded)
  // Tier 3: Estimate from fitness level only (least accurate — last resort)
  type HRTier = 1 | 2 | 3;
  const hrTier: HRTier = zonePaceData.hasRealData ? 1 : hasDOB ? 2 : 3;

  // For Tier 2 — pre-compute all zone BPM ranges from Tanaka formula server-side.
  // These are passed explicitly to GPT so it doesn't guess. GPT decides WHICH zone
  // a session belongs to; the server provides the exact BPM bounds for that zone.
  const tanakaZoneRanges: Record<number, { min: number; max: number }> | null =
    hrTier === 2
      ? {
          1: HeartRateZones.getZoneRange(1, maxHR),
          2: HeartRateZones.getZoneRange(2, maxHR),
          3: HeartRateZones.getZoneRange(3, maxHR),
          4: HeartRateZones.getZoneRange(4, maxHR),
          5: HeartRateZones.getZoneRange(5, maxHR),
        }
      : null;

  console.log(`[Enrichment] HR tier: ${hrTier} (${hrTier === 1 ? 'real correlation data' : hrTier === 2 ? `Tanaka formula, maxHR=${maxHR}` : 'fitness level estimate'})`);

  // Build the HR context block that goes into the prompt
  const hrContextBlock =
    hrTier === 1
      ? `✅ TIER 1 — Real HR+pace correlation from ${zonePaceData.runsWithBothMetrics} runs:\n${zonePaceData.summary}\nUse these zone-pace ranges as the primary source of truth. Do NOT use population averages — this is runner-specific data.`
      : hrTier === 2
      ? `✅ TIER 2 — Tanaka formula zones (DOB known, max HR = ${maxHR} bpm, age = ${userAge}):
  Zone 1: ${tanakaZoneRanges![1].min}–${tanakaZoneRanges![1].max} bpm  (very easy recovery)
  Zone 2: ${tanakaZoneRanges![2].min}–${tanakaZoneRanges![2].max} bpm  (aerobic base / easy)
  Zone 3: ${tanakaZoneRanges![3].min}–${tanakaZoneRanges![3].max} bpm  (tempo / comfortably hard)
  Zone 4: ${tanakaZoneRanges![4].min}–${tanakaZoneRanges![4].max} bpm  (threshold / hard)
  Zone 5: ${tanakaZoneRanges![5].min}–${tanakaZoneRanges![5].max} bpm  (max effort / sprint)
The BPM values above will be applied server-side — your job is to assign the correct hrZoneNumber for each session and appropriate pace targets for a ${fitnessLevel} runner running in that zone.`
      : `⚠️ TIER 3 — No HR data and no date of birth available. Estimate all targets from fitness level (${fitnessLevel}) only. Be appropriately conservative — err toward slower paces and lower HR ranges.`;

  // Load workouts to enrich — skip rest days
  const workouts = await db
    .select()
    .from(plannedWorkouts)
    .where(inArray(plannedWorkouts.id, workoutIds));

  const enrichableWorkouts = workouts.filter(
    w => w.workoutType !== "rest" && w.workoutType !== "orientation"
  );

  if (enrichableWorkouts.length === 0) {
    console.log(`[Enrichment] No enrichable workouts in batch (all rest/orientation)`);
    return { enriched: 0, failed: 0 };
  }

  // Build prompt input for each workout
  const workoutSummaries = enrichableWorkouts.map((w, i) => {
    const intervalInfo = w.intervalCount
      ? [
          `${w.intervalCount} reps`,
          w.intervalDistanceMeters ? `${w.intervalDistanceMeters}m per rep` : null,
          w.intervalDurationSeconds
            ? `${Math.floor(w.intervalDurationSeconds / 60)}:${String(w.intervalDurationSeconds % 60).padStart(2, "0")} per rep`
            : null,
          w.restDurationSeconds
            ? `${Math.floor(w.restDurationSeconds / 60)} min recovery`
            : null,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

    const intent = [w.effortDescription, w.description, w.instructions]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 300); // Keep it concise for the prompt

    return `WORKOUT ${i + 1} (id: "${w.id}"):
  Type: ${w.workoutType}
  Distance: ${w.distance ?? "not set"}km
  Effort label from plan: "${w.effortDescription ?? "not specified"}"
  Original session intent: "${intent || "none"}"
  ${intervalInfo ? `Interval structure: ${intervalInfo}` : ""}`.trim();
  }).join("\n\n");

  // Compute an approximate Zone 2 pace floor from the runner's average pace.
  // Zone 2 is genuinely easy — significantly slower than an average training run.
  // If avg pace is known, Zone 2 should be at least 90 seconds/km slower.
  const avgPaceRuns = recentRuns
    .filter(r => r.avgPace && typeof r.avgPace === "string")
    .slice(0, 20);

  let zone2PaceHint = "";
  if (avgPaceRuns.length >= 3) {
    const avgSecs = avgPaceRuns.reduce((sum, r) => {
      const parts = (r.avgPace as string).split(":").map(Number);
      return sum + (parts[0] * 60 + (parts[1] ?? 0));
    }, 0) / avgPaceRuns.length;
    const z2MinSecs = Math.round(avgSecs + 90);  // at least 1:30 slower than avg
    const z2MaxSecs = Math.round(avgSecs + 210); // at most 3:30 slower than avg
    const fmt = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    zone2PaceHint = `\n- Runner's recent avg training pace: ${fmt(Math.round(avgSecs))}/km → Zone 2 for this runner should be approximately ${fmt(z2MinSecs)}–${fmt(z2MaxSecs)}/km (genuinely easy, conversational)`;
  }

  const userPrompt = `You are enriching ${enrichableWorkouts.length} training session(s) with precise numeric targets for a specific runner.

RUNNER DATA:
- Fitness level: ${fitnessLevel}
- Age: ${userAge}${zone2PaceHint}
- ${hrContextBlock}

WORKOUTS TO ENRICH:
${workoutSummaries}

ENRICHMENT RULES:
1. Match pace to zone using THIS runner's actual data, not general coaching averages
2. easy/aerobic/recovery/long_run sessions → GENUINE Zone 1-2. Zone 2 is conversational — "could hold a full conversation". For most runners this is 90–210 seconds/km SLOWER than their average training pace
3. tempo/threshold sessions → Zone 3-4 pace for this runner
4. Interval work phases → Zone 4-5 pace. Recovery phases → Zone 1 (easy enough to actually recover, not Zone 2)
5. ALL assigned paces must be faster than 3:00/km and slower than 15:00/km
6. HR ranges must be consistent with the pace assigned — if you assign Zone 2, the BPMs must be Zone 2 BPMs (lower range), NOT Zone 3 or 4 BPMs
7. CRITICAL: Zone 2 ≠ moderate effort. Zone 2 = easy aerobic, 60–70% of max HR, fully conversational. If you are assigning Zone 2, the pace MUST feel easy, not tempo
8. For any novel session type: read the intent, apply appropriate physiology

Return ONLY valid JSON matching this exact format:
{
  "enrichedWorkouts": [
    {
      "id": "workout_id_here",
      "targetPace": "M:SS",
      "hrZoneNumber": 2,
      "hrZoneMinBpm": 110,
      "hrZoneMaxBpm": 130,
      "intervalTargetPace": null,
      "restTargetPace": null,
      "intervalHRMin": null,
      "intervalHRMax": null,
      "restHRMax": null,
      "enrichmentNote": "One sentence explaining the pace choice and zone assignment"
    }
  ]
}

For non-interval workouts: set intervalTargetPace, restTargetPace, intervalHRMin, intervalHRMax, restHRMax to null.
For interval workouts: targetPace is the overall session avg pace estimate; intervalTargetPace is the work phase target.
All workout IDs must match exactly — include every workout in the response, even rest days (just return null for their targets).`;

  const systemPrompt = `You are an elite running coach assigning precise, physiologically consistent numeric targets to training sessions for a specific athlete.

Your targets must be internally consistent: if you assign Zone 2, the pace must be this runner's actual Zone 2 pace from their data — never assign a zone label and then give a pace that belongs to a different zone.

Apply your exercise physiology knowledge to ANY session type, including novel ones you haven't seen before. Read the intent, understand the physiological demand, assign appropriate targets.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Low temperature — numeric precision matters here
      max_tokens: 3000,
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
    const enrichedWorkouts: Array<{
      id: string;
      targetPace?: string | null;
      hrZoneNumber?: number | null;
      hrZoneMinBpm?: number | null;
      hrZoneMaxBpm?: number | null;
      intervalTargetPace?: string | null;
      restTargetPace?: string | null;
      intervalHRMin?: number | null;
      intervalHRMax?: number | null;
      restHRMax?: number | null;
      enrichmentNote?: string;
    }> = parsed.enrichedWorkouts ?? [];

    let enriched = 0;
    let failed = 0;

    for (const enrichment of enrichedWorkouts) {
      try {
        const workoutRecord = workouts.find(w => w.id === enrichment.id);
        if (!workoutRecord) continue;
        if (workoutRecord.workoutType === "rest" || workoutRecord.workoutType === "orientation") continue;

        // Validate pace values before writing — guard against hallucinated numbers
        const targetPaceSecs = parsePaceToSecs(enrichment.targetPace);
        const safePace =
          targetPaceSecs && targetPaceSecs >= 180 && targetPaceSecs <= 1200
            ? enrichment.targetPace
            : null;

        const intervalPaceSecs = parsePaceToSecs(enrichment.intervalTargetPace);
        const safeIntervalPace =
          intervalPaceSecs && intervalPaceSecs >= 180 && intervalPaceSecs <= 1200
            ? enrichment.intervalTargetPace
            : null;

        const restPaceSecs = parsePaceToSecs(enrichment.restTargetPace);
        const safeRestPace =
          restPaceSecs && restPaceSecs >= 180 && restPaceSecs <= 1200
            ? enrichment.restTargetPace
            : null;

        // BPM validation — always enforce Tanaka zone boundaries when DOB is known.
        // GPT's zone NUMBER is the coaching decision (which zone this session targets).
        // The SERVER owns the BPM values — GPT's BPM suggestions are only used as a fallback
        // when we have no formula-based reference (Tier 3, no DOB).
        //
        // This prevents the common failure mode where GPT assigns Zone 2 label but Zone 3
        // BPM values (e.g. 138-156 bpm for Zone 2 at max HR ≈ 197 — that's Zone 3).
        const zoneNum = enrichment.hrZoneNumber;
        const tanakaRangesForValidation: Record<number, { min: number; max: number }> =
          hasDOB
            ? {
                1: HeartRateZones.getZoneRange(1, maxHR),
                2: HeartRateZones.getZoneRange(2, maxHR),
                3: HeartRateZones.getZoneRange(3, maxHR),
                4: HeartRateZones.getZoneRange(4, maxHR),
                5: HeartRateZones.getZoneRange(5, maxHR),
              }
            : {};

        const finalHRMin =
          hasDOB && zoneNum && tanakaRangesForValidation[zoneNum]
            ? tanakaRangesForValidation[zoneNum].min
            : enrichment.hrZoneMinBpm && enrichment.hrZoneMinBpm > 50 && enrichment.hrZoneMinBpm < 220
            ? enrichment.hrZoneMinBpm
            : null;
        const finalHRMax =
          hasDOB && zoneNum && tanakaRangesForValidation[zoneNum]
            ? tanakaRangesForValidation[zoneNum].max
            : enrichment.hrZoneMaxBpm && enrichment.hrZoneMaxBpm > 50 && enrichment.hrZoneMaxBpm < 220
            ? enrichment.hrZoneMaxBpm
            : null;

        const safeHRMin = finalHRMin;
        const safeHRMax = finalHRMax;

        // Compute corrected duration in seconds from distance × pace (fixes the "45 min for 35 min run" bug)
        const effectivePaceSecs = parsePaceToSecs(safePace ?? workoutRecord.targetPace);
        const correctedDurationSecs =
          workoutRecord.distance && effectivePaceSecs
            ? Math.round(workoutRecord.distance * effectivePaceSecs)
            : workoutRecord.duration ?? null;

        await db
          .update(plannedWorkouts)
          .set({
            targetPace: safePace ?? workoutRecord.targetPace,
            duration: correctedDurationSecs ?? workoutRecord.duration,
            hrZoneNumber: enrichment.hrZoneNumber ?? workoutRecord.hrZoneNumber,
            hrZoneMinBpm: safeHRMin ?? workoutRecord.hrZoneMinBpm,
            hrZoneMaxBpm: safeHRMax ?? workoutRecord.hrZoneMaxBpm,
            intervalTargetPace: safeIntervalPace ?? workoutRecord.intervalTargetPace,
            restTargetPace: safeRestPace ?? workoutRecord.restTargetPace,
            intervalHeartRateMin: enrichment.intervalHRMin ?? workoutRecord.intervalHeartRateMin,
            intervalHeartRateMax: enrichment.intervalHRMax ?? workoutRecord.intervalHeartRateMax,
            restHeartRateMax: enrichment.restHRMax ?? workoutRecord.restHeartRateMax,
            isEnrichmentPending: false, // Mark as enriched — app can show real targets now
          } as any)
          .where(eq(plannedWorkouts.id, enrichment.id));

        console.log(
          `[Enrichment] ✅ ${enrichment.id} (${workoutRecord.workoutType}): ` +
          `pace=${safePace ?? "unchanged"} | zone=${enrichment.hrZoneNumber ?? "unchanged"} ` +
          `(${safeHRMin ?? "?"}–${safeHRMax ?? "?"} bpm) [HR tier ${hrTier}]` +
          (enrichment.enrichmentNote ? ` | ${enrichment.enrichmentNote}` : "")
        );

        enriched++;
      } catch (err) {
        console.error(`[Enrichment] Failed to update workout ${enrichment.id}:`, err);
        failed++;
      }
    }

    // Regenerate session coaching for enriched workouts — fire and forget
    // This ensures the pre-run briefing and trigger conditions use the new precise targets
    setImmediate(async () => {
      for (const enrichment of enrichedWorkouts) {
        try {
          const workout = workouts.find(w => w.id === enrichment.id);
          if (!workout || workout.workoutType === "rest" || workout.workoutType === "orientation") continue;

          await getOrGenerateSessionCoaching({
            userId,
            plannedWorkoutId: enrichment.id,
            forceRegenerate: true,
          });
        } catch (e) {
          console.error(`[Enrichment] Session coaching regen failed for ${enrichment.id}:`, e);
        }
      }
    });

    console.log(`[Enrichment] Complete: ${enriched} enriched, ${failed} failed (${workoutIds.length} in batch)`);
    return { enriched, failed };

  } catch (err) {
    console.error(`[Enrichment] GPT call failed for user ${userId}:`, err);
    return { enriched: 0, failed: workoutIds.length };
  }
}

// ─── Helpers for the scheduler and plan generation ─────────────────────────

/**
 * Get workout IDs for specific week numbers in a training plan.
 * Excludes rest days — they don't need enrichment.
 */
export async function getWorkoutIdsForPlanWeeks(
  trainingPlanId: string,
  weekNumbers: number[]
): Promise<string[]> {
  if (weekNumbers.length === 0) return [];

  const weekRows = await db
    .select({ id: weeklyPlans.id })
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.trainingPlanId, trainingPlanId),
        inArray(weeklyPlans.weekNumber, weekNumbers)
      )
    );

  if (weekRows.length === 0) return [];

  const weeklyPlanIds = weekRows.map(w => w.id);

  const workoutRows = await db
    .select({ id: plannedWorkouts.id, workoutType: plannedWorkouts.workoutType })
    .from(plannedWorkouts)
    .where(inArray(plannedWorkouts.weeklyPlanId, weeklyPlanIds));

  return workoutRows
    .filter(w => w.workoutType !== "rest")
    .map(w => w.id);
}

/**
 * Find all active plans that need their next block enriched today.
 *
 * A plan needs enrichment when:
 *   - It has enrichedThroughWeek set (new enrichment architecture)
 *   - The calendar has passed the end of the last enriched block
 *   - More weeks exist beyond the enriched block
 *
 * Called daily by the scheduler.
 */
export async function findPlansNeedingEnrichment(): Promise<
  Array<{ planId: string; userId: string; nextWeeksToEnrich: number[] }>
> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Load all active plans using the enrichment architecture
  const activePlans = await db
    .select({
      id: trainingPlans.id,
      userId: trainingPlans.userId,
      totalWeeks: trainingPlans.totalWeeks,
      enrichedThroughWeek: trainingPlans.enrichedThroughWeek,
    })
    .from(trainingPlans)
    .where(
      and(
        eq(trainingPlans.status, "active"),
        isNotNull(trainingPlans.enrichedThroughWeek)
      )
    );

  const results: Array<{ planId: string; userId: string; nextWeeksToEnrich: number[] }> = [];

  for (const plan of activePlans) {
    const enrichedThrough = plan.enrichedThroughWeek as number;
    const totalWeeks = plan.totalWeeks ?? 0;

    if (enrichedThrough >= totalWeeks) continue; // Fully enriched

    // Find the last scheduled workout in the current enriched block
    // to determine if the calendar has passed it
    const currentBlockLastWeek = enrichedThrough;

    const lastWorkoutInBlock = await db
      .select({ scheduledDate: plannedWorkouts.scheduledDate })
      .from(plannedWorkouts)
      .innerJoin(weeklyPlans, eq(plannedWorkouts.weeklyPlanId, weeklyPlans.id))
      .where(
        and(
          eq(weeklyPlans.trainingPlanId, plan.id),
          eq(weeklyPlans.weekNumber, currentBlockLastWeek)
        )
      )
      .orderBy(desc(plannedWorkouts.scheduledDate))
      .limit(1)
      .then(r => r[0]);

    if (!lastWorkoutInBlock?.scheduledDate) continue;

    const blockEndDate = new Date(lastWorkoutInBlock.scheduledDate);
    blockEndDate.setHours(0, 0, 0, 0);

    // Enrich next block if we've reached the end of the current block
    if (today >= blockEndDate) {
      const nextStart = enrichedThrough + 1;
      const nextEnd = Math.min(enrichedThrough + 2, totalWeeks);
      const nextWeeks: number[] = [];
      for (let w = nextStart; w <= nextEnd; w++) nextWeeks.push(w);

      results.push({
        planId: plan.id,
        userId: plan.userId,
        nextWeeksToEnrich: nextWeeks,
      });
    }
  }

  return results;
}

/**
 * Update the enrichedThroughWeek marker on a training plan after successful enrichment.
 */
export async function markPlanEnrichedThroughWeek(
  planId: string,
  throughWeek: number
): Promise<void> {
  await db
    .update(trainingPlans)
    .set({ enrichedThroughWeek: throughWeek })
    .where(eq(trainingPlans.id, planId));
}

/**
 * Training Plan AI Generator Service
 * 
 * Generates personalized training plans using OpenAI GPT-4.
 * Plans are tailored to user's fitness level, goals, and current training load.
 */

import { db } from "./db";
import { trainingPlans, weeklyPlans, plannedWorkouts, users, runs, goals, connectedDevices, planAdaptations, sessionInstructions, coachingSessionEvents } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { getCurrentFitness } from "./fitness-service";
import { HeartRateZones } from "./heart-rate-zones"; // Assuming we create this utility
import { generateSessionInstructions } from "./session-coaching-service";
import { getRunnerProfile, runnerProfileBlock } from "./runner-profile-service";
import { assessOrientationNeed, generateOrientationCoachingPrompt, type OrientationAssessment } from "./orientation-session-service";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==================== TRAINING PLAN TEMPLATES ====================

interface WorkoutTemplate {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  workoutType: string;
  intensity: string;
  description: string;
  instructions?: string;
  distance?: number;
  duration?: number;
  targetPace?: string;
  intervalCount?: number;
  sessionGoal?: string; // "build_fitness", "develop_speed", "active_recovery", "endurance"
  sessionIntent?: string;
}

/**
 * Generate AI-powered training plan
 */
interface RegularSessionInput {
  name: string;
  dayOfWeek: number;   // 0=Sun … 6=Sat
  timeHour: number;
  timeMinute: number;
  distanceKm: number;
  countsTowardWeeklyTotal: boolean;
}

export interface InjuryInput {
  bodyPart: string;
  status: string; // "active" | "recovering" | "healed"
  notes?: string;
}

/**
 * Calculate how many weeks to generate per block based on sessions/week.
 * Targets ~15 sessions per block — a sweet spot for quality, variety, and token budget.
 *
 *   2 sessions/week → 6-week block  (12 sessions)
 *   3 sessions/week → 5-week block  (15 sessions)
 *   4 sessions/week → 4-week block  (16 sessions)
 *   5 sessions/week → 3-week block  (15 sessions)
 *   6-7 sessions/week → 2-week block (12-14 sessions)
 */
export function getBlockSize(daysPerWeek: number): number {
  if (daysPerWeek <= 2) return 6;
  if (daysPerWeek === 3) return 5;
  if (daysPerWeek === 4) return 4;
  if (daysPerWeek === 5) return 3;
  return 2; // 6-7 days/week
}

export async function generateTrainingPlan(
  userId: string,
  goalType: string, // 5k, 10k, half_marathon, marathon, ultra
  targetDistance: number, // km
  targetTime?: number, // seconds
  targetDate?: Date,
  experienceLevel: string = "intermediate", // beginner, intermediate, advanced
  daysPerWeek: number = 4,
  regularSessions: RegularSessionInput[] = [],
  firstSessionStart: string = "flexible",  // "today" | "tomorrow" | "flexible"
  durationWeeks?: number,  // user-selected plan duration (takes priority over targetDate)
  injuries: InjuryInput[] = [],
  userTimezone: string | null = null,  // IANA timezone e.g. "Pacific/Auckland"
  goalId: string | null = null,  // optional: fetch goal description/notes to personalise prompt
  overrideAge: number | null = null,  // demographics from Android (used if DB profile is missing)
  overrideGender: string | null = null,
  overrideHeight: number | null = null,  // cm
  overrideWeight: number | null = null,  // kg
  isPreEventPlan: boolean = false  // true = experienced runner doing a pre-race sharpening block
): Promise<string> {
  try {
    // Get user profile
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // ── Detect device connectivity and HR history ──
    const connectedDevice = await db
      .select()
      .from(connectedDevices)
      .where(eq(connectedDevices.userId, userId))
      .limit(1);
    const hasConnectedDevice = connectedDevice.length > 0;

    // Get current fitness
    const fitness = await getCurrentFitness(userId);

    // Get recent run history (last 90 days — wider window gives better baselines)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const allRecentRuns = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          gte(runs.completedAt, ninetyDaysAgo)
        )
      )
      .orderBy(desc(runs.completedAt))
      .limit(100); // Fetch more to filter for GPS data
    
    // Filter: ONLY use runs from AI Run Coach app (exclude all Garmin-synced activities)
    // Garmin synced runs have significantly less data and taint the AI analysis
    // We only use them for personal best tracking in My Data
    const aiRunCoachRuns = allRecentRuns.filter(r => {
      // Include runs that:
      // 1. Have NO externalSource (native AI Run Coach runs)
      // 2. Have externalSource === 'airuncoach' (explicit AI Run Coach source)
      // Exclude ALL runs where externalSource === 'garmin' (even with GPS data)
      return !r.externalSource || r.externalSource === 'airuncoach';
    });
    
    // Limit to maximum 30 runs for AI coaching plan analysis (within 90-day window)
    const recentRuns = aiRunCoachRuns.slice(0, 30);

    // ── Check if user has HR data in recent runs ──
    const runsWithHRData = recentRuns.filter(r => r.heartRate && r.heartRate > 0);
    const hasHRHistory = runsWithHRData.length >= 3; // At least 3 runs with HR data

    // Determine which HR zone scenario applies
    let hrZoneScenario: 'device' | 'history' | 'effort' = 'effort'; // Default to effort-based
    if (hasConnectedDevice) {
      hrZoneScenario = 'device';
    } else if (hasHRHistory) {
      hrZoneScenario = 'history';
    }

    // ── Weekly mileage base (last 30 days only to reflect current load)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const runsLast30 = recentRuns.filter(r => r.completedAt && new Date(r.completedAt) >= thirtyDaysAgo);
    const totalDistanceLast30 = runsLast30.reduce((sum, r) => sum + (r.distance || 0), 0);
    // Fallback when no run history — scale to the event type so the AI anchors volume correctly.
    // A 20km/week fallback is appropriate for 5k/10k/half but far too low for ultra/marathon events;
    // using it for a 50km+ goal causes the AI to produce tiny session distances.
    const noHistoryFallbackKm = (() => {
      if (goalType === 'ultra' || targetDistance > 42.2) return 45;
      if (goalType === 'marathon') return 30;
      if (goalType === 'half_marathon') return 20;
      return 20;
    })();
    const weeklyMileageBase = runsLast30.length > 0 ? (totalDistanceLast30 / 4) : noHistoryFallbackKm;

    // ── Helper: parse a "M:SS/km" pace string into total seconds per km
    const parsePaceSecs = (pace: string | null | undefined): number | null => {
      if (!pace) return null;
      const parts = pace.replace(/\/km.*/, "").trim().split(":");
      if (parts.length !== 2) return null;
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (isNaN(m) || isNaN(s)) return null;
      return m * 60 + s;
    };

    // ── Average pace across all recent runs with valid pace data
    const paceValues = recentRuns.map(r => parsePaceSecs(r.avgPace)).filter((v): v is number => v !== null);
    const avgPaceSecs = paceValues.length > 0 ? paceValues.reduce((a, b) => a + b, 0) / paceValues.length : null;
    const avgPaceStr = avgPaceSecs != null
      ? `${Math.floor(avgPaceSecs / 60)}:${String(Math.round(avgPaceSecs % 60)).padStart(2, "0")}/km`
      : null;

    // ── Best pace in any recent run
    const bestPaceSecs = paceValues.length > 0 ? Math.min(...paceValues) : null;
    const bestPaceStr = bestPaceSecs != null
      ? `${Math.floor(bestPaceSecs / 60)}:${String(Math.round(bestPaceSecs % 60)).padStart(2, "0")}/km`
      : null;

    // ── Runs closest to the goal distance (±20%) — e.g. 4–6km runs for a 5k goal
    const distanceTolerance = targetDistance * 0.20;
    const similarDistanceRuns = recentRuns.filter(r => {
      const km = r.distance ? r.distance / 1000 : (r.distanceInMeters ? r.distanceInMeters / 1000 : null);
      return km != null && Math.abs(km - targetDistance) <= distanceTolerance;
    });

    // Average time at goal distance (for e.g. "how long does this runner currently take to run 5km?")
    const goalDistanceTimes = similarDistanceRuns
      .map(r => r.duration ? r.duration / 1000 : null) // duration stored in ms → convert to seconds
      .filter((v): v is number => v !== null && v > 0);
    const avgTimeAtGoalDistanceSecs = goalDistanceTimes.length > 0
      ? goalDistanceTimes.reduce((a, b) => a + b, 0) / goalDistanceTimes.length
      : null;
    const avgTimeAtGoalDistanceStr = avgTimeAtGoalDistanceSecs != null
      ? `${Math.floor(avgTimeAtGoalDistanceSecs / 60)}:${String(Math.round(avgTimeAtGoalDistanceSecs % 60)).padStart(2, "0")}`
      : null;

    // Best time at goal distance
    const bestTimeAtGoalSecs = goalDistanceTimes.length > 0 ? Math.min(...goalDistanceTimes) : null;
    const bestTimeAtGoalStr = bestTimeAtGoalSecs != null
      ? `${Math.floor(bestTimeAtGoalSecs / 60)}:${String(Math.round(bestTimeAtGoalSecs % 60)).padStart(2, "0")}`
      : null;

    // ── Last 3 runs for baseline snapshot ──
    const last3Runs = recentRuns.slice(0, 3);
    let daysSpanBetweenFirstAndLatest: number | null = null;
    if (last3Runs.length >= 2) {
      const firstRunDate = new Date(last3Runs[last3Runs.length - 1].completedAt || 0);
      const latestRunDate = new Date(last3Runs[0].completedAt || 0);
      daysSpanBetweenFirstAndLatest = Math.floor(
        (latestRunDate.getTime() - firstRunDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Average data from last 3 runs (for coaching summary)
    const last3AvgData = last3Runs.length > 0 ? {
      count: last3Runs.length,
      avgDistance: last3Runs.reduce((sum, r) => sum + (r.distance || 0), 0) / last3Runs.length,
      avgPace: last3Runs
        .map(r => parsePaceSecs(r.avgPace))
        .filter((v): v is number => v !== null)
        .reduce((a, b, _, arr) => a + b / arr.length, 0),
      avgHeartRate: last3Runs
        .filter(r => r.heartRate && r.heartRate > 0)
        .reduce((sum, r) => sum + (r.heartRate || 0), 0) / Math.max(last3Runs.length, 1),
      daysSpan: daysSpanBetweenFirstAndLatest,
    } : null;

    // ── Fetch linked goal description/notes/event for extra personalisation ──
    let goalDescription: string | null = null;
    let goalNotes: string | null = null;
    let goalEventName: string | null = null;
    let goalEventLocation: string | null = null;
    if (goalId) {
      try {
        const goalRecord = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
        if (goalRecord[0]) {
          goalDescription = goalRecord[0].description || null;
          goalNotes = goalRecord[0].notes || null;
          goalEventName = goalRecord[0].eventName || null;
          goalEventLocation = goalRecord[0].eventLocation || null;
        }
      } catch (goalErr) {
        console.warn(`[Training Plan] Could not fetch goal ${goalId} for prompt:`, goalErr);
      }
    }

    // ── Calculate BMI from user profile — fall back to Android/iOS-sent overrides if DB is empty ──
    // Guard against NaN from bad override strings (e.g. Number("") = 0, Number("abc") = NaN)
    const rawHeight = user[0]?.height || overrideHeight;
    const rawWeight = user[0]?.weight || overrideWeight;
    const userHeight = (rawHeight != null && !isNaN(Number(rawHeight)) && Number(rawHeight) > 0) ? Number(rawHeight) : 170;
    const userWeight = (rawWeight != null && !isNaN(Number(rawWeight)) && Number(rawWeight) > 0) ? Number(rawWeight) : 70;
    const bmi = userWeight / ((userHeight / 100) ** 2);
    const bmiCategory = bmi < 18.5 ? 'underweight' : bmi < 25 ? 'normal' : bmi < 30 ? 'overweight' : 'obese';

    // ── Pace trend: compare oldest 3 vs newest 3 runs
    let paceTrend: string | null = null;
    if (paceValues.length >= 6) {
      const newestAvg = paceValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const oldestAvg = paceValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const diffSecs = oldestAvg - newestAvg; // positive = runner is getting faster
      if (diffSecs > 15) paceTrend = `improving (≈${Math.round(diffSecs)}s/km faster than 3 months ago)`;
      else if (diffSecs < -15) paceTrend = `declining (≈${Math.round(Math.abs(diffSecs))}s/km slower than 3 months ago)`;
      else paceTrend = "consistent";
    }

    // Calculate plan duration
    // Priority: durationWeeks (user-selected) > targetDate > default based on goal/experience
    let weeksUntilTarget = 0;
    if (durationWeeks && durationWeeks > 0) {
      weeksUntilTarget = durationWeeks;
    } else if (targetDate && targetDate instanceof Date && !isNaN(targetDate.getTime())) {
      const calculatedWeeks = Math.ceil((targetDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000));
      // Ensure result is a valid positive number, fallback to default if calculation failed
      weeksUntilTarget = (calculatedWeeks && calculatedWeeks > 0) ? calculatedWeeks : getPlanDuration(goalType, experienceLevel);
    } else {
      weeksUntilTarget = getPlanDuration(goalType, experienceLevel);
    }
    
    // Safety check: ensure weeksUntilTarget is a valid positive integer
    if (!Number.isInteger(weeksUntilTarget) || weeksUntilTarget <= 0) {
      weeksUntilTarget = getPlanDuration(goalType, experienceLevel);
    }
    
    // Rolling block: generate only a block of weeks now, rest generated later as the athlete progresses.
    // weeksUntilTarget is the FULL plan duration (stored in totalWeeks).
    // weeksToGenerate is how many weeks we actually ask OpenAI to produce in this call.
    const blockSize = getBlockSize(daysPerWeek);
    const weeksToGenerate = Math.min(blockSize, weeksUntilTarget);
    const isRollingPlan = weeksUntilTarget > weeksToGenerate;

    console.log(`[Training Plan] Duration: durationWeeks=${durationWeeks}, targetDate=${targetDate}, calculated weeksUntilTarget=${weeksUntilTarget}, blockSize=${blockSize}, weeksToGenerate=${weeksToGenerate}`);

    // Calculate user age for HR zone calculations — fall back to Android/iOS-sent override if DOB not set.
    // Guard against NaN: an invalid DOB string (e.g. empty string, malformed date) causes
    // Math.floor(NaN) = NaN which propagates into maxHR → hrZoneMinBpm/hrZoneMaxBpm → Postgres
    // throws "invalid input syntax for type integer: NaN".
    const userAge = (() => {
      if (user[0]?.dob) {
        const ms = new Date(user[0].dob).getTime();
        if (!isNaN(ms)) {
          const calculated = Math.floor((Date.now() - ms) / 31557600000);
          if (calculated > 0 && calculated < 120) return calculated;
        }
      }
      // Fall back to client-sent age, then safe default
      const fallback = overrideAge && !isNaN(overrideAge) && overrideAge > 0 ? overrideAge : 30;
      return fallback;
    })();

    // ========== PHASE 1-3: ORIENTATION SESSION ASSESSMENT ==========
    // Check if user needs an orientation session to gauge fitness before generating main plan
    let orientationAssessment: OrientationAssessment | null = null;
    const userDemographics = {
      age: userAge,
      gender: user[0]?.gender || overrideGender,
      height: userHeight,
      weight: userWeight,
    };
    
    try {
      orientationAssessment = await assessOrientationNeed(
        userId,
        userDemographics,
        experienceLevel,
        goalType
      );
      
      if (orientationAssessment.needsOrientation) {
        console.log(`[Orientation] User requires orientation session:`, {
          reason: orientationAssessment.reason,
          distance: orientationAssessment.recommendedDistance,
          pace: orientationAssessment.recommendedPace,
          riskFactors: orientationAssessment.riskFactors,
        });
      }
    } catch (orientationErr) {
      console.warn(`[Orientation] Error assessing orientation need, continuing without orientation:`, orientationErr);
      orientationAssessment = { needsOrientation: false, recommendedDistance: 0 };
    }
    const maxHR = HeartRateZones.getMaxHeartRate(userAge);

    // Build context for AI
    const context = {
      user: {
        name: user[0]?.name,
        gender: user[0]?.gender,
        age: userAge,
        height: userHeight,
        weight: userWeight,
        bmi: bmi.toFixed(1),
        bmiCategory,
        fitnessLevel: user[0]?.fitnessLevel || experienceLevel,
        maxHeartRate: maxHR,
      },
      deviceConnectivity: {
        hasConnectedDevice,
        deviceType: hasConnectedDevice ? connectedDevice[0]?.deviceType : null,
      },
      hrZoneScenario,
      hasHRHistory,
      fitness: fitness ? {
        ctl: fitness.ctl,
        atl: fitness.atl,
        tsb: fitness.tsb,
        status: fitness.status,
      } : null,
      last3Runs: last3AvgData,
      recentActivity: {
        totalRunsOnRecord: recentRuns.length,
        runsLast30Days: runsLast30.length,
        runsLast90Days: recentRuns.length,
        runsWithHRData: runsWithHRData.length,
        avgWeeklyDistance: weeklyMileageBase,
        avgPace: avgPaceStr || recentRuns[0]?.avgPace,
        bestPace: bestPaceStr,
        avgTimeAtGoalDistance: avgTimeAtGoalDistanceStr,
        bestTimeAtGoalDistance: bestTimeAtGoalStr,
        similarDistanceRunsFound: similarDistanceRuns.length,
        paceTrend,
      },
      goal: {
        type: goalType,
        distance: targetDistance,
        targetTime,
        targetDate: targetDate?.toISOString(),
        weeksAvailable: weeksUntilTarget,
      },
      preferences: {
        daysPerWeek,
        includeSpeedWork: true,
        includeHillWork: true,
        includeLongRuns: true,
      },
      regularSessions: regularSessions.length > 0 ? regularSessions.map(s => {
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const time = `${String(s.timeHour).padStart(2,"0")}:${String(s.timeMinute).padStart(2,"0")}`;
        return {
          name: s.name,
          day: dayNames[s.dayOfWeek] ?? `Day ${s.dayOfWeek}`,
          time,
          distanceKm: s.distanceKm,
          countsTowardWeeklyTotal: s.countsTowardWeeklyTotal,
        };
      }) : undefined,
    };

    // hasRunHistory must be declared before runnerProfileSection uses it
    const hasRunHistory = recentRuns.length > 0;

    // Gender: prefer DB value, then Android override
    const userGender = user[0]?.gender || overrideGender || 'Not specified';

    // Build personalized runner profile section  
    const runnerProfileSection = `
Runner Profile (Personal Details):
- Name: ${user[0]?.name || 'Runner'}
- Gender: ${userGender}
- Age: ${userAge} years old
- Height: ${userHeight}cm
- Weight: ${userWeight}kg
- BMI: ${bmi.toFixed(1)} (${bmiCategory}) — tailor recovery and injury prevention strategies to this metric
- Fitness level: ${experienceLevel}
- Training days per week: ${daysPerWeek}
- Current fitness (CTL): ${fitness?.ctl || 'N/A'}
- Training status: ${fitness?.status || 'N/A'}

${hasRunHistory ? `Recent Running History Summary:
- Total runs on record: ${recentRuns.length}
- Runs in last 30 days: ${runsLast30.length}
- Weekly mileage (last 30 days): ${weeklyMileageBase.toFixed(1)}km/week

Last 3 Run Sessions Snapshot:
- Number of recent sessions: ${last3AvgData?.count || 0}
- Average distance per run: ${last3AvgData ? (last3AvgData.avgDistance / 1000).toFixed(2) : '0'}km
- Average pace: ${last3AvgData ? Math.floor(last3AvgData.avgPace / 60) + ':' + String(Math.round(last3AvgData.avgPace % 60)).padStart(2, '0') : 'N/A'}/km
- Time span between sessions: ${last3AvgData?.daysSpan || 0} days

Pace Trend: ${paceTrend || 'Not enough data yet'}` : isPreEventPlan ? `IMPORTANT: This runner has NO previous run data recorded in this app — they are a NEW USER.
However, they have explicitly indicated this is a PRE-EVENT SHARPENING BLOCK, meaning they are already fully capable of the event distance and are using this app for the first time in the weeks leading up to their race.
DO NOT treat the absence of run data as evidence of low fitness. Instead:
- Assume the runner is race-ready and capable of the event distance right now
- Start at full training volume appropriate for their stated fitness level (${experienceLevel})
- Focus on race-pace conditioning, sharpening speed, and taper strategy
- Do NOT include baseline-building or "establish current fitness" sessions — they are already fit
- Use their stated fitness level (${experienceLevel}) and target time (if provided) to set all paces` : (() => {
  const isLongDistanceGoal = targetDistance > 10 || ['ultra', 'marathon', 'half_marathon', '10k'].includes(goalType);

  if (isLongDistanceGoal) {
    // For any goal over 10km, build the optimal plan for the goal — fitness level informs PACE only.
    // Anyone targeting >10km is not a beginner runner. The adaptive coaching system handles
    // session-level pullbacks if the runner struggles in practice.
    return `IMPORTANT: This runner has NO previous run data recorded in this app — they are NEW to this app only.
Build the OPTIMAL plan for this ${targetDistance}km goal. Key principle: fitness level (${experienceLevel}) informs training PACES and session intensity only — it does NOT cap session distances or weekly volume.
- Session distances and weekly volume must be built to genuinely achieve the ${targetDistance}km goal within ${weeksUntilTarget} weeks — do NOT water down distances based on fitness level
- Start at ~${Math.round(weeklyMileageBase)}km/week and build to meet the event requirements
- Paces: estimate appropriate training paces for a ${experienceLevel} runner — adjust effort levels to match the stated level, but keep distances true to the goal
- The adaptive coaching system will adjust individual sessions based on actual performance — build the plan for the goal, not a conservative version of it`;
  } else {
    // For ≤10km goals, fitness level can influence starting volume as well as paces
    return `IMPORTANT: This runner has NO previous run data recorded in this app.
Use their stated fitness level (${experienceLevel}) and the ${weeklyMileageBase.toFixed(0)}km/week baseline to set appropriate starting volume and paces.
Build progressively toward the ${targetDistance}km goal.`;
  }
})()}
`;

    // Generate plan with OpenAI
    const prompt = `═══════════════════════════════════════════════════════════════
COACHING COMMISSION — ${weeksUntilTarget}-WEEK PERSONALISED TRAINING PLAN
${isRollingPlan ? `BLOCK 1 OF ${Math.ceil(weeksUntilTarget / weeksToGenerate)} — WEEKS 1–${weeksToGenerate}` : ''}
═══════════════════════════════════════════════════════════════

You are designing a bespoke training plan for the athlete described below. You have full creative and technical authority as a coach — choose the training philosophy, session types, periodisation model, and pacing approach that YOU believe gives this specific athlete the best possible outcome. This is not a template to fill in. There is no prescribed methodology. You are the expert.
${isRollingPlan ? `
📋 ROLLING BLOCK PLAN: The full programme is ${weeksUntilTarget} weeks. You are generating Block 1 — weeks 1 to ${weeksToGenerate}. Subsequent blocks will be generated as the athlete progresses, incorporating their real performance data. Design this block knowing it is the opening phase of a ${weeksUntilTarget}-week journey. Establish the right physiological foundation and make explicit in your weekDescription fields what training phase each week belongs to (so subsequent blocks can continue the progression coherently).
` : ''}${isPreEventPlan ? `
⚡ CONTEXT — PRE-EVENT SHARPENING BLOCK: This runner has specifically confirmed they are already capable of the event distance and are ${weeksUntilTarget} weeks from race day. This is a race-preparation block, not a build-up plan. Design accordingly — race-pace confidence, sharpening, taper strategy.

⚠️ CRITICAL LONG-RUN RULE FOR PRE-EVENT PLANS: "Taper" means REDUCING from a high volume, NOT starting at low distances. Long runs in a pre-event block must still be meaningful:
- In weeks 1–${Math.max(1, weeksUntilTarget - 2)}: the long run should be approximately ${Math.round(targetDistance * 0.70)}–${Math.round(targetDistance * 0.85)}km (70–85% of race distance)
- In the penultimate week: approximately ${Math.round(targetDistance * 0.50)}–${Math.round(targetDistance * 0.65)}km (50–65% of race distance)
- In the final race week: a short confidence run of ${Math.round(targetDistance * 0.25)}–${Math.round(targetDistance * 0.35)}km
A long run of ${Math.round(targetDistance * 0.3)}km or less in a pre-event plan for a ${targetDistance}km race is UNACCEPTABLE — the athlete needs race-distance confidence, not beginner-level jogs.
` : ''}
━━━ THE ATHLETE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${runnerProfileSection}

━━━ THE GOAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Event: ${goalType.toUpperCase()} — ${targetDistance}km
${goalEventName ? `Event name: ${goalEventName}${goalEventLocation ? ` in ${goalEventLocation}` : ''}` : ''}
${goalDescription ? `Runner's description: ${goalDescription}` : ''}
${goalNotes ? `Runner's own notes: "${goalNotes}" — weave this context into your coaching language throughout the plan` : ''}
${targetDate ? `Race date: ${targetDate.toDateString()} (${weeksUntilTarget} weeks away)` : `Timeline: ${weeksUntilTarget} weeks`}
${targetTime ? (() => {
  const goalPaceSecs = Math.round(targetTime / targetDistance);
  const goalPaceStr = `${Math.floor(goalPaceSecs / 60)}:${String(goalPaceSecs % 60).padStart(2, "0")}/km`;
  const currentPaceStr = avgPaceStr || "not yet established";
  const currentTimeStr = avgTimeAtGoalDistanceStr || "unknown";
  return `Target finish time: ${Math.floor(targetTime / 60)}:${String(Math.round((targetTime % 60))).padStart(2,'0')} — equivalent to a ${goalPaceStr} goal pace
Current performance at ${targetDistance}km: ${avgTimeAtGoalDistanceSecs ? `averages ${currentTimeStr} (${currentPaceStr}/km)` : `extrapolate from average pace of ${currentPaceStr}`}
Apply your coaching expertise to determine appropriate training paces across all session types based on this athlete's current fitness and target goal.`;
})() : `No target time set — design for goal completion and optimal performance at this athlete's current fitness level.`}

━━━ CURRENT PERFORMANCE DATA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${hasRunHistory ? `Run History (last 90 days — ${recentRuns.length} sessions):
- Weekly volume (last 30 days): ${weeklyMileageBase.toFixed(1)}km/week
- Sessions last 30 days: ${runsLast30.length}
${avgPaceStr ? `- Average pace: ${avgPaceStr}/km` : ''}
${bestPaceStr ? `- Best recent pace: ${bestPaceStr}/km` : ''}
${paceTrend ? `- Pace trend: ${paceTrend}` : ''}
${fitness?.ctl ? `- Chronic Training Load (CTL): ${fitness.ctl}` : ''}
${fitness?.status ? `- Training status: ${fitness.status}` : ''}
${similarDistanceRuns.length > 0 ? `
Performance at goal distance (${targetDistance}km — ${similarDistanceRuns.length} sessions found):
${avgTimeAtGoalDistanceStr ? `- Average completion time: ${avgTimeAtGoalDistanceStr}` : ''}
${bestTimeAtGoalStr ? `- Personal best: ${bestTimeAtGoalStr}` : ''}` : `
No recorded sessions at exactly ${targetDistance}km — extrapolate from average pace and weekly volume.`}` : isPreEventPlan ? `NEW TO THIS APP — no run history in this system. The athlete has confirmed this is a pre-event block; they are already race-capable. Do NOT interpret missing data as low fitness.` : `NEW TO THIS APP — no run history yet. Design a plan appropriate for a ${experienceLevel} runner targeting ${targetDistance}km. The adaptive coaching system will refine future plan adaptations as real performance data accumulates.`}
${targetDate ? `- Race date: ${targetDate.toDateString()}` : ''}

${(goalType === 'custom' && targetDistance > 21.1 && targetDistance <= 42.2) ? `
━━━ CUSTOM MID-DISTANCE EVENT CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━

This is a ${targetDistance}km custom event — between half marathon and marathon distance. Standard half marathon or marathon training templates don't directly apply. Apply your coaching expertise to determine the right approach for this specific distance and this specific athlete. Consider what peak long run distances, weekly volumes, and session composition are genuinely appropriate for ${targetDistance}km preparation within ${weeksUntilTarget} weeks.
` : ''}
${(goalType === 'ultra' || targetDistance > 42.2) ? `
━━━ ULTRA / LONG-DISTANCE COACHING CONTEXT ━━━━━━━━━━━━━━━━━━━━

This is a ${targetDistance}km ultra/long-distance event. Road-racing training principles do not directly translate. Key considerations for your coaching design:
- Peak long run distances typically need to approach 55-65% of event distance to build the fatigue resistance required (~${Math.round(targetDistance * 0.55)}–${Math.round(targetDistance * 0.65)}km for this event)
- Time-on-feet takes precedence over pace — easy and long runs should dominate overall volume
- Back-to-back long run weekends are a primary ultra training tool — they build fatigue resistance that single long runs cannot replicate
- Ultra courses are typically hilly — hillwork is relevant
- Starting from this athlete's current ${Math.round(weeklyMileageBase)}km/week, design the volume build you believe is appropriate to prepare them for this event in ${weeksUntilTarget} weeks
Apply your expertise to design the session composition, volume progression, and periodisation you genuinely believe is optimal for this ultra goal.
` : (targetDistance > 5 && targetDistance <= 42.2) ? `
━━━ LONG RUN REQUIREMENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is a ${targetDistance}km race goal. Long run distances must be proportionate to the race distance — a long run that is only 30–40% of the event distance is NOT adequate training. Use the following as MINIMUM benchmarks for the longest session in this plan:

${targetDistance >= 21 && targetDistance <= 22 ? `HALF MARATHON (${targetDistance}km):
- Peak long run (non-taper weeks): ${Math.round(targetDistance * 0.80)}–${Math.round(targetDistance * 0.90)}km (i.e. ~${Math.round(targetDistance * 0.80)}–${Math.round(targetDistance * 0.90)}km — this is a NON-NEGOTIABLE minimum for adequate half marathon preparation)
- Early plan long runs: build from ~${Math.round(targetDistance * 0.55)}km toward the peak
- Final taper long run (race week): ${Math.round(targetDistance * 0.25)}–${Math.round(targetDistance * 0.35)}km only
A peak long run shorter than ${Math.round(targetDistance * 0.70)}km for a half marathon plan is inadequate and must NOT occur.` : targetDistance >= 38 && targetDistance <= 44 ? `MARATHON (${targetDistance}km):
- Peak long run: ${Math.round(targetDistance * 0.72)}–${Math.round(targetDistance * 0.82)}km (i.e. ~${Math.round(targetDistance * 0.72)}–${Math.round(targetDistance * 0.82)}km)
- Early plan long runs: build from ~${Math.round(targetDistance * 0.45)}km toward the peak
- Final taper long run: ${Math.round(targetDistance * 0.25)}–${Math.round(targetDistance * 0.35)}km
A peak long run shorter than ${Math.round(targetDistance * 0.65)}km for a marathon plan is inadequate.` : targetDistance >= 9 && targetDistance <= 12 ? `10KM GOAL (${targetDistance}km):
- Peak long run: ${Math.round(targetDistance * 1.2)}–${Math.round(targetDistance * 1.5)}km (for a 10km race, the long run should EXCEED race distance — e.g. 12–15km)
- This builds aerobic endurance well beyond race requirements, which is standard 10km coaching practice
A peak long run shorter than ${Math.round(targetDistance * 0.9)}km for a 10km plan is inadequate.` : `RACE GOAL (${targetDistance}km):
- Peak long run: ${Math.round(targetDistance * 0.75)}–${Math.round(targetDistance * 0.95)}km at minimum
- A peak long run shorter than ${Math.round(targetDistance * 0.65)}km for this goal is NOT sufficient training
- Long runs must progress meaningfully across the plan toward this peak`}
` : ''}

━━━ SCHEDULE & LIFESTYLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Training sessions per week: ${daysPerWeek}
Today: ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
First session: ${
  firstSessionStart === "today" ? `TODAY — first workout must be on or after today. Any sessions earlier in week 1 that fall before today should be omitted; week 1 may have fewer sessions than usual.` :
  firstSessionStart === "tomorrow" ? `TOMORROW — first workout on or after tomorrow. Omit any week-1 sessions that fall before tomorrow.` :
  "Flexible — schedule from the current calendar week, omitting any slots that have already passed."
}
${regularSessions.length > 0 ? `
Fixed Sessions Already in This Athlete's Schedule:
${regularSessions.map(s => {
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const time = `${String(s.timeHour).padStart(2,"0")}:${String(s.timeMinute).padStart(2,"0")}`;
  return `- "${s.name}": ${dayNames[s.dayOfWeek]} at ${time}, ${s.distanceKm}km — ${s.countsTowardWeeklyTotal ? `counts toward the ${daysPerWeek} sessions/week total (integrate a coached session on this day that matches its intensity/goal)` : `BLOCKED DAY — do NOT schedule any coached session on this day; this prevents double-running`}`;
}).join("\n")}
` : ""}
━━━ HEALTH & INJURY CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${injuries && injuries.length > 0 ? `Active Health Considerations (athlete safety is the priority — design around these):
${injuries.map(i => {
  const statusLabel = i.status === 'recovering' || i.status === 'RECOVERING' ? 'Recovering' :
                     i.status === 'healed' || i.status === 'HEALED' ? 'Healed' :
                     i.status === 'chronic' || i.status === 'CHRONIC' ? 'Chronic' :
                     i.status === 'active' || i.status === 'ACTIVE' ? 'Active' : i.status;
  return `- ${i.bodyPart}: ${statusLabel}${i.notes ? ` — ${i.notes}` : ''}`;
}).join("\n")}

Apply appropriate load management: active/recovering = avoid stress to the affected area, substitute with low-impact alternatives; chronic = reduce intensity and impact; healed = gradual reintroduction, conservative volume progression. A plan that keeps this athlete healthy is always better than one that risks re-injury.` : `No current injuries or health limitations reported.`}

━━━ APP COACHING CAPABILITIES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The app delivers live AI coaching throughout every session. You can design sessions knowing we support:
- Real-time GPS pace and distance tracking with live audio coaching cues
- Heart rate zone monitoring with live alerts (when HR device is connected)
- Interval/rep detection and lap tracking with per-rep coaching messages
- Live pace deviation alerts when the athlete drifts off target
- Pre-run briefings personalised to each session
- Adaptive plan adjustments based on actual performance data from completed sessions

━━━ WHAT TO DELIVER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WEEK-BY-WEEK PROGRESSION — THIS IS THE MOST IMPORTANT QUALITY STANDARD:
Every week MUST be distinct. No two weeks should have identical sessions, distances, or intensity distribution. A plan where week 1 looks the same as week 8 is not a coaching plan — it is a repeated template and is unacceptable.

Your plan must demonstrate clear progressive overload and phase structure. Specifically:
- Weekly volume (totalDistance) must increase progressively across the plan — each phase should build, with a scheduled deload week (volume drops ~20-30%) at a strategically appropriate point
- Session types must evolve — early weeks establish aerobic base with easier sessions; middle weeks introduce and develop quality work; late weeks sharpen race-specific fitness
- Target paces within each session type should tighten progressively as the athlete's fitness improves
- Intensity distribution must shift across the plan — do not run the same mix of easy/tempo/interval sessions every week
${isRollingPlan
  ? `- This is Block 1 (weeks 1–${weeksToGenerate} of the full ${weeksUntilTarget}-week plan). End the block at a sensible phase transition point (e.g. end of base phase). Do NOT include a taper in this block — taper weeks will appear in the final block.`
  : isPreEventPlan
    ? `- PRE-EVENT BLOCK: Week 1 is near race-ready intensity with a long run of ${Math.round(targetDistance * 0.75)}–${Math.round(targetDistance * 0.85)}km. Progress through sharpening phases. Taper volume in the final 1-2 weeks only — earlier weeks must maintain near-full long-run distances. A weekly volume that is only beginner-level or a long run under ${Math.round(targetDistance * 0.55)}km in week 1 of a pre-event plan is completely wrong.`
    : `- Final 1-2 weeks MUST taper — reduced volume and intensity to arrive at the event fresh`}

NON-NEGOTIABLE STRUCTURAL CONSTRAINTS:
- Generate EXACTLY ${weeksToGenerate} weeks — every single week must be fully listed, no skipping or summarising
- Each week must have EXACTLY ${daysPerWeek} workouts (after accounting for any blocked days)
- Respect all fixed session scheduling rules above
- Honour all injury/health limitations — a conservative safe plan is always better than one that causes re-injury

Return your complete coaching plan as JSON with this structure:
{
  "planName": "A descriptive name reflecting this athlete's specific plan and approach",
  "totalWeeks": ${weeksToGenerate},
  "coachingProgrammeSummary": {
    "aiDeterminedFitnessLevel": "Your expert assessment of this athlete's actual fitness level based on all data provided",
    "coachingApproach": "1-2 sentences describing the training methodology/philosophy you have chosen for this athlete and why",
    "comment": "A personalised paragraph assessing this athlete — what you see in their data, what you are targeting, and how the plan is designed to get them there",
    "keyMetrics": {
      "estimatedAveragePace": "This athlete's comfortable aerobic training pace based on current fitness (not a PR pace)",
      "estimatedWeeklyMileage": "Peak weekly volume this plan builds toward — not the starting volume",
      "focusAreas": ["3-4 specific focus areas tailored to this athlete and their goal"]
    }
  },
  "weeks": [
    {
      "weekNumber": 1,
      "weekDescription": "Brief description of this week's training focus and intent",
      "totalDistance": 25.0,
      "focusArea": "What physiological quality this week develops",
      "intensityLevel": "Overall intensity descriptor for this week",
      "workouts": [
        {
          "dayOfWeek": 1,
          "workoutType": "easy",
          "distance": 6.0,
          "targetPace": "Pace appropriate for this session type and this athlete's current fitness",
          "intensity": "Your chosen intensity label for this session",
          "description": "Session name, personalised to this athlete and their goal — not a generic label",
          "instructions": "Detailed, specific coaching instructions for this session — reference the athlete's actual pace data, their goal, and explain why this session matters at this point in the plan"
        },
        {
          "dayOfWeek": 3,
          "workoutType": "tempo",
          "distance": 5.0,
          "targetPace": "Appropriate threshold pace for this athlete based on their goal and current fitness",
          "intensity": "z4",
          "description": "Personalised session description",
          "instructions": "Specific coaching instructions for this athlete"
        },
        {
          "dayOfWeek": 5,
          "workoutType": "intervals",
          "distance": 5.0,
          "targetPace": "Appropriate interval pace based on your coaching assessment",
          "intensity": "z5",
          "intervalCount": 6,
          "intervalDistanceMeters": 400,
          "intervalDurationSeconds": null,
          "description": "Personalised session description",
          "instructions": "Specific coaching instructions for this athlete"
        }
      ]
    }
  ]
}

IMPORTANT NOTES ON OUTPUT:
- workoutType is open — use whatever session classification you judge is right (e.g. "easy", "tempo", "intervals", "long_run", "fartlek", "strides", "progression_run", "hill_repeats", "race_pace", "recovery", "time_trial", "back_to_back_long", or any other type you deem appropriate). Use "rest" only for rest/off days.
- Instructions must be concise but personalised (2-3 sentences) — state the session's purpose, a specific target metric for this athlete, and what physiological adaptation it drives at this stage of the plan.
- The coachingApproach field should genuinely describe the methodology you have chosen (e.g. polarised training, threshold-focused, time-on-feet dominant, etc.) and your rationale for this athlete.
- weekDescription for each week MUST reflect what makes that specific week different — name the training phase (e.g. "Aerobic foundation", "Threshold introduction", "Volume peak", "Race sharpening", "Taper"). Do not use generic descriptions like "Continue building fitness".

STRUCTURAL CONSTRAINTS (these are non-negotiable for the app to function):
- Generate EXACTLY ${weeksToGenerate} weeks — every single week from 1 to ${weeksToGenerate} must be fully listed
- Each week must have EXACTLY ${daysPerWeek} workouts (after accounting for blocked days)
- The "totalWeeks" field in your JSON must be ${weeksToGenerate}
- Do not skip, summarise, or merge weeks

COACHING SUMMARY NOTES:
- coachingApproach: explain the training philosophy you have applied — this helps the athlete understand your coaching rationale
- estimatedWeeklyMileage: show the PEAK weekly volume this plan builds toward, not the starting volume
- For athletes with no previous run data: base your assessments on their stated fitness level and goal — do not default to conservative or beginner-level language unless genuinely warranted`;

    // Fetch AI runner profile for richer personalisation
    const aiRunnerProfile = await getRunnerProfile(userId).catch(() => null);

    const systemPromptContent = `You are an elite AI running coach with deep expertise in exercise physiology, training periodisation, injury prevention, and performance optimisation. You have coached athletes across all levels and distances — from first-time 5K runners to ultra marathon competitors.

You are NOT filling in a template or following a prescribed methodology. You are the expert making every decision: what training philosophy applies to this athlete, what session types they need, how to periodise their weeks, how to prescribe paces and intensity, and how to structure the plan to give them the best possible outcome.

You have access to the full spectrum of training science — polarised training, aerobic threshold development, high-intensity interval training, fatigue resistance, progressive overload, and adaptive periodisation. Apply whatever methodology you genuinely believe is optimal for this specific athlete and goal. Do not default to generic templates or one-size-fits-all structures.

Your coaching decisions should evolve with the athlete's data and the science. Every plan you design should reflect deep, personalised coaching judgement — not a formula.

Always respond with valid JSON only, no extra text.${runnerProfileBlock(aiRunnerProfile)}`;

    // Helper to call OpenAI — retries once with compact instructions if the first attempt is truncated
    const callOpenAI = async (compactMode = false): Promise<any> => {
      const userPrompt = compactMode
        ? prompt.replace(
            /- Instructions must be highly personalised[^\n]*/,
            '- Instructions: max 1 sentence — name the session type, target metric, and why this week. No padding.'
          )
        : prompt;

      const res = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPromptContent },
          { role: "user",   content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 32000,
      });

      const reason = res.choices[0].finish_reason;
      if (reason === 'length' && !compactMode) {
        console.warn(`[Training Plan] Response truncated on full mode — retrying in compact mode`);
        return callOpenAI(true);
      }
      if (reason === 'length' && compactMode) {
        throw new Error(`Training plan response truncated even in compact mode — plan is too large to generate in a single call. Consider reducing the number of weeks.`);
      }

      return res;
    };

    const response = await callOpenAI();

    let rawContent = response.choices[0].message.content || "{}";
    
    // Clean up the JSON response — remove markdown code blocks if present
    rawContent = rawContent.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
    
    let planData: any;
    try {
      planData = JSON.parse(rawContent);
    } catch (parseError: any) {
      // Log the problematic content for debugging
      console.error("Failed to parse plan JSON at position:", parseError.message);
      console.error("Raw content length:", rawContent.length);
      console.error("Content around error position (chars 14700-14900):", rawContent.substring(14700, 14900));
      
      // Try to fix common JSON issues like unescaped quotes and newlines
      try {
        let fixedContent = rawContent;
        // Replace unescaped newlines in string values (but keep actual JSON structure)
        fixedContent = fixedContent.replace(/:\s*"([^"]*)\n([^"]*)"/, ': "$1\\n$2"');
        // Escape unescaped quotes in the middle of strings
        fixedContent = fixedContent.replace(/([^\\])"([^,}\]]*[^\\])"([^,}\]]*)"/, '$1\\"$2\\"$3');
        
        planData = JSON.parse(fixedContent);
        console.log("Successfully recovered from JSON parse error using fallback fix");
      } catch (recoveryError: any) {
        throw new Error(`Invalid JSON from AI model: ${parseError.message}. Even after recovery attempt failed.`);
      }
    }

    // Validate and coerce plan data to ensure numeric fields are actually numbers
    if (!planData.weeks || !Array.isArray(planData.weeks)) {
      throw new Error("Invalid plan data: missing or invalid weeks array");
    }

    console.log(`[Training Plan] AI returned ${planData.weeks.length} weeks, expected ${weeksToGenerate} (block 1 of ${isRollingPlan ? Math.ceil(weeksUntilTarget / weeksToGenerate) : 1})`);

    // Coerce weeks data to correct types
    planData.weeks = planData.weeks.map((week: any) => ({
      ...week,
      weekNumber: parseInt(String(week.weekNumber), 10) || 1,
      totalDistance: parseFloat(String(week.totalDistance).replace(/[^\d.]/g, '')) || 0,
      workouts: Array.isArray(week.workouts) ? week.workouts.map((wo: any) => ({
        ...wo,
        dayOfWeek: parseInt(String(wo.dayOfWeek), 10) || 1,
        distance: parseFloat(String(wo.distance).replace(/[^\d.]/g, '')) || 0,
      })) : []
    }));

    // Enforce exact week count — AI sometimes returns wrong number of weeks
    if (planData.weeks.length < weeksToGenerate) {
      // NEVER silently copy weeks — that produces identical sessions across the plan.
      throw new Error(
        `Training plan incomplete: AI returned ${planData.weeks.length} weeks but ${weeksToGenerate} were requested. ` +
        `This usually means the response was truncated — please try again.`
      );
    } else if (planData.weeks.length > weeksToGenerate) {
      console.warn(`[Training Plan] AI returned more weeks (${planData.weeks.length}) than requested (${weeksToGenerate}). Trimming.`);
      planData.weeks = planData.weeks.slice(0, weeksToGenerate);
    }

    // Sanitise numeric fields before DB insert — Postgres rejects NaN for integer/real columns
    const safeTargetTime   = (targetTime != null && !isNaN(targetTime) && targetTime > 0) ? Math.round(targetTime) : null;
    const safeWeeklyMileage = (!isNaN(weeklyMileageBase) && weeklyMileageBase > 0) ? weeklyMileageBase : 20;
    const safeDaysPerWeek   = (!isNaN(daysPerWeek) && daysPerWeek >= 1) ? Math.round(daysPerWeek) : 4;

    // nextBlockAt: start of the last week of this block (i.e. when we should generate the next batch)
    // This gives the app a week's lead time — next block is ready before the athlete needs it.
    const nextBlockAt: Date | null = (() => {
      if (!isRollingPlan) return null;
      const today = userTimezone
        ? new Date(new Date().toLocaleDateString('en-CA', { timeZone: userTimezone }) + 'T00:00:00')
        : new Date();
      const daysSinceMonday = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - daysSinceMonday);
      // Trigger generation at the start of the final week of this block
      const triggerDate = new Date(weekStart);
      triggerDate.setDate(weekStart.getDate() + (weeksToGenerate - 1) * 7);
      return triggerDate;
    })();

    // Create training plan in database — totalWeeks is the FULL plan duration
    const plan = await db
      .insert(trainingPlans)
      .values({
        userId,
        goalType,
        targetDistance,
        targetTime: safeTargetTime,
        targetDate,
        totalWeeks: weeksUntilTarget,  // full plan duration
        experienceLevel,
        weeklyMileageBase: safeWeeklyMileage,
        daysPerWeek: safeDaysPerWeek,
        includeSpeedWork: true,
        includeHillWork: true,
        includeLongRuns: true,
        status: "active",
        aiGenerated: true,
        generatedThroughWeek: weeksToGenerate,  // how many weeks are actually in the DB now
        nextBlockAt,                             // when to generate the next block (null if full plan already generated)
      })
      .returning();

    const planId = plan[0].id;

    // Collects workout data as we insert them — passed to background AI generation
    const pendingSessionInstructions: Array<{
      workoutId: string;
      workoutType: string;
      intensity: string;
      sessionGoal?: string | null;
      sessionIntent?: string | null;
      intervalCount?: number | null;
      distance?: number | null;
      duration?: number | null;
    }> = [];

    // ========== PHASE 3: INSERT ORIENTATION SESSION IF NEEDED ==========
    // If user needs orientation, insert it as the very first workout (Week 1, Day 1)
    let weekOneInsertionIndex = 0; // Track if we inserted orientation
    if (orientationAssessment?.needsOrientation) {
      console.log(`[Orientation] Inserting orientation session as Week 1, Day 1...`);
      
      try {
        // Create Week 1 weekly plan for orientation
        const orientationWeek = await db
          .insert(weeklyPlans)
          .values({
            trainingPlanId: planId,
            weekNumber: 1,
            weekDescription: "Orientation & Fitness Assessment",
            totalDistance: orientationAssessment.recommendedDistance,
            focusArea: "Fitness Assessment",
            intensityLevel: "Assessment",
          })
          .returning();

        const weeklyPlanId = orientationWeek[0].id;

        // Calculate today's date for the orientation workout
        const todayInUserTz = userTimezone
          ? new Date(new Date().toLocaleDateString('en-CA', { timeZone: userTimezone }) + 'T00:00:00')
          : new Date();
        if (!userTimezone) todayInUserTz.setHours(0, 0, 0, 0);

        // Create orientation workout
        // Orientation sessions should be at TEMPO/THRESHOLD (Zone 3-4) to actually assess fitness
        // NOT Zone 2, which is too easy to reveal true fitness level
        const orientationWorkout = await db
          .insert(plannedWorkouts)
          .values({
            weeklyPlanId: weeklyPlanId,
            dayOfWeek: todayInUserTz.getDay(),
            scheduledDate: todayInUserTz,
            workoutType: "orientation",
            distance: orientationAssessment.recommendedDistance,
            targetPace: orientationAssessment.recommendedPace,
            intensity: "tempo", // Tempo/Threshold effort to assess actual fitness
            description: "Orientation Run: Establish Your Baseline Fitness",
            instructions: orientationAssessment.orientationBrief,
            effortDescription: "Steady tempo effort - challenging but sustainable (Zone 3-4)",
            sessionGoal: "assess_fitness",
            sessionIntent: "orientation_run",
            hrZoneNumber: 3, // Tempo zone instead of Zone 2
            hrZoneMinBpm: orientationAssessment.targetHeartRateZone ? Math.round(orientationAssessment.targetHeartRateZone.max) : undefined,
            hrZoneMaxBpm: orientationAssessment.targetHeartRateZone ? Math.round(orientationAssessment.targetHeartRateZone.max * 1.15) : undefined, // Zone 3-4 range
            hrZoneScenario: hrZoneScenario,
          })
          .returning();

        const orientationWorkoutId = orientationWorkout[0].id;
        console.log(`[Orientation] ✅ Orientation workout created: ${orientationWorkoutId}`);

        // Schedule session instructions generation for orientation
        pendingSessionInstructions.push({
          workoutId: orientationWorkoutId,
          workoutType: "orientation",
          intensity: "tempo",
          sessionGoal: "assess_fitness",
          sessionIntent: "orientation_run",
          distance: orientationAssessment.recommendedDistance,
        });

        weekOneInsertionIndex = 1; // Shift week numbering by 1
      } catch (orientationInsertErr) {
        console.error(`[Orientation] ❌ Error inserting orientation session, continuing without it:`, orientationInsertErr);
      }
    }

    // Create weekly plans and workouts
    for (const week of planData.weeks) {
      // weekNumber is NOT NULL integer — guard against AI returning undefined/NaN
      const safeWeekNumber = (typeof week.weekNumber === 'number' && !isNaN(week.weekNumber) && week.weekNumber > 0)
        ? Math.round(week.weekNumber) + weekOneInsertionIndex  // Shift week number if orientation was inserted
        : planData.weeks.indexOf(week) + 1 + weekOneInsertionIndex; // fallback: position in array + offset

      const weeklyPlan = await db
        .insert(weeklyPlans)
        .values({
          trainingPlanId: planId,
          weekNumber: safeWeekNumber,
          weekDescription: week.weekDescription,
          totalDistance: (week.totalDistance != null && !isNaN(week.totalDistance)) ? week.totalDistance : null,
          focusArea: week.focusArea,
          intensityLevel: week.intensityLevel,
        })
        .returning();

      const weeklyPlanId = weeklyPlan[0].id;

      // Create individual workouts
      for (const workout of week.workouts) {
        // ── Scheduled date calculation ──────────────────────────────────────
        // dayOfWeek: 0=Sun, 1=Mon, 2=Tue … 6=Sat (matches JS Date.getDay())
        //
        // Anchor to Monday of the current week so that week 1 aligns with the
        // real calendar week. For week N, advance (N-1) * 7 days then add the
        // day offset from Monday: ((dayOfWeek + 6) % 7) gives 0=Mon…6=Sun.
        //
        // Example — generated on Wednesday (today.getDay()=3):
        //   weekStart = this Monday
        //   week 1 Mon (dayOfWeek=1): weekStart + 0 = Mon  ← in the past, SKIP
        //   week 1 Wed (dayOfWeek=3): weekStart + 2 = Wed  ← today, KEEP
        //   week 1 Fri (dayOfWeek=5): weekStart + 4 = Fri  ← future, KEEP
        //   week 2 Mon (dayOfWeek=1): weekStart + 7 = next Mon ← KEEP

        // Use user's local timezone if provided, otherwise fall back to server UTC.
        // This prevents NZST (UTC+13) users getting last-week sessions when generating
        // at e.g. 10am Tuesday NZ time (which is still Monday UTC).
        const todayInUserTz = userTimezone
          ? new Date(new Date().toLocaleDateString('en-CA', { timeZone: userTimezone }) + 'T00:00:00')
          : new Date();
        if (!userTimezone) todayInUserTz.setHours(0, 0, 0, 0);
        const today = todayInUserTz;

        // Monday of the current week (in user's timezone)
        const daysSinceMonday = today.getDay() === 0 ? 6 : today.getDay() - 1;
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - daysSinceMonday);

        // Day offset from Monday (Mon=0, Tue=1 … Sun=6)
        const dayOffsetFromMonday = (workout.dayOfWeek + 6) % 7;

        const scheduledDate = new Date(weekStart);
        scheduledDate.setDate(
          weekStart.getDate() + ((week.weekNumber - 1) * 7) + dayOffsetFromMonday
        );

        // Skip week-1 workouts that fall before today — the user already
        // passed those days, so we just start from today onwards.
        if (week.weekNumber === 1 && scheduledDate < today) {
          continue;
        }

        // ── Parse HR zone from intensity field (z1-z5) and populate HR metadata ──
        const intensityStr = workout.intensity || '';
        const hrZoneMatch = intensityStr.match(/z(\d)/i);
        const hrZoneNumber = hrZoneMatch ? parseInt(hrZoneMatch[1], 10) : null;

        let hrZoneMinBpm: number | null = null;
        let hrZoneMaxBpm: number | null = null;
        let effortDescription: string | null = null;

        if (hrZoneNumber && hrZoneNumber >= 1 && hrZoneNumber <= 5) {
          const zoneRange = HeartRateZones.getZoneRange(hrZoneNumber, maxHR);
          // Guard: if maxHR was NaN (bad DOB), zone calculations also return NaN.
          // Postgres integer columns reject NaN — store null instead.
          hrZoneMinBpm = (zoneRange.min != null && !isNaN(zoneRange.min)) ? Math.round(zoneRange.min) : null;
          hrZoneMaxBpm = (zoneRange.max != null && !isNaN(zoneRange.max)) ? Math.round(zoneRange.max) : null;

          // Set effort description based on scenario
          if (hrZoneScenario === 'effort') {
            const zoneDesc = HeartRateZones.getZoneDescription(hrZoneNumber);
            effortDescription = zoneDesc.effortLabel;
          }
        }

        // Guard dayOfWeek: if AI returns a non-numeric value, default to Monday (1)
        const safeDay = (typeof workout.dayOfWeek === 'number' && !isNaN(workout.dayOfWeek))
          ? workout.dayOfWeek
          : 1;

        // Guard workout.distance — real column, rejects NaN; use null if AI omits it
        const safeDistance = (workout.distance != null && !isNaN(Number(workout.distance)) && Number(workout.distance) > 0)
          ? Number(workout.distance)
          : null;

        const plannedWorkoutResult = await db
          .insert(plannedWorkouts)
          .values({
            weeklyPlanId,
            trainingPlanId: planId,
            dayOfWeek: safeDay,
            scheduledDate,
            workoutType: workout.workoutType,
            distance: safeDistance,
            targetPace: workout.targetPace,
            intensity: workout.intensity,
            hrZoneNumber,
            hrZoneMinBpm,
            hrZoneMaxBpm,
            hrZoneScenario: hrZoneNumber ? (hrZoneScenario as 'device' | 'history' | 'effort') : null,
            effortDescription,
            description: workout.description,
            instructions: workout.instructions,
            isCompleted: false,
            sessionGoal: workout.sessionGoal, // "build_fitness", "develop_speed", etc
            sessionIntent: workout.sessionIntent,
          })
          .returning({ id: plannedWorkouts.id });

        // Collect workout info for background session instruction generation
        if (plannedWorkoutResult && plannedWorkoutResult.length > 0) {
          pendingSessionInstructions.push({
            workoutId: plannedWorkoutResult[0].id,
            workoutType: workout.workoutType,
            intensity: workout.intensity || 'z3',
            sessionGoal: workout.sessionGoal,
            sessionIntent: workout.sessionIntent,
            intervalCount: workout.intervalCount,
            distance: workout.distance,
            duration: workout.duration,
          });
        }
      }
    }

    console.log(`✅ Generated ${isRollingPlan ? `block 1 (weeks 1-${weeksToGenerate}) of ${weeksUntilTarget}` : `${weeksUntilTarget}`}-week training plan for user ${userId} (${pendingSessionInstructions.length} workouts queued for coaching instructions)${nextBlockAt ? `, next block scheduled at ${nextBlockAt.toDateString()}` : ''}`);

    // Fire-and-forget: generate session instructions in the background so the plan
    // is returned to the user immediately (~60s instead of ~5min).
    // Instructions are generated in parallel batches of 5 to stay within rate limits.
    setImmediate(() => {
      generateSessionInstructionsInBackground(userId, pendingSessionInstructions).catch((err) =>
        console.error(`[SessionInstructions] Background generation failed for plan ${planId}:`, err)
      );
    });

    return planId;
  } catch (error) {
    console.error("Error generating training plan:", error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLLING BLOCK GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the next training block for a rolling plan.
 *
 * Called automatically when:
 *   - The user opens the app and nextBlockAt has passed, OR
 *   - A POST /api/training-plans/:planId/next-block request arrives
 *
 * Uses the athlete's actual run data since block 1 was generated, plus a
 * summary of the previous block, so each new block genuinely adapts to growth.
 */
export async function generateNextBlock(planId: string, userId: string): Promise<void> {
  // ── 1. Load plan + existing weeks ──────────────────────────────────────────
  const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} not found`);
  if (plan.status !== 'active') throw new Error(`Plan ${planId} is not active`);
  if (plan.generatedThroughWeek == null) {
    console.log(`[NextBlock] Plan ${planId} is a legacy plan (all weeks already generated) — skipping`);
    return;
  }

  const generatedThrough = plan.generatedThroughWeek;
  const totalWeeks = plan.totalWeeks;

  if (generatedThrough >= totalWeeks) {
    console.log(`[NextBlock] Plan ${planId} is fully generated (${generatedThrough}/${totalWeeks} weeks)`);
    // Clear nextBlockAt so we don't keep checking
    await db.update(trainingPlans)
      .set({ nextBlockAt: null })
      .where(eq(trainingPlans.id, planId));
    return;
  }

  const daysPerWeek = plan.daysPerWeek ?? 4;
  const blockSize = getBlockSize(daysPerWeek);
  const nextBlockStart = generatedThrough + 1;
  const nextBlockEnd = Math.min(generatedThrough + blockSize, totalWeeks);
  const weeksToGenerate = nextBlockEnd - nextBlockStart + 1;
  const blockNumber = Math.floor(generatedThrough / blockSize) + 1;
  const totalBlocks = Math.ceil(totalWeeks / blockSize);

  console.log(`[NextBlock] Generating block ${blockNumber} (weeks ${nextBlockStart}–${nextBlockEnd}) for plan ${planId}`);

  // ── 2. Build context from previous block ──────────────────────────────────
  const previousWeeks = await db
    .select()
    .from(weeklyPlans)
    .where(eq(weeklyPlans.trainingPlanId, planId))
    .orderBy(weeklyPlans.weekNumber);

  const previousBlockSummary = previousWeeks.map(w =>
    `Week ${w.weekNumber}: ${w.weekDescription ?? ''} | Focus: ${w.focusArea ?? ''} | Volume: ${w.totalDistance ? `${w.totalDistance}km` : 'n/a'} | Intensity: ${w.intensityLevel ?? ''}`
  ).join('\n');

  // ── 3. Fetch runner's recent performance data ──────────────────────────────
  const aiRunnerProfile = await getRunnerProfile(userId).catch(() => null);

  // ── 4. Build the next-block prompt ────────────────────────────────────────
  const isLastBlock = nextBlockEnd >= totalWeeks;
  const weeksRemainingAfter = totalWeeks - nextBlockEnd;

  const prompt = `═══════════════════════════════════════════════════════════════
COACHING COMMISSION — NEXT TRAINING BLOCK
BLOCK ${blockNumber} OF ${totalBlocks} — WEEKS ${nextBlockStart}–${nextBlockEnd} OF ${totalWeeks}
═══════════════════════════════════════════════════════════════

You are continuing a ${totalWeeks}-week personalised training programme. The athlete has completed the previous block and you are now designing the next phase of their journey.

━━━ PREVIOUS BLOCK SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The athlete has completed (or is completing) the following weeks:
${previousBlockSummary}

Continue the progression logically from where this block ends. Do not repeat the same sessions or volumes — build on the foundation that has been laid.

━━━ PLAN CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Full plan: ${plan.goalType.toUpperCase()} — ${plan.targetDistance}km over ${totalWeeks} weeks
${plan.targetDate ? `Race date: ${new Date(plan.targetDate).toDateString()}` : ''}
Sessions per week: ${daysPerWeek}
This is Block ${blockNumber} of ${totalBlocks} — covering weeks ${nextBlockStart} to ${nextBlockEnd}.
${isLastBlock ? `⚡ FINAL BLOCK: Include a taper in the last 1-2 weeks — reduce volume and intensity to arrive at the event fresh and race-ready.` : `Weeks remaining after this block: ${weeksRemainingAfter}. End at a sensible phase transition (do NOT taper yet).`}

━━━ WEEK-BY-WEEK PROGRESSION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All the same rules apply as block 1:
- Every week MUST be distinct. No two weeks can have identical sessions.
- Weekly volume must show progression (except a deload week if appropriate)
- Session types, paces, and intensity must evolve across these weeks
- Name each week's training phase explicitly in weekDescription

━━━ WHAT TO DELIVER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate EXACTLY ${weeksToGenerate} weeks (weeks ${nextBlockStart} to ${nextBlockEnd}).
weekNumber values must start at ${nextBlockStart} and end at ${nextBlockEnd}.

Return valid JSON only:
{
  "weeks": [
    {
      "weekNumber": ${nextBlockStart},
      "weekDescription": "Phase name and what makes this week unique",
      "totalDistance": 28.0,
      "focusArea": "The physiological quality this week develops",
      "intensityLevel": "Overall intensity for this week",
      "workouts": [
        {
          "dayOfWeek": 1,
          "workoutType": "tempo",
          "distance": 7.0,
          "targetPace": "Pace appropriate for this stage of the plan",
          "intensity": "z4",
          "description": "Personalised session name",
          "instructions": "2-3 sentences: session purpose, specific target, why it matters now"
        }
      ]
    }
  ]
}

STRUCTURAL CONSTRAINTS:
- Generate EXACTLY ${weeksToGenerate} weeks (${nextBlockStart} to ${nextBlockEnd})
- Each week must have EXACTLY ${daysPerWeek} workouts
- weekNumber values must be ${nextBlockStart} through ${nextBlockEnd} (not 1 through ${weeksToGenerate})
- Do not include a coachingProgrammeSummary — just the weeks array`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content: `You are an elite AI running coach continuing a personalised multi-block training programme. You have full creative authority. Use the previous block summary and athlete profile to design the next logical training phase. Always respond with valid JSON only, no extra text.${runnerProfileBlock(aiRunnerProfile)}`
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 32000,
  });

  if (response.choices[0].finish_reason === 'length') {
    throw new Error(`[NextBlock] Response truncated for block ${blockNumber} — try reducing block size`);
  }

  let rawContent = (response.choices[0].message.content || '{}').replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
  const blockData = JSON.parse(rawContent);

  if (!blockData.weeks || !Array.isArray(blockData.weeks) || blockData.weeks.length < weeksToGenerate) {
    throw new Error(`[NextBlock] AI returned ${blockData.weeks?.length ?? 0} weeks, expected ${weeksToGenerate}`);
  }

  // ── 5. Compute timezone-aware nextBlockAt ─────────────────────────────────
  const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userTimezone = userRecord[0]?.timezone ?? null;

  const newNextBlockAt: Date | null = (() => {
    if (isLastBlock) return null; // Plan fully generated after this block
    const today = userTimezone
      ? new Date(new Date().toLocaleDateString('en-CA', { timeZone: userTimezone }) + 'T00:00:00')
      : new Date();
    const daysSinceMonday = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysSinceMonday);
    // Trigger at the start of the last week of this new block
    const triggerDate = new Date(weekStart);
    triggerDate.setDate(weekStart.getDate() + (nextBlockEnd - plan.currentWeek!) * 7);
    return triggerDate;
  })();

  // ── 6. Insert weeks + workouts into DB ────────────────────────────────────
  const pendingSessionInstructions: Array<{
    workoutId: string;
    workoutType: string;
    intensity: string;
    sessionGoal?: string | null;
    sessionIntent?: string | null;
    intervalCount?: number | null;
    distance?: number | null;
    duration?: number | null;
  }> = [];

  const today = userTimezone
    ? new Date(new Date().toLocaleDateString('en-CA', { timeZone: userTimezone }) + 'T00:00:00')
    : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const daysSinceMonday = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const planWeekStart = new Date(today);
  planWeekStart.setDate(today.getDate() - daysSinceMonday);

  for (const week of blockData.weeks) {
    const weekNum = parseInt(String(week.weekNumber), 10);
    const weeklyPlan = await db.insert(weeklyPlans).values({
      trainingPlanId: planId,
      weekNumber: weekNum,
      weekDescription: week.weekDescription,
      totalDistance: parseFloat(String(week.totalDistance ?? 0).replace(/[^\d.]/g, '')) || 0,
      focusArea: week.focusArea,
      intensityLevel: week.intensityLevel,
    }).returning();

    const weeklyPlanId = weeklyPlan[0].id;

    for (const workout of (week.workouts ?? [])) {
      const dayOfWeek = parseInt(String(workout.dayOfWeek), 10) || 1;
      const dayOffsetFromMonday = (dayOfWeek + 6) % 7;
      const scheduledDate = new Date(planWeekStart);
      scheduledDate.setDate(planWeekStart.getDate() + ((weekNum - 1) * 7) + dayOffsetFromMonday);

      const workoutResult = await db.insert(plannedWorkouts).values({
        weeklyPlanId,
        trainingPlanId: planId,
        dayOfWeek,
        scheduledDate,
        workoutType: workout.workoutType || 'easy',
        distance: parseFloat(String(workout.distance ?? 0).replace(/[^\d.]/g, '')) || 0,
        targetPace: workout.targetPace,
        intensity: workout.intensity,
        description: workout.description,
        instructions: workout.instructions,
        intervalCount: workout.intervalCount ?? null,
        intervalDistanceMeters: workout.intervalDistanceMeters ?? null,
        intervalDurationSeconds: workout.intervalDurationSeconds ?? null,
        isCompleted: false,
      }).returning({ id: plannedWorkouts.id });

      if (workoutResult[0]) {
        pendingSessionInstructions.push({
          workoutId: workoutResult[0].id,
          workoutType: workout.workoutType || 'easy',
          intensity: workout.intensity || 'z3',
          distance: parseFloat(String(workout.distance ?? 0)) || null,
        });
      }
    }
  }

  // ── 7. Update plan metadata ───────────────────────────────────────────────
  await db.update(trainingPlans)
    .set({
      generatedThroughWeek: nextBlockEnd,
      nextBlockAt: newNextBlockAt,
    })
    .where(eq(trainingPlans.id, planId));

  console.log(`✅ [NextBlock] Generated block ${blockNumber} (weeks ${nextBlockStart}–${nextBlockEnd}) for plan ${planId}. Next block at: ${newNextBlockAt?.toDateString() ?? 'N/A (plan complete)'}`);

  // Background session instruction generation
  setImmediate(() => {
    generateSessionInstructionsInBackground(userId, pendingSessionInstructions).catch(err =>
      console.error(`[NextBlock][SessionInstructions] Background generation failed:`, err)
    );
  });
}

/**
 * Check if any active rolling plans need their next block generated now.
 * Call this on app startup and after each run completion.
 */
export async function checkAndGeneratePendingBlocks(userId: string): Promise<void> {
  const now = new Date();
  const activePlans = await db.select().from(trainingPlans).where(
    and(
      eq(trainingPlans.userId, userId),
      eq(trainingPlans.status, 'active')
    )
  );

  for (const plan of activePlans) {
    if (plan.nextBlockAt && plan.nextBlockAt <= now && plan.generatedThroughWeek != null) {
      console.log(`[NextBlock] Auto-triggering next block for plan ${plan.id} (nextBlockAt=${plan.nextBlockAt.toDateString()})`);
      generateNextBlock(plan.id, userId).catch(err =>
        console.error(`[NextBlock] Auto-generation failed for plan ${plan.id}:`, err)
      );
    }
  }
}

/**
 * Generate session instructions for all workouts in a plan in the background.
 * Runs in parallel batches of 5 to balance speed vs. OpenAI rate limits.
 * Called via setImmediate after generateTrainingPlan returns planId.
 */
async function generateSessionInstructionsInBackground(
  userId: string,
  workouts: Array<{
    workoutId: string;
    workoutType: string;
    intensity: string;
    sessionGoal?: string | null;
    sessionIntent?: string | null;
    intervalCount?: number | null;
    distance?: number | null;
    duration?: number | null;
  }>
): Promise<void> {
  const BATCH_SIZE = 5;
  console.log(`[SessionInstructions] Starting background generation for ${workouts.length} workouts (batches of ${BATCH_SIZE})`);

  for (let i = 0; i < workouts.length; i += BATCH_SIZE) {
    const batch = workouts.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (w) => {
        try {
          let coaching;
          
          // ========== PHASE 3: SPECIAL HANDLING FOR ORIENTATION SESSIONS ==========
          if (w.workoutType === "orientation" && w.sessionIntent === "orientation_run") {
            console.log(`[SessionInstructions] Generating orientation-specific coaching for workout ${w.workoutId}...`);
            
            // For orientation sessions, use the specialized coaching prompt
            // that emphasizes assessment, confidence, and learning over performance
            const orientationCoachingPrompt = generateOrientationCoachingPrompt(
              {
                age: undefined,
                gender: undefined,
                height: undefined,
                weight: undefined,
                bmi: undefined,
                experienceLevel: "intermediate",
                recentRunCount: 0,
                hasGpsData: false,
                averagePace: undefined,
                maxHeartRate: undefined,
                restingHeartRate: undefined,
              },
              {
                needsOrientation: true,
                recommendedDistance: w.distance || 5,
                recommendedPace: undefined,
                targetHeartRateZone: { min: 120, max: 140, label: "Zone 2" },
                orientationBrief: "Fitness assessment run",
                postOrientationPlan: "Results will personalize your plan",
              },
              "5k" // Default goal type for orientation
            );
            
            // For orientation, create a simplified briefing that includes the special prompt
            coaching = {
              preRunBrief: orientationCoachingPrompt.substring(0, 500), // Use first part as brief
              sessionStructure: {
                phases: [
                  {
                    name: "Warm-up",
                    duration: "5 min",
                    description: "Easy jog to get body ready"
                  },
                  {
                    name: "Main Run",
                    duration: `${Math.round((w.distance || 5) / 6)} minutes`,
                    description: "Steady, conversational pace"
                  },
                  {
                    name: "Cool-down",
                    duration: "5 min",
                    description: "Easy jog to finish"
                  }
                ]
              },
              aiDeterminedTone: "encouraging",
              aiDeterminedIntensity: "comfortable",
              coachingStyle: "assessment",
              insightFilters: ["form_check", "effort_feedback", "encouragement"],
              toneReasoning: "Orientation session - focus on confidence and learning"
            };
          } else {
            // Standard workout coaching generation
            coaching = await generateSessionInstructions(userId, w.workoutId, {
              userId,
              plannedWorkoutId: w.workoutId,
              workoutType: w.workoutType,
              intensity: w.intensity,
              sessionGoal: w.sessionGoal ?? undefined,
              sessionIntent: w.sessionIntent ?? undefined,
              intervalCount: w.intervalCount ?? undefined,
              distance: w.distance ?? undefined,
              duration: w.duration ?? undefined,
            });
          }

          const instructionResult = await db
            .insert(sessionInstructions)
            .values({
              plannedWorkoutId: w.workoutId,
              preRunBrief: coaching.preRunBrief,
              sessionStructure: coaching.sessionStructure,
              aiDeterminedTone: coaching.aiDeterminedTone,
              aiDeterminedIntensity: coaching.aiDeterminedIntensity,
              coachingStyle: coaching.coachingStyle,
              insightFilters: coaching.insightFilters,
              toneReasoning: coaching.toneReasoning,
            })
            .returning({ id: sessionInstructions.id });

          if (instructionResult && instructionResult.length > 0) {
            await db
              .update(plannedWorkouts)
              .set({ sessionInstructionsId: instructionResult[0].id })
              .where(eq(plannedWorkouts.id, w.workoutId));
          }
        } catch (err) {
          console.warn(`[SessionInstructions] Failed for workout ${w.workoutId}:`, err);
        }
      })
    );
    console.log(`[SessionInstructions] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(workouts.length / BATCH_SIZE)} complete`);
  }

  console.log(`[SessionInstructions] Background generation complete for ${workouts.length} workouts`);
}

/**
 * Get default plan duration based on goal type and experience level
 */
function getPlanDuration(goalType: string, experienceLevel: string): number {
  const durations: Record<string, Record<string, number>> = {
    "5k": { beginner: 8, intermediate: 8, advanced: 6 },
    "10k": { beginner: 10, intermediate: 8, advanced: 8 },
    "half_marathon": { beginner: 14, intermediate: 12, advanced: 10 },
    "marathon": { beginner: 20, intermediate: 18, advanced: 16 },
    "ultra": { beginner: 24, intermediate: 20, advanced: 18 },
  };

  // Normalize fitness level to beginner/intermediate/advanced
  // The app sends values like "Regular", "Casual", "Committed", etc.
  // Guard against null/undefined/empty string before calling .toLowerCase()
  if (!experienceLevel || experienceLevel.trim() === '') {
    return durations[goalType]?.['intermediate'] ?? 8;
  }
  const level = experienceLevel.toLowerCase();
  let normalizedLevel: string;
  if (['newcomer', 'beginner', 'casual'].includes(level)) {
    normalizedLevel = 'beginner';
  } else if (['regular', 'committed', 'intermediate'].includes(level)) {
    normalizedLevel = 'intermediate';
  } else if (['competitive', 'advanced', 'elite', 'professional'].includes(level)) {
    normalizedLevel = 'advanced';
  } else {
    normalizedLevel = 'intermediate'; // safe default
  }

  return durations[goalType]?.[normalizedLevel] ?? 8;
}

/**
 * Adapt training plan based on recent performance
 */
export async function adaptTrainingPlan(
  planId: string,
  reason: string,
  userId: string,
  options?: {
    sessionCompliance?: {
      sessionType?: string;
      hrZoneHighAlerts: number;   // how many times HR went above zone
      hrZoneLowAlerts: number;    // how many times HR dropped below zone
      paceDeviationAlerts: number;// how many pace deviation alerts fired
      intervalsCompleted?: number;
      intervalsFailed?: number;
      overallAdherence: "good" | "moderate" | "poor";
    };
    fullAssessment?: {
      adjustmentType?: string;
      recommendation?: string;
    };
  }
): Promise<void> {
  try {
    // Get plan
    const plan = await db
      .select()
      .from(trainingPlans)
      .where(eq(trainingPlans.id, planId))
      .limit(1);

    if (!plan[0]) {
      throw new Error("Training plan not found");
    }

    // Get current fitness
    const fitness = await getCurrentFitness(userId);

    // Get completed workouts
    const completedWorkouts = await db
      .select()
      .from(plannedWorkouts)
      .where(
        and(
          eq(plannedWorkouts.trainingPlanId, planId),
          eq(plannedWorkouts.isCompleted, true)
        )
      );

    // Fetch the next 7 upcoming incomplete workouts — the AI needs these IDs to generate
    // specific, actionable adjustments. Without real workout IDs, changes can't be applied.
    const upcomingWorkouts = await db
      .select({
        id: plannedWorkouts.id,
        dayOfWeek: plannedWorkouts.dayOfWeek,
        scheduledDate: plannedWorkouts.scheduledDate,
        workoutType: plannedWorkouts.workoutType,
        distance: plannedWorkouts.distance,
        intensity: plannedWorkouts.intensity,
        description: plannedWorkouts.description,
        intervalCount: plannedWorkouts.intervalCount,
        intervalDistanceMeters: plannedWorkouts.intervalDistanceMeters,
      })
      .from(plannedWorkouts)
      .where(
        and(
          eq(plannedWorkouts.trainingPlanId, planId),
          eq(plannedWorkouts.isCompleted, false)
        )
      )
      .orderBy(plannedWorkouts.scheduledDate)
      .limit(7);

    // Build session compliance section if available
    const complianceSection = options?.sessionCompliance
      ? `
SESSION PERFORMANCE DETAILS:
- Session type: ${options.sessionCompliance.sessionType || "run"}
- HR above zone alerts fired: ${options.sessionCompliance.hrZoneHighAlerts} times
- HR below zone alerts fired: ${options.sessionCompliance.hrZoneLowAlerts} times
- Pace deviation alerts fired: ${options.sessionCompliance.paceDeviationAlerts} times
${options.sessionCompliance.intervalsCompleted != null ? `- Intervals completed: ${options.sessionCompliance.intervalsCompleted}` : ""}
${options.sessionCompliance.intervalsFailed != null ? `- Intervals failed/cut short: ${options.sessionCompliance.intervalsFailed}` : ""}
- Overall session adherence: ${options.sessionCompliance.overallAdherence}`
      : "";

    // Build upcoming workouts section so AI can generate specific workout IDs in its response
    const upcomingSection = upcomingWorkouts.length > 0
      ? `
UPCOMING WORKOUTS (next ${upcomingWorkouts.length} sessions):
${upcomingWorkouts.map((w, i) => `${i + 1}. ID="${w.id}" | ${w.workoutType} | ${w.distance ?? "?"}km | intensity=${w.intensity ?? "?"} | ${w.scheduledDate ? new Date(w.scheduledDate).toDateString() : "unscheduled"}`).join("\n")}`
      : "\nNo upcoming workouts found.";

    const aiRunnerProfile = await getRunnerProfile(userId).catch(() => null);

    const prompt = `As an expert running coach, adapt this training plan based on real session performance data.

REASON FOR ADAPTATION: ${reason}
${options?.fullAssessment?.recommendation ? `INITIAL ASSESSMENT: ${options.fullAssessment.recommendation}` : ""}

TRAINING PLAN:
- Goal: ${plan[0].goalType}
- Current Week: ${plan[0].currentWeek}/${plan[0].totalWeeks}
- Experience Level: ${plan[0].experienceLevel}
- Current Fitness (CTL): ${fitness?.ctl || "N/A"}
- Training Status: ${fitness?.status || "N/A"}
- Completed workouts so far: ${completedWorkouts.length}
${complianceSection}
${upcomingSection}

INSTRUCTIONS:
- Only adjust workouts that genuinely need it — not every session requires a change
- Use the exact workout IDs from the UPCOMING WORKOUTS list above in your response
- For HR zone adherence issues (many hr_zone_high alerts): reduce intensity of next hard session
- For poor interval completion: reduce interval count or distance for next interval session
- For overtraining signals: add rest, reduce volume
- For underperformance: encourage consistency, don't increase load yet
- Keep changes minimal and targeted — 1-3 workouts maximum

Respond with ONLY valid JSON in this exact format:
{
  "summary": "2-3 sentence explanation of what you're changing and why, written directly to the runner",
  "changeCount": 2,
  "upcoming_workout_adjustments": [
    {
      "workoutId": "exact-id-from-list-above",
      "newIntensity": "z2",
      "newWorkoutType": "easy",
      "newDescription": "Easy recovery run — keep heart rate in zone 2 the whole way",
      "newDistance": 6.0,
      "skip": false
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert running coach adapting a training plan based on session performance data. You have access to specific upcoming workout IDs and must reference them exactly. Respond with JSON only.${runnerProfileBlock(aiRunnerProfile)}`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 800,
    });

    const adaptation = JSON.parse(response.choices[0].message.content || "{}");

    // Save adaptation — `changes` is now in the correct format for acceptAndApplyAdaptation
    await db.insert(planAdaptations).values({
      trainingPlanId: planId,
      reason,
      changes: adaptation,
      aiSuggestion: adaptation.summary,
      userAccepted: false,
    });

    console.log(`✅ Plan adaptation created for ${reason} (${adaptation.changeCount ?? 0} workout(s) targeted)`);
  } catch (error) {
    console.error("Error adapting training plan:", error);
    throw error;
  }
}

/**
 * Mark workout as completed and link to run
 */
export async function completeWorkout(
  workoutId: string,
  runId: string
): Promise<void> {
  await db
    .update(plannedWorkouts)
    .set({
      isCompleted: true,
      completedRunId: runId,
    })
    .where(eq(plannedWorkouts.id, workoutId));
}

/**
 * Reassess all active training plans for a user based on a completed/updated run.
 * This allows the AI Coach to adapt the plan based on actual progress.
 */
export async function reassessTrainingPlansWithRunData(
  userId: string,
  runId: string
): Promise<void> {
  try {
    // Get the completed run
    const runData = await db
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);

    if (!runData[0]) {
      console.warn(`[Plan Reassessment] Run ${runId} not found`);
      return;
    }

    const run = runData[0];

    // Get all active training plans for this user
    const activePlans = await db
      .select()
      .from(trainingPlans)
      .where(
        and(
          eq(trainingPlans.userId, userId),
          eq(trainingPlans.status, "active")
        )
      );

    if (activePlans.length === 0) {
      console.log(`[Plan Reassessment] No active plans for user ${userId}`);
      return;
    }

    // Get user profile for context
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const userProfile = user[0];

    // Get current fitness metrics
    const fitness = await getCurrentFitness(userId);

    // Process each active plan
    for (const plan of activePlans) {
      try {
        console.log(`[Plan Reassessment] Reassessing plan ${plan.id} with run data`);

        // Get recent runs (last 10) to show progress
        const recentRuns = await db
          .select()
          .from(runs)
          .where(eq(runs.userId, userId))
          .orderBy(desc(runs.completedAt))
          .limit(10);

        // Get completed workouts for this plan
        const completedWorkouts = await db
          .select()
          .from(plannedWorkouts)
          .where(
            and(
              eq(plannedWorkouts.trainingPlanId, plan.id),
              eq(plannedWorkouts.isCompleted, true)
            )
          );

        // ── NEW: Fetch coaching events from this session to compute compliance ──
        // These events were logged by the live coaching engine during the run.
        // They tell us exactly how often the runner deviated from targets.
        const sessionEvents = await db
          .select()
          .from(coachingSessionEvents)
          .where(eq(coachingSessionEvents.runId, runId));

        // Compute session compliance from coaching events
        const hrZoneHighAlerts  = sessionEvents.filter(e => e.eventType === "hr_zone_high").length;
        const hrZoneLowAlerts   = sessionEvents.filter(e => e.eventType === "hr_zone_low").length;
        const paceTooFastAlerts = sessionEvents.filter(e => e.eventType === "pace_too_fast").length;
        const paceTooSlowAlerts = sessionEvents.filter(e => e.eventType === "pace_too_slow").length;
        const paceDeviationAlerts = paceTooFastAlerts + paceTooSlowAlerts;
        const intervalsCompleted = sessionEvents.filter(e => e.eventType === "rep_end").length;
        const repStarts = sessionEvents.filter(e => e.eventType === "rep_start").length;
        const intervalsFailed = Math.max(0, repStarts - intervalsCompleted);

        // Overall adherence: poor if many HR zone violations, moderate if some, good otherwise
        const totalDeviations = hrZoneHighAlerts + paceDeviationAlerts;
        const overallAdherence: "good" | "moderate" | "poor" =
          totalDeviations >= 6 ? "poor" :
          totalDeviations >= 3 ? "moderate" : "good";

        // Session compliance object (passed to adaptTrainingPlan if adjustment needed)
        const sessionCompliance = {
          sessionType: run.workoutType || undefined,
          hrZoneHighAlerts,
          hrZoneLowAlerts,
          paceDeviationAlerts,
          intervalsCompleted,
          intervalsFailed,
          overallAdherence,
        };

        // Build session compliance string for the reassessment prompt
        const complianceText = sessionEvents.length > 0
          ? `
SESSION COACHING DATA (from live AI coaching during the run):
- HR above zone alerts: ${hrZoneHighAlerts} times${hrZoneHighAlerts > 3 ? " ⚠️ SIGNIFICANT — runner consistently above target zone" : ""}
- HR below zone alerts: ${hrZoneLowAlerts} times
- Pace deviation alerts: ${paceDeviationAlerts} times
- Intervals completed: ${intervalsCompleted} (started: ${repStarts})
- Overall session adherence: ${overallAdherence.toUpperCase()}
- Total coaching cues delivered: ${sessionEvents.length}`
          : "\nNo in-session coaching data available for this run.";

        // Build AI prompt for plan reassessment
        const prompt = `As an expert running coach, reassess this training plan based on real session performance data including live coaching signals from the run.

TRAINING PLAN DETAILS:
- Goal: ${plan.goalType}
- Current Week: ${plan.currentWeek}/${plan.totalWeeks}
- Experience Level: ${plan.experienceLevel}
- Days Per Week: ${plan.daysPerWeek}
- Target Distance: ${plan.targetDistance} km
- Target Date: ${plan.targetDate || 'Flexible'}

RUNNER PROFILE:
- Age: ${userProfile?.dob ? Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'Unknown'}
- Fitness Level: ${userProfile?.fitnessLevel || 'Not specified'}
- Current CTL (Fitness): ${fitness?.ctl || 'N/A'}
- Training Status: ${fitness?.status || 'N/A'}
${userProfile?.injuryHistory ? `- Injury History: ${JSON.stringify(userProfile.injuryHistory)}` : ''}

RECENT RUN (Just Completed):
- Workout Type: ${run.workoutType || 'general run'}
- Distance: ${(run.distance / 1000).toFixed(2)} km
- Duration: ${(run.duration / 60).toFixed(0)} minutes
- Pace: ${run.avgPace || 'N/A'}
- Avg Heart Rate: ${run.avgHeartRate || 'N/A'} bpm
- Max Heart Rate: ${run.maxHeartRate || 'N/A'} bpm
- Elevation Gain: ${run.elevationGain || 0} m
${complianceText}

PLAN PROGRESS:
- Completed workouts in plan: ${completedWorkouts.length}
- Recent runs in last 10: ${recentRuns.length}

KEY QUESTIONS TO ANSWER:
1. Was the session completed as intended? (check adherence + HR/pace deviation alerts)
2. Does the HR zone data suggest the runner is struggling (consistently above zone) or coasting (consistently below)?
3. Are intervals being completed fully? (check intervalsCompleted vs repStarts)
4. Does the training load need to change based on this run?

Provide your assessment in JSON format:
{
  "needsAdjustment": true/false,
  "reason": "Specific explanation referencing the actual coaching data (e.g. HR alerts, interval completion)",
  "adjustmentType": "none" | "volume_reduction" | "volume_increase" | "intensity_adjustment" | "recovery_addition",
  "recommendation": "Specific coaching recommendation for the runner"
}`;

        const aiRunnerProfileForReassess = await getRunnerProfile(userId).catch(() => null);

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are an expert running coach providing training plan reassessments based on run data. Respond with JSON only. Be balanced - not every run requires plan changes.${runnerProfileBlock(aiRunnerProfileForReassess)}`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 600,
        });

        const assessment = JSON.parse(
          response.choices[0].message.content || "{}"
        );

        console.log(
          `[Plan Reassessment] Assessment for plan ${plan.id}:`,
          JSON.stringify(assessment, null, 2)
        );

        // If adjustments are needed, trigger plan adaptation
        // Pass session compliance + assessment context so the AI can generate specific, targeted changes
        if (assessment.needsAdjustment) {
          console.log(
            `[Plan Reassessment] Triggering adaptation for plan ${plan.id}: ${assessment.reason}`
          );
          await adaptTrainingPlan(
            plan.id,
            `run_data_feedback: ${assessment.reason}`,
            userId,
            {
              sessionCompliance,
              fullAssessment: {
                adjustmentType: assessment.adjustmentType,
                recommendation: assessment.recommendation,
              },
            }
          );
        } else {
          console.log(
            `[Plan Reassessment] Plan ${plan.id} performing well, no adjustments needed`
          );
        }
      } catch (planError: any) {
        console.error(
          `[Plan Reassessment] Error reassessing plan ${plan.id}:`,
          planError.message
        );
        // Continue processing other plans if one fails
      }
    }

    console.log(
      `✅ Plan reassessment completed for user ${userId} with run ${runId}`
    );
  } catch (error) {
    console.error(
      "[Plan Reassessment] Error in reassessTrainingPlansWithRunData:",
      error
    );
    // Don't throw - this is a background process
  }
}

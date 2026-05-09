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
    
    console.log(`[Training Plan] Duration: durationWeeks=${durationWeeks}, targetDate=${targetDate}, calculated weeksUntilTarget=${weeksUntilTarget}`);

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
  // Determine how conservative to be based on stated fitness level.
  // "New to app" does NOT mean "new to running" — a Committed or Competitive runner
  // who just downloaded the app should NOT receive a beginner plan.
  const level = (experienceLevel || '').toLowerCase();
  const isExperiencedLevel = ['committed', 'competitive', 'advanced', 'elite', 'professional'].some(l => level.includes(l));
  const isIntermediateLevel = ['regular', 'intermediate'].some(l => level.includes(l));

  if (isExperiencedLevel) {
    return `IMPORTANT: This runner has NO previous run data recorded in this app — they are a NEW USER to this app only.
Their self-assessed fitness level is "${experienceLevel}" which indicates they are an experienced, active runner.
DO NOT treat the absence of run data as evidence of low fitness — they simply haven't synced runs yet.
Instead:
- Trust their stated fitness level (${experienceLevel}) and design a plan appropriate for that level
- Start at a training volume consistent with an experienced ${experienceLevel} runner: ~${Math.round(weeklyMileageBase * 1.2)}–${Math.round(weeklyMileageBase * 1.5)}km/week
- Include structured sessions (tempo, intervals, long runs) from week 1 — do NOT spend weeks on "easy base-building only"
- Use their target time (if provided) or estimate reasonable goal paces for a ${experienceLevel} runner at this distance`;
  } else if (isIntermediateLevel) {
    return `IMPORTANT: This runner has NO previous run data recorded in this app — they are a NEW USER to this app only.
Their self-assessed fitness level is "${experienceLevel}" — a regular recreational runner with an established habit.
Start at a moderate, consistent training volume (~${Math.round(weeklyMileageBase)}km/week) appropriate for a ${experienceLevel} runner.
Introduce structured sessions from week 2 onwards. Week 1 can be used to establish rhythm, but do NOT default to beginner-level distances.`;
  } else {
    const isUltraOrLong = goalType === 'ultra' || targetDistance > 42.2;
    if (isUltraOrLong) {
      return `IMPORTANT: This runner has NO previous run data recorded in this app — they may be new to running or simply new to this app.
Their self-assessed fitness level is "${experienceLevel}" — a less experienced runner setting an ambitious ultra/long-distance goal.
This is a challenging combination. Apply the following approach:
- Distances and long runs MUST follow the ULTRA LONG-DISTANCE TRAINING REQUIREMENTS below — the event distance is the priority constraint, not the fitness level
- Intensity and pace: be conservative — keep easy runs genuinely easy, avoid aggressive speed work early
- Recovery: build in more rest/easy days than you would for a higher-fitness runner
- Session descriptions should acknowledge the ambitious nature of this goal and encourage the runner to listen to their body
- Start at ~${Math.round(weeklyMileageBase)}km/week and build as directed by the ultra requirements below`;
    }
    return `IMPORTANT: This runner has NO previous run data recorded in this app — they may be new to running or simply new to this app.
Their self-assessed fitness level is "${experienceLevel}". We will use this alongside their profile to estimate baseline pace and mileage.
Start conservatively and include easier runs in the first week to allow calibration.
Then build progressively through the plan.`;
  }
})()}
`;

    // Generate plan with OpenAI
    // Determine if this is a high-risk combination: lower fitness + long distance + short duration
    const normalizedLevelForRisk = (experienceLevel || '').toLowerCase();
    const isLowerFitnessLevel = ['newcomer', 'beginner', 'casual'].some(l => normalizedLevelForRisk.includes(l));
    const isLongEventDistance = goalType === 'ultra' || goalType === 'marathon' || targetDistance > 30;
    const defaultPlanDuration = getPlanDuration(goalType, experienceLevel);
    const isSignificantlyUnderduration = weeksUntilTarget < defaultPlanDuration * 0.6;
    const isAmbitiousCombination = isLowerFitnessLevel && isLongEventDistance && !isPreEventPlan;

    const prompt = `You are an expert running coach. Generate a tailored ${weeksUntilTarget}-week training plan for a ${experienceLevel} runner preparing for a ${goalType} (${targetDistance}km).
${isPreEventPlan ? `
⚡ PRE-EVENT SHARPENING PLAN: This is NOT a build-up plan. The runner is already capable of the event distance and has ${weeksUntilTarget} weeks until race day. Design a race-preparation block: race-pace work, taper, confidence sessions. Do NOT start conservatively or include baseline-building runs.
` : ''}
${isAmbitiousCombination ? `
⚠️ COACH ADVISORY — AMBITIOUS GOAL COMBINATION:
This runner has self-assessed as "${experienceLevel}" (less experienced) but is targeting a ${targetDistance}km event over ${weeksUntilTarget} weeks.${isSignificantlyUnderduration ? ` The recommended duration for this goal is ${defaultPlanDuration} weeks — this plan is ${defaultPlanDuration - weeksUntilTarget} weeks shorter than recommended.` : ''}
Your responsibilities as coach:
- Generate the plan as requested — the runner has chosen this goal
- Include genuine safety cues in session descriptions: warn about injury risk from rapid volume increases, encourage listening to the body, flag the importance of rest days
- Be honest in the coachingProgrammeSummary comment about the challenge of this combination
- Prioritise injury prevention and consistent training over hitting arbitrary pace targets
- Despite the lower fitness level, session distances MUST still follow the event-specific requirements below — watering down distances to "beginner" levels would not prepare them for the event
` : ''}
${runnerProfileSection}

Runner Profile:
- Fitness level: ${experienceLevel}
- Training days per week: ${daysPerWeek}
- Current fitness (CTL): ${fitness?.ctl || 'N/A'}
- Training status: ${fitness?.status || 'N/A'}

Current Performance Baseline (from last ${recentRuns.length} runs over 90 days):
- Weekly mileage (last 30 days): ${weeklyMileageBase.toFixed(1)}km/week
- Runs in last 30 days: ${runsLast30.length}
${avgPaceStr ? `- Average pace across recent runs: ${avgPaceStr}` : ''}
${bestPaceStr ? `- Best pace in a recent run: ${bestPaceStr}` : ''}
${paceTrend ? `- Pace trend: ${paceTrend}` : ''}
${similarDistanceRuns.length > 0 ? `
Recent runs at ${targetDistance}km distance (${similarDistanceRuns.length} found):
${avgTimeAtGoalDistanceStr ? `- Average time for ${targetDistance}km: ${avgTimeAtGoalDistanceStr} (mm:ss)` : ''}
${bestTimeAtGoalStr ? `- Best time for ${targetDistance}km: ${bestTimeAtGoalStr} (mm:ss)` : ''}
${avgPaceSecs && avgTimeAtGoalDistanceSecs ? `- Current estimated ability: this runner currently takes approximately ${avgTimeAtGoalDistanceStr} to run ${targetDistance}km.` : ''}` : `- No recent runs found at exactly ${targetDistance}km — use their average pace and weekly mileage as the baseline.`}

Goal:
- ${goalType.toUpperCase()} (${targetDistance}km)
${goalEventName ? `- Target event: ${goalEventName}${goalEventLocation ? ` in ${goalEventLocation}` : ''}` : ''}
${goalDescription ? `- Goal description: ${goalDescription}` : ''}
${goalNotes ? `- Runner's own notes about this goal: "${goalNotes}" — use this to personalise coaching cues and session descriptions` : ''}
${targetTime ? (() => {
  // Pre-compute goal pace and training paces from goal time
  const goalPaceSecs = Math.round(targetTime / targetDistance);
  const goalPaceStr = `${Math.floor(goalPaceSecs / 60)}:${String(goalPaceSecs % 60).padStart(2, "0")}/km`;
  const easyPaceSecs = goalPaceSecs + 90;
  const easyPaceStr = `${Math.floor(easyPaceSecs / 60)}:${String(easyPaceSecs % 60).padStart(2, "0")}/km`;
  const tempoPaceSecs = goalPaceSecs + 20; // ~20s/km above goal = threshold
  const tempoPaceStr = `${Math.floor(tempoPaceSecs / 60)}:${String(tempoPaceSecs % 60).padStart(2, "0")}/km`;
  const intervalPaceSecs = Math.max(goalPaceSecs - 20, 150); // ~20s/km below goal = neuromuscular
  const intervalPaceStr = `${Math.floor(intervalPaceSecs / 60)}:${String(intervalPaceSecs % 60).padStart(2, "0")}/km`;
  const longRunPaceSecs = goalPaceSecs + 75;
  const longRunPaceStr = `${Math.floor(longRunPaceSecs / 60)}:${String(longRunPaceSecs % 60).padStart(2, "0")}/km`;
  const currentPaceStr = avgPaceStr || "unknown";
  const currentTimeStr = avgTimeAtGoalDistanceStr || "unknown";
  return `- Target time: ${Math.floor(targetTime / 60)}:${String(Math.round((targetTime % 60))).padStart(2,'0')} (mm:ss)
- Goal pace: ${goalPaceStr} (this is the pace required to achieve the target time)
- Gap to close: ${avgTimeAtGoalDistanceSecs && targetTime ? `runner currently averages ${currentTimeStr} for ${targetDistance}km (${currentPaceStr}), needs to improve by approximately ${Math.round((avgTimeAtGoalDistanceSecs - targetTime) / 60)} minute(s) ${Math.abs(Math.round((avgTimeAtGoalDistanceSecs - targetTime) % 60))}s` : 'use your expert judgment based on their current pace'}

TRAINING PACE PRESCRIPTION (derived from goal pace ${goalPaceStr}):
These are the target paces you MUST use when assigning workouts. Do NOT anchor hard/tempo/interval paces to the runner's current easy pace.
- Easy / recovery runs:  ~${easyPaceStr}  (aerobic base; conversational effort)
- Long runs:             ~${longRunPaceStr} (comfortable aerobic, builds endurance)
- Tempo / threshold:     ~${tempoPaceStr}  (lactate threshold work; comfortably hard but sustainable for 20-40 min)
- Race pace sessions:    ${goalPaceStr}    (exactly the goal pace; conditions body and mind for race day)
- Interval reps (400m-1000m): ~${intervalPaceStr} (faster than race pace; neuromuscular conditioning so race pace feels controlled)
- Hill repeats:          effort-based (target race-pace effort / zone 4 HR — pace is secondary due to gradient)

PACE PROGRESSION OVER THE PLAN:
- Weeks 1-3:  Focus on easy miles. Introduce tempo at current-ability threshold (~current pace - 30s). Intervals at goal pace.
- Weeks 4-6:  Tempo creeps toward ${tempoPaceStr}. Intervals at ${intervalPaceStr}. First race pace taste.
- Weeks 7-9:  Tempo AT ${tempoPaceStr}. Sustained race pace blocks (1-2km at ${goalPaceStr}). Intervals well below race pace.
- Final weeks: Race-pace specific sessions. Taper volume, maintain intensity.

CRITICAL: The runner CANNOT achieve ${goalPaceStr} race pace if they never train at or faster than that pace. Every plan MUST include:
1. Interval sessions with reps at ${intervalPaceStr} or faster (conditions body to handle race pace easily)
2. Tempo sessions at ~${tempoPaceStr} (builds lactate threshold)
3. Race-pace conditioning runs at exactly ${goalPaceStr} (as the plan progresses)`;
})() : ''}
${targetDate ? `- Race date: ${targetDate.toDateString()}` : ''}

${(goalType === 'custom' && targetDistance > 21.1 && targetDistance <= 42.2) ? `
MID-DISTANCE CUSTOM EVENT (${targetDistance}km):
This is a custom distance between a half marathon and marathon. Key training principles:
- Treat this similarly to marathon training but with adjusted peak long run targets
- Peak long run should reach ${Math.round(targetDistance * 0.65)}–${Math.round(targetDistance * 0.75)}km (65-75% of event distance)
- Peak weekly volume should reach ${Math.round(targetDistance * 2.0)}–${Math.round(targetDistance * 2.5)}km/week
- Include back-to-back moderate long run weekends in peak training weeks
- All standard marathon training session types apply: easy runs, tempo, intervals, long runs
` : ''}
${(goalType === 'ultra' || targetDistance > 42.2) ? `
ULTRA / LONG-DISTANCE TRAINING REQUIREMENTS — READ THIS CAREFULLY:
This is a ${targetDistance}km ultra/long-distance event. Standard road-racing training principles do NOT apply directly. Key differences:

LONG RUN TARGETS (non-negotiable):
- Peak long run MUST reach ${Math.round(targetDistance * 0.55)}–${Math.round(targetDistance * 0.65)}km (55-65% of event distance) by weeks ${Math.max(weeksUntilTarget - 4, Math.round(weeksUntilTarget * 0.6))}–${Math.max(weeksUntilTarget - 3, Math.round(weeksUntilTarget * 0.7))}
- Do NOT cap long runs at marathon distance (42km). For a ${targetDistance}km event, long runs must go beyond typical marathon training peaks.
- Example long run progression for a ${weeksUntilTarget}-week plan: 12km → 18km → 22km → 26km → 30km → ${Math.round(targetDistance * 0.55)}km → ${Math.round(targetDistance * 0.60)}km (peak) → taper

WEEKLY VOLUME:
- Peak weekly volume should reach ${Math.round(targetDistance * 1.6)}–${Math.round(targetDistance * 2.0)}km/week (weeks ${Math.max(weeksUntilTarget - 5, Math.round(weeksUntilTarget * 0.6))}–${Math.max(weeksUntilTarget - 3, Math.round(weeksUntilTarget * 0.7))})
- This is significantly higher than road-race training — ultra running demands time-on-feet, not just mileage
- Starting volume for a runner with no recorded history: ${Math.round(weeklyMileageBase)}km/week is the established baseline — build from here

BACK-TO-BACK LONG RUN WEEKENDS (critical for ultra preparation):
- From week ${Math.round(weeksUntilTarget * 0.4)} onwards, schedule paired long runs on consecutive days (e.g. 25km Saturday + 18km Sunday)
- This trains fatigue resistance, which is the primary challenge of ultra running

WORKOUT TYPE BALANCE for ultra:
- Prioritise TIME on feet over pace — easy/long runs dominate (85-90% of volume)
- Reduce interval/speed work compared to road races — ultra is about endurance, not speed
- Include hill work — ultra courses are typically hilly
- Include back-to-back long runs as a primary training tool, not just a weekly long run

CRITICAL DISTANCE RULE: Every workout distance in your JSON MUST reflect ultra training volumes. Week 1 easy runs should be 8-12km, not 5-6km. Long runs in peak weeks must reach ${Math.round(targetDistance * 0.55)}km+. Do NOT anchor your session distances to 5-6km road race session sizes.
` : ''}

${regularSessions.length > 0 ? `
Regular Weekly Runs (already in the user's schedule):
${regularSessions.map(s => {
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const time = `${String(s.timeHour).padStart(2,"0")}:${String(s.timeMinute).padStart(2,"0")}`;
  const countNote = s.countsTowardWeeklyTotal
    ? "counts towards weekly session total"
    : "EXTRA – does NOT count towards weekly session total";
  return `- ${s.name}: day ${s.dayOfWeek} (${dayNames[s.dayOfWeek]}) at ${time}, ${s.distanceKm}km (${countNote})`;
}).join("\n")}

IMPORTANT scheduling rules for regular sessions:
1. Sessions that COUNT towards the weekly total: Integrate them into the ${daysPerWeek} AI-generated sessions per week by choosing to perform that regular session on its scheduled day instead of a coached session (prefer replacing sessions that match its intensity/goal).
2. Sessions that DON'T count (marked "EXTRA"): These are BLOCKED DAYS. Do NOT schedule ANY coached workouts on the same days as EXTRA sessions. Schedule your ${daysPerWeek} coached workouts exclusively on other days. This prevents double-running on the same day.
` : ""}
${injuries && injuries.length > 0 ? `
INJURIES & LIMITATIONS:
${injuries.map(i => {
  const statusLabel = i.status === 'recovering' || i.status === 'RECOVERING' ? 'Recovering' :
                     i.status === 'healed' || i.status === 'HEALED' ? 'Healed' :
                     i.status === 'chronic' || i.status === 'CHRONIC' ? 'Chronic' :
                     i.status === 'active' || i.status === 'ACTIVE' ? 'Active' : i.status;
  return `- ${i.bodyPart}: ${statusLabel}${i.notes ? ` — ${i.notes}` : ''}`;
}).join("\n")}

CRITICAL INJURY GUIDELINES:
- For "recovering" or "active" injuries: AVOID all exercises that stress the affected area. Replace with cross-training or rest days.
- For "chronic" injuries: REDUCE intensity and impact. No speed work, hill repeats, or long runs that stress the affected body part. Favor easy runs on flat terrain.
- For "healed" injuries: Gradually reintroduce normal training but note the history — avoid sudden volume increases.
- Always err on the side of caution. A conservative plan that keeps the runner healthy is better than an aggressive plan that causes re-injury.
` : ''}
Schedule:
- Today is ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} (day ${new Date().getDay()} of the week, 0=Sun)
- First session: ${
  firstSessionStart === "today" ? `TODAY — the first workout must be on or after today. Any sessions earlier in week 1 (e.g. Monday/Tuesday if today is Wednesday) should be omitted; week 1 may have fewer sessions than usual.` :
  firstSessionStart === "tomorrow" ? `TOMORROW — first workout on or after tomorrow. Omit any week-1 sessions that fall before tomorrow.` :
  "Flexible — schedule week 1 starting from the current calendar week. Sessions that would fall before today in week 1 are automatically dropped, so you may schedule them from today onwards."
}

Requirements:
1. PACE RULES — follow this strictly:
   a) Easy/recovery/long runs: use the runner's CURRENT ability (their average pace + 30-90s/km). These should feel genuinely easy.
   b) Tempo/threshold sessions: use the TRAINING PACE PRESCRIPTION above (~goal pace + 20s/km). Do NOT use current easy pace for tempo — this is the most common coaching mistake.
   c) Interval sessions: use the TRAINING PACE PRESCRIPTION above (~goal pace - 20s/km). Reps must be faster than race pace.
   d) Race pace sessions: use the exact GOAL PACE derived from the target time. These sessions exist to make the runner comfortable at their race pace.
   e) Hill repeats: specify effort (e.g. "Zone 4 effort / hard") not exact pace, since gradient makes pace unreliable.
2. ${isPreEventPlan
  ? `Start at RACE-READY volume appropriate for a ${experienceLevel} runner — do NOT ramp up slowly. This is a ${weeksUntilTarget}-week pre-race block, not a build-up plan.`
  : `Build gradually from current ${weeklyMileageBase.toFixed(1)}km/week base`}
3. Include easy runs, tempo runs, intervals, and long runs across each week
4. Follow 80/20 rule (80% easy effort, 20% quality/hard sessions)
5. ${isPreEventPlan
  ? `Race-sharpening structure: emphasise race pace, speed, and confidence. Taper the final ${Math.min(2, Math.floor(weeksUntilTarget / 2))} week(s) for peak performance.`
  : `Build for 3 weeks, recover 1 week pattern`}
6. Taper for final ${isPreEventPlan ? Math.min(2, Math.floor(weeksUntilTarget / 2)) : 2} week(s) before race
7. ${isPreEventPlan
  ? `Maintain current fitness volume — no need to cap volume increases at 10% since this is not a build-up plan`
  : (goalType === 'ultra' || targetDistance > 42.2)
    ? (() => {
        // Check whether 10%/week from the base can realistically reach the required ultra peak volume
        // within the available build weeks (total weeks minus 2 taper weeks)
        const buildWeeks = Math.max(weeksUntilTarget - 2, 1);
        const projectedPeakAtTenPct = weeklyMileageBase * Math.pow(1.1, buildWeeks);
        const requiredPeak = targetDistance * 1.6;
        const rateNeeded = Math.pow(requiredPeak / weeklyMileageBase, 1 / buildWeeks) - 1;
        if (projectedPeakAtTenPct < requiredPeak) {
          return `Weekly volume must reach ${Math.round(requiredPeak)}–${Math.round(targetDistance * 2.0)}km/week at peak (starting from ${weeklyMileageBase.toFixed(0)}km/week over ${buildWeeks} build weeks). This requires approximately ${Math.round(rateNeeded * 100)}%/week average growth — higher than the standard 10% guideline. Use a 3-weeks-build / 1-week-recovery pattern but increase build weeks at ~${Math.round(rateNeeded * 100)}% to hit the required peak. LONG RUN DISTANCES must follow the ULTRA LONG RUN TARGETS above — do not cap them at arbitrary small values.`;
        }
        return `Increase weekly volume by max 10% per week — but CRITICALLY: your long runs must follow the ULTRA LONG RUN TARGETS above. Do NOT let the 10% rule prevent long runs from reaching the required peak of ${Math.round(targetDistance * 0.55)}–${Math.round(targetDistance * 0.65)}km.`;
      })()
    : `Increase weekly volume by max 10% per week`}
8. Reference the runner's current performance AND goal in workout descriptions (e.g. "your current 5km is around ${avgTimeAtGoalDistanceStr || 'estimated from pace data'}. Today's tempo at [X:XX/km] is building your lactate threshold toward your [goal time] goal")

Return JSON with this exact structure (distances shown below are ILLUSTRATIVE FORMAT EXAMPLES ONLY for a 5k plan — your actual distances MUST reflect the goal event of ${targetDistance}km and the requirements above):
{
  "planName": "12-Week Half Marathon Plan",
  "totalWeeks": 12,
  "coachingProgrammeSummary": {
    "aiDeterminedFitnessLevel": "intermediate",
    "comment": "Based on your current running data, you show a consistent aerobic base with room for speed development.",
    "keyMetrics": {
      "estimatedAveragePace": "7:30/km",
      "estimatedWeeklyMileage": "30-35km",
      "focusAreas": ["build aerobic capacity", "improve lactate threshold", "injury prevention"]
    }
  },
  "weeks": [
    {
      "weekNumber": 1,
      "weekDescription": "Base building week - focus on easy mileage",
      "totalDistance": 25.0,
      "focusArea": "endurance",
      "intensityLevel": "easy",
      "workouts": [
        {
          "dayOfWeek": 1,
          "workoutType": "easy",
          "distance": 6.0,
          "targetPace": "5:30/km",
          "intensity": "z2",
          "description": "Easy recovery run",
          "instructions": "Keep heart rate in zone 2. Should feel conversational."
        },
        {
          "dayOfWeek": 3,
          "workoutType": "tempo",
          "distance": 5.0,
          "targetPace": "TEMPO_PACE_HERE (use goal-derived tempo pace from TRAINING PACE PRESCRIPTION, NOT easy pace)",
          "intensity": "z4",
          "description": "Threshold tempo run — this pace is derived from your GOAL pace, not your easy pace",
          "instructions": "Warm up 1km easy, then hold tempo pace for 3km, cool down 1km. This should be comfortably hard."
        },
        {
          "dayOfWeek": 5,
          "workoutType": "intervals",
          "distance": 5.0,
          "targetPace": "INTERVAL_PACE_HERE (use goal-derived interval pace from TRAINING PACE PRESCRIPTION — faster than race pace)",
          "intensity": "z5",
          "intervalCount": 6,
          "intervalDistanceMeters": 400,
          "intervalDurationSeconds": null,
          "description": "Speed intervals — faster than race pace to make goal pace feel controlled",
          "instructions": "400m reps at interval pace with 90s recovery jog between reps."
        }
      ]
    }
  ]
}

CRITICAL REQUIREMENTS:
- You MUST generate EXACTLY ${weeksUntilTarget} weeks. No more, no less.
- Each week MUST have EXACTLY ${daysPerWeek} workouts.
- The "totalWeeks" field in your JSON MUST be ${weeksUntilTarget}.
- Do not add extra weeks, do not skip weeks, do not summarize weeks.
- Every single week from 1 to ${weeksUntilTarget} must be fully listed.

COACHING PROGRAMME SUMMARY REQUIREMENTS:
- aiDeterminedFitnessLevel: Your assessment of the runner's ACTUAL fitness level based on the data provided (may differ from their stated level)
- comment: A short paragraph assessing their fitness and what you observe from their running patterns
- keyMetrics.estimatedAveragePace: The realistic average pace they should target for easy runs (not a PR pace)
- keyMetrics.estimatedWeeklyMileage: Your recommended weekly volume for this plan (e.g. "30-35km")
- keyMetrics.focusAreas: Array of 3-4 focus areas for this specific runner (e.g. "build aerobic base", "improve speed", "injury prevention")

If runner has NO previous runs:
- aiDeterminedFitnessLevel: base on their stated fitness level (${experienceLevel}) first — only be conservative if the stated level is Newcomer/Beginner/Casual. For Committed/Competitive/Advanced/Elite/Professional, reflect their stated level accurately.
- comment: "No previous running history recorded. Starting from estimated baseline for their fitness level and goal event."
- estimatedAveragePace: estimate based on their profile metrics and goal event
- estimatedWeeklyMileage: appropriate starting volume for their goal event — for ultra/long distance events this must be ${goalType === 'ultra' || targetDistance > 42.2 ? `at least ${Math.round(weeklyMileageBase)}km/week` : 'proportional to the event'}, NOT a generic beginner road-running volume
- focusAreas: should reflect the actual event demands — for ultra include "build time-on-feet", "back-to-back long runs", "fatigue resistance"`;

    // Fetch AI runner profile for richer personalisation
    const aiRunnerProfile = await getRunnerProfile(userId).catch(() => null);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert running coach who creates scientifically-sound training plans. Always respond with valid JSON only, no extra text.${runnerProfileBlock(aiRunnerProfile)}`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 16000,
    });

    // Check if the response was truncated (finish_reason !== 'stop')
    const finishReason = response.choices[0].finish_reason;
    if (finishReason === 'length') {
      console.warn(`[Training Plan] OpenAI response was truncated (finish_reason=length). Retrying with shorter plan description...`);
    }

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

    console.log(`[Training Plan] AI returned ${planData.weeks.length} weeks, expected ${weeksUntilTarget}`);

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
    if (planData.weeks.length < weeksUntilTarget) {
      console.warn(`[Training Plan] AI returned fewer weeks (${planData.weeks.length}) than requested (${weeksUntilTarget}). Filling missing weeks.`);
      const lastWeek = planData.weeks[planData.weeks.length - 1];
      while (planData.weeks.length < weeksUntilTarget) {
        const newWeekNum = planData.weeks.length + 1;
        planData.weeks.push({
          ...lastWeek,
          weekNumber: newWeekNum,
          weekDescription: `Week ${newWeekNum} — Continue building fitness`,
          workouts: (lastWeek?.workouts || []).map((w: any) => ({ ...w }))
        });
      }
    } else if (planData.weeks.length > weeksUntilTarget) {
      console.warn(`[Training Plan] AI returned more weeks (${planData.weeks.length}) than requested (${weeksUntilTarget}). Trimming.`);
      planData.weeks = planData.weeks.slice(0, weeksUntilTarget);
    }

    // Sanitise numeric fields before DB insert — Postgres rejects NaN for integer/real columns
    const safeTargetTime   = (targetTime != null && !isNaN(targetTime) && targetTime > 0) ? Math.round(targetTime) : null;
    const safeWeeklyMileage = (!isNaN(weeklyMileageBase) && weeklyMileageBase > 0) ? weeklyMileageBase : 20;
    const safeDaysPerWeek   = (!isNaN(daysPerWeek) && daysPerWeek >= 1) ? Math.round(daysPerWeek) : 4;

    // Create training plan in database
    const plan = await db
      .insert(trainingPlans)
      .values({
        userId,
        goalType,
        targetDistance,
        targetTime: safeTargetTime,
        targetDate,
        totalWeeks: weeksUntilTarget,
        experienceLevel,
        weeklyMileageBase: safeWeeklyMileage,
        daysPerWeek: safeDaysPerWeek,
        includeSpeedWork: true,
        includeHillWork: true,
        includeLongRuns: true,
        status: "active",
        aiGenerated: true,
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
        const orientationWorkout = await db
          .insert(plannedWorkouts)
          .values({
            weeklyPlanId: weeklyPlanId,
            dayOfWeek: todayInUserTz.getDay(),
            scheduledDate: todayInUserTz,
            workoutType: "orientation",
            distance: orientationAssessment.recommendedDistance,
            targetPace: orientationAssessment.recommendedPace,
            intensity: "z2", // Zone 2 (conversational)
            description: "Orientation Run: Establish Your Baseline Fitness",
            instructions: orientationAssessment.orientationBrief,
            effortDescription: "Conversational effort - Zone 2",
            sessionGoal: "assess_fitness",
            sessionIntent: "orientation_run",
            hrZoneNumber: 2,
            hrZoneMinBpm: orientationAssessment.targetHeartRateZone?.min,
            hrZoneMaxBpm: orientationAssessment.targetHeartRateZone?.max,
            hrZoneScenario: hrZoneScenario,
          })
          .returning();

        const orientationWorkoutId = orientationWorkout[0].id;
        console.log(`[Orientation] ✅ Orientation workout created: ${orientationWorkoutId}`);

        // Schedule session instructions generation for orientation
        pendingSessionInstructions.push({
          workoutId: orientationWorkoutId,
          workoutType: "orientation",
          intensity: "z2",
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

    console.log(`✅ Generated ${weeksUntilTarget}-week training plan for user ${userId} (${pendingSessionInstructions.length} workouts queued for coaching instructions)`);

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

/**
 * Training Plan AI Generator Service
 * 
 * Generates personalized training plans using OpenAI GPT-4.
 * Plans are tailored to user's fitness level, goals, and current training load.
 */

import { db } from "./db";
import { trainingPlans, weeklyPlans, plannedWorkouts, users, runs, goals, connectedDevices, planAdaptations, sessionInstructions } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { getCurrentFitness } from "./fitness-service";
import { HeartRateZones } from "./heart-rate-zones"; // Assuming we create this utility
import { generateSessionInstructions } from "./session-coaching-service";
import { getRunnerProfile, runnerProfileBlock } from "./runner-profile-service";
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
  overrideWeight: number | null = null   // kg
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

    const recentRuns = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          gte(runs.completedAt, ninetyDaysAgo)
        )
      )
      .orderBy(desc(runs.completedAt))
      .limit(30);

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
    const weeklyMileageBase = runsLast30.length > 0 ? (totalDistanceLast30 / 4) : 20;

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

    // ── Calculate BMI from user profile — fall back to Android-sent overrides if DB is empty ──
    const userHeight = user[0]?.height || overrideHeight || 170; // cm
    const userWeight = user[0]?.weight || overrideWeight || 70; // kg
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
    const weeksUntilTarget = (durationWeeks && durationWeeks > 0) ? durationWeeks : (targetDate ? 
      Math.ceil((targetDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)) : 
      getPlanDuration(goalType, experienceLevel));
    console.log(`[Training Plan] Duration: durationWeeks=${durationWeeks}, weeksUntilTarget=${weeksUntilTarget}`);

    // Calculate user age for HR zone calculations — fall back to Android-sent override if DOB not set
    const userAge = user[0]?.dob
      ? Math.floor((Date.now() - new Date(user[0].dob).getTime()) / 31557600000)
      : (overrideAge || 30);
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

Pace Trend: ${paceTrend || 'Not enough data yet'}` : `IMPORTANT: This runner has NO previous run data recorded. 
We will use their stated fitness level (${experienceLevel}) to estimate baseline pace and mileage. 
Create a plan that starts conservatively and includes baseline-building runs in the first week to establish their actual current fitness. 
Then adjust subsequent weeks based on performance.`}
`;

    // Generate plan with OpenAI
    const prompt = `You are an expert running coach. Generate a tailored ${weeksUntilTarget}-week training plan for a ${experienceLevel} runner preparing for a ${goalType} (${targetDistance}km).

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
${injuries.length > 0 ? `
INJURIES & LIMITATIONS:
${injuries.map(i => `- ${i.bodyPart}: ${i.status}${i.notes ? ` — ${i.notes}` : ''}`).join("\n")}

CRITICAL INJURY GUIDELINES:
- For "active" injuries: AVOID all exercises that stress the affected area. Replace with cross-training or rest days.
- For "recovering" injuries: REDUCE intensity and impact. No speed work, hill repeats, or long runs that stress the affected body part. Favor easy runs on flat terrain.
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
2. Build gradually from current ${weeklyMileageBase.toFixed(1)}km/week base
3. Include easy runs, tempo runs, intervals, and long runs across each week
4. Follow 80/20 rule (80% easy effort, 20% quality/hard sessions)
5. Build for 3 weeks, recover 1 week pattern
6. Taper for final 2 weeks before race
7. Increase weekly volume by max 10% per week
8. Reference the runner's current performance AND goal in workout descriptions (e.g. "your current 5km is around ${avgTimeAtGoalDistanceStr || 'estimated from pace data'}. Today's tempo at [X:XX/km] is building your lactate threshold toward your [goal time] goal")

Return JSON with this exact structure:
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
- aiDeterminedFitnessLevel: base on their age, height, weight, BMI and stated level - be conservative
- comment: "No previous running history. Starting with conservative baseline to establish fitness levels."
- estimatedAveragePace: estimate based on their profile metrics
- estimatedWeeklyMileage: appropriate starting point for a beginner
- focusAreas: should include "establish baseline", "build aerobic foundation", "injury prevention"`;

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

    // Create training plan in database
    const plan = await db
      .insert(trainingPlans)
      .values({
        userId,
        goalType,
        targetDistance,
        targetTime,
        targetDate,
        totalWeeks: weeksUntilTarget,
        experienceLevel,
        weeklyMileageBase,
        daysPerWeek,
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

    // Create weekly plans and workouts
    for (const week of planData.weeks) {
      const weeklyPlan = await db
        .insert(weeklyPlans)
        .values({
          trainingPlanId: planId,
          weekNumber: week.weekNumber,
          weekDescription: week.weekDescription,
          totalDistance: week.totalDistance,
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
          hrZoneMinBpm = zoneRange.min;
          hrZoneMaxBpm = zoneRange.max;

          // Set effort description based on scenario
          if (hrZoneScenario === 'effort') {
            const zoneDesc = HeartRateZones.getZoneDescription(hrZoneNumber);
            effortDescription = zoneDesc.effortLabel;
          }
        }

        const plannedWorkoutResult = await db
          .insert(plannedWorkouts)
          .values({
            weeklyPlanId,
            trainingPlanId: planId,
            dayOfWeek: workout.dayOfWeek,
            scheduledDate,
            workoutType: workout.workoutType,
            distance: workout.distance,
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
          const coaching = await generateSessionInstructions(userId, w.workoutId, {
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
  reason: string, // missed_workout, injury, over_training, ahead_of_schedule
  userId: string
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

    // Generate adaptation recommendation with AI
    const prompt = `As a running coach, adapt this training plan due to: ${reason}

Current Status:
- Current week: ${plan[0].currentWeek}/${plan[0].totalWeeks}
- Completed workouts: ${completedWorkouts.length}
- Current fitness (CTL): ${fitness?.ctl || 'N/A'}
- Training status: ${fitness?.status || 'N/A'}

Recommend adaptations in JSON format:
{
  "recommendation": "Brief explanation of changes",
  "adjustments": [
    "Reduce next week volume by 20%",
    "Add extra rest day"
  ],
  "continueAsIs": false
}`;

    const aiRunnerProfile = await getRunnerProfile(userId).catch(() => null);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert running coach providing training plan adaptations. Respond with JSON only.${runnerProfileBlock(aiRunnerProfile)}`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 500,
    });

    const adaptation = JSON.parse(response.choices[0].message.content || "{}");

    // Save adaptation
    await db.insert(planAdaptations).values({
      trainingPlanId: planId,
      reason,
      changes: adaptation,
      aiSuggestion: adaptation.recommendation,
      userAccepted: false,
    });

    console.log(`✅ Plan adaptation created for ${reason}`);
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

        // Build AI prompt for plan reassessment
        const prompt = `As an expert running coach, reassess this training plan based on recent run data.

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

RECENT RUN (Just Completed):
- Distance: ${(run.distance / 1000).toFixed(2)} km
- Duration: ${(run.duration / 60).toFixed(0)} minutes
- Pace: ${run.avgPace || 'N/A'}
- Calories: ${run.calories || 'N/A'}
- Avg Heart Rate: ${run.avgHeartRate || 'N/A'} bpm
- Max Heart Rate: ${run.maxHeartRate || 'N/A'} bpm
- Elevation Gain: ${run.elevationGain || 0} m

PROGRESS:
- Completed Workouts in Plan: ${completedWorkouts.length}
- Recent Run Count (last 10): ${recentRuns.length}

Based on this runner's progress and the recent run, assess if the plan needs adjustment. Consider:
1. Is the runner progressing well or struggling?
2. Should we adjust weekly mileage or intensity?
3. Are there any red flags (overtraining, undertraining)?
4. Is the runner on pace to achieve their goal?

Provide your assessment in JSON format:
{
  "needsAdjustment": true/false,
  "reason": "Brief explanation of why plan needs/doesn't need adjustment",
  "adjustmentType": "none" | "volume_reduction" | "volume_increase" | "intensity_adjustment" | "recovery_addition",
  "recommendation": "Specific coaching recommendation",
  "adjustments": [
    "List of specific changes to implement"
  ]
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
        if (assessment.needsAdjustment) {
          console.log(
            `[Plan Reassessment] Triggering adaptation for plan ${plan.id}: ${assessment.reason}`
          );
          await adaptTrainingPlan(
            plan.id,
            `run_data_feedback: ${assessment.reason}`,
            userId
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

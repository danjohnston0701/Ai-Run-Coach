/**
 * Training Plan AI Generator Service
 * 
 * Generates personalized training plans using OpenAI GPT-4.
 * Plans are tailored to user's fitness level, goals, and current training load.
 */

import { db } from "./db";
import { trainingPlans, weeklyPlans, plannedWorkouts, users, runs, goals } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { getCurrentFitness } from "./fitness-service";
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

export async function generateTrainingPlan(
  userId: string,
  goalType: string, // 5k, 10k, half_marathon, marathon, ultra
  targetDistance: number, // km
  targetTime?: number, // seconds
  targetDate?: Date,
  experienceLevel: string = "intermediate", // beginner, intermediate, advanced
  daysPerWeek: number = 4,
  regularSessions: RegularSessionInput[] = [],
  firstSessionStart: string = "flexible"  // "today" | "tomorrow" | "flexible"
): Promise<string> {
  try {
    // Get user profile
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

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
    const weeksUntilTarget = targetDate ? 
      Math.ceil((targetDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)) : 
      getPlanDuration(goalType, experienceLevel);

    // Build context for AI
    const context = {
      user: {
        fitnessLevel: user[0]?.fitnessLevel || experienceLevel,
        age: user[0]?.dob ? Math.floor((Date.now() - new Date(user[0].dob).getTime()) / 31557600000) : null,
        gender: user[0]?.gender,
      },
      fitness: fitness ? {
        ctl: fitness.ctl,
        atl: fitness.atl,
        tsb: fitness.tsb,
        status: fitness.status,
      } : null,
      recentActivity: {
        runsLast30Days: runsLast30.length,
        runsLast90Days: recentRuns.length,
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

    // Generate plan with OpenAI
    const prompt = `You are an expert running coach. Generate a ${weeksUntilTarget}-week training plan for a ${experienceLevel} runner preparing for a ${goalType} (${targetDistance}km).

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
${targetTime ? `- Target time: ${Math.floor(targetTime / 60)}:${String(Math.round((targetTime % 60))).padStart(2,'0')} (mm:ss)
- Gap to close: ${avgTimeAtGoalDistanceSecs && targetTime ? `runner currently averages ${avgTimeAtGoalDistanceStr}, needs to improve by approximately ${Math.round((avgTimeAtGoalDistanceSecs - targetTime) / 60)} minute(s) ${Math.abs(Math.round((avgTimeAtGoalDistanceSecs - targetTime) % 60))}s` : 'use your expert judgment based on their current pace'}` : ''}
${targetDate ? `- Race date: ${targetDate.toDateString()}` : ''}

${regularSessions.length > 0 ? `
Regular Weekly Runs (already in the user's schedule):
${regularSessions.map(s => {
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const time = `${String(s.timeHour).padStart(2,"0")}:${String(s.timeMinute).padStart(2,"0")}`;
  const countNote = s.countsTowardWeeklyTotal
    ? "counts towards weekly session total"
    : "EXTRA – does NOT count towards weekly session total";
  return `- ${s.name}: every ${dayNames[s.dayOfWeek] ?? `Day ${s.dayOfWeek}`} at ${time}, ${s.distanceKm}km (${countNote})`;
}).join("\n")}

IMPORTANT: Place these sessions on the correct days in the plan. Sessions marked "EXTRA" should be treated as additional workload on top of the ${daysPerWeek} AI-generated sessions per week — do not replace an AI session with them. Sessions that count towards the total should be included in the ${daysPerWeek} sessions for that week.
` : ""}
Schedule:
- First session: ${
  firstSessionStart === "today" ? `TODAY (${new Date().toDateString()}) — schedule the first workout for today` :
  firstSessionStart === "tomorrow" ? `TOMORROW (${new Date(Date.now() + 86400000).toDateString()}) — schedule the first workout for tomorrow` :
  "Flexible — AI should choose the optimal start day based on the weekly pattern and days per week"
}

Requirements:
1. Base all paces on the runner's actual current ability shown above — NOT generic tables. If their current ${targetDistance}km time is ${avgTimeAtGoalDistanceStr || 'unknown'}, pace prescriptions must start from that reality.
2. Build gradually from current ${weeklyMileageBase.toFixed(1)}km/week base
3. Include easy runs, tempo runs, intervals, and long runs
4. Follow 80/20 rule (80% easy, 20% hard)
5. Build for 3 weeks, recover 1 week pattern
6. Taper for final 2 weeks before race
7. Increase weekly volume by max 10% per week
8. Reference the runner's current performance data when writing workout descriptions (e.g. "your current 5km is around ${avgTimeAtGoalDistanceStr || 'estimated from pace data'} — today's tempo target will bring you closer to your goal")

Return JSON with this exact structure:
{
  "planName": "12-Week Half Marathon Plan",
  "totalWeeks": 12,
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
        }
      ]
    }
  ]
}

Include all ${weeksUntilTarget} weeks with ${daysPerWeek} workouts per week.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert running coach who creates scientifically-sound training plans. Always respond with valid JSON only, no extra text."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4000,
    });

    const planData = JSON.parse(response.choices[0].message.content || "{}");

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
        // Calculate scheduled date
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + ((week.weekNumber - 1) * 7) + workout.dayOfWeek);

        await db.insert(plannedWorkouts).values({
          weeklyPlanId,
          trainingPlanId: planId,
          dayOfWeek: workout.dayOfWeek,
          scheduledDate,
          workoutType: workout.workoutType,
          distance: workout.distance,
          targetPace: workout.targetPace,
          intensity: workout.intensity,
          description: workout.description,
          instructions: workout.instructions,
          isCompleted: false,
        });
      }
    }

    console.log(`✅ Generated ${weeksUntilTarget}-week training plan for user ${userId}`);
    return planId;
  } catch (error) {
    console.error("Error generating training plan:", error);
    throw error;
  }
}

/**
 * Get default plan duration based on goal type and experience level
 */
function getPlanDuration(goalType: string, experienceLevel: string): number {
  const durations: Record<string, Record<string, number>> = {
    "5k": { beginner: 8, intermediate: 6, advanced: 4 },
    "10k": { beginner: 10, intermediate: 8, advanced: 6 },
    "half_marathon": { beginner: 14, intermediate: 12, advanced: 10 },
    "marathon": { beginner: 20, intermediate: 18, advanced: 16 },
    "ultra": { beginner: 24, intermediate: 20, advanced: 18 },
  };

  return durations[goalType]?.[experienceLevel] || 12;
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

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert running coach providing training plan adaptations. Respond with JSON only."
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

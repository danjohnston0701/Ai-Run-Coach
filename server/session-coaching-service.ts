import OpenAI from "openai";
import { db } from "./db";
import { sessionInstructions, plannedWorkouts, users } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import {
  generateSessionCoaching,
  type GenerateSessionCoachingParams,
  type SessionCoachingPlan,
} from "./ai-service";
import { getRunnerProfile, runnerProfileBlock } from "./runner-profile-service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Session coaching tone and style determination
 *
 * The AI determines the best tone for a specific training session based on:
 * - User's athletic grade and run history
 * - Session type and goal (intervals, zone 2, recovery, etc)
 * - Workout intensity and duration
 * - User's prior preferences but with permission to adapt
 *
 * This ensures coaching is DYNAMIC and SESSION-SPECIFIC, not generic.
 */

export interface SessionToneRequest {
  userId: string;
  plannedWorkoutId: string;
  workoutType: string; // "easy", "tempo", "intervals", "long_run", "hill_repeats", "recovery", etc
  intensity: string; // "z1", "z2", "z3", "z4", "z5"
  sessionGoal?: string; // "build_fitness", "develop_speed", "active_recovery", "endurance"
  sessionIntent?: string;
  intervalCount?: number;
  distance?: number;
  duration?: number;
}

export interface DeterminedTone {
  tone: string; // "light_fun", "direct", "motivational", "calm", "serious", "playful"
  intensity: "relaxed" | "moderate" | "intense";
  coachingStyle: {
    tone: string;
    encouragementLevel: "low" | "moderate" | "high";
    detailDepth: "minimal" | "moderate" | "detailed";
    technicalDepth: "simple" | "moderate" | "advanced";
  };
  insightFilters: {
    include: string[];
    exclude: string[];
  };
  toneReasoning: string;
}

/**
 * Determine the optimal tone and coaching style for a specific training session.
 * The AI considers the user's profile, session characteristics, and desired outcomes.
 */
export async function determineSessonCoachingTone(
  request: SessionToneRequest
): Promise<DeterminedTone> {
  // Fetch user profile
  const userRecord = await db
    .select()
    .from(users)
    .where(eq(users.id, request.userId))
    .then((rows) => rows[0]);

  if (!userRecord) {
    throw new Error(`User not found: ${request.userId}`);
  }

  // Fetch planned workout for context
  const workoutRecord = await db
    .select()
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.id, request.plannedWorkoutId))
    .then((rows) => rows[0]);

  // Build athletic profile summary for AI
  const athleticProfile = buildAthleticProfile(userRecord);

  // Build session characteristics summary
  const sessionCharacteristics = buildSessionCharacteristics(request);

  // Fetch AI runner profile for hyper-personalised tone selection
  const aiRunnerProfile = await getRunnerProfile(request.userId).catch(() => null);

  // Call OpenAI to determine optimal tone
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an expert running coach AI that determines the optimal coaching tone and style for specific training sessions.

Your task is to analyze a runner's profile, their training session characteristics, and recommend the BEST tone and coaching approach for THIS specific session.

Consider:
- The runner's athletic level and experience
- The session goal (speed development, endurance, recovery, etc)
- The intensity level (hard intervals vs easy zone 2 run)
- Whether they're a beginner who needs encouragement or an advanced athlete who wants direct instruction
- The session's purpose within their training plan

Your recommendation should sometimes OVERRIDE their stated preference if the session demands a different approach.
For example: An elite runner doing an easy recovery run should get a light, playful tone (not serious/direct).
A beginner doing their first tempo session might need more encouragement and detailed guidance.

You must respond with ONLY valid JSON (no markdown, no code blocks).${runnerProfileBlock(aiRunnerProfile)}`,
      },
      {
        role: "user",
        content: `
RUNNER PROFILE:
${athleticProfile}

SESSION CHARACTERISTICS:
${sessionCharacteristics}

INSTRUCTION:
Determine the optimal coaching tone and style for this session. Consider how to make it engaging and effective for THIS specific runner doing THIS specific workout.

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "tone": "light_fun|direct|motivational|calm|serious|playful|instructive",
  "intensity": "relaxed|moderate|intense",
  "reasoning": "Brief explanation of why you chose this tone",
  "coachingStyle": {
    "encouragementLevel": "low|moderate|high",
    "detailDepth": "minimal|moderate|detailed",
    "technicalDepth": "simple|moderate|advanced"
  },
  "insightFilters": {
    "include": ["pace_deviation", "effort_level", "recovery_quality"],
    "exclude": ["km_splits", "500m_summary"]
  }
}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 600,
  });

  const responseText =
    response.choices[0].message.content || '{"tone": "motivational"}';

  // Parse JSON response
  let parsed;
  try {
    // Remove markdown code blocks if present
    const cleaned = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse AI response:", responseText);
    // Fallback to safe defaults
    parsed = {
      tone: "motivational",
      intensity: "moderate",
      reasoning: "Fallback due to parse error",
      coachingStyle: {
        encouragementLevel: "moderate",
        detailDepth: "moderate",
        technicalDepth: "moderate",
      },
      insightFilters: {
        include: ["pace_deviation", "effort_level"],
        exclude: ["500m_summary"],
      },
    };
  }

  return {
    tone: parsed.tone || "motivational",
    intensity: parsed.intensity || "moderate",
    coachingStyle: {
      tone: parsed.tone || "motivational",
      encouragementLevel: parsed.coachingStyle?.encouragementLevel || "moderate",
      detailDepth: parsed.coachingStyle?.detailDepth || "moderate",
      technicalDepth: parsed.coachingStyle?.technicalDepth || "moderate",
    },
    insightFilters: {
      include: parsed.insightFilters?.include || [
        "pace_deviation",
        "effort_level",
      ],
      exclude: parsed.insightFilters?.exclude || ["500m_summary"],
    },
    toneReasoning:
      parsed.reasoning || "AI-determined optimal tone for this session",
  };
}

/**
 * Build a text summary of the runner's athletic profile
 */
function buildAthleticProfile(userRecord: any): string {
  const athleticGrade = userRecord.athleticGrade || "unknown";
  const previousRuns = userRecord.previousRunsCount || 0;
  const weeklyMileage = userRecord.averageWeeklyMileage || 0;
  const raceExperience = userRecord.priorRaceExperience || "none";
  const fitnessLevel = userRecord.fitnessLevel || "intermediate";
  const userPreferenceTone = userRecord.coachTone || "energetic";
  const allowAdaptation = userRecord.allowAiToneAdaptation !== false;

  return `
- Athletic Grade: ${athleticGrade}
- Fitness Level: ${fitnessLevel}
- Prior Races: ${raceExperience}
- Previous Runs Completed: ${previousRuns}
- Average Weekly Mileage: ${weeklyMileage} km
- User's Preferred Coaching Tone: ${userPreferenceTone}
- Allow AI to Adapt Tone Per Session: ${allowAdaptation ? "Yes" : "No"}
- Injury History: ${userRecord.injuryHistory ? "Present" : "None recorded"}
  `;
}

/**
 * Build a text summary of the session characteristics
 */
function buildSessionCharacteristics(request: SessionToneRequest): string {
  const workoutType = request.workoutType;
  const intensity = request.intensity;
  const goal = request.sessionGoal || "general fitness";
  const duration = request.duration
    ? `${Math.round(request.duration / 60)} minutes`
    : "unknown duration";
  const distance = request.distance ? `${request.distance.toFixed(1)} km` : "unknown distance";

  let sessionDesc = `
- Workout Type: ${workoutType}
- Heart Rate Zone: ${intensity}
- Session Goal: ${goal}
- Expected Duration: ${duration}
- Expected Distance: ${distance}
  `;

  // Add interval-specific details
  if (request.intervalCount) {
    sessionDesc += `- Intervals: ${request.intervalCount} repetitions\n`;
  }

  // Add coaching context based on type
  if (workoutType === "intervals" || workoutType === "hill_repeats") {
    sessionDesc += `\nSESSION TYPE: Speed/Strength Development
This session builds speed, power, and anaerobic capacity.
Runner needs: Focus on effort, pacing cues, encouragement during hard work, form focus.`;
  } else if (intensity === "z2") {
    sessionDesc += `\nSESSION TYPE: Zone 2 / Aerobic Base Building
This is a CONDITIONING session at easy pace designed to build aerobic capacity.
Runner needs: Keep it light, fun, conversational. Let the easy pace be meditative.`;
  } else if (intensity === "z1") {
    sessionDesc += `\nSESSION TYPE: Recovery / Easy
This is a recovery session for active regeneration.
Runner needs: Relax, keep it easy, focus on enjoyment not performance.`;
  } else if (workoutType === "long_run") {
    sessionDesc += `\nSESSION TYPE: Long Run / Endurance
Building aerobic capacity and mental toughness over distance.
Runner needs: Steady pacing, mental game support, milestone celebrations.`;
  } else if (workoutType === "tempo") {
    sessionDesc += `\nSESSION TYPE: Tempo Run / Threshold Work
Pushing the aerobic threshold, building lactate tolerance.
Runner needs: Direct cues, effort encouragement, clear pacing targets.`;
  }

  return sessionDesc;
}

/**
 * Generate complete session instructions for a planned workout.
 * Runs tone determination and AI session design in parallel for speed.
 */
export async function generateSessionInstructions(
  userId: string,
  plannedWorkoutId: string,
  workoutData: SessionToneRequest
) {
  // Fetch AI runner profile once — reuse in both parallel calls
  const aiRunnerProfile = await getRunnerProfile(userId).catch(() => null);

  // Run tone determination and session design in parallel
  const [toneDecision, sessionDesign] = await Promise.all([
    determineSessonCoachingTone({ userId, plannedWorkoutId, ...workoutData }),
    generateAiSessionDesign(workoutData, aiRunnerProfile),
  ]);

  return {
    preRunBrief: sessionDesign.preRunBrief,
    sessionStructure: sessionDesign.sessionStructure,
    aiDeterminedTone: toneDecision.tone,
    aiDeterminedIntensity: toneDecision.intensity,
    coachingStyle: toneDecision.coachingStyle,
    insightFilters: toneDecision.insightFilters,
    toneReasoning: toneDecision.toneReasoning,
  };
}

/**
 * Use GPT-4o-mini to generate a personalised pre-run brief AND a detailed
 * session structure with phase-by-phase targets and coaching trigger messages.
 *
 * Returns both as a single AI call to keep latency and cost low.
 */
async function generateAiSessionDesign(workout: SessionToneRequest, aiRunnerProfile?: string | null): Promise<{
  preRunBrief: string;
  sessionStructure: any;
}> {
  const sessionDesc = buildSessionCharacteristics(workout);

  const systemPrompt = `You are an expert running coach AI designing a specific training session.
Your job is to:
1. Write a short, motivating pre-run briefing (2-4 sentences) that tells the runner exactly what they're doing today, what to focus on, and why this session matters for their goal.
2. Design a precise session structure with phases, targets, and coaching trigger messages.

The briefing should be SPECIFIC to this session — not generic. Mention the exact distances, intensities, and what to feel.
The session structure must include coaching trigger messages that are ACTIVE and INSTRUCTIVE, not just descriptive.

You must respond with ONLY valid JSON (no markdown, no code blocks).${runnerProfileBlock(aiRunnerProfile)}`;

  const userPrompt = `SESSION TO DESIGN:
${sessionDesc}

Return ONLY valid JSON in this exact format:
{
  "preRunBrief": "2-4 sentence motivating brief specific to this session",
  "sessionStructure": {
    "type": "${workout.workoutType}",
    "goal": "${workout.sessionGoal || "general fitness"}",
    "phases": [
      {
        "name": "warmup",
        "durationKm": 1.0,
        "durationSeconds": null,
        "targetIntensity": "z1-z2",
        "targetPaceNote": "Very easy, conversational",
        "description": "Description of this phase",
        "repetitions": null
      }
    ],
    "coachingTriggers": [
      {
        "phase": "phase_name",
        "trigger": "at_start|at_end|rep_start|rep_end|every_km|pace_deviation|hr_alert",
        "message": "Specific coaching message for this trigger (1-2 sentences, active voice)"
      }
    ]
  }
}

PHASE DESIGN RULES:
- For intervals/hill_repeats: warmup (1-2km) + N repetitions of work + recovery between each + cooldown (0.5-1km)
- For tempo runs: warmup (1km) + tempo block + cooldown (0.5km)
- For easy/zone2/recovery: single easy_run phase covering the full distance
- For long runs: easy_run phase with milestone coaching triggers at 25%, 50%, 75%, final_stretch
- durationKm should be the distance of that phase. For repeating intervals, set repetitions and durationKm = distance per rep.
- For each interval rep, the coachingTriggers must have rep_start and rep_end triggers with specific messages.
- Coaching trigger messages must be SHORT (under 20 words), direct, and actionable.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const responseText = response.choices[0].message.content || "{}";
    const cleaned = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      preRunBrief: parsed.preRunBrief || buildFallbackBrief(workout),
      sessionStructure: parsed.sessionStructure || buildFallbackStructure(workout),
    };
  } catch (e) {
    console.error("Failed to generate AI session design, using fallback:", e);
    return {
      preRunBrief: buildFallbackBrief(workout),
      sessionStructure: buildFallbackStructure(workout),
    };
  }
}

/**
 * Fallback pre-run brief when AI call fails
 */
function buildFallbackBrief(workout: SessionToneRequest): string {
  const distStr = workout.distance ? `${workout.distance.toFixed(1)}km` : "today's";
  const typeStr = workout.workoutType.replace(/_/g, " ");
  if (workout.intervalCount) {
    return `Today is ${distStr} ${typeStr} with ${workout.intervalCount} repetitions. Hit each rep hard and recover well between them. This session builds your speed and fitness — trust the process.`;
  }
  return `Today's ${distStr} ${typeStr} session focuses on ${workout.sessionGoal?.replace(/_/g, " ") || "building your fitness"}. Run at a controlled effort and stay consistent throughout.`;
}

/**
 * Fallback session structure when AI call fails
 */
function buildFallbackStructure(workout: SessionToneRequest): any {
  if (workout.workoutType === "intervals" || workout.workoutType === "hill_repeats") {
    return {
      type: workout.workoutType,
      goal: workout.sessionGoal || "speed_development",
      phases: [
        { name: "warmup", durationKm: 1.0, durationSeconds: null, description: "Easy warm-up jog", repetitions: null },
        { name: "main_set", durationKm: workout.distance ? workout.distance * 0.1 : 0.4, durationSeconds: null, description: `${workout.intervalCount || 6} hard repetitions`, repetitions: workout.intervalCount || 6 },
        { name: "cooldown", durationKm: 0.5, durationSeconds: null, description: "Easy cool-down", repetitions: null },
      ],
      coachingTriggers: [
        { phase: "warmup", trigger: "at_end", message: "Warmup done. Get ready to push — first rep in 200m." },
        { phase: "main_set", trigger: "rep_start", message: "GO! Push hard, stay tall, drive those arms." },
        { phase: "main_set", trigger: "rep_end", message: "Rep done. Shake it out, breathe, recover fully." },
        { phase: "cooldown", trigger: "at_start", message: "Strong work today. Easy jog to cool down now." },
      ],
    };
  } else if (workout.workoutType === "tempo") {
    return {
      type: "tempo",
      goal: workout.sessionGoal || "threshold_development",
      phases: [
        { name: "warmup", durationKm: 1.0, durationSeconds: null, description: "Easy warm-up jog", repetitions: null },
        { name: "tempo_block", durationKm: (workout.distance || 6) - 1.5, durationSeconds: null, description: "Sustained tempo effort at threshold pace", repetitions: null },
        { name: "cooldown", durationKm: 0.5, durationSeconds: null, description: "Easy cool-down jog", repetitions: null },
      ],
      coachingTriggers: [
        { phase: "warmup", trigger: "at_end", message: "Build into tempo pace now. Controlled, uncomfortable but manageable." },
        { phase: "tempo_block", trigger: "at_start", message: "Tempo effort. Find your rhythm, breathe steady, hold the pace." },
        { phase: "tempo_block", trigger: "every_km", message: "Stay locked in. This discomfort is building your engine." },
        { phase: "cooldown", trigger: "at_start", message: "Excellent tempo work. Easy jog to finish." },
      ],
    };
  } else if (workout.workoutType === "long_run") {
    return {
      type: "long_run",
      goal: workout.sessionGoal || "endurance",
      phases: [
        { name: "easy_run", durationKm: workout.distance || 15, durationSeconds: null, description: "Steady long run at easy conversational pace", repetitions: null },
      ],
      coachingTriggers: [
        { phase: "easy_run", trigger: "at_start", message: "Long run day. Start easy — the goal is time on feet, not speed." },
        { phase: "easy_run", trigger: "every_km", message: "Stay easy, stay steady. You're building your aerobic engine." },
      ],
    };
  } else {
    return {
      type: workout.workoutType,
      goal: workout.sessionGoal || "general_fitness",
      phases: [
        { name: "easy_run", durationKm: workout.distance || 5, durationSeconds: null, description: "Easy conversational run", repetitions: null },
      ],
      coachingTriggers: [
        { phase: "easy_run", trigger: "at_start", message: "Keep it easy and conversational. Enjoy the run." },
        { phase: "easy_run", trigger: "every_km", message: "Good rhythm. Stay relaxed and breathe steady." },
      ],
    };
  }

  return {
    type: workout.workoutType,
    goal: workout.sessionGoal || "general fitness",
    phases: [],
    coachingTriggers: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getOrGenerateSessionCoaching
//
// The main orchestration function for the new dynamic coaching system.
// Called when a user taps "Prepare Run" — generates and caches a bespoke
// SessionCoachingPlan for the specific workout.
//
// Caching: if a plan already exists for this workout, returns the cached
// version immediately (no extra AI cost). This handles the case where the
// user prepares, goes back, and prepares again.
//
// Returns the full SessionCoachingPlan including phases, triggers, tone,
// and cueingStrategy — ready for the live run engine to use.
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionCoachingRequest {
  userId: string;
  plannedWorkoutId: string;
  forceRegenerate?: boolean;  // bypass cache and generate fresh
}

export async function getOrGenerateSessionCoaching(
  request: SessionCoachingRequest
): Promise<SessionCoachingPlan> {
  const { userId, plannedWorkoutId, forceRegenerate = false } = request;

  // 1. Check cache — return existing plan if available and not forced to regenerate
  if (!forceRegenerate) {
    const existing = await db
      .select()
      .from(sessionInstructions)
      .where(eq(sessionInstructions.plannedWorkoutId, plannedWorkoutId))
      .then((rows) => rows[0]);

    if (existing?.sessionStructure) {
      const structure = existing.sessionStructure as any;

      // Check if this is the new-format SessionCoachingPlan (has phases + triggers)
      if (structure?.phases && structure?.triggers && structure?.cueingStrategy) {
        console.log(`[getOrGenerateSessionCoaching] Cache hit for workout ${plannedWorkoutId}`);
        return structure as SessionCoachingPlan;
      }
    }
  }

  // 2. Load workout details
  const workout = await db
    .select()
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.id, plannedWorkoutId))
    .then((rows) => rows[0]);

  if (!workout) {
    throw new Error(`Planned workout not found: ${plannedWorkoutId}`);
  }

  // 3. Load user profile
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .then((rows) => rows[0]);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // 4. Parse target pace from "mm:ss" string to sec/km integer
  function paceStringToSecPerKm(paceStr?: string | null): number | undefined {
    if (!paceStr) return undefined;
    const parts = paceStr.split(":");
    if (parts.length !== 2) return undefined;
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }

  // 5. Build GenerateSessionCoachingParams from DB workout data
  const params: GenerateSessionCoachingParams = {
    sessionType:           workout.workoutType,
    sessionGoal:           workout.sessionGoal ?? "general_fitness",
    targetDurationMinutes: workout.duration ? Math.round(workout.duration / 60) : 45,
    targetDistanceKm:      workout.distance ?? 5,
    targetPaceMin:         paceStringToSecPerKm(workout.targetPace),
    targetPaceMax:         workout.targetPace
                             ? paceStringToSecPerKm(workout.targetPace)! + 30  // +30s/km tolerance
                             : undefined,
    targetHRMin:           workout.hrZoneMinBpm ?? undefined,
    targetHRMax:           workout.hrZoneMaxBpm ?? undefined,
    sessionInstructions:   workout.instructions ?? workout.description ?? undefined,
    runnerProfile: {
      age:                  (user as any).age ?? undefined,
      gender:               (user as any).gender ?? undefined,
      fitnessLevel:         (user as any).fitnessLevel ?? "intermediate",
      recentPaceAvgSecPerKm: (user as any).recentPaceAvgSecPerKm ?? undefined,
      recentHRAvg:          (user as any).recentHRAvg ?? undefined,
      injuries:             (user as any).injuryHistory ? [(user as any).injuryHistory] : [],
      weeklyMileageKm:      (user as any).averageWeeklyMileage ?? undefined,
    },
    coachName:  (user as any).coachName  ?? "Coach",
    coachTone:  (user as any).coachTone  ?? "motivational",
    coachAccent: (user as any).coachAccent ?? undefined,
  };

  // 6. Generate the bespoke coaching plan
  console.log(`[getOrGenerateSessionCoaching] Generating plan for ${workout.workoutType} workout ${plannedWorkoutId}`);
  const plan = await generateSessionCoaching(params);

  // 7. Persist to DB — upsert into sessionInstructions
  //    Store the full plan in sessionStructure (jsonb) alongside the existing fields
  //    for backward compatibility with any code reading the old format
  try {
    const existingRecord = await db
      .select({ id: sessionInstructions.id })
      .from(sessionInstructions)
      .where(eq(sessionInstructions.plannedWorkoutId, plannedWorkoutId))
      .then((rows) => rows[0]);

    const upsertData = {
      plannedWorkoutId,
      preRunBrief:            plan.preRunBrief,
      sessionStructure:       plan as any,  // full plan stored here
      aiDeterminedTone:       plan.coachingTone,
      aiDeterminedIntensity:  plan.targetMetrics.isRecovery ? "relaxed"
                                : plan.targetMetrics.isSpeedWork ? "intense"
                                : "moderate",
      toneReasoning:          `Dynamic coaching plan. CueingStrategy: ${plan.cueingStrategy}. Goal: ${plan.sessionGoal}.`,
      coachingStyle: {
        tone:               plan.coachingTone,
        encouragementLevel: plan.targetMetrics.isRecovery ? "low" : plan.targetMetrics.isSpeedWork ? "high" : "moderate",
        detailDepth:        plan.targetMetrics.isSpeedWork ? "detailed" : "moderate",
        technicalDepth:     plan.targetMetrics.isSpeedWork ? "advanced" : "moderate",
      },
      insightFilters: {
        include: plan.targetMetrics.primaryMetric === "heart_rate"
          ? ["hr_zone", "pace_deviation", "effort_level"]
          : ["pace_deviation", "effort_level", "split_time"],
        exclude: plan.targetMetrics.isRecovery ? ["pace_deviation"] : [],
      },
      generatedVersion: "2.0",
      updatedAt: new Date(),
    };

    if (existingRecord) {
      await db
        .update(sessionInstructions)
        .set(upsertData)
        .where(eq(sessionInstructions.id, existingRecord.id));
    } else {
      await db.insert(sessionInstructions).values(upsertData);
    }

    console.log(`[getOrGenerateSessionCoaching] Persisted plan for workout ${plannedWorkoutId}`);
  } catch (dbError) {
    // Non-fatal — log but return plan anyway so the run isn't blocked
    console.error("[getOrGenerateSessionCoaching] Failed to persist coaching plan:", dbError);
  }

  return plan;
}

/**
 * Load a previously generated SessionCoachingPlan from DB.
 * Returns null if no plan exists yet (run hasn't been prepared).
 */
export async function loadSessionCoachingPlan(
  plannedWorkoutId: string
): Promise<SessionCoachingPlan | null> {
  const record = await db
    .select()
    .from(sessionInstructions)
    .where(eq(sessionInstructions.plannedWorkoutId, plannedWorkoutId))
    .then((rows) => rows[0]);

  if (!record?.sessionStructure) return null;

  const structure = record.sessionStructure as any;

  // Ensure it's the new format (v2.0 with phases/triggers)
  if (structure?.phases && structure?.triggers && structure?.cueingStrategy) {
    return structure as SessionCoachingPlan;
  }

  // Old format — return null, will be regenerated on next prepare
  return null;
}

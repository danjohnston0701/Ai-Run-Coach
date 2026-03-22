import OpenAI from "openai";
import { db } from "./db";
import { sessionInstructions, plannedWorkouts, users } from "../shared/schema";
import { eq, and } from "drizzle-orm";

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

You must respond with ONLY valid JSON (no markdown, no code blocks).`,
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
 * Generate complete session instructions for a planned workout
 * This includes pre-run brief, session structure, and coaching style
 */
export async function generateSessionInstructions(
  userId: string,
  plannedWorkoutId: string,
  workoutData: SessionToneRequest
) {
  // Determine optimal tone for this session
  const toneDecision = await determineSessonCoachingTone({
    userId,
    plannedWorkoutId,
    ...workoutData,
  });

  // Generate pre-run brief (separate endpoint, but we'll call it here)
  // For now, we'll create a placeholder that references the coaching style
  const preRunBrief = generatePreRunBriefing(workoutData, toneDecision);

  // Build session structure with coaching triggers
  const sessionStructure = buildSessionStructure(workoutData, toneDecision);

  return {
    preRunBrief,
    sessionStructure,
    aiDeterminedTone: toneDecision.tone,
    aiDeterminedIntensity: toneDecision.intensity,
    coachingStyle: toneDecision.coachingStyle,
    insightFilters: toneDecision.insightFilters,
    toneReasoning: toneDecision.toneReasoning,
  };
}

/**
 * Generate a brief pre-run briefing based on session and tone
 */
function generatePreRunBriefing(
  workout: SessionToneRequest,
  tone: DeterminedTone
): string {
  // This is a simplified version
  // In production, you'd call the full pre-run briefing AI service with tone context
  const workoutSummary = `${workout.distance?.toFixed(1) || "?"}km ${workout.workoutType}`;

  let brief = `Today's session: ${workoutSummary}\n`;

  if (workout.intervalCount) {
    brief += `Structure: ${workout.intervalCount} repetitions with recovery\n`;
  }

  brief += `Coaching style: ${tone.tone}\n`;
  brief += `Remember: Focus on the process, not just the numbers.`;

  return brief;
}

/**
 * Build the session structure with phases and coaching triggers
 */
function buildSessionStructure(
  workout: SessionToneRequest,
  tone: DeterminedTone
): any {
  const structure = {
    type: workout.workoutType,
    goal: workout.sessionGoal || "general fitness",
    phases: [] as any[],
    coachingTriggers: [] as any[],
  };

  // Add basic phases based on workout type
  if (workout.workoutType === "intervals") {
    structure.phases = [
      { name: "warmup", duration_km: 1, description: "Easy warm-up jog" },
      {
        name: "main_set",
        repetitions: workout.intervalCount || 6,
        description: "Interval repetitions",
      },
      {
        name: "cooldown",
        duration_km: 0.5,
        description: "Easy cool-down jog",
      },
    ];

    structure.coachingTriggers = [
      {
        phase: "warmup",
        trigger: "at_end",
        message: "Warmup complete. Ready for intervals?",
      },
      {
        phase: "main_set",
        trigger: "rep_start",
        message: `Next rep starting — hit your pace target`,
      },
      {
        phase: "main_set",
        trigger: "rep_end",
        message: `Rep complete — recover well`,
      },
      {
        phase: "cooldown",
        trigger: "at_start",
        message: `Great effort. Easy cool-down jog now.`,
      },
    ];
  } else if (workout.intensity === "z2") {
    structure.phases = [
      {
        name: "easy_run",
        duration: workout.duration,
        description: "Conversational pace zone 2 run",
      },
    ];

    structure.coachingTriggers = [
      {
        phase: "easy_run",
        trigger: "every_km",
        message: `Keep it easy and conversational. Enjoy the run.`,
      },
    ];
  }

  return structure;
}

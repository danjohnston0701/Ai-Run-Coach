/**
 * Orientation Session Service
 * 
 * Manages assessment/orientation sessions for runners with insufficient training history.
 * These sessions gauge actual fitness level before generating a training plan.
 * 
 * Features:
 * - Phase 1: Determines if orientation is needed
 * - Phase 2: Calculates personalized orientation targets (distance, pace)
 * - Phase 3: Generates AI coaching prompts optimized for orientation sessions
 */

import { db } from "./db";
import { runs } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";

// ==================== TYPES ====================

export interface OrientationAssessment {
  needsOrientation: boolean;
  reason?: string; // Why orientation is needed
  riskFactors?: string[]; // Safety considerations (age, BMI, injuries)
  recommendedDistance: number; // km
  recommendedPace?: string; // MM:SS/km
  targetHeartRateZone?: {
    min: number;
    max: number;
    label: string;
  };
  orientationBrief: string; // Coaching brief for the orientation session
  postOrientationPlan: string; // How results will be used
}

export interface UserFitnessProfile {
  age?: number;
  gender?: string;
  height?: number; // cm
  weight?: number; // kg
  bmi?: number;
  experienceLevel: "beginner" | "intermediate" | "advanced"; // From user self-assessment
  recentRunCount: number; // Runs in last 90 days
  hasGpsData: boolean;
  averagePace?: number; // seconds per km
  maxHeartRate?: number;
  restingHeartRate?: number;
}

export interface OrientationWorkout {
  workoutType: "orientation";
  description: string;
  instructions: string;
  distance: number; // km
  targetPace?: string; // MM:SS/km
  targetHeartRateMin?: number;
  targetHeartRateMax?: number;
  effortDescription: string;
  sessionGoal: "assess_fitness";
  sessionIntent: "orientation_run";
}

// ==================== PHASE 1: DETERMINE IF ORIENTATION IS NEEDED ====================

/**
 * Analyze user's training history and determine if orientation session is needed
 */
export async function assessOrientationNeed(
  userId: string,
  userDemographics: {
    age?: number;
    gender?: string;
    height?: number;
    weight?: number;
  },
  userExperienceLevel: string,
  planGoalType: string
): Promise<OrientationAssessment> {
  console.log(`[Orientation] Assessing orientation need for user ${userId}...`);

  try {
    // Get recent runs (last 90 days)
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

    // Filter for runs with GPS data (genuine AI app runs, not Garmin synced)
    const runsWithGps = recentRuns.filter(r => {
      const hasGpsTrack = r.gpsTrack && typeof r.gpsTrack === 'object' && Object.keys(r.gpsTrack).length > 0;
      const isAiAppRun = !r.externalSource || r.externalSource === 'airuncoach';
      return hasGpsTrack && isAiAppRun;
    });

    console.log(`[Orientation] User has ${recentRuns.length} recent runs, ${runsWithGps.length} with GPS data`);

    // Build fitness profile
    const profile = buildFitnessProfile(
      userId,
      userDemographics,
      userExperienceLevel,
      runsWithGps
    );

    // Determine if orientation is needed
    const needsOrientation = runsWithGps.length < 3; // Insufficient data for reliable baseline

    if (!needsOrientation) {
      console.log(`[Orientation] User has sufficient run history. Skipping orientation.`);
      return {
        needsOrientation: false,
        reason: "Sufficient training history available",
        recommendedDistance: 0,
      };
    }

    console.log(`[Orientation] Orientation needed: ${needsOrientation}`);

    // Calculate orientation targets
    const assessment = calculateOrientationTargets(
      profile,
      planGoalType,
      userDemographics
    );

    // Generate orientation brief
    assessment.orientationBrief = generateOrientationBrief(profile, planGoalType);
    assessment.postOrientationPlan = generatePostOrientationPlan(profile, planGoalType);

    return assessment;
  } catch (error) {
    console.error(`[Orientation] Error assessing orientation need:`, error);
    // Default to safe orientation requirement on error
    return {
      needsOrientation: true,
      reason: "Unable to assess training history",
      recommendedDistance: 5,
      orientationBrief: "Let's assess your current fitness level with a comfortable run.",
      postOrientationPlan: "We'll use this run to personalize your training plan.",
    };
  }
}

// ==================== PHASE 2: CALCULATE ORIENTATION TARGETS ====================

/**
 * Build user fitness profile from demographics and run history
 */
function buildFitnessProfile(
  userId: string,
  demographics: any,
  experienceLevel: string,
  recentRuns: any[]
): UserFitnessProfile {
  // Calculate BMI
  let bmi: number | undefined;
  if (demographics.height && demographics.weight) {
    const heightInMeters = demographics.height / 100;
    bmi = demographics.weight / (heightInMeters * heightInMeters);
  }

  // Extract pace and HR data from recent runs
  const avgPaces = recentRuns
    .map(r => parsePace(r.avgPace))
    .filter((p): p is number => p !== null);

  const avgPace = avgPaces.length > 0
    ? avgPaces.reduce((a, b) => a + b, 0) / avgPaces.length
    : undefined;

  const maxHR = Math.max(
    ...recentRuns
      .map(r => r.maxHeartRate || 0)
      .filter(hr => hr > 0)
  ) || undefined;

  return {
    age: demographics.age,
    gender: demographics.gender,
    height: demographics.height,
    weight: demographics.weight,
    bmi,
    experienceLevel: normalizeExperienceLevel(experienceLevel),
    recentRunCount: recentRuns.length,
    hasGpsData: recentRuns.length > 0,
    averagePace: avgPace,
    maxHeartRate: maxHR,
  };
}

/**
 * Calculate personalized orientation workout targets
 */
function calculateOrientationTargets(
  profile: UserFitnessProfile,
  planGoalType: string,
  demographics: any
): OrientationAssessment {
  console.log(`[Orientation] Calculating targets for ${profile.experienceLevel} runner, goal: ${planGoalType}`);

  let recommendedDistance = 5; // km, default
  let recommendedPace: string | undefined;
  let targetHeartRateZone: any;
  let riskFactors: string[] = [];

  // ========== RISK ASSESSMENT ==========
  if (profile.age && profile.age > 40) {
    riskFactors.push("over_40_consider_medical_clearance");
  }
  if (profile.bmi && profile.bmi > 28) {
    riskFactors.push("elevated_bmi_manage_load");
  }
  if (profile.weight && profile.weight > 95) {
    riskFactors.push("higher_body_weight_impact_load");
  }

  // ========== DISTANCE CALCULATION ==========
  // Based on experience level and goal type
  const distanceMap: Record<string, Record<string, number>> = {
    beginner: {
      "5k": 4,
      "10k": 5,
      "half_marathon": 6,
      "marathon": 7,
    },
    intermediate: {
      "5k": 5,
      "10k": 7,
      "half_marathon": 8,
      "marathon": 10,
    },
    advanced: {
      "5k": 6,
      "10k": 10,
      "half_marathon": 12,
      "marathon": 15,
    },
  };

  recommendedDistance = distanceMap[profile.experienceLevel]?.[planGoalType] || 5;

  // ========== PACE CALCULATION (Phase 2) ==========
  // Estimate from demographics + experience + recent data
  if (profile.averagePace) {
    // Use recent runs as baseline
    recommendedPace = formatPace(profile.averagePace);
  } else {
    // Estimate from demographics and experience
    recommendedPace = estimatePaceFromDemographics(
      profile.age,
      profile.bmi,
      profile.experienceLevel,
      planGoalType
    );
  }

  // ========== HEART RATE ZONE (Phase 3) ==========
  // CRITICAL: Orientation sessions must be at TEMPO/THRESHOLD (Zone 3-4) to actually ASSESS fitness
  // Zone 2 (conversational) is TOO EASY - it won't reveal the runner's true fitness level
  // Tempo pace allows us to find their actual lactate threshold and current capacity
  const estimatedMaxHR = profile.maxHeartRate || estimateMaxHeartRate(profile.age);
  const zone3Min = Math.round(estimatedMaxHR * 0.75); // 75-85% max HR (Tempo/Threshold zone)
  const zone3Max = Math.round(estimatedMaxHR * 0.85);

  targetHeartRateZone = {
    min: zone3Min,
    max: zone3Max,
    label: "Tempo Effort / Threshold Pace (Zone 3-4)",
  };

  return {
    needsOrientation: true,
    reason: `Insufficient training history (${profile.recentRunCount} runs in last 90 days)`,
    riskFactors,
    recommendedDistance,
    recommendedPace,
    targetHeartRateZone,
    orientationBrief: "", // Will be filled by generateOrientationBrief()
    postOrientationPlan: "", // Will be filled by generatePostOrientationPlan()
  };
}

/**
 * Estimate pace from demographics when no recent run data exists
 */
function estimatePaceFromDemographics(
  age: number | undefined,
  bmi: number | undefined,
  experience: string,
  goalType: string
): string {
  // Base pace estimates (in seconds per km) by experience level
  const baseLinePaces: Record<string, number> = {
    beginner: 600, // 10:00/km
    intermediate: 300, // 5:00/km
    advanced: 240, // 4:00/km
  };

  let pace = baseLinePaces[experience] || 600;

  // Adjust for age (slower for older runners)
  if (age && age > 40) {
    pace += (age - 40) * 5; // +5 seconds per year over 40
  }

  // Adjust for BMI (slower for higher BMI)
  if (bmi && bmi > 25) {
    pace += (bmi - 25) * 10; // +10 seconds per BMI point over 25
  }

  // Adjust for goal (slightly slower for longer distances)
  const goalAdjustments: Record<string, number> = {
    "5k": 0,
    "10k": 10,
    "half_marathon": 20,
    "marathon": 30,
  };
  pace += goalAdjustments[goalType] || 0;

  return formatPace(pace);
}

/**
 * Estimate max heart rate from age (Karvonen formula)
 */
function estimateMaxHeartRate(age: number | undefined): number {
  if (!age) return 180; // Safe default
  return 220 - age;
}

// ==================== PHASE 3: GENERATE ORIENTATION AI COACHING ====================

/**
 * Generate orientation-specific AI coaching brief
 */
export function generateOrientationBrief(
  profile: UserFitnessProfile,
  planGoalType: string
): string {
  const experienceDescriptions: Record<string, string> = {
    beginner:
      "You're just starting your running journey, and this orientation run will help us understand your current baseline.",
    intermediate:
      "You've been running consistently. This orientation session will establish your current fitness level to personalize your plan.",
    advanced:
      "As an experienced runner, this assessment will help us fine-tune your training plan for optimal progression.",
  };

  const description = experienceDescriptions[profile.experienceLevel];

  return `
🏃‍♂️ ORIENTATION SESSION

This is your first session – we're here to understand your current fitness level so we can personalize your ${planGoalType.replace("_", " ")} training plan.

${description}

What to expect:
• Run at a steady, challenging (but sustainable) pace – this is a TEMPO EFFORT
• If you have a heart rate monitor, aim for the Zone 3-4 range (challenging but not maximum effort)
• We want to find your actual fitness level, so this won't be easy – but it's manageable
• Tell us how you felt afterward (your perceived effort, any discomfort, how long you could sustain it)

This run will help us:
✓ Establish your actual fitness baseline
✓ Find your lactate threshold
✓ Validate your experience level and self-assessment
✓ Set realistic and personalized targets for your goal

Remember: This IS an assessment, not a casual jog. We need to see what you're capable of right now.
  `.trim();
}

/**
 * Generate post-orientation analysis plan
 */
function generatePostOrientationPlan(
  profile: UserFitnessProfile,
  planGoalType: string
): string {
  return `
After you complete this orientation session, we'll:

1. 📊 Analyze your results
   • Compare your actual pace/effort to our estimates
   • Check for any form or pacing issues
   • Assess your recovery

2. 🎯 Fine-tune your plan
   • If you're stronger than expected, we'll increase intensity
   • If you need more base building, we'll adjust accordingly
   • Calibrate all future workouts to your actual fitness level

3. 💪 Get personalized coaching
   • Your in-run AI coaching will be tailored to your fitness
   • We'll know how hard to push on interval days
   • We'll pace your long runs correctly

Your ${planGoalType.replace("_", " ")} plan will be truly personalized, not generic.
  `.trim();
}

/**
 * Generate orientation-specific session coaching prompts
 * These are different from standard coaching – focused on learning, not performance
 */
export function generateOrientationCoachingPrompt(
  profile: UserFitnessProfile,
  assessment: OrientationAssessment,
  planGoalType: string
): string {
  const targetPaceDisplay = assessment.recommendedPace || "tempo effort";
  const targetDistance = assessment.recommendedDistance;
  const hrZoneInfo = assessment.targetHeartRateZone
    ? `${assessment.targetHeartRateZone.min}-${assessment.targetHeartRateZone.max} bpm (Zone 3-4 Tempo)`
    : "tempo/threshold pace";

  return `
You are an AI running coach providing guidance for an ORIENTATION SESSION.

This IS a fitness ASSESSMENT WORKOUT. The goal is to:
1. Discover the runner's actual fitness level through controlled challenge
2. Find their lactate threshold and sustainable effort capacity
3. Validate their self-assessed experience against real performance
4. Gather baseline data for accurate plan personalization
5. Establish confidence that the plan will be properly calibrated

RUNNER PROFILE:
- Experience: ${profile.experienceLevel} runner
- Goal: ${planGoalType.replace("_", " ")}
- Recent runs: ${profile.recentRunCount}

SESSION DESIGN:
- Distance: ${targetDistance} km
- Target Pace: ${targetPaceDisplay}
- Target Heart Rate: ${hrZoneInfo}
- Effort: TEMPO/THRESHOLD - challenging but sustainable
- Focus: Finding true fitness level, threshold capacity, mental toughness

COACHING STYLE FOR ORIENTATION:
✓ Supportive but honest about effort level
✓ Encourage them to find THEIR sustainable hard pace
✓ Monitor for appropriate challenge (not too easy, not crushing)
✓ Emphasize that we NEED data to calibrate their plan correctly
✓ Validate effort and discomfort as useful information
✓ Build confidence through challenge and completion

KEY MESSAGES AT DIFFERENT POINTS:
- 0-1km: Settle into steady rhythm, "let's establish your sustainable pace"
- 1-2km: "You're finding your effort level – this is where we learn"
- 2-End: "Keep it steady – this is the data we need for your plan"
- At finish: "Perfect – that effort told us exactly what we needed to know"

WHAT THIS TEMPO EFFORT REVEALS:
✓ Real sustainable pace (not their easy, comfortable pace)
✓ How they handle discomfort and breathing load
✓ Their true lactate threshold (not just aerobic pace)
✓ Mental resilience and work capacity
✓ Honest assessment of experience level

AVOID:
✗ Easy encouragement ("relax, take it easy") – this is tempo!
✗ Performance language ("crush it", "go hard") – it's assessment, not racing
✗ Comparison to others
✗ Guilt if they slow down from an unsustainable pace

FOCUS ON:
✓ "How's your breathing? Can you still think clearly?"
✓ "Your pace is steady and strong – great for assessment"
✓ "Your form is holding up well under effort"
✓ "This data will make your plan truly personal"
✓ "Only a few more km – you're doing exactly what we need"

SAFETY CHECKS:
- Watch for signs of distress (gasping, loss of form, pain vs discomfort)
- For ${profile.age && profile.age > 40 ? "older runners, monitor carefully but allow them to find their genuine threshold" : "younger runners, watch for reckless acceleration"}
- If real distress appears: suggest backing off slightly, but keep it hard enough to assess

POST-RUN ASSESSMENT (CRITICAL):
Ask about:
1. How hard was that pace on a 1-10 scale? (We want 7-8, sustainable hard effort)
2. Could you keep running at that pace? How long?
3. Any pain or just muscular discomfort/breathing effort?
4. How does this compare to your expected fitness level?
5. Heart rate range if they have monitor?

USE THIS DATA TO:
- Set accurate Zone boundaries for their training
- Determine realistic pace targets for the plan
- Assess if experience level is accurate
- Calibrate all future workout intensities
- Build personalized targets that match THEIR capacity, not generic estimates
  `.trim();
}

// ==================== HELPER FUNCTIONS ====================

function parsePace(paceStr: string | null | undefined): number | null {
  if (!paceStr) return null;
  const match = paceStr.match(/(\d+):(\d+)/);
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  return null;
}

function formatPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}/km`;
}

function normalizeExperienceLevel(
  level: string
): "beginner" | "intermediate" | "advanced" {
  const normalized = level?.toLowerCase() || "intermediate";
  if (
    normalized.includes("beginner") ||
    normalized.includes("new") ||
    normalized.includes("novice")
  ) {
    return "beginner";
  }
  if (
    normalized.includes("advanced") ||
    normalized.includes("expert") ||
    normalized.includes("elite")
  ) {
    return "advanced";
  }
  return "intermediate";
}

export default {
  assessOrientationNeed,
  generateOrientationCoachingPrompt,
};

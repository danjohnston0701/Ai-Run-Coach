import OpenAI from "openai";
import { COACHING_PHASE_PROMPT, determinePhase, type CoachingPhase } from "../shared/coaching-statements";
import { runnerProfileBlock } from "./runner-profile-service";
import { resolveActivityType, activityVocab } from "./coaching-activity";
import * as runPrompts from "./coaching-prompts-run";
import * as walkPrompts from "./coaching-prompts-walk";
import type { PaceUpdatePromptContext, StruggleCoachingPromptContext } from "./coaching-prompts-run";
import { getWorkoutPhilosophy, formatPhilosophyForPrompt } from "./workoutPhilosophy";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const normalizeCoachTone = (tone?: string): string => {
  if (!tone) return "energetic";
  return tone.trim().toLowerCase();
};

export const toneDirective = (tone?: string): string => {
  const normalized = normalizeCoachTone(tone);
  switch (normalized) {
    case "energetic":
      return "Sound lively and motivating. Use short, punchy sentences. Vary phrasing. Exclamation marks sparingly but with impact.";
    case "motivational":
    case "inspirational":
      return "Sound inspiring and uplifting. Emphasize belief, progress, and resilience. Use powerful, affirming language.";
    case "friendly":
      return "Conversational and warm — like a mate running alongside them. Use casual, relatable language. Contractions are good. Keep it genuine, not performative.";
    case "tough love":
    case "toughlove":
      return "Firm, direct, and no-nonsense — but clearly caring. Challenge them. Use phrases like 'I know you have more', 'don't let up', 'you're better than this pace'. Push hard because you believe in them. Never cruel, always constructive.";
    case "analytical":
      return "Data-driven and precise. Lead with numbers and metrics. Use phrases like 'your data shows', 'based on your splits', 'the numbers suggest'. Fascinated by performance data but still personable. Think sports scientist.";
    case "zen":
    case "mindful":
      return "Calm, centred, and meditative. Use mindfulness language — 'breathe', 'be present', 'feel the rhythm', 'let go of tension'. Short, spacious sentences with natural pauses. Focus on the experience, not just the numbers. Grounding and peaceful.";
    case "playful":
    case "humorous":
      return "Light-hearted and witty. Use gentle humour, playful metaphors, and fun observations. Make the runner smile. Slightly cheeky but always supportive. Avoid being corny — keep it clever and natural.";
    case "supportive":
    case "encouraging":
      return "Warm, reassuring, and steady. Encourage without pressure. Validate their effort.";
    case "calm":
      return "Calm, steady, and grounded. Use soothing language. Measured and unhurried.";
    case "professional":
    case "factual":
      return "Clear, concise, and practical. Focus on actionable guidance. Lead with facts, minimal flourish.";
    case "instructive":
      return "Clear, detailed, and educational. Explain the 'why' behind advice. Use coaching terminology naturally. Like a knowledgeable coach sharing expertise.";
    case "abrupt":
      return "Ultra-direct and concise. Maximum 2 sentences. No filler words. Commands, not suggestions. 'Pick it up.' 'Hold this pace.' 'Breathe.'";
    default:
      return "Encouraging and positive with varied phrasing.";
  }
};

/**
 * Returns an LLM prompt directive for accent-aware phrasing.
 * Ensures the TEXT the LLM writes matches the accent the TTS will speak with.
 */
export const accentDirective = (accent?: string): string => {
  const normalized = (accent || '').trim().toLowerCase();
  switch (normalized) {
    case 'british':
      return 'Write with British English phrasing, using words like — "brilliant", "well done", "cracking pace", "spot on". Use "kilometres" not "kilometers". Avoid Americanisms.';
    case 'irish':
      return 'Write with Irish English phrasing, using words like — "grand", "mighty", "fair play", "dead on". Warm and friendly. Use "kilometres".';
    case 'scottish':
      return 'Write with Scottish English phrasing, using words like — "brilliant", "cracking", "braw", "well done". Direct and warm. Use "kilometres".';
    case 'australian':
      return 'Write with Australian English phrasing, using words like — "legend", "ripper", "no worries", "you beauty". Relaxed and confident. Use "kilometres".';
    case 'new zealand':
    case 'newzealand':
    case 'nz':
      return 'Write with New Zealand English phrasing, using words like — "sweet as", "good on ya", "choice", "chur". Understated Kiwi warmth. Use "kilometres".';
    case 'american':
      return 'Write with American English phrasing, using words like — "awesome", "great job", "crushing it". High energy and direct.';
    case 'south african':
      return 'Write with South African English phrasing, using words like — "lekker", "shame" (sympathetic), "howzit". Resilient warmth. Use "kilometres".';
    case 'canadian':
      return 'Write with Canadian English phrasing, using words like — "eh", "for sure", "beauty". Friendly and humble. Use "kilometres".';
    case 'welsh':
      return 'Write with Welsh English phrasing, using words like — "lovely", "tidy", "fair play", "cracking on". Passionate warmth. Use "kilometres".';
    case 'caribbean':
      return 'Write with Caribbean English phrasing, using words like — "wicked", "big up yourself", "nuff respect". Rhythmic and uplifting. Use "kilometres".';
    case 'scandinavian':
      return 'Write with Scandinavian-influenced English, using words like — "very nice", "exactly", "perfect". Clean and understated. Use "kilometres".';
    default:
      return '';
  }
};

/**
 * normalizeRunUnits — canonical unit normalization for any run row read from the DB.
 *
 * Storage rule (enforced going forward): distance = km, duration = seconds.
 * Legacy rows may have been written by Strava/Garmin importers with wrong units:
 *   • distance in meters  (e.g. 3025.6 instead of 3.025)
 *   • duration in ms      (e.g. 336000 instead of 336)
 *
 * We use avgPace ("M:SS" string) as the authoritative anchor because it is
 * always computed and stored correctly at insert time.
 *
 * Strategy:
 *  1. If distance > 100 → must be meters → divide by 1000.
 *  2. If duration > 86400 → must be ms → divide by 1000.
 *  3. Cross-check: if we have a valid avgPace, verify the implied pace
 *     (duration/distance) and swap units if off by a factor of ~1000.
 */
export function normalizeRunUnits(run: {
  distance?: number | null;
  duration?: number | null;
  avgPace?: string | null;
}): { distanceKm: number; durationSec: number } {
  let distanceKm  = (run.distance  ?? 0);
  let durationSec = (run.duration  ?? 0);

  // Step 1 — Threshold detection
  if (distanceKm  > 100)   distanceKm  = distanceKm  / 1000;  // clearly meters
  if (durationSec > 86400) durationSec = Math.round(durationSec / 1000); // clearly ms

  // Step 2 — avgPace cross-check (most reliable anchor)
  if (run.avgPace && distanceKm > 0 && durationSec > 0) {
    const m = run.avgPace.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const expectedPaceSec = parseInt(m[1]) * 60 + parseInt(m[2]); // e.g. 5:30 → 330 s/km
      const actualPaceSec   = durationSec / distanceKm;
      // If actual is 1000× too large, duration is still in ms
      if (expectedPaceSec > 0 && actualPaceSec > expectedPaceSec * 500) {
        durationSec = Math.round(durationSec / 1000);
      }
      // If actual pace implies impossibly fast running (< 120 s/km = 2 min/km), distance is in meters
      const reCheck = durationSec / distanceKm;
      if (reCheck < 120 && distanceKm > 0.5) {
        distanceKm = distanceKm / 1000;
      }
    }
  }

  return { distanceKm, durationSec };
}

// Helper to format distance for coaching feedback
// - Whole numbers: "5km" (0 decimals)
// - With decimals: "3.6km" (1 decimal max, never 2+ decimals)
export const formatDistanceForCoaching = (km: number | undefined): string => {
  if (km === undefined) return '?';
  if (km === Math.floor(km)) {
    return `${Math.floor(km)}km`; // Whole numbers: "5km"
  }
  return `${km.toFixed(1)}km`; // With decimals: "3.6km" (1 decimal)
};

// Helper to format distance for TTS - no decimals when whole number
const formatDistanceForTTS = (km: number | undefined): string => {
  return formatDistanceForCoaching(km);
};

// Helper to format pace for TTS - converts "4:32" to "4 minutes and 32 seconds per kilometer"
// This prevents the AI from saying "four thirty-two" which is hard to understand while running
export const formatPaceForTTS = (pace: string | undefined): string => {
  if (!pace) return 'unknown pace';
  // Strip "/km" or "per km" suffix before parsing (handles "4:32/km", "4:32 per km")
  const stripped = pace.replace(/\s*(?:\/km|per\s*km)\b/gi, '').trim();
  const parts = stripped.split(':');
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10);
    const sec = parseInt(parts[1], 10);
    if (!isNaN(min) && !isNaN(sec)) {
      if (sec === 0) return `${min} minutes per kilometer`;
      return `${min} minutes and ${sec} seconds per kilometer`;
    }
  }
  // Fallback: if the pace already contains "per kilometer" / "per kilometre" / "per km", return as-is to avoid duplication.
  // Check for BOTH American and British spellings to prevent "per kilometer per kilometre" in audio.
  // Otherwise append the unit so TTS always hears the full unit.
  const lcPace = pace.toLowerCase();
  if (lcPace.includes('per kilometer') || lcPace.includes('per kilometre') || lcPace.includes('per km') || lcPace.includes('/km')) {
    return pace;
  }
  return `${pace} per kilometer`;
};

// TTS format rules — applied to every coaching system prompt.
// Text goes straight to Polly neural TTS, so it must be spoken English with no abbreviations.
const TTS_UNIT_RULES = `UNIT FORMAT: NEVER use abbreviations — this text is read aloud by a text-to-speech engine. Say "beats per minute" not "bpm"; say "steps per minute" not "spm"; say "kilometres" not "km" for distances.`;
export const PACE_FORMAT_RULE = `PACE FORMAT: CRITICAL — Always say pace as "X minutes and Y seconds per kilometer" (e.g. "4 minutes and 32 seconds per kilometer"). NEVER use time notation like "5:00/km" or "4:32/km" because TTS will interpret colons as clock time (e.g., "5 o'clock" instead of "5 minutes"). The pace values provided above are already formatted correctly — use them exactly as shown. ${TTS_UNIT_RULES}`;

// OpenAI TTS handles commas as natural brief pauses — no comma suppression needed.

// Helper to format seconds-per-km pace value to "X minutes and Y seconds" string
const formatSecondsAsPace = (secondsPerKm: number): string => {
  if (!secondsPerKm || secondsPerKm <= 0 || secondsPerKm > 3600) return 'unknown';
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60);
  if (sec === 0) return `${min}:00`;
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

// Helper to format duration in minutes for TTS - not as clock time
const formatDurationForTTS = (seconds: number): string => {
  const totalMinutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${totalMinutes} minutes`;
  }
  return `${totalMinutes} minutes and ${remainingSeconds} seconds`;
};

// ─────────────────────────────────────────────────────────────────────────────
// PERSONALIZED CADENCE CALCULATOR
//
// Optimal cadence is NOT a fixed number — it depends on:
//   • Current pace / speed (faster running → higher cadence)
//   • Runner height (taller runners have naturally longer stride → slightly lower cadence)
//   • Runner age (older runners have less lower-limb reactivity → relax expectation by ~3–5 spm)
//
// Biomechanics model:
//   Speed (m/s) = 1000 / paceSecPerKm
//   Step length (m) = heightM × stepLengthRatio(speed)
//   stepLengthRatio is linear with speed:
//     • 2.78 m/s (6:00/km) → ~0.58 × height
//     • 3.33 m/s (5:00/km) → ~0.67 × height
//     • 4.17 m/s (4:00/km) → ~0.80 × height
//   Cadence (spm) = speed / step_length × 60
//
// Returns { optimal, low, high, heightAdjustedNote } for coaching context.
// ─────────────────────────────────────────────────────────────────────────────
interface OptimalCadenceRange {
  optimal: number;   // Mid-point target spm
  low: number;       // Lower bound — below this is worth coaching
  high: number;      // Upper bound — above this is excellent
  deficit: number;   // How many spm the runner is below optimal (0 if they're fine)
  isLow: boolean;    // True if cadence is meaningfully below optimal
  isHigh: boolean;   // True if cadence is significantly above optimal (overstriding alert)
  note: string;      // Human-readable description of the personal target
}

export function calculateOptimalCadenceRange(
  paceSecPerKm: number,
  heightCm: number,
  ageSpm?: number,   // age-based adjustment: passed as runner age in years
  currentCadence?: number
): OptimalCadenceRange {
  // Clamp inputs
  const height = Math.max(140, Math.min(220, heightCm || 170));
  const heightM = height / 100;
  const paceSec = Math.max(180, Math.min(900, paceSecPerKm || 360)); // 3:00 – 15:00/km
  const speed = 1000 / paceSec; // m/s

  // Step length ratio: linear interpolation calibrated against research norms
  // At 6:00/km (2.78 m/s): ratio=0.58, At 5:00/km (3.33 m/s): ratio=0.67, At 4:00/km (4.17 m/s): ratio=0.80
  const BASE_SPEED = 2.78;  // 6:00/km
  const BASE_RATIO = 0.58;
  const RATIO_PER_MS = 0.16; // ratio increase per m/s of speed
  const stepLengthRatio = Math.max(0.45, Math.min(0.95, BASE_RATIO + (speed - BASE_SPEED) * RATIO_PER_MS));
  const stepLength = stepLengthRatio * heightM;

  // Optimal cadence from speed and step length
  let optimal = Math.round((speed / stepLength) * 60);

  // Age adjustment: runners over 50 have reduced lower-limb reactivity
  // Reduce target by ~1 spm per 5 years over 50 (max –6 spm)
  const age = ageSpm ?? 0;
  if (age > 50) {
    const ageAdjustment = Math.min(6, Math.round((age - 50) / 5));
    optimal = Math.max(150, optimal - ageAdjustment);
  }

  // Tolerance band: ±5 spm is within normal variance; >10 spm below = coaching target
  const low  = optimal - 8;   // Below this is worth a coaching cue
  const high = optimal + 6;   // Above this is excellent (but may indicate overstriding)

  const deficit = currentCadence ? Math.max(0, optimal - currentCadence) : 0;
  const isLow   = currentCadence ? currentCadence < low : false;
  const isHigh  = currentCadence ? currentCadence > high + 10 : false; // >16 spm above optimal

  const note = `Personalised optimal cadence for this runner at this pace: ${optimal} spm (range ${low}–${high} spm). Height: ${height}cm, speed: ${(speed).toFixed(2)} m/s.`;

  return { optimal, low, high, deficit, isLow, isHigh, note };
}

// Helper to format elapsed time as "M minutes and SS seconds" for TTS — avoids truncating seconds
export const formatElapsedForTTS = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (minutes === 0) return `${secs} seconds`;
  if (secs === 0) return `${minutes} minutes`;
  return `${minutes} minutes and ${secs} seconds`;
};

// Session-level instruction to prevent repetitive phrasing while maintaining consistent voice
// This preserves coaching personality while avoiding repetition across messages
export const VARIETY_INSTRUCTION = "Avoid repeating wording or phrasing you've used earlier in this run. Maintain your coaching voice and personality while varying how you express similar ideas.";

/**
 * Generate pace-context directives for the AI
 * Helps the AI understand how to coach differently based on runner's typical pace
 * 
 * This ensures coaching is RELEVANT to the runner's fitness level, not absolute pace targets.
 * A slow runner at 8:00/km should be coached very differently than a fast runner in recovery.
 */
/**
 * Generate coaching context based on SIGNAL HIERARCHY (not hardcoded pace buckets).
 * 
 * Priority order:
 * 1. HR Zone (personalized by max HR, never overridden)
 * 2. Target pace deviation (when session has a target)
 * 3. Personal pace benchmarks from runner profile (not population averages)
 * 4. No data → no directive (silence is better than wrong assumption)
 * 
 * Tone is determined by workout TYPE, not absolute pace.
 */
export const getPaceContextDirective = (
  currentPaceSecPerKm?: number,
  fitnessLevel?: string,
  targetPaceSecPerKm?: number,
  workoutType?: string,
  currentHeartRate?: number,
  heartRateZone?: number,
  runnerProfile?: string | null
): string => {
  // ── Signal 1: Heart Rate Zone (always authoritative) ──────────────────────
  // HR zones are personalized by max HR. Zone 2 IS easy for THIS runner.
  // Never override this with pace assumptions.
  if (heartRateZone !== undefined) {
    const zoneContext = heartRateZone <= 2 
      ? 'You are in an easy aerobic zone. This is exactly where easy runs should be.'
      : heartRateZone === 3
      ? 'You are in tempo zone. Sustain this effort but do not push beyond.'
      : heartRateZone >= 4
      ? 'You are in a high-intensity zone. Effort is expected; trust your body.'
      : 'Monitor your heart rate zone as the primary effort signal.';
    
    return `EFFORT CONTEXT: Heart rate is the primary signal for this runner.
${zoneContext}
Pace is secondary — it should feel consistent with the heart rate zone. If pace and HR diverge (e.g. fast pace but low HR), trust the HR reading as the more accurate signal of actual effort.`;
  }

  // ── Signal 2: Target Pace Deviation (when session has a target) ──────────
  // If there's a target, classify effort by deviation from that target.
  if (currentPaceSecPerKm !== undefined && targetPaceSecPerKm !== undefined) {
    const deviationPercent = ((currentPaceSecPerKm - targetPaceSecPerKm) / targetPaceSecPerKm) * 100;
    
    if (Math.abs(deviationPercent) <= 5) {
      return `PACE CONTEXT: On target.
The runner is holding their target pace. Reinforce consistency and control.`;
    } else if (deviationPercent > 5) {
      return `PACE CONTEXT: Running slower than target by ${Math.round(deviationPercent)}%.
This is acceptable on harder days or when conditions are tough. Coach around effort and conditions, not the pace gap itself.`;
    } else {
      // currentPace faster than target
      return `PACE CONTEXT: Running faster than target by ${Math.round(Math.abs(deviationPercent))}%.
Check if this is intentional (feeling strong) or accidental (went out too fast). For recovery/easy sessions, encourage the runner to ease back and control the effort. For hard sessions, faster is fine if effort is sustainable.`;
    }
  }

  // ── Signal 3: Personal Benchmarks from Runner Profile ──────────────────
  // Extract actual running data from the profile (if available).
  // This is the ONLY valid way to compare paces.
  if (runnerProfile && currentPaceSecPerKm !== undefined) {
    // Simple heuristic: if profile contains pace benchmarks, they're embedded as text.
    // A more robust approach would parse structured data, but for now we signal that
    // pace context should be inferred from the profile by the AI.
    return `PACE CONTEXT: Compare current pace to this runner's historical data.
The runner profile contains their typical paces for easy, tempo, and threshold efforts. Use those as reference — not population benchmarks. If current pace aligns with their easy pace pattern, reinforce it. If it deviates, consider conditions or fatigue.`;
  }

  // ── Signal 4: Tone by Workout Type (even without pace data) ──────────────
  // Personality comes from the session type, not from absolute speed.
  if (workoutType) {
    const toneByWorkout: Record<string, string> = {
      'easy': 'WORKOUT CONTEXT: Easy session. Conversational, relaxed. Never suggest the runner should be faster. Reinforce that this effort is correct.',
      'recovery': 'WORKOUT CONTEXT: Recovery session. Patient, restorative tone. Any sign of over-effort should be caught early.',
      'tempo': 'WORKOUT CONTEXT: Tempo/threshold session. Focused, purposeful tone. Coach to sustain effort — not to push beyond current capacity.',
      'interval': 'WORKOUT CONTEXT: Interval session. Sharp, brief cues. High effort is expected; do not flag elevated HR unless truly alarming.',
      'long_run': 'WORKOUT CONTEXT: Long run. Patient, steady tone. Flag any early drift above easy effort. Encourage steady pacing and mental resilience.',
      'free_run': 'WORKOUT CONTEXT: Free run (no target). Observe and reflect. Never imply the runner\'s pace is wrong. Coach based on how they feel and what the session demands.',
    };
    
    return toneByWorkout[workoutType.toLowerCase()] || 
      'Coach based on effort feel, heart rate, and the demands of the session — not pace magnitude.';
  }

  // ── No data → No directive ──────────────────────────────────────────────
  // A wrong assumption is worse than silence.
  return '';
};

export interface CoachingContext {
  // ── Current Run Metrics ───────────────────────────────────────────────────
  distance?: number;
  duration?: number;
  pace?: string;                    // Average pace in "M:SS" format
  currentPace?: string;             // Real-time pace (different from average)
  targetPace?: string;              // Target pace in "M:SS" format (e.g., "5:30")
  totalDistance?: number;
  
  // ── Heart Rate & Effort ───────────────────────────────────────────────────
  heartRate?: number;               // Current HR
  avgHeartRate?: number;            // Average HR during run
  maxHeartRate?: number;            // Max HR reached
  minHeartRate?: number;            // Min HR during run
  
  // ── Cadence & Running Dynamics ────────────────────────────────────────────
  cadence?: number;                 // Current cadence (spm)
  avgCadence?: number;              // Average cadence
  maxCadence?: number;              // Max cadence reached
  avgStrideLength?: number;         // Average stride length (meters)
  avgGroundContactTime?: number;    // Average ground contact time (ms)
  avgVerticalOscillation?: number;  // Average vertical bounce (cm)
  
  // ── Elevation & Terrain ───────────────────────────────────────────────────
  elevation?: number;               // Current elevation (meters)
  elevationChange?: string;         // "flat"|"hilly"|"mountainous"
  elevationGain?: number;           // Total meters climbed
  elevationLoss?: number;           // Total meters descended
  avgGradient?: number;             // Average gradient (%)
  maxGradient?: number;             // Steepest gradient (%)
  currentGrade?: number;            // Current slope (%)
  
  // ── Time Tracking ─────────────────────────────────────────────────────────
  targetTime?: number;              // Target finish time (seconds)
  elapsedTime?: number;             // Time elapsed (seconds)
  movingTime?: number;              // Moving time excluding pauses (seconds)
  
  // ── Environment & Weather ─────────────────────────────────────────────────
  weather?: any;
  
  // ── Run State & Phase ─────────────────────────────────────────────────────
  phase?: CoachingPhase;
  isStruggling?: boolean;
  
  // ── Training Context ──────────────────────────────────────────────────────
  activityType?: string;
  workoutType?: string;             // "easy"|"tempo"|"intervals"|"long_run"|etc
  workoutIntensity?: string;        // "z1"-"z5" or intensity level
  
  // ── Energy & Training Effect ──────────────────────────────────────────────
  calories?: number;                // Estimated calorie burn
  aerobicTrainingEffect?: number;   // 0-5 scale
  anaerobicTrainingEffect?: number; // 0-5 scale
  trainingEffectLabel?: string;     // "Recovery"|"Base"|"Tempo"|"Threshold"|"VO2 Max"
  recoveryTimeMinutes?: number;     // Minutes until full recovery
  vo2MaxEstimate?: number;          // Estimated VO2 max (ml/kg/min)
  
  // ── Runner Profile ────────────────────────────────────────────────────────
  runnerAge?: number;
  runnerHeight?: number;            // cm
  runnerWeight?: number;            // kg
  userFitnessLevel?: string;
  runnerProfile?: string | null;    // AI runner profile — "What I know about you"
  
  // ── Coach Settings ────────────────────────────────────────────────────────
  coachName?: string;
  coachTone?: string;
  coachAccent?: string;
  
  // ── Wellness Context (from Garmin) ────────────────────────────────────────
  wellness?: WellnessContext;
}

export async function getCoachingResponse(message: string, context: CoachingContext): Promise<string> {
  const systemPrompt = buildCoachingSystemPrompt(context);
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ],
    max_tokens: 150,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || "Keep going, you're doing great!";
}

export async function generatePreRunCoaching(params: {
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  difficulty: string;
  activityType: string;
  weather: any;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  runnerProfile?: string | null;
}): Promise<string> {
  const { distance, elevationGain, elevationLoss, difficulty, activityType, weather, coachName, coachTone, coachAccent } = params;
  const isWalkBrief = activityType && activityType.toLowerCase() === 'walk';
  const briefActivityLabel = isWalkBrief ? 'walk' : 'run';
  const briefCoachLabel    = isWalkBrief ? 'walking coach' : 'running coach';
  const briefPersonLabel   = isWalkBrief ? 'walker' : 'runner';
  const briefWalkProhibition = isWalkBrief
    ? ' WALK SESSION — NEVER say "run", "running", "runner", "sprint", or any running-specific term. This person is WALKING. Say "walker", "walking", "walk pace" instead.'
    : '';

  const weatherInfo = weather 
    ? `Weather: ${weather.temp || 'N/A'}°C, ${weather.condition || 'clear'}, wind ${weather.windSpeed || 0} km/h.`
    : 'Weather data unavailable.';
  
  const prompt = `You are ${coachName}, an AI ${briefCoachLabel}. Your coaching style is ${coachTone}.${briefWalkProhibition}

Generate a brief pre-${briefActivityLabel} briefing (2-3 sentences max) for this upcoming ${briefActivityLabel}:
- Distance: ${formatDistanceForTTS(distance)}
- Difficulty: ${difficulty}
- Elevation gain: ${Math.round(elevationGain || 0)}m, loss: ${Math.round(elevationLoss || 0)}m
- ${weatherInfo}

Be encouraging, specific to the conditions, and give one actionable tip. Speak naturally as if talking directly to the ${briefPersonLabel}.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, a ${coachTone} ${briefCoachLabel}. Keep responses brief, encouraging, and actionable.${briefWalkProhibition} ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}${runnerProfileBlock((params as any).runnerProfile)}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 120,
    temperature: 0.8,
  });

  return completion.choices[0].message.content || (isWalkBrief ? "Take it easy at the start and settle into your walking rhythm. Enjoy your walk!" : "Take it easy at the start and find your rhythm. Good luck!");
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE INTELLIGENCE CONTEXT
//
// When the Route Memory Engine matches a known route, this packet is injected
// into split coaching prompts to enable:
//   - "Km 2 — 8 seconds faster than last week"
//   - "You're 15 seconds up on your average"
//   - "The hill is coming in 400m — brace now"
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteIntelligenceContext {
  routeName: string;
  confidence: number;           // 0.0–1.0
  personalBestFormatted?: string;
  lastRunFormatted?: string;
  lastRunDate?: string;
  /** per-km comparisons — populated as the run progresses */
  splitComparisons?: Array<{
    km: number;
    lastRunSecPerKm?: number;
    avgSecPerKm?: number;
  }>;
  /** upcoming notable terrain segments */
  notableSegments?: Array<{
    name: string;
    startPct: number;
    endPct: number;
    gradient: number;
    severity: string;
    coachingNote: string;
  }>;
  typicalDistanceKm?: number;
}

/** Build a concise context block from the Route Intelligence packet for coaching prompts. */
function buildRouteIntelligenceContext(
  routeCtx: RouteIntelligenceContext,
  currentDistanceKm: number,
  totalDistanceKm: number,
  currentKmSplitSec?: number,   // seconds taken for the most recently completed km
  splitKm?: number              // which km was just completed (1-indexed)
): string {
  const lines: string[] = [];
  lines.push(`ROUTE MEMORY: ${routeCtx.routeName} (${Math.round(routeCtx.confidence * 100)}% confidence)`);

  if (routeCtx.personalBestFormatted) {
    lines.push(`PB on this route: ${routeCtx.personalBestFormatted}`);
  }
  if (routeCtx.lastRunFormatted) {
    lines.push(`Last run: ${routeCtx.lastRunFormatted} (${routeCtx.lastRunDate ?? "recent"})`);
  }

  // Split comparison for the km just completed
  if (splitKm && currentKmSplitSec && routeCtx.splitComparisons) {
    const cmp = routeCtx.splitComparisons.find((s) => s.km === splitKm);
    if (cmp) {
      if (cmp.lastRunSecPerKm) {
        const deltaLast = cmp.lastRunSecPerKm - currentKmSplitSec; // positive = runner is faster
        const label = deltaLast > 0 ? `${Math.abs(Math.round(deltaLast))}s FASTER than last run` : `${Math.abs(Math.round(deltaLast))}s SLOWER than last run`;
        lines.push(`Km ${splitKm} vs last run: ${label}`);
      }
      if (cmp.avgSecPerKm) {
        const deltaAvg = cmp.avgSecPerKm - currentKmSplitSec;
        const label = deltaAvg > 0 ? `${Math.abs(Math.round(deltaAvg))}s FASTER than their average` : `${Math.abs(Math.round(deltaAvg))}s SLOWER than their average`;
        lines.push(`Km ${splitKm} vs average: ${label}`);
      }
    }
  }

  // Upcoming terrain warning (within next 600m of route) — only for a high-confidence route
  // match ("confident"/"certain", i.e. >=60%, per route-recognition-service.ts's
  // confidenceLabel buckets). A "tentative" match (40-59%) is exactly the case a runner on a
  // route merely SIMILAR to a known one (not the same one) would produce — narrating a
  // specific upcoming hill with "MENTION THIS FIRST" confidence from an uncertain match risks
  // describing terrain that isn't actually on today's route. The route name/PB/last-run lines
  // above stay visible at any matched confidence — only this forward-looking terrain claim
  // needs the higher bar, since it's the one piece of route memory that reads to the runner
  // as the AI genuinely knowing what's ahead, not just recalling past performance.
  if (routeCtx.confidence >= 0.6 && routeCtx.notableSegments && routeCtx.typicalDistanceKm && routeCtx.typicalDistanceKm > 0) {
    const progressPct = currentDistanceKm / routeCtx.typicalDistanceKm;
    const lookaheadPct = 0.6 / routeCtx.typicalDistanceKm; // 600m lookahead
    const approaching = routeCtx.notableSegments.find((seg) =>
      seg.startPct >= progressPct && seg.startPct <= progressPct + lookaheadPct
    );
    if (approaching) {
      const distanceToSegM = Math.round((approaching.startPct - progressPct) * routeCtx.typicalDistanceKm * 1000);
      lines.push(`⚠️ TERRAIN ALERT: "${approaching.name}" in ~${distanceToSegM}m — ${approaching.coachingNote} MENTION THIS FIRST.`);
    }
  }

  return lines.join("\n");
}

/**
 * Historical run statistics passed from the Android app at run-start.
 * Calculated from the user's last 3-5 completed runs of similar distance.
 */
export interface RunHistoryStats {
  runsAnalysed: number;            // How many runs were used
  avgPaceSecondsPerKm: number;     // Average pace across recent runs (sec/km)
  avgPaceFormatted: string;        // e.g. "5:42"
  bestPaceFormatted?: string;      // Personal best pace for similar distance
  avgDistanceKm: number;           // Average distance of recent runs
  avgCadence?: number;             // Average cadence (spm)
  avgHeartRate?: number;           // Average HR
  consistencyTrend: 'improving' | 'declining' | 'consistent' | 'inconsistent';
  avgPaceDropPercent?: number;     // Typical % pace drop they experience mid-run
  lastRunPaceFormatted?: string;   // Their pace on the most recent run
  lastRunDate?: string;            // e.g. "3 days ago"
  totalRunsAllTime?: number;       // Total run count — tells us how experienced they are
}

/**
 * Build a concise natural-language context string from run history stats.
 * Compares current pace to their recent average so the AI can comment meaningfully.
 */
function buildRunHistoryContext(history: RunHistoryStats, currentPace?: string, isWalkSession?: boolean): string {
  if (!history || history.runsAnalysed === 0) return '';

  // Don't compare walk pace to run pace history (and vice versa) — they're completely different baselines
  // A 24 min/km walk is normal; a 24 min/km run would be walking-pace. Skip the comparison if activity type
  // suggests this history is from a different activity type.
  // (In future, we should pass activity-specific history from the backend instead)
  const walkSession = isWalkSession ?? false;
  const historyLikelihyWalkData = history.avgPaceSecondsPerKm > 900; // >15 min/km suggests walk data
  const mismatch = (walkSession && !historyLikelihyWalkData) || (!walkSession && historyLikelihyWalkData);

  let ctx = `Based on their last ${history.runsAnalysed} ${walkSession ? 'walks' : 'runs'}: avg pace ${history.avgPaceFormatted}/km`;

  if (currentPace && history.avgPaceSecondsPerKm > 0 && !mismatch) {
    // Parse current pace to seconds
    const parts = currentPace.replace('/km', '').split(':');
    if (parts.length === 2) {
      const currentSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      const diff = currentSec - history.avgPaceSecondsPerKm;
      if (diff < -10) {
        ctx += ` — they're ${walkSession ? 'walking' : 'running'} ${Math.abs(Math.round(diff))}s/km FASTER than their usual pace (performing above average today)`;
      } else if (diff > 10) {
        ctx += ` — they're ${walkSession ? 'walking' : 'running'} ${Math.round(diff)}s/km SLOWER than their usual pace`;
      } else {
        ctx += ` — they're ${walkSession ? 'walking' : 'running'} close to their typical pace`;
      }
    }
  } else if (mismatch) {
    // Activity type mismatch — don't make pace comparisons
    ctx += ` (note: this history is from ${walkSession ? 'runs' : 'walks'}, not ${walkSession ? 'walks' : 'runs'})`;
  }

  if (history.bestPaceFormatted) ctx += `. PB: ${history.bestPaceFormatted}/km`;
  if (history.avgCadence) ctx += `. Typical cadence: ${history.avgCadence}spm`;
  if (history.consistencyTrend !== 'consistent') {
    const trendLabel = { improving: 'on an improving trend', declining: 'on a recent dip in form', inconsistent: 'running inconsistently lately' }[history.consistencyTrend];
    ctx += `. Trend: ${trendLabel}`;
  }
  if (history.lastRunPaceFormatted) ctx += `. Last run: ${history.lastRunPaceFormatted}/km (${history.lastRunDate || 'recently'})`;

  return ctx + '.';
}

// ── Watch running-dynamics context (shared across all live-coaching prompts) ──────────────
// Populated from garminRealtimeData via the /api/coaching/* routes' watch-enrichment lookup
// (see getWatchDynamicsEnrichment() in routes.ts) whenever a Garmin/Wear OS watch is actually
// paired and streaming. Absent entirely for phone-only runs, so those prompts are unchanged.
// Raw-data, no-pre-interpreted-verdict — same philosophy as cadence/terrain context elsewhere:
// let GPT decide what's worth commenting on rather than baking in a threshold verdict here.
export interface WatchDynamicsParams {
  groundContactTimeMs?: number;
  groundContactBalancePercent?: number;
  verticalOscillationMm?: number;
  verticalRatioPercent?: number;
  strideLengthM?: number;
  runningPowerWatts?: number;
  respirationRateBpm?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
}

function buildWatchDynamicsText(p: WatchDynamicsParams): string {
  const parts: string[] = [];
  if (p.groundContactTimeMs)        parts.push(`ground contact time ${Math.round(p.groundContactTimeMs)}ms`);
  if (p.groundContactBalancePercent) parts.push(`ground contact balance ${p.groundContactBalancePercent.toFixed(1)}% L/R`);
  if (p.verticalOscillationMm)      parts.push(`vertical oscillation ${p.verticalOscillationMm.toFixed(1)}mm`);
  if (p.verticalRatioPercent)       parts.push(`vertical ratio ${p.verticalRatioPercent.toFixed(1)}%`);
  if (p.strideLengthM)              parts.push(`stride length ${p.strideLengthM.toFixed(2)}m`);
  if (p.runningPowerWatts)          parts.push(`running power ${Math.round(p.runningPowerWatts)}W`);
  if (p.respirationRateBpm)         parts.push(`respiration rate ${Math.round(p.respirationRateBpm)} breaths/min`);
  if (p.aerobicTrainingEffect)      parts.push(`aerobic training effect ${p.aerobicTrainingEffect.toFixed(1)}`);
  if (p.anaerobicTrainingEffect)    parts.push(`anaerobic training effect ${p.anaerobicTrainingEffect.toFixed(1)}`);
  return parts.length > 0 ? parts.join(', ') : '';
}

export async function generatePaceUpdate(params: {
  distance: number;
  targetDistance: number;
  currentPace: string;
  elapsedTime: number;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  coachGender?: string;
  isSplit: boolean;
  splitKm?: number;
  splitPace?: string;
  currentGrade?: number;
  totalElevationGain?: number;
  isOnHill?: boolean;
  kmSplits?: Array<{ km: number; time: number; pace: string }>;
  hasRoute?: boolean;
  // Heart rate — available when athlete has HR monitor (Garmin watch, chest strap)
  heartRate?: number;
  heartRateZoneTarget?: { min?: number; max?: number };
  // User profile
  fitnessLevel?: string;
  runnerName?: string;
  runnerAge?: number;
  // Historical context
  runHistory?: RunHistoryStats;
  runnerProfile?: string | null;
  // Route Memory Engine context (optional — injected when a known route is matched)
  routeIntelligence?: RouteIntelligenceContext;
  // Seconds taken for the most recently completed km (for split delta comparison)
  lastKmSplitSeconds?: number;
  // Training plan session type — when set, suppresses race-goal pace comparison and reframes
  // coaching around the training objective (easy, tempo, long_run, recovery, etc.)
  workoutType?: string;
  // Activity type — "run" or "walk". Legacy callers may instead send `sessionType`;
  // resolveActivityType() below accepts either.
  activityType?: string;
  sessionType?: string;
  // Whole-run average pace, distinct from `currentPace` — some clients (e.g. Android) send
  // the average pace value itself in `currentPace` for split updates; others send the true
  // live/instantaneous pace there and the average separately here. Prefer this when present.
  averagePace?: string;
  // Explicit terrain classifier ("uphill"|"downhill"|"flat"|"rolling") for clients that don't
  // send raw GPS grade — used as a fallback when `currentGrade` isn't available.
  terrainContext?: string;
  // Heart-rate trend since the last coaching cue — lets the coach reference effort/recovery
  // instead of only pace.
  hrTrend?: 'rising' | 'falling' | 'stable';
  // Cadence in steps per minute — always referenced when present, not just on training sessions.
  cadence?: number;
  // Client-computed pace trend across recent splits — overrides the km-split-derived calculation
  // below when supplied.
  paceTrendDirection?: 'slowing' | 'speeding_up' | 'consistent';
  // Topic keys ("terrain" | "hr_trend" | "cadence" | "pace_trend") used in recent coaching
  // messages this session, most-recent last — used to avoid repeating the same angle twice in a row.
  recentCoachingTopics?: string[];
  // Enriched running-dynamics from a live paired watch (Garmin or Wear OS — see
  // garminRealtimeData, populated only while a watch is actually connected and streaming).
  // All optional/independent: any subset may be present depending on watch model. Absent
  // entirely for phone-only runs, which get the exact same prompt as before this existed.
  groundContactTimeMs?: number;
  groundContactBalancePercent?: number;
  verticalOscillationMm?: number;
  verticalRatioPercent?: number;
  strideLengthM?: number;
  runningPowerWatts?: number;
  respirationRateBpm?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
}): Promise<string> {
  const { distance, targetDistance, currentPace, elapsedTime, coachName, coachTone, isSplit, splitKm, splitPace, currentGrade, totalElevationGain, isOnHill, kmSplits, hasRoute, fitnessLevel, runnerName, runHistory, heartRate, heartRateZoneTarget } = params;
  const workoutType = (params as any).workoutType as string | undefined;
  const accentRule = accentDirective((params as any).coachAccent);

  // Whole-run average pace — prefer an explicit `averagePace` field; fall back to `currentPace`,
  // which is the field Android has always populated with the average value for split updates.
  const averagePaceResolved = params.averagePace || currentPace;

  const hrTrend = params.hrTrend;
  // Build HR context for split coaching — only when athlete has an HR monitor
  let hrContext = '';
  if (heartRate && heartRate > 0) {
    hrContext = `\n- Heart rate: ${heartRate} bpm`;
    if (heartRateZoneTarget?.max) {
      if (heartRate > heartRateZoneTarget.max) {
        hrContext += ` (ABOVE target zone ${heartRateZoneTarget.min ?? '?'}–${heartRateZoneTarget.max} bpm — ${heartRate - heartRateZoneTarget.max} bpm over)`;
      } else if (heartRateZoneTarget.min && heartRate < heartRateZoneTarget.min) {
        hrContext += ` (below target zone ${heartRateZoneTarget.min}–${heartRateZoneTarget.max} bpm)`;
      } else {
        hrContext += ` (in target zone ${heartRateZoneTarget.min ?? '?'}–${heartRateZoneTarget.max} bpm)`;
      }
    }
  }
  if (hrTrend === 'rising') {
    hrContext += hrContext ? ', trending upward' : `\n- Heart rate trending upward`;
  } else if (hrTrend === 'falling') {
    hrContext += hrContext ? ', recovering / trending down' : `\n- Heart rate recovering, trending down`;
  }

  const progress = Math.round((distance / targetDistance) * 100);
  const timeMin = Math.floor(elapsedTime / 60);  // kept for backward compat
  const timeFormatted = formatElapsedForTTS(elapsedTime); // full "X min Y sec" string

  // Terrain context — built from live GPS grade whenever it's meaningfully non-flat, regardless
  // of whether this session has a planned route (previously gated on hasRoute===true, which
  // silently dropped terrain commentary for routeless free runs even when grade data existed).
  // Falls back to a client-supplied classifier string when no grade figure is available.
  let terrainContext = '';
  const hasGradeSignal = typeof currentGrade === 'number' && currentGrade !== null;
  if (hasGradeSignal && Math.abs(currentGrade!) > 5) {
    terrainContext = currentGrade! > 5
      ? `Currently climbing a steep ${currentGrade!.toFixed(1)}% grade hill. `
      : `Currently descending a steep ${Math.abs(currentGrade!).toFixed(1)}% grade. `;
  } else if (hasGradeSignal && Math.abs(currentGrade!) > 3) {
    terrainContext = currentGrade! > 0
      ? `On a gentle ${currentGrade!.toFixed(1)}% incline. `
      : `On a gentle ${Math.abs(currentGrade!).toFixed(1)}% decline. `;
  } else if (params.terrainContext && params.terrainContext !== 'flat') {
    const terrainLabels: Record<string, string> = {
      uphill: 'Currently on an uphill stretch. ',
      downhill: 'Currently on a downhill stretch. ',
      rolling: 'On rolling, undulating terrain. ',
    };
    terrainContext = terrainLabels[params.terrainContext] ?? '';
  }
  if (hasRoute === true && totalElevationGain && totalElevationGain > 20) {
    terrainContext += `Total elevation climbed so far: ${Math.round(totalElevationGain)}m. `;
  }

  // Walk/run vocabulary — established early so paceTrend and other context strings use it
  const activityType = resolveActivityType(params as any);
  const isWalkSession = activityType === 'walk';
  const { person: personLabel } = activityVocab(activityType);

  // Build pace trend context for splits — prefer a client-computed trend, else derive it
  // from the last two km splits.
  let paceTrend = '';
  const personWord = isWalkSession ? 'Walker' : 'Runner';
  if (isSplit && params.paceTrendDirection) {
    paceTrend = params.paceTrendDirection === 'slowing'
      ? `${personWord} is gradually slowing down. `
      : params.paceTrendDirection === 'speeding_up'
        ? `${personWord} is speeding up. `
        : `${personWord} is maintaining consistent pace. `;
  } else if (isSplit && kmSplits && kmSplits.length >= 2) {
    const lastTwo = kmSplits.slice(-2);
    if (lastTwo.length === 2) {
      const prevTime = lastTwo[0].time;
      const currTime = lastTwo[1].time;
      const diff = currTime - prevTime;
      if (diff > 10) {
        paceTrend = `${personWord} is slowing down compared to previous kilometer. `;
      } else if (diff < -10) {
        paceTrend = `${personWord} is speeding up compared to previous kilometer. `;
      } else {
        paceTrend = `${personWord} is maintaining consistent pace. `;
      }
    }
  }

  // Build the no-terrain rule when there's no route
  // hasRoute now means "GPS altitude data is available" (set true whenever phone/watch has altitude)
  // — it is no longer restricted to only planned navigation routes.
  // Only ban terrain mentions if we genuinely have no elevation data AND no current grade signal.
  const hasGradeData = currentGrade !== undefined && currentGrade !== null && Math.abs(currentGrade) > 0.5;
  const hasExplicitTerrain = !!(params.terrainContext && params.terrainContext !== 'flat');
  const noTerrainRule = (hasRoute || hasGradeData || hasExplicitTerrain) ? '' : `
CRITICAL: No GPS elevation data available for this ${isWalkSession ? 'walk' : 'run'}. Do NOT mention hills, terrain, elevation, climbing, descending, or any terrain characteristics — you have no information about the terrain. Focus only on pace, effort, form, and motivation.`;
  
  // Build runner/walker profile + history context
  const runnerFirstNamePace = runnerName ? runnerName.split(' ')[0] : null;
  let runnerContext = '';
  if (runnerFirstNamePace) runnerContext += `${isWalkSession ? 'Walker' : 'Runner'}: ${runnerFirstNamePace}. `;
  if (fitnessLevel) runnerContext += `Fitness level: ${fitnessLevel}. `;
  if (runHistory) {
    runnerContext += buildRunHistoryContext(runHistory, currentPace, isWalkSession);
  }

  const spokenCurrentPace = averagePaceResolved ? formatPaceForTTS(averagePaceResolved) : null;  // overall average pace - already includes "per kilometer"
  const spokenSplitPace = formatPaceForTTS(splitPace);       // this km's split pace
  
  // Training session context — builds a plan-aware framing block for the AI
  // When workoutType is set this is a coaching plan session, NOT a race/goal attempt.
  // We suppress the race-goal pace comparison (targetPace is the user's long-term race goal,
  // not the session's prescribed pace) and frame the split around the training objective.
  const isTrainingSession = !!workoutType;

  // Session target pace — for training sessions, use the session's prescribed pace (not the race goal).
  // sessionTargetPaceMin / sessionTargetPaceMax are in sec/km and come from the coaching plan's targetMetrics.
  const sessionTargetPaceMinSec = (params as any).sessionTargetPaceMin as number | undefined;
  const sessionTargetPaceMaxSec = (params as any).sessionTargetPaceMax as number | undefined;
  const currentCadence = params.cadence;

  // Build session pace context for training runs — pass raw numbers, let GPT interpret
  let sessionSplitContext = '';
  if (isTrainingSession && splitPace && (sessionTargetPaceMinSec || sessionTargetPaceMaxSec)) {
    const sParts = splitPace.split(':').map(Number);
    if (sParts.length === 2) {
      const splitSec = sParts[0] * 60 + sParts[1];
      const targetMin = sessionTargetPaceMinSec ?? (sessionTargetPaceMaxSec! - 30);
      const targetMax = sessionTargetPaceMaxSec ?? (sessionTargetPaceMinSec! + 30);
      const midTarget = Math.round((targetMin + targetMax) / 2);
      const diffSec = splitSec - midTarget;
      const sessionPaceRange = `${formatPaceForTTS(formatPaceForPrompt(targetMin))} to ${formatPaceForTTS(formatPaceForPrompt(targetMax))}`;
      // Pass raw numbers without "encourage/warn/reinforce" directives — let GPT decide
      sessionSplitContext = `\nSession target pace: ${sessionPaceRange}\nSplit pace: ${spokenSplitPace}\nDifference: ${diffSec > 0 ? '+' : ''}${diffSec} seconds/km (${diffSec > 0 ? 'slower' : 'faster'} than target)\nWorkout type: ${workoutType}`;
    }
  }

  // Cadence context — always included when a reading is present (previously gated to training
  // sessions only, which silently dropped cadence data for free runs even when it was sent).
  // Pass raw cadence data without pre-interpreted verdicts — let GPT decide if cadence needs comment
  let cadenceContext = (currentCadence && currentCadence > 0)
    ? `\n- Current cadence: ${currentCadence} spm${workoutType === 'tempo' || workoutType === 'threshold' ? ` (for ${workoutType.replace(/_/g, ' ')} effort)` : ''}`
    : '';

  // Watch running-dynamics — same raw-data, no-pre-interpreted-verdict philosophy as cadence
  // above. Only present when a watch is actually paired and streaming (see garminRealtimeData);
  // absent entirely otherwise, so a phone-only run's prompt is byte-for-byte unchanged.
  const watchDynamicsText = buildWatchDynamicsText(params);
  if (watchDynamicsText) {
    cadenceContext += `\n- Watch running dynamics: ${watchDynamicsText}`;
  }

  const trainingSessionContext = isTrainingSession
    ? `\nTraining Session Context: This km split is part of a SCHEDULED TRAINING SESSION (${workoutType!.replace(/_/g, ' ')} workout) in the ${personLabel}'s coaching plan — NOT a race or goal attempt. Do NOT compare their pace to their long-term race goal. Instead, frame the coaching around what this session is building.${sessionSplitContext}`
    : '';

  // Compute target pace comparison for split coaching (so AI can tell runner if they're on track)
  // Suppress for training sessions — targetPace is the race goal, not the session's prescribed pace.
  const targetPaceParam = isTrainingSession ? undefined : (params as any).targetPace as string | undefined;
  const spokenTargetPace = formatPaceForTTS(targetPaceParam);
  let splitTargetVerdict = '';
  if (targetPaceParam && splitPace) {
    const tParts = targetPaceParam.split(':').map(Number);
    const sParts = splitPace.split(':').map(Number);
    if (tParts.length === 2 && sParts.length === 2) {
      const targetSec = tParts[0] * 60 + tParts[1];
      const splitSec = sParts[0] * 60 + sParts[1];
      const diffSec = splitSec - targetSec;
      // For free runs: give explicit verdict so GPT delivers clear, directive coaching
      if (diffSec > 20) {
        splitTargetVerdict = `⚠️ BEHIND TARGET: This split was ${Math.abs(diffSec)}s/km SLOWER than the target of ${spokenTargetPace}. Encourage them to pick up the pace.`;
      } else if (diffSec < -20) {
        splitTargetVerdict = `⚠️ AHEAD OF TARGET: This split was ${Math.abs(diffSec)}s/km FASTER than target (${spokenTargetPace}). Gently note they may be going a bit fast.`;
      } else {
        splitTargetVerdict = `✅ ON TARGET: Split pace is within ${Math.abs(diffSec)}s/km of target (${spokenTargetPace}). Reinforce they're nailing the pacing.`;
      }
    }
  }

  // ── Dynamic topic selection for free-run split updates (no target pace, no training plan) ──
  // Without this, the closing instruction below defaults to "mention pace and one other data
  // point" every time, which is exactly what produces flat, pace-only coaching. Pick whichever
  // signal is most notable right now, and avoid repeating the same angle as the last update.
  // Only applies when nothing has already forced the topic (target-pace verdict / training
  // framing, both of which remain mandatory and unchanged below).
  let topicInstruction = 'at least one other data point (progress, time, or pace trend).';
  if (!splitTargetVerdict && !sessionSplitContext && !isTrainingSession) {
    const recentTopics = params.recentCoachingTopics ?? [];
    const lastTopic = recentTopics.length > 0 ? recentTopics[recentTopics.length - 1] : undefined;
    const candidates: Array<{ key: string; weight: number; instruction: string }> = [];
    if (terrainContext) {
      candidates.push({ key: 'terrain', weight: 4, instruction: 'the terrain they are on right now (e.g. easing off on a climb, or pushing the pace on a flat/descent)' });
    }
    if (hrTrend === 'rising' || hrTrend === 'falling') {
      candidates.push({
        key: 'hr_trend', weight: 3,
        instruction: hrTrend === 'rising'
          ? 'their heart rate trending upward — talk about effort and breathing, not just pace'
          : 'their heart rate recovering / trending down — acknowledge it',
      });
    }
    if (cadenceContext && !isWalkSession) {
      // Cadence coaching is run-only — walk sessions never get cadence-target commentary
      // (see the WALK SESSION POLICY / prohibition elsewhere in the coaching prompts).
      candidates.push({ key: 'cadence', weight: 2, instruction: 'their cadence, but only if it stands out as notably low or high — otherwise skip it' });
    }
    if (paceTrend && !paceTrend.includes('maintaining consistent')) {
      candidates.push({ key: 'pace_trend', weight: 2, instruction: 'their pace trend over recent splits (speeding up or slowing down)' });
    }
    const eligible = lastTopic ? candidates.filter(c => c.key !== lastTopic) : candidates;
    const pool = (eligible.length > 0 ? eligible : candidates).sort((a, b) => b.weight - a.weight);
    if (pool.length > 0) {
      topicInstruction = `${pool[0].instruction} as the main focus of this update — do not just restate the pace.`;
    }
  }

  // Build Route Intelligence context block (when known route is matched)
  const routeCtxBlock = params.routeIntelligence
    ? buildRouteIntelligenceContext(
        params.routeIntelligence,
        distance,
        targetDistance,
        params.lastKmSplitSeconds,
        isSplit ? splitKm : undefined
      )
    : '';

  // Calculate current (average) pace in seconds/km for context directive
  const currentPaceSecPerKm = (() => {
    if (!averagePaceResolved) {
      console.warn(`[generatePaceUpdate] currentPace/averagePace missing from request body — check client field casing (expected "currentPace" or "averagePace")`);
      return undefined;
    }
    const parts = averagePaceResolved.split(':').map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : undefined;
  })();

  const promptCtx: PaceUpdatePromptContext = {
    coachName, coachTone, isSplit: !!(isSplit && splitKm && splitPace),
    splitKm, spokenSplitPace, distance, targetDistance, progress, timeFormatted,
    spokenCurrentPace, targetPaceParam, spokenTargetPace, hrContext, cadenceContext,
    splitTargetVerdict, trainingSessionContext, routeCtxBlock, terrainContext, paceTrend,
    noTerrainRule, sessionSplitContext, isTrainingSession, workoutType, hasRoute, isOnHill,
    runnerContext, currentGrade, fitnessLevel, heartRate, currentPaceSecPerKm, topicInstruction,
    runnerProfile: params.runnerProfile, accentRule,
  };
  const { system, user } = (isWalkSession ? walkPrompts : runPrompts).paceUpdatePrompt(promptCtx);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: 110,
    temperature: 0.75,
  });

  return completion.choices[0].message.content || (isSplit ? `Kilometer ${splitKm} done at ${spokenSplitPace}. Keep it up!` : "Looking good, keep this pace!");
}

export async function generateRunSummary(runData: any, runnerProfile?: string | null, userId?: string | null): Promise<any> {
  const isWalkSummary = runData.sessionType === "walk";
  const summaryModule = isWalkSummary ? walkPrompts : runPrompts;
  const { system, user: prompt } = summaryModule.runSummaryPrompt({ runData, runnerProfile });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt }
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  if (completion.usage) {
    import("./cost-tracking-service").then(({ trackOpenAIChatCost }) => {
      trackOpenAIChatCost(completion.usage!, userId ?? null, "run_analysis");
    }).catch(() => {});
  }

  try {
    const content = completion.choices[0].message.content || "{}";
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return summaryModule.RUN_SUMMARY_FALLBACK;
  }
}

/**
 * Check if a run has been completed (reached target distance or target time)
 * Returns true if either target has been reached, false otherwise
 */
export function isRunCompleted(params: {
  distance: number;
  targetDistance?: number;
  elapsedTime: number;
  targetTime?: number;
}): boolean {
  const { distance, targetDistance, elapsedTime, targetTime } = params;
  
  // Check if distance target is reached (with 1% tolerance for GPS precision)
  if (targetDistance && targetDistance > 0) {
    const distanceThreshold = targetDistance * 0.99;
    if (distance >= distanceThreshold) return true;
  }
  
  // Check if time target is reached (with 2% tolerance)
  if (targetTime && targetTime > 0) {
    const timeThreshold = targetTime * 0.98;
    if (elapsedTime >= timeThreshold) return true;
  }
  
  return false;
}

/**
 * Generate a brief congratulatory summary when the runner reaches their target
 * Called ONLY when isRunCompleted() returns true
 * This is the FINAL coaching message - no more coaching after this
 */
export async function generateCompletionSummary(params: {
  distance: number;
  targetDistance?: number;
  elapsedTime: number;
  targetTime?: number;
  currentPace?: string;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  runnerName?: string;
  activityType?: string;
}): Promise<string> {
  const { distance, targetDistance, elapsedTime, targetTime, currentPace, coachName, coachTone, coachAccent, runnerName, activityType } = params;
  
  // Format the final stats
  const totalTimeMin = Math.floor(elapsedTime / 60);
  const totalTimeSec = Math.round(elapsedTime % 60);
  const totalTimeStr = `${totalTimeMin} minutes and ${totalTimeSec} seconds`;
  const finalPace = currentPace || 'unknown';
  const activityLabel = activityType || 'run';
  
  // Build the summary prompt
  const summaryPrompt = `You are ${coachName}, giving a brief final congratulations as ${runnerName || 'the runner'} completes their ${activityLabel}.
  
COMPLETION STATS:
- Total distance: ${distance} km${targetDistance ? ` (target was ${targetDistance} km)` : ''}
- Total time: ${totalTimeStr}${targetTime ? ` (target was ${Math.floor(targetTime / 60)} min ${Math.round(targetTime % 60)}s)` : ''}
- Final pace: ${finalPace}

Give ONE SENTENCE of brief, celebratory congratulations.
- Use their name naturally if provided.
- Reference the specific distance or time they just completed.
- NO coaching advice or tips — this is the finish line moment.
- Short and punchy — maximum 2 sentences.
- ${toneDirective(coachTone)}
- This moment repeats every run — invent fresh wording each time rather than a stock celebratory phrase.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are a ${activityLabel === 'walk' ? 'walking' : 'running'} coach giving a final congratulations message. Be brief, positive, and celebratory. NO further coaching advice.` },
        { role: "user", content: summaryPrompt }
      ],
      max_tokens: 60,
      temperature: 0.8,
    });

    return completion.choices[0].message.content || `Well done completing your ${activityLabel}!`;
  } catch (error) {
    console.error("Error generating completion summary:", error);
    // Fallback message if AI fails
    return `Congratulations on completing your ${distance} kilometre ${activityLabel} in ${totalTimeMin}:${totalTimeSec.toString().padStart(2, '0')}! Great effort!`;
  }
}

export async function generatePhaseCoaching(params: {
  phase: 'warmUp' | 'midRun' | 'lateRun' | 'finalPush';
  distance: number;
  targetDistance?: number;
  elapsedTime: number;
  currentPace?: string;
  currentGrade?: number;
  totalElevationGain?: number;
  heartRate?: number;
  cadence?: number;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  coachGender?: string;
  activityType?: string;
  hasRoute?: boolean;
  targetPace?: string;
  targetTime?: number;
  triggerType?: string;
  navigationInstruction?: string;
  navigationDistance?: number;
  fitnessLevel?: string;
  runnerName?: string;
  runnerAge?: number;
  runnerWeight?: number;
  runnerHeight?: number;
  runnerProfile?: string | null;
  // Training plan context (optional — used for plan-aware coaching)
  trainingPlanId?: string;
  workoutType?: string;
  workoutDescription?: string;
  planGoalType?: string;
  planWeekNumber?: number;
  planTotalWeeks?: number;
} & WatchDynamicsParams): Promise<string> {
  const { phase, distance, targetDistance, elapsedTime, currentPace, currentGrade, totalElevationGain, heartRate, cadence, coachName, coachTone, coachAccent, coachGender, activityType, hasRoute, targetPace, targetTime, triggerType, navigationInstruction, navigationDistance, fitnessLevel, runnerName, runnerAge, runnerWeight, runnerHeight } = params;
  
  const timeMin = Math.floor(elapsedTime / 60);  // kept for backward compat
  const timeFormatted = formatElapsedForTTS(elapsedTime);  // "X min Y sec" for TTS
  const progress = targetDistance ? Math.round((distance / targetDistance) * 100) : 0;
  
  // Activity-aware vocabulary for phase descriptions
  const isWalkActivity = activityType === 'walk';
  const pLabel = isWalkActivity ? 'walker' : 'runner';
  const aLabel = isWalkActivity ? 'walk' : 'run';

  const phaseDescriptions: Record<string, string> = {
    // App sends these enum names from CoachingPhase.kt
    // Backend provides facts (phase, progress %) — GPT decides coaching approach
    EARLY: `The ${pLabel} is in the early phase of their ${aLabel} (${progress}% complete), warming up and finding their rhythm.`,
    MID: `The ${pLabel} is in the middle of their ${aLabel} (${progress}% complete), settling into their pace. They have significant distance remaining.`,
    LATE: `The ${pLabel} is in the late phase (${progress}% complete). Physiologically, fatigue may be accumulating.`,
    FINAL: `The ${pLabel} is in the final phase (${progress}% complete), approaching the finish line.`,
    GENERIC: `The ${pLabel} is ${progress}% through their ${aLabel}.`,
    STEADY: `The ${pLabel} is ${isWalkActivity ? 'walking' : 'running'} at a steady pace (${progress}% complete).`,
    // Legacy keys (in case old server code calls with these)
    warmUp: `The ${pLabel} is in the warm-up phase (${progress}% complete), finding their rhythm.`,
    midRun: `The ${pLabel} is in the middle of their ${aLabel} (${progress}% complete), with significant distance remaining.`,
    lateRun: `The ${pLabel} is in the late phase (${progress}% complete), where fatigue may be a factor.`,
    finalPush: `The ${pLabel} is in the final phase (${progress}% complete), approaching the finish.`,
  };
  
  // ONLY include terrain info when the runner has a planned route
  let terrainInfo = '';
  if (hasRoute === true) {
    if (typeof currentGrade === 'number' && currentGrade !== null && Math.abs(currentGrade) > 2) {
      terrainInfo = currentGrade > 0 ? `Currently climbing (${currentGrade.toFixed(1)}% grade). ` : `Currently descending (${Math.abs(currentGrade).toFixed(1)}% grade). `;
    }
    if (totalElevationGain && totalElevationGain > 0) {
      terrainInfo += `Total climb so far: ${Math.round(totalElevationGain)}m. `;
    }
  }

  // Build heart rate info if available — use runner age for accurate zone calculation
  let hrInfo = '';
  if (heartRate && heartRate > 0) {
    const hrZone = getHeartRateZone(heartRate, runnerAge);
    hrInfo = `- Heart rate: ${heartRate} bpm (${hrZone} zone)`;
  }

  // Build personalized cadence coaching using biomechanics model
  // Optimal cadence depends on pace + height + age — NOT a universal fixed number
  // 750m standdown: never coach on cadence in the first 750m — the runner needs time to
  // warm up and settle into their natural rhythm before receiving cadence guidance.
  let cadenceInfo = '';
  let cadenceCoachingDirective = '';
  if (cadence && cadence > 0 && distance >= 0.75) {
    // Parse current pace to seconds/km for the cadence calculator
    const paceSecPerKm = (() => {
      if (!currentPace) return 360; // default to 6:00/km if unknown
      const parts = currentPace.split(':').map(Number);
      return parts.length === 2 ? parts[0] * 60 + parts[1] : 360;
    })();

    const cadenceRange = calculateOptimalCadenceRange(
      paceSecPerKm,
      runnerHeight ?? 170,   // cm — defaults to 170cm if not provided
      runnerAge ?? undefined,
      cadence
    );

    let cadenceAssessment: string;
    let cadenceAction: string;

    if (cadenceRange.isHigh) {
      cadenceAssessment = `high (personal target: ~${cadenceRange.optimal} spm)`;
      cadenceAction = `Their cadence of ${cadence} spm is above their personal optimal of ${cadenceRange.optimal} spm — this may indicate overstriding or very short steps. Mention it gently.`;
    } else if (!cadenceRange.isLow && cadence >= cadenceRange.low) {
      cadenceAssessment = `on target (personal target: ~${cadenceRange.optimal} spm)`;
      cadenceAction = `Their cadence of ${cadence} spm is within their personalised optimal range of ${cadenceRange.low}–${cadenceRange.high} spm. Acknowledge it positively if relevant.`;
    } else if (cadenceRange.deficit > 0 && cadenceRange.deficit <= 10) {
      cadenceAssessment = `slightly low (personal target: ${cadenceRange.optimal} spm)`;
      cadenceAction = `Their cadence of ${cadence} spm is ${cadenceRange.deficit} spm below their personal optimal of ${cadenceRange.optimal} spm for their height and current pace. Gently encourage quicker feet — a small increase will improve efficiency without feeling harder.`;
    } else if (cadenceRange.isLow) {
      cadenceAssessment = `low (personal target: ${cadenceRange.optimal} spm)`;
      cadenceAction = `⚠️ Their cadence of ${cadence} spm is ${cadenceRange.deficit} spm below their personal optimal of ${cadenceRange.optimal} spm. For their height (${runnerHeight ?? 170}cm) at this pace, they should target ${cadenceRange.low}–${cadenceRange.high} spm. Coach them to shorten the stride and increase foot turnover — put this in your own words each time, don't reuse the same cue phrase. This is specific to THEM, not a generic target.`;
    } else {
      cadenceAssessment = `good`;
      cadenceAction = '';
    }

    cadenceInfo = `- Cadence: ${cadence} spm (${cadenceAssessment})`;
    cadenceCoachingDirective = cadenceAction;
  }

  // Watch running-dynamics — only present when a watch is actually paired and streaming
  // (see getWatchDynamicsEnrichment() in routes.ts); absent entirely otherwise, so a
  // phone-only run's prompt is unchanged.
  const phaseWatchDynamicsText = buildWatchDynamicsText(params);
  if (phaseWatchDynamicsText) {
    cadenceInfo += `${cadenceInfo ? '\n' : ''}- Watch running dynamics: ${phaseWatchDynamicsText}`;
  }

  // Build target pace comparison if available (use spoken format for TTS)
  // For phase coaching, we need to provide the pace in a way that won't be doubled
  // formatPaceForTTS already returns "X minutes and Y seconds per kilometer"
  // so we just reference it as is, without the AI adding "/km" again
  const spokenPhasePace = currentPace ? formatPaceForTTS(currentPace) : null;
  const spokenTargetPace = formatPaceForTTS(targetPace);
  
  let paceComparisonInfo = '';
  let paceVerdict = '';
  if (targetPace && currentPace) {
    paceComparisonInfo = `- Target pace: ${spokenTargetPace} (current: ${spokenPhasePace})`;
    // Pure factual pace-gap data. No behavioral instructions here — the AI derives
    // how to communicate this from toneDirective + runnerProfileContext + runnerProfileBlock.
    const targetParts = targetPace.split(':').map(Number);
    const currentParts = currentPace.split(':').map(Number);
    if (targetParts.length === 2 && currentParts.length === 2) {
      const targetSec = targetParts[0] * 60 + targetParts[1];
      const currentSec = currentParts[0] * 60 + currentParts[1];
      const diffSec = currentSec - targetSec;
      if (diffSec > 30) {
        paceVerdict = `Pace gap: ${pLabel} is ${Math.abs(diffSec)} seconds/km slower than their target pace.`;
      } else if (diffSec > 10) {
        paceVerdict = `Pace gap: ${pLabel} is ${Math.abs(diffSec)} seconds/km behind their target pace.`;
      } else if (diffSec < -10) {
        paceVerdict = `Pace note: ${pLabel} is ${Math.abs(diffSec)} seconds/km ahead of their target pace.`;
      } else {
        paceVerdict = `Pace note: ${pLabel} is within ${Math.abs(diffSec)} seconds/km of their target pace — very close.`;
      }
      paceComparisonInfo += `\n  → ${paceVerdict}`;
    }
  }

  // Build target time info and projected finish if available
  let targetTimeInfo = '';
  if (targetTime && targetTime > 0) {
    targetTimeInfo = `- Target time: ${formatDurationForTTS(targetTime)}`;
    // Calculate projected finish time based on current pace
    if (distance > 0 && targetDistance && elapsedTime > 0) {
      const projectedTotalSec = (elapsedTime / distance) * targetDistance;
      const projectedMin = Math.floor(projectedTotalSec / 60);
      const projectedSec = Math.round(projectedTotalSec % 60);
      const targetTotalMin = Math.floor(targetTime / 60);
      const diff = projectedMin - targetTotalMin;
      if (diff > 0) {
        targetTimeInfo += `\n- Projected finish at current pace: ~${projectedMin} min ${projectedSec}s (${diff} min over target)`;
      } else if (diff < 0) {
        targetTimeInfo += `\n- Projected finish at current pace: ~${projectedMin} min ${projectedSec}s (${Math.abs(diff)} min under target)`;
      } else {
        targetTimeInfo += `\n- Projected finish at current pace: ~${projectedMin} min ${projectedSec}s (on target)`;
      }
    }
  }

  // Build the no-terrain rule when there's no route
  // hasRoute is set true by the app when GPS altitude data is being tracked (not just for nav routes).
  // Only suppress terrain when there is genuinely no elevation data at all.
  const _hasGradeData = currentGrade !== undefined && Math.abs(currentGrade ?? 0) > 0.5;
  const noTerrainRule = (hasRoute || _hasGradeData) ? '' : `
CRITICAL: No GPS elevation data for this ${isWalkActivity ? 'walk' : 'run'}. Do NOT mention hills, terrain, elevation, climbing, descending, or any terrain — you have no information about it. Focus only on pace, effort, form, and motivation.`;

  // NAVIGATION TURN: Short, punchy direction delivered in coach's voice
  if (triggerType === 'navigation_turn' && navigationInstruction) {
    const distContext = navigationDistance && navigationDistance > 0
      ? `The next turn is in approximately ${navigationDistance} metres. `
      : '';
    
    const { system: navSystemMsg, user: navPrompt } = (isWalkActivity ? walkPrompts : runPrompts).navigationTurnPrompt({
      coachName, coachTone, coachAccent, distContext, distance, currentPace,
      navigationInstruction, runnerProfile: params.runnerProfile,
    });

    const navCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: navSystemMsg },
        { role: "user", content: navPrompt }
      ],
      max_tokens: 40,
      temperature: 0.6,
    });

    return navCompletion.choices[0].message.content || navigationInstruction;
  }

  // PACE COACHING: Smart pace guidance based on deviation from target
  if (triggerType === 'pace_coaching' || triggerType === 'pace_abandon') {
    const paceDeviationPercent = (params as any).paceDeviationPercent ?? 0;
    const rollingPaceDeviationPercent = (params as any).rollingPaceDeviationPercent ?? 0;
    const projectedFinishSeconds = (params as any).projectedFinishSeconds ?? 0;
    const currentAvgPaceSecondsPerKm = (params as any).currentAvgPaceSecondsPerKm ?? 0;
    const rollingPaceSecondsPerKm = (params as any).rollingPaceSecondsPerKm ?? 0;
    const progressPercent = (params as any).progressPercent ?? 0;
    
    const avgPaceFormatted = formatSecondsAsPace(currentAvgPaceSecondsPerKm);
    const rollingPaceFormatted = formatSecondsAsPace(rollingPaceSecondsPerKm);
    const targetPaceFormatted = targetPace || 'unknown';
    const projectedFinishMin = Math.floor(projectedFinishSeconds / 60);
    const projectedFinishSec = Math.round(projectedFinishSeconds % 60);
    const targetTimeMin = targetTime ? Math.floor(targetTime / 60) : 0;
    const targetTimeSec = targetTime ? Math.round(targetTime % 60) : 0;
    
    // Determine pace zone for the prompt
    const pacePerson = isWalkActivity ? 'walker' : 'runner';
    let paceZone = '';
    let paceGuidance = '';
    if (triggerType === 'pace_abandon') {
      paceZone = 'TARGET ABANDONED';
      paceGuidance = `The ${pacePerson}'s target pace is now unreachable — they are consistently ${Math.abs(paceDeviationPercent).toFixed(0)}% slower than needed. 
DO NOT nag about the missed target. Instead: acknowledge the effort, suggest they focus on maintaining their CURRENT effort level, and motivate them to finish strong. 
This should feel supportive, not disappointing. "The target time isn't in the cards today, but you're still putting in great work" kind of energy.`;
    } else if (paceDeviationPercent < -15) {
      paceZone = 'WAY TOO FAST';
      paceGuidance = `The ${pacePerson} is going ${Math.abs(paceDeviationPercent).toFixed(0)}% FASTER than their target pace. This is a common mistake — going out too fast leads to fatigue later.
STRONGLY advise them to slow down NOW. Be direct but not alarming. Explain that going out too fast almost always backfires. 
Their current pace is ${avgPaceFormatted}/km but they need ${targetPaceFormatted}/km. Suggest they ease off and settle into rhythm.`;
    } else if (paceDeviationPercent < -10) {
      paceZone = 'TOO FAST';
      paceGuidance = `The ${pacePerson} is ${Math.abs(paceDeviationPercent).toFixed(0)}% faster than target pace. They should ease off slightly to avoid burning out.
Gently suggest pulling back a touch. Their body will thank them in the second half. Current: ${avgPaceFormatted}/km, target: ${targetPaceFormatted}/km.`;
    } else if (paceDeviationPercent > 15) {
      paceZone = 'WELL BEHIND TARGET';
      paceGuidance = `The ${pacePerson} is ${paceDeviationPercent.toFixed(0)}% slower than target. Their projected finish is ${projectedFinishMin}:${projectedFinishSec.toString().padStart(2, '0')} vs target ${targetTimeMin}:${targetTimeSec.toString().padStart(2, '0')}.
Encourage them to pick it up if they can, but be realistic. If there's a gradient/hill, acknowledge that hills slow pace naturally.`;
    } else if (paceDeviationPercent > 10) {
      paceZone = 'SLIGHTLY BEHIND';
      paceGuidance = `The ${pacePerson} is ${paceDeviationPercent.toFixed(0)}% behind target pace. They need to pick it up a little. 
Projected finish: ${projectedFinishMin}:${projectedFinishSec.toString().padStart(2, '0')} vs target ${targetTimeMin}:${targetTimeSec.toString().padStart(2, '0')}. Gentle nudge to increase effort.`;
    } else {
      paceZone = 'ON PACE';
      paceGuidance = `The ${pacePerson} is RIGHT ON TARGET (within ${Math.abs(paceDeviationPercent).toFixed(0)}% of target pace). 
Reinforce the good pacing with positive encouragement. Current: ${avgPaceFormatted}/km, target: ${targetPaceFormatted}/km. Tell them they're nailing it!`;
    }
    
    // Gradient context — CRITICAL: Ensure LLM understands downhill physics
    let gradientContext = '';
    if (typeof currentGrade === 'number' && currentGrade !== null && Math.abs(currentGrade) > 2) {
      gradientContext = currentGrade > 0 
        ? `TERRAIN: ${isWalkActivity ? 'Walker' : 'Runner'} is climbing (${currentGrade.toFixed(1)}% grade). Slower pace on climbs is NORMAL and EXPECTED. Acknowledge the effort required but don't criticise the pace.`
        : `TERRAIN: ${isWalkActivity ? 'Walker' : 'Runner'} is descending (${Math.abs(currentGrade).toFixed(1)}% grade). Downhill SPEEDS UP pace naturally — this is biomechanically easier. DO NOT say descents "slow you down" or "make things harder". If pace is faster downhill, that's expected physics, not a red flag.`;
    }
    
    // Rolling vs average trend
    let trendContext = '';
    if (Math.abs(rollingPaceDeviationPercent - paceDeviationPercent) > 5) {
      if (rollingPaceDeviationPercent < paceDeviationPercent) {
        trendContext = `Good trend: Their recent pace (${rollingPaceFormatted}/km) is faster than their overall average — they're picking it up.`;
      } else {
        trendContext = `Concerning trend: Their recent pace (${rollingPaceFormatted}/km) is slowing compared to their overall average — they may be fading.`;
      }
    }

    // Plateau detection: if the walker/runner has been behind target for multiple consecutive cues,
    // shift coaching tone to acceptance+effort rather than nagging about the unachievable target
    const consecutiveBehindCues = (params as any).consecutiveBehindCues ?? 0;
    let plateauContext = '';
    if (consecutiveBehindCues >= 3 && paceDeviationPercent > 10) {
      plateauContext = `PLATEAU DETECTED: The ${pacePerson} has received ${consecutiveBehindCues} consecutive cues that they're behind target without improving. 
STOP nagging about the target. Switch to: acknowledge the effort they ARE putting in, encourage them to maintain their current effort level, and give them a different focus (${isWalkActivity ? 'form or mental game' : 'cadence, form, or mental game'}). Be supportive and forward-looking.`;
    }

    // Cadence coaching for pace section — suppressed for walk sessions
    let paceCadenceNote = '';
    if (!isWalkActivity && cadence && cadence > 0) {
      const paceSecPerKmPace = (() => {
        const avgPaceStr = formatSecondsAsPace(currentAvgPaceSecondsPerKm);
        const parts = avgPaceStr.split(':').map(Number);
        return parts.length === 2 ? parts[0] * 60 + parts[1] : 360;
      })();
      const paceCadRange = calculateOptimalCadenceRange(
        paceSecPerKmPace,
        (params as any).runnerHeight ?? 170,
        (params as any).runnerAge ?? undefined,
        cadence
      );
      if (paceCadRange.isLow) {
        paceCadenceNote = `⚠️ Cadence ${cadence} spm is ${paceCadRange.deficit} spm below this runner's personal target of ${paceCadRange.optimal} spm (for their height at this pace) — quick feet improve pace. Mention it.`;
      } else if (cadence && cadence > 0) {
        paceCadenceNote = `Cadence: ${cadence} spm (personal target ~${paceCadRange.optimal} spm — ${paceCadRange.isLow ? 'low' : 'on track'}).`;
      }
    }

    // Declare runnerFirstName early so it can be used in prompt templates
    const runnerFirstName = runnerName ? runnerName.split(' ')[0] : null;

    const pacePromptModule = isWalkActivity ? walkPrompts : runPrompts;
    const { system: paceSystemMsg, user: pacePrompt } = pacePromptModule.paceCoachingPrompt({
      coachName, coachTone, coachAccent, progressPercent,
      targetDistanceFormatted: targetDistance ? formatDistanceForTTS(targetDistance) : undefined,
      distanceFormatted: formatDistanceForTTS(distance),
      avgPaceFormatted, targetPaceFormatted, rollingPaceFormatted,
      gradientContext, trendContext, plateauContext, paceGuidance,
      heartRate, paceCadenceNote, runnerFirstName, runnerProfile: params.runnerProfile,
    });

    const paceCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: paceSystemMsg },
        { role: "user", content: pacePrompt }
      ],
      max_tokens: 120,
      temperature: 0.7,
    });

    let paceMessage = paceCompletion.choices[0].message.content || pacePromptModule.paceCoachingFallback(avgPaceFormatted, targetPaceFormatted);

    // ── Safety check: Correct any backwards descent messaging ──────────────────
    // If the runner is descending and the LLM somehow generated the wrong physics,
    // catch and fix it. This is a final safety net for edge cases.
    if (typeof currentGrade === 'number' && currentGrade < -2) {
      // Runner is descending — downhill SPEEDS UP pace, not slows it
      const backwardsPatterns = [
        /descend.*slow.*down/gi,
        /downhill.*slow.*down/gi,
        /going.*down.*harder/gi,
        /descent.*makes.*harder/gi
      ];
      for (const pattern of backwardsPatterns) {
        if (pattern.test(paceMessage)) {
          console.warn(`[TERRAIN FIX] Corrected backwards descent coaching: "${paceMessage.substring(0, 60)}..."`);
          paceMessage = paceMessage
            .replace(/descend.*slow.*down/gi, `downhill naturally speeds you up`)
            .replace(/downhill.*slow.*down/gi, `downhill helps you go faster`)
            .replace(/going.*down.*harder/gi, `downhill makes ${isWalkActivity ? 'walking' : 'running'} easier`)
            .replace(/descent.*makes.*harder/gi, `descent uses gravity to your advantage`);
        }
      }
    }
    
    return paceMessage;
  }

  // ── Runner profile context ─────────────────────────────────────────────────
  // Pure factual context about WHO this runner is. No tone directives here —
  // toneDirective(coachTone) and runnerProfileBlock(runnerProfile) own all of
  // that. The AI derives HOW to communicate from those signals; we just supply
  // the FACTS it needs to personalise the content intelligently.
  const runnerFirstName = runnerName ? runnerName.split(' ')[0] : null;
  const totalRunsAllTime = (params as any).totalRunsAllTime as number | undefined | null;

  let runnerProfileContext = '';

  // Name
  if (runnerFirstName) {
    runnerProfileContext += `\n${isWalkActivity ? 'Walker' : 'Runner'}'s name: ${runnerFirstName}. Use naturally and occasionally — not every sentence.`;
  }

  // Fitness level — known or inferred from run history
  // IMPORTANT: when fitness level is not set, we NEVER know this person's capacity.
  // Even someone with 50 sessions may have been going slowly — we cannot assume capability.
  // Always err toward encouragement when fitness level is absent.
  if (fitnessLevel) {
    runnerProfileContext += `\nFitness level: ${fitnessLevel}.`;
  } else if (totalRunsAllTime === 0 || totalRunsAllTime === null || totalRunsAllTime === undefined) {
    runnerProfileContext += `\nFitness level: unknown — this is their first recorded ${isWalkActivity ? 'walk' : 'run'}. Target pace (if set) is aspirational; treat pace gaps as context, not a performance benchmark.`;
  } else if (typeof totalRunsAllTime === 'number' && totalRunsAllTime <= 5) {
    runnerProfileContext += `\nFitness level: unknown — only ${totalRunsAllTime} ${isWalkActivity ? 'walk' : 'run'}(s) completed so far. Still establishing baseline fitness. Pace targets should be treated as directional goals.`;
  } else if (typeof totalRunsAllTime === 'number' && totalRunsAllTime <= 15) {
    runnerProfileContext += `\nFitness level: unknown — ${totalRunsAllTime} ${isWalkActivity ? 'walks' : 'runs'} completed but capacity not yet confirmed by profile data.`;
  } else if (typeof totalRunsAllTime === 'number') {
    // 16+ sessions and still no fitness level — notable gap in profile data
    runnerProfileContext += `\nFitness level: not set (${totalRunsAllTime} ${isWalkActivity ? 'walks' : 'runs'} recorded). Aerobic capacity is unconfirmed by profile data.`;
  }

  // ── Age & Physical calibration block ────────────────────────────────────
  // Age and BMI are not just data points — they shape HOW this runner should be coached:
  // communication style, effort interpretation, what counts as an achievement, and how
  // directly to address pace gaps. Derived from data; no tone override — the AI applies
  // these calibrations within the chosen toneDirective.

  if (runnerAge) {
    let ageNote = `\n${isWalkActivity ? 'Walker' : 'Runner'}'s age: ${runnerAge}.`;

    if (runnerAge < 20) {
      ageNote += ` Young ${pLabel} — high aerobic capacity and recovery potential. Can sustain intense training.`;
    } else if (runnerAge <= 35) {
      ageNote += ` Prime athletic years (26–35) — typically peak aerobic capacity and recovery.`;
    } else if (runnerAge <= 50) {
      ageNote += ` Active adult ${pLabel} (36–50). Recovery is slower than younger years. Training commitment alongside life responsibilities is notable.`;
    } else if (runnerAge <= 65) {
      ageNote += ` Mature ${pLabel} (50s–60s). Aerobic capacity and pace ceilings are physiologically different to younger people. Effort and consistency typically define performance more than raw speed.`;
    } else {
      ageNote += ` Senior ${pLabel} (65+). ${isWalkActivity ? 'Walking' : 'Running'} at this age represents sustained cardiovascular commitment. Physiological pace ceilings are significantly lower than younger age groups.`;
    }

    runnerProfileContext += ageNote;
  } else {
    // No date of birth — age is unknown. Could be a teenager or a 70-year-old.
    // When age is unknown, never apply directness or performance pressure based on assumed youth.
    // Default to a warm, accessible coaching posture — if they turn out to be young and fit,
    // the coaching will feel generous; if they're older, we haven't caused harm.
    runnerProfileContext += `\n${isWalkActivity ? 'Walker' : 'Runner'}'s age: not provided. Without knowing their age, assume a conservative coaching posture — be warm and encouraging rather than direct or demanding. Avoid any language that implies they "should" be hitting a certain pace for their age.`;
  }

  // BMI — affects cardiovascular load per km and how pace targets should be interpreted
  if (runnerWeight && runnerHeight) {
    const heightM = runnerHeight / 100;
    const bmi = runnerWeight / (heightM * heightM);

    let bmiNote = `\nPhysical build: BMI ${bmi.toFixed(1)}.`;


    if (bmi < 18.5) {
      bmiNote += ` Lean build (BMI ${bmi.toFixed(1)}) — aerobic efficiency is typically high.`;
    } else if (bmi < 25) {
      bmiNote += ` Standard athletic build (BMI ${bmi.toFixed(1)}) — typical aerobic capacity and effort profiles.`;
    } else if (bmi < 30) {
      bmiNote += ` Above-average body mass (BMI ${bmi.toFixed(1)}) — cardiovascular demand per km is measurably higher than standard pace tables assume.`;
    } else if (bmi < 35) {
      bmiNote += ` High body mass (BMI ${bmi.toFixed(1)}) — cardiovascular load per km is substantially elevated. Standard pace targets are not directly applicable to this ${pLabel}'s physical capacity.`;
    } else {
      bmiNote += ` Very high body mass (BMI ${bmi.toFixed(1)}) — each kilometre represents significant cardiovascular effort. Pace metrics alone do not reflect the physical work being done.`;
    }

    // Combined age + BMI context: provides GPT with information to calibrate coaching appropriately
    if (runnerAge && runnerAge >= 50 && bmi >= 28) {
      bmiNote += ` Note: This ${pLabel} is 50+ years old with above-average body mass, meaning physiological effort is elevated and recovery needs are higher.`;
    }

    runnerProfileContext += bmiNote;
  } else {
    // No weight or height — physical capacity is completely unknown.
    // Without BMI data we cannot know if a "slow" pace represents easy effort or maximum exertion.
    // Never use pace numbers to imply the runner is underperforming — we have no reference point
    // for what effort looks like for this person's body.
    runnerProfileContext += `\nPhysical build: not provided. Cannot assess effort-to-pace ratio without body composition data. Do not assume standard effort-to-pace ratios — any pace may represent significant effort for this individual. Be encouraging and non-judgemental about pace.`;
  }

  // Accent-aware phrasing — makes the TEXT sound natural for the chosen accent
  const normalizedAccent = (coachAccent || '').trim().toLowerCase();
  switch (normalizedAccent) {
    case 'british':
      runnerProfileContext += '\nWrite with natural British English phrasing — use english slang and words like, but not limited to "brilliant", "well done", "cracking pace", "spot on". Avoid Americanisms and use kilometers for distance.';
      break;
    case 'irish':
      runnerProfileContext += '\nWrite with natural Irish English phrasing — use irish slang and words like, but not limited to "grand", "mighty", "fair play", "dead on". and use kilometers for distance.';
      break;
    case 'scottish':
      runnerProfileContext += '\nWrite with natural Scottish English phrasing — use scottish slang and words like, but not limited to "brilliant", "well done", "cracking", "braw". Direct and warm, and use kilometers for distance.';
      break;
    case 'australian':
      runnerProfileContext += '\nWrite with natural Australian English phrasing — use Australian slang and words like, but not limited to "legend", "ripper", "no worries", "you beauty". Relaxed and confident, and use kilometers for distance.';
      break;
    case 'new zealand':
    case 'newzealand':
    case 'nz':
      runnerProfileContext += '\nWrite with natural New Zealand English phrasing — use New Zealand slang and words like, but not limited to "sweet as", "good on ya", "choice", "chur". Understated, genuine warmth — not over the top. Kiwi style, and use kilometers for distance.';
      break;
    case 'american':
      runnerProfileContext += '\nWrite with natural American English phrasing — use American slang and words like, but not limited to "awesome", "great job", "crushing it", "miles" if user prefers or "kilometres". High energy and direct, and use kilometers for distance.';
      break;
    case 'south african':
      runnerProfileContext += '\nWrite with natural South African English phrasing — use South African slang and words like, but not limited to "lekker", "shame" (sympathetic), "howzit", "ja", "kilometres". Resilient, warm energy — like someone who runs ultra-marathons for fun, and use kilometers for distance.';
      break;
    case 'canadian':
      runnerProfileContext += '\nWrite with natural Canadian English phrasing — use Canadian slang and words like, but not limited to "eh", "for sure", "beauty", "no doubt", "kilometres". Friendly, humble, and genuinely encouraging. Never boastful, and use kilometers for distance.';
      break;
    case 'welsh':
      runnerProfileContext += '\nWrite with natural Welsh English phrasing — use Welsh slang and words like, but not limited to "lovely", "tidy", "fair play", "cracking on", "kilometres". Passionate and heartfelt with musical warmth, and use kilometers for distance.';
      break;
    case 'caribbean':
      runnerProfileContext += '\nWrite with natural Caribbean English phrasing — use "wicked", "big up yourself", "nuff respect", "easy now", "kilometres". Rhythmic, confident, uplifting energy. Island warmth, and use kilometers for distance.';
      break;
    case 'scandinavian':
      runnerProfileContext += '\nWrite with natural Scandinavian-influenced English — use Scandinavian slang and words like, but not limited to "very nice", "good job", "exactly", "perfect", "kilometres". Clean, precise, understated positivity. Hygge energy — calm confidence, and use kilometers for distance.';
      break;
  }

  // Detect "run start" scenario: phase is EARLY/warmUp and distance is near zero

  // Training plan context — adds plan-awareness to phase coaching messages
  let planContext = '';
  const planGoalType = (params as any).planGoalType as string | undefined;
  const planWeekNumber = (params as any).planWeekNumber as number | undefined;
  const planTotalWeeks = (params as any).planTotalWeeks as number | undefined;
  const phaseWorkoutType = (params as any).workoutType as string | undefined;
  const phaseWorkoutDescription = (params as any).workoutDescription as string | undefined;
  const phaseTrainingPlanId = (params as any).trainingPlanId as string | undefined;
  if (phaseTrainingPlanId && planGoalType) {
    const goalLabel = planGoalType.replace(/_/g, ' ').toUpperCase();
    planContext = `\nCoaching Programme Context: This is a scheduled workout in the ${pLabel}'s AI coaching plan`;
    if (planWeekNumber && planTotalWeeks) {
      planContext += ` (Week ${planWeekNumber} of ${planTotalWeeks})`;
    }
    planContext += `, training for a ${goalLabel}`;
    if (phaseWorkoutType) planContext += `. Session type: ${phaseWorkoutType.replace(/_/g, ' ')}`;
    if (phaseWorkoutDescription) planContext += `. Today's goal: "${phaseWorkoutDescription}"`;
    planContext += '. Reference the plan when relevant — remind them how this session fits the bigger journey.';
  }

  const isRunStart = (phase === 'EARLY' || phase === 'warmUp') && distance < 0.05;

  // ── Fully-blank profile safety catch ─────────────────────────────────────
  // When ALL demographic fields are missing (no fitness level, no DOB, no weight/height),
  // we have zero knowledge of who this person is or what they're capable of.
  // Apply an explicit coaching posture directive: no directness, no pace pressure,
  // no performance expectations. This is the safest possible coaching state.
  const hasCompletelyUnknownProfile = !fitnessLevel && !runnerAge && (!runnerWeight || !runnerHeight);
  if (hasCompletelyUnknownProfile) {
    runnerProfileContext += `\n\nIMPORTANT — incomplete profile: This ${pLabel} has not provided fitness level, age, or body composition data. We know nothing about their physical capacity, background, or health status. Apply ZERO performance pressure. Use only encouragement, acknowledgement of effort, and gentle guidance. Never tell them to "push harder", "pick it up", or frame their pace as a problem. Treat every coaching message as if this might be their first ${isWalkActivity ? 'walk' : 'run'} ever.`;
  }

  // "No baseline" flag — true whenever fitness level is not set.
  // We have no confirmed capacity data regardless of how many runs exist —
  // a runner with 30 slow easy runs has very different capacity to one with 30 fast runs.
  // Without a fitness level, we ALWAYS default to encouragement over performance analysis.
  const hasNoBaseline = !fitnessLevel;

  // ── Target feasibility note ───────────────────────────────────────────────
  // For runners with no baseline, assess whether their pace target is realistic.
  // If it's in territory that requires significant training to achieve, flag it as
  // aspirational so the AI doesn't use it as a pass/fail standard in coaching.
  // Reference pace thresholds (beginner-friendly = ≥6:30/km, competitive = <5:00/km):
  let targetFeasibilityNote = '';
  if (hasNoBaseline && targetPace) {
    // targetPace arrives as "MM:SS" string — convert to seconds/km
    const [tMin, tSec] = targetPace.split(':').map(Number);
    if (!isNaN(tMin) && !isNaN(tSec)) {
      const targetSecPerKm = tMin * 60 + tSec;
      if (targetSecPerKm < 300) {
        // Sub 5:00/km — elite territory, almost certainly aspirational
        targetFeasibilityNote = `\nTarget pace note: Their target pace (${targetPace}/km) is elite-level performance. Without an established baseline, this is highly aspirational — treat it as a long-term goal, not a standard for today's ${isWalkActivity ? 'walk' : 'run'}. Do not frame the pace gap as underperformance.`;
      } else if (targetSecPerKm < 360) {
        // 5:00–6:00/km — strong competitive pace, unlikely for most beginners
        targetFeasibilityNote = `\nTarget pace note: Their target pace (${targetPace}/km) is competitive. Without an established fitness baseline, this is aspirational — today's ${isWalkActivity ? 'walk' : 'run'} is about building capacity, not hitting this pace. Treat the gap as normal and expected.`;
      } else if (targetSecPerKm < 420) {
        // 6:00–7:00/km — solid recreational pace, achievable but not guaranteed for a first-timer
        targetFeasibilityNote = `\nTarget pace note: Their target pace (${targetPace}/km) is a solid recreational pace. Without prior baseline data, this is directional rather than prescriptive — any gap is informational, not a verdict.`;
      }
      // 7:00/km+ for a new runner is reasonable — no extra note needed
    }
  }

  if (targetFeasibilityNote) {
    runnerProfileContext += targetFeasibilityNote;
  }

  // Build trigger-specific instruction
  const is500mCheckin = triggerType === '500m_checkin';

  let prompt: string;
  let systemMsg: string;
  const phaseModule = isWalkActivity ? walkPrompts : runPrompts;

  if (isRunStart) {
    // RUN START: Pure motivational message — no metrics (they haven't run yet!)
    ({ system: systemMsg, user: prompt } = phaseModule.runStartPrompt({
      coachName, coachTone, coachAccent,
      targetDistanceFormatted: targetDistance ? formatDistanceForTTS(targetDistance) : undefined,
      targetTimeFormatted: (targetTime && targetTime > 0) ? formatDurationForTTS(targetTime) : undefined,
      noTerrainRule, runnerProfileContext, planContext, runnerFirstName,
    }));
  } else {
    // DURING RUN: Include metrics
    // Tone, depth, and framing are entirely driven by toneDirective(coachTone),
    // runnerProfileBlock(runnerProfile), and runnerProfileContext (factual context).
    // No hardcoded behavior here — the AI calibrates from those signals.
    const triggerInstruction = is500mCheckin
      ? `This is the ${pLabel}'s first check-in at 500m. Give a brief initial read on how the ${isWalkActivity ? 'walk' : 'run'} is going (2-3 sentences), weaving in their actual pace and distance.`
      : `Give a brief (2-3 sentences) phase-appropriate coaching message.`;

    // Build cadence coaching instruction (actionable, not just informational)
    const cadenceInstruction = cadenceCoachingDirective
      ? `CADENCE COACHING: ${cadenceCoachingDirective}`
      : '';

    // Build elevation coaching context (fire even without a planned route if grade is significant)
    const elPerson = isWalkActivity ? 'Walker' : 'Runner';
    const elevationInstruction = (typeof currentGrade === 'number' && currentGrade !== null && Math.abs(currentGrade) > 4)
      ? (currentGrade > 0
          ? `ELEVATION: ${elPerson} is currently on an uphill (${currentGrade.toFixed(1)}% grade). Coach them to ${isWalkActivity ? 'lean slightly forward, shorten steps, and maintain rhythm' : 'shorten stride, drive knees, stay tall'} — slower pace on hills is normal and expected.`
          : `ELEVATION: ${elPerson} is currently descending (${Math.abs(currentGrade).toFixed(1)}% grade). Remind them to control their stride${isWalkActivity ? ' and keep good posture' : ', avoid braking hard'} — use the downhill to recover and let gravity help.`)
      : '';

    ({ system: systemMsg, user: prompt } = phaseModule.duringPhasePrompt({
      coachName, coachTone, coachAccent, is500mCheckin,
      phaseDescription: phaseDescriptions[phase],
      distanceFormatted: formatDistanceForCoaching(distance),
      targetDistanceSuffix: targetDistance ? ` of ${formatDistanceForCoaching(targetDistance)} target (${progress}%)` : '',
      timeFormatted,
      currentPaceLine: currentPace ? `- Current pace: ${spokenPhasePace}` : '',
      paceComparisonInfo, targetTimeInfo, hrInfo, cadenceInfo, terrainInfo,
      elevationInstruction, cadenceInstruction, noTerrainRule, runnerProfileContext, planContext,
      runnerFirstName, targetPace,
      targetTimeFormatted: (targetTime && targetTime > 0) ? formatDurationForTTS(targetTime) : undefined,
      hasTargetTime: !!(targetTime && targetTime > 0),
      hasNoBaseline, paceVerdict, hasRoute, cadenceCoachingDirective,
      runnerProfile: params.runnerProfile,
    }));
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: prompt }
    ],
    max_tokens: 130,
    temperature: 0.78,
  });

  return completion.choices[0].message.content || "You're doing great, keep it up!";
}

// Helper: calculate age-adjusted max heart rate (Tanaka formula is more accurate than 220-age)
function calcMaxHR(age?: number): number {
  if (age && age > 10 && age < 100) {
    return Math.round(208 - 0.7 * age); // Tanaka formula — more accurate than 220-age
  }
  return 190; // Fallback for unknown age
}

// Helper function to determine heart rate zone
function getHeartRateZone(hr: number, age?: number): string {
  const maxHR = calcMaxHR(age);
  const percentage = (hr / maxHR) * 100;

  if (percentage < 60) return 'Zone 1 (Recovery)';
  if (percentage < 70) return 'Zone 2 (Aerobic)';
  if (percentage < 80) return 'Zone 3 (Tempo)';
  if (percentage < 90) return 'Zone 4 (Threshold)';
  return 'Zone 5 (Maximum)';
}

/**
 * Generate interval-specific coaching for work and recovery phases
 */
export async function generateIntervalCoaching(params: {
  intervalNumber: number;
  isWorkPhase: boolean;
  distanceInPhaseKm: number;
  phaseDurationTargetKm: number;
  currentPace?: string;
  targetPace?: string;
  currentHeartRate?: number;
  targetHeartRateMin?: number;
  targetHeartRateMax?: number;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  coachGender?: string;
  fitnessLevel?: string;
  runnerName?: string;
  runnerProfile?: string | null;
  totalIntervals?: number;   // Total number of work intervals in this session
  // Training plan context
  workoutType?: string;
  workoutDescription?: string;
  planGoalType?: string;
  planWeekNumber?: number;
  planTotalWeeks?: number;
  activityType?: string;
}): Promise<string> {
  const {
    intervalNumber,
    isWorkPhase,
    distanceInPhaseKm,
    phaseDurationTargetKm,
    currentPace,
    targetPace,
    currentHeartRate,
    targetHeartRateMin,
    targetHeartRateMax,
    coachName,
    coachTone,
    fitnessLevel,
    runnerName
  } = params;

  const isWalkInterval = params.activityType === 'walk';
  const phaseProgress = Math.round((distanceInPhaseKm / phaseDurationTargetKm) * 100);
  const phaseName = isWorkPhase ? 'work interval' : (isWalkInterval ? 'recovery walk' : 'recovery jog');
  const phaseVerb = isWorkPhase ? 'push' : 'recover';
  const phaseEmphasis = isWorkPhase 
    ? 'This is your work interval — focus on the target pace and effort zone.'
    : 'This is your recovery interval — bring your heart rate down and get ready for the next effort.';

  // Build HR info if in work phase
  let hrContext = '';
  if (isWorkPhase && targetHeartRateMin && targetHeartRateMax) {
    hrContext = `Your target heart rate for this work interval is ${targetHeartRateMin}–${targetHeartRateMax} bpm.`;
    if (currentHeartRate) {
      if (currentHeartRate < targetHeartRateMin) {
        hrContext += ` You're currently ${currentHeartRate} bpm — below target. Pick up the effort.`;
      } else if (currentHeartRate > targetHeartRateMax) {
        hrContext += ` You're currently ${currentHeartRate} bpm — above target. Dial it back slightly to stay in zone.`;
      } else {
        hrContext += ` You're currently ${currentHeartRate} bpm — right in zone. Keep it steady!`;
      }
    }
  }

  // Build pace context
  let paceContext = '';
  if (currentPace && targetPace) {
    paceContext = `Target pace for this ${phaseName}: ${targetPace}/km. Current pace: ${currentPace}/km.`;
  }

  const planContextBlock = (() => {
    const pg = (params as any).planGoalType as string | undefined;
    const pw = (params as any).planWeekNumber as number | undefined;
    const pt = (params as any).planTotalWeeks as number | undefined;
    const wd = (params as any).workoutDescription as string | undefined;
    if (!pg) return '';
    let ctx = `\nCoaching plan: Training for ${pg.replace(/_/g, ' ').toUpperCase()}`;
    if (pw && pt) ctx += `, Week ${pw} of ${pt}`;
    if (wd) ctx += `. Session goal: "${wd}"`;
    return ctx;
  })();

  const { system: systemMsg, user: prompt } = (isWalkInterval ? walkPrompts : runPrompts).intervalCoachingPrompt({
    coachName, coachTone, coachAccent: params.coachAccent, intervalNumber, isWorkPhase,
    phaseProgress, phaseName, phaseEmphasis, paceContext, hrContext,
    totalIntervals: (params as any).totalIntervals, planContextBlock,
    runnerProfile: params.runnerProfile,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt }
      ],
      max_tokens: 80,
      temperature: 0.7,
    });

    return completion.choices[0].message.content || `${isWorkPhase ? 'Nail this interval!' : 'Recover and breathe.'}`;
  } catch (error) {
    console.error("Error generating interval coaching:", error);
    return isWorkPhase 
      ? `You're on rep ${intervalNumber} — push steady!`
      : `You're in recovery — bring your HR down.`;
  }
}

export async function generateStruggleCoaching(params: {
  distance: number;
  elapsedTime: number;
  currentPace: string;
  baselinePace: string;
  paceDropPercent: number;
  currentGrade?: number;
  totalElevationGain?: number;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  coachGender?: string;
  hasRoute?: boolean;
  // User profile
  fitnessLevel?: string;
  runnerName?: string;
  runnerAge?: number;
  // Historical context
  runHistory?: RunHistoryStats;
  // Coaching plan context
  targetHeartRateZone?: number; // 1-5; if Zone 1-2, struggle coaching is not relevant
  runnerProfile?: string | null;
  // Training plan session type — when set, reframes struggle coaching around training objective
  workoutType?: string;
  // Activity type — "run" or "walk" — determines coach vocabulary
  activityType?: string;
  sessionType?: string;
} & WatchDynamicsParams): Promise<string> {
  const { distance, elapsedTime, currentPace, baselinePace, paceDropPercent, currentGrade, totalElevationGain, coachName, coachTone, coachAccent, hasRoute, fitnessLevel, runnerName, runHistory, targetHeartRateZone } = params;
  const workoutTypeStruggle = (params as any).workoutType as string | undefined;
  const struggleActivityType = resolveActivityType(params);
  const isWalkStruggle = struggleActivityType === 'walk';
  const { person: sPersonLabel } = activityVocab(struggleActivityType);

  // For Zone 1-2 runs (aerobic/recovery focus), pace drops are intentional to build aerobic base
  if (targetHeartRateZone && targetHeartRateZone <= 2) {
    const aerobicContext = targetHeartRateZone === 2 
      ? `This aerobic work is building your base. Every Zone 2 session improves your capillary density and fat-burning efficiency. That's why elite runners spend 80% of their time at easy paces — you're conditioning your heart to sustain faster paces later.`
      : `You're in recovery mode. Let your body adapt. These easy sessions are where real fitness is built.`;
    
    return `${aerobicContext} Heart rate is the goal here, not pace. Slow down as needed to stay in Zone ${targetHeartRateZone} — that's exactly right.`;
  }
  
  const timeMin = Math.floor(elapsedTime / 60);
  
  // ONLY include terrain context when the runner has a planned route
  let terrainContext = '';
  if (hasRoute === true) {
    if (typeof currentGrade === 'number' && currentGrade !== null && currentGrade > 3) {
      terrainContext = `They're currently on a ${currentGrade.toFixed(1)}% uphill which may explain the slowdown. `;
    } else if (totalElevationGain && totalElevationGain > 50) {
      terrainContext = `They've climbed ${Math.round(totalElevationGain)}m so far, which is contributing to fatigue. `;
    }
  }

  // Build the no-terrain rule when there's no route
  // hasRoute is set true by the app when GPS altitude data is being tracked (not just for nav routes).
  // Only suppress terrain when there is genuinely no elevation data at all.
  const _hasGradeData = currentGrade !== undefined && Math.abs(currentGrade ?? 0) > 0.5;
  const noTerrainRule = (hasRoute || _hasGradeData) ? '' : `
CRITICAL: No GPS elevation data for this ${isWalkStruggle ? 'walk' : 'run'}. Do NOT mention hills, terrain, elevation, climbing, descending, or any terrain — you have no information about it. Focus only on pace, effort, form, and motivation.`;
  
  // currentPace/baselinePace are required by the type signature; formatPaceForTTS is
  // null-safe so a missing value won't crash, but it silently degrades to "unknown pace" —
  // log it so a casing mismatch is visible instead of just quietly worse coaching copy.
  if (!currentPace || !baselinePace) {
    console.warn(`[generateStruggleCoaching] currentPace or baselinePace missing from request body — check client field casing`);
  }
  const spokenCurrentPaceStruggle = formatPaceForTTS(currentPace);
  const spokenBaselinePace = formatPaceForTTS(baselinePace);

  // Build walker/runner profile + history context for struggle coaching
  const runnerFirstNameStruggle = runnerName ? runnerName.split(' ')[0] : null;
  let struggleRunnerContext = '';
  if (runnerFirstNameStruggle) struggleRunnerContext += `${isWalkStruggle ? 'Walker' : 'Runner'}: ${runnerFirstNameStruggle}. `;
  if (fitnessLevel) struggleRunnerContext += `Fitness level: ${fitnessLevel}. `;
  if (runHistory) {
    // Specifically flag if this pace drop is normal for them or unusual
    if (runHistory.avgPaceDropPercent !== undefined) {
      const dropDiff = paceDropPercent - runHistory.avgPaceDropPercent;
      if (dropDiff > 5) {
        struggleRunnerContext += `This pace drop (${Math.round(paceDropPercent)}%) is larger than their typical drop (${Math.round(runHistory.avgPaceDropPercent)}%) — they're struggling more than usual. `;
      } else {
        struggleRunnerContext += `Pace drops of this size are normal for this ${sPersonLabel} (avg ${Math.round(runHistory.avgPaceDropPercent)}%). `;
      }
    }
    if (runHistory.avgDistanceKm) {
      const distDiff = distance - runHistory.avgDistanceKm;
      if (distDiff > 0.5) struggleRunnerContext += `They're already further than their recent average of ${formatDistanceForCoaching(runHistory.avgDistanceKm)} — this is new territory. `;
    }
    if (runHistory.consistencyTrend === 'improving') {
      struggleRunnerContext += `Their recent ${isWalkStruggle ? 'walks' : 'runs'} show an improving trend — they have the fitness to push through. `;
    } else if (runHistory.consistencyTrend === 'declining') {
      struggleRunnerContext += `They've been having tougher ${isWalkStruggle ? 'walks' : 'runs'} recently — be supportive and suggest adjusting effort. `;
    }
  }

  // Training session reframe — when this is a coaching plan workout, give context-aware
  // messaging that references the training goal rather than implying race-day failure
  const trainingStruggleContext = workoutTypeStruggle
    ? `\nTraining Session Context: This is a SCHEDULED TRAINING SESSION (${workoutTypeStruggle.replace(/_/g, ' ')} workout) — NOT a race. A pace drop here may be normal training fatigue. Frame your message around the training purpose: acknowledge the effort but remind them what this session is building. Do NOT imply they are failing a race or time goal.`
    : '';

  const struggleCtx: StruggleCoachingPromptContext = {
    coachName, coachTone, coachAccent, distance, paceDropPercent,
    spokenCurrentPace: spokenCurrentPaceStruggle, spokenBaselinePace, timeMin,
    terrainContext, trainingStruggleContext, noTerrainRule,
    runnerContext: struggleRunnerContext, runnerProfile: params.runnerProfile,
    watchDynamicsContext: buildWatchDynamicsText(params),
  };
  const struggleModule = isWalkStruggle ? walkPrompts : runPrompts;
  const { system, user } = struggleModule.struggleCoachingPrompt(struggleCtx);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: 100,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || struggleModule.STRUGGLE_FALLBACK_MESSAGE;
}

// Cadence/Stride Coaching - analyzes overstriding/understriding
type StrideZone = 'OVERSTRIDING' | 'UNDERSTRIDING' | 'OPTIMAL';

/**
 * Calculate optimal cadence range based on pace + user profile
 * Pace is the primary driver, but user height/fitness affects efficiency
 * 
 * Taller runners naturally have longer strides → slightly lower cadence at same pace
 * Shorter runners have shorter strides → slightly higher cadence at same pace
 * More fit runners have better economy → can sustain higher cadence
 * 
 * Formula: base cadence (from pace) ± adjustments (height, fitness level)
 */
/**
 * Legacy wrapper — delegates to the biomechanics-based calculateOptimalCadenceRange.
 * Kept for backward compat with any callers that use the old string-pace interface.
 */
function getOptimalCadenceForPace(
  paceMinPerKm: string,
  paceMaxPerKm?: string,
  userHeight?: number,   // in cm
  userAge?: number,
  fitnessLevel?: string  // unused — biomechanics model doesn't need fitness level
): { min: number; max: number } {
  const parts = paceMinPerKm.split(':').map(Number);
  const paceSecPerKm = parts.length === 2 ? parts[0] * 60 + parts[1] : 360;
  const range = calculateOptimalCadenceRange(paceSecPerKm, userHeight ?? 170, userAge);
  return { min: range.low, max: range.high };
}

export async function generateCadenceCoaching(params: {
  cadence: number;
  strideLength?: number;
  strideZone?: StrideZone;
  cadenceProximityTier?: 'ON_TARGET' | 'CLOSE' | 'NEEDS_WORK';
  cadenceDeviationPercent?: number;
  currentPace: string;
  speed: number;
  distance: number;
  elapsedTime: number;
  heartRate?: number;
  userHeight?: number;
  userWeight?: number;
  userAge?: number;
  optimalCadenceTarget?: number;
  optimalCadenceMin: number;
  optimalCadenceMax: number;
  optimalStrideLengthMin?: number;
  optimalStrideLengthMax?: number;
  coachName?: string;
  coachTone?: string;
  coachAccent?: string;
  runnerProfile?: string | null;
  // "run" | "walk" — controls whether spm coaching or walking rhythm coaching is delivered
  activityType?: string;
  // Cross-platform cadence role fields (WALKING_COACHING_SPEC parity with iOS)
  // exercise_type: "RUNNING" | "WALKING"
  // cadence_role: "primary_metric" | "context_only"
  exercise_type?: string;
  cadence_role?: string;
}): Promise<string> {
  const { cadence, strideLength, strideZone, currentPace, speed, distance, elapsedTime,
    heartRate, userHeight, userWeight, userAge,
    optimalCadenceMin, optimalCadenceMax, optimalStrideLengthMin, optimalStrideLengthMax,
    coachName = 'Coach', coachTone = 'energetic' } = params;

  // ── WALK SESSION: walking rhythm coaching replaces spm coaching ─────────────
  // Triggered by any of three equivalent signals (Android, iOS, or direct API):
  //   activityType === 'walk'          (Android naming)
  //   exercise_type === 'WALKING'      (iOS WALKING_COACHING_SPEC naming)
  //   cadence_role === 'context_only'  (iOS/spec canonical flag)
  //
  // When walk mode is active, cadence is background context only — the coach never
  // quotes spm targets. Walking rhythm, posture, arm drive, and HR effort are used instead.
  const isWalkMode = params.activityType === 'walk'
    || params.exercise_type === 'WALKING'
    || params.cadence_role === 'context_only';

  if (isWalkMode) {
    const { system: walkSystemMsg, user: walkPrompt } = walkPrompts.walkCadenceCoachingPrompt({
      coachName, coachTone, coachAccent: (params as any).coachAccent,
      distanceFormatted: formatDistanceForCoaching(distance),
      timeFormatted: formatElapsedForTTS(elapsedTime),
      currentPaceFormatted: formatPaceForTTS(currentPace),
      heartRate, cadence,
    });

    const walkCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: walkSystemMsg },
        { role: "user", content: walkPrompt }
      ],
      max_tokens: 120,
      temperature: 0.8,
    });
    return walkCompletion.choices[0].message.content || walkPrompts.WALK_CADENCE_FALLBACK;
  }

  // Personalised cadence range from biomechanics model (pace + height + age)
  // The values sent from the device (optimalCadenceMin/Max) are also biomechanics-based,
  // but we recalculate here too so the backend's own context is always personalized.
  const paceSecPerKm = (() => {
    if (!currentPace) {
      console.warn(`[generateCadenceCoaching] currentPace missing from request body — check client field casing (expected "currentPace")`);
      return 360; // default to 6:00/km if unknown
    }
    const parts = currentPace.split(':').map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : 360;
  })();
  const heightCmForCalc = userHeight
    ? (userHeight > 3 ? userHeight : userHeight * 100)  // handle both cm and m input
    : 170;
  const cadenceRange = calculateOptimalCadenceRange(paceSecPerKm, heightCmForCalc, userAge, cadence);
  // Android calculates this range from the live watch/GPS speed and gradient that
  // caused the coaching trigger. Keep it authoritative so the server never
  // contradicts the UI with a competing, stale pace-derived target.
  const dynOptimalCadenceMin = optimalCadenceMin > 0 ? optimalCadenceMin : cadenceRange.low;
  const dynOptimalCadenceMax = optimalCadenceMax > 0 ? optimalCadenceMax : cadenceRange.high;
  const dynOptimalCadenceTarget = params.optimalCadenceTarget > 0
    ? params.optimalCadenceTarget
    : cadenceRange.optimal;
  const cadenceDeficit = Math.max(0, dynOptimalCadenceTarget - cadence);

  const strideCm = Math.round((strideLength ?? 0) * 100);
  const optMinCm = Math.round((optimalStrideLengthMin ?? 0) * 100);
  const optMaxCm = Math.round((optimalStrideLengthMax ?? 0) * 100);
  const timeFormatted = formatElapsedForTTS(elapsedTime);

  const heightCmDisplay = userHeight
    ? (userHeight > 3 ? Math.round(userHeight) : Math.round(userHeight * 100))
    : null;
  let physicalContext = '';
  if (heightCmDisplay) physicalContext += `Runner height: ${heightCmDisplay}cm. `;
  if (userWeight) physicalContext += `Weight: ${userWeight}kg. `;
  if (userAge) physicalContext += `Age: ${userAge}. `;
  physicalContext += `Personalised optimal cadence for this runner at this pace: ${dynOptimalCadenceTarget} spm (range ${dynOptimalCadenceMin}–${dynOptimalCadenceMax} spm). This is specific to their height, age, and current pace — not a generic target.`;
  
  // Tolerance buffer for cadence coaching: ±3% is normal variation (imperceptible to runner)
  // e.g. at 167 spm target: ±5 spm is within acceptable tolerance
  const cadenceTolerance = Math.max(3, Math.round(dynOptimalCadenceTarget * 0.03));
  const cadenceDiff = Math.abs(cadence - dynOptimalCadenceTarget);
  const isWithinTolerance = cadenceDiff <= cadenceTolerance;

  const isBelowPersonalRange = params.cadenceProximityTier != null
    ? params.cadenceProximityTier !== 'ON_TARGET'
    : cadence < dynOptimalCadenceMin;
  const isOnOrAbovePersonalRange = !isBelowPersonalRange;
  // Cadence coaching: provide raw data, let GPT assess whether cadence deserves coaching
  const cadenceExcessPercent = ((cadence - dynOptimalCadenceTarget) / dynOptimalCadenceTarget) * 100;
  const cadenceDataContext = `CADENCE DATA FOR THIS RUNNER:
|- Current cadence: ${cadence} spm
|- Personalised optimal range: ${dynOptimalCadenceMin}–${dynOptimalCadenceMax} spm (target: ${dynOptimalCadenceTarget} spm)
|- Deviation: ${isBelowPersonalRange ? `${Math.round(Math.abs(cadenceExcessPercent))}% BELOW target` : cadenceExcessPercent > 10 ? `${Math.round(cadenceExcessPercent)}% ABOVE target` : 'ON TARGET'}
|- Stride length: ${strideCm}cm (optimal range: ${optMinCm}–${optMaxCm}cm)
|- Current pace: ${formatPaceForTTS(currentPace)}
|- Runner height: ${heightCmDisplay ?? 170}cm, age: ${userAge ?? 'unknown'}
|- Biomechanics: ${strideZone === 'OVERSTRIDING' ? 'Overstriding detected' : strideZone === 'UNDERSTRIDING' ? 'Understriding detected' : 'Stride within normal range'}
${heartRate ? `|- Heart rate: ${heartRate} bpm` : ''}

Assess whether this runner's cadence is appropriate RIGHT NOW. Consider their biomechanics, pace, and HR. If cadence coaching is warranted, deliver it. If something else matters more, coach that instead. Full autonomy — you're the coach.`;
  
  // ── CADENCE COACHING TEMPLATE ROUTER ─────────────────────────────────────────
  // Biomechanics terminology (important — easy to confuse):
  //   OVERSTRIDING   = cadence TOO LOW  → stride too long, foot lands ahead of CoM,
  //                    heel-striking, braking force on each step. Fix: shorten stride.
  //   UNDERSTRIDING  = cadence TOO HIGH → stride too short, shuffling / micro-stepping,
  //   (spinning)       reduced propulsion per step. Less common, often a fatigue sign.
  //   ON TARGET      = within personalised optimal range → efficient biomechanics.
  //
  // Android sends cadenceProximityTier ("ON_TARGET" | "CLOSE" | "NEEDS_WORK") based on
  // the live biomechanics model (speed + height + grade). We use isBelowPersonalRange
  // (derived from that tier) to route to the correct coaching template.
  // ─────────────────────────────────────────────────────────────────────────────
  let zoneAnalysis = cadenceDataContext;
  if (isBelowPersonalRange && !isWithinTolerance) {
    // Cadence too LOW → classic overstriding: long strides, foot ahead of CoM.
    zoneAnalysis = `OVERSTRIDING DETECTED: Cadence ${cadence} spm is ${cadenceDeficit} spm below their personalised target of ${dynOptimalCadenceTarget} spm (range ${dynOptimalCadenceMin}–${dynOptimalCadenceMax} spm) — calculated for their height (${heightCmDisplay ?? 170}cm) at ${formatPaceForTTS(currentPace)}. NOT a generic 180 spm rule.

With a low cadence, each stride is longer than efficient — the foot tends to land ahead of the centre of mass, creating a braking force and increasing impact stress on the knee and shin.

The correction: shorten the stride, increase turnover, shift foot strike closer to beneath the hips.

Use your coaching expertise to choose the 1-2 most effective, actionable cues for this moment — arm drive, mental metronome/rhythm, quicker and lighter foot turnover, or foot placement are all valid angles. Pick what will land best for this runner, and phrase it in your own original words rather than a stock cue.`;
  } else if (cadenceExcessPercent > 10) {
    // Cadence significantly TOO HIGH → understriding / spinning: short shuffling steps.
    // Each step generates less propulsion; can signal fatigue or an overcorrected form.
    zoneAnalysis = `HIGH CADENCE / UNDERSTRIDING: Cadence ${cadence} spm is ${Math.round(cadenceExcessPercent)}% above their personalised target of ${dynOptimalCadenceTarget} spm (range ${dynOptimalCadenceMin}–${dynOptimalCadenceMax} spm) for this pace (${formatPaceForTTS(currentPace)}).

A cadence significantly above the biomechanics target suggests the runner is taking too many short, shuffling steps — each generating less forward propulsion. This reduces running economy and often signals fatigue or an overcorrected "spinning" gait.

Personalised context: Height ${heightCmDisplay ?? 170}cm, age ${userAge ?? 'unknown'}. This is their specific efficient range at this pace — not a generic goal.

Coach them to lengthen their stride slightly and drive more powerfully off each step, without overextending.`;
  } else {
    // Cadence is ON TARGET or only slightly above → efficient biomechanics. Celebrate it
    // or coach something more useful than cadence (it doesn't need fixing right now).
    zoneAnalysis = `CADENCE ON TARGET: ${cadence} spm is within their personalised optimal range of ${dynOptimalCadenceMin}–${dynOptimalCadenceMax} spm (target ${dynOptimalCadenceTarget} spm), calculated for their height (${heightCmDisplay ?? 170}cm) at this pace (${formatPaceForTTS(currentPace)}).

Their cadence is efficient right now. You may briefly acknowledge it, then pivot to a different coaching cue that adds more value — breathing, posture, arm drive, pacing, mental focus — whatever you judge will most benefit this runner at this moment.`;
  }
  
  const { system: cadenceSystemMsg, user: prompt } = runPrompts.cadenceCoachingPrompt({
    coachName, coachTone, coachAccent: (params as any).coachAccent, zoneAnalysis, cadence,
    dynOptimalCadenceTarget, dynOptimalCadenceMin, dynOptimalCadenceMax,
    strideCm, optMinCm, optMaxCm,
    currentPaceFormatted: formatPaceForTTS(currentPace),
    distanceFormatted: formatDistanceForCoaching(distance),
    timeFormatted, heartRate, physicalContext, runnerProfile: params.runnerProfile,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: cadenceSystemMsg },
      { role: "user", content: prompt }
    ],
    max_tokens: 200,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || `Your cadence is ${cadence} steps per minute — your target is ${dynOptimalCadenceTarget} spm. ${isBelowPersonalRange ? `You are ${cadenceDeficit} steps per minute below your target. Try a quicker arm swing to lift your turnover.` : 'Your turnover is on track, so keep that rhythm steady.'}`;
}

export async function generatePreRunSummary(routeData: any, weatherData: any): Promise<any> {
  const prompt = `Generate a pre-run coaching summary for this route:
Route:
- Distance: ${routeData.distance}km
- Elevation Gain: ${routeData.elevationGain || 0}m
- Difficulty: ${routeData.difficulty}
- Terrain: ${routeData.terrainType || 'mixed'}

Weather:
- Temperature: ${weatherData?.current?.temperature || 'N/A'}°C
- Conditions: ${weatherData?.current?.condition || 'N/A'}
- Wind: ${weatherData?.current?.windSpeed || 0} km/h

Provide response as JSON with: tips (array of 3-4 coaching tips), warnings (array of any concerns), suggestedPace (string), hydrationAdvice (string), warmupSuggestion (string)`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an expert running coach providing pre-run advice. Respond only with valid JSON." },
      { role: "user", content: prompt }
    ],
    max_tokens: 400,
    temperature: 0.7,
  });

  try {
    const content = completion.choices[0].message.content || "{}";
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return {
      tips: ["Start at an easy pace", "Focus on your breathing", "Enjoy the run!"],
      warnings: [],
      suggestedPace: "comfortable",
      hydrationAdvice: "Stay hydrated",
      warmupSuggestion: "5 minutes of light jogging"
    };
  }
}

export async function getElevationCoaching(params: {
  eventType: string;
  distance: number;
  elapsedTime: number;
  currentGrade: number;
  segmentDistanceMeters?: number;
  totalElevationGain?: number;
  totalElevationLoss?: number;
  hasRoute?: boolean;
  coachName?: string;
  coachTone?: string;
  coachGender?: string;
  coachAccent?: string;
  activityType?: string;
  // Cross-metric context
  currentPace?: string;
  averagePace?: string;
  heartRate?: number;
  cadence?: number;
  avgCadence?: number;
  kmSplitSummaries?: Array<{ km: number; pace: string; elevGain: number; elevLoss: number; avgGrade: number }>;
  terrainProfile?: string;
  elevationPerKm?: number;
  maxGradientSoFar?: number;
  segmentElevationGain?: number;
  segmentElevationLoss?: number;
  paceSpreadSeconds?: number;
  isNegativeSplitting?: boolean;
  // Cross-platform terrain state contract (TERRAIN_AWARENESS_SPEC)
  // iOS sends: event_type = "terrain_state", terrain_state = "gradual_climb" etc.
  // Android sends: event_type = "gradual_climb" etc. (state directly as eventType)
  terrain_state?: string;         // confirmed classifier state from iOS
  distance_in_state_m?: number;   // metres already in the current terrain state
  has_route_elevation_ahead?: boolean; // false until route lookahead is implemented
  // Legacy format support
  change?: string;
  grade?: number;
  upcoming?: string;
  runnerProfile?: string | null;
}): Promise<string> {
  const coachName = params.coachName || 'Coach';
  const coachTone = params.coachTone || 'energetic';
  // currentGrade is required by the type signature; the ?? 0 fallback below means a missing
  // value silently reads as "flat terrain" rather than "unknown" — log so a casing mismatch
  // (or a legacy client still sending "grade") doesn't masquerade as real flat-ground data.
  if (params.currentGrade == null && params.grade == null) {
    console.warn(`[getElevationCoaching] currentGrade missing from request body — check client field casing (expected "currentGrade")`);
  }
  const grade = params.currentGrade ?? params.grade ?? 0;
  const isWalkElevation = params.activityType === 'walk';
  const elevPersonCap = isWalkElevation ? 'Walker' : 'Runner';
  const elevPersonLower = isWalkElevation ? 'walker' : 'runner';

  // ── Pace-aware cadence hint for run technique cues below ────────────────────
  // The climb/descent/flat technique cues used to hardcode static spm targets
  // (e.g. "170-180 spm", "160-170 spm") regardless of the session's actual pace —
  // fine for a 4:00/km tempo, actively misleading for an 8:00-8:30/km Zone 2 easy
  // run, where a realistic personal cadence is closer to 150-155 spm. Compute a
  // real target from calculateOptimalCadenceRange (same function already used
  // correctly elsewhere in this file for live cadence coaching) instead of citing
  // a generic number the runner has no way of matching at their actual pace.
  const elevPaceSecPerKm = (() => {
    const paceStr = params.currentPace || params.averagePace;
    if (!paceStr) return null;
    const parts = paceStr.split(':').map(Number);
    return parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) ? parts[0] * 60 + parts[1] : null;
  })();
  const elevCadenceRange = elevPaceSecPerKm != null ? calculateOptimalCadenceRange(elevPaceSecPerKm, 170) : null;
  const cadenceHint = elevCadenceRange
    ? `${elevCadenceRange.low}-${elevCadenceRange.high} spm`
    : 'a quick, light turnover — do not cite a specific spm number, pace data is unavailable';

  // ── Normalise event type across platforms ──────────────────────────────────
  // iOS wraps state in a "terrain_state" envelope: { event_type: "terrain_state", terrain_state: "gradual_climb" }
  // Android sends the state directly as event_type: "gradual_climb"
  // Both are resolved to the same canonical state name for routing below.
  const rawEventType = params.eventType || params.change || 'uphill';
  const eventType = (rawEventType === 'terrain_state' && params.terrain_state)
    ? params.terrain_state
    : rawEventType;

  // has_route_elevation_ahead: when false (current default for both platforms) the
  // backend MUST NOT predict future terrain ("the top is coming", "downhill ahead").
  const hasRouteElevationAhead = params.has_route_elevation_ahead === true;

  const distanceKm = formatDistanceForCoaching(params.distance);
  const segmentM = params.segmentDistanceMeters ? Math.round(params.segmentDistanceMeters) : null;
  const distanceInStateM = params.distance_in_state_m ? Math.round(params.distance_in_state_m) : null;

  // Don't give terrain coaching for no-route runs — return empty so no TTS is triggered
  if (params.hasRoute === false) {
    return "";
  }

  // Build the split-by-split elevation analysis table
  let splitAnalysis = '';
  if (params.kmSplitSummaries && params.kmSplitSummaries.length > 0) {
    splitAnalysis = '\nKM SPLIT ELEVATION BREAKDOWN:\n' + params.kmSplitSummaries.map(s => {
      const terrain = s.avgGrade > 2 ? '⬆ uphill' : s.avgGrade < -2 ? '⬇ downhill' : '➡ flat';
      return `  km${s.km}: ${s.pace}/km | +${s.elevGain}m/-${s.elevLoss}m | ${s.avgGrade.toFixed(1)}% avg grade (${terrain})`;
    }).join('\n');
    splitAnalysis += '\n';
  }

  // Build cross-metric status
  let metricsStatus = '\nCURRENT METRICS:';
  if (params.currentPace) metricsStatus += `\n- Current pace: ${params.currentPace}/km`;
  if (params.averagePace) metricsStatus += `\n- Average pace: ${params.averagePace}/km`;
  if (params.heartRate) metricsStatus += `\n- Heart rate: ${params.heartRate} bpm`;
  if (params.cadence) metricsStatus += `\n- Cadence: ${params.cadence} spm`;
  if (params.avgCadence) metricsStatus += ` (avg: ${params.avgCadence} spm)`;
  if (params.paceSpreadSeconds != null) metricsStatus += `\n- Pace consistency: ${params.paceSpreadSeconds}s spread (fastest to slowest split)`;
  if (params.isNegativeSplitting === true) metricsStatus += `\n- NEGATIVE SPLITTING — getting faster each km`;
  metricsStatus += '\n';

  // Build terrain profile overview
  let terrainOverview = '\nROUTE TERRAIN PROFILE:';
  terrainOverview += `\n- Classification: ${params.terrainProfile || 'unknown'}`;
  terrainOverview += `\n- Elevation gain per km: ${params.elevationPerKm ? params.elevationPerKm.toFixed(1) + 'm/km' : 'unknown'}`;
  terrainOverview += `\n- Total climb: ${params.totalElevationGain ? Math.round(params.totalElevationGain) + 'm' : '0m'}`;
  terrainOverview += `\n- Total descent: ${params.totalElevationLoss ? Math.round(params.totalElevationLoss) + 'm' : '0m'}`;
  if (params.maxGradientSoFar) terrainOverview += `\n- Steepest gradient so far: ${params.maxGradientSoFar.toFixed(1)}%`;

  // Build event-specific coaching instructions
  // ── New state-based terrain system ──────────────────────────────────────
  // Events: gradual_climb | steep_climb | gradual_descent | steep_descent |
  //         rolling_terrain | flat_terrain | downhill_finish
  //
  // CRITICAL RULES FOR ALL TERRAIN EVENTS:
  //  • NEVER predict what comes next ("the top is coming", "enjoy the downhill ahead")
  //  • NEVER use the word "summit" or "crest" as a future event
  //  • ALWAYS describe what the runner is ON RIGHT NOW, not what is coming
  //  • Downhill/descent SPEEDS you up — never imply it "slows" you or is harder
  // ─────────────���──────────────────────────────────────────────────────────
  let coachingInstructions: string;

  if (eventType === 'gradual_climb' || eventType === 'uphill' || eventType === 'hill_uphill_technique') {
    // Legacy eventType aliases mapped to gradual_climb
    coachingInstructions = isWalkElevation ? `GRADUAL CLIMB — ${elevPersonCap} is currently on a ${Math.abs(grade).toFixed(1)}% incline.${params.segmentElevationGain ? ` They have climbed ${Math.round(params.segmentElevationGain)}m in this segment.` : ''}${distanceInStateM ? ` They have been climbing for ${distanceInStateM}m.` : segmentM ? ` Segment distance: ${segmentM}m.` : ''}

COACHING FOCUS (current terrain only — do NOT predict what comes after):
- Acknowledge the climb they are ON: grade, metres climbed, how the effort feels relative to their data
- Technique on a gradual climb: lean slightly forward from the ankles, shorten the steps a little, keep a steady rhythm — do NOT mention spm or a numeric step target
- If HR is elevated: coach effort control — encourage them to keep it conversational and let the climb set the pace, in your own words
- Correlate pace drop with grade: a 3-4% grade typically costs 15-25s/km — if they're in that range they're managing it well
- Do NOT say the summit/top is near; do NOT say "it gets easier from here"
- Reference their actual numbers` : `GRADUAL CLIMB — ${elevPersonCap} is currently on a ${Math.abs(grade).toFixed(1)}% incline.${params.segmentElevationGain ? ` They have climbed ${Math.round(params.segmentElevationGain)}m in this segment.` : ''}${distanceInStateM ? ` They have been climbing for ${distanceInStateM}m.` : segmentM ? ` Segment distance: ${segmentM}m.` : ''}

COACHING FOCUS (current terrain only — do NOT predict what comes after):
- Acknowledge the climb they are ON: grade, metres climbed, how the effort feels relative to their data
- Technique on a gradual climb: shorten stride, keep cadence up (target ${cadenceHint}), stay tall through hips
- If HR is elevated: coach effort control — encourage them to keep it conversational and let the climb set the pace, in your own words
- If cadence is low: encourage shorter, lighter steps over big powerful strides uphill — explain briefly why, in your own words
- Correlate pace drop with grade: a 3-4% grade typically costs 15-25s/km — if they're in that range they're managing it well
- Do NOT say the summit/top is near; do NOT say "it gets easier from here"
- Reference their actual numbers`;

  } else if (eventType === 'steep_climb') {
    coachingInstructions = isWalkElevation ? `STEEP CLIMB — ${elevPersonCap} is on a ${Math.abs(grade).toFixed(1)}% grade.${params.segmentElevationGain ? ` Climbed ${Math.round(params.segmentElevationGain)}m so far in this segment.` : ''}${distanceInStateM ? ` Has been on this steep section for ${distanceInStateM}m.` : segmentM ? ` Segment: ${segmentM}m.` : ''}

COACHING FOCUS (current terrain only — do NOT predict what follows):
- Name the challenge directly — this is a steep grade (${Math.abs(grade).toFixed(0)}%) and it's worth acknowledging plainly, in your own words
- This is the most important time to manage EFFORT not pace — HR is the real gauge here
- Technique cues for steep: lean slightly forward from the ankles (not the waist), pump the arms more for momentum, shorten the steps, eyes down 2-3m ahead — do NOT mention spm or a numeric step target
- If HR is very high (>85% max): tell them to dial back — a shorter, steadier step at this grade costs less energy than pushing through, in your own words
- Do NOT say "the top is coming" or "nearly there" — you don't know that. Stay grounded in NOW.
- Reference their actual numbers` : `STEEP CLIMB — ${elevPersonCap} is on a ${Math.abs(grade).toFixed(1)}% grade.${params.segmentElevationGain ? ` Climbed ${Math.round(params.segmentElevationGain)}m so far in this segment.` : ''}${distanceInStateM ? ` Has been on this steep section for ${distanceInStateM}m.` : segmentM ? ` Segment: ${segmentM}m.` : ''}

COACHING FOCUS (current terrain only — do NOT predict what follows):
- Name the challenge directly — this is a steep grade (${Math.abs(grade).toFixed(0)}%) and it's worth acknowledging plainly, in your own words
- This is the most important time to manage EFFORT not pace — HR is the real gauge here
- Technique cues for steep: lean slightly forward from ankles (not waist), pump arms more, shorten stride dramatically, eyes down 2-3m ahead
- If HR is very high (>85% max): tell them to dial back — power-hiking at this grade costs less energy than shuffling, in your own words
- If cadence is low (<140): this is the risk zone for quad overload — quick light steps are critical
- Do NOT say "the top is coming" or "nearly there" — you don't know that. Stay grounded in NOW.
- Reference their actual numbers`;

  } else if (eventType === 'gradual_descent' || eventType === 'downhill' || eventType === 'hill_downhill_technique') {
    // Legacy eventType aliases mapped to gradual_descent
    coachingInstructions = isWalkElevation ? `GRADUAL DESCENT — ${elevPersonCap} is currently descending at ${Math.abs(grade).toFixed(1)}%.${params.segmentElevationLoss ? ` Descended ${Math.round(params.segmentElevationLoss)}m in this segment.` : ''}${distanceInStateM ? ` Descending for ${distanceInStateM}m.` : segmentM ? ` Segment: ${segmentM}m.` : ''}

COACHING FOCUS (current terrain only — no predictions about what comes next):
- Gravity is working FOR them right now — pace naturally picks up, that is correct and expected
- NEVER say descending "slows you down" or "makes things harder" — it does the opposite
- Technique on a gradual descent: stay light on the feet, lean slightly forward, let gravity carry the pace — do NOT mention spm or a numeric step target
- Use the descent to RECOVER aerobically: HR should drop, breathing should ease — if it's not, they're braking
- If they're braking (heavy heel striking): coach them to land under their hips rather than out in front, letting the hill flow under them — in your own words
- Reference their actual numbers` : `GRADUAL DESCENT — ${elevPersonCap} is currently descending at ${Math.abs(grade).toFixed(1)}%.${params.segmentElevationLoss ? ` Descended ${Math.round(params.segmentElevationLoss)}m in this segment.` : ''}${distanceInStateM ? ` Descending for ${distanceInStateM}m.` : segmentM ? ` Segment: ${segmentM}m.` : ''}

COACHING FOCUS (current terrain only — no predictions about what comes next):
- Gravity is working FOR them right now — pace naturally picks up, that is correct and expected
- NEVER say descending "slows you down" or "makes things harder" — it does the opposite
- Technique on a gradual descent: let the legs turnover quickly, stay light on feet, lean slightly forward, quick cadence (target ${cadenceHint})
- If cadence is low: encourage quicker turnover, letting gravity do the work with quick light steps — in your own words
- Use the descent to RECOVER aerobically: HR should drop, breathing should ease — if it's not, they're braking
- If they're braking (heavy heel striking): coach them to land under their hips rather than out in front, letting the hill flow under them — in your own words
- Reference their actual numbers`;

  } else if (eventType === 'steep_descent') {
    coachingInstructions = isWalkElevation ? `STEEP DESCENT — ${elevPersonCap} is on a ${Math.abs(grade).toFixed(1)}% downgrade.${params.segmentElevationLoss ? ` Descended ${Math.round(params.segmentElevationLoss)}m in this segment.` : ''}${distanceInStateM ? ` Has been descending for ${distanceInStateM}m.` : segmentM ? ` Segment: ${segmentM}m.` : ''}

COACHING FOCUS (current terrain only — do NOT predict what follows):
- Gravity is helping significantly — pace is naturally fast, that is correct
- NEVER imply descent is harder or slower — it is faster, but the challenge is CONTROL not effort
- Steep descents are hard on the knees and quads (eccentric load) — controlled steps beat rushing downhill
- Key technique: lean INTO the slope (slight forward lean), stay light on the feet, mid-foot placement, arms out for balance — do NOT mention spm or a numeric step target
- If HR is still high from a prior climb: reassure them the hill is doing the work now and it's a good moment to let their breathing settle — in your own words
- If this descent follows a big climb: acknowledge that staying light here protects their knees for the rest of the walk — in your own words
- Reference their actual numbers` : `STEEP DESCENT — ${elevPersonCap} is on a ${Math.abs(grade).toFixed(1)}% downgrade.${params.segmentElevationLoss ? ` Descended ${Math.round(params.segmentElevationLoss)}m in this segment.` : ''}${distanceInStateM ? ` Has been descending for ${distanceInStateM}m.` : segmentM ? ` Segment: ${segmentM}m.` : ''}

COACHING FOCUS (current terrain only — do NOT predict what follows):
- Gravity is helping significantly — pace is naturally fast, that is correct
- NEVER imply descent is harder or slower — it is faster, but the challenge is CONTROL not effort
- Steep descents are hard on quads (eccentric load) — controlled turnover beats braking hard
- Key technique: lean INTO the slope (slight forward lean), high cadence (175-185+), mid-foot strike, arms out for balance
- If cadence is too low: warn of braking risk — quick feet, don't let the hill run away with them, in your own words
- If HR is still high from a prior climb: reassure them the hill is doing the work now and it's a good moment to let their breathing settle — in your own words
- If this descent follows a big climb: acknowledge that staying light here protects their quads for the rest of the run — in your own words
- Reference their actual numbers`;

  } else if (eventType === 'downhill_finish') {
    coachingInstructions = `DOWNHILL FINISH — ${elevPersonCap} is descending towards the finish at ${Math.abs(grade).toFixed(1)}%.${params.segmentElevationLoss ? ` Descended ${Math.round(params.segmentElevationLoss)}m so far.` : ''}

COACHING FOCUS:
- This is the final descent — the finish is ahead, gravity is an ally RIGHT NOW
${isWalkElevation
  ? '- Channel the descent into a strong, controlled finish — steady confident steps, not a scramble\n- Stay light, let the hill carry the momentum, keep good posture through to the end\n- If they have energy left: now is the time to pick up the walking pace and commit'
  : '- Channel the descent energy into a strong controlled finish — not a panic sprint\n- Keep cadence high, stay light, let the hill carry them forward\n- If they have anything left: now is the time to open up the stride and commit'}
- Remind them what they've achieved on this ${elevPersonLower === 'walker' ? 'walk' : 'run'} — reference the distance/elevation numbers
- Energy should be HIGH and motivating — this is the finish!`;

  } else if (eventType === 'rolling_terrain') {
    const gainM = params.segmentElevationGain ? Math.round(params.segmentElevationGain) : (params.totalElevationGain ? Math.round(params.totalElevationGain) : null);
    const lossM = params.segmentElevationLoss ? Math.round(params.segmentElevationLoss) : (params.totalElevationLoss ? Math.round(params.totalElevationLoss) : null);
    coachingInstructions = `ROLLING / UNDULATING TERRAIN — ${elevPersonCap} is on rolling terrain (alternating small rises and dips).
${gainM !== null && lossM !== null ? `The terrain has delivered approximately ${gainM}m of climbing and ${lossM}m of descent — classic undulating route.` : ''}

COACHING FOCUS (no predictions — describe what is happening NOW):
- This is NOT a big climb or a steep descent — it is a rolling, undulating pattern
- Use language like "rolling terrain", "undulating route", "gentle rises and dips" — not "hill"
- Key insight: on rolling terrain the goal is CONSISTENT EFFORT, not consistent pace. Pace will vary 5-10s/km naturally.
- Don't fight the small rises — relax and absorb them; the dips give free recovery
- If pace spread is high (>15s between splits): explain that's the terrain doing it, not a form issue — encourage them to focus on effort rather than the watch, in your own words
- If HR is elevated: reassure them the small rises accumulate — encourage staying relaxed on the ups and recovering on the dips, in your own words
- Give ONE original, specific tip about relaxing into the terrain's natural rhythm rather than fighting each rise — invent your own wording and metaphor each time; do NOT reuse a stock phrase across coaching messages
- Reference their actual numbers`;

  } else if (eventType === 'flat_terrain') {
    coachingInstructions = `FLAT TERRAIN — ${elevPersonCap} is on flat ground right now.

COACHING FOCUS:
- Flat terrain is ideal for rhythm, pace consistency, and finding flow
- If pace is consistent (spread < 15s): acknowledge that as disciplined, well-controlled ${isWalkElevation ? 'walking' : 'running'} — in your own words
- If negative splitting: exceptional — call it out
- If pace is drifting (spread > 20s): on flat terrain there's no excuse — suggest a form reset or effort check
${isWalkElevation
  ? '- Flat walking technique cue: tall posture through hips, relaxed shoulders, arms swinging forward not across, purposeful stride'
  : `- Flat running technique cue: cadence target ${cadenceHint}, tall posture through hips, relaxed shoulders, arms swinging forward not across`}
- Reference their actual numbers`;

  } else {
    coachingInstructions = `TERRAIN UPDATE — ${elevPersonCap} is on ${eventType} terrain at ${distanceKm}.
Give concise terrain-specific coaching based on their current metrics and split data. Do NOT predict what terrain comes next.`;
  }

  // Future-terrain ban: when has_route_elevation_ahead is false (the current default for both
  // iOS and Android since route lookahead isn't implemented), the AI must not speculate about
  // what terrain comes next. This is the key guardrail that prevents "enjoy the downhill
  // coming up!" messages on climbs that might continue for another kilometre.
  const futureBanRule = hasRouteElevationAhead
    ? '- Route elevation lookahead IS available — you MAY reference upcoming terrain changes if the data supports it'
    : '- CRITICAL: No route elevation lookahead. NEVER predict what terrain comes next. NEVER say "the top is coming", "almost there", "enjoy the downhill ahead", "nearly at the summit", or ANY prediction about future terrain. Describe only what the runner is on RIGHT NOW.';

  const { system: systemPrompt, user: prompt } = (isWalkElevation ? walkPrompts : runPrompts).elevationCoachingPrompt({
    coachName, coachTone, coachAccent: params.coachAccent, distanceKm, terrainOverview,
    metricsStatus, splitAnalysis, coachingInstructions, futureBanRule, runnerProfile: params.runnerProfile,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    max_tokens: 150,
    temperature: 0.8,
  });

  return completion.choices[0].message.content || "Adjust your effort for the terrain!";
}

/**
 * Generate Emotional & Mental Coaching
 * 
 * 6 subcategories of emotional coaching:
 * 1. Positive Self-Talk - Replace negative thoughts with empowerment
 * 2. Motivation & Resilience - Reframe discomfort as growth
 * 3. Focus & Mindfulness - Guide into flow state
 * 4. Smiling Coaching - Scientifically proven 5-10% effort reduction
 * 5. Relaxation & Tension Release - Reduce unnecessary tension
 * 6. End-of-Run Reinforcement - Celebration and growth recognition
 */
export async function generateEmotionalCoaching(params: {
  category: 'positive_self_talk' | 'motivation_resilience' | 'focus_mindfulness' | 'smiling_coaching' | 'relaxation' | 'end_of_run';
  distance: number;
  targetDistance?: number;
  elapsedTime: number;
  phase: string;
  currentPace?: string;
  targetPace?: string;
  heartRate?: number;
  effort?: 'low' | 'moderate' | 'high' | 'very_high';
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  coachGender?: string;
  runnerName?: string;
  runHistory?: any;
  runnerProfile?: string | null;
}): Promise<string> {
  const {
    category,
    distance,
    targetDistance,
    elapsedTime,
    phase,
    currentPace,
    targetPace,
    heartRate,
    effort = 'moderate',
    coachName,
    coachTone,
    coachAccent,
    coachGender,
    runnerName,
    runHistory
  } = params;

  const timeMin = Math.floor(elapsedTime / 60);
  const progress = targetDistance ? Math.round((distance / targetDistance) * 100) : 0;
  const runnerFirstName = runnerName ? runnerName.split(' ')[0] : null;

  // Build emotional coaching prompts by category.
  // Each category previously ended with a "Key themes/phrases/cues:" line of fully
  // quoted, ready-to-speak lines ("You CAN do this", "Try a smile", "Drop your
  // shoulders" etc.) presented as literal examples to draw from — the same anti-pattern
  // found and fixed in elevation coaching and the technique-hints map: an AI reliably
  // echoes distinctive quoted phrasing from a prompt near-verbatim, and every user's
  // emotional-coaching moments draw from these same six category blocks. Rewritten to
  // describe the theme/concept instead, with an explicit instruction to generate
  // original wording each time — same fix, same reasoning, applied here.
  const emotionalPrompts: Record<string, string> = {
    positive_self_talk: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is struggling with negative self-talk. They are ${progress}% through their run at ${formatDistanceForCoaching(distance)}.
They need help replacing doubt with empowerment.

Generate 2-3 sentences of positive self-talk coaching that:
1. Acknowledges their struggle without judgment
2. Reframes the moment as an opportunity for mental strength
3. Provides an empowering perspective shift
4. Is delivered in your natural ${coachTone} coach voice

Build the message around genuine self-belief and resilience — that they're capable right now, and that pushing through this exact moment is itself what builds strength. Invent your own original phrasing every time; do not reuse a stock affirmation.
Do NOT be generic — reference their actual data (pace: ${currentPace}, distance: ${formatDistanceForCoaching(distance)}).
Make it personal and genuine.`,

    motivation_resilience: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is facing a challenge — they're ${progress}% through their run, ${formatDistanceForCoaching(distance)} in, in the ${phase} phase.
This is where mental toughness separates champions from others.

Generate 2-3 sentences that:
1. Acknowledge this IS difficult
2. Reframe the discomfort as strength-building
3. Inspire them to push through
4. Reference their actual effort level

Build the message around the idea that this uncomfortable stretch is exactly where fitness and mental toughness get built, and that the discomfort itself is temporary even though what it builds isn't. Invent your own original phrasing every time; do not reuse a stock line.
Make it feel like a challenge you BELIEVE they can overcome, not doubt.`,

    focus_mindfulness: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is getting lost in negative thoughts. Help them find their flow state.

Generate 2-3 sentences that:
1. Ground them in the present moment
2. Focus on physical sensations (breathing, feet, rhythm)
3. Simplify their focus to just the next kilometer or segment
4. Create a sense of calm control

Anchor them in one concrete physical sensation — their breath, their footstrike rhythm, or a simple counted breathing pattern — as a way to pull focus out of spiraling thoughts and into the present moment. Invent your own original phrasing every time; do not reuse a stock cue.
Use a calm, measured tone even if the coach is normally energetic.`,

    smiling_coaching: `You are ${coachName}, an AI running coach with a ${coachTone} style.

Scientific research shows that smiling reduces perceived effort by 5-10%. The runner is fatigued and needs this boost.

Generate 2-3 sentences that:
1. Suggest they smile (even a small one)
2. Explain why it helps (scientifically)
3. Make it feel achievable and fun
4. Be encouraging about the result

Invite a genuine smile as a real, physiologically-backed trick — it relaxes facial tension and signals to the brain that this effort is manageable. Invent your own original, playful phrasing every time; do not reuse a stock line.
Make it feel like a game or challenge, not an order.`,

    relaxation: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is tense — their muscles are tight, they're fighting the pace instead of flowing.

Generate 2-3 sentences that:
1. Give specific relaxation cues (shoulders, hands, jaw)
2. Explain how tension wastes energy
3. Help them feel more efficient immediately
4. Be direct and actionable

Pick one or two genuine tension points — shoulders, hands, or jaw are common ones — and cue releasing them, briefly explaining that held tension wastes energy. Invent your own original phrasing every time; do not reuse a stock cue.
Reference their current effort level to show you understand.`,

    end_of_run: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner has just finished. This is about celebration, gratitude, and growth recognition.

Generate 2-3 sentences that:
1. Acknowledge what they just accomplished
2. Help them feel proud of their effort
3. Recognize their growth or strength
4. End on an inspiring note

Build the message around genuine pride in what they just completed and recognition of the effort or growth it took. Invent your own original phrasing every time; do not reuse a stock celebratory line.
Make it feel personal and genuine — reference something specific about their run.`
  };

  const prompt = `${emotionalPrompts[category] || emotionalPrompts.positive_self_talk}

${VARIETY_INSTRUCTION}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are ${coachName}, a ${coachTone} running coach delivering emotional coaching. Keep it brief (2-3 sentences max), genuine, and impactful. NEVER start with greetings. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}${runnerProfileBlock(params.runnerProfile)}`
      },
      { role: "user", content: prompt }
    ],
    max_tokens: 100,
    temperature: 0.8
  });

  return completion.choices[0].message.content || "You're doing great. Keep going!";
}

/**
 * Generate TTS audio using AWS Polly Neural TTS (primary) with OpenAI fallback.
 * 
 * Polly provides authentic regional English accents with native speakers:
 * - British, American, Australian, Irish, South African, New Zealand
 * 
 * Falls back to OpenAI gpt-4o-mini-tts if Polly is not configured or fails.
 */
export async function generateTTS(
  text: string, 
  voice: string = "alloy",
  instructions?: string,
  coachAccent?: string,
  coachGender?: string
): Promise<Buffer> {
  // Try Polly first if configured
  const { isPollyConfigured, synthesizeSpeech, mapAccentToPollyVoice } = await import('./polly-service');
  
  if (isPollyConfigured()) {
    try {
      const pollyVoice = mapAccentToPollyVoice(coachAccent, coachGender);
      const awsRegion = process.env.AWS_REGION || "ap-southeast-2";
      console.log(`[TTS] Using Polly Neural — accent: ${coachAccent}, gender: ${coachGender}, voice: ${pollyVoice}, region: ${awsRegion}`);
      const buffer = await synthesizeSpeech(
        text,
        coachAccent,
        coachGender,
        instructions
      );
      return buffer;
    } catch (pollyError: any) {
      console.warn(`[TTS] Polly synthesis failed, falling back to OpenAI. accent: ${coachAccent}, voice: ${mapAccentToPollyVoice(coachAccent, coachGender)}, region: ${process.env.AWS_REGION || "ap-southeast-2"}, error:`, pollyError.message);
      // Fall through to OpenAI fallback
    }
  } else {
    console.warn(`[TTS] Polly not configured (missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY) — using OpenAI TTS`);
  }

  // Fallback to OpenAI gpt-4o-mini-tts
  console.log(`[TTS] Using OpenAI gpt-4o-mini-tts with voice: ${voice}`);
  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: voice as any,
    input: text,
    ...(instructions ? { instructions } : {}),
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  // Track OpenAI TTS cost (fire-and-forget)
  import("./cost-tracking-service").then(({ trackOpenAITtsCost }) => {
    trackOpenAITtsCost(text, null);
  }).catch(() => {});

  return buffer;
}

/**
 * Build TTS voice instructions based on coach accent, tone, and gender.
 * These instructions steer gpt-4o-mini-tts to speak with the right accent,
 * energy level, pacing, and personality.
 */
export function buildTTSInstructions(
  coachAccent?: string, 
  coachTone?: string, 
  coachGender?: string,
  coachName?: string
): string {
  const parts: string[] = [];
  
  // Core identity
  const name = coachName || "the coach";
  const gender = coachGender === 'male' ? 'male' : 'female';
  parts.push(`You are ${name}, a ${gender} running coach.`);
  
  // Accent — the key differentiator
  const accent = (coachAccent || '').trim().toLowerCase();
  switch (accent) {
    case 'british':
      parts.push('Speak with a British English accent (RP or modern London). Use British pronunciation — "can\'t" rhymes with "ant", say "kilometre" not "kilometer". Natural and conversational, not posh.');
      break;
    case 'irish':
      parts.push('Speak with a warm Irish accent. Slightly melodic intonation, natural Irish rhythm. Friendly and down-to-earth.');
      break;
    case 'scottish':
      parts.push('Speak with a Scottish accent. Rolling Rs where natural, Scottish vowel sounds. Warm and direct.');
      break;
    case 'australian':
      parts.push('Speak with an Australian accent. Relaxed vowels, rising intonation on statements. Laid-back but encouraging energy.');
      break;
    case 'new zealand':
    case 'newzealand':
    case 'nz':
      parts.push('Speak with a New Zealand accent. Short "i" vowels (like "fush and chups"), flat vowels, slight Kiwi lilt. Genuine and understated warmth — not over the top.');
      break;
    case 'american':
      parts.push('Speak with a General American accent. Clear, confident, energetic delivery.');
      break;
    case 'south african':
      parts.push('Speak with a South African accent. Distinctive vowels, slightly clipped consonants. Warm, resilient energy — like someone who runs Comrades Marathon. Natural Afrikaans-influenced English rhythm.');
      break;
    case 'canadian':
      parts.push('Speak with a Canadian English accent. Friendly, approachable, slightly softer than American. Natural "about" and "out" vowels. Warm and genuinely encouraging.');
      break;
    case 'welsh':
      parts.push('Speak with a Welsh accent. Musical, lilting intonation with a warm sing-song quality. Rich vowels. Passionate and heartfelt delivery.');
      break;
    case 'caribbean':
      parts.push('Speak with a Caribbean English accent. Rhythmic, melodic delivery with warm island energy. Relaxed but powerful. Think Jamaican-influenced — confident and uplifting.');
      break;
    case 'scandinavian':
      parts.push('Speak with a Scandinavian-accented English. Clean, precise pronunciation with slight Nordic melody. Calm, measured delivery — hygge energy. Understated confidence.');
      break;
    default:
      parts.push('Speak clearly and naturally.');
      break;
  }
  
  // Tone — energy and personality
  const tone = (coachTone || 'energetic').trim().toLowerCase();
  switch (tone) {
    case 'energetic':
      parts.push('High energy and upbeat. Speak with enthusiasm and excitement — like you genuinely love coaching. Slightly faster pacing. Emphasize key words with vocal energy.');
      break;
    case 'motivational':
    case 'inspirational':
      parts.push('Inspiring and warm. Speak with conviction and belief in the runner. Moderate pace with well-placed pauses for emphasis. Build the runner up.');
      break;
    case 'instructive':
      parts.push('Clear and precise. Speak like an experienced coach giving specific guidance. Measured pace, emphasis on key numbers and technique cues. Professional but friendly.');
      break;
    case 'factual':
      parts.push('Straightforward and concise. Deliver information clearly without excessive emotion. Moderate pace, no-nonsense delivery. Think sports commentator giving stats.');
      break;
    case 'friendly':
      parts.push('Warm and casual — like running with your best mate. Relaxed, conversational delivery. Use natural pauses and emphasis like you\'re chatting mid-run. Genuine and relatable, not performative.');
      break;
    case 'tough love':
    case 'toughlove':
      parts.push('Firm but caring. Speak like a coach who pushes hard because they believe in the runner. Direct, slightly intense delivery with conviction. Not mean — tough because you care. Think "I know you have more in you."');
      break;
    case 'analytical':
      parts.push('Precise and data-focused. Speak like a sports scientist delivering insights. Clear emphasis on numbers and metrics. Measured pace, intellectual curiosity. Fascinated by the data but still personable.');
      break;
    case 'zen':
    case 'mindful':
      parts.push('Calm, centred, and meditative. Slow, deliberate pacing with mindful pauses. Soothing and grounding — like a yoga instructor who runs. Focus on breath, presence, and the journey. Gentle and peaceful.');
      break;
    case 'playful':
    case 'humorous':
      parts.push('Light-hearted, witty, and fun. Speak with a smile in your voice. Playful energy — like a coach who makes you laugh while pushing you. Slightly cheeky but always supportive. Keep it entertaining.');
      break;
    case 'abrupt':
      parts.push('Short and direct. Punchy delivery with minimal words. Quick pace. Like a drill sergeant who cares — firm but not harsh.');
      break;
    case 'calm':
    case 'supportive':
    case 'encouraging':
      parts.push('Calm and supportive. Gentle pacing, warm and reassuring. Speak like a trusted friend running alongside them. Steady and grounding.');
      break;
    default:
      parts.push('Speak with encouraging, coaching energy.');
      break;
  }
  
  // Universal coaching delivery rules
  parts.push('This is a running coaching message — the listener is actively running. Keep delivery natural, conversational, and easy to understand while moving. Do not sound robotic or overly formal.');
  
  return parts.join(' ');
}

function buildCoachingSystemPrompt(context: CoachingContext): string {
  const coachIdentity = context.coachName || 'Coach';
  const talkVocab = activityVocab(resolveActivityType(context));
  let prompt = `You are ${coachIdentity}, an elite AI ${talkVocab.coachLabel} delivering live coaching to an athlete mid-${talkVocab.noun}. You have real-time access to their pace, distance, heart rate, cadence, and terrain data — use it to make every coaching message feel like it comes from someone who is right there watching them perform. Be specific, immediate, and personal. NEVER start with greetings like "Hey there", "Hey!", "Hi!" — jump straight into the coaching.${talkVocab.prohibition}

IMPORTANT: You are a fully qualified ${talkVocab.coachLabel} with deep sports science knowledge. When the ${talkVocab.person} asks about physical symptoms (stitch, cramp, nausea, dizziness, shin splints, blisters, heavy legs, etc.), technique (breathing, form, footstrike, cadence), or any general ${talkVocab.actLabel} question — answer it directly and practically using your coaching expertise. These questions do NOT require sensor data. Give immediate, actionable advice the ${talkVocab.person} can apply RIGHT NOW while still ${talkVocab.actLabel}. Keep responses to 2-4 sentences spoken naturally — no bullet points, no lists.`;

  if (context.coachTone) {
    prompt += ` ${toneDirective(context.coachTone)}`;
  }
  
  const currentPhase = context.phase || (context.distance !== undefined 
    ? determinePhase(context.distance, context.totalDistance || null)
    : 'generic');
  
  prompt += `\n\n${COACHING_PHASE_PROMPT}`;
  prompt += `\n\nCURRENT PHASE: ${currentPhase.toUpperCase()}`;
  
  if (context.distance !== undefined) {
    prompt += ` (Runner is at ${formatDistanceForCoaching(context.distance)}`;
    if (context.totalDistance) {
      const percent = (context.distance / context.totalDistance) * 100;
      prompt += ` of ${formatDistanceForCoaching(context.totalDistance)} total, ${percent.toFixed(0)}% complete`;
    }
    prompt += ')';
  }
  
  if (context.elevationChange) {
    prompt += ` The runner is currently on ${context.elevationChange} terrain.`;
  }
  
  if (context.isStruggling && currentPhase === 'late') {
    prompt += ' The runner appears to be struggling. Be extra supportive with fatigue-appropriate advice.';
  } else if (context.isStruggling) {
    prompt += ' The runner appears to be struggling. Be supportive but remember phase-appropriate advice only.';
  }
  
  if (context.weather?.current?.temperature) {
    prompt += ` Current temperature: ${context.weather.current.temperature}°C.`;
  }
  
  if (context.heartRate) {
    const maxHR = calcMaxHR((context as any).runnerAge);
    const hrPercent = (context.heartRate / maxHR) * 100;
    let zone = 'Zone 1 (Recovery)';
    let zoneAdvice = 'easy effort';
    
    if (hrPercent >= 90) {
      zone = 'Zone 5 (Maximum)';
      zoneAdvice = 'maximum effort - only sustainable briefly';
    } else if (hrPercent >= 80) {
      zone = 'Zone 4 (Threshold)';
      zoneAdvice = 'high intensity - building speed endurance';
    } else if (hrPercent >= 70) {
      zone = 'Zone 3 (Tempo)';
      zoneAdvice = 'moderate-hard effort - building aerobic capacity';
    } else if (hrPercent >= 60) {
      zone = 'Zone 2 (Aerobic)';
      zoneAdvice = 'comfortable effort - fat burning zone';
    }
    
    prompt += ` Current heart rate: ${context.heartRate} BPM (${zone}, ${zoneAdvice}).`;
    
    if (hrPercent >= 90) {
      prompt += ' The runner may need to slow down to recover.';
    } else if (hrPercent >= 85) {
      prompt += ' Heart rate is elevated - monitor effort level.';
    }
  }

  // CRITICAL: Include pace context with proper interpretation
  // ⚠️ PACE INTERPRETATION: In running, pace is TIME per km (minutes:seconds).
  // LOWER pace values = FASTER running. HIGHER pace values = SLOWER running.
  // Example: 5:00/km is faster than 5:30/km (difference of 30 seconds slower).
  if (context.pace || context.targetPace) {
    let paceInfo = '\n\nPACE DATA:';
    
    if (context.pace) {
      paceInfo += `\n- Current pace: ${context.pace}/km`;
    }
    
    if (context.targetPace) {
      paceInfo += `\n- Target pace: ${context.targetPace}/km`;
    }
    
    // If both are present, calculate and interpret the difference
    if (context.pace && context.targetPace) {
      const currentParts = context.pace.split(':').map(Number);
      const targetParts = context.targetPace.split(':').map(Number);
      
      if (currentParts.length === 2 && targetParts.length === 2) {
        const currentSec = currentParts[0] * 60 + currentParts[1];
        const targetSec = targetParts[0] * 60 + targetParts[1];
        const diffSec = currentSec - targetSec;
        
        paceInfo += '\n\nPACE COMPARISON:';
        if (diffSec > 15) {
          paceInfo += `\n- Runner is ${Math.abs(diffSec)} seconds/km slower than target — behind pace. Address this in proportion to their experience level and the tone directive.`;
        } else if (diffSec < -15) {
          paceInfo += `\n- Runner is ${Math.abs(diffSec)} seconds/km faster than target — ahead of pace. For a structured session, consider advising they ease back; for a free run, simply acknowledge it.`;
        } else {
          paceInfo += `\n- Runner is within ${Math.abs(diffSec)} seconds/km of target — on pace. Acknowledge the effort.`;
        }
      }
    }
    
    prompt += paceInfo;
  }

  // COMPREHENSIVE: Heart Rate Data (beyond current HR)
  if (context.avgHeartRate || context.maxHeartRate || context.minHeartRate) {
    let hrData = '\n\nHEART RATE SUMMARY:';
    if (context.avgHeartRate) hrData += `\n- Average: ${context.avgHeartRate} BPM`;
    if (context.minHeartRate) hrData += `\n- Minimum: ${context.minHeartRate} BPM`;
    if (context.maxHeartRate) hrData += `\n- Maximum: ${context.maxHeartRate} BPM`;
    prompt += hrData;
  }

  // COMPREHENSIVE: Cadence & Running Dynamics
  if (context.avgCadence || context.cadence || context.maxCadence || context.avgStrideLength || context.avgGroundContactTime || context.avgVerticalOscillation) {
    let cadenceData = '\n\nCADENCE & RUNNING DYNAMICS:';
    if (context.avgCadence) cadenceData += `\n- Average cadence: ${context.avgCadence} spm`;
    if (context.cadence && context.cadence !== context.avgCadence) cadenceData += `\n- Current cadence: ${context.cadence} spm`;
    if (context.maxCadence) cadenceData += `\n- Max cadence: ${context.maxCadence} spm`;
    if (context.avgStrideLength) cadenceData += `\n- Average stride length: ${context.avgStrideLength.toFixed(2)}m`;
    if (context.avgGroundContactTime) cadenceData += `\n- Ground contact time: ${context.avgGroundContactTime.toFixed(0)}ms (${context.avgGroundContactTime > 300 ? 'relatively high' : context.avgGroundContactTime < 200 ? 'efficient' : 'normal'})`;
    if (context.avgVerticalOscillation) cadenceData += `\n- Vertical oscillation: ${context.avgVerticalOscillation.toFixed(1)}cm (${context.avgVerticalOscillation > 10 ? 'high bounce' : context.avgVerticalOscillation < 6 ? 'very efficient' : 'efficient'})`;
    prompt += cadenceData;
  }

  // COMPREHENSIVE: Elevation & Terrain
  if (context.elevationGain || context.elevationLoss || context.avgGradient || context.maxGradient || context.currentGrade) {
    let elevationData = '\n\nELEVATION & TERRAIN:';
    if (context.elevationGain) elevationData += `\n- Elevation climbed: ${context.elevationGain.toFixed(0)}m`;
    if (context.elevationLoss) elevationData += `\n- Elevation descended: ${context.elevationLoss.toFixed(0)}m`;
    if (context.avgGradient) elevationData += `\n- Average gradient: ${context.avgGradient.toFixed(1)}%`;
    if (typeof context.currentGrade === 'number' && context.currentGrade !== null) elevationData += `\n- Current gradient: ${context.currentGrade.toFixed(1)}% (${context.currentGrade > 5 ? 'steep climb' : context.currentGrade < -5 ? 'steep descent' : context.currentGrade > 0 ? 'gradual climb' : 'gentle descent'})`;
    if (context.maxGradient) elevationData += `\n- Steepest segment: ${context.maxGradient.toFixed(1)}%`;
    prompt += elevationData;
  }

  // COMPREHENSIVE: Time & Progress
  if (context.elapsedTime || context.movingTime || context.targetTime) {
    let timeData = '\n\nTIME & PROGRESS:';
    if (context.elapsedTime) {
      const min = Math.floor(context.elapsedTime / 60);
      const sec = context.elapsedTime % 60;
      timeData += `\n- Elapsed: ${min}m${sec.toString().padStart(2, '0')}s`;
    }
    if (context.movingTime && context.movingTime !== context.elapsedTime) {
      const min = Math.floor(context.movingTime / 60);
      const sec = context.movingTime % 60;
      timeData += `\n- Moving time: ${min}m${sec.toString().padStart(2, '0')}s`;
    }
    if (context.targetTime) {
      const min = Math.floor(context.targetTime / 60);
      const sec = context.targetTime % 60;
      timeData += `\n- Target finish time: ${min}m${sec.toString().padStart(2, '0')}s`;
      if (context.elapsedTime && context.targetTime) {
        const remaining = Math.max(0, context.targetTime - context.elapsedTime);
        const remMin = Math.floor(remaining / 60);
        const remSec = remaining % 60;
        timeData += `\n- Time remaining (at target): ${remaining > 0 ? `${remMin}m${remSec.toString().padStart(2, '0')}s` : 'time up!'}`;
      }
    }
    prompt += timeData;
  }

  // COMPREHENSIVE: Training Load & Recovery
  if (context.workoutType || context.workoutIntensity || context.calories || context.trainingEffectLabel || context.aerobicTrainingEffect || context.recoveryTimeMinutes) {
    let trainingData = '\n\nTRAINING LOAD:';
    if (context.workoutType) trainingData += `\n- Workout type: ${context.workoutType}`;
    if (context.workoutIntensity) trainingData += `\n- Zone/Intensity: ${context.workoutIntensity}`;
    if (context.calories) trainingData += `\n- Estimated energy expenditure: ${context.calories} kcal`;
    if (context.trainingEffectLabel) trainingData += `\n- Training effect: ${context.trainingEffectLabel}`;
    if (context.aerobicTrainingEffect) trainingData += `\n- Aerobic benefit: ${context.aerobicTrainingEffect.toFixed(1)}/5.0`;
    if (context.anaerobicTrainingEffect) trainingData += `\n- Anaerobic benefit: ${context.anaerobicTrainingEffect.toFixed(1)}/5.0`;
    if (context.recoveryTimeMinutes) trainingData += `\n- Recovery time needed: ~${context.recoveryTimeMinutes} minutes`;
    if (context.vo2MaxEstimate) trainingData += `\n- Estimated VO2 max: ${context.vo2MaxEstimate.toFixed(1)} ml/kg/min`;
    prompt += trainingData;
  }

  // Include user's fitness level for tailored coaching
  if (context.userFitnessLevel) {
    prompt += `\n\nRunner's fitness level: ${context.userFitnessLevel}. Tailor your advice complexity, pacing expectations, and encouragement style to this level.`;
  }
  
  // Include accent-aware phrasing
  if (context.coachAccent) {
    const accentRule = accentDirective(context.coachAccent);
    if (accentRule) {
      prompt += `\n\n${accentRule}`;
    }
  }

  // Inject AI runner profile if available — gives every in-run cue full personal context
  prompt += runnerProfileBlock(context.runnerProfile);

  // TTS punctuation rule — must be last so it overrides any earlier style guidance
  prompt += `\n\n`;
  
  return prompt;
}

export interface RouteGenerationParams {
  startLat: number;
  startLng: number;
  distance: number;
  difficulty: string;
  activityType?: string;
  terrainPreference?: string;
  avoidHills?: boolean;
}

export interface GeneratedRoute {
  id: string;
  name: string;
  distance: number;
  difficulty: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  waypoints: { lat: number; lng: number }[];
  elevation: number;
  elevationGain: number;
  estimatedTime: number;
  terrainType: string;
  polyline: string;
  description: string;
}

export async function generateRouteOptions(params: RouteGenerationParams): Promise<GeneratedRoute[]> {
  const { startLat, startLng, distance, difficulty, activityType = 'run' } = params;
  
  // Generate 2-3 route options using AI to suggest waypoints
  const prompt = `Generate 3 different running route options starting from coordinates (${startLat}, ${startLng}).
Target distance: ${distance}km
Difficulty: ${difficulty}
Activity: ${activityType}

For each route, provide:
1. A creative name
2. 3-5 waypoint coordinates that create a loop back to start
3. Estimated elevation gain (in meters)
4. Terrain description (trail, road, mixed, park)
5. Brief description

Respond in JSON format:
{
  "routes": [
    {
      "name": "Route Name",
      "waypoints": [{"lat": 51.5, "lng": -0.1}, ...],
      "elevationGain": 50,
      "terrainType": "mixed",
      "description": "Brief description"
    }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a running route planner. Generate realistic waypoints near the starting location that create approximately the requested distance as a loop. Respond only with valid JSON." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.8,
    });

    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    
    const generatedRoutes: GeneratedRoute[] = [];
    
    for (let i = 0; i < (parsed.routes || []).length; i++) {
      const route = parsed.routes[i];
      const waypoints = route.waypoints || [];
      
      // Get directions from Google Maps to get actual polyline and distance
      const directionsData = await getGoogleDirections(startLat, startLng, waypoints);
      
      const routeId = `route_${Date.now()}_${i}`;
      generatedRoutes.push({
        id: routeId,
        name: route.name || `Route ${i + 1}`,
        distance: directionsData.distance || distance,
        difficulty: difficulty,
        startLat: startLat,
        startLng: startLng,
        endLat: startLat,
        endLng: startLng,
        waypoints: waypoints,
        elevation: route.elevationGain || 0,
        elevationGain: route.elevationGain || 0,
        estimatedTime: Math.round((directionsData.distance || distance) * (activityType === 'walk' ? 12 : 6)),
        terrainType: route.terrainType || 'mixed',
        polyline: directionsData.polyline || '',
        description: route.description || ''
      });
    }
    
    return generatedRoutes;
  } catch (error) {
    console.error("Route generation error:", error);
    // Return a simple fallback route
    return [{
      id: `route_${Date.now()}`,
      name: "Quick Route",
      distance: distance,
      difficulty: difficulty,
      startLat: startLat,
      startLng: startLng,
      endLat: startLat,
      endLng: startLng,
      waypoints: [],
      elevation: 0,
      elevationGain: 0,
      estimatedTime: Math.round(distance * 6),
      terrainType: "road",
      polyline: "",
      description: "A simple out-and-back route"
    }];
  }
}

async function getGoogleDirections(startLat: number, startLng: number, waypoints: { lat: number; lng: number }[]): Promise<{ distance: number; polyline: string }> {
  if (!GOOGLE_MAPS_API_KEY || waypoints.length === 0) {
    return { distance: 0, polyline: '' };
  }

  try {
    const origin = `${startLat},${startLng}`;
    const destination = origin; // Loop back
    const waypointStr = waypoints.map(w => `${w.lat},${w.lng}`).join('|');
    
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${waypointStr}&mode=walking&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const totalDistance = route.legs.reduce((sum: number, leg: any) => sum + leg.distance.value, 0) / 1000;
      return {
        distance: Math.round(totalDistance * 10) / 10,
        polyline: route.overview_polyline?.points || ''
      };
    }
  } catch (error) {
    console.error("Google Directions API error:", error);
  }
  
  return { distance: 0, polyline: '' };
}

/**
 * Wellness-aware pre-run coaching that incorporates Garmin data
 */
export interface WellnessContext {
  sleepHours?: number;
  sleepQuality?: string;
  sleepScore?: number;
  bodyBattery?: number;
  stressLevel?: number;
  stressQualifier?: string;
  hrvStatus?: string;
  hrvFeedback?: string;
  restingHeartRate?: number;
  readinessScore?: number;
  readinessRecommendation?: string;
}

/**
 * Weather Impact Analysis data for positive condition matching
 */
export interface WeatherImpactData {
  hasEnoughData: boolean;
  runsAnalyzed: number;
  overallAvgPace: number | null;
  temperatureAnalysis?: BucketAnalysis[];
  humidityAnalysis?: BucketAnalysis[];
  windAnalysis?: BucketAnalysis[];
  conditionAnalysis?: ConditionAnalysis[];
  timeOfDayAnalysis?: BucketAnalysis[];
  insights?: {
    bestCondition?: InsightItem;
    worstCondition?: InsightItem;
  };
}

interface BucketAnalysis {
  range: string;
  label: string;
  avgPace: number | null;
  runCount: number;
  paceVsAvg: number | null;
}

interface ConditionAnalysis {
  condition: string;
  avgPace: number;
  runCount: number;
  paceVsAvg: number;
}

interface InsightItem {
  label: string;
  type: string;
  improvement?: string;
  slowdown?: string;
}

/**
 * Analyze current conditions against historical weather impact data
 * Returns a positive insight if current conditions match user's best running conditions
 */
function analyzePositiveWeatherConditions(
  weather: any,
  weatherImpact?: WeatherImpactData,
  userTimezoneId?: string
): string {
  if (!weatherImpact || !weatherImpact.hasEnoughData || !weatherImpact.insights?.bestCondition) {
    return '';
  }

  const insights = weatherImpact.insights;
  
  // Get current time in user's timezone
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: userTimezoneId || 'UTC',
    hour: '2-digit',
    hour12: false
  }).format(now);
  const currentHour = parseInt(timeStr, 10);
  
  // Determine current time of day
  let currentTimeOfDay = '';
  if (currentHour >= 5 && currentHour < 9) currentTimeOfDay = 'Morning';
  else if (currentHour >= 9 && currentHour < 12) currentTimeOfDay = 'Late Morning';
  else if (currentHour >= 12 && currentHour < 14) currentTimeOfDay = 'Midday';
  else if (currentHour >= 14 && currentHour < 17) currentTimeOfDay = 'Afternoon';
  else if (currentHour >= 17 && currentHour < 20) currentTimeOfDay = 'Evening';
  else currentTimeOfDay = 'Night';

  // Check current temperature against temperature analysis
  const currentTemp = weather?.temp || weather?.temperature;
  let tempMatch = '';
  if (currentTemp && weatherImpact.temperatureAnalysis) {
    for (const bucket of weatherImpact.temperatureAnalysis) {
      if (bucket.paceVsAvg !== null && bucket.paceVsAvg < -5 && bucket.label) {
        // This is a fast bucket (more than 5% faster than average)
        const range = bucket.range.toLowerCase();
        if (range.includes('-') && range.includes('°c')) {
          const parts = range.replace('°c', '').split('-');
          if (parts.length === 2) {
            const min = parseFloat(parts[0].trim());
            const max = parseFloat(parts[1].trim());
            if (currentTemp >= min && currentTemp <= max) {
              tempMatch = `${bucket.label} (${bucket.paceVsAvg.toFixed(0)}% faster)`;
              break;
            }
          }
        }
      }
    }
  }

  // Check weather condition
  let conditionMatch = '';
  if (weatherImpact.conditionAnalysis) {
    const currentCondition = (weather?.condition || '').toLowerCase();
    for (const cond of weatherImpact.conditionAnalysis) {
      if (cond.paceVsAvg < -5 && cond.condition.toLowerCase().includes(currentCondition.split(' ')[0])) {
        conditionMatch = `${cond.condition} (${cond.paceVsAvg.toFixed(0)}% faster)`;
        break;
      }
    }
  }

  // Check time of day
  let timeMatch = '';
  if (weatherImpact.timeOfDayAnalysis) {
    for (const bucket of weatherImpact.timeOfDayAnalysis) {
      if (bucket.paceVsAvg !== null && bucket.paceVsAvg < -5 && 
          bucket.label && bucket.label.toLowerCase().includes(currentTimeOfDay.toLowerCase())) {
        timeMatch = `${bucket.label} (${bucket.paceVsAvg.toFixed(0)}% faster)`;
        break;
      }
    }
  }

  // Build positive insight message
  const matches: string[] = [];
  if (tempMatch) matches.push(tempMatch);
  if (conditionMatch) matches.push(conditionMatch);
  if (timeMatch) matches.push(timeMatch);

  if (matches.length > 0) {
    return `\n✓ WEATHER ADVANTAGE: Based on your historical data, you're a strong performer in these conditions! ${matches.join(', ')}. Make it count!`;
  }

  return '';
}

export async function generateWellnessAwarePreRunBriefing(params: {
  distance: number;
  elevationGain: number;
  elevationLoss?: number;
  maxGradientDegrees?: number;
  difficulty: string;
  activityType: string;
  weather: any;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  wellness: WellnessContext;
  hasRoute?: boolean;
  targetTime?: number;
  targetPace?: string;
  weatherImpact?: WeatherImpactData;
  runnerName?: string;
  fitnessLevel?: string;
  userTimezoneId?: string;  // User's timezone (e.g. "Pacific/Auckland")
  // Training plan context
  trainingPlanId?: string;
  planGoalType?: string;
  planWeekNumber?: number;
  planTotalWeeks?: number;
  workoutType?: string;
  workoutIntensity?: string;
  workoutDescription?: string;
  runnerProfile?: string | null;
}): Promise<{
  briefing: string;
  intensityAdvice: string;
  warnings: string[];
  readinessInsight: string;
  routeInsight?: string;
  weatherAdvantage?: string;
}> {
  const { distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, activityType, weather, coachName, coachTone, coachAccent, wellness, hasRoute = true, targetTime, targetPace, weatherImpact, runnerName, fitnessLevel, userTimezoneId, trainingPlanId, planGoalType, planWeekNumber, planTotalWeeks, workoutType, workoutIntensity, workoutDescription } = params;

  // Resolve target pace deterministically in code rather than trusting only the client-sent
  // literal (or worse, letting the LLM derive it from raw time/distance in the prompt — LLMs
  // are unreliable at exact division/rounding, e.g. 840s over 3km read back as "4:30/km"
  // instead of the correct 4:40/km). If the client already sent a target pace string, use it
  // as-is; otherwise compute it here whenever time + distance are both available, so the
  // prompt always receives a single already-correct literal via formatPaceForTTS() below.
  const resolvedTargetPace = targetPace || ((targetTime && targetTime > 0 && distance && distance > 0)
    ? (() => {
        const paceSecPerKm = targetTime / distance;
        const min = Math.floor(paceSecPerKm / 60);
        const sec = Math.round(paceSecPerKm % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
      })()
    : undefined);

  // Determine activity-specific language
  const isWalk = activityType && activityType.toLowerCase() === 'walk';
  const activityLabel = isWalk ? 'walk' : 'run';
  const activityLabelCaps = isWalk ? 'Walk' : 'Run';
  const activityLabelShout = isWalk ? 'WALK' : 'RUN';

  // Analyze positive weather conditions BEFORE building the prompt
  const weatherAdvantage = analyzePositiveWeatherConditions(weather, weatherImpact, userTimezoneId);

  const weatherInfo = weather
    ? `Weather: ${weather.temp || weather.temperature || 'N/A'}°C, ${weather.condition || 'clear'}, wind ${weather.windSpeed || 0} km/h.`
    : 'Weather data unavailable.';

  // Build route info based on whether there's a route
  let routeInfo = '';
  let terrainDescription = '';
  if (hasRoute === true) {
    // Classify terrain type from elevation data
    const gain = Math.round(elevationGain || 0);
    const loss = Math.round(elevationLoss || 0);
    const maxGrad = maxGradientDegrees || 0;
    const distKm = distance || 1;
    const gainPerKm = gain / distKm;
    
    // Terrain classification
    if (gain < 20 && loss < 20) {
      terrainDescription = 'Flat route — minimal elevation change, great for maintaining a steady pace';
    } else if (gain < 50 && loss < 50) {
      terrainDescription = 'Generally flat with gentle undulations';
    } else if (gainPerKm > 30) {
      terrainDescription = gain > 200 ? 'Mountainous/very hilly terrain — expect significant climbs and descents' :
        'Hilly route with noticeable climbs';
    } else if (gain > 50 || loss > 50) {
      terrainDescription = 'Rolling terrain with mixed inclines and declines';
    } else {
      terrainDescription = 'Mixed terrain';
    }

    // Gradient description
    let gradientNote = '';
    if (maxGrad > 8) {
      gradientNote = isWalk
        ? `Steepest section: ${maxGrad.toFixed(1)}° — a tough climb, pace yourself and take it steady`
        : `Steepest section: ${maxGrad.toFixed(1)}° — a tough climb, consider walking if needed`;
    } else if (maxGrad > 5) {
      gradientNote = isWalk
        ? `Steepest section: ${maxGrad.toFixed(1)}° — noticeable hill, shorten your steps a little and maintain effort`
        : `Steepest section: ${maxGrad.toFixed(1)}° — noticeable hill, shorten your stride and maintain effort`;
    } else if (maxGrad > 2) {
      gradientNote = `Steepest section: ${maxGrad.toFixed(1)}° — gentle incline`;
    }
    
    routeInfo = `
ROUTE:
- Distance: ${formatDistanceForTTS(distance)}
- Difficulty: ${difficulty}
- Elevation gain: ${gain}m / Elevation loss: ${loss}m
- Terrain: ${terrainDescription}
${gradientNote ? `- Gradient: ${gradientNote}` : ''}
- Route type: Road ${activityLabel} on mapped route`;
  } else {
    // Free walk/run (no route) - NO terrain mention at all
    routeInfo = `
${activityLabelShout} (No planned route):
- Distance: ${formatDistanceForTTS(distance)}
- Type: Free ${activityLabel} / Training ${activityLabel}`;
  }

  // Add target pace info if user has a target time/pace
  if (targetTime && resolvedTargetPace) {
    routeInfo += `
- Target: Complete ${formatDistanceForTTS(distance)} in ${formatDurationForTTS(targetTime)} (target pace: ${formatPaceForTTS(resolvedTargetPace)})`;
  }

  // ── POLICY: Garmin Connect data excluded from AI processing ──────────────
  // All Garmin Connect wellness fields (bodyBattery, sleepScore, HRV, stress,
  // restingHeartRate, readinessScore) originate from the Garmin Connect cloud
  // API and are intentionally NEVER sent to OpenAI.
  //
  // Garmin Connect data is used for display purposes only (run history, activity
  // sync). Only Garmin companion watch app data — real-time GPS, HR, pace, and
  // cadence streamed during a live run — may be processed by AI coaching functions.
  //
  // Do NOT remove this block or re-enable wellnessContext population without
  // an explicit product decision to change this policy.
  const wellnessContext = '';   // always empty — Garmin Connect data excluded

  // Build readiness guidance based on score (kept for future non-Garmin sources)
  let readinessGuidance = '';
  if (false && wellness.readinessScore !== undefined) {  // disabled — Garmin Connect excluded
    const score = wellness.readinessScore;
    if (score >= 90) {
      readinessGuidance = `
READINESS COACHING GUIDANCE (use this to personalize the readinessInsight):
- Score 90-100: They are fully charged and primed for an excellent run! Encourage them to push for a strong performance. Suggest they can aim for their target pace or even slightly faster if feeling great.
- Example: "Your body is fully recovered and ready to crush it! This is a great day to chase a personal best or really push the pace."`;
    } else if (score >= 70) {
      readinessGuidance = `
READINESS COACHING GUIDANCE (use this to personalize the readinessInsight):
- Score 70-89: They are in good shape for a solid run. Encourage balanced pacing - they can push but should stay within themselves.
- Example: "You're in good shape today. Great conditions for a quality run. Stick to your target pace and you'll have a strong session."`;
    } else if (score >= 50) {
      readinessGuidance = `
READINESS COACHING GUIDANCE (use this to personalize the readinessInsight):
- Score 50-69: They are looking a bit tired or under-recovered. Recommend starting slow and easing into the run. Focus on feeling good rather than pace.
- Example: "Your body is showing some fatigue today. Let's start at an easy pace and build into it. Don't worry about pace - focus on how you feel."`;
    } else {
      readinessGuidance = `
READINESS COACHING GUIDANCE (use this to personalize the readinessInsight):
- Score below 50: They are significantly under-recovered. Recommend a very easy, recovery-focused run or considering a rest day.
- Example: "Your body needs recovery today. Consider an easy walk or very light jog, or even a rest day. Listen to your body - there's no shame in taking it easy."`;
    }
  }
  
  // Build coaching plan context if available
  let coachingPlanContext = '';
  if (trainingPlanId && workoutType) {
    coachingPlanContext = `\nTRAINING PLAN CONTEXT:
- Plan Goal: ${planGoalType || 'N/A'}
- Week ${planWeekNumber}/${planTotalWeeks} of the training plan
- Workout Type: ${workoutType} (${workoutDescription || 'see intensity below'})
- Heart Rate Zone: ${workoutIntensity || 'not specified'}
- This session is part of a structured coaching program. Adjust your briefing to emphasize how this specific workout fits into their progression.`;
  }

  const briefingRunnerName = runnerName ? runnerName.split(' ')[0] : null;
  const prompt = `You are ${coachName}, an AI ${isWalk ? 'walking' : 'running'} coach. Your coaching style is ${coachTone}.
${briefingRunnerName ? `The ${isWalk ? 'walker' : 'runner'}'s name is ${briefingRunnerName}. Use their name naturally in the briefing.` : ''}
${fitnessLevel ? `${isWalk ? 'Walker' : 'Runner'}'s fitness level: ${fitnessLevel}.` : ''}

Generate a personalized pre-${activityLabel} briefing for an upcoming ${activityLabel}.
${routeInfo}
${coachingPlanContext}
- ${weatherInfo}
${weatherAdvantage}

${wellnessContext ? `CURRENT WELLNESS STATUS (from Garmin):${wellnessContext}
${readinessGuidance}` : `NO WELLNESS DATA AVAILABLE — This ${isWalk ? 'walker' : 'runner'} does not have a Garmin device connected or no wellness data has been synced today. Do NOT mention body readiness, recovery status, fatigue, body battery, sleep quality, HRV, stress levels, or any wellness/biometric data. Simply skip wellness entirely in your response.`}

Based on this data, provide:
${coachingPlanContext ? `1. "briefing": 2-3 SHORT SENTENCES (max 35 words). This is a COACHED WORKOUT — lead with the workout type and its purpose in the plan (week ${planWeekNumber} of ${planTotalWeeks}). Include key context like distance, weather, or readiness if relevant. ${PACE_FORMAT_RULE}
2. "intensityAdvice": ONE clear sentence (≤15 words). How they should feel during the ${workoutIntensity || 'prescribed'} zone efforts in this ${workoutType} session.
3. "weatherAdvice": ONE sentence (≤15 words) on how weather conditions affect the run. Be specific (wind, temp, rain, etc.). Can be empty if weather is neutral.
4. "warnings": Array of warnings — empty if none. Include readiness warnings if wellness data suggests caution.
5. "${hasRoute === true ? 'routeInsight' : 'readinessInsight'}": ONE sentence (≤12 words). ${wellnessContext ? 'Key readiness or terrain challenge affecting this specific workout.' : 'One specific motivational detail tied to this workout.'}`
: `1. "briefing": 2-3 SENTENCES (max 40 words) for a free-form run. Lead with distance${resolvedTargetPace ? ' and target pace' : ''}, mention weather and how it might affect you. ${wellnessContext ? 'Include your readiness status.' : ''} Be conversational. ${PACE_FORMAT_RULE}
2. "intensityAdvice": ONE sentence (≤15 words). About pace, effort, and listening to your body today.
3. "weatherAdvice": ONE sentence (≤15 words) on how conditions will impact the ${activityLabel}. Empty if weather is neutral/favorable.
4. "warnings": Array of warnings ${wellnessContext ? 'if wellness or weather suggest adjusting intensity' : 'based on weather or route conditions'}. Empty if none.
${hasRoute === true ? `5. "routeInsight": ONE sentence (≤15 words) on the key challenge — terrain, elevation, or wind.` : `5. "readinessInsight": ONE sentence (≤15 words). ${wellnessContext ? 'How your body is ready (or not) for this effort.' : 'What will make this run rewarding today.'}`}`}

CRITICAL RULES:
- Briefing should be MOTIVATING and INFORMATIVE — not a generic template. Paint a picture of what this ${activityLabel} will be like.
- Total word count: briefing ≤40 words. Each advice/insight should be ≤15 words. Tight but insightful.
- Include WEATHER in the briefing or weatherAdvice field EVERY TIME (e.g., "Warm day, hydrate well" or "Headwind on the outbound — practice power on climbs").
- For ${activityLabelShout} marked "${activityLabelShout} (No planned route)" - do NOT mention terrain, elevation, hills, or route characteristics.
${!wellnessContext ? '- CRITICAL: No Garmin or wellness data is connected. Do NOT mention body readiness, recovery, fatigue, body battery, sleep, stress, HRV, or any biometric data.' : ''}
${!resolvedTargetPace ? `- CRITICAL: This ${activityLabel} has NO target pace or target time set by the ${isWalk ? 'walker' : 'runner'}. Do NOT state, suggest, or imply any specific pace figure (e.g. "aim for 6:30/km") anywhere in your response — not even by reusing their historical/recent average pace from the runner profile as if it were a target for this session. Reference effort or feel instead (e.g. "keep it conversational," "${isWalk ? 'walk' : 'run'} by feel today").` : `- The target pace of ${formatPaceForTTS(resolvedTargetPace)} is already correctly calculated — state it exactly as given. Do NOT recompute, round, or re-derive it from the distance and time yourself.`}
- NEVER start with generic greetings like "Hey there!" — jump straight in.
- Be conversational as if speaking directly to the ${isWalk ? 'walker' : 'runner'}. Use "you" and "your."${isWalk ? ' WALK SESSION — never say "run", "runner", "running" in your output.' : ''}
${coachAccent ? `- Write using natural ${coachAccent} English phrasing. The text will be spoken aloud by a ${coachAccent} voice.` : ''}

Respond as JSON with fields: briefing, intensityAdvice, weatherAdvice, warnings (array), ${hasRoute === true ? 'routeInsight' : 'readinessInsight'}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are ${coachName}, a ${coachTone} ${isWalk ? 'walking' : 'running'} coach who uses biometric data for personalized coaching. Respond only with valid JSON. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}${runnerProfileBlock((params as any).runnerProfile)}` },
        { role: "user", content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    
    return {
      briefing: parsed.briefing || (isWalk ? "Ready for your walk! Let's get started." : "Ready for your run! Let's get started."),
      intensityAdvice: parsed.intensityAdvice || "Listen to your body today.",
      weatherAdvice: parsed.weatherAdvice || undefined,
      warnings: parsed.warnings || [],
      readinessInsight: parsed.readinessInsight || (hasRoute ? undefined : isWalk ? "Your body is ready for this walk." : "Your body is ready for this run."),
      routeInsight: parsed.routeInsight || (hasRoute ? terrainDescription : undefined),
      weatherAdvantage: weatherAdvantage || undefined,
    };
  } catch (error) {
    console.error("Error generating wellness-aware briefing:", error);
    return {
      briefing: isWalk ? "Ready for your walk! Take it easy at the start and settle into your walking rhythm." : "Ready for your run! Take it easy at the start and find your rhythm.",
      intensityAdvice: "Start conservatively and adjust based on how you feel.",
      weatherAdvice: undefined,
      warnings: [],
      readinessInsight: hasRoute ? undefined : "Listen to your body and adjust intensity as needed.",
      routeInsight: hasRoute ? terrainDescription : undefined,
      weatherAdvantage: weatherAdvantage || undefined,
    };
  }
}

/**
 * Enhanced coaching context that includes wellness data
 */
export interface EnhancedCoachingContext extends CoachingContext {
  wellness?: WellnessContext;
  targetHeartRateZone?: number;
}

export async function getWellnessAwareCoachingResponse(
  message: string, 
  context: EnhancedCoachingContext
): Promise<string> {
  const systemPrompt = buildEnhancedCoachingSystemPrompt(context);

  // Detect whether the message is asking a general running knowledge question
  // (stitch, cramp, breathing, form, nutrition, etc.) vs a data query.
  // We boost max_tokens for knowledge questions so the answer isn't truncated.
  const isKnowledgeQuestion = isGeneralRunningQuestion(message);
  const maxTokens = isKnowledgeQuestion ? 250 : 150;
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || "Keep going, you're doing great!";
}

/**
 * Returns true when the user's message is asking a general running physiology,
 * technique, or nutrition question rather than requesting data-based feedback.
 * Used to increase the token budget so the answer isn't cut short.
 */
function isGeneralRunningQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  const knowledgeKeywords = [
    'stitch', 'cramp', 'cramps', 'side stitch', 'breathing', 'breathe',
    'blister', 'chafe', 'chafing', 'shin splint', 'shin splints', 'plantar',
    'knee', 'hip', 'calf', 'hamstring', 'quad', 'achilles', 'it band',
    'how do i', 'how should i', 'what should i', 'why am i', 'why do i',
    'what is', 'how to', 'tips for', 'advice on', 'help me',
    'nutrition', 'hydration', 'water', 'gel', 'electrolyte', 'fueling',
    'tired', 'exhausted', 'fatigued', 'heavy legs', 'legs hurt',
    'nausea', 'dizzy', 'dizziness', 'lightheaded', 'headache',
    'form', 'posture', 'stride', 'footstrike', 'heel strike',
    'breathing technique', 'rhythm', 'cadence advice',
    'bored', 'motivation', 'give up', 'want to stop', 'struggling',
  ];
  return knowledgeKeywords.some(kw => lower.includes(kw));
}

function buildEnhancedCoachingSystemPrompt(context: EnhancedCoachingContext): string {
  let prompt = buildCoachingSystemPrompt(context);
  
  // Add wellness context if available
  if (context.wellness) {
    const w = context.wellness;
    let wellnessInfo = '\n\nRUNNER WELLNESS CONTEXT (from Garmin):';
    
    if (w.readinessScore !== undefined) {
      wellnessInfo += `\n- Today's readiness: ${w.readinessScore}/100`;
    }
    if (w.bodyBattery !== undefined) {
      wellnessInfo += `\n- Body Battery: ${w.bodyBattery}/100`;
    }
    if (w.sleepQuality) {
      wellnessInfo += `\n- Last night's sleep: ${w.sleepQuality}`;
    }
    if (w.stressQualifier) {
      wellnessInfo += `\n- Current stress: ${w.stressQualifier}`;
    }
    if (w.hrvStatus) {
      wellnessInfo += `\n- HRV status: ${w.hrvStatus}`;
    }
    
    prompt += wellnessInfo;
    prompt += '\n\nUse this wellness data to personalize your coaching. If readiness is low, encourage an easier effort. If Body Battery is high, they may be able to push harder.';
  }
  
  // Add heart rate zone guidance if available
  if (context.targetHeartRateZone) {
    prompt += `\n\nTARGET HR ZONE: Zone ${context.targetHeartRateZone}. `;
    switch (context.targetHeartRateZone) {
      case 1: prompt += 'Recovery zone - keep it very easy.'; break;
      case 2: prompt += 'Aerobic zone - conversational pace.'; break;
      case 3: prompt += 'Tempo zone - comfortably hard.'; break;
      case 4: prompt += 'Threshold zone - hard but sustainable.'; break;
      case 5: prompt += 'Maximum zone - very hard, short intervals.'; break;
    }
    
    if (context.heartRate) {
      const runnerAge = (context as any).runnerAge;
      const effectiveMaxHR = runnerAge ? calcMaxHR(runnerAge) : 190;
      const currentZone = getHeartRateZoneNumber(context.heartRate, effectiveMaxHR);
      if (currentZone > context.targetHeartRateZone) {
        prompt += ' Runner is ABOVE target zone - encourage them to slow down.';
      } else if (currentZone < context.targetHeartRateZone) {
        prompt += ' Runner is BELOW target zone - they can push a bit harder if they feel good.';
      }
    }
  }
  
  return prompt;
}

function getHeartRateZoneNumber(hr: number, maxHr: number): number {
  const percent = (hr / maxHr) * 100;
  if (percent < 60) return 1;
  if (percent < 70) return 2;
  if (percent < 80) return 3;
  if (percent < 90) return 4;
  return 5;
}

/**
 * Generate real-time coaching message based on current HR and wellness context
 */
export async function generateHeartRateCoaching(params: {
  currentHR: number;
  avgHR: number;
  maxHR: number;
  targetZone?: number;
  elapsedMinutes: number;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  coachGender?: string;
  wellness?: WellnessContext;
  runnerAge?: number;
  fitnessLevel?: string;
  runnerName?: string;
  runnerProfile?: string | null;
  // Session memory
  topicsDiscussed?: string[];
  topicsNotCovered?: string[];
  sessionCueCount?: number;
  lastCueTriggerType?: string;
  minutesSinceLastCue?: number;
  recentCoachingMessages?: string[];
  // Sensor confidence
  hrConfidence?: string;
  gpsConfidence?: string;
  // Physiological response
  lastCueHrDelta?: number;
  lastCuePaceDelta?: number;
  athleteRespondedToLastCue?: boolean;
  // Terrain context — lets HR coach contextualise elevated HR against current terrain
  // Values: flat | rolling | gradual_climb | steep_climb | gradual_descent | steep_descent
  terrain_context?: string;
  activityType?: string;
} & WatchDynamicsParams): Promise<string> {
  const { currentHR, avgHR, maxHR, targetZone, elapsedMinutes, coachName, coachTone, coachAccent, wellness, runnerAge, fitnessLevel, runnerName } = params;
  // currentHR/avgHR/maxHR are required by the type signature but unvalidated — a missing
  // value doesn't crash here (arithmetic on undefined just yields NaN), but NaN comparisons
  // silently fall through to "Zone 5 / Maximum", which is confidently wrong rather than
  // honestly unknown. Log so a casing mismatch is visible instead of masquerading as data.
  if (currentHR == null || avgHR == null) {
    console.warn(`[generateHeartRateCoaching] currentHR or avgHR missing from request body — check client field casing (expected "currentHR"/"avgHR")`);
  }
  const isWalkHR = params.activityType === 'walk';
  const hrPersonLabel = isWalkHR ? 'walker' : 'runner';

  // Use age-adjusted max HR (Tanaka formula: 208 - 0.7×age) — more accurate than device-reported max
  // This prevents incorrect zone assessment early in runs when actual max HR hasn't been reached yet.
  // If age is available, ALWAYS use age-calculated max. Only fall back to device max if age is unknown.
  const effectiveMaxHR = runnerAge ? calcMaxHR(runnerAge) : maxHR;
  const currentZone = getHeartRateZoneNumber(currentHR, effectiveMaxHR);
  const percentMax = Math.round((currentHR / effectiveMaxHR) * 100);
  const runnerFirstName = runnerName ? runnerName.split(' ')[0] : null;
  
  const zoneNames = ['', 'Recovery', 'Aerobic', 'Tempo', 'Threshold', 'Maximum'];
  
  let wellnessContext = '';
  if (wellness) {
    if (wellness.bodyBattery !== undefined && wellness.bodyBattery < 30) {
      wellnessContext = 'Their Body Battery is low today. ';
    }
    if (wellness.sleepQuality === 'Poor' || wellness.sleepQuality === 'Very Poor') {
      wellnessContext += 'They had poor sleep last night. ';
    }
    if (wellness.hrvStatus === 'LOW') {
      wellnessContext += 'HRV is below baseline. ';
    }
  }
  
  // Build runner profile context for personalised HR coaching
  let runnerProfileContext = '';
  if (runnerFirstName) runnerProfileContext += `Runner's name: ${runnerFirstName}. `;
  if (runnerAge) runnerProfileContext += `Age: ${runnerAge} (max HR ~${effectiveMaxHR} bpm). `;
  if (fitnessLevel) runnerProfileContext += `Fitness level: ${fitnessLevel}. `;

  // ── Session memory block ────────────────────────────────────────────────────
  const sessionMemoryBlock = (() => {
    const lines: string[] = [];
    if ((params.sessionCueCount ?? 0) > 0) {
      lines.push(`Cues delivered so far: ${params.sessionCueCount}`);
      if (params.minutesSinceLastCue != null) lines.push(`Time since last cue: ${params.minutesSinceLastCue.toFixed(1)} min`);
      if (params.lastCueTriggerType) lines.push(`Last cue type: ${params.lastCueTriggerType.replace(/_/g, ' ')}`);
    }
    if (params.topicsDiscussed?.length) lines.push(`Topics already covered: ${params.topicsDiscussed.join(', ')}`);
    if (params.topicsNotCovered?.length) lines.push(`Topics not yet addressed: ${params.topicsNotCovered.join(', ')}`);
    if (params.recentCoachingMessages?.length) {
      lines.push(`Recent coaching messages:`);
      params.recentCoachingMessages.forEach(m => lines.push(`  • ${m}`));
    }
    return lines.length ? `\nSession context:\n${lines.join('\n')}\n` : '';
  })();

  // ── Physiological response block ───────────────────────────────────────────
  const physioBlock = (() => {
    if (params.lastCueHrDelta == null && params.lastCuePaceDelta == null) return '';
    const lines: string[] = ['\nAthlete response since last cue:'];
    if (params.lastCueHrDelta != null) {
      const dir = params.lastCueHrDelta < 0 ? `fell ${Math.abs(params.lastCueHrDelta)} bpm` : `rose ${params.lastCueHrDelta} bpm`;
      lines.push(`  Heart rate ${dir}`);
    }
    if (params.lastCuePaceDelta != null) {
      const dir = params.lastCuePaceDelta > 0 ? `slowed by ${params.lastCuePaceDelta}s/km` : `quickened by ${Math.abs(params.lastCuePaceDelta)}s/km`;
      lines.push(`  Pace ${dir}`);
    }
    if (params.athleteRespondedToLastCue === true) {
      lines.push(`  ✓ Athlete is responding — acknowledge this before issuing any new directive`);
    } else if (params.athleteRespondedToLastCue === false) {
      lines.push(`  ✗ No response yet to previous cue — reinforce the message with different wording`);
    }
    return lines.join('\n') + '\n';
  })();

  // ── Sensor confidence note ─────────────────────────────────────────────────
  const sensorNote = params.hrConfidence === 'low'
    ? `\n⚠️ HR confidence is LOW (sensor noise/dropout) — use softer language: "looks around", "appears to be" rather than stating exact numbers as fact.\n`
    : params.hrConfidence === 'medium'
    ? `\nHR confidence is MEDIUM — readings are valid but mention the number with normal confidence.\n`
    : '';

  // Build terrain context for HR coaching — an elevated HR on a steep climb is expected
  // and shouldn't be treated the same as an elevated HR on flat terrain.
  const terrainContextBlock = (() => {
    if (!params.terrain_context || params.terrain_context === 'flat') return '';
    const terrainLabels: Record<string, string> = {
      gradual_climb: 'currently on a gradual climb (3-5% grade)',
      steep_climb: 'currently on a steep climb (>5% grade) — elevated HR here is EXPECTED',
      gradual_descent: 'currently descending gradually — HR should naturally ease',
      steep_descent: 'currently on a steep descent — HR may stay elevated from prior climb',
      rolling: 'on rolling terrain — HR will fluctuate with the undulations',
    };
    const label = terrainLabels[params.terrain_context] ?? `on ${params.terrain_context} terrain`;
    return `\nTerrain context: The ${hrPersonLabel} is ${label}. Factor this into your HR assessment — don't penalise a high HR that's appropriate for the current gradient.\n`;
  })();

  const targetZoneGuidance = targetZone && currentZone !== targetZone
    ? currentZone > targetZone
      ? 'They need to slow down to hit their target zone.'
      : 'They can pick up the pace if feeling good.'
    : '';

  const { system: hrSystemMsg, user: prompt } = (isWalkHR ? walkPrompts : runPrompts).heartRateCoachingPrompt({
    coachName, coachTone, coachAccent, runnerProfileContext, elapsedMinutes,
    currentHR, percentMax, currentZone, zoneName: zoneNames[currentZone], avgHR,
    targetZone, targetZoneName: targetZone ? zoneNames[targetZone] : undefined,
    wellnessContext, terrainContextBlock, sensorNote, sessionMemoryBlock, physioBlock,
    targetZoneGuidance, runnerProfile: params.runnerProfile,
    watchDynamicsContext: buildWatchDynamicsText(params),
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: hrSystemMsg },
        { role: "user", content: prompt }
      ],
      max_tokens: 80,
      temperature: 0.7,
    });

    return completion.choices[0].message.content || `Heart rate at ${currentHR}, Zone ${currentZone}. Keep it steady!`;
  } catch {
    return `Heart rate at ${currentHR} bpm, Zone ${currentZone}. ${currentZone > 3 ? 'Consider easing up.' : 'Looking good!'}`;
  }
}

/**
 * Comprehensive post-run analysis using all Garmin data
 */
export interface GarminActivityData {
  activityType?: string;
  durationInSeconds?: number;
  distanceInMeters?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averagePace?: number;
  averageCadence?: number;
  maxCadence?: number;
  averageStrideLength?: number;
  groundContactTime?: number;
  verticalOscillation?: number;
  verticalRatio?: number;
  elevationGain?: number;
  elevationLoss?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  vo2Max?: number;
  recoveryTime?: number;
  activeKilocalories?: number;
  averagePower?: number;
  heartRateZones?: any;
  laps?: any[];
  splits?: any[];
}

export interface GarminWellnessData {
  // Sleep
  totalSleepSeconds?: number;
  deepSleepSeconds?: number;
  lightSleepSeconds?: number;
  remSleepSeconds?: number;
  sleepScore?: number;
  sleepQuality?: string;
  // Stress/Recovery
  averageStressLevel?: number;
  bodyBatteryCurrent?: number;
  bodyBatteryHigh?: number;
  bodyBatteryLow?: number;
  // HRV
  hrvWeeklyAvg?: number;
  hrvLastNightAvg?: number;
  hrvStatus?: string;
  // Activity
  steps?: number;
  restingHeartRate?: number;
  readinessScore?: number;
  // Respiration/SpO2
  avgSpO2?: number;
  avgWakingRespirationValue?: number;
}

export interface ComprehensiveRunAnalysis {
  summary: string;
  performanceScore: number; // 1-100
  performanceBreakdown?: {
    executionScore: number; // Did they follow the plan?
    effortScore: number; // How hard did they push vs plan?
    consistencyScore: number; // Pace/effort steadiness
  };
  highlights: string[];
  struggles: string[];
  personalBests: string[];
  improvementTips: string[];
  trainingLoadAssessment: string;
  recoveryAdvice: string;
  nextRunSuggestion: string;
  coachMotivationalMessage?: string;
  wellnessImpact?: string;
  weatherImpactAnalysis?: string;
  
  // Professional coaching fields
  comparisonToPreviousRuns?: string; // How this run compares to recent form
  progressionTrend?: string; // Are they improving? What's the trajectory?
  runPatternAnalysis?: string; // Patterns noticed in their running style
  
  pacingStrategy?: {
    assessment: string; // Was pacing smart for this workout type?
    whatWentWell: string; // Pacing decisions that worked
    whatToAdjust: string; // Specific adjustments for next time
  };
  
  fitnessContext?: {
    whatThisRunMeans: string; // Did this build fitness, maintain, or recover?
    sequenceInPlan: string; // How it fits in their training
    adaptationSignals: string; // Signs of adaptation or need for modification
  };
  
  mentalGame?: {
    effortQuality: string; // How hard did they really work?
    paceVariability: string; // Why did pace vary? Fatigue, conditions, effort?
    coachingForNextTime: string; // Mental strategies for similar workouts
  };
  
  strugglePointsAnalysis?: {
    identified: string[]; // What struggles occurred
    likelyReasons: string; // Physiological, pacing, fatigue, terrain?
    preventionStrategy: string; // How to avoid next time
  };
  
  nextWorkoutCoaching?: {
    recommendation: string; // Specific workout and intensity
    reasonWhy: string; // Why this is the right next step
    focusPoints: string[]; // What to pay attention to
  };
  
  technicalAnalysis?: {
    paceAnalysis: string;
    heartRateAnalysis: string;
    cadenceAnalysis: string;
    runningDynamics: string;
    elevationPerformance: string;
  };
  
  garminInsights?: {
    trainingEffect: string;
    vo2MaxTrend: string;
    recoveryTime: string;
  };
}

/**
 * ELEVATION-ADJUSTED CONSISTENCY ANALYSIS
 * 
 * Correlates pace variance with elevation changes to provide fair, context-aware
 * consistency scoring. A 3:00/min variance on a hilly run is excellent; on flat
 * terrain, it's concerning. This analysis makes that distinction.
 */

interface ElevationConsistencyAnalysis {
  expectedVarianceMin: number;  // seconds
  expectedVarianceMax: number;  // seconds
  terrainClassification: 'flat' | 'rolling' | 'hilly' | 'mountainous';
  elevationPerKm: number;
  paceVarianceExplainedByElevation: number;  // 0-100 percent
  elevationAdjustment: number;  // -20 to +20 score adjustment
  explanation: string;
}

/**
 * Calculate the expected pace variance baseline for a given terrain profile.
 * This allows us to assess consistency fairly based on route difficulty.
 */
function calculateExpectedPaceVarianceBaseline(params: {
  elevationGain: number;
  elevationLoss: number;
  distanceKm: number;
}): { min: number; max: number; classification: string; elevationPerKm: number } {
  const avgElevationPerKm = params.elevationGain / (params.distanceKm || 1);
  
  if (avgElevationPerKm < 5) {
    // Flat route — expect very tight consistency
    return {
      min: 30,  // 0:30 spread
      max: 60,  // 1:00 spread
      classification: 'flat',
      elevationPerKm: avgElevationPerKm
    };
  } else if (avgElevationPerKm < 15) {
    // Rolling route — expect moderate variance
    return {
      min: 60,  // 1:00 spread
      max: 120,  // 2:00 spread
      classification: 'rolling',
      elevationPerKm: avgElevationPerKm
    };
  } else if (avgElevationPerKm < 30) {
    // Hilly route — expect significant variance
    return {
      min: 120,  // 2:00 spread
      max: 240,  // 4:00 spread
      classification: 'hilly',
      elevationPerKm: avgElevationPerKm
    };
  } else {
    // Mountainous — expect very high variance
    return {
      min: 240,  // 4:00 spread
      max: 360,  // 6:00 spread
      classification: 'mountainous',
      elevationPerKm: avgElevationPerKm
    };
  }
}

/**
 * Analyze each split to determine how much of the pace variance is attributable
 * to elevation changes vs. form/effort issues.
 * 
 * Rule of thumb: 1% grade ≈ 5-8 seconds per km slower (we use 6s/km/%)
 */
function analyzeElevationImpactOnSplits(splits: Array<{
  pace?: string;
  avgGrade?: number;
  elevGain?: number;
  elevLoss?: number;
}> | undefined): {
  terrainDrivenVariance: number;  // 0-100 percent
  effortDrivenVariance: number;   // 0-100 percent
  splitAnalysis: Array<{
    paceChangeSeconds: number;
    expectedFromGrade: number;
    unexplained: number;
    terrainDriven: boolean;
  }>;
} {
  if (!splits || splits.length < 2) {
    // Not enough data to analyze
    return {
      terrainDrivenVariance: 50,  // Assume balanced
      effortDrivenVariance: 50,
      splitAnalysis: []
    };
  }

  const gradeImpactFactor = 6;  // seconds per km per 1% grade
  let terrainDrivenCount = 0;
  let effortDrivenCount = 0;
  const splitAnalysis = [];

  for (let i = 1; i < splits.length; i++) {
    const current = splits[i];
    const previous = splits[i - 1];

    if (!current.pace || !previous.pace || current.avgGrade === undefined) {
      continue;
    }

    try {
      const currentSec = paceStringToSeconds(current.pace);
      const prevSec = paceStringToSeconds(previous.pace);
      const paceChangeSeconds = currentSec - prevSec;

      // Expected slowdown based on grade
      const expectedSlowdown = (current.avgGrade || 0) * gradeImpactFactor;
      const unexplained = paceChangeSeconds - expectedSlowdown;

      const isTerrainDriven = Math.abs(unexplained) < 5;  // Within 5 second tolerance

      if (isTerrainDriven) {
        terrainDrivenCount++;
      } else {
        effortDrivenCount++;
      }

      splitAnalysis.push({
        paceChangeSeconds,
        expectedFromGrade: expectedSlowdown,
        unexplained,
        terrainDriven: isTerrainDriven
      });
    } catch (e) {
      // Silently skip malformed pace data
      continue;
    }
  }

  const totalSplits = terrainDrivenCount + effortDrivenCount;
  const terrainDrivenVariance = totalSplits > 0 ? (terrainDrivenCount / totalSplits) * 100 : 50;

  return {
    terrainDrivenVariance,
    effortDrivenVariance: 100 - terrainDrivenVariance,
    splitAnalysis
  };
}

/**
 * Calculate the elevation-adjusted consistency score.
 * 
 * This compares actual pace variance against elevation-aware expectations,
 * then adjusts the score based on whether variance is terrain-driven or effort-driven.
 */
function calculateElevationAdjustedConsistencyScore(params: {
  actualPaceSpreadSeconds: number;
  expectedVarianceMin: number;
  expectedVarianceMax: number;
  terrainClassification: string;
  terrainDrivenPercentage: number;  // How much of variance is due to elevation
}): ElevationConsistencyAnalysis {
  let baseScore = 100;

  // Step 1: Base score from variance vs. expected baseline
  if (params.actualPaceSpreadSeconds <= params.expectedVarianceMin) {
    // Tighter than expected — excellent!
    baseScore = 95 + Math.min(5, params.expectedVarianceMin - params.actualPaceSpreadSeconds);
  } else if (params.actualPaceSpreadSeconds <= params.expectedVarianceMax) {
    // Within expected range — proportional score
    const percentage =
      (params.actualPaceSpreadSeconds - params.expectedVarianceMin) /
      (params.expectedVarianceMax - params.expectedVarianceMin);
    baseScore = 70 + 30 * (1 - percentage);  // 70-100 range
  } else {
    // Exceeds expected variance
    const overage = params.actualPaceSpreadSeconds - params.expectedVarianceMax;
    baseScore = Math.max(40, 70 - overage / 10);  // Floor at 40
  }

  // Step 2: Adjustment based on terrain-driven vs. effort-driven variance
  let elevationAdjustment = 0;
  let explanation = '';

  if (params.terrainClassification === 'flat') {
    // On flat terrain, almost all variance should be terrain-driven (form consistency)
    if (params.terrainDrivenPercentage >= 80) {
      elevationAdjustment = +5;
      explanation = `On flat terrain, your variance was primarily from consistent effort — excellent discipline.`;
    } else if (params.terrainDrivenPercentage >= 50) {
      elevationAdjustment = 0;
      explanation = `Your pace varied moderately on flat terrain, suggesting some effort drift.`;
    } else {
      elevationAdjustment = -10;
      explanation = `On flat terrain, your variance suggests form degradation or inconsistent effort.`;
    }
  } else if (params.terrainClassification === 'rolling') {
    // Rolling terrain: expect some natural variance
    if (params.terrainDrivenPercentage >= 80) {
      elevationAdjustment = +8;
      explanation = `Your pace variance matched the rolling terrain perfectly — excellent effort management.`;
    } else if (params.terrainDrivenPercentage >= 50) {
      elevationAdjustment = +3;
      explanation = `Most of your variance was terrain-driven; some effort drift in the latter stages.`;
    } else {
      elevationAdjustment = -5;
      explanation = `Your variance wasn't fully explained by rolling terrain — suggests fatigue impact.`;
    }
  } else if (params.terrainClassification === 'hilly') {
    // Hilly terrain: large variance is expected and intelligent
    if (params.terrainDrivenPercentage >= 85) {
      elevationAdjustment = +15;
      explanation = `Exceptional hill running — your pace varied perfectly with the terrain while maintaining consistent effort.`;
    } else if (params.terrainDrivenPercentage >= 70) {
      elevationAdjustment = +10;
      explanation = `Your pace variance was well-aligned with elevation changes — smart pacing on hills.`;
    } else if (params.terrainDrivenPercentage >= 50) {
      elevationAdjustment = +5;
      explanation = `Mostly terrain-driven variance; some effort issues but good overall hill management.`;
    } else {
      elevationAdjustment = 0;
      explanation = `Your variance exceeded what terrain would predict — fatigue and effort management matters here.`;
    }
  } else if (params.terrainClassification === 'mountainous') {
    // Mountainous: very high variance is expected and shows smart pacing
    if (params.terrainDrivenPercentage >= 80) {
      elevationAdjustment = +15;
      explanation = `Excellent mountainous terrain management — your pace variance reflects intelligent hill strategy.`;
    } else if (params.terrainDrivenPercentage >= 60) {
      elevationAdjustment = +8;
      explanation = `Good terrain awareness in mountainous conditions; some fatigue showing in the latter segments.`;
    } else {
      elevationAdjustment = 0;
      explanation = `Mountainous running is challenging; your variance shows cumulative fatigue effects.`;
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(baseScore + elevationAdjustment)));

  return {
    expectedVarianceMin: params.expectedVarianceMin,
    expectedVarianceMax: params.expectedVarianceMax,
    terrainClassification: params.terrainClassification,
    elevationPerKm: params.expectedVarianceMin / 10,  // Approximation for display
    paceVarianceExplainedByElevation: Math.round(params.terrainDrivenPercentage),
    elevationAdjustment: Math.round(elevationAdjustment),
    explanation
  };
}

/**
 * Generate elevation-aware consistency feedback for the post-run summary.
 * This gets added to the AI prompt to inform the consistency score calculation.
 */
function buildElevationConsistencyContext(params: {
  elevationGain?: number;
  elevationLoss?: number;
  distanceKm?: number;
  kmSplitSummaries?: Array<{ pace?: string; avgGrade?: number; elevGain?: number; elevLoss?: number }>;
  paceSpreadSeconds?: number;
}): ElevationConsistencyAnalysis | null {
  if (!params.distanceKm || params.distanceKm === 0) {
    return null;
  }

  const elevationGain = params.elevationGain || 0;
  const elevationLoss = params.elevationLoss || 0;

  // Calculate expected variance baseline
  const baseline = calculateExpectedPaceVarianceBaseline({
    elevationGain,
    elevationLoss,
    distanceKm: params.distanceKm
  });

  // Analyze how much variance is elevation-driven
  const elevationImpact = analyzeElevationImpactOnSplits(params.kmSplitSummaries);

  // Calculate adjusted score
  const analysis = calculateElevationAdjustedConsistencyScore({
    actualPaceSpreadSeconds: params.paceSpreadSeconds || 0,
    expectedVarianceMin: baseline.min,
    expectedVarianceMax: baseline.max,
    terrainClassification: baseline.classification,
    terrainDrivenPercentage: elevationImpact.terrainDrivenVariance
  });

  return analysis;
}

export async function generateComprehensiveRunAnalysis(params: {
  runData: any;
  // User-selected activity for this session — "run" or "walk".
  sessionType?: string;
  
  // NEW: Rich Garmin watch data from client (Android app sends this)
  garminDataFromWatch?: any;  // { hasGarminData, deviceName, avgGCT, avgVO, etc. }
  userProfileContext?: any;   // { userId, whatIKnowAboutYou, garminInsights, baselines }
  
  garminActivity?: GarminActivityData;
  wellness?: GarminWellnessData;
  weatherImpactAnalysis?: string; // Weather impact analysis from historical data
  previousRuns?: any[];
  userProfile?: { fitnessLevel?: string; age?: number; weight?: number };
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  // Training plan context (if this run is part of a coached plan)
  linkedPlanId?: string;
  planGoalType?: string;
  planProgressWeek?: number;
  planProgressWeeks?: number;
  workoutType?: string;
  workoutIntensity?: string;
  workoutDescription?: string;
  // NEW: Session coaching context (Phase 2 Enhancement)
  sessionInstructions?: {
    aiDeterminedTone: string;
    coachingStyle: any;
    insightFilters: any;
    sessionStructure: any;
    preRunBrief: string;
  };
  coachingEvents?: Array<{
    eventType: string;
    eventPhase: string;
    coachingMessage: string;
    toneUsed: string;
    userEngagement?: string;
    triggeredAt: Date;
  }>;
  expectedSessionGoal?: string;
  runnerProfile?: string | null;
  /** Coaching insight from plan reassessment (or null for users without a plan). */
  coachingInsight?: {
    reason: string;
    recommendation: string;
    adjustmentType: string;
    needsAdjustment: boolean;
  } | null;
  // NEW: Planned workout context for comparative analysis
  plannedWorkout?: {
    workoutType: string;
    distance?: number;
    duration?: number;
    targetPace?: string;
    intensity?: string;
    hrZoneNumber?: number;
    hrZoneMinBpm?: number;
    hrZoneMaxBpm?: number;
    hrZoneScenario?: string;
    effortDescription?: string;
    intervalCount?: number;
    intervalDistanceMeters?: number;
    intervalDurationSeconds?: number;
    restDistanceMeters?: number;
    restDurationSeconds?: number;
    intervalTargetPace?: string;
    restTargetPace?: string;
    intervalHeartRateMin?: number;
    intervalHeartRateMax?: number;
    restHeartRateMax?: number;
    sessionGoal?: string;
    sessionIntent?: string;
    description?: string;
    instructions?: string;
  } | null;
  // Next planned workout from the coaching plan — for a specific, accurate next-session recommendation
  nextPlannedWorkout?: {
    workoutType: string;
    distance?: number;
    duration?: number;
    targetPace?: string;
    scheduledDate?: Date | string;
    description?: string;
    sessionGoal?: string;
    sessionIntent?: string;
    effortLabel?: string;
    hrZoneNumber?: number;
    hrZoneMinBpm?: number;
    hrZoneMaxBpm?: number;
    intervalCount?: number;
    intensity?: string;
  } | null;
}): Promise<ComprehensiveRunAnalysis> {
  const { runData, garminDataFromWatch, userProfileContext, garminActivity, wellness, weatherImpactAnalysis, previousRuns, userProfile, coachName, coachTone, coachAccent, linkedPlanId, planGoalType, planProgressWeek, planProgressWeeks, workoutType, workoutIntensity, workoutDescription, sessionInstructions, coachingEvents, expectedSessionGoal, coachingInsight, plannedWorkout, nextPlannedWorkout } = params;
  const sessionType = params.sessionType === "walk" || runData.sessionType === "walk" ? "walk" : "run";

  // ── Normalize units — DB rule: distance = km, duration = seconds.
  // Legacy rows from old Strava/Garmin importers may have been stored in meters/ms.
  // normalizeRunUnits() uses avgPace as an anchor to detect and correct bad units.
  const { distanceKm: runDistanceKm, durationSec: runDurationSec } = normalizeRunUnits(runData);
  // Prefer Garmin activity distance/duration when present (authoritative source)
  const effectiveDistanceKm = garminActivity?.distanceInMeters
    ? garminActivity.distanceInMeters / 1000
    : runDistanceKm;
  const effectiveDurationSec = garminActivity?.durationInSeconds ?? runDurationSec;

  // Build comprehensive prompt with all available data
  let prompt = `You are ${coachName}, an expert ${sessionType} coach with a ${coachTone} coaching style.

The completed session is a ${sessionType}. Use ${sessionType} terminology throughout this analysis. ${
    sessionType === "walk"
      ? "Say walking, walker, walking pace, and walking effort; do not call the user a runner or describe this as a run."
      : "Say running, runner, running pace, and running effort."
  }

## YOUR COACHING APPROACH:
Your role is to analyze this run and provide professional coaching feedback that:
1. Interprets the data as a COACH would - understanding the context of their training journey, not just reporting numbers
2. Identifies patterns in their running and provides targeted guidance for improvement
3. Acknowledges what went WELL and what needs adjustment - balance honest feedback with motivation
4. Speaks directly to the runner using "you" and "your" in a conversational, personal way
5. Explains WHAT happened and WHY it matters for their fitness progression
6. Gives specific, actionable guidance for their NEXT training session

Think of yourself analyzing a training session you coached in person - you'd understand the context, notice patterns, and guide them forward.

## RUN DATA:
- Distance: ${effectiveDistanceKm > 0 ? formatDistanceForCoaching(effectiveDistanceKm) : '?'}
- Duration: ${effectiveDurationSec > 0 ? Math.floor(effectiveDurationSec / 60) : '?'} minutes
- Average Pace: ${runData.avgPace || (garminActivity?.averagePace ? `${Math.floor(garminActivity.averagePace)}:${Math.floor((garminActivity.averagePace % 1) * 60).toString().padStart(2, '0')}` : 'N/A')}/km
- Session Type: ${sessionType}
- Device Activity Classification: ${runData.activityType || garminActivity?.activityType || 'Not provided'}
- Elevation Gain: ${runData.elevationGain || garminActivity?.elevationGain || 0}m
- Elevation Loss: ${runData.elevationLoss || garminActivity?.elevationLoss || 0}m
`;

  // Heart rate + cadence from the run record itself — added because these were previously
  // ONLY read from `garminActivity` (see hasGarminMetrics block below), a separate table
  // populated exclusively by the legacy Garmin Connect Activity webhook sync. Runs recorded
  // via the live companion app (the app's primary path today) never get a garminActivities
  // row, so HR/cadence were silently dropped from every comprehensive analysis for those
  // runs even though `runData` (the plain runs-table record, always present) has its own
  // avgHeartRate/maxHeartRate/cadence columns. Mirrors the runData-first, garminActivity-
  // fallback pattern the elevation fields above already use.
  const effectiveAvgHR = runData.avgHeartRate || garminActivity?.averageHeartRate;
  const effectiveMaxHR = runData.maxHeartRate || garminActivity?.maxHeartRate;
  const effectiveMinHR = runData.minHeartRate;
  const effectiveAvgCadence = runData.cadence || garminActivity?.averageCadence;
  const effectiveMaxCadence = runData.maxCadence || garminActivity?.maxCadence;
  if (effectiveAvgHR || effectiveMaxHR || effectiveAvgCadence) {
    prompt += `
## HEART RATE & CADENCE:
`;
    if (effectiveAvgHR) prompt += `- Average Heart Rate: ${effectiveAvgHR} bpm\n`;
    if (effectiveMaxHR) prompt += `- Max Heart Rate: ${effectiveMaxHR} bpm\n`;
    if (effectiveMinHR) prompt += `- Min Heart Rate: ${effectiveMinHR} bpm\n`;
    if (runData.avgHeartRateZone) prompt += `- Average Heart Rate Zone: Zone ${runData.avgHeartRateZone}\n`;
    if (effectiveAvgCadence) prompt += `- Average Cadence: ${Math.round(effectiveAvgCadence)} spm\n`;
    if (effectiveMaxCadence) prompt += `- Max Cadence: ${Math.round(effectiveMaxCadence)} spm\n`;
    prompt += `Comment on heart rate and effort where it's meaningful — e.g. whether pace and heart rate moved together (consistent effort) or diverged (fading effort, or conversely holding pace despite rising HR), and reference the actual bpm/zone numbers rather than a vague "effort was high" statement.\n`;
  }

  if (runData.targetTime || runData.targetDistance) {
    const targetMinutes = runData.targetTime ? Math.round(runData.targetTime / 60000) : null;
    prompt += `- Target Distance: ${runData.targetDistance ? `${runData.targetDistance}km` : 'N/A'}\n`;
    prompt += `- Target Time: ${targetMinutes ? `${targetMinutes} minutes` : 'N/A'}\n`;
    if (typeof runData.wasTargetAchieved === "boolean") {
      prompt += `- Target Achieved: ${runData.wasTargetAchieved ? "Yes" : "No"}\n`;
    }
  }

  // Add user profile for personalised analysis
  if (userProfile) {
    prompt += `\n## RUNNER PROFILE:\n`;
    if (userProfile.fitnessLevel) {
      prompt += `- Fitness Level: ${userProfile.fitnessLevel}\n`;
    }
    if (userProfile.age) {
      prompt += `- Age: ${userProfile.age}\n`;
    }
    if (userProfile.weight) {
      prompt += `- Weight: ${userProfile.weight}kg\n`;
    }
    prompt += `Tailor your analysis depth, pacing expectations, and recommendations to this runner's fitness level. `;
    prompt += `For example, a "Newcomer" needs simple encouragement and basic form tips, while a "Competitive" or "Elite" runner expects detailed training load analysis and race-specific insights.\n`;
  }

  // NEW: Add personalization from user profile context (what we know about this runner)
  if (userProfileContext?.whatIKnowAboutYou) {
    prompt += `
## ABOUT THIS RUNNER:
${userProfileContext.whatIKnowAboutYou}`;
    
    if (userProfileContext.garminInsights) {
      prompt += `

### Recent Garmin Data Patterns:
${userProfileContext.garminInsights}`;
    }
  }

  // NEW: Add Garmin watch data from companion app (Sprint 1 Enhancement)
  // This is data streamed directly from the watch during the run
  if (garminDataFromWatch?.hasGarminData) {
    prompt += `
## GARMIN WATCH METRICS (Device: ${garminDataFromWatch.deviceName || 'Garmin Device'})

### Running Dynamics`;
    
    if (garminDataFromWatch.avgGroundContactTime !== null && garminDataFromWatch.avgGroundContactTime !== undefined) {
      prompt += `
- Ground Contact Time: ${garminDataFromWatch.avgGroundContactTime.toFixed(1)}ms`;
      if (garminDataFromWatch.minGroundContactTime && garminDataFromWatch.maxGroundContactTime) {
        prompt += ` (range: ${garminDataFromWatch.minGroundContactTime.toFixed(1)}-${garminDataFromWatch.maxGroundContactTime.toFixed(1)}ms)`;
      }
      if (userProfileContext?.baselineGCT) {
        const diff = garminDataFromWatch.avgGroundContactTime - userProfileContext.baselineGCT;
        const percentChange = ((diff / userProfileContext.baselineGCT) * 100).toFixed(0);
        prompt += ` — baseline: ${userProfileContext.baselineGCT.toFixed(1)}ms (${percentChange > 0 ? '+' : ''}${percentChange}%)`;
      }
    }
    
    if (garminDataFromWatch.avgVerticalOscillation !== null && garminDataFromWatch.avgVerticalOscillation !== undefined) {
      prompt += `
- Vertical Oscillation: ${garminDataFromWatch.avgVerticalOscillation.toFixed(1)}cm`;
      if (garminDataFromWatch.maxVerticalOscillation) {
        prompt += ` (peak: ${garminDataFromWatch.maxVerticalOscillation.toFixed(1)}cm)`;
      }
      if (userProfileContext?.baselineVO) {
        const diff = garminDataFromWatch.avgVerticalOscillation - userProfileContext.baselineVO;
        const percentChange = ((diff / userProfileContext.baselineVO) * 100).toFixed(0);
        prompt += ` — baseline: ${userProfileContext.baselineVO.toFixed(1)}cm (${percentChange > 0 ? '+' : ''}${percentChange}%)`;
      }
    }
    
    if (garminDataFromWatch.avgGroundContactBalance !== null && garminDataFromWatch.avgGroundContactBalance !== undefined) {
      const balance = garminDataFromWatch.avgGroundContactBalance;
      const symmetry = balance >= 48 && balance <= 52 ? "balanced" : balance < 48 ? "left-heavy" : "right-heavy";
      prompt += `
- Ground Contact Balance: ${balance.toFixed(1)}% (${symmetry})`;
    }
    
    if (garminDataFromWatch.avgVerticalRatio !== null && garminDataFromWatch.avgVerticalRatio !== undefined) {
      prompt += `
- Vertical Ratio: ${garminDataFromWatch.avgVerticalRatio.toFixed(1)}% (oscillation/stride efficiency)`;
    }
    
    if (garminDataFromWatch.avgStrideLength !== null && garminDataFromWatch.avgStrideLength !== undefined) {
      prompt += `
- Average Stride: ${garminDataFromWatch.avgStrideLength.toFixed(2)}m`;
      if (garminDataFromWatch.minStrideLength && garminDataFromWatch.maxStrideLength) {
        prompt += ` (range: ${garminDataFromWatch.minStrideLength.toFixed(2)}-${garminDataFromWatch.maxStrideLength.toFixed(2)}m)`;
      }
      if (userProfileContext?.baselineStride) {
        const diff = garminDataFromWatch.avgStrideLength - userProfileContext.baselineStride;
        const percentChange = ((diff / userProfileContext.baselineStride) * 100).toFixed(0);
        prompt += ` — baseline: ${userProfileContext.baselineStride.toFixed(2)}m (${percentChange > 0 ? '+' : ''}${percentChange}%)`;
      }
    }

    // Training metrics
    if (garminDataFromWatch.aerobicTrainingEffect !== null || garminDataFromWatch.anaerobicTrainingEffect !== null || garminDataFromWatch.recoveryTimeMinutes !== null || garminDataFromWatch.vo2MaxEstimate !== null) {
      prompt += `

### Training Load`;
      
      if (garminDataFromWatch.aerobicTrainingEffect !== null && garminDataFromWatch.aerobicTrainingEffect !== undefined) {
        prompt += `
- Aerobic Training Effect: ${garminDataFromWatch.aerobicTrainingEffect.toFixed(1)}/5.0`;
      }
      if (garminDataFromWatch.anaerobicTrainingEffect !== null && garminDataFromWatch.anaerobicTrainingEffect !== undefined) {
        prompt += `
- Anaerobic Training Effect: ${garminDataFromWatch.anaerobicTrainingEffect.toFixed(1)}/5.0`;
      }
      if (garminDataFromWatch.recoveryTimeMinutes !== null && garminDataFromWatch.recoveryTimeMinutes !== undefined) {
        prompt += `
- Recovery Time: ${Math.round(garminDataFromWatch.recoveryTimeMinutes / 60)} hours (${garminDataFromWatch.recoveryTimeMinutes} min)`;
      }
      if (garminDataFromWatch.vo2MaxEstimate !== null && garminDataFromWatch.vo2MaxEstimate !== undefined) {
        prompt += `
- VO2 Max Estimate: ${garminDataFromWatch.vo2MaxEstimate.toFixed(1)}ml/kg/min`;
        if (userProfileContext?.baselineVO2Max) {
          const diff = garminDataFromWatch.vo2MaxEstimate - userProfileContext.baselineVO2Max;
          prompt += ` (baseline: ${userProfileContext.baselineVO2Max.toFixed(1)}ml/kg/min, change: ${diff > 0 ? '+' : ''}${diff.toFixed(1)})`;
        }
      }
    }

    // Fatigue context
    if (garminDataFromWatch.estimatedFatigue !== null && garminDataFromWatch.estimatedFatigue !== undefined) {
      prompt += `

### Fatigue & Recovery Context
Estimated fatigue level: ${garminDataFromWatch.estimatedFatigue}%`;
      if (garminDataFromWatch.estimatedFatigue >= 60) {
        prompt += ` (HIGH — expect form degradation and need for recovery)`;
      } else if (garminDataFromWatch.estimatedFatigue >= 30) {
        prompt += ` (MODERATE — some form compromise expected due to accumulated effort)`;
      } else {
        prompt += ` (LOW — strong form expected)`;
      }
      prompt += `\nConsider fatigue level when evaluating form metrics and pacing decisions.`;
    }

    // Terrain context
    if (garminDataFromWatch.terrainSummary) {
      prompt += `

### Course Profile
Terrain: ${garminDataFromWatch.terrainSummary}
Consider how terrain affects reasonable pacing and form expectations.`;
    }
  }

  // Add training plan context if available
  if (linkedPlanId || workoutType) {
    prompt += `
## TRAINING PLAN CONTEXT:
${planProgressWeek && planProgressWeeks ? `- Week ${planProgressWeek} of ${planProgressWeeks} in the training plan` : ''}
- Workout Type: ${workoutType || 'general run'} (${workoutDescription || 'no specific description'})
- Heart Rate Zone Target: ${workoutIntensity || 'not specified'}

**CRITICAL**: This run is part of a structured training plan.
- Tailor your feedback to whether this run achieved its specific goal (e.g., "Zone 2 aerobic building" or "tempo pace maintenance").
${planProgressWeek && planProgressWeeks ? `- Reference the week number and progression ("Week ${planProgressWeek} of ${planProgressWeeks}").` : ''}
- If it's an easy/recovery workout, praise consistency and recovery focus. If it's a tempo or interval session, emphasize quality and progression.
- Highlight how this specific run contributed to the overall plan progression.
`;
  }

  // NEW: Add planned workout comparative context (Phase 2 Enhancement)
  if (plannedWorkout) {
    prompt += `
## PLANNED WORKOUT EXPECTATIONS VS. ACTUAL PERFORMANCE:

**Planned Session Goal**: ${plannedWorkout.sessionGoal || plannedWorkout.sessionIntent || 'General fitness building'}
**Workout Type**: ${plannedWorkout.workoutType}
`;

    // Inject workout philosophy — replaces hardcoded per-type expectation blocks.
    // Same training science, applied universally to any workout type without branching.
    const postRunPhilosophy = getWorkoutPhilosophy(plannedWorkout.workoutType);
    const postRunPhilosophyBlock = formatPhilosophyForPrompt(postRunPhilosophy, plannedWorkout.workoutType, {
      includeCelebrate: false,
      includeWarningSigns: false,
    });
    prompt += `\n${postRunPhilosophyBlock}\n`;

    // Add the specific planned targets for comparison — these are factual, not philosophical
    const isIntervalSession = ['intervals', 'hill_repeats', 'fartlek', 'repeats'].includes(plannedWorkout.workoutType);
    prompt += `
**Planned Session Targets** (compare actual performance against these):
- Distance: ${plannedWorkout.distance || '?'}km
- Duration: ${plannedWorkout.duration ? `${Math.round(plannedWorkout.duration / 60)} minutes` : '?'}
- Target Pace: ${plannedWorkout.targetPace || 'by effort'} /km
${plannedWorkout.hrZoneNumber ? `- Overall HR Zone: Zone ${plannedWorkout.hrZoneNumber} (${plannedWorkout.hrZoneMinBpm}–${plannedWorkout.hrZoneMaxBpm} BPM)` : ''}
${isIntervalSession && plannedWorkout.intervalCount ? `- Structure: ${plannedWorkout.intervalCount} × ${plannedWorkout.intervalDistanceMeters ? `${(plannedWorkout.intervalDistanceMeters / 1000).toFixed(2)}km` : plannedWorkout.intervalDurationSeconds ? `${Math.round(plannedWorkout.intervalDurationSeconds / 60)} min` : '?'}` : ''}
${isIntervalSession && plannedWorkout.intervalTargetPace ? `- Work Interval Pace: ${plannedWorkout.intervalTargetPace} /km` : ''}
${isIntervalSession && plannedWorkout.intervalHeartRateMin && plannedWorkout.intervalHeartRateMax ? `- Work Interval HR: ${plannedWorkout.intervalHeartRateMin}–${plannedWorkout.intervalHeartRateMax} BPM` : ''}
${isIntervalSession && plannedWorkout.restHeartRateMax ? `- Recovery HR Target: < ${plannedWorkout.restHeartRateMax} BPM` : ''}
${isIntervalSession && plannedWorkout.restDurationSeconds ? `- Recovery Duration: ${Math.round(plannedWorkout.restDurationSeconds / 60)} min` : ''}

**Performance Analysis Lens** — ${postRunPhilosophy.completionNote}
`;

    // KEY COMPARISONS block removed — WorkoutPhilosophy already defines how to evaluate success
    // (successCriteria, completionNote). GPT derives the relevant comparisons from the philosophy
    // + planned targets above. Generic metric checklists are redundant and reduce coaching quality.
  }

  // ── Coaching Insight from Plan Reassessment ────────────────────────────────
  // When the runner has an active training plan, reassessTrainingPlansWithRunData()
  // runs immediately after save and stores its reason + recommendation on the run.
  // We surface that directly in the summary so the runner sees the coach's assessment.
  // For users WITHOUT a plan, we ask the AI to generate the equivalent assessment inline
  // (no extra API call — it's part of the same completion).
  if (coachingInsight?.reason) {
    prompt += `
## TRAINING LOAD ASSESSMENT (AI Coach Analysis):
Your training coach performed an immediate post-run analysis. Include these findings prominently in your summary:

**Assessment**: ${coachingInsight.reason}

**Coach's Recommendation**: ${coachingInsight.recommendation}

${coachingInsight.needsAdjustment
  ? `⚠️ **Action Required** (${coachingInsight.adjustmentType?.replace(/_/g, ' ')}): The coach flagged that training adjustments are needed based on this run. Make sure this is clearly communicated to the runner.`
  : `✅ **Training on Track**: The coach assessed no immediate adjustments are needed, though the recommendation above should still be shared.`
}

Weave these coaching insights naturally into your analysis rather than quoting them verbatim.
`;
  } else {
    // No plan reassessment ran (user has no training plan) — ask the AI to generate
    // an equivalent insight as part of this analysis.
    prompt += `
## TRAINING LOAD ASSESSMENT (generate this as part of your analysis):
Since this runner does not have a structured training plan, assess the training load of this specific run and provide:
1. A brief assessment of whether the training load was appropriate (referencing HR, pace, duration, and any struggle data)
2. One specific, actionable recommendation for their next session
Make this feel like a natural part of the summary — not a separate section header.
`;
  }

  // Add session coaching context (Phase 2 Enhancement)
  if (sessionInstructions || coachingEvents?.length) {
    prompt += `
## SESSION COACHING CONTEXT (Planned vs. Delivered):
`;
    if (sessionInstructions) {
      prompt += `
**Planned Coaching Approach:**
- Tone: ${sessionInstructions.aiDeterminedTone} (${sessionInstructions.coachingStyle?.encouragementLevel || 'moderate'} encouragement)
- Detail Level: ${sessionInstructions.coachingStyle?.detailDepth || 'moderate'}
- Technical Depth: ${sessionInstructions.coachingStyle?.technicalDepth || 'moderate'}
- Pre-Run Brief: "${sessionInstructions.preRunBrief}"
- Focus Metrics: ${sessionInstructions.insightFilters?.include?.join(', ') || 'standard metrics'}
- De-emphasize: ${sessionInstructions.insightFilters?.exclude?.join(', ') || 'none'}
`;
    }
    
    if (coachingEvents && coachingEvents.length > 0) {
      prompt += `
**Coaching Delivered During Run (${coachingEvents.length} cues):**
`;
      coachingEvents.forEach((event: any, index: number) => {
        prompt += `${index + 1}. [${event.eventPhase || 'general'}] "${event.coachingMessage}" (Tone: ${event.toneUsed}, Engagement: ${event.userEngagement || 'not logged'})\n`;
      });
    }
    
    prompt += `
**Analysis Guidance:**
- How well did the actual run execution match the planned session goals?
- Was the coached tone appropriate and effective for this runner?
- Did the runner respond well to the coaching cues? 
- Provide specific insights on coaching effectiveness.
`;
  }

  // ── Next coaching plan session context ───────────────────────────────────────
  // When this run is part of a coaching plan and we know the next session,
  // inject it so `nextRunSuggestion` and `nextWorkoutCoaching` reference the
  // ACTUAL upcoming session rather than giving generic advice.
  if (nextPlannedWorkout) {
    const nextDistStr = nextPlannedWorkout.distance ? `${nextPlannedWorkout.distance.toFixed(1)}km` : null;
    const nextDurStr = nextPlannedWorkout.duration ? `${Math.round(nextPlannedWorkout.duration / 60)} min` : null;
    const nextPaceStr = nextPlannedWorkout.targetPace ?? null;
    const nextHrStr = (nextPlannedWorkout.hrZoneMinBpm && nextPlannedWorkout.hrZoneMaxBpm)
      ? `${nextPlannedWorkout.hrZoneMinBpm}–${nextPlannedWorkout.hrZoneMaxBpm} bpm`
      : null;
    const nextDateStr = nextPlannedWorkout.scheduledDate
      ? new Date(nextPlannedWorkout.scheduledDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
      : null;
    const nextLabel = nextPlannedWorkout.effortLabel || nextPlannedWorkout.workoutType;
    const nextIntervalStr = nextPlannedWorkout.intervalCount
      ? `${nextPlannedWorkout.intervalCount} intervals`
      : null;

    prompt += `
## NEXT COACHING PLAN SESSION:
The runner's actual next scheduled workout is:

- **Type**: ${nextLabel}${nextDistStr ? ` — ${nextDistStr}` : ''}${nextDurStr ? ` (~${nextDurStr})` : ''}
${nextPaceStr ? `- **Target Pace**: ${nextPaceStr}/km\n` : ''}\
${nextHrStr ? `- **Heart Rate Zone**: ${nextHrStr}\n` : ''}\
${nextIntervalStr ? `- **Structure**: ${nextIntervalStr}\n` : ''}\
${nextPlannedWorkout.description ? `- **Session focus**: ${nextPlannedWorkout.description}\n` : ''}\
${nextPlannedWorkout.sessionIntent ? `- **Intent**: ${nextPlannedWorkout.sessionIntent}\n` : ''}\
${nextDateStr ? `- **Scheduled**: ${nextDateStr}\n` : ''}
**CRITICAL INSTRUCTION**: Your \`nextRunSuggestion\` field MUST reference this specific upcoming session — its type, distance, and how it follows logically from this run. Do NOT give generic recovery or easy run advice. Tell the runner what they are actually doing next and why it makes sense in the plan.

Your \`nextWorkoutCoaching\` recommendation and focusPoints should be specific preparation advice for THIS actual next session — what to focus on, what to watch out for, how today's run prepares them for it.
`;
  }

  // Add Garmin activity metrics if available
  // Only include this section if we have meaningful Garmin data
  const hasGarminMetrics = garminActivity && (
    garminActivity.averageHeartRate ||
    garminActivity.maxHeartRate ||
    garminActivity.averageCadence ||
    garminActivity.averageStrideLength ||
    garminActivity.groundContactTime ||
    garminActivity.verticalOscillation ||
    garminActivity.verticalRatio ||
    garminActivity.averagePower ||
    garminActivity.aerobicTrainingEffect ||
    garminActivity.anaerobicTrainingEffect ||
    garminActivity.vo2Max ||
    garminActivity.recoveryTime ||
    garminActivity.activeKilocalories
  );
  
  if (hasGarminMetrics) {
    prompt += `
## GARMIN ACTIVITY METRICS:
`;
    if (garminActivity.averageHeartRate) {
      prompt += `- Average Heart Rate: ${garminActivity.averageHeartRate} bpm\n`;
    }
    if (garminActivity.maxHeartRate) {
      prompt += `- Max Heart Rate: ${garminActivity.maxHeartRate} bpm\n`;
    }
    if (garminActivity.averageCadence) {
      prompt += `- Average Cadence: ${Math.round(garminActivity.averageCadence)} spm\n`;
    }
    if (garminActivity.averageStrideLength) {
      prompt += `- Average Stride Length: ${(garminActivity.averageStrideLength * 100).toFixed(0)}cm\n`;
    }
    if (garminActivity.groundContactTime) {
      prompt += `- Ground Contact Time: ${Math.round(garminActivity.groundContactTime)}ms\n`;
    }
    if (garminActivity.verticalOscillation) {
      prompt += `- Vertical Oscillation: ${garminActivity.verticalOscillation.toFixed(1)}cm\n`;
    }
    if (garminActivity.verticalRatio) {
      prompt += `- Vertical Ratio: ${garminActivity.verticalRatio.toFixed(1)}%\n`;
    }
    if (garminActivity.averagePower) {
      prompt += `- Average Running Power: ${Math.round(garminActivity.averagePower)}W\n`;
    }
    if (garminActivity.aerobicTrainingEffect) {
      prompt += `- Aerobic Training Effect: ${garminActivity.aerobicTrainingEffect.toFixed(1)}/5.0\n`;
    }
    if (garminActivity.anaerobicTrainingEffect) {
      prompt += `- Anaerobic Training Effect: ${garminActivity.anaerobicTrainingEffect.toFixed(1)}/5.0\n`;
    }
    if (garminActivity.vo2Max) {
      prompt += `- Estimated VO2 Max: ${garminActivity.vo2Max.toFixed(0)} ml/kg/min\n`;
    }
    if (garminActivity.recoveryTime) {
      prompt += `- Recommended Recovery: ${garminActivity.recoveryTime} hours\n`;
    }
    if (garminActivity.activeKilocalories) {
      prompt += `- Active Calories: ${garminActivity.activeKilocalories} kcal\n`;
    }
  }

  // Add wellness context if available
  if (wellness) {
    prompt += `
## PRE-RUN WELLNESS STATE (from Garmin):
`;
    if (wellness.totalSleepSeconds) {
      const sleepHours = wellness.totalSleepSeconds / 3600;
      prompt += `- Sleep: ${sleepHours.toFixed(1)} hours`;
      if (wellness.sleepScore) prompt += ` (score: ${wellness.sleepScore}/100)`;
      if (wellness.sleepQuality) prompt += ` - ${wellness.sleepQuality}`;
      prompt += '\n';
      if (wellness.deepSleepSeconds && wellness.remSleepSeconds) {
        const deepHours = wellness.deepSleepSeconds / 3600;
        const remHours = wellness.remSleepSeconds / 3600;
        prompt += `  - Deep sleep: ${deepHours.toFixed(1)}h, REM: ${remHours.toFixed(1)}h\n`;
      }
    }
    if (wellness.bodyBatteryCurrent !== undefined) {
      prompt += `- Body Battery: ${wellness.bodyBatteryCurrent}/100`;
      if (wellness.bodyBatteryHigh && wellness.bodyBatteryLow) {
        prompt += ` (range today: ${wellness.bodyBatteryLow}-${wellness.bodyBatteryHigh})`;
      }
      prompt += '\n';
    }
    if (wellness.averageStressLevel !== undefined) {
      prompt += `- Average Stress Level: ${wellness.averageStressLevel}/100\n`;
    }
    if (wellness.hrvStatus) {
      prompt += `- HRV Status: ${wellness.hrvStatus}`;
      if (wellness.hrvLastNightAvg) prompt += ` (last night avg: ${wellness.hrvLastNightAvg.toFixed(0)}ms)`;
      prompt += '\n';
    }
    if (wellness.restingHeartRate) {
      prompt += `- Resting Heart Rate: ${wellness.restingHeartRate} bpm\n`;
    }
    if (wellness.readinessScore !== undefined) {
      prompt += `- Body Readiness Score: ${wellness.readinessScore}/100\n`;
    }
    if (wellness.avgSpO2) {
      prompt += `- Blood Oxygen (SpO2): ${wellness.avgSpO2}%\n`;
    }
    if (wellness.steps) {
      prompt += `- Steps before run: ${wellness.steps}\n`;
    }
  }

  // Add weather impact analysis if available
  if (weatherImpactAnalysis) {
    prompt += `
## WEATHER IMPACT ON THIS RUN:
Based on the runner's historical data from ${previousRuns?.length || 'recent'} runs, here's how weather affected this run:
${weatherImpactAnalysis}

Acknowledge how weather conditions impacted performance in your analysis.
`;
  }

  // Add historical context if available
  if (previousRuns && previousRuns.length > 0) {
    prompt += `
## RECENT RUN HISTORY (last ${Math.min(previousRuns.length, 10)} runs):
Use this to identify patterns in their running - pace trends, consistency, pacing strategy, heart rate patterns, etc.
`;
    previousRuns.slice(0, 10).forEach((run, i) => {
      const { distanceKm: prevDist } = normalizeRunUnits(run);
      prompt += `${i + 1}. ${prevDist > 0 ? formatDistanceForCoaching(prevDist) : '?'} at ${run.avgPace || 'N/A'}/km`;
      if (run.avgHeartRate) prompt += `, ${run.avgHeartRate}bpm`;
      if (run.wasChallenging) prompt += ` [challenging]`;
      if (run.wasEasy) prompt += ` [easy]`;
      prompt += '\n';
    });
    prompt += `
PATTERN ANALYSIS GUIDANCE:
- Are they getting faster? Slower? Maintaining?
- Is their pace consistent or variable across runs?
- How do they handle different distances?
- Are there patterns in when they struggle?
- How does their heart rate respond to effort?
- Any improvements since previous weeks?
`;
  }

  // Add runner-confirmed struggle points (dismissed ones already excluded by the server)
  const strugglePoints: any[] = Array.isArray(runData.strugglePoints) ? runData.strugglePoints : [];
  if (strugglePoints.length > 0) {
    prompt += `
## RUNNER-CONFIRMED STRUGGLE POINTS (${strugglePoints.length} detected, dismissed ones excluded):
These are real pace drops the runner confirmed as genuine difficulties — not stops like traffic lights or shoe tying.
`;
    strugglePoints.forEach((sp: any, i: number) => {
      const distKm = sp.distanceMeters != null ? formatDistanceForCoaching(sp.distanceMeters / 1000) : '?';
      const drop = sp.paceDropPercent != null ? `${Math.round(sp.paceDropPercent)}% pace drop` : '';
      const hr = sp.heartRate != null ? `, HR ${sp.heartRate}bpm` : '';
      const grade = sp.currentGrade != null ? `, grade ${sp.currentGrade.toFixed(1)}%` : '';
      prompt += `${i + 1}. At ${distKm} — pace dropped from ${sp.baselinePace || '?'}/km to ${sp.paceAtStruggle || '?'}/km (${drop}${hr}${grade})`;
      if (sp.userComment) {
        prompt += `\n   Runner's note: "${sp.userComment}"`;
      }
      prompt += '\n';
    });
    prompt += `Use these struggle points in your analysis — explain likely causes (fatigue, elevation, pacing, etc.) and give targeted advice for each km zone.\n`;
  }

  // Add runner's overall post-run comments
  if (runData.userComments) {
    prompt += `
## RUNNER'S POST-RUN NOTES:
"${runData.userComments}"
Take these notes into account when assessing performance and writing your summary — the runner may have context about conditions, how they felt, or external factors that the data alone can't show.\n`;
  }

  // Add elevation-aware consistency context
  // Use the already-normalized effective distance (handles mixed meter/km legacy rows)
  const distanceKm = effectiveDistanceKm;
  const elevationConsistencyAnalysis = buildElevationConsistencyContext({
    elevationGain: runData.elevationGain || garminActivity?.elevationGain || 0,
    elevationLoss: runData.elevationLoss || garminActivity?.elevationLoss || 0,
    distanceKm,
    kmSplitSummaries: runData.kmSplitSummaries,
    paceSpreadSeconds: runData.paceSpreadSeconds
  });

  if (elevationConsistencyAnalysis) {
    const formatVarianceSeconds = (seconds: number) => {
      const min = Math.floor(seconds / 60);
      const sec = Math.round(seconds % 60);
      return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    prompt += `
## ELEVATION-AWARE CONSISTENCY CONTEXT:
This run is classified as: ${elevationConsistencyAnalysis.terrainClassification.toUpperCase()} terrain (${elevationConsistencyAnalysis.elevationPerKm.toFixed(1)}m elevation gain per km).

For this terrain type, we expect pace variance between ${formatVarianceSeconds(elevationConsistencyAnalysis.expectedVarianceMin)} and ${formatVarianceSeconds(elevationConsistencyAnalysis.expectedVarianceMax)}.

Actual pace variance: ${runData.paceSpreadSeconds ? formatVarianceSeconds(runData.paceSpreadSeconds) : 'unknown'}
Variance explained by elevation: ${elevationConsistencyAnalysis.paceVarianceExplainedByElevation}%

CRITICAL FOR CONSISTENCY SCORE:
- On FLAT terrain: Pace variance is purely about form/effort consistency — tighter spread is better
- On ROLLING/HILLY/MOUNTAINOUS terrain: Pace variance matching elevation changes is INTELLIGENT pacing, not inconsistency
- If variance is elevation-driven (split pace matches grade changes): SCORE HIGHER for smart pacing
- If variance is unexplained by terrain: SCORE LOWER for fatigue/form issues

Context: "${elevationConsistencyAnalysis.explanation}"
`;
  }

  // Build dynamic JSON schema based on available data
  let analysisSchema = `## ANALYSIS REQUIRED:
Based on ALL the data above, provide a comprehensive JSON coaching analysis. Always include:
{
  "summary": "2-3 sentence personalized summary of the run - speak directly to them ('you')",
  "performanceScore": <1-100>,
  "performanceBreakdown": {
    "executionScore": <1-100: Did they follow the plan?>,
    "effortScore": <1-100: How hard did they push relative to what was prescribed?>,
    "consistencyScore": <1-100: How steady was pace/effort? ELEVATION-AWARE: Use the elevation context provided above. On flat terrain, score based on pace variance alone. On rolling/hilly/mountainous terrain, score higher if variance matches elevation changes (intelligent pacing) and lower if variance exceeds what terrain would predict (fatigue/form issues). Compare actual variance to the expected baseline for this terrain type.>
  },
  "highlights": ["3-5 specific positive aspects of this run"],
  "struggles": ["Real challenges or areas to improve"],
  "personalBests": ["Any notable achievements or PRs"],
  "improvementTips": ["3-4 specific, actionable tips for similar workouts"],
  "trainingLoadAssessment": "Did this build fitness, maintain, or aid recovery?",
  "recoveryAdvice": "Specific recovery recommendations based on effort and data",
  "coachMotivationalMessage": "Brief, personal motivation or recognition of their effort",
  "nextRunSuggestion": "${nextPlannedWorkout ? 'Reference the actual next coaching plan session provided above — its type, distance, and why it logically follows this run' : 'Specific type of run to do next (e.g., Easy 5km recovery run tomorrow or Rest day — your body needs it)'}",
  
  "runPatternAnalysis": "Patterns you notice in how they run (negative splits, fade, consistent, etc.) based on this run and recent history",
  "comparisonToPreviousRuns": "How this run compares to their recent form (faster, slower, more consistent, harder effort, etc.)",
  "progressionTrend": "Are they improving? What's the trajectory? (E.g., 'Pace improving weekly' or 'Consistency improving across distance')",
  
  "pacingStrategy": {
    "assessment": "Was the pacing smart for this workout type?",
    "whatWentWell": "Which pacing decisions worked well",
    "whatToAdjust": "Specific pacing changes for next similar workout"
  },
  
  "fitnessContext": {
    "whatThisRunMeans": "What this effort tells us about their fitness progression",
    "sequenceInPlan": "How this fits in their overall training plan or week",
    "adaptationSignals": "Signs they're adapting well or need modification"
  },
  "mentalGame": {
    "effortQuality": "How hard did they really push vs what was prescribed?",
    "paceVariability": "Why did pace change? Terrain, effort/fatigue, pacing strategy? CRITICAL: First correlate pace changes with elevation — if splits slow on climbs (proportional to grade), that's SMART effort-based running. If pace varies unexplained by terrain, that indicates fatigue or form issues. Use elevation context provided above to distinguish terrain-driven variance (praise!) from fatigue-driven variance (coaching).",
    "coachingForNextTime": "Mental strategies or focus points for similar workouts"
  },
  "strugglePointsAnalysis": {
    "likelyReasons": "Why did the struggles happen? (fatigue, pacing, terrain, fitness gap?)",
    "preventionStrategy": "How to avoid or manage these in future runs"
  },
  "nextWorkoutCoaching": {
    "recommendation": "${nextPlannedWorkout ? 'Reference the actual scheduled next session from the coaching plan above' : 'Specific type and intensity (e.g., 5km easy Z1 run)'}",
    "reasonWhy": "Why this is the right next step for their recovery/progression — connect it explicitly to this run",
    "focusPoints": ["${nextPlannedWorkout ? 'Specific preparation tip for the actual next session' : 'What to emphasize or monitor in the next run'}"]
  }`;

  // Only include technical analysis if we have relevant Garmin data
  if (hasGarminMetrics) {
    analysisSchema += `,
  "technicalAnalysis": {
    "paceAnalysis": "Pace consistency, splits, efficiency - use actual data. Reference the elevation context above when evaluating consistency fairness.",
    "heartRateAnalysis": "HR zones, cardiovascular response, zones used",
    "cadenceAnalysis": "Step rate assessment and efficiency",
    "runningDynamics": "Stride, ground contact, oscillation if available",
    "elevationPerformance": "How they handled hills/elevation. If the run had elevation: Assess whether their pace/HR/cadence changes matched the climb difficulty proportionally. Smart hill running = pace down proportionally to grade, HR elevated (normal), cadence maintained. Grade-to-pace correlation indicates excellent hill technique. Use the elevation analysis context provided above."
  },
  "trainingLoadAssessment": "Training stimulus (aerobic/anaerobic effect) and what it means",
  "garminInsights": {
    "trainingEffect": "Interpretation of aerobic/anaerobic training effect scores",
    "vo2MaxTrend": "VO2 max context and what it means for their fitness",
    "recoveryTime": "Recovery recommendation and why it's realistic"
  }`;
  } else {
    analysisSchema += `,
  "trainingLoadAssessment": "Assessment of training load and stimulus (based on pace, effort, duration)"`;
  }

  // Include wellness impact only if we have wellness data
  if (wellness) {
    analysisSchema += `,
  "wellnessImpact": "How their wellness state (sleep, stress, battery, HRV) affected performance today"`;
  }

  analysisSchema += `
}

CRITICAL COACHING INSTRUCTIONS:
- Speak directly to the runner using "you" and "your"
- Always reference actual numbers from their data
- Compare this run to their recent history when relevant
- Focus on ACTIONABLE guidance they can use immediately
- Explain the "why" behind your observations
- Balance honesty with encouragement
- Be specific - avoid generic advice
- Make it feel like a personal coaching conversation, not a data report`;
  
  prompt += analysisSchema;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: `You are ${coachName}, an expert ${sessionType === 'walk' ? 'walking coach' : 'running coach'} with deep knowledge of exercise physiology, training methodology, and athlete psychology.${sessionType === 'walk' ? ' WALK SESSION — NEVER say "run", "running", "runner", "sprint", or any running-specific term in your analysis. This person WALKED. Use "walk", "walking", "walker", "walking pace" throughout.' : ''}

YOUR COACHING PHILOSOPHY:
- Interpret data in the context of their training journey, not just report numbers
- Identify patterns and trends that reveal their ${sessionType === 'walk' ? 'walking' : 'running'} style, strengths, and areas to develop
- Balance honest feedback with motivation and recognition of effort
- Provide specific, actionable guidance they can use immediately
- Explain the "why" behind your recommendations - help them understand their body and fitness

RESPONSE STYLE:
- Write conversationally, as if you're having a coaching session with them
- Use their actual performance data to back up your observations
- Reference their previous ${sessionType === 'walk' ? 'walks' : 'runs'} when analyzing patterns
- Make personalized recommendations based on their fitness level and goals

Respond only with valid JSON. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}${runnerProfileBlock(params.runnerProfile)}`
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 2500,
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    
    // Build response with only relevant fields based on available data
    const response: any = {
      summary: parsed.summary || "Great run today!",
      performanceScore: parsed.performanceScore || 75,
      highlights: parsed.highlights || ["Completed your run!"],
      struggles: parsed.struggles || [],
      personalBests: parsed.personalBests || [],
      improvementTips: parsed.improvementTips || ["Keep up the great work!"],
      trainingLoadAssessment: parsed.trainingLoadAssessment || "Moderate training load.",
      recoveryAdvice: parsed.recoveryAdvice || "Get adequate rest and hydration.",
      nextRunSuggestion: parsed.nextRunSuggestion || "An easy recovery run in 24-48 hours.",
    };

    // Add performance breakdown if provided
    if (parsed.performanceBreakdown) {
      response.performanceBreakdown = {
        executionScore: parsed.performanceBreakdown.executionScore || parsed.performanceScore || 75,
        effortScore: parsed.performanceBreakdown.effortScore || parsed.performanceScore || 75,
        consistencyScore: parsed.performanceBreakdown.consistencyScore || parsed.performanceScore || 75,
      };
    }

    // Add professional coaching fields if provided
    if (parsed.coachMotivationalMessage) {
      response.coachMotivationalMessage = parsed.coachMotivationalMessage;
    }

    if (parsed.comparisonToPreviousRuns) {
      response.comparisonToPreviousRuns = parsed.comparisonToPreviousRuns;
    }

    if (parsed.progressionTrend) {
      response.progressionTrend = parsed.progressionTrend;
    }

    if (parsed.runPatternAnalysis) {
      response.runPatternAnalysis = parsed.runPatternAnalysis;
    }

    if (parsed.pacingStrategy) {
      response.pacingStrategy = {
        assessment: parsed.pacingStrategy.assessment || "",
        whatWentWell: parsed.pacingStrategy.whatWentWell || "",
        whatToAdjust: parsed.pacingStrategy.whatToAdjust || "",
      };
    }

    if (parsed.fitnessContext) {
      response.fitnessContext = {
        whatThisRunMeans: parsed.fitnessContext.whatThisRunMeans || "",
        sequenceInPlan: parsed.fitnessContext.sequenceInPlan || "",
        adaptationSignals: parsed.fitnessContext.adaptationSignals || "",
      };
    }

    if (parsed.mentalGame) {
      response.mentalGame = {
        effortQuality: parsed.mentalGame.effortQuality || "",
        paceVariability: parsed.mentalGame.paceVariability || "",
        coachingForNextTime: parsed.mentalGame.coachingForNextTime || "",
      };
    }

    if (parsed.strugglePointsAnalysis) {
      response.strugglePointsAnalysis = {
        identified: parsed.strugglePointsAnalysis.identified || [],
        likelyReasons: parsed.strugglePointsAnalysis.likelyReasons || "",
        preventionStrategy: parsed.strugglePointsAnalysis.preventionStrategy || "",
      };
    }

    if (parsed.nextWorkoutCoaching) {
      response.nextWorkoutCoaching = {
        recommendation: parsed.nextWorkoutCoaching.recommendation || "",
        reasonWhy: parsed.nextWorkoutCoaching.reasonWhy || "",
        focusPoints: parsed.nextWorkoutCoaching.focusPoints || [],
      };
    }

    // Include wellness impact only if we have wellness data
    if (wellness) {
      response.wellnessImpact = parsed.wellnessImpact || "Your wellness state supported this effort.";
    }

    // Include weather analysis if available
    if (weatherImpactAnalysis) {
      response.weatherImpactAnalysis = weatherImpactAnalysis;
    }

    // Include technical analysis and Garmin insights only if we have Garmin metrics
    if (hasGarminMetrics) {
      response.technicalAnalysis = {
        paceAnalysis: parsed.technicalAnalysis?.paceAnalysis || "Pace data not available.",
        heartRateAnalysis: parsed.technicalAnalysis?.heartRateAnalysis || "Heart rate data not available.",
        cadenceAnalysis: parsed.technicalAnalysis?.cadenceAnalysis || "Cadence data not available.",
        runningDynamics: parsed.technicalAnalysis?.runningDynamics || "Running dynamics not available.",
        elevationPerformance: parsed.technicalAnalysis?.elevationPerformance || "Elevation data not available.",
      };
      response.garminInsights = {
        trainingEffect: parsed.garminInsights?.trainingEffect || "Training effect data not available.",
        vo2MaxTrend: parsed.garminInsights?.vo2MaxTrend || "VO2 max data not available.",
        recoveryTime: parsed.garminInsights?.recoveryTime || "Recovery time estimate not available.",
      };
    }

    return response;
  } catch (error) {
    console.error("Error generating comprehensive run analysis:", error);
    // Build error response with only relevant fields
    const errorResponse: any = {
      summary: "Great effort on your run today!",
      performanceScore: 70,
      highlights: ["Completed your run", "Stayed consistent"],
      struggles: [],
      personalBests: [],
      improvementTips: ["Keep training consistently", "Focus on recovery"],
      trainingLoadAssessment: "Training load recorded.",
      recoveryAdvice: "Rest well and stay hydrated.",
      nextRunSuggestion: "Take a rest day or do an easy run.",
    };

    // Include wellness impact only if we have wellness data
    if (wellness) {
      errorResponse.wellnessImpact = "Unable to assess wellness impact.";
    }

    // Include weather analysis if available
    if (weatherImpactAnalysis) {
      errorResponse.weatherImpactAnalysis = weatherImpactAnalysis;
    }

    // Include technical analysis and Garmin insights only if we have Garmin metrics
    if (hasGarminMetrics) {
      errorResponse.technicalAnalysis = {
        paceAnalysis: "Analysis unavailable.",
        heartRateAnalysis: "Analysis unavailable.",
        cadenceAnalysis: "Analysis unavailable.",
        runningDynamics: "Analysis unavailable.",
        elevationPerformance: "Analysis unavailable.",
      };
      errorResponse.garminInsights = {
        trainingEffect: "Data unavailable.",
        vo2MaxTrend: "Data unavailable.",
        recoveryTime: "Data unavailable.",
      };
    }

    return errorResponse;
  }
}

// ============================================================
// REAL-TIME ELITE COACHING — additional coaching triggers
// beyond the existing pace/split/struggle/phase/cadence system
// ============================================================

export type EliteCoachingType =
  | 'technique_form'        // Periodic running form & technique coaching
  | 'milestone'             // Progress milestone celebrations (25%, 50%, 75%)
  | 'positive_reinforcement'// Reinforce consistent pacing, negative splits, strong effort
  | 'target_eta'            // Projected finish time vs target
  | 'pace_trend'            // Gradual pace drift detection (not sudden drop like struggle)
  | 'elevation_insight'     // How elevation is affecting their pace right now
  | 'heart_rate_check'      // HR-focused coaching for zone 2 sessions (with HR device)
  | 'final_500m'            // Last 500m motivational push
  | 'final_250m'            // Last 250m — building sprint intensity toward the finish
  | 'final_100m';           // Last 100m — maximum intensity finish line push

export interface EliteCoachingParams {
  coachingType: EliteCoachingType;
  distance: number;
  targetDistance?: number;
  currentPace: string;
  averagePace: string;
  elapsedTime: number; // seconds
  coachName: string;
  coachTone: string;
  hasRoute: boolean;

  // Optional context — sent when available
  heartRate?: number;
  cadence?: number;
  currentGrade?: number;
  totalElevationGain?: number;
  totalElevationLoss?: number;
  targetTime?: number; // seconds
  targetPace?: string;
  targetHeartRateZone?: number; // 1-5; for Zone 1-2, skip speed-focused coaching

  // Type-specific context
  milestonePercent?: number;              // for 'milestone'
  kmSplits?: Array<{ km: number; pace: string }>;  // for pace_trend, positive_reinforcement
  paceTrendDirection?: 'slowing' | 'speeding_up' | 'consistent'; // for pace_trend
  paceTrendDeltaPerKm?: number;           // seconds drift per km
  projectedFinishTime?: number;           // seconds, for target_eta
  consecutiveConsistentSplits?: number;   // for positive_reinforcement
  isNegativeSplitting?: boolean;          // for positive_reinforcement
  fastestSplitKm?: number;               // for positive_reinforcement
  fastestSplitPace?: string;             // for positive_reinforcement
  targetTimeCategory?: 'on_track' | 'strong_effort' | 'no_mention'; // for final_500m, final_100m
  etaOverTargetPercent?: number;         // how far over target as % (negative = under)
  remainingMeters?: number;              // meters remaining for final triggers

  // Session type — "run" | "walk". Controls coaching vocabulary and suppresses
  // run-specific cues (cadence targets, pace splits vs walking pace, etc.) for walk sessions.
  activityType?: string;

  // ── Technique coaching — specific category selected by the Android app ──────
  // The app picks a category (e.g. "breathing_rhythm", "mental_smile") from its
  // rotation system and sends a short factual description of that technique point
  // here so the AI focuses on that one area rather than choosing generically. This
  // is deliberately a concept description, not ready-to-speak prose — the AI is
  // instructed to write its own original coaching language from it (see the
  // 'technique_form' case below). Kept concept-level after a real-world report of
  // coaching sounding hardcoded/repetitive traced back to this hint text (and a
  // similar issue in the elevation-coaching prompt) previously being full,
  // reusable, quotable sentences that the AI echoed near-verbatim across runs.
  techniqueCategory?: string;          // e.g. "posture_shoulders", "breathing_rhythm"
  techniqueHint?: string;              // Factual description of the technique point — not a script
  runPhase?: string;                   // EARLY | BUILDING | SUSTAINING | FINISHING
  isUphill?: boolean;
  fatigueLevel?: string;               // FRESH | MODERATE | FATIGUED
  recentTechniqueCategories?: string[]; // Last 3-5 categories used (for variety context)

  // Coaching programme context — populated when run is a scheduled plan workout
  trainingPlanId?: string;
  workoutId?: string;
  workoutType?: string;       // easy | tempo | intervals | long_run | hill_repeats | recovery
  workoutDescription?: string;
  planGoalType?: string;      // 5k | 10k | half_marathon | marathon
  planWeekNumber?: number;
  planTotalWeeks?: number;
  runnerProfile?: string | null;

  // ── Session memory ─────────────────────────────────────────────────────────
  topicsDiscussed?: string[];
  topicsNotCovered?: string[];
  sessionCueCount?: number;
  lastCueTriggerType?: string;
  minutesSinceLastCue?: number;
  recentCoachingMessages?: string[];

  // ── Sensor confidence ──────────────────────────────────────────────────────
  hrConfidence?: string;        // "high" | "medium" | "low"
  gpsConfidence?: string;       // "high" | "medium" | "low"
  cadenceConfidence?: string;   // "high" | "medium" | "low" | undefined if no sensor

  // ── Physiological response to last cue ────────────────────────────────────
  lastCueHrDelta?: number;                  // bpm change since last cue (negative = fell)
  lastCuePaceDelta?: number;               // sec/km change (positive = slower)
  athleteRespondedToLastCue?: boolean;

  // ── Live terrain state (from state-based classifier in RunTrackingService) ──
  // flat | gradual_climb | steep_climb | gradual_descent | steep_descent | rolling
  // Sent with all coaching requests so the LLM can reference terrain as context.
  // Only present when terrain is non-flat (omitted for pure flat terrain).
  currentTerrainState?: string;
}

export async function generateEliteCoaching(params: EliteCoachingParams): Promise<string> {
  const {
    coachingType, distance, targetDistance, currentPace, averagePace, elapsedTime,
    coachName, coachTone, hasRoute,
    heartRate, cadence, currentGrade, totalElevationGain, totalElevationLoss,
    targetTime, targetPace, targetHeartRateZone, milestonePercent, kmSplits,
    paceTrendDirection, paceTrendDeltaPerKm,
    projectedFinishTime, consecutiveConsistentSplits, isNegativeSplitting,
    fastestSplitKm, fastestSplitPace,
    targetTimeCategory, etaOverTargetPercent, remainingMeters,
    techniqueCategory, techniqueHint, runPhase, isUphill, fatigueLevel, recentTechniqueCategories,
    trainingPlanId, workoutType, workoutDescription, planGoalType, planWeekNumber, planTotalWeeks
  } = params;

  const isWalkSession = resolveActivityType(params) === 'walk';

  // For Zone 1-2 aerobic/recovery runs, skip speed-focused coaching (final pushes, sprint finishes)
  // FINAL KM is different — if they're in Zone 4-5, that's appropriate for a finishing push
  // Only constrain HR if they're in a recovery/easy zone (Z1-Z2) during the final stage
  // For interval/threshold work in the final km, pushing into Z4-5 is EXPECTED and GOOD
  if ((coachingType === 'final_500m' || coachingType === 'final_100m') && targetHeartRateZone && targetHeartRateZone <= 2) {
    // Only suppress sprint coaching if this is a RECOVERY session (Z1-Z2 target)
    return `Great work maintaining Zone ${targetHeartRateZone}! Keep the effort steady to the finish. Focus on your breathing and heart rate, not the pace.`;
  }

  // For training plan sessions, disable "push hard" final sprint coaching
  // Training sessions are about executing the plan, not racing — "finish strong" is not relevant
  if ((coachingType === 'final_500m' || coachingType === 'final_100m') && trainingPlanId && workoutType) {
    // Instead of sprint motivation, focus on steady effort and plan completion
    return `Excellent effort on this ${workoutType.replace(/_/g, ' ')} session! Keep your current effort steady for the final stretch. You're right on track with your training plan.`;
  }

  const timeMin = Math.floor(elapsedTime / 60);
  const progress = targetDistance ? Math.round((distance / targetDistance) * 100) : 0;
  const remaining = targetDistance ? formatDistanceForCoaching(targetDistance - distance) : '?';
  const spokenPace = formatPaceForTTS(currentPace);
  const spokenAvgPace = formatPaceForTTS(averagePace);
  const spokenTargetPace = formatPaceForTTS(targetPace);

  const _elevGradeKnown = typeof currentGrade === 'number' && Math.abs(currentGrade) > 0.5;
  const noTerrainRule = (hasRoute || _elevGradeKnown) ? '' : `\nCRITICAL: No GPS elevation data. Do NOT mention hills, terrain, elevation, climbing, descending, or any terrain characteristics.`;

  // Walk session vocabulary policy — injected into every prompt for walk sessions
  const walkSessionRule = isWalkSession
    ? `\nWALK SESSION POLICY: This is a WALKING session. Use "walker/walking" vocabulary, NOT "runner/running". NEVER mention cadence targets, spm, steps per minute, or suggest the walker "increase their turnover". Cadence is available as context only. Focus on: movement quality, posture, arm swing, rhythm, aerobic effort, HR zones, and enjoyment. Heart rate coaching is MORE valuable than pace coaching for most walkers.`
    : '';

  // Build runner status block (shared across all types)
  let status = `${isWalkSession ? 'Walker' : 'Runner'} Status:
- Distance: ${formatDistanceForCoaching(distance)}${targetDistance ? ` of ${formatDistanceForCoaching(targetDistance)} (${progress}%)` : ''} — ${remaining} remaining
- Time: ${timeMin} minutes
- Current pace: ${spokenPace}
- Average pace: ${spokenAvgPace}`;
  if (heartRate && heartRate > 0) status += `\n- Heart rate: ${heartRate} bpm`;
  // Cadence is context-only for walk sessions — do not coach spm targets for walking
  if (cadence && cadence > 0) status += isWalkSession
    ? `\n- Step rate (context only, do NOT coach): ~${cadence} spm`
    : `\n- Cadence: ${cadence} spm`;
  if (hasRoute && totalElevationGain && totalElevationGain > 0) status += `\n- Elevation climbed: ${Math.round(totalElevationGain)}m`;
  if (hasRoute && typeof currentGrade === 'number' && currentGrade !== null && Math.abs(currentGrade) > 2) status += `\n- Current gradient: ${currentGrade.toFixed(1)}%`;
  if (kmSplits && kmSplits.length > 0) status += `\n- Splits: ${kmSplits.map(s => `km${s.km}=${s.pace}`).join(', ')}`;

  // Coaching programme context — adds plan awareness to every insight
  if (trainingPlanId && planGoalType) {
    const goalLabel = planGoalType.replace('_', ' ').toUpperCase();
    status += `\n\nCoaching Programme Context:`;
    status += `\n- This run is a SCHEDULED WORKOUT in the runner's AI coaching programme`;
    status += `\n- Programme goal: ${goalLabel}`;
    if (planWeekNumber && planTotalWeeks) {
      status += `\n- Week ${planWeekNumber} of ${planTotalWeeks}`;
    }
    if (workoutType) {
      status += `\n- Session type: ${workoutType.replace('_', ' ')}`;
    }
    if (workoutDescription) {
      status += `\n- Today's workout: "${workoutDescription}"`;
    }
    status += `\nUse this context to give plan-aware coaching — reference their ${goalLabel} goal, compare current effort to what this workout is building towards, and reinforce how today's session fits the bigger picture.`;
  }

  // ── Session memory block ────────────────────────────────────────────────────
  if ((params.sessionCueCount ?? 0) > 0 || params.topicsDiscussed?.length) {
    status += `\n\nSession memory (what has already been covered this run):`;
    if (params.sessionCueCount != null) status += `\n- Cues delivered so far: ${params.sessionCueCount}`;
    if (params.minutesSinceLastCue != null) status += `\n- Time since last cue: ${params.minutesSinceLastCue.toFixed(1)} min`;
    if (params.lastCueTriggerType) status += `\n- Last cue type: ${params.lastCueTriggerType.replace(/_/g, ' ')}`;
    if (params.topicsDiscussed?.length) status += `\n- Topics already covered: ${params.topicsDiscussed.join(', ')}`;
    if (params.topicsNotCovered?.length) status += `\n- Topics not yet discussed: ${params.topicsNotCovered.join(', ')} — consider these if relevant to current moment`;
    if (params.recentCoachingMessages?.length) {
      status += `\n- Recent messages: ${params.recentCoachingMessages.slice(-2).map(m => `"${m}"`).join(' | ')}`;
    }
    status += `\n→ Vary your coaching focus — don't repeat the same topic that was just covered unless the situation has materially changed.`;
  }

  // ── Sensor confidence ────────────────────────────────────────────────────────
  const sensorWarnings: string[] = [];
  if (params.hrConfidence === 'low') sensorWarnings.push('HR confidence LOW — use "looks around X bpm" not "heart rate is X bpm"');
  if (params.gpsConfidence === 'low') sensorWarnings.push('GPS confidence LOW — distance/pace figures may be slightly off; avoid over-precision');
  if (params.cadenceConfidence === 'low') sensorWarnings.push('Cadence confidence LOW — do not cite cadence as fact');
  if (sensorWarnings.length) {
    status += `\n\n⚠️ Sensor notes: ${sensorWarnings.join('; ')}`;
  }

  // ── Live terrain state (state-based classifier) ─────────────────────────────
  // Only present when non-flat — use as context enrichment, not as a standalone coaching topic.
  // The dedicated elevation coaching function handles terrain as its primary subject.
  if (params.currentTerrainState && params.currentTerrainState !== 'flat') {
    const terrainLabels: Record<string, string> = {
      gradual_climb: 'gradual climb (3-5% grade)',
      steep_climb: 'steep climb (>5% grade)',
      gradual_descent: 'gradual descent (3-5% grade)',
      steep_descent: 'steep descent (>5% grade)',
      rolling: 'rolling / undulating terrain',
    };
    const terrainLabel = terrainLabels[params.currentTerrainState] ?? params.currentTerrainState;
    status += `\n\nTerrain context: The ${isWalkSession ? 'walker' : 'runner'} is currently on ${terrainLabel}. `;
    if (params.currentTerrainState.includes('climb')) {
      status += 'Climbing slows pace — a pace drop on this terrain is normal and expected.';
    } else if (params.currentTerrainState.includes('descent')) {
      status += 'Descending speeds pace — gravity is helping them right now.';
    } else if (params.currentTerrainState === 'rolling') {
      status += 'Pace variation on rolling terrain is terrain-driven, not effort-driven.';
    }
  }

  // ── Physiological response to last cue ────────────────────────────────────────
  if (params.lastCueHrDelta != null || params.lastCuePaceDelta != null) {
    status += `\n\nAthlete response since last cue:`;
    if (params.lastCueHrDelta != null) {
      const dir = params.lastCueHrDelta < 0 ? `fell ${Math.abs(params.lastCueHrDelta)} bpm ↓` : `rose ${params.lastCueHrDelta} bpm ↑`;
      status += `\n- Heart rate ${dir}`;
    }
    if (params.lastCuePaceDelta != null) {
      const dir = params.lastCuePaceDelta > 0 ? `slowed ${params.lastCuePaceDelta}s/km ↓` : `quickened ${Math.abs(params.lastCuePaceDelta)}s/km ↑`;
      status += `\n- Pace ${dir}`;
    }
    if (params.athleteRespondedToLastCue === true) {
      status += `\n→ Athlete IS responding — acknowledge their adjustment before issuing any new directive.`;
    } else if (params.athleteRespondedToLastCue === false) {
      status += `\n→ No response yet to previous cue — reinforce with different wording or fresh angle.`;
    }
  }

  let typePrompt = '';
  let systemExtra = '';

  switch (coachingType) {

    case 'technique_form': {
      // ── Build category-specific coaching cue ──────────────────────────────
      // The Android app selects the category (e.g. "breathing_rhythm", "mental_smile",
      // "posture_shoulders") from its rotation system and sends:
      //   techniqueCategory — the selected category key
      //   techniqueHint     — the exact coaching cue text to deliver
      //   recentTechniqueCategories — what was recently coached (for variety context)
      //
      // We MUST use this category — the rotation system on the device ensures the
      // full library of 40+ coaching types gets used, not just the ones that happen
      // to match generic conditionals.

      // ── Walk session policy ────────────────────────────────────────────────
      // Cadence-specific technique categories are irrelevant for walking and should
      // be transparently redirected to walking movement quality instead.
      const CADENCE_SPECIFIC_CATEGORIES = ['feet_cadence', 'stride_frequency_consistency', 'cadence_turnover'];
      const isCadenceCategory = techniqueCategory && CADENCE_SPECIFIC_CATEGORIES.includes(techniqueCategory);

      if (isWalkSession && isCadenceCategory) {
        // Redirect to walking rhythm coaching — same technique slot, different topic
        const walkRhythmPrompt = `WALK SESSION — Coaching moment: walking rhythm and movement quality.

${status}

This is a WALK session. Coach one of the following walking-specific movement qualities:
- Walking posture: stand tall, gaze forward, shoulders relaxed and dropped, natural arm swing
- Walking arm drive: bend elbows ~90°, swing arms forward and back (not across body) — drives forward momentum
- Walking foot placement: push off through toes at the back of each stride to keep the movement flowing
- Walking rhythm: a smooth, settled, purposeful rhythm — not marching, not shuffling
${heartRate ? `- Effort and HR: at ${heartRate} bpm, ${heartRate < 100 ? 'they could push slightly harder for better aerobic benefit' : heartRate < 130 ? 'they\'re in a great aerobic zone — keep it here' : 'they\'re working hard — conversational effort is the sweet spot for fitness walking'}` : ''}

Give 1-2 sentences. Do NOT mention "cadence", "spm", "steps per minute", or any numerical step targets. Sound natural and encouraging.`;

        typePrompt = walkRhythmPrompt;
        systemExtra = `You are ${coachName}, a supportive ${coachTone} walking coach. Walking is its own discipline — coach movement quality, posture, rhythm, and effort. Never say "cadence", "spm", or "steps per minute".`;
        break;
      }

      const isAerobicZone = targetHeartRateZone && targetHeartRateZone <= 2;

      // Format recent categories for context (so AI doesn't repeat them)
      const recentCatContext = recentTechniqueCategories && recentTechniqueCategories.length > 0
        ? `\nYou have RECENTLY coached: ${recentTechniqueCategories.join(', ')}. Do NOT repeat these — coach the NEW category assigned below.`
        : '';

      if (techniqueCategory && techniqueHint) {
        // ── Primary path: use the app-selected category ────────────────────
        // Map category keys to human-readable labels for the prompt
        const categoryLabel = techniqueCategory
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());

        // Group the category to set the right system persona
        const isBreathing   = techniqueCategory.startsWith('breathing');
        const isMental      = techniqueCategory.startsWith('mental');
        const isRecovery    = techniqueCategory.startsWith('recovery');
        const isHill        = techniqueCategory.startsWith('hill');
        const isPacing      = techniqueCategory.startsWith('pacing');
        const isHydration   = techniqueCategory.startsWith('hydration') || techniqueCategory.startsWith('fueling');
        const isWeather     = techniqueCategory.startsWith('weather');
        const isBodySignal  = techniqueCategory.startsWith('body');
        const isHR          = techniqueCategory.startsWith('hr_');

        let systemPersona: string;
        if (isBreathing)        systemPersona = isWalkSession ? 'You are an expert in walking breathing mechanics. Coach exactly the breathing technique specified — specific, actionable, spoken aloud while walking.' : 'You are an expert in running breathing mechanics. Coach exactly the breathing technique specified — specific, actionable, spoken aloud while running.';
        else if (isMental)      systemPersona = isWalkSession ? 'You are a sports psychologist and walking coach specialising in mental toughness. Deliver the mental coaching cue naturally as if mid-walk conversation.' : 'You are a sports psychologist and running coach specialising in mental toughness. Deliver the mental coaching cue naturally as if mid-run conversation.';
        else if (isRecovery)    systemPersona = isWalkSession ? 'You are a walking coach specialising in in-session recovery and tension release. Guide the walker through the specific recovery action.' : 'You are a running coach specialising in in-run recovery and tension release. Guide the runner through the specific recovery action.';
        else if (isHill)        systemPersona = isWalkSession ? 'You are a hill walking specialist. Coach the specific hill technique the walker needs right now.' : 'You are a hill running specialist. Coach the specific hill technique the runner needs right now.';
        else if (isPacing)      systemPersona = isWalkSession ? 'You are an elite walking pace and effort coach. Deliver the specific pacing cue with context from their current session data.' : 'You are an elite pacing and race strategy coach. Deliver the specific pacing cue with context from their current run data.';
        else if (isHydration)   systemPersona = isWalkSession ? 'You are a sports nutrition and hydration coach. Give the hydration/fueling cue conversationally while the walker is mid-walk.' : 'You are a sports nutrition and hydration coach. Give the hydration/fueling cue conversationally while the runner is mid-run.';
        else if (isWeather)     systemPersona = isWalkSession ? 'You are a walking coach specialising in environmental adaptation. Coach the weather-specific strategy for today\'s conditions.' : 'You are a running coach specialising in environmental adaptation. Coach the weather-specific strategy for today\'s conditions.';
        else if (isBodySignal)  systemPersona = isWalkSession ? 'You are a walking coach and physiotherapist. Coach the body awareness cue — help the walker tune in to their body\'s signals.' : 'You are a running coach and physiotherapist. Coach the body awareness cue — help the runner tune in to their body\'s signals.';
        else if (isHR)          systemPersona = 'You are a heart rate and training zone specialist. Deliver the HR-focused coaching cue referencing their current heart rate data.';
        else                    systemPersona = isWalkSession ? 'You specialize in walking biomechanics and form coaching. Deliver one highly specific, actionable technique cue — never generic.' : 'You specialize in running biomechanics and form coaching. Deliver one highly specific, actionable technique cue — never generic.';

        typePrompt = `COACHING TYPE: ${isWalkSession ? 'Walking' : 'Running'} technique — ${categoryLabel}
${recentCatContext}

${status}
${noTerrainRule}

ASSIGNED TECHNIQUE AREA: ${categoryLabel}
TECHNIQUE FOCUS (the factual coaching point — NOT a script; write your own original coaching language from it): ${techniqueHint}

Your task: coach this technique point in a natural, conversational 2-3 sentence spoken coaching message, in your own words.
${isWalkSession ? 'This is a WALK session — NEVER say "run", "running", "runner", or "sprint". Say "walk", "walking", "walker" instead.\n' : ''}
Rules:
1. Coach ONLY the "${categoryLabel}" area — do NOT switch to a different technique.
2. Make it specific and immediately actionable — the ${isWalkSession ? 'walker' : 'runner'} should be able to apply it in the next 10 seconds.
3. Reference at least one real data point from their run (pace, HR, distance, elapsed time) to make it feel personalised.
4. Do NOT say "great job" or give generic praise — just coach the technique.
5. Keep it natural and conversational — this is spoken aloud while the runner is moving.
6. Invent your own phrasing, imagery, and metaphor — do not reuse a stock or clichéd cue phrase. The same technique area will come up again on future runs and for other runners; make this instance sound freshly generated, not recited.
${cadence ? `\nCurrent cadence: ${cadence} spm` : ''}
${heartRate ? `\nCurrent heart rate: ${heartRate} bpm` : ''}
${isUphill || (currentGrade && Math.abs(currentGrade) > 3) ? `\nCurrently ${currentGrade && currentGrade > 0 ? 'climbing' : 'descending'} (grade: ${currentGrade?.toFixed(1)}%)` : ''}
${fatigueLevel ? `\nFatigue level: ${fatigueLevel}` : ''}
${runPhase ? `\nRun phase: ${runPhase}` : ''}`;

        systemExtra = systemPersona;

      } else if (isAerobicZone) {
        // ── Aerobic zone fallback (no category sent) ───────────────────────
        typePrompt = `COACHING TYPE: Zone 2 aerobic comfort check.

${status}
${noTerrainRule}
${recentCatContext}

For this Zone 2 AEROBIC BASE BUILD session, pick ONE of the following to coach:
- Breathing rhythm — steady and conversational, diaphragmatic breathing
- Relaxation — jaw, shoulders, and arms should be relaxed and tension-free
- Cadence feel — light, quick steps without overstriding
- Mental comfort — this easy pace is where adaptation happens, trust the process

Give a 2-3 sentence conversational coaching message. Reference at least one data point.`;
        systemExtra = 'For this Zone 2 session, emphasize comfort and sustainability. Coach breathing, relaxation, or the value of easy-pace adaptation.';

      } else {
        // ── Generic fallback (no category, no aerobic zone) ────────────────
        // This should rarely fire now that the app always sends a category.
        // Deliberately avoids the arm-swing default by cycling through areas.
        const genericAreas = [
          { area: 'posture', focus: 'tall spine, level chin, shoulders relaxed and dropped away from the ears' },
          { area: 'breathing', focus: 'belly breathing rather than chest breathing, roughly matched to their stride' },
          { area: 'foot strike', focus: 'landing under the hips rather than out in front — quick, light steps reduce impact' },
          { area: 'core engagement', focus: 'a gentle core brace that stabilises the whole stride' },
          { area: 'mental focus', focus: 'a quick scan for held tension (jaw, hands, shoulders) and consciously releasing it' },
        ];
        // Pick pseudo-randomly based on elapsed time so different cues fire at different points
        const pick = genericAreas[Math.floor(elapsedTime / 120) % genericAreas.length];

        typePrompt = `COACHING TYPE: ${isWalkSession ? 'Walking' : 'Running'} form check — ${pick.area}.

${status}
${noTerrainRule}
${recentCatContext}

Coach this specific area: ${pick.area}
Technique focus (a factual point, not a script — write your own original coaching language from it): ${pick.focus}

Give a 2-3 sentence conversational coaching message. Make it immediately actionable. Reference at least one data point from their run. Invent your own phrasing — do not reuse a stock cue phrase across different runs.`;
        systemExtra = 'Deliver one specific, actionable form cue. Never use arm swing as the default — there are many coaching areas to explore.';
      }
      break;
    }

    case 'milestone': {
      // For Zone 2 runs, emphasize aerobic adaptation happening in real-time
      const isAerobicMilestone = targetHeartRateZone && targetHeartRateZone <= 2;
      const aerobicMilestoneContext = isAerobicMilestone 
        ? `\nZONE 2 AEROBIC MILESTONE: Every kilometer at this steady effort is building your aerobic base. You're accumulating time in the mitochondrial adaptation zone. This sustainable effort is where real endurance is built.`
        : '';
      
      typePrompt = `COACHING TYPE: Milestone celebration — ${isWalkSession ? 'walker' : 'runner'} just hit ${milestonePercent}% of their target distance!

${status}
${noTerrainRule}
${aerobicMilestoneContext}

The ${isWalkSession ? 'walker' : 'runner'} just reached ${milestonePercent}% of ${formatDistanceForCoaching(distance)}.

Context for your response:
- Progress: ${milestonePercent}% done
- Pace: ${spokenPace}
${targetTime ? `- Projected finish: ${projectedFinishTime ? Math.floor(projectedFinishTime / 60) + ' minutes' : 'unknown'} vs target ${Math.floor(targetTime / 60)} minutes` : ''}
${isAerobicMilestone ? '- This is an aerobic base-building session' : ''}

Give a 2-3 sentence message that fits this moment. Reference their actual numbers. The tone should suit where they are in the run.`;
      systemExtra = 'Coach the moment — reference real data from their run. Tone adapts to their progress and effort level.';
      break;
    }

    case 'positive_reinforcement':
      typePrompt = `COACHING TYPE: Positive reinforcement — the ${isWalkSession ? 'walker' : 'runner'} is executing well!

${status}
${noTerrainRule}

The ${isWalkSession ? 'walker' : 'runner'} deserves recognition for strong execution:
${consecutiveConsistentSplits && consecutiveConsistentSplits >= 3 ? `- They've ${isWalkSession ? 'walked' : 'run'} ${consecutiveConsistentSplits} consecutive consistent splits — excellent pacing discipline!` : ''}
${isNegativeSplitting ? `- They are NEGATIVE SPLITTING (getting faster as the ${isWalkSession ? 'walk' : 'run'} progresses) — this is elite-level pacing!` : ''}
${fastestSplitKm && fastestSplitPace ? `- Their fastest split was km ${fastestSplitKm} at ${formatPaceForTTS(fastestSplitPace)} — call this out!` : ''}

Give a 2-3 sentence message that reinforces what's working. Reference real data. This is about substance, not generic praise.`;
      systemExtra = isWalkSession
        ? "Acknowledge what they're doing well with specifics, not empty praise. Connect it to walking quality if you choose."
        : "Acknowledge what they're doing well with specifics, not empty praise. Connect it to running quality if you choose.";
      break;

    case 'target_eta': {
      const projMin = projectedFinishTime ? Math.floor(projectedFinishTime / 60) : 0;
      const projSec = projectedFinishTime ? Math.round(projectedFinishTime % 60) : 0;
      const targetMin = targetTime ? Math.floor(targetTime / 60) : 0;
      const diff = projectedFinishTime && targetTime ? Math.round((projectedFinishTime - targetTime) / 60) : 0;

      typePrompt = `COACHING TYPE: Target time ETA update.

${status}
${noTerrainRule}

Target: ${targetTime ? `${targetMin} minutes` : 'no target set'}
Projected finish: ${projectedFinishTime ? `${projMin} minutes ${projSec} seconds` : 'insufficient data'}
${diff > 1 ? `STATUS: ${Math.abs(diff)} minute(s) BEHIND target. They need to pick up the pace gradually — not panic.` :
  diff < -1 ? `STATUS: ${Math.abs(diff)} minute(s) AHEAD of target. They have a cushion — smart pacing.` :
  `STATUS: ON TARGET. They're executing their race plan perfectly.`}
${targetPace ? `Target pace: ${spokenTargetPace} (current: ${spokenPace})` : ''}

Give a brief ETA coaching message (2 sentences):
1. State their projected finish time clearly vs their target
2. Coach on pacing strategy — should they maintain, push slightly, or ease off?
${PACE_FORMAT_RULE}`;
      systemExtra = 'Give clear projected finish time updates with actionable pacing advice.';
      break;
    }

    case 'pace_trend':
      typePrompt = `COACHING TYPE: Pace trend insight.

${status}
${noTerrainRule}

TREND DETECTED: ${
  paceTrendDirection === 'slowing' ? `Pace is GRADUALLY DRIFTING SLOWER — approximately ${paceTrendDeltaPerKm ? Math.round(paceTrendDeltaPerKm) + 's/km' : 'noticeably'} per kilometer. This is different from a sudden struggle — it's a gradual fade.` :
  paceTrendDirection === 'speeding_up' ? `Pace is GRADUALLY GETTING FASTER — approximately ${paceTrendDeltaPerKm ? Math.round(paceTrendDeltaPerKm) + 's/km' : 'noticeably'} per kilometer. They're building momentum.` :
  'Pace has been remarkably CONSISTENT across splits.'
}

Give a trend-aware coaching message (2-3 sentences):
${paceTrendDirection === 'slowing' ? `- Acknowledge the gradual slowdown without alarming them
- Give a specific technique cue to arrest the fade — pick a genuine form reset (posture, shoulders, arm drive, foot turnover, breathing) relevant to what their data shows, and phrase it in your own original words each time, not a stock line
- Remind them of their target or what good pacing looks like` :
  paceTrendDirection === 'speeding_up' ? `- Reinforce the positive trend — they're ${isWalkSession ? 'walking' : 'running'} smart
- Caution against going too fast too early if they're under 60% done
- If they're past 60%, encourage the push` :
  `- Praise the consistency — this is disciplined ${isWalkSession ? 'walking' : 'running'}
- Give a quick form or mental cue to maintain`}

Reference their actual split data.`;
      systemExtra = 'Analyze pace trends and give targeted coaching. For slowing: technique reset cues. For speeding: smart encouragement.';
      break;

    case 'elevation_insight': {
      // Build terrain correlation analysis from split data
      let terrainAnalysis = '';
      if (kmSplits && kmSplits.length >= 2) {
        terrainAnalysis = '\nSPLIT-BY-SPLIT TERRAIN ANALYSIS:\n';
        const splitPaces = kmSplits.map(s => {
          if (!s.pace) {
            console.warn(`[generateEliteCoaching] kmSplits entry missing pace field — check client field casing`);
            return 0;
          }
          const parts = s.pace.split(':');
          return parts.length === 2 ? (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0) : 0;
        });
        terrainAnalysis += kmSplits.map((s: any, i: number) => {
          let delta = '';
          if (i > 0 && splitPaces[i] > 0 && splitPaces[i-1] > 0) {
            const diff = splitPaces[i] - splitPaces[i-1];
            delta = diff > 0 ? ` [+${diff}s slower]` : diff < 0 ? ` [${diff}s faster]` : ' [steady]';
          }
          return `  km${s.km}: ${s.pace}/km${delta}`;
        }).join('\n');
        
        const validPaces = splitPaces.filter(p => p > 0);
        if (validPaces.length >= 2) {
          const spread = Math.max(...validPaces) - Math.min(...validPaces);
          terrainAnalysis += `\n  Pace spread: ${spread}s | Consistency: ${spread <= 10 ? 'EXCELLENT' : spread <= 20 ? 'GOOD' : spread <= 30 ? 'MODERATE' : 'VARIABLE'}`;
        }
      }

      const isFlat = !currentGrade || (currentGrade > -3 && currentGrade < 3);
      const isUphill = currentGrade && currentGrade >= 3;
      const isDownhill = currentGrade && currentGrade <= -3;

      // Guard: don't mention a "climb" if elevation gain is negligible (GPS noise)
      const meaningfulClimb = totalElevationGain && totalElevationGain > 5;
      const terrainLabel = isUphill ? 'UPHILL' : isDownhill ? 'DOWNHILL' : 'FLAT';
      const terrainAction = isUphill
        ? 'ease the pace slightly, shorten your stride, keep effort steady'
        : isDownhill
          ? 'let gravity help you, stay light on your feet'
          : 'focus on rhythm and consistent pace';

      typePrompt = `COACHING TYPE: Brief terrain cue.

${status}
${noTerrainRule}

TERRAIN NOW: ${terrainLabel}
${meaningfulClimb ? `- Climb so far: ${Math.round(totalElevationGain!)}m` : '- Minimal elevation change'}
${heartRate ? `- Heart rate: ${heartRate} bpm` : ''}
- Suggested action: ${terrainAction}

Deliver ONE concise coaching cue, MAXIMUM 15 WORDS. Spoken aloud — no percentages, no pace analysis. Just a clear, encouraging action word for what the terrain requires RIGHT NOW.
NEVER say "X% climb" or "X metres of climb" — just describe what they should do.`;
      systemExtra = `You are a ${isWalkSession ? 'walking' : 'running'} coach. Keep it SHORT — max 15 words. One clear action. Natural speech. No data analysis.`;
      break;
    }

    case 'heart_rate_check': {
      // Zone 2 aerobic focus: check HR, encourage steady breathing, reinforce aerobic base building
      const targetHRMin = targetHeartRateZone === 2 ? Math.round(heartRate ? heartRate * 0.85 : 120) : 0;
      const targetHRMax = targetHeartRateZone === 2 ? Math.round(heartRate ? heartRate * 1.05 : 150) : 0;
      
      // Aerobic base building context
      const aerobicBaseContext = `
AEROBIC BASE BUILDING:
This steady-state Zone 2 work is building the foundation for all your faster ${isWalkSession ? 'walking' : 'running'}. Here's why it matters:
- Increases mitochondrial density in your muscles (more aerobic power)
- Improves capillary density (better oxygen delivery)
- Trains your body to burn fat efficiently (sustainable energy source)
- Increases stroke volume (your heart pumps more blood per beat)
- Allows faster paces to feel easier later (your "easy" pace will speed up naturally)

${isWalkSession ? 'Elite walkers spend most of their training time at exactly this brisk, sustainable effort for this reason.' : 'Elite runners spend 80% of their training time at easy/aerobic paces for exactly this reason.'} You're not wasting time here — you're building the engine that makes speed possible.`;
      
      typePrompt = `COACHING TYPE: Heart rate focus check for Zone 2 aerobic session.

${status}
${noTerrainRule}

This is a Zone 2 AEROBIC BASE BUILDING session. The goal is HEART RATE CONTROL, not pace.

${aerobicBaseContext}

${heartRate ? `Current HR: ${heartRate} bpm. Target Zone 2 range: roughly ${targetHRMin}-${targetHRMax} bpm.
${heartRate > targetHRMax ? `Your HR is above the Zone 2 target. Slow down slightly to bring it back into range. This is exactly the work — controlling your heart rate is how you build aerobic capacity. Stay patient.` : heartRate < targetHRMin ? `Your HR is below the Zone 2 target. You can pick up the pace slightly if you feel good. You want to work at that sustainable effort level where adaptation happens.` : `Your HR is right where it should be! This is the sweet spot for aerobic training. You're building your cardiovascular engine right now.`}` : `Keep checking your heart rate if you have a device. Zone 2 is about maintaining that sustainable effort where your heart is working, but you could hold a conversation.`}

Give a brief (1-2 sentences) HR-focused coaching message:
1. Acknowledge their heart rate and where it sits relative to Zone 2
2. Reinforce the LONG-TERM BENEFIT: steady aerobic work builds your base so faster paces become sustainable
3. Remind them: patience at easy paces = confidence and speed later

${PACE_FORMAT_RULE}`;
      systemExtra = 'For Zone 2 aerobic sessions, emphasize the long-term payoff. This isn\'t just about today — it\'s about building the aerobic foundation that makes all future running stronger. Coaching should reinforce: steady HR control = developing running economy and endurance capacity.';
      break;
    }

    case 'final_500m': {
      const etaProjMin = projectedFinishTime ? Math.floor(projectedFinishTime / 60) : 0;
      const etaProjSec = projectedFinishTime ? Math.round(projectedFinishTime % 60) : 0;
      const tgtMin = targetTime ? Math.floor(targetTime / 60) : 0;
      const tgtSec = targetTime ? Math.round(targetTime % 60) : 0;

      let targetContext = '';
      if (targetTime && targetTimeCategory === 'on_track') {
        targetContext = `Target finish: ${etaProjMin}:${etaProjSec.toString().padStart(2, '0')} (goal: ${tgtMin}:${tgtSec.toString().padStart(2, '0')})`;
      } else if (targetTime && targetTimeCategory === 'strong_effort') {
        targetContext = `Strong effort — ${etaOverTargetPercent?.toFixed(1)}% over target, but they've given it their all.`;
      }

      typePrompt = `COACHING TYPE: Final 500 meters

${status}
${noTerrainRule}
${targetContext ? `Context: ${targetContext}` : ''}

The ${isWalkSession ? 'walker' : 'runner'} has ${remainingMeters || 500} meters to the finish. Give a 2-3 sentence message that fits this moment — energy level, target status, what they need to hear.`;
      systemExtra = isWalkSession
        ? 'This is the home stretch. Coach with warmth and conviction — a strong, purposeful finish, not a race. Reference real data.'
        : 'This is the home stretch. Coach with intensity and conviction. Reference real data.';
      break;
    }

    case 'final_250m': {
      const etaProjMin = projectedFinishTime ? Math.floor(projectedFinishTime / 60) : 0;
      const etaProjSec = projectedFinishTime ? Math.round(projectedFinishTime % 60) : 0;
      const tgtMin = targetTime ? Math.floor(targetTime / 60) : 0;
      const tgtSec = targetTime ? Math.round(targetTime % 60) : 0;

      let targetContext = '';
      if (targetTime && targetTimeCategory === 'on_track') {
        targetContext = `Target finish: ${etaProjMin}:${etaProjSec.toString().padStart(2, '0')} (goal: ${tgtMin}:${tgtSec.toString().padStart(2, '0')})`;
      } else if (targetTime && targetTimeCategory === 'strong_effort') {
        targetContext = `Strong effort — ${etaOverTargetPercent?.toFixed(1)}% over target, but they've given it their all.`;
      }

      typePrompt = `COACHING TYPE: Final 250 meters

${status}
${noTerrainRule}
${targetContext ? `Context: ${targetContext}` : ''}

The ${isWalkSession ? 'walker' : 'runner'} has ${remainingMeters || 250} meters to the finish — closer than the 500m call, building toward the finish line. Give a short, high-energy 1-2 sentence message that escalates the intensity from a 500m cue toward the 100m sprint call.`;
      systemExtra = isWalkSession
        ? 'This is deep in the home stretch, almost there — closer than the 500m mark, not yet the final-100m burst. Coach with rising warmth and urgency. Reference real data.'
        : 'This is deep in the home stretch, almost there — closer than the 500m mark, not yet the final-100m burst. Coach with rising intensity. Reference real data.';
      break;
    }

    case 'final_100m': {
      let targetContext100 = '';
      if (targetTime && targetTimeCategory === 'on_track') {
        targetContext100 = "They're on track to hit their goal time — this final push locks it in.";
      } else if (targetTime && targetTimeCategory === 'strong_effort') {
        targetContext100 = "Regardless of the final time, this has been a strong effort — that matters more right now.";
      }

      typePrompt = isWalkSession
        ? `COACHING TYPE: Final 100 meters

The walker has approximately 100 meters to the finish. THIS IS IT.
${targetContext100}

Give the most uplifting, powerful 1-2 sentence send-off possible, in your own original words — do not reuse a stock finish-line phrase:
- This is pure encouragement. No data, no technique. Just raw, passionate coaching.
- Make them feel like a champion crossing the finish line.
- Keep it SHORT — NEVER say "run", "running", "runner", or "sprint". They are WALKING.`
        : `COACHING TYPE: Final 100 meters

The runner has approximately 100 meters to the finish. THIS IS IT.
${targetContext100}

Give the most intense, powerful 1-2 sentence motivational burst possible, in your own original words — do not reuse a stock finish-line phrase:
- This is pure adrenaline. No data, no technique. Just raw, passionate coaching.
- Make them feel like a champion crossing the finish line.
- Keep it SHORT — they're sprinting.`;
      systemExtra = isWalkSession
        ? 'This is the final 100m of the walk. Maximum warmth and encouragement. 1-2 sentences of pure fire. Sound like a coach cheering at the finish line — never running/sprint language.'
        : 'This is the final 100m. Maximum intensity. 1-2 sentences of pure fire. Sound like a coach screaming at the finish line.';
      break;
    }
  }

  const prompt = `You are ${coachName}, an ELITE ${isWalkSession ? 'walking' : 'running'} coach with a ${coachTone} style. You're coaching this ${isWalkSession ? 'walker' : 'runner'} IN REAL-TIME via audio.
${walkSessionRule}
${typePrompt}
${PACE_FORMAT_RULE}
${VARIETY_INSTRUCTION}

Keep it to 2-3 spoken sentences (under 20 seconds of audio). Every word must add value.`;

  const systemMsg = `You are ${coachName}, an elite ${coachTone} ${isWalkSession ? 'walking' : 'running'} coach delivering real-time audio coaching. You combine data-driven insight with elite technique coaching. Reference actual numbers. Never give empty motivation — every word is backed by data or technique knowledge.${isWalkSession ? ' WALKING SESSION: use "walker/walking" vocabulary. NEVER mention cadence, spm, or step frequency targets.' : ''} ${systemExtra} ${PACE_FORMAT_RULE} ${toneDirective(coachTone)}${runnerProfileBlock(params.runnerProfile)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt }
      ],
      max_tokens: 160,
      temperature: 0.75,
    });

    return completion.choices[0].message.content || "Keep pushing, you're running strong!";
  } catch (error) {
    console.error(`Elite coaching (${coachingType}) error:`, error);
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSessionCoachingPolicy
//
// Deterministically derives the coaching governance rules from the session type.
// This is computed entirely in code — the AI does NOT decide these rules.
// The policy governs which cue categories are allowed during a live run and
// whether HR sensor validation is required before firing HR-based triggers.
//
// Decision logic:
//   HR-led sessions (easy, recovery, long_run, walk_run and any Zone 1-2 session):
//     • primaryMetric = "hr"
//     • cadenceTriggersAllowed = false   (irrelevant when effort, not pace, is the goal)
//     • elevationTriggersAllowed = false  (terrain coaching conflicts with effort-first intent)
//     • hrValidationRequired = true       (sensor quality must be confirmed before cueing)
//
//   Pace-led sessions (tempo, threshold, intervals, hill_repeats, race_pace):
//     • primaryMetric = "pace"
//     • cadenceTriggersAllowed = true    (cadence directly affects pace efficiency)
//     • elevationTriggersAllowed = true   (hills directly affect pace targets)
//     • hrValidationRequired = false
//
//   Unknown session types default to the conservative HR-led policy so that
//   a newly added session type never accidentally fires irrelevant cues.
// ─────────────────────────────────────────────────────────────────────────────
function buildSessionCoachingPolicy(
  sessionType: string,
  targetHRMin?: number,
  targetHRMax?: number
): SessionCoachingPolicy {
  const type = (sessionType ?? "").toLowerCase();

  // Pace-led session types — cadence and elevation coaching are relevant and valuable.
  // park_run is included because it is a competitive/tempo 5 km context where pace
  // and running efficiency matter, even though participants may use HR as a guide.
  const PACE_LED_TYPES = new Set([
    "tempo", "threshold", "intervals", "hill_repeats", "hills",
    "race_pace", "race", "progression_run", "speed",
    "park_run", "parkrun", "steady_state", "aerobic_threshold",
  ]);

  const isPaceLed = PACE_LED_TYPES.has(type);

  // HR-led sessions — effort control is the goal, not pace optimisation.
  // Cadence triggers are still allowed as FORM coaching (not pace coaching) for
  // all sessions — poor cadence is universally inefficient regardless of effort level.
  // The difference is whether elevation/terrain coaching fires (pace-led only) and
  // whether HR validation is required before firing HR-based triggers.
  const isHRLed =
    !isPaceLed &&
    (type === "easy" ||
      type === "recovery" ||
      type === "long_run" ||
      type === "walk_run" ||
      type === "z1" ||
      type === "z2" ||
      (targetHRMin != null && targetHRMax != null) ||
      !PACE_LED_TYPES.has(type));

  if (isPaceLed) {
    return {
      primaryMetric: "pace",
      cadenceTriggersAllowed: true,
      elevationTriggersAllowed: true,
      heartRateTriggersAllowed: true,
      hrValidationRequired: false,
    };
  }

  // HR-led sessions: allow cadence as a form coaching tool (it's always relevant),
  // but disable elevation/terrain triggers (terrain coaching conflicts with effort-first intent).
  return {
    primaryMetric: isHRLed ? "hr" : "effort",
    cadenceTriggersAllowed: true,   // Cadence is universal form coaching — always valuable
    elevationTriggersAllowed: false, // Terrain coaching conflicts with effort-controlled sessions
    heartRateTriggersAllowed: true,
    hrValidationRequired: true,
  };
}

// ──────────────────────────────────────────────────────────────��──────────────
// stripInappropriateTriggers
//
// Post-processing guard: removes triggers that are incompatible with the
// session's coaching policy. This is a safety net — the AI prompt already
// instructs the model not to generate these, but we enforce it deterministically
// here so that a model regression or policy change can never slip past.
// ─────────────────────────────────────────────────────────────────────────────
function stripInappropriateTriggers(
  triggers: SessionCoachingTrigger[],
  policy: SessionCoachingPolicy
): SessionCoachingTrigger[] {
  // Elevation/terrain trigger types/ids to strip when elevation coaching is not allowed
  const ELEVATION_TRIGGER_KEYWORDS = ["elevation", "hill", "terrain", "grade", "uphill", "downhill", "slope", "rolling"];

  return triggers.filter(trigger => {
    const idAndType = `${trigger.id} ${trigger.type}`.toLowerCase();
    const conditionLower = trigger.condition.toLowerCase();

    // Cadence triggers are now allowed for ALL session types as universal form coaching.
    // (policy.cadenceTriggersAllowed is always true — guard retained for future policy flexibility)
    // No cadence stripping here.

    if (!policy.elevationTriggersAllowed) {
      const isElevationTrigger =
        ELEVATION_TRIGGER_KEYWORDS.some(kw => idAndType.includes(kw)) ||
        conditionLower.includes("grade") ||
        conditionLower.includes("elevation_gain");
      if (isElevationTrigger) {
        console.log(`[stripInappropriateTriggers] Removing elevation trigger '${trigger.id}' from HR-led session plan`);
        return false;
      }
    }

    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// enforceClosingStagesGate
//
// Post-processing enforcement: ensures that after 500m remaining, ONLY these
// trigger types fire: final_500m, final_250m, final_100m, session_complete.
// All other triggers must include "remaining_m > 500" in their condition
// to prevent coaching clutter in the final push.
//
// This is a critical UX rule: Wayne and Claire both received pace_trend
// prompts after the final 250m, which broke immersion. This gate prevents it.
// ───────────────────────────────────────────────────────────────────��─────────
function enforceClosingStagesGate(
  triggers: SessionCoachingTrigger[]
): SessionCoachingTrigger[] {
  const FINAL_STAGE_ALLOWED_TYPES = new Set([
    "final_500m",
    "final_250m",
    "final_100m",
    "session_complete",
  ]);

  return triggers.map(trigger => {
    const isAllowedInFinalStage = FINAL_STAGE_ALLOWED_TYPES.has(trigger.type);

    // If it's a final-stage-only trigger, leave it as-is
    if (isAllowedInFinalStage) {
      return trigger;
    }

    // For all other triggers, ensure they don't fire in the closing stages
    const conditionLower = trigger.condition.toLowerCase();

    // If the condition already includes a remaining_m > 500 check, we're good
    if (conditionLower.includes("remaining_m > 500") || conditionLower.includes("remaining_m>500")) {
      return trigger;
    }

    // If the condition is "always", we need to add the gate
    if (trigger.condition === "always" || conditionLower === "always") {
      console.log(`[enforceClosingStagesGate] Gating trigger '${trigger.id}' (type: ${trigger.type}) to not fire when remaining_m <= 500`);
      return {
        ...trigger,
        condition: "remaining_m > 500",
      };
    }

    // For all other conditions, append the remaining_m > 500 gate
    // Use AND to combine conditions
    const newCondition = `${trigger.condition} AND remaining_m > 500`;
    console.log(`[enforceClosingStagesGate] Adding closing-stage gate to trigger '${trigger.id}': "${trigger.condition}" → "${newCondition}"`);
    return {
      ...trigger,
      condition: newCondition,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureClosingStageMilestones
//
// Post-processing guarantee: ensures that for distance-based sessions,
// the final_100m and session_complete triggers ALWAYS exist.
// If AI didn't generate them, we inject sensible defaults.
//
// Critical: Wayne & Claire never got final_100m or distance_complete prompts.
// This function guarantees they're always there.
// ─────────────────────────────────────────────────────────────────────────────
function ensureClosingStageMilestones(
  triggers: SessionCoachingTrigger[],
  targetDistanceKm: number,
  activityType?: string,
  targetDurationMinutes?: number
): SessionCoachingTrigger[] {
  // Check which final-stage triggers already exist
  const hasType = (type: string) => triggers.some(t => t.type === type);
  const isWalk = activityType === "walk";
  const activityLabel = isWalk ? "walk" : "run";

  const final100mExists = hasType("final_100m");
  const sessionCompleteExists = hasType("session_complete");

  let updated = [...triggers];

  // Inject final_100m if missing
  if (!final100mExists && targetDistanceKm > 0) {
    console.log(`[ensureClosingStageMilestones] Injecting missing final_100m trigger`);
    updated.push({
      id: "final_100m_mandatory",
      type: "final_100m",
      condition: "remaining_m <= 100",
      message: "Final 100 metres — give it everything you've got!",
      frequency: "once",
      alertType: "vibrate",
      alternativeMessages: isWalk ? [
        "Last 100 metres — finish strong!",
        "100 metres to go — keep that pace to the line!",
        "Final stretch — you've got this!",
        "One hundred metres left — go all in!",
      ] : [
        "Last 100 metres — finish strong!",
        "100 metres to go — push hard to the line!",
        "Final sprint — you've got this!",
        "One hundred metres left — go all in!",
      ],
    });
  }

  // Inject session_complete if missing. Distance-based sessions get a distance target;
  // sessions with no usable target distance (duration-only sessions — e.g. an easy run
  // planned by time rather than km) fall back to a time target instead, so every session
  // gets an end-of-session summary regardless of how it's structured.
  if (!sessionCompleteExists) {
    if (targetDistanceKm > 0) {
      console.log(`[ensureClosingStageMilestones] Injecting missing session_complete trigger (distance-based)`);
      updated.push({
        id: "session_complete_mandatory",
        type: "session_complete",
        condition: `distance >= ${targetDistanceKm}`,
        message: `That's your ${targetDistanceKm} kilometre ${activityLabel} done — brilliant effort today. Well done.`,
        frequency: "once",
        alertType: "none",
      });
    } else if (targetDurationMinutes && targetDurationMinutes > 0) {
      console.log(`[ensureClosingStageMilestones] Injecting missing session_complete trigger (time-based)`);
      updated.push({
        id: "session_complete_mandatory",
        type: "session_complete",
        condition: `elapsed_min >= ${targetDurationMinutes}`,
        message: `That's your ${targetDurationMinutes} minute ${activityLabel} done — brilliant effort today. Well done.`,
        frequency: "once",
        alertType: "none",
      });
    }
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateSessionCoaching
//
// Unified AI function that generates a complete, bespoke coaching plan for ANY
// session type — intervals, tempo, long run, hill repeats, recovery, or any
// future session type added to the plan.
//
// Key principles:
//  - No hardcoded session type branches — AI determines structure from context
//  - Called once at "Prepare Run" time, stored in DB, reused during the run
//  - Returns phases, triggers, tone, targets, and cueingStrategy
//  - Simple sessions (recovery, race pace) get cueingStrategy = "freerun"
//    so they reuse the existing free-run coaching infrastructure
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateSessionCoachingParams {
  sessionType: string;          // "easy", "intervals", "tempo", "long_run", "hill_repeats", "walk_run", etc.
  activityType?: string;        // "run" or "walk" — the activity mode for the session
  sessionGoal: string;          // "speed", "endurance", "recovery", "threshold", "power"
  targetDurationMinutes: number;
  targetDistanceKm: number;
  targetPaceMin?: number;       // sec/km  e.g. 330 = 5:30/km
  targetPaceMax?: number;       // sec/km
  targetHRMin?: number;         // BPM
  targetHRMax?: number;         // BPM
  sessionInstructions?: string; // Full AI-generated session instructions text
  // Interval/repeat-specific fields — present when the session has structured repeating reps
  intervalCount?: number;           // Number of repetitions (e.g. 10)
  intervalDistanceMeters?: number;  // Distance per work interval in meters (e.g. 400)
  intervalDurationSeconds?: number; // Duration per work interval in seconds (e.g. 300 for 5-min jog)
  recoveryDurationSeconds?: number; // Duration per recovery/walk phase in seconds (e.g. 120 for 2-min walk)
  // Per-phase HR and pace targets — enables per-phase coaching accuracy
  intervalHRMin?: number;               // Min HR for work intervals (BPM)
  intervalHRMax?: number;               // Max HR for work intervals (BPM)
  recoveryHRMax?: number;               // Max HR during recovery phase — if exceeded, coach prompts to slow down
  intervalTargetPaceSecPerKm?: number;  // Target pace for work intervals (sec/km)
  recoveryTargetPaceSecPerKm?: number;  // Target pace for recovery phase (sec/km)
  runnerProfile: {
    age?: number;
    gender?: string;
    fitnessLevel?: string;
    recentPaceAvgSecPerKm?: number;
    recentHRAvg?: number;
    injuries?: string[];
    weeklyMileageKm?: number;
  };
  coachName?: string;
  coachTone?: string;
  coachAccent?: string;
  aiRunnerProfile?: string | null; // AI "What I know about you" text — separate from structured runnerProfile
  sessionIntent?: string;          // Free-text description of what this session is designed to achieve
  trainingWeekNumber?: number;     // Current week in the training plan (e.g. 3)
  trainingTotalWeeks?: number;     // Total weeks in the plan (e.g. 16) — shows where athlete is in their journey
  recentRuns?: Array<{
    distanceKm: number;
    durationMinutes: number;
    avgPaceSecPerKm: number;
    avgHR?: number;
    workoutType?: string;          // e.g. "easy", "intervals", "tempo", "long_run", "recovery"
    isHardSession?: boolean;       // true if this was a high-intensity session (intervals, tempo, threshold, hills)
  }>;
  // HR monitor availability — inferred from whether recent runs have HR data.
  // When false, OpenAI should not design HR-based triggers (they will never fire).
  hasHeartRateMonitor?: boolean;
  // Primary session constraint — tells OpenAI what the session is organised around.
  //   "distance"  — target distance is the primary goal (e.g. "run 3.5 km"). Duration is an estimate.
  //                 Coaching and triggers should be distance-centric: km splits, km milestones, end at target km.
  //   "duration"  — target time is the primary goal (e.g. "run for 45 minutes"). No fixed distance end point.
  //                 Coaching and triggers should be time-centric: time milestones, remaining time, end at elapsed_min.
  //   "intervals" — session is structured around rep count (e.g. "6 × 3-min run, 1-min walk").
  //                 Coaching and triggers should be rep-centric: rep counting, phase transitions, session end after last rep.
  primaryConstraint: "distance" | "duration" | "intervals";
}

export interface SessionCoachingPolicy {
  /** What the session is primarily organised around. */
  primaryMetric: "hr" | "pace" | "effort";
  /**
   * Whether cadence triggers are appropriate for this session type.
   * FALSE for HR-led sessions (easy, recovery, Zone 2, long run) — cadence
   * coaching is irrelevant when the primary goal is heart-rate control.
   * TRUE for pace-led sessions (tempo, threshold, intervals, race pace).
   */
  cadenceTriggersAllowed: boolean;
  /**
   * Whether standalone elevation/terrain triggers are appropriate.
   * FALSE for HR-led sessions — terrain coaching ("pace uphill, recover descents")
   * is distracting and conflicts with the effort-first instruction.
   * TRUE for all other session types where terrain affects pace targets.
   */
  elevationTriggersAllowed: boolean;
  /**
   * Whether the client's standalone/native heart-rate coaching fallback may fire
   * when the AI-authored plan itself contains no hr-based triggers (e.g. because
   * no heart-rate monitor was detected at plan-generation time). Always true —
   * HR coaching is universally valuable whenever HR data happens to be available,
   * same rationale as cadenceTriggersAllowed. This does NOT control whether the
   * AI is allowed to author hr-based triggers itself (see hasHeartRateMonitor in
   * the generation prompt) — it only governs the client-side fallback safety net.
   */
  heartRateTriggersAllowed: boolean;
  /**
   * When true, the live engine must validate HR readings before firing any
   * HR-based trigger.  A sudden drop of >30 bpm in under 10 seconds is almost
   * certainly wrist sensor contact loss and must be silently suppressed.
   * Always true when primaryMetric is "hr".
   */
  hrValidationRequired: boolean;
}

export interface SessionCoachingPlan {
  sessionType: string;
  sessionGoal: string;
  coachingTone: string;
  cueingStrategy: string;  // "interval" | "threshold" | "paced" | "freerun"
  preRunBrief: string;
  whyThisSession: string;
  phases: SessionCoachingPhase[];
  triggers: SessionCoachingTrigger[];
  targetMetrics: {
    totalDurationMinutes: number;
    totalDistanceKm: number;
    primaryMetric: string;
    secondaryMetric?: string;
    mainEffortPaceMin?: number;
    mainEffortPaceMax?: number;
    mainEffortHRMin?: number;
    mainEffortHRMax?: number;
    structure: string;
    isSpeedWork: boolean;
    isEnduranceWork: boolean;
    isStrengthWork: boolean;
    isRecovery: boolean;
  };
  /**
   * Deterministic coaching governance rules — computed from session type in code,
   * NOT by the AI.  The live engine uses these to suppress inappropriate generic
   * cues regardless of what triggers the AI designed.
   */
  coachingPolicy: SessionCoachingPolicy;
}

export interface SessionCoachingPhase {
  name: string;
  order: number;
  durationMinutes?: number;
  distanceKm?: number;
  targetPaceMin?: number;
  targetPaceMax?: number;
  targetHRMin?: number;
  targetHRMax?: number;
  effort: string;
  coachingFocus: string;
  phaseInstructions?: string;
  /** > 1 for repeating interval phases. Consecutive phases with repetitions > 1 are
   *  interleaved as a group: (work rep 1, recovery rep 1, work rep 2, recovery rep 2, …).
   *  Use this instead of generating one phase per rep for high-rep interval sessions. */
  repetitions?: number;
}

export interface SessionCoachingTrigger {
  id: string;
  type: string;           // Descriptive name chosen by OpenAI — e.g. "hr_drift", "cadence_check", "rep_start"
  condition: string;      // Metric expression — e.g. "hr > targetHRMax AND elapsed_min > 2"
  message: string;        // May contain {hr}, {pace}, {cadence}, {repNum}, {repsLeft}, {targetHRMax} etc.
  frequency: string;      // "once" | "on_condition" | "periodic"
  frequencySeconds?: number;   // For "periodic" triggers: seconds between fires
  alternativeMessages?: string[];
  alertType?: string;
  suppressWhenIntensity?: string[];
}

// Determine the cueingStrategy from session type + characteristics
// This tells the runtime HOW to use the coaching plan during a run
function determineCueingStrategy(
  sessionType: string,
  sessionGoal: string,
  phases: SessionCoachingPhase[]
): string {
  // Sessions with repeating rep phases = interval strategy
  const hasReps = phases.some(p =>
    p.name.includes("rep") ||
    p.name.includes("interval") ||
    p.name.includes("hill") ||
    p.name.includes("fartlek")
  );
  if (hasReps) return "interval";

  // Sustained hard effort without reps = threshold strategy
  if (
    sessionType === "tempo" ||
    sessionType === "threshold" ||
    sessionGoal === "threshold"
  ) return "threshold";

  // Target pace focus (race pace, progression) = paced strategy
  if (
    sessionType === "race_pace" ||
    sessionType === "progression_run"
  ) return "paced";

  // Everything else: recovery, easy, long run = freerun strategy
  // (reuses existing free-run coaching with session targets injected)
  return "freerun";
}

// Format sec/km pace as human-readable string for AI prompt
export function formatPaceForPrompt(secPerKm?: number): string {
  if (!secPerKm) return "not specified";
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

/**
 * generateSessionTriggerMessage — live AI coaching message at the moment a session trigger fires.
 *
 * Called in real-time during a coaching plan session when a trigger condition becomes true.
 * Unlike the pre-run plan generation (which writes template messages), this function calls
 * OpenAI with the athlete's ACTUAL live data at that precise moment and returns a bespoke,
 * analytically grounded coaching message — identical in quality to the normal run coaching.
 *
 * The pre-run plan's triggers define WHEN to coach (conditions, frequency).
 * This function defines WHAT to say (genuine analysis of the live situation).
 */
export async function generateSessionTriggerMessage(params: {
  // What triggered this message
  triggerId: string;
  triggerType: string;
  triggerCondition: string;

  // ── Trend context from rolling sensor buffers ───────────────────────────────
  // Tells the AI whether the athlete is already self-correcting.
  // hrTrendDirection:      "rising" | "stable" | "falling"
  // paceTrendDirection:    "speeding_up" | "stable" | "slowing"
  // isAthleteAlreadyResponding: true when HR is falling AND pace is slowing when the trigger fires.
  //   If true the AI should ACKNOWLEDGE the response, not issue a directive.
  hrTrendDirection?: string;
  paceTrendDirection?: string;
  isAthleteAlreadyResponding?: boolean;

  // ── Full session context — everything GPT needs to know about what the session IS ──
  preRunBrief?: string;          // What the athlete was briefed before starting
  whyThisSession?: string;       // Why this session is in the plan
  sessionInstructions?: string;  // Raw training plan workout description
  cueingStrategy?: string;       // "interval" | "threshold" | "paced" | "freerun"
  totalSessionDurationMin?: number;
  totalSessionDistanceKm?: number;
  currentRepNumber?: number;     // For interval sessions: which rep we're on
  totalRepsInSession?: number;
  phasesSummary?: string;        // Compact summary of all phases e.g. "warmup(5min) → tempo_block(20min @4:50-5:05/km) → cooldown(5min)"

  // Session type and current phase
  sessionType: string;
  sessionGoal: string;
  sessionPhase: string;
  phaseInstructions?: string;

  // Phase targets
  phaseHRMin?: number;
  phaseHRMax?: number;
  phasePaceMinSecPerKm?: number;
  phasePaceMaxSecPerKm?: number;

  // Current live metrics
  currentHR: number;
  currentPaceSecPerKm?: number;
  currentCadence?: number;
  distanceKm: number;
  targetDistanceKm?: number;
  elapsedMinutes: number;
  currentGrade?: number;
  elevationGainM?: number;

  // Recent context
  recentCoachingMessages?: string[];
  recentSplits?: Array<{ km: number; pace: string }>;

  // Coach profile
  coachName: string;
  coachTone: string;
  coachGender?: string;
  coachAccent?: string;

  // Athlete profile
  runnerName?: string;
  fitnessLevel?: string;
  runnerProfile?: string | null;

  // ── Sensor confidence ──────────────────────────────────────────────────────
  hrConfidence?: string;
  gpsConfidence?: string;
  cadenceConfidence?: string;

  // ── Physiological response to last cue ──────────���─────────────────────────
  lastCueHrDelta?: number;
  lastCuePaceDelta?: number;
  athleteRespondedToLastCue?: boolean;
  // Activity type — "walk" or "run" — controls coach vocabulary
  activityType?: string;
} & WatchDynamicsParams): Promise<string> {
  const {
    triggerId, triggerType, triggerCondition,
    preRunBrief, whyThisSession, sessionInstructions, cueingStrategy,
    totalSessionDurationMin, totalSessionDistanceKm,
    currentRepNumber, totalRepsInSession, phasesSummary,
    sessionType, sessionGoal, sessionPhase, phaseInstructions,
    phaseHRMin, phaseHRMax, phasePaceMinSecPerKm, phasePaceMaxSecPerKm,
    currentHR, currentPaceSecPerKm, currentCadence,
    distanceKm, targetDistanceKm, elapsedMinutes, currentGrade, elevationGainM,
    recentCoachingMessages, recentSplits,
    coachName, coachTone, coachAccent,
    runnerName, runnerProfile,
    topicsDiscussed, topicsNotCovered, sessionCueCount, minutesSinceLastCue, lastCueTriggerType,
    hrConfidence, gpsConfidence, cadenceConfidence,
    lastCueHrDelta, lastCuePaceDelta, athleteRespondedToLastCue,
  } = params;

  // sessionType, triggerType, distanceKm are required by the type signature but arrive
  // as plain req.body fields with no validation — a wrong-cased or missing field crashes
  // .replace()/.toFixed() below. Guard + log so a mismatch degrades instead of 500s.
  if (!sessionType || !triggerType || !sessionPhase || typeof distanceKm !== 'number') {
    console.warn(`[generateSessionTriggerMessage] missing required field(s) — sessionType=${sessionType}, triggerType=${triggerType}, sessionPhase=${sessionPhase}, distanceKm=${distanceKm} — check client field casing`);
  }
  const safeSessionType = sessionType || 'training';
  const safeTriggerType = triggerType || 'check-in';
  const safeSessionPhase = sessionPhase || 'main';
  const safeDistanceKm = typeof distanceKm === 'number' ? distanceKm : 0;

  const hrTrendDirection   = params.hrTrendDirection;
  const paceTrendDirection = params.paceTrendDirection;
  const isAthleteAlreadyResponding = params.isAthleteAlreadyResponding ?? false;
  const isTriggerWalk = resolveActivityType(params) === 'walk';
  const triggerCoachLabel = isTriggerWalk ? 'walking coach' : 'running coach';
  const triggerPersonLabel = isTriggerWalk ? 'walker' : 'athlete';
  const triggerWalkProhibition = isTriggerWalk
    ? '\nWALK SESSION — CRITICAL: NEVER say "run", "running", "runner", "sprint", or any running-specific terminology in your coaching message. This person is WALKING. Use "walker", "walking", "walk pace". Cadence coaching is suppressed.'
    : '';

  // ── Format current metrics ─────���───────────────────────────────────────────
  const paceFormatted = currentPaceSecPerKm ? formatPaceForPrompt(currentPaceSecPerKm) : "unknown";
  const targetPaceRange = (phasePaceMinSecPerKm || phasePaceMaxSecPerKm)
    ? `${formatPaceForPrompt(phasePaceMinSecPerKm)} – ${formatPaceForPrompt(phasePaceMaxSecPerKm)}`
    : null;
  const progressPct = (targetDistanceKm && distanceKm > 0)
    ? Math.round((distanceKm / targetDistanceKm) * 100) : null;
  const remainingKm = targetDistanceKm ? Math.max(0, targetDistanceKm - distanceKm) : null;

  // ── Plain-English status for HR and pace (so GPT knows if they're on/off target) ──
  const hrStatus = phaseHRMax && currentHR > 0
    ? currentHR > phaseHRMax
      ? `ABOVE zone — ${currentHR} bpm vs zone ceiling ${phaseHRMax} bpm (+${currentHR - phaseHRMax} bpm over)`
      : phaseHRMin && currentHR < phaseHRMin
        ? `BELOW zone — ${currentHR} bpm vs zone floor ${phaseHRMin} bpm (${phaseHRMin - currentHR} bpm under)`
        : `IN ZONE — ${currentHR} bpm (range ${phaseHRMin ?? '?'}–${phaseHRMax} bpm)`
    : currentHR > 0 ? `${currentHR} bpm (no zone target set)` : "unavailable";

  const paceStatus = (phasePaceMinSecPerKm || phasePaceMaxSecPerKm) && currentPaceSecPerKm
    ? phasePaceMaxSecPerKm && currentPaceSecPerKm > phasePaceMaxSecPerKm
      ? `SLOWER than target — ${paceFormatted} vs ceiling ${formatPaceForPrompt(phasePaceMaxSecPerKm)} (+${currentPaceSecPerKm - phasePaceMaxSecPerKm}s/km too slow)`
      : phasePaceMinSecPerKm && currentPaceSecPerKm < phasePaceMinSecPerKm
        ? `FASTER than target — ${paceFormatted} vs floor ${formatPaceForPrompt(phasePaceMinSecPerKm)} (${phasePaceMinSecPerKm - currentPaceSecPerKm}s/km too fast for this session type)`
        : `ON TARGET — ${paceFormatted} (target range ${targetPaceRange})`
    : paceFormatted;

  const gradeStr = currentGrade !== undefined && Math.abs(currentGrade) > 1
    ? `${currentGrade > 0 ? '+' : ''}${currentGrade.toFixed(1)}% grade` : null;
  const splitSummary = recentSplits && recentSplits.length > 0
    ? `Recent km splits: ${recentSplits.slice(-3).map(s => `km${s.km}: ${s.pace}`).join(', ')}` : '';
  const recentMessagesBlock = recentCoachingMessages && recentCoachingMessages.length > 0
    ? `Recent coaching given (do not repeat): ${recentCoachingMessages.slice(-2).join(' | ')}` : '';

  // ── Interval rep context ───────────────────────────────────────────────────
  const isWorkPhase = (params as any).isWorkPhase as boolean | undefined;
  const phaseElapsedMinutes = (params as any).phaseElapsedMinutes as number | undefined;
  const phaseRemainingMinutes = (params as any).phaseRemainingMinutes as number | undefined;

  const repContext = (currentRepNumber && totalRepsInSession)
    ? [
        `Rep ${currentRepNumber} of ${totalRepsInSession}`,
        isWorkPhase !== undefined ? (isWorkPhase ? '(WORK interval)' : '(RECOVERY phase)') : '',
        totalRepsInSession - currentRepNumber > 0
          ? `${totalRepsInSession - currentRepNumber} rep${totalRepsInSession - currentRepNumber > 1 ? 's' : ''} remaining after this`
          : 'FINAL rep',
        phaseElapsedMinutes !== undefined && phaseRemainingMinutes !== undefined
          ? `${Math.round(phaseElapsedMinutes * 10) / 10} min into this phase, ${Math.round(phaseRemainingMinutes * 10) / 10} min remaining`
          : '',
      ].filter(Boolean).join(' — ')
    : '';

  // Phase time context for non-interval sessions
  const phaseTimeContext = (!currentRepNumber && phaseElapsedMinutes !== undefined && phaseRemainingMinutes !== undefined)
    ? `${Math.round(phaseElapsedMinutes * 10) / 10} min into current phase, ${Math.round(phaseRemainingMinutes * 10) / 10} min remaining`
    : '';

  // ── Build the full session context block ──────────────────────────────────
  // Includes workout philosophy so GPT understands WHY this session exists, not just
  // what the metrics are. This is the single biggest improvement to live coaching quality.
  const livePhilosophy = getWorkoutPhilosophy(sessionType);
  const livePhilosophyBlock = formatPhilosophyForPrompt(livePhilosophy, sessionType, {
    includeCelebrate: true,
    includeWarningSigns: true,
  });

  const sessionContextBlock = [
    sessionInstructions ? `WORKOUT DESCRIPTION: ${sessionInstructions}` : null,
    preRunBrief ? `PRE-RUN BRIEF (what the athlete was told): "${preRunBrief}"` : null,
    whyThisSession ? `WHY THIS SESSION: ${whyThisSession}` : null,
    phasesSummary ? `FULL SESSION STRUCTURE: ${phasesSummary}` : null,
    cueingStrategy ? `COACHING STRATEGY: ${cueingStrategy}` : null,
    (totalSessionDurationMin || totalSessionDistanceKm)
      ? `SESSION TARGETS: ${totalSessionDistanceKm ? `${totalSessionDistanceKm}km total` : ''} ${totalSessionDurationMin ? `${totalSessionDurationMin} min total` : ''}`.trim()
      : null,
    repContext ? `INTERVAL PROGRESS: ${repContext}` : null,
    phaseTimeContext ? `PHASE TIMING: ${phaseTimeContext}` : null,
    livePhilosophyBlock,
  ].filter(Boolean).join('\n');

  // Watch running-dynamics — only present when a watch is actually paired and streaming
  // (see getWatchDynamicsEnrichment() in routes.ts); absent entirely otherwise.
  const sessionTriggerWatchDynamicsText = buildWatchDynamicsText(params);

  // ── Build the prompt ───────────────────────────────────────────────────────
  const prompt = `You are ${coachName}, an elite AI ${triggerCoachLabel}. A coaching trigger just fired during a live training session.${triggerWalkProhibition}

━━ SESSION CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session type: ${safeSessionType.replace(/_/g, ' ')}
Session goal: ${sessionGoal}
${sessionContextBlock}

━━ CURRENT STATE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current phase: ${safeSessionPhase.replace(/_/g, ' ')}${phaseInstructions ? ` — ${phaseInstructions}` : ''}

WHAT JUST TRIGGERED THIS MESSAGE (condition: "${triggerCondition}"):
${safeTriggerType.replace(/_/g, ' ')}

━━ ATHLETE'S LIVE NUMBERS AT THIS MOMENT ━━━━━━━━━━━━━━━━
Heart rate: ${hrStatus}
Pace: ${paceStatus}${currentCadence && currentCadence > 0 ? `\nCadence: ${currentCadence} spm` : ''}
Distance: ${safeDistanceKm.toFixed(2)} km${targetDistanceKm ? ` of ${targetDistanceKm} km (${progressPct}%)` : ''}${remainingKm !== null ? ` — ${remainingKm.toFixed(1)} km to go` : ''}
Time elapsed: ${elapsedMinutes} min${gradeStr ? `\nTerrain: ${gradeStr}` : ''}${elevationGainM ? `\nElevation gained: ${Math.round(elevationGainM)}m` : ''}${sessionTriggerWatchDynamicsText ? `\nWatch running dynamics: ${sessionTriggerWatchDynamicsText}` : ''}
${splitSummary}

Phase targets: ${[
  phaseHRMin || phaseHRMax ? `heart rate ${phaseHRMin ?? '?'}–${phaseHRMax ?? '?'} bpm` : null,
  targetPaceRange ? `pace ${targetPaceRange}` : null,
].filter(Boolean).join(', ') || 'none specified'}
${recentMessagesBlock}

━━ SESSION MEMORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cues delivered so far this session: ${sessionCueCount ?? 0}
${minutesSinceLastCue != null ? `Time since last cue: ${minutesSinceLastCue.toFixed(1)} min` : 'First cue of the session'}
${lastCueTriggerType ? `Last cue type: ${lastCueTriggerType.replace(/_/g, ' ')}` : ''}
Topics already covered: ${topicsDiscussed && topicsDiscussed.length > 0 ? topicsDiscussed.join(', ') : 'none yet'}
Topics not yet addressed: ${topicsNotCovered && topicsNotCovered.length > 0 ? topicsNotCovered.join(', ') : 'all covered'}
→ If heart rate and pace have already been mentioned multiple times, consider addressing a topic not yet covered (e.g. ${topicsNotCovered?.[0] ?? 'form'} or ${topicsNotCovered?.[1] ?? 'breathing'}) if it is relevant to this moment.
→ Never repeat a topic that was just covered in the previous cue unless the situation has materially changed.

━━ SENSOR CONFIDENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hrConfidence === 'low' ? '⚠️ HR confidence LOW (sensor dropout/noise) — use "looks around X bpm", not "heart rate is X bpm"' : hrConfidence === 'medium' ? 'HR confidence MEDIUM — readings valid, normal confidence' : 'HR confidence HIGH'}
${gpsConfidence === 'low' ? '⚠️ GPS confidence LOW — pace/distance figures may be slightly off; avoid over-precision' : gpsConfidence === 'medium' ? 'GPS confidence MEDIUM — acceptable accuracy' : 'GPS confidence HIGH'}
${cadenceConfidence === 'low' ? '⚠️ Cadence confidence LOW — do not cite cadence as fact' : cadenceConfidence ? `Cadence confidence: ${cadenceConfidence.toUpperCase()}` : 'No cadence sensor connected'}

━━ ATHLETE RESPONSE TO LAST CUE ━━━━━━━━━━━━━━━━━━━━━━━━
${lastCueHrDelta != null ? `Heart rate ${lastCueHrDelta < 0 ? `fell ${Math.abs(lastCueHrDelta)} bpm since last cue ↓ (self-correcting)` : `rose ${lastCueHrDelta} bpm since last cue ↑`}` : 'No HR delta data (first cue, or HR unavailable)'}
${lastCuePaceDelta != null ? `Pace ${lastCuePaceDelta > 0 ? `slowed ${lastCuePaceDelta}s/km since last cue (easing back)` : `quickened ${Math.abs(lastCuePaceDelta)}s/km since last cue`}` : ''}
${athleteRespondedToLastCue === true ? '✓ ATHLETE IS RESPONDING to previous coaching — acknowledge their adjustment before any new directive.' : athleteRespondedToLastCue === false ? '✗ No measurable response to previous cue yet — reinforce with different wording or a fresh angle.' : ''}

━━ TREND CONTEXT (last ~40 seconds) ━━━━━━━━━━━━━━━━━━━━
${hrTrendDirection ? `Heart rate trend: ${hrTrendDirection.toUpperCase()} — ${hrTrendDirection === 'falling' ? 'moving toward target' : hrTrendDirection === 'rising' ? 'moving away from target' : 'holding steady'}` : ''}
${paceTrendDirection ? `Pace trend: ${paceTrendDirection.toUpperCase()} — ${paceTrendDirection === 'slowing' ? 'athlete is easing off' : paceTrendDirection === 'speeding_up' ? 'athlete is pushing harder' : 'pace is steady'}` : ''}
${isAthleteAlreadyResponding ? `⚠️ ATHLETE IS ALREADY SELF-CORRECTING — heart rate is falling AND pace is easing back. Do NOT issue a directive. Acknowledge that response in your own words instead — the corrective coaching is NOT needed; positive acknowledgement IS.` : ''}
${triggerType === 'hr_recovery_acknowledgement' ? `This trigger fires because heart rate has returned to zone after being above it. The athlete did the right thing — acknowledge positively and concisely.` : ''}

━━ YOUR COACHING MESSAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Deliver ONE message (max 20 words, spoken aloud) that reacts to what is ACTUALLY happening above.
- If the athlete is off target AND NOT already self-correcting: be honest, give a specific corrective cue using the exact numbers
- If the athlete is already self-correcting (see TREND CONTEXT above): acknowledge and encourage — never repeat a cue they are already executing
- If the athlete is on target: give a genuine observation tied to their actual data, not generic praise
- Reference the session context — this is a ${safeSessionType.replace(/_/g, ' ')} session with specific objectives, not a free run
- Use session memory to pick the most valuable coaching focus for THIS moment — vary topics, don't repeat
- Write "heart rate" never "HR"
${PACE_FORMAT_RULE}
${VARIETY_INSTRUCTION}`;

  const systemPrompt = `You are ${coachName}, a ${coachTone} ${triggerCoachLabel} with full knowledge of this ${triggerPersonLabel}'s training session objectives.${triggerWalkProhibition}
You have been given the complete session context above — use it. A tempo trigger is not the same as an easy session trigger. An interval session rep 3 of 5 message should acknowledge where they are in the session.
The message will be read aloud by TTS — keep it under 20 words, natural speech, specific to the actual numbers given.
NEVER give generic feedback like "great work!" or "keep it up" — that tells the ${triggerPersonLabel} nothing.
${toneDirective(coachTone)}${accentDirective(coachAccent)}${runnerProfileBlock(runnerProfile)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    max_tokens: 80,
    temperature: 0.7,
  });

  return completion.choices[0].message.content?.trim()
    ?? `Heart rate at ${currentHR}${phaseHRMax && currentHR > phaseHRMax ? ` — ease back, over your zone ceiling of ${phaseHRMax}` : ' — keep this effort'}.`;
}

/**
 * Post-processing guarantee: for interval sessions, ensure rep_start and recovery_start
 * triggers always exist in the plan. Historically, the AI didn't know these trigger types
 * and would skip them — leaving the runtime with no rep transition announcements.
 *
 * If the triggers are already present (AI included them), this is a no-op.
 * If missing, sensible defaults are injected just before reactive on_condition triggers.
 */
function ensureIntervalTriggers(
  triggers: SessionCoachingTrigger[],
  primaryConstraint: string,
  intervalCount: number | null,
  intervalHRMin: number | null,
  intervalHRMax: number | null,
  recoveryHRMax: number | null,
  intervalPaceSecPerKm: number | null,
): SessionCoachingTrigger[] {
  // Only applies to interval sessions with more than 1 rep
  if (primaryConstraint !== "intervals" || !intervalCount || intervalCount < 2) {
    return triggers;
  }

  const hasRepStart     = triggers.some(t => t.type === "rep_start");
  const hasRecoveryStart = triggers.some(t => t.type === "recovery_start");

  if (hasRepStart && hasRecoveryStart) {
    // AI generated both — nothing to inject
    console.log("[ensureIntervalTriggers] rep_start and recovery_start present — no injection needed");
    return triggers;
  }

  const hrWorkZone = (intervalHRMin && intervalHRMax)
    ? `${intervalHRMin}–${intervalHRMax} bpm`
    : intervalHRMax ? `under ${intervalHRMax} bpm` : "your target zone";
  const hrRecovery = recoveryHRMax ? `under ${recoveryHRMax} bpm` : "down";
  const paceHint = intervalPaceSecPerKm
    ? ` at ${formatPaceForPrompt(intervalPaceSecPerKm)}`
    : "";

  const injected: SessionCoachingTrigger[] = [];

  if (!hasRepStart) {
    console.log("[ensureIntervalTriggers] Injecting missing rep_start trigger");
    injected.push({
      id: "rep_start_auto",
      type: "rep_start",
      condition: "always",
      message: `Rep {repNum} of {totalReps} — push the effort${paceHint}, heart rate ${hrWorkZone}.`,
      frequency: "on_condition",
      frequencySeconds: undefined,
      alertType: "none",
      suppressWhenIntensity: [],
      alternativeMessages: [
        `Rep {repNum} — go. Build into it${paceHint}, heart rate ${hrWorkZone}.`,
        `Here we go, rep {repNum} of {totalReps}. Control the effort${paceHint}.`,
        `Rep {repNum} of {totalReps} — commit to this one. Target ${hrWorkZone}.`,
        `{repNum} of {totalReps} — stay relaxed and drive the pace${paceHint}.`,
      ],
    });
  }

  if (!hasRecoveryStart) {
    console.log("[ensureIntervalTriggers] Injecting missing recovery_start trigger");
    injected.push({
      id: "recovery_start_auto",
      type: "recovery_start",
      condition: "always",
      message: `Good rep — ease right off, heart rate ${hrRecovery} before the next one.`,
      frequency: "on_condition",
      frequencySeconds: undefined,
      alertType: "none",
      suppressWhenIntensity: [],
      alternativeMessages: [
        `Nice work — recover now, let heart rate come ${hrRecovery}. Next rep coming.`,
        `Well done — ease back, breathe, drop the effort. Recovery time.`,
        `Good effort — back off now, heart rate ${hrRecovery} before the next rep.`,
        `Rest phase — let the legs recover. Heart rate ${hrRecovery}, stay relaxed.`,
      ],
    });
  }

  if (injected.length === 0) return triggers;

  // Insert injected triggers before the first on_condition trigger (reactive pass)
  // so they sit in the "periodic" slot and fire at phase transitions
  const firstReactiveIdx = triggers.findIndex(t => t.frequency === "on_condition");
  if (firstReactiveIdx === -1) {
    return [...triggers, ...injected];
  }
  return [
    ...triggers.slice(0, firstReactiveIdx),
    ...injected,
    ...triggers.slice(firstReactiveIdx),
  ];
}

export async function generateSessionCoaching(
  params: GenerateSessionCoachingParams
): Promise<SessionCoachingPlan> {
  const {
    sessionType,
    activityType = "run",
    sessionGoal,
    targetDurationMinutes,
    targetDistanceKm,
    targetPaceMin,
    targetPaceMax,
    targetHRMin,
    targetHRMax,
    sessionInstructions,
    sessionIntent,
    trainingWeekNumber,
    trainingTotalWeeks,
    intervalCount,
    intervalDistanceMeters,
    intervalDurationSeconds,
    recoveryDurationSeconds,
    intervalHRMin,
    intervalHRMax,
    recoveryHRMax,
    intervalTargetPaceSecPerKm,
    recoveryTargetPaceSecPerKm,
    runnerProfile,
    coachName = "Coach",
    coachTone = "motivational",
    recentRuns = [],
  } = params;

  // Build runner context
  const runnerContext = `
Runner Profile:
- Age: ${runnerProfile.age ?? "unknown"}
- Gender: ${runnerProfile.gender ?? "unknown"}
- Fitness Level: ${runnerProfile.fitnessLevel ?? "intermediate"}
- Average Recent Pace: ${formatPaceForPrompt(runnerProfile.recentPaceAvgSecPerKm)}
- Average Recent HR: ${runnerProfile.recentHRAvg ?? "unknown"} bpm
- Weekly Mileage: ${runnerProfile.weeklyMileageKm ?? "unknown"} km/week
- Injuries: ${runnerProfile.injuries?.join(", ") || "none"}`.trim();

  // Build recent runs context (last 3) — include workout type, effort level, and recovery impact
  const recentRunsContext = recentRuns.slice(0, 3).length > 0
    ? `\nRecent Runs (last ${recentRuns.slice(0, 3).length}):\n` +
      recentRuns.slice(0, 3).map((r, i) => {
        const typeLabel = r.workoutType ? ` [${r.workoutType.replace(/_/g, " ")}]` : "";
        const effortLabel = r.isHardSession ? " ⚡ hard session" : r.workoutType === "recovery" ? " 💤 recovery" : "";
        return `  Run ${i + 1}${typeLabel}${effortLabel}: ${formatDistanceForCoaching(r.distanceKm)} in ${r.durationMinutes}min ` +
          `@ ${formatPaceForPrompt(r.avgPaceSecPerKm)}${r.avgHR ? ` / ${r.avgHR}bpm avg HR` : ""}`;
      }).join("\n")
    : "\nRecent Runs: No data available";

  // Build training plan progression context — critical for appropriate tone and targets
  const trainingWeekContext = trainingWeekNumber && trainingTotalWeeks
    ? `\nTraining Plan Progression: Week ${trainingWeekNumber} of ${trainingTotalWeeks}`
      + (trainingWeekNumber <= 2 ? " — EARLY BASE PHASE: conservative pacing, build slowly, prioritise form" : "")
      + (trainingWeekNumber >= trainingTotalWeeks - 2 ? " — PEAK/TAPER PHASE: confidence is high, athlete is prepared" : "")
      + (trainingWeekNumber > 2 && trainingWeekNumber < trainingTotalWeeks - 2
          ? ` — ${Math.round((trainingWeekNumber / trainingTotalWeeks) * 100)}% through the plan`
          : "")
    : "";

  // Check if the most recent run was a hard session — informs recovery context for today's session
  const lastRunWasHard = recentRuns[0]?.isHardSession === true;
  const recoveryContextNote = lastRunWasHard
    ? "\nIMPORTANT: The athlete's most recent session was HIGH INTENSITY. Factor residual fatigue into your coaching tone and effort guidance — be alert for elevated HR and pace that feels harder than expected."
    : "";

  // Build interval-specific context string with full rep+recovery structure
  const intervalContext = (() => {
    if (!intervalCount) return "";

    const workDetails: string[] = [];
    const recDetails: string[] = [];

    if (intervalDurationSeconds) {
      const mins = Math.floor(intervalDurationSeconds / 60);
      const secs = intervalDurationSeconds % 60;
      workDetails.push(secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`);
    }
    if (intervalDistanceMeters) workDetails.push(`${intervalDistanceMeters}m`);
    if (intervalTargetPaceSecPerKm) workDetails.push(`target ${formatPaceForPrompt(intervalTargetPaceSecPerKm)}/km`);
    if (intervalHRMin || intervalHRMax) {
      workDetails.push(`HR ${intervalHRMin ?? "—"}–${intervalHRMax ?? "—"} bpm`);
    }

    if (recoveryDurationSeconds) {
      const mins = Math.floor(recoveryDurationSeconds / 60);
      const secs = recoveryDurationSeconds % 60;
      recDetails.push(secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`);
    }
    if (recoveryTargetPaceSecPerKm) recDetails.push(`target ${formatPaceForPrompt(recoveryTargetPaceSecPerKm)}/km`);
    if (recoveryHRMax) recDetails.push(`HR recovery target: below ${recoveryHRMax} bpm`);

    const workDesc = workDetails.length > 0 ? ` (${workDetails.join(", ")})` : "";
    const recDesc = recDetails.length > 0 ? ` / Recovery${recDetails.length > 0 ? ` (${recDetails.join(", ")})` : ""}` : "";
    return `\n- Interval Structure: ${intervalCount} × work${workDesc}${recDesc}`;
  })();

  // Build per-phase HR/pace targets summary for context
  const perPhaseTargets = (() => {
    const lines: string[] = [];
    if (intervalHRMin || intervalHRMax) {
      lines.push(`- Work Phase HR Zone: ${intervalHRMin ?? "—"}–${intervalHRMax ?? "—"} bpm`);
    }
    if (recoveryHRMax) {
      lines.push(`- Recovery Phase HR Target: drop below ${recoveryHRMax} bpm before next rep`);
    }
    if (intervalTargetPaceSecPerKm) {
      lines.push(`- Work Phase Pace: ${formatPaceForPrompt(intervalTargetPaceSecPerKm)}/km`);
    }
    if (recoveryTargetPaceSecPerKm) {
      lines.push(`- Recovery Pace: ${formatPaceForPrompt(recoveryTargetPaceSecPerKm)}/km (easy walk/jog)`);
    }
    return lines.length > 0 ? `\nPer-Phase Targets:\n${lines.join("\n")}` : "";
  })();

  // ── Primary constraint block ─────────────────────────────────────────────
  // Tells OpenAI unambiguously what the session is organised around so it builds
  // the right triggers, milestones, and pre-run brief framing.
  const primaryConstraint = params.primaryConstraint ?? "duration";

  const primaryConstraintBlock = (() => {
    if (primaryConstraint === "intervals") {
      return `
PRIMARY SESSION STRUCTURE: INTERVAL / REPS
The session is organised around rep count — NOT total distance or total time.
- Design triggers and phases around rep progression (repNum, repsLeft, totalReps).
- Phase transitions fire when each work/recovery rep completes.
- The session ends after the final rep, not at a distance or elapsed-time threshold.
- preRunBrief MUST state: number of reps, work duration/distance, recovery duration, and the target effort for the work phase.
  Example: "Six 3-minute runs with a 1-minute walk in between. Keep the runs at a comfortable jog pace and use the walks to bring your heart rate back down."

MANDATORY INTERVAL TRIGGERS — YOU MUST INCLUDE BOTH:
1. rep_start trigger (type: "rep_start", frequency: "on_condition", condition: "always"):
   - Fires at the START of every work interval rep. This is how the athlete knows a rep has begun.
   - Message MUST include {repNum} and {totalReps} so they know where they are in the set.
   - Include 4-5 alternativeMessages with varied language — the athlete hears a different one each rep.
   - Example: "Rep {repNum} of {totalReps} — push the effort, target pace and heart rate window."
   - alternativeMessages example variations: focus on what to feel, how to pace, what's coming after.

2. recovery_start trigger (type: "recovery_start", frequency: "on_condition", condition: "always"):
   - Fires at the START of every recovery phase. This tells the athlete to ease off immediately.
   - Message should acknowledge the work just done and guide the recovery: HR target, effort level.
   - Include 4-5 alternativeMessages that vary the acknowledgement and recovery instruction.
   - Example: "Good rep — ease right off, let your heart rate settle before {repNum} of {totalReps}."

OPTIONAL BUT RECOMMENDED:
- rep_midpoint trigger (type: "rep_midpoint", frequency: "on_condition", condition: "always"):
  Fires at the midpoint of each work rep. A brief check-in: how much time/distance is left, is pace on target?
  Example: "Halfway through — hold this effort, {targetPaceMin} target. Almost there."

ORDER: Place rep_start and recovery_start triggers in the PERIODIC section (after once triggers, before on_condition reactive triggers).`;
    }
    if (primaryConstraint === "distance") {
      const halfKm = (targetDistanceKm / 2).toFixed(1);
      const paceHint = targetPaceMin
        ? ` around ${formatPaceForPrompt(targetPaceMin)}–${formatPaceForPrompt(targetPaceMax)}/km`
        : "";
      return `
PRIMARY SESSION STRUCTURE: DISTANCE-BASED
The session is organised around reaching ${targetDistanceKm} km — this is the end point.

MANDATORY km-split triggers (one per km, all with frequency: "once"):
${Array.from({length: Math.floor(targetDistanceKm)}, (_, i) => `- { id: "km_split_${i+1}", type: "km_split", condition: "distance >= ${i+1}.0", frequency: "once" } — fires when ${i+1} km is reached`).join('\n')}
These must use frequency: "once" (NOT "on_condition") so they fire exactly once at each km mark. The message should reference the athlete's pace and heart rate.

- MANDATORY halfway trigger: condition "distance >= ${halfKm}", frequency: "once" — acknowledge progress and encourage continued effort.
- MANDATORY final 500m trigger: condition "remaining_m <= 500", frequency: "once" — acknowledge the final push.
- The session ends when the athlete reaches ${targetDistanceKm} km. Use condition: "distance >= ${targetDistanceKm}".
- MANDATORY: Include a session_complete trigger (type: "session_complete", frequency: "once", condition: "distance >= ${targetDistanceKm}") as the LAST trigger. This is the spoken end-of-session summary — make it feel like a real coach wrapping up a session, not a generic "well done". Mention the distance completed and acknowledge the effort.
- Duration (${targetDurationMinutes} min) is an ESTIMATE only. Mention it in the preRunBrief as "should take around ${targetDurationMinutes} minutes" but DO NOT build time-based end triggers.
- preRunBrief MUST lead with the target distance (${targetDistanceKm} km) as the primary goal, then mention the estimated time, the target pace or effort${targetHRMin ? `, and HR zone (${targetHRMin}–${targetHRMax} bpm)` : ""}.
  Example framing: "We're heading out for a ${targetDistanceKm} km easy run — should take around ${targetDurationMinutes} minutes at a relaxed jog${paceHint}. Keep it comfortable the whole way."`;
    }
    // duration-primary
    const halfMin = Math.round(targetDurationMinutes / 2);
    return `
PRIMARY SESSION STRUCTURE: TIME-BASED
The session is organised around running for ${targetDurationMinutes} minutes — there is no fixed distance end point.
- Design time milestone triggers every 10 minutes, at the halfway point (${halfMin} min), and with 5 minutes remaining.
- The session ends when elapsed_min >= ${targetDurationMinutes}. Use condition: "elapsed_min >= ${targetDurationMinutes}".
- MANDATORY: Include a session_complete trigger (type: "session_complete", frequency: "once", condition: "elapsed_min >= ${targetDurationMinutes}") as the LAST trigger. This is the spoken end-of-session summary — make it personal and specific, not just "well done". Acknowledge the time completed and the effort.
- Do NOT build distance-based end triggers.
- preRunBrief MUST lead with the target duration (${targetDurationMinutes} minutes) as the primary goal, then mention the target effort/pace${targetHRMin ? ` and HR zone (${targetHRMin}–${targetHRMax} bpm)` : ""}.
  Example framing: "Today is a ${targetDurationMinutes}-minute easy run — no fixed distance, just keep moving at a comfortable pace the whole time."`;
  })();

  // Build session context — includes intent, training week, and last-session recovery awareness
  const sessionContext = `
Session Details:
- Type: ${sessionType}
- Goal: ${sessionGoal}${sessionIntent ? `\n- Intent: ${sessionIntent}` : ""}
- Primary Metric: ${primaryConstraint === "intervals" ? "reps" : primaryConstraint} ← organise the plan, triggers, and preRunBrief around this
- Target Distance: ${targetDistanceKm} km${primaryConstraint === "distance" ? " ← PRIMARY END POINT" : primaryConstraint === "intervals" ? "" : " (informational — no distance end trigger)"}
- Target Duration: ${targetDurationMinutes} minutes${primaryConstraint === "duration" ? " ← PRIMARY END POINT" : " (estimate only — do not end session on elapsed time)"}
- Overall Pace Range: ${formatPaceForPrompt(targetPaceMin)} – ${formatPaceForPrompt(targetPaceMax)}
- Overall HR Range: ${targetHRMin ?? "not set"}–${targetHRMax ?? "not set"} bpm
- Heart Rate Monitor: ${params.hasHeartRateMonitor === false ? "NOT AVAILABLE — do NOT design any hr-based trigger conditions, they will never fire. Use pace, cadence, elapsed time, and distance instead." : params.hasHeartRateMonitor === true ? "Available — HR data will be live during the run" : "Unknown"}${intervalContext}${perPhaseTargets}${trainingWeekContext}${recoveryContextNote}
${primaryConstraintBlock}
${sessionInstructions ? `\nSession Instructions from Training Plan:\n${sessionInstructions}` : ""}`.trim();

  const systemPrompt = `You are ${coachName}, an AI ${activityType === "walk" ? "walking" : "running"} coach. You design live coaching plans that execute during a GPS training session.

${activityType === "walk" ? "CRITICAL: This is a WALK session. NEVER use running terminology. Use 'walk', 'walking', 'walker', 'pace' instead of 'run', 'running', 'runner', 'running pace'. The athlete is WALKING, not running. Reference the walking experience throughout." : ""}

The plan runs in real time: a live engine evaluates your trigger conditions against the athlete's sensor data every second and fires your messages through text-to-speech the instant conditions are met.

CRITICAL — NO TERRAIN PREDICTION: You are given NO route map, elevation profile, or terrain data anywhere in this prompt — you have no factual basis for what terrain the athlete will encounter. NEVER mention or imply specific upcoming terrain in the preRunBrief or any trigger message — no "hills ahead", "save some energy for the climbs", "there's a downhill coming up", or similar. This applies even if it sounds like generic motivational running-coach language — if you did not receive actual elevation/route data in this prompt, you do not know it, and stating it as if you do is inventing a real-time hazard the athlete will be listening for. Elevation-based coaching during the run is handled by a separate live system that only describes terrain the athlete is on RIGHT NOW, using real GPS data — your job here is the plan structure and target-based coaching only.

ONE REQUIRED OUTPUT: preRunBrief — a spoken summary the athlete hears before they start. It must reflect the PRIMARY SESSION STRUCTURE exactly:
- Distance-based: lead with the target distance, mention the estimated time as a rough guide, name the target pace and/or HR zone. E.g. "We're off on a 3.5 km easy run — should take around 45 minutes at a light jog. Keep your heart rate between 110 and 130."
- Time-based: lead with the duration, describe the effort level and any HR targets. E.g. "Today is a 45-minute easy jog — no fixed finish line, just keep it comfortable the whole way."
- Interval/reps: lead with the rep structure, name work and recovery durations, describe target effort for each phase. E.g. "Six 3-minute runs with a 1-minute walk between each. Run easy, walk to recover."
Make it feel like a personal coach talking directly to the athlete in the first person. 2–4 sentences max.

Everything else — phases, triggers, conditions, messages — you design freely based on your coaching expertise.

CONDITION METRICS (what you can measure in trigger conditions):
  hr               current heart rate (bpm)
  pace             current pace (sec/km — lower = faster)
  cadence          steps per minute
  distance         total distance run (km)
  distance_pct     % of target distance complete (0–100)
  elapsed_min      elapsed run time (minutes)
  remaining_m      metres remaining to target distance
  remaining_min    minutes remaining to target duration
  grade            current gradient (%, positive = uphill)
  elevation_gain   cumulative elevation gain (metres)

RHS target keywords: targetHRMax, targetHRMin, targetPaceMax, targetPaceMin (arithmetic: targetHRMax + 10)
Syntax: "hr > 155"  |  "remaining_m < 500"  |  "pace < targetPaceMin AND elapsed_min > 3"
Condition "always" fires unconditionally every frequencySeconds.

MESSAGE VARIABLES — substituted live at trigger time. This is the COMPLETE list — the client
does not recognise anything outside it, so a message using an unlisted token (e.g. inventing
"{elapsed_time}" instead of the actual "{elapsedMin}") will speak that literal placeholder text
aloud instead of a real number. If you need a value not in this list, describe it in words
instead of guessing a token name:
{hr} {hrZone} {pace} {cadence} {repNum} {totalReps} {repsLeft} {elapsedMin} {distKm}
{targetHRMax} {targetHRMin} {targetPaceMin} {targetPaceMax} {grade} {elevationGain}
{remainingKm} {remainingMin}
- {elapsedMin} = elapsed run time in whole minutes — use this for "you've been running for X minutes" in milestone/session_complete messages, never a guessed name.
- {distKm} = total distance covered so far in km (1 decimal place).
- {remainingKm} / {remainingMin} = distance/time remaining to the target — only meaningful when that target type is set for this session.

VOICE: messages are read aloud — write exactly as you would speak it. Write "heart rate" not "HR". Write "beats per minute" or "bpm" not "BPM". Never use symbols.
PACE FORMAT IN preRunBrief AND messages: NEVER write pace as "6:57/km" — TTS reads colons as clock time. Say "six minutes 57 per kilometre" instead. When referencing {pace} in messages, the engine substitutes the formatted spoken string automatically.
HR ZONE TRIGGERS: Every hr_zone trigger message MUST state the athlete's actual heart rate number and the zone boundary. Example: "Heart rate's at {hr} — ease back below {targetHRMax}." NEVER say just "heart rate high" without numbers.

WORD LIMITS BY MESSAGE TYPE — CRITICAL:
The athlete cannot see their phone screen and does not stare at their watch. THE AI COACH IS THEIR ONLY SOURCE OF PERFORMANCE DATA during the run. Every message is their window into how the session is going. Word limits must reflect the purpose of each message type:
- Reactive cues (hr_zone_high, hr_zone_low, breathing_cue, technique_review, pace_drift): MAX 18 words — these interrupt and correct, brevity is critical.
- Milestone messages (progress_update, performance_summary, halfway trigger, final 500m trigger): up to 30 words — these are the athlete's primary performance briefing. They MUST include meaningful data: distance context (X of Y km), elapsed time, HR vs target zone, and how the athlete is tracking. A milestone message with no data is useless.
- session_complete: up to 35 words — wrap the session with substance: total distance or time, average effort level, what went well, what to take from it. The athlete just finished — this is their coach's verdict.
- phase_start: up to 25 words — athlete needs to know what phase they're in, what the target is, and what to expect next.

${activityType === "walk" ? `WALKING RHYTHM TRIGGERS: Do NOT include spm/cadence-target triggers — cadence coaching is suppressed for walk sessions.
- Instead, include 1–2 "technique_review" triggers (frequency "periodic", frequencySeconds 240-300) coaching walking rhythm, posture, and arm drive — e.g. "Stand tall, relax your shoulders, and let your arms swing naturally" or "Keep that purposeful rhythm — quick, light steps".
- NEVER mention "cadence", "spm", "steps per minute", or a numeric step-rate target in these messages. Use {cadence} in the trigger condition only if needed for a technique-review timing check — never speak the number aloud.` : `CADENCE TRIGGERS: Include cadence coaching in ALL session types — running cadence is a universal efficiency metric regardless of pace or effort goal.
- For tempo/threshold/interval/race sessions: fire if cadence drops significantly below 170–180 spm, e.g. condition "cadence < 170 AND elapsed_min > 5", frequency "periodic", frequencySeconds 180.
- For easy/recovery/long_run sessions: fire if cadence is very low (e.g. cadence < 160), as a form coaching cue — not a performance correction.
- Include at least 1–2 cadence triggers in every plan.
- MANDATORY: Every technique_review / cadence trigger message MUST include {cadence} so the athlete knows their actual number. NEVER give a cadence cue without the number — "cadence a bit low" tells the athlete nothing. Always state what they're doing AND what they should aim for. Example: "Cadence at {cadence} steps per minute — aim for closer to 170 to keep things efficient." alternativeMessages must also include {cadence}.`}

POSITIVE CHECK-IN TRIGGERS (the coaching gap you MUST fill):
The most common failure mode is a plan that only alerts when things go wrong (HR too high, HR too low).
Great coaching also acknowledges when the athlete is EXECUTING WELL. You must include:
- For distance-based sessions: per-km split triggers (frequency: "once") for every km, e.g. condition "distance >= 1.0", "distance >= 2.0" etc.
  MANDATORY CONTENT FOR EVERY KM-SPLIT MESSAGE: state the km completed AND the total (e.g. "two of five kilometres"), include the current heart rate {hr} vs the zone ({targetHRMin}–{targetHRMax}), include pace {pace} vs target, and give a brief performance verdict. The athlete has ZERO visual feedback — this message is their full performance briefing.
  Example (2 km of 5 km target): "Two of five kilometres done — heart rate at {hr}, right in the zone. Pace tracking nicely. Looking strong, keep this up."
  Example (3 km of 5 km target, HR slightly high): "Three of five done. Heart rate at {hr}, just above the {targetHRMax} ceiling — ease back slightly and stay controlled."
  alternativeMessages for km-split triggers should each provide the same data in different phrasing/emphasis — NEVER strip the data variables out.
- A halfway trigger (frequency: "once") that summarises effort so far: how long they've been ${activityType === "walk" ? "walking" : "running"}, heart rate trend (in zone or straying), pace assessment, and encouragement for the second half.
- A final 500m trigger (remaining_m <= 500, frequency: "once") that acknowledges how the session has gone and primes them for the finish.
- These are PROGRESS TRIGGERS and must use frequency: "once" so they fire exactly once at each milestone.

FORM + BREATHING CUES (periodic, every 3–5 minutes):
Include at least 2 periodic coaching cues that cover ${activityType === "walk" ? "walking form" : "running form"} and breathing — these are universal to all session types.
These use frequency: "periodic" with frequencySeconds of 180–300, condition: "elapsed_min > 5".
They keep the athlete mentally engaged and technically consistent throughout the session.

IMPORTANT — breathing_cue and technique_review cues must NEVER be generic. The athlete already knows "breathe steadily" — that teaches them nothing. Make them feel like a real coach is watching:
- Form cue: acknowledge what the athlete is doing, give a specific body-awareness cue tied to THIS session type. E.g. for an easy run: "Relax your jaw and shoulders — if you're tense up top, your legs are working harder than they need to." For a tempo: "Arms driving forward, not crossing — power comes from the core, not the upper body."
- Breathing cue: connect the breathing reminder to how the athlete should be feeling AT THIS POINT in the session. E.g. early in a run: "Breathing should feel almost conversational right now — if you're puffing, ease back a touch." Mid-run: "Let the breath lead your rhythm — two steps in, two steps out, keep it dialled."
- alternativeMessages for breathing and form cues MUST give the athlete a DIFFERENT coaching insight each time — varied focus (jaw, shoulders, arms, foot strike, posture) not just the same cue reworded.

CLOSING STAGES TRIGGER GATE — CRITICAL FOR FINAL EXPERIENCE:
After the runner crosses into the final 500m (remaining_m <= 500), ONLY these trigger types are allowed:
- final_500m: announces the final 500m push (fires once when remaining_m <= 500)
- final_250m: announces the final 250m sprint (fires once when remaining_m <= 250)
- final_100m: announces the final 100m (fires once when remaining_m <= 100)
- session_complete: end-of-session summary (fires when distance >= targetDistance)

NO other triggers (pace_trend, hr_zone alerts, breathing cues, form cues, cadence checks, periodic cues) may fire when remaining_m <= 500.
These closing-stage-only triggers are the athlete's final coaching touches — they deserve undivided focus on the finish line, not analysis or corrections.

To enforce this rule:
- All periodic triggers (breathing, form, cadence) MUST have condition: "remaining_m > 500 AND ..." OR be designed to naturally cease before 500m remains.
- All reactive triggers (hr_zone, pace_drift, etc.) MUST have condition: "remaining_m > 500 AND ..." to prevent firing in the final stretch.
- ONLY the 4 trigger types listed above (final_500m, final_250m, final_100m, session_complete) are exempt from this gate.

Example for a reactive trigger that checks pace:
❌ Wrong: condition: "pace > targetPaceMax AND elapsed_min > 3"
✅ Right: condition: "pace > targetPaceMax AND elapsed_min > 3 AND remaining_m > 500"

MULTI-PHASE EFFORT SESSIONS (sessions that change HR zone or intensity mid-run):
If the session instructions describe a progression (e.g. "steady Zone 2 for first 2.5 km then push into Zone 3 for the last 1.5 km"), you MUST:
1. Create SEPARATE PHASES for each effort level — each with its own targetHRMin and targetHRMax set to the correct BPM values for that phase.
2. The phase_start trigger for the higher-effort phase MUST tell the athlete: what to do, the new effort level, and the specific new heart rate target (e.g. "Now push the effort — target heart rate 132 to 145 for this final push.").
3. HR zone alert triggers should automatically use the current phase's targetHRMax — so once the runner is in the higher-effort phase, the old Zone 2 ceiling no longer applies.
4. NEVER use zone names like "Zone 2" or "Zone 3" alone in the preRunBrief or trigger messages — ALWAYS state the actual BPM range so athletes with different HR monitors or zone calibrations know exactly what to aim for.

TRIGGER ORDERING — MANDATORY:
The coaching engine processes triggers in three priority passes: progress triggers (once) → periodic → reactive (on_condition).
To ensure the most important messages always fire, you MUST order triggers in this sequence:
1. FIRST: All progress triggers (frequency: "once") — km splits, halfway, final 500m, session_complete
2. SECOND: All periodic triggers (frequency: "periodic") — form cues, breathing, cadence check-ins
3. LAST: All reactive triggers (frequency: "on_condition") — HR zone alerts, pace drift, cadence corrections

session_complete MUST always be the very last trigger in the array.

MANDATORY SESSION COMPLETE TRIGGER — REQUIRED IN EVERY PLAN:
Every plan MUST include exactly ONE session_complete trigger as the FINAL trigger in the list. This fires when the athlete finishes the session and delivers a spoken end-of-session summary.
- type: "session_complete"
- frequency: "once"
- condition: for distance-based sessions: "distance >= {targetDistanceKm}"; for time-based: "elapsed_min >= {targetDurationMinutes}"
- message: A meaningful, personalised 2–3 sentence spoken summary. Must NOT just say "well done" — it should briefly acknowledge what the athlete achieved (e.g. "That's your {targetDistanceKm} km done — great controlled effort today. You kept your heart rate disciplined and built well into the final push. Rest up and we'll go again.").
- Do NOT set alternativeMessages on session_complete — it fires once and must feel like a proper session close.
- This trigger MUST be the last item in the triggers array and must NOT be skipped.

PLAN RICHNESS REQUIREMENT:
A complete coaching plan for a 5 km continuous-effort session should include approximately:
- 5 km-split triggers (one per km, frequency: "once")
- 1 halfway trigger (frequency: "once")
- 1 final 500m trigger (frequency: "once")
- 2 form/breathing periodic cues (frequency: "periodic")
- 1–2 cadence triggers (frequency: "periodic" or "on_condition")
- 2 HR zone triggers (hr_high, hr_low, frequency: "on_condition")
- 1 session_complete trigger (frequency: "once")
That is ~13 triggers total. Plans with fewer than 8 triggers are underdeveloped — build a richer plan.

COACHING PRINCIPLES:
- THE ATHLETE IS RUNNING BLIND: They cannot see their phone. They do not stare at their watch. The AI coach is their ONLY source of real-time performance data. Every message that doesn't give them their numbers is a missed opportunity.
- Every message must be specific to THIS session, THIS athlete's targets, and THIS moment in their plan — generic coaching is not acceptable
- Reactive cues (hr_zone, breathing, form): SHORT (under 18 words), direct, conversational, actionable. Like a coach talking in your ear mid-run.
- Milestone messages (km splits, progress updates, halfway, session_complete): RICHER (up to 30 words). These are the athlete's primary performance briefing — include their numbers, compare to target, give a verdict.
- CRITICAL: NEVER use robotic commands like "Run now", "Walk now", "Speed up", "Slow down" in isolation. That's what every other app does. We are better than that.
  * Instead of "Walk now" → "Nice work — take your recovery walk, let that heart rate settle"
  * Instead of "Start jogging" → "Right, let's get going — easy jog, find your rhythm"
  * Instead of "Speed up" → "Just a fraction more effort here — you've got plenty left"
  * Instead of "Heart rate too high" → "Ease back slightly — let that heart rate come down before the next rep"
- NEVER give a cue without the number when the number matters: "cadence a bit low" is useless — "cadence at {cadence}, aim for 170" is coaching. "Heart rate high" is useless — "heart rate at {hr}, ease back under {targetHRMax}" is coaching.
- The coaching engine evaluates triggers continuously (~1/sec on GPS tick), so reactive triggers fire immediately when conditions are met
- Provide 3-5 alternativeMessages for every repeating trigger so the athlete hears DIFFERENT language at each rep — never the same phrase twice
- The preRunBrief must name the actual heart rate targets and pace targets for each phase. The athlete should know EXACTLY what they're aiming for before they start.
- The WORKOUT PHILOSOPHY block in the user prompt explains what today's session exists to achieve, what success looks like, what mistakes to avoid, and what deserves praise. Use it to guide your coaching decisions — coach toward the PURPOSE, not just toward hitting metrics.

You must respond with ONLY valid JSON (no markdown, no code blocks).`;

  // Build a walk-run specific scaffold for GPT — gives exact durations but lets GPT design all the triggers
  const walkRunScaffold = (sessionType === "walk_run" && intervalCount && intervalDurationSeconds && recoveryDurationSeconds)
    ? `
SESSION STRUCTURE SCAFFOLD for this ${intervalCount}× walk-run session:
- Jog phase: ${intervalDurationSeconds/60} minutes, HR target ${intervalHRMin ?? targetHRMin ?? '?'}–${intervalHRMax ?? targetHRMax ?? '?'} bpm
- Walk phase: ${recoveryDurationSeconds/60} minutes, HR recovery target: below ${recoveryHRMax ?? (targetHRMax ? targetHRMax - 20 : '?')} bpm
- Use these EXACT durationMinutes values in the jog and recovery_walk phases.
- YOU decide what triggers to fire, how often, and what data to include in messages.
`
    : "";

  // Build workout philosophy block — zero extra tokens at generation time, just training science
  const philosophy = getWorkoutPhilosophy(sessionType);
  const philosophyBlock = formatPhilosophyForPrompt(philosophy, sessionType, {
    includeCelebrate: true,
    includeWarningSigns: true,
  });

  const userPrompt = `${runnerContext}

${recentRunsContext}

${sessionContext}
${walkRunScaffold}

${philosophyBlock}

Design a complete, bespoke coaching plan for this specific athlete and session.

You are the coaching brain. Decide what to monitor, when to intervene, and what live data to include in messages. Think: what would a world-class coach actually say to THIS person at each moment of THIS run? Include data in messages using {hr}, {cadence}, {pace}, {repNum}, {repsLeft}, {targetHRMax} etc. where helpful.

For reactive and periodic triggers — you decide what makes sense to monitor for this session. Use the FULL range of available metrics, not just heart rate. Consider pace drift, cadence, distance milestones, remaining distance/time, effort level, and terrain — whatever is most relevant to THIS session type and THIS athlete.
You decide. We execute.

Return ONLY valid JSON matching this schema exactly:
{
  "sessionType": "${sessionType}",
  "sessionGoal": "${sessionGoal}",
  "coachingTone": "calm|motivational|energetic|technical|supportive",
  "cueingStrategy": "interval|threshold|paced|freerun",
  "preRunBrief": "2-4 sentences. For distance-based: lead with distance (${targetDistanceKm} km), mention estimated time (${targetDurationMinutes} min) as a rough guide, state pace and HR targets. For time-based: lead with duration (${targetDurationMinutes} min), state effort and HR targets. For intervals: lead with rep structure. Speak directly to the athlete.",
  "whyThisSession": "1-2 sentences — why this session matters for their specific goal",
  "phases": [
    {
      "name": "phase_name",
      "order": 0,
      "durationMinutes": 5.0,
      "distanceKm": null,
      "targetPaceMin": null,
      "targetPaceMax": null,
      "targetHRMin": ${intervalHRMin ?? targetHRMin ?? null},
      "targetHRMax": ${intervalHRMax ?? targetHRMax ?? null},
      "effort": "easy|moderate|threshold|hard|max",
      "coachingFocus": "relaxation|rhythm|power|endurance|recovery",
      "phaseInstructions": "What this phase requires from the athlete",
      "repetitions": 1
    }
  ],
  "triggers": [
    {
      "id": "unique_trigger_id",
      "type": "descriptive_type_name",
      "condition": "metric op value [AND metric op value]",
      "message": "Coach message — include {hr}, {cadence}, {pace}, {repNum} etc. where relevant. Under 18 words.",
      "frequency": "once|on_condition|periodic",
      "frequencySeconds": null,
      "alternativeMessages": ["Variation 1 — different wording", "Variation 2", "Variation 3", "Variation 4"],
      "alertType": "none|vibrate",
      "suppressWhenIntensity": []
    }
  ],
  "targetMetrics": {
    "totalDurationMinutes": ${targetDurationMinutes},
    "totalDistanceKm": ${targetDistanceKm},
    "primaryMetric": "pace|heart_rate|effort|distance|time",
    "secondaryMetric": "pace|heart_rate|cadence|null",
    "mainEffortPaceMin": ${intervalTargetPaceSecPerKm ?? targetPaceMin ?? null},
    "mainEffortPaceMax": ${intervalTargetPaceSecPerKm ? intervalTargetPaceSecPerKm + 30 : (targetPaceMax ?? null)},
    "mainEffortHRMin": ${intervalHRMin ?? targetHRMin ?? null},
    "mainEffortHRMax": ${intervalHRMax ?? targetHRMax ?? null},
    "structure": "continuous|repeats|progression|threshold_block",
    "isSpeedWork": false,
    "isEnduranceWork": true,
    "isStrengthWork": false,
    "isRecovery": false
  }
}

PHASE DESIGN GUIDANCE:
Design the phase structure that genuinely fits this session. You choose the number of phases, their names, and their sequence based on what makes coaching sense for this specific session type and athlete. Some principles that typically apply:
- Sessions generally benefit from a warmup phase (to prepare the athlete physically and mentally) and a cooldown phase
- Interval/rep sessions work best with alternating work and recovery phases so each phase has its own targets and coaching triggers
- Continuous effort sessions (tempo, easy, long run) can be a single main effort or broken into logical sub-phases with milestone triggers
- Zone-based sessions benefit from reactive HR triggers throughout to keep the athlete in the target zone

CRITICAL — Phase duration and repetitions:
- For time-based phases, set durationMinutes to the EXACT duration in minutes (e.g. 5 for a 5-minute jog). The live engine uses this to detect phase transitions in real time.
- For distance-based phases (warmup/cooldown by distance), set distanceKm.
- INTERVAL SESSIONS: use the "repetitions" field instead of generating one phase per rep. Set repetitions > 1 on consecutive work/recovery phases — the engine interleaves them automatically. Example for "5 min jog + 2 min walk × 4 reps":
  { "name": "jog", "order": 0, "durationMinutes": 5, "repetitions": 4 }
  { "name": "recovery_walk", "order": 1, "durationMinutes": 2, "repetitions": 4 }
  This produces: jog rep 1 → walk rep 1 → jog rep 2 → walk rep 2 → … × 4
- WALK-RUN: do NOT include a warmup or cooldown phase unless the workout explicitly states one — the walk phases serve as built-in recovery. The jog phase named "jog" is the work phase.
- Name recovery phases starting with "recovery_" so the runtime detects them as recovery.

MESSAGE QUALITY RULES — every trigger message must pass these tests:
1. Would a real coach say this? Not a robot?
2. Does it acknowledge what the athlete just did or is doing?
3. Does it give ONE specific, actionable cue OR meaningful performance update (depending on trigger type)?
4. REACTIVE CUES: under 18 words. MILESTONE MESSAGES (km splits, progress_update, session_complete): up to 30 words — use the space to give data.
5. Does it vary across alternativeMessages (no phrase repeated, no word repeated for same trigger)?
6. For technique_review: does it include {cadence} with a target benchmark?
7. For progress_update / km-split: does it include distance context (X of Y km), {hr} vs zone, and {pace} vs target?
8. Is this the best a world-class coach could say at this exact moment? Or is it generic filler?

TRIGGER ids must be unique. Format: "{phase_name}_{trigger_type}".
For rep triggers: include 4-5 alternativeMessages with varied language — the athlete will hear these across multiple reps.
For reactive triggers (hr_zone, pace): 3-5 alternativeMessages with completely different wording.
For km-split triggers (once): 3-4 alternativeMessages since the athlete will hear a different one each km.

TRIGGER TYPE VOCABULARY — use semantic names that describe the coaching INTENT, not just the metric:
  progress_update       — km split or distance milestone (athlete on track, summarise their numbers)
  performance_summary   — mid-run effort summary (how are they tracking overall?)
  technique_review      — cadence, stride, form — one technical cue
  breathing_cue         — breathing rhythm and relaxation reminder
  hr_zone_high          — heart rate above target ceiling (corrective)
  hr_zone_low           — heart rate below target floor (corrective)
  hr_recovery_ack       — heart rate returned to zone after alert (positive acknowledgement)
  pace_drift            — pace has deviated from target range (corrective)
  motivation            — encouragement, acknowledgement of effort, mental engagement
  effort_check          — general effort level check-in (is this feeling right?)
  phase_start           — session phase just changed (tell athlete what's next)
  rep_start             — INTERVAL: work rep has begun (announce rep number, target effort and pace)
  recovery_start        — INTERVAL: recovery phase has begun (acknowledge work rep, guide the ease-off)
  rep_midpoint          — INTERVAL: halfway through a work rep (brief check-in, time remaining, is pace on target?)
  session_complete      — session finished (spoken summary)
These are EXAMPLES — you may use your own names. The key is that the type clearly conveys the coaching intent so the live AI engine and session memory system can accurately track what topics have been covered.

FINAL REMINDER — NON-NEGOTIABLE:
1. TRIGGER ORDER: Place all frequency:"once" triggers first (km splits, milestones, session_complete), then frequency:"periodic" triggers, then frequency:"on_condition" triggers last. session_complete MUST be the very last trigger.
2. PROGRESS TRIGGERS REQUIRED: For distance-based sessions, you MUST include individual km-split triggers for each km (distance >= 1.0, distance >= 2.0, etc.) with frequency:"once". These are NOT optional — they are the primary coaching touch-points during the run.
3. Every plan MUST end with a "session_complete" trigger (type: "session_complete", frequency: "once") that fires when the session distance or time target is reached. This is the end-of-session spoken summary.
4. If this session has multiple distinct effort phases (e.g. Zone 2 base then a Zone 3 push), each phase MUST have its own targetHRMin and targetHRMax values, and the phase_start trigger for the harder phase MUST clearly state the new BPM target.
5. NEVER refer to zones by name only (Zone 2, Zone 3) — ALWAYS include the actual BPM range in the same message so the athlete knows exactly what the target is regardless of their HR monitor's zone calibration.
6. MAX_TOKENS WARNING: This plan may use up to 6000 tokens. Generate ALL km-split triggers even if that means a longer response. A truncated plan is worse than a complete one.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",  // Full model for quality — this is called once per session not per cue
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.75,  // Slightly higher for more natural/varied language
      max_tokens: 8000,  // Increased for v2.8 richer plans: 13+ triggers × 5 alternativeMessages × longer km-split messages
                         // can produce 5500-7500 tokens. Truncation = invalid JSON = silent fallback to generic plan.
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(responseText);

    // Determine cueing strategy — validate or derive from phases
    const derivedStrategy = determineCueingStrategy(
      parsed.sessionType ?? sessionType,
      parsed.sessionGoal ?? sessionGoal,
      parsed.phases ?? []
    );

    // ── Deterministic coaching policy — computed from session type, NOT by the AI ──
    const coachingPolicy = buildSessionCoachingPolicy(sessionType, targetHRMin, targetHRMax);

    // ── Post-processing: strip triggers that violate the session policy ──────
    const rawTriggers: SessionCoachingTrigger[] = parsed.triggers ?? [];
    const filteredTriggers = stripInappropriateTriggers(rawTriggers, coachingPolicy);

    // ── Post-processing: enforce closing stages gate ──────────────────────────
    // After 500m remaining, ONLY final_500m, final_250m, final_100m, and
    // session_complete triggers are allowed. This prevents coaching clutter
    // (like pace_trend) in the final push. (Fixes: Wayne & Claire issue)
    const gatedTriggers = enforceClosingStagesGate(filteredTriggers);

    // ── Post-processing: guarantee final_100m and session_complete triggers ─────
    // If OpenAI forgot to include final_100m or session_complete, inject defaults.
    // These are MANDATORY for distance-based sessions. (Fixes: Wayne & Claire missing prompts)
    const withMandatoryMilestones = ensureClosingStageMilestones(gatedTriggers, targetDistanceKm, activityType, targetDurationMinutes);

    // ── Post-processing: guarantee rep_start / recovery_start triggers for interval sessions ──
    // If OpenAI didn't include these (which were historically missing from the vocabulary),
    // inject sensible defaults so the runtime always announces rep transitions.
    const guaranteedTriggers = ensureIntervalTriggers(
      withMandatoryMilestones,
      primaryConstraint,
      intervalCount ?? null,
      intervalHRMin ?? null,
      intervalHRMax ?? null,
      recoveryHRMax ?? null,
      intervalTargetPaceSecPerKm ?? null,
    );

    const plan: SessionCoachingPlan = {
      sessionType:   parsed.sessionType   ?? sessionType,
      sessionGoal:   parsed.sessionGoal   ?? sessionGoal,
      coachingTone:  parsed.coachingTone  ?? coachTone,
      cueingStrategy: parsed.cueingStrategy ?? derivedStrategy,
      preRunBrief:   parsed.preRunBrief   ?? `Get ready for your ${sessionType.replace(/_/g, " ")} ${activityType} session.`,
      whyThisSession: parsed.whyThisSession ?? "Building your running fitness.",
      phases:   parsed.phases   ?? [],
      triggers: guaranteedTriggers,
      targetMetrics: {
        totalDurationMinutes: parsed.targetMetrics?.totalDurationMinutes ?? targetDurationMinutes,
        totalDistanceKm:      parsed.targetMetrics?.totalDistanceKm      ?? targetDistanceKm,
        primaryMetric:        parsed.targetMetrics?.primaryMetric        ?? "pace",
        secondaryMetric:      parsed.targetMetrics?.secondaryMetric,
        mainEffortPaceMin:    parsed.targetMetrics?.mainEffortPaceMin    ?? targetPaceMin,
        mainEffortPaceMax:    parsed.targetMetrics?.mainEffortPaceMax    ?? targetPaceMax,
        mainEffortHRMin:      parsed.targetMetrics?.mainEffortHRMin      ?? targetHRMin,
        mainEffortHRMax:      parsed.targetMetrics?.mainEffortHRMax      ?? targetHRMax,
        structure:            parsed.targetMetrics?.structure            ?? "continuous",
        isSpeedWork:          parsed.targetMetrics?.isSpeedWork          ?? false,
        isEnduranceWork:      parsed.targetMetrics?.isEnduranceWork      ?? false,
        isStrengthWork:       parsed.targetMetrics?.isStrengthWork       ?? false,
        isRecovery:           parsed.targetMetrics?.isRecovery           ?? false,
      },
      coachingPolicy,
    };

    console.log(
      `[generateSessionCoaching] Generated plan for ${sessionType}:`,
      `${plan.phases.length} phases, ${plan.triggers.length} triggers (${rawTriggers.length - filteredTriggers.length} stripped by policy),`,
      `strategy=${plan.cueingStrategy}, tone=${plan.coachingTone},`,
      `policy=primaryMetric:${coachingPolicy.primaryMetric} cadence:${coachingPolicy.cadenceTriggersAllowed} elev:${coachingPolicy.elevationTriggersAllowed}`
    );

    return plan;

  } catch (error) {
    console.error("[generateSessionCoaching] Error generating session coaching:", error);

    // Robust fallback — always returns a usable plan
    return buildFallbackSessionCoaching(params);
  }
}

/**
 * Builds a safe fallback SessionCoachingPlan when AI call fails.
 * Ensures the run can always proceed with basic coaching.
 */
function buildFallbackSessionCoaching(
  params: GenerateSessionCoachingParams
): SessionCoachingPlan {
  const { sessionType, sessionGoal, targetDurationMinutes, targetDistanceKm,
          targetPaceMin, targetPaceMax, targetHRMin, targetHRMax,
          intervalCount, intervalDurationSeconds, recoveryDurationSeconds,
          intervalHRMin, intervalHRMax, recoveryHRMax } = params;

  const isWalkRun  = sessionType === "walk_run";
  const isInterval = sessionType === "intervals" || sessionType === "hill_repeats";
  const isTempo    = sessionType === "tempo" || sessionType === "threshold";
  const isRecovery = sessionType === "recovery" || sessionType === "easy";

  const strategy = (isWalkRun || isInterval) ? "interval"
    : isTempo     ? "threshold"
    : sessionType === "race_pace" || sessionType === "progression_run" ? "paced"
    : "freerun";

  const tone = isRecovery ? "calm"
    : (isWalkRun || isInterval) ? "supportive"
    : isTempo      ? "technical"
    : "encouraging";

  // ── Walk-run fallback ───────────────────────────────────────────────────────
  // Build a proper time-based interval plan so the run engine gets phase transitions
  // even when the AI call failed.
  if (isWalkRun && intervalCount && intervalDurationSeconds) {
    const jogMinutes = intervalDurationSeconds / 60;
    const walkMinutes = recoveryDurationSeconds ? recoveryDurationSeconds / 60 : 2;
    const jogHRMax = intervalHRMax ?? targetHRMax ?? 150;
    const jogHRMin = intervalHRMin ?? targetHRMin ?? 120;
    const walkHRTarget = recoveryHRMax ?? (jogHRMax - 20);

    const walkRunPhases: SessionCoachingPhase[] = [
      {
        name: "jog", order: 0, durationMinutes: jogMinutes,
        targetHRMin: jogHRMin, targetHRMax: jogHRMax,
        effort: "moderate", coachingFocus: "rhythm",
        phaseInstructions: `Easy jog for ${jogMinutes} minutes — controlled effort, heart rate ${jogHRMin}–${jogHRMax} bpm`,
        repetitions: intervalCount,
      },
      {
        name: "recovery_walk", order: 1, durationMinutes: walkMinutes,
        targetHRMax: walkHRTarget,
        effort: "easy", coachingFocus: "recovery",
        phaseInstructions: `Recovery walk for ${walkMinutes} minutes — let heart rate settle below ${walkHRTarget} bpm`,
        repetitions: intervalCount,
      },
    ];

    const walkRunTriggers: SessionCoachingTrigger[] = [
      {
        id: "jog_rep_start", type: "rep_start",
        condition: "phase == jog",
        message: "Right, let's pick it up — easy jog, find your rhythm",
        frequency: "once", alertType: "none",
        alternativeMessages: [
          "Off we go — keep it comfortable, don't rush it",
          "Time to jog — settle in and breathe easy",
          "Here we go again — controlled and comfortable",
          "Pick it up — nice easy jog, you've got this",
        ],
      },
      {
        id: "recovery_walk_start", type: "recovery_start",
        condition: "phase == recovery_walk",
        message: "Great work! Walk it out — let that heart rate settle",
        frequency: "once", alertType: "none",
        alternativeMessages: [
          `Lovely rep — recovery walk now, heart rate below ${walkHRTarget}`,
          "Well done! Use this walk to recover for the next one",
          "Brilliant — walk and relax, shake it out",
          "Nice effort! Walk it off, breathe easy",
        ],
      },
      {
        id: "jog_hr_zone_high", type: "hr_zone_high",
        condition: `hr > ${jogHRMax}`,
        message: "Heart rate's up — ease back just a little, stay comfortable",
        frequency: "on_condition", alertType: "vibrate",
        alternativeMessages: [
          "Back off slightly — no need to push that hard yet",
          "Let that heart rate settle — ease your pace a touch",
          "You're working hard enough — ease it back a fraction",
        ],
      },
      {
        id: "halfway_milestone", type: "milestone",
        condition: "distance_pct > 50",
        message: "Halfway through! You're doing brilliantly — keep it up",
        frequency: "once", alertType: "none",
      },
    ];

    return {
      sessionType, sessionGoal: sessionGoal ?? "build_fitness",
      coachingTone: "supportive",
      cueingStrategy: "interval",
      preRunBrief: `Today you're doing ${intervalCount} rounds of ${jogMinutes} minutes jogging and ${walkMinutes} minutes walking. Keep your heart rate between ${jogHRMin} and ${jogHRMax} beats per minute during the jogs, and use the walks to fully recover. You don't need to go fast — consistency is everything here.`,
      whyThisSession: "Walk-run training builds your aerobic base safely and is one of the most effective ways to progress as a runner.",
      phases: walkRunPhases,
      triggers: walkRunTriggers,
      targetMetrics: {
        totalDurationMinutes: targetDurationMinutes,
        totalDistanceKm: targetDistanceKm,
        primaryMetric: "heart_rate",
        secondaryMetric: "time",
        mainEffortHRMin: jogHRMin,
        mainEffortHRMax: jogHRMax,
        structure: "repeats",
        isSpeedWork: false, isEnduranceWork: true,
        isStrengthWork: false, isRecovery: false,
      },
      coachingPolicy: buildSessionCoachingPolicy(sessionType, targetHRMin, targetHRMax),
    };
  }

  const phases: SessionCoachingPhase[] = [
    {
      name: "warmup", order: 0, durationMinutes: 10,
      effort: "easy", coachingFocus: "relaxation",
      phaseInstructions: "Easy warm-up jog to get the body moving",
    },
    {
      name: "main_effort", order: 1,
      durationMinutes: targetDurationMinutes - 15,
      distanceKm: targetDistanceKm,
      targetPaceMin, targetPaceMax, targetHRMin, targetHRMax,
      effort: isRecovery ? "easy" : isInterval ? "hard" : isTempo ? "threshold" : "moderate",
      coachingFocus: isRecovery ? "relaxation" : isInterval ? "power" : "rhythm",
      phaseInstructions: `Main ${sessionType.replace(/_/g, " ")} effort`,
    },
    {
      name: "cooldown", order: 2, durationMinutes: 5,
      effort: "easy", coachingFocus: "relaxation",
      phaseInstructions: "Easy cool-down jog",
    },
  ];

  const triggers: SessionCoachingTrigger[] = [
    {
      id: "warmup_start", type: "phase_start",
      condition: "phase == warmup",
      message: "Start easy — warm up and settle into the session",
      frequency: "once", alertType: "none",
    },
    {
      id: "main_start", type: "phase_start",
      condition: "phase == main_effort",
      message: `${sessionType.replace(/_/g, " ")} starts now — find your target effort`,
      frequency: "once", alertType: "vibrate",
    },
    {
      id: "pace_check", type: "pace_deviation",
      condition: "pace > targetPaceMax + 30",
      message: "Ease into your target pace — stay controlled",
      frequency: "repeating_3min", alertType: "none",
      suppressWhenIntensity: ["z1"],
    },
    {
      id: "hr_high", type: "hr_zone",
      condition: "hr > targetHRMax",
      message: "Heart rate climbing — ease off slightly to stay in zone",
      frequency: "on_condition", alertType: "vibrate",
    },
    {
      id: "cooldown_start", type: "phase_start",
      condition: "phase == cooldown",
      message: "Great work — easy jog to cool down now",
      frequency: "once", alertType: "none",
    },
  ];

  const isLongRun = sessionType === "long_run";

  return {
    sessionType, sessionGoal,
    coachingTone: tone,
    cueingStrategy: strategy,
    preRunBrief: `Today's session is a ${targetDistanceKm}km ${sessionType.replace(/_/g, " ")} ${activityType}. ${
      targetPaceMin ? `Target pace: ${formatPaceForPrompt(targetPaceMin)}–${formatPaceForPrompt(targetPaceMax)}.` : ""
    } Focus on consistent effort throughout.`,
    whyThisSession: `This session builds your ${sessionGoal.replace(/_/g, " ")} and improves running fitness.`,
    phases,
    triggers,
    targetMetrics: {
      totalDurationMinutes: targetDurationMinutes,
      totalDistanceKm:      targetDistanceKm,
      primaryMetric:        targetHRMin ? "heart_rate" : "pace",
      mainEffortPaceMin:    targetPaceMin,
      mainEffortPaceMax:    targetPaceMax,
      mainEffortHRMin:      targetHRMin,
      mainEffortHRMax:      targetHRMax,
      structure:            isInterval ? "repeats" : isTempo ? "threshold_block" : "continuous",
      isSpeedWork:          isInterval,
      isEnduranceWork:      isLongRun,
      isStrengthWork:       sessionType === "hill_repeats",
      isRecovery:           isRecovery,
    },
    coachingPolicy: buildSessionCoachingPolicy(sessionType, targetHRMin, targetHRMax),
  };
}

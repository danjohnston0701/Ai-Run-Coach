import OpenAI from "openai";
import { COACHING_PHASE_PROMPT, determinePhase, type CoachingPhase } from "../shared/coaching-statements";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const normalizeCoachTone = (tone?: string): string => {
  if (!tone) return "energetic";
  return tone.trim().toLowerCase();
};

const toneDirective = (tone?: string): string => {
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
const accentDirective = (accent?: string): string => {
  const normalized = (accent || '').trim().toLowerCase();
  switch (normalized) {
    case 'british':
      return 'Write with British English phrasing — "brilliant", "well done", "cracking pace", "spot on". Use "kilometres" not "kilometers". Avoid Americanisms.';
    case 'irish':
      return 'Write with Irish English phrasing — "grand", "mighty", "fair play", "dead on". Warm and friendly. Use "kilometres".';
    case 'scottish':
      return 'Write with Scottish English phrasing — "brilliant", "cracking", "braw", "well done". Direct and warm. Use "kilometres".';
    case 'australian':
      return 'Write with Australian English phrasing — "legend", "ripper", "no worries", "you beauty". Relaxed and confident. Use "kilometres".';
    case 'new zealand':
    case 'newzealand':
    case 'nz':
      return 'Write with New Zealand English phrasing — "sweet as", "good on ya", "choice", "chur". Understated Kiwi warmth. Use "kilometres".';
    case 'american':
      return 'Write with American English phrasing — "awesome", "great job", "crushing it". High energy and direct.';
    case 'south african':
      return 'Write with South African English phrasing — "lekker", "shame" (sympathetic), "howzit". Resilient warmth. Use "kilometres".';
    case 'canadian':
      return 'Write with Canadian English phrasing — "eh", "for sure", "beauty". Friendly and humble. Use "kilometres".';
    case 'welsh':
      return 'Write with Welsh English phrasing — "lovely", "tidy", "fair play", "cracking on". Passionate warmth. Use "kilometres".';
    case 'indian':
      return 'Write with Indian English phrasing — "very good", "excellent", "superb". Articulate and warm. Use "kilometres".';
    case 'caribbean':
      return 'Write with Caribbean English phrasing — "wicked", "big up yourself", "nuff respect". Rhythmic and uplifting. Use "kilometres".';
    case 'scandinavian':
      return 'Write with Scandinavian-influenced English — "very nice", "exactly", "perfect". Clean and understated. Use "kilometres".';
    default:
      return '';
  }
};

// Helper to format distance for TTS - no decimals when whole number
const formatDistanceForTTS = (km: number | undefined): string => {
  if (km === undefined) return '?';
  return km === Math.floor(km) ? `${Math.floor(km)}km` : `${km.toFixed(1)}km`;
};

// Helper to format pace for TTS - converts "4:32" to "4 minutes and 32 seconds per kilometer"
// This prevents the AI from saying "four thirty-two" which is hard to understand while running
const formatPaceForTTS = (pace: string | undefined): string => {
  if (!pace) return 'unknown pace';
  const parts = pace.replace('/km', '').trim().split(':');
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10);
    const sec = parseInt(parts[1], 10);
    if (!isNaN(min) && !isNaN(sec)) {
      if (sec === 0) return `${min} minutes per kilometer`;
      return `${min} minutes and ${sec} seconds per kilometer`;
    }
  }
  return `${pace} per kilometer`;
};

// Pace format instruction for AI system messages
const PACE_FORMAT_RULE = `PACE FORMAT: When speaking about pace, ALWAYS say it as "X minutes and Y seconds per kilometer" (e.g. "4 minutes and 32 seconds per kilometer"), NEVER as shorthand like "four thirty-two" or "4:32". This is critical because the runner is listening via audio while running and needs to clearly understand pace values.`;

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

export interface CoachingContext {
  distance?: number;
  duration?: number;
  pace?: string;
  heartRate?: number;
  elevation?: number;
  elevationChange?: string;
  weather?: any;
  phase?: CoachingPhase;
  isStruggling?: boolean;
  cadence?: number;
  activityType?: string;
  userFitnessLevel?: string;
  coachTone?: string;
  coachAccent?: string;
  totalDistance?: number;
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
}): Promise<string> {
  const { distance, elevationGain, elevationLoss, difficulty, activityType, weather, coachName, coachTone, coachAccent } = params;
  
  const weatherInfo = weather 
    ? `Weather: ${weather.temp || 'N/A'}°C, ${weather.condition || 'clear'}, wind ${weather.windSpeed || 0} km/h.`
    : 'Weather data unavailable.';
  
  const prompt = `You are ${coachName}, an AI running coach. Your coaching style is ${coachTone}.

Generate a brief pre-run briefing (2-3 sentences max) for this upcoming ${activityType}:
- Distance: ${formatDistanceForTTS(distance)}
- Difficulty: ${difficulty}
- Elevation gain: ${Math.round(elevationGain || 0)}m, loss: ${Math.round(elevationLoss || 0)}m
- ${weatherInfo}

Be encouraging, specific to the conditions, and give one actionable tip. Speak naturally as if talking directly to the runner.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, a ${coachTone} running coach. Keep responses brief, encouraging, and actionable. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 120,
    temperature: 0.8,
  });

  return completion.choices[0].message.content || "Take it easy at the start and find your rhythm. Good luck!";
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
function buildRunHistoryContext(history: RunHistoryStats, currentPace?: string): string {
  if (!history || history.runsAnalysed === 0) return '';

  let ctx = `Based on their last ${history.runsAnalysed} runs: avg pace ${history.avgPaceFormatted}/km`;

  if (currentPace && history.avgPaceSecondsPerKm > 0) {
    // Parse current pace to seconds
    const parts = currentPace.replace('/km', '').split(':');
    if (parts.length === 2) {
      const currentSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      const diff = currentSec - history.avgPaceSecondsPerKm;
      if (diff < -10) {
        ctx += ` — they're running ${Math.abs(Math.round(diff))}s/km FASTER than their usual pace (performing above average today)`;
      } else if (diff > 10) {
        ctx += ` — they're running ${Math.round(diff)}s/km SLOWER than their usual pace`;
      } else {
        ctx += ` — they're running close to their typical pace`;
      }
    }
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
  // User profile
  fitnessLevel?: string;
  runnerName?: string;
  runnerAge?: number;
  // Historical context
  runHistory?: RunHistoryStats;
}): Promise<string> {
  const { distance, targetDistance, currentPace, elapsedTime, coachName, coachTone, isSplit, splitKm, splitPace, currentGrade, totalElevationGain, isOnHill, kmSplits, hasRoute, fitnessLevel, runnerName, runHistory } = params;
  const accentRule = accentDirective((params as any).coachAccent);
  
  const progress = Math.round((distance / targetDistance) * 100);
  const timeMin = Math.floor(elapsedTime / 60);
  
  // ONLY include terrain context when the runner has a planned route
  let terrainContext = '';
  if (hasRoute === true) {
    if (currentGrade !== undefined && Math.abs(currentGrade) > 5) {
      if (currentGrade > 5) {
        terrainContext = `Currently climbing a steep ${currentGrade.toFixed(1)}% grade hill. `;
      } else if (currentGrade < -5) {
        terrainContext = `Currently descending a steep ${Math.abs(currentGrade).toFixed(1)}% grade. `;
      }
    }
    if (totalElevationGain && totalElevationGain > 20) {
      terrainContext += `Total elevation climbed so far: ${Math.round(totalElevationGain)}m. `;
    }
  }
  
  // Build pace trend context for splits
  let paceTrend = '';
  if (isSplit && kmSplits && kmSplits.length >= 2) {
    const lastTwo = kmSplits.slice(-2);
    if (lastTwo.length === 2) {
      const prevTime = lastTwo[0].time;
      const currTime = lastTwo[1].time;
      const diff = currTime - prevTime;
      if (diff > 10) {
        paceTrend = 'Runner is slowing down compared to previous kilometer. ';
      } else if (diff < -10) {
        paceTrend = 'Runner is speeding up compared to previous kilometer. ';
      } else {
        paceTrend = 'Runner is maintaining consistent pace. ';
      }
    }
  }

  // Build the no-terrain rule when there's no route
  const noTerrainRule = hasRoute === true ? '' : `
CRITICAL: This runner has NO planned route. Do NOT mention hills, terrain, elevation, climbing, descending, flat, undulating, conquering hills, or any route/terrain characteristics. You have NO idea what terrain they are running on. Focus only on pace, effort, form, and motivation.`;

  // Build runner profile + history context
  const runnerFirstNamePace = runnerName ? runnerName.split(' ')[0] : null;
  let runnerContext = '';
  if (runnerFirstNamePace) runnerContext += `Runner: ${runnerFirstNamePace}. `;
  if (fitnessLevel) runnerContext += `Fitness level: ${fitnessLevel}. `;
  if (runHistory) {
    runnerContext += buildRunHistoryContext(runHistory, currentPace);
  }

  const spokenCurrentPace = formatPaceForTTS(currentPace);
  const spokenSplitPace = formatPaceForTTS(splitPace);
  
  let prompt: string;
  if (isSplit && splitKm && splitPace) {
    prompt = `You are ${coachName}, an AI running coach with a ${coachTone} style.
${runnerContext ? `\nRunner context: ${runnerContext}` : ''}
The runner just completed kilometer ${splitKm} with a split pace of ${spokenSplitPace}.
- Overall progress: ${distance.toFixed(1)}km of ${targetDistance}km (${progress}%)
- Time elapsed: ${timeMin} minutes
- Average pace: ${spokenCurrentPace}
${terrainContext}${paceTrend}
${noTerrainRule}
${PACE_FORMAT_RULE}
Give a brief (1-2 sentences) split update. You MUST mention their split pace (${spokenSplitPace}) and at least one other data point (progress, time, pace trend, or how this compares to their recent runs). ${hasRoute === true && isOnHill ? 'Acknowledge the hill effort. ' : ''}${paceTrend ? 'Comment on their pace trend if relevant.' : ''}`;
  } else {
    prompt = `You are ${coachName}, an AI running coach with a ${coachTone} style.
${runnerContext ? `\nRunner context: ${runnerContext}` : ''}
500m pace check: Runner is at ${distance.toFixed(2)}km, pace ${spokenCurrentPace}, ${timeMin} minutes in.
${terrainContext}
${noTerrainRule}
${PACE_FORMAT_RULE}
Give a very brief (1-2 sentences) pace update. You MUST cite their pace (${spokenCurrentPace}) and distance (${distance.toFixed(1)}km). ${hasRoute === true && isOnHill ? ' Acknowledge the hill they are on.' : ''}`;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, a ${coachTone} running coach. Keep pace updates brief but ALWAYS cite the runner's actual numbers (pace, split time, distance). When run history is available, compare current performance to their recent averages to personalise the insight. ${PACE_FORMAT_RULE} ${hasRoute === true ? 'Be elevation-aware when hills are mentioned. ' : 'Do NOT mention hills, terrain, or elevation. '}${toneDirective(coachTone)}${accentRule ? ' ' + accentRule : ''}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 110,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || (isSplit ? `Kilometer ${splitKm} done at ${spokenSplitPace}. Keep it up!` : "Looking good, keep this pace!");
}

export async function generateRunSummary(runData: any): Promise<any> {
  const prompt = `Analyze this run and provide a brief summary with highlights, struggles, and tips:
Run Data:
- Distance: ${runData.distance}km
- Duration: ${runData.duration} minutes
- Average Pace: ${runData.avgPace}
- Elevation Gain: ${runData.elevationGain || 0}m
- Activity Type: ${runData.activityType || 'run'}
- Weather: ${JSON.stringify(runData.weather || {})}

Provide response as JSON with fields: highlights (array), struggles (array), tips (array), overallScore (1-10), summary (string)`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an expert running coach providing post-run analysis. Respond only with valid JSON." },
      { role: "user", content: prompt }
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  try {
    const content = completion.choices[0].message.content || "{}";
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return {
      highlights: ["Completed your run!"],
      struggles: [],
      tips: ["Keep up the great work!"],
      overallScore: 7,
      summary: "Great effort on your run today!"
    };
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
}): Promise<string> {
  const { phase, distance, targetDistance, elapsedTime, currentPace, currentGrade, totalElevationGain, heartRate, cadence, coachName, coachTone, coachAccent, coachGender, activityType, hasRoute, targetPace, targetTime, triggerType, navigationInstruction, navigationDistance, fitnessLevel, runnerName, runnerAge, runnerWeight, runnerHeight } = params;
  
  const timeMin = Math.floor(elapsedTime / 60);
  const progress = targetDistance ? Math.round((distance / targetDistance) * 100) : 0;
  
  const phaseDescriptions: Record<string, string> = {
    // App sends these enum names from CoachingPhase.kt
    EARLY: 'The runner is in the early phase, warming up and finding their rhythm.',
    MID: `The runner is in the middle of their run (${progress}% complete) — they should be settling into a steady pace. Do NOT tell them to "finish strong" or "push to the end" — they have a long way to go.`,
    LATE: `The runner is in the late phase (${progress}% complete), likely getting tired. Encourage them to maintain effort.`,
    FINAL: `The runner is in the final push (${progress}% complete), approaching the finish. NOW is the time for "finish strong" and "dig deep" encouragement.`,
    GENERIC: `The runner is ${progress}% through their run. Give phase-appropriate coaching based on their progress percentage.`,
    STEADY: `The runner is running at a steady pace (${progress}% complete).`,
    // Legacy keys (in case old server code calls with these)
    warmUp: 'The runner is in the warm-up phase, getting into their rhythm.',
    midRun: `The runner is in the middle of their run (${progress}% complete). Do NOT say "finish strong" — they have a lot left.`,
    lateRun: `The runner is in the late phase (${progress}% complete), possibly getting tired.`,
    finalPush: `The runner is approaching the finish (${progress}% complete), time for final encouragement.`,
  };
  
  // ONLY include terrain info when the runner has a planned route
  let terrainInfo = '';
  if (hasRoute === true) {
    if (currentGrade && Math.abs(currentGrade) > 2) {
      terrainInfo = currentGrade > 0 ? `Currently climbing (${currentGrade.toFixed(1)}% grade). ` : `Currently descending (${Math.abs(currentGrade).toFixed(1)}% grade). `;
    }
    if (totalElevationGain && totalElevationGain > 0) {
      terrainInfo += `Total climb so far: ${Math.round(totalElevationGain)}m. `;
    }
  }

  // Build heart rate info if available
  let hrInfo = '';
  if (heartRate && heartRate > 0) {
    const hrZone = getHeartRateZone(heartRate);
    hrInfo = `- Heart rate: ${heartRate} bpm (${hrZone} zone)`;
  }

  // Build cadence info if available
  let cadenceInfo = '';
  if (cadence && cadence > 0) {
    const cadenceAssessment = cadence >= 170 ? 'excellent' : cadence >= 160 ? 'good' : cadence >= 150 ? 'moderate' : 'needs work';
    cadenceInfo = `- Cadence: ${cadence} spm (${cadenceAssessment})`;
  }

  // Build target pace comparison if available (use spoken format for TTS)
  const spokenPhasePace = formatPaceForTTS(currentPace);
  const spokenTargetPace = formatPaceForTTS(targetPace);
  
  let paceComparisonInfo = '';
  let paceVerdict = '';
  if (targetPace && currentPace) {
    paceComparisonInfo = `- Target pace: ${spokenTargetPace} (current: ${spokenPhasePace})`;
    // Add explicit pace gap guidance for the AI
    const targetParts = targetPace.split(':').map(Number);
    const currentParts = currentPace.split(':').map(Number);
    if (targetParts.length === 2 && currentParts.length === 2) {
      const targetSec = targetParts[0] * 60 + targetParts[1];
      const currentSec = currentParts[0] * 60 + currentParts[1];
      const diffSec = currentSec - targetSec;
      if (diffSec > 30) {
        paceVerdict = `BEHIND TARGET: Runner is ${Math.abs(diffSec)} seconds/km SLOWER than target pace. They need to pick it up!`;
      } else if (diffSec > 10) {
        paceVerdict = `SLIGHTLY BEHIND: Runner is ${Math.abs(diffSec)}s/km behind target. Gentle nudge to pick up pace.`;
      } else if (diffSec < -10) {
        paceVerdict = `AHEAD OF TARGET: Runner is ${Math.abs(diffSec)}s/km faster than target. They could ease off to sustain.`;
      } else {
        paceVerdict = `ON TARGET: Runner is within ${Math.abs(diffSec)}s/km of target pace. Great pacing!`;
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
        targetTimeInfo += `\n- ⚠️ Projected finish: ~${projectedMin} min ${projectedSec}s (${diff} min OVER target)`;
      } else if (diff < 0) {
        targetTimeInfo += `\n- Projected finish: ~${projectedMin} min ${projectedSec}s (${Math.abs(diff)} min UNDER target)`;
      } else {
        targetTimeInfo += `\n- Projected finish: ~${projectedMin} min ${projectedSec}s (ON TARGET)`;
      }
    }
  }

  // Build the no-terrain rule when there's no route
  const noTerrainRule = hasRoute === true ? '' : `
CRITICAL: This runner has NO planned route. Do NOT mention hills, terrain, elevation, climbing, descending, flat, undulating, or any route/terrain characteristics. You have NO idea what terrain they are running on. Focus only on pace, effort, form, and motivation.`;

  // NAVIGATION TURN: Short, punchy direction delivered in coach's voice
  if (triggerType === 'navigation_turn' && navigationInstruction) {
    const distContext = navigationDistance && navigationDistance > 0
      ? `The next turn is in approximately ${navigationDistance} metres. `
      : '';
    
    const navPrompt = `You are ${coachName}, an AI ${activityType || 'running'} coach with a ${coachTone} style.

The runner is following a mapped route and needs a navigation direction:
Navigation instruction: "${navigationInstruction}"
${distContext}
Runner context: ${distance.toFixed(1)}km into their run, pace ${currentPace || 'unknown'}.

Deliver this navigation direction naturally in your coaching voice. Keep it to 1 SHORT sentence (max 15 words). 
You MUST include the actual direction (left, right, straight, etc.) and street name if given. 
Be concise — the runner needs to hear this quickly. Add a tiny bit of coach personality but prioritise clarity.
Examples of good output: "Quick right turn onto May Street, looking good!", "Left here onto Dublin Road, keep that rhythm!"`;

    const navSystemMsg = `You are ${coachName}, a ${coachTone} running coach delivering a navigation cue. Be extremely brief and clear — max 1 sentence, max 15 words. The direction must be unmistakable. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}`;

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
    let paceZone = '';
    let paceGuidance = '';
    if (triggerType === 'pace_abandon') {
      paceZone = 'TARGET ABANDONED';
      paceGuidance = `The runner's target pace is now unreachable — they are consistently ${Math.abs(paceDeviationPercent).toFixed(0)}% slower than needed. 
DO NOT nag about the missed target. Instead: acknowledge the effort, suggest they focus on maintaining their CURRENT effort level, and motivate them to finish strong. 
This should feel supportive, not disappointing. "The target time isn't in the cards today, but you're still putting in great work" kind of energy.`;
    } else if (paceDeviationPercent < -15) {
      paceZone = 'WAY TOO FAST';
      paceGuidance = `The runner is going ${Math.abs(paceDeviationPercent).toFixed(0)}% FASTER than their target pace. This is a common mistake — going out too fast leads to hitting the wall later.
STRONGLY advise them to slow down NOW. Be direct but not alarming. Explain that banking time early almost always backfires. 
Their current pace is ${avgPaceFormatted}/km but they need ${targetPaceFormatted}/km. Suggest they ease off and settle into rhythm.`;
    } else if (paceDeviationPercent < -10) {
      paceZone = 'TOO FAST';
      paceGuidance = `The runner is ${Math.abs(paceDeviationPercent).toFixed(0)}% faster than target pace. They should ease off slightly to avoid burning out.
Gently suggest pulling back a touch. Their body will thank them in the second half. Current: ${avgPaceFormatted}/km, target: ${targetPaceFormatted}/km.`;
    } else if (paceDeviationPercent > 15) {
      paceZone = 'WELL BEHIND TARGET';
      paceGuidance = `The runner is ${paceDeviationPercent.toFixed(0)}% slower than target. Their projected finish is ${projectedFinishMin}:${projectedFinishSec.toString().padStart(2, '0')} vs target ${targetTimeMin}:${targetTimeSec.toString().padStart(2, '0')}.
Encourage them to pick it up if they can, but be realistic. If there's a gradient/hill, acknowledge that hills slow pace naturally.`;
    } else if (paceDeviationPercent > 10) {
      paceZone = 'SLIGHTLY BEHIND';
      paceGuidance = `The runner is ${paceDeviationPercent.toFixed(0)}% behind target pace. They need to pick it up a little. 
Projected finish: ${projectedFinishMin}:${projectedFinishSec.toString().padStart(2, '0')} vs target ${targetTimeMin}:${targetTimeSec.toString().padStart(2, '0')}. Gentle nudge to increase effort.`;
    } else {
      paceZone = 'ON PACE';
      paceGuidance = `The runner is RIGHT ON TARGET (within ${Math.abs(paceDeviationPercent).toFixed(0)}% of target pace). 
Reinforce the good pacing with positive encouragement. Current: ${avgPaceFormatted}/km, target: ${targetPaceFormatted}/km. Tell them they're nailing it!`;
    }
    
    // Gradient context
    let gradientContext = '';
    if (currentGrade && Math.abs(currentGrade) > 2) {
      gradientContext = currentGrade > 0 
        ? `Note: Runner is currently climbing (${currentGrade.toFixed(1)}% gradient) — slower pace is expected on hills.`
        : `Note: Runner is currently descending (${Math.abs(currentGrade).toFixed(1)}% gradient) — pace naturally speeds up downhill.`;
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

    const pacePrompt = `You are ${coachName}, an AI ${activityType || 'running'} coach with a ${coachTone} style.

PACE COACHING — ${paceZone}
The runner is ${progressPercent.toFixed(0)}% through their ${targetDistance ? formatDistanceForTTS(targetDistance) : 'run'}, having covered ${formatDistanceForTTS(distance)}.
- Average pace: ${avgPaceFormatted}/km
- Target pace: ${targetPaceFormatted}/km  
- Recent pace (last 500m): ${rollingPaceFormatted}/km
${gradientContext}
${trendContext}
${paceGuidance}

${heartRate ? `Heart rate: ${heartRate} bpm.` : ''}
${cadence ? `Cadence: ${cadence} spm.` : ''}

Give 2-3 sentences of pace coaching. Be specific about the numbers — tell them their actual pace and what they need.
${progressPercent > 80 ? "They're in the final stretch — be extra motivating!" : ""}
Do NOT use markdown, emojis, or bullet points — this will be spoken aloud.
Do NOT start with any greeting like "Hey there", "Hey!", "Hi!". Jump straight into the pace coaching.${runnerFirstName ? ` The runner's name is ${runnerFirstName} — use it naturally but not as a greeting.` : ''}`;

    const paceSystemMsg = `You are ${coachName}, a ${coachTone} running coach giving pace guidance. Be specific with pace numbers (use "X minutes Y seconds per kilometre" format, not "X:YY"). Keep it concise (2-3 sentences). NEVER start with greetings. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}`;

    const paceCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: paceSystemMsg },
        { role: "user", content: pacePrompt }
      ],
      max_tokens: 120,
      temperature: 0.7,
    });

    return paceCompletion.choices[0].message.content || `You're running ${avgPaceFormatted} per kilometre, target is ${targetPaceFormatted}.`;
  }

  // Runner profile context — name, fitness level, physical stats
  const runnerFirstName = runnerName ? runnerName.split(' ')[0] : null;
  let runnerProfileContext = '';
  if (runnerFirstName) {
    runnerProfileContext += `\nThe runner's name is ${runnerFirstName}. Use their name naturally (not every sentence, but occasionally to personalise).`;
  }
  if (fitnessLevel) {
    runnerProfileContext += `\nRunner's fitness level: ${fitnessLevel}. Tailor your advice complexity and expectations to this level.`;
  }
  if (runnerAge) {
    runnerProfileContext += ` Age: ${runnerAge}.`;
  }
  if (runnerWeight && runnerHeight) {
    const heightM = runnerHeight / 100;
    const bmi = runnerWeight / (heightM * heightM);
    runnerProfileContext += ` BMI: ${bmi.toFixed(1)}.`;
  }

  // Accent-aware phrasing — makes the TEXT sound natural for the chosen accent
  const normalizedAccent = (coachAccent || '').trim().toLowerCase();
  switch (normalizedAccent) {
    case 'british':
      runnerProfileContext += '\nWrite with natural British English phrasing — use "brilliant", "well done", "cracking pace", "spot on", "kilometres". Avoid Americanisms.';
      break;
    case 'irish':
      runnerProfileContext += '\nWrite with natural Irish English phrasing — use "grand", "mighty", "fair play", "dead on", "kilometres". Warm and friendly tone.';
      break;
    case 'scottish':
      runnerProfileContext += '\nWrite with natural Scottish English phrasing — use "brilliant", "well done", "cracking", "braw", "kilometres". Direct and warm.';
      break;
    case 'australian':
      runnerProfileContext += '\nWrite with natural Australian English phrasing — use "legend", "ripper", "no worries", "you beauty", "kays" or "kilometres". Relaxed and confident.';
      break;
    case 'new zealand':
    case 'newzealand':
    case 'nz':
      runnerProfileContext += '\nWrite with natural New Zealand English phrasing — use "sweet as", "good on ya", "choice", "chur", "kilometres". Understated, genuine warmth — not over the top. Kiwi style.';
      break;
    case 'american':
      runnerProfileContext += '\nWrite with natural American English phrasing — use "awesome", "great job", "crushing it", "miles" if user prefers or "kilometres". High energy and direct.';
      break;
    case 'south african':
      runnerProfileContext += '\nWrite with natural South African English phrasing — use "lekker", "shame" (sympathetic), "howzit", "ja", "kilometres". Resilient, warm energy — like someone who runs ultra-marathons for fun.';
      break;
    case 'canadian':
      runnerProfileContext += '\nWrite with natural Canadian English phrasing — use "eh", "for sure", "beauty", "no doubt", "kilometres". Friendly, humble, and genuinely encouraging. Never boastful.';
      break;
    case 'welsh':
      runnerProfileContext += '\nWrite with natural Welsh English phrasing — use "lovely", "tidy", "fair play", "cracking on", "kilometres". Passionate and heartfelt with musical warmth.';
      break;
    case 'indian':
      runnerProfileContext += '\nWrite with natural Indian English phrasing — use "very good", "excellent", "well done", "superb", "kilometres". Articulate, encouraging, and warm. Slightly formal but genuinely caring.';
      break;
    case 'caribbean':
      runnerProfileContext += '\nWrite with natural Caribbean English phrasing — use "wicked", "big up yourself", "nuff respect", "easy now", "kilometres". Rhythmic, confident, uplifting energy. Island warmth.';
      break;
    case 'scandinavian':
      runnerProfileContext += '\nWrite with natural Scandinavian-influenced English — use "very nice", "good job", "exactly", "perfect", "kilometres". Clean, precise, understated positivity. Hygge energy — calm confidence.';
      break;
  }

  // Detect "run start" scenario: phase is EARLY/warmUp and distance is near zero
  const isRunStart = (phase === 'EARLY' || phase === 'warmUp') && distance < 0.05;
  
  // Build trigger-specific instruction
  const is500mCheckin = triggerType === '500m_checkin';

  let prompt: string;
  let systemMsg: string;

  if (isRunStart) {
    // RUN START: Pure motivational message — no metrics (they haven't run yet!)
    prompt = `You are ${coachName}, an AI ${activityType || 'running'} coach with a ${coachTone} style.

The runner has just started their ${activityType || 'run'}${targetDistance ? ` — their target is ${formatDistanceForTTS(targetDistance)}` : ''}${targetTime && targetTime > 0 ? ` in ${formatDurationForTTS(targetTime)}` : ''}.
${noTerrainRule}${runnerProfileContext}
Give a short, energetic motivational message (2-3 sentences) to kick off their run. Focus on getting them pumped up and ready to go. Do NOT mention distance covered, pace, cadence, or any metrics — the run has literally just begun. Just motivate them!
CRITICAL: Do NOT start with any greeting like "Hey there", "Hey!", "Hi!", or "Hello". Jump straight into the coaching message.${runnerFirstName ? ` You may use "${runnerFirstName}" naturally but not as a greeting opener.` : ''}`;

    systemMsg = `You are ${coachName}, a ${coachTone} ${activityType || 'running'} coach. Give a brief, energetic send-off to start the run. No stats or metrics — just motivation. NEVER start with "Hey there", "Hey!", "Hi!" or any greeting — jump straight into the coaching. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}`;
  } else {
    // DURING RUN: Include metrics
    const triggerInstruction = is500mCheckin
      ? `This is the runner's FIRST check-in at 500m. Give a brief (2-3 sentences) initial assessment of how their run is going so far.`
      : `Give a brief (2-3 sentences) phase-appropriate coaching message.`;

    prompt = `You are ${coachName}, an AI ${activityType || 'running'} coach with a ${coachTone} style.

${is500mCheckin ? 'TRIGGER: First 500m check-in' : `Phase: ${phaseDescriptions[phase]}`}
Runner Status:
- Distance covered: ${distance.toFixed(2)}km${targetDistance ? ` of ${formatDistanceForTTS(targetDistance)} target (${progress}%)` : ''}
- Time elapsed: ${timeMin} minutes
${currentPace ? `- Current pace: ${spokenPhasePace}` : ''}
${paceComparisonInfo}
${targetTimeInfo}
${hrInfo}
${cadenceInfo}
${terrainInfo}
${noTerrainRule}${runnerProfileContext}
${PACE_FORMAT_RULE}
${triggerInstruction} Be ${coachTone} and encouraging.
CRITICAL: Do NOT start with any greeting like "Hey there", "Hey!", "Hi!", "Hello", or "Hey superstar". Jump straight into the coaching content.${runnerFirstName ? ` You may address them as "${runnerFirstName}" naturally within the message but not as an opening greeting.` : ''}

CRITICAL: You MUST weave in at least 2 specific data points from the Runner Status above (e.g. their actual pace like "${spokenPhasePace}", distance "${distance.toFixed(1)}km", time "${timeMin} minutes", cadence, heart rate). Runners want to hear their real numbers — do NOT give vague encouragement without citing their actual stats.${targetPace ? ` You MUST tell the runner whether they are on track for their target pace of ${spokenTargetPace}. ${paceVerdict} — communicate this clearly.` : ''}${targetTime && targetTime > 0 ? ` You MUST mention whether they are on track for their target time of ${formatDurationForTTS(targetTime)}.` : ''}${cadence && cadence > 0 ? ' Include a brief note on their cadence.' : ''}${hasRoute === true ? ' Consider their current terrain if on a hill.' : ''}`;

    systemMsg = `You are ${coachName}, a ${coachTone} ${activityType || 'running'} coach. Keep coaching messages brief and impactful — always cite the runner's actual numbers (pace, distance, time etc). NEVER start with greetings like "Hey there", "Hey!", "Hi!" — jump straight into coaching. ${PACE_FORMAT_RULE} ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}`;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: prompt }
    ],
    max_tokens: 120,
    temperature: 0.7,
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
}): Promise<string> {
  const { distance, elapsedTime, currentPace, baselinePace, paceDropPercent, currentGrade, totalElevationGain, coachName, coachTone, coachAccent, hasRoute, fitnessLevel, runnerName, runHistory, targetHeartRateZone } = params;
  
  // For Zone 1-2 runs (aerobic/recovery focus), pace drops are intentional to stay in HR zone — skip struggle coaching
  if (targetHeartRateZone && targetHeartRateZone <= 2) {
    return `Heart rate is the goal here, not pace. Slow down as needed to stay in Zone ${targetHeartRateZone}. You're doing great!`;
  }
  
  const timeMin = Math.floor(elapsedTime / 60);
  
  // ONLY include terrain context when the runner has a planned route
  let terrainContext = '';
  if (hasRoute === true) {
    if (currentGrade && currentGrade > 3) {
      terrainContext = `They're currently on a ${currentGrade.toFixed(1)}% uphill which may explain the slowdown. `;
    } else if (totalElevationGain && totalElevationGain > 50) {
      terrainContext = `They've climbed ${Math.round(totalElevationGain)}m so far, which is contributing to fatigue. `;
    }
  }

  // Build the no-terrain rule when there's no route
  const noTerrainRule = hasRoute === true ? '' : `
CRITICAL: This runner has NO planned route. Do NOT mention hills, terrain, elevation, climbing, descending, flat, undulating, or any route/terrain characteristics. You have NO idea what terrain they are running on. Focus only on pace, effort, form, and motivation.`;
  
  const spokenCurrentPaceStruggle = formatPaceForTTS(currentPace);
  const spokenBaselinePace = formatPaceForTTS(baselinePace);

  // Build runner profile + history context for struggle coaching
  const runnerFirstNameStruggle = runnerName ? runnerName.split(' ')[0] : null;
  let struggleRunnerContext = '';
  if (runnerFirstNameStruggle) struggleRunnerContext += `Runner: ${runnerFirstNameStruggle}. `;
  if (fitnessLevel) struggleRunnerContext += `Fitness level: ${fitnessLevel}. `;
  if (runHistory) {
    // Specifically flag if this pace drop is normal for them or unusual
    if (runHistory.avgPaceDropPercent !== undefined) {
      const dropDiff = paceDropPercent - runHistory.avgPaceDropPercent;
      if (dropDiff > 5) {
        struggleRunnerContext += `This pace drop (${Math.round(paceDropPercent)}%) is larger than their typical drop (${Math.round(runHistory.avgPaceDropPercent)}%) — they're struggling more than usual. `;
      } else {
        struggleRunnerContext += `Pace drops of this size are normal for this runner (avg ${Math.round(runHistory.avgPaceDropPercent)}%). `;
      }
    }
    if (runHistory.avgDistanceKm) {
      const distDiff = distance - runHistory.avgDistanceKm;
      if (distDiff > 0.5) struggleRunnerContext += `They're already further than their recent average of ${runHistory.avgDistanceKm.toFixed(1)}km — this is new territory. `;
    }
    if (runHistory.consistencyTrend === 'improving') {
      struggleRunnerContext += `Their recent runs show an improving trend — they have the fitness to push through. `;
    } else if (runHistory.consistencyTrend === 'declining') {
      struggleRunnerContext += `They've been having tougher runs recently — be supportive and suggest adjusting effort. `;
    }
  }

  const prompt = `You are ${coachName}, an AI running coach with a ${coachTone} style.
${struggleRunnerContext ? `\nRunner context: ${struggleRunnerContext}` : ''}
The runner is struggling. Their pace has dropped ${Math.round(paceDropPercent)}% from their baseline.
- Current pace: ${spokenCurrentPaceStruggle} (baseline was ${spokenBaselinePace})
- Distance: ${distance.toFixed(2)}km
- Time: ${timeMin} minutes
${terrainContext}
${noTerrainRule}
${PACE_FORMAT_RULE}
Give a brief (1-2 sentences) supportive message tailored to this runner's fitness level and history. You MUST cite at least one specific number. Acknowledge their struggle, but encourage them to push through or adjust their strategy based on what you know about their recent form.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, a ${coachTone} running coach. Be supportive during tough moments — always reference actual data. Keep it brief. ${PACE_FORMAT_RULE} ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 100,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || "I can see you're working hard. Take a breath and find your rhythm again.";
}

// Cadence/Stride Coaching - analyzes overstriding/understriding
type StrideZone = 'OVERSTRIDING' | 'UNDERSTRIDING' | 'OPTIMAL';

/**
 * Calculate optimal cadence range based on target pace
 * Slower paces (easy Zone 2) typically need lower cadence (110-130 spm)
 * Faster paces typically need higher cadence (170-180 spm)
 */
function getOptimalCadenceForPace(paceMinPerKm: string, paceMaxPerKm?: string): { min: number; max: number } {
  const parsePace = (paceStr: string): number => {
    const parts = paceStr.split(':');
    if (parts.length !== 2) return 180; // default to fast cadence
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    return minutes * 60 + seconds;
  };

  const paceSeconds = parsePace(paceMinPerKm);
  
  // Zone 2 (9-13 min/km, ~540-780 sec/km): 110-130 cadence
  // Zone 3 (7-10 min/km, ~420-600 sec/km): 130-150 cadence
  // Zone 4+ (< 6 min/km, < 360 sec/km): 160-180+ cadence
  
  if (paceSeconds >= 720) {
    // Very slow (12+ min/km): 100-120 spm
    return { min: 100, max: 120 };
  } else if (paceSeconds >= 600) {
    // Slow Zone 2 (10-12 min/km): 110-130 spm
    return { min: 110, max: 130 };
  } else if (paceSeconds >= 480) {
    // Zone 2/3 boundary (8-10 min/km): 130-150 spm
    return { min: 130, max: 150 };
  } else if (paceSeconds >= 360) {
    // Zone 3/4 boundary (6-8 min/km): 150-170 spm
    return { min: 150, max: 170 };
  } else {
    // Zone 4+ (< 6 min/km): 170-185 spm
    return { min: 170, max: 185 };
  }
}

export async function generateCadenceCoaching(params: {
  cadence: number;
  strideLength: number;
  strideZone: StrideZone;
  currentPace: string;
  speed: number;
  distance: number;
  elapsedTime: number;
  heartRate?: number;
  userHeight?: number;
  userWeight?: number;
  userAge?: number;
  optimalCadenceMin: number;
  optimalCadenceMax: number;
  optimalStrideLengthMin: number;
  optimalStrideLengthMax: number;
  coachName?: string;
  coachTone?: string;
  coachAccent?: string;
}): Promise<string> {
  const { cadence, strideLength, strideZone, currentPace, speed, distance, elapsedTime,
    heartRate, userHeight, userWeight, userAge,
    optimalCadenceMin, optimalCadenceMax, optimalStrideLengthMin, optimalStrideLengthMax,
    coachName = 'Coach', coachTone = 'energetic' } = params;
  const cadenceAccentRule = accentDirective((params as any).coachAccent);
  
  // Use dynamic cadence calculation based on current pace, not fixed values
  const paceBasedCadence = getOptimalCadenceForPace(currentPace);
  const dynOptimalCadenceMin = paceBasedCadence.min;
  const dynOptimalCadenceMax = paceBasedCadence.max;
  
  const strideCm = Math.round(strideLength * 100);
  const optMinCm = Math.round(optimalStrideLengthMin * 100);
  const optMaxCm = Math.round(optimalStrideLengthMax * 100);
  const timeMin = Math.floor(elapsedTime / 60000);
  
  let physicalContext = '';
  if (userHeight) physicalContext += `Runner height: ${userHeight > 3 ? userHeight : (userHeight * 100).toFixed(0)}cm. `;
  if (userWeight) physicalContext += `Weight: ${userWeight}kg. `;
  if (userAge) physicalContext += `Age: ${userAge}. `;
  
  let zoneAnalysis = '';
  if (strideZone === 'OVERSTRIDING') {
    zoneAnalysis = `OVERSTRIDING DETECTED: Cadence ${cadence} spm with stride length ${strideCm}cm — this is above the optimal range of ${optMinCm}-${optMaxCm}cm for their height.

Overstriding means their foot is landing too far ahead of their center of mass, creating a braking force with each step. This:
- Increases impact on knees and shins (injury risk)
- Wastes energy fighting the braking force
- Reduces running efficiency

The runner needs to SHORTEN their stride and INCREASE their cadence. Provide elite-level coaching on HOW to do this:
1. Focus on landing with foot beneath hips, not out front
2. Think "quick, light steps" — aim for ${dynOptimalCadenceMin}-${dynOptimalCadenceMax} spm
3. Lean slightly forward from ankles (not waist)
4. Imagine running on hot coals — minimize ground contact time
5. Arms drive the cadence — quicker arms = quicker feet
6. Keep your landing tight beneath your center of mass
7. Let the ground come to your foot—don’t chase it
8. Shorten the step and land softly beneath your body
9. Imagine placing your foot straight down under your hips
10. Reduce the reach—quick feet underneath you
11. Your stride should land under you, not in front of you
12. Let your feet move faster with smaller steps.
13. Increase step rhythm—shorter steps, faster turnover.
14. Run like you're tapping the ground quickly.
15. Quick cadence keeps your stride compact.
16. Let the rhythm of your feet speed up slightly.
17. Faster cadence, lighter steps.
18. Think quick feet beneath you.
19. Compact steps will protect your legs and increase efficiency.
20. Arms drive cadence—quicker arms mean quicker feet.
21. Speed up your arm swing slightly.
22.Compact arm swings will increase cadence.
23. Let your arms set the rhythm for your legs.
24. Faster arm turnover shortens the stride.
25. Keep arms relaxed but quick.
26. Drive elbows back faster.
27. Quick arm rhythm = quick foot rhythm.
28. Let your arms guide the cadence.
29.Smooth, quick arm drive will tighten your stride.`;
  } else if (strideZone === 'UNDERSTRIDING') {
    zoneAnalysis = `UNDERSTRIDING DETECTED: Cadence ${cadence} spm with stride length ${strideCm}cm — their cadence is too low for their pace of ${formatPaceForTTS(currentPace)}.

Understriding means they're shuffling with too-short steps at a low turnover rate. This:
- Wastes energy on vertical oscillation (bouncing up and down)
- Reduces forward propulsion
- Can cause calf and Achilles fatigue

The runner needs to find a more efficient cadence. Provide coaching on HOW to increase cadence:
1. Use a mental metronome — aim for ${dynOptimalCadenceMin}-${dynOptimalCadenceMax} steps per minute
2. Push off more powerfully from the balls of their feet
3. Drive knees forward (not up) with each stride
4. Keep arms pumping actively — they set the rhythm
5. Think "smooth and powerful" not "short and choppy"
6. Run like you're tapping the ground quickly.
7. Quick cadence keeps your stride compact.
8. Let the rhythm of your feet speed up slightly.
9. Faster cadence, lighter steps.
10. Think quick feet beneath you.
11. Compact steps will protect your legs and increase efficiency.
12. Arms drive cadence—quicker arms mean quicker feet.
13. Speed up your arm swing slightly.
14.Compact arm swings will increase cadence.
15. Let your arms set the rhythm for your legs.
16. Faster arm turnover shortens the stride.
17. Keep arms relaxed but quick.
18. Drive elbows back faster.
19. Quick arm rhythm = quick foot rhythm.
20. Let your arms guide the cadence.`;
  } else {
    zoneAnalysis = `Cadence ${cadence} spm with stride ${strideCm}cm is in the optimal zone. Brief positive reinforcement.`;
  }
  
  const prompt = `You are ${coachName}, an AI running coach with a ${coachTone} style.

${zoneAnalysis}

Runner Data:
- Current cadence: ${cadence} spm
- Stride length: ${strideCm}cm (optimal range: ${optMinCm}-${optMaxCm}cm)
- Current pace: ${formatPaceForTTS(currentPace)}
- Distance: ${distance.toFixed(1)}km, time: ${timeMin} minutes
${heartRate ? `- Heart rate: ${heartRate} bpm` : ''}
${physicalContext}

${PACE_FORMAT_RULE}
Give a coaching message (3-4 sentences). First, tell them their cadence and stride length. Then explain what ${strideZone === 'OPTIMAL' ? 'this means (good form!)' : `${strideZone.toLowerCase()} means and why it matters`}. Finally, give ${strideZone === 'OPTIMAL' ? 'brief encouragement to maintain it' : '2-3 specific, actionable technique tips they can apply RIGHT NOW during this run'}. Be specific with numbers. No emojis.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, an elite ${coachTone} running biomechanics coach. You specialize in cadence optimization and stride analysis. Give specific, actionable technique coaching — tell the runner exactly what to change and how. Reference actual numbers. No emojis. ${PACE_FORMAT_RULE} Keep it to 3-4 sentences that can be spoken in under 20 seconds. ${toneDirective(coachTone)}${cadenceAccentRule ? ' ' + cadenceAccentRule : ''}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 200,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || `Your cadence is ${cadence} steps per minute with a stride length of ${strideCm}cm. ${strideZone === 'OVERSTRIDING' ? 'Try shortening your stride and landing under your hips.' : strideZone === 'UNDERSTRIDING' ? 'Try picking up your cadence with quicker, more powerful steps.' : 'Great form, keep it up!'}`;
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
  // Legacy format support
  change?: string;
  grade?: number;
  upcoming?: string;
}): Promise<string> {
  const coachName = params.coachName || 'Coach';
  const coachTone = params.coachTone || 'energetic';
  const grade = params.currentGrade ?? params.grade ?? 0;
  const eventType = params.eventType || params.change || 'uphill';
  const distanceKm = params.distance?.toFixed(2) || '?';
  const segmentM = params.segmentDistanceMeters ? Math.round(params.segmentDistanceMeters) : null;

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
  let coachingInstructions: string;

  if (eventType === 'flat_terrain') {
    coachingInstructions = `FLAT TERRAIN INSIGHT — The runner is on a flat/undulating route.

WHAT TO DO:
- Acknowledge the terrain — tell them their route is flat/gently undulating (whichever fits the data)
- CORRELATE their metrics with the terrain: flat routes are ideal for pace consistency, rhythm building, and target pace work
- If their pace is consistent (spread < 15s): praise this specifically — "your splits are rock solid on this flat terrain, that's disciplined running"
- If they're negative splitting on flat terrain: this is exceptional — call it out enthusiastically
- If their pace is drifting (spread > 20s): on a flat route there's no terrain excuse — gently suggest a form reset or effort management
- Give ONE specific technique cue for flat running: maintain cadence around 170-180, stay tall through hips, relax shoulders, swing arms forward not across
- If they have energy to spare (HR under control, consistent pace): suggest conserving for a strong finish push
- Reference their actual numbers — don't be generic`;
  } else if (eventType === 'hill_top') {
    coachingInstructions = `HILL TOP — The runner just crested a climb of ${params.segmentElevationGain ? Math.round(params.segmentElevationGain) + 'm' : 'significant elevation'} over ${segmentM ? segmentM + 'm' : 'a sustained distance'}.

WHAT TO DO:
- Celebrate the climb — they earned it. Be specific about what they just climbed
- Transition coaching: as the terrain flattens/descends, coach them to gradually rebuild pace, lengthen stride back out, and let gravity help
- If their HR is high: "catch your breath on this section, let your heart rate settle"
- If their cadence dropped on the climb: "now you're over the top, pick your cadence back up"
- Compare their uphill split pace to their flat split pace — acknowledge the slowdown as smart running, not weakness`;
  } else if (eventType === 'uphill') {
    coachingInstructions = `UPHILL — The runner is on a ${Math.abs(grade).toFixed(1)}% climb, ${segmentM ? segmentM + 'm into this hill' : 'sustained climb'}.${params.segmentElevationGain ? ` Climbed ${Math.round(params.segmentElevationGain)}m so far in this segment.` : ''}

WHAT TO DO:
- Coach hill-specific technique: shorten stride 10-15%, lean from ankles into the hill (not at the waist), pump arms more aggressively, focus on driving knees
- Reassure that pace SHOULD slow on climbs — effort-based running, not pace-based. "Your pace slowing is exactly right on a hill like this"
- If their HR is elevated: "heart rate is up because you're climbing — that's normal, focus on controlled effort"
- If cadence dropped below 155: "try to keep your feet quick even on the climb — shorter faster steps are more efficient than long slow ones"
- Look at the grade vs their pace drop: if pace dropped proportionally to grade, that's well-managed. If it dropped way more, they may be overstriding uphill`;
  } else if (eventType === 'downhill' || eventType === 'downhill_finish') {
    const isFinish = eventType === 'downhill_finish';
    coachingInstructions = `${isFinish ? 'DOWNHILL FINISH — Descending towards the finish!' : `DOWNHILL — ${Math.abs(grade).toFixed(1)}% descent`}, ${segmentM ? segmentM + 'm into this downhill' : 'sustained descent'}.${params.segmentElevationLoss ? ` Descended ${Math.round(params.segmentElevationLoss)}m so far.` : ''}

WHAT TO DO:
- Coach downhill technique: lean SLIGHTLY forward from ankles (not backward!), increase cadence to 175+, stay light on feet, don't brake with heels
- This is "free speed" — encourage them to let gravity work. "Let the hill do the work, just control the speed"
${isFinish ? '- This is the final descent — maximum motivation. "The finish line is downhill from here, let it rip!"' : '- Advise using the downhill to recover from any previous climbs while banking faster split times'}
- If their pace is much faster than average: great, but caution about quad fatigue from braking
- If cadence is low on the descent: "pick up your turnover — short quick steps protect your knees on downhills"`;
  } else {
    coachingInstructions = `TERRAIN UPDATE — The runner is on ${eventType} terrain at ${distanceKm}km.
Give terrain-specific coaching based on their current metrics and split data.`;
  }

  const prompt = `The runner is at ${distanceKm}km into their run.
${terrainOverview}
${metricsStatus}
${splitAnalysis}
${coachingInstructions}

Give a coaching message (2-3 sentences). Sound like you KNOW this route inside and out — reference specific data points from their splits and metrics. This is spoken while running via TTS, so keep it conversational and actionable.`;

  const systemPrompt = `You are ${coachName}, an elite running coach who specializes in terrain analysis and elevation-based pacing strategy. You've analyzed thousands of runs and can instantly correlate how terrain affects a runner's pace, heart rate, and cadence.

CRITICAL RULES:
- Reference SPECIFIC numbers from their data — never be generic
- Sound like you can SEE the route and FEEL the terrain
- Correlate metrics: "your pace dropped 15 seconds on that climb but your heart rate stayed controlled — that's textbook hill management"
- Give ONE actionable technique cue specific to the current terrain
- Keep it to 2-3 sentences maximum — this is spoken while they're running
- ${toneDirective(coachTone)}${params.coachAccent ? '\n- ' + accentDirective(params.coachAccent) : ''}`;

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

  // Build emotional coaching prompts by category
  const emotionalPrompts: Record<string, string> = {
    positive_self_talk: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is struggling with negative self-talk. They are ${progress}% through their run at ${distance.toFixed(1)}km.
They need help replacing doubt with empowerment.

Generate 2-3 sentences of positive self-talk coaching that:
1. Acknowledges their struggle without judgment
2. Reframes the moment as an opportunity for mental strength
3. Provides an empowering perspective shift
4. Is delivered in your natural ${coachTone} coach voice

Focus on: "You CAN do this", "You're stronger than this moment", "Every difficult moment builds your resilience"
Do NOT be generic — reference their actual data (pace: ${currentPace}, distance: ${distance.toFixed(1)}km).
Make it personal and genuine.`,

    motivation_resilience: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is facing a challenge — they're ${progress}% through their run, ${distance.toFixed(1)}km in, in the ${phase} phase.
This is where mental toughness separates champions from others.

Generate 2-3 sentences that:
1. Acknowledge this IS difficult
2. Reframe the discomfort as strength-building
3. Inspire them to push through
4. Reference their actual effort level

Key themes: "This is the part where runners get stronger", "Discomfort is temporary, progress is permanent", "You're built for this"
Make it feel like a challenge you BELIEVE they can overcome, not doubt.`,

    focus_mindfulness: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is getting lost in negative thoughts. Help them find their flow state.

Generate 2-3 sentences that:
1. Ground them in the present moment
2. Focus on physical sensations (breathing, feet, rhythm)
3. Simplify their focus to just the next kilometer or segment
4. Create a sense of calm control

Key approaches: "Breathe in 4, out 4", "Feel the rhythm of your feet", "One step at a time", "Be present for this moment"
Use a calm, measured tone even if the coach is normally energetic.`,

    smiling_coaching: `You are ${coachName}, an AI running coach with a ${coachTone} style.

Scientific research shows that smiling reduces perceived effort by 5-10%. The runner is fatigued and needs this boost.

Generate 2-3 sentences that:
1. Suggest they smile (even a small one)
2. Explain why it helps (scientifically)
3. Make it feel achievable and fun
4. Be encouraging about the result

Key phrases: "Try a smile", "Give me a quick grin", "Smiling relaxes your body", "It tells your brain you've got this"
Make it feel like a game or challenge, not an order.`,

    relaxation: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is tense — their muscles are tight, they're fighting the pace instead of flowing.

Generate 2-3 sentences that:
1. Give specific relaxation cues (shoulders, hands, jaw)
2. Explain how tension wastes energy
3. Help them feel more efficient immediately
4. Be direct and actionable

Key cues: "Drop your shoulders", "Loosen your hands", "Relax your jaw", "Smooth and easy", "Let it flow"
Reference their current effort level to show you understand.`,

    end_of_run: `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner has just finished. This is about celebration, gratitude, and growth recognition.

Generate 2-3 sentences that:
1. Acknowledge what they just accomplished
2. Help them feel proud of their effort
3. Recognize their growth or strength
4. End on an inspiring note

Key themes: "You DID that", "Look what you just accomplished", "Be proud of yourself", "This is how champions are built"
Make it feel personal and genuine — reference something specific about their run.`
  };

  const prompt = emotionalPrompts[category] || emotionalPrompts.positive_self_talk;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are ${coachName}, a ${coachTone} running coach delivering emotional coaching. Keep it brief (2-3 sentences max), genuine, and impactful. NEVER start with greetings. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}`
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
 * - British, American, Australian, Irish, South African, Indian, New Zealand
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
    case 'indian':
      parts.push('Speak with an Indian English accent. Clear, rhythmic cadence with distinctive intonation patterns. Articulate and precise. Warm and encouraging with natural Indian English flow.');
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
  let prompt = `You are an AI running coach. Be encouraging, brief (1-2 sentences max), and specific to the runner's current situation. NEVER start with greetings like "Hey there", "Hey!", "Hi!" — jump straight into coaching.`;
  
  if (context.coachTone) {
    prompt += ` Your tone should be ${context.coachTone}.`;
    prompt += ` ${toneDirective(context.coachTone)}`;
  }
  
  const currentPhase = context.phase || (context.distance !== undefined 
    ? determinePhase(context.distance, context.totalDistance || null)
    : 'generic');
  
  prompt += `\n\n${COACHING_PHASE_PROMPT}`;
  prompt += `\n\nCURRENT PHASE: ${currentPhase.toUpperCase()}`;
  
  if (context.distance !== undefined) {
    prompt += ` (Runner is at ${context.distance.toFixed(2)}km`;
    if (context.totalDistance) {
      const percent = (context.distance / context.totalDistance) * 100;
      prompt += ` of ${context.totalDistance.toFixed(1)}km total, ${percent.toFixed(0)}% complete`;
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
  weatherImpact?: WeatherImpactData
): string {
  if (!weatherImpact || !weatherImpact.hasEnoughData || !weatherImpact.insights?.bestCondition) {
    return '';
  }

  const insights = weatherImpact.insights;
  const currentHour = new Date().getHours();
  
  // Determine current time of day
  let currentTimeOfDay = '';
  if (currentHour >= 5 && currentHour < 9) currentTimeOfDay = 'Morning';
  else if (currentHour >= 9 && currentHour < 12) currentTimeOfDay = 'Late Morning';
  else if (currentHour >= 12 && currentHour < 14) currentTimeOfDay = 'Midday';
  else if (currentHour >= 14 && currentTimeOfDay < 17) currentTimeOfDay = 'Afternoon';
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
  // Training plan context
  trainingPlanId?: string;
  planGoalType?: string;
  planWeekNumber?: number;
  planTotalWeeks?: number;
  workoutType?: string;
  workoutIntensity?: string;
  workoutDescription?: string;
}): Promise<{
  briefing: string;
  intensityAdvice: string;
  warnings: string[];
  readinessInsight: string;
  routeInsight?: string;
  weatherAdvantage?: string;
}> {
  const { distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, activityType, weather, coachName, coachTone, coachAccent, wellness, hasRoute = true, targetTime, targetPace, weatherImpact, runnerName, fitnessLevel, trainingPlanId, planGoalType, planWeekNumber, planTotalWeeks, workoutType, workoutIntensity, workoutDescription } = params;

  // Analyze positive weather conditions BEFORE building the prompt
  const weatherAdvantage = analyzePositiveWeatherConditions(weather, weatherImpact);

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
      gradientNote = `Steepest section: ${maxGrad.toFixed(1)}° — a tough climb, consider walking if needed`;
    } else if (maxGrad > 5) {
      gradientNote = `Steepest section: ${maxGrad.toFixed(1)}° — noticeable hill, shorten your stride and maintain effort`;
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
- Route type: Road run on mapped route`;
  } else {
    // Free run (no route) - NO terrain mention at all
    routeInfo = `
RUN (No planned route):
- Distance: ${formatDistanceForTTS(distance)}
- Type: Free run / Training run`;
  }

  // Add target pace info if user has a target time/pace
  if (targetTime && targetPace) {
    routeInfo += `
- Target: Complete ${formatDistanceForTTS(distance)} in ${formatDurationForTTS(targetTime)} (target pace: ${formatPaceForTTS(targetPace)})`;
  }

  // Build wellness context string
  let wellnessContext = '';
  if (wellness.sleepHours !== undefined) {
    wellnessContext += `\n- Sleep: ${wellness.sleepHours.toFixed(1)} hours (${wellness.sleepQuality || 'N/A'})`;
    if (wellness.sleepScore) wellnessContext += `, score: ${wellness.sleepScore}/100`;
  }
  if (wellness.bodyBattery !== undefined) {
    wellnessContext += `\n- Body Battery: ${wellness.bodyBattery}/100`;
  }
  if (wellness.stressLevel !== undefined) {
    wellnessContext += `\n- Stress: ${wellness.stressQualifier || 'N/A'} (${wellness.stressLevel}/100)`;
  }
  if (wellness.hrvStatus) {
    wellnessContext += `\n- HRV Status: ${wellness.hrvStatus}`;
    if (wellness.hrvFeedback) wellnessContext += ` - ${wellness.hrvFeedback}`;
  }
  if (wellness.restingHeartRate) {
    wellnessContext += `\n- Resting HR: ${wellness.restingHeartRate} bpm`;
  }
  if (wellness.readinessScore !== undefined) {
    wellnessContext += `\n- Overall Readiness: ${wellness.readinessScore}/100`;
  }
  
  // Build readiness guidance based on score
  let readinessGuidance = '';
  if (wellness.readinessScore !== undefined) {
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
  const prompt = `You are ${coachName}, an AI running coach. Your coaching style is ${coachTone}.
${briefingRunnerName ? `The runner's name is ${briefingRunnerName}. Use their name naturally in the briefing.` : ''}
${fitnessLevel ? `Runner's fitness level: ${fitnessLevel}.` : ''}

Generate a personalized pre-run briefing for an upcoming run.
${routeInfo}
${coachingPlanContext}
- ${weatherInfo}
${weatherAdvantage}

${wellnessContext ? `CURRENT WELLNESS STATUS (from Garmin):${wellnessContext}
${readinessGuidance}` : `NO WELLNESS DATA AVAILABLE — The runner does not have a Garmin device connected or no wellness data has been synced today. Do NOT mention body readiness, recovery status, fatigue, body battery, sleep quality, HRV, stress levels, or any wellness/biometric data. Simply skip wellness entirely in your response.`}

Based on this data, provide:
${coachingPlanContext ? `1. "briefing": MAX 2 SHORT SENTENCES (≤25 words). This is a COACHED WORKOUT — lead with the workout type and its purpose in the plan (week ${planWeekNumber} of ${planTotalWeeks}). Do NOT lead with distance or weather. ${PACE_FORMAT_RULE}
2. "intensityAdvice": ONE sentence (≤12 words). Focus entirely on the ${workoutIntensity || 'prescribed'} zone effort for this ${workoutType} session.
3. "warnings": Warnings array — empty if none.
4. "${hasRoute === true ? 'routeInsight' : 'readinessInsight'}": ONE sentence (≤12 words). ${wellnessContext ? 'How their readiness affects this specific workout.' : 'One motivational line tied to this coached session.'}` : `1. "briefing": A punchy, spoken pre-run briefing — MAX 2 SHORT SENTENCES (≤25 words). Lead with distance${targetPace ? ' and target pace' : ''}${wellnessContext ? ', then readiness' : ''}. Be direct. ${PACE_FORMAT_RULE}
2. "intensityAdvice": ONE short sentence (≤12 words) on effort/pace.
3. "warnings": Array of any warnings ${wellnessContext ? 'if their wellness indicators suggest caution' : 'based on weather or route conditions'}. Empty array if none.
${hasRoute === true ? `4. "routeInsight": ONE sentence (≤12 words) on the key terrain feature only.` : `4. "readinessInsight": ONE sentence (≤12 words). ${wellnessContext ? 'Key readiness point only.' : 'One motivational line — no wellness mention.'}`}`}

CRITICAL RULES:
- TOTAL word count across ALL fields combined MUST NOT exceed 50 words. Count carefully.
- Be punchy, direct, and natural — this is spoken aloud. Short sentences land harder.
- For runs marked "RUN (No planned route)" - do NOT mention terrain, elevation, hills, or route characteristics.
${!wellnessContext ? '- CRITICAL: No Garmin or wellness data is connected. Do NOT mention body readiness, recovery, fatigue, body battery, sleep, stress, HRV, or any biometric data.' : ''}
- NEVER start with generic greetings like "Hey there!" — jump straight in.
${coachAccent ? `- Write using natural ${coachAccent} English phrasing. The text will be spoken aloud by a ${coachAccent} voice.` : ''}

Respond as JSON with fields: briefing, intensityAdvice, warnings (array), ${hasRoute === true ? 'routeInsight' : 'readinessInsight'}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are ${coachName}, a ${coachTone} running coach who uses biometric data for personalized coaching. Respond only with valid JSON. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}` },
        { role: "user", content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    
    return {
      briefing: parsed.briefing || "Ready for your run! Let's get started.",
      intensityAdvice: parsed.intensityAdvice || "Listen to your body today.",
      warnings: parsed.warnings || [],
      readinessInsight: parsed.readinessInsight || (hasRoute ? undefined : "Your body is ready for this run."),
      routeInsight: parsed.routeInsight || (hasRoute ? terrainDescription : undefined),
      weatherAdvantage: weatherAdvantage || undefined,
    };
  } catch (error) {
    console.error("Error generating wellness-aware briefing:", error);
    return {
      briefing: "Ready for your run! Take it easy at the start and find your rhythm.",
      intensityAdvice: "Start conservatively and adjust based on how you feel.",
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
      const currentZone = getHeartRateZone(context.heartRate, 220 - 30); // Assume age 30 for now
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
}): Promise<string> {
  const { currentHR, avgHR, maxHR, targetZone, elapsedMinutes, coachName, coachTone, coachAccent, wellness, runnerAge, fitnessLevel, runnerName } = params;

  // Use age-adjusted max HR — more accurate than whatever device reported
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

  const prompt = `You are ${coachName}, a ${coachTone} running coach giving real-time heart rate guidance.
${runnerProfileContext ? `\nRunner profile: ${runnerProfileContext}` : ''}
Current stats (${elapsedMinutes} minutes into run):
- Heart Rate: ${currentHR} bpm (${percentMax}% of age-adjusted max)
- Current Zone: Zone ${currentZone} (${zoneNames[currentZone]})
- Average HR this run: ${avgHR} bpm
${targetZone ? `- Target Zone: Zone ${targetZone} (${zoneNames[targetZone]})` : ''}
${wellnessContext ? `\nWellness context: ${wellnessContext}` : ''}

Give a brief (1-2 sentences) heart rate coaching tip tailored to this runner's age and fitness level. You MUST mention their actual heart rate (${currentHR} bpm) and zone (Zone ${currentZone}). ${
  targetZone && currentZone !== targetZone 
    ? currentZone > targetZone 
      ? 'They need to slow down to hit their target zone.' 
      : 'They can pick up the pace if feeling good.'
    : ''
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are ${coachName}, giving brief real-time HR coaching. Always cite the runner's actual heart rate and zone. Keep it to 1-2 short sentences. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}` },
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
  paceConsistencyScore?: number; // 1-100
  effortScore?: number; // 1-100
  highlights: string[];
  struggles: string[];
  personalBests: string[];
  improvementTips: string[];
  trainingLoadAssessment: string;
  recoveryAdvice: string;
  nextRunSuggestion: string;
  wellnessImpact: string;
  weatherImpactAnalysis?: string; // Weather impact analysis based on historical data
  coachMotivationalMessage?: string;
  strugglePointsInsight?: string | null;
  technicalAnalysis: {
    paceAnalysis: string;
    heartRateAnalysis: string;
    cadenceAnalysis: string;
    runningDynamics: string;
    elevationPerformance: string;
  };
  garminInsights: {
    trainingEffect: string;
    vo2MaxTrend: string;
    recoveryTime: string;
  };
}

export async function generateComprehensiveRunAnalysis(params: {
  runData: any;
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
}): Promise<ComprehensiveRunAnalysis> {
  const { runData, garminActivity, wellness, weatherImpactAnalysis, previousRuns, userProfile, coachName, coachTone, coachAccent, linkedPlanId, planGoalType, planProgressWeek, planProgressWeeks, workoutType, workoutIntensity, workoutDescription } = params;
  
  // Build comprehensive prompt with all available data
  let prompt = `You are ${coachName}, an expert AI running coach with a ${coachTone} style. 
Analyze this run comprehensively using all available data from the runner's Garmin device and wellness metrics.

## RUN DATA:
- Distance: ${
  (runData.distanceInMeters || runData.distance || garminActivity?.distanceInMeters)
    ? ((runData.distanceInMeters || runData.distance || garminActivity?.distanceInMeters || 0) / 1000).toFixed(2)
    : '?'
}km
- Duration: ${runData.duration ? Math.floor(runData.duration / 60) : garminActivity?.durationInSeconds ? Math.floor(garminActivity.durationInSeconds / 60) : '?'} minutes
- Average Pace: ${runData.avgPace || (garminActivity?.averagePace ? `${Math.floor(garminActivity.averagePace)}:${Math.floor((garminActivity.averagePace % 1) * 60).toString().padStart(2, '0')}` : 'N/A')}/km
- Activity Type: ${runData.activityType || garminActivity?.activityType || 'Running'}
- Elevation Gain: ${runData.elevationGain || garminActivity?.elevationGain || 0}m
- Elevation Loss: ${runData.elevationLoss || garminActivity?.elevationLoss || 0}m
`;

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

  // Add Garmin activity metrics if available
  if (garminActivity) {
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
## RECENT RUN HISTORY (last ${previousRuns.length} runs):
`;
    previousRuns.slice(0, 5).forEach((run, i) => {
      prompt += `${i + 1}. ${run.distance?.toFixed(1) || '?'}km at ${run.avgPace || 'N/A'}/km`;
      if (run.avgHeartRate) prompt += `, ${run.avgHeartRate}bpm`;
      prompt += '\n';
    });
  }

  // Add runner-confirmed struggle points (dismissed ones already excluded by the server)
  const strugglePoints: any[] = Array.isArray(runData.strugglePoints) ? runData.strugglePoints : [];
  if (strugglePoints.length > 0) {
    prompt += `
## RUNNER-CONFIRMED STRUGGLE POINTS (${strugglePoints.length} detected, dismissed ones excluded):
These are real pace drops the runner confirmed as genuine difficulties — not stops like traffic lights or shoe tying.
`;
    strugglePoints.forEach((sp: any, i: number) => {
      const distKm = sp.distanceMeters != null ? (sp.distanceMeters / 1000).toFixed(2) : '?';
      const drop = sp.paceDropPercent != null ? `${Math.round(sp.paceDropPercent)}% pace drop` : '';
      const hr = sp.heartRate != null ? `, HR ${sp.heartRate}bpm` : '';
      const grade = sp.currentGrade != null ? `, grade ${sp.currentGrade.toFixed(1)}%` : '';
      prompt += `${i + 1}. At ${distKm}km — pace dropped from ${sp.baselinePace || '?'}/km to ${sp.paceAtStruggle || '?'}/km (${drop}${hr}${grade})`;
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

  prompt += `
## ANALYSIS REQUIRED:
Based on ALL the data above, provide a comprehensive JSON analysis with these fields:
{
  "summary": "2-3 sentence personalized summary of the run",
  "performanceScore": <1-100 based on effort, conditions, and wellness>,
  "highlights": ["3-5 positive aspects of the run"],
  "struggles": ["any challenges or areas of concern"],
  "personalBests": ["any notable achievements or improvements"],
  "improvementTips": ["3-4 specific, actionable tips for next time"],
  "trainingLoadAssessment": "Assessment of training stimulus based on training effect",
  "recoveryAdvice": "Specific recovery recommendations based on wellness and effort",
  "nextRunSuggestion": "What type of run to do next based on recovery needs",
  "wellnessImpact": "How their wellness state affected performance",
  "technicalAnalysis": {
    "paceAnalysis": "Pace consistency and efficiency analysis",
    "heartRateAnalysis": "HR zones and cardiovascular response",
    "cadenceAnalysis": "Step rate assessment",
    "runningDynamics": "Assessment of stride, ground contact, oscillation",
    "elevationPerformance": "How they handled hills"
  },
  "garminInsights": {
    "trainingEffect": "Interpretation of aerobic/anaerobic training effect",
    "vo2MaxTrend": "VO2 max context and what it means",
    "recoveryTime": "Why recovery time is what it is"
  }
}

Be specific, use the actual numbers from the data, and provide actionable insights.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: `You are ${coachName}, an expert running coach with deep knowledge of exercise physiology and Garmin metrics. Provide detailed, personalized analysis using all available biometric data. Respond only with valid JSON. ${toneDirective(coachTone)}${coachAccent ? ' ' + accentDirective(coachAccent) : ''}` 
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    
    return {
      summary: parsed.summary || "Great run today!",
      performanceScore: parsed.performanceScore || 75,
      highlights: parsed.highlights || ["Completed your run!"],
      struggles: parsed.struggles || [],
      personalBests: parsed.personalBests || [],
      improvementTips: parsed.improvementTips || ["Keep up the great work!"],
      trainingLoadAssessment: parsed.trainingLoadAssessment || "Moderate training load.",
      recoveryAdvice: parsed.recoveryAdvice || "Get adequate rest and hydration.",
      nextRunSuggestion: parsed.nextRunSuggestion || "An easy recovery run in 24-48 hours.",
      wellnessImpact: parsed.wellnessImpact || "Your wellness state supported this effort.",
      weatherImpactAnalysis: weatherImpactAnalysis || parsed.weatherImpactAnalysis || undefined,
      technicalAnalysis: {
        paceAnalysis: parsed.technicalAnalysis?.paceAnalysis || "Pace data not available.",
        heartRateAnalysis: parsed.technicalAnalysis?.heartRateAnalysis || "Heart rate data not available.",
        cadenceAnalysis: parsed.technicalAnalysis?.cadenceAnalysis || "Cadence data not available.",
        runningDynamics: parsed.technicalAnalysis?.runningDynamics || "Running dynamics not available.",
        elevationPerformance: parsed.technicalAnalysis?.elevationPerformance || "Elevation data not available.",
      },
      garminInsights: {
        trainingEffect: parsed.garminInsights?.trainingEffect || "Training effect data not available.",
        vo2MaxTrend: parsed.garminInsights?.vo2MaxTrend || "VO2 max data not available.",
        recoveryTime: parsed.garminInsights?.recoveryTime || "Recovery time estimate not available.",
      },
    };
  } catch (error) {
    console.error("Error generating comprehensive run analysis:", error);
    return {
      summary: "Great effort on your run today!",
      performanceScore: 70,
      highlights: ["Completed your run", "Stayed consistent"],
      struggles: [],
      personalBests: [],
      improvementTips: ["Keep training consistently", "Focus on recovery"],
      trainingLoadAssessment: "Training load recorded.",
      recoveryAdvice: "Rest well and stay hydrated.",
      nextRunSuggestion: "Take a rest day or do an easy run.",
      wellnessImpact: "Unable to assess wellness impact.",
      weatherImpactAnalysis: weatherImpactAnalysis || undefined,
      technicalAnalysis: {
        paceAnalysis: "Analysis unavailable.",
        heartRateAnalysis: "Analysis unavailable.",
        cadenceAnalysis: "Analysis unavailable.",
        runningDynamics: "Analysis unavailable.",
        elevationPerformance: "Analysis unavailable.",
      },
      garminInsights: {
        trainingEffect: "Data unavailable.",
        vo2MaxTrend: "Data unavailable.",
        recoveryTime: "Data unavailable.",
      },
    };
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

  // Coaching programme context — populated when run is a scheduled plan workout
  trainingPlanId?: string;
  workoutId?: string;
  workoutType?: string;       // easy | tempo | intervals | long_run | hill_repeats | recovery
  workoutDescription?: string;
  planGoalType?: string;      // 5k | 10k | half_marathon | marathon
  planWeekNumber?: number;
  planTotalWeeks?: number;
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
    trainingPlanId, workoutType, workoutDescription, planGoalType, planWeekNumber, planTotalWeeks
  } = params;

  // For Zone 1-2 aerobic/recovery runs, skip speed-focused coaching (final pushes, sprint finishes)
  // These zones are about heart rate control, not speed
  if ((coachingType === 'final_500m' || coachingType === 'final_100m') && targetHeartRateZone && targetHeartRateZone <= 2) {
    return `Great work maintaining Zone ${targetHeartRateZone}! Keep the effort steady to the finish. Focus on your breathing and heart rate, not the pace.`;
  }

  const timeMin = Math.floor(elapsedTime / 60);
  const progress = targetDistance ? Math.round((distance / targetDistance) * 100) : 0;
  const remaining = targetDistance ? (targetDistance - distance).toFixed(1) : '?';
  const spokenPace = formatPaceForTTS(currentPace);
  const spokenAvgPace = formatPaceForTTS(averagePace);
  const spokenTargetPace = formatPaceForTTS(targetPace);

  const noTerrainRule = hasRoute ? '' : `\nCRITICAL: No planned route. Do NOT mention hills, terrain, elevation, climbing, descending, or any terrain characteristics.`;

  // Build runner status block (shared across all types)
  let status = `Runner Status:
- Distance: ${distance.toFixed(2)}km${targetDistance ? ` of ${targetDistance}km (${progress}%)` : ''} — ${remaining}km remaining
- Time: ${timeMin} minutes
- Current pace: ${spokenPace}
- Average pace: ${spokenAvgPace}`;
  if (heartRate && heartRate > 0) status += `\n- Heart rate: ${heartRate} bpm`;
  if (cadence && cadence > 0) status += `\n- Cadence: ${cadence} spm`;
  if (hasRoute && totalElevationGain && totalElevationGain > 0) status += `\n- Elevation climbed: ${Math.round(totalElevationGain)}m`;
  if (hasRoute && currentGrade && Math.abs(currentGrade) > 2) status += `\n- Current gradient: ${currentGrade.toFixed(1)}%`;
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

  let typePrompt = '';
  let systemExtra = '';

  switch (coachingType) {

    case 'technique_form': {
      // For Zone 1-2 aerobic runs, focus on breathing/comfort, NOT posture/form correction
      const isAerobicZone = targetHeartRateZone && targetHeartRateZone <= 2;
      
      typePrompt = `COACHING TYPE: Running technique & form check.

${status}
${noTerrainRule}

Give a focused technique coaching cue (2-3 sentences). Pick ONE technique area and coach it with specific, actionable cues the runner can apply RIGHT NOW:

${isAerobicZone ? `
For this Zone 2 aerobic session, focus on COMFORT and SUSTAINABILITY:
- Check your breathing: steady, rhythmic, sustainable at current effort
- Arms should feel relaxed and loose — not tense
- Let your natural pace settle in — you're building aerobic fitness, not speed
- Listen to your body and stay relaxed
` : `
Choose the most relevant for this moment in the run:
${progress < 30 ? `- EARLY RUN: Focus on establishing good form — relaxed shoulders, arms at 90 degrees, slight forward lean from ankles, landing under hips.` :
  progress < 70 ? `- MID RUN: Focus on efficiency — are they bouncing too much? Arms crossing midline? Tension creeping into shoulders or jaw? Quick feet.` :
  `- LATE RUN: Focus on fatigue management — when tired, form breaks down. Cue them to check posture (tall spine), relax hands (no clenching), drive arms forward.`}
${cadence && cadence < 165 ? `- Their cadence is ${cadence} spm — below optimal. Cue quicker steps: "Think quick, light feet. Your arms set the rhythm — pump them faster and your legs will follow."` : ''}
${heartRate && heartRate > 170 ? `- HR is high (${heartRate}bpm) — cue breathing technique: "Breathe from your belly. Try a 2-in, 2-out pattern matched to your footstrike."` : ''}
${hasRoute && currentGrade && currentGrade > 3 ? `- On uphill: "Shorten your stride, lean into the hill from your ankles, pump your arms, and maintain effort — not pace."` : ''}
${hasRoute && currentGrade && currentGrade < -3 ? `- On downhill: "Lean slightly forward, increase turnover, stay light on your feet. Don't brake with your heels."` : ''}
`}

Reference at least one data point. Keep it conversational — this is spoken aloud while running.`;
      systemExtra = isAerobicZone 
        ? 'For this Zone 2 session, emphasize comfort and sustainability. Coach breathing rhythm, relaxation, and how to stay comfortable at effort.' 
        : 'You specialize in running biomechanics and form coaching. Give one specific, actionable technique cue — not a generic reminder.';
      break;
    }

    case 'milestone':
      typePrompt = `COACHING TYPE: Milestone celebration — runner just hit ${milestonePercent}% of their target distance!

${status}
${noTerrainRule}

Give a celebratory, motivating message (2-3 sentences):
1. Acknowledge the milestone (${milestonePercent}% done, ${distance.toFixed(1)}km covered)
2. Reinforce what they've done well so far (reference their actual pace, consistency, or effort)
3. Set the tone for the next phase:
${milestonePercent && milestonePercent <= 25 ? '   - Quarter way: "Great start, settle into your rhythm, lots of running ahead"' :
  milestonePercent && milestonePercent <= 50 ? '   - Halfway: "You\'re at the turnaround point — everything from here is the home stretch"' :
  '   - Three quarters: "The hard work is almost done — time to dig in and finish strong"'}
${targetTime ? `\nProjected finish: ${projectedFinishTime ? Math.floor(projectedFinishTime / 60) + ' minutes' : 'unknown'} (target: ${Math.floor(targetTime / 60)} minutes)${projectedFinishTime && projectedFinishTime < targetTime ? ' — AHEAD OF TARGET, let them know!' : projectedFinishTime && projectedFinishTime > targetTime ? ' — behind target, encourage them to push' : ''}` : ''}

Make them feel like they've accomplished something. Reference their actual numbers.`;
      systemExtra = 'Celebrate the milestone with genuine enthusiasm while weaving in their real data. Make them feel proud of what they\'ve achieved so far.';
      break;

    case 'positive_reinforcement':
      typePrompt = `COACHING TYPE: Positive reinforcement — the runner is executing well!

${status}
${noTerrainRule}

The runner deserves recognition for strong execution:
${consecutiveConsistentSplits && consecutiveConsistentSplits >= 3 ? `- They've run ${consecutiveConsistentSplits} consecutive consistent splits — excellent pacing discipline!` : ''}
${isNegativeSplitting ? '- They are NEGATIVE SPLITTING (getting faster as the run progresses) — this is elite-level pacing!' : ''}
${fastestSplitKm && fastestSplitPace ? `- Their fastest split was km ${fastestSplitKm} at ${formatPaceForTTS(fastestSplitPace)} — call this out!` : ''}

Give a reinforcing message (2-3 sentences):
1. Call out SPECIFICALLY what they're doing well (consistent pacing, negative splitting, etc.)
2. Explain briefly WHY this is good running (e.g., "consistent pacing means you're running efficiently and saving energy for when it counts")
3. Encourage them to maintain it

This is about reinforcing excellence with substance — not empty praise.`;
      systemExtra = 'Reinforce strong running with specific praise. Explain why what they\'re doing is good technique/strategy.';
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
- Give a specific technique cue to arrest the fade (e.g., "reset your form — drop your shoulders, pump your arms, quicken your feet")
- Remind them of their target or what good pacing looks like` :
  paceTrendDirection === 'speeding_up' ? `- Reinforce the positive trend — they're running smart
- Caution against going too fast too early if they're under 60% done
- If they're past 60%, encourage the push` :
  `- Praise the consistency — this is disciplined running
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

      typePrompt = `COACHING TYPE: Terrain-aware run analysis — sound like you know EVERYTHING about this route.

${status}
${noTerrainRule}

TERRAIN PROFILE:
- Route classification: ${totalElevationGain && distance > 0.5 ? (totalElevationGain / distance < 5 ? 'FLAT' : totalElevationGain / distance < 15 ? 'UNDULATING' : totalElevationGain / distance < 30 ? 'HILLY' : 'MOUNTAINOUS') : 'unknown'}
- Current gradient: ${currentGrade ? currentGrade.toFixed(1) + '%' : '~0% (flat)'}
- Total climb: ${totalElevationGain ? Math.round(totalElevationGain) + 'm' : '0m'} | Total descent: ${totalElevationLoss ? Math.round(totalElevationLoss) + 'm' : '0m'}
- Elevation gain per km: ${totalElevationGain && distance > 0.5 ? (totalElevationGain / distance).toFixed(1) + 'm/km' : 'minimal'}
${heartRate ? `- Heart rate: ${heartRate} bpm` : ''}
${cadence ? `- Cadence: ${cadence} spm` : ''}
${terrainAnalysis}

${isUphill ? `UPHILL — They're on a ${currentGrade!.toFixed(1)}% climb right now.
YOUR COACHING MUST:
- Correlate their pace change with the gradient — "your pace dropped Xs on this climb, that's exactly proportional to the grade"
- Coach uphill technique: shorter stride, ankle lean, arm drive, effort > pace
- If HR is high + climbing: "heart rate is elevated because of the gradient — that's physics, not fitness. Stay controlled."
- If cadence dropped: "shorten your stride and quicken your feet — shorter faster steps are more efficient uphill"` :
  isDownhill ? `DOWNHILL — They're on a ${Math.abs(currentGrade!).toFixed(1)}% descent right now.
YOUR COACHING MUST:
- Coach them to use this descent strategically — "this is free speed, let gravity do the work"
- Technique: lean forward from ankles, increase cadence to 175+, light feet, avoid heel braking
- If their pace is much faster than average: praise it but caution on quad fatigue
- If they're banking time: "great section to recover heart rate while keeping pace up"` :
  `FLAT/UNDULATING TERRAIN — The route is ${totalElevationGain && distance > 0.5 && totalElevationGain / distance < 5 ? 'very flat with minimal undulation' : 'gently undulating'}.
YOUR COACHING MUST:
- Acknowledge the terrain: "You're on a beautifully flat stretch" or "this route has gentle undulation"
- On flat terrain, pace consistency is everything — praise tight splits or address drift
- If pace spread is < 15s: "Your splits are incredibly consistent on this flat terrain — that's disciplined, smart running"
- If they're negative splitting on flat: "You're getting faster as the run goes on — textbook pacing on a flat route"
- If pace is drifting on flat: "On flat ground, pace drift usually means form is breaking down — reset: drop shoulders, pump arms, quick feet"
- Coach one flat-specific technique: cadence rhythm, hip extension, relaxed upper body, forward lean
- If HR is stable: "Your heart rate is steady — you've found a sustainable effort level, that's great running"
- Energy management: if they look comfortable and have distance remaining, suggest conserving for a strong finish push`}

Give 2-3 sentences that sound like you've analyzed every metre of this route. Reference SPECIFIC data points.`;
      systemExtra = 'You are an elite running coach specializing in terrain analysis. You can see the full elevation profile, every split, and every metric. Sound like you KNOW this route. Correlate terrain with pace/HR/cadence changes. Be specific, not generic.';
      break;
    }

    case 'heart_rate_check': {
      // Zone 2 aerobic focus: check HR, encourage steady breathing, reinforce it's about conditioning
      const targetHRMin = targetHeartRateZone === 2 ? Math.round(heartRate ? heartRate * 0.85 : 120) : 0;
      const targetHRMax = targetHeartRateZone === 2 ? Math.round(heartRate ? heartRate * 1.05 : 150) : 0;
      
      typePrompt = `COACHING TYPE: Heart rate focus check for Zone 2 aerobic session.

${status}
${noTerrainRule}

This is a Zone 2 conditioning session. The goal is HEART RATE CONTROL, not pace.

${heartRate ? `Current HR: ${heartRate} bpm. Target Zone 2 range: roughly ${targetHRMin}-${targetHRMax} bpm.
${heartRate > targetHRMax ? `Your HR is above the Zone 2 target. Slow down slightly to bring it back into range. Remember, this isn't about speed — it's about training your heart at a sustainable effort.` : heartRate < targetHRMin ? `Your HR is below the Zone 2 target. You can pick up the pace slightly if you feel good. Stay comfortable and conversational.` : `Your HR is right where it should be! Keep this steady effort. This is optimal for aerobic training.`}` : `Keep checking your heart rate if you have a device. Zone 2 is about maintaining a conversational pace where your heart rate stays in the aerobic zone — not too easy, not too hard.`}

Give a brief (1-2 sentences) HR-focused coaching message:
1. Acknowledge their heart rate and where it sits relative to Zone 2
2. Reinforce that TODAY'S GOAL is heart rate, not pace — slower is fine if that's what keeps HR steady
3. Encourage steady, sustainable breathing

${PACE_FORMAT_RULE}`;
      systemExtra = 'For Zone 2 aerobic sessions, coaching is ONLY about heart rate. Pace is secondary. Remind the runner that slowing down to control HR is exactly right. Emphasize conditioning the heart, not chasing speed.';
      break;
    }

    case 'final_500m': {
      const etaProjMin = projectedFinishTime ? Math.floor(projectedFinishTime / 60) : 0;
      const etaProjSec = projectedFinishTime ? Math.round(projectedFinishTime % 60) : 0;
      const tgtMin = targetTime ? Math.floor(targetTime / 60) : 0;
      const tgtSec = targetTime ? Math.round(targetTime % 60) : 0;

      let targetContext = '';
      if (targetTime && targetTimeCategory === 'on_track') {
        targetContext = `\nTARGET TIME CONTEXT — MENTION THIS:
The runner's target time is ${tgtMin} minutes ${tgtSec > 0 ? tgtSec + ' seconds' : ''}. Their projected finish is ${etaProjMin} minutes ${etaProjSec > 0 ? etaProjSec + ' seconds' : ''}.
${etaOverTargetPercent !== undefined && etaOverTargetPercent <= 0
  ? `They are ON TRACK or UNDER their target — tell them! "You're going to beat your target!" or "Your ${tgtMin}-minute goal is RIGHT THERE!"`
  : `They are within ${etaOverTargetPercent?.toFixed(1)}% of their target — they can still make it with a push! Tell them exactly what they're chasing.`}`;
      } else if (targetTime && targetTimeCategory === 'strong_effort') {
        targetContext = `\nTARGET TIME CONTEXT — POSITIVE FRAMING:
Their target was ${tgtMin} minutes but projected finish is ${etaProjMin} minutes ${etaProjSec > 0 ? etaProjSec + ' seconds' : ''} (${etaOverTargetPercent?.toFixed(1)}% over).
Frame this positively — "strong effort today" or "you've pushed hard" — do NOT dwell on missing the target. Focus the energy on finishing strong.`;
      }
      // targetTimeCategory === 'no_mention' → no target context at all

      typePrompt = `COACHING TYPE: FINAL 500 METERS — the finish line is close!

${status}
${noTerrainRule}
${targetContext}

The runner has ${remainingMeters || 500} meters left. This is the FINAL PUSH.

Give a HIGH-ENERGY motivational coaching message (2-3 sentences):
1. Tell them they have 500 meters to go — make them feel the finish line
2. ${targetContext ? 'Reference their target time if context above says to' : 'Pure motivation — dig deep, strong finish, leave nothing out there'}
3. Give ONE final technique cue: "Pump your arms! Lift your knees! Drive to the finish!"

This must sound like a coach screaming at the finish line — maximum energy, maximum belief. Make them SPRINT.`;
      systemExtra = 'Maximum motivational energy. This is the final 500m — coach like you\'re at the finish line cheering them in. Brief, powerful, electric.';
      break;
    }

    case 'final_100m': {
      let targetContext100 = '';
      if (targetTime && targetTimeCategory === 'on_track') {
        const tgt100Min = Math.floor(targetTime / 60);
        targetContext100 = `They are about to SMASH their ${tgt100Min}-minute target! Tell them!`;
      }

      typePrompt = `COACHING TYPE: FINAL 100 METERS — FINISH LINE!

The runner has approximately 100 meters to the finish. THIS IS IT.
${targetContext100}

Give the most intense, powerful 1-2 sentence motivational burst possible:
- "100 meters! EVERYTHING YOU'VE GOT! FINISH STRONG!"
- This is pure adrenaline. No data, no technique. Just raw, passionate coaching.
- Make them feel like a champion crossing the finish line.
- Keep it SHORT — they're sprinting.`;
      systemExtra = 'This is the final 100m. Maximum intensity. 1-2 sentences of pure fire. Sound like a coach screaming at the finish line.';
      break;
    }
  }

  const prompt = `You are ${coachName}, an ELITE running coach with a ${coachTone} style. You're coaching this runner IN REAL-TIME via audio.

${typePrompt}
${PACE_FORMAT_RULE}

Keep it to 2-3 spoken sentences (under 20 seconds of audio). Every word must add value.`;

  const systemMsg = `You are ${coachName}, an elite ${coachTone} running coach delivering real-time audio coaching during a run. You combine data-driven insight with elite technique coaching. Reference the runner's actual numbers. Never give empty motivation — every word is backed by data or technique knowledge. ${systemExtra} ${PACE_FORMAT_RULE} ${toneDirective(coachTone)}`;

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
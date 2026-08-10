// Run-specific coaching prompt templates.
//
// These are the "divergent" half of triggers that used to live as isWalkSession ternaries
// buried inside a single shared function in ai-service.ts. The numeric/context computation
// that feeds these templates (pace math, terrain, splits, HR zones, history framing) stays
// shared in ai-service.ts and is passed in pre-computed — only the prompt wording itself is
// forked, so a run-only coaching tweak can be made here without touching walk sessions at all.
// See server/coaching-prompts-walk.ts for the walk counterpart and
// server/coaching-activity.ts for the shared activity-type resolver/vocabulary.

import {
  formatDistanceForCoaching,
  toneDirective,
  accentDirective,
  PACE_FORMAT_RULE,
  VARIETY_INSTRUCTION,
  getPaceContextDirective,
} from "./ai-service";
import { runnerProfileBlock } from "./runner-profile-service";

export interface PaceUpdatePromptContext {
  coachName: string;
  coachTone: string;
  isSplit: boolean;
  splitKm?: number;
  spokenSplitPace: string;
  distance: number;
  targetDistance: number;
  progress: number;
  timeFormatted: string;
  spokenCurrentPace: string | null;
  targetPaceParam?: string;
  spokenTargetPace: string;
  hrContext: string;
  cadenceContext: string;
  splitTargetVerdict: string;
  trainingSessionContext: string;
  routeCtxBlock: string;
  terrainContext: string;
  paceTrend: string;
  noTerrainRule: string;
  sessionSplitContext: string;
  isTrainingSession: boolean;
  workoutType?: string;
  hasRoute?: boolean;
  isOnHill?: boolean;
  runnerContext: string;
  currentGrade?: number;
  fitnessLevel?: string;
  heartRate?: number;
  currentPaceSecPerKm?: number;
  runnerProfile?: string | null;
  accentRule: string;
}

export function paceUpdatePrompt(ctx: PaceUpdatePromptContext): { system: string; user: string } {
  const user = ctx.isSplit && ctx.splitKm && ctx.spokenSplitPace
    ? `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.
${ctx.runnerContext ? `\nRunner context: ${ctx.runnerContext}` : ''}
The runner just completed kilometer ${ctx.splitKm} with a split pace of ${ctx.spokenSplitPace}.
- Overall progress: ${formatDistanceForCoaching(ctx.distance)} of ${ctx.targetDistance ? `${formatDistanceForCoaching(ctx.targetDistance)} (${ctx.progress}%)` : '?'}
- Time elapsed: ${ctx.timeFormatted}
- Overall average pace: ${ctx.spokenCurrentPace}
- This split pace: ${ctx.spokenSplitPace}${ctx.targetPaceParam ? `\n- Target pace: ${ctx.spokenTargetPace}` : ''}${ctx.hrContext}${ctx.cadenceContext}
${ctx.splitTargetVerdict ? `\nPACE ASSESSMENT: ${ctx.splitTargetVerdict}` : ''}
${ctx.trainingSessionContext}
${ctx.routeCtxBlock ? `\n${ctx.routeCtxBlock}` : ''}
${ctx.terrainContext}${ctx.paceTrend}
${ctx.noTerrainRule}
${PACE_FORMAT_RULE}
${VARIETY_INSTRUCTION}
Give a brief (1-2 sentences) split update. ${ctx.routeCtxBlock ? 'PRIORITISE the route memory data — mention the split delta vs last run or average (faster/slower by X seconds) as this is the most impactful insight. If a terrain alert is present, mention that first. ' : ''}You MUST mention their SPLIT pace (${ctx.spokenSplitPace}) and${ctx.splitTargetVerdict ? ' whether they are on track for their target pace (CRITICAL — do NOT praise a slow split if they are behind target).' : ctx.sessionSplitContext ? ' how their split compares to the session target pace.' : ctx.isTrainingSession ? ` how this split relates to the ${ctx.workoutType!.replace(/_/g, ' ')} session goal.` : ' at least one other data point (progress, time, or pace trend).'} ${ctx.cadenceContext && (ctx.workoutType === 'tempo' || ctx.workoutType === 'threshold') ? 'If cadence is a concern, include a brief cadence cue. ' : ''}${ctx.hasRoute === true && ctx.isOnHill ? 'Acknowledge the hill effort. ' : ''}${ctx.paceTrend ? 'Comment on their pace trend.' : ''}`
    : `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.
${ctx.runnerContext ? `\nRunner context: ${ctx.runnerContext}` : ''}
500m check-in: Runner is at ${formatDistanceForCoaching(ctx.distance)}, pace ${ctx.spokenCurrentPace}, ${ctx.timeFormatted} elapsed.
${ctx.terrainContext}
${ctx.noTerrainRule}
${PACE_FORMAT_RULE}
${VARIETY_INSTRUCTION}
Give a very brief (1-2 sentences) pace check-in. MUST cite their pace (${ctx.spokenCurrentPace}) and distance (${formatDistanceForCoaching(ctx.distance)}). ${ctx.hasRoute === true && ctx.isOnHill ? ' Acknowledge the hill they are on.' : ''}`;

  const system = `You are ${ctx.coachName}, a ${ctx.coachTone} running coach. Keep pace updates brief but ALWAYS cite the runner's actual numbers (pace, split time, distance). When running history is available, compare current performance to their recent averages to personalise the insight. ${PACE_FORMAT_RULE} ${(ctx.hasRoute || (typeof ctx.currentGrade === 'number' && Math.abs(ctx.currentGrade) > 0.5)) ? 'GPS elevation data available — be terrain-aware when hills are present. ' : 'No terrain data — do NOT mention hills, terrain, or elevation. '}Be honest about pace performance — calibrate how directly you address a pace gap to the runner's experience level and the tone directive below.

${getPaceContextDirective(
  ctx.currentPaceSecPerKm,
  ctx.fitnessLevel,
  undefined,
  ctx.workoutType,
  ctx.heartRate,
  undefined,
  ctx.runnerProfile
)}

${toneDirective(ctx.coachTone)}${ctx.accentRule ? ' ' + ctx.accentRule : ''}${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

export interface StruggleCoachingPromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  distance: number;
  paceDropPercent: number;
  spokenCurrentPace: string;
  spokenBaselinePace: string;
  timeMin: number;
  terrainContext: string;
  trainingStruggleContext: string;
  noTerrainRule: string;
  runnerContext: string;
  runnerProfile?: string | null;
}

export function struggleCoachingPrompt(ctx: StruggleCoachingPromptContext): { system: string; user: string } {
  const user = `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.
${ctx.runnerContext ? `\nRunner context: ${ctx.runnerContext}` : ''}
The runner is struggling. Their pace has dropped ${Math.round(ctx.paceDropPercent)}% from their baseline.
- Current pace: ${ctx.spokenCurrentPace} (baseline was ${ctx.spokenBaselinePace})
- Distance: ${formatDistanceForCoaching(ctx.distance)}
- Time: ${ctx.timeMin} minutes
${ctx.terrainContext}
${ctx.trainingStruggleContext}
${ctx.noTerrainRule}
${PACE_FORMAT_RULE}
Give a brief (1-2 sentences) supportive message tailored to this runner's fitness level and history. You MUST cite at least one specific number. Acknowledge their struggle, but encourage them to push through or adjust their strategy based on what you know about their recent form.`;

  const system = `You are ${ctx.coachName}, a ${ctx.coachTone} running coach. Be supportive during tough moments — always reference actual data. Keep it brief. ${PACE_FORMAT_RULE} ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? ' ' + accentDirective(ctx.coachAccent) : ''}${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

export const STRUGGLE_FALLBACK_MESSAGE = "I can see you're working hard. Take a breath and find your rhythm again.";

// ── Elevation coaching (getElevationCoaching in ai-service.ts) ─────────────────────────
// The big eventType-branching logic that builds `coachingInstructions` (climb/descent/
// rolling/flat terrain templates) is already activity-aware via inline ternaries and stays
// entirely shared in ai-service.ts — only the outer prompt/system wrapper is forked here.
export interface ElevationCoachingPromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  distanceKm: string;
  terrainOverview: string;
  metricsStatus: string;
  splitAnalysis: string;
  coachingInstructions: string;
  futureBanRule: string;
  runnerProfile?: string | null;
}

export function elevationCoachingPrompt(ctx: ElevationCoachingPromptContext): { system: string; user: string } {
  const user = `The runner is at ${ctx.distanceKm} into their run.
${ctx.terrainOverview}
${ctx.metricsStatus}
${ctx.splitAnalysis}
${ctx.coachingInstructions}

Give a coaching message (2-3 sentences). Sound like you KNOW this route inside and out — reference specific data points from their splits and metrics. This is spoken while running via TTS, so keep it conversational and actionable.`;

  const system = `You are ${ctx.coachName}, an elite running coach who specializes in terrain analysis and elevation-based pacing strategy. You've analyzed thousands of runs and can instantly correlate how terrain affects a runner's pace, heart rate, and cadence.

CRITICAL RULES:
- Reference SPECIFIC numbers from their data — never be generic
- Sound like you can SEE the route and FEEL the terrain THEY ARE ON RIGHT NOW
- Correlate metrics: "your pace dropped 15 seconds on that climb but your heart rate stayed controlled — that's textbook hill management"
- Give ONE actionable technique cue specific to the current terrain
- Keep it to 2-3 sentences maximum — this is spoken while they're running
- NEVER use the word "summit" or "crest" as a prediction
- Descents SPEED UP pace — never say descending slows you down or is harder
- ${ctx.futureBanRule}
- ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? '\n- ' + accentDirective(ctx.coachAccent) : ''}` + runnerProfileBlock(ctx.runnerProfile);

  return { system, user };
}

// ── Phase coaching (generatePhaseCoaching in ai-service.ts) ────────────────────────────
// This one trigger endpoint actually covers three distinct sub-flows: turn-by-turn
// navigation cues, live pace-deviation coaching, and phase/500m check-ins. Each gets its
// own prompt pair below rather than one mega-context, mirroring the branches in
// generatePhaseCoaching itself.

export interface NavigationTurnPromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  distContext: string;
  distance: number;
  currentPace?: string;
  navigationInstruction: string;
  runnerProfile?: string | null;
}

export function navigationTurnPrompt(ctx: NavigationTurnPromptContext): { system: string; user: string } {
  const user = `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.

The runner is following a mapped route and needs a navigation direction:
Navigation instruction: "${ctx.navigationInstruction}"
${ctx.distContext}
Runner context: ${formatDistanceForCoaching(ctx.distance)} into their run, pace ${ctx.currentPace || 'unknown'}.

Deliver this navigation direction naturally in your coaching voice. Keep it to 1 SHORT sentence (max 15 words).
You MUST include the actual direction (left, right, straight, etc.) and street name if given.
Be concise — the runner needs to hear this quickly. Add a tiny bit of coach personality but prioritise clarity.
Examples of good output: "Quick right turn onto May Street, looking good!", "Left here onto Dublin Road, keep that rhythm!"`;

  const system = `You are ${ctx.coachName}, a ${ctx.coachTone} running coach delivering a navigation cue. Be extremely brief and clear — max 1 sentence, max 15 words. The direction must be unmistakable. ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? ' ' + accentDirective(ctx.coachAccent) : ''}${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

export interface PaceCoachingPromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  progressPercent: number;
  targetDistanceFormatted?: string;
  distanceFormatted: string;
  avgPaceFormatted: string;
  targetPaceFormatted: string;
  rollingPaceFormatted: string;
  gradientContext: string;
  trendContext: string;
  plateauContext: string;
  paceGuidance: string;
  heartRate?: number;
  paceCadenceNote: string;
  runnerFirstName?: string | null;
  runnerProfile?: string | null;
}

export function paceCoachingPrompt(ctx: PaceCoachingPromptContext): { system: string; user: string } {
  const user = `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.

PACE COACHING
The runner is ${ctx.progressPercent.toFixed(0)}% through their ${ctx.targetDistanceFormatted ?? 'run'}, having covered ${ctx.distanceFormatted}.
- Average pace: ${ctx.avgPaceFormatted}/km
- Target pace: ${ctx.targetPaceFormatted}/km
- Recent pace (last 500m): ${ctx.rollingPaceFormatted}/km
${ctx.gradientContext}
${ctx.trendContext}
${ctx.plateauContext || ctx.paceGuidance}

${ctx.heartRate ? `Heart rate: ${ctx.heartRate} bpm.` : ''}
${ctx.paceCadenceNote}

${VARIETY_INSTRUCTION}
Give 2-3 sentences of pace coaching. Be specific about the numbers — tell them their actual pace and what they need.
${ctx.progressPercent > 80 ? "They're in the final stretch — be extra motivating!" : ""}
Do NOT use markdown, emojis, or bullet points — this will be spoken aloud.
Do NOT start with any greeting like "Hey there", "Hey!", "Hi!". Jump straight into the pace coaching.${ctx.runnerFirstName ? ` The runner's name is ${ctx.runnerFirstName} — use it naturally but not as a greeting.` : ''}`;

  const system = `You are ${ctx.coachName}, a ${ctx.coachTone} running coach giving pace guidance. Be specific with pace numbers (use "X minutes Y seconds per kilometre" format, not "X:YY"). Keep it concise (2-3 sentences). NEVER start with greetings.

CRITICAL TERRAIN RULE: If the runner is descending (downhill gradient), their pace NATURALLY SPEEDS UP due to gravity. This is biomechanically correct and expected. DO NOT say descents "slow you down", "make things harder", or imply downhill is negative. If they're faster on descent, that's GOOD — acknowledge it naturally or comment on form control.

${PACE_FORMAT_RULE} ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? ' ' + accentDirective(ctx.coachAccent) : ''}${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

export function paceCoachingFallback(avgPaceFormatted: string, targetPaceFormatted: string): string {
  return `You're running ${avgPaceFormatted} per kilometre, target is ${targetPaceFormatted}.`;
}

export interface RunStartPromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  targetDistanceFormatted?: string;
  targetTimeFormatted?: string;
  noTerrainRule: string;
  runnerProfileContext: string;
  planContext: string;
  runnerFirstName?: string | null;
}

export function runStartPrompt(ctx: RunStartPromptContext): { system: string; user: string } {
  const user = `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.

The runner has just started their run${ctx.targetDistanceFormatted ? ` — their target is ${ctx.targetDistanceFormatted}` : ''}${ctx.targetTimeFormatted ? ` in ${ctx.targetTimeFormatted}` : ''}.
${ctx.noTerrainRule}${ctx.runnerProfileContext}${ctx.planContext}
Give a short, energetic motivational message (2-3 sentences) to kick off their run. Focus on getting them pumped up and ready to go. Do NOT mention distance covered, pace, cadence, or any metrics — the run has literally just begun. Just motivate them!
${VARIETY_INSTRUCTION}
CRITICAL: Do NOT start with any greeting like "Hey there", "Hey!", "Hi!", or "Hello". Jump straight into the coaching message.${ctx.runnerFirstName ? ` You may use "${ctx.runnerFirstName}" naturally but not as a greeting opener.` : ''}`;

  const system = `You are ${ctx.coachName}, a ${ctx.coachTone} running coach. Give a brief, energetic send-off to start the run. No stats or metrics — just motivation. NEVER start with "Hey there", "Hey!", "Hi!" or any greeting — jump straight into the coaching. ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? ' ' + accentDirective(ctx.coachAccent) : ''}`;

  return { system, user };
}

export interface DuringPhasePromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  is500mCheckin: boolean;
  phaseDescription: string;
  distanceFormatted: string;
  targetDistanceSuffix: string;
  timeFormatted: string;
  currentPaceLine: string;
  paceComparisonInfo: string;
  targetTimeInfo: string;
  hrInfo: string;
  cadenceInfo: string;
  terrainInfo: string;
  elevationInstruction: string;
  cadenceInstruction: string;
  noTerrainRule: string;
  runnerProfileContext: string;
  planContext: string;
  runnerFirstName?: string | null;
  targetPace?: string;
  targetTimeFormatted?: string;
  hasTargetTime: boolean;
  hasNoBaseline: boolean;
  paceVerdict: string;
  hasRoute?: boolean;
  cadenceCoachingDirective: string;
  runnerProfile?: string | null;
}

export function duringPhasePrompt(ctx: DuringPhasePromptContext): { system: string; user: string } {
  const user = `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.

${ctx.is500mCheckin ? `TRIGGER: First 500m check-in` : `Phase: ${ctx.phaseDescription}`}
Runner Status:
- Distance covered: ${ctx.distanceFormatted}${ctx.targetDistanceSuffix}
- Time elapsed: ${ctx.timeFormatted}
${ctx.currentPaceLine}
${ctx.paceComparisonInfo}
${ctx.targetTimeInfo}
${ctx.hrInfo}
${ctx.cadenceInfo}
${ctx.terrainInfo}
${ctx.elevationInstruction}
${ctx.cadenceInstruction}
${ctx.noTerrainRule}${ctx.runnerProfileContext}${ctx.planContext}
${PACE_FORMAT_RULE}
${VARIETY_INSTRUCTION}
${ctx.is500mCheckin ? `This is the runner's first check-in at 500m. Give a brief initial read on how the run is going (2-3 sentences), weaving in their actual pace and distance.` : `Give a brief (2-3 sentences) phase-appropriate coaching message.`}
CRITICAL: Do NOT start with any greeting like "Hey there", "Hey!", "Hi!", "Hello", or "Hey superstar". Jump straight into the coaching content.${ctx.runnerFirstName ? ` You may address them as "${ctx.runnerFirstName}" naturally within the message but not as an opening greeting.` : ''}

Weave in the runner's actual stats (pace, distance, time, cadence, heart rate) naturally — this should feel like a real coach watching their performance, not generic encouragement. CRITICAL: Pace values are already fully formatted — do NOT reformat them.${ctx.targetPace ? (ctx.hasNoBaseline ? ` Mention their current pace naturally. They have a target pace but no established baseline — treat the gap as context, not a verdict. Focus on the run itself, not the shortfall.` : ` Comment on their pace relative to target (${ctx.paceVerdict}).`) : ''}${ctx.hasTargetTime ? (ctx.hasNoBaseline ? ` Their goal is ${ctx.targetTimeFormatted} — reference it lightly if it fits, but don't make projected finish time the centrepiece.` : ` Address whether they are on track for their ${ctx.targetTimeFormatted} target time.`) : ''}${ctx.cadenceCoachingDirective ? ' Incorporate the cadence coaching directive above.' : ''}${ctx.elevationInstruction ? ' Acknowledge the elevation context.' : ''}${ctx.hasRoute === true && !ctx.elevationInstruction ? ' Consider terrain if relevant.' : ''}`;

  const system = `You are ${ctx.coachName}, a ${ctx.coachTone} running coach. Keep messages concise (2-3 sentences) and always reference the runner's actual numbers. NEVER start with greetings — jump straight into coaching. ${PACE_FORMAT_RULE} ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? ' ' + accentDirective(ctx.coachAccent) : ''}${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

// ── Interval coaching (generateIntervalCoaching in ai-service.ts) ──────────────────────
export interface IntervalCoachingPromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  intervalNumber: number;
  isWorkPhase: boolean;
  phaseProgress: number;
  phaseName: string;
  phaseEmphasis: string;
  paceContext: string;
  hrContext: string;
  totalIntervals?: number;
  planContextBlock: string;
  runnerProfile?: string | null;
}

export function intervalCoachingPrompt(ctx: IntervalCoachingPromptContext): { system: string; user: string } {
  const user = `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.

INTERVAL COACHING — ${ctx.intervalNumber > 1 ? `Rep ${ctx.intervalNumber}` : 'Rep 1 (Establish pace)'} ${ctx.isWorkPhase ? 'WORK' : 'RECOVERY'}
${ctx.phaseProgress}% through the ${ctx.phaseName}.
${ctx.phaseEmphasis}

${ctx.paceContext}
${ctx.hrContext}

${ctx.totalIntervals ? `This is rep ${ctx.intervalNumber} of ${ctx.totalIntervals} total.` : ''}
${ctx.planContextBlock}

Give 1–2 punchy, direct sentences. ${ctx.isWorkPhase ? 'Push them hard but safely.' : 'Help them recover and prepare for the next effort. If it fits, remind them how this session serves their training goal.'}`;

  const system = `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style, delivering live interval coaching mid-session. ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? ' ' + accentDirective(ctx.coachAccent) : ''}${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

// ── Cadence coaching (generateCadenceCoaching in ai-service.ts) ────────────────────────
// Run cadence coaching is biomechanics/target-driven (stride length, spm targets,
// overstriding/understriding) — a genuinely different coaching domain from walk cadence
// coaching (posture/rhythm/arm-drive, no numeric targets at all), so unlike the other
// triggers these two functions intentionally do NOT share a context shape.
export interface CadenceCoachingPromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  zoneAnalysis: string;
  cadence: number;
  dynOptimalCadenceTarget: number | undefined;
  dynOptimalCadenceMin: number;
  dynOptimalCadenceMax: number;
  strideCm: number;
  optMinCm: number;
  optMaxCm: number;
  currentPaceFormatted: string;
  distanceFormatted: string;
  timeFormatted: string;
  heartRate?: number;
  physicalContext: string;
  runnerProfile?: string | null;
}

export function cadenceCoachingPrompt(ctx: CadenceCoachingPromptContext): { system: string; user: string } {
  const user = `You are ${ctx.coachName}, an AI running coach with a ${ctx.coachTone} style.

${ctx.zoneAnalysis}

Runner Data:
- Current cadence: ${ctx.cadence} spm
- Personal optimal cadence: ${ctx.dynOptimalCadenceTarget} spm (${ctx.dynOptimalCadenceMin}–${ctx.dynOptimalCadenceMax} spm range)
- Stride length: ${ctx.strideCm}cm (optimal stride range: ${ctx.optMinCm}-${ctx.optMaxCm}cm)
- Current pace: ${ctx.currentPaceFormatted}
- Distance: ${ctx.distanceFormatted}, time: ${ctx.timeFormatted}
${ctx.heartRate ? `- Heart rate: ${ctx.heartRate} bpm` : ''}
${ctx.physicalContext}

${PACE_FORMAT_RULE}
Decide whether cadence coaching is needed right now. If yes, reference their actual number (they can't see the screen). Keep it 2-3 sentences, spoken aloud. If cadence isn't the priority, coach what matters more. No emojis. No markdown.`;

  const system = `You are ${ctx.coachName}, an elite ${ctx.coachTone} running coach. You understand biomechanics, but you prioritize what matters most RIGHT NOW. Reference actual numbers. Keep it 2-3 sentences spoken aloud. No emojis. ${PACE_FORMAT_RULE} ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? ' ' + accentDirective(ctx.coachAccent) : ''}${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

// ── Heart rate coaching (generateHeartRateCoaching in ai-service.ts) ───────────────────
// Wellness/session-memory/physiological-response/terrain blocks are pre-rendered
// activity-agnostic (or already activity-aware) strings computed once in ai-service.ts.
export interface HeartRateCoachingPromptContext {
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  runnerProfileContext: string;
  elapsedMinutes: number;
  currentHR: number;
  percentMax: number;
  currentZone: number;
  zoneName: string;
  avgHR: number;
  targetZone?: number;
  targetZoneName?: string;
  wellnessContext: string;
  terrainContextBlock: string;
  sensorNote: string;
  sessionMemoryBlock: string;
  physioBlock: string;
  targetZoneGuidance: string;
  runnerProfile?: string | null;
}

export function heartRateCoachingPrompt(ctx: HeartRateCoachingPromptContext): { system: string; user: string } {
  const user = `You are ${ctx.coachName}, a ${ctx.coachTone} running coach giving real-time heart rate guidance.
${ctx.runnerProfileContext ? `\nRunner profile: ${ctx.runnerProfileContext}` : ''}
Current stats (${ctx.elapsedMinutes} minutes into run):
- Heart Rate: ${ctx.currentHR} bpm (${ctx.percentMax}% of age-adjusted max)
- Current Zone: Zone ${ctx.currentZone} (${ctx.zoneName})
- Average HR this run: ${ctx.avgHR} bpm
${ctx.targetZone ? `- Target Zone: Zone ${ctx.targetZone} (${ctx.targetZoneName})` : ''}
${ctx.wellnessContext ? `\nWellness context: ${ctx.wellnessContext}` : ''}
${ctx.terrainContextBlock}${ctx.sensorNote}${ctx.sessionMemoryBlock}${ctx.physioBlock}
Give a brief (1-2 sentences) heart rate coaching tip. You MUST mention their actual heart rate (${ctx.currentHR} bpm) and zone (Zone ${ctx.currentZone}). ${ctx.targetZoneGuidance}
→ If topics have already been covered, choose a fresh angle — vary your coaching focus rather than repeating what was just said.
→ If the athlete is already responding (see response block), acknowledge that first.`;

  const system = `You are ${ctx.coachName}, giving brief real-time HR coaching. Always cite the runner's actual heart rate and zone. Keep it to 1-2 short sentences. ${toneDirective(ctx.coachTone)}${ctx.coachAccent ? ' ' + accentDirective(ctx.coachAccent) : ''}${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

// ── Post-run summary (generateRunSummary in ai-service.ts) ─────────────────────────────
export interface RunSummaryPromptContext {
  runData: any;
  runnerProfile?: string | null;
}

export function runSummaryPrompt(ctx: RunSummaryPromptContext): { system: string; user: string } {
  const user = `Analyze this run and provide a brief summary with highlights, struggles, and tips:
Run Data:
- Distance: ${ctx.runData.distance}km
- Duration: ${ctx.runData.duration} minutes
- Average Pace: ${ctx.runData.avgPace}
- Elevation Gain: ${ctx.runData.elevationGain || 0}m
- Session Type: run
- Weather: ${JSON.stringify(ctx.runData.weather || {})}

Use run terminology throughout. Say "running"/"runner"/"run pace".
Provide response as JSON with fields: highlights (array), struggles (array), tips (array), overallScore (1-10), summary (string)`;

  const system = `You are an expert running coach providing post-run analysis. Respond only with valid JSON.${runnerProfileBlock(ctx.runnerProfile)}`;

  return { system, user };
}

export const RUN_SUMMARY_FALLBACK = {
  highlights: ["Completed your run!"],
  struggles: [] as string[],
  tips: ["Keep up the great work!"],
  overallScore: 7,
  summary: "Great effort on your run today!"
};


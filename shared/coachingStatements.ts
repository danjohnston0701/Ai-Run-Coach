export type CoachingPhase = 'early' | 'mid' | 'late' | 'final' | 'generic';

export interface CoachingStatement {
  id: string;
  text: string;
  phase: CoachingPhase;
  category: 'form' | 'motivation' | 'breathing' | 'pacing' | 'mental';
}

export const COACHING_STATEMENTS: CoachingStatement[] = [
  // EARLY PHASE: First 2km OR first 10% of run - Focus on warm-up, settling in
  { id: 'early_1', text: "Keep your posture tall and proud, imagine a string gently lifting the top of your head.", phase: 'early', category: 'form' },
  { id: 'early_2', text: "Settle into a steady, rhythmic breathing pattern that feels sustainable.", phase: 'early', category: 'breathing' },
  { id: 'early_3', text: "Start easy and let your body warm up naturally. The best runs build momentum.", phase: 'early', category: 'pacing' },
  { id: 'early_4', text: "Relax your shoulders and let them drop away from your ears.", phase: 'early', category: 'form' },
  { id: 'early_5', text: "Find your rhythm. These first kilometers are about settling into a sustainable pace.", phase: 'early', category: 'pacing' },
  { id: 'early_6', text: "Keep your hands soft, stretch your fingers and release the tension.", phase: 'early', category: 'form' },
  { id: 'early_7', text: "Great start! Focus on smooth, relaxed movements as you warm up.", phase: 'early', category: 'motivation' },
  { id: 'early_8', text: "Keep your eyes on the horizon, not your feet.", phase: 'early', category: 'form' },

  // MID PHASE: 3-5km OR 40-50% of run - Maintain effort, form check
  { id: 'mid_1', text: "Lightly engage your core to keep your torso stable as your legs and arms move.", phase: 'mid', category: 'form' },
  { id: 'mid_2', text: "You're in the groove now. Stay relaxed and maintain your rhythm.", phase: 'mid', category: 'motivation' },
  { id: 'mid_3', text: "Think quick and elastic, lifting the foot up and through instead of pushing long and hard.", phase: 'mid', category: 'form' },
  { id: 'mid_4', text: "Keep your arms relaxed and swinging naturally with your stride.", phase: 'mid', category: 'form' },
  { id: 'mid_5', text: "Let your foot land roughly under your body instead of reaching out in front.", phase: 'mid', category: 'form' },
  { id: 'mid_6', text: "Run with quiet confidence. Efficient, relaxed form is your biggest advantage today.", phase: 'mid', category: 'mental' },
  { id: 'mid_7', text: "You're building a strong foundation. This is where consistency pays off.", phase: 'mid', category: 'motivation' },
  { id: 'mid_8', text: "Check in with your breathing. Keep it controlled and rhythmic.", phase: 'mid', category: 'breathing' },

  // LATE PHASE: 7km+ OR 75-90% of run - Mental strength, pushing through fatigue
  { id: 'late_1', text: "Stay tall through your hips, avoid collapsing or bending at the waist as you tire.", phase: 'late', category: 'form' },
  { id: 'late_2', text: "If you're starting to tire, take a deep breath and reset your rhythm.", phase: 'late', category: 'breathing' },
  { id: 'late_3', text: "Pain fades, pride lasts. Push through this stretch and keep your head up.", phase: 'late', category: 'motivation' },
  { id: 'late_4', text: "Your body is capable of more than your mind believes. Trust your training.", phase: 'late', category: 'mental' },
  { id: 'late_5', text: "You've come this far. Maintain your form and keep moving forward.", phase: 'late', category: 'motivation' },
  { id: 'late_6', text: "When it gets tough, focus on the next 100 meters, not the whole distance.", phase: 'late', category: 'mental' },
  { id: 'late_7', text: "This is where champions are made. Embrace the challenge.", phase: 'late', category: 'motivation' },
  { id: 'late_8', text: "Relax your face and jaw. Tension there wastes precious energy.", phase: 'late', category: 'form' },

  // FINAL PHASE: Last 10% of run - Finishing strong, celebrating achievement
  { id: 'final_1', text: "You're almost there! Give it everything you have left.", phase: 'final', category: 'motivation' },
  { id: 'final_2', text: "The finish line is calling. Dig deep and finish strong!", phase: 'final', category: 'motivation' },
  { id: 'final_3', text: "Last push! Every step now is a step closer to victory.", phase: 'final', category: 'motivation' },
  { id: 'final_4', text: "Empty the tank. Leave nothing behind on this final stretch.", phase: 'final', category: 'motivation' },
  { id: 'final_5', text: "You've earned this finish. Sprint home if you can!", phase: 'final', category: 'motivation' },
  { id: 'final_6', text: "The end is in sight. This is your moment to shine!", phase: 'final', category: 'motivation' },

  // GENERIC: Can be used at any time
  { id: 'generic_1', text: "Remember to smile! It helps you relax and enjoy the run.", phase: 'generic', category: 'mental' },
  { id: 'generic_2', text: "You're stronger with every stride. Stay smooth, stay strong.", phase: 'generic', category: 'motivation' },
  { id: 'generic_3', text: "Focus on form. Tall posture, light feet, and controlled breathing.", phase: 'generic', category: 'form' },
  { id: 'generic_4', text: "Your body can do this. Trust it and let your mind follow.", phase: 'generic', category: 'mental' },
  { id: 'generic_5', text: "One step at a time. That's how every great journey is conquered.", phase: 'generic', category: 'motivation' },
  { id: 'generic_6', text: "Every run is a story of progress. Focus on your purpose.", phase: 'generic', category: 'motivation' },
  { id: 'generic_7', text: "It's not about being the fastest, it's about little improvements every session.", phase: 'generic', category: 'mental' },
  { id: 'generic_8', text: "Remember why you started. Keep going, you're making progress.", phase: 'generic', category: 'motivation' },
  { id: 'generic_9', text: "Breathe deep and reset. The next kilometer is yours to own.", phase: 'generic', category: 'breathing' },
  { id: 'generic_10', text: "Your body is capable of amazing things. Trust the process and keep moving forward.", phase: 'generic', category: 'motivation' },
];

export interface PhaseThresholds {
  early: { maxKm: number; maxPercent: number };
  mid: { minKm: number; maxKm: number; minPercent: number; maxPercent: number };
  late: { minKm: number; minPercent: number; maxPercent: number };
  final: { minPercent: number };
}

export const DEFAULT_PHASE_THRESHOLDS: PhaseThresholds = {
  early: { maxKm: 2, maxPercent: 10 },
  mid: { minKm: 3, maxKm: 5, minPercent: 40, maxPercent: 50 },
  late: { minKm: 7, minPercent: 75, maxPercent: 90 },
  final: { minPercent: 90 },
};

export function determinePhase(
  distanceKm: number,
  totalDistanceKm: number | null,
  thresholds: PhaseThresholds = DEFAULT_PHASE_THRESHOLDS
): CoachingPhase {
  const percentComplete = totalDistanceKm && totalDistanceKm > 0
    ? (distanceKm / totalDistanceKm) * 100
    : null;

  // If we have total distance, use percentage-based phase detection (more accurate)
  if (percentComplete !== null) {
    // Final phase: last 10% of run
    if (percentComplete >= thresholds.final.minPercent) {
      return 'final';
    }
    
    // Late phase: 75-90% of run
    if (percentComplete >= thresholds.late.minPercent) {
      return 'late';
    }
    
    // Mid phase: 40-50% of run
    if (percentComplete >= thresholds.mid.minPercent && percentComplete <= thresholds.mid.maxPercent) {
      return 'mid';
    }
    
    // Early phase: first 10% of run
    if (percentComplete <= thresholds.early.maxPercent) {
      return 'early';
    }
    
    // Between early and mid, or between mid and late - use generic
    return 'generic';
  }
  
  // No total distance known (free run) - use ONLY absolute distance thresholds
  // But be conservative: without knowing total distance, avoid late/final phases
  // to prevent fatigue-related statements early in potentially long runs
  
  // Early phase: first 2km
  if (distanceKm <= thresholds.early.maxKm) {
    return 'early';
  }
  
  // Mid phase: 3-5km
  if (distanceKm >= thresholds.mid.minKm && distanceKm <= thresholds.mid.maxKm) {
    return 'mid';
  }
  
  // For free runs beyond 5km without known total, default to generic
  // This prevents fatigue messaging at 7km when user might be doing a 20km run
  return 'generic';
}

export const MAX_STATEMENT_USES = 3;

export function getAvailableStatements(
  currentPhase: CoachingPhase,
  usageCounts: Record<string, number>
): CoachingStatement[] {
  return COACHING_STATEMENTS.filter(statement => {
    // Check if statement is for current phase or is generic
    const phaseMatch = statement.phase === currentPhase || statement.phase === 'generic';
    
    // Check if statement hasn't exceeded max uses
    const usageCount = usageCounts[statement.id] || 0;
    const withinLimit = usageCount < MAX_STATEMENT_USES;
    
    return phaseMatch && withinLimit;
  });
}

export function selectStatement(
  currentPhase: CoachingPhase,
  usageCounts: Record<string, number>,
  preferPhaseSpecific: boolean = true
): CoachingStatement | null {
  const available = getAvailableStatements(currentPhase, usageCounts);
  
  if (available.length === 0) {
    return null;
  }
  
  // Prefer phase-specific statements over generic ones
  if (preferPhaseSpecific) {
    const phaseSpecific = available.filter(s => s.phase === currentPhase);
    if (phaseSpecific.length > 0) {
      return phaseSpecific[Math.floor(Math.random() * phaseSpecific.length)];
    }
  }
  
  // Fall back to any available statement (including generic)
  return available[Math.floor(Math.random() * available.length)];
}

export function getPhaseDescription(phase: CoachingPhase): string {
  switch (phase) {
    case 'early':
      return 'warm-up and settling in (first 2km or first 10% of run)';
    case 'mid':
      return 'maintaining effort and form (3-5km or 40-50% of run)';
    case 'late':
      return 'pushing through fatigue (7km+ or 75-90% of run)';
    case 'final':
      return 'finishing strong (last 10% of run)';
    case 'generic':
      return 'any point during the run';
  }
}

export function getPhaseInstructions(): string {
  return `
COACHING PHASE RULES - CRITICAL:
You must ONLY use coaching statements appropriate for the runner's current phase:

1. EARLY PHASE (first 2km OR first 10% of run):
   - Focus on: warm-up, settling into rhythm, relaxed form
   - Topics: posture basics, breathing pattern establishment, easy pacing
   - Avoid: fatigue-related advice, pushing through pain, finishing strong messages

2. MID PHASE (3-5km OR 40-50% of run):
   - Focus on: maintaining form, staying in the groove, rhythm
   - Topics: core engagement, arm swing, foot strike, confidence
   - Avoid: warm-up advice, final sprint encouragement

3. LATE PHASE (7km+ OR 75-90% of run):
   - Focus on: mental strength, managing fatigue, maintaining form under tiredness
   - Topics: resetting when tired, embracing challenge, breaking distance into chunks
   - This is the ONLY phase where fatigue-related advice is appropriate

4. FINAL PHASE (last 10% of run):
   - Focus on: finishing strong, celebration, final push
   - Topics: sprint to finish, leaving nothing behind, victory lap
   - Maximum motivation and energy

5. GENERIC (any time):
   - Timeless advice: smiling, trust in training, purpose reminders
   - Use sparingly to supplement phase-specific content

REPETITION RULE: Do not use the same statement more than 3 times during a single run.
`;
}

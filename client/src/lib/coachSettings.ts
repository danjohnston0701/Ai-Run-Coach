export type CoachGender = 'male' | 'female';
export type CoachAccent = 'british' | 'australian' | 'american' | 'irish' | 'scottish' | 'newzealand';
export type CoachTone = 'energetic' | 'motivational' | 'instructive' | 'factual' | 'abrupt';

export interface AiCoachSettings {
  gender: CoachGender;
  accent: CoachAccent;
  tone: CoachTone;
}

const STORAGE_KEY = 'aiCoachSettings';

export const defaultSettings: AiCoachSettings = {
  gender: 'male',
  accent: 'british',
  tone: 'energetic',
};

export function loadCoachSettings(): AiCoachSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        gender: parsed.gender || defaultSettings.gender,
        accent: parsed.accent || defaultSettings.accent,
        tone: parsed.tone || defaultSettings.tone,
      };
    }
  } catch (e) {
    console.error('Failed to load coach settings:', e);
  }
  return defaultSettings;
}

export function saveCoachSettings(settings: AiCoachSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save coach settings:', e);
  }
}

export const accentLabels: Record<CoachAccent, string> = {
  british: 'British',
  australian: 'Australian',
  american: 'American',
  irish: 'Irish',
  scottish: 'Scottish',
  newzealand: 'New Zealand',
};

export const toneLabels: Record<CoachTone, string> = {
  energetic: 'Energetic',
  motivational: 'Motivational',
  instructive: 'Instructive',
  factual: 'Factual',
  abrupt: 'Abrupt',
};

export const toneDescriptions: Record<CoachTone, string> = {
  energetic: 'High energy, upbeat encouragement',
  motivational: 'Inspiring and supportive coaching',
  instructive: 'Clear, detailed guidance and tips',
  factual: 'Straightforward stats and information',
  abrupt: 'Short, direct commands',
};

export function getVoicePreferences(settings: AiCoachSettings): {
  preferredNames: string[];
  langPreferences: string[];
  rate: number;
  pitch: number;
} {
  const { gender, accent, tone } = settings;
  
  const maleVoices: Record<CoachAccent, string[]> = {
    british: ['Daniel', 'James', 'Arthur', 'Oliver', 'George', 'Google UK English Male'],
    australian: ['Lee', 'Gordon', 'Aaron'],
    american: ['Alex', 'Fred', 'Tom', 'Google US English'],
    irish: ['Moira'],
    scottish: ['Fiona'],
    newzealand: ['Daniel'],
  };
  
  const femaleVoices: Record<CoachAccent, string[]> = {
    british: ['Kate', 'Serena', 'Martha', 'Google UK English Female'],
    australian: ['Karen', 'Catherine'],
    american: ['Samantha', 'Victoria', 'Allison', 'Susan', 'Google US English'],
    irish: ['Moira'],
    scottish: ['Fiona'],
    newzealand: ['Karen'],
  };
  
  const langMap: Record<CoachAccent, string> = {
    british: 'en-GB',
    australian: 'en-AU',
    american: 'en-US',
    irish: 'en-IE',
    scottish: 'en-GB',
    newzealand: 'en-NZ',
  };
  
  const toneSettings: Record<CoachTone, { rate: number; pitch: number }> = {
    energetic: { rate: 1.1, pitch: 1.15 },
    motivational: { rate: 1.0, pitch: 1.1 },
    instructive: { rate: 0.95, pitch: 1.0 },
    factual: { rate: 0.9, pitch: 0.95 },
    abrupt: { rate: 1.2, pitch: 1.0 },
  };
  
  const preferredNames = gender === 'male' ? maleVoices[accent] : femaleVoices[accent];
  const langPreferences = [langMap[accent]];
  const { rate, pitch } = toneSettings[tone];
  
  return { preferredNames, langPreferences, rate, pitch };
}

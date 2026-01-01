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

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'ash' | 'coral';

export function getTTSVoice(settings: AiCoachSettings): TTSVoice {
  const { gender, accent } = settings;
  
  const voiceMap: Record<CoachAccent, { male: TTSVoice; female: TTSVoice }> = {
    british: { male: 'fable', female: 'nova' },
    australian: { male: 'echo', female: 'shimmer' },
    american: { male: 'onyx', female: 'alloy' },
    irish: { male: 'ash', female: 'coral' },
    scottish: { male: 'echo', female: 'sage' },
    newzealand: { male: 'onyx', female: 'shimmer' },
  };
  
  return voiceMap[accent][gender];
}

export function getVoicePreferences(settings: AiCoachSettings): {
  preferredNames: string[];
  langPreferences: string[];
  rate: number;
  pitch: number;
} {
  const { gender, accent, tone } = settings;
  
  const maleVoices: Record<CoachAccent, string[]> = {
    british: ['Daniel', 'James', 'Arthur', 'Oliver', 'George', 'Google UK English Male', 'Microsoft Ryan', 'Microsoft George'],
    australian: ['Lee', 'Gordon', 'Aaron', 'Google UK English Male'],
    american: ['Alex', 'Fred', 'Tom', 'Aaron', 'Google US English Male'],
    irish: ['Daniel', 'James', 'Google UK English Male'],
    scottish: ['Daniel', 'James', 'Google UK English Male'],
    newzealand: ['Daniel', 'Lee', 'Google UK English Male'],
  };
  
  const femaleVoices: Record<CoachAccent, string[]> = {
    british: ['Kate', 'Serena', 'Martha', 'Google UK English Female', 'Microsoft Hazel'],
    australian: ['Karen', 'Catherine', 'Google UK English Female'],
    american: ['Samantha', 'Victoria', 'Allison', 'Susan', 'Ava', 'Google US English Female'],
    irish: ['Moira', 'Kate', 'Google UK English Female'],
    scottish: ['Fiona', 'Kate', 'Google UK English Female'],
    newzealand: ['Karen', 'Catherine', 'Google UK English Female'],
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

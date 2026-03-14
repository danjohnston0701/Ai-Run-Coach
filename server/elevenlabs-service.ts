/**
 * ElevenLabs TTS Service
 *
 * Provides genuine regional accent voices using ElevenLabs API.
 * ElevenLabs has native-speaker voices for Scottish, South African,
 * Caribbean/Jamaican, Irish, Australian and more — something OpenAI
 * TTS simply cannot match.
 *
 * Voice IDs come from ElevenLabs' pre-built library + Voice Library.
 * Configure overrides via ELEVENLABS_VOICE_* environment variables so
 * the voice can be swapped without a code change.
 *
 * API docs: https://elevenlabs.io/docs/api-reference/text-to-speech
 */

// ============================================================
// VOICE LIBRARY
// Each entry is { male, female } pair of ElevenLabs voice IDs.
// Set ELEVENLABS_VOICE_<ACCENT>_MALE / _FEMALE env vars to override.
// ============================================================

const VOICE_LIBRARY: Record<string, { male: string; female: string; name: string }> = {
  // --- Official pre-built ElevenLabs voices ---
  british: {
    male:   process.env.ELEVENLABS_VOICE_BRITISH_MALE   || 'onwK4e9ZLuTAKqWW03F9', // Daniel – deep British male
    female: process.env.ELEVENLABS_VOICE_BRITISH_FEMALE || 'ThT5KcBeYPX3keUQqHPh', // Dorothy – British female
    name: 'British',
  },
  american: {
    male:   process.env.ELEVENLABS_VOICE_AMERICAN_MALE   || 'pNInz6obpgDQGcFmaJgB', // Adam – American male
    female: process.env.ELEVENLABS_VOICE_AMERICAN_FEMALE || 'EXAVITQu4vr4xnSDxMaL', // Sarah – American female
    name: 'American',
  },
  australian: {
    male:   process.env.ELEVENLABS_VOICE_AUSTRALIAN_MALE   || 'IKne3meq5aSn9XLyUdCD', // Charlie – Australian male
    female: process.env.ELEVENLABS_VOICE_AUSTRALIAN_FEMALE || 'jsCqWAovK2LkecY7zXl4', // Freya – American but warm/closest default
    name: 'Australian',
  },
  irish: {
    male:   process.env.ELEVENLABS_VOICE_IRISH_MALE   || 'D38z5RcWu1voky8WS1ja', // Fin – Irish male
    female: process.env.ELEVENLABS_VOICE_IRISH_FEMALE || 'LcfcDJNUP1GQjkzn1xUU', // Emily
    name: 'Irish',
  },
  welsh: {
    male:   process.env.ELEVENLABS_VOICE_WELSH_MALE   || 'onwK4e9ZLuTAKqWW03F9', // fallback to British
    female: process.env.ELEVENLABS_VOICE_WELSH_FEMALE || 'ThT5KcBeYPX3keUQqHPh',
    name: 'Welsh',
  },

  // --- Authentic regional accent voices (Voice Library) ---
  // These MUST be set via env vars from the ElevenLabs Voice Library.
  // Go to: https://elevenlabs.io/voice-library and search for the accent.
  // Default IDs below are the best available alternatives until you
  // set your preferred voice IDs.
  scottish: {
    male:   process.env.ELEVENLABS_VOICE_SCOTTISH_MALE   || 'nPczCjzI2devNBz1zQrb', // Brian – Scottish/British male
    female: process.env.ELEVENLABS_VOICE_SCOTTISH_FEMALE || 'ThT5KcBeYPX3keUQqHPh', // Dorothy as fallback
    name: 'Scottish',
  },
  south_african: {
    male:   process.env.ELEVENLABS_VOICE_SA_MALE   || 'g5CIjZEefAph4nQFvHAz', // Ethan as default; override with SA voice
    female: process.env.ELEVENLABS_VOICE_SA_FEMALE || 'piTKgcLEGmPE4e6mEKli', // Nicole as default
    name: 'South African',
  },
  caribbean: {
    male:   process.env.ELEVENLABS_VOICE_CARIBBEAN_MALE   || 'TxGEqnHWrfWFTfGW9XjX', // Josh as default; override with Caribbean voice
    female: process.env.ELEVENLABS_VOICE_CARIBBEAN_FEMALE || 'AZnzlk1XvdvUeBnXmlld', // Domi as default
    name: 'Caribbean',
  },
  canadian: {
    male:   process.env.ELEVENLABS_VOICE_CANADIAN_MALE   || 'pNInz6obpgDQGcFmaJgB', // Similar to American
    female: process.env.ELEVENLABS_VOICE_CANADIAN_FEMALE || 'EXAVITQu4vr4xnSDxMaL',
    name: 'Canadian',
  },
  indian: {
    male:   process.env.ELEVENLABS_VOICE_INDIAN_MALE   || 'GBv7mTt0atIp3Br8iCZE', // Thomas as default
    female: process.env.ELEVENLABS_VOICE_INDIAN_FEMALE || 'pMsXgVXv3BLzUgSXRplE', // Serena as default
    name: 'Indian',
  },
  scandinavian: {
    male:   process.env.ELEVENLABS_VOICE_SCANDINAVIAN_MALE   || 'N2lVS1w4EtoT3dr4eOWO', // Callum
    female: process.env.ELEVENLABS_VOICE_SCANDINAVIAN_FEMALE || 'zrHiDhphv9ZnVXBqCLjz', // Mimi – Swedish female
    name: 'Scandinavian',
  },
  new_zealand: {
    male:   process.env.ELEVENLABS_VOICE_NZ_MALE   || 'IKne3meq5aSn9XLyUdCD', // Charlie (Australian is closest)
    female: process.env.ELEVENLABS_VOICE_NZ_FEMALE || 'jsCqWAovK2LkecY7zXl4',
    name: 'New Zealand',
  },
};

// ============================================================
// RESOLVE VOICE ID
// ============================================================

/**
 * Given a coach accent + gender, return the ElevenLabs voice ID to use.
 */
export function resolveElevenLabsVoice(coachAccent?: string, coachGender?: string): string {
  const accent = (coachAccent || 'british').toLowerCase().replace(/[\s-]/g, '_');
  const gender = coachGender === 'male' ? 'male' : 'female';

  // Normalise some common alias spellings
  const aliasMap: Record<string, string> = {
    english: 'british',
    standard: 'british',
    south_african: 'south_african',
    'south african': 'south_african',
    caribbean: 'caribbean',
    jamaican: 'caribbean',
    aussie: 'australian',
    newzealand: 'new_zealand',
    nz: 'new_zealand',
    'new zealand': 'new_zealand',
  };

  const key = aliasMap[accent] || accent;
  const entry = VOICE_LIBRARY[key] || VOICE_LIBRARY['british'];
  const voiceId = entry[gender];

  console.log(`[ElevenLabs] Resolved voice: accent="${coachAccent}" → key="${key}", gender="${gender}", voice_id="${voiceId}" (${entry.name})`);
  return voiceId;
}

// ============================================================
// TTS GENERATION
// ============================================================

/**
 * Generate TTS audio using ElevenLabs API.
 * Returns a Buffer of MP3 audio data.
 *
 * @param text       - The text to speak
 * @param voiceId    - ElevenLabs voice ID (from resolveElevenLabsVoice)
 * @param stability  - Voice stability 0-1. Higher = more consistent but less expressive (default 0.45)
 * @param style      - Style exaggeration 0-1. 0 is neutral, 1 is very expressive (default 0.3)
 */
export async function generateElevenLabsTTS(
  text: string,
  voiceId: string,
  options: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    model_id?: string;
  } = {}
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  const {
    stability = 0.45,
    similarity_boost = 0.80,
    style = 0.30,
    use_speaker_boost = true,
    model_id = 'eleven_turbo_v2_5',  // Fast, high-quality, multilingual
  } = options;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id,
      voice_settings: {
        stability,
        similarity_boost,
        style,
        use_speaker_boost,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================================
// VOICE SETTINGS BY COACHING TONE
// Map coaching tone → ElevenLabs voice settings for best expression
// ============================================================

export function getVoiceSettingsForTone(coachTone?: string): {
  stability: number;
  similarity_boost: number;
  style: number;
} {
  const tone = (coachTone || 'energetic').toLowerCase();

  switch (tone) {
    case 'energetic':
    case 'motivational':
    case 'inspirational':
      // High energy: lower stability = more variation, high style = expressive
      return { stability: 0.35, similarity_boost: 0.85, style: 0.55 };

    case 'tough love':
    case 'toughlove':
    case 'abrupt':
      // Punchy and firm: moderate stability, strong style
      return { stability: 0.40, similarity_boost: 0.80, style: 0.60 };

    case 'calm':
    case 'supportive':
    case 'encouraging':
    case 'zen':
    case 'mindful':
      // Soothing: high stability = smooth consistent voice, low style = neutral
      return { stability: 0.70, similarity_boost: 0.75, style: 0.10 };

    case 'instructive':
    case 'factual':
    case 'analytical':
      // Clear and precise: high stability, low style exaggeration
      return { stability: 0.65, similarity_boost: 0.80, style: 0.15 };

    case 'friendly':
    case 'playful':
    case 'humorous':
      // Natural and warm: balanced settings
      return { stability: 0.45, similarity_boost: 0.80, style: 0.40 };

    default:
      return { stability: 0.45, similarity_boost: 0.80, style: 0.30 };
  }
}

// ============================================================
// HIGH-LEVEL HELPER
// Single function called from coaching endpoints
// ============================================================

/**
 * Generate coaching audio with the correct accent voice and tone settings.
 * Falls back to OpenAI TTS if ElevenLabs fails or key not configured.
 */
export async function generateCoachingAudio(
  text: string,
  coachAccent?: string,
  coachGender?: string,
  coachTone?: string
): Promise<{ buffer: Buffer; provider: 'elevenlabs' | 'openai' }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (apiKey) {
    try {
      const voiceId = resolveElevenLabsVoice(coachAccent, coachGender);
      const voiceSettings = getVoiceSettingsForTone(coachTone);
      const buffer = await generateElevenLabsTTS(text, voiceId, voiceSettings);
      return { buffer, provider: 'elevenlabs' };
    } catch (err) {
      console.warn('[ElevenLabs] TTS failed, falling back to OpenAI TTS:', err);
    }
  }

  // Fallback to OpenAI TTS
  const { generateTTS, buildTTSInstructions } = await import('./ai-service');
  const voice = coachGender === 'male' ? 'alloy' : 'nova';
  const instructions = buildTTSInstructions(coachAccent, coachTone, coachGender);
  const buffer = await generateTTS(text, voice, instructions);
  return { buffer, provider: 'openai' };
}

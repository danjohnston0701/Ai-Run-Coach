/**
 * AWS Polly TTS Service
 * 
 * Provides high-quality neural TTS using AWS Polly with authentic
 * regional English accents (British, American, Australian, Irish,
 * South African, Indian, New Zealand)
 */

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

// Regional availability of Neural voices (as of 2024):
//   us-east-1     — ALL neural voices supported (safest default)
//   eu-west-1     — British, Irish, South African, Indian (NOT Aria/Olivia)
//   ap-southeast-2 — Australian (Olivia), New Zealand (Aria) — NOT Irish/SA/Indian
//
// We use us-east-1 as the default to cover all accents in one region.
// If AWS_REGION is explicitly set in env, that overrides (useful for latency tuning).
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
};

// Primary client — us-east-1 covers every neural voice we use
const pollyClient = new PollyClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials,
});

/**
 * Map coach accent and gender to Polly Neural voice ID
 */
export function mapAccentToPollyVoice(
  accent: string | undefined,
  gender: string | undefined
): string {
  const normalizedAccent = (accent || "british").toLowerCase();
  const normalizedGender = (gender || "male").toLowerCase();

  const voiceMap: Record<string, Record<string, string>> = {
    british: {
      male: "Brian",      // en-GB Neural male
      female: "Amy",      // en-GB Neural female
    },
    american: {
      male: "Matthew",    // en-US Neural male
      female: "Joanna",   // en-US Neural female
    },
    australian: {
      male: "Stephen",    // en-AU Neural male (Russell is Standard-only, not Neural)
      female: "Olivia",   // en-AU Neural female
    },
    irish: {
      male: "Sean",       // en-IE Neural male
      female: "Niamh",    // en-IE Neural female
    },
    south_african: {
      male: "Ayanda",     // en-ZA Neural (only one SA Neural voice)
      female: "Ayanda",   // en-ZA Neural female
    },
    indian: {
      male: "Kajal",      // en-IN Neural (only one IN Neural voice)
      female: "Kajal",    // en-IN Neural female
    },
    new_zealand: {
      male: "Aria",       // en-NZ — no male Neural voice exists, Aria is gender-neutral enough
      female: "Aria",     // en-NZ Neural female
    },
  };

  const accentMap = voiceMap[normalizedAccent] || voiceMap.british;
  return accentMap[normalizedGender] || accentMap.male;
}

/**
 * Map accent to Polly language code
 */
function mapAccentToLanguageCode(accent: string | undefined): string {
  const normalizedAccent = (accent || "british").toLowerCase();

  const languageMap: Record<string, string> = {
    british: "en-GB",
    american: "en-US",
    australian: "en-AU",
    irish: "en-IE",
    south_african: "en-ZA",
    indian: "en-IN",
    new_zealand: "en-NZ",
  };

  return languageMap[normalizedAccent] || "en-GB";
}

/**
 * Generate speech audio using AWS Polly Neural TTS
 * 
 * @param text - Text to synthesize
 * @param accent - Coach accent (british, american, australian, irish, south_african, indian, new_zealand)
 * @param gender - Voice gender (male or female)
 * @param tone - Optional tone instructions for speech (energetic, calm, professional, etc.)
 * @returns Buffer containing MP3 audio data
 */
export async function synthesizeSpeech(
  text: string,
  accent?: string,
  gender?: string,
  tone?: string
): Promise<Buffer> {
  if (!text || text.trim().length === 0) {
    throw new Error("Text content is required for TTS synthesis");
  }

  // Enhance text with tone instructions if provided
  let enhancedText = text;
  if (tone) {
    enhancedText = text; // Polly doesn't use SSML instructions like OpenAI
  }

  const voiceId = mapAccentToPollyVoice(accent, gender);
  const languageCode = mapAccentToLanguageCode(accent);

  try {
    const command = new SynthesizeSpeechCommand({
      Text: enhancedText,
      OutputFormat: "mp3",
      VoiceId: voiceId,
      Engine: "neural", // Use Neural engine for high quality
      LanguageCode: languageCode,
    });

    const response = await pollyClient.send(command);

    if (!response.AudioStream) {
      throw new Error("No audio stream returned from Polly");
    }

    // Convert the response body to a buffer
    const chunks: Uint8Array[] = [];
    const reader = response.AudioStream.getReader?.() || response.AudioStream;

    if (reader instanceof ReadableStreamDefaultReader) {
      let result = await reader.read();
      while (!result.done) {
        chunks.push(result.value);
        result = await reader.read();
      }
    } else if (response.AudioStream instanceof Buffer) {
      chunks.push(new Uint8Array(response.AudioStream));
    } else if (response.AudioStream instanceof Uint8Array) {
      chunks.push(response.AudioStream);
    } else {
      // Fallback: convert to buffer
      const buffer = await streamToBuffer(response.AudioStream as any);
      return buffer;
    }

    // Combine chunks into single buffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const audioBuffer = Buffer.allocUnsafe(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      audioBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    return audioBuffer;
  } catch (error: any) {
    console.error("Polly TTS synthesis error:", {
      text: text.substring(0, 100),
      accent,
      gender,
      voiceId: mapAccentToPollyVoice(accent, gender),
      error: error.message || error,
    });
    throw new Error(`Failed to synthesize speech with Polly: ${error.message}`);
  }
}

/**
 * Helper function to convert stream to buffer
 */
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on("error", (error: Error) => {
      reject(error);
    });
  });
}

/**
 * Build TTS instructions for Polly (text enhancements based on tone)
 */
export function buildPollyTTSInstructions(
  tone?: string
): string {
  // Polly doesn't use instructions like OpenAI, but we can adjust
  // speech rate, pitch, etc. through SSML if needed in future
  if (!tone) return "";

  const instructions: Record<string, string> = {
    energetic: "Speak with high energy and enthusiasm",
    motivational: "Speak with inspiring and supportive tone",
    instructive: "Speak clearly with deliberate pacing for instructions",
    factual: "Speak in a straightforward, neutral tone",
    calm: "Speak in a relaxed, calm manner",
    professional: "Speak in a professional and confident tone",
    abrupt: "Speak in a direct, brief manner",
  };

  return instructions[tone] || "";
}

/**
 * Get available voices for a specific accent
 */
export function getAvailableVoices(accent: string): {
  male: string;
  female: string;
} {
  const voiceMap: Record<string, Record<string, string>> = {
    british: { male: "Brian", female: "Amy" },
    american: { male: "Matthew", female: "Joanna" },
    australian: { male: "Stephen", female: "Olivia" },
    irish: { male: "Sean", female: "Niamh" },
    south_african: { male: "Ayanda", female: "Ayanda" },
    indian: { male: "Kajal", female: "Kajal" },
    new_zealand: { male: "Aria", female: "Aria" },
  };

  return voiceMap[accent.toLowerCase()] || voiceMap.british;
}

/**
 * Check if Polly credentials are configured
 */
export function isPollyConfigured(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

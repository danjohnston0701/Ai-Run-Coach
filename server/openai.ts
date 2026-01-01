import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface RouteGenerationRequest {
  startLat: number;
  startLng: number;
  distance: number;
  difficulty: "beginner" | "moderate" | "expert";
  terrainPreference?: "flat" | "hilly" | "mixed";
  userFitnessLevel?: string;
}

export interface GeneratedRoute {
  name: string;
  waypoints: Array<{ lat: number; lng: number }>;
  estimatedTime: number;
  elevation: number;
  tips: string[];
  description: string;
}

export interface CoachingRequest {
  currentPace: string;
  targetPace: string;
  heartRate?: number;
  elapsedTime: number;
  distanceCovered: number;
  totalDistance: number;
  difficulty: string;
  userFitnessLevel?: string;
  targetTimeSeconds?: number;
  userName?: string;
  userAge?: number;
  userWeight?: string;
  userHeight?: string;
  userGender?: string;
  desiredFitnessLevel?: string;
  coachName?: string;
  userMessage?: string;
  coachPreferences?: string;
  coachTone?: 'energetic' | 'motivational' | 'instructive' | 'factual' | 'abrupt';
}

export interface CoachingResponse {
  message: string;
  encouragement: string;
  paceAdvice: string;
  breathingTip?: string;
}

export async function generateRoute(request: RouteGenerationRequest): Promise<GeneratedRoute> {
  console.log("Generating route with params:", request);
  
  const prompt = `You are an expert running coach and route planner. Generate a running route based on these parameters:
- Starting location: ${request.startLat}, ${request.startLng}
- Target distance: ${request.distance} km
- Difficulty level: ${request.difficulty}
- Terrain preference: ${request.terrainPreference || "mixed"}
- User fitness level: ${request.userFitnessLevel || "intermediate"}

IMPORTANT: Create a circular running route that:
1. Returns to the starting point
2. Uses ONLY roads and paths (avoid water, private property, highways)
3. Total distance should be approximately ${request.distance} km
4. Stays within ${request.distance * 0.3} km radius of the start point

Generate 3-5 waypoints that follow actual roads near the starting location. The route should form a loop.

Respond in JSON format with:
{
  "name": "Creative route name",
  "waypoints": [{"lat": number, "lng": number}, ...],
  "estimatedTime": minutes as number,
  "elevation": total elevation gain in meters,
  "tips": ["tip1", "tip2", "tip3"],
  "description": "Brief route description"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    return JSON.parse(content) as GeneratedRoute;
  } catch (error) {
    console.error("Route generation error:", error);
    const defaultWaypoints = generateDefaultWaypoints(request.startLat, request.startLng, request.distance);
    return {
      name: `${request.distance}km ${request.difficulty} Loop`,
      waypoints: defaultWaypoints,
      estimatedTime: Math.round(request.distance * (request.difficulty === "beginner" ? 8 : request.difficulty === "moderate" ? 6 : 5)),
      elevation: request.difficulty === "expert" ? 150 : request.difficulty === "moderate" ? 75 : 30,
      tips: [
        "Stay hydrated throughout your run",
        "Warm up with light stretches before starting",
        "Listen to your body and adjust pace as needed"
      ],
      description: `A ${request.distance}km ${request.difficulty} running route designed for your fitness level.`
    };
  }
}

function generateDefaultWaypoints(startLat: number, startLng: number, distance: number): Array<{ lat: number; lng: number }> {
  // Calculate radius based on distance (approximate: 1km = 0.009 degrees latitude)
  // For a loop route, we want the radius to be roughly distance / (2 * PI)
  const kmPerDegree = 111; // approximate km per degree of latitude
  const loopRadius = (distance / (2 * Math.PI)) / kmPerDegree;
  
  // Create 4 waypoints for a simpler route that Directions API can handle
  const numPoints = 4;
  const waypoints = [];
  
  // Add some randomness to make routes less predictable
  const randomOffset = Math.random() * Math.PI * 0.5;
  
  for (let i = 0; i < numPoints; i++) {
    const angle = randomOffset + (2 * Math.PI * i) / numPoints;
    // Adjust for longitude scaling based on latitude
    const lngScale = Math.cos(startLat * Math.PI / 180);
    waypoints.push({
      lat: startLat + loopRadius * Math.sin(angle),
      lng: startLng + (loopRadius / lngScale) * Math.cos(angle)
    });
  }
  
  return waypoints;
}

export async function getCoachingAdvice(request: CoachingRequest): Promise<CoachingResponse> {
  const progressPercent = Math.round((request.distanceCovered / request.totalDistance) * 100);
  
  let targetTimeInfo = "";
  if (request.targetTimeSeconds) {
    const targetMins = Math.floor(request.targetTimeSeconds / 60);
    const targetSecs = request.targetTimeSeconds % 60;
    const expectedTimeAtProgress = (request.targetTimeSeconds * (request.distanceCovered / request.totalDistance));
    const timeDiff = request.elapsedTime - expectedTimeAtProgress;
    const aheadOrBehind = timeDiff < -10 ? "AHEAD of target" : timeDiff > 10 ? "BEHIND target" : "ON TRACK";
    targetTimeInfo = `\n- Target finish time: ${targetMins}:${targetSecs.toString().padStart(2, '0')}\n- Time status: ${aheadOrBehind} (${Math.abs(Math.round(timeDiff))}s ${timeDiff < 0 ? 'ahead' : 'behind'})`;
  }

  let userProfileInfo = "";
  if (request.userName || request.userAge || request.userWeight || request.userHeight) {
    userProfileInfo = "\n\nRunner Profile:";
    if (request.userName) userProfileInfo += `\n- Name: ${request.userName}`;
    if (request.userAge) userProfileInfo += `\n- Age: ${request.userAge}`;
    if (request.userGender) userProfileInfo += `\n- Gender: ${request.userGender}`;
    if (request.userHeight) userProfileInfo += `\n- Height: ${request.userHeight}`;
    if (request.userWeight) userProfileInfo += `\n- Weight: ${request.userWeight}`;
    if (request.desiredFitnessLevel) userProfileInfo += `\n- Goal: ${request.desiredFitnessLevel} fitness`;
  }

  let userMessageSection = "";
  if (request.userMessage) {
    userMessageSection = `\n\nThe runner just said: "${request.userMessage}"\nRespond to their message appropriately.`;
  }

  let preferencesSection = "";
  if (request.coachPreferences) {
    preferencesSection = `\n\nUser preferences: ${request.coachPreferences}`;
  }

  const coachIdentity = request.coachName && request.coachName !== "AI Coach" 
    ? `You are ${request.coachName}, a personalized AI running coach.`
    : "You are an encouraging AI running coach.";

  const toneInstructions: Record<string, string> = {
    energetic: "Be high-energy, enthusiastic, and upbeat. Use exclamation marks and energizing language!",
    motivational: "Be inspiring and supportive. Focus on encouragement and building confidence.",
    instructive: "Be clear and educational. Provide detailed guidance and technique tips.",
    factual: "Be straightforward and data-focused. Stick to stats and objective information.",
    abrupt: "Be very brief and direct. Use short, commanding phrases. No fluff."
  };
  
  const toneStyle = request.coachTone ? toneInstructions[request.coachTone] : toneInstructions.motivational;
  
  const prompt = `${coachIdentity} Providing real-time guidance.

COACHING STYLE: ${toneStyle}${userProfileInfo}

Current Run Stats:
- Current pace: ${request.currentPace}
- Target pace: ${request.targetPace}
- Heart rate: ${request.heartRate || "unknown"} bpm
- Progress: ${request.distanceCovered.toFixed(2)}km of ${request.totalDistance}km (${progressPercent}%)
- Elapsed time: ${Math.floor(request.elapsedTime / 60)} minutes ${request.elapsedTime % 60} seconds
- Difficulty: ${request.difficulty}
- Fitness level: ${request.userFitnessLevel || "intermediate"}${targetTimeInfo}${preferencesSection}${userMessageSection}

${request.userMessage ? "Respond to the runner's message while providing coaching." : "Provide brief, motivating coaching advice."} ${request.userName ? `Use ${request.userName}'s name occasionally for personalization.` : ""} Be specific but concise.

Respond in JSON format:
{
  "message": "Short main coaching message (max 15 words)",
  "encouragement": "Brief encouragement (max 10 words)",
  "paceAdvice": "Specific pace guidance (max 15 words)",
  "breathingTip": "Quick breathing tip if relevant (max 10 words)"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    return JSON.parse(content) as CoachingResponse;
  } catch (error) {
    console.error("Coaching advice error:", error);
    return getDefaultCoachingAdvice(request, progressPercent);
  }
}

function getDefaultCoachingAdvice(request: CoachingRequest, progressPercent: number): CoachingResponse {
  if (progressPercent < 25) {
    return {
      message: "Great start! Find your rhythm and settle into a comfortable pace.",
      encouragement: "You've got this!",
      paceAdvice: "Focus on a steady, sustainable pace for now.",
      breathingTip: "Breathe in through your nose, out through your mouth."
    };
  } else if (progressPercent < 50) {
    return {
      message: "You're warming up nicely. Keep that momentum going!",
      encouragement: "Almost halfway there!",
      paceAdvice: "Maintain your current effort level.",
      breathingTip: "Stay relaxed, keep shoulders down."
    };
  } else if (progressPercent < 75) {
    return {
      message: "Past the halfway point! Strong work, keep pushing.",
      encouragement: "You're doing amazing!",
      paceAdvice: "Hold steady, you can pick it up soon.",
      breathingTip: "Deep, rhythmic breaths."
    };
  } else {
    return {
      message: "Final stretch! Give it everything you've got!",
      encouragement: "Finish strong!",
      paceAdvice: "Push the pace if you can, the end is near!",
      breathingTip: "Power through, you're almost there!"
    };
  }
}

export async function analyzeRunPerformance(runData: {
  distance: number;
  duration: number;
  avgPace: string;
  avgHeartRate?: number;
  difficulty: string;
  userFitnessLevel?: string;
}): Promise<string> {
  const prompt = `As an AI running coach, analyze this completed run:
- Distance: ${runData.distance} km
- Duration: ${runData.duration} minutes
- Average pace: ${runData.avgPace}
- Average heart rate: ${runData.avgHeartRate || "not recorded"} bpm
- Difficulty: ${runData.difficulty}
- Fitness level: ${runData.userFitnessLevel || "intermediate"}

Provide a brief, encouraging analysis (2-3 sentences) with one specific improvement tip.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "Great run! Keep up the consistent effort.";
  } catch (error) {
    console.error("Run analysis error:", error);
    return "Excellent effort on completing your run! Keep building on this momentum.";
  }
}

export type CoachTone = 'energetic' | 'motivational' | 'instructive' | 'factual' | 'abrupt';
export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'ash' | 'coral';

export interface TTSRequest {
  text: string;
  tone: CoachTone;
  voice?: TTSVoice;
  speed?: number;
}

const ttsCache = new Map<string, { audio: Buffer; timestamp: number }>();
const TTS_CACHE_TTL = 5 * 60 * 1000;

function getToneInstructions(tone: CoachTone): string {
  const instructions: Record<CoachTone, string> = {
    energetic: "Speak with high energy and enthusiasm! Be upbeat, use dynamic pacing with emphasis on encouraging words. Sound like an excited coach pumping up their athlete.",
    motivational: "Speak in a warm, inspiring tone. Be supportive and encouraging, with a steady confident pace. Sound like a trusted mentor building confidence.",
    instructive: "Speak clearly and precisely. Use measured pacing with emphasis on key technique points. Sound like a knowledgeable coach teaching form and strategy.",
    factual: "Speak in a straightforward, matter-of-fact tone. Be concise and data-focused. Sound like a professional analyst delivering performance metrics.",
    abrupt: "Speak very briefly and directly. Use short, punchy phrases with commanding delivery. Sound like a drill sergeant giving quick orders."
  };
  return instructions[tone];
}

function getDefaultVoiceForTone(tone: CoachTone): TTSVoice {
  const voiceMap: Record<CoachTone, TTSVoice> = {
    energetic: 'echo',
    motivational: 'onyx',
    instructive: 'fable',
    factual: 'alloy',
    abrupt: 'ash'
  };
  return voiceMap[tone];
}

export async function generateTTS(request: TTSRequest): Promise<Buffer> {
  const { text, tone, voice, speed = 1.0 } = request;
  
  const cacheKey = `${text}:${tone}:${voice || 'default'}:${speed}`;
  const cached = ttsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TTS_CACHE_TTL) {
    console.log("TTS cache hit for:", text.substring(0, 50));
    return cached.audio;
  }
  
  const selectedVoice = voice || getDefaultVoiceForTone(tone);
  const instructions = getToneInstructions(tone);
  
  console.log(`Generating TTS: voice=${selectedVoice}, tone=${tone}, text="${text.substring(0, 50)}..."`);
  
  try {
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: selectedVoice,
      input: text,
      instructions: instructions,
      speed: Math.max(0.25, Math.min(4.0, speed)),
      response_format: "mp3",
    });
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    
    ttsCache.set(cacheKey, { audio: audioBuffer, timestamp: Date.now() });
    
    const now = Date.now();
    ttsCache.forEach((value, key) => {
      if (now - value.timestamp > TTS_CACHE_TTL) {
        ttsCache.delete(key);
      }
    });
    
    return audioBuffer;
  } catch (error) {
    console.error("TTS generation error:", error);
    throw error;
  }
}

export { openai };

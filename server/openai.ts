import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function calculateAge(dateOfBirth: string | Date | null | undefined): number | undefined {
  if (!dateOfBirth) return undefined;
  
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  if (isNaN(dob.getTime())) return undefined;
  
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  return age >= 0 && age < 150 ? age : undefined;
}

export interface AiCoachConfig {
  description?: string | null;
  instructions?: Array<{ title: string; content: string }>;
  knowledge?: Array<{ title: string; content: string }>;
  faqs?: Array<{ question: string; answer: string }>;
}

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

export interface TerrainData {
  currentAltitude?: number;
  currentGrade?: number;
  upcomingTerrain?: {
    distanceAhead: number;
    grade: number;
    elevationChange: number;
    description: string;
  };
  totalElevationGain?: number;
  totalElevationLoss?: number;
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
  aiConfig?: AiCoachConfig;
  terrain?: TerrainData;
  // New parameters for smarter coaching
  recentCoachingTopics?: string[];
  paceChange?: 'faster' | 'slower' | 'steady';
  currentKm?: number;
  progressPercent?: number;
  milestones?: string[];
  kmSplitTimes?: number[];
  // Weather data for weather-aware coaching
  weather?: {
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    condition: string;
    uvIndex: number;
    precipitationProbability: number;
  };
}

export interface CoachingResponse {
  message: string;
  encouragement: string;
  paceAdvice: string;
  breathingTip?: string;
  topic?: string;
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

  let coachIdentity = request.coachName && request.coachName !== "AI Coach" 
    ? `You are ${request.coachName}, a personalized AI running coach.`
    : "You are an encouraging AI running coach.";

  let aiConfigSection = "";
  if (request.aiConfig) {
    if (request.aiConfig.description) {
      coachIdentity = request.aiConfig.description;
    }
    
    if (request.aiConfig.instructions && request.aiConfig.instructions.length > 0) {
      aiConfigSection += "\n\nCOACHING INSTRUCTIONS:\n";
      for (const inst of request.aiConfig.instructions) {
        aiConfigSection += `- ${inst.title}: ${inst.content}\n`;
      }
    }
    
    if (request.aiConfig.knowledge && request.aiConfig.knowledge.length > 0) {
      aiConfigSection += "\n\nKNOWLEDGE BASE:\n";
      for (const kb of request.aiConfig.knowledge) {
        aiConfigSection += `- ${kb.title}: ${kb.content}\n`;
      }
    }
    
    if (request.aiConfig.faqs && request.aiConfig.faqs.length > 0) {
      aiConfigSection += "\n\nCOMMON QUESTIONS:\n";
      for (const faq of request.aiConfig.faqs) {
        aiConfigSection += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
      }
    }
  }

  const toneInstructions: Record<string, string> = {
    energetic: "Be high-energy, enthusiastic, and upbeat. Use exclamation marks and energizing language!",
    motivational: "Be inspiring and supportive. Focus on encouragement and building confidence.",
    instructive: "Be clear and educational. Provide detailed guidance and technique tips.",
    factual: "Be straightforward and data-focused. Stick to stats and objective information.",
    abrupt: "Be very brief and direct. Use short, commanding phrases. No fluff."
  };
  
  const toneStyle = request.coachTone ? toneInstructions[request.coachTone] : toneInstructions.motivational;
  
  let terrainSection = "";
  if (request.terrain) {
    terrainSection = "\n\nTERRAIN DATA:";
    if (request.terrain.currentAltitude !== undefined) {
      terrainSection += `\n- Current altitude: ${request.terrain.currentAltitude}m`;
    }
    if (request.terrain.currentGrade !== undefined) {
      const gradeDesc = request.terrain.currentGrade > 5 ? "steep uphill" : 
                        request.terrain.currentGrade > 2 ? "gentle uphill" :
                        request.terrain.currentGrade < -5 ? "steep downhill" :
                        request.terrain.currentGrade < -2 ? "gentle downhill" : "flat";
      terrainSection += `\n- Current grade: ${request.terrain.currentGrade.toFixed(1)}% (${gradeDesc})`;
    }
    if (request.terrain.upcomingTerrain) {
      terrainSection += `\n- UPCOMING: ${request.terrain.upcomingTerrain.description} in ${request.terrain.upcomingTerrain.distanceAhead}m (${request.terrain.upcomingTerrain.grade.toFixed(1)}% grade, ${request.terrain.upcomingTerrain.elevationChange > 0 ? '+' : ''}${request.terrain.upcomingTerrain.elevationChange}m)`;
    }
    if (request.terrain.totalElevationGain !== undefined) {
      terrainSection += `\n- Route elevation gain: ${request.terrain.totalElevationGain}m`;
    }
    
    terrainSection += `\n\nHILL COACHING PRIORITIES:
- For upcoming hills: Warn 100-200m ahead, advise on pace conservation
- On steep uphills (>5%): Suggest shorter strides, lean forward slightly, maintain cadence
- On downhills: Control pace, light braking with legs, don't overstride
- After hills: Acknowledge effort, guide recovery pace`;
  }
  
  // New: Build real-time events section
  let eventsSection = "";
  if (request.milestones && request.milestones.length > 0) {
    eventsSection += `\n\nMILESTONE REACHED: ${request.milestones.join(', ')} - Celebrate this achievement!`;
  }
  if (request.currentKm && request.currentKm > 0) {
    eventsSection += `\n- Just completed km ${request.currentKm}`;
  }
  if (request.paceChange) {
    const paceMsg = request.paceChange === 'faster' ? "Runner is speeding up - acknowledge the effort!" :
                    request.paceChange === 'slower' ? "Pace has dropped - provide gentle encouragement" :
                    "Pace is steady - maintain the rhythm";
    eventsSection += `\n- Pace trend: ${paceMsg}`;
  }
  
  // Calculate recent km split info
  // kmSplitTimes contains cumulative elapsed times when each km was completed
  // To get per-km duration: duration[n] = kmSplitTimes[n] - kmSplitTimes[n-1]
  let splitInfo = "";
  if (request.kmSplitTimes && request.kmSplitTimes.length >= 2) {
    const splits = request.kmSplitTimes;
    const n = splits.length;
    // Calculate duration for last km: time at km N minus time at km N-1
    const lastKmDuration = splits[n - 1] - splits[n - 2];
    // Calculate duration for previous km (if we have at least 3 splits)
    const prevKmDuration = n >= 3 ? splits[n - 2] - splits[n - 3] : splits[n - 2]; // first km duration is just the first split time
    
    if (lastKmDuration < prevKmDuration - 5) {
      splitInfo = `\n- Last km was ${Math.round(prevKmDuration - lastKmDuration)}s faster than previous - great improvement!`;
    } else if (lastKmDuration > prevKmDuration + 5) {
      splitInfo = `\n- Last km was ${Math.round(lastKmDuration - prevKmDuration)}s slower - encourage maintaining pace`;
    }
  }
  
  // Anti-repetition guidance - only include dynamic topic list
  // General variety guidelines are configured in AI Control Centre Knowledge Base
  let antiRepetitionSection = "";
  if (request.recentCoachingTopics && request.recentCoachingTopics.length > 0) {
    antiRepetitionSection = `\n\nRECENT COACHING TOPICS (avoid repeating these):
${request.recentCoachingTopics.map(t => `- "${t}"`).join('\n')}
Choose a DIFFERENT focus area for this message.`;
  }
  
  // Weather section for weather-aware coaching
  let weatherSection = "";
  if (request.weather) {
    const w = request.weather;
    weatherSection = `\n\nWEATHER CONDITIONS:
- Temperature: ${w.temperature}°C (feels like ${w.feelsLike}°C)
- Conditions: ${w.condition}
- Humidity: ${w.humidity}%
- Wind: ${w.windSpeed} km/h
- UV Index: ${w.uvIndex}
- Rain probability: ${w.precipitationProbability}%

WEATHER COACHING TIPS:
${w.temperature > 25 ? "- Hot conditions: Remind runner to stay hydrated, reduce intensity if needed" : ""}
${w.temperature < 5 ? "- Cold conditions: Advise on keeping extremities warm, shorter warm-up" : ""}
${w.humidity > 80 ? "- High humidity: Suggest slower pace, body cooling is less efficient" : ""}
${w.windSpeed > 25 ? "- Windy conditions: Advise on tucking behind wind, adjusting form" : ""}
${w.uvIndex > 7 ? "- High UV: Remind about sun protection, find shade when possible" : ""}
${w.precipitationProbability > 50 ? "- Rain likely: Advise on grip, visibility, staying dry" : ""}`;
  }
  
  const prompt = `${coachIdentity} Providing real-time guidance.${aiConfigSection}

COACHING STYLE: ${toneStyle}${userProfileInfo}

Current Run Stats:
- Current pace: ${request.currentPace}
- Target pace: ${request.targetPace}
- Heart rate: ${request.heartRate || "unknown"} bpm
- Progress: ${request.distanceCovered.toFixed(2)}km of ${request.totalDistance}km (${progressPercent}%)
- Current km: ${request.currentKm || Math.floor(request.distanceCovered)}
- Elapsed time: ${Math.floor(request.elapsedTime / 60)} minutes ${Math.floor(request.elapsedTime % 60)} seconds
- Difficulty: ${request.difficulty}
- Fitness level: ${request.userFitnessLevel || "intermediate"}${targetTimeInfo}${preferencesSection}${terrainSection}${weatherSection}${eventsSection}${splitInfo}${userMessageSection}${antiRepetitionSection}

${request.milestones && request.milestones.length > 0 ? "PRIORITIZE milestone celebration!" : ""}
${request.terrain?.upcomingTerrain ? "PRIORITIZE terrain coaching - warn about upcoming hills." : ""} 
${request.paceChange === 'faster' ? "Acknowledge the speed increase!" : request.paceChange === 'slower' ? "Gently encourage picking up the pace." : ""}
${request.userMessage ? "Respond to the runner's message while providing coaching." : "Provide brief, motivating coaching advice."} 
${request.userName ? `Use ${request.userName}'s name occasionally for personalization.` : ""} 
Be specific but concise.

Respond in JSON format:
{
  "message": "Short main coaching message (max 15 words)",
  "encouragement": "Brief encouragement (max 10 words)",
  "paceAdvice": "Specific pace guidance (max 15 words)",
  "breathingTip": "Quick breathing tip if relevant (max 10 words)",
  "topic": "One-word topic of this advice (e.g., 'pace', 'breathing', 'milestone', 'form', 'motivation')"
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
  aiConfig?: AiCoachConfig;
}): Promise<string> {
  let coachIdentity = "As an AI running coach";
  let configSection = "";
  
  if (runData.aiConfig) {
    if (runData.aiConfig.description) {
      coachIdentity = runData.aiConfig.description;
    }
    if (runData.aiConfig.instructions && runData.aiConfig.instructions.length > 0) {
      configSection += "\n\nANALYSIS GUIDELINES:\n";
      for (const inst of runData.aiConfig.instructions) {
        configSection += `- ${inst.title}: ${inst.content}\n`;
      }
    }
    if (runData.aiConfig.knowledge && runData.aiConfig.knowledge.length > 0) {
      configSection += "\n\nKNOWLEDGE BASE:\n";
      for (const kb of runData.aiConfig.knowledge) {
        configSection += `- ${kb.title}: ${kb.content}\n`;
      }
    }
  }
  
  const prompt = `${coachIdentity}, analyze this completed run:
- Distance: ${runData.distance} km
- Duration: ${runData.duration} minutes
- Average pace: ${runData.avgPace}
- Average heart rate: ${runData.avgHeartRate || "not recorded"} bpm
- Difficulty: ${runData.difficulty}
- Fitness level: ${runData.userFitnessLevel || "intermediate"}
${configSection}
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

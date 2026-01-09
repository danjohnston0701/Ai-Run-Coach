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

// Elite coaching cues organized by professional technique categories
export const ELITE_COACHING_TIPS: Record<string, string[]> = {
  "posture_alignment": [
    "Keep your posture tall and proud; imagine a string gently lifting the top of your head.",
    "Run with your ears, shoulders, hips, and ankles roughly in one line.",
    "Stay tall through your hips; avoid collapsing or bending at the waist as you tire.",
    "Lean very slightly forward from the ankles, not from the hips, letting gravity help you move.",
    "Keep your chin level and your neck relaxed; avoid letting your head drop forward."
  ],
  "arms_upper_body": [
    "Relax your shoulders and let them drop away from your ears.",
    "Keep your arms close to your sides with a gentle bend at the elbows.",
    "Let your arms swing forward and back, not across your body.",
    "Keep your hands soft, as if gently holding something you don't want to crush.",
    "When tension builds, briefly shake out your hands and arms, then settle back into rhythm."
  ],
  "breathing_relaxation": [
    "Breathe from your belly, letting the abdomen expand rather than lifting the chest.",
    "Settle into a steady, rhythmic breathing pattern that feels sustainable.",
    "Use your exhale to release tension from your shoulders and face.",
    "Let your breath guide your effort — calm, controlled breathing supports smooth running.",
    "If you feel stressed, take a deeper, slower breath and gently reset your rhythm."
  ],
  "stride_foot_strike": [
    "Aim for smooth, light steps that land softly on the ground.",
    "Let your foot land roughly under your body instead of reaching out in front.",
    "Think 'quick and elastic,' lifting the foot up and through instead of pushing long and hard.",
    "Focus on gliding forward — avoid bounding or overstriding.",
    "Use the ground to push you forward, not upward; channel your force into forward motion."
  ],
  "core_hips_mindset": [
    "Lightly engage your core to keep your torso stable as your legs and arms move.",
    "Let the movement start from your hips, driving you calmly forward.",
    "When you tire, come back to basics: tall posture, relaxed shoulders, smooth steps.",
    "Stay present in this section of the run — one controlled stride at a time.",
    "Run with quiet confidence; efficient, relaxed form is your biggest advantage today."
  ]
};

// Select an appropriate coaching category based on run context
export function selectCoachingCategory(request: {
  paceChange?: 'faster' | 'slower' | 'steady';
  progressPercent?: number;
  recentCoachingTopics?: string[];
  terrain?: TerrainData;
}): string {
  const categories = Object.keys(ELITE_COACHING_TIPS);
  const recentTopics = request.recentCoachingTopics || [];
  
  // Context-based category selection
  let preferredCategory: string | null = null;
  
  // If pace is slowing or struggling, focus on breathing/relaxation
  if (request.paceChange === 'slower') {
    preferredCategory = 'breathing_relaxation';
  }
  // If on a hill (terrain grade), focus on posture or core
  else if (request.terrain?.currentGrade && Math.abs(request.terrain.currentGrade) > 3) {
    preferredCategory = request.terrain.currentGrade > 0 ? 'core_hips_mindset' : 'stride_foot_strike';
  }
  // Early in run (first 20%), focus on posture and form
  else if (request.progressPercent !== undefined && request.progressPercent < 20) {
    preferredCategory = 'posture_alignment';
  }
  // Mid-run, mix between arms and stride
  else if (request.progressPercent !== undefined && request.progressPercent < 70) {
    preferredCategory = Math.random() > 0.5 ? 'arms_upper_body' : 'stride_foot_strike';
  }
  // Late in run (70%+), focus on mindset and core
  else if (request.progressPercent !== undefined && request.progressPercent >= 70) {
    preferredCategory = 'core_hips_mindset';
  }
  
  // Avoid repeating recent topics
  if (preferredCategory && !recentTopics.includes(preferredCategory)) {
    return preferredCategory;
  }
  
  // Pick a category not recently used
  const availableCategories = categories.filter(c => !recentTopics.slice(-2).includes(c));
  if (availableCategories.length > 0) {
    return availableCategories[Math.floor(Math.random() * availableCategories.length)];
  }
  
  // Fallback to random
  return categories[Math.floor(Math.random() * categories.length)];
}

// Get a random tip from a specific category
export function getEliteCoachingTip(category: string): string {
  const tips = ELITE_COACHING_TIPS[category];
  if (!tips || tips.length === 0) {
    return "Focus on maintaining good form and steady breathing.";
  }
  return tips[Math.floor(Math.random() * tips.length)];
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
  previousGrade?: number;
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
    
    // Determine current hill state for prioritized coaching
    const currentlyOnSteepHill = Math.abs(request.terrain.currentGrade || 0) >= 5;
    const approachingSteepHill = request.terrain.upcomingTerrain && Math.abs(request.terrain.upcomingTerrain.grade) >= 5;
    const justReachedHillCrest = request.terrain.currentGrade !== undefined && 
                                  request.terrain.currentGrade < 2 && 
                                  request.terrain.previousGrade !== undefined && 
                                  request.terrain.previousGrade >= 5;
    
    if (justReachedHillCrest) {
      terrainSection += `\n\n**PRIORITY: HILL CREST REACHED!**
The runner just conquered a steep climb! Acknowledge their effort with genuine encouragement. Celebrate reaching the top before discussing what's ahead.`;
    } else if (currentlyOnSteepHill || approachingSteepHill) {
      terrainSection += `\n\n**PRIORITY: HILL COACHING REQUIRED**
${currentlyOnSteepHill ? `Runner is currently on a ${request.terrain.currentGrade! > 0 ? 'UPHILL' : 'DOWNHILL'} section. Focus your advice on technique for this terrain.` : ''}
${approachingSteepHill ? `WARN the runner about the upcoming ${request.terrain.upcomingTerrain!.description}!` : ''}`;
    }
    
    terrainSection += `\n\nHILL COACHING GUIDELINES:
- For upcoming hills: Warn 100-200m ahead, advise on pace conservation
- On steep uphills (>5%): Suggest shorter strides, lean forward slightly, maintain cadence over speed
- On downhills: Control pace, quick light steps, don't overstride
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
  
  // Select an elite coaching tip based on current run context
  const selectedCategory = selectCoachingCategory({
    paceChange: request.paceChange,
    progressPercent,
    recentCoachingTopics: request.recentCoachingTopics,
    terrain: request.terrain
  });
  const eliteTip = getEliteCoachingTip(selectedCategory);
  
  const eliteCoachingSection = `\n\nELITE TECHNIQUE CUE (use this in your coaching):
Category: ${selectedCategory.replace(/_/g, ' ')}
Cue: "${eliteTip}"
Incorporate this technique cue naturally into your coaching message when appropriate.`;
  
  const prompt = `${coachIdentity} Providing real-time guidance.${aiConfigSection}${eliteCoachingSection}

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
  "topic": "One-word topic of this advice (e.g., 'pace', 'breathing', 'milestone', 'form', 'motivation', 'terrain', 'uphill', 'downhill')"
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

// Map elite categories to existing topic taxonomy
const CATEGORY_TO_TOPIC: Record<string, string> = {
  "posture_alignment": "form",
  "arms_upper_body": "form",
  "breathing_relaxation": "breathing",
  "stride_foot_strike": "form",
  "core_hips_mindset": "motivation"
};

function getDefaultCoachingAdvice(request: CoachingRequest, progressPercent: number): CoachingResponse {
  // Select category-appropriate elite tip for fallback messages
  const category = selectCoachingCategory({ 
    progressPercent, 
    paceChange: request.paceChange,
    terrain: request.terrain 
  });
  const topic = CATEGORY_TO_TOPIC[category] || "form";
  
  // Keep messages concise (max 15 words) - these are fallback only
  if (progressPercent < 25) {
    return {
      message: "Great start! Focus on tall posture and relaxed shoulders.",
      encouragement: "You've got this!",
      paceAdvice: "Focus on a steady, sustainable pace for now.",
      breathingTip: "Settle into rhythmic breathing.",
      topic
    };
  } else if (progressPercent < 50) {
    return {
      message: "Keep that momentum! Arms relaxed, steps light and quick.",
      encouragement: "Almost halfway there!",
      paceAdvice: "Maintain your current effort level.",
      breathingTip: "Stay relaxed, keep shoulders down.",
      topic
    };
  } else if (progressPercent < 75) {
    return {
      message: "Strong work! Stay tall through your hips, smooth strides.",
      encouragement: "You're doing amazing!",
      paceAdvice: "Hold steady, you can pick it up soon.",
      breathingTip: "Deep, rhythmic breaths.",
      topic
    };
  } else {
    return {
      message: "Final stretch! Quiet confidence, one stride at a time.",
      encouragement: "Finish strong!",
      paceAdvice: "Push the pace if you can, the end is near!",
      breathingTip: "Power through, you're almost there!",
      topic
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

export interface RunSummaryRequest {
  routeName: string;
  targetDistance: number;
  targetTimeSeconds?: number;
  difficulty: string;
  elevationGain?: number;
  elevationLoss?: number;
  elevationProfile?: Array<{ lat: number; lng: number; elevation: number; distance: number; grade?: number }>;
  terrainType?: string;
  weather?: {
    temperature?: number;
    humidity?: number;
    windSpeed?: number;
    conditions?: string;
  };
  coachName?: string;
  userName?: string;
  aiConfig?: AiCoachConfig;
}

export async function generateRunSummary(request: RunSummaryRequest): Promise<string> {
  const {
    routeName, targetDistance, targetTimeSeconds, difficulty,
    elevationGain, elevationLoss, elevationProfile, terrainType,
    weather, coachName, userName, aiConfig
  } = request;

  let coachIdentity = coachName ? `You are ${coachName}, an AI running coach` : "You are an AI running coach";
  let configSection = "";
  
  if (aiConfig) {
    if (aiConfig.description) {
      coachIdentity = aiConfig.description;
    }
    if (aiConfig.knowledge && aiConfig.knowledge.length > 0) {
      configSection += "\n\nKNOWLEDGE BASE:\n";
      for (const kb of aiConfig.knowledge) {
        configSection += `- ${kb.title}: ${kb.content}\n`;
      }
    }
  }

  let terrainAnalysis = "";
  if (elevationProfile && elevationProfile.length > 0) {
    const grades = elevationProfile.filter(p => p.grade !== undefined).map(p => p.grade!);
    const steepUphills = grades.filter(g => g > 5).length;
    const steepDownhills = grades.filter(g => g < -5).length;
    const flatSections = grades.filter(g => Math.abs(g) <= 2).length;
    const totalPoints = grades.length;
    
    if (steepUphills > totalPoints * 0.2) {
      terrainAnalysis += "significant uphill sections, ";
    } else if (steepUphills > 0) {
      terrainAnalysis += "some uphill climbs, ";
    }
    if (steepDownhills > totalPoints * 0.2) {
      terrainAnalysis += "notable downhill stretches, ";
    } else if (steepDownhills > 0) {
      terrainAnalysis += "some descents, ";
    }
    if (flatSections > totalPoints * 0.5) {
      terrainAnalysis += "mostly flat terrain, ";
    }
  }

  let paceGuidance = "";
  if (targetTimeSeconds && targetDistance > 0) {
    const targetPaceSecondsPerKm = targetTimeSeconds / targetDistance;
    const paceMinutes = Math.floor(targetPaceSecondsPerKm / 60);
    const paceSeconds = Math.round(targetPaceSecondsPerKm % 60);
    paceGuidance = `Target pace: ${paceMinutes}:${paceSeconds.toString().padStart(2, '0')} per km to finish in ${Math.floor(targetTimeSeconds / 60)} minutes.`;
  }

  let weatherInfo = "";
  if (weather) {
    const parts = [];
    if (weather.temperature !== undefined) parts.push(`${Math.round(weather.temperature)}°C`);
    if (weather.conditions) parts.push(weather.conditions.toLowerCase());
    if (weather.windSpeed && weather.windSpeed > 15) parts.push(`windy at ${Math.round(weather.windSpeed)} km/h`);
    if (weather.humidity && weather.humidity > 75) parts.push(`humid at ${weather.humidity}%`);
    if (parts.length > 0) weatherInfo = `Current conditions: ${parts.join(", ")}.`;
  }

  // Build compact terrain hint
  let terrainHint = "";
  if (elevationGain && elevationGain > 20) {
    terrainHint = `${Math.round(elevationGain)}m climb ahead`;
  } else if (terrainAnalysis && terrainAnalysis.includes("uphill")) {
    terrainHint = "some hills ahead";
  } else if (terrainAnalysis && terrainAnalysis.includes("flat")) {
    terrainHint = "mostly flat";
  }

  // Build target pace hint
  let paceHint = "";
  if (targetTimeSeconds && targetDistance > 0) {
    const targetPaceSecondsPerKm = targetTimeSeconds / targetDistance;
    const paceMinutes = Math.floor(targetPaceSecondsPerKm / 60);
    const paceSecondsRounded = Math.round(targetPaceSecondsPerKm % 60);
    paceHint = `Aim for ${paceMinutes}:${paceSecondsRounded.toString().padStart(2, '0')} pace.`;
  }

  const prompt = `${coachIdentity}.
${configSection}

Generate a VERY SHORT pre-run announcement (MAXIMUM 15-20 words, under 8 seconds when spoken).

Route: ${targetDistance.toFixed(1)}km ${difficulty}
${terrainHint ? `Terrain: ${terrainHint}` : ""}
${paceHint}

Requirements:
1. STRICT LIMIT: 15-20 words maximum - this is critical
2. Format: "[Distance]k [terrain note]. [Pace if applicable]. Let's go!"
3. No greetings, no names, no fluff - get straight to the point
4. Example: "Five K with some hills. Aim for five-thirty pace. Let's go!"
5. This plays BEFORE any navigation instructions`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 50,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || `${targetDistance.toFixed(1)}K ahead. Let's go!`;
  } catch (error) {
    console.error("Run summary generation error:", error);
    return `${targetDistance.toFixed(1)}K ${difficulty} run. Let's go!`;
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

// Cadence analysis interfaces and function
export interface CadenceAnalysisRequest {
  heightCm: number;
  paceMinPerKm: number;
  cadenceSpm: number;
  distanceKm?: number;
  userFitnessLevel?: string;
  userAge?: number;
}

export interface CadenceAnalysisResponse {
  idealCadenceMin: number;
  idealCadenceMax: number;
  strideAssessment: 'optimal' | 'overstriding' | 'understriding' | 'unknown';
  estimatedStrideLengthCm: number;
  idealStrideLengthCm: number;
  coachingAdvice: string;
  shortAdvice: string; // For real-time TTS
  confidence: 'high' | 'medium' | 'low';
}

export async function analyzeCadence(request: CadenceAnalysisRequest): Promise<CadenceAnalysisResponse> {
  const systemPrompt = `You are an expert running biomechanics coach. Analyze the runner's cadence and provide personalized feedback.

BIOMECHANICS KNOWLEDGE:
- Optimal cadence varies by runner height, pace, and fitness level
- Taller runners typically have lower optimal cadence (160-175 spm)
- Shorter runners typically have higher optimal cadence (175-190 spm)
- Faster paces require higher cadence
- Stride length (cm) = (speed in m/min) / cadence * 100
- Overstriding: landing with foot too far ahead, causes braking force
- Understriding: too many small steps, inefficient energy use

CALCULATION FORMULAS:
- Speed (m/min) = 1000 / paceMinPerKm
- Current stride length (cm) = (speed m/min / cadenceSpm) * 100
- Height-based ideal stride: approximately 40-45% of height at easy pace, up to 50% at fast pace
- Ideal cadence = speed (m/min) / (ideal stride length in meters)

RESPONSE REQUIREMENTS:
Return ONLY valid JSON with this exact structure:
{
  "idealCadenceMin": number,
  "idealCadenceMax": number,
  "strideAssessment": "optimal" | "overstriding" | "understriding" | "unknown",
  "estimatedStrideLengthCm": number,
  "idealStrideLengthCm": number,
  "coachingAdvice": "string with 2-3 sentences of detailed advice",
  "shortAdvice": "string with max 15 words for voice coaching",
  "confidence": "high" | "medium" | "low"
}`;

  const userPrompt = `Analyze this runner's cadence:
- Height: ${request.heightCm} cm
- Current pace: ${request.paceMinPerKm} min/km
- Current cadence: ${request.cadenceSpm} steps per minute
- Distance run: ${request.distanceKm || 'unknown'} km
- Fitness level: ${request.userFitnessLevel || 'intermediate'}
- Age: ${request.userAge || 'unknown'}

Calculate their ideal cadence range, assess if they're overstriding or understriding, and provide personalized coaching advice.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const analysis = JSON.parse(content) as CadenceAnalysisResponse;
    return analysis;
  } catch (error) {
    console.error("Cadence analysis error:", error);
    // Return a sensible fallback
    const speedMperMin = 1000 / request.paceMinPerKm;
    const currentStrideLength = (speedMperMin / request.cadenceSpm) * 100;
    const idealStrideLength = request.heightCm * 0.42; // 42% of height as baseline
    
    return {
      idealCadenceMin: 165,
      idealCadenceMax: 180,
      strideAssessment: 'unknown',
      estimatedStrideLengthCm: Math.round(currentStrideLength),
      idealStrideLengthCm: Math.round(idealStrideLength),
      coachingAdvice: "Focus on a comfortable rhythm. Aim for quick, light steps.",
      shortAdvice: "Maintain a steady, comfortable rhythm.",
      confidence: 'low'
    };
  }
}

// Run Analysis Types
export interface RunAnalysisRequest {
  run: {
    id: string;
    distance: number;
    duration: number;
    avgPace: string;
    avgHeartRate?: number;
    maxHeartRate?: number;
    calories?: number;
    cadence?: number;
    difficulty?: string;
    kmSplits?: number[];
    elevationGain?: number;
    elevationLoss?: number;
    weatherData?: {
      temperature?: number;
      humidity?: number;
      windSpeed?: number;
      condition?: string;
    };
  };
  user: {
    age?: number;
    gender?: string;
    height?: string;
    weight?: string;
    fitnessLevel?: string;
    desiredFitnessLevel?: string;
  };
  previousRuns?: Array<{
    distance: number;
    duration: number;
    avgPace: string;
    completedAt?: string;
  }>;
}

export interface RunAnalysisResponse {
  highlights: string[];
  struggles: string[];
  personalBests: string[];
  demographicComparison: string;
  coachingTips: string[];
  overallAssessment: string;
}

export async function generateComprehensiveRunAnalysis(request: RunAnalysisRequest): Promise<RunAnalysisResponse> {
  const { run, user, previousRuns = [] } = request;
  
  // Format km splits for analysis
  const splitsInfo = run.kmSplits && run.kmSplits.length > 0
    ? `Km splits (seconds): ${run.kmSplits.join(', ')}`
    : 'No km split data available';
  
  // Format previous runs for comparison
  const previousRunsInfo = previousRuns.length > 0
    ? `Previous runs on this route:\n${previousRuns.slice(0, 5).map((pr, i) => 
        `  ${i + 1}. ${pr.distance.toFixed(2)}km in ${Math.floor(pr.duration / 60)}:${(pr.duration % 60).toString().padStart(2, '0')} (pace: ${pr.avgPace})`
      ).join('\n')}`
    : 'No previous runs on this route';
  
  const systemPrompt = `You are an elite running coach with decades of experience coaching athletes from beginners to Olympians. 
Your role is to provide a comprehensive, personalized analysis of a completed run.

ANALYSIS APPROACH:
1. Be encouraging but honest - highlight genuine achievements while identifying areas for improvement
2. Use the runner's profile (age, fitness level, goals) to personalize all advice
3. Compare to appropriate demographic benchmarks (age group, gender, fitness level)
4. If previous runs exist, identify trends and personal bests
5. Provide actionable, specific coaching tips

RESPONSE FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "highlights": ["2-4 specific things the runner did well, with data to back it up"],
  "struggles": ["1-3 areas where the runner struggled, be constructive not critical"],
  "personalBests": ["Any PBs or notable achievements from this run or compared to history"],
  "demographicComparison": "1-2 sentences comparing to others in their age/fitness group",
  "coachingTips": ["3-5 specific, actionable tips for improvement"],
  "overallAssessment": "2-3 sentence summary of the run and next steps"
}`;

  const userPrompt = `Analyze this run and provide elite coaching feedback:

RUNNER PROFILE:
- Age: ${user.age || 'Unknown'}
- Gender: ${user.gender || 'Unknown'}
- Height: ${user.height || 'Unknown'}
- Weight: ${user.weight || 'Unknown'}
- Current fitness level: ${user.fitnessLevel || 'Unknown'}
- Goal fitness level: ${user.desiredFitnessLevel || 'Unknown'}

RUN DATA:
- Distance: ${run.distance.toFixed(2)} km
- Duration: ${Math.floor(run.duration / 60)}:${(run.duration % 60).toString().padStart(2, '0')}
- Average pace: ${run.avgPace}
- Difficulty: ${run.difficulty || 'Unknown'}
${run.avgHeartRate ? `- Average heart rate: ${run.avgHeartRate} bpm` : ''}
${run.maxHeartRate ? `- Max heart rate: ${run.maxHeartRate} bpm` : ''}
${run.cadence ? `- Average cadence: ${run.cadence} spm` : ''}
${run.calories ? `- Calories: ${run.calories}` : ''}
${run.elevationGain ? `- Elevation gain: ${run.elevationGain}m` : ''}
${run.elevationLoss ? `- Elevation loss: ${run.elevationLoss}m` : ''}
${splitsInfo}

${run.weatherData ? `WEATHER CONDITIONS:
- Temperature: ${run.weatherData.temperature}°C
- Humidity: ${run.weatherData.humidity}%
- Wind: ${run.weatherData.windSpeed} km/h
- Conditions: ${run.weatherData.condition}` : ''}

${previousRunsInfo}

Provide your elite coaching analysis.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const analysis = JSON.parse(content) as RunAnalysisResponse;
    return analysis;
  } catch (error) {
    console.error("Run analysis error:", error);
    // Return a sensible fallback
    return {
      highlights: [`Completed a ${run.distance.toFixed(2)}km run - great effort!`],
      struggles: ["Unable to generate detailed analysis at this time."],
      personalBests: [],
      demographicComparison: "Keep running consistently to build your performance history.",
      coachingTips: [
        "Focus on maintaining a consistent pace throughout your runs.",
        "Pay attention to your breathing and keep it rhythmic.",
        "Stay hydrated before, during, and after your runs."
      ],
      overallAssessment: "Good effort completing this run. Keep building consistency and the improvements will follow."
    };
  }
}

export { openai };

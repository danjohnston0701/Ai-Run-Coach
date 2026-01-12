import OpenAI from "openai";

// Initialize OpenAI with user's API key
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

// Elite coaching cues organized by professional technique categories (30 total)
export const ELITE_COACHING_TIPS: Record<string, string[]> = {
  "posture_alignment": [
    "Keep your posture tall and proud; imagine a string gently lifting the top of your head.",
    "Run with your ears, shoulders, hips, and ankles roughly in one line.",
    "Stay tall through your hips; avoid collapsing or bending at the waist as you tire.",
    "Lean very slightly forward from the ankles, not from the hips, letting gravity help you move.",
    "Keep your chin level and your neck relaxed; avoid letting your head drop forward.",
    "Think 'run tall' — elongate your spine and lift your chest slightly for better breathing."
  ],
  "arms_upper_body": [
    "Relax your shoulders and let them drop away from your ears.",
    "Keep your arms close to your sides with a gentle bend at the elbows.",
    "Let your arms swing forward and back, not across your body.",
    "Keep your hands soft, as if gently holding something you don't want to crush.",
    "When tension builds, briefly shake out your hands and arms, then settle back into rhythm.",
    "Your arms drive your legs — pump them actively to help maintain pace on tough sections."
  ],
  "breathing_relaxation": [
    "Breathe from your belly, letting the abdomen expand rather than lifting the chest.",
    "Settle into a steady, rhythmic breathing pattern that feels sustainable.",
    "Use your exhale to release tension from your shoulders and face.",
    "Let your breath guide your effort — calm, controlled breathing supports smooth running.",
    "If you feel stressed, take a deeper, slower breath and gently reset your rhythm.",
    "Match your breathing to your stride — try a 3:2 or 2:2 inhale-exhale pattern for rhythm."
  ],
  "stride_foot_strike": [
    "Aim for smooth, light steps that land softly on the ground.",
    "Let your foot land roughly under your body instead of reaching out in front.",
    "Think 'quick and elastic,' lifting the foot up and through instead of pushing long and hard.",
    "Focus on gliding forward — avoid bounding or overstriding.",
    "Use the ground to push you forward, not upward; channel your force into forward motion.",
    "Aim for around 180 steps per minute — quicker turnover reduces impact and improves efficiency."
  ],
  "core_hips_mindset": [
    "Lightly engage your core to keep your torso stable as your legs and arms move.",
    "Let the movement start from your hips, driving you calmly forward.",
    "When you tire, come back to basics: tall posture, relaxed shoulders, smooth steps.",
    "Stay present in this section of the run — one controlled stride at a time.",
    "Run with quiet confidence; efficient, relaxed form is your biggest advantage today.",
    "Visualize strong, controlled strides — your mind guides your body through the tough moments."
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
  // User's active goals for goal-aware coaching
  goals?: Array<{
    type: string;
    title: string;
    description?: string | null;
    targetDate?: string | null;
    distanceTarget?: string | null;
    timeTargetSeconds?: number | null;
    eventName?: string | null;
    weeklyRunTarget?: number | null;
    progressPercent?: number | null;
  }>;
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
  
  // Goals section for goal-aware coaching
  let goalsSection = "";
  if (request.goals && request.goals.length > 0) {
    goalsSection = "\n\nRUNNER'S ACTIVE GOALS:";
    for (const goal of request.goals) {
      goalsSection += `\n- ${goal.title} (${goal.type.replace(/_/g, ' ')})`;
      if (goal.description) {
        goalsSection += `: ${goal.description}`;
      }
      if (goal.targetDate) {
        const daysLeft = Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0) {
          goalsSection += ` - ${daysLeft} days until target date`;
        } else if (daysLeft === 0) {
          goalsSection += ` - TARGET DATE IS TODAY!`;
        }
      }
      if (goal.eventName) {
        goalsSection += ` (Event: ${goal.eventName})`;
      }
      if (goal.distanceTarget) {
        goalsSection += ` - Target: ${goal.distanceTarget}`;
      }
      if (goal.timeTargetSeconds) {
        const mins = Math.floor(goal.timeTargetSeconds / 60);
        const secs = goal.timeTargetSeconds % 60;
        goalsSection += ` - Target time: ${mins}:${String(secs).padStart(2, '0')}`;
      }
      if (goal.progressPercent !== null && goal.progressPercent !== undefined && goal.progressPercent > 0) {
        goalsSection += ` (${goal.progressPercent}% progress)`;
      }
    }
    goalsSection += `\n\nGOAL-AWARE COACHING GUIDELINES:
- Reference the runner's goals occasionally to keep them motivated
- If training for an event, remind them how this run contributes to their preparation
- For time/distance goals, relate current performance to their target
- For consistency goals, acknowledge their commitment to regular running
- Don't mention goals in every message - use naturally when relevant`;
  }
  
  // Select an elite coaching tip based on current run context
  const selectedCategory = selectCoachingCategory({
    paceChange: request.paceChange,
    progressPercent,
    recentCoachingTopics: request.recentCoachingTopics,
    terrain: request.terrain
  });
  const eliteTip = getEliteCoachingTip(selectedCategory);
  
  const eliteCoachingSection = `\n\n**ELITE TECHNIQUE CUE - PRIORITY** (MUST incorporate into your main message):
Category: ${selectedCategory.replace(/_/g, ' ')}
Cue: "${eliteTip}"

IMPORTANT: Your main coaching message MUST include guidance from this elite technique cue. This is professional running form advice that should be woven into your response. Rephrase it naturally but ensure the core technique point is communicated.`;
  
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
- Fitness level: ${request.userFitnessLevel || "intermediate"}${targetTimeInfo}${preferencesSection}${terrainSection}${weatherSection}${goalsSection}${eventsSection}${splitInfo}${userMessageSection}${antiRepetitionSection}

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

  // Build compact terrain hint - always include when we have elevation data
  let terrainHint = "";
  if (elevationGain && elevationGain > 10) {
    terrainHint = `${Math.round(elevationGain)}m total climb`;
    if (elevationLoss && elevationLoss > elevationGain * 0.8) {
      terrainHint += `, ${Math.round(elevationLoss)}m descent`;
    }
  } else if (terrainAnalysis && terrainAnalysis.includes("uphill")) {
    terrainHint = "some hills ahead";
  } else if (terrainAnalysis && terrainAnalysis.includes("flat")) {
    terrainHint = "mostly flat terrain";
  }

  // Build target pace hint
  let paceHint = "";
  if (targetTimeSeconds && targetDistance > 0) {
    const targetPaceSecondsPerKm = targetTimeSeconds / targetDistance;
    const paceMinutes = Math.floor(targetPaceSecondsPerKm / 60);
    const paceSecondsRounded = Math.round(targetPaceSecondsPerKm % 60);
    paceHint = `Target pace: ${paceMinutes}:${paceSecondsRounded.toString().padStart(2, '0')} per km.`;
  }

  const prompt = `${coachIdentity}.
${configSection}

Generate a brief pre-run announcement (25-35 words, under 12 seconds when spoken).

Route: ${targetDistance.toFixed(1)}km ${difficulty}
${terrainHint ? `Terrain: ${terrainHint}` : "No elevation data"}
${paceHint ? `Pace: ${paceHint}` : ""}
${weatherInfo || ""}

Requirements:
1. LIMIT: 25-35 words maximum
2. MUST include terrain/elevation info if provided (e.g., "with 48 meters of climbing" or "mostly flat")
3. ${paceHint ? "Include pace guidance since target pace is set" : "Do NOT mention pace - no target pace was set by the user"}
4. Format: "[Distance] [difficulty]. [Terrain insight].${paceHint ? " [Pace]." : ""} Let's go!"
5. Example: ${paceHint ? '"Four point three K easy run with 52 meters of climbing. Aim for seven-oh-three pace. Let\'s go!"' : '"Five K moderate with some hills ahead. Let\'s go!"'}
6. No greetings, no names - get straight to the point`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
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

// Telemetry Summary Types for AI Analysis
export interface TelemetryDataPoint {
  distance: number;  // km from start
  pace?: number;     // seconds per km at this point
  heartRate?: number;
  elevation?: number;
  cadence?: number;  // steps per minute
  timestamp?: number; // seconds from start
}

export interface TrendMetrics {
  paceTrend: 'speeding_up' | 'slowing_down' | 'steady' | 'variable';
  paceChangePercent: number;  // positive = slowed down, negative = sped up
  hrDrift?: number;           // HR increase over run (bpm)
  hrRecoveryPoints?: number;  // times HR dropped significantly
  elevationCorrelation?: 'strong' | 'moderate' | 'weak' | 'none';  // how much elevation affects pace
}

export interface KeyEvent {
  type: 'hill_climb' | 'hill_descent' | 'pace_spike' | 'pace_drop' | 'hr_spike' | 'strong_finish' | 'fade';
  distanceKm: number;
  description: string;
}

export interface TelemetrySummary {
  dataPoints: TelemetryDataPoint[];  // Downsampled to ~30-50 points
  trends: TrendMetrics;
  keyEvents: KeyEvent[];
  paceStats: {
    min: number;
    max: number;
    avg: number;
    stdDev: number;
  };
  hrStats?: {
    min: number;
    max: number;
    avg: number;
    zones?: { zone: string; percent: number }[];
  };
  elevationProfile?: {
    totalGain: number;
    totalLoss: number;
    maxGrade: number;
    hillCount: number;
  };
  cadenceStats?: {
    min: number;
    max: number;
    avg: number;
  };
}

// Build telemetry summary from raw run data
export function buildTelemetrySummary(
  gpsTrack: Array<{ lat: number; lng: number; timestamp?: number; pace?: number; heartRate?: number; elevation?: number; altitude?: number; altitudeAccuracy?: number; cadence?: number }>,
  kmSplits?: Array<{ km: number; pace: string; paceSeconds: number; cumulativeTime: number }>,
  elevationProfile?: Array<{ distance: number; elevation: number; grade?: number }>,
  targetSampleCount: number = 40
): TelemetrySummary | null {
  if (!gpsTrack || gpsTrack.length < 5) {
    return null;
  }
  
  // Build elevation from GPS altitude if no route elevation profile exists
  // Apply smoothing to reduce GPS altitude jitter
  let gpsElevationProfile: Array<{ distance: number; elevation: number; grade?: number }> | undefined;
  const altitudePoints = gpsTrack.filter(p => p.altitude !== undefined && (p.altitudeAccuracy === undefined || p.altitudeAccuracy < 30));
  
  if (!elevationProfile && altitudePoints.length >= 10) {
    // Calculate cumulative distances for altitude points
    let cumulativeDist = 0;
    const rawElevations: Array<{ distance: number; elevation: number }> = [];
    
    for (let i = 0; i < gpsTrack.length; i++) {
      if (i > 0) {
        const prev = gpsTrack[i - 1];
        const curr = gpsTrack[i];
        cumulativeDist += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      }
      
      if (gpsTrack[i].altitude !== undefined && (gpsTrack[i].altitudeAccuracy === undefined || gpsTrack[i].altitudeAccuracy! < 30)) {
        rawElevations.push({ distance: cumulativeDist, elevation: gpsTrack[i].altitude! });
      }
    }
    
    // Apply exponential smoothing to reduce jitter
    if (rawElevations.length >= 5) {
      const smoothed: typeof rawElevations = [];
      const alpha = 0.3; // Smoothing factor (lower = more smoothing)
      let smoothedElev = rawElevations[0].elevation;
      
      for (const point of rawElevations) {
        smoothedElev = alpha * point.elevation + (1 - alpha) * smoothedElev;
        smoothed.push({ distance: point.distance, elevation: Math.round(smoothedElev) });
      }
      
      // Calculate grades
      gpsElevationProfile = smoothed.map((point, i) => {
        let grade = 0;
        if (i > 0) {
          const distDiff = (point.distance - smoothed[i - 1].distance) * 1000; // meters
          const elevDiff = point.elevation - smoothed[i - 1].elevation;
          if (distDiff > 5) { // Avoid division by tiny distances
            grade = Math.round((elevDiff / distDiff) * 100 * 10) / 10; // Percent grade
          }
        }
        return { ...point, grade };
      });
    }
  }
  
  // Use GPS-derived elevation if route elevation profile is not available
  const effectiveElevationProfile = elevationProfile || gpsElevationProfile;

  // Calculate distances and derive pace from GPS timestamps
  const pointsWithDistance: Array<{
    lat: number;
    lng: number;
    distance: number;
    timestamp?: number;
    derivedPace?: number;  // Seconds per km derived from GPS
    heartRate?: number;
    elevation?: number;
    cadence?: number;
  }> = [];
  
  // Pre-normalize all timestamps upfront to avoid baseline drift
  const firstTs = gpsTrack.find(p => p.timestamp !== undefined)?.timestamp;
  const normalizedTimestamps: (number | undefined)[] = gpsTrack.map(p => {
    if (p.timestamp === undefined || firstTs === undefined) return undefined;
    // Detect milliseconds (timestamps > 1e12 are likely ms since epoch)
    const rawTs = p.timestamp > 1e12 ? p.timestamp / 1000 : p.timestamp;
    const rawFirst = firstTs > 1e12 ? firstTs / 1000 : firstTs;
    return rawTs - rawFirst;
  });
  
  let totalDistance = 0;
  for (let i = 0; i < gpsTrack.length; i++) {
    const curr = gpsTrack[i];
    let derivedPace: number | undefined;
    
    if (i > 0) {
      const prev = gpsTrack[i - 1];
      const segmentDist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      totalDistance += segmentDist;
      
      // Calculate pace from GPS timestamps if available
      const prevTs = normalizedTimestamps[i - 1];
      const currTs = normalizedTimestamps[i];
      if (prevTs !== undefined && currTs !== undefined) {
        const timeDiff = currTs - prevTs;
        
        // Only calculate pace for reasonable segments (avoid GPS jitter)
        // Segment should be > 2m (0.002 km) for 1Hz GPS samples (~3-5m between points)
        // and have reasonable velocity (0.5 - 8 m/s for running = 2:05 - 33:20/km pace)
        if (segmentDist > 0.002 && timeDiff > 0) {  // > 2m
          const velocity = (segmentDist * 1000) / timeDiff;  // m/s
          if (velocity >= 0.5 && velocity <= 8) {  // Valid running pace range
            derivedPace = timeDiff / segmentDist;  // seconds per km
          }
        }
      }
    }
    
    pointsWithDistance.push({
      lat: curr.lat,
      lng: curr.lng,
      distance: totalDistance,
      timestamp: normalizedTimestamps[i],
      derivedPace,
      heartRate: curr.heartRate,
      elevation: curr.elevation,
      cadence: curr.cadence
    });
  }

  // Downsample to target count with smoothed pace (rolling median of 3)
  const step = Math.max(1, Math.floor(pointsWithDistance.length / targetSampleCount));
  const sampledPoints: TelemetryDataPoint[] = [];
  
  for (let i = 0; i < pointsWithDistance.length; i += step) {
    const point = pointsWithDistance[i];
    
    // Apply rolling median for pace smoothing (look at adjacent points)
    let smoothedPace: number | undefined;
    const paceWindow: number[] = [];
    for (let j = Math.max(0, i - 1); j <= Math.min(pointsWithDistance.length - 1, i + 1); j++) {
      const pace = pointsWithDistance[j].derivedPace;
      if (pace !== undefined) {
        paceWindow.push(pace);
      }
    }
    if (paceWindow.length > 0) {
      paceWindow.sort((a, b) => a - b);
      smoothedPace = paceWindow[Math.floor(paceWindow.length / 2)];  // Median
    }
    
    sampledPoints.push({
      distance: Math.round(point.distance * 100) / 100,
      pace: smoothedPace,
      heartRate: point.heartRate,
      elevation: point.elevation,
      cadence: point.cadence,
      timestamp: point.timestamp !== undefined ? Math.round(point.timestamp) : undefined
    });
  }
  
  // Ensure we include the last point
  if (sampledPoints.length > 0 && pointsWithDistance.length > 0) {
    const lastPoint = pointsWithDistance[pointsWithDistance.length - 1];
    const lastSampled = sampledPoints[sampledPoints.length - 1];
    if (Math.abs(lastSampled.distance - lastPoint.distance) > 0.01) {
      sampledPoints.push({
        distance: Math.round(lastPoint.distance * 100) / 100,
        pace: lastPoint.derivedPace,
        heartRate: lastPoint.heartRate,
        elevation: lastPoint.elevation,
        cadence: lastPoint.cadence,
        timestamp: lastPoint.timestamp !== undefined ? Math.round(lastPoint.timestamp) : undefined
      });
    }
  }
  
  // Fallback: if GPS-derived pace is sparse, interpolate from km splits
  const paceCount = sampledPoints.filter(p => p.pace !== undefined).length;
  if (paceCount < sampledPoints.length * 0.3 && kmSplits && kmSplits.length > 0) {
    // Map km split paces to sampled points based on distance
    sampledPoints.forEach(point => {
      if (point.pace === undefined) {
        const km = Math.floor(point.distance);
        const split = kmSplits.find(s => s.km === km + 1) || kmSplits[kmSplits.length - 1];
        if (split) {
          point.pace = split.paceSeconds;
        }
      }
    });
  }

  // Calculate pace stats - prefer km splits but fall back to GPS-derived pace
  let paceStats = { min: 0, max: 0, avg: 0, stdDev: 0 };
  if (kmSplits && kmSplits.length > 0) {
    const paceTimes = kmSplits.map(s => s.paceSeconds);
    paceStats.min = Math.min(...paceTimes);
    paceStats.max = Math.max(...paceTimes);
    paceStats.avg = paceTimes.reduce((a, b) => a + b, 0) / paceTimes.length;
    const variance = paceTimes.reduce((sum, p) => sum + Math.pow(p - paceStats.avg, 2), 0) / paceTimes.length;
    paceStats.stdDev = Math.sqrt(variance);
  } else {
    // Fallback: calculate stats from GPS-derived pace in sampled points
    const gpsePaceTimes = sampledPoints.filter(p => p.pace !== undefined && p.pace > 0).map(p => p.pace!);
    if (gpsePaceTimes.length > 0) {
      paceStats.min = Math.min(...gpsePaceTimes);
      paceStats.max = Math.max(...gpsePaceTimes);
      paceStats.avg = gpsePaceTimes.reduce((a, b) => a + b, 0) / gpsePaceTimes.length;
      const variance = gpsePaceTimes.reduce((sum, p) => sum + Math.pow(p - paceStats.avg, 2), 0) / gpsePaceTimes.length;
      paceStats.stdDev = Math.sqrt(variance);
    }
  }

  // Analyze pace trend
  let trends: TrendMetrics = {
    paceTrend: 'steady',
    paceChangePercent: 0
  };
  
  if (kmSplits && kmSplits.length >= 2) {
    const firstHalf = kmSplits.slice(0, Math.floor(kmSplits.length / 2));
    const secondHalf = kmSplits.slice(Math.floor(kmSplits.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((a, b) => a + b.paceSeconds, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((a, b) => a + b.paceSeconds, 0) / secondHalf.length;
    
    const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
    trends.paceChangePercent = Math.round(changePercent * 10) / 10;
    
    if (changePercent > 5) {
      trends.paceTrend = 'slowing_down';
    } else if (changePercent < -5) {
      trends.paceTrend = 'speeding_up';
    } else if (paceStats.stdDev / paceStats.avg > 0.15) {
      trends.paceTrend = 'variable';
    } else {
      trends.paceTrend = 'steady';
    }
  }

  // Identify key events from km splits
  const keyEvents: KeyEvent[] = [];
  
  if (kmSplits && kmSplits.length >= 3) {
    // Find significant pace changes
    for (let i = 1; i < kmSplits.length; i++) {
      const prev = kmSplits[i - 1].paceSeconds;
      const curr = kmSplits[i].paceSeconds;
      const changePercent = ((curr - prev) / prev) * 100;
      
      if (changePercent > 15) {
        keyEvents.push({
          type: 'pace_drop',
          distanceKm: kmSplits[i].km,
          description: `Pace slowed ${Math.round(changePercent)}% at km ${kmSplits[i].km}`
        });
      } else if (changePercent < -15) {
        keyEvents.push({
          type: 'pace_spike',
          distanceKm: kmSplits[i].km,
          description: `Pace increased ${Math.round(Math.abs(changePercent))}% at km ${kmSplits[i].km}`
        });
      }
    }
    
    // Check for strong finish or fade
    if (kmSplits.length >= 3) {
      const lastKm = kmSplits[kmSplits.length - 1].paceSeconds;
      const avgExcludingLast = kmSplits.slice(0, -1).reduce((a, b) => a + b.paceSeconds, 0) / (kmSplits.length - 1);
      const lastKmChange = ((lastKm - avgExcludingLast) / avgExcludingLast) * 100;
      
      if (lastKmChange < -10) {
        keyEvents.push({
          type: 'strong_finish',
          distanceKm: kmSplits[kmSplits.length - 1].km,
          description: `Strong finish - final km was ${Math.round(Math.abs(lastKmChange))}% faster than average`
        });
      } else if (lastKmChange > 15) {
        keyEvents.push({
          type: 'fade',
          distanceKm: kmSplits[kmSplits.length - 1].km,
          description: `Faded at the end - final km was ${Math.round(lastKmChange)}% slower than average`
        });
      }
    }
  }

  // Analyze elevation profile (use GPS-derived if no route profile)
  let elevationStats: TelemetrySummary['elevationProfile'] | undefined;
  if (effectiveElevationProfile && effectiveElevationProfile.length > 0) {
    let totalGain = 0;
    let totalLoss = 0;
    let maxGrade = 0;
    let hillCount = 0;
    let inHill = false;
    
    for (let i = 1; i < effectiveElevationProfile.length; i++) {
      const elevChange = effectiveElevationProfile[i].elevation - effectiveElevationProfile[i - 1].elevation;
      if (elevChange > 0) totalGain += elevChange;
      if (elevChange < 0) totalLoss += Math.abs(elevChange);
      
      const grade = effectiveElevationProfile[i].grade || 0;
      if (Math.abs(grade) > Math.abs(maxGrade)) maxGrade = grade;
      
      // Count hills (grade > 4%)
      if (Math.abs(grade) > 4 && !inHill) {
        hillCount++;
        inHill = true;
      } else if (Math.abs(grade) <= 2) {
        inHill = false;
      }
    }
    
    elevationStats = {
      totalGain: Math.round(totalGain),
      totalLoss: Math.round(totalLoss),
      maxGrade: Math.round(maxGrade * 10) / 10,
      hillCount
    };
    
    // Add hill events
    if (hillCount > 0) {
      keyEvents.push({
        type: 'hill_climb',
        distanceKm: 0,
        description: `Route included ${hillCount} significant hill${hillCount > 1 ? 's' : ''} (max grade: ${Math.abs(maxGrade).toFixed(1)}%)`
      });
    }
    
    // Populate elevation in sampled points from effective elevation profile
    sampledPoints.forEach(point => {
      if (point.elevation === undefined) {
        // Find nearest elevation point by distance
        let nearestElev: number | undefined;
        let minDistDiff = Infinity;
        for (const ep of effectiveElevationProfile) {
          const distDiff = Math.abs(ep.distance - point.distance);
          if (distDiff < minDistDiff) {
            minDistDiff = distDiff;
            nearestElev = ep.elevation;
          }
        }
        if (nearestElev !== undefined) {
          point.elevation = nearestElev;
        }
      }
    });
  }

  // Calculate cadence stats
  let cadenceStats: TelemetrySummary['cadenceStats'] | undefined;
  const cadenceValues = sampledPoints.filter(p => p.cadence !== undefined && p.cadence > 0).map(p => p.cadence!);
  if (cadenceValues.length > 0) {
    cadenceStats = {
      min: Math.min(...cadenceValues),
      max: Math.max(...cadenceValues),
      avg: Math.round(cadenceValues.reduce((a, b) => a + b, 0) / cadenceValues.length)
    };
  }

  return {
    dataPoints: sampledPoints,
    trends,
    keyEvents,
    paceStats,
    elevationProfile: elevationStats,
    cadenceStats
  };
}

// Helper: Haversine distance between two points (returns km)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Run Analysis Types
export interface KmSplit {
  km: number;
  pace: string;
  paceSeconds: number;
  cumulativeTime: number;
}

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
    kmSplits?: KmSplit[];
    elevationGain?: number;
    elevationLoss?: number;
    weatherData?: {
      temperature?: number;
      feelsLike?: number;
      humidity?: number;
      windSpeed?: number;
      condition?: string;
      uvIndex?: number;
      precipitationProbability?: number;
    };
    telemetry?: TelemetrySummary;
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
  goals?: Array<{
    type: string;
    title: string;
    description?: string | null;
    targetDate?: string | null;
    distanceTarget?: string | null;
    timeTargetSeconds?: number | null;
    eventName?: string | null;
    weeklyRunTarget?: number | null;
    progressPercent?: number | null;
  }>;
}

export interface RunAnalysisResponse {
  highlights: string[];
  struggles: string[];
  personalBests: string[];
  demographicComparison: string;
  coachingTips: string[];
  overallAssessment: string;
  weatherImpact?: string;
  warmUpAnalysis?: string;
  goalProgress?: string;
}

export async function generateComprehensiveRunAnalysis(request: RunAnalysisRequest): Promise<RunAnalysisResponse> {
  const { run, user, previousRuns = [], goals = [] } = request;
  
  // Format km splits for analysis - now properly parsing the object structure
  let splitsInfo = 'No km split data available';
  if (run.kmSplits && run.kmSplits.length > 0) {
    const splitsTable = run.kmSplits.map(split => 
      `  Km ${split.km}: ${split.pace} (${split.paceSeconds}s)`
    ).join('\n');
    
    // Calculate pacing analysis
    const paceTimes = run.kmSplits.map(s => s.paceSeconds);
    const fastestKm = Math.min(...paceTimes);
    const slowestKm = Math.max(...paceTimes);
    const avgSplitTime = paceTimes.reduce((a, b) => a + b, 0) / paceTimes.length;
    const variation = ((slowestKm - fastestKm) / avgSplitTime * 100).toFixed(1);
    
    splitsInfo = `KM SPLITS:\n${splitsTable}\n  Fastest: ${Math.floor(fastestKm / 60)}:${(fastestKm % 60).toString().padStart(2, '0')}/km\n  Slowest: ${Math.floor(slowestKm / 60)}:${(slowestKm % 60).toString().padStart(2, '0')}/km\n  Pace variation: ${variation}%`;
  }
  
  // Format previous runs for comparison
  const previousRunsInfo = previousRuns.length > 0
    ? `Previous runs on this route:\n${previousRuns.slice(0, 5).map((pr, i) => 
        `  ${i + 1}. ${pr.distance.toFixed(2)}km in ${Math.floor(pr.duration / 60)}:${(pr.duration % 60).toString().padStart(2, '0')} (pace: ${pr.avgPace})`
      ).join('\n')}`
    : 'No previous runs on this route';
  
  // Format telemetry summary for trend analysis
  let telemetryInfo = '';
  if (run.telemetry) {
    const t = run.telemetry;
    
    // Pace trends
    const paceTrendDesc = {
      'speeding_up': 'Runner sped up throughout (negative split)',
      'slowing_down': 'Runner slowed down throughout (positive split)', 
      'steady': 'Pace was consistent throughout',
      'variable': 'Pace varied significantly throughout'
    };
    
    telemetryInfo = `\nPERFORMANCE TRENDS:
- Pacing pattern: ${paceTrendDesc[t.trends.paceTrend]} (${t.trends.paceChangePercent > 0 ? '+' : ''}${t.trends.paceChangePercent}% change first to second half)`;

    // Only show pace stats if we have valid data (not zeros)
    if (t.paceStats.min > 0 && t.paceStats.max > 0) {
      telemetryInfo += `
- Pace range: ${Math.floor(t.paceStats.min / 60)}:${(Math.round(t.paceStats.min) % 60).toString().padStart(2, '0')} to ${Math.floor(t.paceStats.max / 60)}:${(Math.round(t.paceStats.max) % 60).toString().padStart(2, '0')}/km
- Pace consistency: ${t.paceStats.stdDev < 15 ? 'Very consistent' : t.paceStats.stdDev < 30 ? 'Moderately consistent' : 'Highly variable'} (±${Math.round(t.paceStats.stdDev)}s)`;
    }

    // Include downsampled data points for trend visualization (compact format)
    if (t.dataPoints && t.dataPoints.length > 0) {
      // Format data points as compact arrays for the AI to analyze trends
      const distancePoints = t.dataPoints.map(p => p.distance.toFixed(2)).join(',');
      const pacePoints = t.dataPoints.filter(p => p.pace !== undefined && p.pace > 0).map(p => {
        const mins = Math.floor(p.pace! / 60);
        const secs = Math.round(p.pace! % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      }).join(',');
      const elevationPoints = t.dataPoints.filter(p => p.elevation !== undefined).map(p => Math.round(p.elevation!)).join(',');
      const hrPoints = t.dataPoints.filter(p => p.heartRate !== undefined).map(p => p.heartRate).join(',');
      const timestampPoints = t.dataPoints.filter(p => p.timestamp !== undefined).map(p => {
        const mins = Math.floor(p.timestamp! / 60);
        const secs = Math.round(p.timestamp! % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      }).join(',');
      
      telemetryInfo += `\n\nSAMPLED DATA THROUGHOUT RUN (${t.dataPoints.length} points):`;
      telemetryInfo += `\n- Distance markers (km): [${distancePoints}]`;
      if (timestampPoints.length > 0) {
        telemetryInfo += `\n- Time at each point (min:sec): [${timestampPoints}]`;
      }
      if (pacePoints.length > 0) {
        telemetryInfo += `\n- Pace at each point (min:sec/km): [${pacePoints}]`;
      }
      if (elevationPoints.length > 0) {
        telemetryInfo += `\n- Elevation at each point (m): [${elevationPoints}]`;
      }
      if (hrPoints.length > 0) {
        telemetryInfo += `\n- Heart rate at each point (bpm): [${hrPoints}]`;
      }
    }

    if (t.elevationProfile) {
      telemetryInfo += `\n\nELEVATION ANALYSIS:
- Total climb: ${t.elevationProfile.totalGain}m gain, ${t.elevationProfile.totalLoss}m loss
- Maximum grade: ${t.elevationProfile.maxGrade}%
- Significant hills: ${t.elevationProfile.hillCount}`;
    }
    
    if (t.keyEvents && t.keyEvents.length > 0) {
      telemetryInfo += `\n\nKEY EVENTS DURING RUN:`;
      t.keyEvents.forEach(event => {
        telemetryInfo += `\n- ${event.description}`;
      });
    }
  }
  
  const systemPrompt = `You are an elite running coach with decades of experience coaching athletes from beginners to Olympians. 
Your role is to provide a comprehensive, personalized analysis of a completed run.

ANALYSIS APPROACH:
1. Be encouraging but honest - highlight genuine achievements while identifying areas for improvement
2. Use the runner's profile (age, fitness level, goals) to personalize all advice
3. Compare to appropriate demographic benchmarks (age group, gender, fitness level)
4. If previous runs exist, identify trends and personal bests
5. Provide actionable, specific coaching tips

CRITICAL DATA INTEGRITY RULES:
1. ONLY analyze data that is EXPLICITLY provided. NEVER infer, assume, or fabricate data.
2. If heart rate data is not provided, DO NOT include "warmUpAnalysis" in your response. DO NOT mention heart rate at all.
3. If weather data is not provided, DO NOT include "weatherImpact" in your response.
4. If goals data is not provided, DO NOT include "goalProgress" in your response.
5. Base ALL analysis strictly on the data provided. Do not make claims about data that was not collected.

RESPONSE FORMAT:
Return ONLY valid JSON with this exact structure (only include optional fields if their data is available):
{
  "highlights": ["2-4 specific things the runner did well, with data to back it up"],
  "struggles": ["1-3 areas where the runner struggled, be constructive not critical"],
  "personalBests": ["Any PBs or notable achievements from this run or compared to history"],
  "demographicComparison": "1-2 sentences comparing to others in their age/fitness group",
  "coachingTips": ["3-5 specific, actionable tips for improvement"],
  "overallAssessment": "2-3 sentence summary of the run and next steps",
  "weatherImpact": "ONLY include if weather data was provided above",
  "warmUpAnalysis": "ONLY include if heart rate data was provided above",
  "goalProgress": "ONLY include if goals data was provided above"
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

${run.weatherData ? `WEATHER CONDITIONS (ANALYZE IMPACT ON PERFORMANCE):
- Temperature: ${run.weatherData.temperature !== undefined ? `${run.weatherData.temperature}°C` : 'Unknown'}
- Feels like: ${run.weatherData.feelsLike !== undefined ? `${run.weatherData.feelsLike}°C` : 'Unknown'}
- Humidity: ${run.weatherData.humidity !== undefined ? `${run.weatherData.humidity}%` : 'Unknown'}
- Wind: ${run.weatherData.windSpeed !== undefined ? `${run.weatherData.windSpeed} km/h` : 'Unknown'}
- UV Index: ${run.weatherData.uvIndex !== undefined ? run.weatherData.uvIndex : 'Unknown'}
- Precipitation chance: ${run.weatherData.precipitationProbability !== undefined ? `${run.weatherData.precipitationProbability}%` : 'Unknown'}
- Conditions: ${run.weatherData.condition || 'Unknown'}

WEATHER IMPACT ANALYSIS GUIDELINES:
- Hot conditions (>25°C): Expect 1-2% slower pace per degree above 20°C due to increased cardiovascular strain
- High humidity (>70%): Body cooling is less efficient, expect reduced performance
- Strong wind (>20 km/h): Can add 5-10 seconds per km on exposed sections
- Cold conditions (<5°C): May affect muscle performance in early stages
- Rain/wet conditions: May impact footing and comfort
IMPORTANT: You MUST include a "weatherImpact" field in your response analyzing how these conditions specifically affected this run's performance.` : ''}
${telemetryInfo}

${run.avgHeartRate || (run.telemetry?.dataPoints?.some(p => p.heartRate)) ? `WARM-UP ANALYSIS GUIDELINES (heart rate data is available - include warmUpAnalysis):
Analyze the runner's starting heart rate (first 1-2 minutes of run) to assess warm-up quality:
- Zone 1 (50-60% max HR): Indicates proper warm-up was performed before the run
- Below Zone 1 (<50% max HR, typically <100-110 bpm for most adults): Suggests "cold start" - runner began without warming up

If a cold start is detected, explain in the "warmUpAnalysis" field:
1. That starting with a low heart rate suggests no pre-run warm-up
2. Benefits of warming up: Gradually increases blood flow to muscles, raises core temperature, lubricates joints
3. Performance benefits: Reduces injury risk, improves running economy
4. Recommendation: 5-10 minute easy jog + dynamic stretches before main effort

If heart rate data shows a gradual rise in the first few minutes, note this as good warm-up behavior.` : 'NO HEART RATE DATA COLLECTED - DO NOT include warmUpAnalysis in your response. DO NOT mention or infer anything about heart rate.'}

${previousRunsInfo}

${goals.length > 0 ? `RUNNER'S ACTIVE GOALS:
${goals.map(g => {
  let goalInfo = `- ${g.title} (${g.type.replace(/_/g, ' ')})`;
  if (g.description) goalInfo += `: ${g.description}`;
  if (g.targetDate) {
    const daysLeft = Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft > 0) goalInfo += ` - ${daysLeft} days until target`;
    else if (daysLeft === 0) goalInfo += ' - TARGET DATE IS TODAY!';
  }
  if (g.eventName) goalInfo += ` (Event: ${g.eventName})`;
  if (g.distanceTarget) goalInfo += ` - Target: ${g.distanceTarget}`;
  if (g.timeTargetSeconds) {
    const mins = Math.floor(g.timeTargetSeconds / 60);
    const secs = g.timeTargetSeconds % 60;
    goalInfo += ` - Target time: ${mins}:${String(secs).padStart(2, '0')}`;
  }
  if (g.progressPercent) goalInfo += ` (${g.progressPercent}% progress)`;
  return goalInfo;
}).join('\n')}

GOAL ANALYSIS GUIDELINES:
- Analyze how this specific run contributes to each goal
- For event goals: How does this training session prepare them for race day?
- For time/distance goals: How does their current pace compare to their target?
- For consistency goals: Acknowledge their commitment to showing up
- For health goals: How is this run contributing to their wellbeing journey?
IMPORTANT: You MUST include a "goalProgress" field in your response analyzing goal contribution.` : ''}

Provide your elite coaching analysis. Pay special attention to pacing patterns, elevation impact, and any key events that occurred during the run.`;

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

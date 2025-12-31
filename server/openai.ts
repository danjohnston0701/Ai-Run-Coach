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
  
  const prompt = `You are an encouraging AI running coach providing real-time guidance. Based on these stats:
- Current pace: ${request.currentPace}
- Target pace: ${request.targetPace}
- Heart rate: ${request.heartRate || "unknown"} bpm
- Progress: ${request.distanceCovered.toFixed(2)}km of ${request.totalDistance}km (${progressPercent}%)
- Elapsed time: ${Math.floor(request.elapsedTime / 60)} minutes
- Difficulty: ${request.difficulty}
- Fitness level: ${request.userFitnessLevel || "intermediate"}

Provide brief, motivating coaching advice. Be specific but concise.

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

export { openai };

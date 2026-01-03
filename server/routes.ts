import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertPreRegistrationSchema, insertUserSchema, insertRouteSchema, insertRunSchema, 
  insertLiveRunSessionSchema, insertPushSubscriptionSchema,
  insertAiCoachDescriptionSchema, insertAiCoachInstructionSchema, 
  insertAiCoachKnowledgeSchema, insertAiCoachFaqSchema
} from "@shared/schema";
import { z } from "zod";
import { generateRoute, getCoachingAdvice, analyzeRunPerformance, generateTTS, calculateAge, type CoachTone, type TTSVoice, type AiCoachConfig } from "./openai";
import { generateCircularRoute, generateMultipleRoutes, isGoogleMapsConfigured } from "./routePlanner";
import { generateAIRoutes } from "./aiRoutePlanner";
import bcrypt from "bcryptjs";
import { initializePushNotifications, isPushConfigured, getPublicVapidKey, sendFriendRequestNotification, sendFriendAcceptedNotification } from "./pushNotifications";
import { getCurrentWeather, getFullWeatherData, getWeatherDescription, isGoodRunningWeather, type WeatherCondition, type WeatherData } from "./weather";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize push notifications
  initializePushNotifications();
  
  // Pre-registration endpoint
  app.post("/api/pre-register", async (req, res) => {
    try {
      const data = insertPreRegistrationSchema.parse(req.body);
      const existing = await storage.getPreRegistrations();
      if (existing.find(r => r.email === data.email)) {
        return res.status(400).json({ error: "Email already registered" });
      }
      const registration = await storage.createPreRegistration(data);
      res.status(201).json(registration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to register" });
    }
  });

  // User authentication routes
  app.post("/api/auth/register", async (req, res) => {
    console.log("Registration attempt:", { email: req.body.email, name: req.body.name });
    try {
      const data = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        console.log("Registration failed: email already exists");
        return res.status(400).json({ error: "Email already exists" });
      }
      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({ ...data, password: hashedPassword });
      const { password, ...safeUser } = user;
      console.log("User created successfully:", safeUser.id);
      res.status(201).json(safeUser);
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      const errorMessage = error instanceof Error ? error.message : "Failed to create user";
      if (errorMessage.includes("EAI_AGAIN") || errorMessage.includes("getaddrinfo")) {
        res.status(503).json({ error: "It seems there was an error accessing the database, please try again shortly" });
      } else {
        res.status(500).json({ error: errorMessage });
      }
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log("Login attempt:", { email });
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.log("Login failed: user not found");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        console.log("Login failed: invalid password");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const { password: _, ...safeUser } = user;
      console.log("Login successful:", safeUser.id);
      res.json(safeUser);
    } catch (error) {
      console.error("Login error:", error);
      const errorMessage = error instanceof Error ? error.message : "Login failed";
      if (errorMessage.includes("EAI_AGAIN") || errorMessage.includes("getaddrinfo")) {
        res.status(503).json({ error: "It seems there was an error accessing the database, please try again shortly" });
      } else {
        res.status(500).json({ error: errorMessage });
      }
    }
  });

  // Search users (for adding friends) - must be before /api/users/:id to avoid route conflict
  app.get("/api/users/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string' || q.length < 2) {
        return res.json([]);
      }
      const users = await storage.searchUsers(q);
      res.json(users);
    } catch (error) {
      console.error("User search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Routes endpoints
  app.post("/api/routes", async (req, res) => {
    try {
      const data = insertRouteSchema.parse(req.body);
      const route = await storage.createRoute(data);
      res.status(201).json(route);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create route" });
    }
  });

  // Get recent routes - MUST be before :id route
  app.get("/api/routes/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 4;
      const routes = await storage.getRecentRoutes(limit);
      res.json(routes);
    } catch (error) {
      console.error("Failed to get recent routes:", error);
      res.status(500).json({ error: "Failed to get recent routes" });
    }
  });

  // Get favorite routes - MUST be before :id route
  app.get("/api/routes/favorites", async (req, res) => {
    try {
      const { userId } = req.query;
      const routes = await storage.getFavoriteRoutes(userId as string | undefined);
      res.json(routes);
    } catch (error) {
      console.error("Failed to get favorite routes:", error);
      res.status(500).json({ error: "Failed to get favorite routes" });
    }
  });

  // Get routes by location - MUST be before :id route
  app.get("/api/routes/by-location", async (req, res) => {
    try {
      const { lat, lng, radiusKm } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "Missing lat/lng parameters" });
      }
      const routes = await storage.getRoutesByLocation(
        parseFloat(lat as string),
        parseFloat(lng as string),
        radiusKm ? parseFloat(radiusKm as string) : 0.5
      );
      res.json(routes);
    } catch (error) {
      console.error("Failed to get routes by location:", error);
      res.status(500).json({ error: "Failed to get routes by location" });
    }
  });

  // Get all routes with optional filters
  app.get("/api/routes", async (req, res) => {
    try {
      const { difficulty, userId } = req.query;
      const filters: { difficulty?: string; userId?: string } = {};
      if (difficulty) filters.difficulty = difficulty as string;
      if (userId) filters.userId = userId as string;
      const routes = await storage.getAllRoutes(filters);
      res.json(routes);
    } catch (error) {
      console.error("Failed to get routes:", error);
      res.status(500).json({ error: "Failed to get routes" });
    }
  });

  // Get single route by ID - MUST be after specific path routes
  app.get("/api/routes/:id", async (req, res) => {
    try {
      const route = await storage.getRoute(req.params.id);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      res.json(route);
    } catch (error) {
      res.status(500).json({ error: "Failed to get route" });
    }
  });

  app.get("/api/users/:userId/routes", async (req, res) => {
    try {
      const routes = await storage.getUserRoutes(req.params.userId);
      res.json(routes);
    } catch (error) {
      res.status(500).json({ error: "Failed to get routes" });
    }
  });

  // Toggle route favorite
  app.post("/api/routes/:id/favorite", async (req, res) => {
    try {
      const route = await storage.toggleRouteFavorite(req.params.id);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      res.json(route);
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
      res.status(500).json({ error: "Failed to toggle favorite" });
    }
  });

  // Mark route as started (updates lastStartedAt timestamp)
  app.post("/api/routes/:id/start", async (req, res) => {
    try {
      const route = await storage.markRouteStarted(req.params.id);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      res.json(route);
    } catch (error) {
      console.error("Failed to mark route started:", error);
      res.status(500).json({ error: "Failed to mark route started" });
    }
  });

  // Generate multiple route options (5 routes: mixed difficulties)
  // Uses AI-powered route planning: Google for area data → OpenAI for waypoint design → Google for final route
  app.post("/api/routes/generate-options", async (req, res) => {
    try {
      const { startLat, startLng, targetDistance, useAI = true, userId } = req.body;
      
      if (startLat === undefined || startLat === null || 
          startLng === undefined || startLng === null || 
          targetDistance === undefined || targetDistance === null) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      if (!isGoogleMapsConfigured()) {
        console.error("Google Maps API key not configured");
        return res.status(503).json({ error: "Route generation service is temporarily unavailable. Please try again later." });
      }

      // Fetch user's template preferences if userId provided
      let templatePreferences: Array<{ templateName: string; avgRating: number; count: number }> | undefined;
      if (userId) {
        try {
          templatePreferences = await storage.getTemplateRatings(userId);
          if (templatePreferences.length > 0) {
            console.log(`[Route API] Loaded ${templatePreferences.length} template preferences for user`);
          }
        } catch (err) {
          console.log("[Route API] Could not load template preferences");
        }
      }

      // Use AI-powered route generation by default
      let result;
      if (useAI) {
        console.log("[Route API] Using AI-powered route generation");
        result = await generateAIRoutes({
          startLat: parseFloat(startLat),
          startLng: parseFloat(startLng),
          targetDistance: parseFloat(targetDistance),
        }, templatePreferences);
      } else {
        console.log("[Route API] Using geometric route generation (fallback)");
        result = await generateMultipleRoutes({
          startLat: parseFloat(startLat),
          startLng: parseFloat(startLng),
          targetDistance: parseFloat(targetDistance),
        });
      }

      if (!result.success) {
        console.error("Multi-route generation failed:", result.error);
        return res.status(400).json({ error: result.error || "Could not generate routes. Please try a different location or distance." });
      }

      // Get location label for grouping - include street and city
      let startLocationLabel = "Unknown Location";
      try {
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${startLat},${startLng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
        const geocodeRes = await fetch(geocodeUrl);
        const geocodeData = await geocodeRes.json();
        if (geocodeData.results && geocodeData.results.length > 0) {
          const components = geocodeData.results[0].address_components;
          const streetNumber = components?.find((c: any) => c.types.includes('street_number'))?.long_name;
          const route = components?.find((c: any) => c.types.includes('route'))?.long_name;
          const locality = components?.find((c: any) => c.types.includes('locality'))?.long_name;
          const sublocality = components?.find((c: any) => c.types.includes('sublocality'))?.long_name;
          
          // Build address: street number + street name, city
          const streetPart = streetNumber && route ? `${streetNumber} ${route}` : route || "";
          const cityPart = locality || sublocality || "";
          
          if (streetPart && cityPart) {
            startLocationLabel = `${streetPart}, ${cityPart}`;
          } else if (streetPart) {
            startLocationLabel = streetPart;
          } else if (cityPart) {
            startLocationLabel = cityPart;
          } else {
            startLocationLabel = geocodeData.results[0].formatted_address?.split(',').slice(0, 2).join(',') || "Unknown Location";
          }
        }
      } catch (err) {
        console.log("[Route API] Could not get location label");
      }

      // Save routes to database
      const savedRoutes = [];
      for (const route of result.routes) {
        try {
          const routeElevation = (route as any).elevation;
          const savedRoute = await storage.createRoute({
            userId: userId || null,
            name: route.routeName,
            distance: route.actualDistance,
            difficulty: route.difficulty,
            startLat: parseFloat(startLat),
            startLng: parseFloat(startLng),
            endLat: parseFloat(startLat),
            endLng: parseFloat(startLng),
            waypoints: route.waypoints,
            polyline: route.polyline,
            elevation: routeElevation?.gain || null,
            elevationGain: routeElevation?.gain || null,
            elevationLoss: routeElevation?.loss || null,
            elevationProfile: routeElevation?.profile || null,
            estimatedTime: route.duration,
            terrainType: route.hasMajorRoads ? 'road' : 'mixed',
            startLocationLabel,
          });
          savedRoutes.push({ ...route, dbId: savedRoute.id });
        } catch (saveErr) {
          console.error("[Route API] Failed to save route:", saveErr);
          savedRoutes.push(route);
        }
      }

      res.json({
        success: true,
        routes: savedRoutes,
        targetDistance: parseFloat(targetDistance),
        generationMethod: useAI ? "ai-powered" : "geometric",
        startLocationLabel,
      });
    } catch (error) {
      console.error("Multi-route generation error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Failed to generate routes: ${errorMessage}` });
    }
  });

  // Single route generation (legacy endpoint)
  app.post("/api/routes/generate", async (req, res) => {
    try {
      const { startLat, startLng, targetDistance, difficulty } = req.body;
      
      if (startLat === undefined || startLat === null || 
          startLng === undefined || startLng === null || 
          targetDistance === undefined || targetDistance === null) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      if (!isGoogleMapsConfigured()) {
        console.error("Google Maps API key not configured");
        return res.status(503).json({ error: "Route generation service is temporarily unavailable. Please try again later." });
      }

      const result = await generateCircularRoute({
        startLat: parseFloat(startLat),
        startLng: parseFloat(startLng),
        targetDistance: parseFloat(targetDistance),
        difficulty: difficulty || "moderate",
      });

      if (!result.success) {
        console.error("Route generation failed:", result.error);
        return res.status(400).json({ error: result.error || "Could not generate route. Please try a different location or distance." });
      }

      res.json({
        waypoints: result.waypoints,
        actualDistance: result.actualDistance,
        duration: result.duration,
        polyline: result.polyline,
        attempts: result.attempts,
        routeName: result.routeName,
        routeGrade: result.routeGrade,
      });
    } catch (error) {
      console.error("Route generation error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Failed to generate route: ${errorMessage}` });
    }
  });

  // Runs endpoints
  app.post("/api/runs", async (req, res) => {
    try {
      const data = insertRunSchema.parse(req.body);
      const run = await storage.createRun(data);
      res.status(201).json(run);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create run" });
    }
  });

  app.get("/api/runs/:id", async (req, res) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      res.json(run);
    } catch (error) {
      res.status(500).json({ error: "Failed to get run" });
    }
  });

  app.get("/api/users/:userId/runs", async (req, res) => {
    try {
      const runs = await storage.getUserRuns(req.params.userId);
      res.json(runs);
    } catch (error) {
      res.status(500).json({ error: "Failed to get runs" });
    }
  });

  app.patch("/api/runs/:id", async (req, res) => {
    try {
      const run = await storage.updateRun(req.params.id, req.body);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      res.json(run);
    } catch (error) {
      res.status(500).json({ error: "Failed to update run" });
    }
  });

  // Weather Impact Analysis endpoint
  app.get("/api/users/:userId/weather-impact", async (req, res) => {
    try {
      const runs = await storage.getUserRuns(req.params.userId);
      
      // Filter runs that have weather data
      const runsWithWeather = runs.filter(run => run.weatherData && run.duration > 0 && run.distance > 0);
      
      if (runsWithWeather.length < 3) {
        return res.json({
          hasEnoughData: false,
          message: "Need at least 3 runs with weather data for analysis",
          runsAnalyzed: runsWithWeather.length
        });
      }

      // Calculate pace in seconds per km for each run
      const runMetrics = runsWithWeather.map(run => {
        const weather = run.weatherData as any;
        const paceSecondsPerKm = run.duration / run.distance;
        return {
          id: run.id,
          date: run.completedAt,
          distance: run.distance,
          duration: run.duration,
          paceSecondsPerKm,
          temperature: weather?.temperature ?? null,
          humidity: weather?.humidity ?? null,
          windSpeed: weather?.windSpeed ?? null,
          condition: weather?.condition ?? null,
          feelsLike: weather?.feelsLike ?? null,
        };
      });

      // Calculate average pace
      const avgPace = runMetrics.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / runMetrics.length;

      // Group runs by temperature ranges
      const tempRanges = {
        cold: { min: -20, max: 10, label: "Cold (<10°C)", runs: [] as typeof runMetrics },
        mild: { min: 10, max: 20, label: "Mild (10-20°C)", runs: [] as typeof runMetrics },
        warm: { min: 20, max: 30, label: "Warm (20-30°C)", runs: [] as typeof runMetrics },
        hot: { min: 30, max: 50, label: "Hot (>30°C)", runs: [] as typeof runMetrics },
      };

      runMetrics.forEach(run => {
        if (run.temperature !== null) {
          if (run.temperature < 10) tempRanges.cold.runs.push(run);
          else if (run.temperature < 20) tempRanges.mild.runs.push(run);
          else if (run.temperature < 30) tempRanges.warm.runs.push(run);
          else tempRanges.hot.runs.push(run);
        }
      });

      // Calculate average pace per temperature range
      const temperatureAnalysis = Object.entries(tempRanges).map(([key, range]) => ({
        range: key,
        label: range.label,
        avgPace: range.runs.length > 0 
          ? range.runs.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / range.runs.length 
          : null,
        runCount: range.runs.length,
        paceVsAvg: range.runs.length > 0 
          ? ((range.runs.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / range.runs.length) - avgPace) / avgPace * 100
          : null,
      })).filter(t => t.runCount > 0);

      // Group runs by humidity ranges
      const humidityRanges = {
        low: { min: 0, max: 40, label: "Low (<40%)", runs: [] as typeof runMetrics },
        medium: { min: 40, max: 70, label: "Medium (40-70%)", runs: [] as typeof runMetrics },
        high: { min: 70, max: 100, label: "High (>70%)", runs: [] as typeof runMetrics },
      };

      runMetrics.forEach(run => {
        if (run.humidity !== null) {
          if (run.humidity < 40) humidityRanges.low.runs.push(run);
          else if (run.humidity < 70) humidityRanges.medium.runs.push(run);
          else humidityRanges.high.runs.push(run);
        }
      });

      const humidityAnalysis = Object.entries(humidityRanges).map(([key, range]) => ({
        range: key,
        label: range.label,
        avgPace: range.runs.length > 0 
          ? range.runs.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / range.runs.length 
          : null,
        runCount: range.runs.length,
        paceVsAvg: range.runs.length > 0 
          ? ((range.runs.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / range.runs.length) - avgPace) / avgPace * 100
          : null,
      })).filter(h => h.runCount > 0);

      // Group runs by wind speed
      const windRanges = {
        calm: { min: 0, max: 10, label: "Calm (<10 km/h)", runs: [] as typeof runMetrics },
        breezy: { min: 10, max: 25, label: "Breezy (10-25 km/h)", runs: [] as typeof runMetrics },
        windy: { min: 25, max: 100, label: "Windy (>25 km/h)", runs: [] as typeof runMetrics },
      };

      runMetrics.forEach(run => {
        if (run.windSpeed !== null) {
          if (run.windSpeed < 10) windRanges.calm.runs.push(run);
          else if (run.windSpeed < 25) windRanges.breezy.runs.push(run);
          else windRanges.windy.runs.push(run);
        }
      });

      const windAnalysis = Object.entries(windRanges).map(([key, range]) => ({
        range: key,
        label: range.label,
        avgPace: range.runs.length > 0 
          ? range.runs.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / range.runs.length 
          : null,
        runCount: range.runs.length,
        paceVsAvg: range.runs.length > 0 
          ? ((range.runs.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / range.runs.length) - avgPace) / avgPace * 100
          : null,
      })).filter(w => w.runCount > 0);

      // Group by weather condition
      const conditionGroups: Record<string, typeof runMetrics> = {};
      runMetrics.forEach(run => {
        if (run.condition) {
          const condition = run.condition.toLowerCase();
          let category = "clear";
          if (condition.includes("rain") || condition.includes("drizzle") || condition.includes("shower")) {
            category = "rainy";
          } else if (condition.includes("cloud") || condition.includes("overcast")) {
            category = "cloudy";
          } else if (condition.includes("sun") || condition.includes("clear")) {
            category = "sunny";
          }
          if (!conditionGroups[category]) conditionGroups[category] = [];
          conditionGroups[category].push(run);
        }
      });

      const conditionAnalysis = Object.entries(conditionGroups).map(([condition, conditionRuns]) => ({
        condition: condition.charAt(0).toUpperCase() + condition.slice(1),
        avgPace: conditionRuns.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / conditionRuns.length,
        runCount: conditionRuns.length,
        paceVsAvg: ((conditionRuns.reduce((sum, r) => sum + r.paceSecondsPerKm, 0) / conditionRuns.length) - avgPace) / avgPace * 100,
      }));

      // Find best and worst conditions - include condition analysis
      const allAnalysis = [
        ...temperatureAnalysis.map(t => ({ ...t, type: 'temperature', displayLabel: t.label })),
        ...humidityAnalysis.map(h => ({ ...h, type: 'humidity', displayLabel: h.label })),
        ...windAnalysis.map(w => ({ ...w, type: 'wind', displayLabel: w.label })),
        ...conditionAnalysis.map(c => ({ 
          ...c, 
          type: 'condition', 
          displayLabel: `${c.condition} weather`,
          label: c.condition,
        })),
      ].filter(a => a.runCount >= 2 && a.paceVsAvg !== null);

      const bestCondition = allAnalysis.length > 0 
        ? allAnalysis.reduce((best, current) => 
            (current.paceVsAvg !== null && (best.paceVsAvg === null || current.paceVsAvg < best.paceVsAvg)) ? current : best
          )
        : null;

      const worstCondition = allAnalysis.length > 0 
        ? allAnalysis.reduce((worst, current) => 
            (current.paceVsAvg !== null && (worst.paceVsAvg === null || current.paceVsAvg > worst.paceVsAvg)) ? current : worst
          )
        : null;

      res.json({
        hasEnoughData: true,
        runsAnalyzed: runsWithWeather.length,
        overallAvgPace: avgPace,
        temperatureAnalysis,
        humidityAnalysis,
        windAnalysis,
        conditionAnalysis,
        insights: {
          bestCondition: bestCondition ? {
            label: bestCondition.displayLabel || bestCondition.label,
            type: bestCondition.type,
            improvement: bestCondition.paceVsAvg ? Math.abs(bestCondition.paceVsAvg).toFixed(1) : null,
          } : null,
          worstCondition: worstCondition ? {
            label: worstCondition.displayLabel || worstCondition.label,
            type: worstCondition.type,
            slowdown: worstCondition.paceVsAvg ? Math.abs(worstCondition.paceVsAvg).toFixed(1) : null,
          } : null,
        },
      });
    } catch (error) {
      console.error("Weather impact analysis error:", error);
      res.status(500).json({ error: "Failed to analyze weather impact" });
    }
  });

  // Live session endpoints
  app.post("/api/live-sessions", async (req, res) => {
    try {
      const data = insertLiveRunSessionSchema.parse(req.body);
      const session = await storage.createLiveSession(data);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create live session" });
    }
  });

  app.get("/api/live-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getLiveSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.get("/api/users/:userId/live-session", async (req, res) => {
    try {
      const session = await storage.getActiveLiveSession(req.params.userId);
      res.json(session || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to get active session" });
    }
  });

  app.patch("/api/live-sessions/:id", async (req, res) => {
    try {
      const session = await storage.updateLiveSession(req.params.id, req.body);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.post("/api/live-sessions/:id/end", async (req, res) => {
    try {
      await storage.endLiveSession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  // Friends endpoints
  app.get("/api/users/:userId/friends", async (req, res) => {
    try {
      const friendRecords = await storage.getFriends(req.params.userId);
      
      // Enrich with friend user details
      const enrichedFriends = await Promise.all(
        friendRecords.map(async (record) => {
          const friendUser = await storage.getUser(record.friendId);
          return {
            id: record.id,
            name: friendUser?.name || 'Unknown',
            email: friendUser?.email || '',
            friendId: record.friendId,
            profilePic: friendUser?.profilePic || null,
          };
        })
      );
      
      res.json(enrichedFriends);
    } catch (error) {
      console.error("Get friends error:", error);
      res.status(500).json({ error: "Failed to get friends" });
    }
  });

  app.post("/api/users/:userId/friends", async (req, res) => {
    try {
      const { friendId } = req.body;
      const friend = await storage.addFriend({
        userId: req.params.userId,
        friendId,
        status: "accepted"
      });
      res.status(201).json(friend);
    } catch (error) {
      res.status(500).json({ error: "Failed to add friend" });
    }
  });

  app.delete("/api/users/:userId/friends/:friendId", async (req, res) => {
    try {
      await storage.removeFriend(req.params.userId, req.params.friendId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove friend" });
    }
  });

  // AI Route Generation endpoint
  app.post("/api/ai/generate-route", async (req, res) => {
    try {
      const { startLat, startLng, distance, difficulty, terrainPreference, userFitnessLevel, userId } = req.body;
      
      console.log("Route generation request received:", { startLat, startLng, distance, difficulty });
      
      if (startLat === undefined || startLat === null || 
          startLng === undefined || startLng === null || 
          !distance || !difficulty) {
        return res.status(400).json({ error: "Missing required fields: startLat, startLng, distance, difficulty" });
      }

      // Parse coordinates as numbers to ensure correct type
      const parsedLat = parseFloat(startLat);
      const parsedLng = parseFloat(startLng);
      const parsedDistance = parseFloat(distance);

      const generatedRoute = await generateRoute({
        startLat: parsedLat,
        startLng: parsedLng,
        distance: parsedDistance,
        difficulty,
        terrainPreference,
        userFitnessLevel
      });

      console.log("Generated route waypoints:", generatedRoute.waypoints);

      const savedRoute = await storage.createRoute({
        userId: userId || null,
        name: generatedRoute.name,
        distance: parsedDistance,
        difficulty,
        startLat: parsedLat,
        startLng: parsedLng,
        endLat: parsedLat,
        endLng: parsedLng,
        waypoints: generatedRoute.waypoints,
        elevation: generatedRoute.elevation,
        estimatedTime: generatedRoute.estimatedTime,
        terrainType: terrainPreference || "mixed"
      });

      console.log("Saved route coordinates:", { startLat: savedRoute.startLat, startLng: savedRoute.startLng });

      res.status(201).json({
        ...savedRoute,
        tips: generatedRoute.tips,
        description: generatedRoute.description
      });
    } catch (error) {
      console.error("Route generation error:", error);
      res.status(500).json({ error: "Failed to generate route" });
    }
  });

  // Weather API endpoints
  app.get("/api/weather/current", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ error: "Missing lat/lng parameters" });
      }

      const weather = await getCurrentWeather(parseFloat(lat as string), parseFloat(lng as string));
      
      if (!weather) {
        return res.status(503).json({ error: "Weather service unavailable" });
      }

      res.json({
        current: weather,
        description: getWeatherDescription(weather),
        runningConditions: isGoodRunningWeather(weather)
      });
    } catch (error) {
      console.error("Weather API error:", error);
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  });

  app.get("/api/weather/full", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ error: "Missing lat/lng parameters" });
      }

      const weatherData = await getFullWeatherData(parseFloat(lat as string), parseFloat(lng as string));
      
      if (!weatherData) {
        return res.status(503).json({ error: "Weather service unavailable" });
      }

      res.json({
        ...weatherData,
        description: getWeatherDescription(weatherData.current),
        runningConditions: isGoodRunningWeather(weatherData.current)
      });
    } catch (error) {
      console.error("Full weather API error:", error);
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  });

  // AI Coaching endpoint
  app.post("/api/ai/coaching", async (req, res) => {
    try {
      const { 
        currentPace, targetPace, heartRate, elapsedTime, distanceCovered, totalDistance, 
        difficulty, userFitnessLevel, targetTimeSeconds, userName, dateOfBirth,
        userWeight, userHeight, userGender, desiredFitnessLevel, coachName,
        userMessage, coachPreferences, coachTone, includeAiConfig,
        // New parameters for smarter coaching
        recentCoachingTopics, paceChange, currentKm, progressPercent, milestones, kmSplitTimes, terrain, weather
      } = req.body;
      
      if (!currentPace || !targetPace || elapsedTime === undefined || distanceCovered === undefined || !totalDistance) {
        return res.status(400).json({ error: "Missing required coaching parameters" });
      }

      const userAge = calculateAge(dateOfBirth);

      let aiConfig: AiCoachConfig | undefined;
      if (includeAiConfig !== false) {
        try {
          const [description, instructions, knowledge, faqs] = await Promise.all([
            storage.getAiCoachDescription(),
            storage.getAiCoachInstructions(),
            storage.getAiCoachKnowledge(),
            storage.getAiCoachFaqs()
          ]);
          aiConfig = {
            description: description?.content,
            instructions: instructions.filter(i => i.isActive).map(i => ({ title: i.title, content: i.content })),
            knowledge: knowledge.filter(k => k.isActive).map(k => ({ title: k.title, content: k.content })),
            faqs: faqs.filter(f => f.isActive).map(f => ({ question: f.question, answer: f.answer }))
          };
        } catch (configErr) {
          console.warn("Failed to load AI config:", configErr);
        }
      }

      const advice = await getCoachingAdvice({
        currentPace,
        targetPace,
        heartRate,
        elapsedTime,
        distanceCovered,
        totalDistance,
        difficulty: difficulty || "moderate",
        userFitnessLevel,
        targetTimeSeconds,
        userName,
        userAge,
        userWeight,
        userHeight,
        userGender,
        desiredFitnessLevel,
        coachName,
        userMessage,
        coachPreferences,
        coachTone,
        aiConfig,
        // New parameters for smarter coaching
        recentCoachingTopics,
        paceChange,
        currentKm,
        progressPercent,
        milestones,
        kmSplitTimes,
        terrain,
        weather
      });

      res.json(advice);
    } catch (error) {
      console.error("Coaching error:", error);
      res.status(500).json({ error: "Failed to get coaching advice" });
    }
  });

  // AI Run Summary endpoint - generates pre-run briefing
  app.post("/api/ai/run-summary", async (req, res) => {
    try {
      const { 
        routeName, targetDistance, targetTimeSeconds, difficulty,
        elevationGain, elevationLoss, elevationProfile, terrainType,
        weather, coachName, userName, includeAiConfig
      } = req.body;
      
      if (!routeName || !difficulty) {
        return res.status(400).json({ error: "Missing required parameters: routeName, difficulty" });
      }
      
      const parsedDistance = typeof targetDistance === 'number' ? targetDistance : parseFloat(targetDistance);
      if (!isFinite(parsedDistance) || parsedDistance <= 0) {
        return res.status(400).json({ error: "targetDistance must be a positive number" });
      }

      let aiConfig: AiCoachConfig | undefined;
      if (includeAiConfig !== false) {
        try {
          const [description, instructions, knowledge, faqs] = await Promise.all([
            storage.getAiCoachDescription(),
            storage.getAiCoachInstructions(),
            storage.getAiCoachKnowledge(),
            storage.getAiCoachFaqs()
          ]);
          aiConfig = {
            description: description?.content,
            instructions: instructions.filter(i => i.isActive).map(i => ({ title: i.title, content: i.content })),
            knowledge: knowledge.filter(k => k.isActive).map(k => ({ title: k.title, content: k.content })),
            faqs: faqs.filter(f => f.isActive).map(f => ({ question: f.question, answer: f.answer }))
          };
        } catch (err) {
          console.log("Could not load AI config for run summary:", err);
        }
      }

      const { generateRunSummary } = await import("./openai");
      const summary = await generateRunSummary({
        routeName,
        targetDistance: parsedDistance,
        targetTimeSeconds,
        difficulty,
        elevationGain,
        elevationLoss,
        elevationProfile,
        terrainType,
        weather,
        coachName,
        userName,
        aiConfig
      });

      res.json({ summary });
    } catch (error) {
      console.error("Run summary error:", error);
      res.status(500).json({ error: "Failed to generate run summary" });
    }
  });

  // AI Text-to-Speech endpoint
  app.post("/api/ai/tts", async (req, res) => {
    try {
      const { text, tone, voice, speed } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Missing or invalid text parameter" });
      }
      
      if (text.length > 2000) {
        return res.status(400).json({ error: "Text too long. Maximum 2000 characters." });
      }
      
      const validTones: CoachTone[] = ['energetic', 'motivational', 'instructive', 'factual', 'abrupt'];
      const coachTone: CoachTone = validTones.includes(tone) ? tone : 'motivational';
      
      const validVoices: TTSVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'ash', 'coral'];
      const coachVoice: TTSVoice | undefined = validVoices.includes(voice) ? voice : undefined;
      
      const audioBuffer = await generateTTS({
        text,
        tone: coachTone,
        voice: coachVoice,
        speed: typeof speed === 'number' ? speed : 1.0
      });
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'public, max-age=300'
      });
      
      res.send(audioBuffer);
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  });

  // AI Run Analysis endpoint
  app.post("/api/ai/analyze-run", async (req, res) => {
    try {
      const { distance, duration, avgPace, avgHeartRate, difficulty, userFitnessLevel } = req.body;
      
      if (!distance || !duration || !avgPace) {
        return res.status(400).json({ error: "Missing required run data" });
      }

      // Load AI config for analysis
      let aiConfig: AiCoachConfig | undefined;
      try {
        const [description, instructions, knowledge, faqs] = await Promise.all([
          storage.getAiCoachDescription(),
          storage.getAiCoachInstructions(),
          storage.getAiCoachKnowledge(),
          storage.getAiCoachFaqs()
        ]);
        aiConfig = {
          description: description?.content,
          instructions: instructions.filter(i => i.isActive).map(i => ({ title: i.title, content: i.content })),
          knowledge: knowledge.filter(k => k.isActive).map(k => ({ title: k.title, content: k.content })),
          faqs: faqs.filter(f => f.isActive).map(f => ({ question: f.question, answer: f.answer }))
        };
      } catch (configErr) {
        console.warn("Failed to load AI config for analysis:", configErr);
      }

      const analysis = await analyzeRunPerformance({
        distance,
        duration,
        avgPace,
        avgHeartRate,
        difficulty: difficulty || "moderate",
        userFitnessLevel,
        aiConfig
      });

      res.json({ analysis });
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze run" });
    }
  });

  // Google Maps API key endpoint (for frontend)
  app.get("/api/config/maps-key", (req, res) => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return res.status(500).json({ error: "Google Maps API key not configured" });
    }
    res.json({ apiKey: key });
  });

  // Reverse geocoding: coordinates to address
  app.get("/api/geocode/reverse", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "Missing lat or lng parameter" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
      );
      const data = await response.json();

      if (data.status === "OK" && data.results.length > 0) {
        const result = data.results[0];
        res.json({
          address: result.formatted_address,
          placeId: result.place_id,
          components: result.address_components
        });
      } else {
        res.json({ address: null, error: data.status });
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      res.status(500).json({ error: "Failed to reverse geocode" });
    }
  });

  // Forward geocoding: address to coordinates
  app.get("/api/geocode/address", async (req, res) => {
    try {
      const { address } = req.query;
      if (!address) {
        return res.status(400).json({ error: "Missing address parameter" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(String(address))}&key=${apiKey}`
      );
      const data = await response.json();

      if (data.status === "OK" && data.results.length > 0) {
        const result = data.results[0];
        res.json({
          address: result.formatted_address,
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          placeId: result.place_id
        });
      } else {
        res.json({ address: null, lat: null, lng: null, error: data.status });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      res.status(500).json({ error: "Failed to geocode address" });
    }
  });

  // Places autocomplete
  app.get("/api/places/autocomplete", async (req, res) => {
    try {
      const { input } = req.query;
      if (!input) {
        return res.status(400).json({ error: "Missing input parameter" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(String(input))}&types=address&key=${apiKey}`
      );
      const data = await response.json();

      if (data.status === "OK") {
        res.json({
          predictions: data.predictions.map((p: any) => ({
            description: p.description,
            placeId: p.place_id
          }))
        });
      } else {
        res.json({ predictions: [], error: data.status });
      }
    } catch (error) {
      console.error("Autocomplete error:", error);
      res.status(500).json({ error: "Failed to get autocomplete suggestions" });
    }
  });

  // Get place details (coordinates from place ID)
  app.get("/api/places/details", async (req, res) => {
    try {
      const { placeId } = req.query;
      if (!placeId) {
        return res.status(400).json({ error: "Missing placeId parameter" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${apiKey}`
      );
      const data = await response.json();

      if (data.status === "OK" && data.result) {
        res.json({
          address: data.result.formatted_address,
          lat: data.result.geometry.location.lat,
          lng: data.result.geometry.location.lng
        });
      } else {
        res.json({ address: null, lat: null, lng: null, error: data.status });
      }
    } catch (error) {
      console.error("Place details error:", error);
      res.status(500).json({ error: "Failed to get place details" });
    }
  });

  // Push notification configuration
  app.get("/api/push/vapid-public-key", (req, res) => {
    const key = getPublicVapidKey();
    if (!key) {
      return res.status(503).json({ error: "Push notifications not configured" });
    }
    res.json({ vapidPublicKey: key });
  });

  app.get("/api/push/status", (req, res) => {
    res.json({ configured: isPushConfigured() });
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { userId, subscription } = req.body;
      if (!userId || !subscription) {
        return res.status(400).json({ error: "Missing userId or subscription" });
      }

      const { endpoint, keys } = subscription;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "Invalid subscription format" });
      }

      const saved = await storage.savePushSubscription({
        userId,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
        userAgent: req.headers['user-agent'] || null,
      });

      console.log(`[Push] Subscription saved for user ${userId}`);
      res.json({ success: true, id: saved.id });
    } catch (error) {
      console.error("Push subscription error:", error);
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  // Unsubscribe from push notifications
  app.delete("/api/push/subscribe/:userId", async (req, res) => {
    try {
      await storage.deletePushSubscription(req.params.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  // Check if user has an active push subscription
  app.get("/api/push/subscription-status", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      const subscription = await storage.getPushSubscription(userId);
      res.json({ hasSubscription: !!subscription });
    } catch (error) {
      res.status(500).json({ error: "Failed to check subscription status" });
    }
  });

  // Notification endpoints
  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Get unread count error:", error);
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.post("/api/notifications/mark-all-read", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });

  // Route Rating endpoints
  app.post("/api/route-ratings", async (req, res) => {
    try {
      const { userId, runId, rating, templateName, backtrackRatio, routeDistance, startLat, startLng, polylineHash, feedback } = req.body;
      
      if (!userId || rating === undefined) {
        return res.status(400).json({ error: "Missing userId or rating" });
      }

      if (rating < 1 || rating > 10) {
        return res.status(400).json({ error: "Rating must be between 1 and 10" });
      }

      const routeRating = await storage.createRouteRating({
        userId,
        runId: runId || null,
        rating,
        templateName: templateName || null,
        backtrackRatio: backtrackRatio || null,
        routeDistance: routeDistance || null,
        startLat: startLat || null,
        startLng: startLng || null,
        polylineHash: polylineHash || null,
        feedback: feedback || null,
      });

      res.status(201).json(routeRating);
    } catch (error) {
      console.error("Create route rating error:", error);
      res.status(500).json({ error: "Failed to save route rating" });
    }
  });

  app.get("/api/route-ratings/:userId", async (req, res) => {
    try {
      const ratings = await storage.getUserRouteRatings(req.params.userId);
      res.json(ratings);
    } catch (error) {
      console.error("Get route ratings error:", error);
      res.status(500).json({ error: "Failed to get route ratings" });
    }
  });

  app.get("/api/route-ratings/:userId/template-preferences", async (req, res) => {
    try {
      const templateRatings = await storage.getTemplateRatings(req.params.userId);
      res.json(templateRatings);
    } catch (error) {
      console.error("Get template ratings error:", error);
      res.status(500).json({ error: "Failed to get template preferences" });
    }
  });

  // Friend Request endpoints
  app.post("/api/friend-requests", async (req, res) => {
    try {
      const { requesterId, addresseeId, message } = req.body;
      
      if (!requesterId || !addresseeId) {
        return res.status(400).json({ error: "Missing requesterId or addresseeId" });
      }

      if (requesterId === addresseeId) {
        return res.status(400).json({ error: "Cannot send friend request to yourself" });
      }

      // Check if they're already friends
      const existingFriends = await storage.getFriends(requesterId);
      if (existingFriends.some(f => f.friendId === addresseeId)) {
        return res.status(400).json({ error: "You are already friends with this user" });
      }

      // Check if there's already a pending request
      const existingRequest = await storage.getPendingRequestBetweenUsers(requesterId, addresseeId);
      if (existingRequest) {
        return res.status(400).json({ error: "A friend request already exists between these users" });
      }

      // Create the friend request
      const request = await storage.createFriendRequest({
        requesterId,
        addresseeId,
        status: 'pending',
        message: message || null,
      });

      // Get requester details for notification
      const requester = await storage.getUser(requesterId);
      if (requester) {
        await sendFriendRequestNotification(
          addresseeId,
          requester.name,
          requester.email
        );
      }

      res.status(201).json(request);
    } catch (error: any) {
      console.error("Friend request error:", error);
      const errorMessage = error?.message || "Failed to send friend request";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get incoming friend requests
  app.get("/api/friend-requests/incoming/:userId", async (req, res) => {
    try {
      const requests = await storage.getIncomingFriendRequests(req.params.userId);
      
      // Enrich with requester info
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const requester = await storage.getUser(request.requesterId);
          return {
            ...request,
            requesterName: requester?.name || 'Unknown',
            requesterEmail: requester?.email || '',
            requesterProfilePic: requester?.profilePic || null,
          };
        })
      );
      
      res.json(enrichedRequests);
    } catch (error: any) {
      console.error("Get incoming requests error:", error);
      const errorMessage = error?.message || "Failed to get friend requests";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get outgoing friend requests
  app.get("/api/friend-requests/outgoing/:userId", async (req, res) => {
    try {
      const requests = await storage.getOutgoingFriendRequests(req.params.userId);
      
      // Enrich with addressee info
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const addressee = await storage.getUser(request.addresseeId);
          return {
            ...request,
            addresseeName: addressee?.name || 'Unknown',
            addresseeEmail: addressee?.email || '',
            addresseeProfilePic: addressee?.profilePic || null,
          };
        })
      );
      
      res.json(enrichedRequests);
    } catch (error: any) {
      console.error("Get outgoing requests error:", error);
      const errorMessage = error?.message || "Failed to get friend requests";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Respond to friend request (accept/reject)
  app.post("/api/friend-requests/:id/respond", async (req, res) => {
    try {
      const { action, userId } = req.body;
      const requestId = req.params.id;

      if (!action || !['accept', 'reject'].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Must be 'accept' or 'reject'" });
      }

      const request = await storage.getFriendRequest(requestId);
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (request.addresseeId !== userId) {
        return res.status(403).json({ error: "Not authorized to respond to this request" });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({ error: "This request has already been responded to" });
      }

      const status = action === 'accept' ? 'accepted' : 'rejected';
      const updatedRequest = await storage.respondToFriendRequest(requestId, status);

      if (action === 'accept') {
        // Add both users as friends (bidirectional)
        await storage.addFriend({
          userId: request.requesterId,
          friendId: request.addresseeId,
          status: 'accepted',
        });
        await storage.addFriend({
          userId: request.addresseeId,
          friendId: request.requesterId,
          status: 'accepted',
        });

        // Notify requester that their request was accepted
        const addressee = await storage.getUser(request.addresseeId);
        if (addressee) {
          await sendFriendAcceptedNotification(request.requesterId, addressee.name, addressee.email);
        }
      }

      res.json(updatedRequest);
    } catch (error: any) {
      console.error("Respond to friend request error:", error);
      const errorMessage = error?.message || "Failed to respond to friend request";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Shortcut endpoints for accept/decline from notifications
  app.post("/api/friend-requests/:id/accept", async (req, res) => {
    try {
      const requestId = req.params.id;
      const request = await storage.getFriendRequest(requestId);
      
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({ error: "This request has already been responded to" });
      }

      await storage.respondToFriendRequest(requestId, 'accepted');
      
      // Add both users as friends (bidirectional)
      await storage.addFriend({
        userId: request.requesterId,
        friendId: request.addresseeId,
        status: 'accepted',
      });
      await storage.addFriend({
        userId: request.addresseeId,
        friendId: request.requesterId,
        status: 'accepted',
      });

      // Notify requester that their request was accepted
      const addressee = await storage.getUser(request.addresseeId);
      if (addressee) {
        await sendFriendAcceptedNotification(request.requesterId, addressee.name, addressee.email);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Accept friend request error:", error);
      res.status(500).json({ error: "Failed to accept friend request" });
    }
  });

  app.post("/api/friend-requests/:id/decline", async (req, res) => {
    try {
      const requestId = req.params.id;
      const request = await storage.getFriendRequest(requestId);
      
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({ error: "This request has already been responded to" });
      }

      await storage.respondToFriendRequest(requestId, 'rejected');
      res.json({ success: true });
    } catch (error: any) {
      console.error("Decline friend request error:", error);
      res.status(500).json({ error: "Failed to decline friend request" });
    }
  });

  // Cancel outgoing friend request (POST version for easier client use)
  app.post("/api/friend-requests/:id/cancel", async (req, res) => {
    try {
      const { userId } = req.body;
      const requestId = req.params.id;

      const request = await storage.getFriendRequest(requestId);
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (request.requesterId !== userId) {
        return res.status(403).json({ error: "Not authorized to cancel this request" });
      }

      // Delete the friend request
      await storage.respondToFriendRequest(requestId, 'cancelled');
      
      // Also delete the notification for the addressee
      try {
        await storage.deleteNotificationByData(request.addresseeId, 'friend_request', request.requesterId);
      } catch (notifError) {
        console.error("Failed to delete notification:", notifError);
        // Don't fail the whole request if notification deletion fails
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Cancel friend request error:", error);
      const errorMessage = error?.message || "Failed to cancel friend request";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Cancel outgoing friend request (DELETE version - kept for backwards compatibility)
  app.delete("/api/friend-requests/:id", async (req, res) => {
    try {
      const { userId } = req.body;
      const requestId = req.params.id;

      const request = await storage.getFriendRequest(requestId);
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (request.requesterId !== userId) {
        return res.status(403).json({ error: "Not authorized to cancel this request" });
      }

      await storage.respondToFriendRequest(requestId, 'cancelled');
      res.json({ success: true });
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to cancel friend request";
      res.status(500).json({ error: errorMessage });
    }
  });

  // =============================================
  // ADMIN: AI Coach Configuration Endpoints
  // =============================================

  // Middleware to check admin status
  const requireAdmin = async (req: any, res: any, next: any) => {
    const userId = req.headers['x-user-id'] || req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = await storage.getUser(userId);
    if (!user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.adminUser = user;
    next();
  };

  // Check if user is admin
  app.get("/api/admin/check", async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.json({ isAdmin: false });
      }
      const user = await storage.getUser(userId);
      res.json({ isAdmin: user?.isAdmin || false });
    } catch (error) {
      res.json({ isAdmin: false });
    }
  });

  // AI Coach Description
  app.get("/api/admin/ai-config/description", requireAdmin, async (req, res) => {
    try {
      const description = await storage.getAiCoachDescription();
      res.json(description || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to get description" });
    }
  });

  app.put("/api/admin/ai-config/description", requireAdmin, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "Content is required" });
      }
      const description = await storage.upsertAiCoachDescription(content);
      res.json(description);
    } catch (error) {
      res.status(500).json({ error: "Failed to update description" });
    }
  });

  // AI Coach Instructions
  app.get("/api/admin/ai-config/instructions", requireAdmin, async (req, res) => {
    try {
      const instructions = await storage.getAiCoachInstructions();
      res.json(instructions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get instructions" });
    }
  });

  app.post("/api/admin/ai-config/instructions", requireAdmin, async (req, res) => {
    try {
      const data = insertAiCoachInstructionSchema.parse(req.body);
      const instruction = await storage.createAiCoachInstruction(data);
      res.status(201).json(instruction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create instruction" });
    }
  });

  app.put("/api/admin/ai-config/instructions/:id", requireAdmin, async (req, res) => {
    try {
      const instruction = await storage.updateAiCoachInstruction(req.params.id, req.body);
      if (!instruction) {
        return res.status(404).json({ error: "Instruction not found" });
      }
      res.json(instruction);
    } catch (error) {
      res.status(500).json({ error: "Failed to update instruction" });
    }
  });

  app.delete("/api/admin/ai-config/instructions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteAiCoachInstruction(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete instruction" });
    }
  });

  // AI Coach Knowledge Base
  app.get("/api/admin/ai-config/knowledge", requireAdmin, async (req, res) => {
    try {
      const knowledge = await storage.getAiCoachKnowledge();
      res.json(knowledge);
    } catch (error) {
      res.status(500).json({ error: "Failed to get knowledge" });
    }
  });

  app.post("/api/admin/ai-config/knowledge", requireAdmin, async (req, res) => {
    try {
      const data = insertAiCoachKnowledgeSchema.parse(req.body);
      const knowledge = await storage.createAiCoachKnowledge(data);
      res.status(201).json(knowledge);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create knowledge" });
    }
  });

  app.put("/api/admin/ai-config/knowledge/:id", requireAdmin, async (req, res) => {
    try {
      const knowledge = await storage.updateAiCoachKnowledge(req.params.id, req.body);
      if (!knowledge) {
        return res.status(404).json({ error: "Knowledge not found" });
      }
      res.json(knowledge);
    } catch (error) {
      res.status(500).json({ error: "Failed to update knowledge" });
    }
  });

  app.delete("/api/admin/ai-config/knowledge/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteAiCoachKnowledge(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete knowledge" });
    }
  });

  // AI Coach FAQ
  app.get("/api/admin/ai-config/faqs", requireAdmin, async (req, res) => {
    try {
      const faqs = await storage.getAiCoachFaqs();
      res.json(faqs);
    } catch (error) {
      res.status(500).json({ error: "Failed to get FAQs" });
    }
  });

  app.post("/api/admin/ai-config/faqs", requireAdmin, async (req, res) => {
    try {
      const data = insertAiCoachFaqSchema.parse(req.body);
      const faq = await storage.createAiCoachFaq(data);
      res.status(201).json(faq);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create FAQ" });
    }
  });

  app.put("/api/admin/ai-config/faqs/:id", requireAdmin, async (req, res) => {
    try {
      const faq = await storage.updateAiCoachFaq(req.params.id, req.body);
      if (!faq) {
        return res.status(404).json({ error: "FAQ not found" });
      }
      res.json(faq);
    } catch (error) {
      res.status(500).json({ error: "Failed to update FAQ" });
    }
  });

  app.delete("/api/admin/ai-config/faqs/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteAiCoachFaq(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete FAQ" });
    }
  });

  // Admin endpoint to re-geocode all route locations with street + city format
  app.post("/api/admin/routes/reprocess-locations", requireAdmin, async (req, res) => {
    try {
      const allRoutes = await storage.getAllRoutes();
      let updated = 0;
      let failed = 0;

      for (const route of allRoutes) {
        if (!route.startLat || !route.startLng) {
          failed++;
          continue;
        }

        try {
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${route.startLat},${route.startLng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
          const geocodeRes = await fetch(geocodeUrl);
          const geocodeData = await geocodeRes.json();
          
          let startLocationLabel = "Unknown Location";
          if (geocodeData.results && geocodeData.results.length > 0) {
            const components = geocodeData.results[0].address_components;
            const streetNumber = components?.find((c: any) => c.types.includes('street_number'))?.long_name;
            const streetRoute = components?.find((c: any) => c.types.includes('route'))?.long_name;
            const locality = components?.find((c: any) => c.types.includes('locality'))?.long_name;
            const sublocality = components?.find((c: any) => c.types.includes('sublocality'))?.long_name;
            
            const streetPart = streetNumber && streetRoute ? `${streetNumber} ${streetRoute}` : streetRoute || "";
            const cityPart = locality || sublocality || "";
            
            if (streetPart && cityPart) {
              startLocationLabel = `${streetPart}, ${cityPart}`;
            } else if (streetPart) {
              startLocationLabel = streetPart;
            } else if (cityPart) {
              startLocationLabel = cityPart;
            } else {
              startLocationLabel = geocodeData.results[0].formatted_address?.split(',').slice(0, 2).join(',') || "Unknown Location";
            }
          }

          await storage.updateRoute(route.id, { startLocationLabel });
          updated++;
          
          // Rate limit to avoid hitting Google API limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`Failed to re-geocode route ${route.id}:`, err);
          failed++;
        }
      }

      res.json({ success: true, updated, failed, total: allRoutes.length });
    } catch (error) {
      console.error("Failed to reprocess locations:", error);
      res.status(500).json({ error: "Failed to reprocess locations" });
    }
  });

  // Stripe subscription routes
  app.get("/api/stripe/products", async (req, res) => {
    try {
      const { stripeService } = await import("./stripeService");
      const products = await stripeService.listProductsWithPrices();
      res.json(products);
    } catch (error) {
      console.error("Failed to get products:", error);
      res.status(500).json({ error: "Failed to get products" });
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const { getStripePublishableKey } = await import("./stripeClient");
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      console.error("Failed to get publishable key:", error);
      res.status(500).json({ error: "Failed to get publishable key" });
    }
  });

  app.post("/api/stripe/create-checkout-session", async (req, res) => {
    try {
      const { priceId, userId } = req.body;
      if (!priceId || !userId) {
        return res.status(400).json({ error: "Missing priceId or userId" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { stripeService } = await import("./stripeService");

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.email, userId, user.name);
        customerId = customer.id;
        await storage.updateUser(userId, { stripeCustomerId: customerId });
      }

      // Create checkout session
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}`;
      
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        `${baseUrl}/pricing`,
        userId
      );

      res.json({ sessionUrl: session.url });
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/create-portal-session", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.stripeCustomerId) {
        return res.status(404).json({ error: "No subscription found" });
      }

      const { stripeService } = await import("./stripeService");

      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}`;

      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        `${baseUrl}/home`
      );

      res.json({ portalUrl: session.url });
    } catch (error) {
      console.error("Failed to create portal session:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  app.get("/api/stripe/subscription/:userId", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.stripeCustomerId) {
        return res.json({ subscription: null, tier: null, status: null });
      }

      const { stripeService } = await import("./stripeService");
      const subscriptions = await stripeService.getCustomerSubscriptions(user.stripeCustomerId);
      
      if (subscriptions.length === 0) {
        return res.json({ subscription: null, tier: user.subscriptionTier, status: user.subscriptionStatus });
      }

      res.json({ 
        subscription: subscriptions[0], 
        tier: user.subscriptionTier,
        status: user.subscriptionStatus
      });
    } catch (error) {
      console.error("Failed to get subscription:", error);
      res.status(500).json({ error: "Failed to get subscription" });
    }
  });

  // Get all AI config (for coaching calls - no admin check)
  app.get("/api/ai-config/all", async (req, res) => {
    try {
      const [description, instructions, knowledge, faqs] = await Promise.all([
        storage.getAiCoachDescription(),
        storage.getAiCoachInstructions(),
        storage.getAiCoachKnowledge(),
        storage.getAiCoachFaqs()
      ]);
      res.json({
        description: description?.content || null,
        instructions: instructions.filter(i => i.isActive),
        knowledge: knowledge.filter(k => k.isActive),
        faqs: faqs.filter(f => f.isActive)
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get AI config" });
    }
  });

  return httpServer;
}

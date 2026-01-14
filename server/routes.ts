import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertPreRegistrationSchema, insertUserSchema, insertRouteSchema, insertRunSchema, 
  insertLiveRunSessionSchema, insertPushSubscriptionSchema,
  insertAiCoachDescriptionSchema, insertAiCoachInstructionSchema, 
  insertAiCoachKnowledgeSchema, insertAiCoachFaqSchema, insertGoalSchema
} from "@shared/schema";
import { z } from "zod";
import { generateRoute, getCoachingAdvice, analyzeRunPerformance, generateTTS, calculateAge, analyzeCadence, generateDynamicPaceCoaching, type CoachTone, type TTSVoice, type AiCoachConfig } from "./openai";
import { generateCircularRoute, generateMultipleRoutes, isGoogleMapsConfigured } from "./routePlanner";
import { generateAIRoutes } from "./aiRoutePlanner";
import bcrypt from "bcryptjs";
import { initializePushNotifications, isPushConfigured, getPublicVapidKey, sendFriendRequestNotification, sendFriendAcceptedNotification, sendGroupRunInviteNotification, sendGroupRunAcceptedNotification, sendLiveRunInviteNotification, sendLiveObserverJoinedNotification } from "./pushNotifications";
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
      const userId = req.query.userId as string | undefined;
      const routes = await storage.getRecentRoutes(limit, userId);
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

      // Server-side entitlement check for defense in depth
      if (userId) {
        const user = await storage.getUser(userId);
        if (user) {
          const { hasPremiumAccess } = await import("./entitlements");
          if (!hasPremiumAccess(user)) {
            return res.status(403).json({ 
              error: "Premium access required to generate AI routes",
              code: "PREMIUM_REQUIRED"
            });
          }
        }
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
          const routeTurnInstructions = (route as any).turnInstructions || null;
          console.log(`[Route API] Route ${route.routeName} has ${routeTurnInstructions?.length || 0} turn instructions`);
          
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
            turnInstructions: routeTurnInstructions,
          });
          console.log(`[Route API] Saved route ${savedRoute.id}, turnInstructions saved: ${savedRoute.turnInstructions ? 'YES' : 'NO'}`);
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
      const { sessionKey, ...runData } = req.body;
      const data = insertRunSchema.parse(runData);
      const run = await storage.createRun(data);
      
      // Link any AI coaching logs from this session to the completed run
      if (sessionKey && run.id) {
        try {
          await storage.updateAiCoachingLogsRunId(sessionKey, run.id);
        } catch (logErr) {
          console.warn("Failed to link coaching logs to run:", logErr);
        }
      }
      
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
      
      const requestingUserId = req.query.userId as string;
      
      // Require userId for authorization
      if (!requestingUserId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const isOwner = run.userId === requestingUserId;
      
      // Check if requester is admin
      const requester = await storage.getUser(requestingUserId);
      const isAdmin = requester?.isAdmin || false;
      
      // If not owner and not admin, check if they're friends
      if (!isOwner && !isAdmin) {
        const isFriend = await storage.areFriends(requestingUserId, run.userId);
        if (!isFriend) {
          return res.status(403).json({ error: "Not authorized to view this run" });
        }
        
        // Friend can view run, but strip ALL AI-related fields
        const { aiCoachingNotes, aiInsights, ...runWithoutAI } = run;
        return res.json(runWithoutAI);
      }
      
      res.json(run);
    } catch (error) {
      res.status(500).json({ error: "Failed to get run" });
    }
  });

  // Get saved AI analysis for a run
  app.get("/api/runs/:id/analysis", async (req, res) => {
    try {
      const runId = req.params.id;
      const userId = req.query.userId as string;
      
      // Require userId for authorization
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Get the run to verify ownership
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      // Check if requester is owner or admin
      const isOwner = run.userId === userId;
      const requester = await storage.getUser(userId);
      const isAdmin = requester?.isAdmin || false;
      
      // Only owner or admin can view AI analysis - friends cannot
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Not authorized to view this analysis" });
      }
      
      // Try to get from run_analyses table first
      const savedAnalysis = await storage.getRunAnalysis(runId);
      if (savedAnalysis) {
        return res.json({
          highlights: savedAnalysis.highlights || [],
          struggles: savedAnalysis.struggles || [],
          personalBests: savedAnalysis.personalBests || [],
          demographicComparison: savedAnalysis.demographicComparison || '',
          coachingTips: savedAnalysis.coachingTips || [],
          overallAssessment: savedAnalysis.overallAssessment || '',
          weatherImpact: savedAnalysis.weatherImpact || '',
          warmUpAnalysis: savedAnalysis.warmUpAnalysis || '',
          goalProgress: savedAnalysis.goalProgress || '',
          cached: true
        });
      }
      
      // Fall back to aiCoachingNotes in runs table (legacy data)
      if (run.aiCoachingNotes && typeof run.aiCoachingNotes === 'object') {
        const notes = run.aiCoachingNotes as any;
        if (notes.highlights && notes.coachingTips) {
          return res.json({ ...notes, cached: true });
        }
      }
      
      // No analysis found
      return res.status(404).json({ error: "No analysis found for this run" });
    } catch (error) {
      console.error("Get run analysis error:", error);
      res.status(500).json({ error: "Failed to get run analysis" });
    }
  });

  // Generate AI analysis for a run
  app.post("/api/runs/:id/analysis", async (req, res) => {
    try {
      const runId = req.params.id;
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      
      // Get the run
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      // Verify ownership
      if (run.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to analyze this run" });
      }
      
      // Check for forceRegenerate flag (to allow regeneration if needed)
      const { forceRegenerate } = req.body;
      
      if (!forceRegenerate) {
        // Check if we already have AI analysis stored in run_analyses table
        const savedAnalysis = await storage.getRunAnalysis(runId);
        if (savedAnalysis && savedAnalysis.highlights && savedAnalysis.coachingTips) {
          return res.json({
            highlights: savedAnalysis.highlights || [],
            struggles: savedAnalysis.struggles || [],
            personalBests: savedAnalysis.personalBests || [],
            demographicComparison: savedAnalysis.demographicComparison || '',
            coachingTips: savedAnalysis.coachingTips || [],
            overallAssessment: savedAnalysis.overallAssessment || '',
            weatherImpact: savedAnalysis.weatherImpact || '',
            warmUpAnalysis: savedAnalysis.warmUpAnalysis || '',
            goalProgress: savedAnalysis.goalProgress || '',
            cached: true
          });
        }
        
        // Fall back to legacy aiCoachingNotes in runs table
        if (run.aiCoachingNotes && typeof run.aiCoachingNotes === 'object') {
          const notes = run.aiCoachingNotes as any;
          if (notes.highlights && notes.coachingTips) {
            return res.json({ ...notes, cached: true });
          }
        }
      }
      
      // Get user profile (excluding sensitive data)
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Calculate age from DOB if available
      let userAge: number | undefined;
      if (user.dob) {
        const { calculateAge } = await import('./openai');
        userAge = calculateAge(user.dob);
      }
      
      // Get previous runs on the same route for comparison
      let previousRuns: any[] = [];
      if (run.routeId) {
        const routeRuns = await storage.getUserRunsByRoute(userId, run.routeId, 10);
        // Filter out the current run
        previousRuns = routeRuns
          .filter(r => r.id !== runId)
          .map(r => ({
            distance: r.distance,
            duration: r.duration,
            avgPace: r.avgPace || '',
            completedAt: r.completedAt?.toISOString()
          }));
      }
      
      // Get the route for elevation data
      let elevationGain: number | undefined;
      let elevationLoss: number | undefined;
      let elevationProfile: any[] | undefined;
      if (run.routeId) {
        const route = await storage.getRoute(run.routeId);
        if (route) {
          elevationGain = route.elevationGain || undefined;
          elevationLoss = route.elevationLoss || undefined;
          elevationProfile = route.elevationProfile as any[] || undefined;
        }
      }
      
      // Build telemetry summary from GPS track and other data
      const { generateComprehensiveRunAnalysis, buildTelemetrySummary } = await import('./openai');
      const telemetrySummary = buildTelemetrySummary(
        run.gpsTrack as any[] || [],
        run.paceData as any[] || undefined,
        elevationProfile,
        40 // Target 40 data points for cost efficiency
      );
      
      // Fetch user's active goals for goal-aware analysis
      const userGoals = await storage.getUserGoals(userId);
      const activeGoals = userGoals
        .filter((g: any) => g.status === 'active')
        .map((g: any) => ({
          type: g.type,
          title: g.title,
          description: g.description,
          targetDate: g.targetDate?.toISOString(),
          distanceTarget: g.distanceTarget,
          timeTargetSeconds: g.timeTargetSeconds,
          eventName: g.eventName,
          weeklyRunTarget: g.weeklyRunTarget,
          progressPercent: g.progressPercent
        }));
      
      // Prepare analysis request
      const analysis = await generateComprehensiveRunAnalysis({
        run: {
          id: runId,
          distance: run.distance,
          duration: run.duration,
          avgPace: run.avgPace || '',
          avgHeartRate: run.avgHeartRate || undefined,
          maxHeartRate: run.maxHeartRate || undefined,
          calories: run.calories || undefined,
          cadence: run.cadence || undefined,
          difficulty: run.difficulty || undefined,
          kmSplits: run.paceData as any || undefined,
          elevationGain,
          elevationLoss,
          weatherData: run.weatherData as any || undefined,
          telemetry: telemetrySummary || undefined
        },
        user: {
          age: userAge,
          gender: user.gender || undefined,
          height: user.height || undefined,
          weight: user.weight || undefined,
          fitnessLevel: user.fitnessLevel || undefined,
          desiredFitnessLevel: user.desiredFitnessLevel || undefined
        },
        previousRuns,
        goals: activeGoals.length > 0 ? activeGoals : undefined
      });
      
      // Store the analysis in run_analyses table for persistent retrieval
      await storage.upsertRunAnalysis({
        runId,
        highlights: analysis.highlights || [],
        struggles: analysis.struggles || [],
        personalBests: analysis.personalBests || [],
        demographicComparison: analysis.demographicComparison || '',
        coachingTips: analysis.coachingTips || [],
        overallAssessment: analysis.overallAssessment || '',
        weatherImpact: analysis.weatherImpact || '',
        warmUpAnalysis: analysis.warmUpAnalysis || '',
        goalProgress: analysis.goalProgress || '',
      });
      
      // Also update legacy aiCoachingNotes for backwards compatibility
      await storage.updateRun(runId, {
        aiCoachingNotes: analysis as any
      });
      
      res.json(analysis);
    } catch (error) {
      console.error("Run analysis error:", error);
      res.status(500).json({ error: "Failed to generate run analysis" });
    }
  });

  // Get telemetry data for a run (for charts)
  app.get("/api/runs/:id/telemetry", async (req, res) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const gpsTrack = run.gpsTrack as Array<{ lat: number; lng: number; timestamp?: number; altitude?: number; altitudeAccuracy?: number; heartRate?: number; cadence?: number }> | null;
      const paceData = run.paceData as Array<{ km: number; pace: string; paceSeconds: number; cumulativeTime: number }> | null;
      
      if (!gpsTrack || gpsTrack.length < 5) {
        return res.json({ telemetry: null, message: "Insufficient GPS data for telemetry" });
      }
      
      // Get elevation profile from route if available
      let elevationProfile: Array<{ distance: number; elevation: number; grade?: number }> | undefined;
      if (run.routeId) {
        const route = await storage.getRoute(run.routeId);
        if (route?.elevation && typeof route.elevation === 'object' && 'profile' in route.elevation) {
          elevationProfile = (route.elevation as any).profile;
        }
      }
      
      const { buildTelemetrySummary } = await import('./openai');
      const telemetry = buildTelemetrySummary(gpsTrack, paceData || undefined, elevationProfile);
      
      res.json({ telemetry, distance: run.distance, duration: run.duration });
    } catch (error) {
      console.error("Telemetry fetch error:", error);
      res.status(500).json({ error: "Failed to get run telemetry" });
    }
  });

  // Get AI coaching logs for a run (admin only)
  app.get("/api/runs/:id/coaching-logs", async (req, res) => {
    try {
      const runId = req.params.id;
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }
      
      // Get the run to verify it exists and check ownership
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      // Allow run owner OR admin to view logs
      const user = await storage.getUser(userId);
      if (run.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const logs = await storage.getAiCoachingLogsByRun(runId);
      res.json(logs);
    } catch (error) {
      console.error("Get coaching logs error:", error);
      res.status(500).json({ error: "Failed to get coaching logs" });
    }
  });

  // Create AI coaching log during a run session
  app.post("/api/coaching-logs", async (req, res) => {
    try {
      const { userId, sessionKey, eventType, elapsedSeconds, distanceKm, currentPace, heartRate, cadence, terrain, weather, prompt, response, responseText, topic, model, tokenCount, latencyMs } = req.body;
      
      if (!userId || !sessionKey || !eventType) {
        return res.status(400).json({ error: "userId, sessionKey, and eventType are required" });
      }
      
      const log = await storage.createAiCoachingLog({
        userId,
        sessionKey,
        eventType,
        elapsedSeconds,
        distanceKm,
        currentPace,
        heartRate,
        cadence,
        terrain,
        weather,
        prompt,
        response,
        responseText,
        topic,
        model,
        tokenCount,
        latencyMs,
      });
      
      res.json(log);
    } catch (error) {
      console.error("Create coaching log error:", error);
      res.status(500).json({ error: "Failed to create coaching log" });
    }
  });

  // Link session coaching logs to a completed run
  app.post("/api/coaching-logs/link-to-run", async (req, res) => {
    try {
      const { sessionKey, runId, userId } = req.body;
      
      if (!sessionKey || !runId || !userId) {
        return res.status(400).json({ error: "sessionKey, runId, and userId are required" });
      }
      
      // Verify the run exists and belongs to the user
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Update all logs with this session key to have the run ID
      await storage.updateAiCoachingLogsRunId(sessionKey, runId);
      res.json({ success: true });
    } catch (error) {
      console.error("Link coaching logs error:", error);
      res.status(500).json({ error: "Failed to link coaching logs" });
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

  app.delete("/api/runs/:id", async (req, res) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      // Verify the requesting user owns this run
      const requestingUserId = req.query.userId as string;
      if (requestingUserId && run.userId !== requestingUserId) {
        return res.status(403).json({ error: "Not authorized to delete this run" });
      }
      await storage.deleteRun(req.params.id);
      res.json({ success: true, message: "Run deleted successfully" });
    } catch (error) {
      console.error("Delete run error:", error);
      res.status(500).json({ error: "Failed to delete run" });
    }
  });

  // Run Weakness Events endpoints
  app.get("/api/runs/:id/weakness-events", async (req, res) => {
    try {
      const events = await storage.getRunWeaknessEvents(req.params.id);
      res.json(events);
    } catch (error) {
      console.error("Get weakness events error:", error);
      res.status(500).json({ error: "Failed to get weakness events" });
    }
  });

  app.post("/api/runs/:id/weakness-events", async (req, res) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      const eventData = {
        ...req.body,
        runId: req.params.id,
        userId: run.userId,
      };
      const event = await storage.createRunWeaknessEvent(eventData);
      res.json(event);
    } catch (error) {
      console.error("Create weakness event error:", error);
      res.status(500).json({ error: "Failed to create weakness event" });
    }
  });

  app.post("/api/runs/:id/weakness-events/bulk", async (req, res) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      const { events } = req.body;
      if (!Array.isArray(events)) {
        return res.status(400).json({ error: "Events must be an array" });
      }
      const createdEvents = await Promise.all(
        events.map(event => storage.createRunWeaknessEvent({
          ...event,
          runId: req.params.id,
          userId: run.userId,
        }))
      );
      res.json(createdEvents);
    } catch (error) {
      console.error("Create bulk weakness events error:", error);
      res.status(500).json({ error: "Failed to create weakness events" });
    }
  });

  app.patch("/api/weakness-events/:id", async (req, res) => {
    try {
      const { causeTag, causeNote } = req.body;
      const event = await storage.updateWeaknessEventCause(req.params.id, causeTag ?? null, causeNote ?? null);
      if (!event) {
        return res.status(404).json({ error: "Weakness event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Update weakness event error:", error);
      res.status(500).json({ error: "Failed to update weakness event" });
    }
  });

  app.delete("/api/weakness-events/:id", async (req, res) => {
    try {
      await storage.deleteRunWeaknessEvent(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete weakness event error:", error);
      res.status(500).json({ error: "Failed to delete weakness event" });
    }
  });

  app.get("/api/users/:userId/weakness-history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getUserWeaknessHistory(req.params.userId, limit);
      res.json(events);
    } catch (error) {
      console.error("Get user weakness history error:", error);
      res.status(500).json({ error: "Failed to get weakness history" });
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

  app.put("/api/live-sessions/sync", async (req, res) => {
    try {
      const { sessionKey, userId, distanceKm, elapsedSeconds, currentPace, cadence, difficulty, gpsTrack, kmSplits, routeId } = req.body;
      if (!sessionKey || typeof sessionKey !== 'string') {
        return res.status(400).json({ error: "sessionKey is required" });
      }
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: "userId is required" });
      }
      
      const session = await storage.upsertLiveSession(sessionKey, userId, {
        distanceCovered: typeof distanceKm === 'number' ? distanceKm : 0,
        elapsedTime: typeof elapsedSeconds === 'number' ? elapsedSeconds : 0,
        currentPace: typeof currentPace === 'string' ? currentPace : null,
        cadence: typeof cadence === 'number' ? cadence : null,
        difficulty: typeof difficulty === 'string' ? difficulty : 'beginner',
        gpsTrack: Array.isArray(gpsTrack) ? gpsTrack : [],
        kmSplits: Array.isArray(kmSplits) ? kmSplits : [],
        routeId: typeof routeId === 'string' ? routeId : null,
      });
      res.json(session);
    } catch (error) {
      console.error("Failed to sync live session:", error);
      res.status(500).json({ error: "Failed to sync session" });
    }
  });

  app.post("/api/live-sessions/end-by-key", async (req, res) => {
    try {
      const { sessionKey, userId } = req.body;
      if (!sessionKey || !userId) {
        return res.status(400).json({ error: "sessionKey and userId are required" });
      }
      await storage.endLiveSessionByKey(sessionKey, userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  app.get("/api/live-sessions/recoverable/:userId", async (req, res) => {
    try {
      const session = await storage.getRecoverableLiveSession(req.params.userId);
      res.json(session || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to check for recoverable session" });
    }
  });

  // Live run observer invite endpoint - notify friend when invited to watch
  app.post("/api/live-sessions/:sessionId/invite-observer", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { runnerId, friendId } = req.body;
      
      if (!runnerId || !friendId) {
        return res.status(400).json({ error: "runnerId and friendId are required" });
      }
      
      // Verify runner exists
      const runner = await storage.getUser(runnerId);
      if (!runner) {
        return res.status(404).json({ error: "Runner not found" });
      }
      
      // Verify friend exists
      const friend = await storage.getUser(friendId);
      if (!friend) {
        return res.status(404).json({ error: "Friend not found" });
      }
      
      // Verify they are actually friends (bidirectional check)
      const runnerFriends = await storage.getFriends(runnerId);
      const isFriend = runnerFriends.some(f => f.friendId === friendId);
      if (!isFriend) {
        return res.status(403).json({ error: "Users are not friends" });
      }
      
      // Send notification to friend
      await sendLiveRunInviteNotification(
        friendId,
        runner.name,
        runnerId,
        sessionId
      );
      
      res.json({ success: true, message: "Observer invite notification sent" });
    } catch (error) {
      console.error("Failed to send live run invite:", error);
      res.status(500).json({ error: "Failed to send invite notification" });
    }
  });

  // Live run observer join endpoint - notify runner when friend starts watching
  app.post("/api/live-sessions/:sessionId/observer-joined", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { runnerId, observerId } = req.body;
      
      if (!runnerId || !observerId) {
        return res.status(400).json({ error: "runnerId and observerId are required" });
      }
      
      // Verify runner exists
      const runner = await storage.getUser(runnerId);
      if (!runner) {
        return res.status(404).json({ error: "Runner not found" });
      }
      
      // Verify observer exists
      const observer = await storage.getUser(observerId);
      if (!observer) {
        return res.status(404).json({ error: "Observer not found" });
      }
      
      // Verify they are actually friends (observer should be friend of runner)
      const runnerFriends = await storage.getFriends(runnerId);
      const isFriend = runnerFriends.some(f => f.friendId === observerId);
      if (!isFriend) {
        return res.status(403).json({ error: "Users are not friends" });
      }
      
      // Send notification to runner
      await sendLiveObserverJoinedNotification(
        runnerId,
        observer.name,
        observerId,
        sessionId
      );
      
      res.json({ success: true, message: "Observer joined notification sent" });
    } catch (error) {
      console.error("Failed to send observer joined notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
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
            userCode: friendUser?.userCode || null,
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

  // Get public profile for a friend (limited data)
  app.get("/api/users/:id/public-profile", async (req, res) => {
    try {
      const userId = req.params.id;
      const requesterId = req.query.requesterId as string;
      
      if (!requesterId) {
        return res.status(400).json({ error: "requesterId is required" });
      }
      
      // Verify they are friends
      const areFriends = await storage.areFriends(requesterId, userId);
      if (!areFriends) {
        return res.status(403).json({ error: "Not authorized to view this profile" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Return limited public profile data
      res.json({
        id: user.id,
        name: user.name,
        userCode: user.userCode,
        profilePic: user.profilePic,
        fitnessLevel: user.fitnessLevel,
      });
    } catch (error) {
      console.error("Get public profile error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  });

  // Get friend's runs (with privacy filtering - no AI insights)
  app.get("/api/users/:id/runs", async (req, res) => {
    try {
      const userId = req.params.id;
      const requesterId = req.query.requesterId as string;
      
      if (!requesterId) {
        return res.status(400).json({ error: "requesterId is required" });
      }
      
      // Verify they are friends
      const areFriends = await storage.areFriends(requesterId, userId);
      if (!areFriends) {
        return res.status(403).json({ error: "Not authorized to view these runs" });
      }
      
      const runs = await storage.getUserRuns(userId);
      
      // Return runs without sensitive AI analysis data
      const publicRuns = runs.map(run => ({
        id: run.id,
        distance: run.distance,
        duration: run.duration,
        avgPace: run.avgPace,
        difficulty: run.difficulty,
        completedAt: run.completedAt,
        name: run.name,
        elevation: run.elevation,
        startLat: run.startLat,
        startLng: run.startLng,
        gpsTrack: run.gpsTrack,
        paceData: run.paceData,
        weatherData: run.weatherData,
        cadence: run.cadence,
        avgHeartRate: run.avgHeartRate,
        maxHeartRate: run.maxHeartRate,
        calories: run.calories,
        // Explicitly exclude: aiInsights, aiCoachingNotes
      }));
      
      res.json(publicRuns);
    } catch (error) {
      console.error("Get friend runs error:", error);
      res.status(500).json({ error: "Failed to get runs" });
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
        recentCoachingTopics, paceChange, currentKm, progressPercent, milestones, kmSplitTimes, terrain, weather,
        userId, sessionKey, cadence
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

      // Fetch user's weakness history for personalized coaching
      let weaknessHistory: Array<{
        causeTag: string | null;
        causeNote: string | null;
        distanceKm: number;
        dropPercent: number;
        count: number;
      }> | undefined;
      
      if (userId) {
        try {
          const events = await storage.getUserWeaknessHistory(userId, 30);
          if (events.length > 0) {
            // Aggregate weakness events by cause tag
            const tagMap = new Map<string | null, { distanceSum: number; dropSum: number; count: number; notes: Set<string> }>();
            for (const event of events) {
              const key = event.causeTag;
              const existing = tagMap.get(key) || { distanceSum: 0, dropSum: 0, count: 0, notes: new Set<string>() };
              existing.distanceSum += event.startDistanceKm;
              existing.dropSum += event.dropPercent;
              existing.count += 1;
              if (event.causeNote) existing.notes.add(event.causeNote);
              tagMap.set(key, existing);
            }
            
            // Convert to array and sort by average distance for context ordering
            weaknessHistory = Array.from(tagMap.entries())
              .map(([causeTag, data]) => ({
                causeTag,
                causeNote: data.notes.size > 0 ? Array.from(data.notes).slice(0, 3).join('; ') : null,
                distanceKm: data.distanceSum / data.count,
                dropPercent: data.dropSum / data.count,
                count: data.count
              }))
              .sort((a, b) => a.distanceKm - b.distanceKm);
          }
        } catch (err) {
          console.warn("Failed to fetch weakness history for coaching:", err);
        }
      }

      const coachingRequest = {
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
        recentCoachingTopics,
        paceChange,
        currentKm,
        progressPercent,
        milestones,
        kmSplitTimes,
        terrain,
        weather,
        weaknessHistory
      };

      const startTime = Date.now();
      const advice = await getCoachingAdvice(coachingRequest);
      const latencyMs = Date.now() - startTime;

      if (userId && sessionKey) {
        try {
          const promptSummary = JSON.stringify({
            currentPace,
            targetPace,
            heartRate,
            elapsedTime,
            distanceCovered,
            totalDistance,
            difficulty,
            terrain: terrain ? { grade: terrain.currentGrade, altitude: terrain.currentAltitude } : null,
            weather: weather ? { temp: weather.temperature, condition: weather.condition } : null,
            paceChange,
            currentKm,
            milestones,
            userMessage
          });

          await storage.createAiCoachingLog({
            userId,
            sessionKey,
            eventType: 'coaching',
            elapsedSeconds: Math.round(elapsedTime),
            distanceKm: distanceCovered,
            currentPace,
            heartRate,
            cadence,
            terrain: terrain || null,
            weather: weather || null,
            prompt: promptSummary,
            response: advice,
            responseText: advice.message,
            topic: advice.topic || null,
            model: 'gpt-4o',
            latencyMs
          });
        } catch (logErr) {
          console.warn("Failed to log AI coaching interaction:", logErr);
        }
      }

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
        weather, coachName, userName, includeAiConfig, firstTurnInstruction
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
        aiConfig,
        firstTurnInstruction
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

  // AI Cadence Analysis endpoint
  app.post("/api/ai/analyze-cadence", async (req, res) => {
    try {
      const { heightCm, paceMinPerKm, cadenceSpm, distanceKm, userFitnessLevel, userAge } = req.body;
      
      if (!heightCm || !paceMinPerKm || !cadenceSpm) {
        return res.status(400).json({ error: "Missing required data: heightCm, paceMinPerKm, cadenceSpm" });
      }

      const analysis = await analyzeCadence({
        heightCm: parseFloat(heightCm),
        paceMinPerKm: parseFloat(paceMinPerKm),
        cadenceSpm: parseFloat(cadenceSpm),
        distanceKm: distanceKm ? parseFloat(distanceKm) : undefined,
        userFitnessLevel,
        userAge: userAge ? parseInt(userAge) : undefined
      });

      res.json(analysis);
    } catch (error) {
      console.error("Cadence analysis error:", error);
      res.status(500).json({ error: "Failed to analyze cadence" });
    }
  });

  // Historic pace endpoint - get average pace from similar distance runs
  app.post("/api/ai/historic-pace", async (req, res) => {
    try {
      const { userId, targetDistance } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      
      const runs = await storage.getUserRuns(userId);
      
      if (!runs || runs.length === 0) {
        return res.json({ avgPace: null, runCount: 0, message: "No run history available" });
      }
      
      // Filter runs to similar distance (within 30% of target, or all runs if no target)
      const targetKm = targetDistance ? parseFloat(targetDistance) : 0;
      let similarRuns = runs;
      
      if (targetKm > 0) {
        const minDist = targetKm * 0.7;
        const maxDist = targetKm * 1.3;
        similarRuns = runs.filter(run => {
          const runDist = parseFloat(run.distance || "0");
          return runDist >= minDist && runDist <= maxDist;
        });
      }
      
      // Fall back to all runs if no similar distance runs
      if (similarRuns.length === 0) {
        similarRuns = runs;
      }
      
      // Calculate average pace from runs
      const paces = similarRuns
        .map(run => run.avgPace)
        .filter(pace => pace && pace !== "0:00")
        .map(pace => {
          const [mins, secs] = (pace || "0:00").split(":").map(Number);
          return mins * 60 + secs;
        })
        .filter(secs => secs > 0 && secs < 1800); // Filter out invalid paces (0 or >30min/km)
      
      if (paces.length === 0) {
        return res.json({ avgPace: null, runCount: 0, message: "No valid pace data in run history" });
      }
      
      const avgPaceSeconds = paces.reduce((a, b) => a + b, 0) / paces.length;
      const avgPaceMins = Math.floor(avgPaceSeconds / 60);
      const avgPaceSecs = Math.floor(avgPaceSeconds % 60);
      
      res.json({
        avgPace: `${avgPaceMins}:${avgPaceSecs.toString().padStart(2, '0')}`,
        avgPaceSeconds,
        runCount: paces.length,
        isSimilarDistance: similarRuns !== runs
      });
    } catch (error) {
      console.error("Historic pace error:", error);
      res.status(500).json({ error: "Failed to get historic pace" });
    }
  });

  // Demographic pace suggestion endpoint - AI suggests pace based on user profile
  app.post("/api/ai/demographic-pace", async (req, res) => {
    try {
      const { age, weight, height, fitnessLevel, targetDistance } = req.body;
      
      if (!age || !fitnessLevel) {
        return res.status(400).json({ error: "Missing required fields: age, fitnessLevel" });
      }
      
      // Build a pace estimation based on demographics
      // Base pace estimates by fitness level (min/km)
      const basePaces: Record<string, number> = {
        'beginner': 7.5,      // 7:30/km
        'intermediate': 6.0,  // 6:00/km
        'advanced': 5.0,      // 5:00/km
        'elite': 4.0          // 4:00/km
      };
      
      let basePace = basePaces[fitnessLevel] || 6.5;
      
      // Age adjustment: add ~2 seconds per year over 30, subtract under 30
      const ageNum = parseInt(age);
      if (ageNum > 30) {
        basePace += (ageNum - 30) * 0.033; // ~2 sec per year
      } else if (ageNum < 30 && ageNum > 20) {
        basePace -= (30 - ageNum) * 0.017; // ~1 sec per year
      }
      
      // Weight adjustment if provided (heavier = slightly slower)
      if (weight) {
        const weightNum = parseFloat(weight);
        // Baseline around 70kg
        if (weightNum > 80) {
          basePace += (weightNum - 80) * 0.02;
        } else if (weightNum < 60) {
          basePace -= (60 - weightNum) * 0.01;
        }
      }
      
      // Distance adjustment: longer runs should have slightly slower pace
      if (targetDistance) {
        const distNum = parseFloat(targetDistance);
        if (distNum > 10) {
          basePace += (distNum - 10) * 0.05; // Add 3 sec per km over 10km
        }
      }
      
      // Clamp to reasonable range
      basePace = Math.max(3.5, Math.min(12.0, basePace));
      
      const suggestedPaceMins = Math.floor(basePace);
      const suggestedPaceSecs = Math.round((basePace - suggestedPaceMins) * 60);
      
      res.json({
        suggestedPace: `${suggestedPaceMins}:${suggestedPaceSecs.toString().padStart(2, '0')}`,
        suggestedPaceSeconds: basePace * 60,
        basedOn: {
          fitnessLevel,
          age: ageNum,
          weight: weight ? parseFloat(weight) : null,
          targetDistance: targetDistance ? parseFloat(targetDistance) : null
        }
      });
    } catch (error) {
      console.error("Demographic pace error:", error);
      res.status(500).json({ error: "Failed to calculate demographic pace" });
    }
  });

  // Dynamic AI Pace Coaching endpoint - generates personalized, session-specific advice
  app.post("/api/ai/dynamic-pace-coaching", async (req, res) => {
    try {
      const { 
        currentPaceSecondsPerKm, 
        targetPaceSecondsPerKm, 
        distanceCovered,
        totalDistance,
        elapsedTimeSeconds,
        routeId,
        userId,
        coachTone,
        coachName
      } = req.body;
      
      if (!currentPaceSecondsPerKm || distanceCovered === undefined || !elapsedTimeSeconds) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Gather route elevation data if routeId provided
      let elevationProfile: Array<{ distance: number; elevation: number }> | undefined;
      let routeDifficulty: string | undefined;
      let totalElevationGain: number | undefined;
      
      if (routeId) {
        try {
          const route = await storage.getRoute(routeId);
          if (route) {
            if (route.elevationProfile) {
              elevationProfile = route.elevationProfile as Array<{ distance: number; elevation: number }>;
            }
            routeDifficulty = route.difficulty || undefined;
            totalElevationGain = route.elevationGain ? parseFloat(route.elevationGain.toString()) : undefined;
          }
        } catch (err) {
          console.log('[DynamicPaceCoaching] Failed to load route data:', err);
        }
      }
      
      // Gather user profile and history if userId provided
      let userName: string | undefined;
      let userAge: number | undefined;
      let userFitnessLevel: string | undefined;
      let historicAveragePace: number | undefined;
      let recentRunsCount: number | undefined;
      
      if (userId) {
        try {
          const user = await storage.getUser(userId);
          if (user) {
            userName = user.name || undefined;
            userFitnessLevel = user.fitnessLevel || undefined;
            if (user.dateOfBirth) {
              userAge = calculateAge(user.dateOfBirth);
            }
          }
          
          // Get historical pace data
          const runs = await storage.getUserRuns(userId);
          if (runs && runs.length > 0) {
            const paces = runs
              .map(run => run.avgPace)
              .filter(pace => pace && pace !== "0:00")
              .map(pace => {
                const [mins, secs] = (pace || "0:00").split(":").map(Number);
                return mins * 60 + secs;
              })
              .filter(secs => secs > 0 && secs < 1800);
            
            if (paces.length > 0) {
              historicAveragePace = paces.reduce((a, b) => a + b, 0) / paces.length;
              recentRunsCount = paces.length;
            }
          }
        } catch (err) {
          console.log('[DynamicPaceCoaching] Failed to load user data:', err);
        }
      }
      
      const coaching = await generateDynamicPaceCoaching({
        currentPaceSecondsPerKm: parseFloat(currentPaceSecondsPerKm),
        targetPaceSecondsPerKm: targetPaceSecondsPerKm ? parseFloat(targetPaceSecondsPerKm) : undefined,
        distanceCovered: parseFloat(distanceCovered),
        totalDistance: totalDistance ? parseFloat(totalDistance) : undefined,
        elapsedTimeSeconds: parseFloat(elapsedTimeSeconds),
        elevationProfile,
        routeDifficulty,
        totalElevationGain,
        userName,
        userAge,
        userFitnessLevel,
        historicAveragePace,
        recentRunsCount,
        coachTone,
        coachName
      });
      
      res.json(coaching);
    } catch (error) {
      console.error("Dynamic pace coaching error:", error);
      res.status(500).json({ error: "Failed to generate pace coaching" });
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

  // Subscribe to push notifications (multi-device support)
  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { userId, subscription, deviceId, deviceName } = req.body;
      console.log(`[Push] Subscribe request for user ${userId}, deviceName: ${deviceName}`);
      
      if (!userId || !subscription) {
        console.log(`[Push] Missing userId or subscription`);
        return res.status(400).json({ error: "Missing userId or subscription" });
      }

      const { endpoint, keys } = subscription;
      console.log(`[Push] Endpoint received: ${endpoint?.substring(0, 80)}...`);
      
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        console.log(`[Push] Invalid subscription format - endpoint: ${!!endpoint}, p256dh: ${!!keys?.p256dh}, auth: ${!!keys?.auth}`);
        return res.status(400).json({ error: "Invalid subscription format" });
      }

      const saved = await storage.savePushSubscription({
        userId,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
        deviceId: deviceId || null,
        deviceName: deviceName || null,
        userAgent: req.headers['user-agent'] || null,
      });

      console.log(`[Push] Subscription saved successfully for user ${userId}, id: ${saved.id}`);
      res.json({ success: true, id: saved.id });
    } catch (error: any) {
      console.error("[Push] Subscription error:", error?.message || error);
      res.status(500).json({ error: "Failed to save subscription", details: error?.message });
    }
  });
  
  // Debug endpoint to check push subscription status
  app.get("/api/push/debug/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const allSubs = await storage.getAllPushSubscriptions(userId);
      const activeSub = await storage.getPushSubscription(userId);
      
      res.json({
        userId,
        totalSubscriptions: allSubs.length,
        activeSubscription: activeSub ? {
          id: activeSub.id,
          endpointPrefix: activeSub.endpoint.substring(0, 60) + '...',
          isActive: activeSub.isActive,
          deviceName: activeSub.deviceName,
          lastUsedAt: activeSub.lastUsedAt,
        } : null,
        allSubscriptions: allSubs.map(s => ({
          id: s.id,
          endpointPrefix: s.endpoint.substring(0, 60) + '...',
          isActive: s.isActive,
          deviceName: s.deviceName,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to get debug info" });
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
      const endpoint = req.query.endpoint as string;
      
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      
      // If endpoint provided, check if this specific device is registered
      if (endpoint) {
        const subscription = await storage.getPushSubscriptionByEndpoint(endpoint);
        res.json({ 
          hasSubscription: !!subscription && subscription.isActive,
          isCurrentDevice: !!subscription && subscription.userId === userId,
          deviceRegistered: !!subscription,
        });
        return;
      }
      
      // Otherwise check if user has any active subscription
      const subscriptions = await storage.getAllPushSubscriptions(userId);
      res.json({ 
        hasSubscription: subscriptions.length > 0,
        deviceCount: subscriptions.length,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check subscription status" });
    }
  });
  
  // Unsubscribe a specific device by endpoint
  app.post("/api/push/unsubscribe-device", async (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ error: "Missing endpoint" });
      }
      await storage.deletePushSubscriptionByEndpoint(endpoint);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to unsubscribe device" });
    }
  });

  // Notification Preferences endpoints
  app.get("/api/notification-preferences/:userId", async (req, res) => {
    const defaults = {
      friendRequest: true,
      friendAccepted: true,
      groupRunInvite: true,
      groupRunStarting: true,
      liveRunInvite: true,
      liveObserverJoined: true,
      runCompleted: false,
      weeklyProgress: false,
    };
    try {
      const prefs = await storage.getNotificationPreferences(req.params.userId);
      // Return defaults if no preferences exist
      res.json(prefs || defaults);
    } catch (error: any) {
      // If table doesn't exist yet, return defaults
      if (error?.code === '42P01') {
        return res.json(defaults);
      }
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ error: "Failed to fetch notification preferences" });
    }
  });

  app.put("/api/notification-preferences/:userId", async (req, res) => {
    const prefsData = req.body;
    try {
      const prefs = await storage.upsertNotificationPreferences(req.params.userId, {
        friendRequest: prefsData.friendRequest,
        friendAccepted: prefsData.friendAccepted,
        groupRunInvite: prefsData.groupRunInvite,
        groupRunStarting: prefsData.groupRunStarting,
        liveRunInvite: prefsData.liveRunInvite,
        liveObserverJoined: prefsData.liveObserverJoined,
        runCompleted: prefsData.runCompleted,
        weeklyProgress: prefsData.weeklyProgress,
      });
      res.json(prefs);
    } catch (error: any) {
      // If table doesn't exist yet, return the values they tried to save
      if (error?.code === '42P01') {
        return res.json({
          friendRequest: prefsData.friendRequest ?? true,
          friendAccepted: prefsData.friendAccepted ?? true,
          groupRunInvite: prefsData.groupRunInvite ?? true,
          groupRunStarting: prefsData.groupRunStarting ?? true,
          liveRunInvite: prefsData.liveRunInvite ?? true,
          liveObserverJoined: prefsData.liveObserverJoined ?? true,
          runCompleted: prefsData.runCompleted ?? false,
          weeklyProgress: prefsData.weeklyProgress ?? false,
        });
      }
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ error: "Failed to update notification preferences" });
    }
  });

  // Test push notification endpoint (for debugging)
  app.post("/api/push/test/:userId", async (req, res) => {
    try {
      const { type } = req.body;
      const userId = req.params.userId;
      
      const subscription = await storage.getPushSubscription(userId);
      if (!subscription) {
        return res.status(404).json({ error: "No push subscription found for this user" });
      }

      const testMessages: Record<string, { title: string; body: string; data: any }> = {
        friend_request: {
          title: "New Friend Request",
          body: "Test User wants to be your friend!",
          data: { type: "friend_request", requesterId: "test-id" }
        },
        friend_accepted: {
          title: "Friend Request Accepted",
          body: "Test User accepted your friend request!",
          data: { type: "friend_accepted", friendId: "test-id" }
        },
        group_run_invite: {
          title: "Group Run Invitation",
          body: "Test User invited you to a group run!",
          data: { type: "group_run_invite", groupRunId: "test-id" }
        },
        group_run_starting: {
          title: "Group Run Starting Soon",
          body: "Your group run is starting in 5 minutes!",
          data: { type: "group_run_starting", groupRunId: "test-id" }
        },
        live_run_invite: {
          title: "Live Run Invitation",
          body: "Test User invited you to watch their live run!",
          data: { type: "live_run_invite", runnerId: "test-id", sessionId: "test-session" }
        },
        live_observer_joined: {
          title: "Friend Watching Your Run",
          body: "Test User is now watching your live run!",
          data: { type: "live_observer_joined", observerId: "test-id", sessionId: "test-session" }
        },
      };

      const message = testMessages[type] || testMessages.friend_request;
      
      const { sendPushNotification } = await import("./pushNotifications");
      await sendPushNotification(userId, { title: message.title, body: message.body, data: message.data });
      res.json({ success: true, message: `Test notification sent: ${type}` });
    } catch (error) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ error: "Failed to send test notification" });
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

  // Group Run endpoints
  app.post("/api/group-runs", async (req, res) => {
    try {
      const { hostUserId, routeId, mode, title, description, targetDistance, targetPace, plannedStartAt } = req.body;
      
      if (!hostUserId) {
        return res.status(400).json({ error: "Missing hostUserId" });
      }
      
      // Generate unique invite token
      const inviteToken = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const groupRun = await storage.createGroupRun({
        hostUserId,
        routeId: routeId || null,
        mode: mode || (routeId ? 'route' : 'free'),
        title: title || null,
        description: description || null,
        targetDistance: targetDistance || null,
        targetPace: targetPace || null,
        inviteToken,
        status: 'pending',
        plannedStartAt: plannedStartAt ? new Date(plannedStartAt) : null,
      });
      
      // Add host as participant with 'host' role
      await storage.addGroupRunParticipant({
        groupRunId: groupRun.id,
        userId: hostUserId,
        role: 'host',
        invitationStatus: 'accepted',
      });
      
      res.status(201).json(groupRun);
    } catch (error) {
      console.error("Create group run error:", error);
      res.status(500).json({ error: "Failed to create group run" });
    }
  });

  app.get("/api/group-runs/:id", async (req, res) => {
    try {
      const groupRun = await storage.getGroupRun(req.params.id);
      if (!groupRun) {
        return res.status(404).json({ error: "Group run not found" });
      }
      res.json(groupRun);
    } catch (error) {
      console.error("Get group run error:", error);
      res.status(500).json({ error: "Failed to get group run" });
    }
  });

  // Start a group run (host only)
  app.post("/api/group-runs/:id/start", async (req, res) => {
    try {
      const { userId } = req.body;
      const groupRun = await storage.getGroupRun(req.params.id);
      
      if (!groupRun) {
        return res.status(404).json({ error: "Group run not found" });
      }
      
      // Verify the user is the host
      if (groupRun.hostUserId !== userId) {
        return res.status(403).json({ error: "Only the host can start the group run" });
      }
      
      // Update group run status to active
      const updated = await storage.updateGroupRun(req.params.id, {
        status: 'active',
        actualStartAt: new Date(),
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Start group run error:", error);
      res.status(500).json({ error: "Failed to start group run" });
    }
  });

  app.get("/api/group-runs/token/:token", async (req, res) => {
    try {
      const groupRun = await storage.getGroupRunByToken(req.params.token);
      if (!groupRun) {
        return res.status(404).json({ error: "Group run not found" });
      }
      res.json(groupRun);
    } catch (error) {
      console.error("Get group run by token error:", error);
      res.status(500).json({ error: "Failed to get group run" });
    }
  });

  app.get("/api/group-runs/user/:userId", async (req, res) => {
    try {
      const hostedRuns = await storage.getUserGroupRuns(req.params.userId);
      const participantRuns = await storage.getGroupRunsByParticipant(req.params.userId);
      
      // Combine and dedupe
      const allRuns = [...hostedRuns];
      for (const run of participantRuns) {
        if (!allRuns.find(r => r.id === run.id)) {
          allRuns.push(run);
        }
      }
      
      res.json(allRuns);
    } catch (error) {
      console.error("Get user group runs error:", error);
      res.status(500).json({ error: "Failed to get group runs" });
    }
  });

  app.post("/api/group-runs/:id/invite", async (req, res) => {
    try {
      const { userId, friendIds } = req.body;
      const groupRun = await storage.getGroupRun(req.params.id);
      
      if (!groupRun) {
        return res.status(404).json({ error: "Group run not found" });
      }
      
      if (groupRun.hostUserId !== userId) {
        return res.status(403).json({ error: "Only the host can invite participants" });
      }
      
      const invitedParticipants = [];
      
      // Get host info and route name for notifications
      const host = await storage.getUser(groupRun.hostUserId);
      let routeName: string | undefined;
      if (groupRun.routeId) {
        const route = await storage.getRoute(groupRun.routeId);
        routeName = route?.name || groupRun.title || undefined;
      }
      
      for (const friendId of friendIds) {
        // Check if already a participant
        const existing = await storage.getGroupRunParticipant(groupRun.id, friendId);
        if (existing) continue;
        
        // Set invite expiry (24 hours from now)
        const inviteExpiresAt = new Date();
        inviteExpiresAt.setHours(inviteExpiresAt.getHours() + 24);
        
        const participant = await storage.addGroupRunParticipant({
          groupRunId: groupRun.id,
          userId: friendId,
          role: 'participant',
          invitationStatus: 'pending',
          inviteExpiresAt,
        });
        
        // Send in-app notification to invited friend
        await storage.createNotification({
          userId: friendId,
          type: 'group_run_invite',
          title: 'Group Run Invitation',
          message: `${host?.name || 'A friend'} invited you to join a group run!`,
          data: { groupRunId: groupRun.id, inviteToken: groupRun.inviteToken, participantId: participant.id },
        });
        
        // Send push notification to invited friend
        await sendGroupRunInviteNotification(
          friendId,
          host?.name || 'A friend',
          groupRun.id,
          groupRun.inviteToken,
          routeName
        );
        
        invitedParticipants.push(participant);
      }
      
      res.json({ invited: invitedParticipants.length });
    } catch (error) {
      console.error("Invite to group run error:", error);
      res.status(500).json({ error: "Failed to invite participants" });
    }
  });

  app.post("/api/group-runs/:id/join", async (req, res) => {
    try {
      const { userId } = req.body;
      const groupRun = await storage.getGroupRun(req.params.id);
      
      if (!groupRun) {
        return res.status(404).json({ error: "Group run not found" });
      }
      
      // Check if already a participant
      let participant = await storage.getGroupRunParticipant(groupRun.id, userId);
      
      if (participant) {
        // Update status to accepted
        participant = await storage.updateGroupRunParticipant(participant.id, {
          invitationStatus: 'accepted',
        });
      } else {
        // Add as new participant
        participant = await storage.addGroupRunParticipant({
          groupRunId: groupRun.id,
          userId,
          role: 'participant',
          invitationStatus: 'accepted',
        });
      }
      
      res.json(participant);
    } catch (error) {
      console.error("Join group run error:", error);
      res.status(500).json({ error: "Failed to join group run" });
    }
  });

  app.get("/api/group-runs/:id/participants", async (req, res) => {
    try {
      const participants = await storage.getGroupRunParticipants(req.params.id);
      
      // Enrich with user info
      const enrichedParticipants = await Promise.all(
        participants.map(async (p) => {
          const user = await storage.getUser(p.userId);
          return {
            ...p,
            userName: user?.name || 'Unknown',
            userProfilePic: user?.profilePic,
          };
        })
      );
      
      res.json(enrichedParticipants);
    } catch (error) {
      console.error("Get group run participants error:", error);
      res.status(500).json({ error: "Failed to get participants" });
    }
  });

  app.get("/api/group-runs/:id/summary", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const groupRun = await storage.getGroupRun(req.params.id);
      if (!groupRun) {
        return res.status(404).json({ error: "Group run not found" });
      }
      
      // Verify the user is either the host or a participant
      if (userId) {
        const isHost = groupRun.hostUserId === userId;
        const participant = await storage.getGroupRunParticipant(groupRun.id, userId);
        if (!isHost && !participant) {
          return res.status(403).json({ error: "You are not a participant in this group run" });
        }
      }
      
      const summary = await storage.getGroupRunSummary(req.params.id);
      
      // Get route info if available
      let route = null;
      if (summary.groupRun.routeId) {
        route = await storage.getRoute(summary.groupRun.routeId);
      }
      
      res.json({ ...summary, route });
    } catch (error) {
      console.error("Get group run summary error:", error);
      res.status(500).json({ error: "Failed to get group run summary" });
    }
  });

  app.post("/api/group-runs/:id/complete-run", async (req, res) => {
    try {
      const { userId, runId } = req.body;
      
      const participant = await storage.getGroupRunParticipant(req.params.id, userId);
      if (!participant) {
        return res.status(404).json({ error: "Participant not found" });
      }
      
      const updated = await storage.updateGroupRunParticipant(participant.id, {
        runId,
        invitationStatus: 'completed',
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Complete group run error:", error);
      res.status(500).json({ error: "Failed to update participant run" });
    }
  });

  // Get pending group run invites for a user
  app.get("/api/group-runs/invites/pending/:userId", async (req, res) => {
    try {
      const invites = await storage.getPendingGroupRunInvites(req.params.userId);
      res.json(invites);
    } catch (error) {
      console.error("Get pending invites error:", error);
      res.status(500).json({ error: "Failed to get pending invites" });
    }
  });

  // Accept a group run invite
  app.post("/api/group-runs/invites/:participantId/accept", async (req, res) => {
    try {
      const { userId } = req.body;
      
      // Verify the participant belongs to this user
      const participant = (await storage.getPendingGroupRunInvites(userId))
        .find(p => p.id === req.params.participantId);
      
      if (!participant || participant.userId !== userId) {
        return res.status(403).json({ error: "You can only accept your own invites" });
      }
      
      const updated = await storage.acceptGroupRunInvite(req.params.participantId);
      
      // Get the group run details to return
      const groupRun = await storage.getGroupRun(participant.groupRunId);
      
      // Notify the host that someone accepted
      if (groupRun) {
        const acceptingUser = await storage.getUser(userId);
        await sendGroupRunAcceptedNotification(
          groupRun.hostUserId,
          acceptingUser?.name || 'A friend',
          groupRun.id
        );
      }
      
      // Get route info if available
      let route = null;
      if (groupRun?.routeId) {
        route = await storage.getRoute(groupRun.routeId);
      }
      
      res.json({ participant: updated, groupRun, route });
    } catch (error) {
      console.error("Accept invite error:", error);
      res.status(500).json({ error: "Failed to accept invite" });
    }
  });

  // Decline a group run invite
  app.post("/api/group-runs/invites/:participantId/decline", async (req, res) => {
    try {
      const { userId } = req.body;
      
      // Verify the participant belongs to this user
      const participant = (await storage.getPendingGroupRunInvites(userId))
        .find(p => p.id === req.params.participantId);
      
      if (!participant || participant.userId !== userId) {
        return res.status(403).json({ error: "You can only decline your own invites" });
      }
      
      const updated = await storage.declineGroupRunInvite(req.params.participantId);
      res.json(updated);
    } catch (error) {
      console.error("Decline invite error:", error);
      res.status(500).json({ error: "Failed to decline invite" });
    }
  });

  // Get participant counts for a group run
  app.get("/api/group-runs/:id/counts", async (req, res) => {
    try {
      const counts = await storage.getGroupRunParticipantCounts(req.params.id);
      res.json(counts);
    } catch (error) {
      console.error("Get participant counts error:", error);
      res.status(500).json({ error: "Failed to get participant counts" });
    }
  });

  // Mark participant as ready to start
  app.post("/api/group-runs/:id/ready", async (req, res) => {
    try {
      const { userId, ready } = req.body;
      
      const participant = await storage.getGroupRunParticipant(req.params.id, userId);
      if (!participant) {
        return res.status(404).json({ error: "Participant not found" });
      }
      
      const updated = await storage.updateGroupRunParticipant(participant.id, {
        readyToStart: ready ?? true
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Mark ready error:", error);
      res.status(500).json({ error: "Failed to mark participant ready" });
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
            requesterUserCode: requester?.userCode || null,
            requesterProfilePic: requester?.profilePic || null,
            requesterEmail: requester?.email || null,
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
            addresseeUserCode: addressee?.userCode || null,
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
          await sendFriendAcceptedNotification(request.requesterId, addressee.name, addressee.email, addressee.id);
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
        await sendFriendAcceptedNotification(request.requesterId, addressee.name, addressee.email, addressee.id);
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

  // =============================================
  // ADMIN: User Support / Impersonation Endpoints
  // =============================================

  // Get all users for admin (user support)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const userList = await storage.getAllUsersForAdmin();
      res.json(userList);
    } catch (error) {
      console.error("Failed to get users for admin:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  // Impersonate a user (admin only) - returns the target user's data
  app.post("/api/admin/impersonate", requireAdmin, async (req, res) => {
    try {
      const { targetUserId } = req.body;
      if (!targetUserId) {
        return res.status(400).json({ error: "Target user ID is required" });
      }
      
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const adminUser = (req as any).adminUser;
      console.log(`Admin ${adminUser.email} impersonating user ${targetUser.email}`);
      
      const { password: _, ...safeUser } = targetUser;
      res.json({
        user: safeUser,
        originalAdminId: adminUser.id,
        originalAdminEmail: adminUser.email,
      });
    } catch (error) {
      console.error("Impersonation error:", error);
      res.status(500).json({ error: "Failed to impersonate user" });
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

  // Admin endpoint to backfill user codes for existing users
  app.post("/api/admin/backfill-user-codes", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.backfillUserCodes();
      res.json({ success: true, updated });
    } catch (error) {
      console.error("Failed to backfill user codes:", error);
      res.status(500).json({ error: "Failed to backfill user codes" });
    }
  });

  // Admin endpoint to send test push notification
  app.post("/api/admin/test-push/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const subscription = await storage.getPushSubscription(userId);
      
      if (!subscription) {
        return res.status(404).json({ error: "No push subscription found for this user" });
      }
      
      const { sendPushNotification } = await import("./pushNotifications");
      
      await sendPushNotification(subscription, {
        title: "Test Notification",
        body: "This is a test push notification from AI Run Coach!",
        icon: "/icons/icon-192x192.png",
        tag: "test-notification",
        data: { type: "test" }
      });
      
      res.json({ success: true, message: "Test notification sent!" });
    } catch (error: any) {
      console.error("Failed to send test push:", error);
      res.status(500).json({ error: error.message || "Failed to send test notification" });
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

  // Stripe subscription routes (disabled in production)
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const isStripeEnabled = !isProduction;

  app.get("/api/stripe/products", async (req, res) => {
    if (!isStripeEnabled) {
      return res.json([]);
    }
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
    if (!isStripeEnabled) {
      return res.status(503).json({ error: "Payments disabled" });
    }
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
    if (!isStripeEnabled) {
      return res.status(503).json({ error: "Payments disabled" });
    }
    try {
      const { priceId, userId, mode = 'subscription' } = req.body;
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
        userId,
        mode as 'subscription' | 'payment'
      );

      res.json({ sessionUrl: session.url });
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // Complete checkout and set entitlements
  app.post("/api/stripe/complete-checkout", async (req, res) => {
    if (!isStripeEnabled) {
      return res.status(503).json({ error: "Payments disabled" });
    }
    try {
      const { sessionId, userId } = req.body;
      if (!sessionId || !userId) {
        return res.status(400).json({ error: "Missing sessionId or userId" });
      }

      const { stripeService } = await import("./stripeService");
      const session = await stripeService.getCheckoutSession(sessionId);

      // Security: Validate userId matches the session metadata
      const sessionUserId = session.metadata?.userId;
      if (!sessionUserId || sessionUserId !== userId) {
        console.error("userId mismatch:", { sessionUserId, requestUserId: userId });
        return res.status(403).json({ error: "Session does not match user" });
      }

      const user = await storage.getUser(sessionUserId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: "Payment not completed" });
      }

      // Determine entitlement based on mode
      if (session.mode === 'payment') {
        // One-time payment (Early Bird) - 30 days access
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        await storage.updateUserEntitlement(sessionUserId, "one_time", expiresAt);
        await storage.updateUser(sessionUserId, {
          subscriptionTier: "early_bird",
          subscriptionStatus: "active",
        });
        
        console.log(`[Checkout] Early Bird entitlement granted to user ${sessionUserId}, expires: ${expiresAt.toISOString()}`);
        
        res.json({ 
          success: true, 
          entitlementType: "one_time",
          expiresAt,
          tier: "early_bird"
        });
      } else if (session.mode === 'subscription') {
        // Subscription - ongoing access
        const subscription = session.subscription;
        await storage.updateUser(sessionUserId, {
          stripeSubscriptionId: typeof subscription === 'string' ? subscription : subscription?.toString(),
          subscriptionTier: "standard",
          subscriptionStatus: "active",
          entitlementType: "subscription",
        });
        
        console.log(`[Checkout] Standard subscription granted to user ${sessionUserId}`);
        
        res.json({ 
          success: true, 
          entitlementType: "subscription",
          tier: "standard"
        });
      } else {
        res.status(400).json({ error: "Unknown checkout mode" });
      }
    } catch (error) {
      console.error("Failed to complete checkout:", error);
      res.status(500).json({ error: "Failed to complete checkout" });
    }
  });

  app.post("/api/stripe/create-portal-session", async (req, res) => {
    if (!isStripeEnabled) {
      return res.status(503).json({ error: "Payments disabled" });
    }
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
    if (!isStripeEnabled) {
      return res.json({ subscription: null, tier: null, status: null });
    }
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

  // Coupon redemption
  app.post("/api/coupons/redeem", async (req, res) => {
    try {
      const { userId, code } = req.body;
      if (!userId || !code) {
        return res.status(400).json({ error: "Missing userId or code" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const coupon = await storage.getCouponByCode(code);
      if (!coupon) {
        return res.status(404).json({ error: "Invalid coupon code" });
      }

      if (!coupon.isActive) {
        return res.status(400).json({ error: "This coupon is no longer active" });
      }

      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This coupon has expired" });
      }

      if (coupon.maxRedemptions && (coupon.currentRedemptions || 0) >= coupon.maxRedemptions) {
        return res.status(400).json({ error: "This coupon has reached its maximum redemptions" });
      }

      const existingRedemption = await storage.getUserCoupon(userId, coupon.id);
      if (existingRedemption) {
        return res.status(400).json({ error: "You have already redeemed this coupon" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + coupon.durationDays);

      await storage.createUserCoupon({
        userId,
        couponId: coupon.id,
        expiresAt,
        status: "active",
      });

      await storage.incrementCouponRedemptions(coupon.id);

      await storage.updateUserEntitlement(userId, "coupon", expiresAt);

      res.json({ 
        success: true, 
        message: `Coupon redeemed! You have ${coupon.durationDays} days of premium access.`,
        expiresAt 
      });
    } catch (error) {
      console.error("Coupon redemption error:", error);
      res.status(500).json({ error: "Failed to redeem coupon" });
    }
  });

  // Get entitlement status
  app.get("/api/entitlement/:userId", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { checkEntitlementStatus } = await import("./entitlements");
      const status = checkEntitlementStatus(user);
      
      res.json(status);
    } catch (error) {
      console.error("Failed to check entitlement:", error);
      res.status(500).json({ error: "Failed to check entitlement" });
    }
  });

  // Admin: Create coupon
  app.post("/api/admin/coupons", async (req, res) => {
    try {
      const { userId, ...couponData } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const coupon = await storage.createCoupon(couponData);
      res.json(coupon);
    } catch (error) {
      console.error("Failed to create coupon:", error);
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });

  // Admin: List coupons
  app.get("/api/admin/coupons", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const coupons = await storage.getAllCoupons();
      res.json(coupons);
    } catch (error) {
      console.error("Failed to get coupons:", error);
      res.status(500).json({ error: "Failed to get coupons" });
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

  // =====================
  // GOALS ROUTES
  // =====================

  // Create a new goal
  app.post("/api/goals", async (req, res) => {
    try {
      const data = insertGoalSchema.parse(req.body);
      const goal = await storage.createGoal(data);
      res.status(201).json(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Create goal error:", error);
      res.status(500).json({ error: "Failed to create goal" });
    }
  });

  // Get user's goals (with optional status filter)
  app.get("/api/goals/user/:userId", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const goals = await storage.getUserGoals(req.params.userId, status);
      res.json(goals);
    } catch (error) {
      console.error("Get user goals error:", error);
      res.status(500).json({ error: "Failed to get goals" });
    }
  });

  // Get user's active goals
  app.get("/api/goals/user/:userId/active", async (req, res) => {
    try {
      const goals = await storage.getUserActiveGoals(req.params.userId);
      res.json(goals);
    } catch (error) {
      console.error("Get active goals error:", error);
      res.status(500).json({ error: "Failed to get active goals" });
    }
  });

  // Get user's primary goal (highest priority active goal)
  app.get("/api/goals/user/:userId/primary", async (req, res) => {
    try {
      const goal = await storage.getPrimaryGoal(req.params.userId);
      res.json(goal || null);
    } catch (error) {
      console.error("Get primary goal error:", error);
      res.status(500).json({ error: "Failed to get primary goal" });
    }
  });

  // Get a specific goal
  app.get("/api/goals/:id", async (req, res) => {
    try {
      const goal = await storage.getGoal(req.params.id);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      res.json(goal);
    } catch (error) {
      console.error("Get goal error:", error);
      res.status(500).json({ error: "Failed to get goal" });
    }
  });

  // Update a goal
  app.patch("/api/goals/:id", async (req, res) => {
    try {
      const goal = await storage.updateGoal(req.params.id, req.body);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      res.json(goal);
    } catch (error) {
      console.error("Update goal error:", error);
      res.status(500).json({ error: "Failed to update goal" });
    }
  });

  // Update goal progress
  app.patch("/api/goals/:id/progress", async (req, res) => {
    try {
      const { progressPercent } = req.body;
      if (typeof progressPercent !== 'number' || progressPercent < 0 || progressPercent > 100) {
        return res.status(400).json({ error: "Invalid progress percent (must be 0-100)" });
      }
      const goal = await storage.updateGoalProgress(req.params.id, progressPercent);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      res.json(goal);
    } catch (error) {
      console.error("Update goal progress error:", error);
      res.status(500).json({ error: "Failed to update goal progress" });
    }
  });

  // Complete a goal
  app.post("/api/goals/:id/complete", async (req, res) => {
    try {
      const goal = await storage.completeGoal(req.params.id);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      res.json(goal);
    } catch (error) {
      console.error("Complete goal error:", error);
      res.status(500).json({ error: "Failed to complete goal" });
    }
  });

  // Abandon a goal
  app.post("/api/goals/:id/abandon", async (req, res) => {
    try {
      const goal = await storage.abandonGoal(req.params.id);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      res.json(goal);
    } catch (error) {
      console.error("Abandon goal error:", error);
      res.status(500).json({ error: "Failed to abandon goal" });
    }
  });

  // Delete a goal
  app.delete("/api/goals/:id", async (req, res) => {
    try {
      await storage.deleteGoal(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete goal error:", error);
      res.status(500).json({ error: "Failed to delete goal" });
    }
  });

  return httpServer;
}

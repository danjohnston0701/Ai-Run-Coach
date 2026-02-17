import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { eq, and, gte, desc, lte } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { 
  garminWellnessMetrics, connectedDevices, garminActivities, garminBodyComposition, 
  runs, garminRealtimeData, garminCompanionSessions,
  dailyFitness, segmentEfforts, segmentStars, segments,
  trainingPlans, weeklyPlans, plannedWorkouts, planAdaptations,
  feedActivities, reactions, activityComments, commentLikes,
  clubs, clubMemberships, challenges, challengeParticipants, groupRunParticipants,
  achievements, userAchievements, goals, users
} from "@shared/schema";
import { sql } from "drizzle-orm";
import { 
  generateToken, 
  hashPassword, 
  comparePassword, 
  authMiddleware, 
  optionalAuthMiddleware,
  type AuthenticatedRequest 
} from "./auth";
import {
  calculateTSS,
  updateDailyFitness,
  recalculateHistoricalFitness,
  getFitnessTrend,
  getCurrentFitness,
  getFitnessRecommendations
} from "./fitness-service";
import {
  matchRunToSegments,
  reprocessRunForSegments,
  createSegmentFromRun
} from "./segment-matching-service";
import {
  generateTrainingPlan,
  adaptTrainingPlan,
  completeWorkout
} from "./training-plan-service";
import {
  checkAchievementsAfterRun,
  getUserAchievements,
  initializeAchievements
} from "./achievements-service";
import garminOAuthRouter from "./garmin-oauth-bridge";
import {
  snapTrackToOSMSegments,
  recordSegmentUsage,
  analyzeRouteCharacteristics
} from "./osm-segment-intelligence";
import {
  generateIntelligentRoute
} from "./intelligent-route-generation";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // ==================== GARMIN OAUTH BRIDGE ====================
  app.use(garminOAuthRouter);
  
  // ==================== AUTH ENDPOINTS ====================
  
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      
      if (!email || !password || !name) {
        return res.status(400).json({ error: "Email, password, and name are required" });
      }
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      const hashedPassword = await hashPassword(password);
      const userCode = `RC${Date.now().toString(36).toUpperCase()}`;
      
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        name,
        userCode,
      });
      
      const token = generateToken({ userId: user.id, email: user.email });
      
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({ user: userWithoutPassword, token });
    } catch (error: any) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Failed to register user" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const isValid = await comparePassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const token = generateToken({ userId: user.id, email: user.email });
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // ==================== USER ENDPOINTS ====================
  
  app.get("/api/users/search", async (req: Request, res: Response) => {
    try {
      const query = String(req.query.q || "");
      if (!query || query.length < 2) {
        return res.json([]);
      }
      
      const users = await storage.searchUsers(query);
      const sanitized = users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        profilePic: u.profilePic,
        userCode: u.userCode,
      }));
      res.json(sanitized);
    } catch (error: any) {
      console.error("Search users error:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.put("/api/users/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.userId !== req.params.id) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updated = await storage.updateUser(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = updated;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Update user error:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Upload profile picture (base64)
  app.post("/api/users/:id/profile-picture", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.userId !== req.params.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { imageData } = req.body; // base64 encoded image or data URL
      
      if (!imageData) {
        return res.status(400).json({ error: "No image data provided" });
      }

      // Update user's profile picture
      const updated = await storage.updateUser(req.params.id, {
        profilePic: imageData
      });

      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = updated;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Upload profile picture error:", error);
      res.status(500).json({ error: "Failed to upload profile picture" });
    }
  });

  // ==================== FRIENDS ENDPOINTS ====================
  
  app.get("/api/friends", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = String(req.query.userId || req.user?.userId);
      const friends = await storage.getFriends(userId);
      res.json(friends.map(f => ({
        id: f.id,
        name: f.name,
        email: f.email,
        profilePic: f.profilePic,
        userCode: f.userCode,
      })));
    } catch (error: any) {
      console.error("Get friends error:", error);
      res.status(500).json({ error: "Failed to get friends" });
    }
  });

  app.post("/api/friend-requests", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { addresseeId, message } = req.body;
      const requesterId = req.user!.userId;
      
      if (!addresseeId) {
        return res.status(400).json({ error: "Addressee ID is required" });
      }
      
      const request = await storage.createFriendRequest(requesterId, addresseeId, message);
      res.status(201).json(request);
    } catch (error: any) {
      console.error("Create friend request error:", error);
      res.status(500).json({ error: "Failed to create friend request" });
    }
  });

  app.get("/api/friend-requests/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      // Verify user is requesting their own friend requests
      if (req.user?.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const requests = await storage.getFriendRequests(userId);
      
      // Separate sent and received requests and enrich with user data
      const sent: any[] = [];
      const received: any[] = [];

      for (const request of requests) {
        if (request.requesterId === userId) {
          // Sent request - get addressee info
          const addressee = await storage.getUser(request.addresseeId);
          sent.push({
            ...request,
            addresseeName: addressee?.name,
            addresseeProfilePic: addressee?.profilePic
          });
        } else if (request.addresseeId === userId) {
          // Received request - get requester info
          const requester = await storage.getUser(request.requesterId);
          received.push({
            ...request,
            requesterName: requester?.name,
            requesterProfilePic: requester?.profilePic
          });
        }
      }

      res.json({ sent, received });
    } catch (error: any) {
      console.error("Get friend requests error:", error);
      res.status(500).json({ error: "Failed to get friend requests" });
    }
  });

  app.post("/api/friend-requests/:id/accept", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await storage.acceptFriendRequest(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Accept friend request error:", error);
      res.status(500).json({ error: "Failed to accept friend request" });
    }
  });

  app.post("/api/friend-requests/:id/decline", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await storage.declineFriendRequest(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Decline friend request error:", error);
      res.status(500).json({ error: "Failed to decline friend request" });
    }
  });

  // ==================== RUNS ENDPOINTS ====================
  
  // Helper function to transform database run to Android format
  function transformRunForAndroid(run: any) {
  function normalizeDistanceMeters(run: any): number {
    let d = run.distance || 0;
    if (!d) return 0;
    // If already meters (typical), leave as-is.
    if (d > 1000) return d;

    const hasSplits = Array.isArray(run.kmSplits) && run.kmSplits.length > 0;
    const hasPace = typeof run.avgPace === "string" && run.avgPace.length > 0;
    const hasTrack = Array.isArray(run.gpsTrack) && run.gpsTrack.length > 1;
    if (hasSplits || hasPace || hasTrack) return d * 1000;
    return d;
  }

  function normalizeNumericSeries(series: any): number[] {
    if (!series) return [];
    const raw = Array.isArray(series)
      ? series
      : (Array.isArray(series?.samples) ? series.samples : []);

    return raw
      .map((entry: any) => {
        if (typeof entry === "number") return entry;
        if (typeof entry?.value === "number") return entry.value;
        if (typeof entry?.bpm === "number") return entry.bpm;
        if (typeof entry?.heartRate === "number") return entry.heartRate;
        if (typeof entry?.paceSeconds === "number") return entry.paceSeconds;
        if (typeof entry?.pace === "number") return entry.pace;
        if (typeof entry?.speed === "number") return entry.speed;
        return null;
      })
      .filter((v: any) => typeof v === "number") as number[];
  }

    // Convert completedAt timestamp to milliseconds
    const completedAtMs = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
    
    // Convert duration from SECONDS to MILLISECONDS (database stores seconds, Android expects milliseconds)
    const durationMs = (run.duration || 0) * 1000;
    
    // Calculate startTime and endTime
    const endTime = completedAtMs;
    const startTime = completedAtMs - durationMs;

    // Transform weather data to match Android format (if exists)
    let weatherData = null;
    if (run.weatherData) {
      try {
        weatherData = {
          temperature: run.weatherData.temperature || 0,
          humidity: run.weatherData.humidity || 0,
          windSpeed: run.weatherData.windSpeed || 0,
          description: run.weatherData.description || run.weatherData.condition || "Unknown",
          feelsLike: run.weatherData.feelsLike || null,
          // Convert wind direction to degrees (0-360) if it's a string, otherwise use as-is
          windDirection: typeof run.weatherData.windDirection === 'string' ? null : (run.weatherData.windDirection || null),
          uvIndex: run.weatherData.uvIndex || null,
          condition: run.weatherData.condition || run.weatherData.description || null
        };
      } catch (e) {
        console.error('Error transforming weather data:', e);
        weatherData = null;
      }
    }

    return {
      id: run.id,
      startTime: startTime,
      endTime: endTime,
      duration: durationMs,
      distance: normalizeDistanceMeters(run),
      averageSpeed: normalizeDistanceMeters(run) && run.duration ? (normalizeDistanceMeters(run) / (run.duration / 1000)) : 0,
      maxSpeed: 0, // Calculate from gpsTrack if needed
      averagePace: run.avgPace || "0'00\"/km",
      calories: run.calories || 0,
      cadence: run.cadence || 0,
      heartRate: run.avgHeartRate || 0,
      routePoints: Array.isArray(run.gpsTrack) ? run.gpsTrack : [],
      kmSplits: Array.isArray(run.kmSplits) ? run.kmSplits : [],
      heartRateData: normalizeNumericSeries(run.heartRateData),
      paceData: normalizeNumericSeries(run.paceData),
      strugglePoints: Array.isArray(run.strugglePoints) ? run.strugglePoints : [],
      aiCoachingNotes: Array.isArray(run.aiCoachingNotes) ? run.aiCoachingNotes : [],
      userComments: run.userComments || null,
      name: run.name || null,
      difficulty: run.difficulty || null,
      isStruggling: false,
      phase: "GENERIC",
      weatherAtStart: weatherData,
      weatherAtEnd: weatherData,
      totalElevationGain: run.elevationGain || 0,
      totalElevationLoss: run.elevationLoss || 0,
      averageGradient: 0,
      maxGradient: 0,
      terrainType: run.terrainType || "FLAT",
      routeHash: null,
      routeName: run.name || null,
      externalSource: run.externalSource || null,
      externalId: run.externalId || null,
      uploadedToGarmin: run.uploadedToGarmin || false,
      garminActivityId: run.garminActivityId || null,
      targetDistance: run.targetDistance || null,
      targetTime: run.targetTime || null,
      wasTargetAchieved: typeof run.wasTargetAchieved === "boolean" ? run.wasTargetAchieved : null,
      isActive: false
    };
  }

  app.get("/api/runs/user/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const runs = await storage.getUserRuns(req.params.userId);
      const transformedRuns = runs.map(transformRunForAndroid);
      res.json(transformedRuns);
    } catch (error: any) {
      console.error("Get user runs error:", error);
      res.status(500).json({ error: "Failed to get runs" });
    }
  });

  // Alias for Android app compatibility
  app.get("/api/users/:userId/runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const runs = await storage.getUserRuns(req.params.userId);
      const transformedRuns = runs.map(transformRunForAndroid);
      res.json(transformedRuns);
    } catch (error: any) {
      console.error("Get user runs error:", error);
      res.status(500).json({ error: "Failed to get runs" });
    }
  });

  app.get("/api/runs/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      const transformedRun = transformRunForAndroid(run);
      res.json(transformedRun);
    } catch (error: any) {
      console.error("Get run error:", error);
      res.status(500).json({ error: "Failed to get run" });
    }
  });

  app.post("/api/runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const runData = req.body;
      
      // Calculate TSS if not provided
      let tss = runData.tss || 0;
      if (tss === 0 && runData.duration) {
        tss = calculateTSS(
          runData.duration,
          runData.avgHeartRate,
          runData.maxHeartRate,
          60, // Default resting HR (could get from user profile)
          runData.difficulty
        );
      }
      
      // Convert timestamp fields from numbers to Date objects for database compatibility
      const processedRunData = {
        ...runData,
        completedAt: runData.completedAt ? new Date(runData.completedAt) : undefined,
        startTime: runData.startTime ? new Date(runData.startTime) : undefined,
        endTime: runData.endTime ? new Date(runData.endTime) : undefined,
        // Convert aiCoachingNotes timestamps if present
        aiCoachingNotes: runData.aiCoachingNotes?.map((note: any) => ({
          ...note,
          time: note.time ? new Date(note.time) : undefined,
        })),
        // Convert strugglePoints timestamps if present
        strugglePoints: runData.strugglePoints?.map((sp: any) => ({
          ...sp,
          timestamp: sp.timestamp ? new Date(sp.timestamp) : undefined,
        })),
      };
      
      // Create run with TSS
      const run = await storage.createRun({
        ...processedRunData,
        userId,
        tss,
      });
      
      // Update fitness metrics asynchronously (don't block response)
      if (run.completedAt && tss > 0) {
        const completedAtDate = typeof run.completedAt === 'number'
          ? new Date(run.completedAt)
          : run.completedAt;
        const runDate = completedAtDate.toISOString().split('T')[0];
        updateDailyFitness(userId, runDate, tss).catch(err => {
          console.error("Failed to update fitness metrics:", err);
        });
      }
      
      // Match segments asynchronously (don't block response)
      if (run.gpsTrack && Array.isArray(run.gpsTrack)) {
        matchRunToSegments(
          run.id,
          userId,
          run.gpsTrack as any,
          run.avgHeartRate || undefined,
          run.maxHeartRate || undefined,
          run.cadence || undefined
        ).catch(err => {
          console.error("Failed to match segments:", err);
        });
        
        // NEW: Track OSM segments for route intelligence
        (async () => {
          try {
            const osmSegments = await snapTrackToOSMSegments(run.gpsTrack as any);
            await recordSegmentUsage(run.id, userId, osmSegments);
            
            // Analyze route characteristics
            const characteristics = analyzeRouteCharacteristics(run.gpsTrack as any);
            console.log(`Run ${run.id} characteristics:`, characteristics);
            
            // Update run with characteristics (optional)
            await db.execute(sql`
              UPDATE runs 
              SET route_characteristics = ${JSON.stringify(characteristics)}
              WHERE id = ${run.id}
            `);
          } catch (err) {
            console.error("Failed to track OSM segments:", err);
          }
        })();
      }
      
      // Check for achievements asynchronously (don't block response)
      checkAchievementsAfterRun(run.id, userId).catch(err => {
        console.error("Failed to check achievements:", err);
      });
      
      res.status(201).json(run);
    } catch (error: any) {
      console.error("Create run error:", error);
      res.status(500).json({ error: "Failed to create run" });
    }
  });

  app.post("/api/runs/sync-progress", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId, ...data } = req.body;
      if (runId) {
        const run = await storage.updateRun(runId, data);
        res.json(run);
      } else {
        const run = await storage.createRun({
          ...data,
          userId: req.user!.userId,
        });
        res.json(run);
      }
    } catch (error: any) {
      console.error("Sync run progress error:", error);
      res.status(500).json({ error: "Failed to sync run progress" });
    }
  });

  app.get("/api/runs/:id/analysis", async (req: Request, res: Response) => {
    try {
      const analysis = await storage.getRunAnalysis(req.params.id);
      res.json(analysis || null);
    } catch (error: any) {
      console.error("Get run analysis error:", error);
      res.status(500).json({ error: "Failed to get analysis" });
    }
  });

  app.post("/api/runs/:id/analysis", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const analysis = await storage.createRunAnalysis(req.params.id, req.body);
      res.status(201).json(analysis);
    } catch (error: any) {
      console.error("Create run analysis error:", error);
      res.status(500).json({ error: "Failed to create analysis" });
    }
  });

  // Comprehensive AI run analysis using all Garmin data
  app.post("/api/runs/:id/comprehensive-analysis", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const runId = req.params.id;
      const userId = req.user!.userId;
      
      // Get the run data
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      // Get user profile for coach settings
      const user = await storage.getUser(userId);
      const coachName = user?.coachName || "AI Coach";
      const coachTone = user?.coachTone || "energetic";
      
      // Get linked Garmin activity if exists
      const garminActivity = await db.query.garminActivities.findFirst({
        where: eq(garminActivities.runId, runId),
      });
      
      // Get latest wellness metrics for the run date
      const runDate = run.runDate || (run.completedAt ? (typeof run.completedAt === 'number' ? new Date(run.completedAt) : run.completedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      const wellness = await db.query.garminWellnessMetrics.findFirst({
        where: and(
          eq(garminWellnessMetrics.userId, userId),
          eq(garminWellnessMetrics.date, runDate)
        ),
      });
      
      // Get previous runs for context
      const previousRuns = await db.query.runs.findMany({
        where: eq(runs.userId, userId),
        orderBy: desc(runs.completedAt),
        limit: 10,
      });
      
      // Import and call the comprehensive analysis function
      const aiService = await import("./ai-service");
      const analysis = await aiService.generateComprehensiveRunAnalysis({
        runData: run,
        garminActivity: garminActivity ? {
          activityType: garminActivity.activityType || undefined,
          durationInSeconds: garminActivity.durationInSeconds || undefined,
          distanceInMeters: garminActivity.distanceInMeters || undefined,
          averageHeartRate: garminActivity.averageHeartRateInBeatsPerMinute || undefined,
          maxHeartRate: garminActivity.maxHeartRateInBeatsPerMinute || undefined,
          averagePace: garminActivity.averagePaceInMinutesPerKilometer || undefined,
          averageCadence: garminActivity.averageRunCadenceInStepsPerMinute || undefined,
          maxCadence: garminActivity.maxRunCadenceInStepsPerMinute || undefined,
          averageStrideLength: garminActivity.averageStrideLength || undefined,
          groundContactTime: garminActivity.groundContactTime || undefined,
          verticalOscillation: garminActivity.verticalOscillation || undefined,
          verticalRatio: garminActivity.verticalRatio || undefined,
          elevationGain: garminActivity.totalElevationGainInMeters || undefined,
          elevationLoss: garminActivity.totalElevationLossInMeters || undefined,
          aerobicTrainingEffect: garminActivity.aerobicTrainingEffect || undefined,
          anaerobicTrainingEffect: garminActivity.anaerobicTrainingEffect || undefined,
          vo2Max: garminActivity.vo2Max || undefined,
          recoveryTime: garminActivity.recoveryTimeInMinutes || undefined,
          activeKilocalories: garminActivity.activeKilocalories || undefined,
          averagePower: garminActivity.averagePowerInWatts || undefined,
          laps: garminActivity.laps as any[] || undefined,
          splits: garminActivity.splits as any[] || undefined,
        } : undefined,
        wellness: wellness ? {
          totalSleepSeconds: wellness.totalSleepSeconds || undefined,
          deepSleepSeconds: wellness.deepSleepSeconds || undefined,
          lightSleepSeconds: wellness.lightSleepSeconds || undefined,
          remSleepSeconds: wellness.remSleepSeconds || undefined,
          sleepScore: wellness.sleepScore || undefined,
          sleepQuality: wellness.sleepQuality || undefined,
          averageStressLevel: wellness.averageStressLevel || undefined,
          bodyBatteryCurrent: wellness.bodyBatteryCurrent || undefined,
          bodyBatteryHigh: wellness.bodyBatteryHigh || undefined,
          bodyBatteryLow: wellness.bodyBatteryLow || undefined,
          hrvWeeklyAvg: wellness.hrvWeeklyAvg || undefined,
          hrvLastNightAvg: wellness.hrvLastNightAvg || undefined,
          hrvStatus: wellness.hrvStatus || undefined,
          steps: wellness.steps || undefined,
          restingHeartRate: wellness.restingHeartRate || undefined,
          readinessScore: wellness.readinessScore || undefined,
          avgSpO2: wellness.avgSpO2 || undefined,
          avgWakingRespirationValue: wellness.avgWakingRespirationValue || undefined,
        } : undefined,
        previousRuns: previousRuns.filter(r => r.id !== runId).slice(0, 5),
        userProfile: user ? {
          fitnessLevel: user.fitnessLevel || undefined,
          age: user.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined,
          weight: user.weight ? parseFloat(user.weight) : undefined,
        } : undefined,
        coachName,
        coachTone,
      });
      
      // Store the analysis
      await storage.createRunAnalysis(runId, { analysis });
      
      // Update run with ai insights summary
      await storage.updateRun(runId, { 
        aiInsights: JSON.stringify({
          summary: analysis.summary,
          performanceScore: analysis.performanceScore,
          highlights: analysis.highlights,
        }),
        aiCoachingNotes: analysis,
      });
      
      res.json({
        success: true,
        analysis,
        hasGarminData: !!garminActivity,
        hasWellnessData: !!wellness,
      });
    } catch (error: any) {
      console.error("Comprehensive run analysis error:", error);
      res.status(500).json({ error: "Failed to generate comprehensive analysis" });
    }
  });

  // ==================== ROUTES ENDPOINTS ====================
  
  app.get("/api/routes/user/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const routes = await storage.getUserRoutes(req.params.userId);
      res.json(routes);
    } catch (error: any) {
      console.error("Get user routes error:", error);
      res.status(500).json({ error: "Failed to get routes" });
    }
  });

  app.get("/api/routes/:id", async (req: Request, res: Response) => {
    try {
      const route = await storage.getRoute(req.params.id);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      res.json(route);
    } catch (error: any) {
      console.error("Get route error:", error);
      res.status(500).json({ error: "Failed to get route" });
    }
  });

  app.post("/api/routes", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const route = await storage.createRoute({
        ...req.body,
        userId: req.user!.userId,
      });
      res.status(201).json(route);
    } catch (error: any) {
      console.error("Create route error:", error);
      res.status(500).json({ error: "Failed to create route" });
    }
  });

  app.post("/api/routes/generate-options", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { 
        startLat, 
        startLng, 
        distance, 
        difficulty, 
        activityType, 
        terrainPreference, 
        avoidHills,
        sampleSize,
        returnTopN
      } = req.body;
      
      // Default values for new parameters
      const templatesample = sampleSize !== undefined ? parseInt(sampleSize) : 50;
      const topN = returnTopN !== undefined ? parseInt(returnTopN) : 5;
      
      console.log("[API] Generate routes request:", { 
        startLat, 
        startLng, 
        distance, 
        activityType,
        sampleSize: templatesample,
        returnTopN: topN
      });
      
      if (!startLat || !startLng || !distance) {
        return res.status(400).json({ error: "Missing required fields: startLat, startLng, distance" });
      }
      
      const routeGen = await import("./route-generation");
      const routes = await routeGen.generateRouteOptions(
        parseFloat(startLat),
        parseFloat(startLng),
        parseFloat(distance),
        activityType || 'run',
        templatesample,
        topN
      );
      
      console.log("[API] Generated routes count:", routes.length);
      
      const formattedRoutes = routes.map((route, index) => ({
        id: route.id,
        name: route.name,
        distance: route.distance,
        estimatedTime: route.duration,
        elevationGain: route.elevationGain,
        elevationLoss: route.elevationLoss,
        maxGradientPercent: route.maxGradientPercent,
        maxGradientDegrees: route.maxGradientDegrees,
        difficulty: route.difficulty,
        polyline: route.polyline,
        waypoints: route.waypoints,
        description: `${route.templateName} - ${route.distance.toFixed(1)}km circuit with ${route.elevationGain}m climb / ${route.elevationLoss}m descent`,
        turnByTurn: route.instructions,
        turnInstructions: route.turnInstructions,
        circuitQuality: {
          backtrackRatio: route.backtrackRatio,
          angularSpread: route.angularSpread,
        }
      }));
      
      res.json({ routes: formattedRoutes });
    } catch (error: any) {
      console.error("Generate routes error:", error);
      res.status(500).json({ error: "Failed to generate routes" });
    }
  });
  
  // NEW: GraphHopper-based intelligent route generation  
  app.post("/api/routes/generate-intelligent", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    console.log("🎯 Route generation endpoint HIT!");
    console.log("📦 Request body:", JSON.stringify(req.body, null, 2));
    
    try {
      const { latitude, longitude, distanceKm, preferTrails, avoidHills } = req.body;
      
      if (!latitude || !longitude || !distanceKm) {
        console.log("❌ Missing required fields!");
        return res.status(400).json({ 
          error: "Missing required fields: latitude, longitude, distanceKm" 
        });
      }
      
      console.log(`🗺️  Intelligent route generation: ${distanceKm}km at (${latitude}, ${longitude})`);
      console.log(`🌲 Trails: ${preferTrails}, ⛰️ Avoid Hills: ${avoidHills}`);
      
      console.log("⏳ Calling generateIntelligentRoute()...");
      const startTime = Date.now();
      
      const routes = await generateIntelligentRoute({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        distanceKm: parseFloat(distanceKm),
        preferTrails: preferTrails !== false,
        avoidHills: avoidHills === true,
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Route generation completed in ${elapsed}s`);
      console.log(`📊 Generated ${routes.length} routes`);
      
      res.json({
        success: true,
        routes: routes.map(route => ({
          id: route.id,
          polyline: route.polyline,
          distance: route.distance,
          elevationGain: route.elevationGain,
          elevationLoss: route.elevationLoss,
          difficulty: route.difficulty,
          estimatedTime: route.duration,
          popularityScore: route.popularityScore,
          qualityScore: route.qualityScore,
          turnInstructions: route.turnInstructions,
        })),
      });
    } catch (error: any) {
      console.error("Intelligent route generation error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to generate intelligent route" 
      });
    }
  });

  // AI Route Generation - Premium+ Plans Only
  app.post("/api/routes/generate-ai", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startLat, startLng, distance, activityType } = req.body;
      
      console.log("[API] 🤖 AI Route Generation (Premium+) request:", { startLat, startLng, distance, activityType });
      
      if (!startLat || !startLng || !distance) {
        return res.status(400).json({ error: "Missing required fields: startLat, startLng, distance" });
      }
      
      const routeGenAI = await import("./route-generation-ai");
      const routes = await routeGenAI.generateAIRoutesWithGoogle(
        parseFloat(startLat),
        parseFloat(startLng),
        parseFloat(distance),
        activityType || 'run'
      );
      
      console.log("[API] ✅ Generated AI routes count:", routes.length);
      
      const formattedRoutes = routes.map((route) => ({
        id: route.id,
        name: route.name,
        distance: route.distance,
        estimatedTime: route.duration,
        elevationGain: route.elevationGain,
        elevationLoss: route.elevationLoss,
        maxGradientPercent: route.maxGradientPercent,
        maxGradientDegrees: route.maxGradientDegrees,
        difficulty: route.difficulty,
        polyline: route.polyline,
        waypoints: route.waypoints,
        description: `${route.name} - ${route.distance.toFixed(1)}km AI-designed circuit`,
        turnByTurn: route.instructions,
        turnInstructions: route.turnInstructions,
        circuitQuality: {
          backtrackRatio: route.circuitQuality.backtrackRatio,
          angularSpread: route.circuitQuality.angularSpread,
          loopQuality: route.circuitQuality.loopQuality,
        },
      }));
      
      res.json({ routes: formattedRoutes });
    } catch (error: any) {
      console.error("Generate AI routes error:", error);
      res.status(500).json({ error: "Failed to generate routes" });
    }
  });

  // V1 Template Route Generation - Free & Lite Plans
  app.post("/api/routes/generate-template", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startLat, startLng, distance, activityType } = req.body;
      
      console.log("[API] 📐 Template Route Generation (Free/Lite) request:", { startLat, startLng, distance, activityType });
      
      if (!startLat || !startLng || !distance) {
        return res.status(400).json({ error: "Missing required fields: startLat, startLng, distance" });
      }
      
      const routeGenV1 = await import("./route-generation");
      const routes = await routeGenV1.generateRouteOptions(
        parseFloat(startLat),
        parseFloat(startLng),
        parseFloat(distance),
        activityType || 'run',
        50, // sampleSize
        5   // returnTopN
      );
      
      console.log("[API] ✅ Generated template routes count:", routes.length);
      
      const formattedRoutes = routes.map((route) => ({
        id: route.id,
        name: route.name,
        distance: route.distance,
        estimatedTime: route.duration,
        elevationGain: route.elevationGain,
        elevationLoss: route.elevationLoss,
        maxGradientPercent: route.maxGradientPercent,
        maxGradientDegrees: route.maxGradientDegrees,
        difficulty: route.difficulty,
        polyline: route.polyline,
        waypoints: route.waypoints,
        description: `${route.templateName} - ${route.distance.toFixed(1)}km circuit with ${route.elevationGain}m climb`,
        turnByTurn: route.instructions,
        turnInstructions: route.turnInstructions,
        circuitQuality: {
          backtrackRatio: route.backtrackRatio,
          angularSpread: route.angularSpread,
        },
      }));
      
      res.json({ routes: formattedRoutes });
    } catch (error: any) {
      console.error("Generate template routes error:", error);
      res.status(500).json({ error: "Failed to generate routes" });
    }
  });

  app.get("/api/routes/:id/ratings", async (req: Request, res: Response) => {
    try {
      const ratings = await storage.getRouteRatings(req.params.id);
      res.json(ratings);
    } catch (error: any) {
      console.error("Get route ratings error:", error);
      res.status(500).json({ error: "Failed to get ratings" });
    }
  });

  app.post("/api/routes/:id/ratings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rating = await storage.createRouteRating({
        ...req.body,
        userId: req.user!.userId,
      });
      res.status(201).json(rating);
    } catch (error: any) {
      console.error("Create route rating error:", error);
      res.status(500).json({ error: "Failed to create rating" });
    }
  });

  // ==================== GOALS ENDPOINTS ====================
  
  // Get goals by userId (path parameter for Android app compatibility)
  app.get("/api/goals/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.params.userId;
      console.log(`[GET /api/goals/:userId] Fetching goals for userId: ${userId}`);
      
      const rawGoals = await storage.getUserGoals(userId);
      console.log(`[GET /api/goals/:userId] Found ${rawGoals.length} goals for user ${userId}`);
      
      // Transform to match Android app's expected format
      const goals = rawGoals.map(goal => ({
        id: goal.id,
        userId: goal.userId,
        type: goal.type,
        title: goal.title,
        description: goal.description,
        notes: goal.notes,
        targetDate: goal.targetDate?.toISOString().split('T')[0], // YYYY-MM-DD
        eventName: goal.eventName,
        eventLocation: goal.eventLocation,
        distanceTarget: goal.distanceTarget,
        timeTargetSeconds: goal.timeTargetSeconds,
        healthTarget: goal.healthTarget,
        weeklyRunTarget: goal.weeklyRunTarget,
        currentProgress: goal.progressPercent ?? 0,
        isActive: goal.status === 'active',
        isCompleted: !!goal.completedAt,
        createdAt: goal.createdAt?.toISOString(),
        updatedAt: goal.updatedAt?.toISOString(),
        completedAt: goal.completedAt?.toISOString(),
      }));
      
      console.log(`[GET /api/goals/:userId] Returning ${goals.length} formatted goals`);
      res.json(goals);
    } catch (error: any) {
      console.error("[GET /api/goals/:userId] Error:", error);
      // Return empty array instead of error if no goals found
      if (error.message?.includes('not found') || error.message?.includes('No goals')) {
        console.log(`[GET /api/goals/:userId] No goals found, returning empty array`);
        return res.json([]);
      }
      res.status(500).json({ error: "Failed to get goals" });
    }
  });

  app.post("/api/goals", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Transform Android app format to backend format
      const goalData = {
        userId: req.user!.userId, // Always use authenticated user, ignore body userId
        type: req.body.type,
        title: req.body.title,
        description: req.body.description || null,
        notes: req.body.notes || null,
        targetDate: req.body.targetDate ? new Date(req.body.targetDate) : null,
        eventName: req.body.eventName || null,
        eventLocation: req.body.eventLocation || null,
        distanceTarget: req.body.distanceTarget || null,
        timeTargetSeconds: req.body.timeTargetSeconds || null,
        healthTarget: req.body.healthTarget || null,
        weeklyRunTarget: req.body.weeklyRunTarget || null,
        status: 'active',
        progressPercent: 0,
      };
      
      const rawGoal = await storage.createGoal(goalData);
      
      // Transform response to match Android app's expected format
      const goal = {
        id: rawGoal.id,
        userId: rawGoal.userId,
        type: rawGoal.type,
        title: rawGoal.title,
        description: rawGoal.description,
        notes: rawGoal.notes,
        targetDate: rawGoal.targetDate?.toISOString().split('T')[0],
        eventName: rawGoal.eventName,
        eventLocation: rawGoal.eventLocation,
        distanceTarget: rawGoal.distanceTarget,
        timeTargetSeconds: rawGoal.timeTargetSeconds,
        healthTarget: rawGoal.healthTarget,
        weeklyRunTarget: rawGoal.weeklyRunTarget,
        currentProgress: rawGoal.progressPercent ?? 0,
        isActive: rawGoal.status === 'active',
        isCompleted: !!rawGoal.completedAt,
        createdAt: rawGoal.createdAt?.toISOString(),
        updatedAt: rawGoal.updatedAt?.toISOString(),
        completedAt: rawGoal.completedAt?.toISOString(),
      };
      
      res.status(201).json(goal);
    } catch (error: any) {
      console.error("Create goal error:", error);
      res.status(500).json({ error: "Failed to create goal" });
    }
  });

  app.put("/api/goals/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Transform Android app format to backend format
      const updateData = {
        type: req.body.type,
        title: req.body.title,
        description: req.body.description || null,
        notes: req.body.notes || null,
        targetDate: req.body.targetDate ? new Date(req.body.targetDate) : null,
        eventName: req.body.eventName || null,
        eventLocation: req.body.eventLocation || null,
        distanceTarget: req.body.distanceTarget || null,
        timeTargetSeconds: req.body.timeTargetSeconds || null,
        healthTarget: req.body.healthTarget || null,
        weeklyRunTarget: req.body.weeklyRunTarget || null,
      };
      
      const rawGoal = await storage.updateGoal(req.params.id, updateData);
      if (!rawGoal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      
      // Transform response to match Android app's expected format
      const goal = {
        id: rawGoal.id,
        userId: rawGoal.userId,
        type: rawGoal.type,
        title: rawGoal.title,
        description: rawGoal.description,
        notes: rawGoal.notes,
        targetDate: rawGoal.targetDate?.toISOString().split('T')[0],
        eventName: rawGoal.eventName,
        eventLocation: rawGoal.eventLocation,
        distanceTarget: rawGoal.distanceTarget,
        timeTargetSeconds: rawGoal.timeTargetSeconds,
        healthTarget: rawGoal.healthTarget,
        weeklyRunTarget: rawGoal.weeklyRunTarget,
        currentProgress: rawGoal.progressPercent ?? 0,
        isActive: rawGoal.status === 'active',
        isCompleted: !!rawGoal.completedAt,
        createdAt: rawGoal.createdAt?.toISOString(),
        updatedAt: rawGoal.updatedAt?.toISOString(),
        completedAt: rawGoal.completedAt?.toISOString(),
      };
      
      res.json(goal);
    } catch (error: any) {
      console.error("Update goal error:", error);
      res.status(500).json({ error: "Failed to update goal" });
    }
  });

  app.delete("/api/goals/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await storage.deleteGoal(req.params.id);
      res.status(204).send(); // No Content - standard for DELETE success
    } catch (error: any) {
      console.error("Delete goal error:", error);
      res.status(500).json({ error: "Failed to delete goal" });
    }
  });

  // ==================== FRIENDS ENDPOINTS ====================
  
  // Alias for /api/friends to match Android app expectations
  app.get("/api/users/:userId/friends", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      console.log(`[GET /api/users/:userId/friends] Fetching friends for userId: ${userId}`);
      
      const friends = await storage.getFriends(userId);
      res.json(friends.map(f => ({
        id: f.id,
        name: f.name,
        email: f.email,
        profilePic: f.profilePic,
        userCode: f.userCode,
      })));
      
      console.log(`[GET /api/users/:userId/friends] Returning ${friends.length} friends`);
    } catch (error: any) {
      console.error("[GET /api/users/:userId/friends] Error:", error);
      res.status(500).json({ error: "Failed to fetch friends" });
    }
  });

  // ==================== EVENTS ENDPOINTS ====================
  
  app.get("/api/events/grouped", async (req: Request, res: Response) => {
    try {
      const events = await storage.getEvents();
      // Group by country
      const grouped: Record<string, any[]> = {};
      events.forEach(event => {
        if (!grouped[event.country]) {
          grouped[event.country] = [];
        }
        grouped[event.country].push(event);
      });
      res.json(grouped);
    } catch (error: any) {
      console.error("Get events error:", error);
      res.status(500).json({ error: "Failed to get events" });
    }
  });

  // ==================== NOTIFICATIONS ENDPOINTS ====================
  
  app.get("/api/notifications", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = String(req.query.userId || req.user?.userId);
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error: any) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  app.put("/api/notifications/:id/read", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  app.put("/api/notifications/mark-all-read", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await storage.markAllNotificationsRead(req.user!.userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Mark all notifications read error:", error);
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });

  app.delete("/api/notifications/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete notification error:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // ==================== NOTIFICATION PREFERENCES ====================
  
  app.get("/api/notification-preferences/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const prefs = await storage.getNotificationPreferences(req.params.userId);
      res.json(prefs || {});
    } catch (error: any) {
      console.error("Get notification preferences error:", error);
      res.status(500).json({ error: "Failed to get preferences" });
    }
  });

  app.put("/api/notification-preferences/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const prefs = await storage.updateNotificationPreferences(req.params.userId, req.body);
      res.json(prefs);
    } catch (error: any) {
      console.error("Update notification preferences error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // ==================== LIVE SESSIONS ====================
  
  app.get("/api/live-sessions/:sessionId", async (req: Request, res: Response) => {
    try {
      const session = await storage.getLiveSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error: any) {
      console.error("Get live session error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.get("/api/users/:userId/live-session", async (req: Request, res: Response) => {
    try {
      const session = await storage.getUserLiveSession(req.params.userId);
      res.json(session || null);
    } catch (error: any) {
      console.error("Get user live session error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.put("/api/live-sessions/sync", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId, ...data } = req.body;
      if (sessionId) {
        const session = await storage.updateLiveSession(sessionId, data);
        res.json(session);
      } else {
        const session = await storage.createLiveSession({
          ...data,
          userId: req.user!.userId,
        });
        res.json(session);
      }
    } catch (error: any) {
      console.error("Sync live session error:", error);
      res.status(500).json({ error: "Failed to sync session" });
    }
  });

  app.post("/api/live-sessions/end-by-key", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionKey } = req.body;
      await storage.endLiveSession(sessionKey);
      res.json({ success: true });
    } catch (error: any) {
      console.error("End live session error:", error);
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  // ==================== GROUP RUNS ====================
  
  app.get("/api/group-runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const groupRuns = await storage.getGroupRuns();
      res.json(groupRuns);
    } catch (error: any) {
      console.error("Get group runs error:", error);
      res.status(500).json({ error: "Failed to get group runs" });
    }
  });

  app.get("/api/group-runs/:id", async (req: Request, res: Response) => {
    try {
      const groupRun = await storage.getGroupRun(req.params.id);
      if (!groupRun) {
        return res.status(404).json({ error: "Group run not found" });
      }
      res.json(groupRun);
    } catch (error: any) {
      console.error("Get group run error:", error);
      res.status(500).json({ error: "Failed to get group run" });
    }
  });

  app.post("/api/group-runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const inviteToken = `GR${Date.now().toString(36).toUpperCase()}`;
      const groupRun = await storage.createGroupRun({
        ...req.body,
        hostUserId: req.user!.userId,
        inviteToken,
      });
      res.status(201).json(groupRun);
    } catch (error: any) {
      console.error("Create group run error:", error);
      res.status(500).json({ error: "Failed to create group run" });
    }
  });

  app.post("/api/group-runs/:id/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const participant = await storage.joinGroupRun(req.params.id, req.user!.userId);
      res.status(201).json(participant);
    } catch (error: any) {
      console.error("Join group run error:", error);
      res.status(500).json({ error: "Failed to join group run" });
    }
  });

  // ==================== AI ENDPOINTS (Direct OpenAI) ====================
  
  app.post("/api/ai/coach", async (req: Request, res: Response) => {
    try {
      const { message, context } = req.body;
      const aiService = await import("./ai-service");
      const response = await aiService.getCoachingResponse(message, context || {});
      res.json({ message: response });
    } catch (error: any) {
      console.error("AI coach error:", error);
      res.status(500).json({ error: "Failed to get AI coaching" });
    }
  });

  app.post("/api/ai/tts", async (req: Request, res: Response) => {
    try {
      const { text, voice } = req.body;
      const aiService = await import("./ai-service");
      const audioBuffer = await aiService.generateTTS(text, voice || "alloy");
      res.set("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("AI TTS error:", error);
      res.status(500).json({ error: "Failed to generate TTS" });
    }
  });

  app.post("/api/ai/coaching", async (req: Request, res: Response) => {
    try {
      const { message, context } = req.body;
      const aiService = await import("./ai-service");
      const response = await aiService.getCoachingResponse(message, context || {});
      res.json({ message: response });
    } catch (error: any) {
      console.error("AI coaching error:", error);
      res.status(500).json({ error: "Failed to get coaching response" });
    }
  });

  app.post("/api/ai/run-summary", async (req: Request, res: Response) => {
    try {
      const { lat, lng, distance, elevationGain, elevationLoss, difficulty, activityType, targetTime, firstTurnInstruction } = req.body;
      
      // Fetch real weather from Open-Meteo
      let weatherData = null;
      try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        if (weatherRes.ok) {
          const data = await weatherRes.json();
          const current = data.current;
          
          const weatherCodeToCondition = (code: number): string => {
            if (code === 0) return "Clear";
            if (code <= 3) return "Partly Cloudy";
            if (code <= 49) return "Foggy";
            if (code <= 59) return "Drizzle";
            if (code <= 69) return "Rain";
            if (code <= 79) return "Snow";
            if (code <= 84) return "Showers";
            if (code <= 94) return "Thunderstorm";
            return "Unknown";
          };
          
          weatherData = {
            temp: current.temperature_2m,
            feelsLike: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            windSpeed: Math.round(current.wind_speed_10m),
            condition: weatherCodeToCondition(current.weather_code),
          };
        }
      } catch (e) {
        console.log("Weather fetch failed, continuing without weather");
      }
      
      // Build terrain analysis based on facts
      const distanceKm = distance?.toFixed(1) || '?';
      const elevGain = Math.round(elevationGain || 0);
      const elevLoss = Math.round(elevationLoss || elevationGain || 0);
      
      let terrainType = "flat";
      if (elevGain > 100) terrainType = "hilly";
      else if (elevGain > 50) terrainType = "undulating";
      
      const terrainAnalysis = `${distanceKm}km ${terrainType} circuit with ${elevGain}m climb and ${elevLoss}m descent.`;
      
      // Calculate target pace if target time provided
      let targetPace = null;
      if (targetTime && distance) {
        const totalMinutes = (targetTime.hours || 0) * 60 + (targetTime.minutes || 0) + (targetTime.seconds || 0) / 60;
        if (totalMinutes > 0) {
          const paceMinPerKm = totalMinutes / distance;
          const paceMins = Math.floor(paceMinPerKm);
          const paceSecs = Math.round((paceMinPerKm - paceMins) * 60);
          targetPace = `${paceMins}:${paceSecs.toString().padStart(2, '0')} min/km`;
        }
      }
      
      // Simple motivational statement based on difficulty
      const motivationalStatements = [
        "You've got this. One step at a time.",
        "Trust your training and enjoy the run.",
        "Every kilometre is progress. Let's go!",
        "Today is your day. Make it count.",
        "Focus, breathe, and run your best.",
      ];
      const coachAdvice = motivationalStatements[Math.floor(Math.random() * motivationalStatements.length)];
      
      res.json({
        weatherSummary: weatherData ? null : "Weather unavailable",
        terrainAnalysis,
        coachAdvice,
        targetPace,
        firstTurnInstruction: firstTurnInstruction || "Follow the highlighted route",
        warnings: [],
        temperature: weatherData?.temp,
        conditions: weatherData?.condition,
        humidity: weatherData?.humidity,
        windSpeed: weatherData?.windSpeed,
        feelsLike: weatherData?.feelsLike,
      });
    } catch (error: any) {
      console.error("AI run summary error:", error);
      res.status(500).json({ error: "Failed to get run summary" });
    }
  });

  app.post("/api/ai/pre-run-summary", async (req: Request, res: Response) => {
    try {
      const { route, weather } = req.body;
      const aiService = await import("./ai-service");
      const summary = await aiService.generatePreRunSummary(route, weather);
      res.json(summary);
    } catch (error: any) {
      console.error("AI pre-run summary error:", error);
      res.status(500).json({ error: "Failed to get pre-run summary" });
    }
  });

  app.post("/api/ai/elevation-coaching", async (req: Request, res: Response) => {
    try {
      const aiService = await import("./ai-service");
      const tip = await aiService.getElevationCoaching(req.body);
      res.json({ message: tip });
    } catch (error: any) {
      console.error("AI elevation coaching error:", error);
      res.status(500).json({ error: "Failed to get elevation coaching" });
    }
  });
  
  app.post("/api/ai/pace-update", async (req: Request, res: Response) => {
    try {
      const aiService = await import("./ai-service");
      const message = await aiService.generatePaceUpdate(req.body);
      res.json({ message });
    } catch (error: any) {
      console.error("AI pace update error:", error);
      res.status(500).json({ error: "Failed to get pace update" });
    }
  });

  app.post("/api/ai/phase-coaching", async (req: Request, res: Response) => {
    try {
      const aiService = await import("./ai-service");
      const message = await aiService.generatePhaseCoaching(req.body);
      res.json({ message });
    } catch (error: any) {
      console.error("AI phase coaching error:", error);
      res.status(500).json({ error: "Failed to get phase coaching" });
    }
  });

  app.post("/api/ai/struggle-coaching", async (req: Request, res: Response) => {
    try {
      const aiService = await import("./ai-service");
      const message = await aiService.generateStruggleCoaching(req.body);
      res.json({ message });
    } catch (error: any) {
      console.error("AI struggle coaching error:", error);
      res.status(500).json({ error: "Failed to get struggle coaching" });
    }
  });

  app.post("/api/runs/:id/ai-insights", async (req: Request, res: Response) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      const aiService = await import("./ai-service");
      const insights = await aiService.generateRunSummary({
        ...run,
        ...req.body
      });
      await storage.updateRun(req.params.id, { aiInsights: JSON.stringify(insights) });
      res.json(insights);
    } catch (error: any) {
      console.error("AI insights error:", error);
      res.status(500).json({ error: "Failed to get AI insights" });
    }
  });

  // ==================== WEATHER ENDPOINTS (Open-Meteo API) ====================
  
  app.get("/api/weather/current", async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng are required" });
      }
      
      // Use Open-Meteo API (free, no API key required)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status}`);
      }
      
      const data = await response.json();
      const current = data.current;
      
      // Map WMO weather codes to conditions
      const weatherCodeToCondition = (code: number): string => {
        if (code === 0) return "Clear";
        if (code <= 3) return "Partly Cloudy";
        if (code <= 49) return "Foggy";
        if (code <= 59) return "Drizzle";
        if (code <= 69) return "Rain";
        if (code <= 79) return "Snow";
        if (code <= 84) return "Showers";
        if (code <= 94) return "Thunderstorm";
        return "Unknown";
      };
      
      res.json({
        temp: current.temperature_2m,
        feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        windDirection: current.wind_direction_10m,
        condition: weatherCodeToCondition(current.weather_code),
        weatherCode: current.weather_code,
      });
    } catch (error: any) {
      console.error("Weather error:", error);
      res.status(500).json({ error: "Failed to get weather" });
    }
  });

  app.get("/api/weather/full", async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng are required" });
      }
      
      // Use Open-Meteo API for full forecast
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=1&timezone=auto`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status}`);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Weather error:", error);
      res.status(500).json({ error: "Failed to get weather" });
    }
  });

  // ==================== GEOCODING (Proxy) ====================
  
  app.get("/api/geocode/reverse", async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.query;
      const response = await fetch(`https://airuncoach.live/api/geocode/reverse?lat=${lat}&lng=${lng}`);
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Geocode error:", error);
      res.status(500).json({ error: "Failed to geocode" });
    }
  });

  // ==================== SUBSCRIPTIONS (Placeholder) ====================
  
  app.get("/api/subscriptions/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      res.json({
        tier: user?.subscriptionTier || "free",
        status: user?.subscriptionStatus || "inactive",
        entitlementType: user?.entitlementType,
        expiresAt: user?.entitlementExpiresAt,
      });
    } catch (error: any) {
      console.error("Get subscription status error:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // ==================== PUSH SUBSCRIPTIONS ====================
  
  app.post("/api/push-subscriptions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Implementation would store push subscription
      res.json({ success: true });
    } catch (error: any) {
      console.error("Push subscription error:", error);
      res.status(500).json({ error: "Failed to save push subscription" });
    }
  });

  // ==================== COACHING LOGS ====================
  
  app.post("/api/coaching-logs/:sessionKey", async (req: Request, res: Response) => {
    try {
      // Implementation would store coaching logs
      res.json({ success: true });
    } catch (error: any) {
      console.error("Coaching log error:", error);
      res.status(500).json({ error: "Failed to save coaching log" });
    }
  });

  // ==================== CONNECTED DEVICES ENDPOINTS ====================
  
  app.get("/api/connected-devices", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const devices = await storage.getConnectedDevices(req.user!.userId);
      res.json(devices);
    } catch (error: any) {
      console.error("Get connected devices error:", error);
      res.status(500).json({ error: "Failed to get connected devices" });
    }
  });

  app.post("/api/connected-devices", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { deviceType, deviceName, deviceId } = req.body;
      
      if (!deviceType) {
        return res.status(400).json({ error: "deviceType is required" });
      }
      
      // Check if device already connected
      const existing = await storage.getConnectedDevices(req.user!.userId);
      const existingDevice = existing.find(d => d.deviceType === deviceType && d.isActive);
      
      if (existingDevice) {
        return res.status(400).json({ error: "Device already connected" });
      }
      
      const device = await storage.createConnectedDevice({
        userId: req.user!.userId,
        deviceType,
        deviceName: deviceName || `${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Device`,
        deviceId,
      });
      
      res.status(201).json(device);
    } catch (error: any) {
      console.error("Connect device error:", error);
      res.status(500).json({ error: "Failed to connect device" });
    }
  });

  app.delete("/api/connected-devices/:deviceId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const deviceId = req.params.deviceId;
      
      if (!deviceId || deviceId.trim() === "") {
        return res.status(400).json({ error: "Invalid device ID" });
      }
      
      // Verify device belongs to user before deleting
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      
      // Delete (deactivate) the device
      await storage.deleteConnectedDevice(deviceId);
      
      console.log(`✅ Device ${deviceId} (${device.deviceType}) disconnected for user ${req.user!.userId}`);
      res.status(204).send(); // No content - successful deletion
    } catch (error: any) {
      console.error("Disconnect device error:", error);
      res.status(500).json({ error: "Failed to disconnect device" });
    }
  });

  app.delete("/api/connected-devices/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const device = await storage.getConnectedDevice(req.params.id);
      
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      
      if (device.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await storage.deleteConnectedDevice(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Disconnect device error:", error);
      res.status(500).json({ error: "Failed to disconnect device" });
    }
  });

  // Sync device data (for post-run sync from watches)
  app.post("/api/device-data/sync", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId, deviceType, heartRateZones, vo2Max, trainingEffect, recoveryTime, stressLevel, bodyBattery, caloriesBurned, rawData } = req.body;
      
      const deviceData = await storage.createDeviceData({
        userId: req.user!.userId,
        runId,
        deviceType,
        heartRateZones,
        vo2Max,
        trainingEffect,
        recoveryTime,
        stressLevel,
        bodyBattery,
        caloriesBurned,
        rawData,
      });
      
      // Update connected device lastSyncAt
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const device = devices.find(d => d.deviceType === deviceType && d.isActive);
      if (device) {
        await storage.updateConnectedDevice(device.id, { lastSyncAt: new Date() });
      }
      
      res.json(deviceData);
    } catch (error: any) {
      console.error("Sync device data error:", error);
      res.status(500).json({ error: "Failed to sync device data" });
    }
  });

  // Get device data for a run
  app.get("/api/runs/:id/device-data", async (req: Request, res: Response) => {
    try {
      const deviceData = await storage.getDeviceDataByRun(req.params.id);
      res.json(deviceData);
    } catch (error: any) {
      console.error("Get device data error:", error);
      res.status(500).json({ error: "Failed to get device data" });
    }
  });

  // ==================== GARMIN OAUTH ENDPOINTS ====================
  
  // Garmin success page
  app.get("/garmin-success", (req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Garmin Connected - AI Run Coach</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
          }
          .container { text-align: center; padding: 40px; max-width: 400px; }
          .success-icon {
            width: 80px; height: 80px;
            background: linear-gradient(135deg, #00D4FF, #00a8cc);
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 24px;
            font-size: 40px;
          }
          h1 { font-size: 24px; margin-bottom: 16px; color: #00D4FF; }
          p { color: #a0a0a0; line-height: 1.6; margin-bottom: 24px; }
          .instruction {
            background: rgba(0, 212, 255, 0.1);
            border: 1px solid rgba(0, 212, 255, 0.3);
            border-radius: 12px;
            padding: 16px;
            margin-top: 20px;
          }
          .instruction p { color: #00D4FF; margin: 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">&#10003;</div>
          <h1>Garmin Connected!</h1>
          <p>Your Garmin account has been successfully connected to AI Run Coach.</p>
          <div class="instruction">
            <p>You can now close this window and return to the app to sync your wellness data.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  // Initiate Garmin OAuth flow
  app.get("/api/auth/garmin", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const garminService = await import("./garmin-service");
      // Get app_redirect and history_days from query params (sent by mobile app)
      const appRedirect = req.query.app_redirect as string || 'airuncoach://connected-devices';
      const historyDays = parseInt(req.query.history_days as string || '30', 10);
      // Generate a simple nonce for PKCE verifier lookup (avoids URL encoding issues)
      const nonce = Date.now().toString() + Math.random().toString(36).substring(2, 10);
      // Encode userId, appRedirect, historyDays, and nonce in state (base64 encoded JSON)
      const stateData = { userId: req.user!.userId, appRedirect, historyDays, nonce };
      const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
      // Use dynamic redirect URI based on request host
      let host = req.get('host') || '';
      
      // Only add port 5000 for local development, NOT for production Replit
      const isProduction = host.includes('replit.app');
      if (!isProduction && !host.includes(':5000') && !host.includes(':')) {
        host = host.split(':')[0] + ':5000';
      }
      
      const baseUrl = `https://${host}`;
      const redirectUri = `${baseUrl}/api/auth/garmin/callback`;
      
      console.log("=== GARMIN OAUTH DEBUG ===");
      console.log("Request host:", req.get('host'));
      console.log("Modified host:", host);
      console.log("Base URL:", baseUrl);
      console.log("Redirect URI being sent:", redirectUri);
      console.log("App redirect (after auth):", appRedirect);
      console.log("Nonce for PKCE:", nonce);
      console.log("State data:", stateData);
      
      const authUrl = await garminService.getGarminAuthUrl(redirectUri, state, nonce);
      console.log("Full auth URL:", authUrl);
      console.log("=========================");

      res.json({ authUrl, state });
    } catch (error: any) {
      console.error("Garmin auth initiation error:", error);
      res.status(500).json({ error: "Failed to initiate Garmin authorization" });
    }
  });

  // Garmin OAuth callback
  app.get("/api/auth/garmin/callback", async (req: Request, res: Response) => {
    console.log("=== GARMIN CALLBACK RECEIVED ===");
    console.log("Query params:", req.query);
    console.log("Full URL:", req.originalUrl);
    console.log("================================");
    try {
      const { code, state, error } = req.query;
      
      // Decode state to get userId, appRedirect, historyDays, and nonce
      let stateData: { userId: string; appRedirect: string; historyDays?: number; nonce: string } | null = null;
      let appRedirectUrl = 'airuncoach://connected-devices';
      let userId = '';
      let historyDays = 30;
      let nonce = '';
      
      try {
        stateData = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
        appRedirectUrl = stateData?.appRedirect || appRedirectUrl;
        userId = stateData?.userId || '';
        historyDays = stateData?.historyDays || 30;
        nonce = stateData?.nonce || '';
        console.log("Garmin callback - decoded state:", { userId, appRedirect: appRedirectUrl, historyDays, nonce });
      } catch (e) {
        console.error("Garmin callback - failed to decode state:", e);
        const errorUrl = appRedirectUrl.includes('?') 
          ? `${appRedirectUrl}&garmin=error&message=invalid_state`
          : `${appRedirectUrl}?garmin=error&message=invalid_state`;
        return res.redirect(errorUrl);
      }
      
      if (error) {
        console.error("Garmin OAuth error:", error);
        const errorUrl = appRedirectUrl.includes('?') 
          ? `${appRedirectUrl}&garmin=error&message=${encodeURIComponent(error as string)}`
          : `${appRedirectUrl}?garmin=error&message=${encodeURIComponent(error as string)}`;
        return res.redirect(errorUrl);
      }
      
      if (!code || !state || !nonce) {
        console.error("Garmin callback - missing params:", { code: !!code, state: !!state, nonce: !!nonce });
        const errorUrl = appRedirectUrl.includes('?') 
          ? `${appRedirectUrl}&garmin=error&message=missing_params`
          : `${appRedirectUrl}?garmin=error&message=missing_params`;
        return res.redirect(errorUrl);
      }
      
      const garminService = await import("./garmin-service");
      // Use dynamic redirect URI based on request host
      let host = req.get('host') || '';
      
      // Only add port 5000 for local development, NOT for production Replit
      const isProduction = host.includes('replit.app');
      if (!isProduction && !host.includes(':5000') && !host.includes(':')) {
        host = host.split(':')[0] + ':5000';
      }
      
      const baseUrl = `https://${host}`;
      const redirectUri = `${baseUrl}/api/auth/garmin/callback`;
      
      const tokens = await garminService.exchangeGarminCode(
        code as string,
        redirectUri,
        nonce
      );
      
      // Check if device already connected
      const existingDevices = await storage.getConnectedDevices(userId);
      const existingGarmin = existingDevices.find(d => d.deviceType === 'garmin' && d.isActive);
      
      if (existingGarmin) {
        // Update existing device with new tokens
        await storage.updateConnectedDevice(existingGarmin.id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          deviceId: tokens.athleteId,
          lastSyncAt: new Date(),
        });
      } else {
        // Create new connected device
        await storage.createConnectedDevice({
          userId,
          deviceType: 'garmin',
          deviceName: 'Garmin Watch',
          deviceId: tokens.athleteId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          lastSyncAt: new Date(),
        });
      }
      
      // Sync historical activities if historyDays > 0
      if (historyDays > 0) {
        try {
          console.log(`📅 Syncing historical Garmin activities for the last ${historyDays} days...`);
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - historyDays);
          const endDate = new Date();
          
          // Trigger background sync (don't wait for it)
          garminService.syncGarminActivities(
            userId,
            tokens.accessToken,
            startDate.toISOString(),
            endDate.toISOString()
          ).then(() => {
            console.log(`✅ Historical Garmin activities synced for user ${userId}`);
          }).catch((err: any) => {
            console.error(`❌ Failed to sync historical Garmin activities: ${err.message}`);
          });
        } catch (error: any) {
          console.error("Error initiating historical sync:", error);
          // Don't fail the connection if historical sync fails
        }
      } else {
        console.log("⏭️ Skipping historical activity sync (historyDays = 0)");
      }
      
      // Redirect back to mobile app with success using HTML page
      const successUrl = appRedirectUrl.includes('?') 
        ? `${appRedirectUrl}&garmin=success` 
        : `${appRedirectUrl}?garmin=success`;
      console.log("Garmin OAuth successful, redirecting to:", successUrl);
      
      // Return HTML page that triggers deep link (browsers handle this better than direct redirects)
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Garmin Connected</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            .icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 10px;
            }
            p {
              opacity: 0.9;
              margin-bottom: 20px;
            }
            .button {
              background: white;
              color: #667eea;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✓</div>
            <h1>Garmin Connected!</h1>
            <p>Your Garmin account has been successfully connected. Returning to AI Run Coach...</p>
            <a href="${successUrl}" class="button">Open App</a>
          </div>
          <script>
            // Attempt automatic redirect to app
            setTimeout(function() {
              window.location.href = "${successUrl}";
            }, 1000);
            
            // Fallback: If app doesn't open after 3 seconds, user can tap button
            setTimeout(function() {
              document.querySelector('.button').style.display = 'inline-block';
            }, 3000);
          </script>
        </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Garmin callback error:", error);
      // Fallback redirect - decode state if possible to get appRedirect
      let fallbackRedirect = 'airuncoach://connected-devices';
      try {
        const { state } = req.query;
        if (state) {
          const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
          fallbackRedirect = stateData?.appRedirect || fallbackRedirect;
        }
      } catch (e) { /* ignore */ }
      const errorUrl = fallbackRedirect.includes('?') 
        ? `${fallbackRedirect}&garmin=error&message=${encodeURIComponent(error.message)}`
        : `${fallbackRedirect}?garmin=error&message=${encodeURIComponent(error.message)}`;
      res.redirect(errorUrl);
    }
  });

  // Sync activities from Garmin
  app.post("/api/garmin/sync", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const garminDevice = devices.find(d => d.deviceType === 'garmin' && d.isActive);
      
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }
      
      const garminService = await import("./garmin-service");
      
      // Refresh token if needed
      let accessToken = garminDevice.accessToken;
      if (garminDevice.tokenExpiresAt && new Date(garminDevice.tokenExpiresAt) < new Date()) {
        const newTokens = await garminService.refreshGarminToken(garminDevice.refreshToken!);
        accessToken = newTokens.accessToken;
        
        await storage.updateConnectedDevice(garminDevice.id, {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + newTokens.expiresIn * 1000),
        });
      }
      
      // Fetch recent activities (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const activities = await garminService.getGarminActivities(accessToken, thirtyDaysAgo);
      
      // Update last sync time
      await storage.updateConnectedDevice(garminDevice.id, { lastSyncAt: new Date() });
      
      res.json({ 
        success: true, 
        activitiesFound: activities.length,
        activities: activities.map(garminService.parseGarminActivity)
      });
    } catch (error: any) {
      console.error("Garmin sync error:", error);
      res.status(500).json({ error: "Failed to sync Garmin data" });
    }
  });

  // Get Garmin health summary for coaching context
  app.get("/api/garmin/health-summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const garminDevice = devices.find(d => d.deviceType === 'garmin' && d.isActive);
      
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }
      
      const garminService = await import("./garmin-service");
      
      // Refresh token if needed
      let accessToken = garminDevice.accessToken;
      if (garminDevice.tokenExpiresAt && new Date(garminDevice.tokenExpiresAt) < new Date()) {
        const newTokens = await garminService.refreshGarminToken(garminDevice.refreshToken!);
        accessToken = newTokens.accessToken;
        
        await storage.updateConnectedDevice(garminDevice.id, {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + newTokens.expiresIn * 1000),
        });
      }
      
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Fetch various health metrics in parallel
      const [dailySummary, heartRateData, stressData] = await Promise.all([
        garminService.getGarminDailySummary(accessToken, today).catch(() => null),
        garminService.getGarminHeartRateData(accessToken, today).catch(() => null),
        garminService.getGarminStressData(accessToken, today).catch(() => null),
      ]);
      
      res.json({
        dailySummary,
        heartRateData,
        stressData,
        lastSyncAt: garminDevice.lastSyncAt,
      });
    } catch (error: any) {
      console.error("Garmin health summary error:", error);
      res.status(500).json({ error: "Failed to get Garmin health summary" });
    }
  });

  // Import a specific Garmin activity as a run
  app.post("/api/garmin/import-activity", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { activityId } = req.body;
      
      if (!activityId) {
        return res.status(400).json({ error: "activityId is required" });
      }
      
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const garminDevice = devices.find(d => d.deviceType === 'garmin' && d.isActive);
      
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }
      
      const garminService = await import("./garmin-service");
      
      // Get detailed activity
      const activityDetail = await garminService.getGarminActivityDetail(garminDevice.accessToken, activityId);
      const parsed = garminService.parseGarminActivity(activityDetail);
      
      // Create a run record from the Garmin activity
      const run = await storage.createRun({
        userId: req.user!.userId,
        distance: parsed.distance,
        duration: parsed.duration,
        avgPace: parsed.averagePace ? `${Math.floor(parsed.averagePace)}:${Math.round((parsed.averagePace % 1) * 60).toString().padStart(2, '0')}` : undefined,
        elevationGain: parsed.elevationGain,
        calories: parsed.calories,
        difficulty: 'moderate',
        gpsTrack: activityDetail.polyline ? { polyline: activityDetail.polyline } : undefined,
      });
      
      // Store device data with the run
      await storage.createDeviceData({
        userId: req.user!.userId,
        runId: run.id,
        deviceType: 'garmin',
        activityId: parsed.activityId,
        vo2Max: parsed.vo2Max,
        trainingEffect: parsed.trainingEffect,
        recoveryTime: parsed.recoveryTime ? parsed.recoveryTime * 60 : undefined, // Convert to hours
        caloriesBurned: parsed.calories,
        rawData: activityDetail,
      });
      
      res.json({ success: true, run, activity: parsed });
    } catch (error: any) {
      console.error("Garmin import activity error:", error);
      res.status(500).json({ error: "Failed to import Garmin activity" });
    }
  });

  // Garmin Wellness Data - Sync comprehensive wellness metrics
  app.post("/api/garmin/wellness/sync", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date } = req.body;
      const targetDate = date ? new Date(date) : new Date();
      
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const garminDevice = devices.find(d => d.deviceType === 'garmin' && d.isActive);
      
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }
      
      const garminService = await import("./garmin-service");
      
      // Get comprehensive wellness data
      const wellness = await garminService.getGarminComprehensiveWellness(garminDevice.accessToken, targetDate);
      
      console.log("[Wellness Sync] Received wellness data:", JSON.stringify(wellness, null, 2));
      
      // Store in database
      const dateStr = wellness.date;
      
      // Check if we already have data for this date
      const existing = await db.query.garminWellnessMetrics.findFirst({
        where: (metrics, { and, eq }) => and(
          eq(metrics.userId, req.user!.userId),
          eq(metrics.date, dateStr)
        )
      });
      
      const wellnessRecord = {
        userId: req.user!.userId,
        date: dateStr,
        
        // Sleep
        totalSleepSeconds: wellness.sleep?.totalSleepSeconds,
        deepSleepSeconds: wellness.sleep?.deepSleepSeconds,
        lightSleepSeconds: wellness.sleep?.lightSleepSeconds,
        remSleepSeconds: wellness.sleep?.remSleepSeconds,
        awakeSleepSeconds: wellness.sleep?.awakeSleepSeconds,
        sleepScore: wellness.sleep?.sleepScore,
        sleepQuality: wellness.sleep?.sleepQuality,
        
        // Stress
        averageStressLevel: wellness.stress?.averageStressLevel,
        maxStressLevel: wellness.stress?.maxStressLevel,
        stressDuration: wellness.stress?.stressDuration,
        restDuration: wellness.stress?.restDuration,
        stressQualifier: wellness.stress?.stressQualifier,
        
        // Body Battery
        bodyBatteryHigh: wellness.bodyBattery?.highestValue,
        bodyBatteryLow: wellness.bodyBattery?.lowestValue,
        bodyBatteryCurrent: wellness.bodyBattery?.currentValue,
        bodyBatteryCharged: wellness.bodyBattery?.chargedValue,
        bodyBatteryDrained: wellness.bodyBattery?.drainedValue,
        
        // HRV
        hrvWeeklyAvg: wellness.hrv?.weeklyAvg,
        hrvLastNightAvg: wellness.hrv?.lastNightAvg,
        hrvLastNight5MinHigh: wellness.hrv?.lastNight5MinHigh,
        hrvStatus: wellness.hrv?.hrvStatus,
        hrvFeedback: wellness.hrv?.feedbackPhrase,
        
        // Heart Rate
        restingHeartRate: wellness.heartRate?.restingHeartRate,
        minHeartRate: wellness.heartRate?.minHeartRate,
        maxHeartRate: wellness.heartRate?.maxHeartRate,
        averageHeartRate: wellness.heartRate?.averageHeartRate,
        
        // Readiness
        readinessScore: wellness.readiness?.score,
        readinessRecommendation: wellness.readiness?.recommendation,
        
        rawData: wellness,
      };
      
      console.log("[Wellness Sync] Record to insert/update:", JSON.stringify(wellnessRecord, null, 2));
      console.log("[Wellness Sync] Existing record:", existing ? existing.id : "none");
      
      try {
        if (existing) {
          // Update existing record
          await db.update(garminWellnessMetrics)
            .set({ ...wellnessRecord, syncedAt: new Date() })
            .where(eq(garminWellnessMetrics.id, existing.id));
          console.log("[Wellness Sync] Updated existing record:", existing.id);
        } else {
          // Insert new record
          await db.insert(garminWellnessMetrics).values(wellnessRecord);
          console.log("[Wellness Sync] Inserted new record");
        }
      } catch (dbError: any) {
        console.error("[Wellness Sync] Database error:", dbError.message);
        // If update failed (record doesn't exist), try insert
        if (existing) {
          console.log("[Wellness Sync] Update failed, trying insert...");
          await db.insert(garminWellnessMetrics).values(wellnessRecord);
          console.log("[Wellness Sync] Insert after failed update succeeded");
        } else {
          throw dbError;
        }
      }
      
      res.json({ success: true, wellness });
    } catch (error: any) {
      console.error("Garmin wellness sync error:", error);
      res.status(500).json({ error: "Failed to sync Garmin wellness data" });
    }
  });

  // Garmin Wellness Data - Get latest wellness data for a user
  app.get("/api/garmin/wellness", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date, days } = req.query;
      const numDays = days ? parseInt(days as string) : 7;
      
      // Get wellness data from database
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - numDays);
      const startDateStr = startDate.toISOString().split('T')[0];
      
      const metrics = await db.query.garminWellnessMetrics.findMany({
        where: (m, { and, eq, gte }) => and(
          eq(m.userId, req.user!.userId),
          gte(m.date, startDateStr)
        ),
        orderBy: (m, { desc }) => [desc(m.date)],
      });
      
      // Get the most recent for current readiness
      const latest = metrics[0];
      
      res.json({
        metrics,
        latest,
        currentReadiness: latest ? {
          score: latest.readinessScore,
          recommendation: latest.readinessRecommendation,
          bodyBattery: latest.bodyBatteryCurrent,
          sleepQuality: latest.sleepQuality,
          stressLevel: latest.stressQualifier,
          hrvStatus: latest.hrvStatus,
        } : null,
      });
    } catch (error: any) {
      console.error("Garmin wellness fetch error:", error);
      res.status(500).json({ error: "Failed to fetch Garmin wellness data" });
    }
  });

  // Garmin Wellness Data - Get readiness for pre-run briefing
  app.get("/api/garmin/readiness", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // First, try to sync today's data
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const garminDevice = devices.find(d => d.deviceType === 'garmin' && d.isActive);
      
      const today = new Date().toISOString().split('T')[0];
      let todayWellness = await db.query.garminWellnessMetrics.findFirst({
        where: (m, { and, eq }) => and(
          eq(m.userId, req.user!.userId),
          eq(m.date, today)
        ),
      });
      
      // If Garmin is connected and no data for today, try to sync
      if (garminDevice?.accessToken && !todayWellness) {
        try {
          const garminService = await import("./garmin-service");
          const wellness = await garminService.getGarminComprehensiveWellness(garminDevice.accessToken, new Date());
          
          // Store in database
          await db.insert(garminWellnessMetrics).values({
            userId: req.user!.userId,
            date: today,
            totalSleepSeconds: wellness.sleep?.totalSleepSeconds,
            deepSleepSeconds: wellness.sleep?.deepSleepSeconds,
            lightSleepSeconds: wellness.sleep?.lightSleepSeconds,
            remSleepSeconds: wellness.sleep?.remSleepSeconds,
            awakeSleepSeconds: wellness.sleep?.awakeSleepSeconds,
            sleepScore: wellness.sleep?.sleepScore,
            sleepQuality: wellness.sleep?.sleepQuality,
            averageStressLevel: wellness.stress?.averageStressLevel,
            maxStressLevel: wellness.stress?.maxStressLevel,
            stressDuration: wellness.stress?.stressDuration,
            restDuration: wellness.stress?.restDuration,
            stressQualifier: wellness.stress?.stressQualifier,
            bodyBatteryHigh: wellness.bodyBattery?.highestValue,
            bodyBatteryLow: wellness.bodyBattery?.lowestValue,
            bodyBatteryCurrent: wellness.bodyBattery?.currentValue,
            bodyBatteryCharged: wellness.bodyBattery?.chargedValue,
            bodyBatteryDrained: wellness.bodyBattery?.drainedValue,
            hrvWeeklyAvg: wellness.hrv?.weeklyAvg,
            hrvLastNightAvg: wellness.hrv?.lastNightAvg,
            hrvLastNight5MinHigh: wellness.hrv?.lastNight5MinHigh,
            hrvStatus: wellness.hrv?.hrvStatus,
            hrvFeedback: wellness.hrv?.feedbackPhrase,
            restingHeartRate: wellness.heartRate?.restingHeartRate,
            minHeartRate: wellness.heartRate?.minHeartRate,
            maxHeartRate: wellness.heartRate?.maxHeartRate,
            averageHeartRate: wellness.heartRate?.averageHeartRate,
            readinessScore: wellness.readiness?.score,
            readinessRecommendation: wellness.readiness?.recommendation,
            rawData: wellness,
          });
          
          todayWellness = await db.query.garminWellnessMetrics.findFirst({
            where: (m, { and, eq }) => and(
              eq(m.userId, req.user!.userId),
              eq(m.date, today)
            ),
          });
        } catch (syncError) {
          console.error("Failed to sync Garmin data for readiness:", syncError);
        }
      }
      
      // Get last 7 days for context
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];
      
      const recentMetrics = await db.query.garminWellnessMetrics.findMany({
        where: (m, { and, eq, gte }) => and(
          eq(m.userId, req.user!.userId),
          gte(m.date, weekAgoStr)
        ),
        orderBy: (m, { desc }) => [desc(m.date)],
      });
      
      // Calculate averages for context
      const avgSleepHours = recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + (m.totalSleepSeconds || 0), 0) / recentMetrics.length / 3600
        : null;
      
      const avgBodyBattery = recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + (m.bodyBatteryCurrent || 0), 0) / recentMetrics.length
        : null;
      
      res.json({
        garminConnected: !!garminDevice?.accessToken,
        today: todayWellness ? {
          readinessScore: todayWellness.readinessScore,
          recommendation: todayWellness.readinessRecommendation,
          sleepHours: todayWellness.totalSleepSeconds ? todayWellness.totalSleepSeconds / 3600 : null,
          sleepQuality: todayWellness.sleepQuality,
          sleepScore: todayWellness.sleepScore,
          bodyBattery: todayWellness.bodyBatteryCurrent,
          stressLevel: todayWellness.averageStressLevel,
          stressQualifier: todayWellness.stressQualifier,
          hrvStatus: todayWellness.hrvStatus,
          hrvFeedback: todayWellness.hrvFeedback,
          restingHeartRate: todayWellness.restingHeartRate,
        } : null,
        weeklyContext: {
          avgSleepHours: avgSleepHours?.toFixed(1),
          avgBodyBattery: avgBodyBattery?.toFixed(0),
          daysWithData: recentMetrics.length,
        },
      });
    } catch (error: any) {
      console.error("Garmin readiness error:", error);
      res.status(500).json({ error: "Failed to fetch readiness data" });
    }
  });

  // ==========================================
  // GARMIN PRODUCTION API ENDPOINTS
  // Required for Garmin Production App Approval
  // ==========================================

  /**
   * PING Endpoint - Garmin uses this to test if your server is alive
   * REQUIRED for production approval
   * Must respond within 30 seconds
   */
  app.post("/api/garmin/ping", (req: Request, res: Response) => {
    console.log("📡 Garmin PING received");
    res.status(200).json({ 
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "AI Run Coach API"
    });
  });

  /**
   * User Permissions GET Endpoint
   * REQUIRED for production approval
   * Allows Garmin to query what permissions a user has granted
   */
  app.get("/api/garmin/user-permissions/:garminUserId", async (req: Request, res: Response) => {
    try {
      const { garminUserId } = req.params;
      console.log(`🔍 Garmin requesting permissions for user: ${garminUserId}`);

      // Find user by Garmin user ID (stored as deviceId in our system)
      const device = await db.query.connectedDevices.findFirst({
        where: (d, { and, eq }) => and(
          eq(d.deviceType, 'garmin'),
          eq(d.deviceId, garminUserId),
          eq(d.isActive, true)
        ),
      });

      if (!device) {
        console.log(`⚠️ No active Garmin device found for Garmin user ${garminUserId}`);
        return res.status(404).json({ 
          error: "User not found or no active Garmin connection" 
        });
      }

      // Return permissions the user has granted
      res.status(200).json({
        userId: garminUserId,
        permissions: [
          "WELLNESS_READ",
          "ACTIVITY_READ",
          "SLEEP_READ",
          "HEARTRATE_READ",
          "STRESS_READ",
          "BODY_COMPOSITION_READ",
          "RESPIRATION_READ",
          "PULSE_OX_READ",
          "HRV_READ"
        ],
        status: "active",
        connectedAt: device.createdAt,
        lastSync: device.lastSyncAt
      });

      console.log(`✅ Returned permissions for Garmin user ${garminUserId}`);
    } catch (error: any) {
      console.error("Error fetching user permissions:", error);
      res.status(500).json({ error: "Failed to fetch user permissions" });
    }
  });

  /**
   * ACTIVITY UPLOAD Endpoint - Upload AI Run Coach runs to Garmin Connect
   * Allows two-way sync: READ from Garmin + WRITE to Garmin
   * Requires Training/Courses API permissions
   */
  app.post("/api/garmin/upload-run", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId } = req.body;

      if (!runId) {
        return res.status(400).json({ error: "runId is required" });
      }

      console.log(`📤 Upload to Garmin requested for run: ${runId}`);

      // Get run data from database
      const run = await db.query.runs.findFirst({
        where: (r, { eq }) => eq(r.id, runId),
      });

      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }

      // Check if user owns this run
      if (run.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Unauthorized - run belongs to different user" });
      }

      // Check if already uploaded
      if (run.uploadedToGarmin) {
        return res.status(200).json({
          success: true,
          message: "Run already uploaded to Garmin",
          garminActivityId: run.garminActivityId,
          alreadyUploaded: true,
        });
      }

      // Check if this run came FROM Garmin (don't upload back)
      if (run.externalSource === 'garmin') {
        return res.status(400).json({
          error: "Cannot upload Garmin-sourced runs back to Garmin",
        });
      }

      // Get Garmin connection
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const garminDevice = devices.find(d => d.deviceType === 'garmin' && d.isActive);

      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({
          error: "Garmin not connected. Please connect Garmin first.",
        });
      }

      // Import garmin service
      const garminService = await import("./garmin-service");

      // Upload to Garmin
      const result = await garminService.uploadRunToGarmin(
        req.user!.userId,
        run,
        garminDevice.accessToken,
        garminDevice.refreshToken!,
        garminDevice.tokenExpiresAt!
      );

      if (result.success) {
        console.log(`✅ Run ${runId} uploaded to Garmin successfully`);
        if (result.garminActivityId) {
          console.log(`   Garmin Activity ID: ${result.garminActivityId}`);
        }

        res.json({
          success: true,
          message: "Run uploaded to Garmin Connect successfully",
          garminActivityId: result.garminActivityId,
        });
      } else {
        console.error(`❌ Failed to upload run ${runId}:`, result.error);
        res.status(500).json({
          success: false,
          error: result.error || "Failed to upload to Garmin",
        });
      }
    } catch (error: any) {
      console.error("Garmin upload error:", error);
      res.status(500).json({ error: "Failed to upload run to Garmin" });
    }
  });

  // ==========================================
  // GARMIN PUSH WEBHOOK ENDPOINTS
  // These endpoints receive real-time data from Garmin's servers
  // No auth required - Garmin validates with their own mechanism
  // ==========================================

  // Helper to find user by Garmin user access token
  // The userAccessToken in Garmin webhooks is the same as the OAuth access token we store
  const findUserByGarminToken = async (userAccessToken: string) => {
    const device = await db.query.connectedDevices.findFirst({
      where: (d, { and, eq }) => and(
        eq(d.deviceType, 'garmin'),
        eq(d.accessToken, userAccessToken)
      ),
    });
    return device;
  };

  // ACTIVITY - Activities (when user completes a run/walk)
  app.post("/api/garmin/webhook/activities", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received activities push:', JSON.stringify(req.body).slice(0, 1000));
      
      const activities = req.body.activities || [];
      for (const activity of activities) {
        const userAccessToken = activity.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          const activityType = activity.activityType || 'RUNNING';
          const isRunOrWalk = ['RUNNING', 'WALKING', 'TRAIL_RUNNING', 'TREADMILL_RUNNING', 'INDOOR_WALKING'].includes(activityType);
          
          console.log(`[Garmin Webhook] Processing activity for user ${device.userId}: ${activity.activityName || activityType}`);
          
          // Store full activity in garmin_activities table
          const [garminActivity] = await db.insert(garminActivities).values({
            userId: device.userId,
            garminActivityId: String(activity.activityId),
            activityName: activity.activityName,
            activityType: activityType,
            eventType: activity.eventType,
            startTimeInSeconds: activity.startTimeInSeconds,
            startTimeOffsetInSeconds: activity.startTimeOffsetInSeconds,
            durationInSeconds: activity.durationInSeconds,
            distanceInMeters: activity.distanceInMeters,
            averageHeartRateInBeatsPerMinute: activity.averageHeartRateInBeatsPerMinute,
            maxHeartRateInBeatsPerMinute: activity.maxHeartRateInBeatsPerMinute,
            averageSpeedInMetersPerSecond: activity.averageSpeedInMetersPerSecond,
            maxSpeedInMetersPerSecond: activity.maxSpeedInMetersPerSecond,
            averagePaceInMinutesPerKilometer: activity.averagePaceInMinutesPerKilometer,
            averagePowerInWatts: activity.averagePowerInWatts,
            maxPowerInWatts: activity.maxPowerInWatts,
            normalizedPowerInWatts: activity.normalizedPowerInWatts,
            averageRunCadenceInStepsPerMinute: activity.averageRunCadenceInStepsPerMinute,
            maxRunCadenceInStepsPerMinute: activity.maxRunCadenceInStepsPerMinute,
            startLatitude: activity.startingLatitudeInDegree,
            startLongitude: activity.startingLongitudeInDegree,
            totalElevationGainInMeters: activity.totalElevationGainInMeters,
            totalElevationLossInMeters: activity.totalElevationLossInMeters,
            activeKilocalories: activity.activeKilocalories,
            bmrKilocalories: activity.bmrKilocalories,
            aerobicTrainingEffect: activity.aerobicTrainingEffect,
            anaerobicTrainingEffect: activity.anaerobicTrainingEffect,
            trainingEffectLabel: activity.trainingEffectLabel,
            vo2Max: activity.vO2Max,
            deviceName: activity.deviceName,
            rawData: activity,
          }).returning();
          
          // If it's a run/walk, create a run record in the user's history
          if (isRunOrWalk && activity.distanceInMeters > 0) {
            const startTime = new Date((activity.startTimeInSeconds || 0) * 1000);
            const durationSeconds = activity.durationInSeconds || 0;
            const distanceKm = (activity.distanceInMeters || 0) / 1000;
            
            // Calculate average pace in min/km format
            let avgPace = '';
            if (distanceKm > 0 && durationSeconds > 0) {
              const paceSeconds = durationSeconds / distanceKm;
              const mins = Math.floor(paceSeconds / 60);
              const secs = Math.floor(paceSeconds % 60);
              avgPace = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            
            // Create run record
            const [newRun] = await db.insert(runs).values({
              userId: device.userId,
              distance: distanceKm,
              duration: durationSeconds,
              avgPace,
              avgHeartRate: activity.averageHeartRateInBeatsPerMinute,
              maxHeartRate: activity.maxHeartRateInBeatsPerMinute,
              calories: activity.activeKilocalories,
              cadence: activity.averageRunCadenceInStepsPerMinute ? Math.round(activity.averageRunCadenceInStepsPerMinute) : null,
              elevation: activity.totalElevationGainInMeters,
              elevationGain: activity.totalElevationGainInMeters,
              elevationLoss: activity.totalElevationLossInMeters,
              difficulty: activityType === 'TRAIL_RUNNING' ? 'hard' : 'moderate',
              startLat: activity.startingLatitudeInDegree,
              startLng: activity.startingLongitudeInDegree,
              name: activity.activityName || `${activityType.replace(/_/g, ' ')} from Garmin`,
              runDate: startTime.toISOString().split('T')[0],
              runTime: startTime.toTimeString().split(' ')[0].slice(0, 5),
              completedAt: startTime,
            }).returning();
            
            // Link the Garmin activity to the run
            await db.update(garminActivities)
              .set({ runId: newRun.id, isProcessed: true })
              .where(eq(garminActivities.id, garminActivity.id));
            
            console.log(`[Garmin Webhook] Created run record ${newRun.id} from Garmin activity ${activity.activityId}`);
          }
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Activities error:', error);
      res.status(200).json({ success: true }); // Always return 200 to Garmin
    }
  });

  // ACTIVITY - Activity Details (detailed activity metrics)
  app.post("/api/garmin/webhook/activity-details", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received activity details push');
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Activity details error:', error);
      res.status(200).json({ success: true });
    }
  });

  // HEALTH - Sleeps (sleep data push)
  app.post("/api/garmin/webhook/sleeps", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received sleeps push:', JSON.stringify(req.body).slice(0, 1000));
      
      const sleeps = req.body.sleeps || [];
      for (const sleep of sleeps) {
        const userAccessToken = sleep.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          const date = new Date(sleep.startTimeInSeconds * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing sleep for user ${device.userId}, date: ${date}`);
          
          // Store all sleep fields
          const sleepData = {
            userId: device.userId,
            date,
            totalSleepSeconds: sleep.durationInSeconds,
            deepSleepSeconds: sleep.deepSleepDurationInSeconds,
            lightSleepSeconds: sleep.lightSleepDurationInSeconds,
            remSleepSeconds: sleep.remSleepDurationInSeconds,
            awakeSleepSeconds: sleep.awakeDurationInSeconds,
            sleepScore: sleep.overallSleepScore?.value || sleep.sleepScores?.overall?.value,
            sleepQuality: sleep.overallSleepScore?.qualifierKey || sleep.sleepScores?.overall?.qualifierKey,
            sleepStartTimeGMT: sleep.startTimeGMT,
            sleepEndTimeGMT: sleep.endTimeGMT,
            sleepLevelsMap: sleep.sleepLevelsMap,
            avgSleepRespirationValue: sleep.avgSleepRespirationValue,
            lowestRespirationValue: sleep.lowestRespirationValue,
            highestRespirationValue: sleep.highestRespirationValue,
            avgSpO2: sleep.avgSpO2Value,
            restingHeartRate: sleep.restingHeartRate,
            averageHeartRate: sleep.averageHeartRate,
            rawData: sleep,
          };
          
          // Try upsert - if conflict, update existing
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, device.userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set({ ...sleepData, syncedAt: new Date() })
              .where(eq(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values(sleepData);
          }
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Sleeps error:', error);
      res.status(200).json({ success: true });
    }
  });

  // HEALTH - Stress (stress data push)
  app.post("/api/garmin/webhook/stress", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received stress push:', JSON.stringify(req.body).slice(0, 1000));
      
      const stressData = req.body.allDayStress || req.body.stressDetails || [];
      for (const stress of stressData) {
        const userAccessToken = stress.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          const date = new Date((stress.startTimeInSeconds || stress.calendarDate) * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing stress for user ${device.userId}, date: ${date}`);
          
          const stressFields = {
            averageStressLevel: stress.averageStressLevel,
            maxStressLevel: stress.maxStressLevel,
            stressDuration: stress.stressDurationInSeconds,
            restDuration: stress.restDurationInSeconds,
            activityDuration: stress.activityDurationInSeconds,
            lowStressDuration: stress.lowStressDurationInSeconds,
            mediumStressDuration: stress.mediumStressDurationInSeconds,
            highStressDuration: stress.highStressDurationInSeconds,
            stressQualifier: stress.stressQualifier,
            bodyBatteryHigh: stress.bodyBatteryHighValue,
            bodyBatteryLow: stress.bodyBatteryLowValue,
            bodyBatteryCharged: stress.bodyBatteryChargedValue,
            bodyBatteryDrained: stress.bodyBatteryDrainedValue,
          };
          
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, device.userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set({ ...stressFields, syncedAt: new Date() })
              .where(eq(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...stressFields,
            });
          }
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Stress error:', error);
      res.status(200).json({ success: true });
    }
  });

  // HEALTH - HRV Summary (heart rate variability)
  app.post("/api/garmin/webhook/hrv", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received HRV push:', JSON.stringify(req.body).slice(0, 1000));
      
      const hrvData = req.body.hrvSummaries || [];
      for (const hrv of hrvData) {
        const userAccessToken = hrv.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          const date = hrv.calendarDate || new Date((hrv.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing HRV for user ${device.userId}, date: ${date}`);
          
          const hrvFields = {
            hrvWeeklyAvg: hrv.weeklyAvg,
            hrvLastNightAvg: hrv.lastNightAvg,
            hrvLastNight5MinHigh: hrv.lastNight5MinHigh,
            hrvStatus: hrv.hrvStatus,
            hrvFeedback: hrv.feedbackPhrase,
            hrvBaselineLowUpper: hrv.baseline?.lowUpper,
            hrvBaselineBalancedLower: hrv.baseline?.balancedLow,
            hrvBaselineBalancedUpper: hrv.baseline?.balancedUpper,
            hrvStartTimeGMT: hrv.startTimeGMT,
            hrvEndTimeGMT: hrv.endTimeGMT,
            hrvReadings: hrv.hrvValues,
          };
          
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, device.userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set({ ...hrvFields, syncedAt: new Date() })
              .where(eq(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...hrvFields,
            });
          }
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] HRV error:', error);
      res.status(200).json({ success: true });
    }
  });

  // HEALTH - Dailies (daily activity summary with Body Battery, steps, etc.)
  app.post("/api/garmin/webhook/dailies", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received dailies push:', JSON.stringify(req.body).slice(0, 1000));
      
      const dailies = req.body.dailies || [];
      for (const daily of dailies) {
        const userAccessToken = daily.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          const date = daily.calendarDate || new Date((daily.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing daily for user ${device.userId}, date: ${date}`);
          
          const dailyFields = {
            // Heart rate
            restingHeartRate: daily.restingHeartRateInBeatsPerMinute,
            minHeartRate: daily.minHeartRateInBeatsPerMinute,
            maxHeartRate: daily.maxHeartRateInBeatsPerMinute,
            averageHeartRate: daily.averageHeartRateInBeatsPerMinute,
            heartRateTimeOffsetValues: daily.timeOffsetHeartRateSamples,
            // Activity
            steps: daily.steps,
            distanceMeters: daily.distanceInMeters,
            activeKilocalories: daily.activeKilocalories,
            bmrKilocalories: daily.bmrKilocalories,
            floorsClimbed: daily.floorsClimbed,
            floorsDescended: daily.floorsDescended,
            // Intensity
            moderateIntensityDuration: daily.moderateIntensityDurationInSeconds,
            vigorousIntensityDuration: daily.vigorousIntensityDurationInSeconds,
            intensityDuration: daily.intensityDurationGoalInSeconds,
            sedentaryDuration: daily.sedentaryDurationInSeconds,
            sleepingDuration: daily.sleepingDurationInSeconds,
            activeDuration: daily.activeDurationInSeconds,
            // Body Battery
            bodyBatteryHigh: daily.bodyBatteryHighValue || daily.bodyBatteryHighestValue,
            bodyBatteryLow: daily.bodyBatteryLowestValue,
            bodyBatteryCurrent: daily.bodyBatteryMostRecentValue,
            bodyBatteryCharged: daily.bodyBatteryChargedValue,
            bodyBatteryDrained: daily.bodyBatteryDrainedValue,
            bodyBatteryVersion: daily.bodyBatteryVersion,
            // Stress
            averageStressLevel: daily.averageStressLevel,
            maxStressLevel: daily.maxStressLevel,
            stressDuration: daily.stressDuration,
            restDuration: daily.restStressDuration,
          };
          
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, device.userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set({ ...dailyFields, syncedAt: new Date() })
              .where(eq(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...dailyFields,
            });
          }
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Dailies error:', error);
      res.status(200).json({ success: true });
    }
  });

  // HEALTH - Body Compositions
  app.post("/api/garmin/webhook/body-compositions", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received body compositions push:', JSON.stringify(req.body).slice(0, 1000));
      
      const compositions = req.body.bodyCompositions || [];
      for (const comp of compositions) {
        const userAccessToken = comp.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          const date = new Date((comp.measurementTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing body composition for user ${device.userId}, date: ${date}`);
          
          // Store in garminBodyComposition table
          await db.insert(garminBodyComposition).values({
            userId: device.userId,
            measurementTimeInSeconds: comp.measurementTimeInSeconds,
            measurementDate: date,
            weightInGrams: comp.weightInGrams,
            bmi: comp.bmi,
            bodyFatPercentage: comp.bodyFatPercentage,
            bodyWaterPercentage: comp.bodyWaterPercentage,
            boneMassInGrams: comp.boneMassInGrams,
            muscleMassInGrams: comp.muscleMassInGrams,
            physiqueRating: comp.physiqueRating,
            visceralFatRating: comp.visceralFatRating,
            metabolicAge: comp.metabolicAge,
            rawData: comp,
          });
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Body compositions error:', error);
      res.status(200).json({ success: true });
    }
  });

  // HEALTH - Pulse Ox
  app.post("/api/garmin/webhook/pulse-ox", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received pulse ox push:', JSON.stringify(req.body).slice(0, 1000));
      
      const pulseOxData = req.body.pulseOx || [];
      for (const pox of pulseOxData) {
        const userAccessToken = pox.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          const date = pox.calendarDate || new Date((pox.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing pulse ox for user ${device.userId}, date: ${date}`);
          
          const poxFields = {
            avgSpO2: pox.avgSpO2,
            minSpO2: pox.minSpO2,
            avgAltitude: pox.avgAltitude,
            onDemandReadings: pox.onDemandReadings,
            sleepSpO2Readings: pox.sleepPulseOxReadings,
          };
          
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, device.userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set({ ...poxFields, syncedAt: new Date() })
              .where(eq(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...poxFields,
            });
          }
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Pulse ox error:', error);
      res.status(200).json({ success: true });
    }
  });

  // HEALTH - Respiration
  app.post("/api/garmin/webhook/respiration", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received respiration push:', JSON.stringify(req.body).slice(0, 1000));
      
      const respirations = req.body.allDayRespiration || [];
      for (const resp of respirations) {
        const userAccessToken = resp.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          const date = resp.calendarDate || new Date((resp.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing respiration for user ${device.userId}, date: ${date}`);
          
          const respFields = {
            avgWakingRespirationValue: resp.avgWakingRespirationValue,
            highestRespirationValue: resp.highestRespirationValue,
            lowestRespirationValue: resp.lowestRespirationValue,
            avgSleepRespirationValue: resp.avgSleepRespirationValue,
          };
          
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, device.userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set({ ...respFields, syncedAt: new Date() })
              .where(eq(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...respFields,
            });
          }
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Respiration error:', error);
      res.status(200).json({ success: true });
    }
  });

  // COMMON - Deregistrations (user disconnects Garmin)
  app.post("/api/garmin/webhook/deregistrations", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received deregistration:', JSON.stringify(req.body).slice(0, 500));
      
      const deregistrations = req.body.deregistrations || [];
      for (const dereg of deregistrations) {
        const userAccessToken = dereg.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        
        if (device) {
          console.log(`[Garmin Webhook] User ${device.userId} deregistered from Garmin`);
          // Mark device as inactive
          await db.update(connectedDevices)
            .set({ isActive: false, accessToken: null, refreshToken: null })
            .where(eq(connectedDevices.id, device.id));
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Deregistrations error:', error);
      res.status(200).json({ success: true });
    }
  });

  // COMMON - User Permissions Change
  app.post("/api/garmin/webhook/permissions", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received permissions change:', JSON.stringify(req.body).slice(0, 500));
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Garmin Webhook] Permissions error:', error);
      res.status(200).json({ success: true });
    }
  });

  // Other health endpoints (log only for now)
  app.post("/api/garmin/webhook/epochs", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  
  app.post("/api/garmin/webhook/health-snapshot", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  
  app.post("/api/garmin/webhook/user-metrics", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  
  app.post("/api/garmin/webhook/blood-pressure", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  
  app.post("/api/garmin/webhook/skin-temperature", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  
  app.post("/api/garmin/webhook/moveiq", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  
  app.post("/api/garmin/webhook/manually-updated-activities", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  
  app.post("/api/garmin/webhook/activity-files", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  
  app.post("/api/garmin/webhook/menstrual-cycle", async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });

  // ==========================================
  // END GARMIN WEBHOOK ENDPOINTS
  // ==========================================

  // Helper function to calculate weather impact from runs
  async function calculateWeatherImpact(userId: string, runs: any[]) {
    if (runs.length < 3) {
      return { hasEnoughData: false, runsAnalyzed: runs.length, overallAvgPace: null };
    }

    // Parse pace strings to seconds
    const parsePace = (paceStr: string | null): number | null => {
      if (!paceStr) return null;
      const match = paceStr.match(/(\d+):(\d+)/);
      if (match) {
        return parseInt(match[1]) * 60 + parseInt(match[2]);
      }
      return null;
    };

    // Calculate overall average pace
    const paces = runs.map(r => parsePace(r.avgPace)).filter((p): p is number => p !== null);
    if (paces.length === 0) {
      return { hasEnoughData: false, runsAnalyzed: runs.length, overallAvgPace: null };
    }
    const avgPaceSeconds = Math.round(paces.reduce((a, b) => a + b, 0) / paces.length);

    // Group runs by time of day
    const timeOfDayBuckets: Record<string, { totalPace: number; count: number }> = {
      'Morning': { totalPace: 0, count: 0 },
      'Late Morning': { totalPace: 0, count: 0 },
      'Afternoon': { totalPace: 0, count: 0 },
      'Evening': { totalPace: 0, count: 0 },
      'Night': { totalPace: 0, count: 0 },
    };

    // Group runs by weather condition (from weatherData)
    const conditionBuckets: Record<string, { totalPace: number; count: number }> = {};

    // Group runs by temperature range
    const tempBuckets: Record<string, { totalPace: number; count: number }> = {};

    runs.forEach(run => {
      const pace = parsePace(run.avgPace);
      if (!pace) return;

      // Time of day from completedAt
      if (run.completedAt) {
        const date = new Date(run.completedAt);
        const hour = date.getHours();
        let timeLabel = '';
        if (hour >= 5 && hour < 9) timeLabel = 'Morning';
        else if (hour >= 9 && hour < 12) timeLabel = 'Late Morning';
        else if (hour >= 12 && hour < 17) timeLabel = 'Afternoon';
        else if (hour >= 17 && hour < 20) timeLabel = 'Evening';
        else timeLabel = 'Night';
        
        if (timeOfDayBuckets[timeLabel]) {
          timeOfDayBuckets[timeLabel].totalPace += pace;
          timeOfDayBuckets[timeLabel].count++;
        }
      }

      // Weather condition from weatherData
      const condition = run.weatherData?.condition || run.weatherData?.description || 'Clear';
      if (!conditionBuckets[condition]) {
        conditionBuckets[condition] = { totalPace: 0, count: 0 };
      }
      conditionBuckets[condition].totalPace += pace;
      conditionBuckets[condition].count++;

      // Temperature from weatherData
      const temp = run.weatherData?.temperature;
      if (temp !== undefined && temp !== null) {
        let tempLabel = '';
        if (temp < 5) tempLabel = 'Cold (<5°C)';
        else if (temp < 10) tempLabel = 'Cool (5-10°C)';
        else if (temp < 15) tempLabel = 'Mild (10-15°C)';
        else if (temp < 20) tempLabel = 'Warm (15-20°C)';
        else tempLabel = 'Hot (>20°C)';
        
        if (!tempBuckets[tempLabel]) {
          tempBuckets[tempLabel] = { totalPace: 0, count: 0 };
        }
        tempBuckets[tempLabel].totalPace += pace;
        tempBuckets[tempLabel].count++;
      }
    });

    // Calculate pace vs average for each bucket
    const calculatePaceVsAvg = (bucket: { totalPace: number; count: number }): number | null => {
      if (bucket.count < 1) return null;
      const bucketAvg = bucket.totalPace / bucket.count;
      return ((avgPaceSeconds - bucketAvg) / avgPaceSeconds) * 100;
    };

    // Build time of day analysis
    const timeOfDayAnalysis = Object.entries(timeOfDayBuckets)
      .filter(([_, b]) => b.count > 0)
      .map(([label, bucket]) => ({
        range: label,
        label,
        avgPace: Math.round(bucket.totalPace / bucket.count),
        runCount: bucket.count,
        paceVsAvg: calculatePaceVsAvg(bucket),
      }))
      .sort((a, b) => (b.paceVsAvg || 0) - (a.paceVsAvg || 0));

    // Build condition analysis
    const conditionAnalysis = Object.entries(conditionBuckets)
      .filter(([_, b]) => b.count > 0)
      .map(([condition, bucket]) => ({
        condition,
        avgPace: Math.round(bucket.totalPace / bucket.count),
        runCount: bucket.count,
        paceVsAvg: calculatePaceVsAvg(bucket) || 0,
      }))
      .sort((a, b) => a.paceVsAvg - b.paceVsAvg);

    // Build temperature analysis
    const temperatureAnalysis = Object.entries(tempBuckets)
      .filter(([_, b]) => b.count > 0)
      .map(([label, bucket]) => ({
        range: label,
        label,
        avgPace: Math.round(bucket.totalPace / bucket.count),
        runCount: bucket.count,
        paceVsAvg: calculatePaceVsAvg(bucket),
      }))
      .sort((a, b) => (b.paceVsAvg || 0) - (a.paceVsAvg || 0));

    // Find best and worst conditions
    const validTimeAnalysis = timeOfDayAnalysis.filter(t => t.paceVsAvg !== null);
    const validConditionAnalysis = conditionAnalysis.filter(c => c.paceVsAvg !== null);
    
    const bestTime = validTimeAnalysis.find(t => t.paceVsAvg! < 0);
    const worstTime = validTimeAnalysis.find(t => t.paceVsAvg! > 0);
    const bestCondition = validConditionAnalysis.find(c => c.paceVsAvg < 0);
    const worstCondition = validConditionAnalysis.find(c => c.paceVsAvg > 0);

    return {
      hasEnoughData: true,
      runsAnalyzed: runs.length,
      overallAvgPace: avgPaceSeconds,
      temperatureAnalysis,
      conditionAnalysis,
      timeOfDayAnalysis,
      insights: {
        bestCondition: bestCondition ? {
          label: bestCondition.condition,
          type: 'condition',
          improvement: Math.abs(bestCondition.paceVsAvg).toFixed(0),
        } : undefined,
        worstCondition: worstCondition ? {
          label: worstCondition.condition,
          type: 'condition',
          slowdown: Math.abs(worstCondition.paceVsAvg).toFixed(0),
        } : undefined,
      },
    };
  }

  // Wellness-aware pre-run briefing with Garmin data
  app.post("/api/coaching/pre-run-briefing", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, hasRoute, activityType, targetTime, targetPace, weather } = req.body;

      // Get user's coach settings
      const user = await storage.getUser(req.user!.userId);
      const coachName = user?.coachName || 'Coach';
      const coachTone = user?.coachTone || 'encouraging';
      const coachGender = user?.coachGender || 'female';
      const coachAccent = user?.coachAccent || 'british';

      // Get today's wellness data
      const today = new Date().toISOString().split('T')[0];
      let wellness: any = {};

      const todayWellness = await db.query.garminWellnessMetrics.findFirst({
        where: (m, { and, eq }) => and(
          eq(m.userId, req.user!.userId),
          eq(m.date, today)
        ),
      });

      if (todayWellness) {
        wellness = {
          sleepHours: todayWellness.totalSleepSeconds ? todayWellness.totalSleepSeconds / 3600 : undefined,
          sleepQuality: todayWellness.sleepQuality,
          sleepScore: todayWellness.sleepScore,
          bodyBattery: todayWellness.bodyBatteryCurrent,
          stressLevel: todayWellness.averageStressLevel,
          stressQualifier: todayWellness.stressQualifier,
          hrvStatus: todayWellness.hrvStatus,
          hrvFeedback: todayWellness.hrvFeedback,
          restingHeartRate: todayWellness.restingHeartRate,
          readinessScore: todayWellness.readinessScore,
          readinessRecommendation: todayWellness.readinessRecommendation,
        };
      }

      // Get weather impact data for positive condition matching
      let weatherImpactData = null;
      try {
        // Try to get cached weather impact or calculate fresh
        const runs = await db.query.runs.findMany({
          where: eq(runs.userId, req.user!.userId),
          orderBy: desc(runs.completedAt),
          limit: 30,
        });
        
        // Calculate weather impact from recent runs if we have enough data
        if (runs.length >= 3) {
          weatherImpactData = await calculateWeatherImpact(req.user!.userId, runs);
        }
      } catch (err) {
        console.error("Error getting weather impact data:", err);
        // Continue without weather impact - not critical
      }

      // Generate wellness-aware briefing - only include route info when explicitly set to true
      // IMPORTANT: Free runs should NOT mention terrain/elevation
      const aiService = await import("./ai-service");
      const briefing = await aiService.generateWellnessAwarePreRunBriefing({
        distance: distance || 5,
        elevationGain: elevationGain || 0,
        difficulty: difficulty || 'moderate',
        activityType: activityType || 'run',
        weather,
        coachName,
        coachTone,
        wellness,
        hasRoute: hasRoute === true, // Only true if explicitly true - all other values become false
        targetTime: targetTime,
        targetPace: targetPace,
        weatherImpact: weatherImpactData,
      });
      
      // Map the briefing text to 'text' field for client compatibility
      // Also generate TTS audio if we have text
      const briefingText = briefing.briefing;
      
      // Generate TTS audio for the briefing
      const audioBuffer = briefingText ? await aiService.generateTTS(briefingText, mapCoachVoice(coachGender, coachAccent, coachTone)) : null;
      
      res.json({
        audio: audioBuffer ? audioBuffer.toString('base64') : null,
        format: audioBuffer ? 'mp3' : null,
        voice: mapCoachVoice(coachGender, coachAccent, coachTone),
        text: briefingText,
        wellness,
        garminConnected: Object.keys(wellness).length > 0,
      });
    } catch (error: any) {
      console.error("Pre-run briefing error:", error);
      res.status(500).json({ error: "Failed to generate pre-run briefing" });
    }
  });

  // OpenAI TTS endpoint - generates high-quality AI voice audio
  app.post("/api/tts/generate", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { text, voice } = req.body;
      
      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: "Text is required" });
      }
      
      // Get user's voice preference
      const user = await storage.getUser(req.user!.userId);
      const coachTone = user?.coachTone || "energetic";
      const userVoice = voice || mapCoachVoice(user?.coachGender, user?.coachAccent, coachTone);
      
      const aiService = await import("./ai-service");
      const audioBuffer = await aiService.generateTTS(text, userVoice);
      
      // Return as base64 for mobile playback
      const base64Audio = audioBuffer.toString('base64');
      
      res.json({
        audio: base64Audio,
        format: 'mp3',
        voice: userVoice,
      });
    } catch (error: any) {
      console.error("TTS generation error:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // Enhanced pre-run briefing with TTS audio
  app.post("/api/coaching/pre-run-briefing-audio", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { text, distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, hasRoute, activityType, weather: clientWeather, targetPace, wellness: clientWellness, turnInstructions, startLocation } = req.body;
      
      // Get user's coach settings
      const user = await storage.getUser(req.user!.userId);
      const coachGender = user?.coachGender || 'female';
      const coachTone = user?.coachTone || 'energetic';
      const coachAccent = user?.coachAccent || 'british';
      const coachName = user?.coachName || 'Coach';
      const voice = mapCoachVoice(coachGender, coachAccent, coachTone);
      const toneForPersonality = normalizeCoachTone(coachTone);
      
      // Fetch weather if not provided
      let weather = clientWeather;
      if (!weather && startLocation?.lat && startLocation?.lng) {
        try {
          const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${startLocation.lat}&longitude=${startLocation.lng}&current_weather=true`
          );
          if (weatherRes.ok) {
            const data = await weatherRes.json();
            weather = {
              temp: Math.round(data.current_weather?.temperature || 20),
              condition: data.current_weather?.weathercode <= 3 ? 'clear' : 'cloudy',
              windSpeed: Math.round(data.current_weather?.windspeed || 0),
            };
          }
        } catch (e) {
          console.log('Weather fetch for audio briefing failed');
        }
      }
      
      // Fetch wellness data if not provided
      let wellnessData = clientWellness;
      if (!wellnessData) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const todayWellness = await db.query.garminWellnessMetrics.findFirst({
            where: (m, { and, eq }) => and(
              eq(m.userId, req.user!.userId),
              eq(m.date, today)
            ),
          });
          if (todayWellness) {
            wellnessData = {
              bodyBattery: todayWellness.bodyBatteryCurrent,
              sleepHours: todayWellness.totalSleepSeconds ? Math.round(todayWellness.totalSleepSeconds / 3600) : undefined,
              stressQualifier: todayWellness.stressQualifier,
              readinessScore: todayWellness.readinessScore,
            };
          }
        } catch (e) {
          console.log('Wellness fetch for audio briefing failed');
        }
      }
      
      // Street abbreviation expander
      const expandStreetAbbreviations = (text: string): string => {
        const abbreviations: Record<string, string> = {
          'St': 'Street', 'Rd': 'Road', 'Ave': 'Avenue', 'Blvd': 'Boulevard',
          'Dr': 'Drive', 'Ln': 'Lane', 'Ct': 'Court', 'Pl': 'Place',
          'Cir': 'Circle', 'Pkwy': 'Parkway', 'Hwy': 'Highway', 'Trl': 'Trail',
          'Ter': 'Terrace', 'Way': 'Way', 'Sq': 'Square', 'Cres': 'Crescent',
          'Pde': 'Parade', 'Esp': 'Esplanade', 'Cl': 'Close', 'Gr': 'Grove',
        };
        let result = text;
        for (const [abbr, full] of Object.entries(abbreviations)) {
          // Match abbreviations at word boundaries (end of words or before comma/period)
          result = result.replace(new RegExp(`\\b${abbr}\\b(?=[,.]|\\s|$)`, 'g'), full);
        }
        return result;
      };
      
      // Get personality variations based on tone
      const getPersonalityOpener = () => {
        const openers: Record<string, string[]> = {
          energetic: [
            "Alright, let's do this!",
            "Hey champion, time to crush it!",
            "Get ready to feel amazing!",
            "This is going to be epic!",
          ],
          calm: [
            "Take a deep breath, we're about to begin.",
            "Let's flow into this run together.",
            "Center yourself, and let's go.",
          ],
          motivational: [
            "Today is YOUR day!",
            "Every step makes you stronger!",
            "You've got this, believe in yourself!",
          ],
          professional: [
            "Let me brief you on today's session.",
            "Here's your route analysis.",
            "Your session overview follows.",
          ],
          friendly: [
            "Hey there! Ready for some fun?",
            "Good to see you lacing up!",
            "Let's make this a great one!",
          ],
        };
        const toneOpeners = openers[toneForPersonality] || openers.energetic;
        return toneOpeners[Math.floor(Math.random() * toneOpeners.length)];
      };
      
      const getPersonalityCloser = () => {
        const closers: Record<string, string[]> = {
          energetic: [
            "Now let's GO! Show me what you've got!",
            "Time to light it up! Let's crush this!",
            "You're going to absolutely smash it!",
          ],
          calm: [
            "Trust your training. Enjoy the journey.",
            "Move with grace. The run is yours.",
            "Find your rhythm and flow.",
          ],
          motivational: [
            "Remember why you started. Now finish strong!",
            "You're capable of amazing things. Prove it today!",
            "This is your moment. Own it!",
          ],
          professional: [
            "Execute the plan. Good luck.",
            "Stay focused on your targets. You're prepared.",
            "Follow the strategy. Strong finish ahead.",
          ],
          friendly: [
            "Have fun out there! Enjoy every step!",
            "Make some great memories! See you at the finish!",
            "Go enjoy yourself! You've earned this!",
          ],
        };
        const toneClosers = closers[toneForPersonality] || closers.energetic;
        return toneClosers[Math.floor(Math.random() * toneClosers.length)];
      };
      
      // Build comprehensive briefing text if not provided
      let briefingText = text;
      
      if (!briefingText) {
        const parts: string[] = [];
        
        // Personality opener
        parts.push(getPersonalityOpener());
        
        // Distance with personality
        if (distance) {
          if (toneForPersonality === 'energetic') {
            parts.push(`We've got ${distance.toFixed(1)} kilometres ahead!`);
          } else if (toneForPersonality === 'calm') {
            parts.push(`Today's ${activityType === 'walk' ? 'walk' : 'run'} covers ${distance.toFixed(1)} kilometres.`);
          } else if (toneForPersonality === 'motivational') {
            parts.push(`${distance.toFixed(1)} kilometres of opportunity await you!`);
          } else {
            parts.push(`Today's ${activityType === 'walk' ? 'walk' : 'run'} is ${distance.toFixed(1)} kilometres.`);
          }
        }
        
        // Enhanced elevation insights with max incline (only when route is known)
        if (hasRoute) {
          if (elevationGain && elevationGain > 0) {
            const elevLoss = elevationLoss || elevationGain;
            const maxIncline = maxGradientDegrees ? Math.round(maxGradientDegrees) : 0;
            const inclineText = maxIncline > 0 ? ` The steepest section reaches ${maxIncline} degrees.` : '';
            
            if (elevationGain > 150) {
              parts.push(`This is a challenging course with ${Math.round(elevationGain)} metres of climbing and ${Math.round(elevLoss)} metres of descent.${inclineText} Pace yourself on the uphills and use the downhills to recover. Save some energy for the bigger climbs.`);
            } else if (elevationGain > 100) {
              parts.push(`Expect ${Math.round(elevationGain)} metres of climbing with ${Math.round(elevLoss)} metres of descent.${inclineText} There are some challenging hills ahead. Shorten your stride on the climbs and lean slightly forward.`);
            } else if (elevationGain > 50) {
              parts.push(`You'll encounter ${Math.round(elevationGain)} metres of gentle elevation gain.${inclineText} Some rolling terrain ahead, nothing too demanding.`);
            } else if (elevationGain > 20) {
              parts.push(`Mostly flat with minor undulations of about ${Math.round(elevationGain)} metres total gain.${inclineText}`);
            } else {
              parts.push(`This route is essentially flat. Great for maintaining a consistent pace.`);
            }
          } else {
            parts.push(`This is a flat route. Perfect for steady pacing.`);
          }
        }
        
        // Weather
        if (weather) {
          const temp = weather.temp || weather.temperature;
          const condition = weather.condition?.toLowerCase() || '';
          const windSpeed = weather.windSpeed || 0;
          
          if (condition.includes('rain')) {
            parts.push(`It's ${temp} degrees with rain. Wear waterproof layers and watch for slippery surfaces.`);
          } else if (condition.includes('cloud')) {
            parts.push(`It's ${temp} degrees and overcast. Good conditions for running.`);
          } else if (condition.includes('sun') || condition.includes('clear')) {
            parts.push(`It's ${temp} degrees and sunny. Stay hydrated and consider sun protection.`);
          } else {
            parts.push(`Current temperature is ${temp} degrees.`);
          }
          
          if (windSpeed > 20) {
            parts.push(`Strong winds at ${windSpeed} kilometres per hour. Use it to your advantage on downwind sections.`);
          } else if (windSpeed > 10) {
            parts.push(`Light wind at ${windSpeed} kilometres per hour.`);
          }
        }
        
        // Target pace
        if (targetPace) {
          parts.push(`Your target pace is ${targetPace}.`);
        }
        
        // Wellness data
        const wellnessData = clientWellness || {};
        if (wellnessData.readinessScore) {
          if (wellnessData.readinessScore >= 80) {
            parts.push(`Your body readiness is excellent at ${wellnessData.readinessScore}. You're primed for a great session.`);
          } else if (wellnessData.readinessScore >= 60) {
            parts.push(`Body readiness is ${wellnessData.readinessScore}. You're in good shape for this run.`);
          } else if (wellnessData.readinessScore >= 40) {
            parts.push(`Body readiness is ${wellnessData.readinessScore}. Consider taking it a bit easier today.`);
          } else {
            parts.push(`Body readiness is low at ${wellnessData.readinessScore}. Listen to your body and don't push too hard.`);
          }
        }
        
        if (wellnessData.bodyBattery) {
          if (wellnessData.bodyBattery >= 70) {
            parts.push(`Body battery is at ${wellnessData.bodyBattery}%. You've got plenty of energy.`);
          } else if (wellnessData.bodyBattery >= 40) {
            parts.push(`Body battery is at ${wellnessData.bodyBattery}%. Pace yourself wisely.`);
          } else {
            parts.push(`Body battery is low at ${wellnessData.bodyBattery}%. Consider a lighter effort.`);
          }
        }
        
        // First 2 navigation instructions (excluding waypoints less than 5m apart)
        if (turnInstructions && Array.isArray(turnInstructions) && turnInstructions.length > 0) {
          if (toneForPersonality === 'energetic') {
            parts.push(`Here's your game plan to get started!`);
          } else if (toneForPersonality === 'calm') {
            parts.push(`Let me guide you through the first few turns.`);
          } else {
            parts.push(`Here's how to get started.`);
          }
          
          // Filter out waypoints less than 5m apart and take only first 2
          let waypointCount = 0;
          let lastDistance = -5; // Start at -5 so first waypoint at 0m is included
          
          for (const turn of turnInstructions) {
            // Skip waypoints less than 5m from the previous one
            if (turn.distance - lastDistance < 5) continue;
            
            // Only include first 2 waypoints
            if (waypointCount >= 2) break;
            
            const distanceText = turn.distance >= 1000 
              ? `${(turn.distance / 1000).toFixed(1)} kilometres`
              : `${Math.round(turn.distance)} metres`;
            
            // Expand street abbreviations for natural speech
            const rawInstruction = turn.instruction || 'Continue on the route';
            const instruction = expandStreetAbbreviations(rawInstruction);
            parts.push(`In ${distanceText}, ${instruction}.`);
            
            lastDistance = turn.distance;
            waypointCount++;
          }
        }
        
        // Personality-based motivational close
        parts.push(getPersonalityCloser());
        
        briefingText = parts.join(' ');
      }
      
      // Generate TTS audio
      const aiService = await import("./ai-service");
      const audioBuffer = await aiService.generateTTS(briefingText, voice);
      const base64Audio = audioBuffer.toString('base64');
      
      res.json({
        audio: base64Audio,
        format: 'mp3',
        voice,
        text: briefingText,
      });
    } catch (error: any) {
      console.error("Pre-run briefing audio error:", error);
      res.status(500).json({ error: "Failed to generate briefing audio" });
    }
  });

  const normalizeCoachTone = (tone?: string): string => {
    if (!tone) return "energetic";
    return tone.trim().toLowerCase();
  };

  const normalizeCoachAccent = (accent?: string): string => {
    if (!accent) return "";
    return accent.trim().toLowerCase();
  };

  // Phase-based tone shifting
  const getPhaseTone = (
    baseTone: string | undefined,
    distance?: number,
    targetDistance?: number,
    phase?: string
  ): string => {
    if (!distance || !targetDistance || targetDistance <= 0) {
      return normalizeCoachTone(baseTone);
    }
    const progress = Math.max(0, Math.min(100, Math.round((distance / targetDistance) * 100)));

    if (progress < 15) return "energetic";
    if (progress < 50) return "encouraging";
    if (progress < 90) return "supportive";
    return "inspirational";
  };

  // Helper function to map user coach settings to OpenAI voices
  const mapCoachVoice = (coachGender?: string, coachAccent?: string, coachTone?: string): string => {
    const tone = normalizeCoachTone(coachTone);
    const accent = normalizeCoachAccent(coachAccent);
    const isAmerican = accent === 'american';
    const isBritish = accent === 'british';
    const isIrish = accent === 'irish';
    const isScottish = accent === 'scottish';
    const isAustralian = accent === 'australian';
    const isNewZealand = accent === 'new zealand' || accent === 'newzealand' || accent === 'nz';
    const isCommonwealth = isBritish || isIrish || isScottish;
    const isOceania = isAustralian || isNewZealand;

    if (coachGender === 'male') {
      if (tone === "energetic") return 'echo';
      if (tone === "motivational" || tone === "inspirational") return 'alloy';
      if (tone === "calm" || tone === "supportive" || tone === "encouraging") return 'onyx';
      if (isAmerican) return 'echo';
      if (isCommonwealth) return 'alloy';
      if (isOceania) return 'onyx';
      return 'onyx';
    } else {
      if (tone === "energetic") return 'shimmer';
      if (tone === "motivational" || tone === "inspirational") return 'nova';
      if (tone === "calm" || tone === "supportive" || tone === "encouraging") return 'fable';
      if (isAmerican) return 'shimmer';
      if (isCommonwealth) return 'nova';
      if (isOceania) return 'fable';
      return 'fable';
    }
  };

  // Pace Update Coaching with TTS
  app.post("/api/coaching/pace-update", async (req: Request, res: Response) => {
    try {
      const effectiveTone = getPhaseTone(
        req.body.coachTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;

      const aiService = await import("./ai-service");
      const message = await aiService.generatePaceUpdate(req.body);
      
      // Generate TTS audio with user's voice settings
      const { coachName, coachGender, coachAccent } = req.body;
      const voice = mapCoachVoice(coachGender, coachAccent, effectiveTone);
      const audioBuffer = await aiService.generateTTS(message, voice);
      const base64Audio = audioBuffer.toString('base64');
      
      res.json({ 
        message,
        nextPace: req.body.currentPace, // Fallback
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error: any) {
      console.error("Pace update coaching error:", error);
      res.status(500).json({ error: "Failed to get pace update" });
    }
  });

  // Struggle Coaching with TTS
  app.post("/api/coaching/struggle-coaching", async (req: Request, res: Response) => {
    try {
      const effectiveTone = getPhaseTone(
        req.body.coachTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;

      const aiService = await import("./ai-service");
      const message = await aiService.generateStruggleCoaching(req.body);
      
      // Generate TTS audio with user's voice settings
      const { coachName, coachGender, coachAccent } = req.body;
      const voice = mapCoachVoice(coachGender, coachAccent, effectiveTone);
      const audioBuffer = await aiService.generateTTS(message, voice);
      const base64Audio = audioBuffer.toString('base64');
      
      res.json({ 
        message,
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error: any) {
      console.error("Struggle coaching error:", error);
      res.status(500).json({ error: "Failed to get struggle coaching" });
    }
  });

  // Phase Coaching with TTS
  app.post("/api/coaching/phase-coaching", async (req: Request, res: Response) => {
    try {
      const effectiveTone = getPhaseTone(
        req.body.coachTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;

      const aiService = await import("./ai-service");
      const message = await aiService.generatePhaseCoaching(req.body);
      
      // Generate TTS audio with user's voice settings
      const { coachName, coachGender, coachAccent } = req.body;
      const voice = mapCoachVoice(coachGender, coachAccent, effectiveTone);
      const audioBuffer = await aiService.generateTTS(message, voice);
      const base64Audio = audioBuffer.toString('base64');
      
      res.json({ 
        message,
        nextPhase: null,
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error: any) {
      console.error("Phase coaching error:", error);
      res.status(500).json({ error: "Failed to get phase coaching" });
    }
  });

  // Wellness-aware coaching response during run (Talk to Coach) - Updated with TTS
  app.post("/api/coaching/talk-to-coach", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { message, context } = req.body;
      
      // Get user's coach settings
      const user = await storage.getUser(req.user!.userId);
      const coachName = user?.coachName || 'Coach';
      const baseTone = user?.coachTone || 'encouraging';
      
      // Get today's wellness data if not provided in context
      if (!context.wellness) {
        const today = new Date().toISOString().split('T')[0];
        const todayWellness = await db.query.garminWellnessMetrics.findFirst({
          where: (m, { and, eq }) => and(
            eq(m.userId, req.user!.userId),
            eq(m.date, today)
          ),
        });
        
        if (todayWellness) {
          context.wellness = {
            bodyBattery: todayWellness.bodyBatteryCurrent,
            sleepQuality: todayWellness.sleepQuality,
            stressQualifier: todayWellness.stressQualifier,
            hrvStatus: todayWellness.hrvStatus,
            readinessScore: todayWellness.readinessScore,
          };
        }
      }
      
      const effectiveTone = getPhaseTone(
        baseTone,
        context.distance,
        context.totalDistance,
        context.phase
      );

      // Add coach settings to context
      context.coachTone = effectiveTone;
      context.coachName = coachName;
      
      const aiService = await import("./ai-service");
      const response = await aiService.getWellnessAwareCoachingResponse(message, context);
      
      // Generate TTS audio with user's voice settings
      const coachGender = user?.coachGender || 'female';
      const coachAccent = user?.coachAccent || 'british';
      const voice = mapCoachVoice(coachGender, coachAccent, effectiveTone);
      const audioBuffer = await aiService.generateTTS(response, voice);
      const base64Audio = audioBuffer.toString('base64');
      
      res.json({ 
        message: response,
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error: any) {
      console.error("Talk to coach error:", error);
      res.status(500).json({ error: "Failed to get coaching response" });
    }
  });

  // Heart rate zone coaching
  app.post("/api/coaching/hr-coaching", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { currentHR, avgHR, maxHR, targetZone, elapsedMinutes } = req.body;
      
      // Get user's coach settings
      const user = await storage.getUser(req.user!.userId);
      const coachName = user?.coachName || 'Coach';
      const baseTone = user?.coachTone || 'encouraging';
      
      // Get today's wellness for context
      const today = new Date().toISOString().split('T')[0];
      let wellness: any = undefined;
      
      const todayWellness = await db.query.garminWellnessMetrics.findFirst({
        where: (m, { and, eq }) => and(
          eq(m.userId, req.user!.userId),
          eq(m.date, today)
        ),
      });
      
      if (todayWellness) {
        wellness = {
          bodyBattery: todayWellness.bodyBatteryCurrent,
          sleepQuality: todayWellness.sleepQuality,
          hrvStatus: todayWellness.hrvStatus,
        };
      }
      
      const effectiveTone = getPhaseTone(
        baseTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );

      const aiService = await import("./ai-service");
      const response = await aiService.generateHeartRateCoaching({
        currentHR,
        avgHR,
        maxHR: maxHR || 190,
        targetZone,
        elapsedMinutes: elapsedMinutes || 0,
        coachName,
        coachTone: effectiveTone,
        wellness,
      });
      
      // Generate TTS audio with user's voice settings
      const coachGender = user?.coachGender || 'female';
      const coachAccent = user?.coachAccent || 'british';
      const voice = mapCoachVoice(coachGender, coachAccent, effectiveTone);
      const audioBuffer = await aiService.generateTTS(response, voice);
      const base64Audio = audioBuffer.toString('base64');
      
      res.json({ 
        message: response,
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error: any) {
      console.error("HR coaching error:", error);
      res.status(500).json({ error: "Failed to get HR coaching" });
    }
  });

  // ============================================
  // GARMIN COMPANION APP API ENDPOINTS
  // ============================================
  // These endpoints are for the Android companion app to publish
  // real-time data from Garmin SDK to this backend.
  
  // Companion app authentication - validates user and returns session token
  app.post("/api/garmin-companion/auth", async (req: Request, res: Response) => {
    try {
      const { email, password, deviceId, deviceModel } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Verify password
      const bcrypt = await import("bcryptjs");
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Generate a companion session token (JWT)
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign(
        { userId: user.id, type: "companion", deviceId },
        process.env.SESSION_SECRET || "fallback-secret",
        { expiresIn: "30d" }
      );
      
      console.log(`[Companion] User ${user.email} authenticated from device ${deviceModel || deviceId}`);
      
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coachName: user.coachName,
          coachTone: user.coachTone,
        },
      });
    } catch (error: any) {
      console.error("Companion auth error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });
  
  // Middleware for companion app authentication
  const companionAuthMiddleware = async (req: Request, res: Response, next: Function) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
      }
      
      const token = authHeader.slice(7);
      const jwt = await import("jsonwebtoken");
      const decoded = jwt.default.verify(token, process.env.SESSION_SECRET || "fallback-secret") as any;
      
      if (decoded.type !== "companion") {
        return res.status(401).json({ error: "Invalid token type" });
      }
      
      (req as any).companionUser = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
  
  // Start a new companion session (when activity starts on watch)
  app.post("/api/garmin-companion/session/start", companionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).companionUser;
      const { sessionId, deviceId, deviceModel, activityType } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      
      // Check if session already exists
      const existing = await db.select().from(garminCompanionSessions).where(eq(garminCompanionSessions.sessionId, sessionId)).limit(1);
      if (existing.length > 0) {
        return res.json({ success: true, session: existing[0], message: "Session already exists" });
      }
      
      // Create new session
      const [session] = await db.insert(garminCompanionSessions).values({
        userId,
        sessionId,
        deviceId,
        deviceModel,
        activityType: activityType || "running",
        status: "active",
        startedAt: new Date(),
      }).returning();
      
      console.log(`[Companion] Session ${sessionId} started for user ${userId} (${activityType || "running"})`);
      
      res.json({
        success: true,
        session,
        message: "Session started",
      });
    } catch (error: any) {
      console.error("Companion session start error:", error);
      res.status(500).json({ error: "Failed to start session" });
    }
  });
  
  // Link companion session to a run (when phone app creates a run)
  app.post("/api/garmin-companion/session/link", companionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).companionUser;
      const { sessionId, runId } = req.body;
      
      if (!sessionId || !runId) {
        return res.status(400).json({ error: "Session ID and Run ID required" });
      }
      
      // Update session with run ID
      const [updated] = await db.update(garminCompanionSessions)
        .set({ runId })
        .where(and(
          eq(garminCompanionSessions.sessionId, sessionId),
          eq(garminCompanionSessions.userId, userId)
        ))
        .returning();
      
      // Also update all existing data points with the run ID
      await db.update(garminRealtimeData)
        .set({ runId })
        .where(eq(garminRealtimeData.sessionId, sessionId));
      
      console.log(`[Companion] Session ${sessionId} linked to run ${runId}`);
      
      res.json({ success: true, session: updated });
    } catch (error: any) {
      console.error("Companion session link error:", error);
      res.status(500).json({ error: "Failed to link session" });
    }
  });
  
  // Publish real-time data (single data point)
  app.post("/api/garmin-companion/data", companionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).companionUser;
      const data = req.body;
      
      if (!data.sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      
      // Get session to find linked runId
      const sessions = await db.select().from(garminCompanionSessions)
        .where(eq(garminCompanionSessions.sessionId, data.sessionId))
        .limit(1);
      
      const session = sessions[0];
      const runId = session?.runId || null;
      
      // Insert data point
      const [inserted] = await db.insert(garminRealtimeData).values({
        userId,
        runId,
        sessionId: data.sessionId,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        heartRate: data.heartRate,
        heartRateZone: data.heartRateZone,
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        speed: data.speed,
        pace: data.pace,
        cadence: data.cadence,
        strideLength: data.strideLength,
        groundContactTime: data.groundContactTime,
        groundContactBalance: data.groundContactBalance,
        verticalOscillation: data.verticalOscillation,
        verticalRatio: data.verticalRatio,
        power: data.power,
        temperature: data.temperature,
        activityType: data.activityType,
        isMoving: data.isMoving ?? true,
        isPaused: data.isPaused ?? false,
        cumulativeDistance: data.cumulativeDistance,
        cumulativeAscent: data.cumulativeAscent,
        cumulativeDescent: data.cumulativeDescent,
        elapsedTime: data.elapsedTime,
      }).returning();
      
      // Update session last data time and count
      await db.update(garminCompanionSessions)
        .set({
          lastDataAt: new Date(),
          dataPointCount: sql`data_point_count + 1`,
        })
        .where(eq(garminCompanionSessions.sessionId, data.sessionId));
      
      res.json({ success: true, id: inserted.id });
    } catch (error: any) {
      console.error("Companion data error:", error);
      res.status(500).json({ error: "Failed to save data" });
    }
  });
  
  // Publish batch data (multiple data points for efficiency)
  app.post("/api/garmin-companion/data/batch", companionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).companionUser;
      const { sessionId, dataPoints } = req.body;
      
      if (!sessionId || !Array.isArray(dataPoints) || dataPoints.length === 0) {
        return res.status(400).json({ error: "Session ID and data points array required" });
      }
      
      // Get session to find linked runId
      const sessions = await db.select().from(garminCompanionSessions)
        .where(eq(garminCompanionSessions.sessionId, sessionId))
        .limit(1);
      
      const session = sessions[0];
      const runId = session?.runId || null;
      
      // Insert all data points
      const values = dataPoints.map((data: any) => ({
        userId,
        runId,
        sessionId,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        heartRate: data.heartRate,
        heartRateZone: data.heartRateZone,
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        speed: data.speed,
        pace: data.pace,
        cadence: data.cadence,
        strideLength: data.strideLength,
        groundContactTime: data.groundContactTime,
        groundContactBalance: data.groundContactBalance,
        verticalOscillation: data.verticalOscillation,
        verticalRatio: data.verticalRatio,
        power: data.power,
        temperature: data.temperature,
        activityType: data.activityType,
        isMoving: data.isMoving ?? true,
        isPaused: data.isPaused ?? false,
        cumulativeDistance: data.cumulativeDistance,
        cumulativeAscent: data.cumulativeAscent,
        cumulativeDescent: data.cumulativeDescent,
        elapsedTime: data.elapsedTime,
      }));
      
      await db.insert(garminRealtimeData).values(values);
      
      // Update session
      await db.update(garminCompanionSessions)
        .set({
          lastDataAt: new Date(),
          dataPointCount: sql`data_point_count + ${dataPoints.length}`,
        })
        .where(eq(garminCompanionSessions.sessionId, sessionId));
      
      console.log(`[Companion] Batch insert ${dataPoints.length} points for session ${sessionId}`);
      
      res.json({ success: true, count: dataPoints.length });
    } catch (error: any) {
      console.error("Companion batch data error:", error);
      res.status(500).json({ error: "Failed to save batch data" });
    }
  });
  
  // Pause/resume session
  app.post("/api/garmin-companion/session/status", companionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).companionUser;
      const { sessionId, status } = req.body; // status: 'active' | 'paused'
      
      if (!sessionId || !status) {
        return res.status(400).json({ error: "Session ID and status required" });
      }
      
      const [updated] = await db.update(garminCompanionSessions)
        .set({ status })
        .where(and(
          eq(garminCompanionSessions.sessionId, sessionId),
          eq(garminCompanionSessions.userId, userId)
        ))
        .returning();
      
      console.log(`[Companion] Session ${sessionId} status changed to ${status}`);
      
      res.json({ success: true, session: updated });
    } catch (error: any) {
      console.error("Companion session status error:", error);
      res.status(500).json({ error: "Failed to update session status" });
    }
  });
  
  // End session (calculates summary stats)
  app.post("/api/garmin-companion/session/end", companionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).companionUser;
      const { sessionId, summary } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      
      // Calculate summary stats from data points if not provided
      let stats = summary || {};
      
      if (!summary) {
        const dataPoints = await db.select().from(garminRealtimeData)
          .where(eq(garminRealtimeData.sessionId, sessionId))
          .orderBy(garminRealtimeData.timestamp);
        
        if (dataPoints.length > 0) {
          const heartRates = dataPoints.filter(d => d.heartRate).map(d => d.heartRate!);
          const cadences = dataPoints.filter(d => d.cadence).map(d => d.cadence!);
          const paces = dataPoints.filter(d => d.pace && d.pace > 0).map(d => d.pace!);
          const lastPoint = dataPoints[dataPoints.length - 1];
          
          stats = {
            totalDistance: lastPoint.cumulativeDistance,
            totalDuration: lastPoint.elapsedTime,
            avgHeartRate: heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null,
            maxHeartRate: heartRates.length > 0 ? Math.max(...heartRates) : null,
            avgCadence: cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null,
            avgPace: paces.length > 0 ? paces.reduce((a, b) => a + b, 0) / paces.length : null,
            totalAscent: lastPoint.cumulativeAscent,
            totalDescent: lastPoint.cumulativeDescent,
          };
        }
      }
      
      // Update session with end time and stats
      const [updated] = await db.update(garminCompanionSessions)
        .set({
          status: "completed",
          endedAt: new Date(),
          totalDistance: stats.totalDistance,
          totalDuration: stats.totalDuration,
          avgHeartRate: stats.avgHeartRate,
          maxHeartRate: stats.maxHeartRate,
          avgCadence: stats.avgCadence,
          avgPace: stats.avgPace,
          totalAscent: stats.totalAscent,
          totalDescent: stats.totalDescent,
        })
        .where(and(
          eq(garminCompanionSessions.sessionId, sessionId),
          eq(garminCompanionSessions.userId, userId)
        ))
        .returning();
      
      console.log(`[Companion] Session ${sessionId} ended - ${stats.totalDistance?.toFixed(0) || 0}m in ${stats.totalDuration || 0}s`);
      
      res.json({ success: true, session: updated, summary: stats });
    } catch (error: any) {
      console.error("Companion session end error:", error);
      res.status(500).json({ error: "Failed to end session" });
    }
  });
  
  // Get active session data (for phone app to read real-time data)
  app.get("/api/garmin-companion/session/:sessionId/data", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { since } = req.query; // Timestamp to get data since (for incremental updates)
      
      let query = db.select().from(garminRealtimeData)
        .where(eq(garminRealtimeData.sessionId, sessionId))
        .orderBy(garminRealtimeData.timestamp);
      
      if (since) {
        const sinceDate = new Date(since as string);
        query = db.select().from(garminRealtimeData)
          .where(and(
            eq(garminRealtimeData.sessionId, sessionId),
            sql`timestamp > ${sinceDate}`
          ))
          .orderBy(garminRealtimeData.timestamp);
      }
      
      const dataPoints = await query.limit(1000);
      
      res.json({ dataPoints, count: dataPoints.length });
    } catch (error: any) {
      console.error("Get companion data error:", error);
      res.status(500).json({ error: "Failed to get session data" });
    }
  });
  
  // Get latest data point for a session (for real-time display)
  app.get("/api/garmin-companion/session/:sessionId/latest", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      const [latest] = await db.select().from(garminRealtimeData)
        .where(eq(garminRealtimeData.sessionId, sessionId))
        .orderBy(sql`timestamp DESC`)
        .limit(1);
      
      const [session] = await db.select().from(garminCompanionSessions)
        .where(eq(garminCompanionSessions.sessionId, sessionId))
        .limit(1);
      
      res.json({ latest, session });
    } catch (error: any) {
      console.error("Get latest companion data error:", error);
      res.status(500).json({ error: "Failed to get latest data" });
    }
  });
  
  // Get user's active companion sessions
  app.get("/api/garmin-companion/sessions/active", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      
      const sessions = await db.select().from(garminCompanionSessions)
        .where(and(
          eq(garminCompanionSessions.userId, userId),
          eq(garminCompanionSessions.status, "active")
        ))
        .orderBy(sql`started_at DESC`);
      
      res.json({ sessions });
    } catch (error: any) {
      console.error("Get active sessions error:", error);
      res.status(500).json({ error: "Failed to get active sessions" });
    }
  });
  
  // ==================== ANDROID V2 ENDPOINTS ====================

  // Update coach settings
  app.put("/api/users/:id/coach-settings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { coachName, coachGender, coachAccent, coachTone } = req.body;
      
      // Verify user is updating their own settings
      if (req.user?.userId !== id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Validate inputs
      const validGenders = ['male', 'female'];
      const validAccents = ['British', 'American', 'Australian', 'Irish', 'Scottish', 'New Zealand'];
      const validTones = ['Energetic', 'Motivational', 'Instructive', 'Factual', 'Abrupt'];
      
      if (coachGender && !validGenders.includes(coachGender)) {
        return res.status(400).json({ error: 'Invalid coach gender' });
      }
      
      if (coachAccent && !validAccents.includes(coachAccent)) {
        return res.status(400).json({ error: `Invalid coach accent: ${coachAccent}. Valid options: ${validAccents.join(', ')}` });
      }
      
      if (coachTone && !validTones.includes(coachTone)) {
        return res.status(400).json({ error: `Invalid coach tone: ${coachTone}. Valid options: ${validTones.join(', ')}` });
      }
      
      // Update user
      const updatedUser = await storage.updateUser(id, {
        coachName,
        coachGender,
        coachAccent,
        coachTone
      });
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Update coach settings error:", error);
      res.status(500).json({ error: "Failed to update coach settings" });
    }
  });

  // Get friends list (Android format)
  app.get("/api/friends/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { status } = req.query;
      
      // Verify user is requesting their own friends
      if (req.user?.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const friendUsers = await storage.getFriends(userId);
      
      const friends = friendUsers.map(f => ({
        id: f.id,
        name: f.name,
        email: f.email,
        profilePic: f.profilePic,
        fitnessLevel: f.fitnessLevel,
        distanceScale: f.distanceScale
      }));
      
      res.json(friends);
    } catch (error: any) {
      console.error("Get friends error:", error);
      res.status(500).json({ error: "Failed to get friends" });
    }
  });

  // Add a friend
  app.post("/api/friends/:userId/add", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { friendId } = req.body;
      
      // Verify user is adding to their own friends list
      if (req.user?.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Can't add self
      if (userId === friendId) {
        return res.status(400).json({ error: "Cannot add yourself as a friend" });
      }
      
      // Check if friend user exists
      const friendUser = await storage.getUser(friendId);
      if (!friendUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if friendship already exists
      const existingFriends = await storage.getFriends(userId);
      if (existingFriends.some(f => f.id === friendId)) {
        return res.status(409).json({ error: "Friendship already exists" });
      }
      
      // Add friend (bidirectional)
      await storage.addFriend(userId, friendId);
      await storage.addFriend(friendId, userId); // Mutual friendship
      
      // Return friend details
      const { password: _, ...friendWithoutPassword } = friendUser;
      res.status(201).json({
        id: friendUser.id,
        name: friendUser.name,
        email: friendUser.email,
        profilePicUrl: friendUser.profilePic,
        subscriptionTier: friendUser.subscriptionTier || 'free',
        friendshipStatus: 'accepted',
        friendsSince: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Add friend error:", error);
      res.status(500).json({ error: "Failed to add friend" });
    }
  });

  // Remove a friend
  app.delete("/api/friends/:userId/:friendId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, friendId } = req.params;
      
      if (req.user?.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      await storage.removeFriend(userId, friendId);
      
      res.status(204).send();
    } catch (error: any) {
      console.error("Remove friend error:", error);
      res.status(500).json({ error: "Failed to remove friend" });
    }
  });

  // Get group runs (Android format)
  app.get("/api/group-runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status: statusFilter, my_groups } = req.query;
      const userId = req.user!.userId;
      
      // Get all group runs
      const allGroupRuns = await storage.getGroupRuns();
      
      // Get participants for each group run
      const groupRunsWithDetails = await Promise.all(
        allGroupRuns.map(async (gr) => {
          // Get host/creator details
          const host = await storage.getUser(gr.hostUserId);
          
          // Get participants count
          const participants = await db.select().from(groupRunParticipants)
            .where(and(
              eq(groupRunParticipants.groupRunId, gr.id),
              eq(groupRunParticipants.invitationStatus, 'accepted')
            ));
          
          // Check if current user is joined
          const userParticipant = participants.find(p => p.userId === userId);
          
          return {
            id: gr.id,
            name: gr.title || 'Group Run',
            description: gr.description || '',
            creatorId: gr.hostUserId,
            creatorName: host?.name || 'Unknown',
            meetingPoint: 'TBD', // Not in current schema
            meetingLat: null,
            meetingLng: null,
            distance: gr.targetDistance || 5.0,
            dateTime: gr.plannedStartAt?.toISOString() || new Date().toISOString(),
            maxParticipants: 10, // Default
            currentParticipants: participants.length,
            isPublic: true,
            status: gr.status || 'upcoming',
            isJoined: !!userParticipant,
            createdAt: gr.createdAt?.toISOString() || new Date().toISOString()
          };
        })
      );
      
      // Apply filters
      let filteredRuns = groupRunsWithDetails;
      
      if (statusFilter) {
        filteredRuns = filteredRuns.filter(gr => gr.status === statusFilter);
      }
      
      if (my_groups === 'true') {
        filteredRuns = filteredRuns.filter(gr => gr.creatorId === userId || gr.isJoined);
      }
      
      res.json({
        groupRuns: filteredRuns,
        count: filteredRuns.length,
        total: groupRunsWithDetails.length
      });
    } catch (error: any) {
      console.error("Get group runs error:", error);
      res.status(500).json({ error: "Failed to get group runs" });
    }
  });

  // Create a group run
  app.post("/api/group-runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        name, description, meetingPoint, meetingLat, meetingLng,
        distance, dateTime, maxParticipants = 10, isPublic = true
      } = req.body;
      
      const creatorId = req.user!.userId;
      
      // Validation
      if (!name || !distance || !dateTime) {
        return res.status(400).json({ error: 'Missing required fields: name, distance, dateTime' });
      }
      
      if (new Date(dateTime) <= new Date()) {
        return res.status(400).json({ error: 'Date/time must be in the future' });
      }
      
      if (distance <= 0 || distance > 100) {
        return res.status(400).json({ error: 'Distance must be between 0 and 100 km' });
      }
      
      // Generate invite token
      const inviteToken = Math.random().toString(36).substring(2, 15);
      
      // Create group run
      const groupRun = await storage.createGroupRun({
        hostUserId: creatorId,
        title: name,
        description,
        targetDistance: distance,
        plannedStartAt: new Date(dateTime),
        inviteToken,
        status: 'pending',
        mode: 'route'
      });
      
      // Auto-join creator as participant
      await storage.joinGroupRun(groupRun.id, creatorId);
      
      // Get creator details
      const creator = await storage.getUser(creatorId);
      
      res.status(201).json({
        id: groupRun.id,
        name: groupRun.title,
        description: groupRun.description,
        creatorId: groupRun.hostUserId,
        creatorName: creator?.name || 'Unknown',
        meetingPoint: meetingPoint || 'TBD',
        meetingLat,
        meetingLng,
        distance: groupRun.targetDistance,
        dateTime: groupRun.plannedStartAt?.toISOString(),
        maxParticipants,
        currentParticipants: 1,
        isPublic,
        status: groupRun.status,
        isJoined: true,
        createdAt: groupRun.createdAt?.toISOString()
      });
    } catch (error: any) {
      console.error("Create group run error:", error);
      res.status(500).json({ error: "Failed to create group run" });
    }
  });

  // Join a group run
  app.post("/api/group-runs/:groupRunId/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const userId = req.user!.userId;
      
      // Check if group run exists
      const groupRun = await storage.getGroupRun(groupRunId);
      if (!groupRun) {
        return res.status(404).json({ error: 'Group run not found' });
      }
      
      // Check if already joined
      const participants = await db.select().from(groupRunParticipants)
        .where(and(
          eq(groupRunParticipants.groupRunId, groupRunId),
          eq(groupRunParticipants.userId, userId)
        ));
      
      if (participants.length > 0) {
        return res.status(409).json({ error: 'Already joined this group run' });
      }
      
      // Check if group is full (optional - could be added later)
      
      // Join group
      await storage.joinGroupRun(groupRunId, userId);
      
      res.json({
        message: 'Successfully joined group run',
        groupRunId,
        userId
      });
    } catch (error: any) {
      console.error("Join group run error:", error);
      res.status(500).json({ error: "Failed to join group run" });
    }
  });

  // Leave a group run
  app.delete("/api/group-runs/:groupRunId/leave", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const userId = req.user!.userId;
      
      // Check if user is the creator
      const groupRun = await storage.getGroupRun(groupRunId);
      if (groupRun?.hostUserId === userId) {
        return res.status(400).json({ error: 'Creators cannot leave their own group run. Delete it instead.' });
      }
      
      // Remove participant
      await db.delete(groupRunParticipants)
        .where(and(
          eq(groupRunParticipants.groupRunId, groupRunId),
          eq(groupRunParticipants.userId, userId)
        ));
      
      res.status(204).send();
    } catch (error: any) {
      console.error("Leave group run error:", error);
      res.status(500).json({ error: "Failed to leave group run" });
    }
  });

  // ==================== FITNESS & FRESHNESS ENDPOINTS ====================
  
  // Get current fitness status
  app.get("/api/fitness/current/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      const currentFitness = await getCurrentFitness(userId);
      
      if (!currentFitness) {
        return res.json({
          ctl: 0,
          atl: 0,
          tsb: 0,
          status: "no_data",
          message: "No fitness data available yet. Complete some runs to see your fitness metrics!"
        });
      }
      
      const recommendations = getFitnessRecommendations(
        currentFitness.ctl,
        currentFitness.atl,
        currentFitness.tsb,
        currentFitness.status,
        currentFitness.injuryRisk || "low"
      );
      
      res.json({
        ...currentFitness,
        recommendations
      });
    } catch (error: any) {
      console.error("Get current fitness error:", error);
      res.status(500).json({ error: "Failed to get fitness status" });
    }
  });
  
  // Get fitness trend for date range
  app.get("/api/fitness/trend/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Default to last 90 days if not specified
      const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
      const start = startDate ? String(startDate) : (() => {
        const date = new Date();
        date.setDate(date.getDate() - 90);
        return date.toISOString().split('T')[0];
      })();
      
      const trend = await getFitnessTrend(userId, start, end);
      
      res.json({
        startDate: start,
        endDate: end,
        dataPoints: trend.length,
        trend: trend.map(point => ({
          date: point.date,
          fitness: point.ctl,
          fatigue: point.atl,
          form: point.tsb,
          trainingLoad: point.trainingLoad,
          status: point.status,
          rampRate: point.rampRate,
          injuryRisk: point.injuryRisk
        }))
      });
    } catch (error: any) {
      console.error("Get fitness trend error:", error);
      res.status(500).json({ error: "Failed to get fitness trend" });
    }
  });
  
  // Recalculate all historical fitness data
  app.post("/api/fitness/recalculate/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      // Verify user is requesting their own data
      if (req.user!.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await recalculateHistoricalFitness(userId);
      
      res.json({ 
        success: true,
        message: "Historical fitness data recalculated successfully"
      });
    } catch (error: any) {
      console.error("Recalculate fitness error:", error);
      res.status(500).json({ error: "Failed to recalculate fitness data" });
    }
  });
  
  // ==================== RUN ANALYSIS ENDPOINT ====================
  
  // Delete a run
  app.delete("/api/runs/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      // Get run to verify ownership
      const run = await storage.getRun(id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      if (run.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this run" });
      }
      
      // Delete run (this would need to be added to storage.ts)
      await db.delete(runs).where(eq(runs.id, id));
      
      // Recalculate fitness after deletion
      if (run.completedAt && run.tss) {
        recalculateHistoricalFitness(userId).catch(err => {
          console.error("Failed to recalculate fitness after run deletion:", err);
        });
      }
      
      res.json({ success: true, message: "Run deleted successfully" });
    } catch (error: any) {
      console.error("Delete run error:", error);
      res.status(500).json({ error: "Failed to delete run" });
    }
  });
  

  // Get comprehensive run analysis (Android-compatible)
  // Accepts the Android `RunAnalysisRequest` payload and returns an Android `RunAnalysisResponse` shape.
  app.post("/api/coaching/run-analysis", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {};
      const runId = String(body.runId || "");
      if (!runId) {
        return res.status(400).json({ error: "runId is required" });
      }

      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }

      // Ownership check
      if (req.user?.userId && run.userId && req.user.userId !== run.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Persist self-assessment + struggle points (best effort)
      try {
        const userPostRunComments = typeof body.userPostRunComments === "string" ? body.userPostRunComments : undefined;
        const strugglePoints = Array.isArray(body.relevantStrugglePoints) ? body.relevantStrugglePoints : undefined;
        if (userPostRunComments !== undefined || strugglePoints !== undefined) {
          await storage.updateRun(runId, {
            userComments: userPostRunComments ?? run.userComments ?? null,
            strugglePoints: strugglePoints ?? run.strugglePoints ?? null,
          } as any);
        }
      } catch (e) {
        console.warn("Failed to persist post-run comments/struggle points:", e);
      }

      const user = await storage.getUser(run.userId);

      const previousRuns = await db
        .select()
        .from(runs)
        .where(eq(runs.userId, run.userId))
        .orderBy(desc(runs.completedAt))
        .limit(10);

      const coachName = body.coachName || user?.coachName || "AI Coach";
      const coachTone = body.coachTone || user?.coachTone || "energetic";

      // Build runData for the AI service (merge DB + request so we capture everything Android provides)
      const runDataForAi = {
        ...run,
        ...body,
        // Normalize fields used by AI service
        avgPace: body.averagePace || run.avgPace,
        elevationGain: body.elevationGain ?? run.elevationGain,
        elevationLoss: body.elevationLoss ?? run.elevationLoss,
        terrainType: body.terrainType || run.terrainType,
        kmSplits: body.kmSplits || run.kmSplits,
        strugglePoints: body.relevantStrugglePoints || run.strugglePoints,
        userComments: body.userPostRunComments || run.userComments,
      };

      let ai: any = null;
      try {
        const aiService = await import("./ai-service");
        ai = await aiService.generateComprehensiveRunAnalysis({
          runData: runDataForAi,
          previousRuns: previousRuns.filter(r => r.id !== runId).slice(0, 5),
          userProfile: body.userProfile || (user ? {
            fitnessLevel: user.fitnessLevel || undefined,
            age: user.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined,
            weight: user.weight ? parseFloat(user.weight as any) : undefined,
          } : undefined),
          coachName,
          coachTone,
        });
      } catch (e: any) {
        console.error("AI analysis generation failed, falling back to lightweight response:", e);
        ai = {
          summary: `Great run! You covered ${(((body.distance ?? run.distance) || 0) / 1000).toFixed(2)}km in ${Math.round((((body.duration ?? run.duration) || 0) / 1000) / 60)} minutes.`,
          performanceScore: 78,
          highlights: ["Strong effort", "Solid completion"],
          struggles: [],
          personalBests: [],
          improvementTips: ["Add an easy recovery run", "Include one interval session this week"],
          trainingLoadAssessment: "Moderate training stimulus.",
          recoveryAdvice: "Hydrate, refuel, and prioritize sleep tonight.",
          nextRunSuggestion: "Easy 20–30 min recovery run.",
          wellnessImpact: "Wellness data not available.",
          technicalAnalysis: {
            paceAnalysis: "Your pacing was generally consistent.",
            heartRateAnalysis: "Heart-rate data not available.",
            cadenceAnalysis: "Cadence data not available.",
            runningDynamics: "Running dynamics not available.",
            elevationPerformance: "Elevation performance not available.",
          },
        };
      }

      // Map to Android RunAnalysisResponse schema
      const score10 = (v: any) => {
        const n = Number(v);
        if (!isFinite(n)) return 0;
        const out = n > 10 ? (n / 10) : n; // accept 0-10 or 0-100
        return Math.max(0, Math.min(10, Math.round(out * 10) / 10));
      };

      const strengths = Array.isArray(ai.highlights) ? ai.highlights : [];
      const areasForImprovement = Array.isArray(ai.improvementTips)
        ? ai.improvementTips
        : (Array.isArray(ai.struggles) ? ai.struggles : []);

      const trainingRecommendations = (Array.isArray(ai.improvementTips) ? ai.improvementTips : []).slice(0, 6).map((t: string) => ({
        category: "technique",
        recommendation: t,
        priority: "medium",
        specificWorkout: null,
      }));

      const response = {
        executiveSummary: String(ai.summary || ""),
        strengths,
        areasForImprovement,
        overallPerformanceScore: score10(ai.performanceScore ?? 0),
        paceConsistencyScore: score10(ai.paceConsistencyScore ?? 7.5),
        effortScore: score10(ai.effortScore ?? 8.0),
        mentalToughnessScore: null,
        comparisonToPreviousRuns: null,
        demographicComparison: null,
        personalBestAnalysis: Array.isArray(ai.personalBests) && ai.personalBests.length ? ai.personalBests.join("\n") : null,
        trainingRecommendations,
        recoveryAdvice: String(ai.recoveryAdvice || ""),
        nextRunSuggestion: String(ai.nextRunSuggestion || ""),
        goalsProgress: [],
        targetAchievementAnalysis: null,
        weatherImpactAnalysis: null,
        terrainAnalysis: String(ai.technicalAnalysis?.elevationPerformance || ai.technicalAnalysis?.paceAnalysis || ""),
        strugglePointsInsight: Array.isArray(body.relevantStrugglePoints) && body.relevantStrugglePoints.length
          ? `We detected ${body.relevantStrugglePoints.length} struggle point(s). Your notes help us interpret them accurately.`
          : null,
        coachMotivationalMessage: String(ai.coachMotivationalMessage || ai.summary || "Great work — keep building!"),
      };

      res.json(response);
    } catch (error: any) {
      console.error("Run analysis error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate run analysis" });
    }
  });


  // ==================== SEGMENT ENDPOINTS ====================
  
  // Get segments near a location
  app.get("/api/segments/nearby", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { lat, lng, radius = 5 } = req.query; // radius in km
      
      if (!lat || !lng) {
        return res.status(400).json({ error: "Latitude and longitude required" });
      }
      
      const latitude = parseFloat(String(lat));
      const longitude = parseFloat(String(lng));
      const radiusKm = parseFloat(String(radius));
      
      // Simple bounding box query (0.01 degrees ≈ 1km)
      const latDelta = radiusKm * 0.01;
      const lngDelta = radiusKm * 0.01;
      
      const nearbySegments = await db
        .select()
        .from(segments)
        .where(
          sql`${segments.startLat} BETWEEN ${latitude - latDelta} AND ${latitude + latDelta}
          AND ${segments.startLng} BETWEEN ${longitude - lngDelta} AND ${longitude + lngDelta}`
        )
        .limit(20);
      
      res.json(nearbySegments);
    } catch (error: any) {
      console.error("Get nearby segments error:", error);
      res.status(500).json({ error: "Failed to get nearby segments" });
    }
  });
  
  // Get segment leaderboard
  app.get("/api/segments/:id/leaderboard", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { timeframe = 'all' } = req.query; // all, yearly, monthly
      
      let efforts = await db
        .select({
          effort: segmentEfforts,
          user: users
        })
        .from(segmentEfforts)
        .leftJoin(users, eq(segmentEfforts.userId, users.id))
        .where(eq(segmentEfforts.segmentId, id as any))
        .orderBy(segmentEfforts.elapsedTime)
        .limit(100);
      
      // Filter by timeframe if needed
      if (timeframe === 'yearly') {
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        efforts = efforts.filter(e => 
          e.effort.createdAt && e.effort.createdAt >= yearAgo
        );
      } else if (timeframe === 'monthly') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        efforts = efforts.filter(e => 
          e.effort.createdAt && e.effort.createdAt >= monthAgo
        );
      }
      
      res.json({
        segmentId: id,
        timeframe,
        leaderboard: efforts.map((e, index) => ({
          rank: index + 1,
          userId: e.user?.id,
          userName: e.user?.name,
          userProfilePic: e.user?.profilePic,
          elapsedTime: e.effort.elapsedTime,
          avgHeartRate: e.effort.avgHeartRate,
          avgPower: e.effort.avgPower,
          achievementType: e.effort.achievementType,
          createdAt: e.effort.createdAt
        }))
      });
    } catch (error: any) {
      console.error("Get segment leaderboard error:", error);
      res.status(500).json({ error: "Failed to get segment leaderboard" });
    }
  });
  
  // Star/unstar a segment
  app.post("/api/segments/:id/star", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      // Check if already starred
      const existing = await db
        .select()
        .from(segmentStars)
        .where(
          and(
            eq(segmentStars.segmentId, id as any),
            eq(segmentStars.userId, userId)
          )
        )
        .limit(1);
      
      if (existing.length > 0) {
        // Unstar
        await db.delete(segmentStars).where(eq(segmentStars.id, existing[0].id));
        return res.json({ starred: false });
      } else {
        // Star
        await db.insert(segmentStars).values({
          segmentId: id as any,
          userId
        });
        return res.json({ starred: true });
      }
    } catch (error: any) {
      console.error("Star segment error:", error);
      res.status(500).json({ error: "Failed to star/unstar segment" });
    }
  });
  
  // Create a segment from a run
  app.post("/api/segments/create", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId, startIndex, endIndex, name, description } = req.body;
      const userId = req.user!.userId;
      
      if (!runId || startIndex === undefined || endIndex === undefined || !name) {
        return res.status(400).json({ error: "runId, startIndex, endIndex, and name are required" });
      }
      
      const segmentId = await createSegmentFromRun(
        runId,
        userId,
        startIndex,
        endIndex,
        name,
        description
      );
      
      res.status(201).json({ segmentId, message: "Segment created successfully" });
    } catch (error: any) {
      console.error("Create segment error:", error);
      res.status(500).json({ error: error.message || "Failed to create segment" });
    }
  });
  
  // Reprocess a run to find segment matches
  app.post("/api/segments/reprocess/:runId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId } = req.params;
      
      await reprocessRunForSegments(runId);
      
      res.json({ success: true, message: "Run reprocessed for segment matching" });
    } catch (error: any) {
      console.error("Reprocess run error:", error);
      res.status(500).json({ error: error.message || "Failed to reprocess run" });
    }
  });
  
  // Get user's segment efforts
  app.get("/api/segments/efforts/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      const efforts = await db
        .select({
          effort: segmentEfforts,
          segment: segments
        })
        .from(segmentEfforts)
        .leftJoin(segments, eq(segmentEfforts.segmentId, segments.id as any))
        .where(eq(segmentEfforts.userId, userId))
        .orderBy(desc(segmentEfforts.createdAt))
        .limit(50);
      
      res.json(efforts.map(e => ({
        id: e.effort.id,
        segmentId: e.segment?.id,
        segmentName: e.segment?.name,
        elapsedTime: e.effort.elapsedTime,
        isPersonalRecord: e.effort.isPersonalRecord,
        leaderboardRank: e.effort.leaderboardRank,
        achievementType: e.effort.achievementType,
        createdAt: e.effort.createdAt
      })));
    } catch (error: any) {
      console.error("Get segment efforts error:", error);
      res.status(500).json({ error: "Failed to get segment efforts" });
    }
  });
  
  // ==================== HEATMAP ENDPOINT ====================
  
  // Get user's running heatmap
  app.get("/api/heatmap/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      // Get all runs with GPS tracks
      const userRuns = await db
        .select({
          gpsTrack: runs.gpsTrack,
          distance: runs.distance,
          completedAt: runs.completedAt
        })
        .from(runs)
        .where(eq(runs.userId, userId))
        .orderBy(desc(runs.completedAt));
      
      // Aggregate GPS points
      const allPoints: Array<{ lat: number; lng: number; intensity: number }> = [];
      
      for (const run of userRuns) {
        if (run.gpsTrack && Array.isArray(run.gpsTrack)) {
          const points = run.gpsTrack as Array<{ latitude: number; longitude: number }>;
          
          // Sample every nth point to reduce data size
          const sampleRate = Math.max(1, Math.floor(points.length / 100));
          
          for (let i = 0; i < points.length; i += sampleRate) {
            const point = points[i];
            if (point.latitude && point.longitude) {
              allPoints.push({
                lat: point.latitude,
                lng: point.longitude,
                intensity: 1
              });
            }
          }
        }
      }
      
      // Cluster nearby points (simple grid-based clustering)
      const gridSize = 0.001; // ~100m
      const grid = new Map<string, { lat: number; lng: number; count: number }>();
      
      for (const point of allPoints) {
        const gridLat = Math.floor(point.lat / gridSize) * gridSize;
        const gridLng = Math.floor(point.lng / gridSize) * gridSize;
        const key = `${gridLat},${gridLng}`;
        
        if (grid.has(key)) {
          const cell = grid.get(key)!;
          cell.count++;
        } else {
          grid.set(key, { lat: gridLat, lng: gridLng, count: 1 });
        }
      }
      
      // Convert to array and normalize intensity
      const maxCount = Math.max(...Array.from(grid.values()).map(c => c.count));
      const heatmapData = Array.from(grid.values()).map(cell => ({
        lat: cell.lat,
        lng: cell.lng,
        intensity: cell.count / maxCount
      }));
      
      res.json({
        totalRuns: userRuns.length,
        totalPoints: allPoints.length,
        clusteredPoints: heatmapData.length,
        heatmap: heatmapData
      });
    } catch (error: any) {
      console.error("Get heatmap error:", error);
      res.status(500).json({ error: "Failed to generate heatmap" });
    }
  });

  // ==================== TRAINING PLAN ENDPOINTS ====================
  
  // Generate AI training plan
  app.post("/api/training-plans/generate", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const {
        goalType,
        targetDistance,
        targetTime,
        targetDate,
        experienceLevel,
        daysPerWeek
      } = req.body;
      
      if (!goalType || !targetDistance) {
        return res.status(400).json({ error: "goalType and targetDistance are required" });
      }
      
      const planId = await generateTrainingPlan(
        userId,
        goalType,
        targetDistance,
        targetTime,
        targetDate ? new Date(targetDate) : undefined,
        experienceLevel || "intermediate",
        daysPerWeek || 4
      );
      
      res.status(201).json({
        planId,
        message: "Training plan generated successfully"
      });
    } catch (error: any) {
      console.error("Generate training plan error:", error);
      res.status(500).json({ error: error.message || "Failed to generate training plan" });
    }
  });
  
  // Get user's training plans
  app.get("/api/training-plans/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { status = 'active' } = req.query;
      
      const plans = await db
        .select()
        .from(trainingPlans)
        .where(
          and(
            eq(trainingPlans.userId, userId),
            eq(trainingPlans.status, String(status))
          )
        )
        .orderBy(desc(trainingPlans.createdAt));
      
      res.json(plans);
    } catch (error: any) {
      console.error("Get training plans error:", error);
      res.status(500).json({ error: "Failed to get training plans" });
    }
  });
  
  // Get training plan details with all weeks and workouts
  app.get("/api/training-plans/details/:planId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      
      // Get plan
      const plan = await db
        .select()
        .from(trainingPlans)
        .where(eq(trainingPlans.id, planId))
        .limit(1);
      
      if (!plan[0]) {
        return res.status(404).json({ error: "Training plan not found" });
      }
      
      // Get weeks
      const weeks = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.trainingPlanId, planId))
        .orderBy(weeklyPlans.weekNumber);
      
      // Get workouts for each week
      const weeksWithWorkouts = await Promise.all(
        weeks.map(async (week) => {
          const workouts = await db
            .select()
            .from(plannedWorkouts)
            .where(eq(plannedWorkouts.weeklyPlanId, week.id))
            .orderBy(plannedWorkouts.dayOfWeek);
          
          return {
            ...week,
            workouts
          };
        })
      );
      
      res.json({
        plan: plan[0],
        weeks: weeksWithWorkouts
      });
    } catch (error: any) {
      console.error("Get training plan details error:", error);
      res.status(500).json({ error: "Failed to get training plan details" });
    }
  });
  
  // Adapt training plan
  app.post("/api/training-plans/:planId/adapt", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const { reason } = req.body;
      const userId = req.user!.userId;
      
      if (!reason) {
        return res.status(400).json({ error: "Reason is required" });
      }
      
      await adaptTrainingPlan(planId, reason, userId);
      
      res.json({ success: true, message: "Training plan adapted" });
    } catch (error: any) {
      console.error("Adapt training plan error:", error);
      res.status(500).json({ error: error.message || "Failed to adapt training plan" });
    }
  });
  
  // Mark workout as completed
  app.post("/api/training-plans/complete-workout", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workoutId, runId } = req.body;
      
      if (!workoutId || !runId) {
        return res.status(400).json({ error: "workoutId and runId are required" });
      }
      
      await completeWorkout(workoutId, runId);
      
      res.json({ success: true, message: "Workout marked as completed" });
    } catch (error: any) {
      console.error("Complete workout error:", error);
      res.status(500).json({ error: "Failed to mark workout as completed" });
    }
  });
  
  // ==================== SOCIAL FEED ENDPOINTS ====================
  
  // Get activity feed
  app.get("/api/feed", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { limit = 50, offset = 0 } = req.query;
      
      // Get user's friends
      const friendsList = await storage.getFriends(userId);
      const friendIds = friendsList.map(f => f.id);
      friendIds.push(userId); // Include own activities
      
      // Get activities from friends
      const activities = await db
        .select({
          activity: feedActivities,
          user: users,
        })
        .from(feedActivities)
        .leftJoin(users, eq(feedActivities.userId, users.id))
        .where(
          and(
            sql`${feedActivities.userId} = ANY(${friendIds})`,
            sql`${feedActivities.visibility} IN ('public', 'friends')`
          )
        )
        .orderBy(desc(feedActivities.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));
      
      res.json(activities.map(a => ({
        id: a.activity.id,
        userId: a.user?.id,
        userName: a.user?.name,
        userProfilePic: a.user?.profilePic,
        activityType: a.activity.activityType,
        content: a.activity.content,
        runId: a.activity.runId,
        goalId: a.activity.goalId,
        achievementId: a.activity.achievementId,
        reactionCount: a.activity.reactionCount,
        commentCount: a.activity.commentCount,
        createdAt: a.activity.createdAt
      })));
    } catch (error: any) {
      console.error("Get activity feed error:", error);
      res.status(500).json({ error: "Failed to get activity feed" });
    }
  });
  
  // Add reaction to activity
  app.post("/api/feed/:activityId/react", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { activityId } = req.params;
      const { reactionType } = req.body; // kudos, fire, strong, clap, heart
      const userId = req.user!.userId;
      
      // Check if already reacted
      const existing = await db
        .select()
        .from(reactions)
        .where(
          and(
            eq(reactions.activityId, activityId),
            eq(reactions.userId, userId)
          )
        )
        .limit(1);
      
      if (existing.length > 0) {
        // Update reaction type
        await db
          .update(reactions)
          .set({ reactionType })
          .where(eq(reactions.id, existing[0].id));
      } else {
        // Add new reaction
        await db.insert(reactions).values({
          activityId,
          userId,
          reactionType
        });
        
        // Increment reaction count
        await db
          .update(feedActivities)
          .set({
            reactionCount: sql`${feedActivities.reactionCount} + 1`
          })
          .where(eq(feedActivities.id, activityId));
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Add reaction error:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });
  
  // Add comment to activity
  app.post("/api/feed/:activityId/comment", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { activityId } = req.params;
      const { comment } = req.body;
      const userId = req.user!.userId;
      
      if (!comment || comment.trim().length === 0) {
        return res.status(400).json({ error: "Comment cannot be empty" });
      }
      
      // Add comment
      const newComment = await db
        .insert(activityComments)
        .values({
          activityId,
          userId,
          comment: comment.trim()
        })
        .returning();
      
      // Increment comment count
      await db
        .update(feedActivities)
        .set({
          commentCount: sql`${feedActivities.commentCount} + 1`
        })
        .where(eq(feedActivities.id, activityId));
      
      res.status(201).json(newComment[0]);
    } catch (error: any) {
      console.error("Add comment error:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });
  
  // Get comments for activity
  app.get("/api/feed/:activityId/comments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { activityId } = req.params;
      
      const comments = await db
        .select({
          comment: activityComments,
          user: users
        })
        .from(activityComments)
        .leftJoin(users, eq(activityComments.userId, users.id))
        .where(eq(activityComments.activityId, activityId))
        .orderBy(activityComments.createdAt);
      
      res.json(comments.map(c => ({
        id: c.comment.id,
        userId: c.user?.id,
        userName: c.user?.name,
        userProfilePic: c.user?.profilePic,
        comment: c.comment.comment,
        likeCount: c.comment.likeCount,
        createdAt: c.comment.createdAt
      })));
    } catch (error: any) {
      console.error("Get comments error:", error);
      res.status(500).json({ error: "Failed to get comments" });
    }
  });
  
  // ==================== CLUBS ENDPOINTS ====================
  
  // Get clubs
  app.get("/api/clubs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { search, city } = req.query;
      
      let query = db.select().from(clubs).where(eq(clubs.isPublic, true));
      
      if (city) {
        query = query.where(eq(clubs.city, String(city)));
      }
      
      const clubsList = await query.orderBy(desc(clubs.memberCount)).limit(50);
      
      res.json(clubsList);
    } catch (error: any) {
      console.error("Get clubs error:", error);
      res.status(500).json({ error: "Failed to get clubs" });
    }
  });
  
  // Join club
  app.post("/api/clubs/:clubId/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { clubId } = req.params;
      const userId = req.user!.userId;
      
      // Check if already member
      const existing = await db
        .select()
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, clubId),
            eq(clubMemberships.userId, userId)
          )
        )
        .limit(1);
      
      if (existing.length > 0) {
        return res.status(409).json({ error: "Already a member" });
      }
      
      // Add membership
      await db.insert(clubMemberships).values({
        clubId,
        userId,
        role: "member"
      });
      
      // Increment member count
      await db
        .update(clubs)
        .set({
          memberCount: sql`${clubs.memberCount} + 1`
        })
        .where(eq(clubs.id, clubId));
      
      res.json({ success: true, message: "Joined club successfully" });
    } catch (error: any) {
      console.error("Join club error:", error);
      res.status(500).json({ error: "Failed to join club" });
    }
  });
  
  // ==================== CHALLENGES ENDPOINTS ====================
  
  // Get active challenges
  app.get("/api/challenges", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const now = new Date();
      
      const activeChallenges = await db
        .select()
        .from(challenges)
        .where(
          and(
            eq(challenges.isPublic, true),
            gte(challenges.endDate, now)
          )
        )
        .orderBy(challenges.startDate)
        .limit(50);
      
      res.json(activeChallenges);
    } catch (error: any) {
      console.error("Get challenges error:", error);
      res.status(500).json({ error: "Failed to get challenges" });
    }
  });
  
  // Join challenge
  app.post("/api/challenges/:challengeId/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { challengeId } = req.params;
      const userId = req.user!.userId;
      
      // Check if already participating
      const existing = await db
        .select()
        .from(challengeParticipants)
        .where(
          and(
            eq(challengeParticipants.challengeId, challengeId),
            eq(challengeParticipants.userId, userId)
          )
        )
        .limit(1);
      
      if (existing.length > 0) {
        return res.status(409).json({ error: "Already participating in this challenge" });
      }
      
      // Add participation
      await db.insert(challengeParticipants).values({
        challengeId,
        userId,
        currentProgress: 0,
        progressPercent: 0,
        isCompleted: false
      });
      
      // Increment participant count
      await db
        .update(challenges)
        .set({
          participantCount: sql`${challenges.participantCount} + 1`
        })
        .where(eq(challenges.id, challengeId));
      
      res.json({ success: true, message: "Joined challenge successfully" });
    } catch (error: any) {
      console.error("Join challenge error:", error);
      res.status(500).json({ error: "Failed to join challenge" });
    }
  });

  // ==================== ACHIEVEMENTS ENDPOINTS ====================
  
  // Initialize default achievements (run once)
  app.post("/api/achievements/initialize", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await initializeAchievements();
      res.json({ success: true, message: "Achievements initialized" });
    } catch (error: any) {
      console.error("Initialize achievements error:", error);
      res.status(500).json({ error: "Failed to initialize achievements" });
    }
  });
  
  // Get user's achievements
  app.get("/api/achievements/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const achievementsData = await getUserAchievements(userId);
      res.json(achievementsData);
    } catch (error: any) {
      console.error("Get achievements error:", error);
      res.status(500).json({ error: "Failed to get achievements" });
    }
  });
  
  // Get all available achievements
  app.get("/api/achievements", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allAchievements = await db.select().from(achievements).orderBy(achievements.category, achievements.points);
      res.json(allAchievements);
    } catch (error: any) {
      console.error("Get all achievements error:", error);
      res.status(500).json({ error: "Failed to get achievements" });
    }
  });

  // ==================== SHARE IMAGE CMS ENDPOINTS ====================

  app.get("/api/share/templates", async (req: Request, res: Response) => {
    try {
      const { TEMPLATES, STICKER_WIDGETS } = await import("./share-image-service");
      res.json({ templates: TEMPLATES, stickers: STICKER_WIDGETS });
    } catch (error: any) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Failed to get templates" });
    }
  });

  app.post("/api/share/generate", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { templateId, aspectRatio, stickers, runId } = req.body;
      if (!templateId || !runId) {
        return res.status(400).json({ error: "templateId and runId are required" });
      }

      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }

      if (run.userId !== req.user!.userId) {
        return res.status(403).json({ error: "You can only share your own runs" });
      }

      const user = await storage.getUser(req.user!.userId);

      const { generateShareImage } = await import("./share-image-service");
      const imageBuffer = await generateShareImage({
        templateId,
        aspectRatio: aspectRatio || "1:1",
        stickers: stickers || [],
        runData: {
          distance: run.distance,
          duration: run.duration,
          avgPace: run.avgPace || undefined,
          avgHeartRate: run.avgHeartRate || undefined,
          maxHeartRate: run.maxHeartRate || undefined,
          calories: run.calories || undefined,
          cadence: run.cadence || undefined,
          elevation: run.elevation || undefined,
          elevationGain: run.elevationGain || undefined,
          elevationLoss: run.elevationLoss || undefined,
          difficulty: run.difficulty || undefined,
          gpsTrack: (run.gpsTrack as any) || undefined,
          heartRateData: (run.heartRateData as any) || undefined,
          paceData: (run.paceData as any) || undefined,
          completedAt: run.completedAt?.toISOString() || undefined,
          name: run.name || undefined,
          weatherData: (run.weatherData as any) || undefined,
        },
        userName: user?.name || undefined,
      });

      res.set({
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length.toString(),
        "Content-Disposition": `inline; filename="ai-run-coach-${runId}.png"`,
        "Cache-Control": "public, max-age=3600",
      });
      res.send(imageBuffer);
    } catch (error: any) {
      console.error("Generate share image error:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  app.post("/api/share/preview", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { templateId, aspectRatio, stickers, runId } = req.body;
      if (!templateId || !runId) {
        return res.status(400).json({ error: "templateId and runId are required" });
      }

      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }

      if (run.userId !== req.user!.userId) {
        return res.status(403).json({ error: "You can only share your own runs" });
      }

      const user = await storage.getUser(req.user!.userId);

      const { generateShareImage } = await import("./share-image-service");
      const imageBuffer = await generateShareImage({
        templateId,
        aspectRatio: aspectRatio || "1:1",
        stickers: stickers || [],
        runData: {
          distance: run.distance,
          duration: run.duration,
          avgPace: run.avgPace || undefined,
          avgHeartRate: run.avgHeartRate || undefined,
          maxHeartRate: run.maxHeartRate || undefined,
          calories: run.calories || undefined,
          cadence: run.cadence || undefined,
          elevation: run.elevation || undefined,
          elevationGain: run.elevationGain || undefined,
          elevationLoss: run.elevationLoss || undefined,
          difficulty: run.difficulty || undefined,
          gpsTrack: (run.gpsTrack as any) || undefined,
          heartRateData: (run.heartRateData as any) || undefined,
          paceData: (run.paceData as any) || undefined,
          completedAt: run.completedAt?.toISOString() || undefined,
          name: run.name || undefined,
          weatherData: (run.weatherData as any) || undefined,
        },
        userName: user?.name || undefined,
      });

      const base64 = imageBuffer.toString("base64");
      res.json({ image: `data:image/png;base64,${base64}` });
    } catch (error: any) {
      console.error("Generate preview error:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
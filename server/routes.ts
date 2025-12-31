import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPreRegistrationSchema, insertUserSchema, insertRouteSchema, insertRunSchema, insertLiveRunSessionSchema, insertPushSubscriptionSchema } from "@shared/schema";
import { z } from "zod";
import { generateRoute, getCoachingAdvice, analyzeRunPerformance } from "./openai";
import { generateCircularRoute, generateMultipleRoutes, isGoogleMapsConfigured } from "./routePlanner";
import { generateAIRoutes } from "./aiRoutePlanner";
import bcrypt from "bcryptjs";
import { initializePushNotifications, isPushConfigured, getPublicVapidKey, sendFriendRequestNotification, sendFriendAcceptedNotification } from "./pushNotifications";

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

  // Generate multiple route options (9 routes: 3 easy, 3 moderate, 3 hard)
  // Uses AI-powered route planning: Google for area data → OpenAI for waypoint design → Google for final route
  app.post("/api/routes/generate-options", async (req, res) => {
    try {
      const { startLat, startLng, targetDistance, useAI = true } = req.body;
      
      if (startLat === undefined || startLat === null || 
          startLng === undefined || startLng === null || 
          targetDistance === undefined || targetDistance === null) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      if (!isGoogleMapsConfigured()) {
        console.error("Google Maps API key not configured");
        return res.status(503).json({ error: "Route generation service is temporarily unavailable. Please try again later." });
      }

      // Use AI-powered route generation by default
      let result;
      if (useAI) {
        console.log("[Route API] Using AI-powered route generation");
        result = await generateAIRoutes({
          startLat: parseFloat(startLat),
          startLng: parseFloat(startLng),
          targetDistance: parseFloat(targetDistance),
        });
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

      res.json({
        success: true,
        routes: result.routes,
        targetDistance: parseFloat(targetDistance),
        generationMethod: useAI ? "ai-powered" : "geometric",
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
      const friends = await storage.getFriends(req.params.userId);
      res.json(friends);
    } catch (error) {
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

  // AI Coaching endpoint
  app.post("/api/ai/coaching", async (req, res) => {
    try {
      const { currentPace, targetPace, heartRate, elapsedTime, distanceCovered, totalDistance, difficulty, userFitnessLevel } = req.body;
      
      if (!currentPace || !targetPace || elapsedTime === undefined || distanceCovered === undefined || !totalDistance) {
        return res.status(400).json({ error: "Missing required coaching parameters" });
      }

      const advice = await getCoachingAdvice({
        currentPace,
        targetPace,
        heartRate,
        elapsedTime,
        distanceCovered,
        totalDistance,
        difficulty: difficulty || "moderate",
        userFitnessLevel
      });

      res.json(advice);
    } catch (error) {
      console.error("Coaching error:", error);
      res.status(500).json({ error: "Failed to get coaching advice" });
    }
  });

  // AI Run Analysis endpoint
  app.post("/api/ai/analyze-run", async (req, res) => {
    try {
      const { distance, duration, avgPace, avgHeartRate, difficulty, userFitnessLevel } = req.body;
      
      if (!distance || !duration || !avgPace) {
        return res.status(400).json({ error: "Missing required run data" });
      }

      const analysis = await analyzeRunPerformance({
        distance,
        duration,
        avgPace,
        avgHeartRate,
        difficulty: difficulty || "moderate",
        userFitnessLevel
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
    } catch (error) {
      console.error("Friend request error:", error);
      res.status(500).json({ error: "Failed to send friend request" });
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
    } catch (error) {
      console.error("Get incoming requests error:", error);
      res.status(500).json({ error: "Failed to get friend requests" });
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
    } catch (error) {
      console.error("Get outgoing requests error:", error);
      res.status(500).json({ error: "Failed to get friend requests" });
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
    } catch (error) {
      console.error("Respond to friend request error:", error);
      res.status(500).json({ error: "Failed to respond to friend request" });
    }
  });

  // Cancel outgoing friend request
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

      await storage.respondToFriendRequest(requestId, 'rejected');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel friend request" });
    }
  });

  return httpServer;
}

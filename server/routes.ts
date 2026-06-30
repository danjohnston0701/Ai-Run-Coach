import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { eq, and, or, gte, lt, desc, lte, count, isNull, isNotNull } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { onRunSaved, onRunDeleted } from "./user-stats-cache";
import { getRunnerProfile, runnerProfileBlock, persistCoachingObservation, refreshRunnerProfile } from "./runner-profile-service";
import { 
  garminWellnessMetrics, connectedDevices, garminActivities, garminBodyComposition, 
  runs, garminRealtimeData, garminCompanionSessions,
  dailyFitness, segmentEfforts, segmentStars, segments,
  trainingPlans, weeklyPlans, plannedWorkouts, planAdaptations,
  feedActivities, reactions, activityComments, commentLikes,
  clubs, clubMemberships, challenges, challengeParticipants, groupRunParticipants, groupRuns,
  achievements, userAchievements, goals, users, notificationPreferences,
  sharedRuns, webhookFailureQueue, garminMoveIQ, garminBloodPressure,
  garminEpochsRaw, garminEpochsAggregate, garminHealthSnapshots, garminSkinTemperature,
  friendRequests, userStats
} from "@shared/schema";
import { DateTime } from "luxon";
import polylineCodec from "@mapbox/polyline";
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
  fuzzyMatchGarminToAiRunCoachRun,
  mergeGarminActivityWithAiRunCoachRun,
  processGarminActivityForMerge,
} from "./activity-merge-service";
import {
  matchRunToSegments,
  reprocessRunForSegments,
  createSegmentFromRun
} from "./segment-matching-service";
import {
  generateTrainingPlan,
  adaptTrainingPlan,
  completeWorkout,
  reassessTrainingPlansWithRunData,
  generateNextBlock,
  checkAndGeneratePendingBlocks,
} from "./training-plan-service";
import {
  sendActivityNotification,
  getUnreadNotificationCount
} from "./notification-service";
import { getUsageWithLimits, checkAndEnforceLimit, recordUsage } from "./usage-service";
import { checkCooldown, recordFired, buildSkipResponse } from "./coaching-cooldown";
import {
  checkAchievementsAfterRun,
  getUserAchievements,
  initializeAchievements
} from "./achievements-service";
import garminOAuthRouter from "./garmin-oauth-bridge";
import stravaOAuthRouter, { ensureStravaWebhookSubscription } from "./strava-oauth-bridge";
import {
  extractHeartRateData,
  extractPaceData as extractPaceDataDetailed,
  extractKmSplits,
  extractGpsTrack,
  buildDetailedMetricsFromGarminActivity,
} from "./garmin-detailed-metrics";
import { generateFitFile } from "./fit-file-generator";
import {
  uploadRunToStrava,
  pollUploadStatus,
} from "./strava-upload-service";
import { refreshStravaToken } from "./strava-oauth-service";
import adaptationRouter from "./routes-adaptation";
import myDataRouter from "./routes-my-data";
import achievementsRouter from "./routes-achievements";
import realtimeCoachingRouter from "./real-time-coaching-integration";
import { registerSessionCoachingRoutes } from "./routes-session-coaching";
import { recognizeRoute, updateKnownRoutes } from "./route-recognition-service";
import { registerSamsungCompanionRoutes } from "./routes-samsung-companion";
import { resolveGarminUser, resolveGarminUserByActivity } from "./garmin-user-resolver";
import {
  snapTrackToOSMSegments,
  recordSegmentUsage,
  analyzeRouteCharacteristics
} from "./osm-segment-intelligence";
import {
  generateIntelligentRoute,
  NoRoutesError
} from "./intelligent-route-generation";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // ==================== GARMIN OAUTH BRIDGE ====================
  app.use(garminOAuthRouter);
  
  // ==================== STRAVA OAUTH BRIDGE ====================
  app.use(stravaOAuthRouter);

  // Ensure Strava webhook subscription is active (runs asynchronously, won't block startup)
  ensureStravaWebhookSubscription().catch(err =>
    console.error('[Strava Webhook] Startup auto-register failed:', err.message)
  );
  
  app.use("/api", adaptationRouter);
  app.use("/api/my-data", myDataRouter);
  app.use("/api/coaching", realtimeCoachingRouter); // Real-time biomechanical coaching
  app.use("/api", achievementsRouter);
  registerSessionCoachingRoutes(app);
  await registerSamsungCompanionRoutes(app);

  // Version probe — tells us immediately which build is running
  app.get("/api/version", (_req: Request, res: Response) => {
    res.json({ v: "2026-03-25-v5", status: "ok" });
  });

  // Friends list — registered early to avoid being blocked by late-loading routes
  app.get("/api/users/:userId/friends", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const friendUsers = await storage.getFriends(userId);
      res.json(friendUsers.map(f => ({
        id: f.id,
        name: f.name,
        email: f.email,
        profilePic: f.profilePic,
        userCode: f.userCode,
      })));
    } catch (error: any) {
      console.error("[GET /api/users/:userId/friends] Error:", error);
      res.status(500).json({ error: "Failed to fetch friends" });
    }
  });

  // Friend requests — registered early
  app.get("/api/friend-requests/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      if (req.user?.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const sentResult = await db.execute(
        sql`SELECT fr.id, fr.requester_id, fr.addressee_id, fr.status, fr.message, fr.created_at,
                   u.name AS addressee_name, u.profile_pic AS addressee_profile_pic
            FROM friend_requests fr
            LEFT JOIN users u ON u.id = fr.addressee_id
            WHERE fr.requester_id = ${userId} AND fr.status = 'pending'`
      );
      const receivedResult = await db.execute(
        sql`SELECT fr.id, fr.requester_id, fr.addressee_id, fr.status, fr.message, fr.created_at,
                   u.name AS requester_name, u.profile_pic AS requester_profile_pic
            FROM friend_requests fr
            LEFT JOIN users u ON u.id = fr.requester_id
            WHERE fr.addressee_id = ${userId} AND fr.status = 'pending'`
      );

      const toRows = (r: any) => Array.isArray(r) ? r : (r.rows ?? []);
      const sent = toRows(sentResult).map((r: any) => ({
        id: r.id, requesterId: r.requester_id, addresseeId: r.addressee_id,
        status: r.status, message: r.message, createdAt: r.created_at,
        addresseeName: r.addressee_name ?? null, addresseeProfilePic: r.addressee_profile_pic ?? null,
        requesterName: null, requesterProfilePic: null,
      }));
      const received = toRows(receivedResult).map((r: any) => ({
        id: r.id, requesterId: r.requester_id, addresseeId: r.addressee_id,
        status: r.status, message: r.message, createdAt: r.created_at,
        requesterName: r.requester_name ?? null, requesterProfilePic: r.requester_profile_pic ?? null,
        addresseeName: null, addresseeProfilePic: null,
      }));

      console.log(`[FriendRequests] userId=${userId} sent=${sent.length} received=${received.length}`);
      // Prevent CDN/proxy caching so UI always reflects latest state after send/withdraw/accept
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.json({ v: 5, sent, received });
    } catch (error: any) {
      console.error("Get friend requests error:", error);
      res.status(500).json({ error: "Failed to get friend requests", detail: String(error) });
    }
  });
  
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
      
      // Generate a short 6-character user ID for friend sharing
      const generateShortUserId = () => {
        // Generate a unique 8-digit numerical ID (10,000,000 to 99,999,999)
        // ensures max 8 digits and numeric-only
        const min = 10000000;
        const max = 99999999;
        return Math.floor(Math.random() * (max - min + 1) + min).toString();
      };
      const shortUserId = generateShortUserId();

      // Trial expires 14 days from account creation
      const trialExpiresAt = new Date();
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);

      const user = await storage.createUser({
        email,
        password: hashedPassword,
        name,
        userCode,
        shortUserId,
        trialExpiresAt,
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
      const { email, password, timezone } = req.body;

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

      // Update user's timezone preference if provided (from device)
      if (timezone) {
        try {
          // Validate timezone using Luxon
          DateTime.now().setZone(timezone);
          
          // Ensure notification preferences exist, then update timezone
          const existingPrefs = await db
            .select()
            .from(notificationPreferences)
            .where(eq(notificationPreferences.userId, user.id))
            .limit(1);
          
          if (existingPrefs.length > 0) {
            await db
              .update(notificationPreferences)
              .set({ 
                coachingPlanReminderTimezone: timezone,
                updatedAt: new Date(),
              })
              .where(eq(notificationPreferences.userId, user.id));
          } else {
            await db.insert(notificationPreferences).values({
              userId: user.id,
              coachingPlanReminderTimezone: timezone,
            });
          }
          
          console.log(`[Login] Updated timezone for user ${user.id}: ${timezone}`);
        } catch (tzError: any) {
          console.warn(`Invalid timezone "${timezone}" provided during login for user ${user.id}: ${tzError.message}`);
        }
      }

      const token = generateToken({ userId: user.id, email: user.email });

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // POST /api/support/contact — public, no auth required
  app.post("/api/support/contact", async (req: Request, res: Response) => {
    try {
      const { name, email, subject, message, screenshots } = req.body;
      if (!name?.trim() || !email?.trim() || !message?.trim()) {
        return res.status(400).json({ error: "Name, email, and message are required" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      // Validate screenshots: max 3, each base64 string max ~5MB
      const MAX_SCREENSHOTS = 3;
      const MAX_B64_LEN = 7 * 1024 * 1024; // ~5MB raw → ~7MB base64
      if (screenshots && (!Array.isArray(screenshots) || screenshots.length > MAX_SCREENSHOTS)) {
        return res.status(400).json({ error: `Maximum ${MAX_SCREENSHOTS} screenshots allowed` });
      }
      if (screenshots) {
        for (const s of screenshots) {
          if (typeof s.base64 !== "string" || s.base64.length > MAX_B64_LEN) {
            return res.status(400).json({ error: "One or more screenshots exceed the 5MB size limit" });
          }
        }
      }
      const { sendSupportEmail } = await import("./email-service");
      await sendSupportEmail({
        name: name.trim(),
        email: email.trim(),
        subject: subject?.trim() || "",
        message: message.trim(),
        screenshots: screenshots ?? [],
      });
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Support contact error:", error);
      res.status(500).json({ error: "Failed to send support message" });
    }
  });

  // POST /api/register-interest — public waitlist signup
  app.post("/api/register-interest", async (req: Request, res: Response) => {
    try {
      const { name, email, country, message } = req.body;
      if (!name?.trim() || !email?.trim() || !country?.trim()) {
        return res.status(400).json({ error: "Name, email, and country are required" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      const registration = await storage.createInterestRegistration({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        country: country.trim(),
        message: message?.trim() || null,
      });
      // Fire-and-forget confirmation emails
      import("./email-service").then(({ sendInterestRegistrationEmail }) => {
        sendInterestRegistrationEmail({ name: name.trim(), email: email.trim(), country: country.trim(), message: message?.trim() || undefined })
          .catch((err: Error) => console.error("Interest registration email failed:", err));
      });
      res.json({ ok: true, id: registration.id });
    } catch (error: any) {
      console.error("Interest registration error:", error);
      res.status(500).json({ error: "Failed to save registration" });
    }
  });

  // POST /api/auth/forgot-password
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      // Always respond with 200 to avoid user enumeration
      if (!user) return res.json({ ok: true });

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await storage.createPasswordResetToken(token, user.id, expiresAt);

      const { sendPasswordResetEmail } = await import("./email-service");
      await sendPasswordResetEmail(user.email, token);

      res.json({ ok: true });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Failed to send reset email" });
    }
  });

  // GET /api/auth/verify-reset-token
  app.get("/api/auth/verify-reset-token", async (req: Request, res: Response) => {
    try {
      const { token } = req.query as { token: string };
      if (!token) return res.status(400).json({ error: "Token is required" });

      const record = await storage.getPasswordResetToken(token);
      if (!record || record.expiresAt < new Date()) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Verify reset token error:", error);
      res.status(500).json({ error: "Failed to verify token" });
    }
  });

  // POST /api/auth/reset-password
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ error: "Token and password are required" });
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const record = await storage.getPasswordResetToken(token);
      if (!record || record.expiresAt < new Date()) {
        return res.status(400).json({ error: "Invalid or expired reset link" });
      }

      const hashed = await hashPassword(password);
      await storage.updateUser(record.userId, { password: hashed });
      await storage.deletePasswordResetToken(token);

      res.json({ ok: true });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // ==================== TEST ENDPOINTS ====================

  /**
   * Debug endpoint to send a test coaching plan reminder notification.
   * Usage: POST /api/test/coaching-plan-reminder
   * Body: { userEmail: "user@example.com", workoutName: "6x400m Intervals", distance: 5, intensity: "z4" }
   */
  app.post("/api/test/coaching-plan-reminder", async (req: Request, res: Response) => {
    try {
      const { userEmail, workoutName, distance, intensity } = req.body;

      if (!userEmail || !workoutName) {
        return res.status(400).json({ error: "userEmail and workoutName are required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(404).json({ error: `User not found: ${userEmail}` });
      }

      // Import sendCoachingPlanReminder here (avoids circular imports)
      const { sendCoachingPlanReminder } = await import("./notification-service");

      // Send the test reminder
      const result = await sendCoachingPlanReminder(
        user.id,
        workoutName,
        distance ? parseFloat(distance) : undefined,
        intensity
      );

      console.log(`[Test] Coaching plan reminder sent to ${userEmail}:`, result);
      res.json({
        success: true,
        message: `Test notification sent to ${userEmail}`,
        result,
      });
    } catch (error: any) {
      console.error("[Test] Failed to send test notification:", error);
      res.status(500).json({ error: "Failed to send test notification", details: error.message });
    }
  });

  /**
   * Test endpoint to send a push notification to verify Firebase setup.
   * Usage: POST /api/test/push-notification
   * Body: { userEmail: "user@example.com", title: "Test", body: "Test message" }
   */
  app.post("/api/test/push-notification", async (req: Request, res: Response) => {
    try {
      const { userEmail, title, body } = req.body;

      if (!userEmail || !title || !body) {
        return res.status(400).json({ error: "userEmail, title, and body are required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(404).json({ error: `User not found: ${userEmail}` });
      }

      if (!user.fcmToken) {
        return res.status(400).json({
          error: `User ${userEmail} has no FCM token registered`,
          hint: "User needs to login with notification permissions granted",
        });
      }

      // Import sendFirebasePush here (avoids circular imports)
      const { sendFirebasePush } = await import("./notification-service");

      // Send the test push
      const result = await sendFirebasePush(
        user.id,
        title,
        body,
        { type: "test_notification" }
      );

      console.log(`[Test] Push notification sent to ${userEmail}:`, result);
      res.json({
        success: result,
        message: result
          ? `Test push notification sent to ${userEmail}`
          : `Failed to send push notification (check logs)`,
        userEmail,
        hasToken: !!user.fcmToken,
        tokenPreview: user.fcmToken?.substring(0, 30) + "...",
      });
    } catch (error: any) {
      console.error("[Test] Failed to send test push notification:", error);
      res.status(500).json({ error: "Failed to send test notification", details: error.message });
    }
  });

  // ==================== USER ENDPOINTS ====================

  /**
   * GET /api/invite/:userId
   * Public endpoint — returns just enough profile info to show a "Add friend" preview
   * when someone opens a friend invite link.
   */
  app.get("/api/invite/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Return minimal public info only
      res.json({
        id: user.id,
        name: user.name,
        profilePic: user.profilePic ?? null,
        inviteUrl: `https://airuncoach.live/invite/${user.id}`,
      });
    } catch (error: any) {
      console.error("Invite lookup error:", error);
      res.status(500).json({ error: "Failed to look up invite" });
    }
  });

  app.get("/api/users/search", optionalAuthMiddleware, async (req: any, res: Response) => {
    try {
      console.log("[Search] Raw query params:", JSON.stringify(req.query));
      
      // Support both ?q= and ?query= param names for flexibility
      const query = String(req.query.q || req.query.query || "").trim().toLowerCase();
      if (!query || query.length < 2) {
        console.log("[Search] Query too short or empty:", { q: req.query.q, query: req.query.query });
        return res.json([]);
      }

      const currentUserId = req.user?.userId;
      console.log(`[Search] Searching for "${query}" by user ${currentUserId}`);
      const users = await storage.searchUsers(query);
      console.log(`[Search] Found ${users.length} users for query "${query}"`);

      // Enrich each result with current friendship/request status
      const enriched = await Promise.all(users.map(async (u) => {
        let friendRequestStatus: string | null = null;
        let friendRequestId: string | null = null;

        if (currentUserId && currentUserId !== u.id) {
          // Check for any outgoing request from current user to this user
          const outgoingRequests = await storage.getRequestBetweenUsers(currentUserId, u.id);
          const incomingRequests = await storage.getRequestBetweenUsers(u.id, currentUserId);

          if (outgoingRequests) {
            friendRequestStatus = outgoingRequests.status; // "pending", "declined", "withdrawn", "accepted"
            friendRequestId = outgoingRequests.id;
          } else if (incomingRequests) {
            friendRequestStatus = `received_${incomingRequests.status}`; // "received_pending", etc.
            friendRequestId = incomingRequests.id;
          }
        }

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          profilePic: u.profilePic,
          userCode: u.userCode,
          shortUserId: u.shortUserId,
          friendRequestStatus,
          friendRequestId,
        };
      }));

      res.json(enriched);
    } catch (error: any) {
      console.error("Search users error:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // Get current authenticated user — MUST be registered before /api/users/:id
  // to prevent Express matching "me" as a :id parameter
  app.get("/api/users/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = user;
      // Map injuryHistory → injuries so Android model (which uses 'injuries') deserializes correctly
      const response = {
        ...userWithoutPassword,
        injuries: userWithoutPassword.injuryHistory ?? [],
      };
      res.json(response);
    } catch (error: any) {
      console.error("Get current user error:", error);
      res.status(500).json({ error: "Failed to get current user" });
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

  // Save/update FCM push token for the current user
  app.post("/api/users/me/fcm-token", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fcmToken } = req.body;
      if (!fcmToken || typeof fcmToken !== "string") {
        return res.status(400).json({ error: "fcmToken is required" });
      }
      await storage.updateUser(req.user!.userId, { fcmToken });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Save FCM token error:", error);
      res.status(500).json({ error: "Failed to save FCM token" });
    }
  });

  // Unified device token registration endpoint (supports iOS and Android)
  // iOS calls this with platform: "ios", Android can call this with platform: "android"
  // Firebase automatically bridges FCM tokens to APNs for iOS, so we store a single fcmToken
  // The platform field is logged for debugging but the actual token is stored as fcmToken
  app.post("/api/notifications/register-device", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { deviceToken, platform, fcmToken } = req.body;
      const token = deviceToken || fcmToken; // Accept either field name
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "deviceToken or fcmToken is required" });
      }
      
      const platformStr = platform || "unknown";
      console.log(`[RegisterDevice] User ${req.user!.userId} registered ${platformStr} token: ${token.substring(0, 30)}...`);
      
      // Store as fcmToken (Firebase bridges to APNs for iOS automatically)
      await storage.updateUser(req.user!.userId, { fcmToken: token });
      res.json({ success: true, platform: platformStr });
    } catch (error: any) {
      console.error("Register device error:", error);
      res.status(500).json({ error: "Failed to register device token" });
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

  /**
   * DELETE /api/users/:id
   *
   * Permanently deletes a user account and all associated data.
   *
   * Steps:
   *  1. Ownership check — only the authenticated user can delete their own account
   *  2. Fetch Garmin access token BEFORE any deletion (needed for outbound deregister call)
   *  3. Call Garmin Health API to deregister the user (stop future webhook delivery)
   *  4. Delete all user data from every table via storage.deleteUser()
   *  5. Respond 204 No Content
   */
  app.delete("/api/users/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.params.id;

    // Ownership check — users can only delete their own account
    if (req.user?.userId !== userId) {
      return res.status(403).json({ error: "Not authorized to delete this account" });
    }

    try {
      // ── Step 1: Fetch Garmin token BEFORE we delete anything ───────────────
      // We need it to call Garmin's deregistration endpoint. Once connected_devices
      // is deleted, the token is gone and we can no longer deregister.
      let garminAccessToken: string | null = null;
      try {
        const [garminDevice] = await db
          .select({ accessToken: connectedDevices.accessToken })
          .from(connectedDevices)
          .where(
            and(
              eq(connectedDevices.userId, userId),
              eq(connectedDevices.deviceType, "garmin"),
              eq(connectedDevices.isActive, true)
            )
          )
          .limit(1);
        garminAccessToken = garminDevice?.accessToken ?? null;
      } catch (e) {
        console.warn("[DeleteUser] Could not fetch Garmin token (non-fatal):", e);
      }

      // ── Step 2: Deregister from Garmin Health API ─────────────────────────
      // Per Garmin developer terms, apps must call the deregistration endpoint
      // when a user deletes their account so Garmin stops sending webhook data.
      // Endpoint: DELETE https://apis.garmin.com/wellness-api/rest/user/registration
      // Auth: Bearer <userAccessToken>
      if (garminAccessToken) {
        try {
          const garminDeregisterRes = await fetch(
            "https://apis.garmin.com/wellness-api/rest/user/registration",
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${garminAccessToken}`,
              },
            }
          );

          if (garminDeregisterRes.ok || garminDeregisterRes.status === 204) {
            console.log(`[DeleteUser] Garmin deregistration successful for user ${userId}`);
          } else {
            // Log but do NOT block account deletion — Garmin deregister is best-effort
            const body = await garminDeregisterRes.text().catch(() => "");
            console.warn(
              `[DeleteUser] Garmin deregistration returned ${garminDeregisterRes.status} (non-fatal): ${body.slice(0, 200)}`
            );
          }
        } catch (e) {
          // Network error calling Garmin — non-fatal, continue with deletion
          console.warn("[DeleteUser] Garmin deregistration request failed (non-fatal):", e);
        }
      } else {
        console.log(`[DeleteUser] No active Garmin connection for user ${userId} — skipping deregistration`);
      }

      // ── Step 3: Cascade delete all user data ─────────────────────────────
      await storage.deleteUser(userId);

      console.log(`[DeleteUser] Account deletion complete for user ${userId}`);
      return res.status(204).send();

    } catch (error: any) {
      console.error(`[DeleteUser] Failed to delete user ${userId}:`, error);
      return res.status(500).json({ error: "Failed to delete account. Please try again." });
    }
  });

  // Upload profile picture (base64)
  app.post("/api/users/:id/profile-picture", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.userId !== req.params.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      let { imageData } = req.body; // base64 encoded image or data URL
      
      if (!imageData) {
        return res.status(400).json({ error: "No image data provided" });
      }

      // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,")
      if (imageData.includes(',')) {
        imageData = imageData.split(',')[1];
      }

      // Validate base64 format
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(imageData)) {
        return res.status(400).json({ error: "Invalid base64 image data" });
      }

      // Check image size (2MB limit for base64)
      // Base64 is ~4/3 the size of binary, so 2MB = ~2.67MB base64 = ~2.8M chars
      const MAX_BASE64_SIZE = 2.8 * 1024 * 1024; // ~2.8M characters
      if (imageData.length > MAX_BASE64_SIZE) {
        return res.status(400).json({ error: "Image too large. Max size is 2MB" });
      }

      // Update user's profile picture (store clean base64 without prefix)
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

  // ==================== INJURY MANAGEMENT ENDPOINTS ====================

  /**
   * GET /api/user/injuries
   * Get all injuries for the authenticated user, organized by status
   */
  app.get("/api/user/injuries", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const injuries = user.injuryHistory || [];
      
      // Separate by status
      const active = injuries.filter((i: any) => 
        ['RECOVERING','ACTIVE'].includes(i.status?.toUpperCase())
      );
      const chronic = injuries.filter((i: any) => 
        i.status?.toUpperCase() === 'CHRONIC'
      );
      const healed = injuries.filter((i: any) => 
        i.status?.toUpperCase() === 'HEALED'
      );

      res.json({ active, chronic, healed, all: injuries });
    } catch (error: any) {
      console.error("[GET /api/user/injuries] Error:", error);
      res.status(500).json({ error: "Failed to fetch injuries" });
    }
  });

  /**
   * POST /api/user/injuries
   * Add a new injury to the user's history
   */
  app.post("/api/user/injuries", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      console.log(`[POST /api/user/injuries] Adding injury for user ${userId}`);
      
      const user = await storage.getUser(userId);
      if (!user) {
        console.error(`[POST /api/user/injuries] User not found: ${userId}`);
        return res.status(404).json({ error: "User not found" });
      }

      const { bodyPart, injurySide, status, severity, notes, injuryDate, estimatedRecoveryWeeks, isProstheticOrAFO, prostheticType } = req.body;
      if (!bodyPart || !status) {
        return res.status(400).json({ error: "bodyPart and status are required" });
      }
      const newInjury = {
        id: Math.random().toString(36).substring(2, 11),
        bodyPart,
        injurySide: injurySide ?? null,
        status,
        severity: severity ?? "MODERATE",
        notes: notes ?? null,
        injuryDate: injuryDate ?? null,
        estimatedRecoveryWeeks: estimatedRecoveryWeeks ?? null,
        isProstheticOrAFO: isProstheticOrAFO ?? false,
        prostheticType: prostheticType ?? null,
        recoveryDate: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const injuries = (user.injuryHistory || []) as any[];
      injuries.push(newInjury);
      console.log(`[POST /api/user/injuries] Updated injuries array, length: ${injuries.length}`);

      const updated = await storage.updateUser(userId, { injuryHistory: injuries });
      console.log(`[POST /api/user/injuries] Updated user, update result:`, updated ? "success" : "null");
      
      res.status(201).json(newInjury);
    } catch (error: any) {
      console.error("[POST /api/user/injuries] Error:", error);
      res.status(500).json({ error: "Failed to add injury" });
    }
  });

  /**
   * PUT /api/user/injuries/:injuryId
   * Update an existing injury (status, notes, recovery date, etc.)
   */
  app.put("/api/user/injuries/:injuryId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { injuryId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const injuries = user.injuryHistory || [];
      const injuryIndex = injuries.findIndex((i: any) => i.id === injuryId);

      if (injuryIndex === -1) {
        return res.status(404).json({ error: "Injury not found" });
      }

      // Update injury with new data
      injuries[injuryIndex] = {
        ...injuries[injuryIndex],
        ...req.body,
        updatedAt: Date.now()  // Always update timestamp
      };

      await storage.updateUser(userId, { injuryHistory: injuries });
      
      res.json(injuries[injuryIndex]);
    } catch (error: any) {
      console.error("[PUT /api/user/injuries/:injuryId] Error:", error);
      res.status(500).json({ error: "Failed to update injury" });
    }
  });

  /**
   * DELETE /api/user/injuries/:injuryId
   * Delete a healed or chronic injury from the user's history
   */
  app.delete("/api/user/injuries/:injuryId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { injuryId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const injuries = user.injuryHistory || [];
      const injury = injuries.find((i: any) => i.id === injuryId);

      if (!injury) {
        return res.status(404).json({ error: "Injury not found" });
      }

      // Allow deleting injuries at any stage

      const updatedInjuries = injuries.filter((i: any) => i.id !== injuryId);
      await storage.updateUser(userId, { injuryHistory: updatedInjuries });

      res.json({ message: "Injury deleted successfully" });
    } catch (error: any) {
      console.error("[DELETE /api/user/injuries/:injuryId] Error:", error);
      res.status(500).json({ error: "Failed to delete injury" });
    }
  });

  // ==================== FRIENDS ENDPOINTS ====================

  // GET /api/friends/:userId — Android app primary friends endpoint
  app.get("/api/friends/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const friends = await storage.getFriends(userId);
      res.json(friends.map(f => ({
        id: f.id,
        name: f.name,
        email: f.email,
        profilePic: f.profilePic,
        userCode: f.userCode,
      })));
    } catch (error: any) {
      console.error("[GET /api/friends/:userId] Error:", error);
      res.status(500).json({ error: "Failed to get friends" });
    }
  });

  // POST /api/friends/:userId/add — Android app send friend request
  app.post("/api/friends/:userId/add", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requesterId = req.user!.userId;
      const { userId: addresseeId } = req.params;
      const { message } = req.body;
      if (!addresseeId) return res.status(400).json({ error: "Addressee ID is required" });
      const request = await storage.upsertFriendRequest(requesterId, addresseeId, message);
      res.status(201).json(request);
    } catch (error: any) {
      console.error("[POST /api/friends/:userId/add] Error:", error);
      res.status(500).json({ error: "Failed to send friend request" });
    }
  });

  // DELETE /api/friends/:userId/:friendId — Android app remove friend
  app.delete("/api/friends/:userId/:friendId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, friendId } = req.params;
      await storage.removeFriend(userId, friendId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[DELETE /api/friends/:userId/:friendId] Error:", error);
      res.status(500).json({ error: "Failed to remove friend" });
    }
  });
  
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
      
      // Re-use any existing declined/withdrawn request (set back to pending) instead of creating a duplicate
      const request = await storage.upsertFriendRequest(requesterId, addresseeId, message);

      // Send push notification to the addressee so they see the request immediately
      try {
        const requester = await storage.getUser(requesterId);
        const requesterName = requester?.name || "Someone";
        const notificationService = await import("./notification-service");
        const pushSent = await notificationService.sendFirebasePush(
          addresseeId,
          `${requesterName} sent you a friend request`,
          "Open the app to accept or decline.",
          { type: "friend_request", requestId: request.id, requesterId }
        );
        console.log(`[FriendRequests] Push notification sent to ${addresseeId}: ${pushSent}`);
      } catch (pushError) {
        // Don't fail the request if push notification fails
        console.error("[FriendRequests] Failed to send push notification:", pushError);
      }

      res.status(201).json(request);
    } catch (error: any) {
      console.error("Create friend request error:", error);
      res.status(500).json({ error: "Failed to create friend request" });
    }
  });

  // DEBUG endpoint — returns ALL friend requests for a user regardless of status
  app.get("/api/friend-requests/:userId/debug", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const all = await db.select().from(friendRequests).where(
        or(
          eq(friendRequests.requesterId, userId),
          eq(friendRequests.addresseeId, userId)
        )
      );
      console.log(`[DEBUG] All friend requests involving ${userId}:`, JSON.stringify(all));
      res.json({ total: all.length, requests: all });
    } catch (error: any) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/friend-requests/:id/withdraw", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const requesterId = req.user!.userId;  // fix: was .id (undefined), correct field is .userId
      await storage.withdrawFriendRequest(id, requesterId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error withdrawing friend request:", error);
      res.status(500).json({ error: "Failed to withdraw friend request" });
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
  
  // Normalize distance: DB may store meters or km depending on source
  // Returns value in meters
  function normalizeDistanceMeters(run: any): number {
    let d = run.distance || 0;
    if (!d) return 0;
    // If already meters (typical for native app uploads), leave as-is.
    if (d > 1000) return d;

    const hasSplits = Array.isArray(run.kmSplits) && run.kmSplits.length > 0;
    const hasPace = typeof run.avgPace === "string" && run.avgPace.length > 0;
    const hasTrack = Array.isArray(run.gpsTrack) && run.gpsTrack.length > 1;
    if (hasSplits || hasPace || hasTrack) return d * 1000;
    return d;
  }

  // Normalize duration: DB should store seconds, but old runs may have ms
  function normalizeDurationSeconds(run: any): number {
    const rawDur = run.duration || 0;
    return rawDur > 86400 ? Math.round(rawDur / 1000) : rawDur;
  }

  // Helper function to transform database run to Android format
  /**
   * Full transform — used for GET /api/runs/:id (single run detail).
   * Includes all Garmin scalar fields AND all time-series arrays.
   */
  /**
 * Removes outlier altitude readings caused by GPS lock errors (e.g., a 55m spike
 * in the first 3 GPS points before the chipset stabilises).
 *
 * Algorithm: IQR-based rejection — remove any value outside Q1 − 3×IQR … Q3 + 3×IQR.
 * After rejection, null gaps are forward-filled with the last valid value so the
 * array length and index positions are preserved for chart rendering.
 */
function filterAltitudeSpikes(altitudes: number[]): number[] {
  if (altitudes.length < 8) return altitudes;
  const sorted = [...altitudes].sort((a, b) => a - b);
  const q1  = sorted[Math.floor(sorted.length * 0.25)];
  const q3  = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo  = q1 - 3 * iqr;
  const hi  = q3 + 3 * iqr;
  let last = altitudes.find(a => a >= lo && a <= hi) ?? altitudes[0];
  return altitudes.map(a => {
    if (a >= lo && a <= hi) { last = a; return a; }
    return last; // forward-fill rejected spike with last good value
  });
}

/**
 * Derives a numeric time-series from individual GPS track points when the
 * dedicated DB column (cadenceData / altitudeData) is null.
 * Only returns data if at least 10 non-zero values exist (guards against
 * runs where the watch didn't send that field).
 */
function deriveFromGpsTrack(gpsTrack: any, field: string): number[] | null {
  // Unwrap Garmin cloud format { samples: [...] } or phone format (plain array)
  const track: any[] = Array.isArray(gpsTrack)
    ? gpsTrack
    : (Array.isArray(gpsTrack?.samples) ? gpsTrack.samples : null);
  if (!track) return null;
  // Field aliases: Garmin cloud GPS samples use 'hr' for heart rate; Android uses 'heartRate'
  const altField = field === 'heartRate' ? 'hr'
                 : field === 'hr' ? 'heartRate'
                 : null;
  const values = track
    .map((p: any) => {
      const v = typeof p[field] === 'number' ? p[field]
              : (altField && typeof p[altField] === 'number') ? p[altField]
              : null;
      return (v !== null && v > 0) ? v : null;
    })
    .filter((v): v is number => v !== null);
  return values.length >= 10 ? values : null;
}

function transformRunForAndroid(run: any) {

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
        // .heartRate is used by old Android format; .hr is used by Garmin cloud
        // activity-processor samples ({ timestamp, hr: number })
        if (typeof entry?.heartRate === "number") return entry.heartRate;
        if (typeof entry?.hr === "number") return entry.hr;
        if (typeof entry?.paceSeconds === "number") return entry.paceSeconds;
        if (typeof entry?.pace === "number") return entry.pace;
        if (typeof entry?.speed === "number") return entry.speed;
        return null;
      })
      .filter((v: any) => typeof v === "number") as number[];
  }

    // Convert completedAt timestamp to milliseconds
    const completedAtMs = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();

    // Duration handling: the database may contain values in either seconds OR milliseconds
    // depending on the source (Garmin imports use seconds, Android app historically sent milliseconds).
    // Heuristic: if duration > 86400 (more than 1 day in seconds = impossible single run), it's likely milliseconds.
    const rawDuration = run.duration || 0;
    const durationMs = rawDuration > 86400 ? rawDuration : rawDuration * 1000;

    // Also use the startTime field from the DB if available (more accurate than computing from completedAt)
    const dbStartTime = run.startTime ? new Date(run.startTime).getTime() : 0;
    
    // Calculate startTime and endTime
    const endTime = completedAtMs;
    const startTime = dbStartTime > 0 ? dbStartTime : (completedAtMs - durationMs);

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
      maxSpeed: run.maxSpeed ?? null,
      averagePace: run.avgPace || "0'00\"/km",
      calories: run.calories || 0,
      cadence: run.cadence || 0,
      maxCadence: run.maxCadence ?? null,
      heartRate: run.avgHeartRate || 0,
      routePoints: (() => {
        // Normalise gpsTrack to a routePoints array regardless of storage format.
        // Three formats can exist in the DB:
        //   1. Array of {latitude,longitude,...} — phone-recorded (canonical)
        //   2. Array of {lat,lng,...}            — Garmin sample points
        //   3. { polyline: "encoded_string" }    — legacy corrupt format from Garmin
        //                                           enrichment bug; decode on read
        //                                           so existing runs render correctly.
        if (Array.isArray(run.gpsTrack)) {
          return run.gpsTrack.map((pt: any) => ({
            latitude:  pt.latitude  ?? pt.lat  ?? 0,
            longitude: pt.longitude ?? pt.lng  ?? 0,
            timestamp: pt.timestamp ?? pt.time ?? 0,
            speed:     pt.speed     ?? pt.pace ?? null,
            altitude:  pt.altitude  ?? null,
            heartRate: pt.heartRate ?? pt.hr   ?? null,
            bearing:   pt.bearing   ?? null,
            cadence:   pt.cadence   ?? null,
          }));
        }
        // Recovery path: decode legacy { polyline: "..." } stored by old enrichment code
        if (run.gpsTrack && typeof run.gpsTrack === 'object' && (run.gpsTrack as any).polyline) {
          try {
            const decoded = polylineCodec.decode((run.gpsTrack as any).polyline);
            return decoded.map(([lat, lng]: [number, number]) => ({
              latitude: lat, longitude: lng,
              timestamp: 0, speed: null, altitude: null,
              heartRate: null, bearing: null, cadence: null,
            }));
          } catch {
            // Polyline decode failed — return empty rather than crash
          }
        }
        return [];
      })(),
      kmSplits: Array.isArray(run.kmSplits) ? run.kmSplits : [],
      // heartRateData: prefer dedicated column; vívoactive 4 embeds HR per GPS point
      heartRateData: normalizeNumericSeries(run.heartRateData).filter(v => v > 0).length > 0
        ? normalizeNumericSeries(run.heartRateData)
        : (deriveFromGpsTrack(run.gpsTrack, 'heartRate') ?? []),
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
      isActive: false,
      // Training plan context — required for auto-completing the linked workout on the summary screen
      linkedWorkoutId: run.linkedWorkoutId || null,
      linkedPlanId: run.linkedPlanId || null,
      planProgressWeek: run.planProgressWeek || null,
      planProgressWeeks: run.planProgressWeeks || null,
      workoutType: run.workoutType || null,
      workoutIntensity: run.workoutIntensity || null,
      workoutDescription: run.workoutDescription || null,

      // ── Extended scalars (always included — these are tiny) ──────────────────
      avgSpeed:        run.avgSpeed        ?? null,
      movingTime:      run.movingTime      ?? null,
      elapsedTime:     run.elapsedTime     ?? null,
      avgStrideLength: run.avgStrideLength ?? null,
      minElevation:    run.minElevation    ?? null,
      maxElevation:    run.maxElevation    ?? null,
      steepestIncline: run.steepestIncline ?? null,
      steepestDecline: run.steepestDecline ?? null,
      totalSteps:      run.totalSteps      ?? null,
      activeCalories:  run.activeCalories  ?? null,
      restingCalories: run.restingCalories ?? null,
      estSweatLoss:    run.estSweatLoss    ?? null,
      minHeartRate:    run.minHeartRate    ?? null,

      // ── Garmin flag (critical — iOS/Android charts gate on this) ────────────
      hasGarminData:    run.hasGarminData    ?? false,
      garminDeviceName: run.garminDeviceName ?? null,

      // ── Running Dynamics scalars (from Garmin watch) ─────────────────────────
      avgGroundContactTime:    run.avgGroundContactTime    ?? null,
      minGroundContactTime:    run.minGroundContactTime    ?? null,
      maxGroundContactTime:    run.maxGroundContactTime    ?? null,
      avgGroundContactBalance: run.avgGroundContactBalance ?? null,
      avgVerticalOscillation:  run.avgVerticalOscillation  ?? null,
      maxVerticalOscillation:  run.maxVerticalOscillation  ?? null,
      avgVerticalRatio:        run.avgVerticalRatio        ?? null,
      minStrideLength:         run.minStrideLength         ?? null,
      maxStrideLength:         run.maxStrideLength         ?? null,

      // ── Training Effect & Recovery ───────────────────────────────────────────
      aerobicTrainingEffect:   run.aerobicTrainingEffect   ?? null,
      anaerobicTrainingEffect: run.anaerobicTrainingEffect ?? null,
      trainingEffectLabel:     run.trainingEffectLabel     ?? null,
      recoveryTimeMinutes:     run.recoveryTimeMinutes     ?? null,
      vo2MaxEstimate:          run.vo2MaxEstimate          ?? null,

      // ── Power & Respiration ──────────────────────────────────────────────────
      avgRunningPower:   run.avgRunningPower   ?? null,
      maxRunningPower:   run.maxRunningPower   ?? null,
      avgRespirationRate: run.avgRespirationRate ?? null,

      // ── Environmental ────────────────────────────────────────────────────────
      avgAmbientPressure: run.avgAmbientPressure ?? null,

      // ── HR Zone breakdown ────────────────────────────────────────────────────
      avgHeartRateZone: run.avgHeartRateZone ?? null,
      timeInZone1: run.timeInZone1 ?? null,
      timeInZone2: run.timeInZone2 ?? null,
      timeInZone3: run.timeInZone3 ?? null,
      timeInZone4: run.timeInZone4 ?? null,
      timeInZone5: run.timeInZone5 ?? null,

      // ── Time-series arrays (for graphs) ──────────────────────────────────────
      // Each is a flat number[] or null. normalizeNumericSeries handles the
      // various storage formats (plain arrays, {value:n} objects, etc.).
      // Cadence: prefer dedicated column; derive from GPS track if null (vívoactive 4 etc.)
      cadenceData:             normalizeNumericSeries(run.cadenceData)
                                 .filter(v => v > 0).length > 0
                                 ? normalizeNumericSeries(run.cadenceData)
                                 : (deriveFromGpsTrack(run.gpsTrack, 'cadence') ?? []),
      // Altitude: prefer dedicated column; otherwise derive from GPS track then strip spikes
      altitudeData:            (() => {
        const stored = normalizeNumericSeries(run.altitudeData).filter(v => v !== 0);
        const raw = stored.length >= 10
          ? stored
          : (deriveFromGpsTrack(run.gpsTrack, 'altitude') ?? []);
        return raw.length >= 10 ? filterAltitudeSpikes(raw) : raw;
      })(),
      groundContactTimeData:   normalizeNumericSeries(run.groundContactTimeData),
      groundContactBalanceData: normalizeNumericSeries(run.groundContactBalanceData),
      verticalOscillationData: normalizeNumericSeries(run.verticalOscillationData),
      verticalRatioData:       normalizeNumericSeries(run.verticalRatioData),
      strideLengthData:        normalizeNumericSeries(run.strideLengthData),
      runningPowerData:        normalizeNumericSeries(run.runningPowerData),
      respirationRateData:     normalizeNumericSeries(run.respirationRateData),
      bearingData:             normalizeNumericSeries(run.bearingData),
    };
  }

  /**
   * Lightweight transform — used for list endpoints (GET /api/users/:userId/runs).
   * Omits large time-series arrays to keep list payloads small (~50 runs × arrays
   * could be hundreds of KB). The full arrays are fetched on-demand via GET /api/runs/:id.
   * Still includes all scalar fields so the history list has complete summary stats.
   */
  function transformRunForAndroidList(run: any) {
    const full = transformRunForAndroid(run);
    // Drop the potentially large time-series arrays
    const {
      cadenceData, altitudeData,
      groundContactTimeData, groundContactBalanceData,
      verticalOscillationData, verticalRatioData,
      strideLengthData, runningPowerData,
      respirationRateData, bearingData,
      routePoints, // also skip routePoints in list — saves massive bandwidth
      paceData,
      heartRateData,
      ...summary
    } = full;
    return summary;
  }

  app.get("/api/runs/user/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // ⚡ Pagination: default to 50 most recent runs; clients can request more with ?limit=N&offset=N
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 200) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const runs = await storage.getUserRuns(req.params.userId, { limit, offset });
      const transformedRuns = runs.map(transformRunForAndroidList);
      res.json(transformedRuns);
    } catch (error: any) {
      console.error("Get user runs error:", error);
      res.status(500).json({ error: "Failed to get runs" });
    }
  });

  // Alias for Android app compatibility
  app.get("/api/users/:userId/runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestedUserId = req.params.userId;
      const tokenUserId = req.user?.userId;

      if (requestedUserId !== tokenUserId) {
        console.warn(`⚠️ userId MISMATCH: URL param="${requestedUserId}" vs token="${tokenUserId}"`);
      }

      // ⚡ Pagination: default to 50 most recent runs — prevents unbounded payload as run count grows
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 200) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const runs = await storage.getUserRuns(requestedUserId, { limit, offset });

      const transformedRuns = runs.map(transformRunForAndroidList);
      res.json(transformedRuns);
    } catch (error: any) {
      console.error("Get user runs error:", error);
      res.status(500).json({ error: "Failed to get runs" });
    }
  });

  // ─── Run History Stats ───────────────────────────────────────────────────────
  // Returns aggregated stats from the user's recent runs to personalise AI coaching.
  // Fetches the last 10 completed runs, filters to the 4 most similar in distance,
  // and computes trends the coaching engine can reference.
  app.get("/api/users/:userId/run-history-stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.params.userId;
      const targetDistanceKm = req.query.targetDistanceKm ? parseFloat(req.query.targetDistanceKm as string) : null;

      // ⚡ Use getRecentUserRuns() — only fetches last 20 runs instead of entire run history.
      // Further JS filtering still happens, but on 20 rows max rather than potentially 500+.
      const recentPool = await storage.getRecentUserRuns(userId, 20);
      const completedRuns = recentPool
        .filter(r => r.completedAt && (r.distance ?? 0) > 0.5);

      if (completedRuns.length === 0) {
        return res.json({ runsAnalysed: 0, avgPaceSecondsPerKm: 0, avgPaceFormatted: 'N/A', avgDistanceKm: 0, consistencyTrend: 'consistent' });
      }

      // Filter to similar-distance runs if a target is provided (within 50%)
      const recentRuns = (targetDistanceKm && targetDistanceKm > 0)
        ? completedRuns.filter(r => {
            const dKm = r.distance ?? 0;
            return dKm >= targetDistanceKm * 0.5 && dKm <= targetDistanceKm * 1.5;
          }).slice(0, 4)
        : completedRuns.slice(0, 5);

      const analysedRuns = recentRuns.length > 0 ? recentRuns : completedRuns.slice(0, 4);

      // Helper: parse "M:SS" pace string → seconds
      const paceToSeconds = (pace: string | null | undefined): number | null => {
        if (!pace) return null;
        const clean = pace.replace('/km', '').trim();
        const parts = clean.split(':');
        if (parts.length !== 2) return null;
        const mins = parseInt(parts[0]);
        const secs = parseInt(parts[1]);
        if (isNaN(mins) || isNaN(secs)) return null;
        return mins * 60 + secs;
      };

      const paceSeconds = analysedRuns.map(r => paceToSeconds(r.avgPace)).filter((s): s is number => s !== null && s > 60 && s < 900);
      const avgPaceSec = paceSeconds.length > 0 ? Math.round(paceSeconds.reduce((a, b) => a + b, 0) / paceSeconds.length) : 0;
      const bestPaceSec = paceSeconds.length > 0 ? Math.min(...paceSeconds) : null;
      const avgDistanceKm = analysedRuns.reduce((a, r) => a + (r.distance ?? 0), 0) / analysedRuns.length;

      const cadences = analysedRuns.map(r => r.cadence).filter((c): c is number => !!c && c > 100);
      const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : undefined;

      const heartRates = analysedRuns.map(r => r.avgHeartRate).filter((h): h is number => !!h && h > 40);
      const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : undefined;

      // Consistency trend: compare first half pace vs second half pace of analysed runs
      let consistencyTrend: 'improving' | 'declining' | 'consistent' | 'inconsistent' = 'consistent';
      if (paceSeconds.length >= 3) {
        const mid = Math.floor(paceSeconds.length / 2);
        const older = paceSeconds.slice(mid);
        const newer = paceSeconds.slice(0, mid);
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const newerAvg = newer.reduce((a, b) => a + b, 0) / newer.length;
        const diff = newerAvg - olderAvg; // negative = getting faster = improving
        if (diff < -10) consistencyTrend = 'improving';
        else if (diff > 10) consistencyTrend = 'declining';
        else if (Math.max(...paceSeconds) - Math.min(...paceSeconds) > 45) consistencyTrend = 'inconsistent';
        else consistencyTrend = 'consistent';
      }

      // Format seconds → "M:SS"
      const secToFormatted = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

      // Last run context
      const lastRun = completedRuns[0];
      const lastRunPace = lastRun ? paceToSeconds(lastRun.avgPace) : null;
      const daysSinceLastRun = lastRun?.completedAt
        ? Math.round((Date.now() - new Date(lastRun.completedAt).getTime()) / 86400000)
        : null;
      const lastRunDateLabel = daysSinceLastRun !== null
        ? daysSinceLastRun === 0 ? 'today' : daysSinceLastRun === 1 ? 'yesterday' : `${daysSinceLastRun} days ago`
        : undefined;

      res.json({
        runsAnalysed: analysedRuns.length,
        avgPaceSecondsPerKm: avgPaceSec,
        avgPaceFormatted: avgPaceSec > 0 ? secToFormatted(avgPaceSec) : 'N/A',
        bestPaceFormatted: bestPaceSec ? secToFormatted(bestPaceSec) : undefined,
        avgDistanceKm: Math.round(avgDistanceKm * 10) / 10,
        avgCadence,
        avgHeartRate,
        consistencyTrend,
        lastRunPaceFormatted: lastRunPace ? secToFormatted(lastRunPace) : undefined,
        lastRunDate: lastRunDateLabel,
        totalRunsAllTime: completedRuns.length,
      });
    } catch (error: any) {
      console.error("Run history stats error:", error);
      res.status(500).json({ error: "Failed to compute run history stats" });
    }
  });

  // Weather impact analysis - how weather conditions affect performance
  app.get("/api/users/:userId/weather-impact", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.params.userId;

      // Fetch all runs from the last 12 months with weather data
      // We'll limit the analysis to the most recent 30 runs
      const twelvMonthsAgo = new Date();
      twelvMonthsAgo.setDate(twelvMonthsAgo.getDate() - 365);
      
      const allRecentRuns = await storage.getUserRuns(userId, {
        limit: 500,
        offset: 0,
      });

      // Filter for runs within 12 months with weather data
      // IMPORTANT: Exclude ALL Garmin-synced activities (externalSource === 'garmin')
      // These have significantly less data and taint the analysis
      const windowedRuns = allRecentRuns.filter(r =>
        r.completedAt &&
        new Date(r.completedAt) >= twelvMonthsAgo &&
        (r.distance ?? 0) > 0.5 &&
        !!r.weatherData &&  // Only include runs with weather data
        (!r.externalSource || r.externalSource === 'airuncoach')  // Exclude Garmin-synced activities
      );

      // Limit to the most recent 30 runs for analysis
      const runsForAnalysis = windowedRuns.slice(0, 30);

      // Use the existing calculateWeatherImpact function
      const weatherImpact = await calculateWeatherImpact(userId, runsForAnalysis);
      console.log(`[Weather Impact] Analysis: ${runsForAnalysis.length} AI app runs (most recent 30 from 12-month window) with weather data, hasEnoughData=${weatherImpact.hasEnoughData}`);

      res.json({ ...weatherImpact, dateRangeUsed: "12m", runsAnalyzed: runsForAnalysis.length });
    } catch (error: any) {
      console.error("Weather impact analysis error:", error);
      res.status(500).json({ error: "Failed to compute weather impact analysis", details: error.message });
    }
  });

  // ── Race Predictor ── GET /api/runs/:id/race-predictions ────────────────────
  // Uses the Riegel formula (T2 = T1 �� (D2/D1)^1.06) to predict finish times
  // for standard race distances based on any run's distance + duration.
  app.get("/api/runs/:id/race-predictions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) return res.status(404).json({ error: "Run not found" });

      const distanceKm: number = Number(run.distance);
      const durationSec: number = Number(run.duration);

      if (!distanceKm || !durationSec || distanceKm < 1) {
        return res.status(400).json({ error: "Run needs at least 1km of data for predictions" });
      }

      // Riegel formula: T2 = T1 × (D2 / D1) ^ 1.06
      const riegel = (targetKm: number): number =>
        durationSec * Math.pow(targetKm / distanceKm, 1.06);

      const formatTime = (sec: number): string => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.round(sec % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
      };

      const formatPace = (targetKm: number, timeSec: number): string => {
        const secPerKm = timeSec / targetKm;
        const m = Math.floor(secPerKm / 60);
        const s = Math.round(secPerKm % 60);
        return `${m}:${String(s).padStart(2, '0')}/km`;
      };

      const targets = [
        { name: "5K",          distanceKm: 5 },
        { name: "10K",         distanceKm: 10 },
        { name: "Half Marathon", distanceKm: 21.0975 },
        { name: "Marathon",    distanceKm: 42.195 },
      ];

      const predictions = targets.map(t => {
        const predictedSec = riegel(t.distanceKm);
        return {
          race: t.name,
          distanceKm: t.distanceKm,
          predictedTimeSeconds: Math.round(predictedSec),
          predictedTime: formatTime(predictedSec),
          predictedPace: formatPace(t.distanceKm, predictedSec),
          // Flag impossible predictions (e.g. predicting 5K from a 10K is fine, but
          // predicting a marathon from a 100m sprint is not meaningful)
          reliable: distanceKm >= t.distanceKm * 0.25,
        };
      });

      // Include the source run context
      const sourceRunPace = durationSec / distanceKm;
      const m = Math.floor(sourceRunPace / 60);
      const s = Math.round(sourceRunPace % 60);

      res.json({
        sourceRunId: run.id,
        sourceDistanceKm: distanceKm,
        sourceDurationSeconds: durationSec,
        sourcePace: `${m}:${String(s).padStart(2, '0')}/km`,
        predictions,
        disclaimer: "Predictions use the Riegel formula and assume similar effort level. Accuracy improves with race-specific training."
      });
    } catch (error: any) {
      console.error("Race predictor error:", error);
      res.status(500).json({ error: "Failed to generate race predictions" });
    }
  });

  app.get("/api/runs/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log(`[GET /api/runs/${req.params.id}] Fetching run for user: ${req.user?.userId}`);
      const run = await storage.getRun(req.params.id);
      if (!run) {
        console.error(`[GET /api/runs/${req.params.id}] Run NOT FOUND in database`);
        return res.status(404).json({ error: "Run not found" });
      }
      console.log(`[GET /api/runs/${req.params.id}] Run found - userId: ${run.userId}, distance: ${run.distance}`);
      const transformedRun = transformRunForAndroid(run);
      res.json(transformedRun);
    } catch (error: any) {
      console.error("[GET /api/runs/:id] Get run error:", error);
      res.status(500).json({ error: "Failed to get run" });
    }
  });

  // GET /api/runs/:id/download-fit — Download run as FIT file for Garmin/Strava
  app.get("/api/runs/:id/download-fit", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log(`[GET /api/runs/${req.params.id}/download-fit] Generating FIT file for user: ${req.user?.userId}`);
      const run = await storage.getRun(req.params.id);
      if (!run) {
        console.error(`[GET /api/runs/${req.params.id}/download-fit] Run NOT FOUND`);
        return res.status(404).json({ error: "Run not found" });
      }
      
      // Verify user owns this run
      if (run.userId !== req.user!.userId) {
        console.error(`[GET /api/runs/${req.params.id}/download-fit] Unauthorized — user mismatch`);
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Generate FIT file
      let fitBuffer: Buffer;
      try {
        fitBuffer = await generateFitFile(run);
      } catch (genError: any) {
        console.error(`[GET /api/runs/${req.params.id}/download-fit] FIT generation error: ${genError.message}`);
        return res.status(500).json({ error: `FIT generation failed: ${genError.message}` });
      }
      
      if (!fitBuffer || fitBuffer.length === 0) {
        console.error(`[GET /api/runs/${req.params.id}/download-fit] FIT generation returned empty buffer`);
        return res.status(500).json({ error: "Failed to generate FIT file - empty output" });
      }
      
      // Set response headers for file download with unique filename using current timestamp
      const now = new Date();
      const dateTimeSuffix = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');  // YYYYMMDD_HHMMSS
      const fileName = `run_${dateTimeSuffix}.gpx`;
      res.setHeader('Content-Type', 'application/gpx+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', fitBuffer.length);
      
      res.send(fitBuffer);
      console.log(`[GET /api/runs/${req.params.id}/download-fit] FIT file sent successfully (${fitBuffer.length} bytes)`);
    } catch (error: any) {
      console.error("[GET /api/runs/:id/download-fit] Error:", error);
      res.status(500).json({ error: "Failed to generate FIT file" });
    }
  });

  app.post("/api/runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const runData = req.body;
      
      // Validate required fields before processing
      // Support both iOS (distance_meters) and Android (distance in km) formats
      let distance = runData.distance || 0;
      if (!distance && runData.distance_meters) {
        distance = runData.distance_meters / 1000.0; // Convert meters to km
        console.log(`[POST /api/runs] Converted iOS distance_meters=${runData.distance_meters} to distance=${distance}km`);
      }
      
      if (!distance || distance <= 0) {
        console.error(`[POST /api/runs] Run validation failed: distance must be > 0, got ${distance}`);
        return res.status(400).json({ 
          error: "Run must have a distance greater than 0. Please check your GPS data and try again.",
          details: "No distance recorded during run session"
        });
      }
      
      // Normalize duration to seconds for database storage.
      // The Android always sends duration in MILLISECONDS; however the old threshold of >86400
      // only caught runs longer than ~86 seconds, silently leaving shorter runs (e.g. stopped early)
      // with a 1000x inflated duration.
      //
      // Smart detection: compare rawDuration against the actual elapsed wall-clock time derived
      // from startTime (always sent by Android) vs server "now".  Whichever interpretation
      // (ms or seconds) is closer to the true elapsed time wins.
      const rawDuration = runData.duration || 0;
      let durationInSeconds: number;
      {
        const startedAtMs = (() => {
          const v = runData.startTime || runData.start_time || runData.started_at;
          if (!v) return null;
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d.getTime();
        })();

        if (startedAtMs !== null) {
          const actualElapsedMs = Date.now() - startedAtMs;
          // Pick whichever interpretation is closer to the real elapsed time
          const diffAsMs  = Math.abs(rawDuration - actualElapsedMs);
          const diffAsSec = Math.abs(rawDuration * 1000 - actualElapsedMs);
          const treatedAsMs = rawDuration > 1000 && diffAsMs < diffAsSec;
          durationInSeconds = treatedAsMs ? Math.round(rawDuration / 1000) : rawDuration;
          console.log(`[POST /api/runs] Duration normalization (anchor): raw=${rawDuration} → ${durationInSeconds}s (treated as ${treatedAsMs ? 'ms' : 'seconds'}, actualElapsed=${Math.round(actualElapsedMs / 1000)}s)`);
        } else {
          // Fallback: the old heuristic (handles most runs > ~86 s)
          const treatedAsMs = rawDuration > 86400;
          durationInSeconds = treatedAsMs ? Math.round(rawDuration / 1000) : rawDuration;
          console.log(`[POST /api/runs] Duration normalization (fallback): raw=${rawDuration} → ${durationInSeconds}s (was ${treatedAsMs ? 'ms' : 'seconds'})`);
        }
      }

      // Detect if distance was sent in METERS instead of km.
      // When the run is started on a Garmin watch (or some Android configurations) the app
      // may send distance as raw GPS meters.  This produces an implied average speed that is
      // physically impossible for a runner — we use that as the detector.
      // Max realistic running speed ≈ 10 m/s (world-record sprint); cap detection at 15 m/s.
      if (distance > 0 && durationInSeconds > 0) {
        const impliedSpeedMs = (distance * 1000) / durationInSeconds; // km → m, then m/s
        if (impliedSpeedMs > 15) {
          const distanceKm = distance / 1000;
          console.log(`[POST /api/runs] Distance detected as METERS (implied speed ${impliedSpeedMs.toFixed(1)} m/s > 15 m/s) — converting ${distance}m → ${distanceKm}km`);
          distance = distanceKm;
        }
      }
      
      // Calculate TSS if not provided (needs duration in seconds)
      let tss = runData.tss || 0;
      if (tss === 0 && durationInSeconds) {
        tss = calculateTSS(
          durationInSeconds,
          runData.avgHeartRate,
          runData.maxHeartRate,
          60, // Default resting HR (could get from user profile)
          runData.difficulty
        );
      }
      
      // Calculate totalSteps from cadence if available
      // Simple formula: steps = avg_cadence (steps/min) × duration (minutes)
      let totalSteps = runData.totalSteps || 0;
      if ((totalSteps === 0 || !totalSteps) && runData.cadence && durationInSeconds > 0) {
        const durationMinutes = durationInSeconds / 60;
        totalSteps = Math.round(runData.cadence * durationMinutes);
        console.log(`[POST /api/runs] Calculated totalSteps: ${runData.cadence} spm × ${durationMinutes.toFixed(1)} min = ${totalSteps} steps`);
      }

      // Helper to safely parse dates - handles both ISO strings and Unix timestamps
      const parseDate = (val: any): Date | undefined => {
        if (!val) return undefined;
        if (val instanceof Date) return val;
        // If it's a string, try to parse it
        if (typeof val === 'string') return new Date(val);
        // If it's a number, treat as milliseconds if < year 3000, else seconds
        if (typeof val === 'number') {
          return val > 1e10 ? new Date(val) : new Date(val * 1000);
        }
        return undefined;
      };

      // Convert timestamp fields from numbers to Date objects for database compatibility
      const processedRunData = {
        ...runData,
        distance, // Use the validated/converted distance
        duration: durationInSeconds,
        totalSteps, // Use calculated or provided value
        completedAt: parseDate(runData.completedAt),
        startTime: parseDate(runData.startTime || runData.start_time),
        endTime: parseDate(runData.endTime || runData.end_time),
        // aiCoachingNotes.time is elapsed ms since run start (not a calendar date).
        // Do NOT run it through parseDate() — that would multiply it by 1000 treating
        // it as seconds-since-epoch and corrupt the value.  Pass it through unchanged.
        aiCoachingNotes: runData.aiCoachingNotes?.map((note: any) => ({
          ...note,
          time: typeof note.time === 'number' ? note.time : 0,
        })),
        // Convert strugglePoints timestamps if present
        strugglePoints: runData.strugglePoints?.map((sp: any) => ({
          ...sp,
          timestamp: parseDate(sp.timestamp),
        })),
      };

      // FK SAFETY: Validate routeId before it reaches the INSERT.
      // If the client sends a routeId that no longer exists in the routes table
      // (e.g. route was deleted, stale cache, different environment), the DB would
      // reject the entire run with a foreign-key violation.  Null it out gracefully.
      if (processedRunData.routeId) {
        const routeExists = await storage.getRoute(processedRunData.routeId);
        if (!routeExists) {
          console.warn(`[POST /api/runs] routeId '${processedRunData.routeId}' not found in routes table — clearing to null to avoid FK violation`);
          processedRunData.routeId = null;
        }
      }

      // Explicitly extract fields that have naming mismatches or type ambiguities.
      // These can be lost when Drizzle maps a Record<string,any> spread through the
      // InsertRun type boundary — explicit extraction guarantees they reach the INSERT.
      const targetDistance    = typeof runData.targetDistance    === 'number'  ? runData.targetDistance    : null;
      const targetTime        = typeof runData.targetTime        === 'number'  ? runData.targetTime        : null;
      const wasTargetAchieved = typeof runData.wasTargetAchieved === 'boolean' ? runData.wasTargetAchieved : null;

      // NAMING MISMATCH FIX: Android sends maxInclinePercent/maxDeclinePercent but the
      // DB schema columns are named steepestIncline/steepestDecline.  The spread passes
      // the Android names, which Drizzle silently ignores.  Map explicitly here.
      const steepestIncline = typeof runData.maxInclinePercent === 'number'
        ? runData.maxInclinePercent
        : (typeof runData.steepestIncline === 'number' ? runData.steepestIncline : null);
      const steepestDecline = typeof runData.maxDeclinePercent === 'number'
        ? runData.maxDeclinePercent
        : (typeof runData.steepestDecline === 'number' ? runData.steepestDecline : null);

      // MISSING COLUMN FIX: Android sends startTime (epoch ms) but the runs table has
      // no startTime column.  Store it as startedAt (we add this column in the migration).
      // Support both startTime (Android) and start_time (iOS)
      const startedAt = parseDate(runData.startTime || runData.start_time) ?? null;

      console.log(`[POST /api/runs] Distance handling — received distance: ${distance}km${runData.distance_meters ? ` (from ${runData.distance_meters}m)` : ''}`);
      console.log(`[POST /api/runs] Target fields — targetDistance: ${targetDistance} km, targetTime: ${targetTime} ms, wasTargetAchieved: ${wasTargetAchieved}`);
      console.log(`[POST /api/runs] Elevation fields — steepestIncline: ${steepestIncline}%, steepestDecline: ${steepestDecline}%`);
      console.log(`[POST /api/runs] Date fields — startedAt: ${processedRunData.startTime}, completedAt: ${processedRunData.completedAt}`);

      // ── Deduplication guard ──────────────────────────────────────────────────
      // Three cases to catch, checked in order of specificity:
      //
      // 0. Exact external_id match — highest fidelity.  Garmin companion sends the
      //    same external_id (Garmin activity ID) for every upload of the same run.
      //    Checking this FIRST catches race-condition duplicates (two requests that
      //    arrive within ms of each other) as long as the first has already committed.
      //    The DB unique constraint (idx_runs_user_external_id_unique) is the final
      //    safety net for requests that truly race past this point simultaneously.
      //
      // 1. Rapid retries (Android exponential-backoff / SyncWorker): same user +
      //    same distance created within the last 30 seconds.
      //
      // 2. Watch-battery-died fallback: the phone now always uploads after a
      //    watch-initiated run (even when the watch was disconnected at stop) so
      //    that a run is never lost when the watch dies mid-run.  On the rare
      //    occasion the watch DID successfully call session/end before disconnecting
      //    (normal out-of-range scenario), the server deduplicates here: look for
      //    an existing Garmin-companion run for this user with a similar distance
      //    (±10 %) created within the last 3 hours.
      const distanceRounded  = Math.round(distance * 100) / 100; // round to 10m
      // Support both camelCase (Android) and snake_case (iOS/legacy) field names
      const externalId     = runData.externalId     || runData.external_id     || null;
      const externalSource = runData.externalSource || runData.external_source || null;
      try {
        // Case 0 — exact external_id match (race-condition safe with DB constraint)
        if (externalId) {
          const [existingByExternalId] = await db.select()
            .from(runs)
            .where(and(
              eq(runs.userId, userId),
              eq(runs.externalId, externalId),
            ))
            .limit(1);
          if (existingByExternalId) {
            console.log(`[POST /api/runs] External-ID duplicate detected (${externalId}) — checking for richer data to merge into existing run ${existingByExternalId.id}`);

            // MERGE STRATEGY: The watch creates the run record first (minimal data), then
            // the phone uploads the same run with coaching notes, GPS track, HR data, etc.
            // Rather than silently discarding the richer upload, merge any non-null fields
            // that the existing record is missing into the surviving record.
            const mergeFields: Record<string, any> = {};

            // Coaching notes — the most important: the watch never has these
            const incomingNotes = runData.aiCoachingNotes;
            if (
              incomingNotes != null &&
              Array.isArray(incomingNotes) &&
              incomingNotes.length > 0 &&
              (!(existingByExternalId as any).aiCoachingNotes ||
               (existingByExternalId as any).aiCoachingNotes?.length === 0)
            ) {
              mergeFields.aiCoachingNotes = incomingNotes;
              console.log(`[POST /api/runs] Merging ${incomingNotes.length} coaching note(s) into run ${existingByExternalId.id}`);
            }

            // GPS track — phone has full array track; Garmin cloud stores { samples: [...] }
            // Prefer the phone's array format (direct routePoints with embedded HR/cadence)
            // over the Garmin cloud object format, which loses HR embedding on read.
            const existingGps = (existingByExternalId as any).gpsTrack;
            const incomingGpsIsArray = Array.isArray(runData.gpsTrack);
            const existingGpsIsArray = Array.isArray(existingGps);
            if (runData.gpsTrack != null && (existingGps == null || (!existingGpsIsArray && incomingGpsIsArray))) {
              mergeFields.gpsTrack = runData.gpsTrack;
            }

            // Heart-rate time-series — prefer phone's flat number[] over Garmin cloud's
            // { min, max, avg, samples: [{timestamp, hr}] } object format.
            // The Garmin cloud format is non-null even with zero samples, so the old
            // "if existing is null" guard silently discarded the phone's real watchHrSeries.
            const existingHR = (existingByExternalId as any).heartRateData;
            const incomingHRIsArray = Array.isArray(runData.heartRateData) && (runData.heartRateData as any[]).length > 0;
            const existingHRIsArray = Array.isArray(existingHR) && (existingHR as any[]).length > 0;
            if (incomingHRIsArray && !existingHRIsArray) {
              // Phone has a real per-sample array; existing has null or a Garmin cloud object
              mergeFields.heartRateData = runData.heartRateData;
              console.log(`[POST /api/runs] Upgrading heartRateData to phone watchHrSeries (${(runData.heartRateData as any[]).length} samples)`);
            } else if (runData.heartRateData != null && existingHR == null) {
              mergeFields.heartRateData = runData.heartRateData;
            }
            if (runData.paceData != null && (existingByExternalId as any).paceData == null) {
              mergeFields.paceData = runData.paceData;
            }

            // Struggle points and km splits (computed by the phone, never by the watch)
            if (runData.strugglePoints != null && (existingByExternalId as any).strugglePoints == null) {
              mergeFields.strugglePoints = runData.strugglePoints;
            }
            if (runData.kmSplits != null && (existingByExternalId as any).kmSplits == null) {
              mergeFields.kmSplits = runData.kmSplits;
            }

            // Altitude time-series — prefer phone's flat float[] over any object-format stored
            // by garmin_companion session/end (kmSplits-derived [{km, value}] which Gson
            // can't deserialize as List<Float> in the Android app).
            if (Array.isArray(runData.altitudeData) && (runData.altitudeData as any[]).length > 0) {
              const existingAlt = (existingByExternalId as any).altitudeData;
              const existingAltIsObjectArray = Array.isArray(existingAlt) &&
                existingAlt.length > 0 && typeof existingAlt[0] === 'object';
              if (!existingAlt || existingAltIsObjectArray) {
                mergeFields.altitudeData = runData.altitudeData;
              }
            }
            // Cadence time-series
            if (Array.isArray(runData.cadenceData) && (runData.cadenceData as any[]).length > 0 &&
                !(existingByExternalId as any).cadenceData) {
              mergeFields.cadenceData = runData.cadenceData;
            }

            // Weather data
            if (runData.weatherData != null && (existingByExternalId as any).weatherData == null) {
              mergeFields.weatherData = runData.weatherData;
            }

            // Target fields — phone knows the target, watch may not
            if (targetDistance != null && (existingByExternalId as any).targetDistance == null) {
              mergeFields.targetDistance = targetDistance;
            }
            if (targetTime != null && (existingByExternalId as any).targetTime == null) {
              mergeFields.targetTime = targetTime;
            }
            if (wasTargetAchieved != null && (existingByExternalId as any).wasTargetAchieved == null) {
              mergeFields.wasTargetAchieved = wasTargetAchieved;
            }

            if (Object.keys(mergeFields).length > 0) {
              console.log(`[POST /api/runs] Merging ${Object.keys(mergeFields).join(', ')} into run ${existingByExternalId.id}`);
              const [merged] = await db.update(runs)
                .set(mergeFields)
                .where(eq(runs.id, existingByExternalId.id))
                .returning();
              // Refresh the runner profile now that we've merged richer data (coaching notes etc.)
              refreshRunnerProfile(userId).catch(err =>
                console.error('[POST /api/runs] Case 0 merge: runner profile refresh failed:', err)
              );
              return res.status(200).json(transformRunForAndroid(merged));
            }

            // No new data to merge — still refresh the profile so "Last reviewed" timestamp
            // always advances after any run-related upload, matching user expectations.
            refreshRunnerProfile(userId).catch(err =>
              console.error('[POST /api/runs] Case 0 no-merge: runner profile refresh failed:', err)
            );
            return res.status(200).json(transformRunForAndroid(existingByExternalId));
          }
        }

        // Case 1 — rapid retry window (30 s)
        const thirtySecondsAgo = new Date(Date.now() - 30_000);
        const recentCandidates = await db.select()
          .from(runs)
          .where(and(
            eq(runs.userId, userId),
            gte(runs.createdAt, thirtySecondsAgo),
          ))
          .limit(5);
        const rapidDup = recentCandidates.find(r =>
          Math.abs((r as any).distance - distanceRounded) < 0.05
        );
        if (rapidDup) {
          console.log(`[POST /api/runs] Rapid-retry duplicate detected — returning existing run ${rapidDup.id}`);
          return res.status(200).json(transformRunForAndroid(rapidDup));
        }

        // Case 2 — Garmin companion run created in the last 3 hours with similar distance.
        // The watch uploads a standalone session; the phone then uploads its richer copy
        // (with watchHrSeries, full GPS track, coaching notes, etc).  Rather than
        // discarding the phone's data, merge it into the watch's record — same logic as
        // Case 0 — then return the now-enriched record.
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const garminCandidates = await db.select()
          .from(runs)
          .where(and(
            eq(runs.userId, userId),
            gte(runs.createdAt, threeHoursAgo),
            eq(runs.externalSource, 'garmin_companion'),
          ))
          .limit(10);
        const garminDup = garminCandidates.find(r => {
          const rDist = (r as any).distance ?? 0;
          return rDist > 0 && Math.abs(rDist - distanceRounded) / Math.max(rDist, 0.1) < 0.1;
        });
        if (garminDup) {
          console.log(`[POST /api/runs] Case 2 — phone upload matches watch run ${garminDup.id} — merging phone data in`);

          const c2Merge: Record<string, any> = {};

          // heartRateData: phone's watchHrSeries (flat number[]) is far richer than the
          // garmin_companion record which only has avgHeartRate with no per-sample array.
          const c2ExistingHR = (garminDup as any).heartRateData;
          const c2IncomingHRIsArray = Array.isArray(runData.heartRateData) && (runData.heartRateData as any[]).length > 0;
          const c2ExistingHRIsArray = Array.isArray(c2ExistingHR) && (c2ExistingHR as any[]).length > 0;
          if (c2IncomingHRIsArray && !c2ExistingHRIsArray) {
            c2Merge.heartRateData = runData.heartRateData;
            console.log(`[POST /api/runs] Case 2: upgrading heartRateData to phone watchHrSeries (${(runData.heartRateData as any[]).length} samples)`);
          }

          // GPS track: phone has full array with embedded HR/cadence per point
          const c2ExistingGps = (garminDup as any).gpsTrack;
          if (runData.gpsTrack != null && (!Array.isArray(c2ExistingGps) && Array.isArray(runData.gpsTrack))) {
            c2Merge.gpsTrack = runData.gpsTrack;
          }

          // Coaching notes, struggle points, km splits (computed by phone only)
          const c2IncomingNotes = runData.aiCoachingNotes;
          if (Array.isArray(c2IncomingNotes) && c2IncomingNotes.length > 0 &&
              (!(garminDup as any).aiCoachingNotes || (garminDup as any).aiCoachingNotes?.length === 0)) {
            c2Merge.aiCoachingNotes = c2IncomingNotes;
          }
          if (runData.strugglePoints != null && (garminDup as any).strugglePoints == null) {
            c2Merge.strugglePoints = runData.strugglePoints;
          }
          if (runData.kmSplits != null && (garminDup as any).kmSplits == null) {
            c2Merge.kmSplits = runData.kmSplits;
          }

          // Cadence / altitude time-series
          // Always prefer phone's flat number[] over garminDup's possible object/kmSplit format.
          // garmin_companion altitudeData is stored as [{km, value}] (kmSplits-derived) which Gson
          // can't deserialize as List<Float> on Android — it silently becomes null, killing the chart.
          const c2CadArr = Array.isArray(runData.cadenceData) && (runData.cadenceData as any[]).length > 0;
          const c2ExistingCadIsArray = Array.isArray((garminDup as any).cadenceData);
          if (c2CadArr && !c2ExistingCadIsArray) c2Merge.cadenceData = runData.cadenceData;

          const c2AltArr = Array.isArray(runData.altitudeData) && (runData.altitudeData as any[]).length > 0;
          const c2ExistingAlt = (garminDup as any).altitudeData;
          // Force-overwrite if incoming is a flat number[] AND existing is either:
          //   (a) absent/null, or
          //   (b) an array of objects (kmSplits format) which Android can't deserialize as Float[]
          const c2ExistingAltIsObjectArray = Array.isArray(c2ExistingAlt) &&
            c2ExistingAlt.length > 0 && typeof c2ExistingAlt[0] === 'object';
          if (c2AltArr && (!c2ExistingAlt || c2ExistingAltIsObjectArray)) {
            c2Merge.altitudeData = runData.altitudeData;
            console.log(`[POST /api/runs] Case 2: upgrading altitudeData from ${c2ExistingAltIsObjectArray ? 'kmSplits object format' : 'null'} to phone flat float array`);
          }

          // Target / achievement
          if (targetDistance != null && (garminDup as any).targetDistance == null) c2Merge.targetDistance = targetDistance;
          if (targetTime    != null && (garminDup as any).targetTime    == null) c2Merge.targetTime    = targetTime;
          if (wasTargetAchieved != null && (garminDup as any).wasTargetAchieved == null) c2Merge.wasTargetAchieved = wasTargetAchieved;

          if (Object.keys(c2Merge).length > 0) {
            await db.update(runs).set(c2Merge).where(eq(runs.id, garminDup.id));
            console.log(`[POST /api/runs] Case 2 merge applied to run ${garminDup.id}:`, Object.keys(c2Merge).join(', '));
          }

          // Kick off profile refresh with the enriched data
          refreshRunnerProfile(userId).catch((err: any) =>
            console.error('[POST /api/runs] Case 2 merge: runner profile refresh failed:', err)
          );

          const [updated2] = await db.select().from(runs).where(eq(runs.id, garminDup.id)).limit(1);
          return res.status(200).json(transformRunForAndroid(updated2 ?? garminDup));
        }
      } catch (dupErr) {
        console.warn('[POST /api/runs] Dedup check failed (non-fatal):', dupErr);
      }

      // Create run with TSS and calculated steps
      console.log(`[POST /api/runs] Creating run for user: ${userId}`);
      // Also extract maxSpeed, totalSteps explicitly (safe names but good habit)
      const maxSpeed    = typeof runData.maxSpeed    === 'number' ? runData.maxSpeed    : null;
      const totalSteps2 = typeof runData.totalSteps  === 'number' ? runData.totalSteps  : (totalSteps || null);

      // Explicit time-series array extractions — the spread passes camelCase arrays but
      // Drizzle sometimes strips unknown keys at the type boundary.  Explicit assignment
      // guarantees they reach the INSERT for all platforms (Android + iOS).
      const heartRateDataArr       = Array.isArray(runData.heartRateData)       ? runData.heartRateData       : null;
      const cadenceDataArr         = Array.isArray(runData.cadenceData)         ? runData.cadenceData         : null;
      const altitudeDataArr        = Array.isArray(runData.altitudeData)        ? runData.altitudeData        : null;
      const groundContactTimeArr   = Array.isArray(runData.groundContactTimeData)    ? runData.groundContactTimeData    : null;
      const groundContactBalArr    = Array.isArray(runData.groundContactBalanceData) ? runData.groundContactBalanceData : null;
      const verticalOscArr         = Array.isArray(runData.verticalOscillationData)  ? runData.verticalOscillationData  : null;
      const verticalRatioArr       = Array.isArray(runData.verticalRatioData)        ? runData.verticalRatioData        : null;
      const strideLengthArr        = Array.isArray(runData.strideLengthData)         ? runData.strideLengthData         : null;
      const runningPowerArr        = Array.isArray(runData.runningPowerData)         ? runData.runningPowerData         : null;
      const respirationRateArr     = Array.isArray(runData.respirationRateData)      ? runData.respirationRateData      : null;
      const bearingDataArr         = Array.isArray(runData.bearingData)              ? runData.bearingData              : null;

      const run = await storage.createRun({
        ...processedRunData,
        userId,
        tss,
        // Explicit overrides — guaranteed to reach the INSERT statement
        targetDistance,
        targetTime,
        wasTargetAchieved,
        steepestIncline,
        steepestDecline,
        startedAt,
        maxSpeed,
        totalSteps: totalSteps2,
        // Time-series arrays (graphs)
        heartRateData:            heartRateDataArr,
        cadenceData:              cadenceDataArr,
        altitudeData:             altitudeDataArr,
        groundContactTimeData:    groundContactTimeArr,
        groundContactBalanceData: groundContactBalArr,
        verticalOscillationData:  verticalOscArr,
        verticalRatioData:        verticalRatioArr,
        strideLengthData:         strideLengthArr,
        runningPowerData:         runningPowerArr,
        respirationRateData:      respirationRateArr,
        bearingData:              bearingDataArr,
      });
      console.log(`[POST /api/runs] Run created successfully with ID: ${run.id}`);

      // ⚡ Update user stats cache asynchronously (don't block response)
      onRunSaved(userId, run).catch(err =>
        console.error('[UserStatsCache] onRunSaved failed:', err)
      );

      // ── Track AI coaching km usage ─────────────────────────────────────────
      // If AI coaching was active for this run, count its distance toward the
      // user's monthly AI coaching quota. Fire-and-forget; never blocks the save.
      // Track AI coaching km based on whether coaching actually happened (notes were generated),
      // not just whether the flag was set. This correctly handles watch-started runs,
      // runs where the coach was toggled mid-run, and any edge cases where the flag
      // was true but no coaching fired.
      const hasAiCoachingNotes = Array.isArray(run.aiCoachingNotes) && run.aiCoachingNotes.length > 0;
      if (hasAiCoachingNotes && (run.distance ?? 0) > 0) {
        recordUsage(userId, "aiCoachingKm", run.distance ?? 0);
      }

      // Update fitness metrics asynchronously (don't block response)
      if (run.completedAt && tss > 0) {
        const completedAtDate = typeof run.completedAt === 'number'
          ? new Date(run.completedAt)
          : run.completedAt;
        const runDate = completedAtDate.toISOString().split('T')[0];
        updateDailyFitness(userId, runDate, tss).catch(err => {
          console.error("Error updating daily fitness:", err.message || err);
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

      // Reassess training plans asynchronously (don't block response)
      setImmediate(() => {
        (async () => {
          try {
            console.log(`[Run] Triggering plan reassessment for run ${run.id}`);
            await reassessTrainingPlansWithRunData(userId, run.id);
          } catch (err) {
            console.error("[Run] Plan reassessment failed:", err);
          }
        })();
      });

      // Rolling block: check if any active plans need their next block generated
      setImmediate(() => {
        checkAndGeneratePendingBlocks(userId).catch(err =>
          console.error("[Run] Rolling block check failed:", err)
        );
      });

      // Route Memory Engine — update/create known route fingerprint (non-blocking)
      setImmediate(() => {
        (async () => {
          try {
            if (run.startLat && run.startLng) {
              await updateKnownRoutes(userId, {
                id: run.id,
                startLat: run.startLat,
                startLng: run.startLng,
                distance: run.distance,
                duration: run.duration,
                completedAt: run.completedAt ?? new Date(),
                kmSplits: run.kmSplits,
                gpsTrack: run.gpsTrack,
                terrainType: run.terrainType ?? null,
              });
            }
          } catch (err) {
            console.error("[RouteMemory] updateKnownRoutes failed (non-fatal):", err);
          }
        })();
      });

      res.status(201).json(run);
    } catch (error: any) {
      console.error("Create run error:", error);
      res.status(500).json({ error: "Failed to create run" });
    }
  });

  // ─── Route Memory Engine ──────────────────────────────────────────────────────
  // POST /api/runs/recognize-route
  // Called by the Android app when the first stable GPS fix is received at run start.
  // Returns a Route Intelligence Packet if a known recurring route is matched.
  // Non-blocking — any failure falls back to standard coaching gracefully.
  app.post("/api/runs/recognize-route", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { latitude, longitude, timestamp, intendedDistanceKm } = req.body;

      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return res.status(400).json({ error: "latitude and longitude are required numbers" });
      }

      const ts = timestamp ? new Date(timestamp) : new Date();
      const result = await recognizeRoute(userId, latitude, longitude, ts, intendedDistanceKm ?? undefined);
      res.json(result);
    } catch (error: any) {
      console.error("[Route Recognition] Error:", error?.message ?? error);
      // Return a safe no-match response so the client never gets a hard error
      res.json({ matched: false, confidence: 0, confidenceLabel: "none", knownRoute: null, routeIntelligence: null, confidenceBreakdown: null });
    }
  });

  // GET /api/runs/known-routes — returns all known routes for the authenticated user
  app.get("/api/runs/known-routes", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { knownRoutes: knownRoutesTable } = await import("../shared/schema");
      const { eq: eqFn } = await import("drizzle-orm");
      const routes = await db.select().from(knownRoutesTable).where(eqFn(knownRoutesTable.userId, userId));
      res.json(routes);
    } catch (error: any) {
      console.error("[Known Routes] Error:", error?.message ?? error);
      res.status(500).json({ error: "Failed to fetch known routes" });
    }
  });

  // ── Rename a run (iOS & Android) ─────────────────────────────────────────────
  app.patch("/api/runs/:id/rename", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (req.user?.userId && run.userId !== req.user.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const newName = req.body.name ?? null;
      const updated = await storage.updateRun(req.params.id, { name: newName });
      if (!updated) return res.status(404).json({ error: "Run not found after update" });
      console.log(`[PATCH /api/runs/:id/rename] ✅ Run ${req.params.id} renamed to: ${newName ?? "(cleared)"}`);
      // Return the run in Android-compatible format so the app can update its state correctly
      res.json(transformRunForAndroid(updated));
    } catch (error: any) {
      console.error("[PATCH /api/runs/:id/rename]", error);
      res.status(500).json({ error: "Failed to rename run" });
    }
  });

  // ── Patch coaching notes onto an existing run ────────────────────────────────
  // Used when the watch created the run record first (no coaching notes) and the
  // phone wants to attach the notes it generated during the run.  Also supports
  // manual re-attachment of lost coaching notes (e.g. after a dedup cleanup).
  app.patch("/api/runs/:id/coaching-notes", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (req.user?.userId && run.userId !== req.user.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const { aiCoachingNotes } = req.body;
      if (!Array.isArray(aiCoachingNotes)) {
        return res.status(400).json({ error: "aiCoachingNotes must be an array" });
      }
      const updated = await storage.updateRun(req.params.id, { aiCoachingNotes });
      console.log(`[PATCH /api/runs/:id/coaching-notes] Patched ${aiCoachingNotes.length} note(s) onto run ${req.params.id}`);
      res.json(updated);
    } catch (error: any) {
      console.error("[PATCH /api/runs/:id/coaching-notes]", error);
      res.status(500).json({ error: "Failed to patch coaching notes" });
    }
  });

  // ── iOS: Save user comments + struggle points ────────────────────────────────
  app.put("/api/runs/:id/struggle-points", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (req.user?.userId && run.userId !== req.user.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const updated = await storage.updateRun(req.params.id, {
        userComments: req.body.user_comments ?? req.body.userComments ?? run.userComments,
        strugglePoints: req.body.struggle_points ?? req.body.strugglePoints ?? run.strugglePoints,
      } as any);
      res.json(updated);
    } catch (error: any) {
      console.error("[PUT /api/runs/:id/struggle-points]", error);
      res.status(500).json({ error: "Failed to save struggle points" });
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
      
      // Extract Garmin data summary and user profile from request body (if provided)
      const garminDataSummary = req.body?.garminDataSummary || null;
      const userProfileFromRequest = req.body?.userProfile || null;
      
      console.log(`[comprehensive-analysis] Starting analysis for run ${runId}, user ${userId}` +
        (garminDataSummary?.deviceName ? ` [WITH Garmin data from ${garminDataSummary.deviceName}]` : ` [NO Garmin data]`));
      
      // Check for existing analysis first — return cached if available (no quota cost for cached results)
      const existingAnalysis = await storage.getRunAnalysis(runId);
      console.log(`[comprehensive-analysis] Checked cache, found: ${!!existingAnalysis?.analysis}`);
      if (existingAnalysis?.analysis) {
        // Unwrap the analysis — handle both direct and nested formats
        let cachedAnalysis = existingAnalysis.analysis as any;
        if (cachedAnalysis.analysis && typeof cachedAnalysis.analysis === 'object' && cachedAnalysis.analysis.performanceScore !== undefined) {
          cachedAnalysis = cachedAnalysis.analysis; // Unwrap legacy double-nested format
        }
        if (cachedAnalysis.performanceScore !== undefined) {
          console.log(`[comprehensive-analysis] Returning cached analysis for run ${runId}`);
          return res.json({
            success: true,
            analysis: cachedAnalysis,
            hasGarminData: false,
            hasWellnessData: false,
            cached: true,
          });
        }
      }

      // ── Tier limit check (only for new analyses, not cached returns) ──────
      const analysisUser = await storage.getUser(userId);
      const analysisAllowed = await checkAndEnforceLimit(res, userId, analysisUser?.subscriptionTier, "postRunAnalyses", 1, analysisUser?.trialExpiresAt ?? null, analysisUser?.createdAt ?? null);
      if (!analysisAllowed) return;
      
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
      // Wrapped in try/catch - missing DB columns should not block AI analysis
      let garminActivity: any = null;
      try {
        garminActivity = await db.query.garminActivities.findFirst({
          where: eq(garminActivities.runId, runId),
        });
      } catch (garminErr: any) {
        console.warn(`[comprehensive-analysis] Could not fetch Garmin activity (DB column missing?): ${garminErr?.message}`);
        // Proceed without Garmin data - analysis still works with just run data
      }
      
      // Get latest wellness metrics for the run date
      // Wrapped in try/catch - missing DB columns should not block AI analysis
      const runDate = run.runDate || (run.completedAt ? (typeof run.completedAt === 'number' ? new Date(run.completedAt) : run.completedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      let wellness: any = null;
      try {
        wellness = await db.query.garminWellnessMetrics.findFirst({
          where: and(
            eq(garminWellnessMetrics.userId, userId),
            eq(garminWellnessMetrics.date, runDate)
          ),
        });
      } catch (wellnessErr: any) {
        console.warn(`[comprehensive-analysis] Could not fetch wellness metrics (DB column missing?): ${wellnessErr?.message}`);
        // Proceed without wellness data
      }
      
      // Initialize weatherImpactAnalysis as null (used in learning loop below)
      let weatherImpactAnalysis: string | null = null;
      
      // Get previous runs for context
      const previousRuns = await db.query.runs.findMany({
        where: eq(runs.userId, userId),
        orderBy: desc(runs.completedAt),
        limit: 10,
      });
      
      
      // ========== SESSION COACHING CONTEXT (Phase 2 Enhancement) ==========
      // Fetch session instructions if this run is linked to a planned workout
      let sessionInstructions: any = null;
      let coachingEvents: any[] = [];
      let expectedSessionGoal: string | undefined = undefined;
      
      if (run.linkedWorkoutId) {
        try {
          // Fetch the planned workout
          const plannedWorkout = await db.query.plannedWorkouts.findFirst({
            where: eq(plannedWorkouts.id, run.linkedWorkoutId),
          });
          
          if (plannedWorkout?.sessionInstructionsId) {
            // Fetch session instructions
            sessionInstructions = await db.query.sessionInstructions.findFirst({
              where: eq(sessionInstructions.id, plannedWorkout.sessionInstructionsId),
            });
            
            expectedSessionGoal = plannedWorkout.sessionGoal || undefined;
          }
          
          // Fetch all coaching events from this run
          coachingEvents = await db.query.coachingSessionEvents.findMany({
            where: eq(coachingSessionEvents.runId, runId),
          });
          
          console.log(`[comprehensive-analysis] Loaded session context: instructions=${!!sessionInstructions}, events=${coachingEvents.length}`);
        } catch (sessionErr: any) {
          console.warn(`[comprehensive-analysis] Could not fetch session context: ${sessionErr?.message}`);
          // Proceed without session context - analysis still works
        }
      }

      // Import and call the comprehensive analysis function
      console.log(`[comprehensive-analysis] About to call generateComprehensiveRunAnalysis for run ${runId}`);
      const aiService = await import("./ai-service");
      const analysisStartTime = Date.now();
      const analysis = await aiService.generateComprehensiveRunAnalysis({
        runData: run,
        
        // NEW: Rich Garmin watch data from client (from ComprehensiveAnalysisRequest)
        garminDataFromWatch: garminDataSummary,
        userProfileContext: userProfileFromRequest,
        
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
        previousRuns: previousRuns.filter(r => r.id !== runId).slice(0, 10),
        userProfile: user ? {
          fitnessLevel: user.fitnessLevel || undefined,
          age: user.dob ? (() => { 
            const dob = new Date(user.dob); 
            const ageMs = Date.now() - dob.getTime(); 
            const ageYears = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000)); 
            return ageYears > 0 && ageYears < 150 ? ageYears : undefined; 
          })() : undefined,
          weight: user.weight ? (() => { const w = parseFloat(user.weight); return w > 0 && w < 500 ? w : undefined; })() : undefined,
        } : undefined,
        coachName,
        coachTone,
        coachAccent: user?.coachAccent || undefined,
        // Training plan context for personalized post-run analysis
        // Note: planGoalType is not stored on runs — derive it from the linked plan if needed,
        // or pass a descriptive workoutType instead.
        linkedPlanId: run.linkedPlanId || undefined,
        planProgressWeek: run.planProgressWeek || undefined,
        planProgressWeeks: run.planProgressWeeks || undefined,
        workoutType: run.workoutType || undefined,
        workoutIntensity: run.workoutIntensity || undefined,
        workoutDescription: run.workoutDescription || undefined,
        // NEW: Session coaching context (Phase 2 Enhancement)
        sessionInstructions: sessionInstructions ? {
          aiDeterminedTone: sessionInstructions.aiDeterminedTone,
          coachingStyle: sessionInstructions.coachingStyle,
          insightFilters: sessionInstructions.insightFilters,
          sessionStructure: sessionInstructions.sessionStructure,
          preRunBrief: sessionInstructions.preRunBrief,
        } : undefined,
        coachingEvents: coachingEvents.length > 0 ? coachingEvents.map((e: any) => ({
          eventType: e.eventType,
          eventPhase: e.eventPhase,
          coachingMessage: e.coachingMessage,
          toneUsed: e.toneUsed,
          userEngagement: e.userEngagement,
          triggeredAt: e.triggeredAt,
        })) : undefined,
        expectedSessionGoal: expectedSessionGoal,
        weatherImpactAnalysis: weatherImpactAnalysis || undefined,
        // Plan reassessment insight — persisted to runs.coaching_insight after run save.
        // Contains reason + recommendation from the AI coach's post-run training assessment.
        // May be null for users without a training plan (inline assessment handles this).
        coachingInsight: (run as any).coachingInsight ?? null,
      });
      const analysisEndTime = Date.now();
      console.log(`[comprehensive-analysis] AI analysis generated in ${analysisEndTime - analysisStartTime}ms for run ${runId}`);
      
      // Store the analysis (save the analysis object directly, not wrapped)
      await storage.upsertRunAnalysis(runId, analysis);
      
      // Update run with ai insights summary — only update aiInsights, never touch aiCoachingNotes
      await storage.updateRun(runId, { 
        aiInsights: JSON.stringify({
          summary: analysis.summary,
          performanceScore: analysis.performanceScore,
          highlights: analysis.highlights,
        } as any),
      } as any);
      
      console.log(`[comprehensive-analysis] Successfully returning analysis for run ${runId}`);
      // Record usage AFTER successful analysis (fire and forget)
      recordUsage(userId, "postRunAnalyses");

      res.json({
        success: true,
        analysis,
        hasGarminData: !!garminActivity,
        hasWellnessData: !!wellness,
      });

      // ── Learning Loop: persist coaching observations + refresh runner profile ──
      // Extract the AI-interpreted patterns from this analysis and store them
      // in user_stats.coaching_observations.  This is the feed-forward signal
      // that makes the "What I know about you" profile accumulate knowledge
      // over time rather than being rebuilt from raw data each run.
      // Non-blocking — response has already been sent.
      setImmediate(() => {
        // Build weather note if weather impact analysis identified a meaningful pattern
        // (e.g. "this runner performs significantly worse in heat/humidity")
        let weatherNote: string | null = null;
        if (weatherImpactAnalysis && weatherImpactAnalysis.length > 20) {
          // Only capture if it's a real insight, not a generic fallback message
          const isGenericFallback = weatherImpactAnalysis.includes('still performed well');
          if (!isGenericFallback) {
            weatherNote = weatherImpactAnalysis;
          }
        }

        const observation = {
          date:             new Date().toISOString().split('T')[0],
          runId,
          distanceKm:       Math.round(((run.distance ?? 0) / 1000) * 100) / 100,
          workoutType:      run.workoutType ?? null,
          performanceScore: (analysis as any).performanceScore ?? null,
          patternObserved:  (analysis as any).runPatternAnalysis ?? null,
          progressionNote:  (analysis as any).progressionTrend ?? null,
          adaptationSignal: (analysis as any).fitnessContext?.adaptationSignals
            // Append weather impact to adaptation signal when meaningful
            ? ((analysis as any).fitnessContext.adaptationSignals + (weatherNote ? ` Weather note: ${weatherNote}` : ''))
            : (weatherNote ?? null),
          struggleNote:     (analysis as any).strugglePointsAnalysis?.likelyReasons ?? null,
          pacingNote:       (analysis as any).pacingStrategy?.assessment ?? null,
          coachingSummary:  (analysis as any).summary ?? null,
        };
        persistCoachingObservation(userId, observation).catch(err =>
          console.error('[Learning] Failed to persist coaching observation:', err)
        );
      });

      // NOTE: Plan reassessment is intentionally NOT re-triggered here.
      // It already fires once from onRunSaved (POST /api/runs) and persists its
      // insights to runs.coaching_insight. Re-running it on every "Generate AI Summary"
      // tap would cause expensive GPT-4o duplicate calls and flood the training plan
      // with redundant adaptations. The coaching insight loaded above is the canonical
      // source — no need to regenerate it.
    } catch (error: any) {
      console.error("Comprehensive run analysis error:", {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
        errorFull: JSON.stringify(error)
      });
      res.status(500).json({ 
        error: "Failed to generate comprehensive analysis",
        details: error?.message || "Unknown error"
      });
    }
  });

  // Freeform AI analysis of a run (conversational, lightweight)
  app.post("/api/runs/:id/freeform-analysis", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const runId = req.params.id;
      const userId = req.user!.userId;
      const { question } = req.body;

      const run = await storage.getRun(runId);
      if (!run || run.userId !== userId) {
        return res.status(404).json({ error: "Run not found" });
      }

      // Strip heavy arrays to keep payload small for OpenAI
      const { gpsData, heartRateData, routePoints, splitData, ...runSummary } = run as any;

      const [userRows, aiRunnerProfileResult] = await Promise.all([
        db.select().from(users).where(eq(users.id, userId)).limit(1),
        getRunnerProfile(userId).catch(() => null),
      ]);
      const aiRunnerProfile = aiRunnerProfileResult?.profile ?? null;
      const coachName = (userRows[0] as any)?.coachName || "Coach";
      const coachPersonality = (userRows[0] as any)?.coachPersonality || "motivating";

      const contextJson = JSON.stringify(runSummary, null, 2);

      const prompt = question
        ? `The user asks: "${question}"\n\nRun data:\n${contextJson}`
        : `Provide a brief, insightful analysis of this run. Highlight what went well and one area to improve.\n\nRun data:\n${contextJson}`;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are ${coachName}, a ${coachPersonality} running coach. Write in markdown format. Be concise but insightful. Keep response under 300 words.${runnerProfileBlock(aiRunnerProfile)}`
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const analysis = completion.choices[0].message.content || "";
      res.json({ success: true, analysis });
    } catch (error: any) {
      console.error("[freeform-analysis] Error:", error);
      res.status(500).json({ error: "Failed to generate analysis" });
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
    console.log("📋 Body keys:", Object.keys(req.body));
    
    try {
      // Support both old and new parameter names for backward compatibility
      const latitude = req.body.latitude || req.body.startLat;
      const longitude = req.body.longitude || req.body.startLng;
      const distanceKm = req.body.distanceKm || req.body.distance || req.body.targetDistance;
      const preferTrails = req.body.preferTrails !== false;
      const avoidHills = req.body.avoidHills === true;
      
      console.log(`📍 Parsed values - Lat: ${latitude}, Lng: ${longitude}, Distance: ${distanceKm}, Trails: ${preferTrails}, AvoidHills: ${avoidHills}`);
      
      if (!latitude || !longitude || !distanceKm) {
        console.log("❌ Missing required fields!");
        console.log(`   latitude: ${latitude}, longitude: ${longitude}, distanceKm: ${distanceKm}`);
        return res.status(400).json({ 
          error: "Missing required fields. Received: " + JSON.stringify({latitude, longitude, distanceKm}),
          receivedBody: req.body
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
          maxInclineDegrees: route.maxInclineDegrees,
          maxDeclineDegrees: route.maxDeclineDegrees,
          difficulty: route.difficulty,
          estimatedTime: route.duration,
          popularityScore: route.popularityScore,
          qualityScore: route.qualityScore,
          turnInstructions: route.turnInstructions,
        })),
      });
    } catch (error: any) {
      console.error("Intelligent route generation error:", error);
      
      if (error instanceof NoRoutesError) {
        // No valid routes found — not a server error, just no suitable routes in this area
        res.status(422).json({ 
          error: error.message,
          code: 'NO_ROUTES_FOUND'
        });
      } else {
        res.status(500).json({ 
          error: error.message || "Failed to generate intelligent route" 
        });
      }
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
      
      const userId = (req as AuthenticatedRequest).user?.userId;

      // ── Tier limit check ─────────────────────────────────────────────────
      if (userId) {
        const routeUser = await storage.getUser(userId);
        const routeAllowed = await checkAndEnforceLimit(res, userId, routeUser?.subscriptionTier, "routesGenerated", 1, routeUser?.trialExpiresAt ?? null, routeUser?.createdAt ?? null);
        if (!routeAllowed) return;
      }

      const aiRunnerProfile = userId
        ? (await getRunnerProfile(userId).catch(() => null))?.profile ?? null
        : null;

      const routeGenAI = await import("./route-generation-ai");
      const routes = await routeGenAI.generateAIRoutesWithGoogle(
        parseFloat(startLat),
        parseFloat(startLng),
        parseFloat(distance),
        activityType || 'run',
        aiRunnerProfile,
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
      
      // Record against monthly quota (fire and forget)
      if (userId) recordUsage(userId, "routesGenerated");

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

      // ── Tier limit check ─────────────────────────────────────────────────
      const templateRouteUserId = req.user!.userId;
      const templateRouteUser = await storage.getUser(templateRouteUserId);
      const templateRouteAllowed = await checkAndEnforceLimit(res, templateRouteUserId, templateRouteUser?.subscriptionTier, "routesGenerated", 1, templateRouteUser?.trialExpiresAt ?? null, templateRouteUser?.createdAt ?? null);
      if (!templateRouteAllowed) return;
      
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
      
      // Record against monthly quota (fire and forget)
      recordUsage(templateRouteUserId, "routesGenerated");

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
        targetWeightKg: (goal as any).targetWeightKg ?? null,
        startingWeightKg: (goal as any).startingWeightKg ?? null,
        // Injury Recovery fields
        injuryBodyPart: (goal as any).injuryBodyPart ?? null,
        injuryDate: (goal as any).injuryDate ?? null,
        injurySeverity: (goal as any).injurySeverity ?? null,
        injuryNotes: (goal as any).injuryNotes ?? null,
        injurySide: (goal as any).injurySide ?? null,
        currentProgress: goal.progressPercent ?? 0,
        isActive: goal.status === 'active',
        isCompleted: !!goal.completedAt,
        relatedRunSessionIds: (goal as any).relatedRunSessionIds ?? [],
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
        targetWeightKg: req.body.targetWeightKg || null,
        startingWeightKg: req.body.startingWeightKg || null,
        // Injury Recovery fields (populated when healthTarget = "Injury Recovery")
        injuryBodyPart: req.body.injuryBodyPart || null,
        injuryDate: req.body.injuryDate || null,
        injurySeverity: req.body.injurySeverity || null,
        injuryNotes: req.body.injuryNotes || null,
        injurySide: req.body.injurySide || null,
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
        targetWeightKg: (rawGoal as any).targetWeightKg ?? null,
        startingWeightKg: (rawGoal as any).startingWeightKg ?? null,
        // Injury Recovery fields
        injuryBodyPart: (rawGoal as any).injuryBodyPart ?? null,
        injuryDate: (rawGoal as any).injuryDate ?? null,
        injurySeverity: (rawGoal as any).injurySeverity ?? null,
        injuryNotes: (rawGoal as any).injuryNotes ?? null,
        injurySide: (rawGoal as any).injurySide ?? null,
        currentProgress: rawGoal.progressPercent ?? 0,
        isActive: rawGoal.status === 'active',
        isCompleted: !!rawGoal.completedAt,
        relatedRunSessionIds: (rawGoal as any).relatedRunSessionIds ?? [],
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
      const updateData: Record<string, any> = {
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
        targetWeightKg: req.body.targetWeightKg || null,
        startingWeightKg: req.body.startingWeightKg || null,
        // Injury Recovery fields
        injuryBodyPart: req.body.injuryBodyPart || null,
        injuryDate: req.body.injuryDate || null,
        injurySeverity: req.body.injurySeverity || null,
        injuryNotes: req.body.injuryNotes || null,
        injurySide: req.body.injurySide || null,
      };

      // Handle completion / status fields sent by the app
      if (req.body.isCompleted === true) {
        updateData.status = 'completed';
        updateData.completedAt = req.body.completedAt ? new Date(req.body.completedAt) : new Date();
      } else if (req.body.isActive === false) {
        updateData.status = 'abandoned';
      } else if (req.body.isActive === true) {
        updateData.status = 'active';
      }

      if (req.body.currentProgress != null) {
        updateData.progressPercent = Math.round(req.body.currentProgress);
      }

      // Persist related run session IDs (linked runs for this goal)
      if (Array.isArray(req.body.relatedRunSessionIds)) {
        updateData.relatedRunSessionIds = req.body.relatedRunSessionIds;
      }

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
        targetWeightKg: (rawGoal as any).targetWeightKg ?? null,
        startingWeightKg: (rawGoal as any).startingWeightKg ?? null,
        currentProgress: rawGoal.progressPercent ?? 0,
        isActive: rawGoal.status === 'active',
        isCompleted: !!rawGoal.completedAt,
        relatedRunSessionIds: (rawGoal as any).relatedRunSessionIds ?? [],
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

  // Invite observer to watch a live run session
  app.post("/api/live-sessions/:sessionId/invite-observer", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { runnerId, friendId } = req.body;

      // Validate session exists and belongs to runnerId
      const session = await storage.getLiveSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      if (session.userId !== runnerId) {
        return res.status(403).json({ error: "Unauthorized: session does not belong to this user" });
      }

      // Validate friendship
      const isFriend = await storage.checkFriendship(runnerId, friendId);
      if (!isFriend) {
        return res.status(403).json({ error: "Users are not friends" });
      }

      // Invite observer
      const updatedSession = await storage.inviteObserver(sessionId, friendId);
      if (!updatedSession) {
        return res.status(500).json({ error: "Failed to invite observer" });
      }

      // Get friend's info for notification
      const friend = await storage.getUser(friendId);
      const runner = await storage.getUser(runnerId);

      if (!friend || !runner) {
        return res.status(500).json({ error: "Could not fetch user information" });
      }

      // Send push notification to friend
      const notificationService = await import("./notification-service");
      const pushSent = await notificationService.sendFirebasePush(
        friendId,
        `${runner.name} invited you to watch their run`,
        "Watch their live location and route in real-time",
        {
          type: "live_run_invite",
          sessionId,
          runnerId,
          runnerName: runner.name || "A runner",
          routeId: session.routeId || "",
          hasStarted: session.hasStarted ? "true" : "false",
        }
      );

      console.log(`[Live Sessions] Invited ${friendId} to watch ${runnerId}'s run (session ${sessionId}). Push sent: ${pushSent}`);

      res.json({ success: true, pushSent });
    } catch (error: any) {
      console.error("Invite observer error:", error);
      res.status(500).json({ error: "Failed to invite observer" });
    }
  });

  // ==================== GROUP RUNS ====================
  
  app.get("/api/group-runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      
      // Get all group runs, filter in memory
      const allGroupRuns = await db
        .select()
        .from(groupRuns);

      // Get participant IDs for the current user
      const participantRunIds = await db
        .select({ groupRunId: groupRunParticipants.groupRunId })
        .from(groupRunParticipants)
        .where(eq(groupRunParticipants.userId, userId));

      const participantRunIdSet = new Set(participantRunIds.map(r => r.groupRunId));

      // Filter to runs the user hosts or participates in, and upcoming runs only
      const upcomingGroupRuns = allGroupRuns
        .filter(run => run.hostUserId === userId || participantRunIdSet.has(run.id))
        .filter(run => !run.startedAt) // Only runs that haven't started
        .sort((a, b) => {
          const aTime = a.plannedStartAt ? new Date(a.plannedStartAt).getTime() : Infinity;
          const bTime = b.plannedStartAt ? new Date(b.plannedStartAt).getTime() : Infinity;
          return aTime - bTime;
        });

      // Return wrapped response matching Android GroupRunsResponse model
      res.json({
        groupRuns: upcomingGroupRuns,
        count: upcomingGroupRuns.length,
        total: upcomingGroupRuns.length,
      });
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
      const { text, voice, coachAccent, coachGender } = req.body;
      const aiService = await import("./ai-service");
      const audioBuffer = await aiService.generateTTS(text, voice || "alloy", undefined, coachAccent, coachGender);
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

  // Alias for iOS app compatibility: GET /api/weather redirects to /api/weather/current
  // Supports optional lat/lng parameters; if missing, returns gracefully instead of error
  app.get("/api/weather", async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.query;
      
      // If location not provided, return null weather data (don't fail with 400)
      // iOS app should pass coordinates but can gracefully handle missing weather
      if (!lat || !lng) {
        console.warn(`[GET /api/weather] Called without location parameters (lat: ${lat}, lng: ${lng})`);
        return res.json({
          temp: null,
          feelsLike: null,
          humidity: null,
          windSpeed: null,
          windDirection: null,
          condition: null,
          weatherCode: null,
        });
      }
      
      // Fetch weather data from Open-Meteo API
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status}`);
      }
      
      const data = await response.json();
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
      // Return null weather data on error instead of 500
      res.json({
        temp: null,
        feelsLike: null,
        humidity: null,
        windSpeed: null,
        windDirection: null,
        condition: null,
        weatherCode: null,
      });
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
      // Compute trial expiry — fall back to created_at + 14 days if column not set yet
      let trialExpiresAt = user?.trialExpiresAt ?? null;
      if (!trialExpiresAt && user?.createdAt) {
        trialExpiresAt = new Date(user.createdAt);
        (trialExpiresAt as Date).setDate((trialExpiresAt as Date).getDate() + 14);
      }
      const { isTrialExpired: checkExpired } = await import("./usage-service");
      const trialExpired = checkExpired(user?.subscriptionTier, trialExpiresAt, user?.createdAt ?? null);
      res.json({
        tier: user?.subscriptionTier || "free",
        status: trialExpired ? "trial_expired" : (user?.subscriptionStatus || "inactive"),
        entitlementType: user?.entitlementType,
        expiresAt: user?.entitlementExpiresAt,
        trialExpiresAt: trialExpiresAt?.toISOString().split("T")[0] ?? null,
        trialExpired,
      });
    } catch (error: any) {
      console.error("Get subscription status error:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // ── Current month usage + tier limits ─────────────────────────────────────
  // Returns how much of each capped feature the user has consumed this month,
  // what their tier limits are, and how much remains.
  app.get("/api/usage/current", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      const usageData = await getUsageWithLimits(
        req.user!.userId,
        user?.subscriptionTier,
        user?.trialExpiresAt ?? null,
        user?.createdAt ?? null
      );
      res.json(usageData);
    } catch (error: any) {
      console.error("[Usage] GET /api/usage/current error:", error);
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });

  // ── Feature Availability Check ──────────────────────────────────────────
  // Used by mobile app to determine if user can access a feature before showing setup screens
  
  app.get("/api/features/:featureName/available", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { featureName } = req.params;
      const userId = req.user!.userId;
      const user = await storage.getUser(userId);
      
      // Validate feature name
      const validFeatures = ["trainingPlansGenerated", "routesGenerated", "postRunAnalyses", "aiCoachingKm"];
      if (!validFeatures.includes(featureName)) {
        return res.status(400).json({ 
          error: "Invalid feature name",
          isAvailable: true // Default to allowing if invalid
        });
      }
      
      // ── Check for active promo codes FIRST (highest priority) ──
      const { hasUnlimitedGrant } = await import("./coupon-service");
      const hasPromoUnlimited = await hasUnlimitedGrant(userId, featureName);
      if (hasPromoUnlimited) {
        const renewalDate = new Date();
        renewalDate.setMonth(renewalDate.getMonth() + 1);
        return res.json({
          isAvailable: true,
          remaining: null,
          limit: null,
          used: 0,
          renewalDate: renewalDate.toISOString(),
          isUnlimited: true,
          message: `🎁 You have unlimited ${featureName} from your promo code`,
          grantedBy: "promo_code"
        });
      }
      
      // Get current usage (if not already unlimited via promo)
      const usageData = await getUsageWithLimits(userId, user?.subscriptionTier);
      
      // Extract relevant data for this feature
      const used = usageData.usage[featureName as keyof typeof usageData.usage] || 0;
      const limit = usageData.limits[featureName as keyof typeof usageData.limits];
      const remaining = usageData.remaining[featureName as keyof typeof usageData.remaining];
      
      // Determine if available
      const isUnlimited = limit === null;
      const isAvailable = isUnlimited || (remaining !== null && remaining > 0);
      
      // Get renewal date (start of next month)
      const [year, month] = usageData.yearMonth.split("-");
      const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const renewalDate = new Date(nextYear, nextMonth - 1, 1).toISOString();
      
      res.json({
        isAvailable,
        remaining: remaining === null ? null : Math.max(0, remaining),
        limit: limit === null ? null : limit,
        used,
        renewalDate,
        isUnlimited,
        message: isUnlimited 
          ? `You have unlimited ${featureName}`
          : isAvailable
          ? `You have ${remaining} of ${limit} ${featureName} remaining this month`
          : `You've reached your limit of ${limit} ${featureName} this month`
      });
    } catch (error: any) {
      console.error("[Features] GET /api/features/:featureName/available error:", error);
      // On error, default to allowing access (don't block users)
      res.json({
        isAvailable: true,
        remaining: null,
        limit: null,
        used: 0,
        isUnlimited: true,
        message: "Unable to verify limits, access granted"
      });
    }
  });

  // ==================== PROMO CODES ====================

  app.post("/api/promo-codes/redeem", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Promo code is required" });
      }

      const { redeemPromoCode } = await import("./coupon-service");
      const result = await redeemPromoCode(req.user!.userId, code);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("[PromoCode] POST /api/promo-codes/redeem error:", error);
      res.status(500).json({ error: "Failed to redeem promo code" });
    }
  });

  app.get("/api/promo-codes/active-grants", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getUserActiveGrants } = await import("./coupon-service");
      const grants = await getUserActiveGrants(req.user!.userId);
      res.json({ grants });
    } catch (error: any) {
      console.error("[PromoCode] GET /api/promo-codes/active-grants error:", error);
      res.status(500).json({ error: "Failed to fetch active grants" });
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

      console.log(`🔌 Disconnect request for device: ${deviceId}, user: ${req.user!.userId}`);
      
      // First try direct DB lookup by ID
      let device = await storage.getConnectedDevice(deviceId);
      
      // If not found, try finding by matching user's devices (handles type mismatches)
      if (!device) {
        const devices = await storage.getConnectedDevices(req.user!.userId);
        // Use loose equality (==) to handle numeric ID "5" vs 5 type mismatches
        device = devices.find(d => String(d.id) === String(deviceId)) || undefined;
        console.log(`🔍 Fallback search found: ${device ? device.id : 'nothing'}, checked ${devices.length} devices: [${devices.map(d => `${d.id}(${typeof d.id})`).join(', ')}]`);
      }
      
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      
      // Verify device belongs to user
      if (device.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Delete (deactivate) the device
      await storage.deleteConnectedDevice(String(device.id));

      // If it's a Garmin device, deactivate ALL garmin records for this user (handles
      // stale duplicate records where the app may have picked the wrong device ID)
      if (device.deviceType === 'garmin') {
        const { disconnectDevice } = await import('./garmin-permissions-service');
        await disconnectDevice(req.user!.userId);
      }
      
      console.log(`✅ Device ${device.id} (${device.deviceType}) disconnected for user ${req.user!.userId}`);
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
      
      // Generate a secure random state (UUID-like) for server-side storage
      const state = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}`;
      // Generate a simple nonce for PKCE verifier lookup (avoids URL encoding issues)
      const nonce = Date.now().toString() + Math.random().toString(36).substring(2, 10);
      
      // Build a consistent redirect URI using SITE_URL env var (set on Replit to https://airuncoach.live)
      // This MUST match exactly what's registered in the Garmin Developer Portal
      const siteUrl = (process.env.SITE_URL || 'https://airuncoach.live').replace(/\/$/, '');
      const redirectUri = `${siteUrl}/api/auth/garmin/callback`;
      
      // Store state server-side with 10-minute expiration
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await storage.createOauthState({
        state,
        userId: req.user!.userId,
        provider: 'garmin',
        appRedirect,
        historyDays,
        nonce,
        expiresAt,
      });
      
      console.log("[Garmin OAuth] Redirect URI:", redirectUri);
      console.log("[Garmin OAuth] App redirect:", appRedirect);

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
      const { code, state } = req.query;
      const errorParam = req.query.error;
      
      let appRedirectUrl = 'airuncoach://connected-devices';
      let userId = '';
      let historyDays = 30;
      let nonce = '';
      let oauthStateRecord = null;
      
      // Validate state parameter — atomically claim it so concurrent duplicate callbacks
      // (a known Garmin behaviour where two requests arrive for the same callback) cannot
      // both proceed to the token exchange, which would fail the second one with an
      // "invalid code" error from Garmin since each code is single-use.
      if (state) {
        try {
          // claimOauthState does DELETE ... RETURNING — only ONE concurrent request wins
          oauthStateRecord = await storage.claimOauthState(state as string);
          
          if (!oauthStateRecord) {
            console.warn("[SECURITY] Garmin callback - state not found, expired, or already claimed by a concurrent request:", state);
            // The other concurrent callback already claimed and will complete the flow — silently ignore this one
            return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Connecting...</title><script>window.location.href='${appRedirectUrl}?garmin=success';</script></head><body>Garmin connected. Redirecting...</body></html>`);
          }
          
          // Check if state has expired
          if (new Date() > new Date(oauthStateRecord.expiresAt)) {
            console.error("[SECURITY] Garmin callback - state expired:", { state, expiredAt: oauthStateRecord.expiresAt });
            // State already deleted by claimOauthState
            const errorUrl = appRedirectUrl.includes('?') 
              ? `${appRedirectUrl}&garmin=error&message=state_expired`
              : `${appRedirectUrl}?garmin=error&message=state_expired`;
            return res.redirect(errorUrl);
          }
          
          // Verify this is a Garmin OAuth state
          if (oauthStateRecord.provider !== 'garmin') {
            console.error("[SECURITY] Garmin callback - provider mismatch:", { state, provider: oauthStateRecord.provider });
            // State already deleted by claimOauthState
            const errorUrl = appRedirectUrl.includes('?') 
              ? `${appRedirectUrl}&garmin=error&message=invalid_provider`
              : `${appRedirectUrl}?garmin=error&message=invalid_provider`;
            return res.redirect(errorUrl);
          }
          
          // Extract data from server-side state
          userId = oauthStateRecord.userId;
          appRedirectUrl = oauthStateRecord.appRedirect || appRedirectUrl;
          historyDays = oauthStateRecord.historyDays || 30;
          nonce = oauthStateRecord.nonce || '';
          
          console.log("[SECURITY] Garmin callback - state claimed and validated:", { 
            userId, 
            provider: oauthStateRecord.provider,
            appRedirect: appRedirectUrl, 
            historyDays, 
            nonce,
            stateCreatedAt: oauthStateRecord.createdAt 
          });
        } catch (stateError) {
          console.error("[SECURITY] Garmin callback - error validating state:", stateError);
          const errorUrl = appRedirectUrl.includes('?') 
            ? `${appRedirectUrl}&garmin=error&message=state_validation_error`
            : `${appRedirectUrl}?garmin=error&message=state_validation_error`;
          return res.redirect(errorUrl);
        }
      } else {
        console.error("[SECURITY] Garmin callback - missing state parameter");
        const errorUrl = appRedirectUrl.includes('?') 
          ? `${appRedirectUrl}&garmin=error&message=missing_state`
          : `${appRedirectUrl}?garmin=error&message=missing_state`;
        return res.redirect(errorUrl);
      }
      
      if (errorParam) {
        console.error("Garmin OAuth error:", errorParam);
        await storage.deleteOauthState(state as string);
        const errorUrl = appRedirectUrl.includes('?') 
          ? `${appRedirectUrl}&garmin=error&message=${encodeURIComponent(errorParam as string)}`
          : `${appRedirectUrl}?garmin=error&message=${encodeURIComponent(errorParam as string)}`;
        return res.redirect(errorUrl);
      }
      
      // Garmin OAuth 2.0 callback: Garmin sends authorization code
      if (!code || !nonce) {
        console.error("Garmin callback - missing OAuth 2.0 params:", {
          code: !!code,
          nonce: !!nonce,
        });
        const errorUrl = appRedirectUrl.includes('?')
          ? `${appRedirectUrl}&garmin=error&message=missing_params`
          : `${appRedirectUrl}?garmin=error&message=missing_params`;
        return res.redirect(errorUrl);
      }

      const garminService = await import("./garmin-service");

      // Exchange authorization code for tokens (OAuth 2.0 PKCE flow)
      // CRITICAL: redirect_uri must match EXACTLY what was sent in the authorization request
      const siteUrl = (process.env.SITE_URL || 'https://airuncoach.live').replace(/\/$/, '');
      const redirectUri = `${siteUrl}/api/auth/garmin/callback`;
      const tokens = await garminService.exchangeGarminCode(
        code as string,
        redirectUri,
        nonce
      );
      
      // Resolve the Garmin numeric user ID — needed to match wellness webhook pushes.
      // The token exchange often includes it as `user_id`; if not, fetch it from the
      // Garmin user-profile endpoint so we always store a valid deviceId.
      let garminUserId: string | undefined = tokens.athleteId ? String(tokens.athleteId) : undefined;
      if (!garminUserId) {
        try {
          // OAuth 2.0: just pass the access token, no signature needed
          const profile = await garminService.getGarminUserProfile(tokens.accessToken);
          garminUserId = profile?.userId ? String(profile.userId) : undefined;
          if (garminUserId) {
            console.log(`[Garmin OAuth] Resolved Garmin userId from profile API: ${garminUserId}`);
          } else {
            console.warn('[Garmin OAuth] Could not resolve Garmin userId from token or profile — webhook matching will use single-device fallback');
          }
        } catch (profileErr: any) {
          console.warn('[Garmin OAuth] Profile API call failed, proceeding without Garmin userId:', profileErr.message);
        }
      }

      // Check if device already connected
      const existingDevices = await storage.getConnectedDevices(userId);
      const existingGarmin = existingDevices.find(d => d.deviceType === 'garmin' && d.isActive);
      
      // All scopes the app is approved for — mark all as granted after OAuth
      const { GARMIN_PERMISSIONS_LIST } = await import('./garmin-permissions-service');
      const allGrantedScopes = GARMIN_PERMISSIONS_LIST.map(p => p.scope).join(',');

      if (existingGarmin) {
        // Update existing device with new tokens
        await storage.updateConnectedDevice(existingGarmin.id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          deviceId: garminUserId ?? existingGarmin.deviceId,
          deviceName: 'Garmin Connect',
          isActive: true,
          grantedScopes: allGrantedScopes,
          lastSyncAt: new Date(),
        });
      } else {
        // Create new connected device
        await storage.createConnectedDevice({
          userId,
          deviceType: 'garmin',
          deviceName: 'Garmin Connect',
          deviceId: garminUserId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          isActive: true,
          grantedScopes: allGrantedScopes,
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
          
          // Request a Garmin backfill — Garmin will push historical activities to our
          // /api/garmin/webhooks/activities endpoint within a few minutes.
          await garminService.syncGarminActivities(
            userId,
            tokens.accessToken,
            startDate.toISOString(),
            endDate.toISOString()
          );
          console.log(`✅ Garmin backfill requested — historical activities will arrive via webhook shortly`);
        } catch (error: any) {
          console.error("Error in Garmin OAuth flow:", error);
          // Don't fail the connection on other errors
        }
      } else {
        console.log("⏭️ Skipping historical activity sync (historyDays = 0)");
      }
      
      // Note: OAuth state is already deleted by claimOauthState() above — no cleanup needed here

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
      // Fallback redirect - lookup state server-side if possible to get appRedirect
      let fallbackRedirect = 'airuncoach://connected-devices';
      try {
        const { state } = req.query;
        if (state) {
          const stateRecord = await storage.getOauthState(state as string);
          if (stateRecord) {
            fallbackRedirect = stateRecord.appRedirect || fallbackRedirect;
            // Clean up the failed state
            await storage.deleteOauthState(state as string);
          }
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
      const now = new Date();
      
      const activities = await garminService.getGarminActivities(accessToken, thirtyDaysAgo, now);
      
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
  // Check Garmin connection status (for iOS app compatibility)
  app.get("/api/garmin/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const garminDevice = devices.find(d => d.deviceType === 'garmin' && d.isActive);
      
      res.json({
        connected: !!garminDevice,
        hasAccessToken: !!garminDevice?.accessToken,
        lastSyncAt: garminDevice?.lastSyncAt || null,
        deviceInfo: garminDevice ? {
          id: garminDevice.id,
          displayName: garminDevice.displayName,
        } : null,
      });
    } catch (error: any) {
      console.error("Garmin status check error:", error);
      res.status(500).json({ error: "Failed to check Garmin status" });
    }
  });

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
        paceData: detailedMetricsFromEnrich.paceData,
        heartRateData: detailedMetricsFromEnrich.heartRateData,
        kmSplits: detailedMetricsFromEnrich.kmSplits,
        gpsTrack: detailedMetricsFromEnrich.gpsTrack,
        elevationProfile: detailedMetricsFromEnrich.elevationProfile,
        
        rawData: activityDetail,
      });

      res.json({ success: true, run, activity: parsed });
    } catch (error: any) {
      console.error("Garmin import activity error:", error);
      res.status(500).json({ error: "Failed to import Garmin activity" });
    }
  });

        // Enrich an existing AI Run Coach run record with Garmin data
  app.post("/api/runs/:runId/enrich-with-garmin-data", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId } = req.params;

      // 1. Validate that Garmin is connected
      const devices = await storage.getConnectedDevices(req.user!.userId);
      const garminDevice = devices.find(d => d.deviceType === 'garmin' && d.isActive);

      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }

      // 2. Get the run from the database
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }

      // Verify the run belongs to the authenticated user
      if (run.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Not authorized to modify this run" });
      }

      // Check if already enriched with Garmin data
      if (run.hasGarminData) {
        return res.status(400).json({ error: "Run already enriched with Garmin data" });
      }

      // 3. Refresh Garmin token if needed before calling API
      const garminService = await import("./garmin-service");
      
      let accessToken = garminDevice.accessToken;
      let refreshToken = garminDevice.refreshToken;
      
      // Check if token needs refresh (try refresh preemptively to avoid 401 errors)
      if (refreshToken) {
        try {
          console.log("🔄 Refreshing Garmin access token before enrichment...");
          const refreshedTokens = await garminService.refreshGarminToken(refreshToken);
          accessToken = refreshedTokens.accessToken;
          refreshToken = refreshedTokens.refreshToken;
          
          // Update the device with new tokens
          await storage.updateConnectedDevice(garminDevice.id, {
            accessToken: refreshedTokens.accessToken,
            refreshToken: refreshedTokens.refreshToken,
          });
          console.log("✅ Garmin token refreshed successfully");
        } catch (refreshError: any) {
          // Check if refresh token itself is invalid — user must reconnect Garmin
          const isInvalidGrant = refreshError.message?.includes('invalid_grant') ||
                                  refreshError.message?.includes('Invalid refresh token') ||
                                  refreshError.message?.includes('400');
          if (isInvalidGrant) {
            console.error("❌ Garmin refresh token is invalid — marking device as inactive, user must reconnect");
            await storage.updateConnectedDevice(garminDevice.id, { isActive: false });
            return res.status(401).json({
              error: "garmin_reconnect_required",
              message: "Your Garmin connection has expired. Please reconnect Garmin in Settings to sync your data."
            });
          }
          console.warn("⚠️ Failed to refresh Garmin token, attempting with current token:", refreshError.message);
          // Continue with current token — may still work if it hasn't expired yet
        }
      }

      // ── Match strategy ─────────────────────────────────────────────────────
      // Match Garmin activity to AI Run Coach run by comparing START TIMES.
      // The watch's startTimeInSeconds is much more reliable than the webhook
      // arrival time (which can be hours later).
      // 
      // Search window: ±30 minutes from the AI run's creation time
      // This handles normal timezone differences and clock skew while being
      // specific enough to avoid false matches.
      // ───────────────────────────────────────────────────────────────────────
      const THIRTY_MINS_S = 30 * 60;
      const runStartTimeMs = run.createdAt?.getTime() || Date.now();
      const runStartTimeSec = Math.floor(runStartTimeMs / 1000);

      const searchStartSec = runStartTimeSec - THIRTY_MINS_S;
      const searchEndSec   = runStartTimeSec + THIRTY_MINS_S;

      console.log(`[Garmin Enrich] 🔍 Matching Garmin activity by START TIME (±30 mins)`);
      console.log(`[Garmin Enrich]    AI run start time: ${new Date(runStartTimeMs).toISOString()}`);
      console.log(`[Garmin Enrich]    Search window: ${new Date(searchStartSec * 1000).toISOString()} to ${new Date(searchEndSec * 1000).toISOString()}`);

      // 4a. Look in our local DB first (activities pushed by Garmin webhook)
      let localActivity = await db.query.garminActivities.findFirst({
        where: (a, { and, eq, gte, lte }) => and(
          eq(a.userId, req.user!.userId),
          gte(a.startTimeInSeconds, searchStartSec),
          lte(a.startTimeInSeconds, searchEndSec)
        ),
      });

      let matchingActivity: any = null;
      let matchingActivityId: string | null = null;
      let activityDetail: any = null;

      if (localActivity) {
        console.log(`[Garmin Enrich] ✅ Found matching activity in local DB!`);
        console.log(`[Garmin Enrich]    Activity ID: ${localActivity.garminActivityId}`);
        console.log(`[Garmin Enrich]    Started at: ${new Date(localActivity.startTimeInSeconds * 1000).toISOString()}`);
        console.log(`[Garmin Enrich]    Distance: ${localActivity.distanceInMeters}m, Duration: ${localActivity.durationInSeconds}s`);
        matchingActivityId = localActivity.garminActivityId;
        matchingActivity = localActivity;
        // Use stored data directly as the "detail" — map field names
        activityDetail = {
          activityId: localActivity.garminActivityId,
          activityName: localActivity.activityName,
          startTimeInSeconds: localActivity.startTimeInSeconds,
          durationInSeconds: localActivity.durationInSeconds,
          distanceInMeters: localActivity.distanceInMeters,
          averageHeartRateInBeatsPerMinute: localActivity.averageHeartRateInBeatsPerMinute,
          maxHeartRateInBeatsPerMinute: localActivity.maxHeartRateInBeatsPerMinute,
          averageSpeedInMetersPerSecond: localActivity.averageSpeedInMetersPerSecond,
          maxSpeedInMetersPerSecond: localActivity.maxSpeedInMetersPerSecond,
          averageRunCadenceInStepsPerMinute: localActivity.averageRunCadenceInStepsPerMinute,
          maxRunCadenceInStepsPerMinute: localActivity.maxRunCadenceInStepsPerMinute,
          averageStrideLength: localActivity.averageStrideLength,
          totalElevationGainInMeters: localActivity.totalElevationGainInMeters,
          totalElevationLossInMeters: localActivity.totalElevationLossInMeters,
          minElevationInMeters: localActivity.minElevationInMeters,
          maxElevationInMeters: localActivity.maxElevationInMeters,
          activeKilocalories: localActivity.activeKilocalories,
          aerobicTrainingEffect: localActivity.aerobicTrainingEffect,
          anaerobicTrainingEffect: localActivity.anaerobicTrainingEffect,
          trainingEffectLabel: localActivity.trainingEffectLabel,
          vo2Max: localActivity.vo2Max,
          recoveryTimeInMinutes: localActivity.recoveryTimeInMinutes,
          heartRateZones: localActivity.heartRateZones,
          laps: localActivity.laps,
          splits: localActivity.splits,
          samples: localActivity.samples,
          groundContactTime: localActivity.groundContactTime,
          groundContactBalance: localActivity.groundContactBalance,
          verticalOscillation: localActivity.verticalOscillation,
          verticalRatio: localActivity.verticalRatio,
          averagePowerInWatts: localActivity.averagePowerInWatts,
          maxPowerInWatts: localActivity.maxPowerInWatts,
        };
      } else {
        // 4b. No local activity found — Garmin does not support direct pull.
        // The activity will arrive via the /api/garmin/webhooks/activities webhook
        // once the user syncs the Garmin Connect app. Return 202 to prompt polling.
        console.log(`[Garmin Enrich] No local activity found — waiting for Garmin webhook push`);
      }

      if (!matchingActivity || !matchingActivityId || !activityDetail) {
        // Data not yet received from Garmin — return 202 Accepted so the
        // client knows to poll again rather than treating this as an error.
        return res.status(202).json({
          status: "pending",
          message: "Waiting for Garmin to sync. Your watch data usually arrives within 1–2 minutes of syncing the Garmin Connect app."
        });
      }

      // 5. Parse the activity
      const parsed = garminService.parseGarminActivity(activityDetail);

      // Extended metrics from raw data
      const raw = activityDetail;

      // 7. Update the run record with the enriched data
      const updateData = {
        // Core metrics
        distance: parsed.distance,
        duration: parsed.duration,
        avgPace: parsed.averagePace ? `${Math.floor(parsed.averagePace)}:${Math.round((parsed.averagePace % 1) * 60).toString().padStart(2, '0')}` : run.avgPace,
        avgHeartRate: parsed.averageHeartRate,
        maxHeartRate: parsed.maxHeartRate,
        calories: parsed.calories,
        cadence: parsed.averageCadence,
        elevationGain: parsed.elevationGain,

        // Extended metrics from raw Garmin data (if available)
        avgSpeed: raw.averageSpeedInMetersPerSecond,
        maxSpeed: raw.maxSpeedInMetersPerSecond,
        movingTime: raw.movingDurationInSeconds,
        elapsedTime: raw.durationInSeconds,
        maxCadence: raw.maxRunCadenceInStepsPerMinute,
        avgStrideLength: parsed.runningDynamics?.strideLength,
        minElevation: raw.minElevationInMeters,
        maxElevation: raw.maxElevationInMeters,

        // GPS track — always preserve the existing phone-recorded GPS array.
        // Garmin's encoded polyline is stored in a separate field on activityDetail
        // and cannot be directly used by Android (it expects a lat/lng array).
        // Overwriting a good array with { polyline: "..." } was the root cause of
        // GPS data appearing to vanish after linking Garmin Connect.
        gpsTrack: run.gpsTrack,

        // Garmin tracking fields
        hasGarminData: true,
        garminActivityId: matchingActivityId,
        externalId: matchingActivityId,
        externalSource: 'garmin',

        // Update timestamp
        updatedAt: new Date(),
      };

      const updatedRun = await storage.updateRun(runId, updateData);

      // Store device data with the run
      await storage.createDeviceData({
        userId: req.user!.userId,
        runId: runId,
        deviceType: 'garmin',
        activityId: matchingActivityId,
        vo2Max: parsed.vo2Max,
        trainingEffect: parsed.trainingEffect,
        recoveryTime: parsed.recoveryTime ? parsed.recoveryTime * 60 : undefined,
        caloriesBurned: parsed.calories,
        rawData: activityDetail,
      });

      // 8. Return success status and the enriched run
      res.json({
        success: true,
        message: "Run enriched with Garmin data successfully",
        run: updatedRun,
        garminActivity: {
          activityId: matchingActivityId,
          activityName: matchingActivity.activityName || activityDetail.activityName,
          startTime: matchingActivity.startTime || (matchingActivity.startTimeInSeconds
            ? new Date(matchingActivity.startTimeInSeconds * 1000).toISOString()
            : null),
        }
      });

      // Re-assess training plans only if no coaching insight exists yet.
      // Garmin enrichment adds meaningful HR + training-effect data that wasn't
      // available at run-save time, so a fresh assessment makes sense — but only
      // once, not on every enrichment retry.
      const enrichedRun = updatedRun as any;
      if (!enrichedRun?.coachingInsight) {
        setImmediate(() => {
          (async () => {
            try {
              console.log(`[Run] Triggering plan reassessment for run ${runId} (post Garmin enrich)`);
              await reassessTrainingPlansWithRunData(req.user!.userId, runId);
            } catch (err) {
              console.error("[Run] Plan reassessment failed:", err);
            }
          })();
        });
      } else {
        console.log(`[Run] Skipping plan reassessment for run ${runId} — insight already exists`);
      }
    } catch (error: any) {
      console.error("Garmin enrich run error:", error);
      // Detect expired/invalid token — tell client to reconnect rather than generic 500
      if (error.message?.includes('401') || error.message?.includes('Token is not active')) {
        return res.status(401).json({
          error: "garmin_reconnect_required",
          message: "Your Garmin connection has expired. Please reconnect Garmin in Settings to sync your data."
        });
      }
      res.status(500).json({ error: "Failed to enrich run with Garmin data" });
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

  // ==================== GARMIN PERMISSIONS MANAGEMENT ====================

  /**
   * GET /api/garmin/permissions
   * Get current Garmin permissions for the authenticated user
   */
  app.get("/api/garmin/permissions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getCurrentPermissions } = await import('./garmin-permissions-service');
      const permissions = await getCurrentPermissions(req.user!.userId);
      res.json(permissions);
    } catch (error: any) {
      console.error('Get permissions error:', error);
      res.status(500).json({ error: 'Failed to get permissions' });
    }
  });

  /**
   * POST /api/garmin/reauthorize
   * Get Garmin OAuth URL for re-authorization with updated scopes
   */
  app.post("/api/garmin/reauthorize", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getReauthorizationUrl } = await import('./garmin-permissions-service');
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const authUrl = await getReauthorizationUrl(req.user!.userId, baseUrl);
      res.json({ authUrl });
    } catch (error: any) {
      console.error('Reauthorize error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/garmin/disconnect
   * Disconnect Garmin device and stop receiving data
   */
  app.post("/api/garmin/disconnect", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { disconnectDevice } = await import('./garmin-permissions-service');
      await disconnectDevice(req.user!.userId);
      res.json({ success: true, message: 'Device disconnected' });
    } catch (error: any) {
      console.error('Disconnect error:', error);
      res.status(500).json({ error: error.message });
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
  //
  // IMPORTANT: Routes are mounted at BOTH /api/garmin/webhook/* (singular)
  // AND /api/garmin/webhooks/* (plural) because the Garmin developer portal
  // was configured with "webhooks" (plural) for some endpoints.
  // ==========================================

  // Helper to register a handler on both singular and plural webhook paths
  const garminWebhook = (path: string, handler: (req: Request, res: Response) => Promise<any>) => {
    app.post(`/api/garmin/webhook/${path}`, handler);
    app.post(`/api/garmin/webhooks/${path}`, handler);
  };

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

  /**
   * Resolve which app user a Garmin wellness webhook belongs to.
   *
   * Priority order:
   *  1. payload.userId  → numeric Garmin user ID stored in connected_devices.device_id
   *  2. Single-device fallback — if only one Garmin account is connected it must be theirs
   *
   * The old date+run matching is intentionally removed: it silently fails on rest
   * days (the most common case that triggered the "Cannot map to user" warning).
   */


  // ACTIVITY - Activities (when user completes a run/walk)
  // Enhanced with comprehensive logging, notifications, and webhook event tracking
  garminWebhook("activities", async (req: Request, res: Response) => {
    const eventIds: string[] = [];
    
    try {
      console.log('[Garmin Webhook] Received activities push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process activities asynchronously (non-blocking)
      const activities = req.body.activities || [];
      
      if (activities.length === 0) {
        console.log('[Garmin Webhook] No activities in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${activities.length} activities`);
      
      for (const activity of activities) {
        let webhookEventId: string | null = null;
        
        try {
          // Determine user - handle both access token and direct user ID lookup
          const userAccessToken = activity.userAccessToken;
          let device;
          
          if (userAccessToken) {
            device = await findUserByGarminToken(userAccessToken);
          } else if (activity.userId) {
            // Fallback: lookup by Garmin user ID if access token not provided
            device = await db.query.connectedDevices.findFirst({
              where: (d, { and, eq }) => and(
                eq(d.deviceType, 'garmin'),
                eq(d.deviceId, activity.userId)
              ),
            });
          }
          
          // Create initial webhook event log entry
          const activityType = (activity.activityType || 'RUNNING').toUpperCase();
          const isRunOrWalk = [
            'RUNNING', 'WALKING', 'TRAIL_RUNNING', 'TREADMILL_RUNNING', 
            'INDOOR_WALKING', 'WHEELCHAIR_PUSH_WALK', 'WHEELCHAIR_PUSH_RUN',
            'INDOOR_RUNNING', 'TRAIL_WALK', 'OUTDOOR_WALK'
          ].includes(activityType);
          
          const webhookEvent = await storage.createGarminWebhookEvent({
            webhookType: 'activities',
            activityId: String(activity.activityId),
            userId: device?.userId,
            deviceId: activity.userId,
            status: 'received',
            activityType: activityType,
            distanceInMeters: activity.distanceInMeters,
            durationInSeconds: activity.durationInSeconds,
            rawPayload: activity,
            isProcessed: false,
          });
          webhookEventId = webhookEvent.id;
          eventIds.push(webhookEventId);
          
          if (!device) {
            console.warn(`⚠️ [Garmin Webhook] Could not map activity ${activity.activityId} to user (userId: ${activity.userId}, hasToken: ${!!userAccessToken})`);
            
            // Update webhook event with failure
            await storage.updateGarminWebhookEvent(webhookEventId, {
              status: 'failed',
              errorMessage: 'User not found for activity',
              isProcessed: true,
              processedAt: new Date(),
            });
            
            // Queue for retry if user not found
            await db.insert(webhookFailureQueue).values({
              webhookType: 'activities',
              payload: activity,
              error: 'User not found for activity',
              nextRetryAt: new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 minutes
            });
            continue;
          }
          
          console.log(`[Garmin Webhook] Processing activity for user ${device.userId}: ${activity.activityName || activityType} (type: ${activityType})`);
          
          // Update webhook event with user info
          await storage.updateGarminWebhookEvent(webhookEventId, {
            userId: device.userId,
          });
          
          // Store full activity in garmin_activities table with all available fields
          const [garminActivity] = await db.insert(garminActivities).values({
            userId: device.userId,
            garminActivityId: String(activity.activityId),
            summaryId: activity.summaryId,
            activityName: activity.activityName,
            activityDescription: activity.activityDescription,
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
            averagePushCadenceInPushesPerMinute: activity.averagePushCadenceInPushesPerMinute,
            maxPushCadenceInPushesPerMinute: activity.maxPushCadenceInPushesPerMinute,
            pushes: activity.pushes,
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
            userAccessToken: userAccessToken,
            rawData: activity,
          }).returning();
          
          // If it's a run/walk, process for merging or create new run record
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

            // Extract detailed metrics from Garmin activity
            // This includes pace data, HR data, GPS track, and km splits
            const detailedMetrics = buildDetailedMetricsFromGarminActivity(activity);

            // FUZZY MATCH: Try to find existing AiRunCoach run to merge with
            const mergeCandidate = await fuzzyMatchGarminToAiRunCoachRun(
              {
                id: garminActivity.id,
                userId: device.userId,
                activityType: activityType,
                startTimeInSeconds: activity.startTimeInSeconds,
                durationInSeconds: durationSeconds,
                distanceInMeters: activity.distanceInMeters,
                averageHeartRateInBeatsPerMinute: activity.averageHeartRateInBeatsPerMinute,
                maxHeartRateInBeatsPerMinute: activity.maxHeartRateInBeatsPerMinute,
                averageSpeedInMetersPerSecond: activity.averageSpeedInMetersPerSecond,
                maxSpeedInMetersPerSecond: activity.maxSpeedInMetersPerSecond,
                averagePaceInMinutesPerKilometer: activity.averagePaceInMinutesPerKilometer,
                totalElevationGainInMeters: activity.totalElevationGainInMeters,
                totalElevationLossInMeters: activity.totalElevationLossInMeters,
                activeKilocalories: activity.activeKilocalories,
                deviceName: activity.deviceName,
                summaryId: activity.summaryId,
              } as any,
              device.userId
            );

            let runId: string;
            let notificationType: 'new_activity' | 'run_enriched' | null = null;
            let matchScore: number | undefined;

            if (mergeCandidate && mergeCandidate.matchScore > 50) {
              // MERGE: Enhance existing run with Garmin data
              console.log(`[Garmin Webhook] 🔗 Fuzzy matched to existing run ${mergeCandidate.aiRunCoachRunId}`);
              console.log(`   Match confidence: ${mergeCandidate.matchScore}% - ${mergeCandidate.matchReasons.join(", ")}`);
              
              // Merge Garmin data into existing run
              await mergeGarminActivityWithAiRunCoachRun(
                mergeCandidate.aiRunCoachRunId,
                {
                  id: garminActivity.id,
                  userId: device.userId,
                  activityType: activityType,
                  startTimeInSeconds: activity.startTimeInSeconds,
                  durationInSeconds: durationSeconds,
                  distanceInMeters: activity.distanceInMeters,
                  averageHeartRateInBeatsPerMinute: activity.averageHeartRateInBeatsPerMinute,
                  maxHeartRateInBeatsPerMinute: activity.maxHeartRateInBeatsPerMinute,
                  averageSpeedInMetersPerSecond: activity.averageSpeedInMetersPerSecond,
                  maxSpeedInMetersPerSecond: activity.maxSpeedInMetersPerSecond,
                  averagePaceInMinutesPerKilometer: activity.averagePaceInMinutesPerKilometer,
                  totalElevationGainInMeters: activity.totalElevationGainInMeters,
                  totalElevationLossInMeters: activity.totalElevationLossInMeters,
                  activeKilocalories: activity.activeKilocalories,
                  deviceName: activity.deviceName,
                  summaryId: activity.summaryId,
                } as any,
                mergeCandidate,
                device.userId
              );

              runId = mergeCandidate.aiRunCoachRunId;
              matchScore = mergeCandidate.matchScore;
              notificationType = 'run_enriched';
              
              // Update webhook event
              await storage.updateGarminWebhookEvent(webhookEventId, {
                status: 'merged_run',
                matchScore: mergeCandidate.matchScore,
                matchedRunId: mergeCandidate.aiRunCoachRunId,
                newRunId: null,
                isProcessed: true,
                processedAt: new Date(),
              });
              
              console.log(`✅ [Garmin Webhook] Merged Garmin activity with existing run`);

            } else {
              // CREATE: No match found, create new run record
              console.log(`[Garmin Webhook] ➕ No matching run found, creating new record`);
              
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
                difficulty: activityType === 'TRAIL_RUNNING' || activityType === 'TRAIL_WALK' ? 'hard' : 'moderate',
                startLat: activity.startingLatitudeInDegree,
                startLng: activity.startingLongitudeInDegree,
                name: activity.activityName || `${activityType.replace(/_/g, ' ')} from Garmin`,
                runDate: startTime.toISOString().split('T')[0],
                runTime: startTime.toTimeString().split(' ')[0].slice(0, 5),
                completedAt: startTime,
                externalId: String(activity.activityId),
                externalSource: 'garmin',
                terrainType: determineTerrain(activityType),
                isPublic: false,
                hasGarminData: true,
                garminActivityId: String(activity.activityId),
                garminSummaryId: activity.summaryId,
                
                // Detailed metrics from Garmin
                paceData: detailedMetrics.paceData,
                heartRateData: detailedMetrics.heartRateData,
                kmSplits: detailedMetrics.kmSplits,
                gpsTrack: detailedMetrics.gpsTrack,
                elevationProfile: detailedMetrics.elevationProfile,
              }).returning();

              runId = newRun.id;
              notificationType = 'new_activity';
              
              // Update webhook event
              await storage.updateGarminWebhookEvent(webhookEventId, {
                status: 'created_run',
                matchScore: mergeCandidate?.matchScore || 0,
                newRunId: newRun.id,
                isProcessed: true,
                processedAt: new Date(),
              });
              
              console.log(`[Garmin Webhook] Created new run record ${newRun.id} from Garmin activity ${activity.activityId}`);
            }
            
            // Link the Garmin activity to the run
            await db.update(garminActivities)
              .set({ runId, isProcessed: true })
              .where(eq(garminActivities.id, garminActivity.id));
            
            // Update user stats cache (personal bests, all-time stats)
            // This triggers a full recompute of PBs including any new splits from Garmin data
            try {
              const runForCache = await db.query.runs.findFirst({
                where: (r, { eq }) => eq(r.id, runId),
              });
              if (runForCache) {
                onRunSaved(device.userId, runForCache).catch(err =>
                  console.error('[Garmin Webhook] onRunSaved failed:', err)
                );
              }
            } catch (cacheErr) {
              console.error('[Garmin Webhook] Error updating stats cache:', cacheErr);
            }
            
            // Send notification to user
            if (notificationType) {
              try {
                const notificationResult = await sendActivityNotification(
                  device.userId,
                  activity,
                  notificationType,
                  runId,
                  matchScore
                );
                
                // Update webhook event with notification status
                await storage.updateGarminWebhookEvent(webhookEventId, {
                  notificationSent: notificationResult.inAppSent || notificationResult.pushSent,
                  notificationType: notificationType,
                });
                
                console.log(`[Garmin Webhook] Notification sent: ${notificationType} (inApp: ${notificationResult.inAppSent}, push: ${notificationResult.pushSent})`);
              } catch (notifyError) {
                console.error(`[Garmin Webhook] Failed to send notification:`, notifyError);
              }
            }
            
            // ── Auto-complete linked coaching plan session ────────────────────
            // Two-tier matching strategy:
            //
            // Tier 1 — Companion session (explicit link):
            //   If the iOS/web app stored a plannedWorkoutId on the companion session
            //   (by passing it in the session/start payload), use that to mark the
            //   exact workout as Done.  This is the most precise match.
            //
            // Tier 2 — Date-based matching (implicit link):
            //   For watch-only runs (e.g., Garmin-started without the phone app
            //   storing a workoutId), match against any single un-completed, non-rest
            //   planned workout for the user's active plans that is scheduled for the
            //   same calendar date as the run.  This covers the common case where the
            //   user runs their scheduled session entirely on the watch.
            setImmediate(() => {
              (async () => {
                try {
                  const activityStartMs = (activity.startTimeInSeconds || 0) * 1000;
                  const activityStartDate = new Date(activityStartMs);

                  // ── Tier 1: companion session lookup ──────────────────────────
                  const windowMs = 10 * 60 * 1000; // ±10 min tolerance
                  const windowStart = new Date(activityStartMs - windowMs);
                  const windowEnd   = new Date(activityStartMs + windowMs);

                  const [matchedSession] = await db
                    .select()
                    .from(garminCompanionSessions)
                    .where(
                      and(
                        eq(garminCompanionSessions.userId, device.userId),
                        isNotNull(garminCompanionSessions.plannedWorkoutId),
                        gte(garminCompanionSessions.startedAt, windowStart),
                        lte(garminCompanionSessions.startedAt, windowEnd)
                      )
                    )
                    .orderBy(sql`ABS(EXTRACT(EPOCH FROM (started_at - ${activityStartDate.toISOString()}::timestamptz)))`)
                    .limit(1);

                  if (matchedSession?.plannedWorkoutId) {
                    const [workout] = await db
                      .select()
                      .from(plannedWorkouts)
                      .where(eq(plannedWorkouts.id, matchedSession.plannedWorkoutId))
                      .limit(1);

                    if (workout && !workout.isCompleted) {
                      await db.update(plannedWorkouts)
                        .set({ isCompleted: true, completedRunId: runId })
                        .where(eq(plannedWorkouts.id, matchedSession.plannedWorkoutId));
                      console.log(`✅ [Garmin Webhook] Tier-1: auto-completed planned workout ${matchedSession.plannedWorkoutId} via companion session for run ${runId}`);
                      return; // Done — no need for Tier-2 lookup
                    } else if (workout?.isCompleted) {
                      console.log(`[Garmin Webhook] Planned workout ${matchedSession.plannedWorkoutId} already completed — skipping`);
                      return;
                    }
                  }

                  // ── Tier 2: date-based matching ───────────────────────────────
                  // Build a YYYY-MM-DD string in the local time offset sent by the watch.
                  // Garmin provides startTimeOffsetInSeconds (UTC offset at activity location).
                  const tzOffsetMs = (activity.startTimeOffsetInSeconds || 0) * 1000;
                  const localMs = activityStartMs + tzOffsetMs;
                  const localDate = new Date(localMs);
                  const runDateStr = localDate.toISOString().split('T')[0]; // YYYY-MM-DD

                  // Find the user's active training plans
                  const activePlans = await db
                    .select({ id: trainingPlans.id })
                    .from(trainingPlans)
                    .where(
                      and(
                        eq(trainingPlans.userId, device.userId),
                        eq(trainingPlans.status, 'active')
                      )
                    );

                  if (activePlans.length === 0) {
                    console.log(`[Garmin Webhook] No active plans — skipping date-based workout match`);
                    return;
                  }

                  const planIds = activePlans.map(p => p.id);

                  // Look for non-rest, non-completed workouts scheduled for today
                  const candidates = await db
                    .select()
                    .from(plannedWorkouts)
                    .where(
                      and(
                        // Must belong to one of the user's active plans
                        sql`${plannedWorkouts.trainingPlanId} = ANY(ARRAY[${sql.join(planIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
                        eq(plannedWorkouts.scheduledDate, runDateStr),
                        eq(plannedWorkouts.isCompleted, false),
                        // Exclude rest days — they shouldn't be auto-completed by a run
                        sql`LOWER(COALESCE(${plannedWorkouts.workoutType}, '')) NOT IN ('rest', 'off', 'cross_training')`
                      )
                    );

                  if (candidates.length === 1) {
                    // Unambiguous single match — safe to auto-complete
                    const [workout] = candidates;
                    await db.update(plannedWorkouts)
                      .set({ isCompleted: true, completedRunId: runId })
                      .where(eq(plannedWorkouts.id, workout.id));
                    console.log(`✅ [Garmin Webhook] Tier-2: auto-completed planned workout ${workout.id} (scheduled ${runDateStr}) for run ${runId}`);
                  } else if (candidates.length > 1) {
                    console.log(`[Garmin Webhook] Tier-2: ${candidates.length} planned workouts on ${runDateStr} — ambiguous, skipping auto-complete`);
                  } else {
                    console.log(`[Garmin Webhook] Tier-2: no planned workout found for ${runDateStr}`);
                  }
                } catch (err) {
                  console.error("[Garmin Webhook] Failed to auto-complete planned workout:", err);
                }
              })();
            });

            // Trigger plan reassessment asynchronously.
            // For MERGED runs (run_enriched): the phone run already had reassessment
            // fired from POST /api/runs — skip to avoid duplicate GPT-4o calls and
            // redundant plan adaptations. Garmin adds HR/training-effect data, but
            // those were already present at assessment time (Garmin data often syncs
            // before the webhook arrives).
            // For NEW runs created solely from Garmin webhook (new_activity): always
            // run — this is the first and only assessment for that run.
            if (notificationType === 'new_activity') {
              setImmediate(() => {
                (async () => {
                  try {
                    console.log(`[Garmin Webhook] Triggering plan reassessment for new run ${runId}`);
                    await reassessTrainingPlansWithRunData(device.userId, runId);
                  } catch (err) {
                    console.error("[Garmin Webhook] Plan reassessment failed:", err);
                  }
                })();
              });
            } else {
              console.log(`[Garmin Webhook] Skipping plan reassessment for merged run ${runId} — already assessed at run save`);
            }
            
          } else if (!isRunOrWalk) {
            console.log(`⏭️ [Garmin Webhook] Skipping non-running activity: ${activityType}`);
            
            await storage.updateGarminWebhookEvent(webhookEventId, {
              status: 'skipped',
              errorMessage: `Non-running activity type: ${activityType}`,
              isProcessed: true,
              processedAt: new Date(),
            });
            
          } else if (activity.distanceInMeters <= 0) {
            console.log(`⏭️ [Garmin Webhook] Skipping activity with no distance: ${activity.activityId}`);
            
            await storage.updateGarminWebhookEvent(webhookEventId, {
              status: 'skipped',
              errorMessage: 'Activity has no distance',
              isProcessed: true,
              processedAt: new Date(),
            });
          }
          
        } catch (activityError: any) {
          console.error(`❌ [Garmin Webhook] Error processing activity ${activity.activityId}:`, activityError.message);
          
          // Update webhook event with failure
          if (webhookEventId) {
            await storage.updateGarminWebhookEvent(webhookEventId, {
              status: 'failed',
              errorMessage: activityError.message,
              isProcessed: true,
              processedAt: new Date(),
            }).catch(() => {}); // Ignore update errors
          }
          
          // Queue failed activity for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'activities',
            userId: activity.userId,
            payload: activity,
            error: activityError.message,
            nextRetryAt: new Date(Date.now() + 10 * 60 * 1000), // Retry in 10 minutes
          }).catch(queueError => {
            console.error(`❌ Failed to queue activity for retry:`, queueError);
          });
          // Continue processing other activities
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${activities.length} activities`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Activities handler error:', error);
      // Note: HTTP 200 already sent to Garmin, so we can't change response here
    }
  });

  // Helper function to determine terrain type from activity type
  function determineTerrain(activityType: string): string {
    const type = activityType.toUpperCase();
    if (type.includes('TRAIL')) return 'trail';
    if (type.includes('TREADMILL') || type.includes('INDOOR')) return 'treadmill';
    if (type.includes('TRACK')) return 'track';
    return 'road';
  }

  // ACTIVITY - Activity Details (detailed activity metrics with GPS/pace samples)
  // Enhanced to handle detailed activity data including time series samples
  garminWebhook("activity-details", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received activity details push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process details asynchronously (non-blocking)
      const details = req.body || [];
      
      if (!Array.isArray(details) || details.length === 0) {
        console.log('[Garmin Webhook] No activity details in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${details.length} activity detail records`);
      
      for (const detail of details) {
        try {
          // Extract nested summary
          const summary = detail.summary || detail;
          const activityId = summary.activityId || detail.activityId;
          const samples = detail.samples || [];
          
          if (!activityId) {
            console.warn('[Garmin Webhook] Activity details missing activityId');
            continue;
          }
          
          // Find user via Garmin access token (if provided)
          const userAccessToken = summary.userAccessToken || detail.userAccessToken;
          let device;
          
          if (userAccessToken) {
            device = await findUserByGarminToken(userAccessToken);
          }
          
          if (!device) {
            console.warn(`⚠️ [Garmin Webhook] Could not map activity details ${activityId} to user`);
            continue;
          }
          
          console.log(`[Garmin Webhook] Processing detailed activity ${activityId} for user ${device.userId}`);
          
          // Find existing garmin activity record
          const existingActivity = await db.query.garminActivities.findFirst({
            where: eq(garminActivities.garminActivityId, String(activityId)),
          });
          
          if (existingActivity) {
            // Update with detailed information and samples
            const processedSamples = processSamples(samples);
            
            await db
              .update(garminActivities)
              .set({
                samples: samples.length > 0 ? processedSamples : null, // Store time series
                laps: detail.laps || null,
                splits: detail.splits || null,
                isProcessed: true,
                aiAnalysisGenerated: false,
              })
              .where(eq(garminActivities.id, existingActivity.id));
            
            console.log(`[Garmin Webhook] Updated activity ${activityId} with ${samples.length} samples`);
            
            // Update runs record with additional detail data if it exists
            if (existingActivity.runId) {
              const paceData = extractPaceData(samples);
              const splits = detail.splits || null;
              
              await db
                .update(runs)
                .set({
                  paceData: paceData.length > 0 ? { samples: paceData } : null,
                  kmSplits: splits,
                })
                .where(eq(runs.id, existingActivity.runId));
              
              console.log(`[Garmin Webhook] Updated runs record ${existingActivity.runId} with detailed metrics`);
            }
          } else {
            console.warn(`[Garmin Webhook] No existing garmin_activity found for ${activityId}, skipping detail update`);
          }
          
        } catch (detailError: any) {
          console.error(`❌ [Garmin Webhook] Error processing activity detail:`, detailError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'activity-details',
            userId: device?.userId,
            payload: detail,
            error: detailError.message,
            nextRetryAt: new Date(Date.now() + 10 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue activity details for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${details.length} activity detail records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Activity details handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // Helper: Process time series samples into structured data
  function processSamples(samples: any[]): any[] {
    if (!samples || samples.length === 0) return [];
    
    return samples.map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000, // Convert to ms
      speed: sample.speedMetersPerSecond,
      distance: sample.totalDistanceInMeters,
      timerDuration: sample.timerDurationInSeconds,
      clockDuration: sample.clockDurationInSeconds,
      movingDuration: sample.movingDurationInSeconds,
    }));
  }

  // Helper: Extract pace data from samples for runs table
  function extractPaceData(samples: any[]): any[] {
    if (!samples || samples.length === 0) return [];
    
    return samples
      .filter(s => s.speedMetersPerSecond !== undefined && s.speedMetersPerSecond > 0)
      .map(sample => ({
        timestamp: (sample.startTimeInSeconds || 0) * 1000,
        speed: sample.speedMetersPerSecond,
        pace: sample.speedMetersPerSecond > 0 ? 1000 / sample.speedMetersPerSecond / 60 : null, // min/km
        distance: sample.totalDistanceInMeters,
      }));
  }

  // HEALTH - Sleeps (sleep data push)
  // HEALTH - Sleeps (detailed sleep analysis with stages, naps, SpO2)
  // Enhanced to handle complete sleep payload with naps array
  garminWebhook("sleeps", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received sleeps push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process sleep data asynchronously (non-blocking)
      const sleeps = Array.isArray(req.body) ? req.body : (req.body.sleeps || []);
      
      if (sleeps.length === 0) {
        console.log('[Garmin Webhook] No sleep data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${sleeps.length} sleep records`);
      
      // Find users
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for sleep');
        return;
      }
      
      for (const sleep of sleeps) {
        try {
          const date = sleep.calendarDate || new Date((sleep.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          
          // Use unified Garmin user resolver (handles token → userId → single-device fallback)
          const resolution = await resolveGarminUser(sleep);
          if (!resolution) {
            console.warn(`⚠️ [Garmin Webhook] Could not map sleep to user for date ${date} (garminUserId=${sleep.userId ?? 'none'}, hasToken: ${!!sleep.userAccessToken})`);
            continue;
          }
          const userId = resolution.userId;
          
          console.log(`[Garmin Webhook] Processing sleep for user ${userId}, date: ${date}`);
          
          // Calculate sleep stage percentages
          const totalSleep = sleep.durationInSeconds || 1;
          const deepPercent = ((sleep.deepSleepDurationInSeconds || 0) / totalSleep) * 100;
          const lightPercent = ((sleep.lightSleepDurationInSeconds || 0) / totalSleep) * 100;
          const remPercent = ((sleep.remSleepInSeconds || 0) / totalSleep) * 100;
          
          // Calculate sleep quality score (0-100)
          // Based on: deep%, REM%, restlessness, awake count
          const deepScore = Math.min(deepPercent * 1.5, 30); // Target 20%
          const remScore = Math.min(remPercent * 1.2, 25); // Target 20-25%
          const restlessnessScore = (sleep.sleepScores?.restlessness?.qualifierKey === 'EXCELLENT') ? 20 : 
                                   (sleep.sleepScores?.restlessness?.qualifierKey === 'GOOD') ? 15 : 10;
          const awakeScore = (sleep.sleepScores?.awakeCount?.qualifierKey === 'EXCELLENT') ? 15 : 
                            (sleep.sleepScores?.awakeCount?.qualifierKey === 'GOOD') ? 10 : 5;
          
          // Store all sleep fields
          const sleepData = {
            userId,
            date,
            totalSleepSeconds: sleep.durationInSeconds,
            deepSleepSeconds: sleep.deepSleepDurationInSeconds,
            lightSleepSeconds: sleep.lightSleepDurationInSeconds,
            remSleepSeconds: sleep.remSleepInSeconds,
            awakeSleepSeconds: sleep.awakeDurationInSeconds,
            unmeasurableSleepSeconds: sleep.unmeasurableSleepInSeconds,
            totalNapDurationSeconds: sleep.totalNapDurationInSeconds,
            napCount: (sleep.naps || []).length,
            deepSleepPercent: deepPercent,
            lightSleepPercent: lightPercent,
            remSleepPercent: remPercent,
            sleepScore: sleep.overallSleepScore?.value || 0,
            sleepQuality: sleep.overallSleepScore?.qualifierKey || 'UNKNOWN',
            validationType: sleep.validation, // AUTO_FINAL, MANUAL, etc.
            deepPercentageRating: sleep.sleepScores?.deepPercentage?.qualifierKey,
            lightPercentageRating: sleep.sleepScores?.lightPercentage?.qualifierKey,
            remPercentageRating: sleep.sleepScores?.remPercentage?.qualifierKey,
            restlessnessRating: sleep.sleepScores?.restlessness?.qualifierKey,
            awakeCountRating: sleep.sleepScores?.awakeCount?.qualifierKey,
            stressRating: sleep.sleepScores?.stress?.qualifierKey,
            totalDurationRating: sleep.sleepScores?.totalDuration?.qualifierKey,
            sleepSpO2Readings: sleep.timeOffsetSleepSpo2 || {},
            napsData: sleep.naps || [],
            summaryId: sleep.summaryId,
            startTimeInSeconds: sleep.startTimeInSeconds,
            startTimeOffsetInSeconds: sleep.startTimeOffsetInSeconds,
            rawData: sleep,
            syncedAt: new Date(),
          };
          
          // Try upsert - if conflict, update existing
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set(sleepData)
              .where(eq(garminWellnessMetrics.id, existing.id));
            console.log(`[Garmin Webhook] Updated sleep for ${date}: score=${sleep.overallSleepScore?.value}, quality=${sleep.overallSleepScore?.qualifierKey}, deep=${deepPercent.toFixed(0)}%, REM=${remPercent.toFixed(0)}%, naps=${(sleep.naps || []).length}`);
          } else {
            await db.insert(garminWellnessMetrics).values(sleepData);
            console.log(`[Garmin Webhook] Created sleep for ${date}: score=${sleep.overallSleepScore?.value}, quality=${sleep.overallSleepScore?.qualifierKey}, deep=${deepPercent.toFixed(0)}%, REM=${remPercent.toFixed(0)}%, naps=${(sleep.naps || []).length}`);
          }
          
        } catch (sleepError: any) {
          console.error(`❌ [Garmin Webhook] Error processing sleep:`, sleepError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'sleeps',
            payload: sleep,
            error: sleepError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue sleep for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${sleeps.length} sleep records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Sleep handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // HEALTH - Stress (daily stress & body battery with activity breakdown)
  // Enhanced to handle time-series stress, body battery, and activity events
  garminWebhook("stress", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received stress push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process stress data asynchronously (non-blocking)
      const stressData = Array.isArray(req.body) ? req.body : (req.body.stressData || []);
      
      if (stressData.length === 0) {
        console.log('[Garmin Webhook] No stress data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${stressData.length} stress records`);
      
      // Find users
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for stress');
        return;
      }
      
      for (const stress of stressData) {
        try {
          const date = stress.calendarDate || new Date((stress.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          
          // Use unified Garmin user resolver (handles token → userId → single-device fallback)
          const resolution = await resolveGarminUser(stress);
          if (!resolution) {
            console.warn(`⚠️ [Garmin Webhook] Could not map stress to user for date ${date} (garminUserId=${stress.userId ?? 'none'}, hasToken: ${!!stress.userAccessToken})`);
            continue;
          }
          const userId = resolution.userId;
          
          console.log(`[Garmin Webhook] Processing stress for user ${userId}, date: ${date}`);
          
          // Calculate average stress from time-series data
          const stressValues = Object.values(stress.timeOffsetStressLevelValues || {}) as number[];
          const bodyBatteryValues = Object.values(stress.timeOffsetBodyBatteryValues || {}) as number[];
          
          let avgStress = 0;
          let maxStress = 0;
          let minStress = 100;
          
          if (stressValues.length > 0) {
            avgStress = stressValues.reduce((a, b) => a + b, 0) / stressValues.length;
            maxStress = Math.max(...stressValues);
            minStress = Math.min(...stressValues);
          }
          
          let avgBodyBattery = 0;
          let maxBodyBattery = 0;
          let minBodyBattery = 100;
          
          if (bodyBatteryValues.length > 0) {
            avgBodyBattery = bodyBatteryValues.reduce((a, b) => a + b, 0) / bodyBatteryValues.length;
            maxBodyBattery = Math.max(...bodyBatteryValues);
            minBodyBattery = Math.min(...bodyBatteryValues);
          }
          
          // Calculate activity event impacts
          const activityEvents = stress.bodyBatteryActivityEvents || [];
          const sleepImpact = activityEvents
            .filter((e: any) => e.eventType === 'SLEEP')
            .reduce((sum: number, e: any) => sum + (e.bodyBatteryImpact || 0), 0);
          
          const napImpact = activityEvents
            .filter((e: any) => e.eventType === 'NAP')
            .reduce((sum: number, e: any) => sum + (e.bodyBatteryImpact || 0), 0);
          
          const activityImpact = activityEvents
            .filter((e: any) => e.eventType === 'ACTIVITY')
            .reduce((sum: number, e: any) => sum + (e.bodyBatteryImpact || 0), 0);
          
          const recoveryImpact = activityEvents
            .filter((e: any) => e.eventType === 'RECOVERY')
            .reduce((sum: number, e: any) => sum + (e.bodyBatteryImpact || 0), 0);
          
          // Map stress level to qualifier
          let stressQualifier = 'MODERATE';
          if (avgStress < 20) stressQualifier = 'LOW';
          else if (avgStress < 40) stressQualifier = 'MODERATE';
          else if (avgStress < 60) stressQualifier = 'HIGH';
          else stressQualifier = 'VERY_HIGH';
          
          // Store stress & body battery data
          const stressFields = {
            userId,
            date,
            averageStressLevel: Math.round(avgStress),
            maxStressLevel: maxStress,
            minStressLevel: minStress,
            stressQualifier,
            stressReadings: stress.timeOffsetStressLevelValues || {},
            averageBodyBattery: Math.round(avgBodyBattery),
            maxBodyBattery,
            minBodyBattery,
            currentBodyBatteryLevel: stress.bodyBatteryDynamicFeedbackEvent?.bodyBatteryLevel || 'UNKNOWN',
            bodyBatteryReadings: stress.timeOffsetBodyBatteryValues || {},
            sleepBodyBatteryImpact: sleepImpact,
            napBodyBatteryImpact: napImpact,
            activityBodyBatteryImpact: activityImpact,
            recoveryBodyBatteryImpact: recoveryImpact,
            bodyBatteryActivityEvents: activityEvents,
            summaryId: stress.summaryId,
            startTimeInSeconds: stress.startTimeInSeconds,
            startTimeOffsetInSeconds: stress.startTimeOffsetInSeconds,
            durationInSeconds: stress.durationInSeconds,
            rawData: stress,
            syncedAt: new Date(),
          };
          
          // Try upsert - if conflict, update existing
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set(stressFields)
              .where(eq(garminWellnessMetrics.id, existing.id));
            console.log(`[Garmin Webhook] Updated stress for ${date}: avg=${avgStress.toFixed(0)}/100, battery=${avgBodyBattery.toFixed(0)}/100 (${stress.bodyBatteryDynamicFeedbackEvent?.bodyBatteryLevel}), events=${activityEvents.length}`);
          } else {
            await db.insert(garminWellnessMetrics).values(stressFields);
            console.log(`[Garmin Webhook] Created stress for ${date}: avg=${avgStress.toFixed(0)}/100, battery=${avgBodyBattery.toFixed(0)}/100 (${stress.bodyBatteryDynamicFeedbackEvent?.bodyBatteryLevel}), events=${activityEvents.length}`);
          }
          
        } catch (stressError: any) {
          console.error(`❌ [Garmin Webhook] Error processing stress:`, stressError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'stress',
            payload: stress,
            error: stressError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue stress for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${stressData.length} stress records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Stress handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // HEALTH - HRV Summary (heart rate variability)
  // HEALTH - HRV (Heart Rate Variability - sleep quality indicator)
  // Enhanced to handle complete HRV data with time-series readings
  garminWebhook("hrv", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received HRV push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process HRV data asynchronously (non-blocking)
      const hrvData = req.body.hrvSummaries || req.body || [];
      const hrvArray = Array.isArray(hrvData) ? hrvData : [hrvData];
      
      if (hrvArray.length === 0) {
        console.log('[Garmin Webhook] No HRV data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${hrvArray.length} HRV records`);
      
      for (const hrv of hrvArray) {
        try {
          const userAccessToken = hrv.userAccessToken;
          const device = await findUserByGarminToken(userAccessToken);
          
          if (!device) {
            console.warn(`⚠️ [Garmin Webhook] Could not map HRV to user`);
            continue;
          }
          
          const date = hrv.calendarDate || new Date((hrv.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing HRV for user ${device.userId}, date: ${date}`);
          
          // Calculate HRV metrics from time series data
          let weeklyAvg = hrv.weeklyAvg;
          let statusQualifier = hrv.hrvStatus;
          
          if (hrv.hrvValues && Object.keys(hrv.hrvValues).length > 0) {
            const hrvReadingValues = Object.values(hrv.hrvValues) as number[];
            const avgReading = hrvReadingValues.reduce((a, b) => a + b, 0) / hrvReadingValues.length;
            
            // Determine status based on readings
            if (!statusQualifier) {
              if (avgReading >= 100) statusQualifier = 'BALANCED';
              else if (avgReading >= 70) statusQualifier = 'BALANCED';
              else if (avgReading >= 50) statusQualifier = 'UNBALANCED';
              else statusQualifier = 'LOW';
            }
          }
          
          // Map all available fields
          const hrvFields = {
            // Core HRV metrics
            hrvWeeklyAvg: hrv.weeklyAvg || weeklyAvg,
            hrvLastNightAvg: hrv.lastNightAvg,
            hrvLastNight5MinHigh: hrv.lastNight5MinHigh,
            hrvStatus: statusQualifier || hrv.hrvStatus,
            hrvFeedback: hrv.feedbackPhrase || hrv.feedback,
            
            // Baseline values (if provided)
            hrvBaselineLowUpper: hrv.baseline?.lowUpper,
            hrvBaselineBalancedLower: hrv.baseline?.balancedLow || hrv.baseline?.balancedLower,
            hrvBaselineBalancedUpper: hrv.baseline?.balancedUpper,
            
            // Time range
            hrvStartTimeGMT: hrv.startTimeGMT || new Date((hrv.startTimeInSeconds || 0) * 1000).toISOString(),
            hrvEndTimeGMT: hrv.endTimeGMT || new Date(((hrv.startTimeInSeconds || 0) + (hrv.durationInSeconds || 0)) * 1000).toISOString(),
            
            // Time series readings (for detailed analysis)
            hrvReadings: hrv.hrvValues,
            
            // Metadata
            syncedAt: new Date(),
          };
          
          // Upsert (create or update)
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, device.userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set(hrvFields)
              .where(eq(garminWellnessMetrics.id, existing.id));
            console.log(`[Garmin Webhook] Updated HRV for ${date}: avg=${hrv.lastNightAvg}, status=${statusQualifier}`);
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...hrvFields,
            });
            console.log(`[Garmin Webhook] Created HRV for ${date}: avg=${hrv.lastNightAvg}, status=${statusQualifier}`);
          }
          
        } catch (hrvError: any) {
          console.error(`❌ [Garmin Webhook] Error processing HRV:`, hrvError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'hrv',
            payload: hrv,
            error: hrvError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue HRV for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${hrvArray.length} HRV records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] HRV handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // HEALTH - Dailies (daily activity summary with Body Battery, steps, etc.)
  // HEALTH - Dailies (daily wellness summary data)
  // Enhanced to handle complete daily wellness data including goals and stress breakdown
  garminWebhook("dailies", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received dailies push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process dailies asynchronously (non-blocking)
      const dailies = req.body.dailies || [];
      
      if (!Array.isArray(dailies) || dailies.length === 0) {
        console.log('[Garmin Webhook] No dailies data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${dailies.length} daily records`);
      
      for (const daily of dailies) {
        try {
          // Resolve user: try access token first, then fall back to Garmin userId → deviceId lookup.
          // The token-first path can fail when the token has been refreshed since OAuth, so we
          // always cascade to the userId-based lookup rather than stopping after a token miss.
          let device;
          const userAccessToken = daily.userAccessToken;

          if (userAccessToken) {
            device = await findUserByGarminToken(userAccessToken);
          }

          if (!device) {
            // Use unified Garmin user resolver (handles token → userId → single-device fallback)
            const resolution = await resolveGarminUser(daily);
            if (resolution) {
              device = resolution.device ?? await db.query.connectedDevices.findFirst({
                where: (d, { eq }) => eq(d.userId, resolution.userId),
              });
            }
          }

          if (!device) {
            console.warn(`⚠️ [Garmin Webhook] Could not map dailies to user (userId: ${daily.userId || 'unknown'}, hasToken: ${!!userAccessToken})`);
            continue;
          }
          
          const date = daily.calendarDate || new Date((daily.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          console.log(`[Garmin Webhook] Processing daily for user ${device.userId}, date: ${date}`);
          
          // Comprehensive daily fields from your sample payload
          const dailyFields = {
            // Metadata
            summaryId: daily.summaryId,
            activityType: daily.activityType,
            startTimeInSeconds: daily.startTimeInSeconds,
            startTimeOffsetInSeconds: daily.startTimeOffsetInSeconds,
            
            // Heart rate data
            restingHeartRate: daily.restingHeartRateInBeatsPerMinute,
            minHeartRate: daily.minHeartRateInBeatsPerMinute,
            maxHeartRate: daily.maxHeartRateInBeatsPerMinute,
            averageHeartRate: daily.averageHeartRateInBeatsPerMinute,
            heartRateTimeOffsetValues: daily.timeOffsetHeartRateSamples, // Time series HR
            
            // Activity metrics
            steps: daily.steps,
            pushes: daily.pushes, // Wheelchair metric
            distanceMeters: daily.distanceInMeters,
            pushDistanceInMeters: daily.pushDistanceInMeters, // Wheelchair metric
            activeKilocalories: daily.activeKilocalories,
            bmrKilocalories: daily.bmrKilocalories,
            floorsClimbed: daily.floorsClimbed,
            floorsDescended: daily.floorsDescended,
            
            // Duration breakdown
            durationInSeconds: daily.durationInSeconds, // Total time awake
            activeTimeInSeconds: daily.activeTimeInSeconds, // Time in activity
            moderateIntensityDuration: daily.moderateIntensityDurationInSeconds,
            vigorousIntensityDuration: daily.vigorousIntensityDurationInSeconds,
            intensityDuration: daily.intensityDurationGoalInSeconds,
            sedentaryDuration: daily.sedentaryDurationInSeconds,
            sleepingDuration: daily.sleepingDurationInSeconds,
            activeDuration: daily.activeDurationInSeconds,
            
            // Daily goals
            stepsGoal: daily.stepsGoal,
            pushesGoal: daily.pushesGoal,
            floorsClimbedGoal: daily.floorsClimbedGoal,
            intensityGoal: daily.intensityDurationGoalInSeconds,
            
            // Body Battery
            bodyBatteryHigh: daily.bodyBatteryHighValue || daily.bodyBatteryHighestValue,
            bodyBatteryLow: daily.bodyBatteryLowestValue,
            bodyBatteryCurrent: daily.bodyBatteryMostRecentValue,
            bodyBatteryCharged: daily.bodyBatteryChargedValue,
            bodyBatteryDrained: daily.bodyBatteryDrainedValue,
            bodyBatteryVersion: daily.bodyBatteryVersion,
            
            // Stress data (comprehensive breakdown)
            averageStressLevel: daily.averageStressLevel,
            maxStressLevel: daily.maxStressLevel,
            stressDurationInSeconds: daily.stressDurationInSeconds, // Total stress time
            restStressDurationInSeconds: daily.restStressDurationInSeconds, // Rest stress
            activityStressDurationInSeconds: daily.activityStressDurationInSeconds, // Activity stress
            lowStressDurationInSeconds: daily.lowStressDurationInSeconds,
            mediumStressDurationInSeconds: daily.mediumStressDurationInSeconds,
            highStressDurationInSeconds: daily.highStressDurationInSeconds,
            
            // Raw payload
            rawData: daily,
            syncedAt: new Date(),
          };
          
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, device.userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set(dailyFields)
              .where(eq(garminWellnessMetrics.id, existing.id));
            console.log(`[Garmin Webhook] Updated daily summary for ${date}`);
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...dailyFields,
            });
            console.log(`[Garmin Webhook] Created daily summary for ${date}`);
          }
          
        } catch (dailyError: any) {
          console.error(`❌ [Garmin Webhook] Error processing daily:`, dailyError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'daily',
            userId: device?.userId,
            payload: daily,
            error: dailyError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue daily for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${dailies.length} daily records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Dailies handler error:', error);
      res.status(200).json({ success: true });
    }
  });

  // HEALTH - Body Compositions
  garminWebhook("body-compositions", async (req: Request, res: Response) => {
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
  // HEALTH - Pulse Ox (SpO2 - Oxygen Saturation measurements)
  // Enhanced to handle both on-demand and sleep SpO2 readings with time-series data
  garminWebhook("pulse-ox", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received pulse ox push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process pulse ox data asynchronously (non-blocking)
      const pulseOxData = Array.isArray(req.body) ? req.body : (req.body.pulseOx || []);
      
      if (pulseOxData.length === 0) {
        console.log('[Garmin Webhook] No pulse ox data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${pulseOxData.length} pulse ox records`);
      
      // Find users
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for pulse ox');
        return;
      }
      
      for (const pox of pulseOxData) {
        try {
          const date = pox.calendarDate || new Date((pox.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          
          // Use unified Garmin user resolver (handles token → userId → single-device fallback)
          const resolution = await resolveGarminUser(pox);
          if (!resolution) {
            console.warn(`⚠️ [Garmin Webhook] Could not map pulse ox to user for date ${date} (garminUserId=${pox.userId ?? 'none'}, hasToken: ${!!pox.userAccessToken})`);
            continue;
          }
          const userId = resolution.userId;
          
          console.log(`[Garmin Webhook] Processing pulse ox for user ${userId}, date: ${date}`);
          
          // Calculate metrics from time-series data
          const spo2Values = Object.values(pox.timeOffsetSpo2Values || {}) as number[];
          
          let minSpO2 = 100;
          let maxSpO2 = 0;
          let avgSpO2 = 0;
          
          if (spo2Values.length > 0) {
            minSpO2 = Math.min(...spo2Values);
            maxSpO2 = Math.max(...spo2Values);
            avgSpO2 = spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length;
          }
          
          // Map to wellness metrics
          const poxFields = {
            avgSpO2: avgSpO2,
            minSpO2: minSpO2,
            onDemandReadings: pox.onDemand ? pox.timeOffsetSpo2Values : null,
            sleepSpO2Readings: !pox.onDemand ? pox.timeOffsetSpo2Values : null,
            syncedAt: new Date(),
          };
          
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set(poxFields)
              .where(eq(garminWellnessMetrics.id, existing.id));
            console.log(`[Garmin Webhook] Updated pulse ox for ${date}: avg=${avgSpO2.toFixed(1)}%, min=${minSpO2}%, type=${pox.onDemand ? 'on-demand' : 'sleep'}`);
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId,
              date,
              ...poxFields,
            });
            console.log(`[Garmin Webhook] Created pulse ox for ${date}: avg=${avgSpO2.toFixed(1)}%, min=${minSpO2}%, type=${pox.onDemand ? 'on-demand' : 'sleep'}`);
          }
          
        } catch (poxError: any) {
          console.error(`❌ [Garmin Webhook] Error processing pulse ox:`, poxError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'pulse-ox',
            payload: pox,
            error: poxError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue pulse ox for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${pulseOxData.length} pulse ox records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Pulse ox handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // HEALTH - Respiration (breathing rate monitoring)
  // Enhanced to handle time-series respiration data without userAccessToken
  garminWebhook("respiration", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received respiration push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process respiration data asynchronously (non-blocking)
      const respirations = Array.isArray(req.body) ? req.body : (req.body.allDayRespiration || []);
      
      if (respirations.length === 0) {
        console.log('[Garmin Webhook] No respiration data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${respirations.length} respiration records`);
      
      // Find users
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for respiration');
        return;
      }
      
      for (const resp of respirations) {
        try {
          const date = resp.calendarDate || new Date((resp.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          
          // Find user: try access token → Garmin userId → single-device fallback.
          // Date+run matching is skipped on rest days so it's not reliable.
          let userId: string | undefined;

          // Use unified Garmin user resolver (handles token → userId → single-device fallback)
          const resolution = await resolveGarminUser(resp);
          if (resolution) {
            userId = resolution.userId;
          }

          if (!userId) {
            console.warn(`⚠️ [Garmin Webhook] Could not map respiration to user for date ${date} (userId: ${resp.userId || 'unknown'}, hasToken: ${!!resp.userAccessToken})`);
            continue;
          }
          
          console.log(`[Garmin Webhook] Processing respiration for user ${userId}, date: ${date}`);
          
          // Calculate metrics from time-series data
          // Note: Garmin sends timeOffsetEpochToBreaths (breaths per minute at each epoch)
          const respirationValues = Object.values(resp.timeOffsetEpochToBreaths || {}) as number[];
          
          let minResp = 50;
          let maxResp = 0;
          let avgResp = 0;
          
          if (respirationValues.length > 0) {
            minResp = Math.min(...respirationValues);
            maxResp = Math.max(...respirationValues);
            avgResp = respirationValues.reduce((a, b) => a + b, 0) / respirationValues.length;
          }
          
          // Determine if this is sleep or waking respiration
          // Sleep respiration is typically lower (12-16 bpm) vs waking (12-20 bpm)
          const isDuringSleep = avgResp < 13; // Conservative estimate
          
          // Map to wellness metrics
          const respFields = {
            avgWakingRespirationValue: !isDuringSleep ? avgResp : undefined,
            avgSleepRespirationValue: isDuringSleep ? avgResp : undefined,
            highestRespirationValue: maxResp,
            lowestRespirationValue: minResp,
            syncedAt: new Date(),
          };
          
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set(respFields)
              .where(eq(garminWellnessMetrics.id, existing.id));
            console.log(`[Garmin Webhook] Updated respiration for ${date}: avg=${avgResp.toFixed(1)} bpm, range=${minResp}-${maxResp}`);
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId,
              date,
              ...respFields,
            });
            console.log(`[Garmin Webhook] Created respiration for ${date}: avg=${avgResp.toFixed(1)} bpm, range=${minResp}-${maxResp}`);
          }
          
        } catch (respError: any) {
          console.error(`❌ [Garmin Webhook] Error processing respiration:`, respError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'respiration',
            payload: resp,
            error: respError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue respiration for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${respirations.length} respiration records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Respiration handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // USER_DEREG ping — Garmin sends a GET to verify the endpoint is alive
  app.get("/api/garmin/webhook/deregistrations", (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });
  app.get("/api/garmin/webhooks/deregistrations", (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  });

  // COMMON - Deregistrations (user disconnects Garmin) — POST for actual payloads
  garminWebhook("deregistrations", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received deregistration:', JSON.stringify(req.body).slice(0, 500));
      
      // IMPORTANT: Return 200 immediately to Garmin
      res.status(200).json({ success: true });
      
      const deregistrations = req.body.deregistrations || [];
      
      for (const dereg of deregistrations) {
        try {
          const userAccessToken = dereg.userAccessToken;
          const device = await findUserByGarminToken(userAccessToken);
          
          if (!device) {
            console.warn('[Garmin Webhook] Could not find device for deregistration token');
            continue;
          }
          
          const userId = device.userId;
          const deviceName = device.deviceName || 'Garmin Device';
          
          console.log(`[Garmin Webhook] Processing deregistration for user ${userId}, device: ${deviceName}`);
          
          // 1. Delete all Garmin data for this user
          console.log(`[Garmin] Deleting Garmin data for user ${userId}...`);
          
          await db.delete(garminActivities).where(eq(garminActivities.userId, userId));
          await db.delete(garminEpochsRaw).where(eq(garminEpochsRaw.userId, userId));
          await db.delete(garminEpochsAggregate).where(eq(garminEpochsAggregate.userId, userId));
          await db.delete(garminHealthSnapshots).where(eq(garminHealthSnapshots.userId, userId));
          await db.delete(garminWellnessMetrics).where(eq(garminWellnessMetrics.userId, userId));
          
          console.log(`[Garmin] Deleted all Garmin data for user ${userId}`);
          
          // 2. Mark device as inactive and clear tokens
          await db.update(connectedDevices)
            .set({ 
              isActive: false, 
              accessToken: null, 
              refreshToken: null,
              tokenExpiresAt: null,
              grantedScopes: null,
              updatedAt: new Date()
            })
            .where(eq(connectedDevices.id, device.id));
          
          console.log(`[Garmin Webhook] Marked device as inactive for user ${userId}`);
          
          // 3. Send push notification to user
          const { sendNotification } = await import('./notification-service');
          try {
            await sendNotification({
              userId,
              title: '🔌 Garmin Connection Removed',
              body: `Your connection to ${deviceName} has been removed. You can reconnect anytime in Settings.`,
              data: {
                action: 'garmin_deregistered',
                deviceName: deviceName,
              }
            });
            console.log(`[Garmin] Sent deregistration notification to user ${userId}`);
          } catch (notificationError: any) {
            console.warn(`[Garmin] Failed to send deregistration notification: ${notificationError.message}`);
            // Don't fail the whole deregistration if notification fails
          }
          
          console.log(`[Garmin Webhook] ✅ Deregistration complete for user ${userId}`);
        } catch (deregError: any) {
          console.error(`[Garmin Webhook] Error processing single deregistration:`, deregError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'deregistrations',
            userId: dereg.userAccessToken ? 'unknown' : undefined,
            payload: dereg,
            error: deregError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`[Garmin] Failed to queue deregistration for retry:`, queueError);
          });
        }
      }
    } catch (error: any) {
      console.error('[Garmin Webhook] Deregistrations error:', error);
      // Still return 200 since we already did
    }
  });

  // ==========================================
  // WEBHOOK FAILURE QUEUE MANAGEMENT ENDPOINTS
  // These endpoints allow monitoring and managing failed webhook processing
  // ==========================================

  /**
   * Get webhook failure queue statistics
   * Admin endpoint to monitor webhook processing health
   */
  app.get("/api/garmin/webhooks/queue/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Check if user is admin
      const user = await db.query.users.findFirst({
        where: eq(users.id, req.user!.userId),
      });

      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { getWebhookQueueStats } = await import("./webhook-processor");
      const stats = await getWebhookQueueStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error getting webhook queue stats:", error);
      res.status(500).json({ error: "Failed to get queue stats" });
    }
  });

  /**
   * Get webhook failure queue items
   * Admin endpoint to view failed webhooks
   */
  app.get("/api/garmin/webhooks/queue/items", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Check if user is admin
      const user = await db.query.users.findFirst({
        where: eq(users.id, req.user!.userId),
      });

      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { webhookFailureQueue } = await import("@shared/schema");
      const items = await db.query.webhookFailureQueue.findMany({
        limit: 100,
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      res.json({
        success: true,
        data: items,
        count: items.length,
      });
    } catch (error: any) {
      console.error("Error getting webhook queue items:", error);
      res.status(500).json({ error: "Failed to get queue items" });
    }
  });

  /**
   * Retry a specific webhook
   * Admin endpoint to manually retry a failed webhook
   */
  app.post("/api/garmin/webhooks/queue/retry/:webhookId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Check if user is admin
      const user = await db.query.users.findFirst({
        where: eq(users.id, req.user!.userId),
      });

      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { webhookId } = req.params;
      const { retryWebhook } = await import("./webhook-processor");
      const success = await retryWebhook(webhookId);

      if (!success) {
        return res.status(404).json({ error: "Webhook not found" });
      }

      res.json({
        success: true,
        message: `Webhook ${webhookId} queued for retry`,
      });
    } catch (error: any) {
      console.error("Error retrying webhook:", error);
      res.status(500).json({ error: "Failed to retry webhook" });
    }
  });

  /**
   * Process webhook failure queue now
   * Admin endpoint to trigger immediate queue processing
   */
  app.post("/api/garmin/webhooks/queue/process", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Check if user is admin
      const user = await db.query.users.findFirst({
        where: eq(users.id, req.user!.userId),
      });

      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { processWebhookFailureQueue } = await import("./webhook-processor");
      const result = await processWebhookFailureQueue();

      res.json({
        success: true,
        data: result,
        message: `Processed webhook queue: ${result.retried} retried, ${result.failed} failed`,
      });
    } catch (error: any) {
      console.error("Error processing webhook queue:", error);
      res.status(500).json({ error: "Failed to process queue" });
    }
  });

  // Webhook Testing Endpoint - Simulate incoming Garmin activities webhook
  app.post("/api/garmin/webhook-test", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { activities } = req.body;
      
      if (!activities || !Array.isArray(activities) || activities.length === 0) {
        return res.status(400).json({ error: "activities array required" });
      }
      
      console.log(`[Webhook Test] Simulating ${activities.length} activities for user ${req.user!.userId}`);
      
      // Add user info to each activity for testing
      const testActivities = activities.map((activity: any, index: number) => ({
        ...activity,
        userAccessToken: `test_token_${req.user!.userId}_${index}`,
        activityId: activity.activityId || `test_${Date.now()}_${index}`,
      }));
      
      // Import the activities handler
      const { garminWebhook } = await import("./garmin-webhook-handler");
      
      // Create a mock request
      const mockReq = {
        body: { activities: testActivities },
        headers: {},
        query: {},
        params: {},
      } as any;
      
      const mockRes = {
        status: (code: number) => ({ json: () => {} }),
        json: () => {},
      } as any;
      
      // Process the activities
      await garminWebhook("activities", mockReq, mockRes);
      
      // Return the event IDs for tracking
      const eventIds = await Promise.all(
        testActivities.map(async (activity: any) => {
          const events = await storage.getRecentGarminWebhookEvents(req.user!.userId, 1);
          return events[0]?.id;
        })
      );
      
      res.json({
        success: true,
        message: `Processed ${activities.length} test activities`,
        eventIds,
      });
    } catch (error: any) {
      console.error("[Webhook Test] Error:", error);
      res.status(500).json({ error: "Failed to process test activities" });
    }
  });

  // Webhook Stats Endpoint - Get comprehensive webhook statistics
  app.get("/api/garmin/webhook-stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string || '7', 10);
      const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 50);
      
      // Get stats for different time periods
      const stats24h = await storage.getGarminWebhookStats(req.user!.userId, 1);
      const stats7d = await storage.getGarminWebhookStats(req.user!.userId, 7);
      const stats30d = await storage.getGarminWebhookStats(req.user!.userId, 30);
      
      // Get recent events
      const recentEvents = await storage.getRecentGarminWebhookEvents(req.user!.userId, limit);
      
      // Calculate match rate
      const matchRate7d = stats7d.totalReceived > 0 
        ? ((stats7d.totalMerged / stats7d.totalReceived) * 100).toFixed(1)
        : '0.0';
      
      res.json({
        success: true,
        stats: {
          last24h: stats24h,
          last7d: stats7d,
          last30d: stats30d,
          matchRate: `${matchRate7d}%`,
        },
        recentEvents: recentEvents.map(event => ({
          id: event.id,
          activityId: event.activityId,
          status: event.status,
          matchScore: event.matchScore,
          matchedRunId: event.matchedRunId,
          newRunId: event.newRunId,
          activityType: event.activityType,
          distanceInMeters: event.distanceInMeters,
          durationInSeconds: event.durationInSeconds,
          notificationSent: event.notificationSent,
          notificationType: event.notificationType,
          errorMessage: event.errorMessage,
          createdAt: event.createdAt,
          processedAt: event.processedAt,
        })),
      });
    } catch (error: any) {
      console.error("[Webhook Stats] Error:", error);
      res.status(500).json({ error: "Failed to get webhook stats" });
    }
  });

  // New Activities Polling Endpoint - For mobile apps to pull recent Garmin activities
  app.get("/api/garmin/new-activities", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const since = req.query.since as string;
      const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 50);
      
      // Get recent webhook events for this user
      const events = await storage.getRecentGarminWebhookEvents(req.user!.userId, limit * 2);
      
      // Filter to only created/merged activities since the given timestamp
      let filteredEvents = events.filter(e => 
        e.status === 'created_run' || e.status === 'merged_run'
      );
      
      if (since) {
        const sinceDate = new Date(since);
        filteredEvents = filteredEvents.filter(e => 
          e.createdAt && new Date(e.createdAt) > sinceDate
        );
      }
      
      // Get the full run details for each event
      const activitiesWithRuns = await Promise.all(
        filteredEvents.slice(0, limit).map(async (event) => {
          const runId = event.newRunId || event.matchedRunId;
          if (!runId) return null;
          
          const run = await storage.getRun(runId);
          if (!run) return null;
          
          return {
            webhookEvent: {
              id: event.id,
              activityId: event.activityId,
              status: event.status,
              matchScore: event.matchScore,
              createdAt: event.createdAt,
            },
            run: {
              id: run.id,
              distance: run.distance,
              duration: run.duration,
              avgPace: run.avgPace,
              avgHeartRate: run.avgHeartRate,
              completedAt: run.completedAt,
              hasGarminData: run.hasGarminData,
              garminActivityId: run.garminActivityId,
            },
          };
        })
      );
      
      // Filter out nulls
      const validActivities = activitiesWithRuns.filter(a => a !== null);
      
      res.json({
        success: true,
        activities: validActivities,
        count: validActivities.length,
        hasMore: filteredEvents.length > limit,
      });
    } catch (error: any) {
      console.error("[New Activities] Error:", error);
      res.status(500).json({ error: "Failed to get new activities" });
    }
  });

  // COMMON - User Permissions Change
  garminWebhook("permissions", async (req: Request, res: Response) => {
    try {
      const { handlePermissionChange } = await import('./garmin-permissions-service');
      
      const payload = req.body;
      console.log('[Garmin Webhook] Permissions change received:', {
        timestamp: new Date().toISOString(),
        userAccessToken: payload.userAccessToken ? payload.userAccessToken.slice(0, 20) + '...' : 'missing',
        userId: payload.userId || 'missing',
        granted: payload.permissionsGranted?.length || 0,
        revoked: payload.permissionsRevoked?.length || 0,
      });

      // If token provided but not userId, look up userId from the token
      let userId = payload.userId;
      if (!userId && payload.userAccessToken) {
        const device = await db.query.connectedDevices.findFirst({
          where: eq(connectedDevices.accessToken, payload.userAccessToken),
        });
        userId = device?.deviceId; // Use Garmin numeric ID for matching
      }

      // Process permission changes
      await handlePermissionChange({
        userAccessToken: payload.userAccessToken,
        userId: userId,
        permissionsGranted: payload.permissionsGranted || [],
        permissionsRevoked: payload.permissionsRevoked || [],
      });

      // Always return 200 to Garmin
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[Garmin Webhook] Permissions error:', error);
      // Still return 200 so Garmin doesn't retry
      res.status(200).json({ success: true });
    }
  });

  // Other health endpoints (accept and log only for now)
  const garminAckHandler = async (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  };

  // MOVEIQ - Activity Classification (AI-powered activity type detection)
  // Enhanced to handle detailed MoveIQ activity classifications
  garminWebhook("moveiq", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received MoveIQ push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process MoveIQ data asynchronously (non-blocking)
      const moveiqData = req.body || [];
      
      if (!Array.isArray(moveiqData) || moveiqData.length === 0) {
        console.log('[Garmin Webhook] No MoveIQ data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${moveiqData.length} MoveIQ records`);
      
      for (const moveiq of moveiqData) {
        try {
          const summaryId = moveiq.summaryId;
          const activityType = moveiq.activityType || 'Unknown';
          const activitySubType = moveiq.activitySubType || 'Unknown';
          
          if (!summaryId) {
            console.warn('[Garmin Webhook] MoveIQ data missing summaryId');
            continue;
          }
          
          console.log(`[Garmin Webhook] Processing MoveIQ classification: ${activityType} - ${activitySubType}`);
          
          // Extract user info - MoveIQ doesn't always have user token, so lookup by date/time
          // Try to find matching activity
          const startTime = new Date((moveiq.startTimeInSeconds || 0) * 1000);
          const calendarDate = moveiq.calendarDate || startTime.toISOString().split('T')[0];
          
          // Find all active Garmin users (would need access token in real implementation)
          const devices = await db.query.connectedDevices.findMany({
            where: eq(connectedDevices.deviceType, 'garmin'),
          });
          
          if (devices.length === 0) {
            console.warn('[Garmin Webhook] No active Garmin devices found for MoveIQ');
            continue;
          }
          
          // For each device, check if there's a matching activity on that date
          for (const device of devices) {
            const matchingActivity = await db.query.garminActivities.findFirst({
              where: and(
                eq(garminActivities.userId, device.userId),
                eq(sql`DATE(to_timestamp(${garminActivities.startTimeInSeconds}))`, sql`${calendarDate}::date`)
              ),
            });
            
            if (!matchingActivity) continue;
            
            // Found matching activity - store MoveIQ classification
            const existingMoveiq = await db.query.garminMoveIQ.findFirst({
              where: eq(garminMoveIQ.summaryId, summaryId),
            });
            
            if (existingMoveiq) {
              // Update existing
              await db
                .update(garminMoveIQ)
                .set({
                  activityType,
                  activitySubType,
                  detectedAt: new Date(),
                  rawData: moveiq,
                })
                .where(eq(garminMoveIQ.id, existingMoveiq.id));
              
              console.log(`[Garmin Webhook] Updated MoveIQ classification: ${activityType} - ${activitySubType}`);
            } else {
              // Create new
              await db.insert(garminMoveIQ).values({
                userId: device.userId,
                runId: matchingActivity.runId || undefined,
                garminActivityId: matchingActivity.garminActivityId,
                summaryId,
                activityType,
                activitySubType,
                calendarDate,
                startTimeInSeconds: moveiq.startTimeInSeconds,
                durationInSeconds: moveiq.durationInSeconds,
                offsetInSeconds: moveiq.offsetInSeconds,
                rawData: moveiq,
              });
              
              console.log(`[Garmin Webhook] Created MoveIQ classification: ${activityType} - ${activitySubType}`);
            }
            
            // Update the garmin_activities record with sub-type
            await db
              .update(garminActivities)
              .set({
                activitySubType,
              })
              .where(eq(garminActivities.id, matchingActivity.id));
            
            // If there's a linked runs record, optionally update it
            if (matchingActivity.runId) {
              // Could add a runs.activitySubType field if desired
              console.log(`[Garmin Webhook] Linked MoveIQ to run ${matchingActivity.runId}`);
            }
            
            // Only process once per date
            break;
          }
          
        } catch (moveiqError: any) {
          console.error(`❌ [Garmin Webhook] Error processing MoveIQ:`, moveiqError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'moveiq',
            payload: moveiq,
            error: moveiqError.message,
            nextRetryAt: new Date(Date.now() + 10 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue MoveIQ for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${moveiqData.length} MoveIQ records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] MoveIQ handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // HEALTH - Blood Pressure measurements
  // Enhanced to handle blood pressure readings with classification
  garminWebhook("blood-pressure", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received blood pressure push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process blood pressure data asynchronously (non-blocking)
      const bloodPressures = req.body || [];
      
      if (!Array.isArray(bloodPressures) || bloodPressures.length === 0) {
        console.log('[Garmin Webhook] No blood pressure data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${bloodPressures.length} blood pressure readings`);
      
      for (const bp of bloodPressures) {
        try {
          const summaryId = bp.summaryId;
          
          if (!summaryId) {
            console.warn('[Garmin Webhook] Blood pressure missing summaryId');
            continue;
          }
          
          // Try to find user by measurement time (similar to MoveIQ approach)
          const measurementTime = new Date((bp.measurementTimeInSeconds || 0) * 1000);
          
          // For blood pressure, we need to match to a user somehow
          // Option 1: If Garmin eventually sends userAccessToken, use that
          // Option 2: Find all users with activities around this time
          const devices = await db.query.connectedDevices.findMany({
            where: eq(connectedDevices.deviceType, 'garmin'),
          });
          
          let userId: string | undefined;
          
          // Try to match by finding recent activity for this user on this date
          for (const device of devices) {
            const recentActivity = await db.query.runs.findFirst({
              where: and(
                eq(runs.userId, device.userId),
                gte(runs.completedAt, new Date(measurementTime.getTime() - 24 * 60 * 60 * 1000)), // Within 24 hours
                lte(runs.completedAt, new Date(measurementTime.getTime() + 24 * 60 * 60 * 1000))
              ),
              orderBy: desc(runs.completedAt),
              limit: 1,
            });
            
            if (recentActivity) {
              userId = device.userId;
              break;
            }
          }
          
          if (!userId) {
            console.warn(`⚠️ [Garmin Webhook] Could not map blood pressure to user, queueing for retry`);
            // Queue for retry - user might connect later
            await db.insert(webhookFailureQueue).values({
              webhookType: 'blood-pressure',
              payload: bp,
              error: 'User not found - no recent activities',
              nextRetryAt: new Date(Date.now() + 30 * 60 * 1000), // Retry in 30 min
            });
            continue;
          }
          
          // Classify blood pressure reading
          const classification = classifyBloodPressure(bp.systolic, bp.diastolic);
          
          console.log(`[Garmin Webhook] Processing blood pressure for user ${userId}: ${bp.systolic}/${bp.diastolic} (${classification})`);
          
          // Check if already exists
          const existing = await db.query.garminBloodPressure.findFirst({
            where: eq(garminBloodPressure.summaryId, summaryId),
          });
          
          if (existing) {
            // Update existing
            await db
              .update(garminBloodPressure)
              .set({
                systolic: bp.systolic,
                diastolic: bp.diastolic,
                pulse: bp.pulse,
                classification,
                rawData: bp,
              })
              .where(eq(garminBloodPressure.id, existing.id));
            
            console.log(`[Garmin Webhook] Updated blood pressure reading: ${bp.systolic}/${bp.diastolic}`);
          } else {
            // Create new
            await db.insert(garminBloodPressure).values({
              userId,
              systolic: bp.systolic,
              diastolic: bp.diastolic,
              pulse: bp.pulse,
              summaryId,
              sourceType: bp.sourceType || 'MANUAL',
              measurementTimeInSeconds: bp.measurementTimeInSeconds,
              measurementTimeOffsetInSeconds: bp.measurementTimeOffsetInSeconds,
              classification,
              rawData: bp,
            });
            
            console.log(`[Garmin Webhook] Created blood pressure reading: ${bp.systolic}/${bp.diastolic} (${classification})`);
          }
          
        } catch (bpError: any) {
          console.error(`❌ [Garmin Webhook] Error processing blood pressure:`, bpError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'blood-pressure',
            payload: bp,
            error: bpError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue blood pressure for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${bloodPressures.length} blood pressure readings`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Blood pressure handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // Helper: Classify blood pressure reading based on AHA guidelines
  function classifyBloodPressure(systolic: number, diastolic: number): string {
    // AHA/ACC Blood Pressure Classification
    if (systolic < 120 && diastolic < 80) return 'OPTIMAL';
    if (systolic >= 120 && systolic <= 129 && diastolic < 80) return 'ELEVATED';
    if (systolic >= 130 && systolic <= 139 || (diastolic >= 80 && diastolic <= 89)) return 'STAGE_1_HYPERTENSION';
    if (systolic >= 140 || diastolic >= 90) return 'STAGE_2_HYPERTENSION';
    if (systolic > 180 || diastolic > 120) return 'CRISIS';
    return 'NORMAL';
  }

  // HEALTH - Epochs (minute-by-minute activity classification)
  // Hybrid approach: Keep raw data for 7 days, compress daily aggregates for long-term storage
  garminWebhook("epochs", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received epochs push:', JSON.stringify(req.body).slice(0, 500));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process epochs asynchronously (non-blocking)
      const epochs = req.body.epochs || [];
      
      if (!Array.isArray(epochs) || epochs.length === 0) {
        console.log('[Garmin Webhook] No epochs data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${epochs.length} epochs`);
      
      // Find user by matching recent activity
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for epochs');
        return;
      }
      
      // Get date from first epoch (or use today if no valid timestamp)
      const epochTimestamp = epochs[0]?.startTimeInSeconds;
      const epochDate = epochTimestamp
        ? new Date(epochTimestamp * 1000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]; // Fallback to today
      
      // Process each device
      for (const device of devices) {
        try {
          // Check if we already have epochs for this date
          const existingAggregate = await db.query.garminEpochsAggregate.findFirst({
            where: and(
              eq(garminEpochsAggregate.userId, device.userId),
              eq(garminEpochsAggregate.epochDate, epochDate)
            ),
          });
          
          if (existingAggregate?.compressedAt) {
            console.log(`[Garmin Webhook] Epochs already compressed for ${device.userId} on ${epochDate}, skipping`);
            continue;
          }
          
          // Calculate aggregates
          let sedentarySeconds = 0;
          let activeSeconds = 0;
          let highlyActiveSeconds = 0;
          
          let walkingSeconds = 0;
          let runningSeconds = 0;
          let wheelchairSeconds = 0;
          
          let totalMet = 0;
          let peakMet = 0;
          let totalMotionIntensity = 0;
          
          let totalCalories = 0;
          let totalSteps = 0;
          let totalPushes = 0;
          let totalDistance = 0;
          let totalPushDistance = 0;
          
          // Insert raw epochs (keep for 7 days)
          // CRITICAL: Convert any decimal values to integers for integer fields
          const epochsToInsert = epochs.map(epoch => ({
            userId: device.userId,
            date: epochDate,
            startTimeInSeconds: Math.floor(Number(epoch.startTimeInSeconds) || 0),
            activityType: epoch.activityType,
            intensity: epoch.intensity,
            met: Math.round(Number(epoch.met) || 0),
            meanMotionIntensity: Math.round(Number(epoch.meanMotionIntensity) || 0),
            maxMotionIntensity: Math.round(Number(epoch.maxMotionIntensity) || 0),
            activeKilocalories: Math.round(Number(epoch.activeKilocalories) || 0),
            durationInSeconds: Math.floor(Number(epoch.durationInSeconds) || 0),
            activeTimeInSeconds: Math.floor(Number(epoch.activeTimeInSeconds) || 0),
            steps: Math.floor(Number(epoch.steps) || 0),
            pushes: Math.floor(Number(epoch.pushes) || 0),
            distanceInMeters: Math.round(Number(epoch.distanceInMeters) || 0),
            pushDistanceInMeters: Math.round(Number(epoch.pushDistanceInMeters) || 0),
            summaryId: epoch.summaryId,
            startTimeOffsetInSeconds: Math.floor(Number(epoch.startTimeOffsetInSeconds) || 0),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Delete after 7 days
          }));
          
          // Batch insert raw epochs
          if (epochsToInsert.length > 0) {
            await db.insert(garminEpochsRaw).values(epochsToInsert);
          }
          
          // Calculate aggregates from converted epochs (using values that will be stored)
          for (const converted of epochsToInsert) {
            // Intensity breakdown
            if (converted.intensity === 'SEDENTARY') sedentarySeconds += converted.activeTimeInSeconds;
            if (converted.intensity === 'ACTIVE') activeSeconds += converted.activeTimeInSeconds;
            if (converted.intensity === 'HIGHLY_ACTIVE') highlyActiveSeconds += converted.activeTimeInSeconds;
            
            // Activity type breakdown
            if (converted.activityType === 'WALKING') walkingSeconds += converted.durationInSeconds;
            if (converted.activityType === 'RUNNING') runningSeconds += converted.durationInSeconds;
            if (converted.activityType === 'WHEELCHAIR_PUSHING') wheelchairSeconds += converted.durationInSeconds;
            
            // Metrics
            totalMet += converted.met;
            peakMet = Math.max(peakMet, converted.met);
            totalMotionIntensity += converted.meanMotionIntensity;
            
            // Totals
            totalCalories += converted.activeKilocalories;
            totalSteps += converted.steps;
            totalPushes += converted.pushes;
            totalDistance += converted.distanceInMeters;
            totalPushDistance += converted.pushDistanceInMeters;
          }
          
          const averageMet = epochsToInsert.length > 0 ? totalMet / epochsToInsert.length : 0;
          const maxMotionIntensity = Math.max(...epochsToInsert.map(e => e.maxMotionIntensity));
          const averageMotionIntensity = epochs.length > 0 ? totalMotionIntensity / epochs.length : 0;
          
          // Create or update aggregate
          if (existingAggregate) {
            await db
              .update(garminEpochsAggregate)
              .set({
                sedentaryDurationSeconds: sedentarySeconds,
                activeDurationSeconds: activeSeconds,
                highlyActiveDurationSeconds: highlyActiveSeconds,
                walkingSeconds,
                runningSeconds,
                wheelchairPushingSeconds: wheelchairSeconds,
                totalMet,
                averageMet,
                peakMet,
                averageMotionIntensity,
                maxMotionIntensity,
                totalActiveKilocalories: totalCalories,
                totalSteps,
                totalPushes,
                totalDistance,
                totalPushDistance,
                totalEpochs: epochs.length,
              })
              .where(eq(garminEpochsAggregate.id, existingAggregate.id));
            
            console.log(`[Garmin Webhook] Updated epochs aggregate for ${device.userId}, date: ${epochDate}`);
          } else {
            await db.insert(garminEpochsAggregate).values({
              userId: device.userId,
              epochDate: epochDate,
              sedentaryDurationSeconds: sedentarySeconds,
              activeDurationSeconds: activeSeconds,
              highlyActiveDurationSeconds: highlyActiveSeconds,
              walkingSeconds,
              runningSeconds,
              wheelchairPushingSeconds: wheelchairSeconds,
              totalMet,
              averageMet,
              peakMet,
              averageMotionIntensity,
              maxMotionIntensity,
              totalActiveKilocalories: totalCalories,
              totalSteps,
              totalPushes,
              totalDistance,
              totalPushDistance,
              totalEpochs: epochs.length,
            });
            
            console.log(`[Garmin Webhook] Created epochs aggregate for ${device.userId}, date: ${epochDate} (${epochs.length} epochs)`);
          }
          
        } catch (epochError: any) {
          console.error(`❌ [Garmin Webhook] Error processing epochs:`, epochError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'epochs',
            userId: device.userId,
            payload: { epochs },
            error: epochError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue epochs for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${epochs.length} epochs`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Epochs handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });
  // HEALTH - Health Snapshots (real-time multi-metric health data)
  // 5-second interval snapshots of HR, stress, SpO2, respiration during activities
  garminWebhook("health-snapshot", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received health-snapshot push:', JSON.stringify(req.body).slice(0, 500));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process health snapshots asynchronously (non-blocking)
      const snapshots = Array.isArray(req.body) ? req.body : [req.body];
      
      if (snapshots.length === 0 || !Array.isArray(snapshots)) {
        console.log('[Garmin Webhook] No health snapshot data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${snapshots.length} health snapshots`);
      
      // Find user by recent activity
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for health snapshots');
        return;
      }
      
      // Process each snapshot
      for (const snapshot of snapshots) {
        try {
          // Get date from snapshot
          const snapshotDate = snapshot.calendarDate || 
            new Date((snapshot.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          
          // Find user (match to device)
          let userId: string | undefined;
          for (const device of devices) {
            const recentRun = await db.query.runs.findFirst({
              where: and(
                eq(runs.userId, device.userId),
                gte(runs.completedAt, new Date((snapshot.startTimeInSeconds || 0) * 1000 - 24 * 60 * 60 * 1000)),
                lte(runs.completedAt, new Date((snapshot.startTimeInSeconds || 0) * 1000 + 24 * 60 * 60 * 1000))
              ),
              limit: 1,
            });
            
            if (recentRun) {
              userId = device.userId;
              break;
            }
          }
          
          if (!userId) {
            console.warn(`⚠️ [Garmin Webhook] Could not map health snapshot to user`);
            continue;
          }
          
          console.log(`[Garmin Webhook] Processing health snapshot for user ${userId}, date: ${snapshotDate}`);
          
          // Extract metrics from summaries
          let hrData = { min: 0, max: 0, avg: 0, epochs: {} };
          let stressData = { min: 0, max: 0, avg: 0, epochs: {} };
          let spo2Data = { min: 0, max: 0, avg: 0, epochs: {} };
          let respData = { min: 0, max: 0, avg: 0, epochs: {} };
          
          if (snapshot.summaries && Array.isArray(snapshot.summaries)) {
            for (const summary of snapshot.summaries) {
              switch (summary.summaryType?.toLowerCase()) {
                case 'heart_rate':
                  hrData = {
                    min: summary.minValue || 0,
                    max: summary.maxValue || 0,
                    avg: summary.avgValue || 0,
                    epochs: summary.epochSummaries || {},
                  };
                  break;
                case 'stress':
                  stressData = {
                    min: summary.minValue || 0,
                    max: summary.maxValue || 0,
                    avg: summary.avgValue || 0,
                    epochs: summary.epochSummaries || {},
                  };
                  break;
                case 'spo2':
                  spo2Data = {
                    min: summary.minValue || 0,
                    max: summary.maxValue || 0,
                    avg: summary.avgValue || 0,
                    epochs: summary.epochSummaries || {},
                  };
                  break;
                case 'respiration':
                  respData = {
                    min: summary.minValue || 0,
                    max: summary.maxValue || 0,
                    avg: summary.avgValue || 0,
                    epochs: summary.epochSummaries || {},
                  };
                  break;
              }
            }
          }
          
          // Insert or update health snapshot
          const existing = await db.query.garminHealthSnapshots.findFirst({
            where: eq(garminHealthSnapshots.summaryId, snapshot.summaryId),
          });
          
          if (existing) {
            await db
              .update(garminHealthSnapshots)
              .set({
                hrMinValue: hrData.min,
                hrMaxValue: hrData.max,
                hrAvgValue: hrData.avg,
                hrEpochs: hrData.epochs,
                stressMinValue: stressData.min,
                stressMaxValue: stressData.max,
                stressAvgValue: stressData.avg,
                stressEpochs: stressData.epochs,
                spo2MinValue: spo2Data.min,
                spo2MaxValue: spo2Data.max,
                spo2AvgValue: spo2Data.avg,
                spo2Epochs: spo2Data.epochs,
                respMinValue: respData.min,
                respMaxValue: respData.max,
                respAvgValue: respData.avg,
                respEpochs: respData.epochs,
                rawData: snapshot,
              })
              .where(eq(garminHealthSnapshots.id, existing.id));
            
            console.log(`[Garmin Webhook] Updated health snapshot ${snapshot.summaryId}`);
          } else {
            await db.insert(garminHealthSnapshots).values({
              userId,
              summaryId: snapshot.summaryId,
              snapshotDate,
              startTimeInSeconds: snapshot.startTimeInSeconds,
              durationInSeconds: snapshot.durationInSeconds,
              startTimeOffsetInSeconds: snapshot.startTimeOffsetInSeconds,
              
              hrMinValue: hrData.min,
              hrMaxValue: hrData.max,
              hrAvgValue: hrData.avg,
              hrEpochs: hrData.epochs,
              
              stressMinValue: stressData.min,
              stressMaxValue: stressData.max,
              stressAvgValue: stressData.avg,
              stressEpochs: stressData.epochs,
              
              spo2MinValue: spo2Data.min,
              spo2MaxValue: spo2Data.max,
              spo2AvgValue: spo2Data.avg,
              spo2Epochs: spo2Data.epochs,
              
              respMinValue: respData.min,
              respMaxValue: respData.max,
              respAvgValue: respData.avg,
              respEpochs: respData.epochs,
              
              rawData: snapshot,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Keep 30 days
            });
            
            console.log(`[Garmin Webhook] Created health snapshot ${snapshot.summaryId} (HR: ${hrData.avg.toFixed(1)}, SpO2: ${spo2Data.avg.toFixed(1)}%)`);
          }
          
        } catch (snapshotError: any) {
          console.error(`❌ [Garmin Webhook] Error processing health snapshot:`, snapshotError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'health-snapshot',
            payload: snapshot,
            error: snapshotError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue health snapshot for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${snapshots.length} health snapshots`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Health snapshot handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });
  // HEALTH - User Metrics (VO2 Max, Fitness Age)
  // Key fitness indicators tracked by Garmin's algorithms
  garminWebhook("user-metrics", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received user-metrics push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process user metrics data asynchronously (non-blocking)
      const metricsData = Array.isArray(req.body) ? req.body : (req.body.userMetrics || []);
      
      if (metricsData.length === 0) {
        console.log('[Garmin Webhook] No user metrics data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${metricsData.length} user metrics records`);
      
      // Find users
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for user metrics');
        return;
      }
      
      for (const metrics of metricsData) {
        try {
          const date = metrics.calendarDate || new Date().toISOString().split('T')[0];
          
          // Find user by recent activity matching date
          let userId: string | undefined;
          for (const device of devices) {
            const recentRun = await db.query.runs.findFirst({
              where: and(
                eq(runs.userId, device.userId),
                gte(runs.completedAt, new Date(`${date}T00:00:00`)),
                lte(runs.completedAt, new Date(`${date}T23:59:59`))
              ),
              limit: 1,
            });
            
            if (recentRun) {
              userId = device.userId;
              break;
            }
          }
          
          if (!userId) {
            console.warn(`⚠️ [Garmin Webhook] Could not map user metrics to user for date ${date}`);
            continue;
          }
          
          console.log(`[Garmin Webhook] Processing user metrics for user ${userId}, date: ${date}`);
          
          // Determine VO2 Max category
          let vo2MaxCategory = 'AVERAGE';
          const vo2 = metrics.vo2Max || 0;
          
          // Categories based on age/gender (using general adult categories)
          // Excellent: > 40, Good: 30-40, Average: 20-30, Below Average: < 20
          if (vo2 > 40) {
            vo2MaxCategory = 'EXCELLENT';
          } else if (vo2 > 30) {
            vo2MaxCategory = 'GOOD';
          } else if (vo2 > 20) {
            vo2MaxCategory = 'AVERAGE';
          } else {
            vo2MaxCategory = 'BELOW_AVERAGE';
          }
          
          // Determine fitness age category
          let fitnessAgeCategory = 'NORMAL';
          const fitnessAge = metrics.fitnessAge || 0;
          const chronologicalAge = 30; // Default assumption if not available
          const ageDifference = fitnessAge - chronologicalAge;
          
          if (ageDifference < -10) {
            fitnessAgeCategory = 'EXCELLENT'; // 10+ years younger
          } else if (ageDifference < -5) {
            fitnessAgeCategory = 'GOOD'; // 5-10 years younger
          } else if (ageDifference <= 5) {
            fitnessAgeCategory = 'NORMAL'; // ±5 years
          } else {
            fitnessAgeCategory = 'BELOW_AVERAGE'; // 5+ years older
          }
          
          // Store user metrics
          const metricsFields = {
            userId,
            date,
            vo2Max: metrics.vo2Max,
            vo2MaxCategory,
            fitnessAge: metrics.fitnessAge,
            fitnessAgeCategory,
            isEnhanced: metrics.enhanced || false,
            summaryId: metrics.summaryId,
            rawData: metrics,
            syncedAt: new Date(),
          };
          
          // Try upsert - if conflict, update existing
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, userId),
              eq(garminWellnessMetrics.date, date)
            )
          });
          
          if (existing) {
            await db.update(garminWellnessMetrics)
              .set(metricsFields)
              .where(eq(garminWellnessMetrics.id, existing.id));
            console.log(`[Garmin Webhook] Updated user metrics for ${date}: VO2Max=${metrics.vo2Max} (${vo2MaxCategory}), FitnessAge=${metrics.fitnessAge} (${fitnessAgeCategory})`);
          } else {
            await db.insert(garminWellnessMetrics).values(metricsFields);
            console.log(`[Garmin Webhook] Created user metrics for ${date}: VO2Max=${metrics.vo2Max} (${vo2MaxCategory}), FitnessAge=${metrics.fitnessAge} (${fitnessAgeCategory})`);
          }
          
        } catch (metricsError: any) {
          console.error(`❌ [Garmin Webhook] Error processing user metrics:`, metricsError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'user-metrics',
            payload: metrics,
            error: metricsError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue user metrics for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${metricsData.length} user metrics records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] User metrics handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });
  // HEALTH - Skin Temperature (body temperature monitoring)
  // 5-minute interval readings throughout the day
  garminWebhook("skin-temperature", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received skin temperature push:', JSON.stringify(req.body).slice(0, 1000));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process skin temperature data asynchronously (non-blocking)
      const temperatureData = Array.isArray(req.body) ? req.body : (req.body.skinTemperature || []);
      
      if (temperatureData.length === 0) {
        console.log('[Garmin Webhook] No skin temperature data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${temperatureData.length} skin temperature records`);
      
      // Find users
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for skin temperature');
        return;
      }
      
      for (const temp of temperatureData) {
        try {
          const date = temp.calendarDate || new Date((temp.startTimeInSeconds || 0) * 1000).toISOString().split('T')[0];
          
          // Find user by recent activity matching date
          let userId: string | undefined;
          for (const device of devices) {
            const recentRun = await db.query.runs.findFirst({
              where: and(
                eq(runs.userId, device.userId),
                gte(runs.completedAt, new Date(`${date}T00:00:00`)),
                lte(runs.completedAt, new Date(`${date}T23:59:59`))
              ),
              limit: 1,
            });
            
            if (recentRun) {
              userId = device.userId;
              break;
            }
          }
          
          if (!userId) {
            console.warn(`⚠️ [Garmin Webhook] Could not map skin temperature to user for date ${date}`);
            continue;
          }
          
          console.log(`[Garmin Webhook] Processing skin temperature for user ${userId}, date: ${date}`);
          
          // Garmin sends avgDeviationCelsius (deviation from baseline)
          // Baseline human skin temp is ~33-34°C
          const baselineTemp = 33.5;
          const deviationValue = temp.avgDeviationCelsius || 0;
          const calculatedTemp = baselineTemp + deviationValue;
          
          // Determine trend: deviation shows if trending warmer or cooler
          let trendType = 'STABLE';
          if (deviationValue > 0.3) {
            trendType = 'WARMING'; // Skin warming up
          } else if (deviationValue < -0.3) {
            trendType = 'COOLING'; // Skin cooling down
          }
          
          // Insert skin temperature record
          const existing = await db.query.garminSkinTemperature.findFirst({
            where: and(
              eq(garminSkinTemperature.userId, userId),
              eq(garminSkinTemperature.date, date)
            )
          });
          
          const tempFields = {
            userId,
            date,
            avgTemperature: calculatedTemp,
            minTemperature: Math.min(calculatedTemp, baselineTemp - 1),
            maxTemperature: Math.max(calculatedTemp, baselineTemp + 1),
            temperatureTrendType: trendType,
            temperatureReadings: { avgDeviation: deviationValue, baselineTemp },
            summaryId: temp.summaryId,
            startTimeInSeconds: temp.startTimeInSeconds,
            startTimeOffsetInSeconds: temp.startTimeOffsetInSeconds,
            rawData: temp,
            syncedAt: new Date(),
          };
          
          if (existing) {
            await db.update(garminSkinTemperature)
              .set(tempFields)
              .where(eq(garminSkinTemperature.id, existing.id));
            console.log(`[Garmin Webhook] Updated skin temperature for ${date}: deviation=${deviationValue.toFixed(2)}°C (calculated=${calculatedTemp.toFixed(1)}°C), trend=${trendType}`);
          } else {
            await db.insert(garminSkinTemperature).values(tempFields);
            console.log(`[Garmin Webhook] Created skin temperature for ${date}: deviation=${deviationValue.toFixed(2)}°C (calculated=${calculatedTemp.toFixed(1)}°C), trend=${trendType}`);
          }
          
        } catch (tempError: any) {
          console.error(`❌ [Garmin Webhook] Error processing skin temperature:`, tempError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'skin-temperature',
            payload: temp,
            error: tempError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue skin temperature for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${temperatureData.length} skin temperature records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Skin temperature handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });
  garminWebhook("moveiq", garminAckHandler);
  garminWebhook("manually-updated-activities", garminAckHandler);
  garminWebhook("activity-files", garminAckHandler);
  // HEALTH - Menstrual Cycle & Pregnancy Tracking
  // Sensitive women's health data: menstrual cycle phases and pregnancy tracking
  garminWebhook("menstrual-cycle", async (req: Request, res: Response) => {
    try {
      console.log('[Garmin Webhook] Received menstrual-cycle push:', JSON.stringify(req.body).slice(0, 500));
      
      // IMPORTANT: Return 200 immediately to Garmin before processing
      res.status(200).json({ success: true });
      
      // Process cycle data asynchronously (non-blocking)
      const cycleData = Array.isArray(req.body) ? req.body : (req.body.menstrualCycles || []);
      
      if (cycleData.length === 0) {
        console.log('[Garmin Webhook] No menstrual cycle data in payload');
        return;
      }
      
      console.log(`[Garmin Webhook] Processing ${cycleData.length} menstrual cycle records`);
      
      // Find users
      const devices = await db.query.connectedDevices.findMany({
        where: eq(connectedDevices.deviceType, 'garmin'),
      });
      
      if (devices.length === 0) {
        console.warn('[Garmin Webhook] No active Garmin devices found for menstrual cycle');
        return;
      }
      
      for (const cycle of cycleData) {
        try {
          const date = cycle.periodStartDate || new Date().toISOString().split('T')[0];
          
          // Find user by recent activity matching period start date
          let userId: string | undefined;
          for (const device of devices) {
            const recentRun = await db.query.runs.findFirst({
              where: and(
                eq(runs.userId, device.userId),
                gte(runs.completedAt, new Date(`${date}T00:00:00`)),
                lte(runs.completedAt, new Date(new Date(`${date}T00:00:00`).getTime() + 30 * 24 * 60 * 60 * 1000)) // 30 days after
              ),
              limit: 1,
            });
            
            if (recentRun) {
              userId = device.userId;
              break;
            }
          }
          
          if (!userId) {
            console.warn(`⚠️ [Garmin Webhook] Could not map menstrual cycle to user for date ${date}`);
            continue;
          }
          
          console.log(`[Garmin Webhook] Processing menstrual cycle for user ${userId}, period start: ${date}`);
          
          // Map phase type to human-readable name
          const phaseTypeMap: { [key: string]: string } = {
            'FIRST_TRIMESTER': 'First Trimester',
            'SECOND_TRIMESTER': 'Second Trimester',
            'THIRD_TRIMESTER': 'Third Trimester',
            'MENSTRUATION': 'Menstruation',
            'FOLLICULAR': 'Follicular Phase',
            'OVULATION': 'Ovulation',
            'LUTEAL': 'Luteal Phase',
            'POSTPARTUM': 'Postpartum Recovery',
          };
          
          const phaseTypeName = phaseTypeMap[cycle.currentPhaseType] || cycle.currentPhaseType;
          
          // Determine cycle status
          let cycleStatus = 'ACTIVE';
          if (cycle.pregnancySnapshot) {
            if (cycle.pregnancySnapshot.stopTracking) {
              cycleStatus = 'STOPPED';
            } else if (cycle.currentPhaseType?.includes('TRIMESTER')) {
              cycleStatus = 'PREGNANT';
            } else if (cycle.currentPhaseType === 'POSTPARTUM') {
              cycleStatus = 'POSTPARTUM';
            }
          }
          
          // Store menstrual cycle data
          const cycleFields = {
            userId,
            cycleStartDate: cycle.periodStartDate,
            dayInCycle: cycle.dayInCycle,
            periodLength: cycle.periodLength,
            currentPhase: cycle.currentPhase,
            currentPhaseType: phaseTypeName,
            lengthOfCurrentPhase: cycle.lengthOfCurrentPhase,
            daysUntilNextPhase: cycle.daysUntilNextPhase,
            predictedCycleLength: cycle.predictedCycleLength,
            cycleLength: cycle.cycleLength,
            isPredictedCycle: cycle.isPredictedCycle,
            cycleStatus,
            summaryId: cycle.summaryId,
            lastUpdatedAt: new Date(Math.min(cycle.lastUpdatedTimeInSeconds * 1000, Date.now())),
            rawData: cycle,
            syncedAt: new Date(),
          };
          
          // If pregnancy data exists, add pregnancy-specific fields
          if (cycle.pregnancySnapshot) {
            const pregnancy = cycle.pregnancySnapshot;
            
            // Calculate current weeks of pregnancy
            const pregnancyStartDate = new Date(cycle.pregnancySnapshot.pregnancyCycleStartDate);
            const now = new Date();
            const weeksOfPregnancy = Math.floor((now.getTime() - pregnancyStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
            
            Object.assign(cycleFields, {
              pregnancyStatus: 'ACTIVE',
              pregnancyTitle: pregnancy.title,
              originalDueDate: pregnancy.originalDueDate,
              pregnancyDueDate: pregnancy.dueDate,
              pregnancyStartDate: pregnancy.pregnancyCycleStartDate,
              weeksOfPregnancy,
              expectedDeliveryDate: pregnancy.dueDate,
              deliveryDate: pregnancy.deliveryDate,
              numberOfBabies: pregnancy.numOfBabies, // SINGLE, TWIN, etc.
              hasExperiencedLoss: pregnancy.hasExperiencedLoss,
              heightInCentimeters: pregnancy.weightGoalUserInput?.heightInCentimeters,
              weightInGrams: pregnancy.weightGoalUserInput?.weightInGrams,
              bloodGlucoseReadings: pregnancy.bloodGlucoseList || [],
            });
          }
          
          // Use a upsert pattern - update if exists for same cycle, create if new
          // Key: user + cycle start date
          const existingCycle = await db.query.garminWellnessMetrics.findFirst({
            where: and(
              eq(garminWellnessMetrics.userId, userId)
            ),
            orderBy: (table) => desc(table.createdAt),
            limit: 1,
          });
          
          if (existingCycle && existingCycle.cycleStartDate === cycle.periodStartDate) {
            // Update existing cycle
            await db.update(garminWellnessMetrics)
              .set(cycleFields)
              .where(eq(garminWellnessMetrics.id, existingCycle.id));
            
            if (cycle.pregnancySnapshot) {
              console.log(`[Garmin Webhook] Updated pregnancy for user ${userId}: ${pregnancy.title}, ${weeksOfPregnancy} weeks, due ${pregnancy.dueDate}`);
            } else {
              console.log(`[Garmin Webhook] Updated cycle for user ${userId}: day ${cycle.dayInCycle} of ${cycle.cycleLength}, phase: ${phaseTypeName}`);
            }
          } else {
            // Create new cycle record
            await db.insert(garminWellnessMetrics).values(cycleFields);
            
            if (cycle.pregnancySnapshot) {
              const pregnancy = cycle.pregnancySnapshot;
              const weeksOfPregnancy = Math.floor((Date.now() - new Date(pregnancy.pregnancyCycleStartDate).getTime()) / (7 * 24 * 60 * 60 * 1000));
              console.log(`[Garmin Webhook] Created pregnancy tracking for user ${userId}: ${pregnancy.title}, ${weeksOfPregnancy} weeks, due ${pregnancy.dueDate}`);
            } else {
              console.log(`[Garmin Webhook] Created cycle for user ${userId}: day ${cycle.dayInCycle} of ${cycle.cycleLength}, phase: ${phaseTypeName}`);
            }
          }
          
        } catch (cycleError: any) {
          console.error(`❌ [Garmin Webhook] Error processing menstrual cycle:`, cycleError.message);
          // Queue for retry
          await db.insert(webhookFailureQueue).values({
            webhookType: 'menstrual-cycle',
            payload: cycle,
            error: cycleError.message,
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000),
          }).catch(queueError => {
            console.error(`❌ Failed to queue menstrual cycle for retry:`, queueError);
          });
        }
      }
      
      console.log(`[Garmin Webhook] Finished processing ${cycleData.length} menstrual cycle records`);
      
    } catch (error: any) {
      console.error('[Garmin Webhook] Menstrual cycle handler error:', error);
      // HTTP 200 already sent to Garmin
    }
  });

  // ==========================================
  // END GARMIN WEBHOOK ENDPOINTS
  // ==========================================

  // Helper function to calculate weather impact from runs
  async function calculateWeatherImpact(userId: string, runs: any[]) {
    if (runs.length < 2) {
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
    
    // Group runs by humidity range
    const humidityBuckets: Record<string, { totalPace: number; count: number }> = {};

    runs.forEach(run => {
      const pace = parsePace(run.avgPace);
      if (!pace) return;

      // Time of day from completedAt (in user's local time)
      if (run.completedAt) {
        const date = new Date(run.completedAt);
        // Use the Intl API to get the hour in the user's timezone (or use user.timezone if stored in DB)
        // For now, we use the default system behavior - the backend should get userTimezoneId from the request
        const timeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: run.userTimezoneId || 'UTC',
          hour: '2-digit',
          hour12: false
        }).format(date);
        const hour = parseInt(timeStr, 10);
        
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
      // Only bucket condition/temperature/humidity if we actually have weather data
      const condition = run.weatherData?.condition || run.weatherData?.description;
      if (condition) {
        if (!conditionBuckets[condition]) {
          conditionBuckets[condition] = { totalPace: 0, count: 0 };
        }
        conditionBuckets[condition].totalPace += pace;
        conditionBuckets[condition].count++;
      }

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
      
      // Humidity from weatherData
      const humidity = run.weatherData?.humidity;
      if (humidity !== undefined && humidity !== null) {
        let humidityLabel = '';
        if (humidity < 30) humidityLabel = 'Dry (<30%)';
        else if (humidity < 50) humidityLabel = 'Low (30-50%)';
        else if (humidity < 70) humidityLabel = 'Moderate (50-70%)';
        else humidityLabel = 'High (>70%)';
        
        if (!humidityBuckets[humidityLabel]) {
          humidityBuckets[humidityLabel] = { totalPace: 0, count: 0 };
        }
        humidityBuckets[humidityLabel].totalPace += pace;
        humidityBuckets[humidityLabel].count++;
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
    
    // Build humidity analysis
    const humidityAnalysis = Object.entries(humidityBuckets)
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
    const validTemperatureAnalysis = temperatureAnalysis.filter(t => t.paceVsAvg !== null);
    const validHumidityAnalysis = humidityAnalysis.filter(h => h.paceVsAvg !== null);
    
    // Find best (negative paceVsAvg = faster) and worst (positive paceVsAvg = slower)
    const bestTime = validTimeAnalysis.find(t => t.paceVsAvg! < 0);
    const worstTime = validTimeAnalysis.find(t => t.paceVsAvg! > 0);
    const bestCondition = validConditionAnalysis.find(c => c.paceVsAvg < 0);
    const worstCondition = validConditionAnalysis.find(c => c.paceVsAvg > 0);
    const bestTemperature = validTemperatureAnalysis.find(t => t.paceVsAvg! < 0);
    const worstTemperature = validTemperatureAnalysis.find(t => t.paceVsAvg! > 0);
    const bestHumidity = validHumidityAnalysis.find(h => h.paceVsAvg! < 0);
    const worstHumidity = validHumidityAnalysis.find(h => h.paceVsAvg! > 0);

    // Build strengths array (showing where the runner performs BEST)
    const strengths = [];
    if (bestTime) {
      strengths.push({
        label: bestTime.label,
        type: 'time_of_day',
        improvement: Math.abs(bestTime.paceVsAvg).toFixed(1),
      });
    }
    if (bestCondition) {
      strengths.push({
        label: bestCondition.condition,
        type: 'condition',
        improvement: Math.abs(bestCondition.paceVsAvg).toFixed(0),
      });
    }
    if (bestTemperature) {
      strengths.push({
        label: bestTemperature.label,
        type: 'temperature',
        improvement: Math.abs(bestTemperature.paceVsAvg).toFixed(1),
      });
    }
    if (bestHumidity) {
      strengths.push({
        label: bestHumidity.label,
        type: 'humidity',
        improvement: Math.abs(bestHumidity.paceVsAvg).toFixed(1),
      });
    }

    return {
      hasEnoughData: true,
      runsAnalyzed: runs.length,
      overallAvgPace: avgPaceSeconds,
      temperatureAnalysis,
      conditionAnalysis,
      humidityAnalysis,
      timeOfDayAnalysis,
      insights: {
        strengths: strengths.length > 0 ? strengths : undefined,
        bestTime: bestTime ? {
          label: bestTime.label,
          type: 'time_of_day',
          improvement: Math.abs(bestTime.paceVsAvg).toFixed(1),
        } : undefined,
        worstTime: worstTime ? {
          label: worstTime.label,
          type: 'time_of_day',
          slowdown: Math.abs(worstTime.paceVsAvg).toFixed(1),
        } : undefined,
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
        bestTemperature: bestTemperature ? {
          label: bestTemperature.label,
          type: 'temperature',
          improvement: Math.abs(bestTemperature.paceVsAvg).toFixed(1),
        } : undefined,
        worstTemperature: worstTemperature ? {
          label: worstTemperature.label,
          type: 'temperature',
          slowdown: Math.abs(worstTemperature.paceVsAvg).toFixed(1),
        } : undefined,
        bestHumidity: bestHumidity ? {
          label: bestHumidity.label,
          type: 'humidity',
          improvement: Math.abs(bestHumidity.paceVsAvg).toFixed(1),
        } : undefined,
        worstHumidity: worstHumidity ? {
          label: worstHumidity.label,
          type: 'humidity',
          slowdown: Math.abs(worstHumidity.paceVsAvg).toFixed(1),
        } : undefined,
      },
    };
  }

  // Wellness-aware pre-run briefing with Garmin data
  app.post("/api/coaching/pre-run-briefing", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, hasRoute, activityType, targetTime, targetPace, weather, trainingPlanId, planGoalType, planWeekNumber, planTotalWeeks, workoutType, workoutIntensity, workoutDescription } = req.body;
      
      // Extract timezone from weather payload if available
      const userTimezoneId = weather?.userTimezoneId;

      console.log(`[Pre-run briefing] Request data - distance: ${distance}, targetTime: ${targetTime}, targetPace: ${targetPace}, hasRoute: ${hasRoute}, timezone: ${userTimezoneId}, weather: ${JSON.stringify(weather)}`);

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
        elevationLoss: elevationLoss || 0,
        maxGradientDegrees: maxGradientDegrees || 0,
        difficulty: difficulty || 'moderate',
        activityType: activityType || 'run',
        weather,
        coachName,
        coachTone,
        coachAccent,
        wellness,
        hasRoute: hasRoute === true, // Only true if explicitly true - all other values become false
        targetTime: targetTime,
        targetPace: targetPace,
        weatherImpact: weatherImpactData,
        userTimezoneId: userTimezoneId,
        runnerName: req.body.runnerName || user?.name || undefined,
        fitnessLevel: user?.fitnessLevel || undefined,
        runnerProfile: (await getRunnerProfile(req.user!.userId).catch(() => null))?.profile ?? null,
        // Training plan context for personalized coaching
        trainingPlanId: trainingPlanId,
        planGoalType: planGoalType,
        planWeekNumber: planWeekNumber,
        planTotalWeeks: planTotalWeeks,
        workoutType: workoutType,
        workoutIntensity: workoutIntensity,
        workoutDescription: workoutDescription,
      });

      // Map the briefing text to 'text' field for client compatibility
      // Also generate TTS audio if we have text
      const briefingText = briefing.briefing;
      
      // Generate TTS audio for the briefing
      const briefingVoice = mapCoachVoice(coachGender, coachAccent, coachTone);
      const briefingTTSInstructions = await getCoachTTSInstructions(coachAccent, coachTone, coachGender, coachName);
      const audioBuffer = briefingText ? await aiService.generateTTS(briefingText, briefingVoice, briefingTTSInstructions, coachAccent, coachGender) : null;
      
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
      const talkTTSInstructions = await getCoachTTSInstructions(user?.coachAccent, coachTone, user?.coachGender, user?.coachName);
      const audioBuffer = await aiService.generateTTS(text, userVoice, talkTTSInstructions, user?.coachAccent, user?.coachGender);
      
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

  // Start Run Audio endpoint
  // Generates Polly TTS audio for motivational start run announcements
  app.post("/api/coaching/start-run-audio", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { motivationalText } = req.body;
      
      if (!motivationalText || motivationalText.trim().length === 0) {
        return res.status(400).json({ error: "Missing motivationalText" });
      }

      // Get user's coach settings
      const user = await storage.getUser(req.user!.userId);
      const coachGender = user?.coachGender || 'female';
      const coachTone = user?.coachTone || 'energetic';
      const coachAccent = user?.coachAccent || 'british';
      const coachName = user?.coachName || 'Coach';

      // Generate Polly TTS instructions for the start run announcement
      const ttsInstructions = await getCoachTTSInstructions(coachAccent, coachTone, coachGender, coachName);

      // Generate TTS audio
      const aiService = await import("./ai-service");
      const audioBuffer = await aiService.generateTTS(
        motivationalText,
        "default",  // voice (not used for Polly, but kept for API compatibility)
        ttsInstructions,
        coachAccent,
        coachGender
      );

      // Return as base64 for mobile playback
      const base64Audio = audioBuffer.toString('base64');

      console.log(`[Start Run Audio] Generated TTS for: "${motivationalText.substring(0, 50)}..." (accent: ${coachAccent}, tone: ${coachTone})`);

      res.json({
        audio: base64Audio,
        format: 'mp3',
        text: motivationalText
      });
    } catch (error: any) {
      console.error("[Start Run Audio] TTS generation error:", error);
      res.status(500).json({ error: "Failed to generate start run audio" });
    }
  });

  // ── Batch TTS pre-generation ────────────────────────────────────────────────
  // Pre-generates Polly audio for ALL coaching trigger messages at "Prepare Run" time
  // so that every in-run coaching cue plays instantly with the Polly voice (no Android TTS
  // fallback, no network latency mid-run). Called by the Android app after the coaching
  // plan is fetched and before the user taps Start.
  //
  // Request body: { texts: string[], accent?: string, gender?: string }
  // Response:     { audios: Array<{ text, audio: string (base64 mp3) | null, format }> }
  app.post("/api/coaching/batch-tts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { texts, accent: clientAccent, gender: clientGender } = req.body;

      if (!Array.isArray(texts) || texts.length === 0) {
        return res.status(400).json({ error: "texts must be a non-empty array" });
      }
      if (texts.length > 150) {
        return res.status(400).json({ error: "max 150 texts per batch" });
      }

      // Use user's stored voice settings as the source of truth
      const user = await storage.getUser(req.user!.userId);
      const accent = clientAccent || user?.coachAccent || "british";
      const gender = clientGender || user?.coachGender || "female";

      console.log(`[Batch TTS] Generating Polly audio for ${texts.length} coaching messages (${accent}/${gender})`);

      const { synthesizeSpeech } = await import("./polly-service");

      // Generate all audios in parallel — Polly handles concurrency well
      const settled = await Promise.allSettled(
        texts.map(async (text: string) => {
          if (!text || text.trim().length === 0) return { text, audio: null, format: "mp3" };
          const buffer = await synthesizeSpeech(text.trim(), accent, gender);
          return { text: text.trim(), audio: buffer.toString("base64"), format: "mp3" };
        })
      );

      const audios = settled.map((result, i) => {
        if (result.status === "fulfilled") return result.value;
        console.warn(`[Batch TTS] Failed for text[${i}]: "${texts[i]?.substring(0, 60)}" — ${(result as PromiseRejectedResult).reason?.message}`);
        return { text: texts[i], audio: null, format: "mp3" };
      });

      const successCount = audios.filter(a => a.audio !== null).length;
      console.log(`[Batch TTS] Done: ${successCount}/${texts.length} succeeded`);

      res.json({ audios });
    } catch (error: any) {
      console.error("[Batch TTS] Error:", error);
      res.status(500).json({ error: "Failed to generate batch TTS audio" });
    }
  });

  // Enhanced pre-run briefing with TTS audio
  // Uses AI-powered generateWellnessAwarePreRunBriefing() for intelligent, personalized content,
  // then generates OpenAI TTS audio from the AI response. Best of both worlds.
  app.post("/api/coaching/pre-run-briefing-audio", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, hasRoute, activityType, 
              weather: clientWeather, targetPace, targetTime, wellness: clientWellness, 
              turnInstructions, startLocation,
              // Training plan / coached-workout context
              trainingPlanId, planGoalType, planWeekNumber, planTotalWeeks,
              workoutType, workoutIntensity, workoutDescription } = req.body;
      
      // Get user's coach settings
      const user = await storage.getUser(req.user!.userId);
      const coachGender = user?.coachGender || 'female';
      const coachTone = user?.coachTone || 'energetic';
      const coachAccent = user?.coachAccent || 'british';
      const coachName = user?.coachName || 'Coach';
      const voice = mapCoachVoice(coachGender, coachAccent, coachTone);
      const audioBriefingTTSInstructions = await getCoachTTSInstructions(coachAccent, coachTone, coachGender, coachName);
      
      // Fetch weather if not provided
      let weather = clientWeather;
      const userTimezoneId = clientWeather?.userTimezoneId;  // Extract timezone from client
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
              userTimezoneId: userTimezoneId,  // Preserve timezone even when fetching weather
            };
          }
        } catch (e) {
          console.log('Weather fetch for audio briefing failed');
        }
      }
      
      // Fetch wellness data if not provided
      let wellnessData: any = clientWellness || {};
      if (!clientWellness) {
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
      
      // Fetch weather impact data — analyze user's historical runs to personalise briefing
      let weatherImpact: any;
      try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const allRecentRuns = await storage.getUserRuns(req.user!.userId, { limit: 500, offset: 0 });
        const runsWithWeather = allRecentRuns.filter((r: any) =>
          r.completedAt &&
          new Date(r.completedAt) >= ninetyDaysAgo &&
          (r.distance ?? 0) > 0.5 &&
          !!r.weatherData &&
          (!r.externalSource || r.externalSource === 'airuncoach')
        );
        weatherImpact = await calculateWeatherImpact(req.user!.userId, runsWithWeather);
      } catch (e: any) {
        console.warn('[Pre-run briefing] Weather impact analysis failed (non-fatal):', e?.message || e);
        // Continue without weather impact - briefing still works without it
      }
      
      const aiService = await import("./ai-service");
      
      // Use the AI-powered briefing function for intelligent, personalized content
      const aiBriefing = await aiService.generateWellnessAwarePreRunBriefing({
        distance: distance || 5,
        elevationGain: elevationGain || 0,
        elevationLoss: elevationLoss || 0,
        maxGradientDegrees: maxGradientDegrees || 0,
        difficulty: difficulty || 'unknown',
        activityType: activityType || 'run',
        weather,
        coachName,
        coachTone,
        coachAccent,
        wellness: wellnessData,
        hasRoute: hasRoute || false,
        targetTime: targetTime || null,
        targetPace: targetPace || null,
        weatherImpact,
        userTimezoneId: userTimezoneId,
        runnerName: req.body.runnerName || user?.name || undefined,
        fitnessLevel: user?.fitnessLevel || undefined,
        runnerProfile: (await getRunnerProfile(req.user!.userId).catch(() => null))?.profile ?? null,
        // Training plan context — enables workout-specific coaching briefings
        trainingPlanId,
        planGoalType,
        planWeekNumber,
        planTotalWeeks,
        workoutType,
        workoutIntensity,
        workoutDescription,
      });
      
      // Build natural speech text from ALL AI response fields
      const speechParts: string[] = [];
      if (aiBriefing.briefing) speechParts.push(aiBriefing.briefing);
      // For route runs: include route terrain insight; for free runs: include readiness insight
      if (aiBriefing.routeInsight) speechParts.push(aiBriefing.routeInsight);
      else if (aiBriefing.readinessInsight) speechParts.push(aiBriefing.readinessInsight);
      if (aiBriefing.intensityAdvice) speechParts.push(aiBriefing.intensityAdvice);
      if (aiBriefing.weatherAdvantage) speechParts.push(aiBriefing.weatherAdvantage);
      // Include warnings if any
      if (aiBriefing.warnings && aiBriefing.warnings.length > 0) {
        speechParts.push(aiBriefing.warnings.join('. '));
      }
      const speechText = speechParts.join(' ');
      
      // Generate TTS audio from AI-generated text (Polly Neural or OpenAI fallback)
      let base64Audio: string | null = null;
      try {
        const audioBuffer = await aiService.generateTTS(speechText, voice, audioBriefingTTSInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Pre-run briefing TTS failed, returning text only:", ttsError);
      }
      
      // Return both structured AI fields AND audio
      res.json({
        // AI-generated structured fields (for on-screen display)
        briefing: aiBriefing.briefing,
        intensityAdvice: aiBriefing.intensityAdvice,
        warnings: aiBriefing.warnings,
        readinessInsight: aiBriefing.routeInsight || aiBriefing.readinessInsight,
        weatherAdvantage: aiBriefing.weatherAdvantage,
        // OpenAI TTS audio
        audio: base64Audio,
        format: 'mp3',
        voice,
        // Combined text for fallback
        text: speechText,
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

  // Helper function to map user coach settings to OpenAI base voice
  // With gpt-4o-mini-tts, the base voice is just the vocal character —
  // accent and tone are controlled via the `instructions` parameter.
  const mapCoachVoice = (coachGender?: string, coachAccent?: string, coachTone?: string): string => {
    const tone = normalizeCoachTone(coachTone);
    
    if (coachGender === 'male') {
      // Male voices: echo (energetic/punchy), alloy (warm/motivational), onyx (deep/calm)
      if (tone === "energetic" || tone === "abrupt" || tone === "tough love" || tone === "toughlove") return 'echo';
      if (tone === "motivational" || tone === "inspirational" || tone === "playful" || tone === "humorous") return 'alloy';
      if (tone === "calm" || tone === "supportive" || tone === "encouraging" || tone === "zen" || tone === "mindful") return 'onyx';
      if (tone === "instructive" || tone === "factual" || tone === "analytical") return 'alloy';
      if (tone === "friendly") return 'alloy';
      return 'alloy'; // good default male voice
    } else {
      // Female voices: shimmer (bright/energetic), nova (warm/inspiring), fable (calm/storytelling)
      if (tone === "energetic" || tone === "abrupt" || tone === "tough love" || tone === "toughlove") return 'shimmer';
      if (tone === "motivational" || tone === "inspirational" || tone === "playful" || tone === "humorous") return 'nova';
      if (tone === "calm" || tone === "supportive" || tone === "encouraging" || tone === "zen" || tone === "mindful") return 'fable';
      if (tone === "instructive" || tone === "factual" || tone === "analytical") return 'nova';
      if (tone === "friendly") return 'nova';
      return 'nova'; // good default female voice
    }
  };

  // Build TTS instructions for gpt-4o-mini-tts (accent, tone, style)
  const getCoachTTSInstructions = async (coachAccent?: string, coachTone?: string, coachGender?: string, coachName?: string): Promise<string> => {
    const ai = await import("./ai-service");
    return ai.buildTTSInstructions(coachAccent, coachTone, coachGender, coachName);
  };

  // Helper: optionally fetch runner profile if userId is provided in the coaching request body.
  // Silently returns null if not available so in-run coaching degrades gracefully.
  const getCoachingProfile = async (body: any): Promise<string | null> => {
    const uid = body.userId ?? body.user_id;
    if (!uid) return null;
    return getRunnerProfile(Number(uid)).catch(() => null);
  };

  // Helper: resolve all coach voice/persona settings from the DB.
  // This overrides whatever the Android sends, ensuring the correct user preferences are
  // always applied even if the Android caches stale values between sessions.
  //
  // Resolved fields:
  //   coachGender  — affects Polly voice selection (male/female)
  //   coachAccent  — affects Polly voice selection (british/irish/australian/…)
  //   coachTone    — affects Polly voice selection AND AI text generation personality
  //   coachName    — used in TTS instructions and AI prompt personality
  //
  // Falls back gracefully to req.body values if the DB lookup fails or userId is absent.
  const resolveVoiceSettings = async (body: any): Promise<{
    coachGender: string;
    coachAccent: string;
    coachTone: string;
    coachName: string;
  }> => {
    const uid = body.userId ?? body.user_id;
    let coachGender: string = body.coachGender || 'female';
    let coachAccent: string = body.coachAccent || 'british';
    let coachTone: string   = body.coachTone   || 'energetic';
    let coachName: string   = body.coachName   || 'AI Coach';
    if (uid) {
      try {
        const user = await storage.getUser(String(uid));
        if (user) {
          if (user.coachGender) coachGender = user.coachGender;
          if (user.coachAccent) coachAccent = user.coachAccent;
          if (user.coachTone)   coachTone   = user.coachTone;
          if (user.coachName)   coachName   = user.coachName;
        }
      } catch { /* non-fatal — fall back to req.body values */ }
    }
    return { coachGender, coachAccent, coachTone, coachName };
  };

  // Pace Update Coaching with TTS
  app.post("/api/coaching/pace-update", async (req: Request, res: Response) => {
    try {
      const coachingUserId = req.body.userId ?? req.body.user_id ?? null;
      const cooldown = await checkCooldown('pace-update', req.body, coachingUserId);
      if (!cooldown.allowed) return res.json(buildSkipResponse(cooldown));

      // Resolve voice settings from DB — overrides stale Android values
      const { coachGender, coachAccent, coachTone: dbCoachTone, coachName: dbCoachName } = await resolveVoiceSettings(req.body);
      req.body.coachGender = coachGender;
      req.body.coachAccent = coachAccent;
      req.body.coachTone   = dbCoachTone;   // DB-authoritative tone (base; may be overridden by getPhaseTone below)
      req.body.coachName   = dbCoachName;   // DB-authoritative coach name
      const baseTone = req.body.coachTone;
      // Use effectiveTone for AI personality only; voice selection stays on baseTone
      const effectiveTone = getPhaseTone(
        baseTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;

      // Sanitize numeric fields to prevent type errors in AI service
      // Ensure currentGrade is a number or undefined, not null or string
      if (req.body.currentGrade !== undefined && typeof req.body.currentGrade !== 'number') {
        const parsed = parseFloat(req.body.currentGrade);
        req.body.currentGrade = isNaN(parsed) ? undefined : parsed;
      }

      const aiService = await import("./ai-service");
      const runnerProfile = await getCoachingProfile(req.body);
      const message = await aiService.generatePaceUpdate({ ...req.body, runnerProfile });
      
      // Generate TTS audio - use BASE tone for voice consistency (same voice throughout run)
      let base64Audio: string | null = null;
      try {
        const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
        const ttsInstructions = await getCoachTTSInstructions(coachAccent, baseTone, coachGender, req.body.coachName);
        const audioBuffer = await aiService.generateTTS(message, voice, ttsInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Pace update TTS failed, returning text only:", ttsError);
      }

      recordFired(coachingUserId, cooldown.isMilestone);
      res.json({ 
        message,
        nextPace: req.body.currentPace, // Fallback
        audio: base64Audio,
        format: base64Audio ? 'mp3' : null
      });
    } catch (error: any) {
      console.error("Pace update coaching error:", error);
      res.status(500).json({ error: "Failed to get pace update" });
    }
  });

  // Struggle Coaching with TTS
  app.post("/api/coaching/struggle-coaching", async (req: Request, res: Response) => {
    try {
      const coachingUserId = req.body.userId ?? req.body.user_id ?? null;
      const cooldown = await checkCooldown('struggle-coaching', req.body, coachingUserId);
      if (!cooldown.allowed) return res.json(buildSkipResponse(cooldown));

      // Resolve voice settings from DB — overrides stale Android values
      const { coachGender, coachAccent, coachTone: dbCoachTone, coachName: dbCoachName } = await resolveVoiceSettings(req.body);
      req.body.coachGender = coachGender;
      req.body.coachAccent = coachAccent;
      req.body.coachTone   = dbCoachTone;   // DB-authoritative tone (base; may be overridden by getPhaseTone below)
      req.body.coachName   = dbCoachName;   // DB-authoritative coach name
      const baseTone = req.body.coachTone;
      // Use effectiveTone for AI personality only; voice selection stays on baseTone
      const effectiveTone = getPhaseTone(
        baseTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;

      const aiService = await import("./ai-service");
      const runnerProfile = await getCoachingProfile(req.body);
      const message = await aiService.generateStruggleCoaching({ ...req.body, runnerProfile });
      
      // Generate TTS audio - use BASE tone for voice consistency (same voice throughout run)
      let base64Audio: string | null = null;
      try {
        const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
        const ttsInstructions = await getCoachTTSInstructions(coachAccent, baseTone, coachGender, req.body.coachName);
        const audioBuffer = await aiService.generateTTS(message, voice, ttsInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Struggle coaching TTS failed, returning text only:", ttsError);
      }

      recordFired(coachingUserId, cooldown.isMilestone);
      res.json({ 
        message,
        audio: base64Audio,
        format: base64Audio ? 'mp3' : null
      });
    } catch (error: any) {
      console.error("Struggle coaching error:", error);
      res.status(500).json({ error: "Failed to get struggle coaching" });
    }
  });

  // Cadence/Stride Coaching with TTS - analyzes overstriding/understriding
  app.post("/api/coaching/cadence-coaching", async (req: Request, res: Response) => {
    try {
      const coachingUserId = req.body.userId ?? req.body.user_id ?? null;
      const cooldown = await checkCooldown('cadence-coaching', req.body, coachingUserId);
      if (!cooldown.allowed) return res.json(buildSkipResponse(cooldown));

      // Resolve voice settings from DB — overrides stale Android values
      const { coachGender, coachAccent, coachTone: dbCoachTone, coachName: dbCoachName } = await resolveVoiceSettings(req.body);
      req.body.coachGender = coachGender;
      req.body.coachAccent = coachAccent;
      req.body.coachTone   = dbCoachTone;   // DB-authoritative tone (base; may be overridden by getPhaseTone below)
      req.body.coachName   = dbCoachName;   // DB-authoritative coach name
      const aiService = await import("./ai-service");
      const runnerProfile = await getCoachingProfile(req.body);
      const message = await aiService.generateCadenceCoaching({ ...req.body, runnerProfile });
      
      // Generate TTS audio with user's voice settings (resilient - falls back to text-only)
      let base64Audio: string | null = null;
      try {
        const { coachTone } = req.body;
        const voice = mapCoachVoice(coachGender, coachAccent, coachTone);
        const ttsInstructions = await getCoachTTSInstructions(coachAccent, coachTone, coachGender, req.body.coachName);
        const audioBuffer = await aiService.generateTTS(message, voice, ttsInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Cadence coaching TTS failed, returning text only:", ttsError);
      }

      recordFired(coachingUserId, cooldown.isMilestone);
      res.json({ 
        message,
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error: any) {
      console.error("Cadence coaching error:", error);
      res.status(500).json({ error: "Failed to get cadence coaching" });
    }
  });

  // Elevation Coaching with TTS
  app.post("/api/coaching/elevation-coaching", async (req: Request, res: Response) => {
    try {
      const coachingUserId = req.body.userId ?? req.body.user_id ?? null;
      const cooldown = await checkCooldown('elevation-coaching', req.body, coachingUserId);
      if (!cooldown.allowed) return res.json(buildSkipResponse(cooldown));

      // Resolve voice settings from DB — overrides stale Android values
      const { coachGender, coachAccent, coachTone: dbCoachTone, coachName: dbCoachName } = await resolveVoiceSettings(req.body);
      req.body.coachGender = coachGender;
      req.body.coachAccent = coachAccent;
      req.body.coachTone   = dbCoachTone;   // DB-authoritative tone (base; may be overridden by getPhaseTone below)
      req.body.coachName   = dbCoachName;   // DB-authoritative coach name
      const aiService = await import("./ai-service");
      const runnerProfile = await getCoachingProfile(req.body);
      const message = await aiService.getElevationCoaching({ ...req.body, runnerProfile });
      
      // Generate TTS audio with user's voice settings
      let base64Audio: string | null = null;
      try {
        const { coachTone } = req.body;
        const voice = mapCoachVoice(coachGender, coachAccent, coachTone);
        const ttsInstructions = await getCoachTTSInstructions(coachAccent, coachTone, coachGender, req.body.coachName);
        const audioBuffer = await aiService.generateTTS(message, voice, ttsInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Elevation coaching TTS failed, returning text only:", ttsError);
      }

      recordFired(coachingUserId, cooldown.isMilestone);
      res.json({ 
        message,
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error: any) {
      console.error("Elevation coaching error:", error);
      res.status(500).json({ error: "Failed to get elevation coaching" });
    }
  });

  // Elite Coaching with TTS — technique, milestones, positive reinforcement, target ETA, pace trends, elevation insights
  app.post("/api/coaching/elite-coaching", async (req: Request, res: Response) => {
    try {
      const coachingUserId = req.body.userId ?? req.body.user_id ?? null;
      const cooldown = await checkCooldown('elite-coaching', req.body, coachingUserId);
      if (!cooldown.allowed) return res.json(buildSkipResponse(cooldown));

      // Resolve voice settings from DB — overrides stale Android values
      const { coachGender, coachAccent, coachTone: dbCoachTone, coachName: dbCoachName } = await resolveVoiceSettings(req.body);
      req.body.coachGender = coachGender;
      req.body.coachAccent = coachAccent;
      req.body.coachTone   = dbCoachTone;   // DB-authoritative tone (base; may be overridden by getPhaseTone below)
      req.body.coachName   = dbCoachName;   // DB-authoritative coach name
      const aiService = await import("./ai-service");
      const runnerProfile = await getCoachingProfile(req.body);
      const message = await aiService.generateEliteCoaching({ ...req.body, runnerProfile });

      // Skip TTS if AI returned empty (e.g. no terrain coaching for route-less runs)
      if (!message) {
        return res.json({ message: "", audio: null, format: "mp3" });
      }

      // Generate TTS audio with user's voice settings
      let base64Audio: string | null = null;
      try {
        const { coachTone } = req.body;
        const voice = mapCoachVoice(coachGender, coachAccent, coachTone);
        const ttsInstructions = await getCoachTTSInstructions(coachAccent, coachTone, coachGender, req.body.coachName);
        const audioBuffer = await aiService.generateTTS(message, voice, ttsInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Elite coaching TTS failed, returning text only:", ttsError);
      }

      recordFired(coachingUserId, cooldown.isMilestone);
      res.json({
        message,
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error: any) {
      console.error("Elite coaching error:", error);
      res.status(500).json({ error: "Failed to get elite coaching" });
    }
  });

  // Phase Coaching with TTS
  app.post("/api/coaching/phase-coaching", async (req: Request, res: Response) => {
    try {
      const coachingUserId = req.body.userId ?? req.body.user_id ?? null;
      const cooldown = await checkCooldown('phase-coaching', req.body, coachingUserId);
      if (!cooldown.allowed) return res.json(buildSkipResponse(cooldown));

      // Resolve voice settings from DB — overrides stale Android values (fixes wrong accent/voice)
      const { coachGender, coachAccent, coachTone: dbCoachTone, coachName: dbCoachName } = await resolveVoiceSettings(req.body);
      req.body.coachGender = coachGender;
      req.body.coachAccent = coachAccent;
      req.body.coachTone   = dbCoachTone;   // DB-authoritative tone (base; may be overridden by getPhaseTone below)
      req.body.coachName   = dbCoachName;   // DB-authoritative coach name
      const baseTone = req.body.coachTone;
      // Use effectiveTone for AI personality only; voice selection stays on baseTone for consistency
      const effectiveTone = getPhaseTone(
        baseTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;

      const aiService = await import("./ai-service");
      const runnerProfile = await getCoachingProfile(req.body);
      const message = await aiService.generatePhaseCoaching({ ...req.body, runnerProfile });
      
      // Generate TTS audio - use BASE tone for voice consistency (same voice throughout run)
      let base64Audio: string | null = null;
      try {
        const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
        const phaseTTSInstructions = await getCoachTTSInstructions(coachAccent, baseTone, coachGender, req.body.coachName);
        const audioBuffer = await aiService.generateTTS(message, voice, phaseTTSInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Phase coaching TTS failed, returning text only:", ttsError);
      }

      recordFired(coachingUserId, cooldown.isMilestone);
      res.json({ 
        message,
        nextPhase: null,
        audio: base64Audio,
        format: base64Audio ? 'mp3' : null
      });
    } catch (error: any) {
      console.error("Phase coaching error:", error);
      res.status(500).json({ error: "Failed to get phase coaching" });
    }
  });

  // Interval-specific coaching (work and recovery phases)
  // Note: interval-coaching is always treated as a milestone — every interval transition matters.
  app.post("/api/coaching/interval-coaching", async (req: Request, res: Response) => {
    try {
      const coachingUserId = req.body.userId ?? req.body.user_id ?? null;
      // interval-coaching is milestone by design — checkCooldown returns allowed:true immediately
      const cooldown = await checkCooldown('interval-coaching', req.body, coachingUserId);

      // Resolve voice settings from DB — overrides stale Android values
      const { coachGender, coachAccent, coachTone: dbCoachTone, coachName: dbCoachName } = await resolveVoiceSettings(req.body);
      req.body.coachGender = coachGender;
      req.body.coachAccent = coachAccent;
      req.body.coachTone   = dbCoachTone;   // DB-authoritative tone (base; may be overridden by getPhaseTone below)
      req.body.coachName   = dbCoachName;   // DB-authoritative coach name
      const baseTone = req.body.coachTone;
      
      const aiService = await import("./ai-service");
      const message = await aiService.generateIntervalCoaching(req.body);
      
      // Generate TTS audio
      let base64Audio: string | null = null;
      try {
        const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
        const intervalTTSInstructions = await getCoachTTSInstructions(coachAccent, baseTone, coachGender, req.body.coachName);
        const audioBuffer = await aiService.generateTTS(message, voice, intervalTTSInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Interval coaching TTS failed, returning text only:", ttsError);
      }

      recordFired(coachingUserId, cooldown.isMilestone);
      res.json({
        message,
        audio: base64Audio,
        format: base64Audio ? 'mp3' : null
      });
    } catch (error: any) {
      console.error("Interval coaching error:", error);
      res.status(500).json({ error: "Failed to get interval coaching" });
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
      
      // If no target pace provided in context, try to infer from training plan or race goal
      if (!context.targetPace && (context.distance !== undefined && context.totalDistance !== undefined)) {
        try {
          // Look for active training plan with session pace
          const activePlan = await db.query.trainingPlans.findFirst({
            where: (p, { eq, and }) => and(
              eq(p.userId, req.user!.userId),
              eq(p.isActive, true)
            ),
          });
          
          if (activePlan && activePlan.mainEffortPaceMin && activePlan.mainEffortPaceMax) {
            // Use average of pace range
            const avgSeconds = (activePlan.mainEffortPaceMin + activePlan.mainEffortPaceMax) / 2;
            const minPart = Math.floor(avgSeconds / 60);
            const secPart = Math.round(avgSeconds % 60);
            context.targetPace = `${minPart}:${secPart.toString().padStart(2, '0')}`;
          } else if (user?.raceGoalPace) {
            // Fallback to race goal pace if available
            context.targetPace = user.raceGoalPace;
          }
        } catch (paceError) {
          // Silently fail — proceed without target pace
          console.debug("Could not determine target pace:", paceError);
        }
      }
      
      const effectiveTone = getPhaseTone(
        baseTone,
        context.distance,
        context.totalDistance,
        context.phase
      );

      // Add coach settings to context - effectiveTone drives AI personality
      context.coachTone = effectiveTone;
      context.coachName = coachName;
      context.coachAccent = user?.coachAccent || req.body.coachAccent || undefined;
      
      const aiService = await import("./ai-service");
      const response = await aiService.getWellnessAwareCoachingResponse(message, context);
      
      // Generate TTS audio - use BASE tone for voice consistency (same voice throughout run)
      let base64Audio: string | null = null;
      try {
        const coachGender = user?.coachGender || 'female';
        const coachAccent = user?.coachAccent || 'british';
        const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
        const eliteTTSInstructions = await getCoachTTSInstructions(coachAccent, baseTone, coachGender, user?.coachName);
        const audioBuffer = await aiService.generateTTS(response, voice, eliteTTSInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("Talk to coach TTS failed, returning text only:", ttsError);
      }
      
      res.json({ 
        message: response,
        audio: base64Audio,
        format: base64Audio ? 'mp3' : null
      });
    } catch (error: any) {
      console.error("Talk to coach error:", error);
      res.status(500).json({ error: "Failed to get coaching response" });
    }
  });

  // Heart rate zone coaching
  app.post("/api/coaching/hr-coaching", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachingUserId = req.user?.userId ?? req.body.userId ?? req.body.user_id ?? null;
      const cooldown = await checkCooldown('hr-coaching', req.body, coachingUserId);
      if (!cooldown.allowed) return res.json(buildSkipResponse(cooldown));

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
      // Prefer age sent from the device (req.body.runnerAge), fall back to profile
      const runnerAge = req.body.runnerAge ?? (user as any)?.age ?? undefined;
      const response = await aiService.generateHeartRateCoaching({
        currentHR,
        avgHR,
        maxHR: maxHR || 190,
        targetZone,
        elapsedMinutes: elapsedMinutes || 0,
        coachName,
        coachTone: effectiveTone,
        coachAccent: user?.coachAccent || 'british',
        coachGender: user?.coachGender,
        wellness,
        runnerAge,
        fitnessLevel: req.body.fitnessLevel ?? (user as any)?.fitnessLevel ?? undefined,
        runnerName: req.body.runnerName ?? user?.name ?? undefined,
        runnerProfile: (await getRunnerProfile(req.user!.userId).catch(() => null))?.profile ?? null,
      });
      
      // Generate TTS audio - use BASE tone for voice consistency (same voice throughout run)
      let base64Audio: string | null = null;
      try {
        const coachGender = user?.coachGender || 'female';
        const coachAccent = user?.coachAccent || 'british';
        const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
        const eliteTTSInstructions = await getCoachTTSInstructions(coachAccent, baseTone, coachGender, user?.coachName);
        const audioBuffer = await aiService.generateTTS(response, voice, eliteTTSInstructions, coachAccent, coachGender);
        base64Audio = audioBuffer.toString('base64');
      } catch (ttsError) {
        console.warn("HR coaching TTS failed, returning text only:", ttsError);
      }

      recordFired(coachingUserId, cooldown.isMilestone);
      res.json({ 
        message: response,
        audio: base64Audio,
        format: base64Audio ? 'mp3' : null
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
      
      // Generate a companion session token (JWT).
      // Watch tokens are long-lived (1 year) because the watch cannot refresh tokens
      // independently — it only receives new tokens when the user opens the phone app.
      // A 30-day expiry caused IQ error crashes on watch cold-opens after a month of use.
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign(
        { userId: user.id, type: "companion", deviceId },
        process.env.SESSION_SECRET || "fallback-secret",
        { expiresIn: "365d" }
      );
      
      console.log(`[Companion] User ${user.email} authenticated from device ${deviceModel || deviceId}`);

      // Mark this user as a Garmin watch app user (for update broadcast targeting)
      const now = new Date();
      const watchAppUpdate: Record<string, any> = {
        hasGarminWatchApp: true,
        garminWatchAppLastSeenAt: now,
      };
      if (!user.hasGarminWatchApp) {
        watchAppUpdate.garminWatchAppFirstSeenAt = now;
      }
      await db.update(users).set(watchAppUpdate).where(eq(users.id, user.id));

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
  
  // ── Watch token refresh — called by phone app when watch connects ───────���────
  // The phone calls this (with its own auth JWT) to generate a fresh 365-day
  // companion token, then forwards it to the watch over Bluetooth.  This means
  // every time the user opens the phone app with their watch nearby, the token
  // on the watch is silently renewed — in practice the 1-year expiry is never hit.
  app.post("/api/garmin-companion/refresh-watch-token", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { deviceId, deviceModel } = req.body;

      const jwt = await import("jsonwebtoken");
      const freshToken = jwt.default.sign(
        { userId, type: "companion", deviceId: deviceId || "phone-issued" },
        process.env.SESSION_SECRET || "fallback-secret",
        { expiresIn: "365d" }
      );

      // Update last-seen timestamp so we know the watch is still in active use
      await db
        .update(users)
        .set({ garminWatchAppLastSeenAt: new Date() })
        .where(eq(users.id, userId));

      console.log(`[Companion] Token refreshed for user ${userId} (device: ${deviceModel || deviceId || "unknown"})`);
      res.json({ token: freshToken, expiresIn: 365 * 24 * 60 * 60 });
    } catch (error: any) {
      console.error("Watch token refresh error:", error);
      res.status(500).json({ error: "Token refresh failed" });
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
      
      // Accept both dedicated companion tokens (type: "companion") and regular app tokens.
      // The watch receives the phone's login JWT via Bluetooth and uses it directly for
      // HTTP requests, so we must not reject tokens that lack the "companion" type claim.
      if (!decoded.userId) {
        return res.status(401).json({ error: "Invalid token" });
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
      // plannedWorkoutId is optional — only present when the user started this run
      // from a coaching plan session in the iOS/web app.  It is stored so that when
      // the Garmin activity webhook arrives after the run, we can automatically mark
      // the planned session as Done even for watch-only runs.
      const { sessionId, deviceId, deviceModel, activityType, plannedWorkoutId } = req.body;
      
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
        plannedWorkoutId: plannedWorkoutId || null,
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
  // ── In-memory coaching cue queue (sessionId → pending cue) ─────────────────
  // iOS posts a cue here; the next watch data POST response delivers it and clears it.
  const pendingCues = new Map<string, { text: string; postedAt: number }>();

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
      
      // Deliver any pending coaching cue and clear it
      const pendingCue = pendingCues.get(data.sessionId);
      if (pendingCue) {
        pendingCues.delete(data.sessionId);
        return res.json({ success: true, id: inserted.id, coaching: pendingCue.text });
      }

      res.json({ success: true, id: inserted.id });
    } catch (error: any) {
      console.error("Companion data error:", error);
      res.status(500).json({ error: "Failed to save data" });
    }
  });

  // ── iOS → POST coaching cue for watch ────────────────────────────────────
  // iOS app POSTs here after AI generates a cue; next watch data push will deliver it.
  app.post("/api/live-session/cue", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId, cue } = req.body as { sessionId: string; cue: string };
      if (!sessionId || !cue) {
        return res.status(400).json({ error: "sessionId and cue required" });
      }
      pendingCues.set(sessionId, { text: cue, postedAt: Date.now() });
      console.log(`[LiveSession] Coaching cue queued for ${sessionId}: "${cue}"`);
      res.json({ success: true, queued: true });
    } catch (error: any) {
      console.error("Queue cue error:", error);
      res.status(500).json({ error: "Failed to queue cue" });
    }
  });

  // ── Watch → GET pending coaching cue (alternative to cue-in-response) ────
  // Galaxy Watch / future watches can poll this directly if preferred.
  app.get("/api/live-session/cue", async (req: Request, res: Response) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) return res.status(400).json({ error: "sessionId required" });
      const cue = pendingCues.get(sessionId);
      if (cue) {
        pendingCues.delete(sessionId);
        return res.json({ cue: cue.text, delivered: true });
      }
      res.json({ cue: null, delivered: false });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get cue" });
    }
  });

  // ── iOS → GET latest metrics from active Garmin session ──────────────────
  // GarminLiveSessionManager.swift polls this every 3 seconds during a run.
  // Accepts ?sessionId=xxx  OR  ?userId=xxx (resolves active session automatically).
  app.get("/api/live-session/metrics", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      let { sessionId } = req.query as { sessionId?: string };

      // If no sessionId supplied, find the user's active session
      if (!sessionId) {
        const [active] = await db.select().from(garminCompanionSessions)
          .where(and(
            eq(garminCompanionSessions.userId, userId),
            eq(garminCompanionSessions.status, "active")
          ))
          .orderBy(sql`started_at DESC`)
          .limit(1);
        sessionId = active?.sessionId;
      }

      if (!sessionId) {
        return res.json({ active: false, metrics: null, session: null });
      }

      const [latest] = await db.select().from(garminRealtimeData)
        .where(eq(garminRealtimeData.sessionId, sessionId))
        .orderBy(sql`timestamp DESC`)
        .limit(1);

      const [session] = await db.select().from(garminCompanionSessions)
        .where(eq(garminCompanionSessions.sessionId, sessionId))
        .limit(1);

      res.json({
        active: !!session,
        sessionId,
        session,
        metrics: latest ?? null,
        // Also surface any pending cue so iOS UI can show it
        pendingCue: pendingCues.get(sessionId)?.text ?? null,
      });
    } catch (error: any) {
      console.error("Live session metrics error:", error);
      res.status(500).json({ error: "Failed to get metrics" });
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
      const { sessionId, summary, kmSplits } = req.body;
      
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

      // ── Create a permanent run record in the runs table ────────────────────
      let newRunId: string | null = null;
      try {
        const distanceKm = stats.totalDistance ? stats.totalDistance / 1000 : 0;
        const durationSecs = stats.totalDuration || 0;

        // Only save if there's meaningful data (at least 100m and 30s)
        if (distanceKm >= 0.1 && durationSecs >= 30) {
          // ── Dedup guard ─────────────────────────────────────────────────────
          // The phone may have also tracked this run (it received the watch's
          // "start" command early via BT) and already uploaded a record via
          // POST /api/runs.  Check for a phone-uploaded run within the last
          // 2 hours with a similar distance (±10%) — if found, link the session
          // to it and skip creating a second record.
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
          const existingPhoneRuns = await db
            .select({ id: runs.id, distance: runs.distance })
            .from(runs)
            .where(and(
              eq(runs.userId, userId),
              gte(runs.createdAt, twoHoursAgo),
              isNull(runs.externalId),          // phone uploads have no externalId
            ))
            .limit(10);
          const phoneMatchedRun = existingPhoneRuns.find(r =>
            Math.abs((r.distance ?? 0) - distanceKm) / Math.max(distanceKm, 0.1) < 0.1
          );
          if (phoneMatchedRun) {
            console.log(`[Companion] session/end — phone run ${phoneMatchedRun.id} already exists for this session, linking instead of duplicating`);
            await db.update(garminCompanionSessions)
              .set({ linkedRunId: phoneMatchedRun.id } as any)
              .where(eq(garminCompanionSessions.sessionId, sessionId));
            newRunId = phoneMatchedRun.id;
          } else {

          // Format avg pace as mm:ss string
          let avgPaceStr: string | null = null;
          if (stats.avgPace && stats.avgPace > 0) {
            const totalSecs = Math.round(stats.avgPace);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            avgPaceStr = `${mins}:${secs.toString().padStart(2, '0')}`;
          }

          const now = new Date();
          // ── Build HR time-series from garminRealtimeData (standalone watch runs) ─
          // The garminRealtimeData table contains full per-second HR data sent via HTTP
          // during standalone runs (BT streaming is disabled when phone is connected, so
          // this table is populated ONLY for standalone runs).  Use it to build a proper
          // heartRateData flat number[] array — far better than the one-per-km kmSplits.
          let heartRateData: any[] | null = null;
          let paceData: any[] | null = null;
          let altitudeData: any[] | null = null;
          let storedKmSplits: any[] | null = null;

          const allDataPoints = await db.select()
            .from(garminRealtimeData)
            .where(eq(garminRealtimeData.sessionId, sessionId))
            .orderBy(garminRealtimeData.timestamp);

          let gpsTrackFromData: any[] | null = null;

          if (allDataPoints.length >= 10) {
            // Build a flat number[] heartRateData from per-second rows (already ordered)
            const hrSamples = allDataPoints
              .filter(d => d.heartRate != null && d.heartRate > 20)
              .map(d => d.heartRate as number);
            if (hrSamples.length >= 5) heartRateData = hrSamples;

            // Build pace array from stored pace values (sec/km)
            const paceSamples = allDataPoints
              .filter(d => d.pace != null && d.pace > 0)
              .map(d => d.pace as number);
            if (paceSamples.length >= 5) paceData = paceSamples;

            // Build GPS track — same format as phone uploads:
            // array of {latitude, longitude, heartRate?, cadence?, altitude?, speed?}
            const gpsSamples = allDataPoints.filter(d => d.latitude != null && d.longitude != null);
            if (gpsSamples.length >= 3) {
              gpsTrackFromData = gpsSamples.map(d => ({
                latitude:  d.latitude,
                longitude: d.longitude,
                altitude:  d.altitude   ?? null,
                speed:     d.speed      ?? null,
                heartRate: d.heartRate  ?? null,
                cadence:   d.cadence    ?? null,
              }));
            }
          }

          // Fall back to km splits for any series not already built from garminRealtimeData
          if (kmSplits && Array.isArray(kmSplits) && kmSplits.length > 0) {
            storedKmSplits = kmSplits;

            // Only build from kmSplits if garminRealtimeData didn't provide better data
            let elapsed = 0;
            const kmHr: any[]   = [];
            const kmPace: any[] = [];
            const kmAlt: any[]  = [];
            for (const split of kmSplits) {
              const midpoint = elapsed + Math.round((split.duration || 0) / 2);
              if (split.hr != null)   kmHr.push({ time: midpoint, value: split.hr });
              if (split.pace != null && split.pace > 0) kmPace.push({ time: midpoint, value: split.pace });
              elapsed += (split.duration || 0);
            }
            let cumAscent = 0;
            for (const split of kmSplits) {
              cumAscent += (split.elevGain || 0);
              kmAlt.push({ km: split.km, value: cumAscent });
            }
            // Prefer garminRealtimeData series; fall back to kmSplits series
            if (!heartRateData && kmHr.length > 0)    heartRateData = kmHr;
            if (!paceData     && kmPace.length > 0)   paceData      = kmPace;
            if (kmAlt.length > 0)                     altitudeData  = kmAlt;
          }

          const [newRun] = await db.insert(runs).values({
            userId,
            distance: distanceKm,
            duration: durationSecs,
            avgPace: avgPaceStr,
            avgHeartRate: stats.avgHeartRate ?? null,
            maxHeartRate: stats.maxHeartRate ?? null,
            cadence: stats.avgCadence ?? null,
            elevationGain: stats.totalAscent ?? null,
            elevationLoss: stats.totalDescent ?? null,
            elevation: stats.totalAscent ?? null,
            name: `Garmin Watch Run`,
            runDate: now.toISOString().split('T')[0],
            runTime: now.toTimeString().split(' ')[0].slice(0, 5),
            completedAt: now,
            externalId: sessionId,
            externalSource: 'garmin_companion',
            hasGarminData: true,
            difficulty: 'moderate',
            isPublic: false,
            // Running dynamics
            avgStrideLength: stats.avgStrideLength ?? null,
            // Advanced Garmin metrics (stored in existing columns)
            avgGroundContactTime: stats.avgGroundContactTime ?? null,
            avgVerticalOscillation: stats.avgVerticalOscillation ?? null,
            avgVerticalRatio: stats.avgVerticalRatio ?? null,
            avgGroundContactBalance: stats.avgGroundContactBalance ?? null,
            avgRunningPower: stats.avgRunningPower ?? null,
            avgRespirationRate: stats.avgRespirationRate ?? null,
            aerobicTrainingEffect: stats.aerobicTrainingEffect ?? null,
            anaerobicTrainingEffect: stats.anaerobicTrainingEffect ?? null,
            // Per-km split data — powers charts for phone-less runs
            kmSplits: storedKmSplits,
            heartRateData: heartRateData,
            paceData: paceData,
            altitudeData: altitudeData,
            // GPS track built from garminRealtimeData per-second points (standalone runs)
            gpsTrack: gpsTrackFromData,
          }).returning();

          newRunId = newRun.id;

          // Link the companion session to the run
          await db.update(garminCompanionSessions)
            .set({ linkedRunId: newRunId } as any)
            .where(eq(garminCompanionSessions.sessionId, sessionId));

          console.log(`[Companion] Created run record ${newRunId} from standalone Garmin session ${sessionId} (${distanceKm.toFixed(2)}km)`);
          } // end else (no phone run found)
        } else {
          console.log(`[Companion] Session ${sessionId} too short to save as run (${distanceKm.toFixed(3)}km, ${durationSecs}s)`);
        }
      } catch (runCreateError: any) {
        // Don't fail the whole request if run creation fails — session is still marked complete
        console.error(`[Companion] Failed to create run from session ${sessionId}:`, runCreateError?.message);
      }

      res.json({ success: true, session: updated, summary: stats, runId: newRunId });
    } catch (error: any) {
      console.error("Companion session end error:", error);
      res.status(500).json({ error: "Failed to end session" });
    }
  });
  
  // ── Offline batch upload ──────────────────────────────────────────────────
  // Receives the 15-second buffered data points from a watch-only run and
  // patches the existing run record (created by session/end) with full chart
  // data: GPS track, HR series, pace series, altitude series, cadence series.
  //
  // Point format (compact Array from watch):
  //   [elapsed_s, lat_e5, lng_e5, alt_dm, hr, cadence, pace_ds]
  //   lat_e5  = lat  × 100000  (integer)
  //   lng_e5  = lng  × 100000  (integer)
  //   alt_dm  = alt  × 10      (integer, decimetres)
  //   pace_ds = pace × 10      (integer, deciseconds/km)
  app.post("/api/garmin-companion/session/:sessionId/upload-batch", companionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).companionUser;
      const { sessionId } = req.params;
      const { points, distanceM, durationSec, totalAscent } = req.body;

      if (!points || !Array.isArray(points) || points.length === 0) {
        return res.status(400).json({ error: "No points provided" });
      }

      // Find the existing run record created by session/end.
      // For truly phone-less runs session/end never reaches the server, so
      // no record will exist — create one now from the batch summary data.
      let [existingRun] = await db
        .select()
        .from(runs)
        .where(and(eq(runs.userId, userId), eq(runs.externalId, sessionId)));

      if (!existingRun) {
        // ── Dedup against phone-uploaded runs ─────────────────────────────────
        // The watch now ALWAYS fills an offline buffer for non-phone-controlled runs,
        // even when _isConnected = true (Scenario 2). If the phone ALSO tracked the
        // run successfully, a run record already exists (externalId = null, no match
        // above). Check for it here and link the batch as GPS enrichment instead of
        // creating a duplicate.
        const distKmCheck = distanceM ? distanceM / 1000 : 0;
        if (distKmCheck >= 0.1) {
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
          const phoneRuns = await db
            .select({ id: runs.id, distance: runs.distance })
            .from(runs)
            .where(and(
              eq(runs.userId, userId),
              gte(runs.createdAt, twoHoursAgo),
              isNull(runs.externalId),   // phone-uploaded runs have no externalId
            ))
            .limit(10);
          const phoneMatch = phoneRuns.find((r: any) =>
            Math.abs((r.distance ?? 0) - distKmCheck) / Math.max(distKmCheck, 0.1) < 0.1
          );
          if (phoneMatch) {
            console.log(`[Offline Batch] Phone run ${phoneMatch.id} matches batch (${distKmCheck.toFixed(2)} km) — linking GPS track to phone run, no duplicate created`);
            // Tag the phone run with the watch session ID + source so future lookups match
            await db.update(runs).set({
              externalId:     sessionId,
              externalSource: 'garmin_companion',
              hasGarminData:  true,
            }).where(eq(runs.id, phoneMatch.id));
            existingRun = phoneMatch as any;
          }
        }
      }

      if (!existingRun) {
        console.log(`[Offline Batch] No run found for session ${sessionId} — creating run from batch (phone-less or service-failed run)`);

        // Derive basic summary from batch data if not provided in body
        const distKm   = distanceM  ? distanceM  / 1000 : 0;
        const durSec   = durationSec || 0;

        if (distKm < 0.1 || durSec < 30) {
          console.warn(`[Offline Batch] Batch too small to create run (${distKm.toFixed(3)}km, ${durSec}s) — discarding`);
          return res.status(400).json({ error: "Batch data too small to create a run" });
        }

        // Average pace, HR, cadence from raw points
        const hrPts  = (points as number[][]).filter((p: number[]) => p[4] > 0);
        const cadPts = (points as number[][]).filter((p: number[]) => p[5] > 0);
        const pacePts = (points as number[][]).filter((p: number[]) => p[6] > 0 && p[6] / 10 < 1200);

        const avgHR  = hrPts.length  > 0 ? Math.round(hrPts.reduce((s: number, p: number[])  => s + p[4], 0) / hrPts.length)  : null;
        const maxHR  = hrPts.length  > 0 ? Math.max(...hrPts.map((p: number[])  => p[4]))  : null;
        const avgCad = cadPts.length > 0 ? Math.round(cadPts.reduce((s: number, p: number[]) => s + p[5], 0) / cadPts.length) : null;
        const avgPaceRaw = pacePts.length > 0 ? pacePts.reduce((s: number, p: number[]) => s + p[6] / 10, 0) / pacePts.length : null;
        let avgPaceStr: string | null = null;
        if (avgPaceRaw && avgPaceRaw > 0) {
          const mins = Math.floor(avgPaceRaw / 60);
          const secs = Math.round(avgPaceRaw % 60);
          avgPaceStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        const now = new Date();
        const [created] = await db.insert(runs).values({
          userId,
          distance:       distKm,
          duration:       durSec,
          avgPace:        avgPaceStr,
          avgHeartRate:   avgHR,
          maxHeartRate:   maxHR,
          cadence:        avgCad,
          elevationGain:  totalAscent ?? null,
          elevation:      totalAscent ?? null,
          name:           'Garmin Watch Run',
          runDate:        now.toISOString().split('T')[0],
          runTime:        now.toTimeString().split(' ')[0].slice(0, 5),
          completedAt:    now,
          externalId:     sessionId,
          externalSource: 'garmin_companion',
          hasGarminData:  true,
          difficulty:     'moderate',
          isPublic:       false,
        }).returning();
        existingRun = created;
        console.log(`[Offline Batch] Created new run record ${existingRun.id} for phone-less session ${sessionId} (${distKm.toFixed(2)}km)`);
      }

      // ── Decode compact points into chart series ──────────────────────────
      const gpsTrack:       { lat: number; lng: number; altitude?: number; timestamp: number }[] = [];
      const heartRateData:  { time: number; value: number }[] = [];
      const paceData:       { time: number; value: number }[] = [];
      const altitudeData:   { time: number; value: number }[] = [];
      const cadenceData:    { time: number; value: number }[] = [];

      for (const pt of points) {
        const [elapsed_s, lat_e5, lng_e5, alt_dm, hr, cadence, pace_ds] = pt;
        const lat  = lat_e5  / 100000.0;
        const lng  = lng_e5  / 100000.0;
        const altM = alt_dm  / 10.0;
        const pace = pace_ds / 10.0;

        if (lat_e5 !== 0 && lng_e5 !== 0) {
          const gpsPt: any = { lat, lng, timestamp: elapsed_s };
          if (alt_dm !== 0) gpsPt.altitude = altM;
          gpsTrack.push(gpsPt);
        }
        if (hr > 0)              heartRateData.push({ time: elapsed_s, value: hr });
        if (pace > 0 && pace < 1200) paceData.push({ time: elapsed_s, value: pace });
        if (alt_dm !== 0)        altitudeData.push({ time: elapsed_s, value: altM });
        if (cadence > 0)         cadenceData.push({ time: elapsed_s, value: cadence });
      }

      // ── Build km splits via time-proportional interpolation ─────────────
      // Without per-point distance we estimate using total distance ÷ total time.
      const totalDistKm  = (distanceM  || existingRun.distance || 0) / 1000;
      const totalDurSec  = durationSec || existingRun.duration  || 0;
      const kmSplits: any[] = [];

      if (totalDistKm > 0.5 && totalDurSec > 0 && points.length > 1) {
        const secPerKm   = totalDurSec / totalDistKm;
        const kmCount    = Math.floor(totalDistKm);
        let prevKmEndSec = 0;

        for (let km = 1; km <= kmCount; km++) {
          const kmEndSec   = Math.round(km * secPerKm);
          const kmStartSec = prevKmEndSec;
          const splitDur   = kmEndSec - kmStartSec;

          // Average metrics from points in this km's time window
          const kmPts = points.filter((p: number[]) => p[0] >= kmStartSec && p[0] <= kmEndSec);
          const hrPts = kmPts.filter((p: number[]) => p[4] > 0);
          const cadPts = kmPts.filter((p: number[]) => p[5] > 0);
          const elevPts = kmPts.filter((p: number[]) => p[3] !== 0);

          let elevGain = 0;
          for (let i = 1; i < elevPts.length; i++) {
            const delta = (elevPts[i][3] - elevPts[i-1][3]) / 10.0;
            if (delta > 0.1) elevGain += delta;
          }

          kmSplits.push({
            km,
            distance: 1000,
            duration: splitDur,
            pace: splitDur,           // sec/km for this 1-km segment
            hr:      hrPts.length  > 0 ? Math.round(hrPts.reduce((s: number, p: number[]) => s + p[4], 0) / hrPts.length)  : null,
            cadence: cadPts.length > 0 ? Math.round(cadPts.reduce((s: number, p: number[]) => s + p[5], 0) / cadPts.length) : null,
            elevGain: Math.round(elevGain * 10) / 10,
          });

          prevKmEndSec = kmEndSec;
        }
      }

      // ── Recompute elevation gain from the altitude series ────────────────
      let computedAscent: number | null = null;
      if (altitudeData.length > 1) {
        let asc = 0;
        for (let i = 1; i < altitudeData.length; i++) {
          const delta = altitudeData[i].value - altitudeData[i-1].value;
          if (delta > 0.3) asc += delta;    // 0.3m noise floor for 15-sec GPS alt
        }
        if (asc > 0) computedAscent = Math.round(asc * 10) / 10;
      }
      // Fall back to the watch-accumulated totalAscent which is computed
      // at full 250ms resolution and is therefore more accurate.
      const finalAscent = totalAscent && totalAscent > 0 ? totalAscent : computedAscent;

      // ── Patch the run record ─────────────────��───────────────────────────
      const updatePayload: any = {
        gpsTrack:      gpsTrack.length      > 0 ? gpsTrack      : undefined,
        heartRateData: heartRateData.length > 0 ? heartRateData : undefined,
        paceData:      paceData.length      > 0 ? paceData      : undefined,
        altitudeData:  altitudeData.length  > 0 ? altitudeData  : undefined,
        cadenceData:   cadenceData.length   > 0 ? cadenceData   : undefined,
        kmSplits:      kmSplits.length      > 0 ? kmSplits      : undefined,
      };
      if (finalAscent != null) {
        updatePayload.elevationGain = finalAscent;
        updatePayload.elevation     = finalAscent;
      }

      await db.update(runs).set(updatePayload).where(eq(runs.id, existingRun.id));

      console.log(`[Offline Batch] Session ${sessionId}: ${points.length} pts → GPS:${gpsTrack.length} HR:${heartRateData.length} pace:${paceData.length} alt:${altitudeData.length} splits:${kmSplits.length}`);
      // Include runId so the watch can forward it to the phone app for the sync notification deep link
      res.json({ success: true, runId: existingRun.id, points: points.length, gpsPoints: gpsTrack.length, splits: kmSplits.length });

    } catch (error: any) {
      console.error("[Offline Batch] Error:", error);
      res.status(500).json({ error: "Failed to process offline batch" });
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
  
  // ==================== ADMIN ENDPOINTS ====================

  /**
   * POST /api/admin/garmin-watch-app/broadcast-update
   *
   * Sends a push notification + in-app message to every user who has the
   * Garmin Connect IQ watch companion app installed, directing them to update.
   *
   * Security: requires the ADMIN_API_KEY environment variable to be set and
   * passed via the X-Admin-Key header (or admin_key query param).
   *
   * Body:
   *   version      (required) e.g. "2.4.0"
   *   releaseNote  (optional) short description of what's new
   *   storeUrl     (optional) defaults to the Connect IQ listing URL
   *   dryRun       (optional, boolean) if true, returns the target list without sending
   */
  app.post("/api/admin/garmin-watch-app/broadcast-update", async (req: Request, res: Response) => {
    try {
      // ── Admin authentication ─────────────────────────────────────────────────
      const adminKey = process.env.ADMIN_API_KEY;
      if (!adminKey) {
        return res.status(503).json({ error: "Admin API not configured on this server" });
      }

      const providedKey =
        req.headers["x-admin-key"] ||
        req.query["admin_key"] ||
        req.body?.adminKey;

      if (providedKey !== adminKey) {
        console.warn("[Admin] Unauthorized broadcast-update attempt from", req.ip);
        return res.status(401).json({ error: "Unauthorized — invalid admin key" });
      }

      // ── Payload ──────────────────────────────────────────────────────────────
      const {
        version,
        releaseNote,
        dryRun = false,
        // Default Connect IQ store URL for AI Run Coach
        storeUrl = "https://apps.garmin.com/en-NZ/apps/91452a05-d077-4707-a9a3-0e98277f6017",
      } = req.body;

      if (!version) {
        return res.status(400).json({ error: "version is required (e.g. '2.4.0')" });
      }

      // ── Dry-run: just return who would be targeted ───────────────────────────
      if (dryRun) {
        const targets = await db
          .select({ id: users.id, email: users.email, hasFcm: users.fcmToken })
          .from(users)
          .where(eq(users.hasGarminWatchApp as any, true));

        return res.json({
          dryRun: true,
          version,
          storeUrl,
          targeted: targets.length,
          withFcmToken: targets.filter((u) => !!u.hasFcm).length,
          withoutFcmToken: targets.filter((u) => !u.hasFcm).length,
          users: targets.map((u) => ({ id: u.id, email: u.email, hasFcm: !!u.hasFcm })),
        });
      }

      // ── Live broadcast ────────────────────────────────────────────────────────
      const { broadcastGarminWatchAppUpdate } = await import("./notification-service");
      const results = await broadcastGarminWatchAppUpdate(version, releaseNote || "", storeUrl);

      console.log(
        `[Admin] Garmin watch app broadcast v${version} complete — ` +
        `targeted: ${results.targeted}, push sent: ${results.pushSent}, in-app: ${results.inAppSent}`
      );

      res.json({
        success: true,
        version,
        storeUrl,
        targeted: results.targeted,
        pushSent: results.pushSent,
        pushFailed: results.pushFailed,
        inAppSent: results.inAppSent,
        message: `Broadcast sent to ${results.targeted} Garmin watch app users (${results.pushSent} push, ${results.inAppSent} in-app)`,
      });
    } catch (error: any) {
      console.error("[Admin] Garmin broadcast-update error:", error);
      res.status(500).json({ error: "Broadcast failed", details: error?.message });
    }
  });

  /**
   * POST /api/admin/android-app/broadcast-update
   *
   * Sends a push notification + in-app message to all Android app users,
   * directing them to update from the Google Play Store.
   *
   * Security: requires ADMIN_API_KEY via X-Admin-Key header.
   *
   * Body:
   *   version      (required) e.g. "1.4.3"
   *   releaseNote  (optional) what's new in this version
   *   dryRun       (optional, boolean) if true, returns the target list without sending
   */
  app.post("/api/admin/android-app/broadcast-update", async (req: Request, res: Response) => {
    try {
      // ── Admin authentication ─────────────────────────────────────────────────
      const adminKey = process.env.ADMIN_API_KEY;
      if (!adminKey) {
        return res.status(503).json({ error: "Admin API not configured on this server" });
      }

      const providedKey =
        req.headers["x-admin-key"] ||
        req.query["admin_key"] ||
        req.body?.adminKey;

      if (providedKey !== adminKey) {
        console.warn("[Admin] Unauthorized android-app broadcast-update attempt from", req.ip);
        return res.status(401).json({ error: "Unauthorized — invalid admin key" });
      }

      // ── Payload ──────────────────────────────────────────────────────────────
      const {
        version,
        title = `🚀 AI Run Coach v${version} Available`,
        releaseNote,
        dryRun = false,
      } = req.body;

      if (!version) {
        return res.status(400).json({ error: "version is required (e.g. '1.4.3')" });
      }

      // ── Dry-run: just return who would be targeted ───────────────────────────
      if (dryRun) {
        const targets = await db
          .select({ id: users.id, email: users.email, hasFcm: users.fcmToken })
          .from(users)
          .where(users.fcmToken);

        return res.json({
          dryRun: true,
          version,
          targeted: targets.length,
          withFcmToken: targets.filter((u) => !!u.hasFcm).length,
          users: targets.map((u) => ({ id: u.id, email: u.email, hasFcm: !!u.hasFcm })),
        });
      }

      // ── Live broadcast ────────────────────────────────────────────────────────
      const { broadcastAndroidAppUpdate } = await import("./notification-service");
      const results = await broadcastAndroidAppUpdate(version, title, releaseNote || "");

      console.log(
        `[Admin] Android app broadcast v${version} complete — ` +
        `targeted: ${results.targeted}, push sent: ${results.pushSent}, in-app: ${results.inAppSent}`
      );

      res.json({
        success: true,
        version,
        title,
        targeted: results.targeted,
        pushSent: results.pushSent,
        pushFailed: results.pushFailed,
        inAppSent: results.inAppSent,
        message: `Broadcast sent to ${results.targeted} Android app users (${results.pushSent} push, ${results.inAppSent} in-app)`,
      });
    } catch (error: any) {
      console.error("[Admin] Android app broadcast-update error:", error);
      res.status(500).json({ error: "Broadcast failed", details: error?.message });
    }
  });

  /**
   * GET /api/admin/garmin-watch-app/users
   * Returns all users who have the Garmin watch app installed.
   */
  app.get("/api/admin/garmin-watch-app/users", async (req: Request, res: Response) => {
    try {
      const adminKey = process.env.ADMIN_API_KEY;
      if (!adminKey) return res.status(503).json({ error: "Admin API not configured" });

      const providedKey = req.headers["x-admin-key"] || req.query["admin_key"];
      if (providedKey !== adminKey) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const watchUsers = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          hasFcmToken: users.fcmToken,
          firstSeen: users.garminWatchAppFirstSeenAt,
          lastSeen: users.garminWatchAppLastSeenAt,
          appVersion: users.garminWatchAppVersion,
        })
        .from(users)
        .where(eq(users.hasGarminWatchApp as any, true))
        .orderBy(desc(users.garminWatchAppLastSeenAt as any));

      res.json({
        total: watchUsers.length,
        withFcmToken: watchUsers.filter((u) => !!u.hasFcmToken).length,
        users: watchUsers.map((u) => ({
          ...u,
          hasFcmToken: !!u.hasFcmToken,
        })),
      });
    } catch (error: any) {
      console.error("[Admin] Get Garmin watch users error:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  /**
   * POST /api/admin/app-update/broadcast
   *
   * Sends an app update notification to all Android users.
   * Uses Firebase Cloud Messaging to deliver push notifications + in-app messages.
   *
   * Security: requires ADMIN_API_KEY (via X-Admin-Key header or admin_key param)
   *
   * Body:
   *   version      (required) e.g. "1.4.3"
   *   title        (required) e.g. "Critical Update"
   *   releaseNote  (required) e.g. "Please update to fix login issues"
   *   dryRun       (optional, boolean) if true, just returns target count
   */
  app.post("/api/admin/app-update/broadcast", async (req: Request, res: Response) => {
    try {
      // ── Admin authentication ─────────────────────────────────��───────────────
      const adminKey = process.env.ADMIN_API_KEY;
      if (!adminKey) {
        return res.status(503).json({ error: "Admin API not configured on this server" });
      }

      const providedKey =
        req.headers["x-admin-key"] ||
        req.query["admin_key"] ||
        req.body?.adminKey;

      if (providedKey !== adminKey) {
        console.warn("[Admin] Unauthorized app-update broadcast attempt from", req.ip);
        return res.status(401).json({ error: "Unauthorized — invalid admin key" });
      }

      // ── Payload ──────────────────────────────────────────────────────────────
      const {
        version,
        title,
        releaseNote,
        dryRun = false,
      } = req.body;

      if (!version) {
        return res.status(400).json({ error: "version is required (e.g. '1.4.3')" });
      }
      if (!title) {
        return res.status(400).json({ error: "title is required (e.g. 'Critical Update')" });
      }
      if (!releaseNote) {
        return res.status(400).json({ error: "releaseNote is required (e.g. 'Please update to fix login issues')" });
      }

      // ── Dry-run: just return who would be targeted ───────────────────────────
      if (dryRun) {
        const allUsers = await db
          .select({ id: users.id, email: users.email, hasFcm: users.fcmToken })
          .from(users);

        return res.json({
          dryRun: true,
          version,
          title,
          releaseNote,
          targeted: allUsers.length,
          withFcmToken: allUsers.filter((u) => !!u.hasFcm).length,
          withoutFcmToken: allUsers.filter((u) => !u.hasFcm).length,
        });
      }

      // ── Live broadcast ──────────────���─────────────────────────────────────────
      const { broadcastAndroidAppUpdate } = await import("./notification-service");
      const results = await broadcastAndroidAppUpdate(version, title, releaseNote);

      console.log(
        `[Admin] Android app update broadcast v${version} complete — ` +
        `targeted: ${results.targeted}, push sent: ${results.pushSent}, in-app: ${results.inAppSent}`
      );

      res.json({
        success: true,
        version,
        title,
        releaseNote,
        targeted: results.targeted,
        pushSent: results.pushSent,
        pushFailed: results.pushFailed,
        inAppSent: results.inAppSent,
        message: `Broadcast sent to ${results.targeted} Android users (${results.pushSent} push, ${results.inAppSent} in-app)`,
      });
    } catch (error: any) {
      console.error("[Admin] App update broadcast error:", error);
      res.status(500).json({ error: "Broadcast failed", details: error?.message });
    }
  });

  // ==================== ANDROID V2 ENDPOINTS ====================

  // Update coach settings
  app.put("/api/users/:id/coach-settings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { 
        coachName, coachGender, coachAccent, coachTone,
        // In-Run AI Coaching feature preferences
        coachPaceEnabled, coachNavigationEnabled, coachElevationEnabled,
        coachHeartRateEnabled, coachCadenceStrideEnabled, coachKmSplitsEnabled,
        coachStruggleEnabled, coachMotivationalEnabled, coachHalfKmCheckInEnabled,
        coachKmSplitIntervalKm
      } = req.body;
      
      // Verify user is updating their own settings
      if (req.user?.userId !== id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Validate inputs — must match all options the Android/iOS apps offer
      const validGenders = ['male', 'female'];
      const validAccents = [
        'British', 'American', 'Australian', 'Irish', 'Scottish', 'New Zealand',
        'South African', 'Canadian', 'Welsh', 'Caribbean', 'Scandinavian'
      ];
      const validTones = [
        'Energetic', 'Motivational', 'Friendly', 'Instructive', 'Tough Love',
        'Analytical', 'Zen', 'Playful', 'Factual', 'Abrupt'
      ];
      
      if (coachGender && !validGenders.includes(coachGender.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid coach gender' });
      }
      
      const normalizedAccent = coachAccent?.toLowerCase();
      if (coachAccent && !validAccents.some(a => a.toLowerCase() === normalizedAccent)) {
        return res.status(400).json({ error: `Invalid coach accent: ${coachAccent}. Valid options: ${validAccents.join(', ')}` });
      }
      
      const normalizedTone = coachTone?.toLowerCase();
      if (coachTone && !validTones.some(t => t.toLowerCase() === normalizedTone)) {
        return res.status(400).json({ error: `Invalid coach tone: ${coachTone}. Valid options: ${validTones.join(', ')}` });
      }
      
      if (coachKmSplitIntervalKm !== undefined) {
        const validIntervals = [1, 2, 3, 5, 10];
        if (!validIntervals.includes(coachKmSplitIntervalKm)) {
          return res.status(400).json({ error: `Invalid km split interval: ${coachKmSplitIntervalKm}. Valid options: ${validIntervals.join(', ')}` });
        }
      }
      
      // Build update object — only include fields that were actually sent
      const updateData: any = {};
      if (coachName !== undefined) updateData.coachName = coachName;
      if (coachGender !== undefined) updateData.coachGender = coachGender;
      if (coachAccent !== undefined) updateData.coachAccent = coachAccent;
      if (coachTone !== undefined) updateData.coachTone = coachTone;
      // Coaching feature toggles
      if (coachPaceEnabled !== undefined) updateData.coachPaceEnabled = coachPaceEnabled;
      if (coachNavigationEnabled !== undefined) updateData.coachNavigationEnabled = coachNavigationEnabled;
      if (coachElevationEnabled !== undefined) updateData.coachElevationEnabled = coachElevationEnabled;
      if (coachHeartRateEnabled !== undefined) updateData.coachHeartRateEnabled = coachHeartRateEnabled;
      if (coachCadenceStrideEnabled !== undefined) updateData.coachCadenceStrideEnabled = coachCadenceStrideEnabled;
      if (coachKmSplitsEnabled !== undefined) updateData.coachKmSplitsEnabled = coachKmSplitsEnabled;
      if (coachStruggleEnabled !== undefined) updateData.coachStruggleEnabled = coachStruggleEnabled;
      if (coachMotivationalEnabled !== undefined) updateData.coachMotivationalEnabled = coachMotivationalEnabled;
      if (coachHalfKmCheckInEnabled !== undefined) updateData.coachHalfKmCheckInEnabled = coachHalfKmCheckInEnabled;
      if (coachKmSplitIntervalKm !== undefined) updateData.coachKmSplitIntervalKm = coachKmSplitIntervalKm;
      
      // Update user
      const updatedUser = await storage.updateUser(id, updateData);
      
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

  // ─── Helper: build a full group run response object ─────────────────────────
  async function buildGroupRunResponse(gr: any, currentUserId: string) {
    const host = await storage.getUser(gr.hostUserId);
    const allParticipants = await db.select().from(groupRunParticipants)
      .where(eq(groupRunParticipants.groupRunId, gr.id));

    const participantDetails = await Promise.all(
      allParticipants.map(async (p) => {
        const u = await storage.getUser(p.userId);
        return {
          userId: p.userId,
          userName: u?.name || 'Unknown',
          profilePic: u?.profilePic || null,
          invitationStatus: p.invitationStatus,
          role: p.role,
          runId: p.runId || null,
          readyToStart: p.readyToStart || false,
        };
      })
    );

    const myParticipant = allParticipants.find(p => p.userId === currentUserId);
    const acceptedCount = allParticipants.filter(p => p.invitationStatus === 'accepted').length;

    return {
      id: gr.id,
      name: gr.title || 'Group Run',
      description: gr.description || '',
      creatorId: gr.hostUserId,
      creatorName: host?.name || 'Unknown',
      meetingPoint: gr.meetingPoint || null,
      meetingLat: gr.meetingLat || null,
      meetingLng: gr.meetingLng || null,
      distance: gr.targetDistance || 5.0,
      dateTime: gr.plannedStartAt?.toISOString() || new Date().toISOString(),
      maxParticipants: gr.maxParticipants || 10,
      currentParticipants: acceptedCount,
      isPublic: gr.isPublic !== false,
      status: gr.status || 'upcoming',
      isJoined: !!myParticipant && myParticipant.invitationStatus === 'accepted',
      isOrganiser: gr.hostUserId === currentUserId,
      myInvitationStatus: myParticipant?.invitationStatus || null,
      participants: participantDetails,
      inviteToken: gr.inviteToken,
      createdAt: gr.createdAt?.toISOString() || new Date().toISOString(),
    };
  }

  // REMOVED: Duplicate /api/group-runs endpoint (now handled by line 3605)

  // Get a single group run with full detail
  app.get("/api/group-runs/:groupRunId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const userId = req.user!.userId;

      const gr = await storage.getGroupRun(groupRunId);
      if (!gr) return res.status(404).json({ error: 'Group run not found' });

      res.json(await buildGroupRunResponse(gr, userId));
    } catch (error: any) {
      console.error("Get group run detail error:", error);
      res.status(500).json({ error: "Failed to get group run" });
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
        description: description || null,
        meetingPoint: meetingPoint || null,
        meetingLat: meetingLat ? parseFloat(meetingLat) : null,
        meetingLng: meetingLng ? parseFloat(meetingLng) : null,
        targetDistance: parseFloat(distance),
        plannedStartAt: new Date(dateTime),
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : 10,
        isPublic: isPublic !== false,
        inviteToken,
        status: 'pending',
        mode: 'route'
      });
      
      // Auto-join creator as organiser
      await db.insert(groupRunParticipants).values({
        groupRunId: groupRun.id,
        userId: creatorId,
        role: 'organiser',
        invitationStatus: 'accepted',
        joinedAt: new Date(),
        acceptedAt: new Date(),
      });

      res.status(201).json(await buildGroupRunResponse(groupRun, creatorId));
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

  // Invite friends to a group run
  app.post("/api/group-runs/:groupRunId/invite", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const { userIds } = req.body as { userIds: string[] };
      const requesterId = req.user!.userId;

      const gr = await storage.getGroupRun(groupRunId);
      if (!gr) return res.status(404).json({ error: 'Group run not found' });
      if (gr.hostUserId !== requesterId) return res.status(403).json({ error: 'Only the organiser can invite friends' });

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'userIds must be a non-empty array' });
      }

      const results: string[] = [];
      for (const uid of userIds) {
        // Skip if already a participant
        const existing = await db.select().from(groupRunParticipants)
          .where(and(eq(groupRunParticipants.groupRunId, groupRunId), eq(groupRunParticipants.userId, uid)));
        if (existing.length > 0) continue;

        await db.insert(groupRunParticipants).values({
          groupRunId,
          userId: uid,
          role: 'participant',
          invitationStatus: 'pending',
          inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
        results.push(uid);
      }

      res.json({ invited: results, groupRunId });
    } catch (error: any) {
      console.error("Invite to group run error:", error);
      res.status(500).json({ error: "Failed to invite users" });
    }
  });

  // Respond to a group run invitation (accept or decline)
  app.post("/api/group-runs/:groupRunId/respond", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const { response } = req.body as { response: 'accepted' | 'declined' };
      const userId = req.user!.userId;

      if (!['accepted', 'declined'].includes(response)) {
        return res.status(400).json({ error: "response must be 'accepted' or 'declined'" });
      }

      const existing = await db.select().from(groupRunParticipants)
        .where(and(eq(groupRunParticipants.groupRunId, groupRunId), eq(groupRunParticipants.userId, userId)));

      if (existing.length === 0) {
        return res.status(404).json({ error: 'No invitation found for this user' });
      }

      await db.update(groupRunParticipants)
        .set({
          invitationStatus: response,
          ...(response === 'accepted' ? { acceptedAt: new Date(), joinedAt: new Date() } : { declinedAt: new Date() }),
        })
        .where(and(eq(groupRunParticipants.groupRunId, groupRunId), eq(groupRunParticipants.userId, userId)));

      const gr = await storage.getGroupRun(groupRunId);
      res.json(await buildGroupRunResponse(gr!, userId));
    } catch (error: any) {
      console.error("Respond to group run error:", error);
      res.status(500).json({ error: "Failed to respond to invitation" });
    }
  });

  // Mark ready to start
  app.post("/api/group-runs/:groupRunId/ready", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const userId = req.user!.userId;

      await db.update(groupRunParticipants)
        .set({ readyToStart: true })
        .where(and(eq(groupRunParticipants.groupRunId, groupRunId), eq(groupRunParticipants.userId, userId)));

      const gr = await storage.getGroupRun(groupRunId);
      res.json(await buildGroupRunResponse(gr!, userId));
    } catch (error: any) {
      console.error("Ready to start error:", error);
      res.status(500).json({ error: "Failed to mark ready" });
    }
  });

  // Organiser starts the group run
  app.post("/api/group-runs/:groupRunId/start", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const userId = req.user!.userId;

      const gr = await storage.getGroupRun(groupRunId);
      if (!gr) return res.status(404).json({ error: 'Group run not found' });
      if (gr.hostUserId !== userId) return res.status(403).json({ error: 'Only the organiser can start the run' });

      await db.update(groupRuns).set({ status: 'active', startedAt: new Date() })
        .where(eq(groupRuns.id, groupRunId));

      const updated = await storage.getGroupRun(groupRunId);
      res.json(await buildGroupRunResponse(updated!, userId));
    } catch (error: any) {
      console.error("Start group run error:", error);
      res.status(500).json({ error: "Failed to start group run" });
    }
  });

  // Link individual run session to group run after completion
  app.post("/api/group-runs/:groupRunId/complete", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const { runId } = req.body as { runId: string };
      const userId = req.user!.userId;

      // Link run to participant record
      await db.update(groupRunParticipants)
        .set({ runId, completedAt: new Date() })
        .where(and(eq(groupRunParticipants.groupRunId, groupRunId), eq(groupRunParticipants.userId, userId)));

      // Check if all accepted participants have completed
      const allAccepted = await db.select().from(groupRunParticipants)
        .where(and(eq(groupRunParticipants.groupRunId, groupRunId), eq(groupRunParticipants.invitationStatus, 'accepted')));
      const allDone = allAccepted.every(p => !!p.runId);

      if (allDone) {
        await db.update(groupRuns).set({ status: 'completed', completedAt: new Date() })
          .where(eq(groupRuns.id, groupRunId));
      }

      const gr = await storage.getGroupRun(groupRunId);
      res.json(await buildGroupRunResponse(gr!, userId));
    } catch (error: any) {
      console.error("Complete group run error:", error);
      res.status(500).json({ error: "Failed to complete group run" });
    }
  });

  // Get group run comparison results (for post-run summary)
  app.get("/api/group-runs/:groupRunId/results", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupRunId } = req.params;
      const userId = req.user!.userId;

      const gr = await storage.getGroupRun(groupRunId);
      if (!gr) return res.status(404).json({ error: 'Group run not found' });

      const allParticipants = await db.select().from(groupRunParticipants)
        .where(and(
          eq(groupRunParticipants.groupRunId, groupRunId),
          eq(groupRunParticipants.invitationStatus, 'accepted')
        ));

      const results = await Promise.all(
        allParticipants.map(async (p) => {
          const u = await storage.getUser(p.userId);
          let runData = null;
          if (p.runId) {
            try {
              runData = await storage.getRun(p.runId);
            } catch {}
          }
          return {
            userId: p.userId,
            userName: u?.name || 'Unknown',
            profilePic: u?.profilePic || null,
            runId: p.runId || null,
            completedAt: p.completedAt?.toISOString() || null,
            isCurrentUser: p.userId === userId,
            stats: runData ? {
              distance: (runData as any).distance || 0,
              duration: (runData as any).duration || 0,
              avgPace: (runData as any).avgPace || null,
              avgHeartRate: (runData as any).avgHeartRate || null,
              calories: (runData as any).calories || null,
            } : null,
          };
        })
      );

      // Sort by distance descending (or pace ascending if available)
      results.sort((a, b) => (b.stats?.distance || 0) - (a.stats?.distance || 0));

      res.json({ groupRunId, groupRunName: gr.title, results });
    } catch (error: any) {
      console.error("Group run results error:", error);
      res.status(500).json({ error: "Failed to get group run results" });
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
  
  // ==================== STRAVA INTEGRATION ====================

  /**
   * POST /api/runs/:runId/publish-strava
   * DISABLED: Awaiting write approval from Strava before enabling publishing.
   * Currently only polling reads are disabled (no longer reading Strava data).
   * Writing/publishing will be enabled once approval is obtained.
   */
  app.post("/api/runs/:runId/publish-strava", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    // Temporarily disabled until Strava approves write permissions
    return res.status(403).json({
      error: "Strava integration temporarily disabled",
      message: "We are awaiting Strava approval for write permissions. This feature will be available soon.",
      status: "pending_approval"
    });
  });

  /*
  // Legacy implementation — commented out pending Strava write approval
  app.post("/api/runs/:runId/publish-strava-legacy", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId } = req.params;
      const userId = req.user!.userId;

      // Fetch run
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }

      if (run.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Check if already published to Strava
      if (run.externalSource === "strava" && run.externalId) {
        return res.status(400).json({
          error: "Run already published to Strava",
          activityId: run.externalId,
        });
      }

      // Fetch Strava device
      const stravaDevices = await storage.getConnectedDevices(userId);
      const stravaDevice = stravaDevices.find(
        (d) => d.deviceType === "strava" && d.isActive
      );

      if (!stravaDevice) {
        return res.status(400).json({ error: "Strava not connected" });
      }

      let accessToken = stravaDevice.accessToken;

      // Check if token is expired and refresh if needed
      if (
        stravaDevice.tokenExpiresAt &&
        stravaDevice.tokenExpiresAt < new Date()
      ) {
        if (!stravaDevice.refreshToken) {
          return res.status(401).json({
            error: "Token expired, please reconnect Strava",
          });
        }

        try {
          const {
            accessToken: newToken,
            refreshToken: newRefresh,
            expiresAt,
          } = await refreshStravaToken(stravaDevice.refreshToken);

          await storage.updateConnectedDevice(stravaDevice.id, {
            accessToken: newToken,
            refreshToken: newRefresh,
            tokenExpiresAt: expiresAt,
            updatedAt: new Date(),
          });

          accessToken = newToken;
        } catch (error) {
          return res.status(401).json({
            error: "Strava token refresh failed, please reconnect",
          });
        }
      }

      // Generate FIT file from run data
      const fitFile = await generateFitFile(run);

      // Upload to Strava
      const { uploadId } = await uploadRunToStrava(
        fitFile,
        accessToken,
        run.name || "AI Run Coach Run",
        run.userComments || `Distance: ${run.distance}km | Duration: ${run.duration}s`,
        `airuncoach-${runId}`
      );

      console.log(`[Strava] Starting async poll for upload ${uploadId}`);

      // Start async polling in background
      pollUploadAndSaveActivity(uploadId, accessToken, runId, userId).catch(
        (error) => {
          console.error(
            `[Strava] Background polling failed for run ${runId}:`,
            error
          );
        }
      );

      // Return immediately with upload ID
      res.json({
        success: true,
        uploadId,
        message: "Run submitted to Strava. Publishing in background...",
      });
    } catch (error: any) {
      console.error("[Strava Publish] Error:", error.message);
      res.status(500).json({
        error: `Failed to publish run: ${error.message}`,
      });
    }
  });

  // Helper: Poll upload status and save activity ID
  // Run this asynchronously in background
  async function pollUploadAndSaveActivity(
    uploadId: number,
    accessToken: string,
    runId: string,
    userId: string
  ): Promise<void> {
    try {
      // Poll with 30 attempts, 2s between each
      const activityId = await pollUploadStatus(uploadId, accessToken, 30, 2000);

      // Update run with Strava activity ID
      await storage.updateRun(runId, {
        externalId: activityId.toString(),
        externalSource: "strava",
      });

      console.log(
        `✅ [Strava] Run published successfully: activity ${activityId}`
      );
    } catch (error: any) {
      console.error(
        `[Strava] Failed to publish run ${runId}:`,
        error.message
      );
    }
  }
  */

  // GET /api/strava/connection-status — DISABLED: awaiting write approval
  // Auto-refreshes token if expired (Strava tokens last 6 hours)
  // so users stay connected without manual reconnection
  app.get(
    "/api/strava/connection-status",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      // Prevent OkHttp / any HTTP cache from storing this response.
      // The connected/disconnected state must always be fetched fresh from the DB
      // so that disconnect → app restart correctly reflects the new state.
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.set("Pragma", "no-cache");

      try {
        const userId = req.user!.userId;

        const devices = await storage.getConnectedDevices(userId);
        const device = devices.find((d) => d.deviceType === "strava");

        if (!device) {
          return res.json({ connected: false });
        }

        const isExpired =
          device.tokenExpiresAt && device.tokenExpiresAt < new Date();

        // Auto-refresh token if expired and we have a refresh token
        let refreshedDevice = device;
        if (isExpired && device.refreshToken) {
          try {
            console.log(`[Strava] Token expired for user ${userId}, auto-refreshing...`);
            const refreshed = await refreshStravaToken(device.refreshToken);
            
            // Update device with new tokens
            await db.update(connectedDevices)
              .set({
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                tokenExpiresAt: refreshed.expiresAt,
                updatedAt: new Date(),
              })
              .where(eq(connectedDevices.id, device.id));
            
            console.log(`[Strava] Token auto-refreshed successfully for user ${userId}`);
            
            // Use the refreshed data for response
            refreshedDevice = {
              ...device,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              tokenExpiresAt: refreshed.expiresAt,
            };
          } catch (refreshError: any) {
            console.error(`[Strava] Auto-refresh failed for user ${userId}:`, refreshError.message);
            // Token refresh failed - device is truly disconnected now
            return res.json({
              connected: false,
              athleteName: device.deviceName,
              athleteId: device.deviceId,
              lastSync: device.lastSyncAt,
              tokenExpired: true,
              tokenRefreshError: "Token refresh failed - please reconnect Strava",
            });
          }
        }

        res.json({
          connected: refreshedDevice.isActive && !(refreshedDevice.tokenExpiresAt && refreshedDevice.tokenExpiresAt < new Date()),
          athleteName: refreshedDevice.deviceName || "Strava Athlete",
          athleteId: refreshedDevice.deviceId,
          lastSync: refreshedDevice.lastSyncAt,
          tokenExpired: false,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * GET /api/strava/activities
   * Fetch list of runs synced to Strava for current user
   */
  app.get(
    "/api/strava/activities",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;

        // Get all runs that were published to Strava
        const stravaRuns = await db
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.userId, userId),
              eq(runs.externalSource, "strava")
            )
          )
          .orderBy(desc(runs.completedAt));

        res.json({
          count: stravaRuns.length,
          activities: stravaRuns.map((run) => ({
            id: run.id,
            name: run.name,
            distance: run.distance,
            duration: run.duration,
            completedAt: run.completedAt,
            stravaUrl: `https://www.strava.com/activities/${run.externalId}`,
            stravaId: run.externalId,
          })),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  // ==================== END STRAVA INTEGRATION ====================
  
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
      
      // Delete run using storage abstraction
      await storage.deleteRun(id);

      // ⚡ Recompute user stats cache after deletion (deletions are rare, correctness first)
      onRunDeleted(userId).catch(err =>
        console.error('[UserStatsCache] onRunDeleted failed:', err)
      );

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
  // ── iOS: Fetch coaching events for a completed run ───────────────────────────
  // Called by RunSummaryScreen to populate the coaching timeline tab.
  app.get("/api/coaching/session-events/:runId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId } = req.params;
      const events = await db
        .select()
        .from(coachingSessionEvents)
        .where(eq(coachingSessionEvents.runId, runId))
        .orderBy(coachingSessionEvents.triggeredAt);
      res.json({ events });
    } catch (error: any) {
      console.error("[GET /api/coaching/session-events/:runId]", error);
      res.status(500).json({ error: "Failed to fetch coaching events" });
    }
  });

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
      
      // Calculate weather impact if weather data is available
      let weatherImpactAnalysis: string | null = null;
      if (body.weather) {
        try {
          const recentRuns = await db.query.runs.findMany({
            where: eq(runs.userId, run.userId),
            orderBy: desc(runs.completedAt),
            limit: 30,
          });
          
          if (recentRuns.length >= 3) {
            const weatherImpactData = await calculateWeatherImpact(run.userId, recentRuns);
            if (weatherImpactData && weatherImpactData.insights) {
              const temp = body.weather.temp || body.weather.temperature;
              const humidity = body.weather.humidity;
              const condition = body.weather.condition || 'clear';
              const wind = body.weather.windSpeed || 0;
              
              let impact = '';
              
              // Analyze temperature impact
              if (weatherImpactData.temperatureAnalysis) {
                for (const bucket of weatherImpactData.temperatureAnalysis) {
                  if (temp && bucket.label) {
                    if (bucket.label.includes('Cold') && temp < 5) {
                      const improvement = bucket.paceVsAvg || 0;
                      if (improvement < 0) {
                        impact += `Cold temperature (+${Math.abs(improvement).toFixed(1)}% improvement for you). `;
                      } else if (improvement > 0) {
                        impact += `Cold temperature (-${improvement.toFixed(1)}% slower for you). `;
                      }
                      break;
                    } else if (bucket.label.includes('Cool') && temp >= 5 && temp < 10) {
                      const improvement = bucket.paceVsAvg || 0;
                      if (improvement < 0) {
                        impact += `Cool temperature (+${Math.abs(improvement).toFixed(1)}% improvement for you). `;
                      } else if (improvement > 0) {
                        impact += `Cool temperature (-${improvement.toFixed(1)}% slower for you). `;
                      }
                      break;
                    } else if (bucket.label.includes('Mild') && temp >= 10 && temp < 15) {
                      const improvement = bucket.paceVsAvg || 0;
                      if (improvement < 0) {
                        impact += `Mild temperature (+${Math.abs(improvement).toFixed(1)}% improvement for you). `;
                      } else if (improvement > 0) {
                        impact += `Mild temperature (-${improvement.toFixed(1)}% slower for you). `;
                      }
                      break;
                    } else if (bucket.label.includes('Warm') && temp >= 15 && temp < 20) {
                      const improvement = bucket.paceVsAvg || 0;
                      if (improvement < 0) {
                        impact += `Warm temperature (+${Math.abs(improvement).toFixed(1)}% improvement for you). `;
                      } else if (improvement > 0) {
                        impact += `Warm temperature (-${improvement.toFixed(1)}% slower for you). `;
                      }
                      break;
                    } else if (bucket.label.includes('Hot') && temp >= 20) {
                      const improvement = bucket.paceVsAvg || 0;
                      if (improvement < 0) {
                        impact += `Hot temperature (+${Math.abs(improvement).toFixed(1)}% improvement for you). `;
                      } else if (improvement > 0) {
                        impact += `Hot temperature (-${improvement.toFixed(1)}% slower for you). `;
                      }
                      break;
                    }
                  }
                }
              }
              
              // Analyze humidity impact
              if (humidity !== undefined && weatherImpactData.humidityAnalysis) {
                for (const bucket of weatherImpactData.humidityAnalysis) {
                  let isMatch = false;
                  if (bucket.label.includes('Dry') && humidity < 30) isMatch = true;
                  else if (bucket.label.includes('Low') && humidity >= 30 && humidity < 50) isMatch = true;
                  else if (bucket.label.includes('Moderate') && humidity >= 50 && humidity < 70) isMatch = true;
                  else if (bucket.label.includes('High') && humidity >= 70) isMatch = true;
                  
                  if (isMatch) {
                    const improvement = bucket.paceVsAvg || 0;
                    if (improvement < 0) {
                      impact += `${bucket.label} humidity (+${Math.abs(improvement).toFixed(1)}% improvement for you). `;
                    } else if (improvement > 0) {
                      impact += `${bucket.label} humidity (-${improvement.toFixed(1)}% slower for you). `;
                    }
                    break;
                  }
                }
              }
              
              // Analyze weather condition impact
              if (weatherImpactData.conditionAnalysis) {
                for (const cond of weatherImpactData.conditionAnalysis) {
                  if (cond.condition.toLowerCase().includes(condition.toLowerCase())) {
                    const improvement = cond.paceVsAvg || 0;
                    if (improvement < 0) {
                      impact += `${condition} conditions (+${Math.abs(improvement).toFixed(1)}% improvement). `;
                    } else if (improvement > 0) {
                      impact += `${condition} conditions (-${improvement.toFixed(1)}% slower). `;
                    }
                    break;
                  }
                }
              }
              
              if (impact) {
                weatherImpactAnalysis = impact.trim();
              } else if (weatherImpactData.insights?.bestHumidity) {
                weatherImpactAnalysis = `Your best humidity is ${weatherImpactData.insights.bestHumidity.label.toLowerCase()}. Today's conditions were slightly different, but you still performed well.`;
              } else if (weatherImpactData.insights?.bestCondition) {
                weatherImpactAnalysis = `Your best running conditions are: ${weatherImpactData.insights.bestCondition.label}. Today's weather was different, but you still performed well.`;
              }
            }
          }
        } catch (err) {
          console.error("Error calculating weather impact analysis:", err);
          // Continue without weather impact - not critical
        }
      }

      // Build runData for the AI service (merge DB + request so we capture everything Android provides)
      // All struggle points from DB (includes isRelevant + userComment on each)
      const allStrugglePoints: any[] = Array.isArray(run.strugglePoints) ? run.strugglePoints : [];

      // Only pass NON-dismissed struggle points to the AI.
      // Dismissed ones (isRelevant === false) were excluded by the user (e.g. traffic light stop)
      // and should not influence the analysis.
      const relevantStrugglePoints = allStrugglePoints.filter(
        (sp: any) => sp.isRelevant !== false
      );

      const runDataForAi = {
        ...run,
        ...body,
        // Normalize fields used by AI service
        avgPace: body.averagePace || run.avgPace,
        elevationGain: body.elevationGain ?? run.elevationGain,
        elevationLoss: body.elevationLoss ?? run.elevationLoss,
        terrainType: body.terrainType || run.terrainType,
        kmSplits: body.kmSplits || run.kmSplits,
        // Only relevant (non-dismissed) struggle points reach the AI
        strugglePoints: relevantStrugglePoints,
        // Overall post-run comment from the user
        userComments: body.userPostRunComments || run.userComments,
      };

      let ai: any = null;
      try {
        const aiService = await import("./ai-service");
        ai = await aiService.generateComprehensiveRunAnalysis({
          runData: runDataForAi,
          previousRuns: previousRuns.filter(r => r.id !== runId).slice(0, 10),
          weatherImpactAnalysis: weatherImpactAnalysis || undefined,
          userProfile: body.userProfile || (user ? {
            fitnessLevel: user.fitnessLevel || undefined,
            age: user.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined,
            weight: user.weight ? parseFloat(user.weight as any) : undefined,
          } : undefined),
          coachName,
          coachTone,
          coachAccent: user?.coachAccent || body.coachAccent || undefined,
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

      // Categorize training recommendations from the AI's improvement tips
      const trainingRecommendations = (Array.isArray(ai.improvementTips) ? ai.improvementTips : []).slice(0, 6).map((t: string) => {
        // Auto-categorize based on content
        const lower = t.toLowerCase();
        const category = lower.includes('cadence') || lower.includes('stride') || lower.includes('form') || lower.includes('lean') || lower.includes('foot') || lower.includes('arm')
          ? 'technique'
          : lower.includes('interval') || lower.includes('tempo') || lower.includes('speed') || lower.includes('threshold')
          ? 'speed'
          : lower.includes('strength') || lower.includes('hill') || lower.includes('core') || lower.includes('drill')
          ? 'strength'
          : 'endurance';
        const priority = lower.includes('critical') || lower.includes('important') || lower.includes('must') ? 'high' : 'medium';
        // Extract workout suggestion if present
        const workoutMatch = t.match(/try[:\s]+([^.]+)/i) || t.match(/drill[:\s]+([^.]+)/i) || t.match(/workout[:\s]+([^.]+)/i);
        return {
          category,
          recommendation: t,
          priority,
          specificWorkout: workoutMatch ? workoutMatch[1].trim() : null,
        };
      });

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
        weatherImpactAnalysis,
        terrainAnalysis: String(ai.technicalAnalysis?.elevationPerformance || ai.technicalAnalysis?.paceAnalysis || ""),
        strugglePointsInsight: String(ai.strugglePointsInsight || (
          Array.isArray(body.relevantStrugglePoints) && body.relevantStrugglePoints.length
            ? `We detected ${body.relevantStrugglePoints.length} struggle point(s). Your notes help us interpret them accurately.`
            : ""
        )) || null,
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
  // In-memory lock to prevent duplicate plan generation when a user taps the
  // button multiple times or the app retries while the AI is still running.
  // Key = userId, cleared once the request completes or fails.
  const planGenerationInProgress = new Set<string>();

  app.post("/api/training-plans/generate", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const {
        goalType,
        targetDistance,
        targetTime,
        targetDate,
        durationWeeks,  // user-selected duration (takes priority over targetDate)
        experienceLevel,
        daysPerWeek,
        firstSessionStart = "flexible", // "today" | "tomorrow" | "flexible"
        regularSessions = [],  // recurring runs the user already does each week
        injuries = [],  // [{ bodyPart, status, notes }]
        goalId = null,  // optional: goal ID to link this plan to
        userTimezone = null,  // IANA timezone name, e.g. "Pacific/Auckland"
        isPreEventPlan = false,  // true = pre-race sharpening block, not a build-up plan
        // User demographics — used as override if DB profile is incomplete
        age = null,
        gender = null,
        height = null,
        weight = null,
      } = req.body;

      // ── Tier limit check ─────────────────────────────────────────────────
      const planUser = await storage.getUser(userId);
      const planAllowed = await checkAndEnforceLimit(res, userId, planUser?.subscriptionTier, "trainingPlansGenerated", 1, planUser?.trialExpiresAt ?? null, planUser?.createdAt ?? null);
      if (!planAllowed) return;

      // ── Deduplication guard ───────────────────────────────────────────────
      // 1. In-memory lock: reject if this user's plan is already being generated
      //    (handles rapid repeated taps within the same server process).
      if (planGenerationInProgress.has(userId)) {
        console.warn(`[Training Plan] Duplicate request rejected for user ${userId} — already generating`);
        return res.status(429).json({
          error: "A training plan is already being generated for your account. Please wait a moment.",
          code: "PLAN_GENERATION_IN_PROGRESS",
        });
      }

      // 2. DB check: reject if the user already has an active plan with the same goalType.
      //    This catches duplicates that slipped through during a previous server restart.
      const existingActivePlan = await db
        .select({ id: trainingPlans.id })
        .from(trainingPlans)
        .where(
          and(
            eq(trainingPlans.userId, userId),
            eq(trainingPlans.status, "active"),
            eq(trainingPlans.goalType, goalType),
          )
        )
        .limit(1);

      if (existingActivePlan.length > 0) {
        console.warn(`[Training Plan] Duplicate rejected — user ${userId} already has active ${goalType} plan ${existingActivePlan[0].id}`);
        return res.status(409).json({
          error: "You already have an active training plan for this goal. Please complete or delete it before creating a new one.",
          code: "PLAN_ALREADY_EXISTS",
          existingPlanId: existingActivePlan[0].id,
        });
      }

      planGenerationInProgress.add(userId);

      if (!goalType || !targetDistance) {
        return res.status(400).json({ error: "goalType and targetDistance are required" });
      }
      
      // Validate duration inputs
      if (!durationWeeks && !targetDate) {
        return res.status(400).json({ 
          error: "Either durationWeeks or targetDate must be provided" 
        });
      }
      
      // Validate durationWeeks if provided
      if (durationWeeks && (!Number.isInteger(durationWeeks) || durationWeeks <= 0)) {
        return res.status(400).json({ 
          error: "durationWeeks must be a positive integer" 
        });
      }
      
      // Validate and parse targetDate
      let parsedTargetDate: Date | undefined;
      if (targetDate) {
        parsedTargetDate = new Date(targetDate);
        if (isNaN(parsedTargetDate.getTime())) {
          return res.status(400).json({ 
            error: "targetDate must be a valid date (ISO 8601 format)" 
          });
        }
        // Ensure target date is in the future
        if (parsedTargetDate.getTime() <= Date.now()) {
          return res.status(400).json({ 
            error: "targetDate must be in the future" 
          });
        }
      }

      // Sanitise all numeric inputs before passing to the plan generator.
      // iOS / Android may send floats, strings, or omit optional fields entirely.
      // Postgres integer columns reject NaN and non-integer floats with code 22P02.
      const safeTargetTime = (() => {
        const v = Number(targetTime);
        return (!isNaN(v) && v > 0) ? Math.round(v) : undefined;
      })();
      const safeDaysPerWeek = (() => {
        const v = Number(daysPerWeek);
        return (!isNaN(v) && v >= 1 && v <= 7) ? Math.round(v) : 4;
      })();
      const safeTargetDistance = (() => {
        const v = Number(targetDistance);
        return (!isNaN(v) && v > 0) ? v : undefined;
      })();
      const safeAge    = (() => { const v = Number(age);    return (!isNaN(v) && v > 0 && v < 120) ? Math.round(v) : null; })();
      const safeHeight = (() => { const v = Number(height); return (!isNaN(v) && v > 0) ? v : null; })();
      const safeWeight = (() => { const v = Number(weight); return (!isNaN(v) && v > 0) ? v : null; })();

      // ── Auto-inject injury data from linked Injury Recovery goal ────────────
      // If this plan is linked to an Injury Recovery goal and the request didn't
      // already include an explicit injuries array, pull the injury data from the goal.
      let effectiveInjuries = Array.isArray(injuries) ? injuries : [];
      if (goalId && effectiveInjuries.length === 0) {
        try {
          const [linkedGoal] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
          if (linkedGoal && (linkedGoal as any).healthTarget === 'Injury Recovery' && (linkedGoal as any).injuryBodyPart) {
            effectiveInjuries = [{
              bodyPart: (linkedGoal as any).injuryBodyPart,
              status: (linkedGoal as any).injurySeverity || 'recovering',
              notes: (linkedGoal as any).injuryNotes || null,
              injuryDate: (linkedGoal as any).injuryDate || null,
            }];
            console.log(`[Training Plan] Auto-injected injury from Injury Recovery goal ${goalId}: ${(linkedGoal as any).injuryBodyPart}`);
          }
        } catch (goalErr) {
          console.warn(`[Training Plan] Could not fetch goal ${goalId} for injury auto-injection:`, goalErr);
        }
      }

      const planId = await generateTrainingPlan(
        userId,
        goalType,
        safeTargetDistance ?? targetDistance,
        safeTargetTime,
        parsedTargetDate,
        experienceLevel || "intermediate",
        safeDaysPerWeek,
        regularSessions,
        firstSessionStart,
        durationWeeks,
        effectiveInjuries,
        userTimezone || null,
        goalId || null,
        // Pass demographics as overrides — used when user's DB profile is missing values
        safeAge,
        gender || null,
        safeHeight,
        safeWeight,
        // Plan intent: pre-event sharpening vs building up
        isPreEventPlan === true,
      );
      
      // Link plan to goal if goalId was provided
      if (goalId) {
        try {
          await db
            .update(goals)
            .set({ linkedTrainingPlanId: planId })
            .where(eq(goals.id, goalId));
        } catch (linkErr) {
          console.warn(`[Training Plan] Could not link plan ${planId} to goal ${goalId}:`, linkErr);
          // Don't fail the entire request if linking fails
        }
      }
      
      // ── Record successful plan generation against monthly quota ──────────
      recordUsage(userId, "trainingPlansGenerated");

      res.status(201).json({
        planId,
        message: "Training plan generated successfully"
      });
    } catch (error: any) {
      console.error("Generate training plan error:", error);
      res.status(500).json({ error: error.message || "Failed to generate training plan" });
    } finally {
      // Always release the lock so the user can try again if something fails
      planGenerationInProgress.delete(req.user!.userId);
    }
  });
  
  // Get user's training plans
  app.get("/api/training-plans/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { status = 'active' } = req.query;
      
      // Normalise cancelled/abandoned: "cancelled" is the UI-facing status,
      // but older plans may still be stored as "abandoned".
      const statusFilter = String(status);
      const statusWhere = statusFilter === 'cancelled'
        ? or(eq(trainingPlans.status, 'cancelled'), eq(trainingPlans.status, 'abandoned'))
        : eq(trainingPlans.status, statusFilter);

      const plans = await db
        .select()
        .from(trainingPlans)
        .where(
          and(
            eq(trainingPlans.userId, userId),
            statusWhere
          )
        )
        .orderBy(desc(trainingPlans.createdAt));
      
      // For each plan, count total workouts and completed workouts
      const plansWithCounts = await Promise.all(plans.map(async (plan) => {
        const totalWorkouts = await db
          .select({ count: count() })
          .from(plannedWorkouts)
          .where(eq(plannedWorkouts.trainingPlanId, plan.id));

        const completedWorkouts = await db
          .select({ count: count() })
          .from(plannedWorkouts)
          .where(
            and(
              eq(plannedWorkouts.trainingPlanId, plan.id),
              eq(plannedWorkouts.isCompleted, true)
            )
          );

        return {
          ...plan,
          totalWorkouts: totalWorkouts[0]?.count || 0,
          completedWorkouts: completedWorkouts[0]?.count || 0
        };
      }));
      
      res.json(plansWithCounts);
    } catch (error: any) {
      console.error("Get training plans error:", error);
      res.status(500).json({ error: "Failed to get training plans" });
    }
  });
  
  // Get training plan details with all weeks and workouts
  app.get("/api/training-plans/details/:planId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const userId = req.user!.userId;
      
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
      
      // ── Baseline performance data ──────────────────────────────────────────
      // Fetch native AI Run Coach runs only (Garmin data excluded — legal constraint)
      // Window priority: 90 days → 180 days → no data message
      const now90  = new Date(Date.now() - 90  * 24 * 60 * 60 * 1000);
      const now180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

      const allNativeRuns = await db
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.userId, userId),
            gte(runs.completedAt, now180)
          )
        )
        .orderBy(desc(runs.completedAt))
        .limit(50);

      // Exclude Garmin-synced activities (legal constraint)
      const nativeOnly = allNativeRuns.filter(r => !r.externalSource || r.externalSource === 'airuncoach');

      // Determine which window to use and label it
      const runs90  = nativeOnly.filter(r => r.completedAt && new Date(r.completedAt) >= now90);
      const runs180 = nativeOnly; // already filtered to 180 days above

      let baselineRuns: typeof nativeOnly;
      let baselineWindowLabel: string;
      let baselineWindowDays: number;

      if (runs90.length > 0) {
        baselineRuns = runs90;
        baselineWindowLabel = "last 90 days";
        baselineWindowDays = 90;
      } else if (runs180.length > 0) {
        baselineRuns = runs180;
        baselineWindowLabel = "last 180 days";
        baselineWindowDays = 180;
      } else {
        baselineRuns = [];
        baselineWindowLabel = "none";
        baselineWindowDays = 0;
      }

      // Fetch all-time longestRunKm from userStats cache (same source as My Data)
      const [cachedStats] = await db
        .select({ longestRunKm: userStats.longestRunKm })
        .from(userStats)
        .where(eq(userStats.userId, userId));
      const allTimeLongestRun = cachedStats?.longestRunKm ?? null;

      // Calculate baseline metrics
      let performanceBaseline: any = null;
      if (baselineRuns.length === 0) {
        performanceBaseline = {
          hasHistory: false,
          message: "No AI Run Coach runs found in the last 180 days. Complete a run in the app to generate your baseline data.",
          allTimeLongestRun: allTimeLongestRun != null ? Number(allTimeLongestRun).toFixed(1) : null,
        };
      } else {
        // runs.distance is in km
        const totalDistance = baselineRuns.reduce((sum, r) => sum + (Number(r.distance) || 0), 0);
        const avgDistance = totalDistance / baselineRuns.length;

        // Longest run within the baseline window
        const windowLongestRun = Math.max(...baselineRuns.map(r => Number(r.distance) || 0));

        // Runs per week across the window span
        const oldestRunDate = new Date(baselineRuns[baselineRuns.length - 1].completedAt || Date.now());
        const newestRunDate  = new Date(baselineRuns[0].completedAt || Date.now());
        const spanDays = Math.max(1, Math.round((newestRunDate.getTime() - oldestRunDate.getTime()) / (24 * 60 * 60 * 1000)));
        const spanWeeks = Math.max(1, spanDays / 7);
        const runsPerWeek = baselineRuns.length / spanWeeks;

        // Date range label e.g. "12 Apr – 10 May 2026"
        const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const dateRangeLabel = baselineRuns.length >= 2
          ? `${fmt(oldestRunDate)} – ${fmt(newestRunDate)}`
          : fmt(newestRunDate);

        // Average pace
        const paceValues = baselineRuns
          .map(r => {
            if (!r.avgPace) return null;
            const parts = String(r.avgPace).split(':');
            if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            return null;
          })
          .filter((v): v is number => v !== null);
        const avgPaceSecs = paceValues.length > 0
          ? paceValues.reduce((a, b) => a + b, 0) / paceValues.length
          : null;

        performanceBaseline = {
          hasHistory: true,
          runsRecorded: baselineRuns.length,
          baselineWindow: baselineWindowLabel,
          dateRange: dateRangeLabel,
          runsPerWeek: runsPerWeek.toFixed(1),
          avgDistance: avgDistance.toFixed(2),
          // Longest run uses all-time figure from My Data cache for consistency; falls back to window max
          longestRun: allTimeLongestRun != null
            ? Number(allTimeLongestRun).toFixed(1)
            : windowLongestRun.toFixed(1),
          longestRunSource: allTimeLongestRun != null ? 'all_time' : 'window',
          avgPace: avgPaceSecs ? `${Math.floor(avgPaceSecs / 60)}:${String(Math.round(avgPaceSecs % 60)).padStart(2, '0')}` : null,
        };
      }
      
      res.json({
        plan: plan[0],
        weeks: weeksWithWorkouts,
        performanceBaseline
      });
    } catch (error: any) {
      console.error("Get training plan details error:", error);
      res.status(500).json({ error: "Failed to get training plan details" });
    }
  });
  
  // Regenerate remaining workouts in a training plan (e.g. after injury update)
  app.put("/api/training-plans/:planId/regenerate", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const userId = req.user!.userId;
      const { injuries = [] } = req.body;

      const plan = await db
        .select()
        .from(trainingPlans)
        .where(and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, userId)))
        .limit(1);

      if (!plan[0]) {
        return res.status(404).json({ error: "Plan not found or not authorized" });
      }

      const allWeeks = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.trainingPlanId, planId))
        .orderBy(weeklyPlans.weekNumber);

      const completedWorkoutsList = await db
        .select()
        .from(plannedWorkouts)
        .where(and(eq(plannedWorkouts.trainingPlanId, planId), eq(plannedWorkouts.isCompleted, true)));

      const completedWorkoutIds = new Set(completedWorkoutsList.map(w => w.id));

      // Anchor dates to plan creation week
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const planCreatedAt = plan[0].createdAt ? new Date(plan[0].createdAt) : today;
      planCreatedAt.setHours(0, 0, 0, 0);
      const planDaysSinceMonday = planCreatedAt.getDay() === 0 ? 6 : planCreatedAt.getDay() - 1;
      const planWeekStart = new Date(planCreatedAt);
      planWeekStart.setDate(planCreatedAt.getDate() - planDaysSinceMonday);

      const weeksSincePlanStart = Math.floor((today.getTime() - planWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const currentWeekNum = Math.max(1, weeksSincePlanStart + 1);
      const totalWeeks = plan[0].totalWeeks || allWeeks.length;
      const remainingWeekCount = Math.max(1, totalWeeks - currentWeekNum + 1);

      const validInjuries = (Array.isArray(injuries) ? injuries : []).filter(
        (i: any) => i && typeof i.bodyPart === 'string' && typeof i.status === 'string'
      );

      const injuryContext = validInjuries.length > 0 ? `
⚕️ HEALTH CONDITIONS — YOU ARE NOW ACTING AS BOTH RUNNING COACH AND SPORTS PHYSIOTHERAPIST

Active/Updated Injuries (athlete updated mid-plan — regenerate remaining weeks to reflect current status):
${validInjuries.map((i: any) => {
  const statusLabel = i.status === 'recovering' || i.status === 'RECOVERING' ? 'Recovering' :
                     i.status === 'healed'     || i.status === 'HEALED'     ? 'Healed (recent)' :
                     i.status === 'chronic'    || i.status === 'CHRONIC'    ? 'Chronic/ongoing' :
                     i.status === 'active'     || i.status === 'ACTIVE'     ? 'Active (acute)' : i.status;
  let weeksSince = '';
  if (i.injuryDate) {
    const msElapsed = Date.now() - new Date(i.injuryDate).getTime();
    const weeks = Math.floor(msElapsed / (7 * 24 * 60 * 60 * 1000));
    const days  = Math.floor((msElapsed % (7 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000));
    weeksSince = weeks > 0
      ? ` — injured ${weeks} week${weeks > 1 ? 's' : ''} ago (${new Date(i.injuryDate).toDateString()})`
      : ` — injured ${days} day${days !== 1 ? 's' : ''} ago`;
  }
  return `- ${i.bodyPart}: ${statusLabel}${weeksSince}${i.notes ? `\n  Notes: "${i.notes}"` : ''}`;
}).join('\n')}

Apply your full sports physiotherapy and coaching knowledge to redesign the remaining weeks appropriately:
1. TISSUE HEALING TIMELINE — Where is this athlete in the biological recovery process for this injury? What is physiologically appropriate at this stage?
2. LOADING PROTOCOL — What return-to-running or modified loading does sports physiotherapy evidence prescribe for this injury right now?
3. CONTRAINDICATED MOVEMENTS — What session types, intensities, or movement patterns are contraindicated?
4. PROGRESSION CRITERIA — What must the athlete demonstrate before advancing each week?
5. Every session's "instructions" field MUST include a symptom-monitoring note (acceptable pain level, stop-now criteria, expected next-day response).
A conservative plan that protects the injury is always better than one that risks re-injury or setback.
` : '';

      const fitness = await getCurrentFitness(userId);
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `You are an expert running coach. Regenerate the remaining ${remainingWeekCount} weeks of a training plan.

Original Plan: ${plan[0].goalType?.toUpperCase()} (${plan[0].targetDistance}km)
Experience Level: ${plan[0].experienceLevel}
Days Per Week: ${plan[0].daysPerWeek}
Total Weeks: ${totalWeeks} | Current Week: ${currentWeekNum}
Completed Workouts: ${completedWorkoutsList.length}
CTL: ${fitness?.ctl || 'N/A'} | Status: ${fitness?.status || 'N/A'}
${plan[0].targetDate ? `Race Date: ${new Date(plan[0].targetDate).toDateString()}` : ''}
${injuryContext}

Generate weeks ${currentWeekNum} to ${totalWeeks}. Return JSON:
{"weeks":[{"weekNumber":${currentWeekNum},"weekDescription":"...","totalDistance":25,"focusArea":"endurance","intensityLevel":"easy","workouts":[{"dayOfWeek":1,"workoutType":"easy","distance":6,"targetPace":"6:00/km","intensity":"z2","description":"...","instructions":"..."}]}]}

Include ${plan[0].daysPerWeek} workouts per week.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: "You are an expert running coach. Always respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 4000,
      });

      const regeneratedData = JSON.parse(response.choices[0].message.content || "{}");

      if (!regeneratedData.weeks || !Array.isArray(regeneratedData.weeks) || regeneratedData.weeks.length === 0) {
        return res.status(500).json({ error: "AI failed to generate valid workout data" });
      }

      // Delete incomplete future workouts AFTER successful AI generation
      const allWorkouts = await db.select().from(plannedWorkouts).where(eq(plannedWorkouts.trainingPlanId, planId));
      for (const w of allWorkouts) {
        if (!completedWorkoutIds.has(w.id) && (!w.scheduledDate || new Date(w.scheduledDate) >= today)) {
          await db.delete(plannedWorkouts).where(eq(plannedWorkouts.id, w.id));
        }
      }

      let newWorkoutCount = 0;
      for (const week of regeneratedData.weeks) {
        if (!week.workouts || !Array.isArray(week.workouts)) continue;
        let weeklyPlan = allWeeks.find(w => w.weekNumber === week.weekNumber);
        if (!weeklyPlan) {
          const inserted = await db.insert(weeklyPlans).values({
            trainingPlanId: planId, weekNumber: week.weekNumber,
            weekDescription: week.weekDescription || '', totalDistance: week.totalDistance,
            focusArea: week.focusArea, intensityLevel: week.intensityLevel,
          }).returning();
          weeklyPlan = inserted[0];
        } else {
          await db.update(weeklyPlans).set({
            weekDescription: week.weekDescription || '', totalDistance: week.totalDistance,
            focusArea: week.focusArea, intensityLevel: week.intensityLevel,
          }).where(eq(weeklyPlans.id, weeklyPlan.id));
        }
        for (const workout of week.workouts) {
          if (!workout.workoutType) continue;
          const dayOffsetFromMonday = ((workout.dayOfWeek || 1) + 6) % 7;
          const scheduledDate = new Date(planWeekStart);
          scheduledDate.setDate(planWeekStart.getDate() + ((week.weekNumber - 1) * 7) + dayOffsetFromMonday);
          if (scheduledDate < today) continue;
          await db.insert(plannedWorkouts).values({
            weeklyPlanId: weeklyPlan.id, trainingPlanId: planId,
            dayOfWeek: workout.dayOfWeek || 1, scheduledDate,
            workoutType: workout.workoutType, distance: workout.distance,
            targetPace: workout.targetPace, intensity: workout.intensity,
            description: workout.description, instructions: workout.instructions,
            isCompleted: false,
          });
          newWorkoutCount++;
        }
      }

      await db.insert(planAdaptations).values({
        trainingPlanId: planId, reason: "injury",
        changes: { injuries: validInjuries, regeneratedWeeks: remainingWeekCount, newWorkouts: newWorkoutCount },
        aiSuggestion: `Regenerated ${newWorkoutCount} workouts across ${remainingWeekCount} weeks due to injury update`,
        userAccepted: true,
      });

      res.json({
        success: true,
        message: `Regenerated ${newWorkoutCount} workouts across ${remainingWeekCount} remaining weeks`,
        workoutsRegenerated: newWorkoutCount,
        weeksAffected: remainingWeekCount,
        completedWorkoutsPreserved: completedWorkoutsList.length
      });
    } catch (error: any) {
      console.error("Regenerate training plan error:", error);
      res.status(500).json({ error: error.message || "Failed to regenerate training plan" });
    }
  });

  // ─── Rolling block: generate next training block ──────────────────────────
  // Called explicitly by the app when the user taps "Generate next block",
  // and also fires automatically from checkAndGeneratePendingBlocks() on run completion.
  app.post("/api/training-plans/:planId/next-block", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const userId = req.user!.userId;

      // Verify plan belongs to this user
      const [plan] = await db.select().from(trainingPlans).where(
        and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, userId))
      );
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.generatedThroughWeek == null) {
        return res.status(400).json({ error: "This is a legacy plan — all weeks are already generated" });
      }
      if ((plan.generatedThroughWeek ?? 0) >= plan.totalWeeks) {
        return res.status(400).json({ error: "Plan is already fully generated", fullyGenerated: true });
      }

      // Return immediately, generate in background
      res.json({ message: "Generating next training block — check back in ~30 seconds", status: "generating" });

      setImmediate(() => {
        generateNextBlock(planId, userId).catch(err =>
          console.error(`[NextBlock] Manual trigger failed for plan ${planId}:`, err)
        );
      });
    } catch (err: any) {
      console.error("Error triggering next block:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Rolling block: check plan generation status ──────────────────────────
  app.get("/api/training-plans/:planId/block-status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const userId = req.user!.userId;

      const [plan] = await db.select().from(trainingPlans).where(
        and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, userId))
      );
      if (!plan) return res.status(404).json({ error: "Plan not found" });

      const isRolling = plan.generatedThroughWeek != null;
      const generatedThroughWeek = plan.generatedThroughWeek ?? plan.totalWeeks;
      const isFullyGenerated = generatedThroughWeek >= plan.totalWeeks;
      const nextBlockAt = plan.nextBlockAt;

      // Human-readable next block message
      let nextBlockMessage: string | null = null;
      if (!isFullyGenerated && nextBlockAt) {
        const dateStr = nextBlockAt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        nextBlockMessage = `Your next training block will be generated on ${dateStr}. This ensures your plan evolves with your progress and adapts to your actual fitness.`;
      }

      res.json({
        planId,
        totalWeeks: plan.totalWeeks,
        generatedThroughWeek,
        isRolling,
        isFullyGenerated,
        nextBlockAt: nextBlockAt ?? null,
        nextBlockMessage,
        nextBlockReady: !isFullyGenerated && nextBlockAt != null && new Date(nextBlockAt) <= new Date(),
      });
    } catch (err: any) {
      console.error("Error getting block status:", err);
      res.status(500).json({ error: err.message });
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
  
  // Get today's workout for a plan
  app.get("/api/training-plans/:planId/today", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const { timezone } = req.query as { timezone?: string };

      // Use user's local timezone so "today" matches their calendar day, not server UTC
      const today = timezone
        ? new Date(new Date().toLocaleDateString('en-CA', { timeZone: timezone }) + 'T00:00:00')
        : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // 1. Look for an incomplete workout scheduled EXACTLY today
      const todaysWorkouts = await db.select().from(plannedWorkouts)
        .where(and(
          eq(plannedWorkouts.trainingPlanId, planId),
          gte(plannedWorkouts.scheduledDate, today),
          lt(plannedWorkouts.scheduledDate, tomorrow),
          eq(plannedWorkouts.isCompleted, false)
        ))
        .orderBy(plannedWorkouts.scheduledDate)
        .limit(1);

      if (todaysWorkouts.length > 0) {
        return res.json({ workout: todaysWorkouts[0], isToday: true, isOverdue: false });
      }

      // 2. No workout today — look for the most recent overdue (incomplete, scheduled before today)
      const overdueWorkouts = await db.select().from(plannedWorkouts)
        .where(and(
          eq(plannedWorkouts.trainingPlanId, planId),
          lt(plannedWorkouts.scheduledDate, today),
          eq(plannedWorkouts.isCompleted, false)
        ))
        .orderBy(desc(plannedWorkouts.scheduledDate))
        .limit(1);

      if (overdueWorkouts.length > 0) {
        return res.json({ workout: overdueWorkouts[0], isToday: false, isOverdue: true });
      }

      // 3. Rest day — no workout today and nothing overdue
      res.json({ workout: null, isToday: false, isOverdue: false });
    } catch (error: any) {
      console.error("Get today workout error:", error);
      res.status(500).json({ error: "Failed to get today's workout" });
    }
  });

  // Get training plan progress stats
  app.get("/api/training-plans/:planId/progress", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;

      const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, planId));
      if (!plan) return res.status(404).json({ error: "Plan not found" });

      const allWorkouts = await db.select().from(plannedWorkouts).where(eq(plannedWorkouts.trainingPlanId, planId));
      const completedCount = allWorkouts.filter(w => w.isCompleted).length;
      const totalCount = allWorkouts.length;

      // Weekly breakdown
      const allWeeks = await db.select().from(weeklyPlans).where(eq(weeklyPlans.trainingPlanId, planId)).orderBy(weeklyPlans.weekNumber);
      const weekStats = await Promise.all(allWeeks.map(async (week) => {
        const weekWorkouts = allWorkouts.filter(w => w.weeklyPlanId === week.id);
        const completed = weekWorkouts.filter(w => w.isCompleted).length;
        return {
          weekNumber: week.weekNumber,
          weekDescription: week.weekDescription,
          totalDistance: week.totalDistance,
          focusArea: week.focusArea,
          intensityLevel: week.intensityLevel,
          totalWorkouts: weekWorkouts.length,
          completedWorkouts: completed,
          completionRate: weekWorkouts.length > 0 ? completed / weekWorkouts.length : 0,
        };
      }));

      res.json({
        planId,
        currentWeek: plan.currentWeek,
        totalWeeks: plan.totalWeeks,
        goalType: plan.goalType,
        targetDistance: plan.targetDistance,
        targetTime: plan.targetTime,
        status: plan.status,
        completedWorkouts: completedCount,
        totalWorkouts: totalCount,
        overallCompletion: totalCount > 0 ? completedCount / totalCount : 0,
        weeks: weekStats,
      });
    } catch (error: any) {
      console.error("Get plan progress error:", error);
      res.status(500).json({ error: "Failed to get plan progress" });
    }
  });

  // Get pending/completed adaptations for a training plan (for iOS app compatibility)
  app.get("/api/training-plans/:planId/adaptations", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;

      // Verify plan exists and belongs to user
      const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, planId));
      if (!plan) return res.status(404).json({ error: "Plan not found" });
      if (plan.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Fetch all adaptations for this plan
      const adaptations = await db.select().from(planAdaptations).where(
        eq(planAdaptations.trainingPlanId, planId)
      ).orderBy(desc(planAdaptations.createdAt));

      res.json({
        planId,
        count: adaptations.length,
        adaptations: adaptations.map(a => ({
          id: a.id,
          trainingPlanId: a.trainingPlanId,
          adaptationDate: a.createdAt,
          reason: a.reason,
          changes: a.changes,
          aiSuggestion: a.aiSuggestion,
          userAccepted: a.userAccepted,
        })),
      });
    } catch (error: any) {
      console.error("Get plan adaptations error:", error);
      res.status(500).json({ error: "Failed to get plan adaptations" });
    }
  });

  // Complete a workout (link to a run session)
  app.put("/api/training-plans/workouts/:workoutId/complete", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workoutId } = req.params;
      const { runId } = req.body;

      console.log(`✅ Completing workout ${workoutId}...`);

      // Update the workout
      const updateResult = await db.update(plannedWorkouts)
        .set({ isCompleted: true, completedRunId: runId || null })
        .where(eq(plannedWorkouts.id, workoutId));

      console.log(`✅ Workout updated: ${workoutId}`);

      // Fetch the UPDATED workout to confirm
      const [workout] = await db.select().from(plannedWorkouts).where(eq(plannedWorkouts.id, workoutId));
      
      if (!workout) {
        console.error(`❌ Workout not found after update: ${workoutId}`);
        return res.status(404).json({ error: "Workout not found after update" });
      }

      console.log(`✅ Confirmed: workout ${workoutId} isCompleted=${workout.isCompleted}`);
      
      if (workout.weeklyPlanId && workout.trainingPlanId) {
        // Check if all workouts in this week are complete
        const weekWorkouts = await db.select().from(plannedWorkouts)
          .where(eq(plannedWorkouts.weeklyPlanId, workout.weeklyPlanId));
        
        const allComplete = weekWorkouts.every(w => w.isCompleted);
        if (allComplete) {
          // Advance to next week
          const [week] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, workout.weeklyPlanId));
          if (week) {
            console.log(`📅 Week ${week.weekNumber} complete, advancing to week ${week.weekNumber + 1}`);
            await db.update(trainingPlans)
              .set({ currentWeek: week.weekNumber + 1 })
              .where(eq(trainingPlans.id, workout.trainingPlanId));
          }
        }
        
        // Fetch and return updated plan progress
        const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, workout.trainingPlanId));
        if (plan) {
          const allWorkouts = await db.select().from(plannedWorkouts).where(eq(plannedWorkouts.trainingPlanId, plan.id));
          const completedCount = allWorkouts.filter(w => w.isCompleted).length;
          const totalCount = allWorkouts.length;
          
          console.log(`✅ Plan ${plan.id}: ${completedCount}/${totalCount} completed (${((completedCount/totalCount)*100).toFixed(0)}%)`);
          
          res.json({ 
            success: true, 
            workoutId,
            isCompleted: workout.isCompleted,
            planProgress: {
              completedWorkouts: completedCount,
              totalWorkouts: totalCount,
              overallCompletion: totalCount > 0 ? completedCount / totalCount : 0,
            }
          });
        } else {
          res.json({ success: true, workoutId, isCompleted: workout.isCompleted });
        }
      } else {
        res.json({ success: true, workoutId, isCompleted: workout.isCompleted });
      }
    } catch (error: any) {
      console.error("❌ Complete workout error:", error);
      res.status(500).json({ error: "Failed to complete workout" });
    }
  });

  // Skip a workout (mark rest day / missed)
  app.put("/api/training-plans/workouts/:workoutId/skip", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workoutId } = req.params;
      await db.update(plannedWorkouts).set({ isCompleted: true }).where(eq(plannedWorkouts.id, workoutId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to skip workout" });
    }
  });

  // Pause or cancel a plan
  // iOS uses PATCH, Android uses PUT — both are supported
  app.patch("/api/training-plans/:planId/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const { status } = req.body as { status: 'active' | 'paused' | 'completed' | 'cancelled' | 'abandoned' };
      const normalisedStatus = status === 'abandoned' ? 'cancelled' : status;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const plan = await db
        .select()
        .from(trainingPlans)
        .where(and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, userId)))
        .limit(1);

      if (plan.length === 0) {
        return res.status(404).json({ error: "Plan not found or not authorized" });
      }

      const validStatuses = ['active', 'paused', 'completed', 'cancelled', 'abandoned'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      await db.update(trainingPlans).set({ status: normalisedStatus }).where(eq(trainingPlans.id, planId));
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update plan status" });
    }
  });

  app.put("/api/training-plans/:planId/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const { status } = req.body as { status: 'active' | 'paused' | 'completed' | 'cancelled' | 'abandoned' };
      const normalisedStatus = status === 'abandoned' ? 'cancelled' : status;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Verify the plan belongs to the user
      const plan = await db
        .select()
        .from(trainingPlans)
        .where(and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, userId)))
        .limit(1);

      if (plan.length === 0) {
        return res.status(404).json({ error: "Plan not found or not authorized" });
      }

      // Validate status value
      const validStatuses = ['active', 'paused', 'completed', 'cancelled', 'abandoned'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      await db.update(trainingPlans).set({ status: normalisedStatus }).where(eq(trainingPlans.id, planId));
      // Return empty response since client expects Response<Unit>
      res.setHeader("Content-Type", "application/json");
      res.status(200).send();
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update plan status" });
    }
  });

  // Delete a training plan and all associated data
  app.delete("/api/training-plans/:planId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Verify the plan belongs to the user
      const plan = await db
        .select()
        .from(trainingPlans)
        .where(and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, userId)))
        .limit(1);

      if (plan.length === 0) {
        return res.status(404).json({ error: "Plan not found or not authorized" });
      }

      // Delete all planned workouts for this training plan's weekly plans
      const planWeeks = await db
        .select({ id: weeklyPlans.id })
        .from(weeklyPlans)
        .where(eq(weeklyPlans.trainingPlanId, planId));

      for (const week of planWeeks) {
        await db.delete(plannedWorkouts).where(eq(plannedWorkouts.weeklyPlanId, week.id));
      }

      // Delete all weekly plans
      await db.delete(weeklyPlans).where(eq(weeklyPlans.trainingPlanId, planId));

      // Delete all plan adaptations (must be before deleting the training plan due to FK constraint)
      await db.delete(planAdaptations).where(eq(planAdaptations.trainingPlanId, planId));

      // Finally delete the training plan itself
      await db.delete(trainingPlans).where(eq(trainingPlans.id, planId));

      res.json({ success: true, planId, message: "Training plan deleted permanently" });
    } catch (error: any) {
      console.error("Delete training plan error:", error);
      res.status(500).json({ error: "Failed to delete training plan" });
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

  // ==================== SHARE RUN LINK ENDPOINTS ====================

  // Generate a shareable link for a run
  app.post("/api/runs/:id/share-link", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const runId = req.params.id;
      const run = await storage.getRun(runId);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (run.userId !== req.user!.userId) return res.status(403).json({ error: "You can only share your own runs" });

      const user = await storage.getUser(req.user!.userId);

      // Check if a share link already exists for this run
      const existing = await db.select().from(sharedRuns).where(eq(sharedRuns.runId, runId)).limit(1);
      
      if (existing.length > 0) {
        const share = existing[0];
        const shareUrl = `https://airuncoach.live/share/${share.shareToken}`;
        return res.json({
          shareToken: share.shareToken,
          shareUrl,
          deepLink: `airuncoach://run/${runId}?ref=${share.shareToken}`,
        });
      }

      // Generate a short unique token (8 chars, URL-safe)
      const { randomBytes } = await import("node:crypto");
      const shareToken = randomBytes(6).toString("base64url").slice(0, 8);

      const distanceKm = normalizeDistanceMeters(run) / 1000;
      const durationSec = normalizeDurationSeconds(run);

      await db.insert(sharedRuns).values({
        shareToken,
        runId,
        sharerId: req.user!.userId,
        sharerName: user?.name || "A runner",
        distanceKm,
        durationSeconds: durationSec,
        avgPace: run.avgPace || null,
        completedAt: run.completedAt || new Date(),
      });

      const shareUrl = `https://airuncoach.live/share/${shareToken}`;
      res.json({
        shareToken,
        shareUrl,
        deepLink: `airuncoach://run/${runId}?ref=${shareToken}`,
      });
    } catch (error: any) {
      console.error("Create share link error:", error);
      res.status(500).json({ error: "Failed to create share link" });
    }
  });

  // Public landing page for shared run links (no auth required)
  app.get("/share/:token", async (req: Request, res: Response) => {
    try {
      const results = await db.select().from(sharedRuns).where(eq(sharedRuns.shareToken, req.params.token)).limit(1);
      
      if (results.length === 0) {
        return res.status(404).send(buildShareNotFoundPage());
      }

      const share = results[0];

      // Increment view count
      await db.update(sharedRuns)
        .set({ viewCount: (share.viewCount || 0) + 1 })
        .where(eq(sharedRuns.id, share.id));

      // Build a beautiful HTML landing page
      const html = buildShareLandingPage(share);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error: any) {
      console.error("Share landing page error:", error);
      res.status(500).send("Something went wrong");
    }
  });

  // API endpoint for the app to fetch shared run data (after deep link opens)
  app.get("/api/shared-run/:token", async (req: Request, res: Response) => {
    try {
      const results = await db.select().from(sharedRuns).where(eq(sharedRuns.shareToken, req.params.token)).limit(1);
      
      if (results.length === 0) {
        return res.status(404).json({ error: "Shared run not found" });
      }

      const share = results[0];
      res.json({
        runId: share.runId,
        sharerId: share.sharerId,
        sharerName: share.sharerName,
        distanceKm: share.distanceKm,
        durationSeconds: share.durationSeconds,
        avgPace: share.avgPace,
        completedAt: share.completedAt,
      });
    } catch (error: any) {
      console.error("Get shared run error:", error);
      res.status(500).json({ error: "Failed to get shared run" });
    }
  });

  // ==================== SHARE IMAGE CMS ENDPOINTS ====================

  // Build normalized run data for share image generation
  function buildShareRunData(run: any, timezone?: string) {
    const distanceKm = normalizeDistanceMeters(run) / 1000;
    const durationSec = normalizeDurationSeconds(run);
    
    // Normalize GPS track: DB may store {latitude, longitude} or {lat, lng}
    const rawGps = Array.isArray(run.gpsTrack) ? run.gpsTrack as any[] : [];
    const gpsTrack = rawGps.length > 1 ? rawGps.map((p: any) => ({
      lat: p.lat ?? p.latitude ?? 0,
      lng: p.lng ?? p.longitude ?? 0,
      ...(p.elevation != null ? { elevation: p.elevation } : {}),
      ...(p.alt != null ? { alt: p.alt } : {}),
      ...(p.altitude != null ? { altitude: p.altitude } : {}),
    })).filter((p: any) => p.lat !== 0 && p.lng !== 0) : undefined;
    
    // Build paceData from kmSplits if paceData not available
    const rawKmSplits = Array.isArray(run.kmSplits) ? run.kmSplits as any[] : [];
    let paceData = run.paceData as any;
    if ((!paceData || !Array.isArray(paceData) || paceData.length === 0) && rawKmSplits.length > 0) {
      paceData = rawKmSplits.map((s: any) => {
        const parts = (s.pace || '0:00').split(':');
        const paceSec = parts.length === 2 ? (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0) : 0;
        return { km: s.km, pace: s.pace, paceSeconds: paceSec };
      });
    }

    return {
      distance: distanceKm,
      duration: durationSec,
      avgPace: run.avgPace || undefined,
      avgHeartRate: run.avgHeartRate || undefined,
      maxHeartRate: run.maxHeartRate || undefined,
      calories: run.calories || undefined,
      cadence: run.cadence || undefined,
      totalSteps: run.totalSteps || undefined,
      elevation: run.elevation || undefined,
      elevationGain: run.elevationGain || undefined,
      elevationLoss: run.elevationLoss || undefined,
      difficulty: run.difficulty || undefined,
      gpsTrack,
      heartRateData: (run.heartRateData as any) || undefined,
      paceData,
      completedAt: run.completedAt?.toISOString() || undefined,
      name: run.name || undefined,
      weatherData: (run.weatherData as any) || undefined,
      timezone: timezone || undefined,
    };
  }

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
      const { templateId, aspectRatio, stickers, runId, customBackground, backgroundOpacity, backgroundBlur, customStickers, ringLayout, customCaption } = req.body;
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

      const [user, notifPrefs] = await Promise.all([
        storage.getUser(req.user!.userId),
        storage.getNotificationPreferences(req.user!.userId),
      ]);
      const userTimezone = notifPrefs?.coachingPlanReminderTimezone || "UTC";

      const { generateShareImage } = await import("./share-image-service");
      
      const imageBuffer = await generateShareImage({
        templateId,
        aspectRatio: aspectRatio || "9:16",
        stickers: stickers || [],
        runData: buildShareRunData(run, userTimezone),
        userName: user?.name || undefined,
        customBackground: customBackground || undefined,
        backgroundOpacity: backgroundOpacity ?? undefined,
        backgroundBlur: backgroundBlur ?? undefined,
        customStickers: customStickers || undefined,
        ringLayout: ringLayout || undefined,
        customCaption: customCaption || undefined,
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
      const { templateId, aspectRatio, stickers, runId, customBackground, backgroundOpacity, backgroundBlur, customStickers, ringLayout, customCaption } = req.body;
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

      const [user, notifPrefs] = await Promise.all([
        storage.getUser(req.user!.userId),
        storage.getNotificationPreferences(req.user!.userId),
      ]);
      const userTimezone = notifPrefs?.coachingPlanReminderTimezone || "UTC";

      const { generateShareImage } = await import("./share-image-service");

      const imageBuffer = await generateShareImage({
        templateId,
        aspectRatio: aspectRatio || "9:16",
        stickers: stickers || [],
        runData: buildShareRunData(run, userTimezone),
        userName: user?.name || undefined,
        customBackground: customBackground || undefined,
        backgroundOpacity: backgroundOpacity ?? undefined,
        backgroundBlur: backgroundBlur ?? undefined,
        customStickers: customStickers || undefined,
        ringLayout: ringLayout || undefined,
        customCaption: customCaption || undefined,
      });

      const base64 = imageBuffer.toString("base64");
      res.json({ image: `data:image/png;base64,${base64}` });
    } catch (error: any) {
      console.error("Generate preview error:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  // ==================== HEALTH INSIGHTS ENDPOINTS ====================
  
  // HEALTH - Get today's health snapshot
  app.get("/api/health/today", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getTodaySnapshot } = await import('./health-insights-service');
      const snapshot = await getTodaySnapshot(req.user.userId);
      res.json(snapshot);
    } catch (error: any) {
      console.error("Get today snapshot error:", error);
      res.status(500).json({ error: "Failed to get health snapshot" });
    }
  });

  // HEALTH - Get sleep details
  app.get("/api/health/sleep", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getSleepDetails } = await import('./health-insights-service');
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const details = await getSleepDetails(req.user.userId, date);
      if (!details) {
        return res.status(404).json({ error: "No sleep data for this date" });
      }
      res.json(details);
    } catch (error: any) {
      console.error("Get sleep details error:", error);
      res.status(500).json({ error: "Failed to get sleep details" });
    }
  });

  // HEALTH - Get recovery status
  app.get("/api/health/recovery", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getRecoveryStatus } = await import('./health-insights-service');
      const status = await getRecoveryStatus(req.user.userId);
      res.json(status);
    } catch (error: any) {
      console.error("Get recovery status error:", error);
      res.status(500).json({ error: "Failed to get recovery status" });
    }
  });

  // HEALTH - Get daily wellness metrics
  app.get("/api/health/daily", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getDailyWellness } = await import('./health-insights-service');
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const wellness = await getDailyWellness(req.user.userId, date);
      if (!wellness) {
        return res.status(404).json({ error: "No wellness data for this date" });
      }
      res.json(wellness);
    } catch (error: any) {
      console.error("Get daily wellness error:", error);
      res.status(500).json({ error: "Failed to get daily wellness" });
    }
  });

  // HEALTH - Get health metrics
  app.get("/api/health/metrics", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getHealthMetrics } = await import('./health-insights-service');
      const metrics = await getHealthMetrics(req.user.userId);
      res.json(metrics);
    } catch (error: any) {
      console.error("Get health metrics error:", error);
      res.status(500).json({ error: "Failed to get health metrics" });
    }
  });

  // HEALTH - Get health insights
  app.get("/api/health/insights", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getHealthInsights } = await import('./health-insights-service');
      const insights = await getHealthInsights(req.user.userId);
      res.json(insights);
    } catch (error: any) {
      console.error("Get health insights error:", error);
      res.status(500).json({ error: "Failed to get health insights" });
    }
  });

  // HEALTH - Get trend data
  app.get("/api/health/trends", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { getTrendData } = await import('./health-insights-service');
      const days = parseInt((req.query.days as string) || '7', 10);
      const trends = await getTrendData(req.user.userId, days);
      res.json(trends);
    } catch (error: any) {
      console.error("Get trend data error:", error);
      res.status(500).json({ error: "Failed to get trend data" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP RUNS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Helper: build the full GroupRun JSON object with computed per-user fields */
  async function buildGroupRunResponse(groupRunId: string, requestingUserId: string) {
    const [gr] = await db.select({
      id: groupRuns.id,
      hostUserId: groupRuns.hostUserId,
      title: groupRuns.title,
      description: groupRuns.description,
      meetingPoint: groupRuns.meetingPoint,
      meetingLat: groupRuns.meetingLat,
      meetingLng: groupRuns.meetingLng,
      targetDistance: groupRuns.targetDistance,
      plannedStartAt: groupRuns.plannedStartAt,
      maxParticipants: groupRuns.maxParticipants,
      isPublic: groupRuns.isPublic,
      status: groupRuns.status,
      inviteToken: groupRuns.inviteToken,
      createdAt: groupRuns.createdAt,
    }).from(groupRuns).where(eq(groupRuns.id, groupRunId));
    if (!gr) return null;

    const participants = await db
      .select({
        userId: groupRunParticipants.userId,
        role: groupRunParticipants.role,
        invitationStatus: groupRunParticipants.invitationStatus,
        readyToStart: groupRunParticipants.readyToStart,
        runId: groupRunParticipants.runId,
        name: users.name,
        profilePic: users.profilePic,
      })
      .from(groupRunParticipants)
      .innerJoin(users, eq(users.id, groupRunParticipants.userId))
      .where(eq(groupRunParticipants.groupRunId, groupRunId));

    const myParticipant = participants.find(p => p.userId === requestingUserId);
    const host = await db.select({ name: users.name }).from(users).where(eq(users.id, gr.hostUserId)).limit(1);

    return {
      id: gr.id,
      name: gr.title ?? "Group Run",
      title: gr.title ?? "Group Run",
      description: gr.description,
      creatorId: gr.hostUserId,
      hostUserId: gr.hostUserId,
      creatorName: host[0]?.name ?? "Unknown",
      meetingPoint: gr.meetingPoint,
      meetingLat: gr.meetingLat,
      meetingLng: gr.meetingLng,
      distance: gr.targetDistance ?? 5.0,
      dateTime: gr.plannedStartAt?.toISOString() ?? "",
      plannedStartAt: gr.plannedStartAt?.toISOString() ?? null,
      maxParticipants: gr.maxParticipants,
      currentParticipants: participants.filter(p => p.invitationStatus === "accepted").length,
      isPublic: gr.isPublic,
      status: gr.status,
      inviteToken: gr.inviteToken,
      createdAt: gr.createdAt?.toISOString() ?? null,
      isJoined: !!myParticipant && myParticipant.invitationStatus === "accepted",
      isOrganiser: gr.hostUserId === requestingUserId,
      myInvitationStatus: myParticipant?.invitationStatus ?? null,
      participants: participants.map(p => ({
        userId: p.userId,
        userName: p.name,
        profilePic: p.profilePic,
        invitationStatus: p.invitationStatus,
        role: p.role,
        runId: p.runId,
        readyToStart: p.readyToStart,
      })),
    };
  }

  // REMOVED: Another duplicate /api/group-runs endpoint (now handled by line 3605)

  // GET /api/group-runs/:id
  app.get("/api/group-runs/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const gr = await buildGroupRunResponse(id, userId);
      if (!gr) return res.status(404).json({ error: "Group run not found" });
      res.json(gr);
    } catch (error: any) {
      console.error("[GET /api/group-runs/:id]", error);
      res.status(500).json({ error: "Failed to fetch group run" });
    }
  });

  // POST /api/group-runs — create
  app.post("/api/group-runs", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { name, description, meetingPoint, meetingLat, meetingLng, distance, dateTime, maxParticipants, isPublic } = req.body;
      if (!name || !dateTime || !distance) {
        return res.status(400).json({ error: "name, dateTime and distance are required" });
      }

      const [newRun] = await db.insert(groupRuns).values({
        name,
        description: description ?? "",
        creatorId: userId,
        meetingPoint: meetingPoint ?? null,
        meetingLat: meetingLat ?? null,
        meetingLng: meetingLng ?? null,
        distance: Number(distance),
        dateTime: new Date(dateTime),
        maxParticipants: maxParticipants ?? 10,
        isPublic: isPublic ?? true,
        status: "upcoming",
      }).returning();

      // Add creator as organiser participant
      await db.insert(groupRunParticipants).values({
        groupRunId: newRun.id,
        userId,
        role: "organiser",
        invitationStatus: "accepted",
        readyToStart: false,
      });

      const gr = await buildGroupRunResponse(newRun.id, userId);
      res.status(201).json(gr);
    } catch (error: any) {
      console.error("[POST /api/group-runs]", error);
      res.status(500).json({ error: "Failed to create group run" });
    }
  });

  // POST /api/group-runs/:id/invite — invite friends by userId list
  app.post("/api/group-runs/:id/invite", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { userIds } = req.body as { userIds: string[] };

      const [gr] = await db.select({ id: groupRuns.id, hostUserId: groupRuns.hostUserId }).from(groupRuns).where(eq(groupRuns.id, id));
      if (!gr) return res.status(404).json({ error: "Group run not found" });
      if (gr.hostUserId !== userId) return res.status(403).json({ error: "Only the organiser can invite" });

      for (const uid of (userIds ?? [])) {
        // Upsert — don't re-invite if already a participant
        const existing = await db.select().from(groupRunParticipants)
          .where(and(eq(groupRunParticipants.groupRunId, id), eq(groupRunParticipants.userId, uid)));
        if (existing.length === 0) {
          await db.insert(groupRunParticipants).values({
            groupRunId: id, userId: uid, role: "participant", invitationStatus: "pending", readyToStart: false,
          });
        }
      }

      res.status(200).json({ invited: userIds?.length ?? 0 });
    } catch (error: any) {
      console.error("[POST /api/group-runs/:id/invite]", error);
      res.status(500).json({ error: "Failed to invite" });
    }
  });

  // POST /api/group-runs/:id/respond — accept or decline invite
  app.post("/api/group-runs/:id/respond", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { response: resp } = req.body as { response: string };

      if (!["accepted", "declined"].includes(resp)) {
        return res.status(400).json({ error: "response must be 'accepted' or 'declined'" });
      }

      const existing = await db.select().from(groupRunParticipants)
        .where(and(eq(groupRunParticipants.groupRunId, id), eq(groupRunParticipants.userId, userId)));

      if (existing.length === 0) {
        // User is joining a public run they weren't explicitly invited to
        await db.insert(groupRunParticipants).values({
          groupRunId: id, userId, role: "participant", invitationStatus: resp, readyToStart: false,
        });
      } else {
        await db.update(groupRunParticipants)
          .set({ invitationStatus: resp })
          .where(and(eq(groupRunParticipants.groupRunId, id), eq(groupRunParticipants.userId, userId)));
      }

      const gr = await buildGroupRunResponse(id, userId);
      if (!gr) return res.status(404).json({ error: "Group run not found" });
      res.json(gr);
    } catch (error: any) {
      console.error("[POST /api/group-runs/:id/respond]", error);
      res.status(500).json({ error: "Failed to respond" });
    }
  });

  // POST /api/group-runs/:id/ready — mark self as ready to start
  app.post("/api/group-runs/:id/ready", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      await db.update(groupRunParticipants)
        .set({ readyToStart: true })
        .where(and(eq(groupRunParticipants.groupRunId, id), eq(groupRunParticipants.userId, userId)));

      const gr = await buildGroupRunResponse(id, userId);
      if (!gr) return res.status(404).json({ error: "Group run not found" });
      res.json(gr);
    } catch (error: any) {
      console.error("[POST /api/group-runs/:id/ready]", error);
      res.status(500).json({ error: "Failed to mark ready" });
    }
  });

  // POST /api/group-runs/:id/start — organiser starts the run
  app.post("/api/group-runs/:id/start", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const [gr] = await db.select({ id: groupRuns.id, hostUserId: groupRuns.hostUserId }).from(groupRuns).where(eq(groupRuns.id, id));
      if (!gr) return res.status(404).json({ error: "Group run not found" });
      if (gr.hostUserId !== userId) return res.status(403).json({ error: "Only the organiser can start the run" });

      await db.update(groupRuns).set({ status: "active" }).where(eq(groupRuns.id, id));

      const updated = await buildGroupRunResponse(id, userId);
      res.json(updated);
    } catch (error: any) {
      console.error("[POST /api/group-runs/:id/start]", error);
      res.status(500).json({ error: "Failed to start group run" });
    }
  });

  // POST /api/group-runs/:id/complete — link a completed run session
  app.post("/api/group-runs/:id/complete", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { runId } = req.body as { runId: string };

      if (runId) {
        // Link the participant row to the run
        await db.update(groupRunParticipants)
          .set({ runId })
          .where(and(eq(groupRunParticipants.groupRunId, id), eq(groupRunParticipants.userId, userId)));
        // Also stamp the run itself so we can look up group runs by runId
        await db.update(runs).set({ groupRunId: id }).where(eq(runs.id, runId));
      }

      // If organiser, mark whole run as completed
      const [gr] = await db.select({ hostUserId: groupRuns.hostUserId }).from(groupRuns).where(eq(groupRuns.id, id));
      if (gr?.hostUserId === userId) {
        await db.update(groupRuns).set({ status: "completed" }).where(eq(groupRuns.id, id));
      }

      const updated = await buildGroupRunResponse(id, userId);
      if (!updated) return res.status(404).json({ error: "Group run not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("[POST /api/group-runs/:id/complete]", error);
      res.status(500).json({ error: "Failed to complete group run" });
    }
  });

  // GET /api/group-runs/by-run/:runId — look up which group run a specific run belongs to
  app.get("/api/group-runs/by-run/:runId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId } = req.params;
      // First try the direct stamp on the run row (set by the complete endpoint)
      const [runRow] = await db.select({ groupRunId: runs.groupRunId }).from(runs).where(eq(runs.id, runId));
      const groupRunId = runRow?.groupRunId;
      if (!groupRunId) return res.status(404).json({ error: "Not a group run" });

      const [gr] = await db.select({ id: groupRuns.id, title: groupRuns.title }).from(groupRuns).where(eq(groupRuns.id, groupRunId));
      if (!gr) return res.status(404).json({ error: "Group run not found" });

      res.json({ groupRunId: gr.id, groupRunName: gr.title });
    } catch (error: any) {
      console.error("[GET /api/group-runs/by-run/:runId]", error);
      res.status(500).json({ error: "Failed to look up group run" });
    }
  });

  // GET /api/group-runs/:id/results
  app.get("/api/group-runs/:id/results", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const [gr] = await db.select({ title: groupRuns.title }).from(groupRuns).where(eq(groupRuns.id, id));

      const participants = await db
        .select({
          userId: groupRunParticipants.userId,
          runId: groupRunParticipants.runId,
          name: users.name,
          profilePic: users.profilePic,
        })
        .from(groupRunParticipants)
        .innerJoin(users, eq(users.id, groupRunParticipants.userId))
        .where(and(eq(groupRunParticipants.groupRunId, id), eq(groupRunParticipants.invitationStatus, "accepted")));

      const results = await Promise.all(
        participants.map(async p => {
          let stats = null;
          if (p.runId) {
            const [run] = await db.select({
              distance: runs.distance, duration: runs.duration,
              avgPace: runs.avgPace, avgHeartRate: runs.avgHeartRate, calories: runs.calories,
              cadence: runs.cadence, elevationGain: runs.elevationGain,
              completedAt: runs.completedAt,
            }).from(runs).where(eq(runs.id, p.runId));
            if (run) {
              stats = {
                distance: run.distance, duration: run.duration,
                avgPace: run.avgPace, avgHeartRate: run.avgHeartRate, calories: run.calories,
                avgCadence: run.cadence, totalElevationGain: run.elevationGain,
              };
            }
          }
          return {
            userId: p.userId,
            userName: p.name,
            profilePic: p.profilePic,
            runId: p.runId,
            completedAt: null,
            isCurrentUser: p.userId === userId,
            stats,
          };
        })
      );

      res.json({ groupRunId: id, groupRunName: gr?.title ?? null, results });
    } catch (error: any) {
      console.error("[GET /api/group-runs/:id/results]", error);
      res.status(500).json({ error: "Failed to get results" });
    }
  });

  // DELETE /api/group-runs/:id/leave
  app.delete("/api/group-runs/:id/leave", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      await db.delete(groupRunParticipants)
        .where(and(eq(groupRunParticipants.groupRunId, id), eq(groupRunParticipants.userId, userId)));

      res.status(204).send();
    } catch (error: any) {
      console.error("[DELETE /api/group-runs/:id/leave]", error);
      res.status(500).json({ error: "Failed to leave group run" });
    }
  });

  // POST /api/group-runs/:id/debrief — AI post-run narrative comparing user vs group
  app.post("/api/group-runs/:id/debrief", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      // Fetch the group run
      const groupRun = await db.select({ id: groupRuns.id, title: groupRuns.title, hostUserId: groupRuns.hostUserId }).from(groupRuns).where(eq(groupRuns.id, id)).limit(1);
      if (groupRun.length === 0) return res.status(404).json({ error: "Group run not found" });
      const gr = groupRun[0];

      // Fetch all participants with their linked runs
      const participants = await db.select().from(groupRunParticipants)
        .where(eq(groupRunParticipants.groupRunId, id));

      if (participants.length < 2) {
        return res.json({ debrief: "Not enough participants to generate a group comparison." });
      }

      // Fetch run data for each participant who has a linked run
      const participantData = await Promise.all(participants.map(async p => {
        const user = await db.select().from(users).where(eq(users.id, p.userId)).limit(1);
        const name = user[0]?.username || "Runner";
        if (!p.runId) return { name, userId: p.userId, role: p.role, hasRun: false };

        const run = await storage.getRun(p.runId);
        return {
          name,
          userId: p.userId,
          role: p.role,
          hasRun: true,
          distanceKm: run ? Number(run.distance) : null,
          durationSec: run ? Number(run.duration) : null,
          avgPace: run?.avgPace || null,
          avgHeartRate: run ? Number(run.avgHeartRate) : null,
          avgCadence: run ? Number(run.avgCadence) : null,
          totalElevationGain: run ? Number(run.totalElevationGain) : null,
        };
      }));

      const finishers = participantData.filter(p => p.hasRun && p.durationSec);
      const currentUser = participantData.find(p => p.userId === userId);

      if (!currentUser?.hasRun) {
        return res.json({ debrief: "Complete your run first to generate a personalised group debrief." });
      }

      // Sort finishers by pace (faster = lower sec/km)
      const ranked = [...finishers].sort((a, b) => {
        const paceA = (a.durationSec! / (a.distanceKm || 1));
        const paceB = (b.durationSec! / (b.distanceKm || 1));
        return paceA - paceB;
      });

      const userRank = ranked.findIndex(p => p.userId === userId) + 1;
      const groupAvgPace = ranked.reduce((sum, p) => sum + (p.durationSec! / (p.distanceKm || 1)), 0) / ranked.length;
      const userPace = currentUser.durationSec! / (currentUser.distanceKm || 1);
      const paceVsGroupSec = groupAvgPace - userPace; // positive = user faster
      const paceVsGroupPct = Math.abs(paceVsGroupSec / groupAvgPace * 100);

      const prompt = `You are an elite running coach giving a personalised post-run debrief after a group run.

GROUP RUN: "${gr.title || 'Group Run'}"
Total participants who finished: ${finishers.length}
Current user "${currentUser.name}" finished rank ${userRank} of ${finishers.length}

CURRENT USER STATS:
- Pace: ${currentUser.avgPace || 'unknown'}
- HR: ${currentUser.avgHeartRate ? currentUser.avgHeartRate + ' bpm' : 'not recorded'}
- Cadence: ${currentUser.avgCadence ? currentUser.avgCadence + ' spm' : 'not recorded'}
- Elevation gain: ${currentUser.totalElevationGain ? currentUser.totalElevationGain + 'm' : 'not recorded'}

GROUP COMPARISON:
- User was ${paceVsGroupSec > 0 ? `${paceVsGroupPct.toFixed(1)}% faster` : `${paceVsGroupPct.toFixed(1)}% slower`} than group average pace
- Top finisher: ${ranked[0]?.name} (${ranked[0]?.avgPace || 'unknown pace'})

Write a 3-4 sentence personalised debrief in a warm, encouraging coaching voice. Include:
1. A specific insight about their performance vs the group (pace, HR efficiency, or cadence)
2. One genuine strength to build on
3. One specific actionable focus for next time
Keep it conversational, not clinical. No bullet points — just natural sentences.`;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      });

      const debrief = completion.choices[0]?.message?.content?.trim() || "Great effort today!";
      res.json({ debrief, rank: userRank, totalFinishers: finishers.length });
    } catch (error: any) {
      console.error("[POST /api/group-runs/:id/debrief]", error);
      res.status(500).json({ error: "Failed to generate debrief" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

// ==================== SHARE LANDING PAGE HTML BUILDERS ====================

function formatPaceLanding(pace: string | null): string {
  if (!pace) return "--:--/km";
  return pace.includes("/km") ? pace : `${pace}/km`;
}

function formatDurationLanding(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildShareLandingPage(share: any): string {
  const distance = share.distanceKm?.toFixed(2) || "0";
  const duration = formatDurationLanding(share.durationSeconds || 0);
  const pace = formatPaceLanding(share.avgPace);
  const sharerName = share.sharerName || "A runner";
  const deepLink = `airuncoach://run/${share.runId}?ref=${share.shareToken}`;
  const playStoreUrl = "https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach";
  const dateStr = share.completedAt ? new Date(share.completedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sharerName}'s Run — AI Run Coach</title>
  <meta property="og:title" content="${sharerName} ran ${distance} km!" />
  <meta property="og:description" content="${distance} km in ${duration} | Pace: ${pace} | Tracked with AI Run Coach" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://airuncoach.live/share/${share.shareToken}" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0A0F1A 0%, #111827 50%, #0D1117 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: rgba(31, 41, 55, 0.8);
      border: 1px solid rgba(45, 55, 72, 0.6);
      border-radius: 24px;
      padding: 40px 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      backdrop-filter: blur(10px);
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      color: #00D4FF;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }
    .logo-sub { font-size: 13px; color: #718096; margin-bottom: 32px; }
    .sharer { font-size: 16px; color: #A0AEC0; margin-bottom: 4px; }
    .date { font-size: 13px; color: #718096; margin-bottom: 24px; }
    .distance {
      font-size: 64px;
      font-weight: 800;
      background: linear-gradient(135deg, #00D4FF, #00E676);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1.1;
    }
    .distance-unit { font-size: 20px; color: #00D4FF; font-weight: 600; margin-bottom: 24px; }
    .stats {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-bottom: 32px;
    }
    .stat-label { font-size: 11px; color: #718096; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { font-size: 22px; font-weight: 700; color: #fff; margin-top: 4px; }
    .stat-value.pace { color: #FF6B35; }
    .divider {
      width: 60%;
      height: 1px;
      background: linear-gradient(90deg, transparent, #2D3748, transparent);
      margin: 0 auto 24px;
    }
    .cta-primary {
      display: inline-block;
      background: linear-gradient(135deg, #00D4FF, #00B8E6);
      color: #0A0F1A;
      font-weight: 700;
      font-size: 16px;
      padding: 14px 32px;
      border-radius: 14px;
      text-decoration: none;
      width: 100%;
      margin-bottom: 12px;
      transition: transform 0.2s;
    }
    .cta-primary:hover { transform: scale(1.02); }
    .cta-secondary {
      display: inline-block;
      background: transparent;
      color: #00D4FF;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 32px;
      border-radius: 14px;
      border: 1.5px solid #00D4FF;
      text-decoration: none;
      width: 100%;
      transition: background 0.2s;
    }
    .cta-secondary:hover { background: rgba(0, 212, 255, 0.1); }
    .footer { margin-top: 24px; font-size: 12px; color: #4A5568; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">AI RUN COACH</div>
    <div class="logo-sub">Elite AI-Powered Running</div>

    <div class="sharer">${sharerName}'s Run</div>
    ${dateStr ? `<div class="date">${dateStr}</div>` : ""}

    <div class="distance">${distance}</div>
    <div class="distance-unit">KILOMETERS</div>

    <div class="stats">
      <div>
        <div class="stat-label">Duration</div>
        <div class="stat-value">${duration}</div>
      </div>
      <div>
        <div class="stat-label">Pace</div>
        <div class="stat-value pace">${pace}</div>
      </div>
    </div>

    <div class="divider"></div>

    <a href="${deepLink}" class="cta-primary" id="openApp">View in AI Run Coach</a>
    <a href="${playStoreUrl}" class="cta-secondary">Get AI Run Coach</a>
  </div>

  <div class="footer">Shared via AI Run Coach</div>

  <script>
    // Try to open the app first, fall back to store after timeout
    document.getElementById('openApp').addEventListener('click', function(e) {
      e.preventDefault();
      var deepLink = this.href;
      var storeUrl = '${playStoreUrl}';
      var start = Date.now();
      
      window.location = deepLink;
      
      setTimeout(function() {
        if (Date.now() - start < 2000) {
          window.location = storeUrl;
        }
      }, 1500);
    });
  </script>
</body>
</html>`;
}

function buildShareNotFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Run Not Found — AI Run Coach</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0A0F1A; color: #fff;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; text-align: center;
    }
    h1 { color: #00D4FF; margin-bottom: 16px; }
    p { color: #A0AEC0; margin-bottom: 24px; }
    a { color: #00D4FF; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div>
    <h1>AI RUN COACH</h1>
    <p>This shared run link has expired or doesn't exist.</p>
    <a href="https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach">Get AI Run Coach</a>
  </div>
</body>
</html>`;
}

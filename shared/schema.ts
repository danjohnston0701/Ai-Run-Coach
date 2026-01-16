import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userCode: text("user_code").unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  dob: text("dob"),
  gender: text("gender"),
  height: text("height"),
  weight: text("weight"),
  fitnessLevel: text("fitness_level"),
  desiredFitnessLevel: text("desired_fitness_level"),
  coachName: text("coach_name").default("AI Coach"),
  coachGender: text("coach_gender").default("male"),
  coachAccent: text("coach_accent").default("british"),
  coachTone: text("coach_tone").default("energetic"),
  profilePic: text("profile_pic"),
  distanceMinKm: real("distance_min_km").default(0),
  distanceMaxKm: real("distance_max_km").default(50),
  distanceDecimalsEnabled: boolean("distance_decimals_enabled").default(false),
  isAdmin: boolean("is_admin").default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionTier: text("subscription_tier"),
  subscriptionStatus: text("subscription_status"),
  entitlementType: text("entitlement_type"),
  entitlementExpiresAt: timestamp("entitlement_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const couponCodes = pgTable("coupon_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  durationDays: integer("duration_days").notNull().default(30),
  maxRedemptions: integer("max_redemptions"),
  currentRedemptions: integer("current_redemptions").default(0),
  requiresPayment: boolean("requires_payment").default(false),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userCoupons = pgTable("user_coupons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  couponId: varchar("coupon_id").notNull().references(() => couponCodes.id),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  status: text("status").default("active"),
});

export const preRegistrations = pgTable("pre_registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const friends = pgTable("friends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  friendId: varchar("friend_id").notNull().references(() => users.id),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const routes = pgTable("routes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name"),
  distance: real("distance").notNull(),
  difficulty: text("difficulty").notNull(),
  startLat: real("start_lat").notNull(),
  startLng: real("start_lng").notNull(),
  endLat: real("end_lat"),
  endLng: real("end_lng"),
  waypoints: jsonb("waypoints"),
  polyline: text("polyline"),
  elevation: real("elevation"),
  elevationGain: real("elevation_gain"),
  elevationLoss: real("elevation_loss"),
  elevationProfile: jsonb("elevation_profile"),
  maxInclinePercent: real("max_incline_percent"),
  maxInclineDegrees: real("max_incline_degrees"),
  maxDeclinePercent: real("max_decline_percent"),
  maxDeclineDegrees: real("max_decline_degrees"),
  estimatedTime: integer("estimated_time"),
  terrainType: text("terrain_type"),
  startLocationLabel: text("start_location_label"),
  turnInstructions: jsonb("turn_instructions"),
  isFavorite: boolean("is_favorite").default(false),
  lastStartedAt: timestamp("last_started_at"),
  createdAt: timestamp("created_at").defaultNow(),
  source: text("source").default("ai"),
  sourceRunId: varchar("source_run_id"),
});

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  country: text("country").notNull(),
  city: text("city"),
  description: text("description"),
  eventType: text("event_type").default("parkrun"), // parkrun, marathon, half_marathon, 10k, 5k, trail, other
  routeId: varchar("route_id").notNull().references(() => routes.id),
  sourceRunId: varchar("source_run_id"), // The original run this event was created from
  createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const runs = pgTable("runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  routeId: varchar("route_id").references(() => routes.id),
  eventId: varchar("event_id").references(() => events.id),
  groupRunId: varchar("group_run_id"),
  name: text("name"),
  distance: real("distance").notNull(),
  duration: integer("duration").notNull(),
  runDate: text("run_date"),
  runTime: text("run_time"),
  avgPace: text("avg_pace"),
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  calories: integer("calories"),
  cadence: integer("cadence"),
  elevation: real("elevation"),
  elevationGain: real("elevation_gain"),
  elevationLoss: real("elevation_loss"),
  difficulty: text("difficulty"),
  startLat: real("start_lat"),
  startLng: real("start_lng"),
  gpsTrack: jsonb("gps_track"),
  heartRateData: jsonb("heart_rate_data"),
  paceData: jsonb("pace_data"),
  weatherData: jsonb("weather_data"),
  aiInsights: text("ai_insights"),
  aiCoachingNotes: jsonb("ai_coaching_notes"),
  aiCoachEnabled: boolean("ai_coach_enabled"),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const runWeaknessEvents = pgTable("run_weakness_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  startDistanceKm: real("start_distance_km").notNull(),
  endDistanceKm: real("end_distance_km").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  avgPaceBefore: real("avg_pace_before").notNull(),
  avgPaceDuring: real("avg_pace_during").notNull(),
  dropPercent: real("drop_percent").notNull(),
  causeTag: text("cause_tag"),
  causeNote: text("cause_note"),
  coachResponseGiven: text("coach_response_given"),
  userComment: text("user_comment"),
  isIrrelevant: boolean("is_irrelevant").default(false),
  reviewedAt: timestamp("reviewed_at"),
  detectedAt: timestamp("detected_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'event', 'distance_time', 'health_wellbeing', 'consistency'
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("active"), // 'active', 'completed', 'abandoned'
  priority: integer("priority").default(1), // 1 = highest priority
  targetDate: timestamp("target_date"),
  distanceTarget: text("distance_target"), // 'marathon', 'half_marathon', '10k', '5k', or custom
  timeTargetSeconds: integer("time_target_seconds"), // target time in seconds
  healthTarget: text("health_target"), // 'improve_fitness', 'improve_endurance', 'lose_weight', or custom
  targetWeightKg: real("target_weight_kg"), // for weight loss goals
  startingWeightKg: real("starting_weight_kg"), // to track progress
  weeklyRunTarget: integer("weekly_run_target"), // for consistency goals
  monthlyDistanceTarget: real("monthly_distance_target"), // for distance goals
  eventName: text("event_name"), // for event goals
  eventLocation: text("event_location"), // for event goals
  notes: text("notes"),
  progressPercent: integer("progress_percent").default(0),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const liveRunSessions = pgTable("live_run_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionKey: text("session_key"),
  userId: varchar("user_id").notNull().references(() => users.id),
  routeId: varchar("route_id").references(() => routes.id),
  isActive: boolean("is_active").default(true),
  currentLat: real("current_lat"),
  currentLng: real("current_lng"),
  currentPace: text("current_pace"),
  currentHeartRate: integer("current_heart_rate"),
  elapsedTime: integer("elapsed_time").default(0),
  distanceCovered: real("distance_covered").default(0),
  difficulty: text("difficulty"),
  cadence: integer("cadence"),
  gpsTrack: jsonb("gps_track"),
  kmSplits: jsonb("km_splits"),
  sharedWithFriends: boolean("shared_with_friends").default(false),
  startedAt: timestamp("started_at").defaultNow(),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
});

export const garminData = pgTable("garmin_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").references(() => runs.id),
  activityId: text("activity_id"),
  heartRateZones: jsonb("heart_rate_zones"),
  vo2Max: real("vo2_max"),
  trainingEffect: real("training_effect"),
  recoveryTime: integer("recovery_time"),
  stressLevel: integer("stress_level"),
  bodyBattery: integer("body_battery"),
  rawData: jsonb("raw_data"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const friendRequests = pgTable("friend_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  addresseeId: varchar("addressee_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  deviceId: text("device_id"),
  deviceName: text("device_name"),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  friendRequest: boolean("friend_request").default(true),
  friendAccepted: boolean("friend_accepted").default(true),
  groupRunInvite: boolean("group_run_invite").default(true),
  groupRunStarting: boolean("group_run_starting").default(true),
  liveRunInvite: boolean("live_run_invite").default(true),
  liveObserverJoined: boolean("live_observer_joined").default(true),
  runCompleted: boolean("run_completed").default(false),
  weeklyProgress: boolean("weekly_progress").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const routeRatings = pgTable("route_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").references(() => runs.id),
  rating: integer("rating").notNull(),
  templateName: text("template_name"),
  backtrackRatio: real("backtrack_ratio"),
  routeDistance: real("route_distance"),
  startLat: real("start_lat"),
  startLng: real("start_lng"),
  polylineHash: text("polyline_hash"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiCoachDescription = pgTable("ai_coach_description", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiCoachInstructions = pgTable("ai_coach_instructions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiCoachKnowledge = pgTable("ai_coach_knowledge", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category"),
  isActive: boolean("is_active").default(true),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiCoachFaq = pgTable("ai_coach_faq", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  isActive: boolean("is_active").default(true),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const groupRuns = pgTable("group_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hostUserId: varchar("host_user_id").notNull().references(() => users.id),
  routeId: varchar("route_id").references(() => routes.id),
  mode: text("mode").notNull().default("route"),
  title: text("title"),
  description: text("description"),
  targetDistance: real("target_distance"),
  targetPace: text("target_pace"),
  inviteToken: text("invite_token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  plannedStartAt: timestamp("planned_start_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const groupRunParticipants = pgTable("group_run_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupRunId: varchar("group_run_id").notNull().references(() => groupRuns.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("participant"),
  invitationStatus: text("invitation_status").notNull().default("pending"),
  runId: varchar("run_id").references(() => runs.id),
  inviteExpiresAt: timestamp("invite_expires_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  readyToStart: boolean("ready_to_start").default(false),
  joinedAt: timestamp("joined_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const runAnalyses = pgTable("run_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => runs.id).unique(),
  highlights: jsonb("highlights").$type<string[]>(),
  struggles: jsonb("struggles").$type<string[]>(),
  personalBests: jsonb("personal_bests").$type<string[]>(),
  demographicComparison: text("demographic_comparison"),
  coachingTips: jsonb("coaching_tips").$type<string[]>(),
  overallAssessment: text("overall_assessment"),
  weatherImpact: text("weather_impact"),
  warmUpAnalysis: text("warm_up_analysis"),
  goalProgress: text("goal_progress"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiCoachingLogs = pgTable("ai_coaching_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionKey: text("session_key"),
  runId: varchar("run_id").references(() => runs.id),
  eventType: text("event_type").notNull(),
  elapsedSeconds: integer("elapsed_seconds"),
  distanceKm: real("distance_km"),
  currentPace: text("current_pace"),
  heartRate: integer("heart_rate"),
  cadence: integer("cadence"),
  terrain: jsonb("terrain"),
  weather: jsonb("weather"),
  prompt: text("prompt"),
  response: jsonb("response"),
  responseText: text("response_text"),
  topic: text("topic"),
  model: text("model"),
  tokenCount: integer("token_count"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, userCode: true, createdAt: true });
export const insertPreRegistrationSchema = createInsertSchema(preRegistrations).omit({ id: true, createdAt: true });
export const insertFriendSchema = createInsertSchema(friends).omit({ id: true, createdAt: true });
export const insertRouteSchema = createInsertSchema(routes).omit({ id: true, createdAt: true });
export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export const insertRunSchema = createInsertSchema(runs).omit({ id: true, completedAt: true });
export const insertLiveRunSessionSchema = createInsertSchema(liveRunSessions).omit({ id: true, startedAt: true });
export const insertGarminDataSchema = createInsertSchema(garminData).omit({ id: true, syncedAt: true });
export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({ id: true, createdAt: true, respondedAt: true });
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true, lastUsedAt: true });
export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertRouteRatingSchema = createInsertSchema(routeRatings).omit({ id: true, createdAt: true });
export const insertAiCoachDescriptionSchema = createInsertSchema(aiCoachDescription).omit({ id: true, updatedAt: true });
export const insertAiCoachInstructionSchema = createInsertSchema(aiCoachInstructions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiCoachKnowledgeSchema = createInsertSchema(aiCoachKnowledge).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiCoachFaqSchema = createInsertSchema(aiCoachFaq).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCouponCodeSchema = createInsertSchema(couponCodes).omit({ id: true, createdAt: true, currentRedemptions: true });
export const insertUserCouponSchema = createInsertSchema(userCoupons).omit({ id: true, redeemedAt: true });
export const insertGroupRunSchema = createInsertSchema(groupRuns).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export const insertGroupRunParticipantSchema = createInsertSchema(groupRunParticipants).omit({ id: true, createdAt: true, joinedAt: true, completedAt: true, acceptedAt: true, declinedAt: true });
export const insertGoalSchema = createInsertSchema(goals).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true, progressPercent: true });
export const insertRunAnalysisSchema = createInsertSchema(runAnalyses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiCoachingLogSchema = createInsertSchema(aiCoachingLogs).omit({ id: true, createdAt: true });
export const insertRunWeaknessEventSchema = createInsertSchema(runWeaknessEvents).omit({ id: true, createdAt: true, detectedAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertPreRegistration = z.infer<typeof insertPreRegistrationSchema>;
export type PreRegistration = typeof preRegistrations.$inferSelect;

export type InsertFriend = z.infer<typeof insertFriendSchema>;
export type Friend = typeof friends.$inferSelect;

export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routes.$inferSelect;

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export type InsertRun = z.infer<typeof insertRunSchema>;
export type Run = typeof runs.$inferSelect;

export type InsertLiveRunSession = z.infer<typeof insertLiveRunSessionSchema>;
export type LiveRunSession = typeof liveRunSessions.$inferSelect;

export type InsertGarminData = z.infer<typeof insertGarminDataSchema>;
export type GarminData = typeof garminData.$inferSelect;

export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
export type FriendRequest = typeof friendRequests.$inferSelect;

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertRouteRating = z.infer<typeof insertRouteRatingSchema>;
export type RouteRating = typeof routeRatings.$inferSelect;

export type InsertAiCoachDescription = z.infer<typeof insertAiCoachDescriptionSchema>;
export type AiCoachDescription = typeof aiCoachDescription.$inferSelect;

export type InsertAiCoachInstruction = z.infer<typeof insertAiCoachInstructionSchema>;
export type AiCoachInstruction = typeof aiCoachInstructions.$inferSelect;

export type InsertAiCoachKnowledge = z.infer<typeof insertAiCoachKnowledgeSchema>;
export type AiCoachKnowledge = typeof aiCoachKnowledge.$inferSelect;

export type InsertAiCoachFaq = z.infer<typeof insertAiCoachFaqSchema>;
export type AiCoachFaq = typeof aiCoachFaq.$inferSelect;

export type InsertCouponCode = z.infer<typeof insertCouponCodeSchema>;
export type CouponCode = typeof couponCodes.$inferSelect;

export type InsertUserCoupon = z.infer<typeof insertUserCouponSchema>;
export type UserCoupon = typeof userCoupons.$inferSelect;

export type InsertGroupRun = z.infer<typeof insertGroupRunSchema>;
export type GroupRun = typeof groupRuns.$inferSelect;

export type InsertGroupRunParticipant = z.infer<typeof insertGroupRunParticipantSchema>;
export type GroupRunParticipant = typeof groupRunParticipants.$inferSelect;

export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goals.$inferSelect;

export type InsertRunAnalysis = z.infer<typeof insertRunAnalysisSchema>;
export type RunAnalysis = typeof runAnalyses.$inferSelect;

export type InsertAiCoachingLog = z.infer<typeof insertAiCoachingLogSchema>;
export type AiCoachingLog = typeof aiCoachingLogs.$inferSelect;

export type InsertRunWeaknessEvent = z.infer<typeof insertRunWeaknessEventSchema>;
export type RunWeaknessEvent = typeof runWeaknessEvents.$inferSelect;

export const weaknessCauseTags = [
  "cramp",
  "stitch", 
  "breathing",
  "leg_fatigue",
  "uphill",
  "heat",
  "hydration",
  "injury",
  "mental",
  "other"
] as const;

export type WeaknessCauseTag = typeof weaknessCauseTags[number];

export const weaknessCauseLabels: Record<WeaknessCauseTag, string> = {
  cramp: "Got cramp",
  stitch: "Had a stitch",
  breathing: "Struggled to breathe",
  leg_fatigue: "Legs were too tired",
  uphill: "Uphill was hard",
  heat: "Too hot",
  hydration: "Needed water",
  injury: "Pain/Injury",
  mental: "Mental fatigue",
  other: "Other"
};

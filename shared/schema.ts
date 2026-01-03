import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  estimatedTime: integer("estimated_time"),
  terrainType: text("terrain_type"),
  startLocationLabel: text("start_location_label"),
  isFavorite: boolean("is_favorite").default(false),
  lastStartedAt: timestamp("last_started_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const runs = pgTable("runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  routeId: varchar("route_id").references(() => routes.id),
  distance: real("distance").notNull(),
  duration: integer("duration").notNull(),
  avgPace: text("avg_pace"),
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  calories: integer("calories"),
  cadence: integer("cadence"),
  elevation: real("elevation"),
  difficulty: text("difficulty"),
  startLat: real("start_lat"),
  startLng: real("start_lng"),
  gpsTrack: jsonb("gps_track"),
  heartRateData: jsonb("heart_rate_data"),
  paceData: jsonb("pace_data"),
  weatherData: jsonb("weather_data"),
  aiInsights: text("ai_insights"),
  aiCoachingNotes: jsonb("ai_coaching_notes"),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const liveRunSessions = pgTable("live_run_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  routeId: varchar("route_id").references(() => routes.id),
  isActive: boolean("is_active").default(true),
  currentLat: real("current_lat"),
  currentLng: real("current_lng"),
  currentPace: text("current_pace"),
  currentHeartRate: integer("current_heart_rate"),
  elapsedTime: integer("elapsed_time").default(0),
  distanceCovered: real("distance_covered").default(0),
  sharedWithFriends: boolean("shared_with_friends").default(false),
  startedAt: timestamp("started_at").defaultNow(),
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
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
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

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertPreRegistrationSchema = createInsertSchema(preRegistrations).omit({ id: true, createdAt: true });
export const insertFriendSchema = createInsertSchema(friends).omit({ id: true, createdAt: true });
export const insertRouteSchema = createInsertSchema(routes).omit({ id: true, createdAt: true });
export const insertRunSchema = createInsertSchema(runs).omit({ id: true, completedAt: true });
export const insertLiveRunSessionSchema = createInsertSchema(liveRunSessions).omit({ id: true, startedAt: true });
export const insertGarminDataSchema = createInsertSchema(garminData).omit({ id: true, syncedAt: true });
export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({ id: true, createdAt: true, respondedAt: true });
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true, lastUsedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertRouteRatingSchema = createInsertSchema(routeRatings).omit({ id: true, createdAt: true });
export const insertAiCoachDescriptionSchema = createInsertSchema(aiCoachDescription).omit({ id: true, updatedAt: true });
export const insertAiCoachInstructionSchema = createInsertSchema(aiCoachInstructions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiCoachKnowledgeSchema = createInsertSchema(aiCoachKnowledge).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiCoachFaqSchema = createInsertSchema(aiCoachFaq).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCouponCodeSchema = createInsertSchema(couponCodes).omit({ id: true, createdAt: true, currentRedemptions: true });
export const insertUserCouponSchema = createInsertSchema(userCoupons).omit({ id: true, redeemedAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertPreRegistration = z.infer<typeof insertPreRegistrationSchema>;
export type PreRegistration = typeof preRegistrations.$inferSelect;

export type InsertFriend = z.infer<typeof insertFriendSchema>;
export type Friend = typeof friends.$inferSelect;

export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routes.$inferSelect;

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

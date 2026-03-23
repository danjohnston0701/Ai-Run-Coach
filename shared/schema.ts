import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, real, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
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
  profilePic: text("profile_pic"),
  createdAt: timestamp("created_at").defaultNow(),
  isAdmin: boolean("is_admin").default(false),
  coachGender: text("coach_gender").default("male"),
  coachAccent: text("coach_accent").default("british"),
  coachTone: text("coach_tone").default("energetic"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionTier: text("subscription_tier"),
  subscriptionStatus: text("subscription_status"),
  entitlementType: text("entitlement_type"),
  entitlementExpiresAt: timestamp("entitlement_expires_at"),
  distanceMinKm: real("distance_min_km").default(0),
  distanceMaxKm: real("distance_max_km").default(50),
  distanceDecimalsEnabled: boolean("distance_decimals_enabled").default(false),
  userCode: text("user_code").unique(),
  shortUserId: text("short_user_id").unique(), // 8-digit numeric ID for friend sharing (e.g., "12345678")
  // In-Run AI Coaching feature preferences (all default to enabled)
  coachPaceEnabled: boolean("coach_pace_enabled").default(true),
  coachNavigationEnabled: boolean("coach_navigation_enabled").default(true),
  coachElevationEnabled: boolean("coach_elevation_enabled").default(true),
  coachHeartRateEnabled: boolean("coach_heart_rate_enabled").default(true),
  coachCadenceStrideEnabled: boolean("coach_cadence_stride_enabled").default(true),
  coachKmSplitsEnabled: boolean("coach_km_splits_enabled").default(true),
  coachStruggleEnabled: boolean("coach_struggle_enabled").default(true),
  coachMotivationalEnabled: boolean("coach_motivational_enabled").default(true),
  coachHalfKmCheckInEnabled: boolean("coach_half_km_check_in_enabled").default(true),
  coachKmSplitIntervalKm: integer("coach_km_split_interval_km").default(1),
  fcmToken: text("fcm_token"), // Firebase Cloud Messaging token for push notifications
  
  // Athletic profile for dynamic session coaching
  athleticGrade: text("athletic_grade"), // "beginner", "intermediate", "advanced", "elite"
  previousRunsCount: integer("previous_runs_count").default(0),
  averageWeeklyMileage: real("average_weekly_mileage").default(0),
  priorRaceExperience: text("prior_race_experience"), // "none", "local", "national", "elite"
  injuryHistory: jsonb("injury_history"), // [{date, type, resolved}]
  allowAiToneAdaptation: boolean("allow_ai_tone_adaptation").default(true), // Let AI adjust tone per session
});

// Friends table
export const friends = pgTable("friends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  friendId: varchar("friend_id").notNull().references(() => users.id),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Friend Requests table
export const friendRequests = pgTable("friend_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  addresseeId: varchar("addressee_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
});

// Routes table
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
  elevation: real("elevation"),
  estimatedTime: integer("estimated_time"),
  terrainType: text("terrain_type"),
  createdAt: timestamp("created_at").defaultNow(),
  polyline: text("polyline"),
  elevationGain: real("elevation_gain"),
  elevationLoss: real("elevation_loss"),
  elevationProfile: jsonb("elevation_profile"),
  startLocationLabel: text("start_location_label"),
  isFavorite: boolean("is_favorite").default(false),
  lastStartedAt: timestamp("last_started_at"),
  maxInclinePercent: real("max_incline_percent"),
  maxInclineDegrees: real("max_incline_degrees"),
  maxDeclinePercent: real("max_decline_percent"),
  maxDeclineDegrees: real("max_decline_degrees"),
  turnInstructions: jsonb("turn_instructions"),
  source: text("source").default("ai"),
  sourceRunId: varchar("source_run_id"),
});

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  name: text("name").notNull(),
  description: text("description"),
  eventType: text("event_type").notNull().default("parkrun"),
  country: text("country").notNull(),
  city: text("city"),
  routeId: varchar("route_id").notNull().references(() => routes.id),
  distance: real("distance"),
  difficulty: text("difficulty").default("moderate"),
  startLat: real("start_lat"),
  startLng: real("start_lng"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  scheduleType: text("schedule_type").default("recurring"),
  specificDate: timestamp("specific_date"),
  recurrencePattern: text("recurrence_pattern"),
  dayOfWeek: integer("day_of_week"),
  dayOfMonth: integer("day_of_month"),
  sourceRunId: varchar("source_run_id"),
  createdByUserId: varchar("created_by_user_id").notNull(),
});

// Runs table
export const runs = pgTable("runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  routeId: varchar("route_id").references(() => routes.id),
  externalId: varchar("external_id"), // Garmin activity ID, Strava activity ID, etc.
  externalSource: varchar("external_source"), // 'garmin', 'strava', 'coros', etc.
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
  aiInsights: text("ai_insights"),
  aiCoachingNotes: jsonb("ai_coaching_notes"),
  completedAt: timestamp("completed_at").defaultNow(),
  weatherData: jsonb("weather_data"),
  groupRunId: varchar("group_run_id"),
  name: text("name"),
  aiCoachEnabled: boolean("ai_coach_enabled"),
  runDate: text("run_date"),
  runTime: text("run_time"),
  elevationGain: real("elevation_gain"),
  elevationLoss: real("elevation_loss"),
  eventId: varchar("event_id").references(() => events.id),
  // New columns for analytics
  tss: integer("tss").default(0), // Training Stress Score
  gap: varchar("gap"), // Grade Adjusted Pace
  isPublic: boolean("is_public").default(true), // Social sharing
  strugglePoints: jsonb("struggle_points"), // Array of struggle point data
  kmSplits: jsonb("km_splits"), // Kilometer splits data
  minHeartRate: integer("min_heart_rate"), // Minimum HR
  terrainType: text("terrain_type"), // Terrain classification
  userComments: text("user_comments"), // Post-run user comments
  // Run goals for target tracking
  targetDistance: real("target_distance"), // User's target distance in km
  targetTime: integer("target_time"), // User's target time in milliseconds
  wasTargetAchieved: boolean("was_target_achieved"), // Whether target was met
  // Garmin upload tracking (two-way sync)
  uploadedToGarmin: boolean("uploaded_to_garmin").default(false), // TRUE if uploaded to Garmin Connect
  garminActivityId: varchar("garmin_activity_id"), // Garmin activity ID if uploaded
  hasGarminData: boolean("has_garmin_data").default(false), // TRUE if enriched with Garmin data

  // Extended metrics for detailed run data
  maxSpeed: real("max_speed"), // m/s
  avgSpeed: real("avg_speed"), // m/s
  movingTime: integer("moving_time"), // seconds
  elapsedTime: integer("elapsed_time"), // seconds  
  maxCadence: integer("max_cadence"), // spm
  avgStrideLength: real("avg_stride_length"), // meters
  minElevation: real("min_elevation"), // meters
  maxElevation: real("max_elevation"), // meters
  steepestIncline: real("steepest_incline"), // percent
  steepestDecline: real("steepest_decline"), // percent
  activeCalories: integer("active_calories"), // kcal
  restingCalories: integer("resting_calories"), // kcal
  estSweatLoss: real("est_sweat_loss"), // liters
  
  // Training plan context (if this run is part of a coached plan)
  linkedWorkoutId: varchar("linked_workout_id"), // ID of the planned workout this run executes
  linkedPlanId: varchar("linked_plan_id"), // ID of the training plan this run belongs to
  planProgressWeek: integer("plan_progress_week"), // Which week of the plan (1-12)
  planProgressWeeks: integer("plan_progress_weeks"), // Total weeks in the plan
  workoutType: varchar("workout_type"), // "easy", "tempo", "intervals", "long_run", etc.
  workoutIntensity: varchar("workout_intensity"), // "z1", "z2", "z3", "z4", "z5"
  workoutDescription: text("workout_description"), // Human-readable workout description
  
  createdAt: timestamp("created_at").defaultNow(), // When record was created in database
  updatedAt: timestamp("updated_at").defaultNow(), // When record was last updated
});

// Activity Merge Log table - tracks merged runs from different sources
export const activityMergeLog = pgTable("activity_merge_log", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  aiRunCoachRunId: varchar("ai_run_coach_run_id").notNull().references(() => runs.id),
  garminActivityId: varchar("garmin_activity_id").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id),
  mergeScore: real("merge_score").notNull(), // 0-100 confidence score
  matchedByTimeDistance: boolean("matched_by_time_distance").default(true),
  matchedByActivityType: boolean("matched_by_activity_type").default(true),
  matchedByDuration: boolean("matched_by_duration").default(true),
  mergedAt: timestamp("merged_at").notNull().defaultNow(),
  mergeDetails: jsonb("merge_details"), // Store detailed match criteria
});

// Goals table
export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("active"),
  priority: integer("priority").default(1),
  targetDate: timestamp("target_date"),
  distanceTarget: text("distance_target"),
  timeTargetSeconds: integer("time_target_seconds"),
  healthTarget: text("health_target"),
  targetWeightKg: real("target_weight_kg"),
  startingWeightKg: real("starting_weight_kg"),
  weeklyRunTarget: integer("weekly_run_target"),
  monthlyDistanceTarget: real("monthly_distance_target"),
  eventName: text("event_name"),
  eventLocation: text("event_location"),
  notes: text("notes"),
  progressPercent: integer("progress_percent").default(0),
  relatedRunSessionIds: jsonb("related_run_session_ids").default([]),
  linkedTrainingPlanId: varchar("linked_training_plan_id"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notifications table
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

// Notification Preferences table
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  friendRequest: boolean("friend_request").default(true),
  friendAccepted: boolean("friend_accepted").default(true),
  groupRunInvite: boolean("group_run_invite").default(true),
  groupRunStarting: boolean("group_run_starting").default(true),
  runCompleted: boolean("run_completed").default(false),
  weeklyProgress: boolean("weekly_progress").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  liveRunInvite: boolean("live_run_invite").default(true),
  liveObserverJoined: boolean("live_observer_joined").default(true),
  coachingPlanReminder: boolean("coaching_plan_reminder").default(true),
  coachingPlanReminderTimezone: text("coaching_plan_reminder_timezone").default("UTC"), // e.g. "America/New_York", "Europe/London"
});

// Live Run Sessions table
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
  sessionKey: text("session_key"),
  difficulty: text("difficulty"),
  cadence: integer("cadence"),
  gpsTrack: jsonb("gps_track"),
  kmSplits: jsonb("km_splits"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
});

// Group Runs table
export const groupRuns = pgTable("group_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hostUserId: varchar("host_user_id").notNull().references(() => users.id),
  routeId: varchar("route_id").references(() => routes.id),
  mode: text("mode").notNull().default("route"),
  title: text("title"),
  description: text("description"),
  meetingPoint: text("meeting_point"),
  meetingLat: real("meeting_lat"),
  meetingLng: real("meeting_lng"),
  targetDistance: real("target_distance"),
  targetPace: text("target_pace"),
  maxParticipants: integer("max_participants").default(10),
  isPublic: boolean("is_public").default(true),
  inviteToken: text("invite_token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  plannedStartAt: timestamp("planned_start_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Group Run Participants table
export const groupRunParticipants = pgTable("group_run_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupRunId: varchar("group_run_id").notNull().references(() => groupRuns.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("participant"),
  invitationStatus: text("invitation_status").notNull().default("pending"),
  runId: varchar("run_id").references(() => runs.id),
  joinedAt: timestamp("joined_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  inviteExpiresAt: timestamp("invite_expires_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  readyToStart: boolean("ready_to_start").default(false),
});

// Push Subscriptions table
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  userAgent: text("user_agent"),
  lastUsedAt: timestamp("last_used_at"),
  deviceId: text("device_id"),
  deviceName: text("device_name"),
  isActive: boolean("is_active").default(true),
});

// Route Ratings table
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

// Run Analyses table
export const runAnalyses = pgTable("run_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => runs.id),
  analysis: jsonb("analysis"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Coupon Codes table
export const couponCodes = pgTable("coupon_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  type: text("type").notNull(),
  value: integer("value"),
  durationDays: integer("duration_days"),
  maxUses: integer("max_uses"),
  currentUses: integer("current_uses").default(0),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Coupons table
export const userCoupons = pgTable("user_coupons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  couponId: varchar("coupon_id").notNull().references(() => couponCodes.id),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

// Garmin Wellness Metrics table (sleep, stress, Body Battery, HRV, etc.)
export const garminWellnessMetrics = pgTable("garmin_wellness_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD format
  
  // Sleep metrics
  totalSleepSeconds: integer("total_sleep_seconds"),
  deepSleepSeconds: integer("deep_sleep_seconds"),
  lightSleepSeconds: integer("light_sleep_seconds"),
  remSleepSeconds: integer("rem_sleep_seconds"),
  awakeSleepSeconds: integer("awake_sleep_seconds"),
  sleepScore: integer("sleep_score"),
  sleepQuality: text("sleep_quality"),
  sleepStartTimeGMT: text("sleep_start_time_gmt"),
  sleepEndTimeGMT: text("sleep_end_time_gmt"),
  sleepLevelsMap: jsonb("sleep_levels_map"), // Detailed sleep stages
  
  // Stress metrics
  averageStressLevel: integer("average_stress_level"),
  maxStressLevel: integer("max_stress_level"),
  stressDuration: integer("stress_duration"), // seconds
  restDuration: integer("rest_duration"), // seconds
  activityDuration: integer("activity_duration"), // seconds
  lowStressDuration: integer("low_stress_duration"), // seconds
  mediumStressDuration: integer("medium_stress_duration"), // seconds
  highStressDuration: integer("high_stress_duration"), // seconds
  stressQualifier: text("stress_qualifier"),
  
  // Body Battery metrics
  bodyBatteryHigh: integer("body_battery_high"),
  bodyBatteryLow: integer("body_battery_low"),
  bodyBatteryCurrent: integer("body_battery_current"),
  bodyBatteryCharged: integer("body_battery_charged"),
  bodyBatteryDrained: integer("body_battery_drained"),
  bodyBatteryVersion: real("body_battery_version"),
  
  // HRV metrics
  hrvWeeklyAvg: real("hrv_weekly_avg"),
  hrvLastNightAvg: real("hrv_last_night_avg"),
  hrvLastNight5MinHigh: real("hrv_last_night_5min_high"),
  hrvStatus: text("hrv_status"),
  hrvFeedback: text("hrv_feedback"),
  hrvBaselineLowUpper: real("hrv_baseline_low_upper"),
  hrvBaselineBalancedLower: real("hrv_baseline_balanced_lower"),
  hrvBaselineBalancedUpper: real("hrv_baseline_balanced_upper"),
  hrvStartTimeGMT: text("hrv_start_time_gmt"),
  hrvEndTimeGMT: text("hrv_end_time_gmt"),
  hrvReadings: jsonb("hrv_readings"), // Detailed HRV readings array
  
  // Heart rate metrics
  restingHeartRate: integer("resting_heart_rate"),
  minHeartRate: integer("min_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  averageHeartRate: integer("average_heart_rate"),
  heartRateTimeOffsetValues: jsonb("heart_rate_time_offset_values"), // Detailed HR data
  
  // Readiness
  readinessScore: integer("readiness_score"),
  readinessRecommendation: text("readiness_recommendation"),
  
  // Respiration metrics
  avgWakingRespirationValue: real("avg_waking_respiration_value"),
  highestRespirationValue: real("highest_respiration_value"),
  lowestRespirationValue: real("lowest_respiration_value"),
  avgSleepRespirationValue: real("avg_sleep_respiration_value"),
  
  // Pulse Ox metrics
  avgSpO2: real("avg_spo2"),
  minSpO2: real("min_spo2"),
  avgAltitude: real("avg_altitude"),
  onDemandReadings: jsonb("on_demand_readings"), // Manual SpO2 readings
  sleepSpO2Readings: jsonb("sleep_spo2_readings"), // Sleep SpO2 readings
  
  // Activity/Daily metrics
  steps: integer("steps"),
  pushes: integer("pushes"), // Wheelchair metric
  distanceMeters: integer("distance_meters"),
  pushDistanceInMeters: real("push_distance_meters"), // Wheelchair metric
  activeKilocalories: integer("active_kilocalories"),
  bmrKilocalories: integer("bmr_kilocalories"),
  floorsClimbed: integer("floors_climbed"),
  floorsDescended: integer("floors_descended"),
  
  // Duration breakdown
  durationInSeconds: integer("duration_in_seconds"), // Total time awake
  activeTimeInSeconds: integer("active_time_in_seconds"), // Time in activity
  moderateIntensityDuration: integer("moderate_intensity_duration"),
  vigorousIntensityDuration: integer("vigorous_intensity_duration"),
  intensityDuration: integer("intensity_duration"),
  sedentaryDuration: integer("sedentary_duration"),
  sleepingDuration: integer("sleeping_duration"),
  activeDuration: integer("active_duration"),
  
  // Daily goals
  stepsGoal: integer("steps_goal"),
  pushesGoal: integer("pushes_goal"),
  floorsClimbedGoal: integer("floors_climbed_goal"),
  intensityGoal: integer("intensity_goal"),
  
  // Stress duration breakdown (additional fields)
  stressDurationInSeconds: integer("stress_duration_seconds"),
  restStressDurationInSeconds: integer("rest_stress_duration_seconds"),
  activityStressDurationInSeconds: integer("activity_stress_duration_seconds"),
  lowStressDurationInSeconds: integer("low_stress_duration_seconds"),
  mediumStressDurationInSeconds: integer("medium_stress_duration_seconds"),
  highStressDurationInSeconds: integer("high_stress_duration_seconds"),
  
  // Metadata
  summaryId: text("summary_id"),
  activityType: text("activity_type"),
  startTimeInSeconds: integer("start_time_in_seconds"),
  startTimeOffsetInSeconds: integer("start_time_offset_in_seconds"),
  
  // Raw data for debugging
  rawData: jsonb("raw_data"),
  
  syncedAt: timestamp("synced_at").defaultNow(),
});

// Garmin Activities table (stores full activity data from Garmin)
export const garminActivities = pgTable("garmin_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").references(() => runs.id), // Link to our runs table
  garminActivityId: text("garmin_activity_id").notNull().unique(),
  
  // Basic activity info
  activityName: text("activity_name"),
  activityType: text("activity_type"), // running, walking, cycling, etc.
  activitySubType: text("activity_sub_type"), // MoveIQ sub-type (e.g., Hurdles, Intervals, Trail)
  eventType: text("event_type"), // race, workout, training, etc.
  startTimeInSeconds: integer("start_time_in_seconds"),
  startTimeOffsetInSeconds: integer("start_time_offset_in_seconds"),
  durationInSeconds: integer("duration_in_seconds"),
  distanceInMeters: real("distance_in_meters"),
  
  // Heart rate data
  averageHeartRateInBeatsPerMinute: integer("average_heart_rate"),
  maxHeartRateInBeatsPerMinute: integer("max_heart_rate"),
  heartRateZones: jsonb("heart_rate_zones"), // Zone breakdown
  
  // Pace/Speed data
  averageSpeedInMetersPerSecond: real("average_speed"),
  maxSpeedInMetersPerSecond: real("max_speed"),
  averagePaceInMinutesPerKilometer: real("average_pace"),
  
  // Power data (for running power)
  averagePowerInWatts: real("average_power"),
  maxPowerInWatts: real("max_power"),
  normalizedPowerInWatts: real("normalized_power"),
  
  // Running dynamics
  averageRunCadenceInStepsPerMinute: real("average_cadence"),
  maxRunCadenceInStepsPerMinute: real("max_cadence"),
  averageStrideLength: real("average_stride_length"),
  groundContactTime: real("ground_contact_time"), // ms
  groundContactBalance: real("ground_contact_balance"), // %
  verticalOscillation: real("vertical_oscillation"), // cm
  verticalRatio: real("vertical_ratio"), // %
  
  // Elevation data
  startLatitude: real("start_latitude"),
  startLongitude: real("start_longitude"),
  totalElevationGainInMeters: real("elevation_gain"),
  totalElevationLossInMeters: real("elevation_loss"),
  minElevationInMeters: real("min_elevation"),
  maxElevationInMeters: real("max_elevation"),
  
  // Calories
  activeKilocalories: integer("active_kilocalories"),
  deviceActivateKilocalories: integer("device_active_kilocalories"),
  bmrKilocalories: integer("bmr_kilocalories"),
  
  // Training effect
  aerobicTrainingEffect: real("aerobic_training_effect"), // 1.0 - 5.0
  anaerobicTrainingEffect: real("anaerobic_training_effect"), // 1.0 - 5.0
  trainingEffectLabel: text("training_effect_label"),
  
  // Recovery
  vo2Max: real("vo2_max"),
  lactateThresholdBpm: integer("lactate_threshold_bpm"),
  lactateThresholdSpeed: real("lactate_threshold_speed"),
  recoveryTimeInMinutes: integer("recovery_time"),
  
  // Laps and splits
  laps: jsonb("laps"), // Array of lap data
  splits: jsonb("splits"), // km/mile splits
  samples: jsonb("samples"), // Time series data (GPS, HR, pace, etc.)
  
  // Environmental
  averageTemperature: real("average_temperature"),
  minTemperature: real("min_temperature"),
  maxTemperature: real("max_temperature"),
  
  // Device info
  deviceName: text("device_name"),
  
  // Wheelchair-specific metrics
  averagePushCadenceInPushesPerMinute: real("avg_push_cadence"),
  maxPushCadenceInPushesPerMinute: real("max_push_cadence"),
  pushes: integer("pushes"),
  
  // Additional activity info
  summaryId: text("summary_id"), // Alternate activity ID from Garmin
  activityDescription: text("activity_description"),
  
  // Webhook tracking
  userAccessToken: text("user_access_token"), // For lookup if needed
  webhookReceivedAt: timestamp("webhook_received_at").defaultNow(),
  
  // Full raw data
  rawData: jsonb("raw_data"),
  
  // Metadata
  isProcessed: boolean("is_processed").default(false),
  aiAnalysisGenerated: boolean("ai_analysis_generated").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== SKIN TEMPERATURE MONITORING ====================

// Garmin Skin Temperature table
export const garminSkinTemperature = pgTable("garmin_skin_temperature", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD
  
  // Temperature readings (Celsius)
  avgTemperature: real("avg_temperature"), // Average skin temp for the day
  minTemperature: real("min_temperature"), // Lowest recorded temp
  maxTemperature: real("max_temperature"), // Highest recorded temp
  
  // Context
  temperatureTrendType: text("temperature_trend_type"), // STABLE, WARMING, COOLING
  
  // Time-series data (5-min intervals)
  temperatureReadings: jsonb("temperature_readings"), // { "0": 36.5, "300": 36.6, ... }
  
  // Metadata
  summaryId: text("summary_id"),
  startTimeInSeconds: integer("start_time_in_seconds"),
  startTimeOffsetInSeconds: integer("start_time_offset_in_seconds"),
  rawData: jsonb("raw_data"),
  syncedAt: timestamp("synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Garmin Body Composition table
export const garminBodyComposition = pgTable("garmin_body_composition", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  measurementTimeInSeconds: integer("measurement_time_in_seconds"),
  measurementDate: text("measurement_date"), // YYYY-MM-DD
  
  weightInGrams: integer("weight_in_grams"),
  bmi: real("bmi"),
  bodyFatPercentage: real("body_fat_percentage"),
  bodyWaterPercentage: real("body_water_percentage"),
  boneMassInGrams: integer("bone_mass_in_grams"),
  muscleMassInGrams: integer("muscle_mass_in_grams"),
  physiqueRating: integer("physique_rating"),
  visceralFatRating: integer("visceral_fat_rating"),
  metabolicAge: integer("metabolic_age"),
  
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Garmin Blood Pressure table
export const garminBloodPressure = pgTable("garmin_blood_pressure", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Blood Pressure Readings
  systolic: integer("systolic").notNull(), // mmHg (top number)
  diastolic: integer("diastolic").notNull(), // mmHg (bottom number)
  pulse: integer("pulse"), // bpm (heart rate at measurement)
  
  // Measurement Details
  summaryId: text("summary_id"), // Garmin summary ID
  sourceType: text("source_type"), // 'MANUAL' | 'AUTOMATIC' | 'EXERCISE'
  measurementTimeInSeconds: integer("measurement_time_in_seconds"),
  measurementTimeOffsetInSeconds: integer("measurement_time_offset_in_seconds"), // Timezone offset
  
  // Classification (calculated from systolic/diastolic)
  classification: text("classification"), // 'OPTIMAL' | 'NORMAL' | 'ELEVATED' | 'STAGE_1_HYPERTENSION' | 'STAGE_2_HYPERTENSION' | 'CRISIS'
  
  // Metadata
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== HEALTH SNAPSHOTS - REAL-TIME MULTI-METRIC DATA ====================

// Garmin Health Snapshots - Real-time health metrics (5-second intervals)
// Stores detailed multi-metric health data with minute-level granularity
export const garminHealthSnapshots = pgTable("garmin_health_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Snapshot Metadata
  summaryId: text("summary_id").notNull().unique(),
  snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD
  startTimeInSeconds: integer("start_time_in_seconds").notNull(),
  durationInSeconds: integer("duration_in_seconds"),
  startTimeOffsetInSeconds: integer("start_time_offset_in_seconds"),
  
  // Heart Rate Metrics
  hrMinValue: real("hr_min_value"),
  hrMaxValue: real("hr_max_value"),
  hrAvgValue: real("hr_avg_value"),
  hrEpochs: jsonb("hr_epochs"), // 5-sec interval HR data
  
  // Stress Metrics
  stressMinValue: real("stress_min_value"),
  stressMaxValue: real("stress_max_value"),
  stressAvgValue: real("stress_avg_value"),
  stressEpochs: jsonb("stress_epochs"), // 5-sec interval stress
  
  // SpO2 (Oxygen Saturation) Metrics
  spo2MinValue: real("spo2_min_value"),
  spo2MaxValue: real("spo2_max_value"),
  spo2AvgValue: real("spo2_avg_value"),
  spo2Epochs: jsonb("spo2_epochs"), // 5-sec interval oxygen
  
  // Respiration Rate Metrics
  respMinValue: real("resp_min_value"),
  respMaxValue: real("resp_max_value"),
  respAvgValue: real("resp_avg_value"),
  respEpochs: jsonb("resp_epochs"), // 5-sec interval respiration
  
  // Full raw data (for reprocessing if needed)
  rawData: jsonb("raw_data"),
  
  // Storage Management
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Auto-delete after 30 days for storage optimization
});

// ==================== EPOCHS - MINUTE-BY-MINUTE ACTIVITY DATA ====================

// Garmin Epochs - Compressed storage (keeping 7 days, compressed after that)
// Stores all raw epoch data for short-term detailed visualization
export const garminEpochsRaw = pgTable("garmin_epochs_raw", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Epoch Date Tracking
  date: text("date").notNull(), // YYYY-MM-DD
  startTimeInSeconds: integer("start_time_in_seconds").notNull(), // Epoch timestamp
  
  // Activity Classification
  activityType: text("activity_type"), // WALKING, RUNNING, WHEELCHAIR_PUSHING, SEDENTARY
  intensity: text("intensity"), // SEDENTARY | ACTIVE | HIGHLY_ACTIVE
  
  // Metrics
  met: real("met"), // Metabolic equivalent (intensity: 1.0 = resting, 50+ = max exertion)
  meanMotionIntensity: real("mean_motion_intensity"),
  maxMotionIntensity: real("max_motion_intensity"),
  
  // Activity Details
  activeKilocalories: real("active_kilocalories"),
  durationInSeconds: integer("duration_in_seconds"),
  activeTimeInSeconds: integer("active_time_in_seconds"),
  steps: integer("steps"),
  pushes: integer("pushes"), // Wheelchair metric
  distanceInMeters: real("distance_in_meters"),
  pushDistanceInMeters: real("push_distance_in_meters"), // Wheelchair metric
  
  // Metadata
  summaryId: text("summary_id"),
  startTimeOffsetInSeconds: integer("start_time_offset_in_seconds"),
  
  // Storage Management
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Auto-delete after 7 days
});

// Garmin Epochs Aggregates - Compressed long-term storage
// Daily aggregates of epochs (keep forever, much smaller)
export const garminEpochsAggregate = pgTable("garmin_epochs_aggregate", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  epochDate: text("date").notNull(), // YYYY-MM-DD
  
  // Activity Type Distribution (seconds per type)
  sedentaryDurationSeconds: integer("sedentary_duration_seconds").default(0),
  activeDurationSeconds: integer("active_duration_seconds").default(0),
  highlyActiveDurationSeconds: integer("highly_active_duration_seconds").default(0),
  
  // Intensity Distribution (time in each intensity level)
  sedentaryIntensitySeconds: integer("sedentary_intensity_seconds").default(0),
  activeIntensitySeconds: integer("active_intensity_seconds").default(0),
  highlyActiveIntensitySeconds: integer("highly_active_intensity_seconds").default(0),
  
  // Activity Breakdown (seconds per activity type)
  walkingSeconds: integer("walking_seconds").default(0),
  runningSeconds: integer("running_seconds").default(0),
  wheelchairPushingSeconds: integer("wheelchair_pushing_seconds").default(0),
  
  // Aggregate Metrics
  totalMet: real("total_met").default(0),
  averageMet: real("average_met").default(0),
  peakMet: real("peak_met").default(0),
  
  averageMotionIntensity: real("average_motion_intensity").default(0),
  maxMotionIntensity: real("max_motion_intensity").default(0),
  
  // Activity Totals
  totalActiveKilocalories: real("total_active_kilocalories").default(0),
  totalSteps: integer("total_steps").default(0),
  totalPushes: integer("total_pushes").default(0),
  totalDistance: real("total_distance").default(0),
  totalPushDistance: real("total_push_distance").default(0),
  
  // Epoch Count
  totalEpochs: integer("total_epochs").default(0), // How many epochs in this day
  
  // Raw compressed data (for restore if needed)
  compressedData: text("compressed_data"), // gzip compressed JSON of all epochs
  
  createdAt: timestamp("created_at").defaultNow(),
  compressedAt: timestamp("compressed_at"), // When was this data compressed
});

// Device Data table (for Garmin, Samsung, Apple, Coros, Strava data)
export const deviceData = pgTable("device_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").references(() => runs.id),
  deviceType: text("device_type").notNull(), // 'garmin' | 'samsung' | 'apple' | 'coros' | 'strava'
  activityId: text("activity_id"), // External activity ID from device
  heartRateZones: jsonb("heart_rate_zones"), // Zone breakdown { zone1Minutes, zone2Minutes, etc }
  vo2Max: real("vo2_max"), // Fitness level metric
  trainingEffect: real("training_effect"), // 1.0 - 5.0
  recoveryTime: integer("recovery_time"), // Hours until recovered
  stressLevel: integer("stress_level"), // 0-100
  bodyBattery: integer("body_battery"), // 0-100
  restingHeartRate: integer("resting_heart_rate"),
  caloriesBurned: integer("calories_burned"),
  rawData: jsonb("raw_data"), // Full device response for debugging
  syncedAt: timestamp("synced_at").defaultNow(),
});

// Connected Devices table
export const connectedDevices = pgTable("connected_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  deviceType: text("device_type").notNull(), // 'garmin' | 'samsung' | 'apple' | 'coros' | 'strava'
  deviceName: text("device_name"),
  deviceId: text("device_id"), // External device/athlete ID
  accessToken: text("access_token"), // Encrypted OAuth token
  refreshToken: text("refresh_token"), // Encrypted refresh token
  tokenExpiresAt: timestamp("token_expires_at"),
  lastSyncAt: timestamp("last_sync_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(), // NEW: Track permission changes
  grantedScopes: text("granted_scopes"), // NEW: Comma-separated list of granted OAuth scopes (Garmin only)
});

// Garmin Companion Real-time Data table
export const garminRealtimeData = pgTable("garmin_realtime_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").references(() => runs.id),
  sessionId: text("session_id").notNull(), // Companion app session ID
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  
  // Heart Rate
  heartRate: integer("heart_rate"), // bpm
  heartRateZone: integer("heart_rate_zone"), // 1-5
  
  // Location & Movement
  latitude: real("latitude"),
  longitude: real("longitude"),
  altitude: real("altitude"), // meters
  speed: real("speed"), // m/s
  pace: real("pace"), // seconds per km
  
  // Running Dynamics (from Garmin HRM-Pro or watch)
  cadence: integer("cadence"), // steps per minute
  strideLength: real("stride_length"), // meters
  groundContactTime: real("ground_contact_time"), // milliseconds
  groundContactBalance: real("ground_contact_balance"), // percentage left/right
  verticalOscillation: real("vertical_oscillation"), // centimeters
  verticalRatio: real("vertical_ratio"), // percentage
  
  // Power & Performance (if available)
  power: integer("power"), // watts
  
  // Environmental
  temperature: real("temperature"), // celsius
  
  // Activity Status
  activityType: text("activity_type"), // running, walking, cycling
  isMoving: boolean("is_moving").default(true),
  isPaused: boolean("is_paused").default(false),
  
  // Cumulative stats at this point
  cumulativeDistance: real("cumulative_distance"), // meters
  cumulativeAscent: real("cumulative_ascent"), // meters
  cumulativeDescent: real("cumulative_descent"), // meters
  elapsedTime: integer("elapsed_time"), // seconds
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Garmin Companion Sessions table
export const garminCompanionSessions = pgTable("garmin_companion_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").references(() => runs.id),
  sessionId: text("session_id").notNull().unique(), // Unique session identifier from companion app
  deviceId: text("device_id"), // Garmin device ID/serial
  deviceModel: text("device_model"), // e.g., "Forerunner 965"
  activityType: text("activity_type").default("running"),
  status: text("status").notNull().default("active"), // active, paused, completed, abandoned
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  lastDataAt: timestamp("last_data_at"),
  dataPointCount: integer("data_point_count").default(0),
  
  // Session summary (populated on end)
  totalDistance: real("total_distance"),
  totalDuration: integer("total_duration"), // seconds
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  avgCadence: integer("avg_cadence"),
  avgPace: real("avg_pace"),
  totalAscent: real("total_ascent"),
  totalDescent: real("total_descent"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== FITNESS & FRESHNESS TABLES ====================

// Daily Fitness table (stores daily CTL/ATL/TSB calculations)
export const dailyFitness = pgTable("daily_fitness", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD format
  ctl: real("ctl").notNull(), // Chronic Training Load (42-day average)
  atl: real("atl").notNull(), // Acute Training Load (7-day average)
  tsb: real("tsb").notNull(), // Training Stress Balance (Fitness - Fatigue)
  trainingLoad: integer("training_load").default(0), // Daily TSS
  status: text("status").notNull(), // overtrained, optimal, maintaining, detraining, etc.
  rampRate: real("ramp_rate"), // Weekly change in CTL
  injuryRisk: text("injury_risk"), // low, moderate, high
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== SEGMENT TABLES ====================

// Segments table (popular running segments)
export const segments = pgTable("segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  startLat: real("start_lat").notNull(),
  startLng: real("start_lng").notNull(),
  endLat: real("end_lat").notNull(),
  endLng: real("end_lng").notNull(),
  polyline: text("polyline").notNull(), // Encoded polyline for matching
  distance: real("distance").notNull(), // meters
  elevationGain: real("elevation_gain"), // meters
  elevationLoss: real("elevation_loss"), // meters
  avgGradient: real("avg_gradient"), // percentage
  maxGradient: real("max_gradient"), // percentage
  terrainType: text("terrain_type"), // road, trail, track, mixed
  city: text("city"),
  country: text("country"),
  category: text("category").default("community"), // kom, sprint, climb, community
  effortCount: integer("effort_count").default(0),
  starCount: integer("star_count").default(0),
  createdById: varchar("created_by_user_id").references(() => users.id),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Segment Efforts table (user attempts on segments)
export const segmentEfforts = pgTable("segment_efforts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  segmentId: varchar("segment_id").notNull().references(() => segments.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").notNull().references(() => runs.id),
  elapsedTime: integer("elapsed_time").notNull(), // seconds
  movingTime: integer("moving_time"), // seconds (excluding pauses)
  startIndex: integer("start_index").notNull(), // GPS track array index
  endIndex: integer("end_index").notNull(),
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  avgCadence: integer("avg_cadence"),
  avgPower: integer("avg_power"), // watts (if available)
  isPersonalRecord: boolean("is_personal_record").default(false),
  leaderboardRank: integer("leaderboard_rank"), // All-time rank
  yearlyRank: integer("yearly_rank"),
  monthlyRank: integer("monthly_rank"),
  achievementType: text("achievement_type"), // new_pr, kom, top_10, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Segment Stars table (user's starred/favorite segments)
export const segmentStars = pgTable("segment_stars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  segmentId: varchar("segment_id").notNull().references(() => segments.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== TRAINING PLAN TABLES ====================

// Training Plans table
export const trainingPlans = pgTable("training_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  goalType: text("goal_type").notNull(), // 5k, 10k, half_marathon, marathon, ultra
  targetDistance: real("target_distance"), // km
  targetTime: integer("target_time"), // seconds
  targetDate: timestamp("target_date"),
  currentWeek: integer("current_week").default(1),
  totalWeeks: integer("total_weeks").notNull(),
  experienceLevel: text("experience_level").notNull(), // beginner, intermediate, advanced
  weeklyMileageBase: real("weekly_mileage_base"), // km
  daysPerWeek: integer("days_per_week").default(4),
  includeSpeedWork: boolean("include_speed_work").default(true),
  includeHillWork: boolean("include_hill_work").default(true),
  includeLongRuns: boolean("include_long_runs").default(true),
  status: text("status").default("active"), // active, completed, paused
  aiGenerated: boolean("ai_generated").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Weekly Plans table (breakdown of each week's training)
export const weeklyPlans = pgTable("weekly_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trainingPlanId: varchar("training_plan_id").notNull().references(() => trainingPlans.id),
  weekNumber: integer("week_number").notNull(),
  weekDescription: text("week_description"),
  totalDistance: real("total_distance"), // km for the week
  totalDuration: integer("total_duration"), // seconds
  focusArea: text("focus_area"), // endurance, speed, recovery, race_prep
  intensityLevel: text("intensity_level"), // easy, moderate, hard
  createdAt: timestamp("created_at").defaultNow(),
});

// Planned Workouts table
export const plannedWorkouts = pgTable("planned_workouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weeklyPlanId: varchar("weekly_plan_id").notNull().references(() => weeklyPlans.id),
  trainingPlanId: varchar("training_plan_id").notNull().references(() => trainingPlans.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6 (Sunday-Saturday)
  scheduledDate: timestamp("scheduled_date"),
  workoutType: text("workout_type").notNull(), // easy, tempo, intervals, long_run, hill_repeats, recovery, rest
  distance: real("distance"), // km
  duration: integer("duration"), // seconds
  targetPace: text("target_pace"), // min/km
  intensity: text("intensity"), // z1, z2, z3, z4, z5 (heart rate zones)
  // HR Zone metadata — added to support personalized guidance based on device/HR history
  hrZoneNumber: integer("hr_zone_number"), // 1-5 if this workout focuses on a specific HR zone
  hrZoneMinBpm: integer("hr_zone_min_bpm"), // minimum BPM for target zone (calculated from age)
  hrZoneMaxBpm: integer("hr_zone_max_bpm"), // maximum BPM for target zone (calculated from age)
  hrZoneScenario: text("hr_zone_scenario"), // 'device' | 'history' | 'effort' | null — which scenario applies
  effortDescription: text("effort_description"), // For non-device scenarios: "gentle jog", "comfortably hold conversation", etc.
  description: text("description"),
  instructions: text("instructions"), // Detailed workout instructions
  // Interval/repeat workout metadata (for workoutType = "intervals" or "hill_repeats")
  intervalCount: integer("interval_count"), // Number of repetitions (e.g., 6 for 6x400m)
  intervalDistanceMeters: integer("interval_distance_meters"), // Distance of each interval (e.g., 400 for 400m)
  intervalDurationSeconds: integer("interval_duration_seconds"), // Duration if time-based (e.g., 120 for 2min)
  restDistanceMeters: integer("rest_distance_meters"), // Rest/recovery distance between intervals
  restDurationSeconds: integer("rest_duration_seconds"), // Rest/recovery duration between intervals
  intervalTargetPace: text("interval_target_pace"), // Target pace for work phase (mm:ss/km)
  restTargetPace: text("rest_target_pace"), // Target pace for recovery phase (mm:ss/km)
  intervalHeartRateMin: integer("interval_heart_rate_min"), // Min HR for work phase
  intervalHeartRateMax: integer("interval_heart_rate_max"), // Max HR for work phase
  restHeartRateMax: integer("rest_heart_rate_max"), // Max HR for recovery phase
  isCompleted: boolean("is_completed").default(false),
  completedRunId: varchar("completed_run_id").references(() => runs.id),
  
  // Session coaching instructions linkage
  sessionInstructionsId: varchar("session_instructions_id").references(() => sessionInstructions.id),
  sessionGoal: text("session_goal"), // "build_fitness", "develop_speed", "active_recovery", "endurance"
  sessionIntent: text("session_intent"), // What the session is designed to achieve
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Plan Adaptations table (track when AI adjusts the plan)
export const planAdaptations = pgTable("plan_adaptations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trainingPlanId: varchar("training_plan_id").notNull().references(() => trainingPlans.id),
  adaptationDate: timestamp("adaptation_date").defaultNow(),
  reason: text("reason").notNull(), // missed_workout, injury, over_training, ahead_of_schedule
  changes: jsonb("changes"), // What was changed
  aiSuggestion: text("ai_suggestion"),
  userAccepted: boolean("user_accepted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Indexes for performance
  trainingPlanIdIdx: index("idx_plan_adaptations_training_plan").on(table.trainingPlanId),
  userAcceptedIdx: index("idx_plan_adaptations_user_accepted").on(table.userAccepted),
  compositeIdx: index("idx_plan_adaptations_plan_status").on(table.trainingPlanId, table.userAccepted),
}));

// ==================== SHARED RUNS ====================

// Shared run links — each share creates a unique token for deep linking
export const sharedRuns = pgTable("shared_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shareToken: varchar("share_token").notNull().unique(), // Short unique token for the URL
  runId: varchar("run_id").notNull().references(() => runs.id),
  sharerId: varchar("sharer_id").notNull().references(() => users.id), // Who shared it
  sharerName: text("sharer_name"), // Cached for the landing page
  // Cached run summary data for the public landing page (so we don't need auth)
  distanceKm: real("distance_km"),
  durationSeconds: integer("duration_seconds"),
  avgPace: text("avg_pace"),
  completedAt: timestamp("completed_at"),
  // Referral tracking
  viewCount: integer("view_count").default(0),
  installCount: integer("install_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Optional expiry
});

// ==================== SOCIAL FEED TABLES ====================

// Feed Activities table (social feed posts)
export const feedActivities = pgTable("feed_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").references(() => runs.id),
  goalId: varchar("goal_id").references(() => goals.id),
  achievementId: varchar("achievement_id"),
  activityType: text("activity_type").notNull(), // run_completed, goal_achieved, pr_achieved, segment_kr, joined_challenge
  content: text("content"), // Optional user comment
  visibility: text("visibility").default("friends"), // public, friends, private
  reactionCount: integer("reaction_count").default(0),
  commentCount: integer("comment_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reactions table (kudos, fire, etc.)
export const reactions = pgTable("reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").notNull().references(() => feedActivities.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  reactionType: text("reaction_type").notNull(), // kudos, fire, strong, clap, heart
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity Comments table
export const activityComments = pgTable("activity_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").notNull().references(() => feedActivities.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  comment: text("comment").notNull(),
  likeCount: integer("like_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Comment Likes table
export const commentLikes = pgTable("comment_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => activityComments.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Clubs table (running clubs)
export const clubs = pgTable("clubs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  clubPicture: text("club_picture"),
  isPublic: boolean("is_public").default(true),
  memberCount: integer("member_count").default(0),
  createdById: varchar("created_by_user_id").notNull().references(() => users.id),
  city: text("city"),
  country: text("country"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Club Memberships table
export const clubMemberships = pgTable("club_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: text("role").default("member"), // admin, moderator, member
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Challenges table
export const challenges = pgTable("challenges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  challengeType: text("challenge_type").notNull(), // distance, duration, frequency, segment
  targetValue: real("target_value").notNull(), // km, minutes, or count
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isPublic: boolean("is_public").default(true),
  participantCount: integer("participant_count").default(0),
  createdById: varchar("created_by_user_id").notNull().references(() => users.id),
  badgeImage: text("badge_image"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Challenge Participants table
export const challengeParticipants = pgTable("challenge_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  currentProgress: real("current_progress").default(0),
  progressPercent: integer("progress_percent").default(0),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  rank: integer("rank"), // Leaderboard rank
  joinedAt: timestamp("joined_at").defaultNow(),
});

// ==================== ACHIEVEMENTS TABLES ====================

// Achievements table (badge definitions)
export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // distance, speed, consistency, social, segment
  badgeImage: text("badge_image"),
  requirement: jsonb("requirement"), // Criteria for earning
  rarity: text("rarity").default("common"), // common, rare, epic, legendary
  points: integer("points").default(10),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Achievements table
export const userAchievements = pgTable("user_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  achievementId: varchar("achievement_id").notNull().references(() => achievements.id),
  runId: varchar("run_id").references(() => runs.id), // Run that earned it
  earnedAt: timestamp("earned_at").defaultNow(),
  notificationSent: boolean("notification_sent").default(false),
});

// ==================== MOVEIQ ACTIVITY CLASSIFICATION ====================

// Garmin MoveIQ - AI-powered activity type detection
// Classifies activities into sub-types (e.g., Hurdles, Intervals, Trail)
export const garminMoveIQ = pgTable("garmin_move_iq", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  runId: varchar("run_id").references(() => runs.id), // Link to our runs table
  garminActivityId: text("garmin_activity_id"), // Reference to activity
  
  // MoveIQ Classification
  summaryId: text("summary_id"), // MoveIQ summary ID
  activityType: text("activity_type"), // e.g., "Running"
  activitySubType: text("activity_sub_type"), // e.g., "Hurdles", "Intervals", "Trail"
  
  // Timing
  calendarDate: text("calendar_date"), // YYYY-MM-DD
  startTimeInSeconds: integer("start_time_in_seconds"),
  durationInSeconds: integer("duration_in_seconds"),
  offsetInSeconds: integer("offset_in_seconds"), // Timezone offset
  
  // Metadata
  detectedAt: timestamp("detected_at").defaultNow(),
  rawData: jsonb("raw_data"), // Full MoveIQ payload
});

// ==================== WEBHOOK PROCESSING TABLES ====================

// OAuth State Store for secure OAuth flow (temporary, expires after 10 min)
export const oauthStateStore = pgTable("oauth_state_store", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  state: varchar("state").notNull().unique(), // The state parameter sent to OAuth provider
  userId: varchar("user_id").notNull(), // User who initiated the OAuth flow
  provider: varchar("provider").notNull(), // 'garmin', 'strava', etc.
  appRedirect: text("app_redirect"), // Deep link URL to redirect back to mobile app
  historyDays: integer("history_days").default(30), // Days of history to sync
  nonce: varchar("nonce"), // PKCE nonce for verifier lookup
  expiresAt: timestamp("expires_at").notNull(), // State expiration (10 minutes)
  createdAt: timestamp("created_at").defaultNow(),
});

// Garmin Webhook Failure Queue for retry logic
export const webhookFailureQueue = pgTable("webhook_failure_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookType: text("webhook_type").notNull(), // 'activities', 'sleep', 'daily', etc.
  userId: varchar("user_id"), // User ID if known
  payload: jsonb("payload").notNull(), // Full webhook payload
  error: text("error"), // Error message from processing
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  nextRetryAt: timestamp("next_retry_at").defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Garmin Webhook Events Log - comprehensive tracking of all webhook events
export const garminWebhookEvents = pgTable("garmin_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookType: text("webhook_type").notNull().default('activities'), // 'activities', 'activity-details', etc.
  activityId: varchar("activity_id"), // Garmin activity ID
  userId: varchar("user_id"), // User ID if known
  deviceId: varchar("device_id"), // Garmin device ID
  status: text("status").notNull(), // 'received', 'created_run', 'merged_run', 'failed', 'skipped'
  matchScore: real("match_score"), // Fuzzy match score (0-100) if merged
  matchedRunId: varchar("matched_run_id"), // ID of existing run if merged
  newRunId: varchar("new_run_id"), // ID of new run if created
  activityType: text("activity_type"), // 'RUNNING', 'WALKING', etc.
  distanceInMeters: real("distance_in_meters"),
  durationInSeconds: integer("duration_in_seconds"),
  errorMessage: text("error_message"), // Error details if failed
  notificationSent: boolean("notification_sent").default(false), // Whether push notification was sent
  notificationType: text("notification_type"), // 'new_activity', 'run_enriched'
  isProcessed: boolean("is_processed").default(false), // Whether processing is complete
  processedAt: timestamp("processed_at"), // When processing completed
  rawPayload: jsonb("raw_payload"), // Full webhook payload for debugging
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertRunSchema = createInsertSchema(runs).omit({ id: true, completedAt: true });
export const insertRouteSchema = createInsertSchema(routes).omit({ id: true, createdAt: true });
export const insertGoalSchema = createInsertSchema(goals).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFriendSchema = createInsertSchema(friends).omit({ id: true, createdAt: true });
export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Run = typeof runs.$inferSelect;
export type InsertRun = z.infer<typeof insertRunSchema>;
export type ActivityMergeLog = typeof activityMergeLog.$inferSelect;
export type Route = typeof routes.$inferSelect;
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Friend = typeof friends.$inferSelect;
export type InsertFriend = z.infer<typeof insertFriendSchema>;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type LiveRunSession = typeof liveRunSessions.$inferSelect;
export type GroupRun = typeof groupRuns.$inferSelect;
export type GroupRunParticipant = typeof groupRunParticipants.$inferSelect;
export type Event = typeof events.$inferSelect;
export type RouteRating = typeof routeRatings.$inferSelect;
export type RunAnalysis = typeof runAnalyses.$inferSelect;
export type DeviceData = typeof deviceData.$inferSelect;
export type ConnectedDevice = typeof connectedDevices.$inferSelect;
export type GarminWellnessMetric = typeof garminWellnessMetrics.$inferSelect;
export type GarminActivity = typeof garminActivities.$inferSelect;
export type GarminBodyComposition = typeof garminBodyComposition.$inferSelect;
export type GarminSkinTemperature = typeof garminSkinTemperature.$inferSelect;
export type GarminRealtimeData = typeof garminRealtimeData.$inferSelect;
export type GarminCompanionSession = typeof garminCompanionSessions.$inferSelect;
export type DailyFitness = typeof dailyFitness.$inferSelect;
export type Segment = typeof segments.$inferSelect;
export type SegmentEffort = typeof segmentEfforts.$inferSelect;
export type SegmentStar = typeof segmentStars.$inferSelect;
export type TrainingPlan = typeof trainingPlans.$inferSelect;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type PlannedWorkout = typeof plannedWorkouts.$inferSelect;
export type PlanAdaptation = typeof planAdaptations.$inferSelect;
export type FeedActivity = typeof feedActivities.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
export type ActivityComment = typeof activityComments.$inferSelect;
export type CommentLike = typeof commentLikes.$inferSelect;
export type Club = typeof clubs.$inferSelect;
export type ClubMembership = typeof clubMemberships.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type ChallengeParticipant = typeof challengeParticipants.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type SharedRun = typeof sharedRuns.$inferSelect;
export type OauthStateStore = typeof oauthStateStore.$inferSelect;
export type WebhookFailureQueue = typeof webhookFailureQueue.$inferSelect;
export type GarminWebhookEvent = typeof garminWebhookEvents.$inferSelect;
export type GarminMoveIQ = typeof garminMoveIQ.$inferSelect;
export type GarminBloodPressure = typeof garminBloodPressure.$inferSelect;
export type GarminEpochRaw = typeof garminEpochsRaw.$inferSelect;
export type GarminEpochAggregate = typeof garminEpochsAggregate.$inferSelect;
export type GarminHealthSnapshot = typeof garminHealthSnapshots.$inferSelect;

// ==================== SESSION COACHING INSTRUCTIONS ====================

// Session instructions table — stores AI-generated coaching plan per workout
export const sessionInstructions = pgTable("session_instructions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  plannedWorkoutId: varchar("planned_workout_id")
    .notNull()
    .unique()
    .references(() => plannedWorkouts.id, { onDelete: "cascade" }),

  // Pre-run brief
  preRunBrief: text("pre_run_brief").notNull(),

  // Session structure with phases, triggers, and guidance
  sessionStructure: jsonb("session_structure").notNull(),

  // Tone/style AI-determined for THIS specific session (can differ from user preference)
  aiDeterminedTone: text("ai_determined_tone").notNull(), // "light_fun", "direct", "motivational", "calm", "serious"
  aiDeterminedIntensity: text("ai_determined_intensity").notNull(), // "relaxed", "moderate", "intense"
  toneReasoning: text("tone_reasoning"), // Why AI chose this tone (for debugging/insights)

  // Coaching style details
  coachingStyle: jsonb("coaching_style").notNull(), // { tone, encouragementLevel, detailDepth, technicalDepth }
  insightFilters: jsonb("insight_filters"), // { include: [...], exclude: [...] }

  // Metadata for reference
  generatedAt: timestamp("generated_at").defaultNow(),
  generatedVersion: text("generated_version").default("1.0"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SessionInstructions = typeof sessionInstructions.$inferSelect;
export type InsertSessionInstructions = typeof sessionInstructions.$inferInsert;

// ==================== COACHING SESSION EVENTS ====================

// Coaching session events — tracks what coaching was delivered during a run
export const coachingSessionEvents = pgTable("coaching_session_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  plannedWorkoutId: varchar("planned_workout_id").references(() => plannedWorkouts.id),

  eventType: text("event_type").notNull(), // "interval_start", "pace_coaching", "recovery_guidance", etc
  eventPhase: text("event_phase"), // "warmup", "interval_2_of_6", "recovery", etc
  coachingMessage: text("coaching_message"),
  coachingAudioUrl: text("coaching_audio_url"),

  userMetrics: jsonb("user_metrics"), // Current pace, HR, distance, etc at time of coaching
  toneUsed: text("tone_used"), // Actual tone delivered
  userEngagement: text("user_engagement"), // "positive", "neutral", "struggled"

  triggeredAt: timestamp("triggered_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CoachingSessionEvent = typeof coachingSessionEvents.$inferSelect;
export type InsertCoachingSessionEvent = typeof coachingSessionEvents.$inferInsert;

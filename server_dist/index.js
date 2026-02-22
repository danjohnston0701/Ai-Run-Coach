var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  achievements: () => achievements,
  activityComments: () => activityComments,
  challengeParticipants: () => challengeParticipants,
  challenges: () => challenges,
  clubMemberships: () => clubMemberships,
  clubs: () => clubs,
  commentLikes: () => commentLikes,
  connectedDevices: () => connectedDevices,
  couponCodes: () => couponCodes,
  dailyFitness: () => dailyFitness,
  deviceData: () => deviceData,
  events: () => events,
  feedActivities: () => feedActivities,
  friendRequests: () => friendRequests,
  friends: () => friends,
  garminActivities: () => garminActivities,
  garminBodyComposition: () => garminBodyComposition,
  garminCompanionSessions: () => garminCompanionSessions,
  garminRealtimeData: () => garminRealtimeData,
  garminWellnessMetrics: () => garminWellnessMetrics,
  goals: () => goals,
  groupRunParticipants: () => groupRunParticipants,
  groupRuns: () => groupRuns,
  insertFriendRequestSchema: () => insertFriendRequestSchema,
  insertFriendSchema: () => insertFriendSchema,
  insertGoalSchema: () => insertGoalSchema,
  insertNotificationSchema: () => insertNotificationSchema,
  insertRouteSchema: () => insertRouteSchema,
  insertRunSchema: () => insertRunSchema,
  insertUserSchema: () => insertUserSchema,
  liveRunSessions: () => liveRunSessions,
  notificationPreferences: () => notificationPreferences,
  notifications: () => notifications,
  planAdaptations: () => planAdaptations2,
  plannedWorkouts: () => plannedWorkouts,
  pushSubscriptions: () => pushSubscriptions,
  reactions: () => reactions,
  routeRatings: () => routeRatings,
  routes: () => routes,
  runAnalyses: () => runAnalyses,
  runs: () => runs,
  segmentEfforts: () => segmentEfforts,
  segmentStars: () => segmentStars,
  segments: () => segments,
  trainingPlans: () => trainingPlans,
  userAchievements: () => userAchievements,
  userCoupons: () => userCoupons,
  users: () => users,
  weeklyPlans: () => weeklyPlans
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users, friends, friendRequests, routes, events, runs, goals, notifications, notificationPreferences, liveRunSessions, groupRuns, groupRunParticipants, pushSubscriptions, routeRatings, runAnalyses, couponCodes, userCoupons, garminWellnessMetrics, garminActivities, garminBodyComposition, deviceData, connectedDevices, garminRealtimeData, garminCompanionSessions, dailyFitness, segments, segmentEfforts, segmentStars, trainingPlans, weeklyPlans, plannedWorkouts, planAdaptations2, feedActivities, reactions, activityComments, commentLikes, clubs, clubMemberships, challenges, challengeParticipants, achievements, userAchievements, insertUserSchema, insertRunSchema, insertRouteSchema, insertGoalSchema, insertFriendSchema, insertFriendRequestSchema, insertNotificationSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    users = pgTable("users", {
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
      userCode: text("user_code").unique()
    });
    friends = pgTable("friends", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      friendId: varchar("friend_id").notNull().references(() => users.id),
      status: text("status").default("pending"),
      createdAt: timestamp("created_at").defaultNow()
    });
    friendRequests = pgTable("friend_requests", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      requesterId: varchar("requester_id").notNull().references(() => users.id),
      addresseeId: varchar("addressee_id").notNull().references(() => users.id),
      status: text("status").notNull().default("pending"),
      message: text("message"),
      createdAt: timestamp("created_at").defaultNow(),
      respondedAt: timestamp("responded_at")
    });
    routes = pgTable("routes", {
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
      sourceRunId: varchar("source_run_id")
    });
    events = pgTable("events", {
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
      createdByUserId: varchar("created_by_user_id").notNull()
    });
    runs = pgTable("runs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      routeId: varchar("route_id").references(() => routes.id),
      externalId: varchar("external_id"),
      // Garmin activity ID, Strava activity ID, etc.
      externalSource: varchar("external_source"),
      // 'garmin', 'strava', 'coros', etc.
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
      tss: integer("tss").default(0),
      // Training Stress Score
      gap: varchar("gap"),
      // Grade Adjusted Pace
      isPublic: boolean("is_public").default(true),
      // Social sharing
      strugglePoints: jsonb("struggle_points"),
      // Array of struggle point data
      kmSplits: jsonb("km_splits"),
      // Kilometer splits data
      minHeartRate: integer("min_heart_rate"),
      // Minimum HR
      terrainType: text("terrain_type"),
      // Terrain classification
      userComments: text("user_comments"),
      // Post-run user comments
      // Run goals for target tracking
      targetDistance: real("target_distance"),
      // User's target distance in km
      targetTime: integer("target_time"),
      // User's target time in milliseconds
      wasTargetAchieved: boolean("was_target_achieved"),
      // Whether target was met
      // Garmin upload tracking (two-way sync)
      uploadedToGarmin: boolean("uploaded_to_garmin").default(false),
      // TRUE if uploaded to Garmin Connect
      garminActivityId: varchar("garmin_activity_id")
      // Garmin activity ID if uploaded
    });
    goals = pgTable("goals", {
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
      completedAt: timestamp("completed_at"),
      createdAt: timestamp("created_at").defaultNow(),
      updatedAt: timestamp("updated_at").defaultNow()
    });
    notifications = pgTable("notifications", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      type: text("type").notNull(),
      title: text("title").notNull(),
      message: text("message").notNull(),
      read: boolean("read").default(false),
      data: jsonb("data"),
      createdAt: timestamp("created_at").defaultNow()
    });
    notificationPreferences = pgTable("notification_preferences", {
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
      liveObserverJoined: boolean("live_observer_joined").default(true)
    });
    liveRunSessions = pgTable("live_run_sessions", {
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
      lastSyncedAt: timestamp("last_synced_at").defaultNow()
    });
    groupRuns = pgTable("group_runs", {
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
      createdAt: timestamp("created_at").defaultNow()
    });
    groupRunParticipants = pgTable("group_run_participants", {
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
      readyToStart: boolean("ready_to_start").default(false)
    });
    pushSubscriptions = pgTable("push_subscriptions", {
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
      isActive: boolean("is_active").default(true)
    });
    routeRatings = pgTable("route_ratings", {
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
      createdAt: timestamp("created_at").defaultNow()
    });
    runAnalyses = pgTable("run_analyses", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      runId: varchar("run_id").notNull().references(() => runs.id),
      analysis: jsonb("analysis"),
      createdAt: timestamp("created_at").defaultNow()
    });
    couponCodes = pgTable("coupon_codes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      code: text("code").notNull().unique(),
      type: text("type").notNull(),
      value: integer("value"),
      durationDays: integer("duration_days"),
      maxUses: integer("max_uses"),
      currentUses: integer("current_uses").default(0),
      isActive: boolean("is_active").default(true),
      expiresAt: timestamp("expires_at"),
      createdAt: timestamp("created_at").defaultNow()
    });
    userCoupons = pgTable("user_coupons", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      couponId: varchar("coupon_id").notNull().references(() => couponCodes.id),
      redeemedAt: timestamp("redeemed_at").defaultNow(),
      expiresAt: timestamp("expires_at")
    });
    garminWellnessMetrics = pgTable("garmin_wellness_metrics", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      date: text("date").notNull(),
      // YYYY-MM-DD format
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
      sleepLevelsMap: jsonb("sleep_levels_map"),
      // Detailed sleep stages
      // Stress metrics
      averageStressLevel: integer("average_stress_level"),
      maxStressLevel: integer("max_stress_level"),
      stressDuration: integer("stress_duration"),
      // seconds
      restDuration: integer("rest_duration"),
      // seconds
      activityDuration: integer("activity_duration"),
      // seconds
      lowStressDuration: integer("low_stress_duration"),
      // seconds
      mediumStressDuration: integer("medium_stress_duration"),
      // seconds
      highStressDuration: integer("high_stress_duration"),
      // seconds
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
      hrvReadings: jsonb("hrv_readings"),
      // Detailed HRV readings array
      // Heart rate metrics
      restingHeartRate: integer("resting_heart_rate"),
      minHeartRate: integer("min_heart_rate"),
      maxHeartRate: integer("max_heart_rate"),
      averageHeartRate: integer("average_heart_rate"),
      heartRateTimeOffsetValues: jsonb("heart_rate_time_offset_values"),
      // Detailed HR data
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
      onDemandReadings: jsonb("on_demand_readings"),
      // Manual SpO2 readings
      sleepSpO2Readings: jsonb("sleep_spo2_readings"),
      // Sleep SpO2 readings
      // Activity/Daily metrics
      steps: integer("steps"),
      distanceMeters: integer("distance_meters"),
      activeKilocalories: integer("active_kilocalories"),
      bmrKilocalories: integer("bmr_kilocalories"),
      floorsClimbed: integer("floors_climbed"),
      floorsDescended: integer("floors_descended"),
      moderateIntensityDuration: integer("moderate_intensity_duration"),
      vigorousIntensityDuration: integer("vigorous_intensity_duration"),
      intensityDuration: integer("intensity_duration"),
      sedentaryDuration: integer("sedentary_duration"),
      sleepingDuration: integer("sleeping_duration"),
      activeDuration: integer("active_duration"),
      // Raw data for debugging
      rawData: jsonb("raw_data"),
      syncedAt: timestamp("synced_at").defaultNow()
    });
    garminActivities = pgTable("garmin_activities", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      runId: varchar("run_id").references(() => runs.id),
      // Link to our runs table
      garminActivityId: text("garmin_activity_id").notNull().unique(),
      // Basic activity info
      activityName: text("activity_name"),
      activityType: text("activity_type"),
      // running, walking, cycling, etc.
      eventType: text("event_type"),
      // race, workout, training, etc.
      startTimeInSeconds: integer("start_time_in_seconds"),
      startTimeOffsetInSeconds: integer("start_time_offset_in_seconds"),
      durationInSeconds: integer("duration_in_seconds"),
      distanceInMeters: real("distance_in_meters"),
      // Heart rate data
      averageHeartRateInBeatsPerMinute: integer("average_heart_rate"),
      maxHeartRateInBeatsPerMinute: integer("max_heart_rate"),
      heartRateZones: jsonb("heart_rate_zones"),
      // Zone breakdown
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
      groundContactTime: real("ground_contact_time"),
      // ms
      groundContactBalance: real("ground_contact_balance"),
      // %
      verticalOscillation: real("vertical_oscillation"),
      // cm
      verticalRatio: real("vertical_ratio"),
      // %
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
      aerobicTrainingEffect: real("aerobic_training_effect"),
      // 1.0 - 5.0
      anaerobicTrainingEffect: real("anaerobic_training_effect"),
      // 1.0 - 5.0
      trainingEffectLabel: text("training_effect_label"),
      // Recovery
      vo2Max: real("vo2_max"),
      lactateThresholdBpm: integer("lactate_threshold_bpm"),
      lactateThresholdSpeed: real("lactate_threshold_speed"),
      recoveryTimeInMinutes: integer("recovery_time"),
      // Laps and splits
      laps: jsonb("laps"),
      // Array of lap data
      splits: jsonb("splits"),
      // km/mile splits
      samples: jsonb("samples"),
      // Time series data (GPS, HR, pace, etc.)
      // Environmental
      averageTemperature: real("average_temperature"),
      minTemperature: real("min_temperature"),
      maxTemperature: real("max_temperature"),
      // Device info
      deviceName: text("device_name"),
      // Full raw data
      rawData: jsonb("raw_data"),
      // Metadata
      isProcessed: boolean("is_processed").default(false),
      aiAnalysisGenerated: boolean("ai_analysis_generated").default(false),
      createdAt: timestamp("created_at").defaultNow()
    });
    garminBodyComposition = pgTable("garmin_body_composition", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      measurementTimeInSeconds: integer("measurement_time_in_seconds"),
      measurementDate: text("measurement_date"),
      // YYYY-MM-DD
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
      createdAt: timestamp("created_at").defaultNow()
    });
    deviceData = pgTable("device_data", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      runId: varchar("run_id").references(() => runs.id),
      deviceType: text("device_type").notNull(),
      // 'garmin' | 'samsung' | 'apple' | 'coros' | 'strava'
      activityId: text("activity_id"),
      // External activity ID from device
      heartRateZones: jsonb("heart_rate_zones"),
      // Zone breakdown { zone1Minutes, zone2Minutes, etc }
      vo2Max: real("vo2_max"),
      // Fitness level metric
      trainingEffect: real("training_effect"),
      // 1.0 - 5.0
      recoveryTime: integer("recovery_time"),
      // Hours until recovered
      stressLevel: integer("stress_level"),
      // 0-100
      bodyBattery: integer("body_battery"),
      // 0-100
      restingHeartRate: integer("resting_heart_rate"),
      caloriesBurned: integer("calories_burned"),
      rawData: jsonb("raw_data"),
      // Full device response for debugging
      syncedAt: timestamp("synced_at").defaultNow()
    });
    connectedDevices = pgTable("connected_devices", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      deviceType: text("device_type").notNull(),
      // 'garmin' | 'samsung' | 'apple' | 'coros' | 'strava'
      deviceName: text("device_name"),
      deviceId: text("device_id"),
      // External device/athlete ID
      accessToken: text("access_token"),
      // Encrypted OAuth token
      refreshToken: text("refresh_token"),
      // Encrypted refresh token
      tokenExpiresAt: timestamp("token_expires_at"),
      lastSyncAt: timestamp("last_sync_at"),
      isActive: boolean("is_active").default(true),
      createdAt: timestamp("created_at").defaultNow()
    });
    garminRealtimeData = pgTable("garmin_realtime_data", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      runId: varchar("run_id").references(() => runs.id),
      sessionId: text("session_id").notNull(),
      // Companion app session ID
      timestamp: timestamp("timestamp").notNull().defaultNow(),
      // Heart Rate
      heartRate: integer("heart_rate"),
      // bpm
      heartRateZone: integer("heart_rate_zone"),
      // 1-5
      // Location & Movement
      latitude: real("latitude"),
      longitude: real("longitude"),
      altitude: real("altitude"),
      // meters
      speed: real("speed"),
      // m/s
      pace: real("pace"),
      // seconds per km
      // Running Dynamics (from Garmin HRM-Pro or watch)
      cadence: integer("cadence"),
      // steps per minute
      strideLength: real("stride_length"),
      // meters
      groundContactTime: real("ground_contact_time"),
      // milliseconds
      groundContactBalance: real("ground_contact_balance"),
      // percentage left/right
      verticalOscillation: real("vertical_oscillation"),
      // centimeters
      verticalRatio: real("vertical_ratio"),
      // percentage
      // Power & Performance (if available)
      power: integer("power"),
      // watts
      // Environmental
      temperature: real("temperature"),
      // celsius
      // Activity Status
      activityType: text("activity_type"),
      // running, walking, cycling
      isMoving: boolean("is_moving").default(true),
      isPaused: boolean("is_paused").default(false),
      // Cumulative stats at this point
      cumulativeDistance: real("cumulative_distance"),
      // meters
      cumulativeAscent: real("cumulative_ascent"),
      // meters
      cumulativeDescent: real("cumulative_descent"),
      // meters
      elapsedTime: integer("elapsed_time"),
      // seconds
      createdAt: timestamp("created_at").defaultNow()
    });
    garminCompanionSessions = pgTable("garmin_companion_sessions", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      runId: varchar("run_id").references(() => runs.id),
      sessionId: text("session_id").notNull().unique(),
      // Unique session identifier from companion app
      deviceId: text("device_id"),
      // Garmin device ID/serial
      deviceModel: text("device_model"),
      // e.g., "Forerunner 965"
      activityType: text("activity_type").default("running"),
      status: text("status").notNull().default("active"),
      // active, paused, completed, abandoned
      startedAt: timestamp("started_at").defaultNow(),
      endedAt: timestamp("ended_at"),
      lastDataAt: timestamp("last_data_at"),
      dataPointCount: integer("data_point_count").default(0),
      // Session summary (populated on end)
      totalDistance: real("total_distance"),
      totalDuration: integer("total_duration"),
      // seconds
      avgHeartRate: integer("avg_heart_rate"),
      maxHeartRate: integer("max_heart_rate"),
      avgCadence: integer("avg_cadence"),
      avgPace: real("avg_pace"),
      totalAscent: real("total_ascent"),
      totalDescent: real("total_descent"),
      createdAt: timestamp("created_at").defaultNow()
    });
    dailyFitness = pgTable("daily_fitness", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      date: text("date").notNull(),
      // YYYY-MM-DD format
      ctl: real("ctl").notNull(),
      // Chronic Training Load (42-day average)
      atl: real("atl").notNull(),
      // Acute Training Load (7-day average)
      tsb: real("tsb").notNull(),
      // Training Stress Balance (Fitness - Fatigue)
      trainingLoad: integer("training_load").default(0),
      // Daily TSS
      status: text("status").notNull(),
      // overtrained, optimal, maintaining, detraining, etc.
      rampRate: real("ramp_rate"),
      // Weekly change in CTL
      injuryRisk: text("injury_risk"),
      // low, moderate, high
      createdAt: timestamp("created_at").defaultNow()
    });
    segments = pgTable("segments", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      startLat: real("start_lat").notNull(),
      startLng: real("start_lng").notNull(),
      endLat: real("end_lat").notNull(),
      endLng: real("end_lng").notNull(),
      polyline: text("polyline").notNull(),
      // Encoded polyline for matching
      distance: real("distance").notNull(),
      // meters
      elevationGain: real("elevation_gain"),
      // meters
      elevationLoss: real("elevation_loss"),
      // meters
      avgGradient: real("avg_gradient"),
      // percentage
      maxGradient: real("max_gradient"),
      // percentage
      terrainType: text("terrain_type"),
      // road, trail, track, mixed
      city: text("city"),
      country: text("country"),
      category: text("category").default("community"),
      // kom, sprint, climb, community
      effortCount: integer("effort_count").default(0),
      starCount: integer("star_count").default(0),
      createdById: varchar("created_by_user_id").references(() => users.id),
      isVerified: boolean("is_verified").default(false),
      createdAt: timestamp("created_at").defaultNow()
    });
    segmentEfforts = pgTable("segment_efforts", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      segmentId: varchar("segment_id").notNull().references(() => segments.id),
      userId: varchar("user_id").notNull().references(() => users.id),
      runId: varchar("run_id").notNull().references(() => runs.id),
      elapsedTime: integer("elapsed_time").notNull(),
      // seconds
      movingTime: integer("moving_time"),
      // seconds (excluding pauses)
      startIndex: integer("start_index").notNull(),
      // GPS track array index
      endIndex: integer("end_index").notNull(),
      avgHeartRate: integer("avg_heart_rate"),
      maxHeartRate: integer("max_heart_rate"),
      avgCadence: integer("avg_cadence"),
      avgPower: integer("avg_power"),
      // watts (if available)
      isPersonalRecord: boolean("is_personal_record").default(false),
      leaderboardRank: integer("leaderboard_rank"),
      // All-time rank
      yearlyRank: integer("yearly_rank"),
      monthlyRank: integer("monthly_rank"),
      achievementType: text("achievement_type"),
      // new_pr, kom, top_10, etc.
      createdAt: timestamp("created_at").defaultNow()
    });
    segmentStars = pgTable("segment_stars", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      segmentId: varchar("segment_id").notNull().references(() => segments.id),
      userId: varchar("user_id").notNull().references(() => users.id),
      createdAt: timestamp("created_at").defaultNow()
    });
    trainingPlans = pgTable("training_plans", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      goalType: text("goal_type").notNull(),
      // 5k, 10k, half_marathon, marathon, ultra
      targetDistance: real("target_distance"),
      // km
      targetTime: integer("target_time"),
      // seconds
      targetDate: timestamp("target_date"),
      currentWeek: integer("current_week").default(1),
      totalWeeks: integer("total_weeks").notNull(),
      experienceLevel: text("experience_level").notNull(),
      // beginner, intermediate, advanced
      weeklyMileageBase: real("weekly_mileage_base"),
      // km
      daysPerWeek: integer("days_per_week").default(4),
      includeSpeedWork: boolean("include_speed_work").default(true),
      includeHillWork: boolean("include_hill_work").default(true),
      includeLongRuns: boolean("include_long_runs").default(true),
      status: text("status").default("active"),
      // active, completed, paused
      aiGenerated: boolean("ai_generated").default(true),
      createdAt: timestamp("created_at").defaultNow(),
      completedAt: timestamp("completed_at")
    });
    weeklyPlans = pgTable("weekly_plans", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      trainingPlanId: varchar("training_plan_id").notNull().references(() => trainingPlans.id),
      weekNumber: integer("week_number").notNull(),
      weekDescription: text("week_description"),
      totalDistance: real("total_distance"),
      // km for the week
      totalDuration: integer("total_duration"),
      // seconds
      focusArea: text("focus_area"),
      // endurance, speed, recovery, race_prep
      intensityLevel: text("intensity_level"),
      // easy, moderate, hard
      createdAt: timestamp("created_at").defaultNow()
    });
    plannedWorkouts = pgTable("planned_workouts", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      weeklyPlanId: varchar("weekly_plan_id").notNull().references(() => weeklyPlans.id),
      trainingPlanId: varchar("training_plan_id").notNull().references(() => trainingPlans.id),
      dayOfWeek: integer("day_of_week").notNull(),
      // 0-6 (Sunday-Saturday)
      scheduledDate: timestamp("scheduled_date"),
      workoutType: text("workout_type").notNull(),
      // easy, tempo, intervals, long_run, hill_repeats, recovery, rest
      distance: real("distance"),
      // km
      duration: integer("duration"),
      // seconds
      targetPace: text("target_pace"),
      // min/km
      intensity: text("intensity"),
      // z1, z2, z3, z4, z5 (heart rate zones)
      description: text("description"),
      instructions: text("instructions"),
      // Detailed workout instructions
      isCompleted: boolean("is_completed").default(false),
      completedRunId: varchar("completed_run_id").references(() => runs.id),
      createdAt: timestamp("created_at").defaultNow()
    });
    planAdaptations2 = pgTable("plan_adaptations", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      trainingPlanId: varchar("training_plan_id").notNull().references(() => trainingPlans.id),
      adaptationDate: timestamp("adaptation_date").defaultNow(),
      reason: text("reason").notNull(),
      // missed_workout, injury, over_training, ahead_of_schedule
      changes: jsonb("changes"),
      // What was changed
      aiSuggestion: text("ai_suggestion"),
      userAccepted: boolean("user_accepted").default(false),
      createdAt: timestamp("created_at").defaultNow()
    });
    feedActivities = pgTable("feed_activities", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      runId: varchar("run_id").references(() => runs.id),
      goalId: varchar("goal_id").references(() => goals.id),
      achievementId: varchar("achievement_id"),
      activityType: text("activity_type").notNull(),
      // run_completed, goal_achieved, pr_achieved, segment_kr, joined_challenge
      content: text("content"),
      // Optional user comment
      visibility: text("visibility").default("friends"),
      // public, friends, private
      reactionCount: integer("reaction_count").default(0),
      commentCount: integer("comment_count").default(0),
      createdAt: timestamp("created_at").defaultNow()
    });
    reactions = pgTable("reactions", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      activityId: varchar("activity_id").notNull().references(() => feedActivities.id),
      userId: varchar("user_id").notNull().references(() => users.id),
      reactionType: text("reaction_type").notNull(),
      // kudos, fire, strong, clap, heart
      createdAt: timestamp("created_at").defaultNow()
    });
    activityComments = pgTable("activity_comments", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      activityId: varchar("activity_id").notNull().references(() => feedActivities.id),
      userId: varchar("user_id").notNull().references(() => users.id),
      comment: text("comment").notNull(),
      likeCount: integer("like_count").default(0),
      createdAt: timestamp("created_at").defaultNow()
    });
    commentLikes = pgTable("comment_likes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      commentId: varchar("comment_id").notNull().references(() => activityComments.id),
      userId: varchar("user_id").notNull().references(() => users.id),
      createdAt: timestamp("created_at").defaultNow()
    });
    clubs = pgTable("clubs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      clubPicture: text("club_picture"),
      isPublic: boolean("is_public").default(true),
      memberCount: integer("member_count").default(0),
      createdById: varchar("created_by_user_id").notNull().references(() => users.id),
      city: text("city"),
      country: text("country"),
      createdAt: timestamp("created_at").defaultNow()
    });
    clubMemberships = pgTable("club_memberships", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      clubId: varchar("club_id").notNull().references(() => clubs.id),
      userId: varchar("user_id").notNull().references(() => users.id),
      role: text("role").default("member"),
      // admin, moderator, member
      joinedAt: timestamp("joined_at").defaultNow()
    });
    challenges = pgTable("challenges", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      challengeType: text("challenge_type").notNull(),
      // distance, duration, frequency, segment
      targetValue: real("target_value").notNull(),
      // km, minutes, or count
      startDate: timestamp("start_date").notNull(),
      endDate: timestamp("end_date").notNull(),
      isPublic: boolean("is_public").default(true),
      participantCount: integer("participant_count").default(0),
      createdById: varchar("created_by_user_id").notNull().references(() => users.id),
      badgeImage: text("badge_image"),
      createdAt: timestamp("created_at").defaultNow()
    });
    challengeParticipants = pgTable("challenge_participants", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
      userId: varchar("user_id").notNull().references(() => users.id),
      currentProgress: real("current_progress").default(0),
      progressPercent: integer("progress_percent").default(0),
      isCompleted: boolean("is_completed").default(false),
      completedAt: timestamp("completed_at"),
      rank: integer("rank"),
      // Leaderboard rank
      joinedAt: timestamp("joined_at").defaultNow()
    });
    achievements = pgTable("achievements", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description").notNull(),
      category: text("category").notNull(),
      // distance, speed, consistency, social, segment
      badgeImage: text("badge_image"),
      requirement: jsonb("requirement"),
      // Criteria for earning
      rarity: text("rarity").default("common"),
      // common, rare, epic, legendary
      points: integer("points").default(10),
      createdAt: timestamp("created_at").defaultNow()
    });
    userAchievements = pgTable("user_achievements", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      achievementId: varchar("achievement_id").notNull().references(() => achievements.id),
      runId: varchar("run_id").references(() => runs.id),
      // Run that earned it
      earnedAt: timestamp("earned_at").defaultNow(),
      notificationSent: boolean("notification_sent").default(false)
    });
    insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
    insertRunSchema = createInsertSchema(runs).omit({ id: true, completedAt: true });
    insertRouteSchema = createInsertSchema(routes).omit({ id: true, createdAt: true });
    insertGoalSchema = createInsertSchema(goals).omit({ id: true, createdAt: true, updatedAt: true });
    insertFriendSchema = createInsertSchema(friends).omit({ id: true, createdAt: true });
    insertFriendRequestSchema = createInsertSchema(friendRequests).omit({ id: true, createdAt: true });
    insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  pool: () => pool
});
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
var Pool, connectionString, pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    ({ Pool } = pg);
    connectionString = process.env.EXTERNAL_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "EXTERNAL_DATABASE_URL must be set. This should point to the Neon PostgreSQL database."
      );
    }
    console.log("\u{1F50C} Connecting to database:", connectionString.substring(0, 30) + "...");
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
      // Required for Neon
    });
    db = drizzle(pool, { schema: schema_exports });
  }
});

// shared/coaching-statements.ts
function determinePhase(distanceKm, totalDistanceKm) {
  const percentComplete = totalDistanceKm && totalDistanceKm > 0 ? distanceKm / totalDistanceKm * 100 : null;
  if (percentComplete !== null) {
    if (percentComplete >= 90) return "final";
    if (percentComplete >= 75) return "late";
    if (percentComplete >= 40 && percentComplete <= 50) return "mid";
    if (percentComplete <= 10) return "early";
    return "generic";
  }
  if (distanceKm <= 2) return "early";
  if (distanceKm >= 3 && distanceKm <= 5) return "mid";
  return "generic";
}
var COACHING_PHASE_PROMPT;
var init_coaching_statements = __esm({
  "shared/coaching-statements.ts"() {
    "use strict";
    COACHING_PHASE_PROMPT = `COACHING PHASE RULES - CRITICAL:
You must ONLY use coaching statements appropriate for the runner's current phase:

1. EARLY PHASE (first 2km OR first 10% of run):
   - Focus on: warm-up, settling into rhythm, relaxed form
   - Topics: posture basics, breathing pattern establishment, easy pacing
   - Avoid: fatigue-related advice, pushing through pain, finishing strong messages

2. MID PHASE (3-5km OR 40-50% of run):
   - Focus on: maintaining form, staying in the groove, rhythm
   - Topics: core engagement, arm swing, foot strike, confidence
   - Avoid: warm-up advice, final sprint encouragement

3. LATE PHASE (7km+ OR 75-90% of run):
   - Focus on: mental strength, managing fatigue, maintaining form under tiredness
   - Topics: resetting when tired, embracing challenge, breaking distance into chunks
   - This is the ONLY phase where fatigue-related advice is appropriate

4. FINAL PHASE (last 10% of run):
   - Focus on: finishing strong, celebration, final push
   - Topics: sprint to finish, leaving nothing behind, victory lap
   - Maximum motivation and energy

5. GENERIC (any time):
   - Timeless advice: smiling, trust in training, purpose reminders
   - Use sparingly to supplement phase-specific content

REPETITION RULE: Do not use the same statement more than 3 times during a single run.`;
  }
});

// server/ai-service.ts
var ai_service_exports = {};
__export(ai_service_exports, {
  generateCadenceCoaching: () => generateCadenceCoaching,
  generateComprehensiveRunAnalysis: () => generateComprehensiveRunAnalysis,
  generateHeartRateCoaching: () => generateHeartRateCoaching,
  generatePaceUpdate: () => generatePaceUpdate,
  generatePhaseCoaching: () => generatePhaseCoaching,
  generatePreRunCoaching: () => generatePreRunCoaching,
  generatePreRunSummary: () => generatePreRunSummary,
  generateRouteOptions: () => generateRouteOptions,
  generateRunSummary: () => generateRunSummary,
  generateStruggleCoaching: () => generateStruggleCoaching,
  generateTTS: () => generateTTS,
  generateWellnessAwarePreRunBriefing: () => generateWellnessAwarePreRunBriefing,
  getCoachingResponse: () => getCoachingResponse,
  getElevationCoaching: () => getElevationCoaching,
  getWellnessAwareCoachingResponse: () => getWellnessAwareCoachingResponse
});
import OpenAI2 from "openai";
async function getCoachingResponse(message, context) {
  const systemPrompt = buildCoachingSystemPrompt(context);
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ],
    max_tokens: 150,
    temperature: 0.7
  });
  return completion.choices[0].message.content || "Keep going, you're doing great!";
}
async function generatePreRunCoaching(params) {
  const { distance, elevationGain, elevationLoss, difficulty, activityType, weather, coachName, coachTone } = params;
  const weatherInfo = weather ? `Weather: ${weather.temp || "N/A"}\xB0C, ${weather.condition || "clear"}, wind ${weather.windSpeed || 0} km/h.` : "Weather data unavailable.";
  const prompt = `You are ${coachName}, an AI running coach. Your coaching style is ${coachTone}.

Generate a brief pre-run briefing (2-3 sentences max) for this upcoming ${activityType}:
- Distance: ${distance?.toFixed(1) || "?"}km
- Difficulty: ${difficulty}
- Elevation gain: ${Math.round(elevationGain || 0)}m, loss: ${Math.round(elevationLoss || 0)}m
- ${weatherInfo}

Be encouraging, specific to the conditions, and give one actionable tip. Speak naturally as if talking directly to the runner.`;
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, a ${coachTone} running coach. Keep responses brief, encouraging, and actionable. ${toneDirective(coachTone)}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 120,
    temperature: 0.8
  });
  return completion.choices[0].message.content || "Take it easy at the start and find your rhythm. Good luck!";
}
async function generatePaceUpdate(params) {
  const { distance, targetDistance, currentPace, elapsedTime, coachName, coachTone, isSplit, splitKm, splitPace, currentGrade, totalElevationGain, isOnHill, kmSplits } = params;
  const progress = Math.round(distance / targetDistance * 100);
  const timeMin = Math.floor(elapsedTime / 60);
  let terrainContext = "";
  if (currentGrade !== void 0 && Math.abs(currentGrade) > 5) {
    if (currentGrade > 5) {
      terrainContext = `Currently climbing a steep ${currentGrade.toFixed(1)}% grade hill. `;
    } else if (currentGrade < -5) {
      terrainContext = `Currently descending a steep ${Math.abs(currentGrade).toFixed(1)}% grade. `;
    }
  }
  if (totalElevationGain && totalElevationGain > 20) {
    terrainContext += `Total elevation climbed so far: ${Math.round(totalElevationGain)}m. `;
  }
  let paceTrend = "";
  if (isSplit && kmSplits && kmSplits.length >= 2) {
    const lastTwo = kmSplits.slice(-2);
    if (lastTwo.length === 2) {
      const prevTime = lastTwo[0].time;
      const currTime = lastTwo[1].time;
      const diff = currTime - prevTime;
      if (diff > 10) {
        paceTrend = "Runner is slowing down compared to previous kilometer. ";
      } else if (diff < -10) {
        paceTrend = "Runner is speeding up compared to previous kilometer. ";
      } else {
        paceTrend = "Runner is maintaining consistent pace. ";
      }
    }
  }
  let prompt;
  if (isSplit && splitKm && splitPace) {
    prompt = `You are ${coachName}, an AI running coach with a ${coachTone} style.
    
The runner just completed kilometer ${splitKm} with a split pace of ${splitPace}/km. They're at ${progress}% of their ${targetDistance}km run.
${terrainContext}${paceTrend}

Give a brief (1-2 sentences) split update. ${isOnHill ? "Acknowledge the hill effort. " : ""}Mention their pace and give quick encouragement or pacing advice. ${paceTrend ? "Comment on their pace trend if relevant." : ""}`;
  } else {
    prompt = `You are ${coachName}, an AI running coach with a ${coachTone} style.
    
500m pace check: Runner is at ${distance.toFixed(2)}km, pace ${currentPace}/km, ${timeMin} minutes in.
${terrainContext}

Give a very brief (1 sentence) pace update with encouragement.${isOnHill ? " Acknowledge the hill they are on." : ""}`;
  }
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, a ${coachTone} running coach. Keep pace updates brief (1-2 sentences max). Be elevation-aware when hills are mentioned. ${toneDirective(coachTone)}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 80,
    temperature: 0.7
  });
  return completion.choices[0].message.content || (isSplit ? `Kilometer ${splitKm} done at ${splitPace}. Keep it up!` : "Looking good, keep this pace!");
}
async function generateRunSummary(runData) {
  const prompt = `Analyze this run and provide a brief summary with highlights, struggles, and tips:
Run Data:
- Distance: ${runData.distance}km
- Duration: ${runData.duration} minutes
- Average Pace: ${runData.avgPace}
- Elevation Gain: ${runData.elevationGain || 0}m
- Activity Type: ${runData.activityType || "run"}
- Weather: ${JSON.stringify(runData.weather || {})}

Provide response as JSON with fields: highlights (array), struggles (array), tips (array), overallScore (1-10), summary (string)`;
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an expert running coach providing post-run analysis. Respond only with valid JSON." },
      { role: "user", content: prompt }
    ],
    max_tokens: 500,
    temperature: 0.7
  });
  try {
    const content = completion.choices[0].message.content || "{}";
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
  } catch {
    return {
      highlights: ["Completed your run!"],
      struggles: [],
      tips: ["Keep up the great work!"],
      overallScore: 7,
      summary: "Great effort on your run today!"
    };
  }
}
async function generatePhaseCoaching(params) {
  const { phase, distance, targetDistance, elapsedTime, currentPace, currentGrade, totalElevationGain, heartRate, cadence, coachName, coachTone, activityType } = params;
  const timeMin = Math.floor(elapsedTime / 60);
  const progress = targetDistance ? Math.round(distance / targetDistance * 100) : 0;
  const phaseDescriptions = {
    warmUp: "The runner is in the warm-up phase, getting into their rhythm.",
    midRun: "The runner is in the middle of their run, working hard.",
    lateRun: "The runner is in the late phase, possibly getting tired.",
    finalPush: "The runner is approaching the finish, time for final encouragement."
  };
  let terrainInfo = "";
  if (currentGrade && Math.abs(currentGrade) > 2) {
    terrainInfo = currentGrade > 0 ? `Currently climbing (${currentGrade.toFixed(1)}% grade). ` : `Currently descending (${Math.abs(currentGrade).toFixed(1)}% grade). `;
  }
  if (totalElevationGain && totalElevationGain > 0) {
    terrainInfo += `Total climb so far: ${Math.round(totalElevationGain)}m. `;
  }
  let hrInfo = "";
  if (heartRate && heartRate > 0) {
    const hrZone = getHeartRateZone(heartRate);
    hrInfo = `Heart rate: ${heartRate} bpm (${hrZone} zone). `;
  }
  let cadenceInfo = "";
  if (cadence && cadence > 0) {
    const cadenceAssessment = cadence >= 170 ? "excellent" : cadence >= 160 ? "good" : cadence >= 150 ? "moderate" : "needs work";
    cadenceInfo = `Cadence: ${cadence} spm (${cadenceAssessment}). `;
  }
  const prompt = `You are ${coachName}, an AI ${activityType || "running"} coach with a ${coachTone} style.

Phase: ${phaseDescriptions[phase]}
Runner Status:
- Distance covered: ${distance.toFixed(2)}km${targetDistance ? ` (${progress}% of ${targetDistance}km)` : ""}
- Time elapsed: ${timeMin} minutes
${currentPace ? `- Current pace: ${currentPace}/km` : ""}
${hrInfo}
${cadenceInfo}
${terrainInfo}

Give a brief (1-2 sentences) phase-appropriate coaching message. Be ${coachTone} and encouraging. Consider their current terrain if on a hill.`;
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, a ${coachTone} ${activityType || "running"} coach. Keep coaching messages brief and impactful. ${toneDirective(coachTone)}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 80,
    temperature: 0.8
  });
  return completion.choices[0].message.content || "You're doing great, keep it up!";
}
function getHeartRateZone(hr) {
  const maxHR = 190;
  const percentage = hr / maxHR * 100;
  if (percentage < 60) return "Zone 1 (Recovery)";
  if (percentage < 70) return "Zone 2 (Aerobic)";
  if (percentage < 80) return "Zone 3 (Tempo)";
  if (percentage < 90) return "Zone 4 (Threshold)";
  return "Zone 5 (Maximum)";
}
async function generateStruggleCoaching(params) {
  const { distance, elapsedTime, currentPace, baselinePace, paceDropPercent, currentGrade, totalElevationGain, coachName, coachTone } = params;
  const timeMin = Math.floor(elapsedTime / 60);
  let terrainContext = "";
  if (currentGrade && currentGrade > 3) {
    terrainContext = `They're currently on a ${currentGrade.toFixed(1)}% uphill which may explain the slowdown. `;
  } else if (totalElevationGain && totalElevationGain > 50) {
    terrainContext = `They've climbed ${Math.round(totalElevationGain)}m so far, which is contributing to fatigue. `;
  }
  const prompt = `You are ${coachName}, an AI running coach with a ${coachTone} style.

The runner is struggling. Their pace has dropped ${Math.round(paceDropPercent)}% from their baseline.
- Current pace: ${currentPace}/km (baseline was ${baselinePace}/km)
- Distance: ${distance.toFixed(2)}km
- Time: ${timeMin} minutes
${terrainContext}

Give a brief (1-2 sentences) supportive message to help them through this tough moment. Acknowledge their struggle, but encourage them to push through or adjust their strategy.`;
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, a ${coachTone} running coach. Be supportive during tough moments. Keep it brief. ${toneDirective(coachTone)}` },
      { role: "user", content: prompt }
    ],
    max_tokens: 80,
    temperature: 0.7
  });
  return completion.choices[0].message.content || "I can see you're working hard. Take a breath and find your rhythm again.";
}
async function generateCadenceCoaching(params) {
  const {
    cadence,
    strideLength,
    strideZone,
    currentPace,
    speed,
    distance,
    elapsedTime,
    heartRate,
    userHeight,
    userWeight,
    userAge,
    optimalCadenceMin,
    optimalCadenceMax,
    optimalStrideLengthMin,
    optimalStrideLengthMax,
    coachName = "Coach",
    coachTone = "energetic"
  } = params;
  const strideCm = Math.round(strideLength * 100);
  const optMinCm = Math.round(optimalStrideLengthMin * 100);
  const optMaxCm = Math.round(optimalStrideLengthMax * 100);
  const timeMin = Math.floor(elapsedTime / 6e4);
  let physicalContext = "";
  if (userHeight) physicalContext += `Runner height: ${userHeight > 3 ? userHeight : (userHeight * 100).toFixed(0)}cm. `;
  if (userWeight) physicalContext += `Weight: ${userWeight}kg. `;
  if (userAge) physicalContext += `Age: ${userAge}. `;
  let zoneAnalysis = "";
  if (strideZone === "OVERSTRIDING") {
    zoneAnalysis = `OVERSTRIDING DETECTED: Cadence ${cadence} spm with stride length ${strideCm}cm \u2014 this is above the optimal range of ${optMinCm}-${optMaxCm}cm for their height.

Overstriding means their foot is landing too far ahead of their center of mass, creating a braking force with each step. This:
- Increases impact on knees and shins (injury risk)
- Wastes energy fighting the braking force
- Reduces running efficiency

The runner needs to SHORTEN their stride and INCREASE their cadence. Provide elite-level coaching on HOW to do this:
1. Focus on landing with foot beneath hips, not out front
2. Think "quick, light steps" \u2014 aim for ${optimalCadenceMin}-${optimalCadenceMax} spm
3. Lean slightly forward from ankles (not waist)
4. Imagine running on hot coals \u2014 minimize ground contact time
5. Arms drive the cadence \u2014 quicker arms = quicker feet`;
  } else if (strideZone === "UNDERSTRIDING") {
    zoneAnalysis = `UNDERSTRIDING DETECTED: Cadence ${cadence} spm with stride length ${strideCm}cm \u2014 their cadence is too low for their pace of ${currentPace}/km.

Understriding means they're shuffling with too-short steps at a low turnover rate. This:
- Wastes energy on vertical oscillation (bouncing up and down)
- Reduces forward propulsion
- Can cause calf and Achilles fatigue

The runner needs to find a more efficient cadence. Provide coaching on HOW to increase cadence:
1. Use a mental metronome \u2014 aim for ${optimalCadenceMin}-${optimalCadenceMax} steps per minute
2. Push off more powerfully from the balls of their feet
3. Drive knees forward (not up) with each stride
4. Keep arms pumping actively \u2014 they set the rhythm
5. Think "smooth and powerful" not "short and choppy"`;
  } else {
    zoneAnalysis = `Cadence ${cadence} spm with stride ${strideCm}cm is in the optimal zone. Brief positive reinforcement.`;
  }
  const prompt = `You are ${coachName}, an AI running coach with a ${coachTone} style.

${zoneAnalysis}

Runner Data:
- Current cadence: ${cadence} spm
- Stride length: ${strideCm}cm (optimal range: ${optMinCm}-${optMaxCm}cm)
- Current pace: ${currentPace}/km
- Distance: ${distance.toFixed(1)}km, time: ${timeMin} minutes
${heartRate ? `- Heart rate: ${heartRate} bpm` : ""}
${physicalContext}

Give a coaching message (3-4 sentences). First, tell them their cadence and stride length. Then explain what ${strideZone === "OPTIMAL" ? "this means (good form!)" : `${strideZone.toLowerCase()} means and why it matters`}. Finally, give ${strideZone === "OPTIMAL" ? "brief encouragement to maintain it" : "2-3 specific, actionable technique tips they can apply RIGHT NOW during this run"}. Be specific with numbers. No emojis.`;
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You are ${coachName}, an elite ${coachTone} running biomechanics coach. You specialize in cadence optimization and stride analysis. Give specific, actionable technique coaching \u2014 tell the runner exactly what to change and how. Reference actual numbers. No emojis. Keep it to 3-4 sentences that can be spoken in under 20 seconds.` },
      { role: "user", content: prompt }
    ],
    max_tokens: 200,
    temperature: 0.7
  });
  return completion.choices[0].message.content || `Your cadence is ${cadence} steps per minute with a stride length of ${strideCm}cm. ${strideZone === "OVERSTRIDING" ? "Try shortening your stride and landing under your hips." : strideZone === "UNDERSTRIDING" ? "Try picking up your cadence with quicker, more powerful steps." : "Great form, keep it up!"}`;
}
async function generatePreRunSummary(routeData, weatherData) {
  const prompt = `Generate a pre-run coaching summary for this route:
Route:
- Distance: ${routeData.distance}km
- Elevation Gain: ${routeData.elevationGain || 0}m
- Difficulty: ${routeData.difficulty}
- Terrain: ${routeData.terrainType || "mixed"}

Weather:
- Temperature: ${weatherData?.current?.temperature || "N/A"}\xB0C
- Conditions: ${weatherData?.current?.condition || "N/A"}
- Wind: ${weatherData?.current?.windSpeed || 0} km/h

Provide response as JSON with: tips (array of 3-4 coaching tips), warnings (array of any concerns), suggestedPace (string), hydrationAdvice (string), warmupSuggestion (string)`;
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an expert running coach providing pre-run advice. Respond only with valid JSON." },
      { role: "user", content: prompt }
    ],
    max_tokens: 400,
    temperature: 0.7
  });
  try {
    const content = completion.choices[0].message.content || "{}";
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
  } catch {
    return {
      tips: ["Start at an easy pace", "Focus on your breathing", "Enjoy the run!"],
      warnings: [],
      suggestedPace: "comfortable",
      hydrationAdvice: "Stay hydrated",
      warmupSuggestion: "5 minutes of light jogging"
    };
  }
}
async function getElevationCoaching(elevationData) {
  const prompt = `As a running coach, give a brief (1-2 sentences) tip for this terrain:
- Current: ${elevationData.change} (${Math.abs(elevationData.grade)}% grade)
- Upcoming: ${elevationData.upcoming || "similar terrain"}`;
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an encouraging running coach. Keep responses brief and actionable." },
      { role: "user", content: prompt }
    ],
    max_tokens: 60,
    temperature: 0.8
  });
  return completion.choices[0].message.content || "Adjust your effort for the terrain!";
}
async function generateTTS(text2, voice = "alloy") {
  const response = await openai2.audio.speech.create({
    model: "tts-1",
    voice,
    input: text2
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}
function buildCoachingSystemPrompt(context) {
  let prompt = `You are an AI running coach. Be encouraging, brief (1-2 sentences max), and specific to the runner's current situation.`;
  if (context.coachTone) {
    prompt += ` Your tone should be ${context.coachTone}.`;
    prompt += ` ${toneDirective(context.coachTone)}`;
  }
  const currentPhase = context.phase || (context.distance !== void 0 ? determinePhase(context.distance, context.totalDistance || null) : "generic");
  prompt += `

${COACHING_PHASE_PROMPT}`;
  prompt += `

CURRENT PHASE: ${currentPhase.toUpperCase()}`;
  if (context.distance !== void 0) {
    prompt += ` (Runner is at ${context.distance.toFixed(2)}km`;
    if (context.totalDistance) {
      const percent = context.distance / context.totalDistance * 100;
      prompt += ` of ${context.totalDistance.toFixed(1)}km total, ${percent.toFixed(0)}% complete`;
    }
    prompt += ")";
  }
  if (context.elevationChange) {
    prompt += ` The runner is currently on ${context.elevationChange} terrain.`;
  }
  if (context.isStruggling && currentPhase === "late") {
    prompt += " The runner appears to be struggling. Be extra supportive with fatigue-appropriate advice.";
  } else if (context.isStruggling) {
    prompt += " The runner appears to be struggling. Be supportive but remember phase-appropriate advice only.";
  }
  if (context.weather?.current?.temperature) {
    prompt += ` Current temperature: ${context.weather.current.temperature}\xB0C.`;
  }
  if (context.heartRate) {
    const maxHR = 190;
    const hrPercent = context.heartRate / maxHR * 100;
    let zone = "Zone 1 (Recovery)";
    let zoneAdvice = "easy effort";
    if (hrPercent >= 90) {
      zone = "Zone 5 (Maximum)";
      zoneAdvice = "maximum effort - only sustainable briefly";
    } else if (hrPercent >= 80) {
      zone = "Zone 4 (Threshold)";
      zoneAdvice = "high intensity - building speed endurance";
    } else if (hrPercent >= 70) {
      zone = "Zone 3 (Tempo)";
      zoneAdvice = "moderate-hard effort - building aerobic capacity";
    } else if (hrPercent >= 60) {
      zone = "Zone 2 (Aerobic)";
      zoneAdvice = "comfortable effort - fat burning zone";
    }
    prompt += ` Current heart rate: ${context.heartRate} BPM (${zone}, ${zoneAdvice}).`;
    if (hrPercent >= 90) {
      prompt += " The runner may need to slow down to recover.";
    } else if (hrPercent >= 85) {
      prompt += " Heart rate is elevated - monitor effort level.";
    }
  }
  return prompt;
}
async function generateRouteOptions(params) {
  const { startLat, startLng, distance, difficulty, activityType = "run" } = params;
  const prompt = `Generate 3 different running route options starting from coordinates (${startLat}, ${startLng}).
Target distance: ${distance}km
Difficulty: ${difficulty}
Activity: ${activityType}

For each route, provide:
1. A creative name
2. 3-5 waypoint coordinates that create a loop back to start
3. Estimated elevation gain (in meters)
4. Terrain description (trail, road, mixed, park)
5. Brief description

Respond in JSON format:
{
  "routes": [
    {
      "name": "Route Name",
      "waypoints": [{"lat": 51.5, "lng": -0.1}, ...],
      "elevationGain": 50,
      "terrainType": "mixed",
      "description": "Brief description"
    }
  ]
}`;
  try {
    const completion = await openai2.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a running route planner. Generate realistic waypoints near the starting location that create approximately the requested distance as a loop. Respond only with valid JSON." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1e3,
      temperature: 0.8
    });
    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
    const generatedRoutes = [];
    for (let i = 0; i < (parsed.routes || []).length; i++) {
      const route = parsed.routes[i];
      const waypoints = route.waypoints || [];
      const directionsData = await getGoogleDirections(startLat, startLng, waypoints);
      const routeId = `route_${Date.now()}_${i}`;
      generatedRoutes.push({
        id: routeId,
        name: route.name || `Route ${i + 1}`,
        distance: directionsData.distance || distance,
        difficulty,
        startLat,
        startLng,
        endLat: startLat,
        endLng: startLng,
        waypoints,
        elevation: route.elevationGain || 0,
        elevationGain: route.elevationGain || 0,
        estimatedTime: Math.round((directionsData.distance || distance) * (activityType === "walk" ? 12 : 6)),
        terrainType: route.terrainType || "mixed",
        polyline: directionsData.polyline || "",
        description: route.description || ""
      });
    }
    return generatedRoutes;
  } catch (error) {
    console.error("Route generation error:", error);
    return [{
      id: `route_${Date.now()}`,
      name: "Quick Route",
      distance,
      difficulty,
      startLat,
      startLng,
      endLat: startLat,
      endLng: startLng,
      waypoints: [],
      elevation: 0,
      elevationGain: 0,
      estimatedTime: Math.round(distance * 6),
      terrainType: "road",
      polyline: "",
      description: "A simple out-and-back route"
    }];
  }
}
async function getGoogleDirections(startLat, startLng, waypoints) {
  if (!GOOGLE_MAPS_API_KEY || waypoints.length === 0) {
    return { distance: 0, polyline: "" };
  }
  try {
    const origin = `${startLat},${startLng}`;
    const destination = origin;
    const waypointStr = waypoints.map((w) => `${w.lat},${w.lng}`).join("|");
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${waypointStr}&mode=walking&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const totalDistance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0) / 1e3;
      return {
        distance: Math.round(totalDistance * 10) / 10,
        polyline: route.overview_polyline?.points || ""
      };
    }
  } catch (error) {
    console.error("Google Directions API error:", error);
  }
  return { distance: 0, polyline: "" };
}
function analyzePositiveWeatherConditions(weather, weatherImpact) {
  if (!weatherImpact || !weatherImpact.hasEnoughData || !weatherImpact.insights?.bestCondition) {
    return "";
  }
  const insights = weatherImpact.insights;
  const currentHour = (/* @__PURE__ */ new Date()).getHours();
  let currentTimeOfDay = "";
  if (currentHour >= 5 && currentHour < 9) currentTimeOfDay = "Morning";
  else if (currentHour >= 9 && currentHour < 12) currentTimeOfDay = "Late Morning";
  else if (currentHour >= 12 && currentHour < 14) currentTimeOfDay = "Midday";
  else if (currentHour >= 14 && currentTimeOfDay < 17) currentTimeOfDay = "Afternoon";
  else if (currentHour >= 17 && currentHour < 20) currentTimeOfDay = "Evening";
  else currentTimeOfDay = "Night";
  const currentTemp = weather?.temp || weather?.temperature;
  let tempMatch = "";
  if (currentTemp && weatherImpact.temperatureAnalysis) {
    for (const bucket of weatherImpact.temperatureAnalysis) {
      if (bucket.paceVsAvg !== null && bucket.paceVsAvg < -5 && bucket.label) {
        const range = bucket.range.toLowerCase();
        if (range.includes("-") && range.includes("\xB0c")) {
          const parts = range.replace("\xB0c", "").split("-");
          if (parts.length === 2) {
            const min = parseFloat(parts[0].trim());
            const max = parseFloat(parts[1].trim());
            if (currentTemp >= min && currentTemp <= max) {
              tempMatch = `${bucket.label} (${bucket.paceVsAvg.toFixed(0)}% faster)`;
              break;
            }
          }
        }
      }
    }
  }
  let conditionMatch = "";
  if (weatherImpact.conditionAnalysis) {
    const currentCondition = (weather?.condition || "").toLowerCase();
    for (const cond of weatherImpact.conditionAnalysis) {
      if (cond.paceVsAvg < -5 && cond.condition.toLowerCase().includes(currentCondition.split(" ")[0])) {
        conditionMatch = `${cond.condition} (${cond.paceVsAvg.toFixed(0)}% faster)`;
        break;
      }
    }
  }
  let timeMatch = "";
  if (weatherImpact.timeOfDayAnalysis) {
    for (const bucket of weatherImpact.timeOfDayAnalysis) {
      if (bucket.paceVsAvg !== null && bucket.paceVsAvg < -5 && bucket.label && bucket.label.toLowerCase().includes(currentTimeOfDay.toLowerCase())) {
        timeMatch = `${bucket.label} (${bucket.paceVsAvg.toFixed(0)}% faster)`;
        break;
      }
    }
  }
  const matches = [];
  if (tempMatch) matches.push(tempMatch);
  if (conditionMatch) matches.push(conditionMatch);
  if (timeMatch) matches.push(timeMatch);
  if (matches.length > 0) {
    return `
\u2713 WEATHER ADVANTAGE: Based on your historical data, you're a strong performer in these conditions! ${matches.join(", ")}. Make it count!`;
  }
  return "";
}
async function generateWellnessAwarePreRunBriefing(params) {
  const { distance, elevationGain, difficulty, activityType, weather, coachName, coachTone, wellness, hasRoute = true, targetTime, targetPace, weatherImpact } = params;
  const weatherAdvantage = analyzePositiveWeatherConditions(weather, weatherImpact);
  const weatherInfo = weather ? `Weather: ${weather.temp || weather.temperature || "N/A"}\xB0C, ${weather.condition || "clear"}, wind ${weather.windSpeed || 0} km/h.` : "Weather data unavailable.";
  let routeInfo = "";
  if (hasRoute === true) {
    routeInfo = `
ROUTE:
- Distance: ${distance?.toFixed(1) || "?"}km
- Difficulty: ${difficulty}
- Elevation gain: ${Math.round(elevationGain || 0)}m
- Terrain: ${elevationGain > 100 ? "hilly" : elevationGain > 50 ? "rolling" : "generally flat"}`;
  } else {
    routeInfo = `
RUN (No planned route):
- Distance: ${distance?.toFixed(1) || "?"}km
- Type: Free run / Training run`;
  }
  if (targetTime && targetPace) {
    const targetMinutes = Math.floor(targetTime / 60);
    const targetSeconds = targetTime % 60;
    routeInfo += `
- Target: Complete ${distance?.toFixed(1) || "?"}km in ${targetMinutes}:${targetSeconds.toString().padStart(2, "0")} (target pace: ${targetPace}/km)`;
  }
  let wellnessContext = "";
  if (wellness.sleepHours !== void 0) {
    wellnessContext += `
- Sleep: ${wellness.sleepHours.toFixed(1)} hours (${wellness.sleepQuality || "N/A"})`;
    if (wellness.sleepScore) wellnessContext += `, score: ${wellness.sleepScore}/100`;
  }
  if (wellness.bodyBattery !== void 0) {
    wellnessContext += `
- Body Battery: ${wellness.bodyBattery}/100`;
  }
  if (wellness.stressLevel !== void 0) {
    wellnessContext += `
- Stress: ${wellness.stressQualifier || "N/A"} (${wellness.stressLevel}/100)`;
  }
  if (wellness.hrvStatus) {
    wellnessContext += `
- HRV Status: ${wellness.hrvStatus}`;
    if (wellness.hrvFeedback) wellnessContext += ` - ${wellness.hrvFeedback}`;
  }
  if (wellness.restingHeartRate) {
    wellnessContext += `
- Resting HR: ${wellness.restingHeartRate} bpm`;
  }
  if (wellness.readinessScore !== void 0) {
    wellnessContext += `
- Overall Readiness: ${wellness.readinessScore}/100`;
  }
  let readinessGuidance = "";
  if (wellness.readinessScore !== void 0) {
    const score = wellness.readinessScore;
    if (score >= 90) {
      readinessGuidance = `
READINESS COACHING GUIDANCE (use this to personalize the readinessInsight):
- Score 90-100: They are fully charged and primed for an excellent run! Encourage them to push for a strong performance. Suggest they can aim for their target pace or even slightly faster if feeling great.
- Example: "Your body is fully recovered and ready to crush it! This is a great day to chase a personal best or really push the pace."`;
    } else if (score >= 70) {
      readinessGuidance = `
READINESS COACHING GUIDANCE (use this to personalize the readinessInsight):
- Score 70-89: They are in good shape for a solid run. Encourage balanced pacing - they can push but should stay within themselves.
- Example: "You're in good shape today. Great conditions for a quality run. Stick to your target pace and you'll have a strong session."`;
    } else if (score >= 50) {
      readinessGuidance = `
READINESS COACHING GUIDANCE (use this to personalize the readinessInsight):
- Score 50-69: They are looking a bit tired or under-recovered. Recommend starting slow and easing into the run. Focus on feeling good rather than pace.
- Example: "Your body is showing some fatigue today. Let's start at an easy pace and build into it. Don't worry about pace - focus on how you feel."`;
    } else {
      readinessGuidance = `
READINESS COACHING GUIDANCE (use this to personalize the readinessInsight):
- Score below 50: They are significantly under-recovered. Recommend a very easy, recovery-focused run or considering a rest day.
- Example: "Your body needs recovery today. Consider an easy walk or very light jog, or even a rest day. Listen to your body - there's no shame in taking it easy."`;
    }
  }
  const prompt = `You are ${coachName}, an AI running coach. Your coaching style is ${coachTone}.

Generate a personalized pre-run briefing for an upcoming run.
${routeInfo}
- ${weatherInfo}
${weatherAdvantage}

CURRENT WELLNESS STATUS (from Garmin):${wellnessContext || "\n- No wellness data available"}
${readinessGuidance}

Based on this data, provide:
1. "briefing": A personalized pre-run briefing (4-5 sentences). You MUST include these specific details:
   - The planned distance: "${distance?.toFixed(1) || "5.0"}km"
   ${weather && weather.temp !== void 0 ? `- The weather: "${weather.temp || weather.temperature}\xB0C and ${weather.condition || "clear"}"` : "- Weather data is not available, do not mention weather"}
   ${targetPace ? `- Their target pace: "${targetPace}/km"` : "- No target pace set, suggest they run at a comfortable effort"}
   ${targetTime ? `- Their target time: "${Math.floor((targetTime || 0) / 60)}:${((targetTime || 0) % 60).toString().padStart(2, "0")}"` : ""}
   - Their wellness/recovery state if Garmin data is available above
   ${weatherAdvantage ? "- The weather advantage noted above" : ""}
   Include the actual numbers - do NOT give a vague or generic briefing.
2. "intensityAdvice": Specific intensity advice. ${targetPace ? `They are targeting ${targetPace}/km - say whether to stick to it, go easier, or push harder based on their wellness.` : "Suggest an appropriate effort level based on their wellness."}
3. "warnings": Array of any warnings if their wellness indicators suggest caution. Empty array if none.
4. "readinessInsight": How their body data affects today's run.

CRITICAL RULES:
- For runs marked "RUN (No planned route)" - do NOT mention terrain, elevation, hills, flat, or any route characteristics.
- Include the specific distance, pace, and time numbers in the briefing text. The runner wants to hear their actual plan confirmed.

Respond as JSON with fields: briefing, intensityAdvice, warnings (array), readinessInsight`;
  try {
    const completion = await openai2.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are ${coachName}, a ${coachTone} running coach who uses biometric data for personalized coaching. Respond only with valid JSON. ${toneDirective(coachTone)}` },
        { role: "user", content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.7
    });
    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
    return {
      briefing: parsed.briefing || "Ready for your run! Let's get started.",
      intensityAdvice: parsed.intensityAdvice || "Listen to your body today.",
      warnings: parsed.warnings || [],
      readinessInsight: parsed.readinessInsight || "Your body is ready for this run.",
      weatherAdvantage: weatherAdvantage || void 0
    };
  } catch (error) {
    console.error("Error generating wellness-aware briefing:", error);
    return {
      briefing: "Ready for your run! Take it easy at the start and find your rhythm.",
      intensityAdvice: "Start conservatively and adjust based on how you feel.",
      warnings: [],
      readinessInsight: "Listen to your body and adjust intensity as needed.",
      weatherAdvantage: weatherAdvantage || void 0
    };
  }
}
async function getWellnessAwareCoachingResponse(message, context) {
  const systemPrompt = buildEnhancedCoachingSystemPrompt(context);
  const completion = await openai2.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ],
    max_tokens: 150,
    temperature: 0.7
  });
  return completion.choices[0].message.content || "Keep going, you're doing great!";
}
function buildEnhancedCoachingSystemPrompt(context) {
  let prompt = buildCoachingSystemPrompt(context);
  if (context.wellness) {
    const w = context.wellness;
    let wellnessInfo = "\n\nRUNNER WELLNESS CONTEXT (from Garmin):";
    if (w.readinessScore !== void 0) {
      wellnessInfo += `
- Today's readiness: ${w.readinessScore}/100`;
    }
    if (w.bodyBattery !== void 0) {
      wellnessInfo += `
- Body Battery: ${w.bodyBattery}/100`;
    }
    if (w.sleepQuality) {
      wellnessInfo += `
- Last night's sleep: ${w.sleepQuality}`;
    }
    if (w.stressQualifier) {
      wellnessInfo += `
- Current stress: ${w.stressQualifier}`;
    }
    if (w.hrvStatus) {
      wellnessInfo += `
- HRV status: ${w.hrvStatus}`;
    }
    prompt += wellnessInfo;
    prompt += "\n\nUse this wellness data to personalize your coaching. If readiness is low, encourage an easier effort. If Body Battery is high, they may be able to push harder.";
  }
  if (context.targetHeartRateZone) {
    prompt += `

TARGET HR ZONE: Zone ${context.targetHeartRateZone}. `;
    switch (context.targetHeartRateZone) {
      case 1:
        prompt += "Recovery zone - keep it very easy.";
        break;
      case 2:
        prompt += "Aerobic zone - conversational pace.";
        break;
      case 3:
        prompt += "Tempo zone - comfortably hard.";
        break;
      case 4:
        prompt += "Threshold zone - hard but sustainable.";
        break;
      case 5:
        prompt += "Maximum zone - very hard, short intervals.";
        break;
    }
    if (context.heartRate) {
      const currentZone = getHeartRateZone(context.heartRate, 220 - 30);
      if (currentZone > context.targetHeartRateZone) {
        prompt += " Runner is ABOVE target zone - encourage them to slow down.";
      } else if (currentZone < context.targetHeartRateZone) {
        prompt += " Runner is BELOW target zone - they can push a bit harder if they feel good.";
      }
    }
  }
  return prompt;
}
function getHeartRateZoneNumber(hr, maxHr) {
  const percent = hr / maxHr * 100;
  if (percent < 60) return 1;
  if (percent < 70) return 2;
  if (percent < 80) return 3;
  if (percent < 90) return 4;
  return 5;
}
async function generateHeartRateCoaching(params) {
  const { currentHR, avgHR, maxHR, targetZone, elapsedMinutes, coachName, coachTone, wellness } = params;
  const currentZone = getHeartRateZoneNumber(currentHR, maxHR);
  const percentMax = Math.round(currentHR / maxHR * 100);
  const zoneNames = ["", "Recovery", "Aerobic", "Tempo", "Threshold", "Maximum"];
  let wellnessContext = "";
  if (wellness) {
    if (wellness.bodyBattery !== void 0 && wellness.bodyBattery < 30) {
      wellnessContext = "Their Body Battery is low today. ";
    }
    if (wellness.sleepQuality === "Poor" || wellness.sleepQuality === "Very Poor") {
      wellnessContext += "They had poor sleep last night. ";
    }
    if (wellness.hrvStatus === "LOW") {
      wellnessContext += "HRV is below baseline. ";
    }
  }
  const prompt = `You are ${coachName}, a ${coachTone} running coach giving real-time heart rate guidance.

Current stats (${elapsedMinutes} minutes into run):
- Heart Rate: ${currentHR} bpm (${percentMax}% of max)
- Current Zone: Zone ${currentZone} (${zoneNames[currentZone]})
- Average HR: ${avgHR} bpm
${targetZone ? `- Target Zone: Zone ${targetZone} (${zoneNames[targetZone]})` : ""}
${wellnessContext ? `
Wellness context: ${wellnessContext}` : ""}

Give a brief (1-2 sentences) heart rate coaching tip. ${targetZone && currentZone !== targetZone ? currentZone > targetZone ? "They need to slow down to hit their target zone." : "They can pick up the pace if feeling good." : ""}`;
  try {
    const completion = await openai2.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are ${coachName}, giving brief real-time HR coaching. Keep it to 1-2 short sentences. ${toneDirective(coachTone)}` },
        { role: "user", content: prompt }
      ],
      max_tokens: 60,
      temperature: 0.7
    });
    return completion.choices[0].message.content || `Heart rate at ${currentHR}, Zone ${currentZone}. Keep it steady!`;
  } catch {
    return `Heart rate at ${currentHR} bpm, Zone ${currentZone}. ${currentZone > 3 ? "Consider easing up." : "Looking good!"}`;
  }
}
async function generateComprehensiveRunAnalysis(params) {
  const { runData, garminActivity, wellness, previousRuns, userProfile, coachName, coachTone } = params;
  let prompt = `You are ${coachName}, an expert AI running coach with a ${coachTone} style. 
Analyze this run comprehensively using all available data from the runner's Garmin device and wellness metrics.

## RUN DATA:
- Distance: ${runData.distanceInMeters || runData.distance || garminActivity?.distanceInMeters ? ((runData.distanceInMeters || runData.distance || garminActivity?.distanceInMeters || 0) / 1e3).toFixed(2) : "?"}km
- Duration: ${runData.duration ? Math.floor(runData.duration / 60) : garminActivity?.durationInSeconds ? Math.floor(garminActivity.durationInSeconds / 60) : "?"} minutes
- Average Pace: ${runData.avgPace || (garminActivity?.averagePace ? `${Math.floor(garminActivity.averagePace)}:${Math.floor(garminActivity.averagePace % 1 * 60).toString().padStart(2, "0")}` : "N/A")}/km
- Activity Type: ${runData.activityType || garminActivity?.activityType || "Running"}
- Elevation Gain: ${runData.elevationGain || garminActivity?.elevationGain || 0}m
- Elevation Loss: ${runData.elevationLoss || garminActivity?.elevationLoss || 0}m
`;
  if (runData.targetTime || runData.targetDistance) {
    const targetMinutes = runData.targetTime ? Math.round(runData.targetTime / 6e4) : null;
    prompt += `- Target Distance: ${runData.targetDistance ? `${runData.targetDistance}km` : "N/A"}
`;
    prompt += `- Target Time: ${targetMinutes ? `${targetMinutes} minutes` : "N/A"}
`;
    if (typeof runData.wasTargetAchieved === "boolean") {
      prompt += `- Target Achieved: ${runData.wasTargetAchieved ? "Yes" : "No"}
`;
    }
  }
  if (garminActivity) {
    prompt += `
## GARMIN ACTIVITY METRICS:
`;
    if (garminActivity.averageHeartRate) {
      prompt += `- Average Heart Rate: ${garminActivity.averageHeartRate} bpm
`;
    }
    if (garminActivity.maxHeartRate) {
      prompt += `- Max Heart Rate: ${garminActivity.maxHeartRate} bpm
`;
    }
    if (garminActivity.averageCadence) {
      prompt += `- Average Cadence: ${Math.round(garminActivity.averageCadence)} spm
`;
    }
    if (garminActivity.averageStrideLength) {
      prompt += `- Average Stride Length: ${(garminActivity.averageStrideLength * 100).toFixed(0)}cm
`;
    }
    if (garminActivity.groundContactTime) {
      prompt += `- Ground Contact Time: ${Math.round(garminActivity.groundContactTime)}ms
`;
    }
    if (garminActivity.verticalOscillation) {
      prompt += `- Vertical Oscillation: ${garminActivity.verticalOscillation.toFixed(1)}cm
`;
    }
    if (garminActivity.verticalRatio) {
      prompt += `- Vertical Ratio: ${garminActivity.verticalRatio.toFixed(1)}%
`;
    }
    if (garminActivity.averagePower) {
      prompt += `- Average Running Power: ${Math.round(garminActivity.averagePower)}W
`;
    }
    if (garminActivity.aerobicTrainingEffect) {
      prompt += `- Aerobic Training Effect: ${garminActivity.aerobicTrainingEffect.toFixed(1)}/5.0
`;
    }
    if (garminActivity.anaerobicTrainingEffect) {
      prompt += `- Anaerobic Training Effect: ${garminActivity.anaerobicTrainingEffect.toFixed(1)}/5.0
`;
    }
    if (garminActivity.vo2Max) {
      prompt += `- Estimated VO2 Max: ${garminActivity.vo2Max.toFixed(0)} ml/kg/min
`;
    }
    if (garminActivity.recoveryTime) {
      prompt += `- Recommended Recovery: ${garminActivity.recoveryTime} hours
`;
    }
    if (garminActivity.activeKilocalories) {
      prompt += `- Active Calories: ${garminActivity.activeKilocalories} kcal
`;
    }
  }
  if (wellness) {
    prompt += `
## PRE-RUN WELLNESS STATE (from Garmin):
`;
    if (wellness.totalSleepSeconds) {
      const sleepHours = wellness.totalSleepSeconds / 3600;
      prompt += `- Sleep: ${sleepHours.toFixed(1)} hours`;
      if (wellness.sleepScore) prompt += ` (score: ${wellness.sleepScore}/100)`;
      if (wellness.sleepQuality) prompt += ` - ${wellness.sleepQuality}`;
      prompt += "\n";
      if (wellness.deepSleepSeconds && wellness.remSleepSeconds) {
        const deepHours = wellness.deepSleepSeconds / 3600;
        const remHours = wellness.remSleepSeconds / 3600;
        prompt += `  - Deep sleep: ${deepHours.toFixed(1)}h, REM: ${remHours.toFixed(1)}h
`;
      }
    }
    if (wellness.bodyBatteryCurrent !== void 0) {
      prompt += `- Body Battery: ${wellness.bodyBatteryCurrent}/100`;
      if (wellness.bodyBatteryHigh && wellness.bodyBatteryLow) {
        prompt += ` (range today: ${wellness.bodyBatteryLow}-${wellness.bodyBatteryHigh})`;
      }
      prompt += "\n";
    }
    if (wellness.averageStressLevel !== void 0) {
      prompt += `- Average Stress Level: ${wellness.averageStressLevel}/100
`;
    }
    if (wellness.hrvStatus) {
      prompt += `- HRV Status: ${wellness.hrvStatus}`;
      if (wellness.hrvLastNightAvg) prompt += ` (last night avg: ${wellness.hrvLastNightAvg.toFixed(0)}ms)`;
      prompt += "\n";
    }
    if (wellness.restingHeartRate) {
      prompt += `- Resting Heart Rate: ${wellness.restingHeartRate} bpm
`;
    }
    if (wellness.readinessScore !== void 0) {
      prompt += `- Body Readiness Score: ${wellness.readinessScore}/100
`;
    }
    if (wellness.avgSpO2) {
      prompt += `- Blood Oxygen (SpO2): ${wellness.avgSpO2}%
`;
    }
    if (wellness.steps) {
      prompt += `- Steps before run: ${wellness.steps}
`;
    }
  }
  if (previousRuns && previousRuns.length > 0) {
    prompt += `
## RECENT RUN HISTORY (last ${previousRuns.length} runs):
`;
    previousRuns.slice(0, 5).forEach((run, i) => {
      prompt += `${i + 1}. ${run.distance?.toFixed(1) || "?"}km at ${run.avgPace || "N/A"}/km`;
      if (run.avgHeartRate) prompt += `, ${run.avgHeartRate}bpm`;
      prompt += "\n";
    });
  }
  prompt += `
## ANALYSIS REQUIRED:
Based on ALL the data above, provide a comprehensive JSON analysis with these fields:
{
  "summary": "2-3 sentence personalized summary of the run",
  "performanceScore": <1-100 based on effort, conditions, and wellness>,
  "highlights": ["3-5 positive aspects of the run"],
  "struggles": ["any challenges or areas of concern"],
  "personalBests": ["any notable achievements or improvements"],
  "improvementTips": ["3-4 specific, actionable tips for next time"],
  "trainingLoadAssessment": "Assessment of training stimulus based on training effect",
  "recoveryAdvice": "Specific recovery recommendations based on wellness and effort",
  "nextRunSuggestion": "What type of run to do next based on recovery needs",
  "wellnessImpact": "How their wellness state affected performance",
  "technicalAnalysis": {
    "paceAnalysis": "Pace consistency and efficiency analysis",
    "heartRateAnalysis": "HR zones and cardiovascular response",
    "cadenceAnalysis": "Step rate assessment",
    "runningDynamics": "Assessment of stride, ground contact, oscillation",
    "elevationPerformance": "How they handled hills"
  },
  "garminInsights": {
    "trainingEffect": "Interpretation of aerobic/anaerobic training effect",
    "vo2MaxTrend": "VO2 max context and what it means",
    "recoveryTime": "Why recovery time is what it is"
  }
}

Be specific, use the actual numbers from the data, and provide actionable insights.`;
  try {
    const completion = await openai2.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are ${coachName}, an expert running coach with deep knowledge of exercise physiology and Garmin metrics. Provide detailed, personalized analysis using all available biometric data. Respond only with valid JSON. ${toneDirective(coachTone)}`
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.7
    });
    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
    return {
      summary: parsed.summary || "Great run today!",
      performanceScore: parsed.performanceScore || 75,
      highlights: parsed.highlights || ["Completed your run!"],
      struggles: parsed.struggles || [],
      personalBests: parsed.personalBests || [],
      improvementTips: parsed.improvementTips || ["Keep up the great work!"],
      trainingLoadAssessment: parsed.trainingLoadAssessment || "Moderate training load.",
      recoveryAdvice: parsed.recoveryAdvice || "Get adequate rest and hydration.",
      nextRunSuggestion: parsed.nextRunSuggestion || "An easy recovery run in 24-48 hours.",
      wellnessImpact: parsed.wellnessImpact || "Your wellness state supported this effort.",
      technicalAnalysis: {
        paceAnalysis: parsed.technicalAnalysis?.paceAnalysis || "Pace data not available.",
        heartRateAnalysis: parsed.technicalAnalysis?.heartRateAnalysis || "Heart rate data not available.",
        cadenceAnalysis: parsed.technicalAnalysis?.cadenceAnalysis || "Cadence data not available.",
        runningDynamics: parsed.technicalAnalysis?.runningDynamics || "Running dynamics not available.",
        elevationPerformance: parsed.technicalAnalysis?.elevationPerformance || "Elevation data not available."
      },
      garminInsights: {
        trainingEffect: parsed.garminInsights?.trainingEffect || "Training effect data not available.",
        vo2MaxTrend: parsed.garminInsights?.vo2MaxTrend || "VO2 max data not available.",
        recoveryTime: parsed.garminInsights?.recoveryTime || "Recovery time estimate not available."
      }
    };
  } catch (error) {
    console.error("Error generating comprehensive run analysis:", error);
    return {
      summary: "Great effort on your run today!",
      performanceScore: 70,
      highlights: ["Completed your run", "Stayed consistent"],
      struggles: [],
      personalBests: [],
      improvementTips: ["Keep training consistently", "Focus on recovery"],
      trainingLoadAssessment: "Training load recorded.",
      recoveryAdvice: "Rest well and stay hydrated.",
      nextRunSuggestion: "Take a rest day or do an easy run.",
      wellnessImpact: "Unable to assess wellness impact.",
      technicalAnalysis: {
        paceAnalysis: "Analysis unavailable.",
        heartRateAnalysis: "Analysis unavailable.",
        cadenceAnalysis: "Analysis unavailable.",
        runningDynamics: "Analysis unavailable.",
        elevationPerformance: "Analysis unavailable."
      },
      garminInsights: {
        trainingEffect: "Data unavailable.",
        vo2MaxTrend: "Data unavailable.",
        recoveryTime: "Data unavailable."
      }
    };
  }
}
var openai2, GOOGLE_MAPS_API_KEY, normalizeCoachTone, toneDirective;
var init_ai_service = __esm({
  "server/ai-service.ts"() {
    "use strict";
    init_coaching_statements();
    openai2 = new OpenAI2({ apiKey: process.env.OPENAI_API_KEY });
    GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    normalizeCoachTone = (tone) => {
      if (!tone) return "energetic";
      return tone.trim().toLowerCase();
    };
    toneDirective = (tone) => {
      const normalized = normalizeCoachTone(tone);
      switch (normalized) {
        case "energetic":
          return "Sound lively and motivating. Use short, punchy sentences. Vary phrasing.";
        case "motivational":
        case "inspirational":
          return "Sound inspiring and uplifting. Emphasize belief, progress, and resilience.";
        case "supportive":
        case "encouraging":
          return "Warm, reassuring, and steady. Encourage without pressure.";
        case "calm":
          return "Calm, steady, and grounded. Use soothing language.";
        case "professional":
        case "factual":
        case "instructive":
          return "Clear, concise, and practical. Focus on actionable guidance.";
        case "abrupt":
          return "Direct and concise. Keep it short and decisive.";
        case "friendly":
          return "Upbeat and personable. Use friendly, encouraging phrasing.";
        default:
          return "Encouraging and positive with varied phrasing.";
      }
    };
  }
});

// server/route-generation.ts
var route_generation_exports = {};
__export(route_generation_exports, {
  assignDifficulty: () => assignDifficulty,
  calculateAngularSpread: () => calculateAngularSpread,
  calculateBacktrackRatio: () => calculateBacktrackRatio2,
  calculateCircuitScore: () => calculateCircuitScore,
  calculateRouteOverlap: () => calculateRouteOverlap,
  containsMajorRoads: () => containsMajorRoads,
  countDeadEnds: () => countDeadEnds,
  decodePolyline: () => decodePolyline,
  generateRouteOptions: () => generateRouteOptions2,
  generateTemplateWaypoints: () => generateTemplateWaypoints,
  getDistanceKm: () => getDistanceKm2,
  getGeometricTemplates: () => getGeometricTemplates,
  getRouteFootprint: () => getRouteFootprint,
  isGenuineCircuit: () => isGenuineCircuit,
  projectPoint: () => projectPoint
});
import polyline from "@mapbox/polyline";
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}
function toDegrees(radians) {
  return radians * 180 / Math.PI;
}
function getDistanceKm2(p1, p2) {
  const R = 6371;
  const dLat = toRadians(p2.lat - p1.lat);
  const dLng = toRadians(p2.lng - p1.lng);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRadians(p1.lat)) * Math.cos(toRadians(p2.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function decodePolyline(encoded) {
  try {
    const decoded = polyline.decode(encoded);
    return decoded.map(([lat, lng]) => ({ lat, lng }));
  } catch (e) {
    return [];
  }
}
function projectPoint(lat, lng, bearingDegrees, distanceKm) {
  const R = 6371;
  const lat1 = toRadians(lat);
  const lng1 = toRadians(lng);
  const bearing = toRadians(bearingDegrees);
  const d = distanceKm / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: toDegrees(lat2), lng: toDegrees(lng2) };
}
function getRouteFootprint(encodedPolyline) {
  const points = decodePolyline(encodedPolyline);
  if (points.length < 2) return 0;
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return getDistanceKm2({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });
}
function calculateBacktrackRatio2(encodedPolyline) {
  const points = decodePolyline(encodedPolyline);
  if (points.length < 10) return 0;
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + getDistanceKm2(points[i - 1], points[i]));
  }
  const totalDistance = distances[distances.length - 1];
  const excludeDistance = 0.3;
  let startIdx = 0;
  let endIdx = points.length - 1;
  for (let i = 0; i < distances.length; i++) {
    if (distances[i] >= excludeDistance) {
      startIdx = i;
      break;
    }
  }
  for (let i = distances.length - 1; i >= 0; i--) {
    if (totalDistance - distances[i] >= excludeDistance) {
      endIdx = i;
      break;
    }
  }
  if (endIdx <= startIdx + 5) {
    startIdx = 0;
    endIdx = points.length - 1;
  }
  const gridSize = 3e-4;
  const directedSegments = [];
  for (let i = startIdx; i < endIdx; i++) {
    const g1 = `${Math.round(points[i].lat / gridSize)},${Math.round(points[i].lng / gridSize)}`;
    const g2 = `${Math.round(points[i + 1].lat / gridSize)},${Math.round(points[i + 1].lng / gridSize)}`;
    if (g1 !== g2) {
      directedSegments.push(`${g1}->${g2}`);
    }
  }
  if (directedSegments.length === 0) return 0;
  const segmentSet = new Set(directedSegments);
  let backtrackCount = 0;
  for (const seg of directedSegments) {
    const parts = seg.split("->");
    const reverse = `${parts[1]}->${parts[0]}`;
    if (segmentSet.has(reverse)) {
      backtrackCount++;
    }
  }
  return backtrackCount / directedSegments.length;
}
function calculateAngularSpread(encodedPolyline, startLat, startLng) {
  const points = decodePolyline(encodedPolyline);
  if (points.length < 5) return 0;
  const bearings = [];
  for (const point of points) {
    const dLat = point.lat - startLat;
    const dLng = point.lng - startLng;
    if (Math.abs(dLat) < 1e-4 && Math.abs(dLng) < 1e-4) continue;
    const bearing = Math.atan2(dLng, dLat) * 180 / Math.PI;
    const normalizedBearing = (bearing % 360 + 360) % 360;
    bearings.push(normalizedBearing);
  }
  if (bearings.length < 3) return 0;
  const sectors = /* @__PURE__ */ new Set();
  for (const bearing of bearings) {
    sectors.add(Math.floor(bearing / 30));
  }
  return sectors.size * 30;
}
function isGenuineCircuit(encodedPolyline, startLat, startLng) {
  const backtrackRatio = calculateBacktrackRatio2(encodedPolyline);
  const angularSpread = calculateAngularSpread(encodedPolyline, startLat, startLng);
  const valid = angularSpread >= 180 && backtrackRatio <= 0.35;
  return { valid, backtrackRatio, angularSpread };
}
function getRouteSegments(encodedPolyline) {
  const points = decodePolyline(encodedPolyline);
  const segments2 = /* @__PURE__ */ new Set();
  const gridSize = 5e-4;
  for (let i = 0; i < points.length - 1; i++) {
    const g1 = `${Math.round(points[i].lat / gridSize)},${Math.round(points[i].lng / gridSize)}`;
    const g2 = `${Math.round(points[i + 1].lat / gridSize)},${Math.round(points[i + 1].lng / gridSize)}`;
    if (g1 !== g2) {
      segments2.add([g1, g2].sort().join("->"));
    }
  }
  return segments2;
}
function calculateRouteOverlap(polyline1, polyline22) {
  const seg1 = getRouteSegments(polyline1);
  const seg2 = getRouteSegments(polyline22);
  if (seg1.size === 0 || seg2.size === 0) return 0;
  let overlap = 0;
  seg1.forEach((s) => {
    if (seg2.has(s)) overlap++;
  });
  return overlap / Math.min(seg1.size, seg2.size);
}
function calculateAngleBetweenPoints(p1, p2, p3) {
  const v1 = { lat: p1.lat - p2.lat, lng: p1.lng - p2.lng };
  const v2 = { lat: p3.lat - p2.lat, lng: p3.lng - p2.lng };
  const dot = v1.lat * v2.lat + v1.lng * v2.lng;
  const mag1 = Math.sqrt(v1.lat * v1.lat + v1.lng * v1.lng);
  const mag2 = Math.sqrt(v2.lat * v2.lat + v2.lng * v2.lng);
  if (mag1 === 0 || mag2 === 0) return 0;
  const angleRad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
  return angleRad * 180 / Math.PI;
}
function countDeadEnds(encodedPolyline) {
  const points = decodePolyline(encodedPolyline);
  if (points.length < 3) return 0;
  let deadEnds = 0;
  const TURNAROUND_THRESHOLD = 15;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const angle = calculateAngleBetweenPoints(prev, curr, next);
    if (Math.abs(angle - 180) < TURNAROUND_THRESHOLD) {
      deadEnds++;
    }
  }
  return deadEnds;
}
function calculateCircuitScore(backtrackRatio, angularSpread, deadEndCount) {
  const backtrackScore = 1 - Math.min(1, backtrackRatio);
  const angularScore = Math.min(1, angularSpread / 360);
  const deadEndScore = Math.max(0, 1 - deadEndCount * 0.5);
  const compositeScore = backtrackScore * 0.4 + angularScore * 0.4 + deadEndScore * 0.2;
  return compositeScore;
}
function containsMajorRoads(instructions) {
  for (const instruction of instructions) {
    const lower = instruction.toLowerCase();
    for (const keyword of MAJOR_ROAD_KEYWORDS) {
      if (lower.includes(keyword)) return true;
    }
  }
  return false;
}
function assignDifficulty(backtrackRatio, hasMajorRoads, elevationGain) {
  let difficulty;
  if (backtrackRatio <= 0.25 && !hasMajorRoads) {
    difficulty = "easy";
  } else {
    difficulty = "moderate";
  }
  if (hasMajorRoads && difficulty === "easy") {
    difficulty = "moderate";
  }
  if (elevationGain > 100 && difficulty === "easy") {
    difficulty = "moderate";
  }
  if (elevationGain > 200) {
    difficulty = "hard";
  }
  return difficulty;
}
function getGeometricTemplates() {
  return [
    { name: "North Loop", waypoints: [{ bearing: 330, radiusMultiplier: 1.2 }, { bearing: 30, radiusMultiplier: 1.4 }, { bearing: 90, radiusMultiplier: 0.8 }] },
    { name: "South Loop", waypoints: [{ bearing: 150, radiusMultiplier: 1.2 }, { bearing: 210, radiusMultiplier: 1.4 }, { bearing: 270, radiusMultiplier: 0.8 }] },
    { name: "East Loop", waypoints: [{ bearing: 45, radiusMultiplier: 1.2 }, { bearing: 90, radiusMultiplier: 1.4 }, { bearing: 135, radiusMultiplier: 0.8 }] },
    { name: "West Loop", waypoints: [{ bearing: 225, radiusMultiplier: 1.2 }, { bearing: 270, radiusMultiplier: 1.4 }, { bearing: 315, radiusMultiplier: 0.8 }] },
    { name: "Clockwise Square", waypoints: [{ bearing: 0, radiusMultiplier: 1.4 }, { bearing: 90, radiusMultiplier: 1.4 }, { bearing: 180, radiusMultiplier: 1.4 }, { bearing: 270, radiusMultiplier: 1.4 }] },
    { name: "Counter-clockwise Square", waypoints: [{ bearing: 270, radiusMultiplier: 1.4 }, { bearing: 180, radiusMultiplier: 1.4 }, { bearing: 90, radiusMultiplier: 1.4 }, { bearing: 0, radiusMultiplier: 1.4 }] },
    { name: "NE-SW Diagonal", waypoints: [{ bearing: 45, radiusMultiplier: 1.8 }, { bearing: 225, radiusMultiplier: 1.8 }] },
    { name: "NW-SE Diagonal", waypoints: [{ bearing: 315, radiusMultiplier: 1.8 }, { bearing: 135, radiusMultiplier: 1.8 }] },
    { name: "Pentagon", waypoints: [{ bearing: 0, radiusMultiplier: 1.3 }, { bearing: 72, radiusMultiplier: 1.3 }, { bearing: 144, radiusMultiplier: 1.3 }, { bearing: 216, radiusMultiplier: 1.3 }, { bearing: 288, radiusMultiplier: 1.3 }] },
    { name: "Figure-8 NS", waypoints: [{ bearing: 0, radiusMultiplier: 1 }, { bearing: 45, radiusMultiplier: 0.5 }, { bearing: 180, radiusMultiplier: 1 }, { bearing: 225, radiusMultiplier: 0.5 }] },
    { name: "Figure-8 EW", waypoints: [{ bearing: 90, radiusMultiplier: 1 }, { bearing: 135, radiusMultiplier: 0.5 }, { bearing: 270, radiusMultiplier: 1 }, { bearing: 315, radiusMultiplier: 0.5 }] },
    { name: "North Reach", waypoints: [{ bearing: 350, radiusMultiplier: 2 }, { bearing: 10, radiusMultiplier: 1.5 }, { bearing: 30, radiusMultiplier: 0.8 }] },
    { name: "South Reach", waypoints: [{ bearing: 170, radiusMultiplier: 2 }, { bearing: 190, radiusMultiplier: 1.5 }, { bearing: 210, radiusMultiplier: 0.8 }] },
    { name: "Hexagon", waypoints: [{ bearing: 0, radiusMultiplier: 1.2 }, { bearing: 60, radiusMultiplier: 1.2 }, { bearing: 120, radiusMultiplier: 1.2 }, { bearing: 180, radiusMultiplier: 1.2 }, { bearing: 240, radiusMultiplier: 1.2 }, { bearing: 300, radiusMultiplier: 1.2 }] },
    { name: "East Heavy", waypoints: [{ bearing: 30, radiusMultiplier: 0.8 }, { bearing: 90, radiusMultiplier: 1.8 }, { bearing: 150, radiusMultiplier: 0.8 }] },
    { name: "West Heavy", waypoints: [{ bearing: 210, radiusMultiplier: 0.8 }, { bearing: 270, radiusMultiplier: 1.8 }, { bearing: 330, radiusMultiplier: 0.8 }] },
    { name: "Triangle North", waypoints: [{ bearing: 0, radiusMultiplier: 1.6 }, { bearing: 120, radiusMultiplier: 1.2 }, { bearing: 240, radiusMultiplier: 1.2 }] },
    { name: "Triangle South", waypoints: [{ bearing: 180, radiusMultiplier: 1.6 }, { bearing: 60, radiusMultiplier: 1.2 }, { bearing: 300, radiusMultiplier: 1.2 }] },
    { name: "Octagon Circuit", waypoints: [{ bearing: 0, radiusMultiplier: 1.1 }, { bearing: 45, radiusMultiplier: 1.1 }, { bearing: 90, radiusMultiplier: 1.1 }, { bearing: 135, radiusMultiplier: 1.1 }, { bearing: 180, radiusMultiplier: 1.1 }, { bearing: 225, radiusMultiplier: 1.1 }, { bearing: 270, radiusMultiplier: 1.1 }, { bearing: 315, radiusMultiplier: 1.1 }] },
    { name: "Large Octagon", waypoints: [{ bearing: 0, radiusMultiplier: 1.5 }, { bearing: 45, radiusMultiplier: 1.5 }, { bearing: 90, radiusMultiplier: 1.5 }, { bearing: 135, radiusMultiplier: 1.5 }, { bearing: 180, radiusMultiplier: 1.5 }, { bearing: 225, radiusMultiplier: 1.5 }, { bearing: 270, radiusMultiplier: 1.5 }, { bearing: 315, radiusMultiplier: 1.5 }] },
    { name: "North-South Circuit", waypoints: [{ bearing: 0, radiusMultiplier: 1.4 }, { bearing: 60, radiusMultiplier: 0.8 }, { bearing: 120, radiusMultiplier: 0.8 }, { bearing: 180, radiusMultiplier: 1.4 }, { bearing: 240, radiusMultiplier: 0.8 }, { bearing: 300, radiusMultiplier: 0.8 }] },
    { name: "East-West Circuit", waypoints: [{ bearing: 90, radiusMultiplier: 1.4 }, { bearing: 30, radiusMultiplier: 0.8 }, { bearing: 330, radiusMultiplier: 0.8 }, { bearing: 270, radiusMultiplier: 1.4 }, { bearing: 210, radiusMultiplier: 0.8 }, { bearing: 150, radiusMultiplier: 0.8 }] },
    { name: "Cloverleaf", waypoints: [{ bearing: 0, radiusMultiplier: 1.5 }, { bearing: 45, radiusMultiplier: 0.6 }, { bearing: 90, radiusMultiplier: 1.5 }, { bearing: 135, radiusMultiplier: 0.6 }, { bearing: 180, radiusMultiplier: 1.5 }, { bearing: 225, radiusMultiplier: 0.6 }, { bearing: 270, radiusMultiplier: 1.5 }, { bearing: 315, radiusMultiplier: 0.6 }] },
    { name: "Diamond Extended", waypoints: [{ bearing: 0, radiusMultiplier: 1.8 }, { bearing: 45, radiusMultiplier: 0.9 }, { bearing: 90, radiusMultiplier: 1.8 }, { bearing: 135, radiusMultiplier: 0.9 }, { bearing: 180, radiusMultiplier: 1.8 }, { bearing: 225, radiusMultiplier: 0.9 }, { bearing: 270, radiusMultiplier: 1.8 }, { bearing: 315, radiusMultiplier: 0.9 }] },
    { name: "Wide North Arc", waypoints: [{ bearing: 315, radiusMultiplier: 2 }, { bearing: 0, radiusMultiplier: 2.2 }, { bearing: 45, radiusMultiplier: 2 }] },
    { name: "Wide South Arc", waypoints: [{ bearing: 135, radiusMultiplier: 2 }, { bearing: 180, radiusMultiplier: 2.2 }, { bearing: 225, radiusMultiplier: 2 }] },
    { name: "Wide East Arc", waypoints: [{ bearing: 45, radiusMultiplier: 2 }, { bearing: 90, radiusMultiplier: 2.2 }, { bearing: 135, radiusMultiplier: 2 }] },
    { name: "Wide West Arc", waypoints: [{ bearing: 225, radiusMultiplier: 2 }, { bearing: 270, radiusMultiplier: 2.2 }, { bearing: 315, radiusMultiplier: 2 }] },
    { name: "Expanded Square", waypoints: [{ bearing: 0, radiusMultiplier: 2 }, { bearing: 90, radiusMultiplier: 2 }, { bearing: 180, radiusMultiplier: 2 }, { bearing: 270, radiusMultiplier: 2 }] },
    { name: "Large Pentagon", waypoints: [{ bearing: 0, radiusMultiplier: 1.8 }, { bearing: 72, radiusMultiplier: 1.8 }, { bearing: 144, radiusMultiplier: 1.8 }, { bearing: 216, radiusMultiplier: 1.8 }, { bearing: 288, radiusMultiplier: 1.8 }] },
    { name: "Scenic Triangle", waypoints: [{ bearing: 30, radiusMultiplier: 2.2 }, { bearing: 150, radiusMultiplier: 2.2 }, { bearing: 270, radiusMultiplier: 2.2 }] },
    { name: "Explorer Loop", waypoints: [{ bearing: 20, radiusMultiplier: 1.6 }, { bearing: 100, radiusMultiplier: 1.4 }, { bearing: 200, radiusMultiplier: 1.6 }, { bearing: 280, radiusMultiplier: 1.4 }] }
  ];
}
function generateTemplateWaypoints(startLat, startLng, baseRadius, template) {
  return template.waypoints.map(
    (wp) => projectPoint(startLat, startLng, wp.bearing, baseRadius * wp.radiusMultiplier)
  );
}
async function fetchGoogleDirections(origin, waypoints, optimize = true) {
  if (!GOOGLE_MAPS_API_KEY2) {
    return { success: false, error: "Google Maps API key not configured" };
  }
  try {
    const waypointsStr = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join("|");
    const optimizeParam = optimize ? "optimize:true|" : "";
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=${optimizeParam}${waypointsStr}&mode=walking&avoid=highways&key=${GOOGLE_MAPS_API_KEY2}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
      return { success: false, error: data.status || "No routes found" };
    }
    const route = data.routes[0];
    const legs = route.legs;
    let totalDistance = 0;
    let totalDuration = 0;
    const instructions = [];
    const turnInstructions = [];
    let cumulativeDistance = 0;
    for (const leg of legs) {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;
      for (const step of leg.steps) {
        const instructionText = step.html_instructions.replace(/<[^>]*>/g, "");
        instructions.push(instructionText);
        turnInstructions.push({
          instruction: instructionText,
          lat: step.start_location.lat,
          lng: step.start_location.lng,
          distance: cumulativeDistance
        });
        cumulativeDistance += step.distance.value;
      }
    }
    return {
      success: true,
      distance: totalDistance / 1e3,
      duration: Math.round(totalDuration / 60),
      polyline: route.overview_polyline.points,
      instructions,
      turnInstructions
    };
  } catch (error) {
    console.error("Google Directions API error:", error);
    return { success: false, error: error.message };
  }
}
async function calibrateRoute(startLat, startLng, baseWaypoints, targetDistance, optimize = false) {
  let scale = 1;
  let minScale = 0.1;
  let maxScale = 5;
  let bestResult = null;
  let bestError = Infinity;
  let apiErrors = [];
  let successfulCalls = 0;
  const origin = { lat: startLat, lng: startLng };
  for (let i = 0; i < 10; i++) {
    const scaledWaypoints = baseWaypoints.map((wp) => ({
      lat: startLat + (wp.lat - startLat) * scale,
      lng: startLng + (wp.lng - startLng) * scale
    }));
    const result = await fetchGoogleDirections(origin, scaledWaypoints, optimize);
    if (!result.success || !result.distance) {
      if (result.error) apiErrors.push(`${result.error} (scale=${scale.toFixed(2)})`);
      maxScale = scale;
      scale = (minScale + maxScale) / 2;
      continue;
    }
    successfulCalls++;
    const error = Math.abs(result.distance - targetDistance) / targetDistance;
    if (error < bestError) {
      bestError = error;
      bestResult = { waypoints: scaledWaypoints, result };
    }
    if (error < 0.15) {
      return { waypoints: scaledWaypoints, result };
    }
    if (result.distance < targetDistance) {
      minScale = scale;
    } else {
      maxScale = scale;
    }
    scale = (minScale + maxScale) / 2;
  }
  const MAX_ERROR_TOLERANCE = 0.25;
  if (!bestResult) {
    console.log(`[RouteGen] Calibration failed: ${successfulCalls}/10 API calls succeeded. Errors: ${apiErrors.slice(0, 3).join("; ")}`);
  } else if (bestError >= MAX_ERROR_TOLERANCE) {
    console.log(`[RouteGen] Calibration failed: best error ${(bestError * 100).toFixed(1)}% exceeds ${(MAX_ERROR_TOLERANCE * 100).toFixed(0)}% threshold (dist=${bestResult.result.distance?.toFixed(2)}km, target=${targetDistance}km)`);
  }
  return bestResult && bestError < MAX_ERROR_TOLERANCE ? bestResult : null;
}
async function fetchElevationForRoute(encodedPolyline) {
  if (!GOOGLE_MAPS_API_KEY2) return { gain: 0, loss: 0, maxGradientPercent: 0, maxGradientDegrees: 0 };
  try {
    const points = decodePolyline(encodedPolyline);
    if (points.length < 2) return { gain: 0, loss: 0, maxGradientPercent: 0, maxGradientDegrees: 0 };
    const samplePoints = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 50)) === 0);
    const path2 = samplePoints.map((p) => `${p.lat},${p.lng}`).join("|");
    const url = `https://maps.googleapis.com/maps/api/elevation/json?path=${encodeURIComponent(path2)}&samples=${samplePoints.length}&key=${GOOGLE_MAPS_API_KEY2}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== "OK" || !data.results) return { gain: 0, loss: 0, maxGradientPercent: 0, maxGradientDegrees: 0 };
    let totalGain = 0;
    let totalLoss = 0;
    let maxGradientPercent = 0;
    for (let i = 1; i < data.results.length; i++) {
      const elevDiff = data.results[i].elevation - data.results[i - 1].elevation;
      if (elevDiff > 0) {
        totalGain += elevDiff;
      } else {
        totalLoss += Math.abs(elevDiff);
      }
      const lat1 = samplePoints[i - 1].lat;
      const lng1 = samplePoints[i - 1].lng;
      const lat2 = samplePoints[i].lat;
      const lng2 = samplePoints[i].lng;
      const R = 6371e3;
      const dLat = toRadians(lat2 - lat1);
      const dLng = toRadians(lng2 - lng1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const horizontalDistance = R * c;
      if (horizontalDistance > 5) {
        const gradientPercent = Math.abs(elevDiff / horizontalDistance) * 100;
        if (gradientPercent > maxGradientPercent) {
          maxGradientPercent = gradientPercent;
        }
      }
    }
    const maxGradientDegrees = Math.atan(maxGradientPercent / 100) * (180 / Math.PI);
    return {
      gain: Math.round(totalGain),
      loss: Math.round(totalLoss),
      maxGradientPercent: Math.round(maxGradientPercent * 10) / 10,
      maxGradientDegrees: Math.round(maxGradientDegrees * 10) / 10
    };
  } catch (error) {
    console.error("Elevation API error:", error);
    return { gain: 0, loss: 0, maxGradientPercent: 0, maxGradientDegrees: 0 };
  }
}
async function generateRouteOptions2(startLat, startLng, targetDistanceKm, activityType = "run", sampleSize = 50, returnTopN = 5) {
  console.log(`[RouteGen] \u{1F5FA}\uFE0F Enhanced circuit filtering enabled`);
  console.log(`[RouteGen] Starting route generation for ${targetDistanceKm}km ${activityType}`);
  console.log(`[RouteGen] \u{1F50D} Sampling ${sampleSize} templates, returning top ${returnTopN} circuits`);
  const baseRadius = targetDistanceKm / 4;
  const templates = getGeometricTemplates();
  const shuffledTemplates = templates.sort(() => Math.random() - 0.5);
  const samplesToEvaluate = Math.min(sampleSize, shuffledTemplates.length);
  const templatesToTry = shuffledTemplates.slice(0, samplesToEvaluate);
  const maxOverlap = 0.4;
  const candidates = [];
  console.log(`[RouteGen] Evaluating ${templatesToTry.length} templates...`);
  for (const template of templatesToTry) {
    try {
      console.log(`[RouteGen] Trying template: ${template.name}`);
      const baseWaypoints = generateTemplateWaypoints(startLat, startLng, baseRadius, template);
      const calibrated = await calibrateRoute(startLat, startLng, baseWaypoints, targetDistanceKm);
      if (!calibrated) {
        console.log(`[RouteGen] ${template.name}: calibration returned null`);
        continue;
      }
      if (!calibrated.result.polyline) {
        console.log(`[RouteGen] ${template.name}: no polyline in result`);
        continue;
      }
      const { backtrackRatio, angularSpread } = isGenuineCircuit(
        calibrated.result.polyline,
        startLat,
        startLng
      );
      const deadEndCount = countDeadEnds(calibrated.result.polyline);
      const circuitScore = calculateCircuitScore(backtrackRatio, angularSpread, deadEndCount);
      candidates.push({
        template,
        calibrated,
        backtrackRatio,
        angularSpread,
        deadEndCount,
        circuitScore
      });
      console.log(`[RouteGen] Candidate ${template.name}: score=${circuitScore.toFixed(2)}, backtrack=${(backtrackRatio * 100).toFixed(1)}%, angular=${angularSpread}\xB0, deadEnds=${deadEndCount}`);
    } catch (error) {
      console.error(`[RouteGen] Error with template ${template.name}:`, error);
    }
  }
  candidates.sort((a, b) => b.circuitScore - a.circuitScore);
  console.log(`[RouteGen] \u{1F4CA} Found ${candidates.length} candidates, selecting best ${returnTopN} circuits...`);
  if (candidates.length > 0) {
    console.log(`[RouteGen] \u{1F3C6} Best circuit score: ${candidates[0].circuitScore.toFixed(2)} (${candidates[0].template.name})`);
    console.log(`[RouteGen] \u{1F4C9} Worst circuit score: ${candidates[candidates.length - 1].circuitScore.toFixed(2)} (${candidates[candidates.length - 1].template.name})`);
  }
  const validRoutes = [];
  const usedTemplates = /* @__PURE__ */ new Set();
  for (const candidate of candidates) {
    if (validRoutes.length >= returnTopN) break;
    if (usedTemplates.has(candidate.template.name)) continue;
    let isTooSimilar = false;
    for (const existing of validRoutes) {
      const overlap = calculateRouteOverlap(candidate.calibrated.result.polyline, existing.polyline);
      if (overlap > maxOverlap) {
        isTooSimilar = true;
        break;
      }
    }
    if (isTooSimilar) {
      console.log(`[RouteGen] ${candidate.template.name} rejected: too similar to existing route (overlap > ${maxOverlap})`);
      continue;
    }
    const instructions = candidate.calibrated.result.instructions || [];
    const turnInstructions = candidate.calibrated.result.turnInstructions || [];
    const hasMajorRoads = containsMajorRoads(instructions);
    const elevation = await fetchElevationForRoute(candidate.calibrated.result.polyline);
    const difficulty = assignDifficulty(candidate.backtrackRatio, hasMajorRoads, elevation.gain);
    const route = {
      id: `route_${Date.now()}_${validRoutes.length}`,
      name: `${candidate.template.name} Route`,
      distance: candidate.calibrated.result.distance,
      duration: candidate.calibrated.result.duration,
      polyline: candidate.calibrated.result.polyline,
      waypoints: candidate.calibrated.waypoints,
      difficulty,
      elevationGain: elevation.gain,
      elevationLoss: elevation.loss,
      maxGradientPercent: elevation.maxGradientPercent,
      maxGradientDegrees: elevation.maxGradientDegrees,
      instructions,
      turnInstructions,
      backtrackRatio: candidate.backtrackRatio,
      angularSpread: candidate.angularSpread,
      templateName: candidate.template.name
    };
    validRoutes.push(route);
    usedTemplates.add(candidate.template.name);
    console.log(`[RouteGen] \u2705 Selected ${candidate.template.name}: ${route.distance.toFixed(2)}km, score=${candidate.circuitScore.toFixed(2)}, backtrack=${(candidate.backtrackRatio * 100).toFixed(1)}%, deadEnds=${candidate.deadEndCount}, climb=${elevation.gain}m`);
  }
  console.log(`[RouteGen] \u{1F389} Generated ${validRoutes.length} high-quality circuit routes (target: ${returnTopN})`);
  return validRoutes;
}
var GOOGLE_MAPS_API_KEY2, MAJOR_ROAD_KEYWORDS;
var init_route_generation = __esm({
  "server/route-generation.ts"() {
    "use strict";
    GOOGLE_MAPS_API_KEY2 = process.env.GOOGLE_MAPS_API_KEY;
    MAJOR_ROAD_KEYWORDS = ["highway", "hwy", "motorway", "expressway", "freeway", "interstate", "turnpike"];
  }
});

// server/route-generation-ai.ts
var route_generation_ai_exports = {};
__export(route_generation_ai_exports, {
  generateAIRoutesWithGoogle: () => generateAIRoutesWithGoogle
});
import OpenAI3 from "openai";
import polyline2 from "@mapbox/polyline";
async function generateAIRoutesWithGoogle(startLat, startLng, targetDistanceKm, activityType = "run") {
  console.log(`[AI Route Gen] \u{1F916} Using OpenAI to design ${targetDistanceKm}km circuits`);
  const nearbyFeatures = await discoverNearbyFeatures(startLat, startLng, targetDistanceKm);
  const aiRoutes = await designCircuitsWithAI(startLat, startLng, targetDistanceKm, nearbyFeatures);
  console.log(`[AI Route Gen] \u{1F3A8} OpenAI designed ${aiRoutes.length} circuit routes`);
  const enhancedRoutes = [];
  for (const aiRoute of aiRoutes) {
    try {
      const googleRoute = await executeRouteWithGoogle(
        { lat: startLat, lng: startLng },
        aiRoute.waypoints
      );
      if (googleRoute && googleRoute.success) {
        const loopQuality = calculateLoopQuality2({ lat: startLat, lng: startLng }, googleRoute.polyline);
        const backtrackRatio = calculateBacktrackRatio3(googleRoute.polyline);
        const distanceError = Math.abs(googleRoute.distance - targetDistanceKm) / targetDistanceKm;
        if (distanceError < 0.4 && backtrackRatio < 0.5 && loopQuality > 0.5) {
          const elevation = await fetchElevation(googleRoute.polyline);
          enhancedRoutes.push({
            id: aiRoute.id,
            name: aiRoute.name,
            distance: googleRoute.distance,
            duration: googleRoute.duration,
            polyline: googleRoute.polyline,
            waypoints: aiRoute.waypoints,
            difficulty: determineDifficulty(elevation.gain, backtrackRatio),
            elevationGain: elevation.gain,
            elevationLoss: elevation.loss,
            maxGradientPercent: elevation.maxGradientPercent,
            maxGradientDegrees: elevation.maxGradientDegrees,
            instructions: googleRoute.instructions || [],
            turnInstructions: googleRoute.turnInstructions || [],
            circuitQuality: {
              backtrackRatio,
              angularSpread: calculateAngularSpread2(googleRoute.polyline, startLat, startLng),
              loopQuality
            },
            aiReasoning: aiRoute.reasoning
          });
          console.log(`[AI Route Gen] \u2705 ${aiRoute.name}: ${googleRoute.distance.toFixed(1)}km, loop=${loopQuality.toFixed(2)}, backtrack=${(backtrackRatio * 100).toFixed(0)}%`);
        } else {
          console.log(`[AI Route Gen] \u274C ${aiRoute.name}: Filtered (distance=${distanceError.toFixed(2)}, backtrack=${backtrackRatio.toFixed(2)}, loop=${loopQuality.toFixed(2)})`);
        }
      }
    } catch (error) {
      console.error(`[AI Route Gen] Error processing ${aiRoute.name}:`, error);
    }
  }
  console.log(`[AI Route Gen] \u{1F4CA} Generated ${enhancedRoutes.length} valid routes, selecting top 5 with difficulty variety...`);
  const selectedRoutes = selectTopRoutesWithVariety(enhancedRoutes);
  console.log(`[AI Route Gen] \u{1F389} Returning ${selectedRoutes.length} high-quality AI-designed circuits`);
  return selectedRoutes;
}
function selectTopRoutesWithVariety(routes2) {
  if (routes2.length <= 5) return routes2;
  const easy = routes2.filter((r) => r.difficulty === "easy");
  const moderate = routes2.filter((r) => r.difficulty === "moderate");
  const hard = routes2.filter((r) => r.difficulty === "hard");
  const sortByDistance = (a, b) => a.distance - b.distance;
  easy.sort(sortByDistance);
  moderate.sort(sortByDistance);
  hard.sort(sortByDistance);
  const selected = [];
  selected.push(...easy.slice(0, 2));
  selected.push(...moderate.slice(0, 2));
  selected.push(...hard.slice(0, 1));
  if (selected.length < 5) {
    const remaining = routes2.filter((r) => !selected.includes(r)).sort(sortByDistance);
    selected.push(...remaining.slice(0, 5 - selected.length));
  }
  console.log(`[AI Route Gen] \u2728 Selected: ${selected.filter((r) => r.difficulty === "easy").length} easy, ${selected.filter((r) => r.difficulty === "moderate").length} moderate, ${selected.filter((r) => r.difficulty === "hard").length} hard`);
  const finalOrder = [
    ...selected.filter((r) => r.difficulty === "easy"),
    ...selected.filter((r) => r.difficulty === "moderate"),
    ...selected.filter((r) => r.difficulty === "hard")
  ];
  return finalOrder.slice(0, 5);
}
async function discoverNearbyFeatures(lat, lng, distance) {
  if (!GOOGLE_MAPS_API_KEY3) return [];
  const searchRadius = distance * 1e3 * 0.4;
  try {
    const types = ["park", "point_of_interest", "natural_feature"];
    const allFeatures = [];
    for (const type of types) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${searchRadius}&type=${type}&key=${GOOGLE_MAPS_API_KEY3}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === "OK" && data.results) {
        allFeatures.push(...data.results.map((place) => ({
          name: place.name,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          type: place.types[0],
          rating: place.rating
        })));
      }
    }
    console.log(`[AI Route Gen] \u{1F4CD} Found ${allFeatures.length} nearby features for AI context`);
    return allFeatures.slice(0, 20);
  } catch (error) {
    console.error("[AI Route Gen] Error fetching features:", error);
    return [];
  }
}
async function designCircuitsWithAI(startLat, startLng, targetDistance, nearbyFeatures) {
  const featuresContext = nearbyFeatures.length > 0 ? nearbyFeatures.map((f) => `- ${f.name} (${f.type}) at ${f.lat},${f.lng}`).join("\n") : "No specific features found - design routes using street grid patterns";
  const prompt = `You are an expert route designer for runners. Design 10 DIVERSE circuit routes that form TRUE LOOPS (returning to start point).

LOCATION: ${startLat}, ${startLng}
TARGET DISTANCE: ${targetDistance}km
NEARBY FEATURES:
${featuresContext}

CRITICAL REQUIREMENTS:
1. Each route MUST be a CIRCUIT/LOOP - the last waypoint should be close to the start (within 200m)
2. Waypoints should form a LARGE circular pattern with good radius coverage - NOT small tight loops
3. Space waypoints approximately ${(targetDistance * 0.18).toFixed(2)}km apart (Google adds 2-3x distance for street routing)
4. Each route should use 4-6 waypoints to form the loop
5. Make routes DIVERSE - different directions, VARIED SIZES (some large, some medium), different patterns
6. IMPORTANT: Waypoints should spread out from the start point - use the full search radius available
7. Consider terrain variety - parks, trails, waterfront if available
8. Avoid tight/small loops - routes should explore the area broadly

ROUTE PATTERNS TO USE (WITH VARIED SIZES):
- Clockwise loops (VARY radius: some large 70-80%, some medium 50-60%)
- Counter-clockwise loops (VARY radius to create diversity)
- Figure-8 patterns (two distinct loops)
- Elongated ovals (north-south or east-west, LARGE coverage)
- Square/pentagon patterns (corners in different compass directions)
- Routes through parks/green spaces if available

CRITICAL: Make 4-5 routes with LARGE radius (waypoints 60-80% of search distance from start)
         Make 3-4 routes with MEDIUM radius (waypoints 40-60% of search distance)
         Make 2-3 routes with VARIED patterns (different shapes)

Return a JSON array of exactly 10 routes with VARIED SIZES and difficulties:
[
  {
    "name": "Descriptive route name",
    "waypoints": [
      {"lat": number, "lng": number},
      {"lat": number, "lng": number},
      ... 4-6 waypoints total forming a circuit
    ],
    "reasoning": "Why this route forms a good circuit",
    "estimatedDistance": ${targetDistance},
    "circuitType": "clockwise-loop" or "figure-8" or "oval" etc
  }
]

IMPORTANT: Ensure waypoints form actual circles/loops, not straight lines!`;
  try {
    console.log(`[AI Route Gen] \u{1F916} Asking OpenAI to design 5 intelligent circuits...`);
    const completion = await openai3.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert running route designer specializing in creating circular loop routes. You understand geography, street patterns, and how to create safe, interesting running circuits."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8
      // Higher creativity for route variety
    });
    const responseText = completion.choices[0].message.content;
    const parsed = JSON.parse(responseText || "{}");
    const routes2 = parsed.routes || [];
    console.log(`[AI Route Gen] \u2728 OpenAI designed ${routes2.length} routes`);
    return routes2.map((route, idx) => ({
      id: `ai_route_${Date.now()}_${idx}`,
      name: route.name || `AI Circuit ${idx + 1}`,
      waypoints: route.waypoints || [],
      reasoning: route.reasoning || "AI-designed circuit",
      estimatedDistance: route.estimatedDistance || targetDistance,
      circuitType: route.circuitType || "loop"
    }));
  } catch (error) {
    console.error("[AI Route Gen] OpenAI error:", error);
    return generateFallbackCircuits(startLat, startLng, targetDistance);
  }
}
function generateFallbackCircuits(startLat, startLng, distance) {
  const radius = distance * 0.15;
  const patterns = [
    { name: "Square Loop", angles: [0, 90, 180, 270], type: "square" },
    { name: "Pentagon Circuit", angles: [0, 72, 144, 216, 288], type: "pentagon" },
    { name: "Hexagon Loop", angles: [0, 60, 120, 180, 240, 300], type: "hexagon" },
    { name: "North-South Oval", angles: [0, 45, 135, 180, 225, 315], type: "oval" },
    { name: "East-West Oval", angles: [90, 135, 225, 270, 315, 45], type: "oval" }
  ];
  return patterns.map((pattern, idx) => ({
    id: `fallback_${Date.now()}_${idx}`,
    name: pattern.name,
    waypoints: pattern.angles.map((angle) => projectPoint2(startLat, startLng, angle, radius)),
    reasoning: `Geometric ${pattern.type} pattern as fallback`,
    estimatedDistance: distance,
    circuitType: pattern.type
  }));
}
function projectPoint2(lat, lng, bearingDegrees, distanceKm) {
  const R = 6371;
  const lat1 = toRadians2(lat);
  const lng1 = toRadians2(lng);
  const bearing = toRadians2(bearingDegrees);
  const d = distanceKm / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: toDegrees2(lat2), lng: toDegrees2(lng2) };
}
function toRadians2(degrees) {
  return degrees * Math.PI / 180;
}
function toDegrees2(radians) {
  return radians * 180 / Math.PI;
}
async function executeRouteWithGoogle(start, waypoints) {
  if (!GOOGLE_MAPS_API_KEY3) {
    return { success: false, error: "No API key" };
  }
  try {
    const waypointsStr = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join("|");
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${start.lat},${start.lng}&waypoints=${waypointsStr}&mode=walking&alternatives=true&key=${GOOGLE_MAPS_API_KEY3}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
      return { success: false, error: data.status };
    }
    const route = data.routes[0];
    const legs = route.legs;
    let totalDistance = 0;
    let totalDuration = 0;
    const instructions = [];
    const turnInstructions = [];
    for (const leg of legs) {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;
      for (const step of leg.steps) {
        const inst = step.html_instructions.replace(/<[^>]*>/g, "");
        instructions.push(inst);
        turnInstructions.push({
          instruction: inst,
          lat: step.start_location.lat,
          lng: step.start_location.lng,
          distance: totalDistance
        });
      }
    }
    return {
      success: true,
      distance: totalDistance / 1e3,
      duration: Math.round(totalDuration / 60),
      polyline: route.overview_polyline.points,
      instructions,
      turnInstructions
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
async function fetchElevation(encodedPolyline) {
  if (!GOOGLE_MAPS_API_KEY3) {
    return { gain: 0, loss: 0, maxGradientPercent: 0, maxGradientDegrees: 0 };
  }
  try {
    const points = decodePolyline2(encodedPolyline);
    if (points.length < 2) {
      return { gain: 0, loss: 0, maxGradientPercent: 0, maxGradientDegrees: 0 };
    }
    const samplePoints = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 50)) === 0);
    const path2 = samplePoints.map((p) => `${p.lat},${p.lng}`).join("|");
    const url = `https://maps.googleapis.com/maps/api/elevation/json?path=${encodeURIComponent(path2)}&samples=${samplePoints.length}&key=${GOOGLE_MAPS_API_KEY3}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== "OK" || !data.results) {
      return { gain: 0, loss: 0, maxGradientPercent: 0, maxGradientDegrees: 0 };
    }
    let totalGain = 0;
    let totalLoss = 0;
    let maxGradientPercent = 0;
    for (let i = 1; i < data.results.length; i++) {
      const elevDiff = data.results[i].elevation - data.results[i - 1].elevation;
      if (elevDiff > 0) {
        totalGain += elevDiff;
      } else {
        totalLoss += Math.abs(elevDiff);
      }
      const horizontalDistance = getDistanceKm3(samplePoints[i - 1], samplePoints[i]) * 1e3;
      if (horizontalDistance > 5) {
        const gradientPercent = Math.abs(elevDiff / horizontalDistance) * 100;
        if (gradientPercent > maxGradientPercent) {
          maxGradientPercent = gradientPercent;
        }
      }
    }
    const maxGradientDegrees = Math.atan(maxGradientPercent / 100) * (180 / Math.PI);
    return {
      gain: Math.round(totalGain),
      loss: Math.round(totalLoss),
      maxGradientPercent: Math.round(maxGradientPercent * 10) / 10,
      maxGradientDegrees: Math.round(maxGradientDegrees * 10) / 10
    };
  } catch (error) {
    console.error("[AI Route Gen] Elevation error:", error);
    return { gain: 0, loss: 0, maxGradientPercent: 0, maxGradientDegrees: 0 };
  }
}
function calculateLoopQuality2(start, polylineStr) {
  const points = decodePolyline2(polylineStr);
  if (points.length < 2) return 0;
  const endPoint = points[points.length - 1];
  const distanceKm = getDistanceKm3(start, endPoint);
  return Math.max(0, 1 - distanceKm / 0.5);
}
function calculateBacktrackRatio3(polylineStr) {
  const points = decodePolyline2(polylineStr);
  if (points.length < 10) return 0;
  const gridSize = 3e-4;
  const segments2 = [];
  for (let i = 0; i < points.length - 1; i++) {
    const g1 = `${Math.round(points[i].lat / gridSize)},${Math.round(points[i].lng / gridSize)}`;
    const g2 = `${Math.round(points[i + 1].lat / gridSize)},${Math.round(points[i + 1].lng / gridSize)}`;
    if (g1 !== g2) {
      segments2.push(`${g1}->${g2}`);
    }
  }
  const segmentSet = new Set(segments2);
  let backtrackCount = 0;
  for (const seg of segments2) {
    const parts = seg.split("->");
    const reverse = `${parts[1]}->${parts[0]}`;
    if (segmentSet.has(reverse)) {
      backtrackCount++;
    }
  }
  return backtrackCount / segments2.length;
}
function calculateAngularSpread2(polylineStr, startLat, startLng) {
  const points = decodePolyline2(polylineStr);
  if (points.length < 5) return 0;
  const bearings = [];
  for (const point of points) {
    const dLat = point.lat - startLat;
    const dLng = point.lng - startLng;
    if (Math.abs(dLat) < 1e-4 && Math.abs(dLng) < 1e-4) continue;
    const bearing = Math.atan2(dLng, dLat) * 180 / Math.PI;
    bearings.push((bearing % 360 + 360) % 360);
  }
  const sectors = new Set(bearings.map((b) => Math.floor(b / 30)));
  return sectors.size * 30;
}
function decodePolyline2(encoded) {
  try {
    const decoded = polyline2.decode(encoded);
    return decoded.map(([lat, lng]) => ({ lat, lng }));
  } catch (e) {
    return [];
  }
}
function getDistanceKm3(p1, p2) {
  const R = 6371;
  const dLat = toRadians2(p2.lat - p1.lat);
  const dLng = toRadians2(p2.lng - p1.lng);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRadians2(p1.lat)) * Math.cos(toRadians2(p2.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function determineDifficulty(elevationGain, backtrackRatio) {
  if (elevationGain > 150 || backtrackRatio > 0.3) return "hard";
  if (elevationGain > 75 || backtrackRatio > 0.2) return "moderate";
  return "easy";
}
var GOOGLE_MAPS_API_KEY3, OPENAI_API_KEY, openai3;
var init_route_generation_ai = __esm({
  "server/route-generation-ai.ts"() {
    "use strict";
    GOOGLE_MAPS_API_KEY3 = process.env.GOOGLE_MAPS_API_KEY;
    OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    openai3 = new OpenAI3({
      apiKey: OPENAI_API_KEY
    });
  }
});

// server/garmin-service.ts
var garmin_service_exports = {};
__export(garmin_service_exports, {
  default: () => garmin_service_default,
  exchangeGarminCode: () => exchangeGarminCode,
  generateTCXFile: () => generateTCXFile,
  getAndRemoveCodeVerifier: () => getAndRemoveCodeVerifier,
  getGarminActivities: () => getGarminActivities,
  getGarminActivityDetail: () => getGarminActivityDetail,
  getGarminAuthUrl: () => getGarminAuthUrl,
  getGarminBodyBattery: () => getGarminBodyBattery,
  getGarminComprehensiveWellness: () => getGarminComprehensiveWellness,
  getGarminDailySummary: () => getGarminDailySummary,
  getGarminHRVData: () => getGarminHRVData,
  getGarminHeartRateData: () => getGarminHeartRateData,
  getGarminPulseOx: () => getGarminPulseOx,
  getGarminRespirationData: () => getGarminRespirationData,
  getGarminSleepData: () => getGarminSleepData,
  getGarminSleepDetails: () => getGarminSleepDetails,
  getGarminStressData: () => getGarminStressData,
  getGarminUserProfile: () => getGarminUserProfile,
  getGarminUserStats: () => getGarminUserStats,
  parseGarminActivity: () => parseGarminActivity,
  refreshGarminToken: () => refreshGarminToken,
  syncGarminActivities: () => syncGarminActivities,
  uploadActivityToGarmin: () => uploadActivityToGarmin,
  uploadRunToGarmin: () => uploadRunToGarmin
});
import crypto2 from "crypto";
import { sql as sql7 } from "drizzle-orm";
async function storeCodeVerifier(nonce, verifier) {
  try {
    await db.execute(sql7`
      INSERT INTO oauth_state (nonce, code_verifier, created_at)
      VALUES (${nonce}, ${verifier}, NOW())
      ON CONFLICT (nonce) DO UPDATE SET code_verifier = ${verifier}, created_at = NOW()
    `);
    console.log(`[Garmin] Stored code verifier in database for nonce: ${nonce}`);
  } catch (error) {
    console.error(`[Garmin] Failed to store code verifier:`, error);
    throw error;
  }
}
async function getCodeVerifier(nonce) {
  try {
    const result = await db.execute(sql7`
      SELECT code_verifier FROM oauth_state WHERE nonce = ${nonce}
    `);
    const verifier = result.rows[0]?.code_verifier || null;
    if (verifier) {
      console.log(`[Garmin] Found code verifier in database for nonce: ${nonce}`);
    } else {
      console.log(`[Garmin] Code verifier NOT found in database for nonce: ${nonce}`);
    }
    return verifier;
  } catch (error) {
    console.error(`[Garmin] Failed to get code verifier:`, error);
    return null;
  }
}
async function deleteCodeVerifier(nonce) {
  try {
    await db.execute(sql7`DELETE FROM oauth_state WHERE nonce = ${nonce}`);
    console.log(`[Garmin] Deleted code verifier from database for nonce: ${nonce}`);
  } catch (error) {
    console.error(`[Garmin] Failed to delete code verifier:`, error);
  }
}
async function cleanupOldVerifiers() {
  try {
    await db.execute(sql7`DELETE FROM oauth_state WHERE created_at < NOW() - INTERVAL '15 minutes'`);
  } catch (error) {
    console.error(`[Garmin] Failed to cleanup old verifiers:`, error);
  }
}
function generatePKCE() {
  const codeVerifier = crypto2.randomBytes(32).toString("base64url");
  const codeChallenge = crypto2.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}
async function getAndRemoveCodeVerifier(nonce) {
  console.log(`[Garmin] Looking up code verifier for nonce: ${nonce}`);
  const verifier = await getCodeVerifier(nonce);
  if (verifier) {
    await deleteCodeVerifier(nonce);
    console.log(`[Garmin] Found and removed code verifier for nonce: ${nonce}`);
    return verifier;
  }
  console.log(`[Garmin] Code verifier NOT found for nonce: ${nonce}`);
  return null;
}
async function getGarminAuthUrl(redirectUri, state, nonce) {
  const { codeVerifier, codeChallenge } = generatePKCE();
  await storeCodeVerifier(nonce, codeVerifier);
  cleanupOldVerifiers().catch((err) => console.error("Failed to cleanup old verifiers:", err));
  const params = new URLSearchParams({
    client_id: GARMIN_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state
  });
  return `${GARMIN_AUTH_URL}?${params.toString()}`;
}
async function exchangeGarminCode(code, redirectUri, nonce) {
  const codeVerifier = await getAndRemoveCodeVerifier(nonce);
  if (!codeVerifier) {
    throw new Error("Invalid state - PKCE code verifier not found for nonce: " + nonce);
  }
  const formParts = [
    `grant_type=authorization_code`,
    `code=${encodeURIComponent(code)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `code_verifier=${encodeURIComponent(codeVerifier)}`,
    `client_id=${encodeURIComponent(GARMIN_CLIENT_ID)}`,
    `client_secret=${encodeURIComponent(GARMIN_CLIENT_SECRET)}`
  ];
  const formBody = formParts.join("&");
  console.log("=== GARMIN TOKEN EXCHANGE ===");
  console.log("Token URL:", GARMIN_TOKEN_URL);
  console.log("Redirect URI:", redirectUri);
  console.log("Nonce:", nonce);
  console.log("Code:", code);
  console.log("Code verifier:", codeVerifier);
  console.log("Code verifier length:", codeVerifier.length);
  console.log("Client ID:", GARMIN_CLIENT_ID);
  console.log("Client Secret (first 5 chars):", GARMIN_CLIENT_SECRET?.substring(0, 5));
  console.log("Request body:", formBody);
  console.log("==============================");
  const response = await fetch(GARMIN_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formBody
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Garmin token exchange failed:", errorText);
    throw new Error(`Failed to exchange Garmin code: ${response.status}`);
  }
  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 7776e3,
    // Default 90 days
    athleteId: data.user_id
  };
}
async function refreshGarminToken(refreshToken) {
  const response = await fetch(GARMIN_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: GARMIN_CLIENT_ID,
      client_secret: GARMIN_CLIENT_SECRET
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Garmin token refresh failed:", errorText);
    throw new Error(`Failed to refresh Garmin token: ${response.status}`);
  }
  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 7776e3
  };
}
async function getGarminActivities(accessToken, startTime, endTime) {
  if (!startTime || !endTime) {
    throw new Error("Start and end times are required for Garmin activities fetch");
  }
  const startDate = startTime.toISOString().split("T")[0];
  const endDate = endTime.toISOString().split("T")[0];
  console.log(`\u{1F4C5} Fetching Garmin Connect activities from ${startDate} to ${endDate}`);
  const start = 0;
  const limit = 100;
  const startTimeSeconds = Math.floor(startTime.getTime() / 1e3);
  const endTimeSeconds = Math.floor(endTime.getTime() / 1e3);
  const url = `${GARMIN_API_BASE}/wellnessapi/rest/activities?uploadStartTimeInSeconds=${startTimeSeconds}&uploadEndTimeInSeconds=${endTimeSeconds}`;
  console.log(`\u{1F50D} Fetching from URL: ${url}`);
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  const responseText = await response.text();
  if (!response.ok) {
    console.error("Garmin Connect API error:", response.status);
    console.error("Response body (first 500 chars):", responseText.substring(0, 500));
    throw new Error(`Failed to fetch Garmin activities: ${response.status}`);
  }
  if (responseText.trim().startsWith("<")) {
    console.error("\u274C API returned HTML instead of JSON (likely redirect to login)");
    console.error("Response (first 500 chars):", responseText.substring(0, 500));
    throw new Error("API returned HTML - endpoint may be incorrect");
  }
  try {
    const data = JSON.parse(responseText);
    console.log(`\u{1F4CA} Garmin Connect API returned ${data.length || 0} activities`);
    return Array.isArray(data) ? data : [];
  } catch (parseError) {
    console.error("\u274C Failed to parse JSON response");
    console.error("Response (first 500 chars):", responseText.substring(0, 500));
    throw new Error("Invalid JSON response from API");
  }
}
async function getGarminActivityDetail(accessToken, activityId) {
  const response = await fetch(`${GARMIN_CONNECT_API}/activity-service/activity/${activityId}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Garmin activity detail API error:", response.status, errorText);
    throw new Error(`Failed to fetch Garmin activity detail: ${response.status}`);
  }
  return response.json();
}
async function getGarminDailySummary(accessToken, date) {
  const dateStr = date.toISOString().split("T")[0];
  const response = await fetch(`${GARMIN_CONNECT_API}/usersummary-service/usersummary/daily/${dateStr}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin daily summary: ${response.status}`);
  }
  return response.json();
}
async function getGarminSleepData(accessToken, startDate, endDate) {
  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailySleepData?date=${startDateStr}&nonSleepBufferMinutes=60`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin sleep data: ${response.status}`);
  }
  return response.json();
}
async function getGarminHeartRateData(accessToken, date) {
  const dateStr = date.toISOString().split("T")[0];
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailyHeartRate/${dateStr}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin heart rate data: ${response.status}`);
  }
  return response.json();
}
async function getGarminStressData(accessToken, date) {
  const dateStr = date.toISOString().split("T")[0];
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailyStress/${dateStr}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin stress data: ${response.status}`);
  }
  return response.json();
}
async function getGarminSleepDetails(accessToken, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  const params = new URLSearchParams({
    uploadStartTimeInSeconds: Math.floor(startOfDay.getTime() / 1e3).toString(),
    uploadEndTimeInSeconds: Math.floor(endOfDay.getTime() / 1e3).toString()
  });
  const response = await fetch(`${GARMIN_API_BASE}/wellness-api/rest/sleeps?${params}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin sleep details: ${response.status}`);
  }
  return response.json();
}
async function getGarminBodyBattery(accessToken, date) {
  const dateStr = date.toISOString().split("T")[0];
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/bodyBattery/${dateStr}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin Body Battery: ${response.status}`);
  }
  return response.json();
}
async function getGarminHRVData(accessToken, date) {
  const dateStr = date.toISOString().split("T")[0];
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/daily/hrv/${dateStr}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin HRV data: ${response.status}`);
  }
  return response.json();
}
async function getGarminRespirationData(accessToken, date) {
  const dateStr = date.toISOString().split("T")[0];
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailyRespiration/${dateStr}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin respiration data: ${response.status}`);
  }
  return response.json();
}
async function getGarminPulseOx(accessToken, date) {
  const dateStr = date.toISOString().split("T")[0];
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailySpo2/${dateStr}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin Pulse Ox: ${response.status}`);
  }
  return response.json();
}
async function getGarminUserStats(accessToken) {
  const response = await fetch(`${GARMIN_API_BASE}/wellness-api/rest/userStats`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin user stats: ${response.status}`);
  }
  return response.json();
}
async function getGarminComprehensiveWellness(accessToken, date) {
  const dateStr = date.toISOString().split("T")[0];
  const [sleepData, stressData, bodyBatteryData, hrvData, heartRateData] = await Promise.allSettled([
    getGarminSleepDetails(accessToken, date),
    getGarminStressData(accessToken, date),
    getGarminBodyBattery(accessToken, date),
    getGarminHRVData(accessToken, date),
    getGarminHeartRateData(accessToken, date)
  ]);
  let sleep = null;
  if (sleepData.status === "fulfilled" && sleepData.value?.length > 0) {
    const s = sleepData.value[0];
    const totalSleep = s.durationInSeconds || 0;
    sleep = {
      totalSleepSeconds: totalSleep,
      deepSleepSeconds: s.deepSleepDurationInSeconds || 0,
      lightSleepSeconds: s.lightSleepDurationInSeconds || 0,
      remSleepSeconds: s.remSleepInSeconds || 0,
      awakeSleepSeconds: s.awakeDurationInSeconds || 0,
      sleepScore: s.sleepScores?.overall?.value || 0,
      sleepQuality: getSleepQuality(totalSleep / 3600)
    };
  }
  let stress = null;
  if (stressData.status === "fulfilled" && stressData.value?.length > 0) {
    const st = stressData.value[0];
    stress = {
      averageStressLevel: st.averageStressLevel || 0,
      maxStressLevel: st.maxStressLevel || 0,
      stressDuration: st.stressDuration || 0,
      restDuration: st.restDuration || 0,
      activityDuration: st.activityDuration || 0,
      stressQualifier: getStressQualifier(st.averageStressLevel || 0)
    };
  }
  let bodyBattery = null;
  if (bodyBatteryData.status === "fulfilled" && bodyBatteryData.value?.length > 0) {
    const bb = bodyBatteryData.value[0];
    bodyBattery = {
      highestValue: bb.bodyBatteryHigh || 0,
      lowestValue: bb.bodyBatteryLow || 0,
      currentValue: bb.bodyBatteryMostRecentValue || 0,
      chargedValue: bb.bodyBatteryChargedValue || 0,
      drainedValue: bb.bodyBatteryDrainedValue || 0
    };
  }
  let hrv = null;
  if (hrvData.status === "fulfilled" && hrvData.value?.length > 0) {
    const h = hrvData.value[0];
    hrv = {
      weeklyAvg: h.weeklyAvg || 0,
      lastNightAvg: h.lastNightAvg || 0,
      lastNight5MinHigh: h.lastNight5MinHigh || 0,
      hrvStatus: h.status || "unknown",
      feedbackPhrase: h.feedbackPhrase || ""
    };
  }
  let heartRate = null;
  if (heartRateData.status === "fulfilled" && heartRateData.value?.length > 0) {
    const hr = heartRateData.value[0];
    heartRate = {
      restingHeartRate: hr.restingHeartRate || 0,
      minHeartRate: hr.minHeartRate || 0,
      maxHeartRate: hr.maxHeartRate || 0,
      averageHeartRate: hr.averageHeartRate || 0
    };
  }
  const readiness = calculateReadinessScore(sleep, stress, bodyBattery, hrv);
  return {
    date: dateStr,
    sleep,
    stress,
    bodyBattery,
    hrv,
    heartRate,
    readiness
  };
}
function getSleepQuality(hours) {
  if (hours >= 8) return "Excellent";
  if (hours >= 7) return "Good";
  if (hours >= 6) return "Fair";
  if (hours >= 5) return "Poor";
  return "Very Poor";
}
function getStressQualifier(level) {
  if (level <= 25) return "Resting";
  if (level <= 50) return "Low";
  if (level <= 75) return "Medium";
  return "High";
}
function calculateReadinessScore(sleep, stress, bodyBattery, hrv) {
  let score = 50;
  let factors = [];
  if (sleep) {
    const sleepHours = sleep.totalSleepSeconds / 3600;
    if (sleepHours >= 8) {
      score += 25;
    } else if (sleepHours >= 7) {
      score += 20;
    } else if (sleepHours >= 6) {
      score += 10;
    } else {
      factors.push("low sleep");
    }
  } else {
    factors.push("no sleep data");
  }
  if (stress) {
    if (stress.averageStressLevel <= 25) {
      score += 15;
    } else if (stress.averageStressLevel <= 50) {
      score += 10;
    } else if (stress.averageStressLevel > 75) {
      score -= 10;
      factors.push("high stress");
    }
  }
  if (bodyBattery) {
    if (bodyBattery.currentValue >= 75) {
      score += 10;
    } else if (bodyBattery.currentValue >= 50) {
      score += 5;
    } else if (bodyBattery.currentValue < 25) {
      score -= 5;
      factors.push("low energy");
    }
  }
  if (hrv && hrv.hrvStatus === "BALANCED") {
    score += 5;
  } else if (hrv && hrv.hrvStatus === "LOW") {
    score -= 5;
    factors.push("HRV below baseline");
  }
  score = Math.max(0, Math.min(100, score));
  let recommendation;
  if (score >= 80) {
    recommendation = "You are well-rested and ready for a challenging workout!";
  } else if (score >= 60) {
    recommendation = "Good readiness for a moderate intensity run.";
  } else if (score >= 40) {
    recommendation = "Consider a lighter recovery run today.";
  } else {
    recommendation = `Your body needs recovery. ${factors.length > 0 ? `Factors: ${factors.join(", ")}` : ""}`;
  }
  return { score, recommendation };
}
async function getGarminUserProfile(accessToken) {
  const response = await fetch(`${GARMIN_API_BASE}/wellness-api/rest/user/id`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin user profile: ${response.status}`);
  }
  return response.json();
}
function parseGarminActivity(activity) {
  return {
    activityId: activity.activityId?.toString() || activity.summaryId?.toString(),
    activityType: activity.activityType || "running",
    startTime: new Date(activity.startTimeInSeconds * 1e3),
    duration: activity.durationInSeconds || 0,
    distance: (activity.distanceInMeters || 0) / 1e3,
    // Convert to km
    calories: activity.activeKilocalories || activity.calories || 0,
    averageHeartRate: activity.averageHeartRateInBeatsPerMinute,
    maxHeartRate: activity.maxHeartRateInBeatsPerMinute,
    averagePace: activity.averageSpeedInMetersPerSecond ? 1e3 / activity.averageSpeedInMetersPerSecond / 60 : void 0,
    averageCadence: activity.averageRunCadenceInStepsPerMinute,
    elevationGain: activity.totalElevationGainInMeters,
    vo2Max: activity.vO2Max,
    trainingEffect: activity.trainingEffectLabel ? parseFloat(activity.trainingEffectLabel) : void 0,
    recoveryTime: activity.recoveryTimeInMinutes,
    polyline: activity.polyline,
    runningDynamics: activity.avgVerticalOscillation ? {
      verticalOscillation: activity.avgVerticalOscillation,
      groundContactTime: activity.avgGroundContactTime,
      groundContactTimeBalance: activity.avgGroundContactBalance,
      strideLength: activity.avgStrideLength,
      verticalRatio: activity.avgVerticalRatio
    } : void 0
  };
}
async function syncGarminActivities(userId, accessToken, startDateISO, endDateISO) {
  console.log(`\u{1F4E5} Starting Garmin activity sync for user ${userId}`);
  console.log(`\u{1F4C5} Date range: ${startDateISO} to ${endDateISO}`);
  const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  const { runs: runs2, connectedDevices: connectedDevices2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
  const { eq: eq7, and: and7, gte: gte5, lte: lte3 } = await import("drizzle-orm");
  let syncedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  try {
    const deviceRecords = await db2.select().from(connectedDevices2).where(
      and7(
        eq7(connectedDevices2.userId, userId),
        eq7(connectedDevices2.deviceType, "garmin")
      )
    ).limit(1);
    let currentAccessToken = accessToken;
    if (deviceRecords.length > 0) {
      const device = deviceRecords[0];
      const expiresAt = device.tokenExpiresAt;
      const now = /* @__PURE__ */ new Date();
      if (expiresAt && expiresAt <= new Date(now.getTime() + 5 * 60 * 1e3)) {
        console.log("\u{1F504} Access token expired or expiring soon, refreshing...");
        try {
          const tokens = await refreshGarminToken(device.refreshToken);
          currentAccessToken = tokens.accessToken;
          await db2.update(connectedDevices2).set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1e3)
          }).where(eq7(connectedDevices2.id, device.id));
          console.log("\u2705 Token refreshed successfully");
        } catch (refreshError) {
          console.error("\u274C Failed to refresh token:", refreshError.message);
          throw new Error("Token expired and refresh failed. Please reconnect Garmin.");
        }
      }
    }
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);
    console.log("\u{1F504} Fetching activities from Garmin API (day by day)...");
    const allActivities = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);
      if (dayStart > /* @__PURE__ */ new Date()) break;
      try {
        console.log(`\u{1F4C5} Fetching day: ${dayStart.toISOString().split("T")[0]}`);
        const dailyActivities = await getGarminActivities(currentAccessToken, dayStart, dayEnd);
        const activities2 = Array.isArray(dailyActivities) ? dailyActivities : dailyActivities.activities || [];
        allActivities.push(...activities2);
        console.log(`   Found ${activities2.length} activities`);
        await new Promise((resolve2) => setTimeout(resolve2, 500));
      } catch (error) {
        console.error(`\u26A0\uFE0F  Failed to fetch activities for ${dayStart.toISOString().split("T")[0]}:`, error.message);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    console.log(`\u{1F4CA} Total activities fetched: ${allActivities.length}`);
    const activities = allActivities;
    if (activities.length > 0) {
      console.log("\u{1F4DD} Sample activity structure:", JSON.stringify(activities[0], null, 2).substring(0, 500));
    }
    const runningActivities = activities.filter((act) => {
      const typeName = (act.activityType?.activityTypeKey || act.activityType || act.sport || "").toLowerCase();
      const actName = (act.activityName || "").toLowerCase();
      return typeName.includes("run") || actName.includes("run");
    });
    console.log(`\u{1F3C3} ${runningActivities.length} running activities to process`);
    for (const activity of runningActivities) {
      try {
        const activityId = activity.activityId || activity.id;
        const activityDate = new Date(activity.startTimeGMT || activity.beginTimestamp);
        const existing = await db2.select().from(runs2).where(
          and7(
            eq7(runs2.userId, userId),
            eq7(runs2.externalId, activityId.toString())
          )
        ).limit(1);
        if (existing.length > 0) {
          console.log(`\u23ED\uFE0F  Activity ${activityId} already exists, skipping`);
          skippedCount++;
          continue;
        }
        console.log(`\u{1F50D} Fetching details for activity ${activityId}...`);
        let activityDetail = null;
        try {
          activityDetail = await getGarminActivityDetail(currentAccessToken, activityId);
        } catch (detailError) {
          console.warn(`\u26A0\uFE0F  Could not fetch details for ${activityId}: ${detailError.message}`);
        }
        const distance = (activity.distance || 0) / 1e3;
        const duration = (activity.duration || activity.movingDuration || 0) * 1e3;
        const avgPace = distance > 0 && duration > 0 ? formatPace(duration / 1e3 / distance) : null;
        const avgHeartRate = activity.averageHR || activityDetail?.averageHR || null;
        const maxHeartRate = activity.maxHR || activityDetail?.maxHR || null;
        const calories = activity.calories || activityDetail?.calories || null;
        const avgCadence = activity.averageRunCadence || activityDetail?.avgRunCadence || null;
        const elevationGain = activity.elevationGain || activityDetail?.elevationGain || null;
        const elevationLoss = activity.elevationLoss || activityDetail?.elevationLoss || null;
        const gpsTrack = activityDetail?.geoPolylineDTO?.polyline || activityDetail?.summaryPolyline || activity.summaryPolyline || null;
        const heartRateData = activityDetail?.heartRateSamples || activityDetail?.timeSeriesData?.heartRate || null;
        const paceData = activityDetail?.timeSeriesData?.speed || activityDetail?.speedSamples || null;
        const kmSplits = activityDetail?.laps?.map((lap, index) => ({
          km: index + 1,
          time: lap.duration,
          pace: formatPace(lap.duration / (lap.distance / 1e3)),
          avgHeartRate: lap.averageHR,
          maxHeartRate: lap.maxHR,
          cadence: lap.avgRunCadence,
          elevation: lap.elevationGain
        })) || null;
        const startLat = activity.startLatitude || activityDetail?.startLatitude || null;
        const startLng = activity.startLongitude || activityDetail?.startLongitude || null;
        const activityName = activity.activityName || `${activity.activityType || "Run"} - ${activityDate.toLocaleDateString()}`;
        console.log(`\u{1F4BE} Saving activity ${activityId} to database...`);
        await db2.insert(runs2).values({
          userId,
          externalId: activityId.toString(),
          externalSource: "garmin",
          distance,
          duration: Math.floor(duration),
          avgPace,
          avgHeartRate,
          maxHeartRate,
          minHeartRate: activityDetail?.minHR || null,
          calories,
          cadence: avgCadence,
          elevation: elevationGain,
          elevationGain,
          elevationLoss,
          difficulty: determineDifficulty2(distance, duration, elevationGain),
          startLat,
          startLng,
          gpsTrack: gpsTrack ? { encoded: gpsTrack } : null,
          heartRateData: heartRateData ? { samples: heartRateData } : null,
          paceData: paceData ? { samples: paceData } : null,
          kmSplits,
          completedAt: activityDate,
          name: activityName,
          aiCoachEnabled: false,
          runDate: activityDate.toISOString().split("T")[0],
          runTime: activityDate.toTimeString().split(" ")[0],
          terrainType: activity.activityType || "road",
          isPublic: false
        });
        syncedCount++;
        console.log(`\u2705 Successfully synced activity ${activityId}`);
      } catch (activityError) {
        console.error(`\u274C Error syncing activity: ${activityError.message}`);
        errorCount++;
      }
    }
    console.log(`
\u{1F4CA} Sync complete: ${syncedCount} synced, ${skippedCount} skipped, ${errorCount} errors`);
    return { synced: syncedCount, skipped: skippedCount, errors: errorCount };
  } catch (error) {
    console.error("\u274C Fatal error during Garmin sync:", error);
    throw error;
  }
}
function formatPace(secondsPerKm) {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
function determineDifficulty2(distanceKm, durationMs, elevationGain) {
  const avgPaceMinPerKm = durationMs / 1e3 / distanceKm / 60;
  const elevation = elevationGain || 0;
  if (avgPaceMinPerKm > 7 && elevation < 100) return "easy";
  if (avgPaceMinPerKm < 4.5 || elevation > 300) return "hard";
  return "moderate";
}
function generateTCXFile(runData) {
  const {
    id,
    userId,
    startTime,
    duration,
    // milliseconds
    distance,
    // meters
    avgPace,
    // min/km
    calories,
    avgHeartRate,
    maxHeartRate,
    routePoints,
    // Array of { latitude, longitude, altitude, speed, timestamp, heartRate }
    splits
  } = runData;
  const startDate = new Date(startTime);
  const endDate = new Date(startDate.getTime() + duration);
  let tcx = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>${startDate.toISOString()}</Id>
      <Lap StartTime="${startDate.toISOString()}">
        <TotalTimeSeconds>${(duration / 1e3).toFixed(2)}</TotalTimeSeconds>
        <DistanceMeters>${distance.toFixed(2)}</DistanceMeters>
        <Calories>${calories || 0}</Calories>
        <AverageHeartRateBpm>
          <Value>${avgHeartRate || 0}</Value>
        </AverageHeartRateBpm>
        <MaximumHeartRateBpm>
          <Value>${maxHeartRate || 0}</Value>
        </MaximumHeartRateBpm>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>`;
  if (routePoints && routePoints.length > 0) {
    routePoints.forEach((point) => {
      tcx += `
          <Trackpoint>
            <Time>${new Date(point.timestamp || startTime).toISOString()}</Time>`;
      if (point.latitude && point.longitude) {
        tcx += `
            <Position>
              <LatitudeDegrees>${point.latitude}</LatitudeDegrees>
              <LongitudeDegrees>${point.longitude}</LongitudeDegrees>
            </Position>`;
      }
      if (point.altitude) {
        tcx += `
            <AltitudeMeters>${point.altitude}</AltitudeMeters>`;
      }
      if (point.heartRate) {
        tcx += `
            <HeartRateBpm>
              <Value>${point.heartRate}</Value>
            </HeartRateBpm>`;
      }
      tcx += `
          </Trackpoint>`;
    });
  } else {
    tcx += `
          <Trackpoint>
            <Time>${startDate.toISOString()}</Time>
            <HeartRateBpm>
              <Value>${avgHeartRate || 0}</Value>
            </HeartRateBpm>
          </Trackpoint>`;
  }
  tcx += `
        </Track>
      </Lap>
      <Notes>Uploaded from AI Run Coach</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
  return tcx;
}
async function uploadActivityToGarmin(accessToken, tcxData, activityName) {
  try {
    console.log("\u{1F4E4} Uploading activity to Garmin Connect...");
    const uploadUrl = `${GARMIN_API_BASE}/upload-service/upload/.tcx`;
    const FormData = __require("form-data");
    const form = new FormData();
    form.append("file", Buffer.from(tcxData), {
      filename: `activity_${Date.now()}.tcx`,
      contentType: "application/xml"
    });
    if (activityName) {
      form.append("activityName", activityName);
    }
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        ...form.getHeaders(),
        "Authorization": `Bearer ${accessToken}`
      },
      body: form
    });
    const responseText = await response.text();
    if (!response.ok) {
      console.error("\u274C Garmin upload failed:", response.status, responseText);
      return {
        success: false,
        error: `Upload failed: ${response.status} ${responseText}`
      };
    }
    let garminActivityId;
    try {
      const jsonResponse = JSON.parse(responseText);
      garminActivityId = jsonResponse.detailedImportResult?.successes?.[0]?.internalId;
    } catch (e) {
      console.log("Upload response (non-JSON):", responseText);
    }
    console.log("\u2705 Activity uploaded to Garmin Connect successfully");
    if (garminActivityId) {
      console.log(`   Garmin Activity ID: ${garminActivityId}`);
    }
    return {
      success: true,
      garminActivityId
    };
  } catch (error) {
    console.error("\u274C Error uploading to Garmin:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
async function uploadRunToGarmin(userId, runData, accessToken, refreshToken, tokenExpiresAt) {
  try {
    let currentAccessToken = accessToken;
    const now = /* @__PURE__ */ new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1e3);
    if (!tokenExpiresAt || new Date(tokenExpiresAt) < fiveMinutesFromNow) {
      console.log("\u{1F504} Access token expired or expiring soon, refreshing...");
      const tokenData = await refreshGarminToken(refreshToken);
      currentAccessToken = tokenData.accessToken;
      await db.execute(sql7`
        UPDATE connected_devices
        SET 
          access_token = ${tokenData.accessToken},
          refresh_token = ${tokenData.refreshToken},
          token_expires_at = ${tokenData.expiresAt}
        WHERE user_id = ${userId} AND device_type = 'garmin' AND is_active = true
      `);
      console.log("\u2705 Token refreshed successfully for upload");
    }
    const tcxData = generateTCXFile(runData);
    const activityName = `AI Run Coach - ${new Date(runData.startTime).toLocaleDateString()}`;
    const result = await uploadActivityToGarmin(currentAccessToken, tcxData, activityName);
    if (result.success && result.garminActivityId) {
      await db.execute(sql7`
        UPDATE runs
        SET 
          uploaded_to_garmin = true,
          garmin_activity_id = ${result.garminActivityId}
        WHERE id = ${runData.id}
      `);
    }
    return result;
  } catch (error) {
    console.error("\u274C Error in uploadRunToGarmin:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
var GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET, GARMIN_AUTH_URL, GARMIN_TOKEN_URL, GARMIN_API_BASE, GARMIN_CONNECT_API, garmin_service_default;
var init_garmin_service = __esm({
  "server/garmin-service.ts"() {
    "use strict";
    init_db();
    GARMIN_CLIENT_ID = process.env.GARMIN_CLIENT_ID;
    GARMIN_CLIENT_SECRET = process.env.GARMIN_CLIENT_SECRET;
    GARMIN_AUTH_URL = "https://connect.garmin.com/oauth2Confirm";
    GARMIN_TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
    GARMIN_API_BASE = "https://apis.garmin.com";
    GARMIN_CONNECT_API = "https://connect.garmin.com/modern/proxy";
    garmin_service_default = {
      getGarminAuthUrl,
      exchangeGarminCode,
      refreshGarminToken,
      getGarminActivities,
      getGarminActivityDetail,
      syncGarminActivities,
      getGarminDailySummary,
      getGarminSleepData,
      getGarminSleepDetails,
      getGarminHeartRateData,
      getGarminStressData,
      getGarminBodyBattery,
      getGarminHRVData,
      getGarminRespirationData,
      getGarminPulseOx,
      getGarminUserStats,
      getGarminComprehensiveWellness,
      getGarminUserProfile,
      parseGarminActivity,
      generateTCXFile,
      uploadActivityToGarmin,
      uploadRunToGarmin
    };
  }
});

// server/share-image-service.ts
var share_image_service_exports = {};
__export(share_image_service_exports, {
  STICKER_WIDGETS: () => STICKER_WIDGETS,
  TEMPLATES: () => TEMPLATES,
  generateShareImage: () => generateShareImage
});
import sharp from "sharp";
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function formatDate(dateStr) {
  if (!dateStr) return (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function buildWatermark(w, h) {
  const logoY = h - 50;
  return `
    <rect x="0" y="${logoY - 10}" width="${w}" height="60" fill="${COLORS.bgRoot}" opacity="0.7"/>
    <text x="${w / 2}" y="${logoY + 22}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="${COLORS.primary}" text-anchor="middle" letter-spacing="2">
      AI RUN COACH
    </text>
  `;
}
function buildStatBox(x, y, w, h, label, value, unit, color) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${COLORS.bgSecondary}" opacity="0.9"/>
    <text x="${x + w / 2}" y="${y + 28}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle" letter-spacing="1">${escapeXml(label.toUpperCase())}</text>
    <text x="${x + w / 2}" y="${y + h / 2 + 14}" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="${color}" text-anchor="middle">${escapeXml(value)}</text>
    ${unit ? `<text x="${x + w / 2}" y="${y + h - 16}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(unit)}</text>` : ""}
  `;
}
function buildMiniChart(x, y, w, h, data, color, label) {
  if (!data || data.length < 2) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const chartH = h - 40;
  const chartY = y + 30;
  const stepX = w / (data.length - 1);
  const points = data.map((v, i) => {
    const px = x + i * stepX;
    const py = chartY + chartH - (v - min) / range * chartH;
    return `${px},${py}`;
  }).join(" ");
  const areaPoints = `${x},${chartY + chartH} ${points} ${x + w},${chartY + chartH}`;
  return `
    <text x="${x}" y="${y + 16}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${COLORS.textMuted}" letter-spacing="0.5">${escapeXml(label.toUpperCase())}</text>
    <polygon points="${areaPoints}" fill="${color}" opacity="0.15"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}
function buildGpsRoute(x, y, w, h, track) {
  if (!track || track.length < 2) return "";
  const lats = track.map((p) => p.lat);
  const lngs = track.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 1e-3;
  const lngRange = maxLng - minLng || 1e-3;
  const padding = 30;
  const drawW = w - padding * 2;
  const drawH = h - padding * 2;
  const scale = Math.min(drawW / lngRange, drawH / latRange);
  const offsetX = x + padding + (drawW - lngRange * scale) / 2;
  const offsetY = y + padding + (drawH - latRange * scale) / 2;
  const points = track.map((p) => {
    const px = offsetX + (p.lng - minLng) * scale;
    const py = offsetY + (maxLat - p.lat) * scale;
    return `${px},${py}`;
  }).join(" ");
  const startPt = track[0];
  const endPt = track[track.length - 1];
  const sx = offsetX + (startPt.lng - minLng) * scale;
  const sy = offsetY + (maxLat - startPt.lat) * scale;
  const ex = offsetX + (endPt.lng - minLng) * scale;
  const ey = offsetY + (maxLat - endPt.lat) * scale;
  return `
    <polyline points="${points}" fill="none" stroke="url(#routeGrad)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${sx}" cy="${sy}" r="8" fill="${COLORS.success}" stroke="${COLORS.bgRoot}" stroke-width="3"/>
    <circle cx="${ex}" cy="${ey}" r="8" fill="${COLORS.error}" stroke="${COLORS.bgRoot}" stroke-width="3"/>
  `;
}
function buildStickerSvg(sticker, run, canvasW, canvasH) {
  const px = Math.round(sticker.x * canvasW);
  const py = Math.round(sticker.y * canvasH);
  const s = sticker.scale || 1;
  const sw = Math.round(200 * s);
  const sh = Math.round(100 * s);
  const fontSize = Math.round(28 * s);
  const labelSize = Math.round(12 * s);
  let value = "";
  let unit = "";
  let label = "";
  let color = COLORS.primary;
  switch (sticker.widgetId) {
    case "stat-distance":
      value = run.distance?.toFixed(2) || "0";
      unit = "km";
      label = "DISTANCE";
      color = COLORS.primary;
      break;
    case "stat-duration":
      value = formatDuration(run.duration || 0);
      unit = "";
      label = "DURATION";
      color = COLORS.primary;
      break;
    case "stat-pace":
      value = run.avgPace || "--:--";
      unit = "/km";
      label = "AVG PACE";
      color = COLORS.accent;
      break;
    case "stat-heartrate":
      value = run.avgHeartRate?.toString() || "--";
      unit = "bpm";
      label = "AVG HR";
      color = COLORS.error;
      break;
    case "stat-calories":
      value = run.calories?.toString() || "--";
      unit = "kcal";
      label = "CALORIES";
      color = COLORS.warning;
      break;
    case "stat-elevation":
      value = Math.round(run.elevationGain || run.elevation || 0).toString();
      unit = "m";
      label = "ELEVATION";
      color = COLORS.success;
      break;
    case "stat-cadence":
      value = run.cadence?.toString() || "--";
      unit = "spm";
      label = "CADENCE";
      color = COLORS.primary;
      break;
    case "stat-maxhr":
      value = run.maxHeartRate?.toString() || "--";
      unit = "bpm";
      label = "MAX HR";
      color = COLORS.error;
      break;
    case "chart-elevation": {
      if (!run.paceData || run.paceData.length < 2) return "";
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const elevData = run.paceData.map((_, i) => {
        const gps = run.gpsTrack;
        if (gps && gps.length > i) {
          const point = gps[Math.floor(i / run.paceData.length * gps.length)];
          return point?.elevation || 0;
        }
        return 0;
      });
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, elevData, COLORS.success, "Elevation")}</g>`;
    }
    case "chart-pace": {
      if (!run.paceData || run.paceData.length < 2) return "";
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const paceValues = run.paceData.map((p) => p.paceSeconds);
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, paceValues, COLORS.accent, "Pace /km")}</g>`;
    }
    case "chart-heartrate": {
      if (!run.heartRateData || run.heartRateData.length < 2) return "";
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const hrSampled = sampleData(run.heartRateData.map((h) => h.value), 30);
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, hrSampled, COLORS.error, "Heart Rate")}</g>`;
    }
    case "badge-difficulty": {
      const diff = run.difficulty || "moderate";
      const diffColors = {
        easy: COLORS.success,
        moderate: COLORS.warning,
        challenging: COLORS.accent,
        hard: COLORS.accent,
        extreme: COLORS.error
      };
      const dc = diffColors[diff] || COLORS.warning;
      const bw = Math.round(160 * s);
      const bh = Math.round(48 * s);
      return `
        <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${dc}" opacity="0.2" stroke="${dc}" stroke-width="2"/>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 5}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(16 * s)}" font-weight="600" fill="${dc}" text-anchor="middle">${escapeXml(diff.toUpperCase())}</text>
      `;
    }
    case "badge-weather": {
      if (!run.weatherData?.temperature) return "";
      const bw = Math.round(180 * s);
      const bh = Math.round(48 * s);
      const weatherText = `${Math.round(run.weatherData.temperature)}\xB0C ${run.weatherData.conditions || ""}`.trim();
      return `
        <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${COLORS.bgSecondary}" opacity="0.9" stroke="${COLORS.border}" stroke-width="1"/>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 5}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(14 * s)}" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(weatherText)}</text>
      `;
    }
    default:
      return "";
  }
  return `
    <rect x="${px}" y="${py}" width="${sw}" height="${sh}" rx="${Math.round(12 * s)}" fill="${COLORS.bgSecondary}" opacity="0.9"/>
    <text x="${px + sw / 2}" y="${py + labelSize + 8}" font-family="Arial, Helvetica, sans-serif" font-size="${labelSize}" fill="${COLORS.textMuted}" text-anchor="middle" letter-spacing="0.5">${label}</text>
    <text x="${px + sw / 2}" y="${py + sh / 2 + fontSize * 0.35}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="${color}" text-anchor="middle">${escapeXml(value)}</text>
    ${unit ? `<text x="${px + sw / 2}" y="${py + sh - Math.round(8 * s)}" font-family="Arial, Helvetica, sans-serif" font-size="${labelSize}" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(unit)}</text>` : ""}
  `;
}
function sampleData(data, maxPoints) {
  if (data.length <= maxPoints) return data;
  const step = data.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(data[Math.floor(i * step)]);
  }
  return result;
}
function buildStatsGridSvg(w, h, run, userName) {
  const isVertical = h > w;
  const headerY = isVertical ? 120 : 80;
  const statsStartY = headerY + 120;
  const gap = 16;
  const cols = 2;
  const boxW = (w - gap * 3) / cols;
  const boxH = isVertical ? 130 : 120;
  const stats = [
    { label: "Distance", value: run.distance?.toFixed(2) || "0", unit: "km", color: COLORS.primary },
    { label: "Duration", value: formatDuration(run.duration || 0), unit: "", color: COLORS.primary },
    { label: "Avg Pace", value: run.avgPace || "--:--", unit: "/km", color: COLORS.accent },
    { label: "Heart Rate", value: run.avgHeartRate?.toString() || "--", unit: "bpm", color: COLORS.error },
    { label: "Calories", value: run.calories?.toString() || "--", unit: "kcal", color: COLORS.warning },
    { label: "Elevation", value: Math.round(run.elevationGain || run.elevation || 0).toString(), unit: "m", color: COLORS.success }
  ];
  let boxes = "";
  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = gap + col * (boxW + gap);
    const by = statsStartY + row * (boxH + gap);
    if (by + boxH < h - 60) {
      boxes += buildStatBox(bx, by, boxW, boxH, s.label, s.value, s.unit, s.color);
    }
  });
  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0D1117"/>
        <stop offset="100%" stop-color="#0A0F1A"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    <text x="${w / 2}" y="${headerY}" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(formatDate(run.completedAt))}</text>
    <text x="${w / 2}" y="${headerY + 55}" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${escapeXml(run.distance?.toFixed(2) || "0")} km</text>
    ${userName ? `<text x="${w / 2}" y="${headerY + 85}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(userName)}</text>` : ""}
    ${boxes}
    ${buildWatermark(w, h)}
  `;
}
function buildRouteMapSvg(w, h, run, userName) {
  const mapH = h > w ? h * 0.55 : h * 0.6;
  const statsY = mapH + 20;
  const gap = 12;
  const statW = (w - gap * 4) / 3;
  const statH = 90;
  const routeSvg = run.gpsTrack && run.gpsTrack.length > 1 ? buildGpsRoute(20, 20, w - 40, mapH - 40, run.gpsTrack) : `<text x="${w / 2}" y="${mapH / 2}" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${COLORS.textMuted}" text-anchor="middle">No GPS data</text>`;
  const stats = [
    { label: "Distance", value: `${run.distance?.toFixed(2) || "0"}`, unit: "km", color: COLORS.primary },
    { label: "Pace", value: run.avgPace || "--:--", unit: "/km", color: COLORS.accent },
    { label: "Time", value: formatDuration(run.duration || 0), unit: "", color: COLORS.primary }
  ];
  let statBoxes = "";
  stats.forEach((s, i) => {
    const sx = gap + i * (statW + gap);
    statBoxes += buildStatBox(sx, statsY, statW, statH, s.label, s.value, s.unit, s.color);
  });
  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0D1117"/>
        <stop offset="100%" stop-color="#0A0F1A"/>
      </linearGradient>
      <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${COLORS.primary}"/>
        <stop offset="100%" stop-color="${COLORS.success}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    ${routeSvg}
    ${statBoxes}
    ${userName ? `<text x="${w / 2}" y="${statsY + statH + 40}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(userName)} \u2022 ${escapeXml(formatDate(run.completedAt))}</text>` : ""}
    ${buildWatermark(w, h)}
  `;
}
function buildSplitSummarySvg(w, h, run, userName) {
  const headerY = 80;
  const splitsStartY = headerY + 100;
  const rowH = 52;
  const maxSplits = Math.min(run.paceData?.length || 0, Math.floor((h - splitsStartY - 120) / rowH));
  let splitRows = "";
  const paceData = run.paceData || [];
  const paceValues = paceData.map((p) => p.paceSeconds);
  const minPace = Math.min(...paceValues);
  const maxPace = Math.max(...paceValues);
  const paceRange = maxPace - minPace || 1;
  for (let i = 0; i < maxSplits; i++) {
    const split = paceData[i];
    const ry = splitsStartY + i * rowH;
    const barMaxW = w * 0.4;
    const barW = barMaxW * (1 - (split.paceSeconds - minPace) / paceRange * 0.6);
    const paceColor = split.paceSeconds <= minPace + paceRange * 0.33 ? COLORS.success : split.paceSeconds <= minPace + paceRange * 0.66 ? COLORS.warning : COLORS.accent;
    splitRows += `
      <text x="40" y="${ry + 30}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textSecondary}">Km ${split.km}</text>
      <rect x="${w * 0.3}" y="${ry + 10}" width="${barW}" height="28" rx="14" fill="${paceColor}" opacity="0.3"/>
      <rect x="${w * 0.3}" y="${ry + 10}" width="${barW * 0.8}" height="28" rx="14" fill="${paceColor}" opacity="0.6"/>
      <text x="${w - 40}" y="${ry + 30}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="${paceColor}" text-anchor="end">${escapeXml(split.pace)}</text>
    `;
    if (i < maxSplits - 1) {
      splitRows += `<line x1="40" y1="${ry + rowH}" x2="${w - 40}" y2="${ry + rowH}" stroke="${COLORS.border}" stroke-width="1"/>`;
    }
  }
  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0D1117"/>
        <stop offset="100%" stop-color="#0A0F1A"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    <text x="${w / 2}" y="${headerY}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(formatDate(run.completedAt))}</text>
    <text x="${w / 2}" y="${headerY + 50}" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${escapeXml(run.distance?.toFixed(2) || "0")} km \u2014 ${escapeXml(formatDuration(run.duration || 0))}</text>
    <text x="${w / 2}" y="${headerY + 80}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle" letter-spacing="2">KM SPLITS</text>
    ${splitRows}
    ${userName ? `<text x="${w / 2}" y="${h - 70}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(userName)}</text>` : ""}
    ${buildWatermark(w, h)}
  `;
}
function buildAchievementSvg(w, h, run, userName) {
  const centerY = h / 2;
  const circleR = Math.min(w, h) * 0.22;
  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0D1117"/>
        <stop offset="50%" stop-color="#111827"/>
        <stop offset="100%" stop-color="#0A0F1A"/>
      </linearGradient>
      <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${COLORS.primary}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${COLORS.primary}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    <circle cx="${w / 2}" cy="${centerY - 30}" r="${circleR + 40}" fill="url(#glowGrad)"/>
    <circle cx="${w / 2}" cy="${centerY - 30}" r="${circleR}" fill="none" stroke="${COLORS.primary}" stroke-width="4" opacity="0.6"/>
    <circle cx="${w / 2}" cy="${centerY - 30}" r="${circleR - 8}" fill="none" stroke="${COLORS.primary}" stroke-width="2" opacity="0.3"/>
    <text x="${w / 2}" y="${centerY - 60}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle" letter-spacing="3">RUN COMPLETE</text>
    <text x="${w / 2}" y="${centerY}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${escapeXml(run.distance?.toFixed(2) || "0")}</text>
    <text x="${w / 2}" y="${centerY + 35}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${COLORS.primary}" text-anchor="middle">KILOMETERS</text>
    <text x="${w * 0.25}" y="${centerY + circleR + 60}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle">PACE</text>
    <text x="${w * 0.25}" y="${centerY + circleR + 90}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${COLORS.accent}" text-anchor="middle">${escapeXml(run.avgPace || "--:--")}</text>
    <text x="${w * 0.5}" y="${centerY + circleR + 60}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle">TIME</text>
    <text x="${w * 0.5}" y="${centerY + circleR + 90}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${COLORS.primary}" text-anchor="middle">${escapeXml(formatDuration(run.duration || 0))}</text>
    <text x="${w * 0.75}" y="${centerY + circleR + 60}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle">AVG HR</text>
    <text x="${w * 0.75}" y="${centerY + circleR + 90}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${COLORS.error}" text-anchor="middle">${run.avgHeartRate || "--"}</text>
    ${userName ? `<text x="${w / 2}" y="${centerY - circleR - 50}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600" fill="${COLORS.text}" text-anchor="middle">${escapeXml(userName)}</text>` : ""}
    <text x="${w / 2}" y="${centerY - circleR - 25}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(formatDate(run.completedAt))}</text>
    ${buildWatermark(w, h)}
  `;
}
function buildMinimalSvg(w, h, run, userName) {
  const centerY = h / 2;
  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0A0F1A"/>
        <stop offset="40%" stop-color="#111827"/>
        <stop offset="100%" stop-color="#0D1117"/>
      </linearGradient>
      <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${COLORS.primary}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${COLORS.primary}"/>
        <stop offset="100%" stop-color="${COLORS.primary}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    <line x1="${w * 0.15}" y1="${centerY - 70}" x2="${w * 0.85}" y2="${centerY - 70}" stroke="url(#accentLine)" stroke-width="2"/>
    <text x="${w / 2}" y="${centerY - 20}" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${escapeXml(run.distance?.toFixed(2) || "0")}</text>
    <text x="${w / 2}" y="${centerY + 30}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${COLORS.primary}" text-anchor="middle" letter-spacing="6">KILOMETERS</text>
    <line x1="${w * 0.15}" y1="${centerY + 60}" x2="${w * 0.85}" y2="${centerY + 60}" stroke="url(#accentLine)" stroke-width="2"/>
    <text x="${w * 0.33}" y="${centerY + 110}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(formatDuration(run.duration || 0))}</text>
    <text x="${w * 0.66}" y="${centerY + 110}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(run.avgPace || "--:--")} /km</text>
    ${userName ? `<text x="${w / 2}" y="${centerY - 100}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(userName)} \u2022 ${escapeXml(formatDate(run.completedAt))}</text>` : `<text x="${w / 2}" y="${centerY - 100}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(formatDate(run.completedAt))}</text>`}
    ${buildWatermark(w, h)}
  `;
}
async function generateShareImage(req) {
  const template = TEMPLATES.find((t) => t.id === req.templateId);
  if (!template) throw new Error(`Template not found: ${req.templateId}`);
  const dims = ASPECT_DIMENSIONS[req.aspectRatio] || ASPECT_DIMENSIONS["1:1"];
  const { width: w, height: h } = dims;
  let svgContent;
  switch (template.id) {
    case "stats-grid":
      svgContent = buildStatsGridSvg(w, h, req.runData, req.userName);
      break;
    case "route-map":
      svgContent = buildRouteMapSvg(w, h, req.runData, req.userName);
      break;
    case "split-summary":
      svgContent = buildSplitSummarySvg(w, h, req.runData, req.userName);
      break;
    case "achievement":
      svgContent = buildAchievementSvg(w, h, req.runData, req.userName);
      break;
    case "minimal-dark":
      svgContent = buildMinimalSvg(w, h, req.runData, req.userName);
      break;
    default:
      svgContent = buildStatsGridSvg(w, h, req.runData, req.userName);
  }
  let stickersSvg = "";
  if (req.stickers && req.stickers.length > 0) {
    stickersSvg = req.stickers.map((s) => buildStickerSvg(s, req.runData, w, h)).join("\n");
  }
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${svgContent}
    ${stickersSvg}
  </svg>`;
  const buffer = await sharp(Buffer.from(fullSvg)).png({ quality: 95 }).toBuffer();
  return buffer;
}
var ASPECT_DIMENSIONS, COLORS, TEMPLATES, STICKER_WIDGETS;
var init_share_image_service = __esm({
  "server/share-image-service.ts"() {
    "use strict";
    ASPECT_DIMENSIONS = {
      "1:1": { width: 1080, height: 1080 },
      "9:16": { width: 1080, height: 1920 },
      "4:5": { width: 1080, height: 1350 }
    };
    COLORS = {
      primary: "#00D4FF",
      primaryDark: "#00B8E6",
      accent: "#FF6B35",
      success: "#00E676",
      warning: "#FFB300",
      error: "#FF5252",
      bgRoot: "#0A0F1A",
      bgDefault: "#111827",
      bgSecondary: "#1F2937",
      bgTertiary: "#374151",
      text: "#FFFFFF",
      textSecondary: "#A0AEC0",
      textMuted: "#718096",
      border: "#2D3748"
    };
    TEMPLATES = [
      {
        id: "stats-grid",
        name: "Stats Grid",
        description: "Clean grid showing your key run metrics",
        category: "stats",
        preview: "grid",
        aspectRatios: ["1:1", "9:16", "4:5"]
      },
      {
        id: "route-map",
        name: "Route Map",
        description: "Your GPS route with stats overlay",
        category: "map",
        preview: "map",
        aspectRatios: ["1:1", "9:16", "4:5"]
      },
      {
        id: "split-summary",
        name: "Split Summary",
        description: "Km splits with pace visualization",
        category: "splits",
        preview: "splits",
        aspectRatios: ["9:16", "4:5"]
      },
      {
        id: "achievement",
        name: "Achievement",
        description: "Celebrate your personal bests and milestones",
        category: "achievement",
        preview: "achievement",
        aspectRatios: ["1:1", "9:16", "4:5"]
      },
      {
        id: "minimal-dark",
        name: "Minimal Dark",
        description: "Single big stat with gradient background",
        category: "minimal",
        preview: "minimal",
        aspectRatios: ["1:1", "9:16", "4:5"]
      }
    ];
    STICKER_WIDGETS = [
      { id: "stat-distance", type: "stat", category: "metrics", label: "Distance", icon: "map-pin" },
      { id: "stat-duration", type: "stat", category: "metrics", label: "Duration", icon: "clock" },
      { id: "stat-pace", type: "stat", category: "metrics", label: "Avg Pace", icon: "zap" },
      { id: "stat-heartrate", type: "stat", category: "metrics", label: "Avg Heart Rate", icon: "heart" },
      { id: "stat-calories", type: "stat", category: "metrics", label: "Calories", icon: "activity" },
      { id: "stat-elevation", type: "stat", category: "metrics", label: "Elevation", icon: "trending-up" },
      { id: "stat-cadence", type: "stat", category: "metrics", label: "Cadence", icon: "repeat" },
      { id: "stat-maxhr", type: "stat", category: "metrics", label: "Max Heart Rate", icon: "heart" },
      { id: "chart-elevation", type: "chart", category: "charts", label: "Elevation Profile", icon: "bar-chart" },
      { id: "chart-pace", type: "chart", category: "charts", label: "Pace Chart", icon: "bar-chart" },
      { id: "chart-heartrate", type: "chart", category: "charts", label: "Heart Rate Chart", icon: "bar-chart" },
      { id: "badge-difficulty", type: "badge", category: "badges", label: "Difficulty Badge", icon: "shield" },
      { id: "badge-weather", type: "badge", category: "badges", label: "Weather", icon: "cloud" },
      { id: "text-custom", type: "text", category: "text", label: "Custom Text", icon: "type" }
    ];
  }
});

// server/index.ts
import express2 from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

// server/routes.ts
import { createServer } from "node:http";
import { eq as eq6, and as and6, gte as gte4, desc as desc4 } from "drizzle-orm";

// server/storage.ts
init_schema();
init_db();
import { eq, or, and, desc, ilike, sql as sql2, inArray } from "drizzle-orm";
var DatabaseStorage = class {
  // Users
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || void 0;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || void 0;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async updateUser(id, data) {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || void 0;
  }
  async searchUsers(query) {
    return db.select().from(users).where(
      or(
        ilike(users.name, `%${query}%`),
        ilike(users.email, `%${query}%`),
        ilike(users.userCode, `%${query}%`)
      )
    ).limit(20);
  }
  // Friends
  async getFriends(userId) {
    const friendships = await db.select().from(friends).where(
      and(
        or(eq(friends.userId, userId), eq(friends.friendId, userId)),
        eq(friends.status, "accepted")
      )
    );
    const friendIds = friendships.map((f) => f.userId === userId ? f.friendId : f.userId);
    if (friendIds.length === 0) return [];
    const friendUsers = await db.select().from(users).where(
      inArray(users.id, friendIds)
    );
    return friendUsers;
  }
  async addFriend(userId, friendId) {
    const [friend] = await db.insert(friends).values({
      userId,
      friendId,
      status: "accepted"
    }).returning();
    return friend;
  }
  async removeFriend(userId, friendId) {
    await db.delete(friends).where(
      or(
        and(eq(friends.userId, userId), eq(friends.friendId, friendId)),
        and(eq(friends.userId, friendId), eq(friends.friendId, userId))
      )
    );
  }
  // Friend Requests
  async getFriendRequests(userId) {
    return db.select().from(friendRequests).where(
      and(
        eq(friendRequests.addresseeId, userId),
        eq(friendRequests.status, "pending")
      )
    );
  }
  async createFriendRequest(requesterId, addresseeId, message) {
    const [request] = await db.insert(friendRequests).values({
      requesterId,
      addresseeId,
      message,
      status: "pending"
    }).returning();
    return request;
  }
  async acceptFriendRequest(id) {
    const [request] = await db.select().from(friendRequests).where(eq(friendRequests.id, id));
    if (!request) return;
    await db.update(friendRequests).set({
      status: "accepted",
      respondedAt: /* @__PURE__ */ new Date()
    }).where(eq(friendRequests.id, id));
    await this.addFriend(request.requesterId, request.addresseeId);
  }
  async declineFriendRequest(id) {
    await db.update(friendRequests).set({
      status: "declined",
      respondedAt: /* @__PURE__ */ new Date()
    }).where(eq(friendRequests.id, id));
  }
  // Runs
  async getRun(id) {
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    return run || void 0;
  }
  async getUserRuns(userId) {
    return db.select().from(runs).where(eq(runs.userId, userId)).orderBy(desc(runs.completedAt));
  }
  async createRun(run) {
    console.log("[createRun] Input fields:", Object.keys(run).join(", "));
    const dateFieldsBeforeConversion = Object.entries(run).filter(([_, v]) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)).map(([k]) => k);
    if (dateFieldsBeforeConversion.length > 0) {
      console.log("[createRun] String date fields found:", dateFieldsBeforeConversion.join(", "));
    }
    const sanitized = this.convertDateFields(run);
    const [newRun] = await db.insert(runs).values(sanitized).returning();
    return newRun;
  }
  async updateRun(id, data) {
    const sanitized = this.convertDateFields(data);
    const [run] = await db.update(runs).set(sanitized).where(eq(runs.id, id)).returning();
    return run || void 0;
  }
  convertDateFields(data) {
    const result = { ...data };
    for (const key of Object.keys(result)) {
      const val = result[key];
      if (val === null || val === void 0 || val instanceof Date) continue;
      if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
        console.log(`[convertDateFields] Converting string to Date for key: ${key}`);
        result[key] = new Date(val);
      }
    }
    return result;
  }
  // Routes
  async getRoute(id) {
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    return route || void 0;
  }
  async getUserRoutes(userId) {
    return db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt));
  }
  async createRoute(route) {
    const [newRoute] = await db.insert(routes).values(route).returning();
    return newRoute;
  }
  async updateRoute(id, data) {
    const [route] = await db.update(routes).set(data).where(eq(routes.id, id)).returning();
    return route || void 0;
  }
  // Goals
  async getGoal(id) {
    const [goal] = await db.select().from(goals).where(eq(goals.id, id));
    return goal || void 0;
  }
  async getUserGoals(userId) {
    return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.createdAt));
  }
  async createGoal(goal) {
    const [newGoal] = await db.insert(goals).values(goal).returning();
    return newGoal;
  }
  async updateGoal(id, data) {
    const [goal] = await db.update(goals).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(goals.id, id)).returning();
    return goal || void 0;
  }
  async deleteGoal(id) {
    await db.delete(goals).where(eq(goals.id, id));
  }
  // Notifications
  async getUserNotifications(userId) {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }
  async createNotification(notification) {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }
  async markNotificationRead(id) {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  }
  async markAllNotificationsRead(userId) {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }
  async deleteNotification(id) {
    await db.delete(notifications).where(eq(notifications.id, id));
  }
  // Notification Preferences
  async getNotificationPreferences(userId) {
    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    return prefs || void 0;
  }
  async updateNotificationPreferences(userId, data) {
    const existing = await this.getNotificationPreferences(userId);
    if (existing) {
      const [updated] = await db.update(notificationPreferences).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(notificationPreferences.userId, userId)).returning();
      return updated;
    } else {
      const [created] = await db.insert(notificationPreferences).values({ userId, ...data }).returning();
      return created;
    }
  }
  // Live Sessions
  async getLiveSession(id) {
    const [session] = await db.select().from(liveRunSessions).where(eq(liveRunSessions.id, id));
    return session || void 0;
  }
  async getUserLiveSession(userId) {
    const [session] = await db.select().from(liveRunSessions).where(
      and(eq(liveRunSessions.userId, userId), eq(liveRunSessions.isActive, true))
    );
    return session || void 0;
  }
  async createLiveSession(session) {
    const [newSession] = await db.insert(liveRunSessions).values(session).returning();
    return newSession;
  }
  async updateLiveSession(id, data) {
    const [session] = await db.update(liveRunSessions).set({ ...data, lastSyncedAt: /* @__PURE__ */ new Date() }).where(eq(liveRunSessions.id, id)).returning();
    return session || void 0;
  }
  async endLiveSession(sessionKey) {
    await db.update(liveRunSessions).set({ isActive: false }).where(eq(liveRunSessions.sessionKey, sessionKey));
  }
  // Events
  async getEvents() {
    return db.select().from(events).where(eq(events.isActive, true));
  }
  async getEvent(id) {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event || void 0;
  }
  // Group Runs
  async getGroupRuns() {
    return db.select().from(groupRuns).orderBy(desc(groupRuns.createdAt));
  }
  async getGroupRun(id) {
    const [groupRun] = await db.select().from(groupRuns).where(eq(groupRuns.id, id));
    return groupRun || void 0;
  }
  async createGroupRun(groupRun) {
    const [newGroupRun] = await db.insert(groupRuns).values(groupRun).returning();
    return newGroupRun;
  }
  async joinGroupRun(groupRunId, userId) {
    const [participant] = await db.insert(groupRunParticipants).values({
      groupRunId,
      userId,
      role: "participant",
      invitationStatus: "accepted",
      joinedAt: /* @__PURE__ */ new Date()
    }).returning();
    return participant;
  }
  // Route Ratings
  async getRouteRatings(routeId) {
    const route = await this.getRoute(routeId);
    if (!route) return [];
    return db.select().from(routeRatings).where(eq(routeRatings.startLat, route.startLat));
  }
  async createRouteRating(rating) {
    const [newRating] = await db.insert(routeRatings).values(rating).returning();
    return newRating;
  }
  // Run Analysis
  async getRunAnalysis(runId) {
    try {
      const [analysis] = await db.select().from(runAnalyses).where(eq(runAnalyses.runId, runId));
      return analysis || void 0;
    } catch (error) {
      const msg = String(error?.message || "");
      if (error?.code === "42703" || msg.includes("run_analyses") || msg.includes("analysis")) {
        const [run] = await db.select().from(runs).where(eq(runs.id, runId));
        if (!run?.aiInsights) return void 0;
        try {
          const parsed = typeof run.aiInsights === "string" ? JSON.parse(run.aiInsights) : run.aiInsights;
          return {
            id: "legacy",
            runId,
            analysis: parsed,
            createdAt: /* @__PURE__ */ new Date()
          };
        } catch {
          return void 0;
        }
      }
      throw error;
    }
  }
  async createRunAnalysis(runId, analysis) {
    try {
      const [newAnalysis] = await db.insert(runAnalyses).values({ runId, analysis }).returning();
      return newAnalysis;
    } catch (error) {
      const msg = String(error?.message || "");
      if (error?.code === "42703" || msg.includes("run_analyses") || msg.includes("analysis")) {
        await db.update(runs).set({ aiInsights: JSON.stringify(analysis) }).where(eq(runs.id, runId));
        return {
          id: "legacy",
          runId,
          analysis,
          createdAt: /* @__PURE__ */ new Date()
        };
      }
      throw error;
    }
  }
  // Connected Devices
  async getConnectedDevices(userId) {
    return db.select().from(connectedDevices).where(eq(connectedDevices.userId, userId));
  }
  async getConnectedDevice(id) {
    const [device] = await db.select().from(connectedDevices).where(eq(connectedDevices.id, id));
    return device || void 0;
  }
  async createConnectedDevice(data) {
    const [device] = await db.insert(connectedDevices).values(data).returning();
    return device;
  }
  async updateConnectedDevice(id, data) {
    const [device] = await db.update(connectedDevices).set(data).where(eq(connectedDevices.id, id)).returning();
    return device || void 0;
  }
  async deleteConnectedDevice(id) {
    await db.update(connectedDevices).set({ isActive: false }).where(eq(connectedDevices.id, id));
  }
  // Device Data
  async getDeviceDataByRun(runId) {
    return db.select().from(deviceData).where(eq(deviceData.runId, runId));
  }
  async createDeviceData(data) {
    const [deviceDataRow] = await db.insert(deviceData).values(data).returning();
    return deviceDataRow;
  }
  // Garmin Wellness
  async getGarminWellnessByDate(userId, date) {
    const dateStr = date.toISOString().split("T")[0];
    const [wellness] = await db.select().from(garminWellnessMetrics).where(and(
      eq(garminWellnessMetrics.userId, userId),
      sql2`DATE(${garminWellnessMetrics.date}) = ${dateStr}`
    ));
    return wellness || void 0;
  }
  async createGarminWellness(data) {
    const [wellness] = await db.insert(garminWellnessMetrics).values(data).returning();
    return wellness;
  }
  async updateGarminWellness(id, data) {
    const [wellness] = await db.update(garminWellnessMetrics).set(data).where(eq(garminWellnessMetrics.id, id)).returning();
    return wellness || void 0;
  }
  async getAllActiveGarminDevices() {
    return db.select().from(connectedDevices).where(and(
      eq(connectedDevices.deviceType, "garmin"),
      eq(connectedDevices.isActive, true)
    ));
  }
};
var storage = new DatabaseStorage();

// server/routes.ts
init_db();
init_schema();
import { sql as sql8 } from "drizzle-orm";

// server/auth.ts
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
var JWT_SECRET = process.env.SESSION_SECRET || "fallback-secret-key-change-in-production";
var JWT_EXPIRES_IN = "7d";
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.user = payload;
  next();
}

// server/fitness-service.ts
init_db();
init_schema();
import { eq as eq2, and as and2, gte, lte, desc as desc2 } from "drizzle-orm";
function calculateTSS(durationSeconds, avgHeartRate, maxHeartRate, restingHeartRate = 60, difficulty) {
  const durationMinutes = durationSeconds / 60;
  const durationHours = durationSeconds / 3600;
  if (avgHeartRate && maxHeartRate) {
    const hrIntensity = (avgHeartRate - restingHeartRate) / (maxHeartRate - restingHeartRate);
    const tss2 = durationHours * 100 * Math.pow(hrIntensity, 2);
    return Math.round(Math.max(0, Math.min(tss2, 500)));
  }
  const intensityFactors = {
    easy: 0.67,
    moderate: 1,
    hard: 1.5,
    extreme: 2
  };
  const factor = difficulty ? intensityFactors[difficulty.toLowerCase()] || 1 : 1;
  const tss = durationMinutes * factor;
  return Math.round(Math.max(0, Math.min(tss, 500)));
}
function calculateCTL(previousCTL, todayTSS) {
  const timeConstant = 42;
  return previousCTL + (todayTSS - previousCTL) / timeConstant;
}
function calculateATL(previousATL, todayTSS) {
  const timeConstant = 7;
  return previousATL + (todayTSS - previousATL) / timeConstant;
}
function calculateTSB(ctl, atl) {
  return ctl - atl;
}
function getTrainingStatus(tsb) {
  if (tsb > 25) return "detraining";
  if (tsb > 10) return "optimal";
  if (tsb > -10) return "maintaining";
  if (tsb > -30) return "productive";
  return "overtrained";
}
function calculateRampRate(currentCTL, ctlSevenDaysAgo) {
  return currentCTL - ctlSevenDaysAgo;
}
function getInjuryRisk(rampRate, tsb) {
  if (rampRate > 8 || tsb < -30) return "high";
  if (rampRate > 5 || tsb < -10 && tsb >= -30) return "moderate";
  return "low";
}
async function updateDailyFitness(userId, date, tss) {
  try {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const yesterdayMetrics = await db.select().from(dailyFitness).where(
      and2(
        eq2(dailyFitness.userId, userId),
        eq2(dailyFitness.date, yesterdayStr)
      )
    ).limit(1);
    const previousCTL = yesterdayMetrics[0]?.ctl || 0;
    const previousATL = yesterdayMetrics[0]?.atl || 0;
    const newCTL = calculateCTL(previousCTL, tss);
    const newATL = calculateATL(previousATL, tss);
    const newTSB = calculateTSB(newCTL, newATL);
    const sevenDaysAgo = new Date(date);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
    const sevenDaysAgoMetrics = await db.select().from(dailyFitness).where(
      and2(
        eq2(dailyFitness.userId, userId),
        eq2(dailyFitness.date, sevenDaysAgoStr)
      )
    ).limit(1);
    const ctlSevenDaysAgo = sevenDaysAgoMetrics[0]?.ctl || 0;
    const rampRate = calculateRampRate(newCTL, ctlSevenDaysAgo);
    const status = getTrainingStatus(newTSB);
    const injuryRisk = getInjuryRisk(rampRate, newTSB);
    await db.insert(dailyFitness).values({
      userId,
      date,
      ctl: newCTL,
      atl: newATL,
      tsb: newTSB,
      trainingLoad: tss,
      status,
      rampRate,
      injuryRisk
    }).onConflictDoUpdate({
      target: [dailyFitness.userId, dailyFitness.date],
      set: {
        ctl: newCTL,
        atl: newATL,
        tsb: newTSB,
        trainingLoad: tss,
        status,
        rampRate,
        injuryRisk
      }
    });
    console.log(`\u2705 Updated fitness metrics for ${userId} on ${date}`);
  } catch (error) {
    console.error("\u274C Error updating daily fitness:", error);
    throw error;
  }
}
async function recalculateHistoricalFitness(userId) {
  try {
    console.log(`\u{1F504} Recalculating historical fitness for user ${userId}...`);
    const userRuns = await db.select({
      id: runs.id,
      completedAt: runs.completedAt,
      tss: runs.tss,
      duration: runs.duration,
      avgHeartRate: runs.avgHeartRate,
      maxHeartRate: runs.maxHeartRate,
      difficulty: runs.difficulty
    }).from(runs).where(eq2(runs.userId, userId)).orderBy(runs.completedAt);
    if (userRuns.length === 0) {
      console.log(`No runs found for user ${userId}`);
      return;
    }
    const runsByDate = /* @__PURE__ */ new Map();
    for (const run of userRuns) {
      const date = run.completedAt.toISOString().split("T")[0];
      let tss = run.tss || 0;
      if (tss === 0) {
        tss = calculateTSS(
          run.duration,
          run.avgHeartRate || void 0,
          run.maxHeartRate || void 0,
          60,
          run.difficulty || void 0
        );
        await db.update(runs).set({ tss }).where(eq2(runs.id, run.id));
      }
      if (!runsByDate.has(date)) {
        runsByDate.set(date, { tss: 0, runs: [] });
      }
      const dayData = runsByDate.get(date);
      dayData.tss += tss;
      dayData.runs.push(run);
    }
    const dates = Array.from(runsByDate.keys()).sort();
    for (const date of dates) {
      const dayData = runsByDate.get(date);
      await updateDailyFitness(userId, date, dayData.tss);
    }
    console.log(`\u2705 Historical fitness recalculated for ${userId} (${dates.length} days)`);
  } catch (error) {
    console.error("\u274C Error recalculating historical fitness:", error);
    throw error;
  }
}
async function getFitnessTrend(userId, startDate, endDate) {
  return await db.select().from(dailyFitness).where(
    and2(
      eq2(dailyFitness.userId, userId),
      gte(dailyFitness.date, startDate),
      lte(dailyFitness.date, endDate)
    )
  ).orderBy(dailyFitness.date);
}
async function getCurrentFitness(userId) {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const current = await db.select().from(dailyFitness).where(eq2(dailyFitness.userId, userId)).orderBy(desc2(dailyFitness.date)).limit(1);
  return current[0] || null;
}
function getFitnessRecommendations(ctl, atl, tsb, status, injuryRisk) {
  const recommendations = [];
  switch (status) {
    case "overtrained":
      recommendations.push("\u26A0\uFE0F High fatigue detected. Take 2-3 rest days.");
      recommendations.push("Focus on recovery: sleep, nutrition, hydration.");
      recommendations.push("Consider easy 20-30min recovery runs only.");
      break;
    case "productive":
      recommendations.push("\u{1F4AA} You're in a productive training phase!");
      recommendations.push("Maintain current training load for adaptation.");
      recommendations.push("Schedule a recovery week after 3-4 weeks.");
      break;
    case "maintaining":
      recommendations.push("\u2705 Well-balanced training load.");
      recommendations.push("Good time to add intensity or volume.");
      recommendations.push("Consider a hard workout this week.");
      break;
    case "optimal":
      recommendations.push("\u{1F3C6} Perfect fitness for racing!");
      recommendations.push("Taper maintained - ready to perform.");
      recommendations.push("Keep workouts short and sharp.");
      break;
    case "detraining":
      recommendations.push("\u26A0\uFE0F Fitness declining - increase training volume.");
      recommendations.push("Add 1-2 more runs per week.");
      recommendations.push("Gradually ramp up distance by 10% per week.");
      break;
  }
  if (injuryRisk === "high") {
    recommendations.push("\u{1F6A8} HIGH INJURY RISK: Reduce volume by 20-30%.");
  } else if (injuryRisk === "moderate") {
    recommendations.push("\u26A0\uFE0F Moderate injury risk: Monitor for pain/fatigue.");
  }
  return recommendations;
}

// server/segment-matching-service.ts
init_db();
init_schema();
import { eq as eq3, and as and3, sql as sql4 } from "drizzle-orm";
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const \u03C61 = lat1 * Math.PI / 180;
  const \u03C62 = lat2 * Math.PI / 180;
  const \u0394\u03C6 = (lat2 - lat1) * Math.PI / 180;
  const \u0394\u03BB = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(\u0394\u03C6 / 2) * Math.sin(\u0394\u03C6 / 2) + Math.cos(\u03C61) * Math.cos(\u03C62) * Math.sin(\u0394\u03BB / 2) * Math.sin(\u0394\u03BB / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function findSegmentInTrack(gpsTrack, segment, threshold = 50) {
  const track = gpsTrack;
  for (let i = 0; i < track.length - 1; i++) {
    const point = track[i];
    const distToStart = haversineDistance(
      point.latitude,
      point.longitude,
      segment.startLat,
      segment.startLng
    );
    if (distToStart <= threshold) {
      for (let j = i + 1; j < track.length; j++) {
        const futurePoint = track[j];
        const distToEnd = haversineDistance(
          futurePoint.latitude,
          futurePoint.longitude,
          segment.endLat,
          segment.endLng
        );
        if (distToEnd <= threshold) {
          let actualDistance = 0;
          for (let k = i; k < j; k++) {
            actualDistance += haversineDistance(
              track[k].latitude,
              track[k].longitude,
              track[k + 1].latitude,
              track[k + 1].longitude
            );
          }
          const distanceRatio = actualDistance / segment.distance;
          if (distanceRatio >= 0.8 && distanceRatio <= 1.2) {
            return { startIndex: i, endIndex: j };
          }
        }
      }
    }
  }
  return null;
}
async function matchRunToSegments(runId, userId, gpsTrack, avgHeartRate, maxHeartRate, avgCadence) {
  try {
    if (!gpsTrack || gpsTrack.length < 10) {
      console.log(`Run ${runId}: GPS track too short for segment matching`);
      return [];
    }
    const lats = gpsTrack.map((p) => p.latitude);
    const lngs = gpsTrack.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padding = 0.02;
    const candidateSegments = await db.select().from(segments).where(
      sql4`${segments.startLat} BETWEEN ${minLat - padding} AND ${maxLat + padding}
        AND ${segments.startLng} BETWEEN ${minLng - padding} AND ${maxLng + padding}`
    );
    console.log(`Run ${runId}: Found ${candidateSegments.length} candidate segments`);
    const matches = [];
    for (const segment of candidateSegments) {
      const match = findSegmentInTrack(gpsTrack, {
        startLat: segment.startLat,
        startLng: segment.startLng,
        endLat: segment.endLat,
        endLng: segment.endLng,
        distance: segment.distance
      });
      if (match) {
        let elapsedTime = 0;
        if (gpsTrack[match.startIndex].timestamp && gpsTrack[match.endIndex].timestamp) {
          elapsedTime = Math.floor(
            (gpsTrack[match.endIndex].timestamp - gpsTrack[match.startIndex].timestamp) / 1e3
          );
        } else {
          elapsedTime = Math.round(segment.distance / 1e3 * 300);
        }
        const existingEfforts = await db.select().from(segmentEfforts).where(
          and3(
            eq3(segmentEfforts.segmentId, segment.id),
            eq3(segmentEfforts.userId, userId)
          )
        ).orderBy(segmentEfforts.elapsedTime);
        const isNewPR = existingEfforts.length === 0 || elapsedTime < existingEfforts[0].elapsedTime;
        const allEfforts = await db.select().from(segmentEfforts).where(eq3(segmentEfforts.segmentId, segment.id)).orderBy(segmentEfforts.elapsedTime);
        const leaderboardRank = allEfforts.filter((e) => e.elapsedTime < elapsedTime).length + 1;
        let achievementType = null;
        if (isNewPR) achievementType = "new_pr";
        if (leaderboardRank === 1) achievementType = "kom";
        if (leaderboardRank <= 10) achievementType = "top_10";
        await db.insert(segmentEfforts).values({
          segmentId: segment.id,
          userId,
          runId,
          elapsedTime,
          startIndex: match.startIndex,
          endIndex: match.endIndex,
          avgHeartRate,
          maxHeartRate,
          avgCadence,
          isPersonalRecord: isNewPR,
          leaderboardRank,
          achievementType
        });
        await db.update(segments).set({
          effort_count: sql4`${segments.effortCount} + 1`
        }).where(eq3(segments.id, segment.id));
        matches.push({
          segmentId: segment.id,
          elapsedTime,
          isNewPR
        });
        console.log(
          `\u2705 Matched segment ${segment.name}: ${elapsedTime}s (${isNewPR ? "NEW PR!" : "not PR"})`
        );
      }
    }
    return matches;
  } catch (error) {
    console.error("Error matching segments:", error);
    return [];
  }
}
async function reprocessRunForSegments(runId) {
  try {
    const run = await db.select().from(runs).where(eq3(runs.id, runId)).limit(1);
    if (!run[0] || !run[0].gpsTrack) {
      throw new Error("Run not found or has no GPS track");
    }
    const gpsTrack = run[0].gpsTrack;
    await matchRunToSegments(
      runId,
      run[0].userId,
      gpsTrack,
      run[0].avgHeartRate || void 0,
      run[0].maxHeartRate || void 0,
      run[0].cadence || void 0
    );
  } catch (error) {
    console.error(`Error reprocessing run ${runId}:`, error);
    throw error;
  }
}
async function createSegmentFromRun(runId, userId, startIndex, endIndex, name, description) {
  try {
    const run = await db.select().from(runs).where(eq3(runs.id, runId)).limit(1);
    if (!run[0] || !run[0].gpsTrack) {
      throw new Error("Run not found or has no GPS track");
    }
    const gpsTrack = run[0].gpsTrack;
    if (startIndex >= endIndex || endIndex >= gpsTrack.length) {
      throw new Error("Invalid start/end indices");
    }
    const startPoint = gpsTrack[startIndex];
    const endPoint = gpsTrack[endIndex];
    let distance = 0;
    for (let i = startIndex; i < endIndex; i++) {
      distance += haversineDistance(
        gpsTrack[i].latitude,
        gpsTrack[i].longitude,
        gpsTrack[i + 1].latitude,
        gpsTrack[i + 1].longitude
      );
    }
    let elevationGain = 0;
    let elevationLoss = 0;
    if (gpsTrack[startIndex].altitude !== void 0) {
      for (let i = startIndex; i < endIndex; i++) {
        const altDiff = (gpsTrack[i + 1].altitude || 0) - (gpsTrack[i].altitude || 0);
        if (altDiff > 0) elevationGain += altDiff;
        else elevationLoss += Math.abs(altDiff);
      }
    }
    const segmentPoints = gpsTrack.slice(startIndex, endIndex + 1);
    const polyline3 = JSON.stringify(
      segmentPoints.map((p) => ({ lat: p.latitude, lng: p.longitude }))
    );
    const newSegment = await db.insert(segments).values({
      name,
      description,
      startLat: startPoint.latitude,
      startLng: startPoint.longitude,
      endLat: endPoint.latitude,
      endLng: endPoint.longitude,
      polyline: polyline3,
      distance,
      elevationGain: elevationGain || null,
      elevationLoss: elevationLoss || null,
      avgGradient: elevationGain > 0 ? elevationGain / distance * 100 : null,
      createdById: userId
    }).returning();
    return newSegment[0].id;
  } catch (error) {
    console.error("Error creating segment:", error);
    throw error;
  }
}

// server/training-plan-service.ts
init_db();
init_schema();
import { eq as eq4, and as and4, desc as desc3, gte as gte2 } from "drizzle-orm";
import OpenAI from "openai";
var openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
async function generateTrainingPlan(userId, goalType, targetDistance, targetTime, targetDate, experienceLevel = "intermediate", daysPerWeek = 4) {
  try {
    const user = await db.select().from(users).where(eq4(users.id, userId)).limit(1);
    const fitness = await getCurrentFitness(userId);
    const thirtyDaysAgo = /* @__PURE__ */ new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentRuns = await db.select().from(runs).where(
      and4(
        eq4(runs.userId, userId),
        gte2(runs.completedAt, thirtyDaysAgo)
      )
    ).orderBy(desc3(runs.completedAt)).limit(20);
    const totalDistance = recentRuns.reduce((sum, r) => sum + (r.distance || 0), 0);
    const weeklyMileageBase = recentRuns.length > 0 ? totalDistance / 4 : 20;
    const weeksUntilTarget = targetDate ? Math.ceil((targetDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1e3)) : getPlanDuration(goalType, experienceLevel);
    const context = {
      user: {
        fitnessLevel: user[0]?.fitnessLevel || experienceLevel,
        age: user[0]?.dob ? Math.floor((Date.now() - new Date(user[0].dob).getTime()) / 315576e5) : null,
        gender: user[0]?.gender
      },
      fitness: fitness ? {
        ctl: fitness.ctl,
        atl: fitness.atl,
        tsb: fitness.tsb,
        status: fitness.status
      } : null,
      recentActivity: {
        runsLast30Days: recentRuns.length,
        avgWeeklyDistance: weeklyMileageBase,
        avgPace: recentRuns[0]?.avgPace
      },
      goal: {
        type: goalType,
        distance: targetDistance,
        targetTime,
        targetDate: targetDate?.toISOString(),
        weeksAvailable: weeksUntilTarget
      },
      preferences: {
        daysPerWeek,
        includeSpeedWork: true,
        includeHillWork: true,
        includeLongRuns: true
      }
    };
    const prompt = `You are an expert running coach. Generate a ${weeksUntilTarget}-week training plan for a ${experienceLevel} runner preparing for a ${goalType} (${targetDistance}km).

Runner Profile:
- Current weekly mileage: ${weeklyMileageBase.toFixed(1)}km
- Fitness level: ${experienceLevel}
- Training days per week: ${daysPerWeek}
- Current fitness (CTL): ${fitness?.ctl || "N/A"}
- Training status: ${fitness?.status || "N/A"}

Goal:
- ${goalType.toUpperCase()} (${targetDistance}km)
${targetTime ? `- Target time: ${Math.floor(targetTime / 60)} minutes` : ""}
${targetDate ? `- Race date: ${targetDate.toDateString()}` : ""}

Requirements:
1. Build gradually from current ${weeklyMileageBase.toFixed(1)}km/week base
2. Include easy runs, tempo runs, intervals, and long runs
3. Follow 80/20 rule (80% easy, 20% hard)
4. Build for 3 weeks, recover 1 week pattern
5. Taper for final 2 weeks before race
6. Increase weekly volume by max 10% per week

Return JSON with this exact structure:
{
  "planName": "12-Week Half Marathon Plan",
  "totalWeeks": 12,
  "weeks": [
    {
      "weekNumber": 1,
      "weekDescription": "Base building week - focus on easy mileage",
      "totalDistance": 25.0,
      "focusArea": "endurance",
      "intensityLevel": "easy",
      "workouts": [
        {
          "dayOfWeek": 1,
          "workoutType": "easy",
          "distance": 6.0,
          "targetPace": "5:30/km",
          "intensity": "z2",
          "description": "Easy recovery run",
          "instructions": "Keep heart rate in zone 2. Should feel conversational."
        }
      ]
    }
  ]
}

Include all ${weeksUntilTarget} weeks with ${daysPerWeek} workouts per week.`;
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert running coach who creates scientifically-sound training plans. Always respond with valid JSON only, no extra text."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4e3
    });
    const planData = JSON.parse(response.choices[0].message.content || "{}");
    const plan = await db.insert(trainingPlans).values({
      userId,
      goalType,
      targetDistance,
      targetTime,
      targetDate,
      totalWeeks: weeksUntilTarget,
      experienceLevel,
      weeklyMileageBase,
      daysPerWeek,
      includeSpeedWork: true,
      includeHillWork: true,
      includeLongRuns: true,
      status: "active",
      aiGenerated: true
    }).returning();
    const planId = plan[0].id;
    for (const week of planData.weeks) {
      const weeklyPlan = await db.insert(weeklyPlans).values({
        trainingPlanId: planId,
        weekNumber: week.weekNumber,
        weekDescription: week.weekDescription,
        totalDistance: week.totalDistance,
        focusArea: week.focusArea,
        intensityLevel: week.intensityLevel
      }).returning();
      const weeklyPlanId = weeklyPlan[0].id;
      for (const workout of week.workouts) {
        const scheduledDate = /* @__PURE__ */ new Date();
        scheduledDate.setDate(scheduledDate.getDate() + (week.weekNumber - 1) * 7 + workout.dayOfWeek);
        await db.insert(plannedWorkouts).values({
          weeklyPlanId,
          trainingPlanId: planId,
          dayOfWeek: workout.dayOfWeek,
          scheduledDate,
          workoutType: workout.workoutType,
          distance: workout.distance,
          targetPace: workout.targetPace,
          intensity: workout.intensity,
          description: workout.description,
          instructions: workout.instructions,
          isCompleted: false
        });
      }
    }
    console.log(`\u2705 Generated ${weeksUntilTarget}-week training plan for user ${userId}`);
    return planId;
  } catch (error) {
    console.error("Error generating training plan:", error);
    throw error;
  }
}
function getPlanDuration(goalType, experienceLevel) {
  const durations = {
    "5k": { beginner: 8, intermediate: 6, advanced: 4 },
    "10k": { beginner: 10, intermediate: 8, advanced: 6 },
    "half_marathon": { beginner: 14, intermediate: 12, advanced: 10 },
    "marathon": { beginner: 20, intermediate: 18, advanced: 16 },
    "ultra": { beginner: 24, intermediate: 20, advanced: 18 }
  };
  return durations[goalType]?.[experienceLevel] || 12;
}
async function adaptTrainingPlan(planId, reason, userId) {
  try {
    const plan = await db.select().from(trainingPlans).where(eq4(trainingPlans.id, planId)).limit(1);
    if (!plan[0]) {
      throw new Error("Training plan not found");
    }
    const fitness = await getCurrentFitness(userId);
    const completedWorkouts = await db.select().from(plannedWorkouts).where(
      and4(
        eq4(plannedWorkouts.trainingPlanId, planId),
        eq4(plannedWorkouts.isCompleted, true)
      )
    );
    const prompt = `As a running coach, adapt this training plan due to: ${reason}

Current Status:
- Current week: ${plan[0].currentWeek}/${plan[0].totalWeeks}
- Completed workouts: ${completedWorkouts.length}
- Current fitness (CTL): ${fitness?.ctl || "N/A"}
- Training status: ${fitness?.status || "N/A"}

Recommend adaptations in JSON format:
{
  "recommendation": "Brief explanation of changes",
  "adjustments": [
    "Reduce next week volume by 20%",
    "Add extra rest day"
  ],
  "continueAsIs": false
}`;
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert running coach providing training plan adaptations. Respond with JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 500
    });
    const adaptation = JSON.parse(response.choices[0].message.content || "{}");
    await db.insert(planAdaptations).values({
      trainingPlanId: planId,
      reason,
      changes: adaptation,
      aiSuggestion: adaptation.recommendation,
      userAccepted: false
    });
    console.log(`\u2705 Plan adaptation created for ${reason}`);
  } catch (error) {
    console.error("Error adapting training plan:", error);
    throw error;
  }
}
async function completeWorkout(workoutId, runId) {
  await db.update(plannedWorkouts).set({
    isCompleted: true,
    completedRunId: runId
  }).where(eq4(plannedWorkouts.id, workoutId));
}

// server/achievements-service.ts
init_db();
init_schema();
import { eq as eq5, and as and5, gte as gte3, sql as sql5, count } from "drizzle-orm";
async function initializeAchievements() {
  const defaultAchievements = [
    // Distance Milestones
    {
      name: "First Steps",
      description: "Complete your first run",
      category: "distance",
      requirement: { type: "run_count", value: 1 },
      rarity: "common",
      points: 10,
      badgeImage: "badge_first_run.png"
    },
    {
      name: "5K Warrior",
      description: "Complete a 5km run",
      category: "distance",
      requirement: { type: "single_distance", value: 5 },
      rarity: "common",
      points: 20,
      badgeImage: "badge_5k.png"
    },
    {
      name: "10K Hero",
      description: "Complete a 10km run",
      category: "distance",
      requirement: { type: "single_distance", value: 10 },
      rarity: "rare",
      points: 50,
      badgeImage: "badge_10k.png"
    },
    {
      name: "Half Marathon Champion",
      description: "Complete a half marathon (21.1km)",
      category: "distance",
      requirement: { type: "single_distance", value: 21.1 },
      rarity: "epic",
      points: 100,
      badgeImage: "badge_half_marathon.png"
    },
    {
      name: "Marathon Legend",
      description: "Complete a full marathon (42.2km)",
      category: "distance",
      requirement: { type: "single_distance", value: 42.2 },
      rarity: "legendary",
      points: 200,
      badgeImage: "badge_marathon.png"
    },
    {
      name: "Century Club",
      description: "Run 100km total distance",
      category: "distance",
      requirement: { type: "total_distance", value: 100 },
      rarity: "common",
      points: 30,
      badgeImage: "badge_100km.png"
    },
    {
      name: "500K Club",
      description: "Run 500km total distance",
      category: "distance",
      requirement: { type: "total_distance", value: 500 },
      rarity: "rare",
      points: 75,
      badgeImage: "badge_500km.png"
    },
    {
      name: "1000K Ultra",
      description: "Run 1000km total distance",
      category: "distance",
      requirement: { type: "total_distance", value: 1e3 },
      rarity: "epic",
      points: 150,
      badgeImage: "badge_1000km.png"
    },
    // Speed Achievements
    {
      name: "Speed Demon",
      description: "Run 5km under 25 minutes",
      category: "speed",
      requirement: { type: "pace_threshold", distance: 5, time: 1500 },
      rarity: "rare",
      points: 50,
      badgeImage: "badge_speed_demon.png"
    },
    {
      name: "Sub-4 Marathoner",
      description: "Complete a marathon in under 4 hours",
      category: "speed",
      requirement: { type: "pace_threshold", distance: 42.2, time: 14400 },
      rarity: "legendary",
      points: 300,
      badgeImage: "badge_sub4_marathon.png"
    },
    // Consistency Achievements
    {
      name: "Weekly Warrior",
      description: "Run 3 times in a single week",
      category: "consistency",
      requirement: { type: "weekly_runs", value: 3 },
      rarity: "common",
      points: 15,
      badgeImage: "badge_weekly_warrior.png"
    },
    {
      name: "Monthly Marathon",
      description: "Run 100km in a single month",
      category: "consistency",
      requirement: { type: "monthly_distance", value: 100 },
      rarity: "rare",
      points: 60,
      badgeImage: "badge_monthly_marathon.png"
    },
    {
      name: "Streak Master",
      description: "Run for 7 consecutive days",
      category: "consistency",
      requirement: { type: "streak_days", value: 7 },
      rarity: "rare",
      points: 50,
      badgeImage: "badge_streak_master.png"
    },
    {
      name: "Centurion",
      description: "Complete 100 total runs",
      category: "consistency",
      requirement: { type: "run_count", value: 100 },
      rarity: "epic",
      points: 100,
      badgeImage: "badge_centurion.png"
    },
    // Social Achievements
    {
      name: "Team Player",
      description: "Complete your first group run",
      category: "social",
      requirement: { type: "group_runs", value: 1 },
      rarity: "common",
      points: 20,
      badgeImage: "badge_team_player.png"
    },
    {
      name: "Goal Crusher",
      description: "Complete your first goal",
      category: "social",
      requirement: { type: "goals_completed", value: 1 },
      rarity: "common",
      points: 25,
      badgeImage: "badge_goal_crusher.png"
    },
    // Segment Achievements
    {
      name: "Segment Hunter",
      description: "Complete your first segment",
      category: "segment",
      requirement: { type: "segment_efforts", value: 1 },
      rarity: "common",
      points: 15,
      badgeImage: "badge_segment_hunter.png"
    },
    {
      name: "KOM/QOM",
      description: "Set a segment record (King/Queen of Mountain)",
      category: "segment",
      requirement: { type: "segment_kom", value: 1 },
      rarity: "legendary",
      points: 250,
      badgeImage: "badge_kom.png"
    },
    {
      name: "PR Machine",
      description: "Set 10 personal records on segments",
      category: "segment",
      requirement: { type: "segment_prs", value: 10 },
      rarity: "epic",
      points: 100,
      badgeImage: "badge_pr_machine.png"
    }
  ];
  for (const achievement of defaultAchievements) {
    try {
      const existing = await db.select().from(achievements).where(eq5(achievements.name, achievement.name)).limit(1);
      if (existing.length === 0) {
        await db.insert(achievements).values(achievement);
        console.log(`\u2705 Added achievement: ${achievement.name}`);
      }
    } catch (error) {
      console.error(`Failed to add achievement ${achievement.name}:`, error);
    }
  }
}
async function checkAchievementsAfterRun(runId, userId) {
  try {
    const awardedAchievements = [];
    const run = await db.select().from(runs).where(eq5(runs.id, runId)).limit(1);
    if (!run[0]) return [];
    const allAchievements = await db.select().from(achievements);
    const existingAchievements = await db.select().from(userAchievements).where(eq5(userAchievements.userId, userId));
    const existingAchievementIds = new Set(existingAchievements.map((a) => a.achievementId));
    for (const achievement of allAchievements) {
      if (existingAchievementIds.has(achievement.id)) continue;
      const req = achievement.requirement;
      let earned = false;
      switch (req.type) {
        case "run_count": {
          const totalRuns = await db.select({ count: count() }).from(runs).where(eq5(runs.userId, userId));
          earned = totalRuns[0].count >= req.value;
          break;
        }
        case "single_distance": {
          earned = run[0].distance >= req.value;
          break;
        }
        case "total_distance": {
          const totalDistance = await db.select({ sum: sql5`COALESCE(SUM(${runs.distance}), 0)` }).from(runs).where(eq5(runs.userId, userId));
          earned = totalDistance[0].sum >= req.value;
          break;
        }
        case "pace_threshold": {
          earned = run[0].distance >= req.distance && run[0].duration <= req.time;
          break;
        }
        case "weekly_runs": {
          const weekAgo = /* @__PURE__ */ new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const weeklyRuns = await db.select({ count: count() }).from(runs).where(
            and5(
              eq5(runs.userId, userId),
              gte3(runs.completedAt, weekAgo)
            )
          );
          earned = weeklyRuns[0].count >= req.value;
          break;
        }
        case "monthly_distance": {
          const monthAgo = /* @__PURE__ */ new Date();
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          const monthlyDistance = await db.select({ sum: sql5`COALESCE(SUM(${runs.distance}), 0)` }).from(runs).where(
            and5(
              eq5(runs.userId, userId),
              gte3(runs.completedAt, monthAgo)
            )
          );
          earned = monthlyDistance[0].sum >= req.value;
          break;
        }
        case "streak_days": {
          const recentRuns = await db.select().from(runs).where(eq5(runs.userId, userId)).orderBy(runs.completedAt);
          let currentStreak = 0;
          let lastDate = null;
          for (const r of recentRuns) {
            if (!r.completedAt) continue;
            const runDate = new Date(r.completedAt).toDateString();
            if (!lastDate) {
              currentStreak = 1;
            } else {
              const dayDiff = Math.floor((new Date(runDate).getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1e3));
              if (dayDiff === 1) {
                currentStreak++;
              } else if (dayDiff > 1) {
                currentStreak = 1;
              }
            }
            lastDate = new Date(runDate);
          }
          earned = currentStreak >= req.value;
          break;
        }
        case "goals_completed": {
          const completedGoals = await db.select({ count: count() }).from(goals).where(
            and5(
              eq5(goals.userId, userId),
              eq5(goals.status, "completed")
            )
          );
          earned = completedGoals[0].count >= req.value;
          break;
        }
      }
      if (earned) {
        await db.insert(userAchievements).values({
          userId,
          achievementId: achievement.id,
          runId
        });
        await db.insert(notifications).values({
          userId,
          type: "achievement_earned",
          title: `Achievement Unlocked!`,
          message: `You earned "${achievement.name}" - ${achievement.description}`,
          data: { achievementId: achievement.id, points: achievement.points },
          read: false
        });
        await db.insert(feedActivities).values({
          userId,
          activityType: "achievement_earned",
          achievementId: achievement.id,
          content: `Earned the "${achievement.name}" achievement!`,
          visibility: "friends"
        });
        awardedAchievements.push(achievement.name);
        console.log(`\u{1F3C6} User ${userId} earned achievement: ${achievement.name}`);
      }
    }
    return awardedAchievements;
  } catch (error) {
    console.error("Error checking achievements:", error);
    return [];
  }
}
async function getUserAchievements(userId) {
  try {
    const earned = await db.select({
      userAchievement: userAchievements,
      achievement: achievements
    }).from(userAchievements).leftJoin(achievements, eq5(userAchievements.achievementId, achievements.id)).where(eq5(userAchievements.userId, userId)).orderBy(userAchievements.earnedAt);
    const all = await db.select().from(achievements);
    const earnedIds = new Set(earned.map((e) => e.achievement?.id));
    const unearned = all.filter((a) => !earnedIds.has(a.id));
    const totalPoints = earned.reduce((sum, e) => sum + (e.achievement?.points || 0), 0);
    return {
      earned: earned.map((e) => ({
        ...e.achievement,
        earnedAt: e.userAchievement.earnedAt
      })),
      unearned,
      totalPoints,
      totalEarned: earned.length,
      totalAvailable: all.length,
      completionPercent: Math.round(earned.length / all.length * 100)
    };
  } catch (error) {
    console.error("Error getting user achievements:", error);
    throw error;
  }
}

// server/garmin-oauth-bridge.ts
import express from "express";
import crypto from "crypto";
import axios from "axios";
var router = express.Router();
var tokenStore = /* @__PURE__ */ new Map();
setInterval(() => {
  const oneHourAgo = Date.now() - 36e5;
  for (const [key, value] of tokenStore.entries()) {
    if (value.timestamp < oneHourAgo) {
      tokenStore.delete(key);
    }
  }
}, 36e5);
router.get("/garmin/callback", async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  console.log("\u{1F4E5} Garmin OAuth callback received:", { oauth_token, oauth_verifier });
  if (!oauth_token || !oauth_verifier) {
    console.error("\u274C Missing oauth_token or oauth_verifier");
    return res.redirect("airuncoach://garmin/auth-complete?success=false&error=missing_params");
  }
  try {
    const { accessToken, accessTokenSecret } = await exchangeGarminToken(
      oauth_token,
      oauth_verifier
    );
    const tempTokenId = crypto.randomBytes(16).toString("hex");
    tokenStore.set(tempTokenId, {
      accessToken,
      accessTokenSecret,
      timestamp: Date.now()
    });
    console.log("\u2705 Garmin token exchanged successfully, stored as:", tempTokenId);
    res.redirect(`airuncoach://garmin/auth-complete?success=true&token=${tempTokenId}`);
  } catch (error) {
    console.error("\u274C Garmin OAuth error:", error.message);
    res.redirect(`airuncoach://garmin/auth-complete?success=false&error=${encodeURIComponent(error.message)}`);
  }
});
router.get("/api/garmin/token/:tempTokenId", (req, res) => {
  const { tempTokenId } = req.params;
  console.log("\u{1F4E5} Token retrieval request:", tempTokenId);
  const tokenData = tokenStore.get(tempTokenId);
  if (!tokenData) {
    console.error("\u274C Token not found or expired");
    return res.status(404).json({ error: "Token not found or expired" });
  }
  tokenStore.delete(tempTokenId);
  console.log("\u2705 Token retrieved successfully");
  res.json({
    accessToken: tokenData.accessToken,
    accessTokenSecret: tokenData.accessTokenSecret
  });
});
async function exchangeGarminToken(oauthToken, oauthVerifier) {
  const CONSUMER_KEY = process.env.GARMIN_CONSUMER_KEY;
  const CONSUMER_SECRET = process.env.GARMIN_CONSUMER_SECRET;
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error("Garmin credentials not configured in environment variables");
  }
  const url = "https://connectapi.garmin.com/oauth-service/oauth/access_token";
  const timestamp2 = Math.floor(Date.now() / 1e3).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const params = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp2,
    oauth_token: oauthToken,
    oauth_verifier: oauthVerifier,
    oauth_version: "1.0"
  };
  const signature = generateOAuthSignature("POST", url, params, CONSUMER_SECRET, "");
  const authHeader = buildAuthorizationHeader(params, signature);
  const response = await axios.post(url, null, {
    headers: {
      "Authorization": authHeader
    }
  });
  const responseData = parseOAuthResponse(response.data);
  return {
    accessToken: responseData.oauth_token,
    accessTokenSecret: responseData.oauth_token_secret
  };
}
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join("&");
  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join("&");
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const hmac = crypto.createHmac("sha1", signingKey);
  hmac.update(signatureBase);
  return hmac.digest("base64");
}
function buildAuthorizationHeader(params, signature) {
  const authParams = { ...params, oauth_signature: signature };
  const headerValue = Object.keys(authParams).sort().map((key) => `${key}="${encodeURIComponent(authParams[key])}"`).join(", ");
  return `OAuth ${headerValue}`;
}
function parseOAuthResponse(response) {
  return response.split("&").reduce((acc, pair) => {
    const [key, value] = pair.split("=");
    acc[key] = value;
    return acc;
  }, {});
}
var garmin_oauth_bridge_default = router;

// server/osm-segment-intelligence.ts
init_db();
import { sql as sql6 } from "drizzle-orm";
function haversineDistance2(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const \u03C61 = lat1 * Math.PI / 180;
  const \u03C62 = lat2 * Math.PI / 180;
  const \u0394\u03C6 = (lat2 - lat1) * Math.PI / 180;
  const \u0394\u03BB = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(\u0394\u03C6 / 2) * Math.sin(\u0394\u03C6 / 2) + Math.cos(\u03C61) * Math.cos(\u03C62) * Math.sin(\u0394\u03BB / 2) * Math.sin(\u0394\u03BB / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
async function snapTrackToOSMSegments(gpsTrack) {
  try {
    const simplified = simplifyGPSTrack(gpsTrack, 50);
    if (simplified.length < 2) {
      console.log("Track too short after simplification");
      return [];
    }
    const segments2 = [];
    for (let i = 0; i < simplified.length - 1; i++) {
      const p1 = simplified[i];
      const p2 = simplified[i + 1];
      const distance = haversineDistance2(
        p1.latitude,
        p1.longitude,
        p2.latitude,
        p2.longitude
      );
      const osmWayId = BigInt(
        Math.abs(
          hashCoordinates(p1.latitude, p1.longitude, p2.latitude, p2.longitude)
        )
      );
      segments2.push({
        osmWayId,
        startLat: p1.latitude,
        startLng: p1.longitude,
        endLat: p2.latitude,
        endLng: p2.longitude,
        distance
      });
    }
    return segments2;
  } catch (error) {
    console.error("Error snapping track to OSM:", error);
    return [];
  }
}
function simplifyGPSTrack(track, minDistance) {
  if (track.length === 0) return [];
  const simplified = [track[0]];
  let lastPoint = track[0];
  for (let i = 1; i < track.length; i++) {
    const dist = haversineDistance2(
      lastPoint.latitude,
      lastPoint.longitude,
      track[i].latitude,
      track[i].longitude
    );
    if (dist >= minDistance) {
      simplified.push(track[i]);
      lastPoint = track[i];
    }
  }
  if (simplified[simplified.length - 1] !== track[track.length - 1]) {
    simplified.push(track[track.length - 1]);
  }
  return simplified;
}
function hashCoordinates(lat1, lng1, lat2, lng2) {
  const hash = Math.floor(lat1 * 1e4) * 1e6 + Math.floor(lng1 * 1e4) * 100 + Math.floor(lat2 * 1e4) * 10 + Math.floor(lng2 * 1e4);
  return hash;
}
async function recordSegmentUsage(runId, userId, segments2) {
  try {
    if (segments2.length === 0) return;
    const values = segments2.map((seg) => ({
      osm_way_id: seg.osmWayId.toString(),
      run_id: runId,
      user_id: userId,
      distance_meters: seg.distance,
      timestamp: /* @__PURE__ */ new Date()
    }));
    for (let i = 0; i < values.length; i += 100) {
      const batch = values.slice(i, i + 100);
      await db.execute(sql6`
        INSERT INTO segment_usage (osm_way_id, run_id, user_id, distance_meters, timestamp)
        SELECT * FROM json_populate_recordset(
          NULL::segment_usage,
          ${JSON.stringify(batch)}
        )
      `);
    }
    console.log(`Recorded ${segments2.length} OSM segments for run ${runId}`);
  } catch (error) {
    console.error("Error recording segment usage:", error);
    throw error;
  }
}
async function getRoutePopularityScore(polyline3) {
  try {
    if (polyline3.length < 2) return 0;
    const segments2 = [];
    for (let i = 0; i < polyline3.length - 1; i++) {
      const [lng1, lat1] = polyline3[i];
      const [lng2, lat2] = polyline3[i + 1];
      const distance = haversineDistance2(lat1, lng1, lat2, lng2);
      const osmWayId = BigInt(Math.abs(hashCoordinates(lat1, lng1, lat2, lng2)));
      segments2.push({
        osmWayId,
        startLat: lat1,
        startLng: lng1,
        endLat: lat2,
        endLng: lng2,
        distance
      });
    }
    const osmWayIds = segments2.map((s) => s.osmWayId.toString());
    const result = await db.execute(sql6`
      SELECT 
        osm_way_id,
        run_count,
        unique_users,
        avg_rating
      FROM segment_popularity
      WHERE osm_way_id = ANY(${osmWayIds})
    `);
    if (result.rows.length === 0) {
      return 0.1;
    }
    let totalScore = 0;
    let totalDistance = 0;
    for (const segment of segments2) {
      const popularity = result.rows.find(
        (row) => row.osm_way_id === segment.osmWayId.toString()
      );
      const segmentScore = popularity ? (popularity.run_count * 0.6 + (popularity.avg_rating || 3) * 0.4) / 50 : 0.1;
      totalScore += segmentScore * segment.distance;
      totalDistance += segment.distance;
    }
    return Math.min(totalScore / totalDistance, 1);
  } catch (error) {
    console.error("Error calculating route popularity:", error);
    return 0.5;
  }
}
function analyzeRouteCharacteristics(gpsTrack) {
  if (gpsTrack.length < 10) {
    return {
      backtrackingScore: 0,
      turnCount: 0,
      hasDeadEnds: false,
      circuitQuality: 0
    };
  }
  let backtrackCount = 0;
  let sharpTurnCount = 0;
  for (let i = 2; i < gpsTrack.length; i++) {
    const p1 = gpsTrack[i - 2];
    const p2 = gpsTrack[i - 1];
    const p3 = gpsTrack[i];
    const angle = calculateAngle(p1, p2, p3);
    if (angle > 160) {
      backtrackCount++;
    } else if (angle > 90) {
      sharpTurnCount++;
    }
  }
  const startEndDistance = haversineDistance2(
    gpsTrack[0].latitude,
    gpsTrack[0].longitude,
    gpsTrack[gpsTrack.length - 1].latitude,
    gpsTrack[gpsTrack.length - 1].longitude
  );
  const isCircuit = startEndDistance < 100;
  return {
    backtrackingScore: backtrackCount / gpsTrack.length,
    turnCount: sharpTurnCount,
    hasDeadEnds: backtrackCount > 3,
    // More than 3 U-turns = likely has dead ends
    circuitQuality: isCircuit ? 1 : Math.max(0, 1 - startEndDistance / 500)
  };
}
function calculateAngle(p1, p2, p3) {
  const bearing1 = calculateBearing(p1, p2);
  const bearing2 = calculateBearing(p2, p3);
  let angle = Math.abs(bearing2 - bearing1);
  if (angle > 180) angle = 360 - angle;
  return angle;
}
function calculateBearing(p1, p2) {
  const lat1 = p1.latitude * Math.PI / 180;
  const lat2 = p2.latitude * Math.PI / 180;
  const dLng = (p2.longitude - p1.longitude) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// server/intelligent-route-generation.ts
import axios2 from "axios";
var GRAPHHOPPER_API_KEY = process.env.GRAPHHOPPER_API_KEY || "";
var GRAPHHOPPER_BASE_URL = "https://graphhopper.com/api/1";
async function generateGraphHopperRoute(lat, lng, distanceMeters, profile, seed = 0) {
  try {
    const response = await axios2.get(`${GRAPHHOPPER_BASE_URL}/route`, {
      params: {
        point: `${lat},${lng}`,
        profile,
        algorithm: "round_trip",
        "round_trip.distance": distanceMeters,
        "round_trip.seed": seed,
        points_encoded: false,
        elevation: true,
        instructions: true,
        details: ["road_class", "surface"],
        key: GRAPHHOPPER_API_KEY
      },
      timeout: 3e4
      // 30 second timeout
    });
    return response.data;
  } catch (error) {
    console.error("GraphHopper API error:", error.response?.data || error.message);
    throw new Error(`GraphHopper API failed: ${error.message}`);
  }
}
function analyzeRoadClasses(roadClassDetails) {
  if (!roadClassDetails || roadClassDetails.length === 0) {
    return {
      hasHighways: false,
      highwayPercentage: 0,
      trailPercentage: 0,
      pathPercentage: 0,
      terrainScore: 0.5
    };
  }
  let totalSegments = 0;
  let highwaySegments = 0;
  let trailSegments = 0;
  let pathSegments = 0;
  for (const detail of roadClassDetails) {
    const [startIdx, endIdx, roadClass] = detail;
    const segmentLength = endIdx - startIdx;
    totalSegments += segmentLength;
    const roadClassLower = (roadClass || "").toLowerCase();
    if (roadClassLower.includes("motorway") || roadClassLower.includes("trunk") || roadClassLower.includes("primary")) {
      highwaySegments += segmentLength;
    }
    if (roadClassLower.includes("track") || roadClassLower.includes("trail")) {
      trailSegments += segmentLength;
    }
    if (roadClassLower.includes("path") || roadClassLower.includes("footway") || roadClassLower.includes("cycleway")) {
      pathSegments += segmentLength;
    }
  }
  const highwayPercentage = totalSegments > 0 ? highwaySegments / totalSegments : 0;
  const trailPercentage = totalSegments > 0 ? trailSegments / totalSegments : 0;
  const pathPercentage = totalSegments > 0 ? pathSegments / totalSegments : 0;
  const terrainScore = Math.max(0, Math.min(
    1,
    trailPercentage * 1 + pathPercentage * 1 - highwayPercentage * 2
  ));
  return {
    hasHighways: highwayPercentage > 0.1,
    // More than 10% highways
    highwayPercentage,
    trailPercentage,
    pathPercentage,
    terrainScore
  };
}
function validateRoute(coordinates, actualDistanceMeters, targetDistanceMeters, roadClassDetails) {
  const issues = [];
  if (coordinates.length < 3) {
    return { isValid: false, issues: [], qualityScore: 0 };
  }
  const distanceDiffPercent = Math.abs(actualDistanceMeters - targetDistanceMeters) / targetDistanceMeters;
  if (distanceDiffPercent > 0.2) {
    issues.push({
      type: "DISTANCE_MISMATCH",
      location: coordinates[0],
      severity: "HIGH"
    });
    console.log(`\u26A0\uFE0F Distance mismatch: ${(distanceDiffPercent * 100).toFixed(1)}% off target (actual=${actualDistanceMeters}m, target=${targetDistanceMeters}m)`);
  }
  for (let i = 1; i < coordinates.length - 1; i++) {
    const angle = calculateAngle2(
      coordinates[i - 1],
      coordinates[i],
      coordinates[i + 1]
    );
    if (angle > 160) {
      issues.push({
        type: "U_TURN",
        location: coordinates[i],
        severity: "HIGH"
      });
    }
  }
  const segmentSet = /* @__PURE__ */ new Set();
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segment = `${coordinates[i][0].toFixed(4)},${coordinates[i][1].toFixed(4)}-${coordinates[i + 1][0].toFixed(4)},${coordinates[i + 1][1].toFixed(4)}`;
    if (segmentSet.has(segment)) {
      issues.push({
        type: "REPEATED_SEGMENT",
        location: coordinates[i],
        severity: "MEDIUM"
      });
    }
    segmentSet.add(segment);
  }
  if (roadClassDetails) {
    const roadAnalysis = analyzeRoadClasses(roadClassDetails);
    if (roadAnalysis.hasHighways) {
      issues.push({
        type: "HIGHWAY",
        location: coordinates[0],
        severity: roadAnalysis.highwayPercentage > 0.3 ? "HIGH" : "MEDIUM"
      });
      console.log(`\u26A0\uFE0F Highway detected: ${(roadAnalysis.highwayPercentage * 100).toFixed(1)}% of route`);
    }
  }
  const highIssues = issues.filter((i) => i.severity === "HIGH").length;
  const mediumIssues = issues.filter((i) => i.severity === "MEDIUM").length;
  const qualityScore = Math.max(0, 1 - (highIssues * 0.3 + mediumIssues * 0.1));
  const isValid = highIssues < 2;
  return { isValid, issues, qualityScore };
}
function calculateAngle2(p1, p2, p3) {
  const bearing1 = calculateBearing2(p1, p2);
  const bearing2 = calculateBearing2(p2, p3);
  let angle = Math.abs(bearing2 - bearing1);
  if (angle > 180) angle = 360 - angle;
  return angle;
}
function calculateBearing2(p1, p2) {
  const [lng1, lat1] = p1;
  const [lng2, lat2] = p2;
  const \u03C61 = lat1 * Math.PI / 180;
  const \u03C62 = lat2 * Math.PI / 180;
  const \u0394\u03BB = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(\u0394\u03BB) * Math.cos(\u03C62);
  const x = Math.cos(\u03C61) * Math.sin(\u03C62) - Math.sin(\u03C61) * Math.cos(\u03C62) * Math.cos(\u0394\u03BB);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}
function calculateDifficulty(distanceKm, elevationGainM) {
  const elevationPerKm = elevationGainM / distanceKm;
  if (elevationPerKm < 10 && distanceKm < 8) {
    return "easy";
  } else if (elevationPerKm < 25 && distanceKm < 15) {
    return "moderate";
  } else {
    return "hard";
  }
}
function calculateLoopQuality(coordinates, startLat, startLng) {
  if (coordinates.length < 2) return 0;
  const startPoint = { lat: startLat, lng: startLng };
  const endPoint = { lat: coordinates[coordinates.length - 1][1], lng: coordinates[coordinates.length - 1][0] };
  const distanceKm = getDistanceKm(startPoint, endPoint);
  return Math.max(0, 1 - distanceKm / 1);
}
function calculateBacktrackRatio(coordinates) {
  if (coordinates.length < 10) return 0;
  const gridSize = 3e-4;
  const segments2 = [];
  let totalSegments = 0;
  let backtrackCount = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const g1 = `${Math.round(coordinates[i][0] / gridSize)},${Math.round(coordinates[i][1] / gridSize)}`;
    const g2 = `${Math.round(coordinates[i + 1][0] / gridSize)},${Math.round(coordinates[i + 1][1] / gridSize)}`;
    if (g1 !== g2) {
      totalSegments++;
      const segment = `${g1}-${g2}`;
      const reverseSegment = `${g2}-${g1}`;
      if (segments2.includes(reverseSegment)) {
        backtrackCount++;
      }
      segments2.push(segment);
    }
  }
  return totalSegments > 0 ? backtrackCount / totalSegments : 0;
}
function getDistanceKm(p1, p2) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
async function generateIntelligentRoute(request) {
  const { latitude, longitude, distanceKm, preferTrails = true } = request;
  const distanceMeters = distanceKm * 1e3;
  if (!GRAPHHOPPER_API_KEY) {
    throw new Error("GRAPHHOPPER_API_KEY is not set in environment variables");
  }
  const profile = "foot";
  console.log(`\u{1F5FA}\uFE0F Generating ${distanceKm}km (${distanceMeters}m) route at (${latitude}, ${longitude})`);
  const maxAttempts = 3;
  const candidates = [];
  const baseSeed = Math.floor(Math.random() * 100);
  console.log(`\u{1F3B2} Using random base seed: ${baseSeed}`);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = baseSeed + attempt;
    try {
      const ghResponse = await generateGraphHopperRoute(
        latitude,
        longitude,
        distanceMeters,
        profile,
        seed
      );
      if (!ghResponse.paths || ghResponse.paths.length === 0) {
        console.log(`Seed ${seed}: No route found`);
        continue;
      }
      const path2 = ghResponse.paths[0];
      let coordinates = path2.points.coordinates;
      const loopQuality = calculateLoopQuality(coordinates, latitude, longitude);
      const backtrackRatio = calculateBacktrackRatio(coordinates);
      console.log(`Seed ${seed}: Circuit - Loop=${loopQuality.toFixed(2)}, Backtrack=${backtrackRatio.toFixed(2)}`);
      if (loopQuality < 0.7) {
        console.log(`Seed ${seed}: Rejected - poor loop quality (${loopQuality.toFixed(2)} < 0.7)`);
        continue;
      }
      if (backtrackRatio > 0.3) {
        console.log(`Seed ${seed}: Rejected - too much backtracking (${backtrackRatio.toFixed(2)} > 0.3)`);
        continue;
      }
      if (coordinates.length > 0) {
        const startPoint = [longitude, latitude];
        coordinates[0] = startPoint;
        coordinates[coordinates.length - 1] = startPoint;
        console.log(`Seed ${seed}: Enforced circular route - start (${startPoint[0].toFixed(6)}, ${startPoint[1].toFixed(6)}) = end`);
      }
      console.log(`Seed ${seed}: GraphHopper returned distance=${path2.distance}m, ascend=${path2.ascend}m, time=${path2.time}ms, points=${coordinates.length}`);
      const roadClassDetails = path2.details?.road_class || [];
      const roadAnalysis = analyzeRoadClasses(roadClassDetails);
      console.log(`Seed ${seed}: Terrain - trails=${(roadAnalysis.trailPercentage * 100).toFixed(1)}%, paths=${(roadAnalysis.pathPercentage * 100).toFixed(1)}%, highways=${(roadAnalysis.highwayPercentage * 100).toFixed(1)}%, score=${roadAnalysis.terrainScore.toFixed(2)}`);
      if (preferTrails && roadAnalysis.terrainScore < 0.3) {
        console.log(`Seed ${seed}: Rejected - user prefers trails but route has low terrain score`);
        continue;
      }
      const validation = validateRoute(coordinates, path2.distance, distanceMeters, roadClassDetails);
      console.log(`Seed ${seed}: Valid=${validation.isValid}, Quality=${validation.qualityScore.toFixed(2)}, Issues=${validation.issues.length}`);
      if (!validation.isValid) {
        console.log(`Seed ${seed}: Rejected - invalid route`);
        continue;
      }
      const popularityScore = await getRoutePopularityScore(coordinates);
      console.log(`Seed ${seed}: Popularity=${popularityScore.toFixed(2)}`);
      candidates.push({
        route: path2,
        validation,
        popularityScore,
        terrainScore: roadAnalysis.terrainScore,
        loopQuality,
        backtrackRatio
      });
    } catch (error) {
      console.error(`Seed ${seed} failed:`, error);
    }
  }
  if (candidates.length === 0) {
    throw new Error("Could not generate a valid route. Try a different location or distance.");
  }
  const scored = candidates.map((c) => {
    let totalScore = c.validation.qualityScore * 0.4 + // 40% weight on quality (no dead ends, highways, distance ok)
    c.popularityScore * 0.25 + // 25% weight on popularity
    c.loopQuality * 0.2 + // 20% weight on circuit quality (proper loop)
    (1 - c.backtrackRatio) * 0.15;
    if (preferTrails && c.terrainScore) {
      totalScore = totalScore * 0.8 + c.terrainScore * 0.2;
      console.log(`Terrain bonus for seed: quality=${c.validation.qualityScore.toFixed(2)}, popularity=${c.popularityScore.toFixed(2)}, terrain=${c.terrainScore.toFixed(2)}, loop=${c.loopQuality.toFixed(2)}, backtrack=${c.backtrackRatio.toFixed(2)}`);
    } else {
      totalScore += c.validation.qualityScore * 0.2;
    }
    return { ...c, totalScore };
  });
  scored.sort((a, b) => b.totalScore - a.totalScore);
  console.log(`\u2705 Generated ${scored.length} routes, returning top ${Math.min(3, scored.length)}`);
  const topRoutes = scored.slice(0, 3);
  return topRoutes.map((candidate, index) => {
    const route = candidate.route;
    const difficulty = calculateDifficulty(
      route.distance / 1e3,
      route.ascend || 0
    );
    console.log(`  Route ${index + 1}: Distance=${route.distance}m (${(route.distance / 1e3).toFixed(2)}km), Score=${candidate.totalScore.toFixed(2)}, Quality=${candidate.validation.qualityScore.toFixed(2)}, Popularity=${candidate.popularityScore.toFixed(2)}, Terrain=${candidate.terrainScore?.toFixed(2) || "N/A"}`);
    const generatedRoute = {
      id: generateRouteId(),
      polyline: encodePolyline(route.points.coordinates),
      coordinates: route.points.coordinates,
      distance: route.distance,
      // Distance in meters from GraphHopper
      elevationGain: route.ascend || 0,
      elevationLoss: route.descend || 0,
      duration: route.time / 1e3,
      // Convert milliseconds to seconds
      difficulty,
      popularityScore: candidate.popularityScore,
      qualityScore: candidate.validation.qualityScore,
      loopQuality: candidate.loopQuality,
      backtrackRatio: candidate.backtrackRatio,
      turnInstructions: route.instructions || []
    };
    console.log(`  \u2192 Returning: distance=${generatedRoute.distance}m, elevation=${generatedRoute.elevationGain}m\u2197/${generatedRoute.elevationLoss}m\u2198, loop=${candidate.loopQuality.toFixed(2)}, backtrack=${candidate.backtrackRatio.toFixed(2)}`);
    return generatedRoute;
  });
}
function generateRouteId() {
  return `route_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
function encodePolyline(coordinates) {
  const latLngCoords = coordinates.map((coord) => [coord[1], coord[0]]);
  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of latLngCoords) {
    const lat5 = Math.round(lat * 1e5);
    const lng5 = Math.round(lng * 1e5);
    encoded += encodeValue(lat5 - prevLat);
    encoded += encodeValue(lng5 - prevLng);
    prevLat = lat5;
    prevLng = lng5;
  }
  return encoded;
}
function encodeValue(value) {
  let encoded = "";
  let num = value < 0 ? ~(value << 1) : value << 1;
  while (num >= 32) {
    encoded += String.fromCharCode((32 | num & 31) + 63);
    num >>= 5;
  }
  encoded += String.fromCharCode(num + 63);
  return encoded;
}

// server/routes.ts
async function registerRoutes(app2) {
  app2.use(garmin_oauth_bridge_default);
  app2.post("/api/auth/register", async (req, res) => {
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
        userCode
      });
      const token = generateToken({ userId: user.id, email: user.email });
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({ user: userWithoutPassword, token });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Failed to register user" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
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
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });
  app2.get("/api/users/search", async (req, res) => {
    try {
      const query = String(req.query.q || "");
      if (!query || query.length < 2) {
        return res.json([]);
      }
      const users2 = await storage.searchUsers(query);
      const sanitized = users2.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        profilePic: u.profilePic,
        userCode: u.userCode
      }));
      res.json(sanitized);
    } catch (error) {
      console.error("Search users error:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });
  app2.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });
  app2.put("/api/users/:id", authMiddleware, async (req, res) => {
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
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  app2.post("/api/users/:id/profile-picture", authMiddleware, async (req, res) => {
    try {
      if (req.user?.userId !== req.params.id) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const { imageData } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: "No image data provided" });
      }
      const updated = await storage.updateUser(req.params.id, {
        profilePic: imageData
      });
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = updated;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Upload profile picture error:", error);
      res.status(500).json({ error: "Failed to upload profile picture" });
    }
  });
  app2.get("/api/friends", authMiddleware, async (req, res) => {
    try {
      const userId = String(req.query.userId || req.user?.userId);
      const friends2 = await storage.getFriends(userId);
      res.json(friends2.map((f) => ({
        id: f.id,
        name: f.name,
        email: f.email,
        profilePic: f.profilePic,
        userCode: f.userCode
      })));
    } catch (error) {
      console.error("Get friends error:", error);
      res.status(500).json({ error: "Failed to get friends" });
    }
  });
  app2.post("/api/friend-requests", authMiddleware, async (req, res) => {
    try {
      const { addresseeId, message } = req.body;
      const requesterId = req.user.userId;
      if (!addresseeId) {
        return res.status(400).json({ error: "Addressee ID is required" });
      }
      const request = await storage.createFriendRequest(requesterId, addresseeId, message);
      res.status(201).json(request);
    } catch (error) {
      console.error("Create friend request error:", error);
      res.status(500).json({ error: "Failed to create friend request" });
    }
  });
  app2.get("/api/friend-requests/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      if (req.user?.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const requests = await storage.getFriendRequests(userId);
      const sent = [];
      const received = [];
      for (const request of requests) {
        if (request.requesterId === userId) {
          const addressee = await storage.getUser(request.addresseeId);
          sent.push({
            ...request,
            addresseeName: addressee?.name,
            addresseeProfilePic: addressee?.profilePic
          });
        } else if (request.addresseeId === userId) {
          const requester = await storage.getUser(request.requesterId);
          received.push({
            ...request,
            requesterName: requester?.name,
            requesterProfilePic: requester?.profilePic
          });
        }
      }
      res.json({ sent, received });
    } catch (error) {
      console.error("Get friend requests error:", error);
      res.status(500).json({ error: "Failed to get friend requests" });
    }
  });
  app2.post("/api/friend-requests/:id/accept", authMiddleware, async (req, res) => {
    try {
      await storage.acceptFriendRequest(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Accept friend request error:", error);
      res.status(500).json({ error: "Failed to accept friend request" });
    }
  });
  app2.post("/api/friend-requests/:id/decline", authMiddleware, async (req, res) => {
    try {
      await storage.declineFriendRequest(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Decline friend request error:", error);
      res.status(500).json({ error: "Failed to decline friend request" });
    }
  });
  function transformRunForAndroid(run) {
    function normalizeDistanceMeters(run2) {
      let d = run2.distance || 0;
      if (!d) return 0;
      if (d > 1e3) return d;
      const hasSplits = Array.isArray(run2.kmSplits) && run2.kmSplits.length > 0;
      const hasPace = typeof run2.avgPace === "string" && run2.avgPace.length > 0;
      const hasTrack = Array.isArray(run2.gpsTrack) && run2.gpsTrack.length > 1;
      if (hasSplits || hasPace || hasTrack) return d * 1e3;
      return d;
    }
    function normalizeNumericSeries(series) {
      if (!series) return [];
      const raw = Array.isArray(series) ? series : Array.isArray(series?.samples) ? series.samples : [];
      return raw.map((entry) => {
        if (typeof entry === "number") return entry;
        if (typeof entry?.value === "number") return entry.value;
        if (typeof entry?.bpm === "number") return entry.bpm;
        if (typeof entry?.heartRate === "number") return entry.heartRate;
        if (typeof entry?.paceSeconds === "number") return entry.paceSeconds;
        if (typeof entry?.pace === "number") return entry.pace;
        if (typeof entry?.speed === "number") return entry.speed;
        return null;
      }).filter((v) => typeof v === "number");
    }
    const completedAtMs = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
    const durationMs = (run.duration || 0) * 1e3;
    const endTime = completedAtMs;
    const startTime = completedAtMs - durationMs;
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
          windDirection: typeof run.weatherData.windDirection === "string" ? null : run.weatherData.windDirection || null,
          uvIndex: run.weatherData.uvIndex || null,
          condition: run.weatherData.condition || run.weatherData.description || null
        };
      } catch (e) {
        console.error("Error transforming weather data:", e);
        weatherData = null;
      }
    }
    return {
      id: run.id,
      startTime,
      endTime,
      duration: durationMs,
      distance: normalizeDistanceMeters(run),
      averageSpeed: normalizeDistanceMeters(run) && run.duration ? normalizeDistanceMeters(run) / (run.duration / 1e3) : 0,
      maxSpeed: 0,
      // Calculate from gpsTrack if needed
      averagePace: run.avgPace || `0'00"/km`,
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
  app2.get("/api/runs/user/:userId", authMiddleware, async (req, res) => {
    try {
      const runs2 = await storage.getUserRuns(req.params.userId);
      const transformedRuns = runs2.map(transformRunForAndroid);
      res.json(transformedRuns);
    } catch (error) {
      console.error("Get user runs error:", error);
      res.status(500).json({ error: "Failed to get runs" });
    }
  });
  app2.get("/api/users/:userId/runs", authMiddleware, async (req, res) => {
    try {
      const runs2 = await storage.getUserRuns(req.params.userId);
      const transformedRuns = runs2.map(transformRunForAndroid);
      res.json(transformedRuns);
    } catch (error) {
      console.error("Get user runs error:", error);
      res.status(500).json({ error: "Failed to get runs" });
    }
  });
  app2.get("/api/runs/:id", authMiddleware, async (req, res) => {
    try {
      console.log(`[GET /api/runs/${req.params.id}] Fetching run for user: ${req.user?.userId}`);
      const run = await storage.getRun(req.params.id);
      if (!run) {
        console.error(`[GET /api/runs/${req.params.id}] Run NOT FOUND in database`);
        return res.status(404).json({ error: "Run not found" });
      }
      console.log(`[GET /api/runs/${req.params.id}] Run found - userId: ${run.userId}, distance: ${run.distanceInMeters}`);
      const transformedRun = transformRunForAndroid(run);
      res.json(transformedRun);
    } catch (error) {
      console.error("[GET /api/runs/:id] Get run error:", error);
      res.status(500).json({ error: "Failed to get run" });
    }
  });
  app2.post("/api/runs", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
      const runData = req.body;
      let tss = runData.tss || 0;
      if (tss === 0 && runData.duration) {
        tss = calculateTSS(
          runData.duration,
          runData.avgHeartRate,
          runData.maxHeartRate,
          60,
          // Default resting HR (could get from user profile)
          runData.difficulty
        );
      }
      const processedRunData = {
        ...runData,
        completedAt: runData.completedAt ? new Date(runData.completedAt) : void 0,
        startTime: runData.startTime ? new Date(runData.startTime) : void 0,
        endTime: runData.endTime ? new Date(runData.endTime) : void 0,
        // Convert aiCoachingNotes timestamps if present
        aiCoachingNotes: runData.aiCoachingNotes?.map((note) => ({
          ...note,
          time: note.time ? new Date(note.time) : void 0
        })),
        // Convert strugglePoints timestamps if present
        strugglePoints: runData.strugglePoints?.map((sp) => ({
          ...sp,
          timestamp: sp.timestamp ? new Date(sp.timestamp) : void 0
        }))
      };
      console.log(`[POST /api/runs] Creating run for user: ${userId}`);
      const run = await storage.createRun({
        ...processedRunData,
        userId,
        tss
      });
      console.log(`[POST /api/runs] Run created successfully with ID: ${run.id}`);
      if (run.completedAt && tss > 0) {
        const completedAtDate = typeof run.completedAt === "number" ? new Date(run.completedAt) : run.completedAt;
        const runDate = completedAtDate.toISOString().split("T")[0];
        updateDailyFitness(userId, runDate, tss).catch((err) => {
          console.error("Error updating daily fitness:", err.message || err);
        });
      }
      if (run.gpsTrack && Array.isArray(run.gpsTrack)) {
        matchRunToSegments(
          run.id,
          userId,
          run.gpsTrack,
          run.avgHeartRate || void 0,
          run.maxHeartRate || void 0,
          run.cadence || void 0
        ).catch((err) => {
          console.error("Failed to match segments:", err);
        });
        (async () => {
          try {
            const osmSegments = await snapTrackToOSMSegments(run.gpsTrack);
            await recordSegmentUsage(run.id, userId, osmSegments);
            const characteristics = analyzeRouteCharacteristics(run.gpsTrack);
            console.log(`Run ${run.id} characteristics:`, characteristics);
            await db.execute(sql8`
              UPDATE runs 
              SET route_characteristics = ${JSON.stringify(characteristics)}
              WHERE id = ${run.id}
            `);
          } catch (err) {
            console.error("Failed to track OSM segments:", err);
          }
        })();
      }
      checkAchievementsAfterRun(run.id, userId).catch((err) => {
        console.error("Failed to check achievements:", err);
      });
      res.status(201).json(run);
    } catch (error) {
      console.error("Create run error:", error);
      res.status(500).json({ error: "Failed to create run" });
    }
  });
  app2.post("/api/runs/sync-progress", authMiddleware, async (req, res) => {
    try {
      const { runId, ...data } = req.body;
      if (runId) {
        const run = await storage.updateRun(runId, data);
        res.json(run);
      } else {
        const run = await storage.createRun({
          ...data,
          userId: req.user.userId
        });
        res.json(run);
      }
    } catch (error) {
      console.error("Sync run progress error:", error);
      res.status(500).json({ error: "Failed to sync run progress" });
    }
  });
  app2.get("/api/runs/:id/analysis", async (req, res) => {
    try {
      const analysis = await storage.getRunAnalysis(req.params.id);
      res.json(analysis || null);
    } catch (error) {
      console.error("Get run analysis error:", error);
      res.status(500).json({ error: "Failed to get analysis" });
    }
  });
  app2.post("/api/runs/:id/analysis", authMiddleware, async (req, res) => {
    try {
      const analysis = await storage.createRunAnalysis(req.params.id, req.body);
      res.status(201).json(analysis);
    } catch (error) {
      console.error("Create run analysis error:", error);
      res.status(500).json({ error: "Failed to create analysis" });
    }
  });
  app2.post("/api/runs/:id/comprehensive-analysis", authMiddleware, async (req, res) => {
    try {
      const runId = req.params.id;
      const userId = req.user.userId;
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      const user = await storage.getUser(userId);
      const coachName = user?.coachName || "AI Coach";
      const coachTone = user?.coachTone || "energetic";
      const garminActivity = await db.query.garminActivities.findFirst({
        where: eq6(garminActivities.runId, runId)
      });
      const runDate = run.runDate || (run.completedAt ? (typeof run.completedAt === "number" ? new Date(run.completedAt) : run.completedAt).toISOString().split("T")[0] : (/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
      const wellness = await db.query.garminWellnessMetrics.findFirst({
        where: and6(
          eq6(garminWellnessMetrics.userId, userId),
          eq6(garminWellnessMetrics.date, runDate)
        )
      });
      const previousRuns = await db.query.runs.findMany({
        where: eq6(runs.userId, userId),
        orderBy: desc4(runs.completedAt),
        limit: 10
      });
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const analysis = await aiService.generateComprehensiveRunAnalysis({
        runData: run,
        garminActivity: garminActivity ? {
          activityType: garminActivity.activityType || void 0,
          durationInSeconds: garminActivity.durationInSeconds || void 0,
          distanceInMeters: garminActivity.distanceInMeters || void 0,
          averageHeartRate: garminActivity.averageHeartRateInBeatsPerMinute || void 0,
          maxHeartRate: garminActivity.maxHeartRateInBeatsPerMinute || void 0,
          averagePace: garminActivity.averagePaceInMinutesPerKilometer || void 0,
          averageCadence: garminActivity.averageRunCadenceInStepsPerMinute || void 0,
          maxCadence: garminActivity.maxRunCadenceInStepsPerMinute || void 0,
          averageStrideLength: garminActivity.averageStrideLength || void 0,
          groundContactTime: garminActivity.groundContactTime || void 0,
          verticalOscillation: garminActivity.verticalOscillation || void 0,
          verticalRatio: garminActivity.verticalRatio || void 0,
          elevationGain: garminActivity.totalElevationGainInMeters || void 0,
          elevationLoss: garminActivity.totalElevationLossInMeters || void 0,
          aerobicTrainingEffect: garminActivity.aerobicTrainingEffect || void 0,
          anaerobicTrainingEffect: garminActivity.anaerobicTrainingEffect || void 0,
          vo2Max: garminActivity.vo2Max || void 0,
          recoveryTime: garminActivity.recoveryTimeInMinutes || void 0,
          activeKilocalories: garminActivity.activeKilocalories || void 0,
          averagePower: garminActivity.averagePowerInWatts || void 0,
          laps: garminActivity.laps || void 0,
          splits: garminActivity.splits || void 0
        } : void 0,
        wellness: wellness ? {
          totalSleepSeconds: wellness.totalSleepSeconds || void 0,
          deepSleepSeconds: wellness.deepSleepSeconds || void 0,
          lightSleepSeconds: wellness.lightSleepSeconds || void 0,
          remSleepSeconds: wellness.remSleepSeconds || void 0,
          sleepScore: wellness.sleepScore || void 0,
          sleepQuality: wellness.sleepQuality || void 0,
          averageStressLevel: wellness.averageStressLevel || void 0,
          bodyBatteryCurrent: wellness.bodyBatteryCurrent || void 0,
          bodyBatteryHigh: wellness.bodyBatteryHigh || void 0,
          bodyBatteryLow: wellness.bodyBatteryLow || void 0,
          hrvWeeklyAvg: wellness.hrvWeeklyAvg || void 0,
          hrvLastNightAvg: wellness.hrvLastNightAvg || void 0,
          hrvStatus: wellness.hrvStatus || void 0,
          steps: wellness.steps || void 0,
          restingHeartRate: wellness.restingHeartRate || void 0,
          readinessScore: wellness.readinessScore || void 0,
          avgSpO2: wellness.avgSpO2 || void 0,
          avgWakingRespirationValue: wellness.avgWakingRespirationValue || void 0
        } : void 0,
        previousRuns: previousRuns.filter((r) => r.id !== runId).slice(0, 5),
        userProfile: user ? {
          fitnessLevel: user.fitnessLevel || void 0,
          age: user.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1e3)) : void 0,
          weight: user.weight ? parseFloat(user.weight) : void 0
        } : void 0,
        coachName,
        coachTone
      });
      await storage.createRunAnalysis(runId, { analysis });
      await storage.updateRun(runId, {
        aiInsights: JSON.stringify({
          summary: analysis.summary,
          performanceScore: analysis.performanceScore,
          highlights: analysis.highlights
        }),
        aiCoachingNotes: analysis
      });
      res.json({
        success: true,
        analysis,
        hasGarminData: !!garminActivity,
        hasWellnessData: !!wellness
      });
    } catch (error) {
      console.error("Comprehensive run analysis error:", error);
      res.status(500).json({ error: "Failed to generate comprehensive analysis" });
    }
  });
  app2.get("/api/routes/user/:userId", authMiddleware, async (req, res) => {
    try {
      const routes2 = await storage.getUserRoutes(req.params.userId);
      res.json(routes2);
    } catch (error) {
      console.error("Get user routes error:", error);
      res.status(500).json({ error: "Failed to get routes" });
    }
  });
  app2.get("/api/routes/:id", async (req, res) => {
    try {
      const route = await storage.getRoute(req.params.id);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      res.json(route);
    } catch (error) {
      console.error("Get route error:", error);
      res.status(500).json({ error: "Failed to get route" });
    }
  });
  app2.post("/api/routes", authMiddleware, async (req, res) => {
    try {
      const route = await storage.createRoute({
        ...req.body,
        userId: req.user.userId
      });
      res.status(201).json(route);
    } catch (error) {
      console.error("Create route error:", error);
      res.status(500).json({ error: "Failed to create route" });
    }
  });
  app2.post("/api/routes/generate-options", authMiddleware, async (req, res) => {
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
      const templatesample = sampleSize !== void 0 ? parseInt(sampleSize) : 50;
      const topN = returnTopN !== void 0 ? parseInt(returnTopN) : 5;
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
      const routeGen = await Promise.resolve().then(() => (init_route_generation(), route_generation_exports));
      const routes2 = await routeGen.generateRouteOptions(
        parseFloat(startLat),
        parseFloat(startLng),
        parseFloat(distance),
        activityType || "run",
        templatesample,
        topN
      );
      console.log("[API] Generated routes count:", routes2.length);
      const formattedRoutes = routes2.map((route, index) => ({
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
          angularSpread: route.angularSpread
        }
      }));
      res.json({ routes: formattedRoutes });
    } catch (error) {
      console.error("Generate routes error:", error);
      res.status(500).json({ error: "Failed to generate routes" });
    }
  });
  app2.post("/api/routes/generate-intelligent", authMiddleware, async (req, res) => {
    console.log("\u{1F3AF} Route generation endpoint HIT!");
    console.log("\u{1F4E6} Request body:", JSON.stringify(req.body, null, 2));
    try {
      const { latitude, longitude, distanceKm, preferTrails, avoidHills } = req.body;
      if (!latitude || !longitude || !distanceKm) {
        console.log("\u274C Missing required fields!");
        return res.status(400).json({
          error: "Missing required fields: latitude, longitude, distanceKm"
        });
      }
      console.log(`\u{1F5FA}\uFE0F  Intelligent route generation: ${distanceKm}km at (${latitude}, ${longitude})`);
      console.log(`\u{1F332} Trails: ${preferTrails}, \u26F0\uFE0F Avoid Hills: ${avoidHills}`);
      console.log("\u23F3 Calling generateIntelligentRoute()...");
      const startTime = Date.now();
      const routes2 = await generateIntelligentRoute({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        distanceKm: parseFloat(distanceKm),
        preferTrails: preferTrails !== false,
        avoidHills: avoidHills === true
      });
      const elapsed = ((Date.now() - startTime) / 1e3).toFixed(2);
      console.log(`\u2705 Route generation completed in ${elapsed}s`);
      console.log(`\u{1F4CA} Generated ${routes2.length} routes`);
      res.json({
        success: true,
        routes: routes2.map((route) => ({
          id: route.id,
          polyline: route.polyline,
          distance: route.distance,
          elevationGain: route.elevationGain,
          elevationLoss: route.elevationLoss,
          difficulty: route.difficulty,
          estimatedTime: route.duration,
          popularityScore: route.popularityScore,
          qualityScore: route.qualityScore,
          turnInstructions: route.turnInstructions
        }))
      });
    } catch (error) {
      console.error("Intelligent route generation error:", error);
      res.status(500).json({
        error: error.message || "Failed to generate intelligent route"
      });
    }
  });
  app2.post("/api/routes/generate-ai", authMiddleware, async (req, res) => {
    try {
      const { startLat, startLng, distance, activityType } = req.body;
      console.log("[API] \u{1F916} AI Route Generation (Premium+) request:", { startLat, startLng, distance, activityType });
      if (!startLat || !startLng || !distance) {
        return res.status(400).json({ error: "Missing required fields: startLat, startLng, distance" });
      }
      const routeGenAI = await Promise.resolve().then(() => (init_route_generation_ai(), route_generation_ai_exports));
      const routes2 = await routeGenAI.generateAIRoutesWithGoogle(
        parseFloat(startLat),
        parseFloat(startLng),
        parseFloat(distance),
        activityType || "run"
      );
      console.log("[API] \u2705 Generated AI routes count:", routes2.length);
      const formattedRoutes = routes2.map((route) => ({
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
          loopQuality: route.circuitQuality.loopQuality
        }
      }));
      res.json({ routes: formattedRoutes });
    } catch (error) {
      console.error("Generate AI routes error:", error);
      res.status(500).json({ error: "Failed to generate routes" });
    }
  });
  app2.post("/api/routes/generate-template", authMiddleware, async (req, res) => {
    try {
      const { startLat, startLng, distance, activityType } = req.body;
      console.log("[API] \u{1F4D0} Template Route Generation (Free/Lite) request:", { startLat, startLng, distance, activityType });
      if (!startLat || !startLng || !distance) {
        return res.status(400).json({ error: "Missing required fields: startLat, startLng, distance" });
      }
      const routeGenV1 = await Promise.resolve().then(() => (init_route_generation(), route_generation_exports));
      const routes2 = await routeGenV1.generateRouteOptions(
        parseFloat(startLat),
        parseFloat(startLng),
        parseFloat(distance),
        activityType || "run",
        50,
        // sampleSize
        5
        // returnTopN
      );
      console.log("[API] \u2705 Generated template routes count:", routes2.length);
      const formattedRoutes = routes2.map((route) => ({
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
          angularSpread: route.angularSpread
        }
      }));
      res.json({ routes: formattedRoutes });
    } catch (error) {
      console.error("Generate template routes error:", error);
      res.status(500).json({ error: "Failed to generate routes" });
    }
  });
  app2.get("/api/routes/:id/ratings", async (req, res) => {
    try {
      const ratings = await storage.getRouteRatings(req.params.id);
      res.json(ratings);
    } catch (error) {
      console.error("Get route ratings error:", error);
      res.status(500).json({ error: "Failed to get ratings" });
    }
  });
  app2.post("/api/routes/:id/ratings", authMiddleware, async (req, res) => {
    try {
      const rating = await storage.createRouteRating({
        ...req.body,
        userId: req.user.userId
      });
      res.status(201).json(rating);
    } catch (error) {
      console.error("Create route rating error:", error);
      res.status(500).json({ error: "Failed to create rating" });
    }
  });
  app2.get("/api/goals/:userId", authMiddleware, async (req, res) => {
    try {
      const userId = req.params.userId;
      console.log(`[GET /api/goals/:userId] Fetching goals for userId: ${userId}`);
      const rawGoals = await storage.getUserGoals(userId);
      console.log(`[GET /api/goals/:userId] Found ${rawGoals.length} goals for user ${userId}`);
      const goals4 = rawGoals.map((goal) => ({
        id: goal.id,
        userId: goal.userId,
        type: goal.type,
        title: goal.title,
        description: goal.description,
        notes: goal.notes,
        targetDate: goal.targetDate?.toISOString().split("T")[0],
        // YYYY-MM-DD
        eventName: goal.eventName,
        eventLocation: goal.eventLocation,
        distanceTarget: goal.distanceTarget,
        timeTargetSeconds: goal.timeTargetSeconds,
        healthTarget: goal.healthTarget,
        weeklyRunTarget: goal.weeklyRunTarget,
        currentProgress: goal.progressPercent ?? 0,
        isActive: goal.status === "active",
        isCompleted: !!goal.completedAt,
        createdAt: goal.createdAt?.toISOString(),
        updatedAt: goal.updatedAt?.toISOString(),
        completedAt: goal.completedAt?.toISOString()
      }));
      console.log(`[GET /api/goals/:userId] Returning ${goals4.length} formatted goals`);
      res.json(goals4);
    } catch (error) {
      console.error("[GET /api/goals/:userId] Error:", error);
      if (error.message?.includes("not found") || error.message?.includes("No goals")) {
        console.log(`[GET /api/goals/:userId] No goals found, returning empty array`);
        return res.json([]);
      }
      res.status(500).json({ error: "Failed to get goals" });
    }
  });
  app2.post("/api/goals", authMiddleware, async (req, res) => {
    try {
      const goalData = {
        userId: req.user.userId,
        // Always use authenticated user, ignore body userId
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
        status: "active",
        progressPercent: 0
      };
      const rawGoal = await storage.createGoal(goalData);
      const goal = {
        id: rawGoal.id,
        userId: rawGoal.userId,
        type: rawGoal.type,
        title: rawGoal.title,
        description: rawGoal.description,
        notes: rawGoal.notes,
        targetDate: rawGoal.targetDate?.toISOString().split("T")[0],
        eventName: rawGoal.eventName,
        eventLocation: rawGoal.eventLocation,
        distanceTarget: rawGoal.distanceTarget,
        timeTargetSeconds: rawGoal.timeTargetSeconds,
        healthTarget: rawGoal.healthTarget,
        weeklyRunTarget: rawGoal.weeklyRunTarget,
        currentProgress: rawGoal.progressPercent ?? 0,
        isActive: rawGoal.status === "active",
        isCompleted: !!rawGoal.completedAt,
        createdAt: rawGoal.createdAt?.toISOString(),
        updatedAt: rawGoal.updatedAt?.toISOString(),
        completedAt: rawGoal.completedAt?.toISOString()
      };
      res.status(201).json(goal);
    } catch (error) {
      console.error("Create goal error:", error);
      res.status(500).json({ error: "Failed to create goal" });
    }
  });
  app2.put("/api/goals/:id", authMiddleware, async (req, res) => {
    try {
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
        weeklyRunTarget: req.body.weeklyRunTarget || null
      };
      const rawGoal = await storage.updateGoal(req.params.id, updateData);
      if (!rawGoal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      const goal = {
        id: rawGoal.id,
        userId: rawGoal.userId,
        type: rawGoal.type,
        title: rawGoal.title,
        description: rawGoal.description,
        notes: rawGoal.notes,
        targetDate: rawGoal.targetDate?.toISOString().split("T")[0],
        eventName: rawGoal.eventName,
        eventLocation: rawGoal.eventLocation,
        distanceTarget: rawGoal.distanceTarget,
        timeTargetSeconds: rawGoal.timeTargetSeconds,
        healthTarget: rawGoal.healthTarget,
        weeklyRunTarget: rawGoal.weeklyRunTarget,
        currentProgress: rawGoal.progressPercent ?? 0,
        isActive: rawGoal.status === "active",
        isCompleted: !!rawGoal.completedAt,
        createdAt: rawGoal.createdAt?.toISOString(),
        updatedAt: rawGoal.updatedAt?.toISOString(),
        completedAt: rawGoal.completedAt?.toISOString()
      };
      res.json(goal);
    } catch (error) {
      console.error("Update goal error:", error);
      res.status(500).json({ error: "Failed to update goal" });
    }
  });
  app2.delete("/api/goals/:id", authMiddleware, async (req, res) => {
    try {
      await storage.deleteGoal(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete goal error:", error);
      res.status(500).json({ error: "Failed to delete goal" });
    }
  });
  app2.get("/api/users/:userId/friends", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      console.log(`[GET /api/users/:userId/friends] Fetching friends for userId: ${userId}`);
      const friends2 = await storage.getFriends(userId);
      res.json(friends2.map((f) => ({
        id: f.id,
        name: f.name,
        email: f.email,
        profilePic: f.profilePic,
        userCode: f.userCode
      })));
      console.log(`[GET /api/users/:userId/friends] Returning ${friends2.length} friends`);
    } catch (error) {
      console.error("[GET /api/users/:userId/friends] Error:", error);
      res.status(500).json({ error: "Failed to fetch friends" });
    }
  });
  app2.get("/api/events/grouped", async (req, res) => {
    try {
      const events2 = await storage.getEvents();
      const grouped = {};
      events2.forEach((event) => {
        if (!grouped[event.country]) {
          grouped[event.country] = [];
        }
        grouped[event.country].push(event);
      });
      res.json(grouped);
    } catch (error) {
      console.error("Get events error:", error);
      res.status(500).json({ error: "Failed to get events" });
    }
  });
  app2.get("/api/notifications", authMiddleware, async (req, res) => {
    try {
      const userId = String(req.query.userId || req.user?.userId);
      const notifications2 = await storage.getUserNotifications(userId);
      res.json(notifications2);
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });
  app2.put("/api/notifications/:id/read", authMiddleware, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });
  app2.put("/api/notifications/mark-all-read", authMiddleware, async (req, res) => {
    try {
      await storage.markAllNotificationsRead(req.user.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });
  app2.delete("/api/notifications/:id", authMiddleware, async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete notification error:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });
  app2.get("/api/notification-preferences/:userId", authMiddleware, async (req, res) => {
    try {
      const prefs = await storage.getNotificationPreferences(req.params.userId);
      res.json(prefs || {});
    } catch (error) {
      console.error("Get notification preferences error:", error);
      res.status(500).json({ error: "Failed to get preferences" });
    }
  });
  app2.put("/api/notification-preferences/:userId", authMiddleware, async (req, res) => {
    try {
      const prefs = await storage.updateNotificationPreferences(req.params.userId, req.body);
      res.json(prefs);
    } catch (error) {
      console.error("Update notification preferences error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });
  app2.get("/api/live-sessions/:sessionId", async (req, res) => {
    try {
      const session = await storage.getLiveSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Get live session error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });
  app2.get("/api/users/:userId/live-session", async (req, res) => {
    try {
      const session = await storage.getUserLiveSession(req.params.userId);
      res.json(session || null);
    } catch (error) {
      console.error("Get user live session error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });
  app2.put("/api/live-sessions/sync", authMiddleware, async (req, res) => {
    try {
      const { sessionId, ...data } = req.body;
      if (sessionId) {
        const session = await storage.updateLiveSession(sessionId, data);
        res.json(session);
      } else {
        const session = await storage.createLiveSession({
          ...data,
          userId: req.user.userId
        });
        res.json(session);
      }
    } catch (error) {
      console.error("Sync live session error:", error);
      res.status(500).json({ error: "Failed to sync session" });
    }
  });
  app2.post("/api/live-sessions/end-by-key", authMiddleware, async (req, res) => {
    try {
      const { sessionKey } = req.body;
      await storage.endLiveSession(sessionKey);
      res.json({ success: true });
    } catch (error) {
      console.error("End live session error:", error);
      res.status(500).json({ error: "Failed to end session" });
    }
  });
  app2.get("/api/group-runs", authMiddleware, async (req, res) => {
    try {
      const groupRuns2 = await storage.getGroupRuns();
      res.json(groupRuns2);
    } catch (error) {
      console.error("Get group runs error:", error);
      res.status(500).json({ error: "Failed to get group runs" });
    }
  });
  app2.get("/api/group-runs/:id", async (req, res) => {
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
  app2.post("/api/group-runs", authMiddleware, async (req, res) => {
    try {
      const inviteToken = `GR${Date.now().toString(36).toUpperCase()}`;
      const groupRun = await storage.createGroupRun({
        ...req.body,
        hostUserId: req.user.userId,
        inviteToken
      });
      res.status(201).json(groupRun);
    } catch (error) {
      console.error("Create group run error:", error);
      res.status(500).json({ error: "Failed to create group run" });
    }
  });
  app2.post("/api/group-runs/:id/join", authMiddleware, async (req, res) => {
    try {
      const participant = await storage.joinGroupRun(req.params.id, req.user.userId);
      res.status(201).json(participant);
    } catch (error) {
      console.error("Join group run error:", error);
      res.status(500).json({ error: "Failed to join group run" });
    }
  });
  app2.post("/api/ai/coach", async (req, res) => {
    try {
      const { message, context } = req.body;
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const response = await aiService.getCoachingResponse(message, context || {});
      res.json({ message: response });
    } catch (error) {
      console.error("AI coach error:", error);
      res.status(500).json({ error: "Failed to get AI coaching" });
    }
  });
  app2.post("/api/ai/tts", async (req, res) => {
    try {
      const { text: text2, voice } = req.body;
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const audioBuffer = await aiService.generateTTS(text2, voice || "alloy");
      res.set("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
    } catch (error) {
      console.error("AI TTS error:", error);
      res.status(500).json({ error: "Failed to generate TTS" });
    }
  });
  app2.post("/api/ai/coaching", async (req, res) => {
    try {
      const { message, context } = req.body;
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const response = await aiService.getCoachingResponse(message, context || {});
      res.json({ message: response });
    } catch (error) {
      console.error("AI coaching error:", error);
      res.status(500).json({ error: "Failed to get coaching response" });
    }
  });
  app2.post("/api/ai/run-summary", async (req, res) => {
    try {
      const { lat, lng, distance, elevationGain, elevationLoss, difficulty, activityType, targetTime, firstTurnInstruction } = req.body;
      let weatherData = null;
      try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        if (weatherRes.ok) {
          const data = await weatherRes.json();
          const current = data.current;
          const weatherCodeToCondition = (code) => {
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
            condition: weatherCodeToCondition(current.weather_code)
          };
        }
      } catch (e) {
        console.log("Weather fetch failed, continuing without weather");
      }
      const distanceKm = distance?.toFixed(1) || "?";
      const elevGain = Math.round(elevationGain || 0);
      const elevLoss = Math.round(elevationLoss || elevationGain || 0);
      let terrainType = "flat";
      if (elevGain > 100) terrainType = "hilly";
      else if (elevGain > 50) terrainType = "undulating";
      const terrainAnalysis = `${distanceKm}km ${terrainType} circuit with ${elevGain}m climb and ${elevLoss}m descent.`;
      let targetPace = null;
      if (targetTime && distance) {
        const totalMinutes = (targetTime.hours || 0) * 60 + (targetTime.minutes || 0) + (targetTime.seconds || 0) / 60;
        if (totalMinutes > 0) {
          const paceMinPerKm = totalMinutes / distance;
          const paceMins = Math.floor(paceMinPerKm);
          const paceSecs = Math.round((paceMinPerKm - paceMins) * 60);
          targetPace = `${paceMins}:${paceSecs.toString().padStart(2, "0")} min/km`;
        }
      }
      const motivationalStatements = [
        "You've got this. One step at a time.",
        "Trust your training and enjoy the run.",
        "Every kilometre is progress. Let's go!",
        "Today is your day. Make it count.",
        "Focus, breathe, and run your best."
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
        feelsLike: weatherData?.feelsLike
      });
    } catch (error) {
      console.error("AI run summary error:", error);
      res.status(500).json({ error: "Failed to get run summary" });
    }
  });
  app2.post("/api/ai/pre-run-summary", async (req, res) => {
    try {
      const { route, weather } = req.body;
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const summary = await aiService.generatePreRunSummary(route, weather);
      res.json(summary);
    } catch (error) {
      console.error("AI pre-run summary error:", error);
      res.status(500).json({ error: "Failed to get pre-run summary" });
    }
  });
  app2.post("/api/ai/elevation-coaching", async (req, res) => {
    try {
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const tip = await aiService.getElevationCoaching(req.body);
      res.json({ message: tip });
    } catch (error) {
      console.error("AI elevation coaching error:", error);
      res.status(500).json({ error: "Failed to get elevation coaching" });
    }
  });
  app2.post("/api/ai/pace-update", async (req, res) => {
    try {
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const message = await aiService.generatePaceUpdate(req.body);
      res.json({ message });
    } catch (error) {
      console.error("AI pace update error:", error);
      res.status(500).json({ error: "Failed to get pace update" });
    }
  });
  app2.post("/api/ai/phase-coaching", async (req, res) => {
    try {
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const message = await aiService.generatePhaseCoaching(req.body);
      res.json({ message });
    } catch (error) {
      console.error("AI phase coaching error:", error);
      res.status(500).json({ error: "Failed to get phase coaching" });
    }
  });
  app2.post("/api/ai/struggle-coaching", async (req, res) => {
    try {
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const message = await aiService.generateStruggleCoaching(req.body);
      res.json({ message });
    } catch (error) {
      console.error("AI struggle coaching error:", error);
      res.status(500).json({ error: "Failed to get struggle coaching" });
    }
  });
  app2.post("/api/runs/:id/ai-insights", async (req, res) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const insights = await aiService.generateRunSummary({
        ...run,
        ...req.body
      });
      await storage.updateRun(req.params.id, { aiInsights: JSON.stringify(insights) });
      res.json(insights);
    } catch (error) {
      console.error("AI insights error:", error);
      res.status(500).json({ error: "Failed to get AI insights" });
    }
  });
  app2.get("/api/weather/current", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng are required" });
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status}`);
      }
      const data = await response.json();
      const current = data.current;
      const weatherCodeToCondition = (code) => {
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
        weatherCode: current.weather_code
      });
    } catch (error) {
      console.error("Weather error:", error);
      res.status(500).json({ error: "Failed to get weather" });
    }
  });
  app2.get("/api/weather/full", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng are required" });
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=1&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Weather error:", error);
      res.status(500).json({ error: "Failed to get weather" });
    }
  });
  app2.get("/api/geocode/reverse", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      const response = await fetch(`https://airuncoach.live/api/geocode/reverse?lat=${lat}&lng=${lng}`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Geocode error:", error);
      res.status(500).json({ error: "Failed to geocode" });
    }
  });
  app2.get("/api/subscriptions/status", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      res.json({
        tier: user?.subscriptionTier || "free",
        status: user?.subscriptionStatus || "inactive",
        entitlementType: user?.entitlementType,
        expiresAt: user?.entitlementExpiresAt
      });
    } catch (error) {
      console.error("Get subscription status error:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });
  app2.post("/api/push-subscriptions", authMiddleware, async (req, res) => {
    try {
      res.json({ success: true });
    } catch (error) {
      console.error("Push subscription error:", error);
      res.status(500).json({ error: "Failed to save push subscription" });
    }
  });
  app2.post("/api/coaching-logs/:sessionKey", async (req, res) => {
    try {
      res.json({ success: true });
    } catch (error) {
      console.error("Coaching log error:", error);
      res.status(500).json({ error: "Failed to save coaching log" });
    }
  });
  app2.get("/api/connected-devices", authMiddleware, async (req, res) => {
    try {
      const devices = await storage.getConnectedDevices(req.user.userId);
      res.json(devices);
    } catch (error) {
      console.error("Get connected devices error:", error);
      res.status(500).json({ error: "Failed to get connected devices" });
    }
  });
  app2.post("/api/connected-devices", authMiddleware, async (req, res) => {
    try {
      const { deviceType, deviceName, deviceId } = req.body;
      if (!deviceType) {
        return res.status(400).json({ error: "deviceType is required" });
      }
      const existing = await storage.getConnectedDevices(req.user.userId);
      const existingDevice = existing.find((d) => d.deviceType === deviceType && d.isActive);
      if (existingDevice) {
        return res.status(400).json({ error: "Device already connected" });
      }
      const device = await storage.createConnectedDevice({
        userId: req.user.userId,
        deviceType,
        deviceName: deviceName || `${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Device`,
        deviceId
      });
      res.status(201).json(device);
    } catch (error) {
      console.error("Connect device error:", error);
      res.status(500).json({ error: "Failed to connect device" });
    }
  });
  app2.delete("/api/connected-devices/:deviceId", authMiddleware, async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      if (!deviceId || deviceId.trim() === "") {
        return res.status(400).json({ error: "Invalid device ID" });
      }
      const devices = await storage.getConnectedDevices(req.user.userId);
      const device = devices.find((d) => d.id === deviceId);
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      await storage.deleteConnectedDevice(deviceId);
      console.log(`\u2705 Device ${deviceId} (${device.deviceType}) disconnected for user ${req.user.userId}`);
      res.status(204).send();
    } catch (error) {
      console.error("Disconnect device error:", error);
      res.status(500).json({ error: "Failed to disconnect device" });
    }
  });
  app2.delete("/api/connected-devices/:id", authMiddleware, async (req, res) => {
    try {
      const device = await storage.getConnectedDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      if (device.userId !== req.user.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      await storage.deleteConnectedDevice(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Disconnect device error:", error);
      res.status(500).json({ error: "Failed to disconnect device" });
    }
  });
  app2.post("/api/device-data/sync", authMiddleware, async (req, res) => {
    try {
      const { runId, deviceType, heartRateZones, vo2Max, trainingEffect, recoveryTime, stressLevel, bodyBattery, caloriesBurned, rawData } = req.body;
      const deviceData2 = await storage.createDeviceData({
        userId: req.user.userId,
        runId,
        deviceType,
        heartRateZones,
        vo2Max,
        trainingEffect,
        recoveryTime,
        stressLevel,
        bodyBattery,
        caloriesBurned,
        rawData
      });
      const devices = await storage.getConnectedDevices(req.user.userId);
      const device = devices.find((d) => d.deviceType === deviceType && d.isActive);
      if (device) {
        await storage.updateConnectedDevice(device.id, { lastSyncAt: /* @__PURE__ */ new Date() });
      }
      res.json(deviceData2);
    } catch (error) {
      console.error("Sync device data error:", error);
      res.status(500).json({ error: "Failed to sync device data" });
    }
  });
  app2.get("/api/runs/:id/device-data", async (req, res) => {
    try {
      const deviceData2 = await storage.getDeviceDataByRun(req.params.id);
      res.json(deviceData2);
    } catch (error) {
      console.error("Get device data error:", error);
      res.status(500).json({ error: "Failed to get device data" });
    }
  });
  app2.get("/garmin-success", (req, res) => {
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
  app2.get("/api/auth/garmin", authMiddleware, async (req, res) => {
    try {
      const garminService = await Promise.resolve().then(() => (init_garmin_service(), garmin_service_exports));
      const appRedirect = req.query.app_redirect || "airuncoach://connected-devices";
      const historyDays = parseInt(req.query.history_days || "30", 10);
      const nonce = Date.now().toString() + Math.random().toString(36).substring(2, 10);
      const stateData = { userId: req.user.userId, appRedirect, historyDays, nonce };
      const state = Buffer.from(JSON.stringify(stateData)).toString("base64");
      let host = req.get("host") || "";
      const isProduction = host.includes("replit.app");
      if (!isProduction && !host.includes(":5000") && !host.includes(":")) {
        host = host.split(":")[0] + ":5000";
      }
      const baseUrl = `https://${host}`;
      const redirectUri = `${baseUrl}/api/auth/garmin/callback`;
      console.log("=== GARMIN OAUTH DEBUG ===");
      console.log("Request host:", req.get("host"));
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
    } catch (error) {
      console.error("Garmin auth initiation error:", error);
      res.status(500).json({ error: "Failed to initiate Garmin authorization" });
    }
  });
  app2.get("/api/auth/garmin/callback", async (req, res) => {
    console.log("=== GARMIN CALLBACK RECEIVED ===");
    console.log("Query params:", req.query);
    console.log("Full URL:", req.originalUrl);
    console.log("================================");
    try {
      const { code, state, error } = req.query;
      let stateData = null;
      let appRedirectUrl = "airuncoach://connected-devices";
      let userId = "";
      let historyDays = 30;
      let nonce = "";
      try {
        stateData = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
        appRedirectUrl = stateData?.appRedirect || appRedirectUrl;
        userId = stateData?.userId || "";
        historyDays = stateData?.historyDays || 30;
        nonce = stateData?.nonce || "";
        console.log("Garmin callback - decoded state:", { userId, appRedirect: appRedirectUrl, historyDays, nonce });
      } catch (e) {
        console.error("Garmin callback - failed to decode state:", e);
        const errorUrl = appRedirectUrl.includes("?") ? `${appRedirectUrl}&garmin=error&message=invalid_state` : `${appRedirectUrl}?garmin=error&message=invalid_state`;
        return res.redirect(errorUrl);
      }
      if (error) {
        console.error("Garmin OAuth error:", error);
        const errorUrl = appRedirectUrl.includes("?") ? `${appRedirectUrl}&garmin=error&message=${encodeURIComponent(error)}` : `${appRedirectUrl}?garmin=error&message=${encodeURIComponent(error)}`;
        return res.redirect(errorUrl);
      }
      if (!code || !state || !nonce) {
        console.error("Garmin callback - missing params:", { code: !!code, state: !!state, nonce: !!nonce });
        const errorUrl = appRedirectUrl.includes("?") ? `${appRedirectUrl}&garmin=error&message=missing_params` : `${appRedirectUrl}?garmin=error&message=missing_params`;
        return res.redirect(errorUrl);
      }
      const garminService = await Promise.resolve().then(() => (init_garmin_service(), garmin_service_exports));
      let host = req.get("host") || "";
      const isProduction = host.includes("replit.app");
      if (!isProduction && !host.includes(":5000") && !host.includes(":")) {
        host = host.split(":")[0] + ":5000";
      }
      const baseUrl = `https://${host}`;
      const redirectUri = `${baseUrl}/api/auth/garmin/callback`;
      const tokens = await garminService.exchangeGarminCode(
        code,
        redirectUri,
        nonce
      );
      const existingDevices = await storage.getConnectedDevices(userId);
      const existingGarmin = existingDevices.find((d) => d.deviceType === "garmin" && d.isActive);
      if (existingGarmin) {
        await storage.updateConnectedDevice(existingGarmin.id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1e3),
          deviceId: tokens.athleteId,
          lastSyncAt: /* @__PURE__ */ new Date()
        });
      } else {
        await storage.createConnectedDevice({
          userId,
          deviceType: "garmin",
          deviceName: "Garmin Watch",
          deviceId: tokens.athleteId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1e3),
          lastSyncAt: /* @__PURE__ */ new Date()
        });
      }
      if (historyDays > 0) {
        try {
          console.log(`\u{1F4C5} Syncing historical Garmin activities for the last ${historyDays} days...`);
          const startDate = /* @__PURE__ */ new Date();
          startDate.setDate(startDate.getDate() - historyDays);
          const endDate = /* @__PURE__ */ new Date();
          garminService.syncGarminActivities(
            userId,
            tokens.accessToken,
            startDate.toISOString(),
            endDate.toISOString()
          ).then(() => {
            console.log(`\u2705 Historical Garmin activities synced for user ${userId}`);
          }).catch((err) => {
            console.error(`\u274C Failed to sync historical Garmin activities: ${err.message}`);
          });
        } catch (error2) {
          console.error("Error initiating historical sync:", error2);
        }
      } else {
        console.log("\u23ED\uFE0F Skipping historical activity sync (historyDays = 0)");
      }
      const successUrl = appRedirectUrl.includes("?") ? `${appRedirectUrl}&garmin=success` : `${appRedirectUrl}?garmin=success`;
      console.log("Garmin OAuth successful, redirecting to:", successUrl);
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
            <div class="icon">\u2713</div>
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
    } catch (error) {
      console.error("Garmin callback error:", error);
      let fallbackRedirect = "airuncoach://connected-devices";
      try {
        const { state } = req.query;
        if (state) {
          const stateData = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
          fallbackRedirect = stateData?.appRedirect || fallbackRedirect;
        }
      } catch (e) {
      }
      const errorUrl = fallbackRedirect.includes("?") ? `${fallbackRedirect}&garmin=error&message=${encodeURIComponent(error.message)}` : `${fallbackRedirect}?garmin=error&message=${encodeURIComponent(error.message)}`;
      res.redirect(errorUrl);
    }
  });
  app2.post("/api/garmin/sync", authMiddleware, async (req, res) => {
    try {
      const devices = await storage.getConnectedDevices(req.user.userId);
      const garminDevice = devices.find((d) => d.deviceType === "garmin" && d.isActive);
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }
      const garminService = await Promise.resolve().then(() => (init_garmin_service(), garmin_service_exports));
      let accessToken = garminDevice.accessToken;
      if (garminDevice.tokenExpiresAt && new Date(garminDevice.tokenExpiresAt) < /* @__PURE__ */ new Date()) {
        const newTokens = await garminService.refreshGarminToken(garminDevice.refreshToken);
        accessToken = newTokens.accessToken;
        await storage.updateConnectedDevice(garminDevice.id, {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + newTokens.expiresIn * 1e3)
        });
      }
      const thirtyDaysAgo = /* @__PURE__ */ new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const activities = await garminService.getGarminActivities(accessToken, thirtyDaysAgo);
      await storage.updateConnectedDevice(garminDevice.id, { lastSyncAt: /* @__PURE__ */ new Date() });
      res.json({
        success: true,
        activitiesFound: activities.length,
        activities: activities.map(garminService.parseGarminActivity)
      });
    } catch (error) {
      console.error("Garmin sync error:", error);
      res.status(500).json({ error: "Failed to sync Garmin data" });
    }
  });
  app2.get("/api/garmin/health-summary", authMiddleware, async (req, res) => {
    try {
      const devices = await storage.getConnectedDevices(req.user.userId);
      const garminDevice = devices.find((d) => d.deviceType === "garmin" && d.isActive);
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }
      const garminService = await Promise.resolve().then(() => (init_garmin_service(), garmin_service_exports));
      let accessToken = garminDevice.accessToken;
      if (garminDevice.tokenExpiresAt && new Date(garminDevice.tokenExpiresAt) < /* @__PURE__ */ new Date()) {
        const newTokens = await garminService.refreshGarminToken(garminDevice.refreshToken);
        accessToken = newTokens.accessToken;
        await storage.updateConnectedDevice(garminDevice.id, {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + newTokens.expiresIn * 1e3)
        });
      }
      const today = /* @__PURE__ */ new Date();
      const yesterday = /* @__PURE__ */ new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const [dailySummary, heartRateData, stressData] = await Promise.all([
        garminService.getGarminDailySummary(accessToken, today).catch(() => null),
        garminService.getGarminHeartRateData(accessToken, today).catch(() => null),
        garminService.getGarminStressData(accessToken, today).catch(() => null)
      ]);
      res.json({
        dailySummary,
        heartRateData,
        stressData,
        lastSyncAt: garminDevice.lastSyncAt
      });
    } catch (error) {
      console.error("Garmin health summary error:", error);
      res.status(500).json({ error: "Failed to get Garmin health summary" });
    }
  });
  app2.post("/api/garmin/import-activity", authMiddleware, async (req, res) => {
    try {
      const { activityId } = req.body;
      if (!activityId) {
        return res.status(400).json({ error: "activityId is required" });
      }
      const devices = await storage.getConnectedDevices(req.user.userId);
      const garminDevice = devices.find((d) => d.deviceType === "garmin" && d.isActive);
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }
      const garminService = await Promise.resolve().then(() => (init_garmin_service(), garmin_service_exports));
      const activityDetail = await garminService.getGarminActivityDetail(garminDevice.accessToken, activityId);
      const parsed = garminService.parseGarminActivity(activityDetail);
      const run = await storage.createRun({
        userId: req.user.userId,
        distance: parsed.distance,
        duration: parsed.duration,
        avgPace: parsed.averagePace ? `${Math.floor(parsed.averagePace)}:${Math.round(parsed.averagePace % 1 * 60).toString().padStart(2, "0")}` : void 0,
        elevationGain: parsed.elevationGain,
        calories: parsed.calories,
        difficulty: "moderate",
        gpsTrack: activityDetail.polyline ? { polyline: activityDetail.polyline } : void 0
      });
      await storage.createDeviceData({
        userId: req.user.userId,
        runId: run.id,
        deviceType: "garmin",
        activityId: parsed.activityId,
        vo2Max: parsed.vo2Max,
        trainingEffect: parsed.trainingEffect,
        recoveryTime: parsed.recoveryTime ? parsed.recoveryTime * 60 : void 0,
        // Convert to hours
        caloriesBurned: parsed.calories,
        rawData: activityDetail
      });
      res.json({ success: true, run, activity: parsed });
    } catch (error) {
      console.error("Garmin import activity error:", error);
      res.status(500).json({ error: "Failed to import Garmin activity" });
    }
  });
  app2.post("/api/garmin/wellness/sync", authMiddleware, async (req, res) => {
    try {
      const { date } = req.body;
      const targetDate = date ? new Date(date) : /* @__PURE__ */ new Date();
      const devices = await storage.getConnectedDevices(req.user.userId);
      const garminDevice = devices.find((d) => d.deviceType === "garmin" && d.isActive);
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({ error: "Garmin not connected" });
      }
      const garminService = await Promise.resolve().then(() => (init_garmin_service(), garmin_service_exports));
      const wellness = await garminService.getGarminComprehensiveWellness(garminDevice.accessToken, targetDate);
      console.log("[Wellness Sync] Received wellness data:", JSON.stringify(wellness, null, 2));
      const dateStr = wellness.date;
      const existing = await db.query.garminWellnessMetrics.findFirst({
        where: (metrics, { and: and7, eq: eq7 }) => and7(
          eq7(metrics.userId, req.user.userId),
          eq7(metrics.date, dateStr)
        )
      });
      const wellnessRecord = {
        userId: req.user.userId,
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
        rawData: wellness
      };
      console.log("[Wellness Sync] Record to insert/update:", JSON.stringify(wellnessRecord, null, 2));
      console.log("[Wellness Sync] Existing record:", existing ? existing.id : "none");
      try {
        if (existing) {
          await db.update(garminWellnessMetrics).set({ ...wellnessRecord, syncedAt: /* @__PURE__ */ new Date() }).where(eq6(garminWellnessMetrics.id, existing.id));
          console.log("[Wellness Sync] Updated existing record:", existing.id);
        } else {
          await db.insert(garminWellnessMetrics).values(wellnessRecord);
          console.log("[Wellness Sync] Inserted new record");
        }
      } catch (dbError) {
        console.error("[Wellness Sync] Database error:", dbError.message);
        if (existing) {
          console.log("[Wellness Sync] Update failed, trying insert...");
          await db.insert(garminWellnessMetrics).values(wellnessRecord);
          console.log("[Wellness Sync] Insert after failed update succeeded");
        } else {
          throw dbError;
        }
      }
      res.json({ success: true, wellness });
    } catch (error) {
      console.error("Garmin wellness sync error:", error);
      res.status(500).json({ error: "Failed to sync Garmin wellness data" });
    }
  });
  app2.get("/api/garmin/wellness", authMiddleware, async (req, res) => {
    try {
      const { date, days } = req.query;
      const numDays = days ? parseInt(days) : 7;
      const startDate = /* @__PURE__ */ new Date();
      startDate.setDate(startDate.getDate() - numDays);
      const startDateStr = startDate.toISOString().split("T")[0];
      const metrics = await db.query.garminWellnessMetrics.findMany({
        where: (m, { and: and7, eq: eq7, gte: gte5 }) => and7(
          eq7(m.userId, req.user.userId),
          gte5(m.date, startDateStr)
        ),
        orderBy: (m, { desc: desc5 }) => [desc5(m.date)]
      });
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
          hrvStatus: latest.hrvStatus
        } : null
      });
    } catch (error) {
      console.error("Garmin wellness fetch error:", error);
      res.status(500).json({ error: "Failed to fetch Garmin wellness data" });
    }
  });
  app2.get("/api/garmin/readiness", authMiddleware, async (req, res) => {
    try {
      const devices = await storage.getConnectedDevices(req.user.userId);
      const garminDevice = devices.find((d) => d.deviceType === "garmin" && d.isActive);
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      let todayWellness = await db.query.garminWellnessMetrics.findFirst({
        where: (m, { and: and7, eq: eq7 }) => and7(
          eq7(m.userId, req.user.userId),
          eq7(m.date, today)
        )
      });
      if (garminDevice?.accessToken && !todayWellness) {
        try {
          const garminService = await Promise.resolve().then(() => (init_garmin_service(), garmin_service_exports));
          const wellness = await garminService.getGarminComprehensiveWellness(garminDevice.accessToken, /* @__PURE__ */ new Date());
          await db.insert(garminWellnessMetrics).values({
            userId: req.user.userId,
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
            rawData: wellness
          });
          todayWellness = await db.query.garminWellnessMetrics.findFirst({
            where: (m, { and: and7, eq: eq7 }) => and7(
              eq7(m.userId, req.user.userId),
              eq7(m.date, today)
            )
          });
        } catch (syncError) {
          console.error("Failed to sync Garmin data for readiness:", syncError);
        }
      }
      const weekAgo = /* @__PURE__ */ new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split("T")[0];
      const recentMetrics = await db.query.garminWellnessMetrics.findMany({
        where: (m, { and: and7, eq: eq7, gte: gte5 }) => and7(
          eq7(m.userId, req.user.userId),
          gte5(m.date, weekAgoStr)
        ),
        orderBy: (m, { desc: desc5 }) => [desc5(m.date)]
      });
      const avgSleepHours = recentMetrics.length > 0 ? recentMetrics.reduce((sum, m) => sum + (m.totalSleepSeconds || 0), 0) / recentMetrics.length / 3600 : null;
      const avgBodyBattery = recentMetrics.length > 0 ? recentMetrics.reduce((sum, m) => sum + (m.bodyBatteryCurrent || 0), 0) / recentMetrics.length : null;
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
          restingHeartRate: todayWellness.restingHeartRate
        } : null,
        weeklyContext: {
          avgSleepHours: avgSleepHours?.toFixed(1),
          avgBodyBattery: avgBodyBattery?.toFixed(0),
          daysWithData: recentMetrics.length
        }
      });
    } catch (error) {
      console.error("Garmin readiness error:", error);
      res.status(500).json({ error: "Failed to fetch readiness data" });
    }
  });
  app2.post("/api/garmin/ping", (req, res) => {
    console.log("\u{1F4E1} Garmin PING received");
    res.status(200).json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      service: "AI Run Coach API"
    });
  });
  app2.get("/api/garmin/user-permissions/:garminUserId", async (req, res) => {
    try {
      const { garminUserId } = req.params;
      console.log(`\u{1F50D} Garmin requesting permissions for user: ${garminUserId}`);
      const device = await db.query.connectedDevices.findFirst({
        where: (d, { and: and7, eq: eq7 }) => and7(
          eq7(d.deviceType, "garmin"),
          eq7(d.deviceId, garminUserId),
          eq7(d.isActive, true)
        )
      });
      if (!device) {
        console.log(`\u26A0\uFE0F No active Garmin device found for Garmin user ${garminUserId}`);
        return res.status(404).json({
          error: "User not found or no active Garmin connection"
        });
      }
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
      console.log(`\u2705 Returned permissions for Garmin user ${garminUserId}`);
    } catch (error) {
      console.error("Error fetching user permissions:", error);
      res.status(500).json({ error: "Failed to fetch user permissions" });
    }
  });
  app2.post("/api/garmin/upload-run", authMiddleware, async (req, res) => {
    try {
      const { runId } = req.body;
      if (!runId) {
        return res.status(400).json({ error: "runId is required" });
      }
      console.log(`\u{1F4E4} Upload to Garmin requested for run: ${runId}`);
      const run = await db.query.runs.findFirst({
        where: (r, { eq: eq7 }) => eq7(r.id, runId)
      });
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.userId !== req.user.userId) {
        return res.status(403).json({ error: "Unauthorized - run belongs to different user" });
      }
      if (run.uploadedToGarmin) {
        return res.status(200).json({
          success: true,
          message: "Run already uploaded to Garmin",
          garminActivityId: run.garminActivityId,
          alreadyUploaded: true
        });
      }
      if (run.externalSource === "garmin") {
        return res.status(400).json({
          error: "Cannot upload Garmin-sourced runs back to Garmin"
        });
      }
      const devices = await storage.getConnectedDevices(req.user.userId);
      const garminDevice = devices.find((d) => d.deviceType === "garmin" && d.isActive);
      if (!garminDevice || !garminDevice.accessToken) {
        return res.status(400).json({
          error: "Garmin not connected. Please connect Garmin first."
        });
      }
      const garminService = await Promise.resolve().then(() => (init_garmin_service(), garmin_service_exports));
      const result = await garminService.uploadRunToGarmin(
        req.user.userId,
        run,
        garminDevice.accessToken,
        garminDevice.refreshToken,
        garminDevice.tokenExpiresAt
      );
      if (result.success) {
        console.log(`\u2705 Run ${runId} uploaded to Garmin successfully`);
        if (result.garminActivityId) {
          console.log(`   Garmin Activity ID: ${result.garminActivityId}`);
        }
        res.json({
          success: true,
          message: "Run uploaded to Garmin Connect successfully",
          garminActivityId: result.garminActivityId
        });
      } else {
        console.error(`\u274C Failed to upload run ${runId}:`, result.error);
        res.status(500).json({
          success: false,
          error: result.error || "Failed to upload to Garmin"
        });
      }
    } catch (error) {
      console.error("Garmin upload error:", error);
      res.status(500).json({ error: "Failed to upload run to Garmin" });
    }
  });
  const findUserByGarminToken = async (userAccessToken) => {
    const device = await db.query.connectedDevices.findFirst({
      where: (d, { and: and7, eq: eq7 }) => and7(
        eq7(d.deviceType, "garmin"),
        eq7(d.accessToken, userAccessToken)
      )
    });
    return device;
  };
  app2.post("/api/garmin/webhook/activities", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received activities push:", JSON.stringify(req.body).slice(0, 1e3));
      const activities = req.body.activities || [];
      for (const activity of activities) {
        const userAccessToken = activity.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          const activityType = activity.activityType || "RUNNING";
          const isRunOrWalk = ["RUNNING", "WALKING", "TRAIL_RUNNING", "TREADMILL_RUNNING", "INDOOR_WALKING"].includes(activityType);
          console.log(`[Garmin Webhook] Processing activity for user ${device.userId}: ${activity.activityName || activityType}`);
          const [garminActivity] = await db.insert(garminActivities).values({
            userId: device.userId,
            garminActivityId: String(activity.activityId),
            activityName: activity.activityName,
            activityType,
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
            rawData: activity
          }).returning();
          if (isRunOrWalk && activity.distanceInMeters > 0) {
            const startTime = new Date((activity.startTimeInSeconds || 0) * 1e3);
            const durationSeconds = activity.durationInSeconds || 0;
            const distanceKm = (activity.distanceInMeters || 0) / 1e3;
            let avgPace = "";
            if (distanceKm > 0 && durationSeconds > 0) {
              const paceSeconds = durationSeconds / distanceKm;
              const mins = Math.floor(paceSeconds / 60);
              const secs = Math.floor(paceSeconds % 60);
              avgPace = `${mins}:${secs.toString().padStart(2, "0")}`;
            }
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
              difficulty: activityType === "TRAIL_RUNNING" ? "hard" : "moderate",
              startLat: activity.startingLatitudeInDegree,
              startLng: activity.startingLongitudeInDegree,
              name: activity.activityName || `${activityType.replace(/_/g, " ")} from Garmin`,
              runDate: startTime.toISOString().split("T")[0],
              runTime: startTime.toTimeString().split(" ")[0].slice(0, 5),
              completedAt: startTime
            }).returning();
            await db.update(garminActivities).set({ runId: newRun.id, isProcessed: true }).where(eq6(garminActivities.id, garminActivity.id));
            console.log(`[Garmin Webhook] Created run record ${newRun.id} from Garmin activity ${activity.activityId}`);
          }
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Activities error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/activity-details", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received activity details push");
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Activity details error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/sleeps", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received sleeps push:", JSON.stringify(req.body).slice(0, 1e3));
      const sleeps = req.body.sleeps || [];
      for (const sleep of sleeps) {
        const userAccessToken = sleep.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          const date = new Date(sleep.startTimeInSeconds * 1e3).toISOString().split("T")[0];
          console.log(`[Garmin Webhook] Processing sleep for user ${device.userId}, date: ${date}`);
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
            rawData: sleep
          };
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and6(
              eq6(garminWellnessMetrics.userId, device.userId),
              eq6(garminWellnessMetrics.date, date)
            )
          });
          if (existing) {
            await db.update(garminWellnessMetrics).set({ ...sleepData, syncedAt: /* @__PURE__ */ new Date() }).where(eq6(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values(sleepData);
          }
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Sleeps error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/stress", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received stress push:", JSON.stringify(req.body).slice(0, 1e3));
      const stressData = req.body.allDayStress || req.body.stressDetails || [];
      for (const stress of stressData) {
        const userAccessToken = stress.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          const date = new Date((stress.startTimeInSeconds || stress.calendarDate) * 1e3).toISOString().split("T")[0];
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
            bodyBatteryDrained: stress.bodyBatteryDrainedValue
          };
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and6(
              eq6(garminWellnessMetrics.userId, device.userId),
              eq6(garminWellnessMetrics.date, date)
            )
          });
          if (existing) {
            await db.update(garminWellnessMetrics).set({ ...stressFields, syncedAt: /* @__PURE__ */ new Date() }).where(eq6(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...stressFields
            });
          }
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Stress error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/hrv", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received HRV push:", JSON.stringify(req.body).slice(0, 1e3));
      const hrvData = req.body.hrvSummaries || [];
      for (const hrv of hrvData) {
        const userAccessToken = hrv.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          const date = hrv.calendarDate || new Date((hrv.startTimeInSeconds || 0) * 1e3).toISOString().split("T")[0];
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
            hrvReadings: hrv.hrvValues
          };
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and6(
              eq6(garminWellnessMetrics.userId, device.userId),
              eq6(garminWellnessMetrics.date, date)
            )
          });
          if (existing) {
            await db.update(garminWellnessMetrics).set({ ...hrvFields, syncedAt: /* @__PURE__ */ new Date() }).where(eq6(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...hrvFields
            });
          }
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] HRV error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/dailies", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received dailies push:", JSON.stringify(req.body).slice(0, 1e3));
      const dailies = req.body.dailies || [];
      for (const daily of dailies) {
        const userAccessToken = daily.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          const date = daily.calendarDate || new Date((daily.startTimeInSeconds || 0) * 1e3).toISOString().split("T")[0];
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
            restDuration: daily.restStressDuration
          };
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and6(
              eq6(garminWellnessMetrics.userId, device.userId),
              eq6(garminWellnessMetrics.date, date)
            )
          });
          if (existing) {
            await db.update(garminWellnessMetrics).set({ ...dailyFields, syncedAt: /* @__PURE__ */ new Date() }).where(eq6(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...dailyFields
            });
          }
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Dailies error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/body-compositions", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received body compositions push:", JSON.stringify(req.body).slice(0, 1e3));
      const compositions = req.body.bodyCompositions || [];
      for (const comp of compositions) {
        const userAccessToken = comp.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          const date = new Date((comp.measurementTimeInSeconds || 0) * 1e3).toISOString().split("T")[0];
          console.log(`[Garmin Webhook] Processing body composition for user ${device.userId}, date: ${date}`);
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
            rawData: comp
          });
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Body compositions error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/pulse-ox", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received pulse ox push:", JSON.stringify(req.body).slice(0, 1e3));
      const pulseOxData = req.body.pulseOx || [];
      for (const pox of pulseOxData) {
        const userAccessToken = pox.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          const date = pox.calendarDate || new Date((pox.startTimeInSeconds || 0) * 1e3).toISOString().split("T")[0];
          console.log(`[Garmin Webhook] Processing pulse ox for user ${device.userId}, date: ${date}`);
          const poxFields = {
            avgSpO2: pox.avgSpO2,
            minSpO2: pox.minSpO2,
            avgAltitude: pox.avgAltitude,
            onDemandReadings: pox.onDemandReadings,
            sleepSpO2Readings: pox.sleepPulseOxReadings
          };
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and6(
              eq6(garminWellnessMetrics.userId, device.userId),
              eq6(garminWellnessMetrics.date, date)
            )
          });
          if (existing) {
            await db.update(garminWellnessMetrics).set({ ...poxFields, syncedAt: /* @__PURE__ */ new Date() }).where(eq6(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...poxFields
            });
          }
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Pulse ox error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/respiration", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received respiration push:", JSON.stringify(req.body).slice(0, 1e3));
      const respirations = req.body.allDayRespiration || [];
      for (const resp of respirations) {
        const userAccessToken = resp.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          const date = resp.calendarDate || new Date((resp.startTimeInSeconds || 0) * 1e3).toISOString().split("T")[0];
          console.log(`[Garmin Webhook] Processing respiration for user ${device.userId}, date: ${date}`);
          const respFields = {
            avgWakingRespirationValue: resp.avgWakingRespirationValue,
            highestRespirationValue: resp.highestRespirationValue,
            lowestRespirationValue: resp.lowestRespirationValue,
            avgSleepRespirationValue: resp.avgSleepRespirationValue
          };
          const existing = await db.query.garminWellnessMetrics.findFirst({
            where: and6(
              eq6(garminWellnessMetrics.userId, device.userId),
              eq6(garminWellnessMetrics.date, date)
            )
          });
          if (existing) {
            await db.update(garminWellnessMetrics).set({ ...respFields, syncedAt: /* @__PURE__ */ new Date() }).where(eq6(garminWellnessMetrics.id, existing.id));
          } else {
            await db.insert(garminWellnessMetrics).values({
              userId: device.userId,
              date,
              ...respFields
            });
          }
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Respiration error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/deregistrations", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received deregistration:", JSON.stringify(req.body).slice(0, 500));
      const deregistrations = req.body.deregistrations || [];
      for (const dereg of deregistrations) {
        const userAccessToken = dereg.userAccessToken;
        const device = await findUserByGarminToken(userAccessToken);
        if (device) {
          console.log(`[Garmin Webhook] User ${device.userId} deregistered from Garmin`);
          await db.update(connectedDevices).set({ isActive: false, accessToken: null, refreshToken: null }).where(eq6(connectedDevices.id, device.id));
        }
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Deregistrations error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/permissions", async (req, res) => {
    try {
      console.log("[Garmin Webhook] Received permissions change:", JSON.stringify(req.body).slice(0, 500));
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Garmin Webhook] Permissions error:", error);
      res.status(200).json({ success: true });
    }
  });
  app2.post("/api/garmin/webhook/epochs", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  app2.post("/api/garmin/webhook/health-snapshot", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  app2.post("/api/garmin/webhook/user-metrics", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  app2.post("/api/garmin/webhook/blood-pressure", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  app2.post("/api/garmin/webhook/skin-temperature", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  app2.post("/api/garmin/webhook/moveiq", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  app2.post("/api/garmin/webhook/manually-updated-activities", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  app2.post("/api/garmin/webhook/activity-files", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  app2.post("/api/garmin/webhook/menstrual-cycle", async (_req, res) => {
    res.status(200).json({ success: true });
  });
  async function calculateWeatherImpact(userId, runs2) {
    if (runs2.length < 3) {
      return { hasEnoughData: false, runsAnalyzed: runs2.length, overallAvgPace: null };
    }
    const parsePace = (paceStr) => {
      if (!paceStr) return null;
      const match = paceStr.match(/(\d+):(\d+)/);
      if (match) {
        return parseInt(match[1]) * 60 + parseInt(match[2]);
      }
      return null;
    };
    const paces = runs2.map((r) => parsePace(r.avgPace)).filter((p) => p !== null);
    if (paces.length === 0) {
      return { hasEnoughData: false, runsAnalyzed: runs2.length, overallAvgPace: null };
    }
    const avgPaceSeconds = Math.round(paces.reduce((a, b) => a + b, 0) / paces.length);
    const timeOfDayBuckets = {
      "Morning": { totalPace: 0, count: 0 },
      "Late Morning": { totalPace: 0, count: 0 },
      "Afternoon": { totalPace: 0, count: 0 },
      "Evening": { totalPace: 0, count: 0 },
      "Night": { totalPace: 0, count: 0 }
    };
    const conditionBuckets = {};
    const tempBuckets = {};
    runs2.forEach((run) => {
      const pace = parsePace(run.avgPace);
      if (!pace) return;
      if (run.completedAt) {
        const date = new Date(run.completedAt);
        const hour = date.getHours();
        let timeLabel = "";
        if (hour >= 5 && hour < 9) timeLabel = "Morning";
        else if (hour >= 9 && hour < 12) timeLabel = "Late Morning";
        else if (hour >= 12 && hour < 17) timeLabel = "Afternoon";
        else if (hour >= 17 && hour < 20) timeLabel = "Evening";
        else timeLabel = "Night";
        if (timeOfDayBuckets[timeLabel]) {
          timeOfDayBuckets[timeLabel].totalPace += pace;
          timeOfDayBuckets[timeLabel].count++;
        }
      }
      const condition = run.weatherData?.condition || run.weatherData?.description || "Clear";
      if (!conditionBuckets[condition]) {
        conditionBuckets[condition] = { totalPace: 0, count: 0 };
      }
      conditionBuckets[condition].totalPace += pace;
      conditionBuckets[condition].count++;
      const temp = run.weatherData?.temperature;
      if (temp !== void 0 && temp !== null) {
        let tempLabel = "";
        if (temp < 5) tempLabel = "Cold (<5\xB0C)";
        else if (temp < 10) tempLabel = "Cool (5-10\xB0C)";
        else if (temp < 15) tempLabel = "Mild (10-15\xB0C)";
        else if (temp < 20) tempLabel = "Warm (15-20\xB0C)";
        else tempLabel = "Hot (>20\xB0C)";
        if (!tempBuckets[tempLabel]) {
          tempBuckets[tempLabel] = { totalPace: 0, count: 0 };
        }
        tempBuckets[tempLabel].totalPace += pace;
        tempBuckets[tempLabel].count++;
      }
    });
    const calculatePaceVsAvg = (bucket) => {
      if (bucket.count < 1) return null;
      const bucketAvg = bucket.totalPace / bucket.count;
      return (avgPaceSeconds - bucketAvg) / avgPaceSeconds * 100;
    };
    const timeOfDayAnalysis = Object.entries(timeOfDayBuckets).filter(([_, b]) => b.count > 0).map(([label, bucket]) => ({
      range: label,
      label,
      avgPace: Math.round(bucket.totalPace / bucket.count),
      runCount: bucket.count,
      paceVsAvg: calculatePaceVsAvg(bucket)
    })).sort((a, b) => (b.paceVsAvg || 0) - (a.paceVsAvg || 0));
    const conditionAnalysis = Object.entries(conditionBuckets).filter(([_, b]) => b.count > 0).map(([condition, bucket]) => ({
      condition,
      avgPace: Math.round(bucket.totalPace / bucket.count),
      runCount: bucket.count,
      paceVsAvg: calculatePaceVsAvg(bucket) || 0
    })).sort((a, b) => a.paceVsAvg - b.paceVsAvg);
    const temperatureAnalysis = Object.entries(tempBuckets).filter(([_, b]) => b.count > 0).map(([label, bucket]) => ({
      range: label,
      label,
      avgPace: Math.round(bucket.totalPace / bucket.count),
      runCount: bucket.count,
      paceVsAvg: calculatePaceVsAvg(bucket)
    })).sort((a, b) => (b.paceVsAvg || 0) - (a.paceVsAvg || 0));
    const validTimeAnalysis = timeOfDayAnalysis.filter((t) => t.paceVsAvg !== null);
    const validConditionAnalysis = conditionAnalysis.filter((c) => c.paceVsAvg !== null);
    const bestTime = validTimeAnalysis.find((t) => t.paceVsAvg < 0);
    const worstTime = validTimeAnalysis.find((t) => t.paceVsAvg > 0);
    const bestCondition = validConditionAnalysis.find((c) => c.paceVsAvg < 0);
    const worstCondition = validConditionAnalysis.find((c) => c.paceVsAvg > 0);
    return {
      hasEnoughData: true,
      runsAnalyzed: runs2.length,
      overallAvgPace: avgPaceSeconds,
      temperatureAnalysis,
      conditionAnalysis,
      timeOfDayAnalysis,
      insights: {
        bestCondition: bestCondition ? {
          label: bestCondition.condition,
          type: "condition",
          improvement: Math.abs(bestCondition.paceVsAvg).toFixed(0)
        } : void 0,
        worstCondition: worstCondition ? {
          label: worstCondition.condition,
          type: "condition",
          slowdown: Math.abs(worstCondition.paceVsAvg).toFixed(0)
        } : void 0
      }
    };
  }
  app2.post("/api/coaching/pre-run-briefing", authMiddleware, async (req, res) => {
    try {
      const { distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, hasRoute, activityType, targetTime, targetPace, weather } = req.body;
      console.log(`[Pre-run briefing] Request data - distance: ${distance}, targetTime: ${targetTime}, targetPace: ${targetPace}, hasRoute: ${hasRoute}, weather: ${JSON.stringify(weather)}`);
      const user = await storage.getUser(req.user.userId);
      const coachName = user?.coachName || "Coach";
      const coachTone = user?.coachTone || "encouraging";
      const coachGender = user?.coachGender || "female";
      const coachAccent = user?.coachAccent || "british";
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      let wellness = {};
      const todayWellness = await db.query.garminWellnessMetrics.findFirst({
        where: (m, { and: and7, eq: eq7 }) => and7(
          eq7(m.userId, req.user.userId),
          eq7(m.date, today)
        )
      });
      if (todayWellness) {
        wellness = {
          sleepHours: todayWellness.totalSleepSeconds ? todayWellness.totalSleepSeconds / 3600 : void 0,
          sleepQuality: todayWellness.sleepQuality,
          sleepScore: todayWellness.sleepScore,
          bodyBattery: todayWellness.bodyBatteryCurrent,
          stressLevel: todayWellness.averageStressLevel,
          stressQualifier: todayWellness.stressQualifier,
          hrvStatus: todayWellness.hrvStatus,
          hrvFeedback: todayWellness.hrvFeedback,
          restingHeartRate: todayWellness.restingHeartRate,
          readinessScore: todayWellness.readinessScore,
          readinessRecommendation: todayWellness.readinessRecommendation
        };
      }
      let weatherImpactData = null;
      try {
        const runs2 = await db.query.runs.findMany({
          where: eq6(runs2.userId, req.user.userId),
          orderBy: desc4(runs2.completedAt),
          limit: 30
        });
        if (runs2.length >= 3) {
          weatherImpactData = await calculateWeatherImpact(req.user.userId, runs2);
        }
      } catch (err) {
        console.error("Error getting weather impact data:", err);
      }
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const briefing = await aiService.generateWellnessAwarePreRunBriefing({
        distance: distance || 5,
        elevationGain: elevationGain || 0,
        difficulty: difficulty || "moderate",
        activityType: activityType || "run",
        weather,
        coachName,
        coachTone,
        wellness,
        hasRoute: hasRoute === true,
        // Only true if explicitly true - all other values become false
        targetTime,
        targetPace,
        weatherImpact: weatherImpactData
      });
      const briefingText = briefing.briefing;
      const audioBuffer = briefingText ? await aiService.generateTTS(briefingText, mapCoachVoice(coachGender, coachAccent, coachTone)) : null;
      res.json({
        audio: audioBuffer ? audioBuffer.toString("base64") : null,
        format: audioBuffer ? "mp3" : null,
        voice: mapCoachVoice(coachGender, coachAccent, coachTone),
        text: briefingText,
        wellness,
        garminConnected: Object.keys(wellness).length > 0
      });
    } catch (error) {
      console.error("Pre-run briefing error:", error);
      res.status(500).json({ error: "Failed to generate pre-run briefing" });
    }
  });
  app2.post("/api/tts/generate", authMiddleware, async (req, res) => {
    try {
      const { text: text2, voice } = req.body;
      if (!text2 || text2.trim().length === 0) {
        return res.status(400).json({ error: "Text is required" });
      }
      const user = await storage.getUser(req.user.userId);
      const coachTone = user?.coachTone || "energetic";
      const userVoice = voice || mapCoachVoice(user?.coachGender, user?.coachAccent, coachTone);
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const audioBuffer = await aiService.generateTTS(text2, userVoice);
      const base64Audio = audioBuffer.toString("base64");
      res.json({
        audio: base64Audio,
        format: "mp3",
        voice: userVoice
      });
    } catch (error) {
      console.error("TTS generation error:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });
  app2.post("/api/coaching/pre-run-briefing-audio", authMiddleware, async (req, res) => {
    try {
      const {
        distance,
        elevationGain,
        elevationLoss,
        maxGradientDegrees,
        difficulty,
        hasRoute,
        activityType,
        weather: clientWeather,
        targetPace,
        targetTime,
        wellness: clientWellness,
        turnInstructions,
        startLocation
      } = req.body;
      const user = await storage.getUser(req.user.userId);
      const coachGender = user?.coachGender || "female";
      const coachTone = user?.coachTone || "energetic";
      const coachAccent = user?.coachAccent || "british";
      const coachName = user?.coachName || "Coach";
      const voice = mapCoachVoice(coachGender, coachAccent, coachTone);
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
              condition: data.current_weather?.weathercode <= 3 ? "clear" : "cloudy",
              windSpeed: Math.round(data.current_weather?.windspeed || 0)
            };
          }
        } catch (e) {
          console.log("Weather fetch for audio briefing failed");
        }
      }
      let wellnessData = clientWellness || {};
      if (!clientWellness) {
        try {
          const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const todayWellness = await db.query.garminWellnessMetrics.findFirst({
            where: (m, { and: and7, eq: eq7 }) => and7(
              eq7(m.userId, req.user.userId),
              eq7(m.date, today)
            )
          });
          if (todayWellness) {
            wellnessData = {
              bodyBattery: todayWellness.bodyBatteryCurrent,
              sleepHours: todayWellness.totalSleepSeconds ? Math.round(todayWellness.totalSleepSeconds / 3600) : void 0,
              stressQualifier: todayWellness.stressQualifier,
              readinessScore: todayWellness.readinessScore
            };
          }
        } catch (e) {
          console.log("Wellness fetch for audio briefing failed");
        }
      }
      let weatherImpact;
      if (startLocation?.lat && startLocation?.lng) {
        try {
          weatherImpact = await analyzeWeatherImpact(
            startLocation.lat,
            startLocation.lng,
            distance || 5
          );
        } catch (e) {
          console.log("Weather impact analysis failed");
        }
      }
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const aiBriefing = await aiService.generateWellnessAwarePreRunBriefing({
        distance: distance || 5,
        elevationGain: elevationGain || 0,
        difficulty: difficulty || "unknown",
        activityType: activityType || "run",
        weather,
        coachName,
        coachTone,
        wellness: wellnessData,
        hasRoute: hasRoute || false,
        targetTime: targetTime || null,
        targetPace: targetPace || null,
        weatherImpact
      });
      const speechParts = [];
      if (aiBriefing.briefing) speechParts.push(aiBriefing.briefing);
      if (aiBriefing.intensityAdvice) speechParts.push(aiBriefing.intensityAdvice);
      if (aiBriefing.warnings && aiBriefing.warnings.length > 0) {
        speechParts.push(aiBriefing.warnings.join(". "));
      }
      const speechText = speechParts.join(" ");
      let base64Audio = null;
      try {
        const audioBuffer = await aiService.generateTTS(speechText, voice);
        base64Audio = audioBuffer.toString("base64");
      } catch (ttsError) {
        console.warn("Pre-run briefing TTS failed, returning text only:", ttsError);
      }
      res.json({
        // AI-generated structured fields (for on-screen display)
        briefing: aiBriefing.briefing,
        intensityAdvice: aiBriefing.intensityAdvice,
        warnings: aiBriefing.warnings,
        readinessInsight: aiBriefing.readinessInsight,
        weatherAdvantage: aiBriefing.weatherAdvantage,
        // OpenAI TTS audio
        audio: base64Audio,
        format: "mp3",
        voice,
        // Combined text for fallback
        text: speechText
      });
    } catch (error) {
      console.error("Pre-run briefing audio error:", error);
      res.status(500).json({ error: "Failed to generate briefing audio" });
    }
  });
  const normalizeCoachTone2 = (tone) => {
    if (!tone) return "energetic";
    return tone.trim().toLowerCase();
  };
  const normalizeCoachAccent = (accent) => {
    if (!accent) return "";
    return accent.trim().toLowerCase();
  };
  const getPhaseTone = (baseTone, distance, targetDistance, phase) => {
    if (!distance || !targetDistance || targetDistance <= 0) {
      return normalizeCoachTone2(baseTone);
    }
    const progress = Math.max(0, Math.min(100, Math.round(distance / targetDistance * 100)));
    if (progress < 15) return "energetic";
    if (progress < 50) return "encouraging";
    if (progress < 90) return "supportive";
    return "inspirational";
  };
  const mapCoachVoice = (coachGender, coachAccent, coachTone) => {
    const tone = normalizeCoachTone2(coachTone);
    const accent = normalizeCoachAccent(coachAccent);
    const isAmerican = accent === "american";
    const isBritish = accent === "british";
    const isIrish = accent === "irish";
    const isScottish = accent === "scottish";
    const isAustralian = accent === "australian";
    const isNewZealand = accent === "new zealand" || accent === "newzealand" || accent === "nz";
    const isCommonwealth = isBritish || isIrish || isScottish;
    const isOceania = isAustralian || isNewZealand;
    if (coachGender === "male") {
      if (tone === "energetic") return "echo";
      if (tone === "motivational" || tone === "inspirational") return "alloy";
      if (tone === "calm" || tone === "supportive" || tone === "encouraging") return "onyx";
      if (isAmerican) return "echo";
      if (isCommonwealth) return "alloy";
      if (isOceania) return "onyx";
      return "onyx";
    } else {
      if (tone === "energetic") return "shimmer";
      if (tone === "motivational" || tone === "inspirational") return "nova";
      if (tone === "calm" || tone === "supportive" || tone === "encouraging") return "fable";
      if (isAmerican) return "shimmer";
      if (isCommonwealth) return "nova";
      if (isOceania) return "fable";
      return "fable";
    }
  };
  app2.post("/api/coaching/pace-update", async (req, res) => {
    try {
      const { coachGender, coachAccent, coachTone: baseTone } = req.body;
      const effectiveTone = getPhaseTone(
        baseTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const message = await aiService.generatePaceUpdate(req.body);
      const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
      const audioBuffer = await aiService.generateTTS(message, voice);
      const base64Audio = audioBuffer.toString("base64");
      res.json({
        message,
        nextPace: req.body.currentPace,
        // Fallback
        audio: base64Audio,
        format: "mp3"
      });
    } catch (error) {
      console.error("Pace update coaching error:", error);
      res.status(500).json({ error: "Failed to get pace update" });
    }
  });
  app2.post("/api/coaching/struggle-coaching", async (req, res) => {
    try {
      const { coachGender, coachAccent, coachTone: baseTone } = req.body;
      const effectiveTone = getPhaseTone(
        baseTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const message = await aiService.generateStruggleCoaching(req.body);
      const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
      const audioBuffer = await aiService.generateTTS(message, voice);
      const base64Audio = audioBuffer.toString("base64");
      res.json({
        message,
        audio: base64Audio,
        format: "mp3"
      });
    } catch (error) {
      console.error("Struggle coaching error:", error);
      res.status(500).json({ error: "Failed to get struggle coaching" });
    }
  });
  app2.post("/api/coaching/cadence-coaching", async (req, res) => {
    try {
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const message = await aiService.generateCadenceCoaching(req.body);
      let base64Audio = null;
      try {
        const { coachGender, coachAccent, coachTone } = req.body;
        const voice = mapCoachVoice(coachGender, coachAccent, coachTone);
        const audioBuffer = await aiService.generateTTS(message, voice);
        base64Audio = audioBuffer.toString("base64");
      } catch (ttsError) {
        console.warn("Cadence coaching TTS failed, returning text only:", ttsError);
      }
      res.json({
        message,
        audio: base64Audio,
        format: "mp3"
      });
    } catch (error) {
      console.error("Cadence coaching error:", error);
      res.status(500).json({ error: "Failed to get cadence coaching" });
    }
  });
  app2.post("/api/coaching/phase-coaching", async (req, res) => {
    try {
      const { coachGender, coachAccent, coachTone: baseTone } = req.body;
      const effectiveTone = getPhaseTone(
        baseTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      req.body.coachTone = effectiveTone;
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const message = await aiService.generatePhaseCoaching(req.body);
      const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
      const audioBuffer = await aiService.generateTTS(message, voice);
      const base64Audio = audioBuffer.toString("base64");
      res.json({
        message,
        nextPhase: null,
        audio: base64Audio,
        format: "mp3"
      });
    } catch (error) {
      console.error("Phase coaching error:", error);
      res.status(500).json({ error: "Failed to get phase coaching" });
    }
  });
  app2.post("/api/coaching/talk-to-coach", authMiddleware, async (req, res) => {
    try {
      const { message, context } = req.body;
      const user = await storage.getUser(req.user.userId);
      const coachName = user?.coachName || "Coach";
      const baseTone = user?.coachTone || "encouraging";
      if (!context.wellness) {
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const todayWellness = await db.query.garminWellnessMetrics.findFirst({
          where: (m, { and: and7, eq: eq7 }) => and7(
            eq7(m.userId, req.user.userId),
            eq7(m.date, today)
          )
        });
        if (todayWellness) {
          context.wellness = {
            bodyBattery: todayWellness.bodyBatteryCurrent,
            sleepQuality: todayWellness.sleepQuality,
            stressQualifier: todayWellness.stressQualifier,
            hrvStatus: todayWellness.hrvStatus,
            readinessScore: todayWellness.readinessScore
          };
        }
      }
      const effectiveTone = getPhaseTone(
        baseTone,
        context.distance,
        context.totalDistance,
        context.phase
      );
      context.coachTone = effectiveTone;
      context.coachName = coachName;
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const response = await aiService.getWellnessAwareCoachingResponse(message, context);
      const coachGender = user?.coachGender || "female";
      const coachAccent = user?.coachAccent || "british";
      const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
      const audioBuffer = await aiService.generateTTS(response, voice);
      const base64Audio = audioBuffer.toString("base64");
      res.json({
        message: response,
        audio: base64Audio,
        format: "mp3"
      });
    } catch (error) {
      console.error("Talk to coach error:", error);
      res.status(500).json({ error: "Failed to get coaching response" });
    }
  });
  app2.post("/api/coaching/hr-coaching", authMiddleware, async (req, res) => {
    try {
      const { currentHR, avgHR, maxHR, targetZone, elapsedMinutes } = req.body;
      const user = await storage.getUser(req.user.userId);
      const coachName = user?.coachName || "Coach";
      const baseTone = user?.coachTone || "encouraging";
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      let wellness = void 0;
      const todayWellness = await db.query.garminWellnessMetrics.findFirst({
        where: (m, { and: and7, eq: eq7 }) => and7(
          eq7(m.userId, req.user.userId),
          eq7(m.date, today)
        )
      });
      if (todayWellness) {
        wellness = {
          bodyBattery: todayWellness.bodyBatteryCurrent,
          sleepQuality: todayWellness.sleepQuality,
          hrvStatus: todayWellness.hrvStatus
        };
      }
      const effectiveTone = getPhaseTone(
        baseTone,
        req.body.distance,
        req.body.targetDistance,
        req.body.phase
      );
      const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
      const response = await aiService.generateHeartRateCoaching({
        currentHR,
        avgHR,
        maxHR: maxHR || 190,
        targetZone,
        elapsedMinutes: elapsedMinutes || 0,
        coachName,
        coachTone: effectiveTone,
        wellness
      });
      const coachGender = user?.coachGender || "female";
      const coachAccent = user?.coachAccent || "british";
      const voice = mapCoachVoice(coachGender, coachAccent, baseTone);
      const audioBuffer = await aiService.generateTTS(response, voice);
      const base64Audio = audioBuffer.toString("base64");
      res.json({
        message: response,
        audio: base64Audio,
        format: "mp3"
      });
    } catch (error) {
      console.error("HR coaching error:", error);
      res.status(500).json({ error: "Failed to get HR coaching" });
    }
  });
  app2.post("/api/garmin-companion/auth", async (req, res) => {
    try {
      const { email, password, deviceId, deviceModel } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const bcrypt2 = await import("bcryptjs");
      const isValid = await bcrypt2.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const jwt2 = await import("jsonwebtoken");
      const token = jwt2.default.sign(
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
          coachTone: user.coachTone
        }
      });
    } catch (error) {
      console.error("Companion auth error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });
  const companionAuthMiddleware = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
      }
      const token = authHeader.slice(7);
      const jwt2 = await import("jsonwebtoken");
      const decoded = jwt2.default.verify(token, process.env.SESSION_SECRET || "fallback-secret");
      if (decoded.type !== "companion") {
        return res.status(401).json({ error: "Invalid token type" });
      }
      req.companionUser = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
  app2.post("/api/garmin-companion/session/start", companionAuthMiddleware, async (req, res) => {
    try {
      const { userId } = req.companionUser;
      const { sessionId, deviceId, deviceModel, activityType } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      const existing = await db.select().from(garminCompanionSessions).where(eq6(garminCompanionSessions.sessionId, sessionId)).limit(1);
      if (existing.length > 0) {
        return res.json({ success: true, session: existing[0], message: "Session already exists" });
      }
      const [session] = await db.insert(garminCompanionSessions).values({
        userId,
        sessionId,
        deviceId,
        deviceModel,
        activityType: activityType || "running",
        status: "active",
        startedAt: /* @__PURE__ */ new Date()
      }).returning();
      console.log(`[Companion] Session ${sessionId} started for user ${userId} (${activityType || "running"})`);
      res.json({
        success: true,
        session,
        message: "Session started"
      });
    } catch (error) {
      console.error("Companion session start error:", error);
      res.status(500).json({ error: "Failed to start session" });
    }
  });
  app2.post("/api/garmin-companion/session/link", companionAuthMiddleware, async (req, res) => {
    try {
      const { userId } = req.companionUser;
      const { sessionId, runId } = req.body;
      if (!sessionId || !runId) {
        return res.status(400).json({ error: "Session ID and Run ID required" });
      }
      const [updated] = await db.update(garminCompanionSessions).set({ runId }).where(and6(
        eq6(garminCompanionSessions.sessionId, sessionId),
        eq6(garminCompanionSessions.userId, userId)
      )).returning();
      await db.update(garminRealtimeData).set({ runId }).where(eq6(garminRealtimeData.sessionId, sessionId));
      console.log(`[Companion] Session ${sessionId} linked to run ${runId}`);
      res.json({ success: true, session: updated });
    } catch (error) {
      console.error("Companion session link error:", error);
      res.status(500).json({ error: "Failed to link session" });
    }
  });
  app2.post("/api/garmin-companion/data", companionAuthMiddleware, async (req, res) => {
    try {
      const { userId } = req.companionUser;
      const data = req.body;
      if (!data.sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      const sessions = await db.select().from(garminCompanionSessions).where(eq6(garminCompanionSessions.sessionId, data.sessionId)).limit(1);
      const session = sessions[0];
      const runId = session?.runId || null;
      const [inserted] = await db.insert(garminRealtimeData).values({
        userId,
        runId,
        sessionId: data.sessionId,
        timestamp: data.timestamp ? new Date(data.timestamp) : /* @__PURE__ */ new Date(),
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
        elapsedTime: data.elapsedTime
      }).returning();
      await db.update(garminCompanionSessions).set({
        lastDataAt: /* @__PURE__ */ new Date(),
        dataPointCount: sql8`data_point_count + 1`
      }).where(eq6(garminCompanionSessions.sessionId, data.sessionId));
      res.json({ success: true, id: inserted.id });
    } catch (error) {
      console.error("Companion data error:", error);
      res.status(500).json({ error: "Failed to save data" });
    }
  });
  app2.post("/api/garmin-companion/data/batch", companionAuthMiddleware, async (req, res) => {
    try {
      const { userId } = req.companionUser;
      const { sessionId, dataPoints } = req.body;
      if (!sessionId || !Array.isArray(dataPoints) || dataPoints.length === 0) {
        return res.status(400).json({ error: "Session ID and data points array required" });
      }
      const sessions = await db.select().from(garminCompanionSessions).where(eq6(garminCompanionSessions.sessionId, sessionId)).limit(1);
      const session = sessions[0];
      const runId = session?.runId || null;
      const values = dataPoints.map((data) => ({
        userId,
        runId,
        sessionId,
        timestamp: data.timestamp ? new Date(data.timestamp) : /* @__PURE__ */ new Date(),
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
        elapsedTime: data.elapsedTime
      }));
      await db.insert(garminRealtimeData).values(values);
      await db.update(garminCompanionSessions).set({
        lastDataAt: /* @__PURE__ */ new Date(),
        dataPointCount: sql8`data_point_count + ${dataPoints.length}`
      }).where(eq6(garminCompanionSessions.sessionId, sessionId));
      console.log(`[Companion] Batch insert ${dataPoints.length} points for session ${sessionId}`);
      res.json({ success: true, count: dataPoints.length });
    } catch (error) {
      console.error("Companion batch data error:", error);
      res.status(500).json({ error: "Failed to save batch data" });
    }
  });
  app2.post("/api/garmin-companion/session/status", companionAuthMiddleware, async (req, res) => {
    try {
      const { userId } = req.companionUser;
      const { sessionId, status } = req.body;
      if (!sessionId || !status) {
        return res.status(400).json({ error: "Session ID and status required" });
      }
      const [updated] = await db.update(garminCompanionSessions).set({ status }).where(and6(
        eq6(garminCompanionSessions.sessionId, sessionId),
        eq6(garminCompanionSessions.userId, userId)
      )).returning();
      console.log(`[Companion] Session ${sessionId} status changed to ${status}`);
      res.json({ success: true, session: updated });
    } catch (error) {
      console.error("Companion session status error:", error);
      res.status(500).json({ error: "Failed to update session status" });
    }
  });
  app2.post("/api/garmin-companion/session/end", companionAuthMiddleware, async (req, res) => {
    try {
      const { userId } = req.companionUser;
      const { sessionId, summary } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      let stats = summary || {};
      if (!summary) {
        const dataPoints = await db.select().from(garminRealtimeData).where(eq6(garminRealtimeData.sessionId, sessionId)).orderBy(garminRealtimeData.timestamp);
        if (dataPoints.length > 0) {
          const heartRates = dataPoints.filter((d) => d.heartRate).map((d) => d.heartRate);
          const cadences = dataPoints.filter((d) => d.cadence).map((d) => d.cadence);
          const paces = dataPoints.filter((d) => d.pace && d.pace > 0).map((d) => d.pace);
          const lastPoint = dataPoints[dataPoints.length - 1];
          stats = {
            totalDistance: lastPoint.cumulativeDistance,
            totalDuration: lastPoint.elapsedTime,
            avgHeartRate: heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null,
            maxHeartRate: heartRates.length > 0 ? Math.max(...heartRates) : null,
            avgCadence: cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null,
            avgPace: paces.length > 0 ? paces.reduce((a, b) => a + b, 0) / paces.length : null,
            totalAscent: lastPoint.cumulativeAscent,
            totalDescent: lastPoint.cumulativeDescent
          };
        }
      }
      const [updated] = await db.update(garminCompanionSessions).set({
        status: "completed",
        endedAt: /* @__PURE__ */ new Date(),
        totalDistance: stats.totalDistance,
        totalDuration: stats.totalDuration,
        avgHeartRate: stats.avgHeartRate,
        maxHeartRate: stats.maxHeartRate,
        avgCadence: stats.avgCadence,
        avgPace: stats.avgPace,
        totalAscent: stats.totalAscent,
        totalDescent: stats.totalDescent
      }).where(and6(
        eq6(garminCompanionSessions.sessionId, sessionId),
        eq6(garminCompanionSessions.userId, userId)
      )).returning();
      console.log(`[Companion] Session ${sessionId} ended - ${stats.totalDistance?.toFixed(0) || 0}m in ${stats.totalDuration || 0}s`);
      res.json({ success: true, session: updated, summary: stats });
    } catch (error) {
      console.error("Companion session end error:", error);
      res.status(500).json({ error: "Failed to end session" });
    }
  });
  app2.get("/api/garmin-companion/session/:sessionId/data", authMiddleware, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { since } = req.query;
      let query = db.select().from(garminRealtimeData).where(eq6(garminRealtimeData.sessionId, sessionId)).orderBy(garminRealtimeData.timestamp);
      if (since) {
        const sinceDate = new Date(since);
        query = db.select().from(garminRealtimeData).where(and6(
          eq6(garminRealtimeData.sessionId, sessionId),
          sql8`timestamp > ${sinceDate}`
        )).orderBy(garminRealtimeData.timestamp);
      }
      const dataPoints = await query.limit(1e3);
      res.json({ dataPoints, count: dataPoints.length });
    } catch (error) {
      console.error("Get companion data error:", error);
      res.status(500).json({ error: "Failed to get session data" });
    }
  });
  app2.get("/api/garmin-companion/session/:sessionId/latest", authMiddleware, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const [latest] = await db.select().from(garminRealtimeData).where(eq6(garminRealtimeData.sessionId, sessionId)).orderBy(sql8`timestamp DESC`).limit(1);
      const [session] = await db.select().from(garminCompanionSessions).where(eq6(garminCompanionSessions.sessionId, sessionId)).limit(1);
      res.json({ latest, session });
    } catch (error) {
      console.error("Get latest companion data error:", error);
      res.status(500).json({ error: "Failed to get latest data" });
    }
  });
  app2.get("/api/garmin-companion/sessions/active", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
      const sessions = await db.select().from(garminCompanionSessions).where(and6(
        eq6(garminCompanionSessions.userId, userId),
        eq6(garminCompanionSessions.status, "active")
      )).orderBy(sql8`started_at DESC`);
      res.json({ sessions });
    } catch (error) {
      console.error("Get active sessions error:", error);
      res.status(500).json({ error: "Failed to get active sessions" });
    }
  });
  app2.put("/api/users/:id/coach-settings", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { coachName, coachGender, coachAccent, coachTone } = req.body;
      if (req.user?.userId !== id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const validGenders = ["male", "female"];
      const validAccents = ["British", "American", "Australian", "Irish", "Scottish", "New Zealand"];
      const validTones = ["Energetic", "Motivational", "Instructive", "Factual", "Abrupt"];
      if (coachGender && !validGenders.includes(coachGender)) {
        return res.status(400).json({ error: "Invalid coach gender" });
      }
      if (coachAccent && !validAccents.includes(coachAccent)) {
        return res.status(400).json({ error: `Invalid coach accent: ${coachAccent}. Valid options: ${validAccents.join(", ")}` });
      }
      if (coachTone && !validTones.includes(coachTone)) {
        return res.status(400).json({ error: `Invalid coach tone: ${coachTone}. Valid options: ${validTones.join(", ")}` });
      }
      const updatedUser = await storage.updateUser(id, {
        coachName,
        coachGender,
        coachAccent,
        coachTone
      });
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update coach settings error:", error);
      res.status(500).json({ error: "Failed to update coach settings" });
    }
  });
  app2.get("/api/friends/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.query;
      if (req.user?.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const friendUsers = await storage.getFriends(userId);
      const friends2 = friendUsers.map((f) => ({
        id: f.id,
        name: f.name,
        email: f.email,
        profilePic: f.profilePic,
        fitnessLevel: f.fitnessLevel,
        distanceScale: f.distanceScale
      }));
      res.json(friends2);
    } catch (error) {
      console.error("Get friends error:", error);
      res.status(500).json({ error: "Failed to get friends" });
    }
  });
  app2.post("/api/friends/:userId/add", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { friendId } = req.body;
      if (req.user?.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (userId === friendId) {
        return res.status(400).json({ error: "Cannot add yourself as a friend" });
      }
      const friendUser = await storage.getUser(friendId);
      if (!friendUser) {
        return res.status(404).json({ error: "User not found" });
      }
      const existingFriends = await storage.getFriends(userId);
      if (existingFriends.some((f) => f.id === friendId)) {
        return res.status(409).json({ error: "Friendship already exists" });
      }
      await storage.addFriend(userId, friendId);
      await storage.addFriend(friendId, userId);
      const { password: _, ...friendWithoutPassword } = friendUser;
      res.status(201).json({
        id: friendUser.id,
        name: friendUser.name,
        email: friendUser.email,
        profilePicUrl: friendUser.profilePic,
        subscriptionTier: friendUser.subscriptionTier || "free",
        friendshipStatus: "accepted",
        friendsSince: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      console.error("Add friend error:", error);
      res.status(500).json({ error: "Failed to add friend" });
    }
  });
  app2.delete("/api/friends/:userId/:friendId", authMiddleware, async (req, res) => {
    try {
      const { userId, friendId } = req.params;
      if (req.user?.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.removeFriend(userId, friendId);
      res.status(204).send();
    } catch (error) {
      console.error("Remove friend error:", error);
      res.status(500).json({ error: "Failed to remove friend" });
    }
  });
  app2.get("/api/group-runs", authMiddleware, async (req, res) => {
    try {
      const { status: statusFilter, my_groups } = req.query;
      const userId = req.user.userId;
      const allGroupRuns = await storage.getGroupRuns();
      const groupRunsWithDetails = await Promise.all(
        allGroupRuns.map(async (gr) => {
          const host = await storage.getUser(gr.hostUserId);
          const participants = await db.select().from(groupRunParticipants).where(and6(
            eq6(groupRunParticipants.groupRunId, gr.id),
            eq6(groupRunParticipants.invitationStatus, "accepted")
          ));
          const userParticipant = participants.find((p) => p.userId === userId);
          return {
            id: gr.id,
            name: gr.title || "Group Run",
            description: gr.description || "",
            creatorId: gr.hostUserId,
            creatorName: host?.name || "Unknown",
            meetingPoint: "TBD",
            // Not in current schema
            meetingLat: null,
            meetingLng: null,
            distance: gr.targetDistance || 5,
            dateTime: gr.plannedStartAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
            maxParticipants: 10,
            // Default
            currentParticipants: participants.length,
            isPublic: true,
            status: gr.status || "upcoming",
            isJoined: !!userParticipant,
            createdAt: gr.createdAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString()
          };
        })
      );
      let filteredRuns = groupRunsWithDetails;
      if (statusFilter) {
        filteredRuns = filteredRuns.filter((gr) => gr.status === statusFilter);
      }
      if (my_groups === "true") {
        filteredRuns = filteredRuns.filter((gr) => gr.creatorId === userId || gr.isJoined);
      }
      res.json({
        groupRuns: filteredRuns,
        count: filteredRuns.length,
        total: groupRunsWithDetails.length
      });
    } catch (error) {
      console.error("Get group runs error:", error);
      res.status(500).json({ error: "Failed to get group runs" });
    }
  });
  app2.post("/api/group-runs", authMiddleware, async (req, res) => {
    try {
      const {
        name,
        description,
        meetingPoint,
        meetingLat,
        meetingLng,
        distance,
        dateTime,
        maxParticipants = 10,
        isPublic = true
      } = req.body;
      const creatorId = req.user.userId;
      if (!name || !distance || !dateTime) {
        return res.status(400).json({ error: "Missing required fields: name, distance, dateTime" });
      }
      if (new Date(dateTime) <= /* @__PURE__ */ new Date()) {
        return res.status(400).json({ error: "Date/time must be in the future" });
      }
      if (distance <= 0 || distance > 100) {
        return res.status(400).json({ error: "Distance must be between 0 and 100 km" });
      }
      const inviteToken = Math.random().toString(36).substring(2, 15);
      const groupRun = await storage.createGroupRun({
        hostUserId: creatorId,
        title: name,
        description,
        targetDistance: distance,
        plannedStartAt: new Date(dateTime),
        inviteToken,
        status: "pending",
        mode: "route"
      });
      await storage.joinGroupRun(groupRun.id, creatorId);
      const creator = await storage.getUser(creatorId);
      res.status(201).json({
        id: groupRun.id,
        name: groupRun.title,
        description: groupRun.description,
        creatorId: groupRun.hostUserId,
        creatorName: creator?.name || "Unknown",
        meetingPoint: meetingPoint || "TBD",
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
    } catch (error) {
      console.error("Create group run error:", error);
      res.status(500).json({ error: "Failed to create group run" });
    }
  });
  app2.post("/api/group-runs/:groupRunId/join", authMiddleware, async (req, res) => {
    try {
      const { groupRunId } = req.params;
      const userId = req.user.userId;
      const groupRun = await storage.getGroupRun(groupRunId);
      if (!groupRun) {
        return res.status(404).json({ error: "Group run not found" });
      }
      const participants = await db.select().from(groupRunParticipants).where(and6(
        eq6(groupRunParticipants.groupRunId, groupRunId),
        eq6(groupRunParticipants.userId, userId)
      ));
      if (participants.length > 0) {
        return res.status(409).json({ error: "Already joined this group run" });
      }
      await storage.joinGroupRun(groupRunId, userId);
      res.json({
        message: "Successfully joined group run",
        groupRunId,
        userId
      });
    } catch (error) {
      console.error("Join group run error:", error);
      res.status(500).json({ error: "Failed to join group run" });
    }
  });
  app2.delete("/api/group-runs/:groupRunId/leave", authMiddleware, async (req, res) => {
    try {
      const { groupRunId } = req.params;
      const userId = req.user.userId;
      const groupRun = await storage.getGroupRun(groupRunId);
      if (groupRun?.hostUserId === userId) {
        return res.status(400).json({ error: "Creators cannot leave their own group run. Delete it instead." });
      }
      await db.delete(groupRunParticipants).where(and6(
        eq6(groupRunParticipants.groupRunId, groupRunId),
        eq6(groupRunParticipants.userId, userId)
      ));
      res.status(204).send();
    } catch (error) {
      console.error("Leave group run error:", error);
      res.status(500).json({ error: "Failed to leave group run" });
    }
  });
  app2.get("/api/fitness/current/:userId", authMiddleware, async (req, res) => {
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
    } catch (error) {
      console.error("Get current fitness error:", error);
      res.status(500).json({ error: "Failed to get fitness status" });
    }
  });
  app2.get("/api/fitness/trend/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;
      const end = endDate ? String(endDate) : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const start = startDate ? String(startDate) : (() => {
        const date = /* @__PURE__ */ new Date();
        date.setDate(date.getDate() - 90);
        return date.toISOString().split("T")[0];
      })();
      const trend = await getFitnessTrend(userId, start, end);
      res.json({
        startDate: start,
        endDate: end,
        dataPoints: trend.length,
        trend: trend.map((point) => ({
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
    } catch (error) {
      console.error("Get fitness trend error:", error);
      res.status(500).json({ error: "Failed to get fitness trend" });
    }
  });
  app2.post("/api/fitness/recalculate/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      if (req.user.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      await recalculateHistoricalFitness(userId);
      res.json({
        success: true,
        message: "Historical fitness data recalculated successfully"
      });
    } catch (error) {
      console.error("Recalculate fitness error:", error);
      res.status(500).json({ error: "Failed to recalculate fitness data" });
    }
  });
  app2.delete("/api/runs/:id", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const run = await storage.getRun(id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this run" });
      }
      await db.delete(runs).where(eq6(runs.id, id));
      if (run.completedAt && run.tss) {
        recalculateHistoricalFitness(userId).catch((err) => {
          console.error("Failed to recalculate fitness after run deletion:", err);
        });
      }
      res.json({ success: true, message: "Run deleted successfully" });
    } catch (error) {
      console.error("Delete run error:", error);
      res.status(500).json({ error: "Failed to delete run" });
    }
  });
  app2.post("/api/coaching/run-analysis", authMiddleware, async (req, res) => {
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
      if (req.user?.userId && run.userId && req.user.userId !== run.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      try {
        const userPostRunComments = typeof body.userPostRunComments === "string" ? body.userPostRunComments : void 0;
        const strugglePoints = Array.isArray(body.relevantStrugglePoints) ? body.relevantStrugglePoints : void 0;
        if (userPostRunComments !== void 0 || strugglePoints !== void 0) {
          await storage.updateRun(runId, {
            userComments: userPostRunComments ?? run.userComments ?? null,
            strugglePoints: strugglePoints ?? run.strugglePoints ?? null
          });
        }
      } catch (e) {
        console.warn("Failed to persist post-run comments/struggle points:", e);
      }
      const user = await storage.getUser(run.userId);
      const previousRuns = await db.select().from(runs).where(eq6(runs.userId, run.userId)).orderBy(desc4(runs.completedAt)).limit(10);
      const coachName = body.coachName || user?.coachName || "AI Coach";
      const coachTone = body.coachTone || user?.coachTone || "energetic";
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
        userComments: body.userPostRunComments || run.userComments
      };
      let ai = null;
      try {
        const aiService = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
        ai = await aiService.generateComprehensiveRunAnalysis({
          runData: runDataForAi,
          previousRuns: previousRuns.filter((r) => r.id !== runId).slice(0, 5),
          userProfile: body.userProfile || (user ? {
            fitnessLevel: user.fitnessLevel || void 0,
            age: user.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1e3)) : void 0,
            weight: user.weight ? parseFloat(user.weight) : void 0
          } : void 0),
          coachName,
          coachTone
        });
      } catch (e) {
        console.error("AI analysis generation failed, falling back to lightweight response:", e);
        ai = {
          summary: `Great run! You covered ${(((body.distance ?? run.distance) || 0) / 1e3).toFixed(2)}km in ${Math.round(((body.duration ?? run.duration) || 0) / 1e3 / 60)} minutes.`,
          performanceScore: 78,
          highlights: ["Strong effort", "Solid completion"],
          struggles: [],
          personalBests: [],
          improvementTips: ["Add an easy recovery run", "Include one interval session this week"],
          trainingLoadAssessment: "Moderate training stimulus.",
          recoveryAdvice: "Hydrate, refuel, and prioritize sleep tonight.",
          nextRunSuggestion: "Easy 20\u201330 min recovery run.",
          wellnessImpact: "Wellness data not available.",
          technicalAnalysis: {
            paceAnalysis: "Your pacing was generally consistent.",
            heartRateAnalysis: "Heart-rate data not available.",
            cadenceAnalysis: "Cadence data not available.",
            runningDynamics: "Running dynamics not available.",
            elevationPerformance: "Elevation performance not available."
          }
        };
      }
      const score10 = (v) => {
        const n = Number(v);
        if (!isFinite(n)) return 0;
        const out = n > 10 ? n / 10 : n;
        return Math.max(0, Math.min(10, Math.round(out * 10) / 10));
      };
      const strengths = Array.isArray(ai.highlights) ? ai.highlights : [];
      const areasForImprovement = Array.isArray(ai.improvementTips) ? ai.improvementTips : Array.isArray(ai.struggles) ? ai.struggles : [];
      const trainingRecommendations = (Array.isArray(ai.improvementTips) ? ai.improvementTips : []).slice(0, 6).map((t) => ({
        category: "technique",
        recommendation: t,
        priority: "medium",
        specificWorkout: null
      }));
      const response = {
        executiveSummary: String(ai.summary || ""),
        strengths,
        areasForImprovement,
        overallPerformanceScore: score10(ai.performanceScore ?? 0),
        paceConsistencyScore: score10(ai.paceConsistencyScore ?? 7.5),
        effortScore: score10(ai.effortScore ?? 8),
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
        strugglePointsInsight: Array.isArray(body.relevantStrugglePoints) && body.relevantStrugglePoints.length ? `We detected ${body.relevantStrugglePoints.length} struggle point(s). Your notes help us interpret them accurately.` : null,
        coachMotivationalMessage: String(ai.coachMotivationalMessage || ai.summary || "Great work \u2014 keep building!")
      };
      res.json(response);
    } catch (error) {
      console.error("Run analysis error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate run analysis" });
    }
  });
  app2.get("/api/segments/nearby", authMiddleware, async (req, res) => {
    try {
      const { lat, lng, radius = 5 } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "Latitude and longitude required" });
      }
      const latitude = parseFloat(String(lat));
      const longitude = parseFloat(String(lng));
      const radiusKm = parseFloat(String(radius));
      const latDelta = radiusKm * 0.01;
      const lngDelta = radiusKm * 0.01;
      const nearbySegments = await db.select().from(segments).where(
        sql8`${segments.startLat} BETWEEN ${latitude - latDelta} AND ${latitude + latDelta}
          AND ${segments.startLng} BETWEEN ${longitude - lngDelta} AND ${longitude + lngDelta}`
      ).limit(20);
      res.json(nearbySegments);
    } catch (error) {
      console.error("Get nearby segments error:", error);
      res.status(500).json({ error: "Failed to get nearby segments" });
    }
  });
  app2.get("/api/segments/:id/leaderboard", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { timeframe = "all" } = req.query;
      let efforts = await db.select({
        effort: segmentEfforts,
        user: users
      }).from(segmentEfforts).leftJoin(users, eq6(segmentEfforts.userId, users.id)).where(eq6(segmentEfforts.segmentId, id)).orderBy(segmentEfforts.elapsedTime).limit(100);
      if (timeframe === "yearly") {
        const yearAgo = /* @__PURE__ */ new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        efforts = efforts.filter(
          (e) => e.effort.createdAt && e.effort.createdAt >= yearAgo
        );
      } else if (timeframe === "monthly") {
        const monthAgo = /* @__PURE__ */ new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        efforts = efforts.filter(
          (e) => e.effort.createdAt && e.effort.createdAt >= monthAgo
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
    } catch (error) {
      console.error("Get segment leaderboard error:", error);
      res.status(500).json({ error: "Failed to get segment leaderboard" });
    }
  });
  app2.post("/api/segments/:id/star", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const existing = await db.select().from(segmentStars).where(
        and6(
          eq6(segmentStars.segmentId, id),
          eq6(segmentStars.userId, userId)
        )
      ).limit(1);
      if (existing.length > 0) {
        await db.delete(segmentStars).where(eq6(segmentStars.id, existing[0].id));
        return res.json({ starred: false });
      } else {
        await db.insert(segmentStars).values({
          segmentId: id,
          userId
        });
        return res.json({ starred: true });
      }
    } catch (error) {
      console.error("Star segment error:", error);
      res.status(500).json({ error: "Failed to star/unstar segment" });
    }
  });
  app2.post("/api/segments/create", authMiddleware, async (req, res) => {
    try {
      const { runId, startIndex, endIndex, name, description } = req.body;
      const userId = req.user.userId;
      if (!runId || startIndex === void 0 || endIndex === void 0 || !name) {
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
    } catch (error) {
      console.error("Create segment error:", error);
      res.status(500).json({ error: error.message || "Failed to create segment" });
    }
  });
  app2.post("/api/segments/reprocess/:runId", authMiddleware, async (req, res) => {
    try {
      const { runId } = req.params;
      await reprocessRunForSegments(runId);
      res.json({ success: true, message: "Run reprocessed for segment matching" });
    } catch (error) {
      console.error("Reprocess run error:", error);
      res.status(500).json({ error: error.message || "Failed to reprocess run" });
    }
  });
  app2.get("/api/segments/efforts/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const efforts = await db.select({
        effort: segmentEfforts,
        segment: segments
      }).from(segmentEfforts).leftJoin(segments, eq6(segmentEfforts.segmentId, segments.id)).where(eq6(segmentEfforts.userId, userId)).orderBy(desc4(segmentEfforts.createdAt)).limit(50);
      res.json(efforts.map((e) => ({
        id: e.effort.id,
        segmentId: e.segment?.id,
        segmentName: e.segment?.name,
        elapsedTime: e.effort.elapsedTime,
        isPersonalRecord: e.effort.isPersonalRecord,
        leaderboardRank: e.effort.leaderboardRank,
        achievementType: e.effort.achievementType,
        createdAt: e.effort.createdAt
      })));
    } catch (error) {
      console.error("Get segment efforts error:", error);
      res.status(500).json({ error: "Failed to get segment efforts" });
    }
  });
  app2.get("/api/heatmap/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const userRuns = await db.select({
        gpsTrack: runs.gpsTrack,
        distance: runs.distance,
        completedAt: runs.completedAt
      }).from(runs).where(eq6(runs.userId, userId)).orderBy(desc4(runs.completedAt));
      const allPoints = [];
      for (const run of userRuns) {
        if (run.gpsTrack && Array.isArray(run.gpsTrack)) {
          const points = run.gpsTrack;
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
      const gridSize = 1e-3;
      const grid = /* @__PURE__ */ new Map();
      for (const point of allPoints) {
        const gridLat = Math.floor(point.lat / gridSize) * gridSize;
        const gridLng = Math.floor(point.lng / gridSize) * gridSize;
        const key = `${gridLat},${gridLng}`;
        if (grid.has(key)) {
          const cell = grid.get(key);
          cell.count++;
        } else {
          grid.set(key, { lat: gridLat, lng: gridLng, count: 1 });
        }
      }
      const maxCount = Math.max(...Array.from(grid.values()).map((c) => c.count));
      const heatmapData = Array.from(grid.values()).map((cell) => ({
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
    } catch (error) {
      console.error("Get heatmap error:", error);
      res.status(500).json({ error: "Failed to generate heatmap" });
    }
  });
  app2.post("/api/training-plans/generate", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
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
        targetDate ? new Date(targetDate) : void 0,
        experienceLevel || "intermediate",
        daysPerWeek || 4
      );
      res.status(201).json({
        planId,
        message: "Training plan generated successfully"
      });
    } catch (error) {
      console.error("Generate training plan error:", error);
      res.status(500).json({ error: error.message || "Failed to generate training plan" });
    }
  });
  app2.get("/api/training-plans/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { status = "active" } = req.query;
      const plans = await db.select().from(trainingPlans).where(
        and6(
          eq6(trainingPlans.userId, userId),
          eq6(trainingPlans.status, String(status))
        )
      ).orderBy(desc4(trainingPlans.createdAt));
      res.json(plans);
    } catch (error) {
      console.error("Get training plans error:", error);
      res.status(500).json({ error: "Failed to get training plans" });
    }
  });
  app2.get("/api/training-plans/details/:planId", authMiddleware, async (req, res) => {
    try {
      const { planId } = req.params;
      const plan = await db.select().from(trainingPlans).where(eq6(trainingPlans.id, planId)).limit(1);
      if (!plan[0]) {
        return res.status(404).json({ error: "Training plan not found" });
      }
      const weeks = await db.select().from(weeklyPlans).where(eq6(weeklyPlans.trainingPlanId, planId)).orderBy(weeklyPlans.weekNumber);
      const weeksWithWorkouts = await Promise.all(
        weeks.map(async (week) => {
          const workouts = await db.select().from(plannedWorkouts).where(eq6(plannedWorkouts.weeklyPlanId, week.id)).orderBy(plannedWorkouts.dayOfWeek);
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
    } catch (error) {
      console.error("Get training plan details error:", error);
      res.status(500).json({ error: "Failed to get training plan details" });
    }
  });
  app2.post("/api/training-plans/:planId/adapt", authMiddleware, async (req, res) => {
    try {
      const { planId } = req.params;
      const { reason } = req.body;
      const userId = req.user.userId;
      if (!reason) {
        return res.status(400).json({ error: "Reason is required" });
      }
      await adaptTrainingPlan(planId, reason, userId);
      res.json({ success: true, message: "Training plan adapted" });
    } catch (error) {
      console.error("Adapt training plan error:", error);
      res.status(500).json({ error: error.message || "Failed to adapt training plan" });
    }
  });
  app2.post("/api/training-plans/complete-workout", authMiddleware, async (req, res) => {
    try {
      const { workoutId, runId } = req.body;
      if (!workoutId || !runId) {
        return res.status(400).json({ error: "workoutId and runId are required" });
      }
      await completeWorkout(workoutId, runId);
      res.json({ success: true, message: "Workout marked as completed" });
    } catch (error) {
      console.error("Complete workout error:", error);
      res.status(500).json({ error: "Failed to mark workout as completed" });
    }
  });
  app2.get("/api/feed", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
      const { limit = 50, offset = 0 } = req.query;
      const friendsList = await storage.getFriends(userId);
      const friendIds = friendsList.map((f) => f.id);
      friendIds.push(userId);
      const activities = await db.select({
        activity: feedActivities,
        user: users
      }).from(feedActivities).leftJoin(users, eq6(feedActivities.userId, users.id)).where(
        and6(
          sql8`${feedActivities.userId} = ANY(${friendIds})`,
          sql8`${feedActivities.visibility} IN ('public', 'friends')`
        )
      ).orderBy(desc4(feedActivities.createdAt)).limit(Number(limit)).offset(Number(offset));
      res.json(activities.map((a) => ({
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
    } catch (error) {
      console.error("Get activity feed error:", error);
      res.status(500).json({ error: "Failed to get activity feed" });
    }
  });
  app2.post("/api/feed/:activityId/react", authMiddleware, async (req, res) => {
    try {
      const { activityId } = req.params;
      const { reactionType } = req.body;
      const userId = req.user.userId;
      const existing = await db.select().from(reactions).where(
        and6(
          eq6(reactions.activityId, activityId),
          eq6(reactions.userId, userId)
        )
      ).limit(1);
      if (existing.length > 0) {
        await db.update(reactions).set({ reactionType }).where(eq6(reactions.id, existing[0].id));
      } else {
        await db.insert(reactions).values({
          activityId,
          userId,
          reactionType
        });
        await db.update(feedActivities).set({
          reactionCount: sql8`${feedActivities.reactionCount} + 1`
        }).where(eq6(feedActivities.id, activityId));
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Add reaction error:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });
  app2.post("/api/feed/:activityId/comment", authMiddleware, async (req, res) => {
    try {
      const { activityId } = req.params;
      const { comment } = req.body;
      const userId = req.user.userId;
      if (!comment || comment.trim().length === 0) {
        return res.status(400).json({ error: "Comment cannot be empty" });
      }
      const newComment = await db.insert(activityComments).values({
        activityId,
        userId,
        comment: comment.trim()
      }).returning();
      await db.update(feedActivities).set({
        commentCount: sql8`${feedActivities.commentCount} + 1`
      }).where(eq6(feedActivities.id, activityId));
      res.status(201).json(newComment[0]);
    } catch (error) {
      console.error("Add comment error:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });
  app2.get("/api/feed/:activityId/comments", authMiddleware, async (req, res) => {
    try {
      const { activityId } = req.params;
      const comments = await db.select({
        comment: activityComments,
        user: users
      }).from(activityComments).leftJoin(users, eq6(activityComments.userId, users.id)).where(eq6(activityComments.activityId, activityId)).orderBy(activityComments.createdAt);
      res.json(comments.map((c) => ({
        id: c.comment.id,
        userId: c.user?.id,
        userName: c.user?.name,
        userProfilePic: c.user?.profilePic,
        comment: c.comment.comment,
        likeCount: c.comment.likeCount,
        createdAt: c.comment.createdAt
      })));
    } catch (error) {
      console.error("Get comments error:", error);
      res.status(500).json({ error: "Failed to get comments" });
    }
  });
  app2.get("/api/clubs", authMiddleware, async (req, res) => {
    try {
      const { search, city } = req.query;
      let query = db.select().from(clubs).where(eq6(clubs.isPublic, true));
      if (city) {
        query = query.where(eq6(clubs.city, String(city)));
      }
      const clubsList = await query.orderBy(desc4(clubs.memberCount)).limit(50);
      res.json(clubsList);
    } catch (error) {
      console.error("Get clubs error:", error);
      res.status(500).json({ error: "Failed to get clubs" });
    }
  });
  app2.post("/api/clubs/:clubId/join", authMiddleware, async (req, res) => {
    try {
      const { clubId } = req.params;
      const userId = req.user.userId;
      const existing = await db.select().from(clubMemberships).where(
        and6(
          eq6(clubMemberships.clubId, clubId),
          eq6(clubMemberships.userId, userId)
        )
      ).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "Already a member" });
      }
      await db.insert(clubMemberships).values({
        clubId,
        userId,
        role: "member"
      });
      await db.update(clubs).set({
        memberCount: sql8`${clubs.memberCount} + 1`
      }).where(eq6(clubs.id, clubId));
      res.json({ success: true, message: "Joined club successfully" });
    } catch (error) {
      console.error("Join club error:", error);
      res.status(500).json({ error: "Failed to join club" });
    }
  });
  app2.get("/api/challenges", authMiddleware, async (req, res) => {
    try {
      const now = /* @__PURE__ */ new Date();
      const activeChallenges = await db.select().from(challenges).where(
        and6(
          eq6(challenges.isPublic, true),
          gte4(challenges.endDate, now)
        )
      ).orderBy(challenges.startDate).limit(50);
      res.json(activeChallenges);
    } catch (error) {
      console.error("Get challenges error:", error);
      res.status(500).json({ error: "Failed to get challenges" });
    }
  });
  app2.post("/api/challenges/:challengeId/join", authMiddleware, async (req, res) => {
    try {
      const { challengeId } = req.params;
      const userId = req.user.userId;
      const existing = await db.select().from(challengeParticipants).where(
        and6(
          eq6(challengeParticipants.challengeId, challengeId),
          eq6(challengeParticipants.userId, userId)
        )
      ).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "Already participating in this challenge" });
      }
      await db.insert(challengeParticipants).values({
        challengeId,
        userId,
        currentProgress: 0,
        progressPercent: 0,
        isCompleted: false
      });
      await db.update(challenges).set({
        participantCount: sql8`${challenges.participantCount} + 1`
      }).where(eq6(challenges.id, challengeId));
      res.json({ success: true, message: "Joined challenge successfully" });
    } catch (error) {
      console.error("Join challenge error:", error);
      res.status(500).json({ error: "Failed to join challenge" });
    }
  });
  app2.post("/api/achievements/initialize", authMiddleware, async (req, res) => {
    try {
      await initializeAchievements();
      res.json({ success: true, message: "Achievements initialized" });
    } catch (error) {
      console.error("Initialize achievements error:", error);
      res.status(500).json({ error: "Failed to initialize achievements" });
    }
  });
  app2.get("/api/achievements/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const achievementsData = await getUserAchievements(userId);
      res.json(achievementsData);
    } catch (error) {
      console.error("Get achievements error:", error);
      res.status(500).json({ error: "Failed to get achievements" });
    }
  });
  app2.get("/api/achievements", authMiddleware, async (req, res) => {
    try {
      const allAchievements = await db.select().from(achievements).orderBy(achievements.category, achievements.points);
      res.json(allAchievements);
    } catch (error) {
      console.error("Get all achievements error:", error);
      res.status(500).json({ error: "Failed to get achievements" });
    }
  });
  app2.get("/api/share/templates", async (req, res) => {
    try {
      const { TEMPLATES: TEMPLATES2, STICKER_WIDGETS: STICKER_WIDGETS2 } = await Promise.resolve().then(() => (init_share_image_service(), share_image_service_exports));
      res.json({ templates: TEMPLATES2, stickers: STICKER_WIDGETS2 });
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Failed to get templates" });
    }
  });
  app2.post("/api/share/generate", authMiddleware, async (req, res) => {
    try {
      const { templateId, aspectRatio, stickers, runId } = req.body;
      if (!templateId || !runId) {
        return res.status(400).json({ error: "templateId and runId are required" });
      }
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.userId !== req.user.userId) {
        return res.status(403).json({ error: "You can only share your own runs" });
      }
      const user = await storage.getUser(req.user.userId);
      const { generateShareImage: generateShareImage2 } = await Promise.resolve().then(() => (init_share_image_service(), share_image_service_exports));
      const imageBuffer = await generateShareImage2({
        templateId,
        aspectRatio: aspectRatio || "1:1",
        stickers: stickers || [],
        runData: {
          distance: run.distance,
          duration: run.duration,
          avgPace: run.avgPace || void 0,
          avgHeartRate: run.avgHeartRate || void 0,
          maxHeartRate: run.maxHeartRate || void 0,
          calories: run.calories || void 0,
          cadence: run.cadence || void 0,
          elevation: run.elevation || void 0,
          elevationGain: run.elevationGain || void 0,
          elevationLoss: run.elevationLoss || void 0,
          difficulty: run.difficulty || void 0,
          gpsTrack: run.gpsTrack || void 0,
          heartRateData: run.heartRateData || void 0,
          paceData: run.paceData || void 0,
          completedAt: run.completedAt?.toISOString() || void 0,
          name: run.name || void 0,
          weatherData: run.weatherData || void 0
        },
        userName: user?.name || void 0
      });
      res.set({
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length.toString(),
        "Content-Disposition": `inline; filename="ai-run-coach-${runId}.png"`,
        "Cache-Control": "public, max-age=3600"
      });
      res.send(imageBuffer);
    } catch (error) {
      console.error("Generate share image error:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });
  app2.post("/api/share/preview", authMiddleware, async (req, res) => {
    try {
      const { templateId, aspectRatio, stickers, runId } = req.body;
      if (!templateId || !runId) {
        return res.status(400).json({ error: "templateId and runId are required" });
      }
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.userId !== req.user.userId) {
        return res.status(403).json({ error: "You can only share your own runs" });
      }
      const user = await storage.getUser(req.user.userId);
      const { generateShareImage: generateShareImage2 } = await Promise.resolve().then(() => (init_share_image_service(), share_image_service_exports));
      const imageBuffer = await generateShareImage2({
        templateId,
        aspectRatio: aspectRatio || "1:1",
        stickers: stickers || [],
        runData: {
          distance: run.distance,
          duration: run.duration,
          avgPace: run.avgPace || void 0,
          avgHeartRate: run.avgHeartRate || void 0,
          maxHeartRate: run.maxHeartRate || void 0,
          calories: run.calories || void 0,
          cadence: run.cadence || void 0,
          elevation: run.elevation || void 0,
          elevationGain: run.elevationGain || void 0,
          elevationLoss: run.elevationLoss || void 0,
          difficulty: run.difficulty || void 0,
          gpsTrack: run.gpsTrack || void 0,
          heartRateData: run.heartRateData || void 0,
          paceData: run.paceData || void 0,
          completedAt: run.completedAt?.toISOString() || void 0,
          name: run.name || void 0,
          weatherData: run.weatherData || void 0
        },
        userName: user?.name || void 0
      });
      const base64 = imageBuffer.toString("base64");
      res.json({ image: `data:image/png;base64,${base64}` });
    } catch (error) {
      console.error("Generate preview error:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/scheduler.ts
import cron from "node-cron";
init_garmin_service();
var SYNC_INTERVAL_MINUTES = 60;
async function syncGarminForUser(device) {
  const result = {
    userId: device.userId,
    deviceId: device.id,
    success: false
  };
  try {
    if (!device.accessToken) {
      result.error = "No access token";
      return result;
    }
    const today = /* @__PURE__ */ new Date();
    let dataPoints = 0;
    const wellness = await getGarminComprehensiveWellness(device.accessToken, today);
    if (wellness) {
      const wellnessData = {
        userId: device.userId,
        date: wellness.date,
        totalSleepSeconds: wellness.sleep?.totalSleepSeconds || null,
        sleepScore: wellness.sleep?.sleepScore || null,
        deepSleepSeconds: wellness.sleep?.deepSleepSeconds || null,
        lightSleepSeconds: wellness.sleep?.lightSleepSeconds || null,
        remSleepSeconds: wellness.sleep?.remSleepSeconds || null,
        awakeSleepSeconds: wellness.sleep?.awakeSleepSeconds || null,
        sleepQuality: wellness.sleep?.sleepQuality || null,
        restingHeartRate: wellness.heartRate?.restingHeartRate || null,
        maxHeartRate: wellness.heartRate?.maxHeartRate || null,
        minHeartRate: wellness.heartRate?.minHeartRate || null,
        averageHeartRate: wellness.heartRate?.averageHeartRate || null,
        averageStressLevel: wellness.stress?.averageStressLevel || null,
        maxStressLevel: wellness.stress?.maxStressLevel || null,
        stressDuration: wellness.stress?.stressDuration || null,
        restDuration: wellness.stress?.restDuration || null,
        stressQualifier: wellness.stress?.stressQualifier || null,
        bodyBatteryCharged: wellness.bodyBattery?.chargedValue || null,
        bodyBatteryDrained: wellness.bodyBattery?.drainedValue || null,
        bodyBatteryHigh: wellness.bodyBattery?.highestValue || null,
        bodyBatteryLow: wellness.bodyBattery?.lowestValue || null,
        bodyBatteryCurrent: wellness.bodyBattery?.currentValue || null,
        hrvStatus: wellness.hrv?.hrvStatus || null,
        hrvWeeklyAvg: wellness.hrv?.weeklyAvg || null,
        hrvLastNightAvg: wellness.hrv?.lastNightAvg || null,
        hrvFeedback: wellness.hrv?.feedbackPhrase || null,
        readinessScore: wellness.readiness?.score || null,
        readinessRecommendation: wellness.readiness?.recommendation || null,
        syncedAt: /* @__PURE__ */ new Date()
      };
      const existingWellness = await storage.getGarminWellnessByDate(device.userId, today);
      if (existingWellness) {
        await storage.updateGarminWellness(existingWellness.id, wellnessData);
      } else {
        await storage.createGarminWellness(wellnessData);
      }
      dataPoints++;
    }
    await storage.updateConnectedDevice(device.id, { lastSyncAt: /* @__PURE__ */ new Date() });
    result.success = true;
    result.dataPoints = dataPoints;
    console.log(`[Scheduler] Synced Garmin data for user ${device.userId}`);
  } catch (error) {
    result.error = error.message;
    console.error(`[Scheduler] Failed to sync Garmin for user ${device.userId}:`, error.message);
  }
  return result;
}
async function runGarminSync() {
  console.log(`[Scheduler] Starting Garmin sync for all users at ${(/* @__PURE__ */ new Date()).toISOString()}`);
  try {
    const allDevices = await storage.getAllActiveGarminDevices();
    if (allDevices.length === 0) {
      console.log("[Scheduler] No active Garmin devices found");
      return;
    }
    console.log(`[Scheduler] Found ${allDevices.length} active Garmin device(s)`);
    const results = await Promise.allSettled(
      allDevices.map((device) => syncGarminForUser(device))
    );
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;
    const failed = results.length - successful;
    console.log(`[Scheduler] Garmin sync completed: ${successful} successful, ${failed} failed`);
  } catch (error) {
    console.error("[Scheduler] Garmin sync job failed:", error.message);
  }
}
function startScheduler() {
  console.log(`[Scheduler] Starting background scheduler (sync every ${SYNC_INTERVAL_MINUTES} minutes)`);
  cron.schedule(`*/${SYNC_INTERVAL_MINUTES} * * * *`, () => {
    runGarminSync();
  });
  console.log("[Scheduler] Garmin sync scheduled");
  setTimeout(() => {
    console.log("[Scheduler] Running initial Garmin sync in 30 seconds...");
    runGarminSync();
  }, 3e4);
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
var app = express2();
var log = console.log;
var METRO_PORT = 8081;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, PATCH, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express2.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express2.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function isBrowserRequest(req) {
  const platform = req.header("expo-platform");
  if (platform) return false;
  const accept = req.header("accept") || "";
  if (accept.includes("text/html")) return true;
  const ua = (req.header("user-agent") || "").toLowerCase();
  if (ua.includes("mozilla") || ua.includes("chrome") || ua.includes("safari") || ua.includes("firefox") || ua.includes("edge")) {
    if (!ua.includes("okhttp") && !ua.includes("expo") && !ua.includes("react-native")) {
      return true;
    }
  }
  return false;
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Setting up Expo routing with Metro proxy and web app");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    const platform = req.header("expo-platform");
    if ((req.path === "/" || req.path === "/manifest") && platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    next();
  });
  app2.use("/assets", express2.static(path.resolve(process.cwd(), "assets")));
  app2.use("/logos", express2.static(path.resolve(process.cwd(), "attached_assets/generated_images")));
  app2.use(express2.static(path.resolve(process.cwd(), "static-build")));
  const webDistPath = path.resolve(process.cwd(), "web", "dist");
  if (fs.existsSync(webDistPath)) {
    app2.use(express2.static(webDistPath));
    log(`Web app: Serving from ${webDistPath}`);
  }
  const metroProxy = createProxyMiddleware({
    target: `http://localhost:${METRO_PORT}`,
    changeOrigin: true,
    ws: true,
    on: {
      error: (err, req, res) => {
        log(`Metro proxy error: ${err.message}`);
        const response = res;
        if (!response.headersSent) {
          serveLandingPage({
            req,
            res: response,
            landingPageTemplate,
            appName
          });
        }
      }
    }
  });
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (isBrowserRequest(req)) {
      const webIndexPath = path.resolve(webDistPath, "index.html");
      if (fs.existsSync(webIndexPath)) {
        return res.sendFile(webIndexPath);
      }
    }
    return metroProxy(req, res, next);
  });
  log("Expo routing: Mobile manifests, Metro proxy, and web app configured");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, _next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  const server = await registerRoutes(app);
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const platform = req.header("expo-platform");
    if ((req.path === "/" || req.path === "/manifest") && platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    next();
  });
  if (process.env.NODE_ENV !== "production") {
    configureExpoAndLanding(app);
  } else {
    const webDistPath = path.resolve(process.cwd(), "web", "dist");
    const expoDistPath = path.resolve(process.cwd(), "dist");
    const landingTemplatePath = path.resolve(process.cwd(), "server", "templates", "landing-page.html");
    let landingPageTemplate = "";
    if (fs.existsSync(landingTemplatePath)) {
      landingPageTemplate = fs.readFileSync(landingTemplatePath, "utf-8");
      log("Production: Landing page template loaded");
    }
    const appName = getAppName();
    app.use("/assets", express2.static(path.resolve(process.cwd(), "assets")));
    app.use("/logos", express2.static(path.resolve(process.cwd(), "attached_assets/generated_images")));
    app.use(express2.static(path.resolve(process.cwd(), "static-build")));
    if (fs.existsSync(webDistPath)) {
      app.use(express2.static(webDistPath));
    }
    if (fs.existsSync(expoDistPath)) {
      app.use(express2.static(expoDistPath));
    }
    app.get("/api/health", (_req, res) => {
      res.json({
        status: "ok",
        service: "AI Run Coach API",
        version: "2.0.0"
      });
    });
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      if (isBrowserRequest(req)) {
        const webIndexPath = path.resolve(webDistPath, "index.html");
        if (fs.existsSync(webIndexPath)) {
          return res.sendFile(webIndexPath);
        }
        if (landingPageTemplate) {
          return serveLandingPage({ req, res, landingPageTemplate, appName });
        }
      }
      const expoIndexPath = path.resolve(expoDistPath, "index.html");
      if (fs.existsSync(expoIndexPath)) {
        return res.sendFile(expoIndexPath);
      }
      if (landingPageTemplate) {
        return serveLandingPage({ req, res, landingPageTemplate, appName });
      }
      res.status(404).send("AI Run Coach API is running. Download the app to get started.");
    });
  }
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`express server serving on port ${port} (accessible from Android emulator)`);
    startScheduler();
  });
})();

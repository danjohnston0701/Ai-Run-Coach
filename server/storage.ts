import {
  users, friends, friendRequests, runs, routes, goals,
  notifications, notificationPreferences, liveRunSessions,
  groupRuns, groupRunParticipants, events, routeRatings, runAnalyses,
  connectedDevices, deviceData, garminWellnessMetrics, activityMergeLog, garminActivities,
  oauthStateStore, webhookFailureQueue, garminWebhookEvents, passwordResetTokens,
  type User, type InsertUser, type Run, type InsertRun,
  type Route, type InsertRoute, type Goal, type InsertGoal,
  type Friend, type FriendRequest, type Notification, type NotificationPreference,
  type LiveRunSession, type GroupRun, type GroupRunParticipant, type Event,
  type RouteRating, type RunAnalysis, type ConnectedDevice, type DeviceData,
  type GarminWellnessMetric, type OauthStateStore, type GarminWebhookEvent, type PasswordResetToken
} from "@shared/schema";
import { db } from "./db";
import { eq, or, and, desc, asc, ilike, sql, inArray, gte, lte, isNotNull, count, sum, avg, max, min } from "drizzle-orm";

// Aggregated run statistics — computed via SQL, not JavaScript
export interface UserRunStats {
  totalRuns: number;
  totalDistanceKm: number;
  totalDurationSeconds: number;
  avgPaceSecondsPerKm: number | null;  // derived from avg duration / avg distance
  avgHeartRate: number | null;
  avgCadence: number | null;
  bestDistanceKm: number | null;
  bestDurationSeconds: number | null;
}

export interface IStorage {
  // Password reset
  createPasswordResetToken(token: string, userId: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  searchUsers(query: string): Promise<User[]>;
  
  // Friends
  getFriends(userId: string): Promise<User[]>;
  addFriend(userId: string, friendId: string): Promise<Friend>;
  removeFriend(userId: string, friendId: string): Promise<void>;
  
  // Friend Requests
  getFriendRequests(userId: string): Promise<FriendRequest[]>;  // Incoming requests for this user
  getSentFriendRequests(userId: string): Promise<FriendRequest[]>;  // Requests sent by this user
  getRequestBetweenUsers(requesterId: string, addresseeId: string): Promise<FriendRequest | null>;  // Any request from A→B
  createFriendRequest(requesterId: string, addresseeId: string, message?: string): Promise<FriendRequest>;
  upsertFriendRequest(requesterId: string, addresseeId: string, message?: string): Promise<FriendRequest>;  // Create or re-activate declined request
  acceptFriendRequest(id: string): Promise<void>;
  declineFriendRequest(id: string): Promise<void>;
  withdrawFriendRequest(id: string, requesterId: string): Promise<void>;  // Sender withdraws their own request
  
  // Runs
  getRun(id: string): Promise<Run | undefined>;
  getUserRuns(userId: string, options?: { limit?: number; offset?: number }): Promise<Run[]>;
  getRecentUserRuns(userId: string, limit?: number): Promise<Run[]>;
  getUserRunStats(userId: string, options?: { sinceDate?: Date }): Promise<UserRunStats>;
  createRun(run: InsertRun): Promise<Run>;
  updateRun(id: string, data: Partial<Run>): Promise<Run | undefined>;
  deleteRun(id: string): Promise<void>;
  
  // Routes
  getRoute(id: string): Promise<Route | undefined>;
  getUserRoutes(userId: string): Promise<Route[]>;
  createRoute(route: InsertRoute): Promise<Route>;
  updateRoute(id: string, data: Partial<Route>): Promise<Route | undefined>;
  
  // Goals
  getGoal(id: string): Promise<Goal | undefined>;
  getUserGoals(userId: string): Promise<Goal[]>;
  createGoal(goal: InsertGoal): Promise<Goal>;
  updateGoal(id: string, data: Partial<Goal>): Promise<Goal | undefined>;
  deleteGoal(id: string): Promise<void>;
  
  // Notifications
  getUserNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: any): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  
  // Notification Preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreference | undefined>;
  updateNotificationPreferences(userId: string, data: Partial<NotificationPreference>): Promise<NotificationPreference>;
  
  // Live Sessions
  getLiveSession(id: string): Promise<LiveRunSession | undefined>;
  getUserLiveSession(userId: string): Promise<LiveRunSession | undefined>;
  createLiveSession(session: any): Promise<LiveRunSession>;
  updateLiveSession(id: string, data: Partial<LiveRunSession>): Promise<LiveRunSession | undefined>;
  endLiveSession(sessionKey: string): Promise<void>;
  
  // Events
  getEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  
  // Group Runs
  getGroupRuns(): Promise<GroupRun[]>;
  getGroupRun(id: string): Promise<GroupRun | undefined>;
  createGroupRun(groupRun: any): Promise<GroupRun>;
  joinGroupRun(groupRunId: string, userId: string): Promise<GroupRunParticipant>;
  
  // Route Ratings
  getRouteRatings(routeId: string): Promise<RouteRating[]>;
  createRouteRating(rating: any): Promise<RouteRating>;
  
  // Run Analysis
  getRunAnalysis(runId: string): Promise<RunAnalysis | undefined>;
  createRunAnalysis(runId: string, analysis: any): Promise<RunAnalysis>;
  upsertRunAnalysis(runId: string, analysis: any): Promise<RunAnalysis>;
  
  // Connected Devices
  getConnectedDevices(userId: string): Promise<ConnectedDevice[]>;
  getConnectedDevice(id: string): Promise<ConnectedDevice | undefined>;
  getConnectedDeviceByGarminToken(userAccessToken: string): Promise<ConnectedDevice | undefined>;
  getConnectedDevicesByGarminId(garminUserId: string): Promise<ConnectedDevice[]>;
  getConnectedDevicesByType(deviceType: string): Promise<ConnectedDevice[]>;
  createConnectedDevice(data: any): Promise<ConnectedDevice>;
  updateConnectedDevice(id: string, data: Partial<ConnectedDevice>): Promise<ConnectedDevice | undefined>;
  deleteConnectedDevice(id: string): Promise<void>;

  // OAuth State Store
  createOauthState(data: { state: string; userId: string; provider: string; appRedirect?: string; historyDays?: number; nonce?: string; expiresAt: Date }): Promise<OauthStateStore>;
  getOauthState(state: string): Promise<OauthStateStore | undefined>;
  claimOauthState(state: string): Promise<OauthStateStore | undefined>; // atomic DELETE ... RETURNING
  deleteOauthState(state: string): Promise<void>;
  cleanupExpiredOauthStates(): Promise<number>;

  // Garmin Webhook Events
  createGarminWebhookEvent(data: Partial<GarminWebhookEvent>): Promise<GarminWebhookEvent>;
  updateGarminWebhookEvent(id: string, data: Partial<GarminWebhookEvent>): Promise<GarminWebhookEvent | undefined>;
  getGarminWebhookStats(userId: string, days: number): Promise<{
    totalReceived: number;
    totalCreated: number;
    totalMerged: number;
    totalFailed: number;
    totalSkipped: number;
    averageMatchScore: number;
  }>;
  getRecentGarminWebhookEvents(userId: string, limit: number): Promise<GarminWebhookEvent[]>;
  
  // Device Data
  getDeviceDataByRun(runId: string): Promise<DeviceData[]>;
  createDeviceData(data: any): Promise<DeviceData>;
  
  // Garmin Wellness
  getGarminWellnessByDate(userId: string, date: Date): Promise<GarminWellnessMetric | undefined>;
  createGarminWellness(data: any): Promise<GarminWellnessMetric>;
  updateGarminWellness(id: string, data: Partial<GarminWellnessMetric>): Promise<GarminWellnessMetric | undefined>;
  getAllActiveGarminDevices(): Promise<ConnectedDevice[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  /**
   * Permanently delete a user account and ALL associated data from every table.
   *
   * Executes deletions in FK-safe order using raw SQL so it stays resilient
   * to schema migrations — missing tables/columns are skipped gracefully using
   * the same tryCleanup pattern as deleteRun().
   *
   * IMPORTANT: Fetch and use the Garmin access token for deregistration BEFORE
   * calling this function, as the token is deleted as part of this operation.
   */
  async deleteUser(userId: string): Promise<void> {
    console.log(`[Storage] Deleting user ${userId} and all associated data`);

    const tryCleanup = async (label: string, stmt: ReturnType<typeof sql>) => {
      try {
        await db.execute(stmt);
        console.log(`[Storage] Cleaned up: ${label}`);
      } catch (e: any) {
        if (e?.code === '42703' || e?.code === '42P01') {
          console.warn(`[Storage] Skipping ${label} (table/column not in DB): ${e.message}`);
        } else {
          console.error(`[Storage] Error cleaning up ${label}:`, e.message);
          throw e;
        }
      }
    };

    // ── Phase 1: Null out FK references INTO runs we're about to delete ──────
    await tryCleanup('group_run_participants.run_id → user runs',
      sql`UPDATE group_run_participants SET run_id = NULL WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('garmin_move_iq.run_id → user runs',
      sql`UPDATE garmin_move_iq SET run_id = NULL WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('garmin_realtime_data.run_id → user runs',
      sql`UPDATE garmin_realtime_data SET run_id = NULL WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('garmin_companion_sessions.run_id → user runs',
      sql`UPDATE garmin_companion_sessions SET run_id = NULL WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('planned_workouts.completed_run_id → user runs',
      sql`UPDATE planned_workouts SET completed_run_id = NULL WHERE completed_run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('user_achievements.run_id → user runs',
      sql`UPDATE user_achievements SET run_id = NULL WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);

    // ── Phase 2: User's own interactions on other people's content ────────────
    await tryCleanup('comment_likes by user',
      sql`DELETE FROM comment_likes WHERE user_id = ${userId}`);
    await tryCleanup('activity_comments by user',
      sql`DELETE FROM activity_comments WHERE user_id = ${userId}`);
    await tryCleanup('reactions by user',
      sql`DELETE FROM reactions WHERE user_id = ${userId}`);

    // ── Phase 3: Other users' interactions on this user's feed activities ─────
    await tryCleanup('comment_likes on user feed',
      sql`DELETE FROM comment_likes WHERE comment_id IN (
            SELECT id FROM activity_comments WHERE activity_id IN (
              SELECT id FROM feed_activities WHERE user_id = ${userId}
            )
          )`);
    await tryCleanup('activity_comments on user feed',
      sql`DELETE FROM activity_comments WHERE activity_id IN (
            SELECT id FROM feed_activities WHERE user_id = ${userId}
          )`);
    await tryCleanup('reactions on user feed',
      sql`DELETE FROM reactions WHERE activity_id IN (
            SELECT id FROM feed_activities WHERE user_id = ${userId}
          )`);
    await tryCleanup('feed_activities',
      sql`DELETE FROM feed_activities WHERE user_id = ${userId}`);

    // ── Phase 4: Run-linked data ──────────────────────────────────────────────
    await tryCleanup('segment_efforts',
      sql`DELETE FROM segment_efforts WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('shared_runs',
      sql`DELETE FROM shared_runs WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('route_ratings (run-linked)',
      sql`DELETE FROM route_ratings WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('garmin_activities',
      sql`DELETE FROM garmin_activities WHERE user_id = ${userId}`);
    await tryCleanup('activity_merge_log',
      sql`DELETE FROM activity_merge_log WHERE ai_run_coach_run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('run_analyses',
      sql`DELETE FROM run_analyses WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('device_data',
      sql`DELETE FROM device_data WHERE run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('routes (source_run_id)',
      sql`DELETE FROM routes WHERE source_run_id IN (SELECT id FROM runs WHERE user_id = ${userId})`);
    await tryCleanup('runs',
      sql`DELETE FROM runs WHERE user_id = ${userId}`);

    // ── Phase 5: Training plan data ───────────────────────────────────────────
    await tryCleanup('plan_adaptations',
      sql`DELETE FROM plan_adaptations WHERE plan_id IN (SELECT id FROM training_plans WHERE user_id = ${userId})`);
    await tryCleanup('planned_workouts',
      sql`DELETE FROM planned_workouts WHERE plan_id IN (SELECT id FROM training_plans WHERE user_id = ${userId})`);
    await tryCleanup('weekly_plans',
      sql`DELETE FROM weekly_plans WHERE plan_id IN (SELECT id FROM training_plans WHERE user_id = ${userId})`);
    await tryCleanup('training_plans',
      sql`DELETE FROM training_plans WHERE user_id = ${userId}`);

    // ── Phase 6: Social / membership data ────────────────────────────────────
    await tryCleanup('user_achievements',
      sql`DELETE FROM user_achievements WHERE user_id = ${userId}`);
    await tryCleanup('challenge_participants',
      sql`DELETE FROM challenge_participants WHERE user_id = ${userId}`);
    await tryCleanup('club_memberships',
      sql`DELETE FROM club_memberships WHERE user_id = ${userId}`);
    await tryCleanup('group_run_participants (by user)',
      sql`DELETE FROM group_run_participants WHERE user_id = ${userId}`);
    await tryCleanup('group_runs created by user',
      sql`DELETE FROM group_runs WHERE creator_id = ${userId}`);
    await tryCleanup('friends',
      sql`DELETE FROM friends WHERE user_id = ${userId} OR friend_id = ${userId}`);
    await tryCleanup('friend_requests',
      sql`DELETE FROM friend_requests WHERE requester_id = ${userId} OR addressee_id = ${userId}`);
    await tryCleanup('live_run_sessions',
      sql`DELETE FROM live_run_sessions WHERE user_id = ${userId}`);
    await tryCleanup('notifications',
      sql`DELETE FROM notifications WHERE user_id = ${userId}`);
    await tryCleanup('notification_preferences',
      sql`DELETE FROM notification_preferences WHERE user_id = ${userId}`);
    await tryCleanup('goals',
      sql`DELETE FROM goals WHERE user_id = ${userId}`);
    await tryCleanup('routes (user-owned)',
      sql`DELETE FROM routes WHERE user_id = ${userId}`);
    await tryCleanup('daily_fitness',
      sql`DELETE FROM daily_fitness WHERE user_id = ${userId}`);
    await tryCleanup('segment_stars',
      sql`DELETE FROM segment_stars WHERE user_id = ${userId}`);
    await tryCleanup('route_ratings (user-owned)',
      sql`DELETE FROM route_ratings WHERE user_id = ${userId}`);

    // ── Phase 7: Garmin wellness + device data ────────────────────────────────
    await tryCleanup('garmin_wellness_metrics',
      sql`DELETE FROM garmin_wellness_metrics WHERE user_id = ${userId}`);
    await tryCleanup('garmin_skin_temperature',
      sql`DELETE FROM garmin_skin_temperature WHERE user_id = ${userId}`);
    await tryCleanup('garmin_body_composition',
      sql`DELETE FROM garmin_body_composition WHERE user_id = ${userId}`);
    await tryCleanup('garmin_blood_pressure',
      sql`DELETE FROM garmin_blood_pressure WHERE user_id = ${userId}`);
    await tryCleanup('garmin_health_snapshots',
      sql`DELETE FROM garmin_health_snapshots WHERE user_id = ${userId}`);
    await tryCleanup('garmin_epochs_raw',
      sql`DELETE FROM garmin_epochs_raw WHERE user_id = ${userId}`);
    await tryCleanup('garmin_epochs_aggregate',
      sql`DELETE FROM garmin_epochs_aggregate WHERE user_id = ${userId}`);
    await tryCleanup('garmin_realtime_data',
      sql`DELETE FROM garmin_realtime_data WHERE user_id = ${userId}`);
    await tryCleanup('garmin_move_iq',
      sql`DELETE FROM garmin_move_iq WHERE user_id = ${userId}`);
    await tryCleanup('garmin_companion_sessions',
      sql`DELETE FROM garmin_companion_sessions WHERE user_id = ${userId}`);
    await tryCleanup('connected_devices',
      sql`DELETE FROM connected_devices WHERE user_id = ${userId}`);

    // ── Phase 8: Auth / session tokens ───────────────────────────────────────
    await tryCleanup('password_reset_tokens',
      sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`);
    await tryCleanup('oauth_state_store',
      sql`DELETE FROM oauth_state_store WHERE user_id = ${userId}`);
    await tryCleanup('webhook_failure_queue',
      sql`DELETE FROM webhook_failure_queue WHERE user_id = ${userId}`);

    // ── Phase 9: user_stats (has cascade FK but be explicit) ─────────────────
    await tryCleanup('user_stats',
      sql`DELETE FROM user_stats WHERE user_id = ${userId}`);

    // ── Phase 10: Delete the user row itself ──────────────────────────────────
    try {
      await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
      console.log(`[Storage] Successfully deleted user ${userId} and all associated data`);
    } catch (e) {
      console.error(`[Storage] Error deleting user ${userId}:`, e);
      throw new Error(`Failed to delete user: ${e}`);
    }
  }

  async searchUsers(query: string): Promise<User[]> {
    try {
      console.log(`[DB Search] Querying users table for: "${query}"`);
      const results = await db.select().from(users).where(
        or(
          ilike(users.name, `%${query}%`),
          ilike(users.email, `%${query}%`),
          ilike(users.userCode, `%${query}%`),
          ilike(users.shortUserId, `%${query}%`)
        )
      ).limit(20);
      console.log(`[DB Search] Query returned ${results.length} results`);
      if (results.length > 0) {
        console.log(`[DB Search] First result:`, { id: results[0].id, name: results[0].name, email: results[0].email });
      }
      return results;
    } catch (error) {
      console.error(`[DB Search] Error querying users:`, error);
      return [];
    }
  }

  // Friends
  async getFriends(userId: string): Promise<User[]> {
    const friendships = await db.select().from(friends).where(
      and(
        or(eq(friends.userId, userId), eq(friends.friendId, userId)),
        eq(friends.status, "accepted")
      )
    );
    
    const friendIds = friendships.map(f => f.userId === userId ? f.friendId : f.userId);
    if (friendIds.length === 0) return [];
    
    const friendUsers = await db.select().from(users).where(
      inArray(users.id, friendIds)
    );
    return friendUsers;
  }

  async addFriend(userId: string, friendId: string): Promise<Friend> {
    const [friend] = await db.insert(friends).values({
      userId,
      friendId,
      status: "accepted"
    }).returning();
    return friend;
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    await db.delete(friends).where(
      or(
        and(eq(friends.userId, userId), eq(friends.friendId, friendId)),
        and(eq(friends.userId, friendId), eq(friends.friendId, userId))
      )
    );
  }

  // Friend Requests
  async getFriendRequests(userId: string): Promise<FriendRequest[]> {
    // Get incoming requests (where this user is the addressee)
    try {
      console.log(`[DB] getFriendRequests for userId: ${userId}`);
      const results = await db.select().from(friendRequests).where(
        and(
          eq(friendRequests.addresseeId, userId),
          eq(friendRequests.status, "pending")
        )
      );
      console.log(`[DB] getFriendRequests returned ${results.length} results`);
      return results;
    } catch (error) {
      console.error(`[DB] getFriendRequests error:`, error);
      return [];
    }
  }

  async getSentFriendRequests(userId: string): Promise<FriendRequest[]> {
    // Get ALL sent requests (where this user is the requester) regardless of status
    // Filtering by "pending" is done in the route layer
    try {
      console.log(`[DB] getSentFriendRequests for userId: ${userId}`);
      const results = await db.select().from(friendRequests).where(
        eq(friendRequests.requesterId, userId)
      );
      console.log(`[DB] getSentFriendRequests returned ${results.length} results (all statuses)`);
      return results;
    } catch (error) {
      console.error(`[DB] getSentFriendRequests error:`, error);
      return [];
    }
  }

  async getRequestBetweenUsers(requesterId: string, addresseeId: string): Promise<FriendRequest | null> {
    // Order by createdAt DESC so we always get the MOST RECENT request.
    // Multiple rows can exist (old declined/withdrawn + new pending) — we always want the latest.
    const [request] = await db.select().from(friendRequests).where(
      and(
        eq(friendRequests.requesterId, requesterId),
        eq(friendRequests.addresseeId, addresseeId)
      )
    ).orderBy(desc(friendRequests.createdAt));
    return request ?? null;
  }

  async createFriendRequest(requesterId: string, addresseeId: string, message?: string): Promise<FriendRequest> {
    const [request] = await db.insert(friendRequests).values({
      requesterId,
      addresseeId,
      message,
      status: "pending"
    }).returning();
    return request;
  }

  async upsertFriendRequest(requesterId: string, addresseeId: string, message?: string): Promise<FriendRequest> {
    // Get the MOST RECENT request between these users (there may be multiple old ones)
    const [existing] = await db.select().from(friendRequests).where(
      and(
        eq(friendRequests.requesterId, requesterId),
        eq(friendRequests.addresseeId, addresseeId)
      )
    ).orderBy(desc(friendRequests.createdAt));
    if (existing) {
      // Re-activate the most recent request back to pending (e.g. was declined/withdrawn)
      const [updated] = await db.update(friendRequests)
        .set({ status: "pending", respondedAt: null, message: message ?? existing.message })
        .where(eq(friendRequests.id, existing.id))
        .returning();
      return updated;
    }
    // No existing request — create a new one
    const [request] = await db.insert(friendRequests).values({
      requesterId,
      addresseeId,
      message,
      status: "pending"
    }).returning();
    return request;
  }

  async withdrawFriendRequest(id: string, requesterId: string): Promise<void> {
    // Only the original requester can withdraw
    await db.update(friendRequests)
      .set({ status: "withdrawn", respondedAt: new Date() })
      .where(and(eq(friendRequests.id, id), eq(friendRequests.requesterId, requesterId)));
  }

  async acceptFriendRequest(id: string): Promise<void> {
    const [request] = await db.select().from(friendRequests).where(eq(friendRequests.id, id));
    if (!request) return;
    
    await db.update(friendRequests).set({ 
      status: "accepted",
      respondedAt: new Date()
    }).where(eq(friendRequests.id, id));
    
    await this.addFriend(request.requesterId, request.addresseeId);
  }

  async declineFriendRequest(id: string): Promise<void> {
    await db.update(friendRequests).set({ 
      status: "declined",
      respondedAt: new Date()
    }).where(eq(friendRequests.id, id));
  }

  // Runs
  async getRun(id: string): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    return run || undefined;
  }

  async getUserRuns(userId: string, options?: { limit?: number; offset?: number }): Promise<Run[]> {
    const query = db.select().from(runs)
      .where(eq(runs.userId, userId))
      .orderBy(desc(runs.completedAt));
    if (options?.limit) {
      return query.limit(options.limit).offset(options.offset ?? 0);
    }
    return query;
  }

  /**
   * Fetch only the N most recent runs for a user — safe for dashboard/summary cards.
   * Avoids loading the entire run history when only recent runs are needed.
   */
  async getRecentUserRuns(userId: string, limit: number = 20): Promise<Run[]> {
    return db.select().from(runs)
      .where(eq(runs.userId, userId))
      .orderBy(desc(runs.completedAt))
      .limit(limit);
  }

  /**
   * Compute run statistics using SQL aggregation — avoids loading all rows into Node.js memory.
   * At 500 runs this is ~500x more efficient than fetching all runs and computing in JS.
   */
  async getUserRunStats(userId: string, options?: { sinceDate?: Date }): Promise<UserRunStats> {
    const conditions = options?.sinceDate
      ? and(eq(runs.userId, userId), gte(runs.completedAt, options.sinceDate))
      : eq(runs.userId, userId);

    const [stats] = await db.select({
      totalRuns: count(),
      totalDistanceKm: sum(runs.distance),
      totalDurationSeconds: sum(runs.duration),
      avgHeartRate: avg(runs.avgHeartRate),
      avgCadence: avg(runs.cadence),
      bestDistanceKm: max(runs.distance),
      bestDurationSeconds: min(runs.duration),
    }).from(runs).where(conditions);

    const totalDist = Number(stats.totalDistanceKm ?? 0);
    const totalDur = Number(stats.totalDurationSeconds ?? 0);
    const avgPace = (totalDist > 0 && totalDur > 0)
      ? Math.round((totalDur / totalDist))
      : null;

    return {
      totalRuns: Number(stats.totalRuns ?? 0),
      totalDistanceKm: Math.round(totalDist * 10) / 10,
      totalDurationSeconds: totalDur,
      avgPaceSecondsPerKm: avgPace,
      avgHeartRate: stats.avgHeartRate ? Math.round(Number(stats.avgHeartRate)) : null,
      avgCadence: stats.avgCadence ? Math.round(Number(stats.avgCadence)) : null,
      bestDistanceKm: stats.bestDistanceKm ? Math.round(Number(stats.bestDistanceKm) * 10) / 10 : null,
      bestDurationSeconds: stats.bestDurationSeconds ? Number(stats.bestDurationSeconds) : null,
    };
  }

  async createRun(run: InsertRun): Promise<Run> {
    console.log('[createRun] Input fields:', Object.keys(run as any).join(', '));
    const r = run as any;
    console.log(`[createRun] Target values → targetDistance: ${r.targetDistance}, targetTime: ${r.targetTime}, wasTargetAchieved: ${r.wasTargetAchieved}`);
    const dateFieldsBeforeConversion = Object.entries(run as any)
      .filter(([_, v]) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v as string))
      .map(([k]) => k);
    if (dateFieldsBeforeConversion.length > 0) {
      console.log('[createRun] String date fields found:', dateFieldsBeforeConversion.join(', '));
    }
    const sanitized = this.convertDateFields(run);
    const [newRun] = await db.insert(runs).values(sanitized).returning();
    return newRun;
  }

  async updateRun(id: string, data: Partial<Run>): Promise<Run | undefined> {
    const sanitized = this.convertDateFields(data);
    const [run] = await db.update(runs).set(sanitized).where(eq(runs.id, id)).returning();
    return run || undefined;
  }

  async deleteRun(id: string): Promise<void> {
    console.log(`[Storage] Deleting run ${id} and all related records`);

    // Helper: run a cleanup statement but skip gracefully if the table/column
    // doesn't exist yet in this database (schema migration not yet applied).
    const tryCleanup = async (label: string, stmt: ReturnType<typeof sql>) => {
      try {
        await db.execute(stmt);
      } catch (e: any) {
        // 42703 = undefined_column, 42P01 = undefined_table — skip gracefully
        if (e?.code === '42703' || e?.code === '42P01') {
          console.warn(`[Storage] Skipping cleanup of ${label} (table/column not in DB): ${e.message}`);
        } else {
          throw e;
        }
      }
    };

    // Nullable FK refs: null them out to preserve the parent rows
    await tryCleanup('group_run_participants.run_id',      sql`UPDATE group_run_participants    SET run_id = NULL           WHERE run_id = ${id}`);
    await tryCleanup('garmin_move_iq.run_id',              sql`UPDATE garmin_move_iq            SET run_id = NULL           WHERE run_id = ${id}`);
    await tryCleanup('garmin_realtime_data.run_id',        sql`UPDATE garmin_realtime_data      SET run_id = NULL           WHERE run_id = ${id}`);
    await tryCleanup('garmin_companion_sessions.run_id',   sql`UPDATE garmin_companion_sessions SET run_id = NULL           WHERE run_id = ${id}`);
    await tryCleanup('feed_activities.run_id',             sql`UPDATE feed_activities           SET run_id = NULL           WHERE run_id = ${id}`);
    await tryCleanup('user_achievements.run_id',           sql`UPDATE user_achievements         SET run_id = NULL           WHERE run_id = ${id}`);
    await tryCleanup('planned_workouts.completed_run_id',  sql`UPDATE planned_workouts          SET completed_run_id = NULL WHERE completed_run_id = ${id}`);

    // Hard deletes for rows that exist solely to describe this run
    await tryCleanup('segment_efforts',    sql`DELETE FROM segment_efforts    WHERE run_id = ${id}`);
    await tryCleanup('shared_runs',        sql`DELETE FROM shared_runs        WHERE run_id = ${id}`);
    await tryCleanup('route_ratings',      sql`DELETE FROM route_ratings      WHERE run_id = ${id}`);
    await tryCleanup('garmin_activities',  sql`DELETE FROM garmin_activities  WHERE run_id = ${id}`);
    await tryCleanup('activity_merge_log', sql`DELETE FROM activity_merge_log WHERE ai_run_coach_run_id = ${id}`);
    await tryCleanup('run_analyses',       sql`DELETE FROM run_analyses       WHERE run_id = ${id}`);
    await tryCleanup('device_data',        sql`DELETE FROM device_data        WHERE run_id = ${id}`);
    await tryCleanup('routes',             sql`DELETE FROM routes             WHERE source_run_id = ${id}`);

    // Finally delete the run itself — this one must succeed
    try {
      await db.execute(sql`DELETE FROM runs WHERE id = ${id}`);
      console.log(`[Storage] Successfully deleted run ${id}`);
    } catch (e) {
      console.error(`[Storage] Error deleting run ${id}:`, e);
      throw new Error(`Failed to delete run: ${e}`);
    }
  }

  private convertDateFields(data: Record<string, any>): Record<string, any> {
    const result = { ...data };
    for (const key of Object.keys(result)) {
      const val = result[key];
      if (val === null || val === undefined || val instanceof Date) continue;
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
        console.log(`[convertDateFields] Converting string to Date for key: ${key}`);
        result[key] = new Date(val);
      }
    }
    return result;
  }

  // Routes
  async getRoute(id: string): Promise<Route | undefined> {
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    return route || undefined;
  }

  async getUserRoutes(userId: string): Promise<Route[]> {
    return db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt));
  }

  async createRoute(route: InsertRoute): Promise<Route> {
    const [newRoute] = await db.insert(routes).values(route).returning();
    return newRoute;
  }

  async updateRoute(id: string, data: Partial<Route>): Promise<Route | undefined> {
    const [route] = await db.update(routes).set(data).where(eq(routes.id, id)).returning();
    return route || undefined;
  }

  // Goals
  async getGoal(id: string): Promise<Goal | undefined> {
    const [goal] = await db.select().from(goals).where(eq(goals.id, id));
    return goal || undefined;
  }

  async getUserGoals(userId: string): Promise<Goal[]> {
    return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.createdAt));
  }

  async createGoal(goal: InsertGoal): Promise<Goal> {
    const [newGoal] = await db.insert(goals).values(goal).returning();
    return newGoal;
  }

  async updateGoal(id: string, data: Partial<Goal>): Promise<Goal | undefined> {
    const [goal] = await db.update(goals).set({ ...data, updatedAt: new Date() }).where(eq(goals.id, id)).returning();
    return goal || undefined;
  }

  async deleteGoal(id: string): Promise<void> {
    await db.delete(goals).where(eq(goals.id, id));
  }

  // Notifications
  async getUserNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: any): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  // Notification Preferences
  async getNotificationPreferences(userId: string): Promise<NotificationPreference | undefined> {
    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    return prefs || undefined;
  }

  async updateNotificationPreferences(userId: string, data: Partial<NotificationPreference>): Promise<NotificationPreference> {
    const existing = await this.getNotificationPreferences(userId);
    if (existing) {
      const [updated] = await db.update(notificationPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(notificationPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(notificationPreferences)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  // Live Sessions
  async getLiveSession(id: string): Promise<LiveRunSession | undefined> {
    const [session] = await db.select().from(liveRunSessions).where(eq(liveRunSessions.id, id));
    return session || undefined;
  }

  async getUserLiveSession(userId: string): Promise<LiveRunSession | undefined> {
    const [session] = await db.select().from(liveRunSessions).where(
      and(eq(liveRunSessions.userId, userId), eq(liveRunSessions.isActive, true))
    );
    return session || undefined;
  }

  async createLiveSession(session: any): Promise<LiveRunSession> {
    const [newSession] = await db.insert(liveRunSessions).values(session).returning();
    return newSession;
  }

  async updateLiveSession(id: string, data: Partial<LiveRunSession>): Promise<LiveRunSession | undefined> {
    const [session] = await db.update(liveRunSessions)
      .set({ ...data, lastSyncedAt: new Date() })
      .where(eq(liveRunSessions.id, id))
      .returning();
    return session || undefined;
  }

  async endLiveSession(sessionKey: string): Promise<void> {
    await db.update(liveRunSessions)
      .set({ isActive: false })
      .where(eq(liveRunSessions.sessionKey, sessionKey));
  }

  // Events
  async getEvents(): Promise<Event[]> {
    return db.select().from(events).where(eq(events.isActive, true));
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event || undefined;
  }

  // Group Runs
  async getGroupRuns(): Promise<GroupRun[]> {
    return db.select().from(groupRuns).orderBy(desc(groupRuns.createdAt));
  }

  async getGroupRun(id: string): Promise<GroupRun | undefined> {
    const [groupRun] = await db.select().from(groupRuns).where(eq(groupRuns.id, id));
    return groupRun || undefined;
  }

  async createGroupRun(groupRun: any): Promise<GroupRun> {
    const [newGroupRun] = await db.insert(groupRuns).values(groupRun).returning();
    return newGroupRun;
  }

  async joinGroupRun(groupRunId: string, userId: string): Promise<GroupRunParticipant> {
    const [participant] = await db.insert(groupRunParticipants).values({
      groupRunId,
      userId,
      role: "participant",
      invitationStatus: "accepted",
      joinedAt: new Date()
    }).returning();
    return participant;
  }

  // Route Ratings
  async getRouteRatings(routeId: string): Promise<RouteRating[]> {
    const route = await this.getRoute(routeId);
    if (!route) return [];
    return db.select().from(routeRatings).where(eq(routeRatings.startLat, route.startLat));
  }

  async createRouteRating(rating: any): Promise<RouteRating> {
    const [newRating] = await db.insert(routeRatings).values(rating).returning();
    return newRating;
  }

  // Run Analysis
  async getRunAnalysis(runId: string): Promise<RunAnalysis | undefined> {
    try {
      const [analysis] = await db.select().from(runAnalyses).where(eq(runAnalyses.runId, runId));
      return analysis || undefined;
    } catch (error: any) {
      // Fallback for older DBs without run_analyses.analysis column
      const msg = String(error?.message || "");
      if (error?.code === "42703" || msg.includes("run_analyses") || msg.includes("analysis")) {
        const [run] = await db.select().from(runs).where(eq(runs.id, runId));
        if (!run?.aiInsights) return undefined;
        try {
          const parsed = typeof run.aiInsights === "string" ? JSON.parse(run.aiInsights) : run.aiInsights;
          return {
            id: "legacy",
            runId,
            analysis: parsed,
            createdAt: new Date()
          } as RunAnalysis;
        } catch {
          return undefined;
        }
      }
      throw error;
    }
  }

  async createRunAnalysis(runId: string, analysis: any): Promise<RunAnalysis> {
    try {
      const [newAnalysis] = await db.insert(runAnalyses).values({ runId, analysis }).returning();
      return newAnalysis;
    } catch (error: any) {
      // Fallback: persist analysis JSON into runs.aiInsights for legacy DBs
      const msg = String(error?.message || "");
      if (error?.code === "42703" || msg.includes("run_analyses") || msg.includes("analysis")) {
        await db.update(runs)
          .set({ aiInsights: JSON.stringify(analysis) })
          .where(eq(runs.id, runId));
        return {
          id: "legacy",
          runId,
          analysis,
          createdAt: new Date()
        } as RunAnalysis;
      }
      throw error;
    }
  }

  async upsertRunAnalysis(runId: string, analysis: any): Promise<RunAnalysis> {
    try {
      // Check if analysis already exists for this run
      const existing = await this.getRunAnalysis(runId);
      if (existing && existing.id !== "legacy") {
        // Update existing record
        const [updated] = await db.update(runAnalyses)
          .set({ analysis })
          .where(eq(runAnalyses.runId, runId))
          .returning();
        return updated;
      }
      // Create new record
      const [newAnalysis] = await db.insert(runAnalyses).values({ runId, analysis }).returning();
      return newAnalysis;
    } catch (error: any) {
      // Fallback: persist analysis JSON into runs.aiInsights for legacy DBs
      const msg = String(error?.message || "");
      if (error?.code === "42703" || msg.includes("run_analyses") || msg.includes("analysis")) {
        await db.update(runs)
          .set({ aiInsights: JSON.stringify(analysis) })
          .where(eq(runs.id, runId));
        return {
          id: "legacy",
          runId,
          analysis,
          createdAt: new Date()
        } as RunAnalysis;
      }
      throw error;
    }
  }

  // Connected Devices
  async getConnectedDevices(userId: string): Promise<ConnectedDevice[]> {
    // Only return active devices — inactive (disconnected) records are never needed by the app
    return db.select().from(connectedDevices).where(
      and(eq(connectedDevices.userId, userId), eq(connectedDevices.isActive, true))
    );
  }

  async getConnectedDevice(id: string): Promise<ConnectedDevice | undefined> {
    const [device] = await db.select().from(connectedDevices).where(eq(connectedDevices.id, id));
    return device || undefined;
  }

  async getConnectedDeviceByGarminToken(userAccessToken: string): Promise<ConnectedDevice | undefined> {
    const [device] = await db.select().from(connectedDevices).where(
      and(
        eq(connectedDevices.accessToken, userAccessToken),
        eq(connectedDevices.isActive, true)
      )
    );
    return device || undefined;
  }

  async getConnectedDevicesByGarminId(garminUserId: string): Promise<ConnectedDevice[]> {
    return db.select().from(connectedDevices).where(
      and(
        eq(connectedDevices.deviceId, garminUserId),
        eq(connectedDevices.isActive, true)
      )
    );
  }

  async getConnectedDevicesByType(deviceType: string): Promise<ConnectedDevice[]> {
    return db.select().from(connectedDevices).where(
      and(eq(connectedDevices.deviceType, deviceType), eq(connectedDevices.isActive, true))
    );
  }

  async createConnectedDevice(data: any): Promise<ConnectedDevice> {
    const [device] = await db.insert(connectedDevices).values(data).returning();
    return device;
  }

  async updateConnectedDevice(id: string, data: Partial<ConnectedDevice>): Promise<ConnectedDevice | undefined> {
    const [device] = await db.update(connectedDevices).set(data).where(eq(connectedDevices.id, id)).returning();
    return device || undefined;
  }

  async deleteConnectedDevice(id: string): Promise<void> {
    await db.update(connectedDevices).set({ isActive: false }).where(eq(connectedDevices.id, id));
  }

  // Device Data
  async getDeviceDataByRun(runId: string): Promise<DeviceData[]> {
    return db.select().from(deviceData).where(eq(deviceData.runId, runId));
  }

  async createDeviceData(data: any): Promise<DeviceData> {
    const [deviceDataRow] = await db.insert(deviceData).values(data).returning();
    return deviceDataRow;
  }

  // Garmin Wellness
  async getGarminWellnessByDate(userId: string, date: Date): Promise<GarminWellnessMetric | undefined> {
    const dateStr = date.toISOString().split('T')[0];
    const [wellness] = await db.select().from(garminWellnessMetrics)
      .where(and(
        eq(garminWellnessMetrics.userId, userId),
        sql`DATE(${garminWellnessMetrics.date}) = ${dateStr}`
      ));
    return wellness || undefined;
  }

  async createGarminWellness(data: any): Promise<GarminWellnessMetric> {
    const [wellness] = await db.insert(garminWellnessMetrics).values(data).returning();
    return wellness;
  }

  async updateGarminWellness(id: string, data: Partial<GarminWellnessMetric>): Promise<GarminWellnessMetric | undefined> {
    const [wellness] = await db.update(garminWellnessMetrics).set(data).where(eq(garminWellnessMetrics.id, id)).returning();
    return wellness || undefined;
  }

  async getAllActiveGarminDevices(): Promise<ConnectedDevice[]> {
    return db.select().from(connectedDevices)
      .where(and(
        eq(connectedDevices.deviceType, 'garmin'),
        eq(connectedDevices.isActive, true)
      ));
  }

  // OAuth State Store
  async createOauthState(data: { state: string; userId: string; provider: string; appRedirect?: string; historyDays?: number; nonce?: string; expiresAt: Date }): Promise<OauthStateStore> {
    const [oauthState] = await db.insert(oauthStateStore).values(data).returning();
    return oauthState;
  }

  async getOauthState(state: string): Promise<OauthStateStore | undefined> {
    const [result] = await db.select().from(oauthStateStore)
      .where(eq(oauthStateStore.state, state));
    return result || undefined;
  }

  /** Atomically delete and return the OAuth state record.
   *  If two concurrent requests race, only ONE will get the record back — the other gets undefined.
   *  Use this instead of getOauthState + deleteOauthState to prevent double-callback races. */
  async claimOauthState(state: string): Promise<OauthStateStore | undefined> {
    const [result] = await db.delete(oauthStateStore)
      .where(eq(oauthStateStore.state, state))
      .returning();
    return result || undefined;
  }

  async deleteOauthState(state: string): Promise<void> {
    await db.delete(oauthStateStore).where(eq(oauthStateStore.state, state));
  }

  async cleanupExpiredOauthStates(): Promise<number> {
    const result = await db.delete(oauthStateStore)
      .where(sql`${oauthStateStore.expiresAt} < NOW()`)
      .returning({ id: oauthStateStore.id });
    return result.length;
  }

  // Garmin Webhook Events
  async createGarminWebhookEvent(data: Partial<GarminWebhookEvent>): Promise<GarminWebhookEvent> {
    const [event] = await db.insert(garminWebhookEvents).values(data).returning();
    return event;
  }

  async updateGarminWebhookEvent(id: string, data: Partial<GarminWebhookEvent>): Promise<GarminWebhookEvent | undefined> {
    const [event] = await db.update(garminWebhookEvents).set({ ...data, updatedAt: new Date() }).where(eq(garminWebhookEvents.id, id)).returning();
    return event || undefined;
  }

  async getGarminWebhookStats(userId: string, days: number): Promise<{
    totalReceived: number;
    totalCreated: number;
    totalMerged: number;
    totalFailed: number;
    totalSkipped: number;
    averageMatchScore: number;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await db.select().from(garminWebhookEvents)
      .where(and(
        eq(garminWebhookEvents.userId, userId),
        sql`${garminWebhookEvents.createdAt} >= ${since}`
      ));

    const totalReceived = events.length;
    const totalCreated = events.filter(e => e.status === 'created_run').length;
    const totalMerged = events.filter(e => e.status === 'merged_run').length;
    const totalFailed = events.filter(e => e.status === 'failed').length;
    const totalSkipped = events.filter(e => e.status === 'skipped').length;

    const scores = events.filter(e => e.matchScore !== null).map(e => e.matchScore || 0);
    const averageMatchScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return { totalReceived, totalCreated, totalMerged, totalFailed, totalSkipped, averageMatchScore };
  }

  async getRecentGarminWebhookEvents(userId: string, limit: number): Promise<GarminWebhookEvent[]> {
    return db.select().from(garminWebhookEvents)
      .where(eq(garminWebhookEvents.userId, userId))
      .orderBy(desc(garminWebhookEvents.createdAt))
      .limit(limit);
  }

  // Password Reset Tokens
  async createPasswordResetToken(token: string, userId: string, expiresAt: Date): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.insert(passwordResetTokens).values({ token, userId, expiresAt });
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return row || undefined;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  }
}

export const storage = new DatabaseStorage();
export type { ConnectedDevice };

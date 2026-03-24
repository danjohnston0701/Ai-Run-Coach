import {
  users, friends, friendRequests, runs, routes, goals,
  notifications, notificationPreferences, liveRunSessions,
  groupRuns, groupRunParticipants, events, routeRatings, runAnalyses,
  connectedDevices, deviceData, garminWellnessMetrics, activityMergeLog,
  oauthStateStore, webhookFailureQueue, garminWebhookEvents,
  type User, type InsertUser, type Run, type InsertRun,
  type Route, type InsertRoute, type Goal, type InsertGoal,
  type Friend, type FriendRequest, type Notification, type NotificationPreference,
  type LiveRunSession, type GroupRun, type GroupRunParticipant, type Event,
  type RouteRating, type RunAnalysis, type ConnectedDevice, type DeviceData,
  type GarminWellnessMetric, type OauthStateStore, type GarminWebhookEvent
} from "@shared/schema";
import { db } from "./db";
import { eq, or, and, desc, ilike, sql, inArray } from "drizzle-orm";

export interface IStorage {
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
  createFriendRequest(requesterId: string, addresseeId: string, message?: string): Promise<FriendRequest>;
  upsertFriendRequest(requesterId: string, addresseeId: string, message?: string): Promise<FriendRequest>;  // Create or re-activate declined request
  acceptFriendRequest(id: string): Promise<void>;
  declineFriendRequest(id: string): Promise<void>;
  withdrawFriendRequest(id: string, requesterId: string): Promise<void>;  // Sender withdraws their own request
  
  // Runs
  getRun(id: string): Promise<Run | undefined>;
  getUserRuns(userId: string): Promise<Run[]>;
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

  async searchUsers(query: string): Promise<User[]> {
    return db.select().from(users).where(
      or(
        ilike(users.name, `%${query}%`),
        ilike(users.email, `%${query}%`),
        ilike(users.userCode, `%${query}%`),
        ilike(users.shortUserId, `%${query}%`)
      )
    ).limit(20);
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
    return db.select().from(friendRequests).where(
      and(
        eq(friendRequests.addresseeId, userId),
        eq(friendRequests.status, "pending")
      )
    );
  }

  async getSentFriendRequests(userId: string): Promise<FriendRequest[]> {
    // Get sent requests (where this user is the requester)
    return db.select().from(friendRequests).where(
      and(
        eq(friendRequests.requesterId, userId),
        eq(friendRequests.status, "pending")
      )
    );
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
    // Check if a request already exists between these users (in either direction)
    const [existing] = await db.select().from(friendRequests).where(
      and(
        eq(friendRequests.requesterId, requesterId),
        eq(friendRequests.addresseeId, addresseeId)
      )
    );
    if (existing) {
      // Re-activate the existing request back to pending (e.g. was declined/withdrawn)
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

  async getUserRuns(userId: string): Promise<Run[]> {
    return db.select().from(runs).where(eq(runs.userId, userId)).orderBy(desc(runs.completedAt));
  }

  async createRun(run: InsertRun): Promise<Run> {
    console.log('[createRun] Input fields:', Object.keys(run as any).join(', '));
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
    // Delete related records before deleting the run itself (due to foreign key constraints)
    // Delete in order of dependencies
    
    try {
      // Delete route data  
      await db.delete(routes).where(eq(routes.runId, id));
    } catch (e) {
      console.error("Error deleting routes:", e);
    }
    
    try {
      // Delete device data
      await db.delete(deviceData).where(eq(deviceData.runId, id));
    } catch (e) {
      console.error("Error deleting device data:", e);
    }
    
    try {
      // Delete run analyses
      await db.delete(runAnalyses).where(eq(runAnalyses.runId, id));
    } catch (e) {
      console.error("Error deleting run analyses:", e);
    }
    
    try {
      // Delete activity merge logs
      await db.delete(activityMergeLog).where(eq(activityMergeLog.aiRunCoachRunId, id));
    } catch (e) {
      console.error("Error deleting activity merge logs:", e);
    }
    
    try {
      // Finally delete the run itself
      const result = await db.delete(runs).where(eq(runs.id, id));
      console.log(`[Storage] Successfully deleted run ${id}`);
    } catch (e) {
      console.error("Error deleting run:", e);
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
    return db.select().from(connectedDevices).where(eq(connectedDevices.userId, userId));
  }

  async getConnectedDevice(id: string): Promise<ConnectedDevice | undefined> {
    const [device] = await db.select().from(connectedDevices).where(eq(connectedDevices.id, id));
    return device || undefined;
  }

  async getConnectedDeviceByGarminToken(userAccessToken: string): Promise<ConnectedDevice | undefined> {
    const [device] = await db.select().from(connectedDevices).where(
      eq(connectedDevices.garminUserAccessToken, userAccessToken)
    );
    return device || undefined;
  }

  async getConnectedDevicesByGarminId(garminUserId: string): Promise<ConnectedDevice[]> {
    return db.select().from(connectedDevices).where(
      eq(connectedDevices.deviceId, garminUserId)
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
}

export const storage = new DatabaseStorage();
export type { ConnectedDevice };

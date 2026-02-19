import { eq, and, desc, or, sql } from "drizzle-orm";
import { randomInt } from "crypto";
import { db, withRetry } from "./db";
import {
  users, preRegistrations, friends, routes, runs, liveRunSessions, garminData,
  friendRequests, pushSubscriptions, notificationPreferences, notifications, routeRatings,
  aiCoachDescription, aiCoachInstructions, aiCoachKnowledge, aiCoachFaq,
  couponCodes, userCoupons, groupRuns, groupRunParticipants, goals, runAnalyses,
  aiCoachingLogs, runWeaknessEvents, events,
  type User, type InsertUser,
  type PreRegistration, type InsertPreRegistration,
  type Friend, type InsertFriend,
  type Route, type InsertRoute,
  type Run, type InsertRun,
  type LiveRunSession, type InsertLiveRunSession,
  type GarminData, type InsertGarminData,
  type FriendRequest, type InsertFriendRequest,
  type PushSubscription, type InsertPushSubscription,
  type NotificationPreferences, type InsertNotificationPreferences,
  type Notification, type InsertNotification,
  type RouteRating, type InsertRouteRating,
  type AiCoachDescription, type InsertAiCoachDescription,
  type AiCoachInstruction, type InsertAiCoachInstruction,
  type AiCoachKnowledge, type InsertAiCoachKnowledge,
  type AiCoachFaq, type InsertAiCoachFaq,
  type CouponCode, type InsertCouponCode,
  type UserCoupon, type InsertUserCoupon,
  type GroupRun, type InsertGroupRun,
  type GroupRunParticipant, type InsertGroupRunParticipant,
  type Goal, type InsertGoal,
  type RunAnalysis, type InsertRunAnalysis,
  type AiCoachingLog, type InsertAiCoachingLog,
  type RunWeaknessEvent, type InsertRunWeaknessEvent,
  type Event, type InsertEvent,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  searchUsers(query: string): Promise<Array<{ id: string; name: string; userCode: string | null }>>;
  getAllUsersForAdmin(): Promise<Array<{ id: string; email: string; name: string; isAdmin: boolean; createdAt: Date | null }>>;

  createPreRegistration(data: InsertPreRegistration): Promise<PreRegistration>;
  getPreRegistrations(): Promise<PreRegistration[]>;

  getFriends(userId: string): Promise<Friend[]>;
  addFriend(data: InsertFriend): Promise<Friend>;
  removeFriend(userId: string, friendId: string): Promise<void>;
  areFriends(userId1: string, userId2: string): Promise<boolean>;

  createRoute(data: InsertRoute): Promise<Route>;
  getRoute(id: string): Promise<Route | undefined>;
  updateRoute(id: string, data: Partial<InsertRoute>): Promise<Route | undefined>;
  getUserRoutes(userId: string): Promise<Route[]>;
  getRecentRoutes(limit?: number, userId?: string): Promise<Route[]>;
  getAllRoutes(filters?: { difficulty?: string; userId?: string }): Promise<Route[]>;
  toggleRouteFavorite(id: string): Promise<Route | undefined>;
  getFavoriteRoutes(userId?: string): Promise<Route[]>;
  getRoutesByLocation(startLat: number, startLng: number, radiusKm?: number): Promise<Route[]>;
  markRouteStarted(id: string): Promise<Route | undefined>;

  createRun(data: InsertRun): Promise<Run>;
  getRun(id: string): Promise<Run | undefined>;
  getUserRuns(userId: string): Promise<Run[]>;
  getUserRunsByRoute(userId: string, routeId: string, limit?: number): Promise<Run[]>;
  updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined>;

  createLiveSession(data: InsertLiveRunSession): Promise<LiveRunSession>;
  getLiveSession(id: string): Promise<LiveRunSession | undefined>;
  getActiveLiveSession(userId: string): Promise<LiveRunSession | undefined>;
  getLiveSessionByKey(sessionKey: string, userId: string): Promise<LiveRunSession | undefined>;
  getRecoverableLiveSession(userId: string): Promise<LiveRunSession | undefined>;
  upsertLiveSession(sessionKey: string, userId: string, data: {
    distanceCovered?: number | null;
    elapsedTime?: number | null;
    currentPace?: string | null;
    cadence?: number | null;
    difficulty?: string | null;
    gpsTrack?: any;
    kmSplits?: any;
    routeId?: string | null;
  }): Promise<LiveRunSession>;
  updateLiveSession(id: string, data: Partial<InsertLiveRunSession>): Promise<LiveRunSession | undefined>;
  endLiveSession(id: string): Promise<void>;
  endLiveSessionByKey(sessionKey: string, userId: string): Promise<void>;

  saveGarminData(data: InsertGarminData): Promise<GarminData>;
  getUserGarminData(userId: string): Promise<GarminData[]>;

  // Friend Requests
  createFriendRequest(data: InsertFriendRequest): Promise<FriendRequest>;
  getFriendRequest(id: string): Promise<FriendRequest | undefined>;
  getIncomingFriendRequests(userId: string): Promise<FriendRequest[]>;
  getOutgoingFriendRequests(userId: string): Promise<FriendRequest[]>;
  getPendingRequestBetweenUsers(requesterId: string, addresseeId: string): Promise<FriendRequest | undefined>;
  respondToFriendRequest(id: string, status: 'accepted' | 'rejected' | 'cancelled'): Promise<FriendRequest | undefined>;

  // Push Subscriptions (multi-device support)
  savePushSubscription(data: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscription(userId: string): Promise<PushSubscription | undefined>;
  getAllPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined>;
  deletePushSubscription(userId: string): Promise<void>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
  markSubscriptionInactive(endpoint: string): Promise<void>;

  // Notification Preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined>;
  upsertNotificationPreferences(userId: string, prefs: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences>;

  // Notifications
  createNotification(data: InsertNotification): Promise<Notification>;
  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotificationByData(userId: string, type: string, relatedUserId: string): Promise<void>;

  // Route Ratings
  createRouteRating(data: InsertRouteRating): Promise<RouteRating>;
  getUserRouteRatings(userId: string): Promise<RouteRating[]>;
  getTemplateRatings(userId: string): Promise<Array<{ templateName: string; avgRating: number; count: number }>>;

  // AI Coach Configuration
  getAiCoachDescription(): Promise<AiCoachDescription | undefined>;
  upsertAiCoachDescription(content: string): Promise<AiCoachDescription>;
  
  getAiCoachInstructions(): Promise<AiCoachInstruction[]>;
  createAiCoachInstruction(data: InsertAiCoachInstruction): Promise<AiCoachInstruction>;
  updateAiCoachInstruction(id: string, data: Partial<InsertAiCoachInstruction>): Promise<AiCoachInstruction | undefined>;
  deleteAiCoachInstruction(id: string): Promise<void>;
  
  getAiCoachKnowledge(): Promise<AiCoachKnowledge[]>;
  createAiCoachKnowledge(data: InsertAiCoachKnowledge): Promise<AiCoachKnowledge>;
  updateAiCoachKnowledge(id: string, data: Partial<InsertAiCoachKnowledge>): Promise<AiCoachKnowledge | undefined>;
  deleteAiCoachKnowledge(id: string): Promise<void>;
  
  getAiCoachFaqs(): Promise<AiCoachFaq[]>;
  createAiCoachFaq(data: InsertAiCoachFaq): Promise<AiCoachFaq>;
  updateAiCoachFaq(id: string, data: Partial<InsertAiCoachFaq>): Promise<AiCoachFaq | undefined>;
  deleteAiCoachFaq(id: string): Promise<void>;

  // Coupon Management
  getCouponByCode(code: string): Promise<CouponCode | undefined>;
  getCoupon(id: string): Promise<CouponCode | undefined>;
  getAllCoupons(): Promise<CouponCode[]>;
  createCoupon(data: InsertCouponCode): Promise<CouponCode>;
  updateCoupon(id: string, data: Partial<InsertCouponCode>): Promise<CouponCode | undefined>;
  incrementCouponRedemptions(id: string): Promise<void>;

  // User Coupons
  getUserCoupon(userId: string, couponId: string): Promise<UserCoupon | undefined>;
  getUserActiveCoupon(userId: string): Promise<UserCoupon | undefined>;
  createUserCoupon(data: InsertUserCoupon): Promise<UserCoupon>;

  // Entitlement checking
  updateUserEntitlement(userId: string, entitlementType: string, expiresAt: Date): Promise<User | undefined>;

  // Group Runs
  createGroupRun(data: InsertGroupRun): Promise<GroupRun>;
  getGroupRun(id: string): Promise<GroupRun | undefined>;
  getGroupRunByToken(token: string): Promise<GroupRun | undefined>;
  getUserGroupRuns(userId: string): Promise<GroupRun[]>;
  updateGroupRun(id: string, data: Partial<InsertGroupRun>): Promise<GroupRun | undefined>;
  
  // Group Run Participants
  addGroupRunParticipant(data: InsertGroupRunParticipant): Promise<GroupRunParticipant>;
  getGroupRunParticipants(groupRunId: string): Promise<GroupRunParticipant[]>;
  getGroupRunParticipant(groupRunId: string, userId: string): Promise<GroupRunParticipant | undefined>;
  updateGroupRunParticipant(id: string, data: Partial<InsertGroupRunParticipant>): Promise<GroupRunParticipant | undefined>;
  getGroupRunsByParticipant(userId: string): Promise<GroupRun[]>;
  getGroupRunSummary(groupRunId: string): Promise<{ groupRun: GroupRun; participants: Array<GroupRunParticipant & { user?: User; run?: Run }> }>;
  
  // Group Run Invite Management
  getPendingGroupRunInvites(userId: string): Promise<Array<GroupRunParticipant & { groupRun: GroupRun; host?: User }>>;
  acceptGroupRunInvite(participantId: string): Promise<GroupRunParticipant | undefined>;
  declineGroupRunInvite(participantId: string): Promise<GroupRunParticipant | undefined>;
  getGroupRunParticipantCounts(groupRunId: string): Promise<{ total: number; pending: number; accepted: number; declined: number; ready: number }>;

  // Goals
  createGoal(data: InsertGoal): Promise<Goal>;
  getGoal(id: string): Promise<Goal | undefined>;
  getUserGoals(userId: string, status?: string): Promise<Goal[]>;
  getUserActiveGoals(userId: string): Promise<Goal[]>;
  getPrimaryGoal(userId: string): Promise<Goal | undefined>;
  updateGoal(id: string, data: Partial<InsertGoal>): Promise<Goal | undefined>;
  updateGoalProgress(id: string, progressPercent: number): Promise<Goal | undefined>;
  completeGoal(id: string): Promise<Goal | undefined>;
  abandonGoal(id: string): Promise<Goal | undefined>;
  deleteGoal(id: string): Promise<void>;

  // Run Analysis
  getRunAnalysis(runId: string): Promise<RunAnalysis | undefined>;
  upsertRunAnalysis(data: InsertRunAnalysis): Promise<RunAnalysis>;

  // AI Coaching Logs
  createAiCoachingLog(data: InsertAiCoachingLog): Promise<AiCoachingLog>;
  getAiCoachingLogsBySession(sessionKey: string): Promise<AiCoachingLog[]>;
  getAiCoachingLogsByRun(runId: string): Promise<AiCoachingLog[]>;
  updateAiCoachingLogsRunId(sessionKey: string, runId: string): Promise<void>;

  // Run Weakness Events
  createRunWeaknessEvent(data: InsertRunWeaknessEvent): Promise<RunWeaknessEvent>;
  getRunWeaknessEvents(runId: string): Promise<RunWeaknessEvent[]>;
  getUserWeaknessHistory(userId: string, limit?: number): Promise<RunWeaknessEvent[]>;
  updateWeaknessEventCause(id: string, causeTag: string | null, causeNote: string | null): Promise<RunWeaknessEvent | undefined>;
  updateWeaknessEventReview(id: string, userComment: string | null, isIrrelevant: boolean): Promise<RunWeaknessEvent | undefined>;
  deleteRunWeaknessEvent(id: string): Promise<void>;

  // Events
  createEvent(data: InsertEvent): Promise<Event>;
  getEvent(id: string): Promise<Event | undefined>;
  getAllEvents(): Promise<Event[]>;
  getEventsByCountry(country: string): Promise<Event[]>;
  getEventsGroupedByCountry(): Promise<Record<string, Event[]>>;
  getUserEventRuns(userId: string, eventId: string): Promise<Run[]>;
  updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    return withRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return withRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    });
  }

  async createUser(data: InsertUser): Promise<User> {
    return withRetry(async () => {
      const maxRetries = 10;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const userCode = this.generateUserCode();
        try {
          const [user] = await db.insert(users).values({ ...data, userCode }).returning();
          return user;
        } catch (error: any) {
          if (error?.code === '23505' && error?.constraint?.includes('user_code')) {
            continue;
          }
          throw error;
        }
      }
      throw new Error('Failed to generate unique user code after maximum retries');
    });
  }

  private generateUserCode(): string {
    const randomNum = randomInt(0, 100000000);
    return randomNum.toString().padStart(8, '0');
  }

  async backfillUserCodes(): Promise<number> {
    const usersWithoutCode = await db.select().from(users).where(sql`user_code IS NULL`);
    let updated = 0;
    const failed: string[] = [];
    
    for (const user of usersWithoutCode) {
      const maxRetries = 10;
      let success = false;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const userCode = this.generateUserCode();
        try {
          await db.update(users).set({ userCode }).where(eq(users.id, user.id));
          updated++;
          success = true;
          break;
        } catch (error: any) {
          if (error?.code === '23505' && attempt < maxRetries - 1) {
            continue;
          }
          console.error(`Failed to backfill userCode for user ${user.id}:`, error);
        }
      }
      if (!success) {
        failed.push(user.id);
      }
    }
    
    if (failed.length > 0) {
      console.error(`Failed to backfill ${failed.length} users:`, failed);
    }
    return updated;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async searchUsers(query: string): Promise<Array<{ id: string; name: string; userCode: string | null }>> {
    return withRetry(async () => {
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        userCode: users.userCode,
      }).from(users);
      
      const lowerQuery = query.toLowerCase();
      return allUsers.filter(u => 
        (u.name && u.name.toLowerCase().includes(lowerQuery)) || 
        (u.userCode && u.userCode.includes(query))
      );
    });
  }

  async getAllUsersForAdmin(): Promise<Array<{ id: string; email: string; name: string; isAdmin: boolean; createdAt: Date | null }>> {
    return withRetry(async () => {
      const result = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
      }).from(users).orderBy(desc(users.createdAt));
      return result.map(u => ({ ...u, isAdmin: u.isAdmin ?? false }));
    });
  }

  async createPreRegistration(data: InsertPreRegistration): Promise<PreRegistration> {
    const [reg] = await db.insert(preRegistrations).values(data).returning();
    return reg;
  }

  async getPreRegistrations(): Promise<PreRegistration[]> {
    return db.select().from(preRegistrations).orderBy(desc(preRegistrations.createdAt));
  }

  async getFriends(userId: string): Promise<Friend[]> {
    return db.select().from(friends).where(eq(friends.userId, userId));
  }

  async addFriend(data: InsertFriend): Promise<Friend> {
    const [friend] = await db.insert(friends).values(data).returning();
    return friend;
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    await db.delete(friends).where(
      and(eq(friends.userId, userId), eq(friends.friendId, friendId))
    );
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const result = await db.select().from(friends).where(
      and(
        eq(friends.status, 'accepted'),
        or(
          and(eq(friends.userId, userId1), eq(friends.friendId, userId2)),
          and(eq(friends.userId, userId2), eq(friends.friendId, userId1))
        )
      )
    );
    return result.length > 0;
  }

  async createRoute(data: InsertRoute): Promise<Route> {
    const [route] = await db.insert(routes).values(data).returning();
    return route;
  }

  async getRoute(id: string): Promise<Route | undefined> {
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    return route;
  }

  async updateRoute(id: string, data: Partial<InsertRoute>): Promise<Route | undefined> {
    const [route] = await db.update(routes).set(data).where(eq(routes.id, id)).returning();
    return route;
  }

  async getUserRoutes(userId: string): Promise<Route[]> {
    return db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt));
  }

  async getRecentRoutes(limit: number = 4, userId?: string): Promise<Route[]> {
    return withRetry(async () => {
      if (userId) {
        return db.select().from(routes)
          .where(eq(routes.userId, userId))
          .orderBy(desc(routes.createdAt))
          .limit(limit);
      }
      return db.select().from(routes).orderBy(desc(routes.createdAt)).limit(limit);
    });
  }

  async getAllRoutes(filters?: { difficulty?: string; userId?: string }): Promise<Route[]> {
    return withRetry(async () => {
      const conditions = [];
      
      if (filters?.difficulty) {
        conditions.push(eq(routes.difficulty, filters.difficulty));
      }
      if (filters?.userId) {
        conditions.push(eq(routes.userId, filters.userId));
      }
      
      if (conditions.length > 0) {
        return db.select().from(routes)
          .where(and(...conditions))
          .orderBy(desc(routes.createdAt));
      }
      
      return db.select().from(routes).orderBy(desc(routes.createdAt));
    });
  }

  async toggleRouteFavorite(id: string): Promise<Route | undefined> {
    return withRetry(async () => {
      const [route] = await db.select().from(routes).where(eq(routes.id, id));
      if (!route) return undefined;
      
      const [updated] = await db.update(routes)
        .set({ isFavorite: !route.isFavorite })
        .where(eq(routes.id, id))
        .returning();
      return updated;
    });
  }

  async getFavoriteRoutes(userId?: string): Promise<Route[]> {
    return withRetry(async () => {
      if (userId) {
        return db.select().from(routes)
          .where(and(eq(routes.isFavorite, true), eq(routes.userId, userId)))
          .orderBy(desc(routes.createdAt));
      }
      return db.select().from(routes)
        .where(eq(routes.isFavorite, true))
        .orderBy(desc(routes.createdAt));
    });
  }

  async getRoutesByLocation(startLat: number, startLng: number, radiusKm: number = 0.5): Promise<Route[]> {
    return withRetry(async () => {
      const allRoutes = await db.select().from(routes).orderBy(desc(routes.createdAt));
      
      return allRoutes.filter(route => {
        const latDiff = Math.abs(route.startLat - startLat);
        const lngDiff = Math.abs(route.startLng - startLng);
        const approxDistKm = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111;
        return approxDistKm <= radiusKm;
      });
    });
  }

  async markRouteStarted(id: string): Promise<Route | undefined> {
    return withRetry(async () => {
      const [updated] = await db.update(routes)
        .set({ lastStartedAt: new Date() })
        .where(eq(routes.id, id))
        .returning();
      return updated;
    });
  }

  async createRun(data: InsertRun): Promise<Run> {
    return withRetry(async () => {
      const [run] = await db.insert(runs).values(data).returning();
      return run;
    });
  }

  async getRun(id: string): Promise<Run | undefined> {
    return withRetry(async () => {
      const [run] = await db.select().from(runs).where(eq(runs.id, id));
      return run;
    });
  }

  async getUserRuns(userId: string): Promise<Run[]> {
    return withRetry(async () => {
      return db.select().from(runs).where(eq(runs.userId, userId)).orderBy(desc(runs.completedAt));
    });
  }

  async getUserRunsByRoute(userId: string, routeId: string, limit: number = 10): Promise<Run[]> {
    return withRetry(async () => {
      return db.select().from(runs)
        .where(and(eq(runs.userId, userId), eq(runs.routeId, routeId)))
        .orderBy(desc(runs.completedAt))
        .limit(limit);
    });
  }

  async updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined> {
    return withRetry(async () => {
      const [run] = await db.update(runs).set(data).where(eq(runs.id, id)).returning();
      return run;
    });
  }

  async deleteRun(id: string): Promise<boolean> {
    return withRetry(async () => {
      // Delete related records first (foreign key constraints)
      await db.delete(aiCoachingLogs).where(eq(aiCoachingLogs.runId, id));
      await db.delete(runWeaknessEvents).where(eq(runWeaknessEvents.runId, id));
      await db.delete(runAnalyses).where(eq(runAnalyses.runId, id));
      await db.delete(garminData).where(eq(garminData.runId, id));
      await db.delete(routeRatings).where(eq(routeRatings.runId, id));
      await db.update(groupRunParticipants).set({ runId: null }).where(eq(groupRunParticipants.runId, id));
      // Now delete the run
      await db.delete(runs).where(eq(runs.id, id));
      return true;
    });
  }

  async createLiveSession(data: InsertLiveRunSession): Promise<LiveRunSession> {
    return withRetry(async () => {
      const [session] = await db.insert(liveRunSessions).values(data).returning();
      return session;
    });
  }

  async getLiveSession(id: string): Promise<LiveRunSession | undefined> {
    return withRetry(async () => {
      const [session] = await db.select().from(liveRunSessions).where(eq(liveRunSessions.id, id));
      return session;
    });
  }

  async getActiveLiveSession(userId: string): Promise<LiveRunSession | undefined> {
    return withRetry(async () => {
      const [session] = await db.select().from(liveRunSessions).where(
        and(eq(liveRunSessions.userId, userId), eq(liveRunSessions.isActive, true))
      );
      return session;
    });
  }

  async updateLiveSession(id: string, data: Partial<InsertLiveRunSession>): Promise<LiveRunSession | undefined> {
    return withRetry(async () => {
      const [session] = await db.update(liveRunSessions).set(data).where(eq(liveRunSessions.id, id)).returning();
      return session;
    });
  }

  async endLiveSession(id: string): Promise<void> {
    return withRetry(async () => {
      await db.update(liveRunSessions).set({ isActive: false }).where(eq(liveRunSessions.id, id));
    });
  }

  async getLiveSessionByKey(sessionKey: string, userId: string): Promise<LiveRunSession | undefined> {
    const [session] = await db.select().from(liveRunSessions).where(
      and(eq(liveRunSessions.sessionKey, sessionKey), eq(liveRunSessions.userId, userId))
    );
    return session;
  }

  async getRecoverableLiveSession(userId: string): Promise<LiveRunSession | undefined> {
    const [session] = await db.select().from(liveRunSessions).where(
      and(
        eq(liveRunSessions.userId, userId),
        eq(liveRunSessions.isActive, true),
        sql`${liveRunSessions.distanceCovered} > 0.1`
      )
    ).orderBy(desc(liveRunSessions.lastSyncedAt));
    return session;
  }

  async upsertLiveSession(sessionKey: string, userId: string, data: {
    distanceCovered?: number | null;
    elapsedTime?: number | null;
    currentPace?: string | null;
    cadence?: number | null;
    difficulty?: string | null;
    gpsTrack?: any;
    kmSplits?: any;
    routeId?: string | null;
  }): Promise<LiveRunSession> {
    const existing = await this.getLiveSessionByKey(sessionKey, userId);
    if (existing) {
      const [updated] = await db.update(liveRunSessions)
        .set({
          distanceCovered: data.distanceCovered ?? existing.distanceCovered ?? 0,
          elapsedTime: data.elapsedTime ?? existing.elapsedTime ?? 0,
          currentPace: data.currentPace ?? existing.currentPace,
          cadence: data.cadence ?? existing.cadence,
          difficulty: data.difficulty ?? existing.difficulty,
          gpsTrack: data.gpsTrack ?? existing.gpsTrack,
          kmSplits: data.kmSplits ?? existing.kmSplits,
          routeId: data.routeId ?? existing.routeId,
          lastSyncedAt: new Date(),
        })
        .where(eq(liveRunSessions.id, existing.id))
        .returning();
      return updated;
    } else {
      const [session] = await db.insert(liveRunSessions)
        .values({
          sessionKey,
          userId,
          isActive: true,
          distanceCovered: data.distanceCovered ?? 0,
          elapsedTime: data.elapsedTime ?? 0,
          currentPace: data.currentPace ?? null,
          cadence: data.cadence ?? null,
          difficulty: data.difficulty ?? 'beginner',
          gpsTrack: data.gpsTrack ?? [],
          kmSplits: data.kmSplits ?? [],
          routeId: data.routeId ?? null,
        })
        .returning();
      return session;
    }
  }

  async endLiveSessionByKey(sessionKey: string, userId: string): Promise<void> {
    await db.update(liveRunSessions)
      .set({ isActive: false })
      .where(and(eq(liveRunSessions.sessionKey, sessionKey), eq(liveRunSessions.userId, userId)));
  }

  async saveGarminData(data: InsertGarminData): Promise<GarminData> {
    const [garmin] = await db.insert(garminData).values(data).returning();
    return garmin;
  }

  async getUserGarminData(userId: string): Promise<GarminData[]> {
    return db.select().from(garminData).where(eq(garminData.userId, userId)).orderBy(desc(garminData.syncedAt));
  }

  // Friend Requests
  async createFriendRequest(data: InsertFriendRequest): Promise<FriendRequest> {
    try {
      return await withRetry(async () => {
        const [request] = await db.insert(friendRequests).values(data).returning();
        return request;
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        throw new Error('Friend requests feature is not yet available. Please try again later.');
      }
      throw error;
    }
  }

  async getFriendRequest(id: string): Promise<FriendRequest | undefined> {
    try {
      return await withRetry(async () => {
        const [request] = await db.select().from(friendRequests).where(eq(friendRequests.id, id));
        return request;
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return undefined;
      }
      throw error;
    }
  }

  async getIncomingFriendRequests(userId: string): Promise<FriendRequest[]> {
    try {
      return await withRetry(async () => {
        return db.select().from(friendRequests).where(
          and(eq(friendRequests.addresseeId, userId), eq(friendRequests.status, 'pending'))
        ).orderBy(desc(friendRequests.createdAt));
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  async getOutgoingFriendRequests(userId: string): Promise<FriendRequest[]> {
    try {
      return await withRetry(async () => {
        return db.select().from(friendRequests).where(
          and(eq(friendRequests.requesterId, userId), eq(friendRequests.status, 'pending'))
        ).orderBy(desc(friendRequests.createdAt));
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  async getPendingRequestBetweenUsers(requesterId: string, addresseeId: string): Promise<FriendRequest | undefined> {
    try {
      return await withRetry(async () => {
        const [request] = await db.select().from(friendRequests).where(
          and(
            eq(friendRequests.status, 'pending'),
            or(
              and(eq(friendRequests.requesterId, requesterId), eq(friendRequests.addresseeId, addresseeId)),
              and(eq(friendRequests.requesterId, addresseeId), eq(friendRequests.addresseeId, requesterId))
            )
          )
        );
        return request;
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return undefined;
      }
      throw error;
    }
  }

  async respondToFriendRequest(id: string, status: 'accepted' | 'rejected' | 'cancelled'): Promise<FriendRequest | undefined> {
    try {
      return await withRetry(async () => {
        const [request] = await db.update(friendRequests).set({
          status,
          respondedAt: new Date(),
        }).where(eq(friendRequests.id, id)).returning();
        return request;
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        throw new Error('Friend requests feature is not yet available. Please try again later.');
      }
      throw error;
    }
  }

  // Push Subscriptions (multi-device support)
  async savePushSubscription(data: InsertPushSubscription): Promise<PushSubscription> {
    return withRetry(async () => {
      // Upsert by endpoint - update if exists, insert if new
      const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, data.endpoint));
      if (existing.length > 0) {
        // Update existing subscription (might be re-registering on same device)
        const [updated] = await db.update(pushSubscriptions)
          .set({
            userId: data.userId,
            p256dhKey: data.p256dhKey,
            authKey: data.authKey,
            deviceId: data.deviceId,
            deviceName: data.deviceName,
            userAgent: data.userAgent,
            isActive: true,
            lastUsedAt: new Date(),
          })
          .where(eq(pushSubscriptions.endpoint, data.endpoint))
          .returning();
        return updated;
      }
      const [subscription] = await db.insert(pushSubscriptions).values({
        ...data,
        isActive: true,
      }).returning();
      return subscription;
    });
  }

  async getPushSubscription(userId: string): Promise<PushSubscription | undefined> {
    return withRetry(async () => {
      // Return the most recently used active subscription for backward compatibility
      const [subscription] = await db.select().from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.isActive, true)))
        .orderBy(desc(pushSubscriptions.lastUsedAt))
        .limit(1);
      return subscription;
    });
  }

  async getAllPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return withRetry(async () => {
      return db.select().from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.isActive, true)));
    });
  }

  async getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined> {
    return withRetry(async () => {
      const [subscription] = await db.select().from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      return subscription;
    });
  }

  async deletePushSubscription(userId: string): Promise<void> {
    return withRetry(async () => {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    });
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    return withRetry(async () => {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    });
  }

  async markSubscriptionInactive(endpoint: string): Promise<void> {
    return withRetry(async () => {
      await db.update(pushSubscriptions)
        .set({ isActive: false })
        .where(eq(pushSubscriptions.endpoint, endpoint));
    });
  }

  // Notification Preferences
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
    return withRetry(async () => {
      const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
      return prefs;
    });
  }

  async upsertNotificationPreferences(userId: string, prefs: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences> {
    return withRetry(async () => {
      const existing = await this.getNotificationPreferences(userId);
      if (existing) {
        const [updated] = await db.update(notificationPreferences)
          .set({ ...prefs, updatedAt: new Date() })
          .where(eq(notificationPreferences.userId, userId))
          .returning();
        return updated;
      } else {
        const [created] = await db.insert(notificationPreferences)
          .values({ userId, ...prefs })
          .returning();
        return created;
      }
    });
  }

  // Notifications
  async createNotification(data: InsertNotification): Promise<Notification> {
    return withRetry(async () => {
      const [notification] = await db.insert(notifications).values(data).returning();
      return notification;
    });
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    try {
      return await withRetry(async () => {
        return db.select().from(notifications)
          .where(eq(notifications.userId, userId))
          .orderBy(desc(notifications.createdAt))
          .limit(50);
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      return await withRetry(async () => {
        const result = await db.select({ count: sql<number>`count(*)` })
          .from(notifications)
          .where(and(
            eq(notifications.userId, userId),
            eq(notifications.read, false)
          ));
        return Number(result[0]?.count) || 0;
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return 0;
      }
      throw error;
    }
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    return withRetry(async () => {
      const [notification] = await db.update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, id))
        .returning();
      return notification;
    });
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    return withRetry(async () => {
      await db.update(notifications)
        .set({ read: true })
        .where(eq(notifications.userId, userId));
    });
  }

  async deleteNotificationByData(userId: string, type: string, relatedUserId: string): Promise<void> {
    return withRetry(async () => {
      // Find and delete notifications that match the type and contain the relatedUserId in data
      const userNotifications = await db.select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.type, type)
        ));
      
      for (const notification of userNotifications) {
        if (notification.data) {
          const data = notification.data as Record<string, any>;
          // Check if this notification is related to the user we're cancelling
          if (data.requesterId === relatedUserId || data.requesterEmail) {
            await db.delete(notifications).where(eq(notifications.id, notification.id));
          }
        }
      }
    });
  }

  async createRouteRating(data: InsertRouteRating): Promise<RouteRating> {
    return withRetry(async () => {
      const [rating] = await db.insert(routeRatings).values(data).returning();
      return rating;
    });
  }

  async getUserRouteRatings(userId: string): Promise<RouteRating[]> {
    return withRetry(async () => {
      return db.select()
        .from(routeRatings)
        .where(eq(routeRatings.userId, userId))
        .orderBy(desc(routeRatings.createdAt));
    });
  }

  async getTemplateRatings(userId: string): Promise<Array<{ templateName: string; avgRating: number; count: number }>> {
    return withRetry(async () => {
      const ratings = await db.select()
        .from(routeRatings)
        .where(eq(routeRatings.userId, userId));
      
      // Group by template name and calculate averages
      const templateMap = new Map<string, { total: number; count: number }>();
      
      for (const rating of ratings) {
        if (rating.templateName) {
          const existing = templateMap.get(rating.templateName) || { total: 0, count: 0 };
          existing.total += rating.rating;
          existing.count += 1;
          templateMap.set(rating.templateName, existing);
        }
      }
      
      const result: Array<{ templateName: string; avgRating: number; count: number }> = [];
      templateMap.forEach((value, key) => {
        result.push({
          templateName: key,
          avgRating: value.total / value.count,
          count: value.count,
        });
      });
      
      return result.sort((a, b) => b.avgRating - a.avgRating);
    });
  }

  // AI Coach Configuration
  async getAiCoachDescription(): Promise<AiCoachDescription | undefined> {
    return withRetry(async () => {
      const [desc] = await db.select().from(aiCoachDescription).limit(1);
      return desc;
    });
  }

  async upsertAiCoachDescription(content: string): Promise<AiCoachDescription> {
    return withRetry(async () => {
      const existing = await this.getAiCoachDescription();
      if (existing) {
        const [updated] = await db.update(aiCoachDescription)
          .set({ content, updatedAt: new Date() })
          .where(eq(aiCoachDescription.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await db.insert(aiCoachDescription).values({ content }).returning();
        return created;
      }
    });
  }

  async getAiCoachInstructions(): Promise<AiCoachInstruction[]> {
    return withRetry(async () => {
      return db.select().from(aiCoachInstructions).orderBy(aiCoachInstructions.displayOrder);
    });
  }

  async createAiCoachInstruction(data: InsertAiCoachInstruction): Promise<AiCoachInstruction> {
    return withRetry(async () => {
      const [instruction] = await db.insert(aiCoachInstructions).values(data).returning();
      return instruction;
    });
  }

  async updateAiCoachInstruction(id: string, data: Partial<InsertAiCoachInstruction>): Promise<AiCoachInstruction | undefined> {
    return withRetry(async () => {
      const [instruction] = await db.update(aiCoachInstructions)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(aiCoachInstructions.id, id))
        .returning();
      return instruction;
    });
  }

  async deleteAiCoachInstruction(id: string): Promise<void> {
    return withRetry(async () => {
      await db.delete(aiCoachInstructions).where(eq(aiCoachInstructions.id, id));
    });
  }

  async getAiCoachKnowledge(): Promise<AiCoachKnowledge[]> {
    return withRetry(async () => {
      return db.select().from(aiCoachKnowledge).orderBy(aiCoachKnowledge.displayOrder);
    });
  }

  async createAiCoachKnowledge(data: InsertAiCoachKnowledge): Promise<AiCoachKnowledge> {
    return withRetry(async () => {
      const [knowledge] = await db.insert(aiCoachKnowledge).values(data).returning();
      return knowledge;
    });
  }

  async updateAiCoachKnowledge(id: string, data: Partial<InsertAiCoachKnowledge>): Promise<AiCoachKnowledge | undefined> {
    return withRetry(async () => {
      const [knowledge] = await db.update(aiCoachKnowledge)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(aiCoachKnowledge.id, id))
        .returning();
      return knowledge;
    });
  }

  async deleteAiCoachKnowledge(id: string): Promise<void> {
    return withRetry(async () => {
      await db.delete(aiCoachKnowledge).where(eq(aiCoachKnowledge.id, id));
    });
  }

  async getAiCoachFaqs(): Promise<AiCoachFaq[]> {
    return withRetry(async () => {
      return db.select().from(aiCoachFaq).orderBy(aiCoachFaq.displayOrder);
    });
  }

  async createAiCoachFaq(data: InsertAiCoachFaq): Promise<AiCoachFaq> {
    return withRetry(async () => {
      const [faq] = await db.insert(aiCoachFaq).values(data).returning();
      return faq;
    });
  }

  async updateAiCoachFaq(id: string, data: Partial<InsertAiCoachFaq>): Promise<AiCoachFaq | undefined> {
    return withRetry(async () => {
      const [faq] = await db.update(aiCoachFaq)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(aiCoachFaq.id, id))
        .returning();
      return faq;
    });
  }

  async deleteAiCoachFaq(id: string): Promise<void> {
    return withRetry(async () => {
      await db.delete(aiCoachFaq).where(eq(aiCoachFaq.id, id));
    });
  }

  // Coupon Management
  async getCouponByCode(code: string): Promise<CouponCode | undefined> {
    return withRetry(async () => {
      const [coupon] = await db.select().from(couponCodes)
        .where(eq(couponCodes.code, code.toUpperCase().trim()));
      return coupon;
    });
  }

  async getCoupon(id: string): Promise<CouponCode | undefined> {
    return withRetry(async () => {
      const [coupon] = await db.select().from(couponCodes)
        .where(eq(couponCodes.id, id));
      return coupon;
    });
  }

  async getAllCoupons(): Promise<CouponCode[]> {
    return withRetry(async () => {
      return db.select().from(couponCodes).orderBy(desc(couponCodes.createdAt));
    });
  }

  async createCoupon(data: InsertCouponCode): Promise<CouponCode> {
    return withRetry(async () => {
      const [coupon] = await db.insert(couponCodes).values({
        ...data,
        code: data.code.toUpperCase().trim(),
      }).returning();
      return coupon;
    });
  }

  async updateCoupon(id: string, data: Partial<InsertCouponCode>): Promise<CouponCode | undefined> {
    return withRetry(async () => {
      const updateData = { ...data };
      if (updateData.code) {
        updateData.code = updateData.code.toUpperCase().trim();
      }
      const [coupon] = await db.update(couponCodes)
        .set(updateData)
        .where(eq(couponCodes.id, id))
        .returning();
      return coupon;
    });
  }

  async incrementCouponRedemptions(id: string): Promise<void> {
    return withRetry(async () => {
      await db.update(couponCodes)
        .set({ currentRedemptions: sql`${couponCodes.currentRedemptions} + 1` })
        .where(eq(couponCodes.id, id));
    });
  }

  // User Coupons
  async getUserCoupon(userId: string, couponId: string): Promise<UserCoupon | undefined> {
    return withRetry(async () => {
      const [userCoupon] = await db.select().from(userCoupons)
        .where(and(
          eq(userCoupons.userId, userId),
          eq(userCoupons.couponId, couponId)
        ));
      return userCoupon;
    });
  }

  async getUserActiveCoupon(userId: string): Promise<UserCoupon | undefined> {
    return withRetry(async () => {
      const [userCoupon] = await db.select().from(userCoupons)
        .where(and(
          eq(userCoupons.userId, userId),
          eq(userCoupons.status, 'active')
        ))
        .orderBy(desc(userCoupons.expiresAt));
      return userCoupon;
    });
  }

  async createUserCoupon(data: InsertUserCoupon): Promise<UserCoupon> {
    return withRetry(async () => {
      const [userCoupon] = await db.insert(userCoupons).values(data).returning();
      return userCoupon;
    });
  }

  // Entitlement Management
  async updateUserEntitlement(userId: string, entitlementType: string, expiresAt: Date): Promise<User | undefined> {
    return withRetry(async () => {
      const [user] = await db.update(users)
        .set({ entitlementType, entitlementExpiresAt: expiresAt })
        .where(eq(users.id, userId))
        .returning();
      return user;
    });
  }

  // Group Runs
  async createGroupRun(data: InsertGroupRun): Promise<GroupRun> {
    return withRetry(async () => {
      const [groupRun] = await db.insert(groupRuns).values(data).returning();
      return groupRun;
    });
  }

  async getGroupRun(id: string): Promise<GroupRun | undefined> {
    return withRetry(async () => {
      const [groupRun] = await db.select().from(groupRuns).where(eq(groupRuns.id, id));
      return groupRun;
    });
  }

  async getGroupRunByToken(token: string): Promise<GroupRun | undefined> {
    return withRetry(async () => {
      const [groupRun] = await db.select().from(groupRuns).where(eq(groupRuns.inviteToken, token));
      return groupRun;
    });
  }

  async getUserGroupRuns(userId: string): Promise<GroupRun[]> {
    return withRetry(async () => {
      return await db.select().from(groupRuns)
        .where(eq(groupRuns.hostUserId, userId))
        .orderBy(desc(groupRuns.createdAt));
    });
  }

  async updateGroupRun(id: string, data: Partial<InsertGroupRun>): Promise<GroupRun | undefined> {
    return withRetry(async () => {
      const [groupRun] = await db.update(groupRuns).set(data).where(eq(groupRuns.id, id)).returning();
      return groupRun;
    });
  }

  // Group Run Participants
  async addGroupRunParticipant(data: InsertGroupRunParticipant): Promise<GroupRunParticipant> {
    return withRetry(async () => {
      const [participant] = await db.insert(groupRunParticipants).values(data).returning();
      return participant;
    });
  }

  async getGroupRunParticipants(groupRunId: string): Promise<GroupRunParticipant[]> {
    return withRetry(async () => {
      return await db.select().from(groupRunParticipants)
        .where(eq(groupRunParticipants.groupRunId, groupRunId));
    });
  }

  async getGroupRunParticipant(groupRunId: string, userId: string): Promise<GroupRunParticipant | undefined> {
    return withRetry(async () => {
      const [participant] = await db.select().from(groupRunParticipants)
        .where(and(
          eq(groupRunParticipants.groupRunId, groupRunId),
          eq(groupRunParticipants.userId, userId)
        ));
      return participant;
    });
  }

  async updateGroupRunParticipant(id: string, data: Partial<InsertGroupRunParticipant>): Promise<GroupRunParticipant | undefined> {
    return withRetry(async () => {
      const [participant] = await db.update(groupRunParticipants)
        .set(data)
        .where(eq(groupRunParticipants.id, id))
        .returning();
      return participant;
    });
  }

  async getGroupRunsByParticipant(userId: string): Promise<GroupRun[]> {
    return withRetry(async () => {
      const participations = await db.select().from(groupRunParticipants)
        .where(eq(groupRunParticipants.userId, userId));
      
      if (participations.length === 0) return [];
      
      const groupRunIds = participations.map(p => p.groupRunId);
      const result: GroupRun[] = [];
      
      for (const gid of groupRunIds) {
        const [gr] = await db.select().from(groupRuns).where(eq(groupRuns.id, gid));
        if (gr) result.push(gr);
      }
      
      return result.sort((a, b) => 
        new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
      );
    });
  }

  async getGroupRunSummary(groupRunId: string): Promise<{ groupRun: GroupRun; participants: Array<GroupRunParticipant & { user?: User; run?: Run }> }> {
    return withRetry(async () => {
      const [groupRun] = await db.select().from(groupRuns).where(eq(groupRuns.id, groupRunId));
      if (!groupRun) throw new Error("Group run not found");
      
      const participants = await db.select().from(groupRunParticipants)
        .where(eq(groupRunParticipants.groupRunId, groupRunId));
      
      const enrichedParticipants = await Promise.all(participants.map(async (p) => {
        const [user] = await db.select().from(users).where(eq(users.id, p.userId));
        let run: Run | undefined;
        if (p.runId) {
          const [r] = await db.select().from(runs).where(eq(runs.id, p.runId));
          run = r;
        }
        return { ...p, user, run };
      }));
      
      return { groupRun, participants: enrichedParticipants };
    });
  }

  async getPendingGroupRunInvites(userId: string): Promise<Array<GroupRunParticipant & { groupRun: GroupRun; host?: User }>> {
    return withRetry(async () => {
      const pendingInvites = await db.select().from(groupRunParticipants)
        .where(and(
          eq(groupRunParticipants.userId, userId),
          eq(groupRunParticipants.invitationStatus, 'pending'),
          eq(groupRunParticipants.role, 'participant')
        ));
      
      const enrichedInvites = await Promise.all(pendingInvites.map(async (invite) => {
        const [groupRun] = await db.select().from(groupRuns).where(eq(groupRuns.id, invite.groupRunId));
        let host: User | undefined;
        if (groupRun) {
          const [h] = await db.select().from(users).where(eq(users.id, groupRun.hostUserId));
          host = h;
        }
        return { ...invite, groupRun: groupRun!, host };
      }));
      
      return enrichedInvites.filter(i => i.groupRun && i.groupRun.status === 'pending');
    });
  }

  async acceptGroupRunInvite(participantId: string): Promise<GroupRunParticipant | undefined> {
    return withRetry(async () => {
      const [participant] = await db.update(groupRunParticipants)
        .set({ 
          invitationStatus: 'accepted',
          acceptedAt: new Date()
        })
        .where(eq(groupRunParticipants.id, participantId))
        .returning();
      return participant;
    });
  }

  async declineGroupRunInvite(participantId: string): Promise<GroupRunParticipant | undefined> {
    return withRetry(async () => {
      const [participant] = await db.update(groupRunParticipants)
        .set({ 
          invitationStatus: 'declined',
          declinedAt: new Date()
        })
        .where(eq(groupRunParticipants.id, participantId))
        .returning();
      return participant;
    });
  }

  async getGroupRunParticipantCounts(groupRunId: string): Promise<{ total: number; pending: number; accepted: number; declined: number; ready: number }> {
    return withRetry(async () => {
      const participants = await db.select().from(groupRunParticipants)
        .where(eq(groupRunParticipants.groupRunId, groupRunId));
      
      return {
        total: participants.length,
        pending: participants.filter(p => p.invitationStatus === 'pending').length,
        accepted: participants.filter(p => p.invitationStatus === 'accepted').length,
        declined: participants.filter(p => p.invitationStatus === 'declined').length,
        ready: participants.filter(p => p.readyToStart === true).length
      };
    });
  }

  // Goals
  async createGoal(data: InsertGoal): Promise<Goal> {
    return withRetry(async () => {
      const [goal] = await db.insert(goals).values(data).returning();
      return goal;
    });
  }

  async getGoal(id: string): Promise<Goal | undefined> {
    return withRetry(async () => {
      const [goal] = await db.select().from(goals).where(eq(goals.id, id));
      return goal;
    });
  }

  async getUserGoals(userId: string, status?: string): Promise<Goal[]> {
    return withRetry(async () => {
      if (status) {
        return db.select().from(goals)
          .where(and(eq(goals.userId, userId), eq(goals.status, status)))
          .orderBy(desc(goals.priority), desc(goals.createdAt));
      }
      return db.select().from(goals)
        .where(eq(goals.userId, userId))
        .orderBy(desc(goals.priority), desc(goals.createdAt));
    });
  }

  async getUserActiveGoals(userId: string): Promise<Goal[]> {
    return withRetry(async () => {
      return db.select().from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))
        .orderBy(goals.priority, desc(goals.createdAt));
    });
  }

  async getPrimaryGoal(userId: string): Promise<Goal | undefined> {
    return withRetry(async () => {
      const [goal] = await db.select().from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))
        .orderBy(goals.priority)
        .limit(1);
      return goal;
    });
  }

  async updateGoal(id: string, data: Partial<InsertGoal>): Promise<Goal | undefined> {
    return withRetry(async () => {
      const [goal] = await db.update(goals)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning();
      return goal;
    });
  }

  async updateGoalProgress(id: string, progressPercent: number): Promise<Goal | undefined> {
    return withRetry(async () => {
      const [goal] = await db.update(goals)
        .set({ progressPercent, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning();
      return goal;
    });
  }

  async completeGoal(id: string): Promise<Goal | undefined> {
    return withRetry(async () => {
      const [goal] = await db.update(goals)
        .set({ status: 'completed', progressPercent: 100, completedAt: new Date(), updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning();
      return goal;
    });
  }

  async abandonGoal(id: string): Promise<Goal | undefined> {
    return withRetry(async () => {
      const [goal] = await db.update(goals)
        .set({ status: 'abandoned', updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning();
      return goal;
    });
  }

  async deleteGoal(id: string): Promise<void> {
    return withRetry(async () => {
      await db.delete(goals).where(eq(goals.id, id));
    });
  }

  // Run Analysis
  async getRunAnalysis(runId: string): Promise<RunAnalysis | undefined> {
    return withRetry(async () => {
      const [analysis] = await db.select().from(runAnalyses).where(eq(runAnalyses.runId, runId));
      return analysis;
    });
  }

  async upsertRunAnalysis(data: InsertRunAnalysis): Promise<RunAnalysis> {
    return withRetry(async () => {
      const [analysis] = await db.insert(runAnalyses)
        .values(data)
        .onConflictDoUpdate({
          target: runAnalyses.runId,
          set: {
            highlights: data.highlights,
            struggles: data.struggles,
            personalBests: data.personalBests,
            demographicComparison: data.demographicComparison,
            coachingTips: data.coachingTips,
            overallAssessment: data.overallAssessment,
            weatherImpact: data.weatherImpact,
            warmUpAnalysis: data.warmUpAnalysis,
            goalProgress: data.goalProgress,
            targetTimeAnalysis: data.targetTimeAnalysis,
            updatedAt: new Date(),
          },
        })
        .returning();
      return analysis;
    });
  }

  // AI Coaching Logs
  async createAiCoachingLog(data: InsertAiCoachingLog): Promise<AiCoachingLog> {
    return withRetry(async () => {
      const [log] = await db.insert(aiCoachingLogs).values(data).returning();
      return log;
    });
  }

  async getAiCoachingLogsBySession(sessionKey: string): Promise<AiCoachingLog[]> {
    return withRetry(async () => {
      return db.select().from(aiCoachingLogs)
        .where(eq(aiCoachingLogs.sessionKey, sessionKey))
        .orderBy(aiCoachingLogs.createdAt);
    });
  }

  async getAiCoachingLogsByRun(runId: string): Promise<AiCoachingLog[]> {
    return withRetry(async () => {
      return db.select().from(aiCoachingLogs)
        .where(eq(aiCoachingLogs.runId, runId))
        .orderBy(aiCoachingLogs.createdAt);
    });
  }

  async updateAiCoachingLogsRunId(sessionKey: string, runId: string): Promise<void> {
    return withRetry(async () => {
      await db.update(aiCoachingLogs)
        .set({ runId })
        .where(eq(aiCoachingLogs.sessionKey, sessionKey));
    });
  }

  // Run Weakness Events
  async createRunWeaknessEvent(data: InsertRunWeaknessEvent): Promise<RunWeaknessEvent> {
    return withRetry(async () => {
      const [event] = await db.insert(runWeaknessEvents).values(data).returning();
      return event;
    });
  }

  async getRunWeaknessEvents(runId: string): Promise<RunWeaknessEvent[]> {
    return withRetry(async () => {
      return db.select().from(runWeaknessEvents)
        .where(eq(runWeaknessEvents.runId, runId))
        .orderBy(runWeaknessEvents.startDistanceKm);
    });
  }

  async getUserWeaknessHistory(userId: string, limit: number = 50): Promise<RunWeaknessEvent[]> {
    return withRetry(async () => {
      return db.select().from(runWeaknessEvents)
        .where(eq(runWeaknessEvents.userId, userId))
        .orderBy(desc(runWeaknessEvents.createdAt))
        .limit(limit);
    });
  }

  async updateWeaknessEventCause(id: string, causeTag: string | null, causeNote: string | null): Promise<RunWeaknessEvent | undefined> {
    return withRetry(async () => {
      const [event] = await db.update(runWeaknessEvents)
        .set({ causeTag, causeNote })
        .where(eq(runWeaknessEvents.id, id))
        .returning();
      return event;
    });
  }

  async updateWeaknessEventReview(id: string, userComment: string | null, isIrrelevant: boolean): Promise<RunWeaknessEvent | undefined> {
    return withRetry(async () => {
      const [event] = await db.update(runWeaknessEvents)
        .set({ userComment, isIrrelevant, reviewedAt: new Date() })
        .where(eq(runWeaknessEvents.id, id))
        .returning();
      return event;
    });
  }

  async deleteRunWeaknessEvent(id: string): Promise<void> {
    return withRetry(async () => {
      await db.delete(runWeaknessEvents).where(eq(runWeaknessEvents.id, id));
    });
  }

  // Events
  async createEvent(data: InsertEvent): Promise<Event> {
    return withRetry(async () => {
      const [event] = await db.insert(events).values(data).returning();
      return event;
    });
  }

  async getEvent(id: string): Promise<Event | undefined> {
    return withRetry(async () => {
      const [event] = await db.select().from(events).where(eq(events.id, id));
      return event;
    });
  }

  async getAllEvents(): Promise<Event[]> {
    return withRetry(async () => {
      return db.select().from(events)
        .where(eq(events.isActive, true))
        .orderBy(events.country, events.name);
    });
  }

  async getEventsByCountry(country: string): Promise<Event[]> {
    return withRetry(async () => {
      return db.select().from(events)
        .where(and(eq(events.country, country), eq(events.isActive, true)))
        .orderBy(events.name);
    });
  }

  async getEventsGroupedByCountry(): Promise<Record<string, Event[]>> {
    return withRetry(async () => {
      const allEvents = await db.select().from(events)
        .where(eq(events.isActive, true))
        .orderBy(events.country, events.name);
      
      const grouped: Record<string, Event[]> = {};
      for (const event of allEvents) {
        if (!grouped[event.country]) {
          grouped[event.country] = [];
        }
        grouped[event.country].push(event);
      }
      return grouped;
    });
  }

  async getUserEventRuns(userId: string, eventId: string): Promise<Run[]> {
    return withRetry(async () => {
      return db.select().from(runs)
        .where(and(eq(runs.userId, userId), eq(runs.eventId, eventId)))
        .orderBy(desc(runs.completedAt));
    });
  }

  async updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined> {
    return withRetry(async () => {
      const [event] = await db.update(events)
        .set(data)
        .where(eq(events.id, id))
        .returning();
      return event;
    });
  }

  async deleteEvent(id: string): Promise<void> {
    return withRetry(async () => {
      await db.update(events)
        .set({ isActive: false })
        .where(eq(events.id, id));
    });
  }
}

export const storage = new DatabaseStorage();

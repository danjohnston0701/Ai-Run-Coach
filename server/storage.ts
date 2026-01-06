import { eq, and, desc, or, sql } from "drizzle-orm";
import { db, withRetry } from "./db";
import {
  users, preRegistrations, friends, routes, runs, liveRunSessions, garminData,
  friendRequests, pushSubscriptions, notifications, routeRatings,
  aiCoachDescription, aiCoachInstructions, aiCoachKnowledge, aiCoachFaq,
  couponCodes, userCoupons,
  type User, type InsertUser,
  type PreRegistration, type InsertPreRegistration,
  type Friend, type InsertFriend,
  type Route, type InsertRoute,
  type Run, type InsertRun,
  type LiveRunSession, type InsertLiveRunSession,
  type GarminData, type InsertGarminData,
  type FriendRequest, type InsertFriendRequest,
  type PushSubscription, type InsertPushSubscription,
  type Notification, type InsertNotification,
  type RouteRating, type InsertRouteRating,
  type AiCoachDescription, type InsertAiCoachDescription,
  type AiCoachInstruction, type InsertAiCoachInstruction,
  type AiCoachKnowledge, type InsertAiCoachKnowledge,
  type AiCoachFaq, type InsertAiCoachFaq,
  type CouponCode, type InsertCouponCode,
  type UserCoupon, type InsertUserCoupon,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  searchUsers(query: string): Promise<Array<{ id: string; name: string; email: string }>>;

  createPreRegistration(data: InsertPreRegistration): Promise<PreRegistration>;
  getPreRegistrations(): Promise<PreRegistration[]>;

  getFriends(userId: string): Promise<Friend[]>;
  addFriend(data: InsertFriend): Promise<Friend>;
  removeFriend(userId: string, friendId: string): Promise<void>;

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
  updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined>;

  createLiveSession(data: InsertLiveRunSession): Promise<LiveRunSession>;
  getLiveSession(id: string): Promise<LiveRunSession | undefined>;
  getActiveLiveSession(userId: string): Promise<LiveRunSession | undefined>;
  updateLiveSession(id: string, data: Partial<InsertLiveRunSession>): Promise<LiveRunSession | undefined>;
  endLiveSession(id: string): Promise<void>;

  saveGarminData(data: InsertGarminData): Promise<GarminData>;
  getUserGarminData(userId: string): Promise<GarminData[]>;

  // Friend Requests
  createFriendRequest(data: InsertFriendRequest): Promise<FriendRequest>;
  getFriendRequest(id: string): Promise<FriendRequest | undefined>;
  getIncomingFriendRequests(userId: string): Promise<FriendRequest[]>;
  getOutgoingFriendRequests(userId: string): Promise<FriendRequest[]>;
  getPendingRequestBetweenUsers(requesterId: string, addresseeId: string): Promise<FriendRequest | undefined>;
  respondToFriendRequest(id: string, status: 'accepted' | 'rejected' | 'cancelled'): Promise<FriendRequest | undefined>;

  // Push Subscriptions
  savePushSubscription(data: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscription(userId: string): Promise<PushSubscription | undefined>;
  deletePushSubscription(userId: string): Promise<void>;

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
      const [user] = await db.insert(users).values(data).returning();
      return user;
    });
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async searchUsers(query: string): Promise<Array<{ id: string; name: string; email: string }>> {
    return withRetry(async () => {
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
      }).from(users);
      
      const lowerQuery = query.toLowerCase();
      return allUsers.filter(u => 
        (u.name && u.name.toLowerCase().includes(lowerQuery)) || 
        (u.email && u.email.toLowerCase().includes(lowerQuery))
      );
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
    const [run] = await db.insert(runs).values(data).returning();
    return run;
  }

  async getRun(id: string): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    return run;
  }

  async getUserRuns(userId: string): Promise<Run[]> {
    return db.select().from(runs).where(eq(runs.userId, userId)).orderBy(desc(runs.completedAt));
  }

  async updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined> {
    const [run] = await db.update(runs).set(data).where(eq(runs.id, id)).returning();
    return run;
  }

  async createLiveSession(data: InsertLiveRunSession): Promise<LiveRunSession> {
    const [session] = await db.insert(liveRunSessions).values(data).returning();
    return session;
  }

  async getLiveSession(id: string): Promise<LiveRunSession | undefined> {
    const [session] = await db.select().from(liveRunSessions).where(eq(liveRunSessions.id, id));
    return session;
  }

  async getActiveLiveSession(userId: string): Promise<LiveRunSession | undefined> {
    const [session] = await db.select().from(liveRunSessions).where(
      and(eq(liveRunSessions.userId, userId), eq(liveRunSessions.isActive, true))
    );
    return session;
  }

  async updateLiveSession(id: string, data: Partial<InsertLiveRunSession>): Promise<LiveRunSession | undefined> {
    const [session] = await db.update(liveRunSessions).set(data).where(eq(liveRunSessions.id, id)).returning();
    return session;
  }

  async endLiveSession(id: string): Promise<void> {
    await db.update(liveRunSessions).set({ isActive: false }).where(eq(liveRunSessions.id, id));
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

  // Push Subscriptions
  async savePushSubscription(data: InsertPushSubscription): Promise<PushSubscription> {
    return withRetry(async () => {
      // Delete existing subscription for this user first
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, data.userId));
      const [subscription] = await db.insert(pushSubscriptions).values(data).returning();
      return subscription;
    });
  }

  async getPushSubscription(userId: string): Promise<PushSubscription | undefined> {
    return withRetry(async () => {
      const [subscription] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
      return subscription;
    });
  }

  async deletePushSubscription(userId: string): Promise<void> {
    return withRetry(async () => {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
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
}

export const storage = new DatabaseStorage();

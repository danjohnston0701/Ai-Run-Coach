import { eq, and, desc, or, sql } from "drizzle-orm";
import { db, withRetry } from "./db";
import {
  users, preRegistrations, friends, routes, runs, liveRunSessions, garminData,
  friendRequests, pushSubscriptions, notifications,
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
  getUserRoutes(userId: string): Promise<Route[]>;

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
  respondToFriendRequest(id: string, status: 'accepted' | 'rejected'): Promise<FriendRequest | undefined>;

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

  async getUserRoutes(userId: string): Promise<Route[]> {
    return db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt));
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

  async respondToFriendRequest(id: string, status: 'accepted' | 'rejected'): Promise<FriendRequest | undefined> {
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
}

export const storage = new DatabaseStorage();

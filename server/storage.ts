import { eq, and, desc } from "drizzle-orm";
import { db, withRetry } from "./db";
import {
  users, preRegistrations, friends, routes, runs, liveRunSessions, garminData,
  type User, type InsertUser,
  type PreRegistration, type InsertPreRegistration,
  type Friend, type InsertFriend,
  type Route, type InsertRoute,
  type Run, type InsertRun,
  type LiveRunSession, type InsertLiveRunSession,
  type GarminData, type InsertGarminData,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

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
}

export const storage = new DatabaseStorage();

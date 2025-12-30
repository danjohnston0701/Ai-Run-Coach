import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPreRegistrationSchema, insertUserSchema, insertRouteSchema, insertRunSchema, insertLiveRunSessionSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Pre-registration endpoint
  app.post("/api/pre-register", async (req, res) => {
    try {
      const data = insertPreRegistrationSchema.parse(req.body);
      const existing = await storage.getPreRegistrations();
      if (existing.find(r => r.email === data.email)) {
        return res.status(400).json({ error: "Email already registered" });
      }
      const registration = await storage.createPreRegistration(data);
      res.status(201).json(registration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to register" });
    }
  });

  // User authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ error: "Email already exists" });
      }
      const user = await storage.createUser(data);
      const { password, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await storage.getUserByEmail(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Routes endpoints
  app.post("/api/routes", async (req, res) => {
    try {
      const data = insertRouteSchema.parse(req.body);
      const route = await storage.createRoute(data);
      res.status(201).json(route);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create route" });
    }
  });

  app.get("/api/routes/:id", async (req, res) => {
    try {
      const route = await storage.getRoute(req.params.id);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      res.json(route);
    } catch (error) {
      res.status(500).json({ error: "Failed to get route" });
    }
  });

  app.get("/api/users/:userId/routes", async (req, res) => {
    try {
      const routes = await storage.getUserRoutes(req.params.userId);
      res.json(routes);
    } catch (error) {
      res.status(500).json({ error: "Failed to get routes" });
    }
  });

  // Runs endpoints
  app.post("/api/runs", async (req, res) => {
    try {
      const data = insertRunSchema.parse(req.body);
      const run = await storage.createRun(data);
      res.status(201).json(run);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create run" });
    }
  });

  app.get("/api/runs/:id", async (req, res) => {
    try {
      const run = await storage.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      res.json(run);
    } catch (error) {
      res.status(500).json({ error: "Failed to get run" });
    }
  });

  app.get("/api/users/:userId/runs", async (req, res) => {
    try {
      const runs = await storage.getUserRuns(req.params.userId);
      res.json(runs);
    } catch (error) {
      res.status(500).json({ error: "Failed to get runs" });
    }
  });

  app.patch("/api/runs/:id", async (req, res) => {
    try {
      const run = await storage.updateRun(req.params.id, req.body);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      res.json(run);
    } catch (error) {
      res.status(500).json({ error: "Failed to update run" });
    }
  });

  // Live session endpoints
  app.post("/api/live-sessions", async (req, res) => {
    try {
      const data = insertLiveRunSessionSchema.parse(req.body);
      const session = await storage.createLiveSession(data);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create live session" });
    }
  });

  app.get("/api/live-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getLiveSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.get("/api/users/:userId/live-session", async (req, res) => {
    try {
      const session = await storage.getActiveLiveSession(req.params.userId);
      res.json(session || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to get active session" });
    }
  });

  app.patch("/api/live-sessions/:id", async (req, res) => {
    try {
      const session = await storage.updateLiveSession(req.params.id, req.body);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.post("/api/live-sessions/:id/end", async (req, res) => {
    try {
      await storage.endLiveSession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  // Friends endpoints
  app.get("/api/users/:userId/friends", async (req, res) => {
    try {
      const friends = await storage.getFriends(req.params.userId);
      res.json(friends);
    } catch (error) {
      res.status(500).json({ error: "Failed to get friends" });
    }
  });

  app.post("/api/users/:userId/friends", async (req, res) => {
    try {
      const { friendId } = req.body;
      const friend = await storage.addFriend({
        userId: req.params.userId,
        friendId,
        status: "accepted"
      });
      res.status(201).json(friend);
    } catch (error) {
      res.status(500).json({ error: "Failed to add friend" });
    }
  });

  app.delete("/api/users/:userId/friends/:friendId", async (req, res) => {
    try {
      await storage.removeFriend(req.params.userId, req.params.friendId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove friend" });
    }
  });

  // Search users (for adding friends)
  app.get("/api/users/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.json([]);
      }
      const registrations = await storage.getPreRegistrations();
      const filtered = registrations.filter(r => 
        r.name.toLowerCase().includes(q.toLowerCase()) || 
        r.email.toLowerCase().includes(q.toLowerCase())
      );
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  return httpServer;
}

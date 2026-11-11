import express from "express";
import type { Request, Response, NextFunction } from "express";
import compression from "compression";  // ⚡ For gzip response compression
import { registerRoutes } from "./routes";
import { startScheduler } from "./scheduler";
import { runAutoMigrations } from "./auto-migrate";
import { userActivityMiddleware } from "./user-activity";
import { configureWebServing } from "./web-serving";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, PATCH, OPTIONS",
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

function setupBodyParsing(app: express.Application) {
  // Garmin webhook payloads can be up to 100MB (activity details with GPS tracks)
  // Apply a larger limit specifically for Garmin webhook routes
  app.use('/api/garmin/webhook', express.json({ limit: '100mb' }));
  app.use('/api/garmin/webhooks', express.json({ limit: '100mb' }));

  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: '10mb' }));
}

function setupCacheHeaders(app: express.Application) {
  // ⚡ Add Cache-Control headers to GET requests (reduces bandwidth)
  // Only cache stable data - explicitly exclude real-time and sensitive endpoints
  app.use((req, res, next) => {
    if (req.method === "GET") {
      const path = req.path;

      // Never cache real-time, AI, or frequently-changing endpoints
      const noCachePaths = [
        "/api/live-sessions",
        "/api/ai/",
        "/api/notifications",
        "/api/users/me",
        "/api/auth",
        "/api/garmin",
        "/api/connected-devices", // Connection state changes immediately on connect/disconnect
      ];
      const isNoCache = noCachePaths.some((p) => path.startsWith(p));
      // Never cache HTML pages — ensures new deployments are picked up immediately
      const isHtml = path === "/" || path.endsWith(".html") || (!path.includes(".") && !path.startsWith("/api") && !path.startsWith("/assets"));

      if (isNoCache || isHtml) {
        // Ensure these are always fresh
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (req.headers.authorization) {
        // Private cache for user-specific stable data (5 minutes)
        res.setHeader("Cache-Control", "private, max-age=300");
      } else {
        // Public cache for non-authenticated static data (24 hours)
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    }
    next();
  });
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    res.status(status).json({ message });
  });
}

(async () => {
  setupCors(app);
  // ⚡ Enable gzip compression for all responses (40-60% bandwidth reduction)
  app.use(compression());
  setupBodyParsing(app);
  // ⚡ Add Cache-Control headers to GET responses (30-50% additional bandwidth reduction)
  setupCacheHeaders(app);
  setupRequestLogging(app);

  // Healthcheck endpoint — registered BEFORE routes so Replit's probe always gets 200
  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({ status: "ok", service: "AI Run Coach API" });
  });

  // Run schema auto-migrations before anything else touches the DB
  await runAutoMigrations();

  // Log key user actions (user_activity) — must sit in front of the routes it watches.
  app.use(userActivityMiddleware);

  // Register API routes BEFORE static file serving
  const server = await registerRoutes(app);

  configureWebServing(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`express server serving on port ${port} (accessible from Android emulator)`);
    startScheduler();
  });
})();

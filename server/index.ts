import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import { startScheduler } from "./scheduler";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;
const METRO_PORT = 8081;

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
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
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

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
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
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function isBrowserRequest(req: Request): boolean {
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

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Setting up Expo routing with Metro proxy and web app");

  // Handle manifest requests for mobile apps
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    const platform = req.header("expo-platform");
    if ((req.path === "/" || req.path === "/manifest") && platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    next();
  });

  // Serve static assets
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use("/logos", express.static(path.resolve(process.cwd(), "attached_assets/generated_images")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  // Serve the web app (Vite build) for browser requests
  const webDistPath = path.resolve(process.cwd(), "dist", "public");
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    log(`Web app: Serving from ${webDistPath}`);
  }

  // Proxy all other requests to Metro bundler for Expo web/mobile development
  const metroProxy = createProxyMiddleware({
    target: `http://localhost:${METRO_PORT}`,
    changeOrigin: true,
    ws: true,
    on: {
      error: (err: Error, req: unknown, res: unknown) => {
        log(`Metro proxy error: ${err.message}`);
        const response = res as Response;
        if (!response.headersSent) {
          serveLandingPage({
            req: req as Request,
            res: response,
            landingPageTemplate,
            appName,
          });
        }
      },
    },
  });

  // Route browser requests to web app, mobile/Metro requests to Metro proxy
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    // Browser requests: serve web app SPA
    if (isBrowserRequest(req)) {
      const webIndexPath = path.resolve(webDistPath, "index.html");
      if (fs.existsSync(webIndexPath)) {
        return res.sendFile(webIndexPath);
      }
    }

    // Mobile/Expo requests: proxy to Metro
    return metroProxy(req, res, next);
  });

  log("Expo routing: Mobile manifests, Metro proxy, and web app configured");
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

    throw err;
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  // Register API routes BEFORE static file serving
  const server = await registerRoutes(app);

  // Handle mobile app manifest requests (both dev and production)
  app.use((req: Request, res: Response, next: NextFunction) => {
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
    // Production: Serve the web app (Vite build) for browsers
    const webDistPath = path.resolve(process.cwd(), "dist", "public");
    const expoDistPath = path.resolve(process.cwd(), "dist");

    // Load landing page template as fallback
    const landingTemplatePath = path.resolve(process.cwd(), "server", "templates", "landing-page.html");
    let landingPageTemplate = "";
    if (fs.existsSync(landingTemplatePath)) {
      landingPageTemplate = fs.readFileSync(landingTemplatePath, "utf-8");
      log("Production: Landing page template loaded");
    }
    const appName = getAppName();

    // Serve static assets
    app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
    app.use("/logos", express.static(path.resolve(process.cwd(), "attached_assets/generated_images")));
    app.use(express.static(path.resolve(process.cwd(), "static-build")));

    // Serve web app static files
    if (fs.existsSync(webDistPath)) {
      app.use(express.static(webDistPath));
    }

    // Also serve Expo web build static files
    if (fs.existsSync(expoDistPath)) {
      app.use(express.static(expoDistPath));
    }

    // Health check endpoint
    app.get("/api/health", (_req, res) => {
      res.json({ 
        status: "ok", 
        service: "AI Run Coach API",
        version: "2.0.0"
      });
    });

    // SPA fallback: serve web app for browsers, Expo build for mobile
    app.get("*", (req: Request, res: Response) => {
      if (req.path.startsWith("/api")) return;

      // Browser requests: serve web app or landing page
      if (isBrowserRequest(req)) {
        const webIndexPath = path.resolve(webDistPath, "index.html");
        if (fs.existsSync(webIndexPath)) {
          return res.sendFile(webIndexPath);
        }
        // Fallback: serve landing page
        if (landingPageTemplate) {
          return serveLandingPage({ req, res, landingPageTemplate, appName });
        }
      }

      // Mobile/Expo requests: serve Expo web build
      const expoIndexPath = path.resolve(expoDistPath, "index.html");
      if (fs.existsSync(expoIndexPath)) {
        return res.sendFile(expoIndexPath);
      }

      // Final fallback: landing page for any request
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

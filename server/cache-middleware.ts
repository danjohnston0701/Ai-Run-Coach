/**
 * Cache control middleware for API responses
 * ⚡ Reduces bandwidth by allowing clients to cache responses
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Middleware to set Cache-Control headers for GET requests
 * Respects HTTP caching standards to reduce bandwidth consumption
 */
export function setCacheHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests (safe to cache)
    if (req.method !== "GET") {
      return next();
    }

    // Don't cache if Authorization header is present (user-specific data)
    if (req.headers.authorization) {
      // Private cache for 1 hour (user's own data, won't change frequently)
      res.setHeader("Cache-Control", "private, max-age=3600");
      return next();
    }

    // Public data (no auth) - cache for 24 hours
    res.setHeader("Cache-Control", "public, max-age=86400");
    return next();
  };
}

/**
 * Specific cache headers for different endpoint types
 */

export function cacheRunData() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Run data: personal, but doesn't change frequently
    // Cache for 1 hour (3600 seconds)
    res.setHeader("Cache-Control", "private, max-age=3600");
    next();
  };
}

export function cacheUserData() {
  return (req: Request, res: Response, next: NextFunction) => {
    // User profile data: personal, changes occasionally
    // Cache for 30 minutes (1800 seconds)
    res.setHeader("Cache-Control", "private, max-age=1800");
    next();
  };
}

export function cacheRoutesData() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Route data: mostly static, safe to cache
    // Cache for 24 hours (86400 seconds)
    res.setHeader("Cache-Control", "public, max-age=86400");
    next();
  };
}

export function cacheGoalsData() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Goals data: personal, changes occasionally
    // Cache for 1 hour (3600 seconds)
    res.setHeader("Cache-Control", "private, max-age=3600");
    next();
  };
}

export function cacheWeatherData() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Weather data: time-sensitive but doesn't change minute-to-minute
    // Cache for 30 minutes (1800 seconds)
    res.setHeader("Cache-Control", "private, max-age=1800");
    next();
  };
}

export function noCaching() {
  return (req: Request, res: Response, next: NextFunction) => {
    // For real-time endpoints (coaching, analysis, etc.)
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  };
}

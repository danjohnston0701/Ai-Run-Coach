/**
 * Simple in-memory rate limiter for the observe endpoint
 * Tracks failed attempts by IP + code to prevent brute-force attacks
 */

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

const WINDOW_MS = 60 * 1000; // 1 minute rolling window
const MAX_ATTEMPTS = 10; // Max 10 attempts per minute per IP+code

// Map of "IP:code" -> { attempts, resetAt }
const limitMap = new Map<string, RateLimitEntry>();

/**
 * Check if a request should be rate-limited
 * @param ip Client IP address
 * @param code The invite code being guessed
 * @returns true if the request should be rejected (rate-limited)
 */
export function checkRateLimit(ip: string, code: string): boolean {
  const key = `${ip}:${code.toUpperCase()}`;
  const now = Date.now();
  
  const entry = limitMap.get(key);
  
  if (!entry) {
    // First attempt for this IP+code
    limitMap.set(key, {
      attempts: 1,
      resetAt: now + WINDOW_MS,
    });
    return false; // Allow
  }
  
  if (now > entry.resetAt) {
    // Window has expired, reset counter
    limitMap.set(key, {
      attempts: 1,
      resetAt: now + WINDOW_MS,
    });
    return false; // Allow
  }
  
  // Window is still active
  entry.attempts++;
  
  if (entry.attempts > MAX_ATTEMPTS) {
    console.warn(`[RateLimit] Rejecting request from ${ip} for code ${code} (${entry.attempts} attempts)`);
    return true; // Reject
  }
  
  return false; // Allow
}

/**
 * Record a failed attempt for rate limiting
 * @param ip Client IP address
 * @param code The invite code being guessed
 */
export function recordRateLimitFailure(ip: string, code: string): void {
  // This is automatically handled by checkRateLimit
  checkRateLimit(ip, code);
}

/**
 * Clean up old entries to prevent memory leak (optional, can be called periodically)
 */
export function cleanupExpiredRateLimitEntries(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of limitMap.entries()) {
    if (now > entry.resetAt + WINDOW_MS) {
      limitMap.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

// Optional: Clean up every 5 minutes
setInterval(() => {
  const cleaned = cleanupExpiredRateLimitEntries();
  if (cleaned > 0) {
    console.log(`[RateLimit] Cleaned up ${cleaned} expired entries`);
  }
}, 5 * 60 * 1000);

/**
 * Passive Observer Tracking
 * 
 * Counts active observers based on polling activity.
 * Each observer is identified by a unique client ID (IP or user ID).
 * Observers are considered active if they've polled within the last ~10 seconds.
 * 
 * This approach:
 * - Requires NO explicit join/leave calls from clients
 * - Self-corrects when clients crash or disconnect
 * - Works with existing polling patterns
 * - Automatically cleans up stale entries
 */

const OBSERVER_TIMEOUT_MS = 10000; // 10 seconds
const CLEANUP_INTERVAL_MS = 30000; // Clean up every 30 seconds

// Map: sessionId -> Map<clientId, lastPollTimestamp>
const observerActivity = new Map<string, Map<string, number>>();

/**
 * Record an observer's poll activity for a live session
 * @param sessionId The live session ID
 * @param clientId Unique identifier (IP address or user ID)
 * @returns Current active observer count after recording activity
 */
export function recordObserverActivity(sessionId: string, clientId: string): number {
  if (!sessionId || !clientId) return 0;

  // Initialize session map if needed
  if (!observerActivity.has(sessionId)) {
    observerActivity.set(sessionId, new Map());
  }

  const sessionObservers = observerActivity.get(sessionId)!;
  
  // Record this observer's poll timestamp
  sessionObservers.set(clientId, Date.now());

  // Clean up inactive observers from this session (within 10s threshold)
  const now = Date.now();
  const inactive: string[] = [];
  
  for (const [id, lastPoll] of sessionObservers.entries()) {
    if (now - lastPoll > OBSERVER_TIMEOUT_MS) {
      inactive.push(id);
    }
  }

  // Remove inactive observers
  for (const id of inactive) {
    sessionObservers.delete(id);
  }

  // Return current count
  return sessionObservers.size;
}

/**
 * Get current observer count for a session
 * @param sessionId The live session ID
 * @returns Active observer count (observers polled within last 10s)
 */
export function getObserverCount(sessionId: string): number {
  if (!sessionId) return 0;

  const sessionObservers = observerActivity.get(sessionId);
  if (!sessionObservers) return 0;

  // Clean up and return
  const now = Date.now();
  let activeCount = 0;

  for (const [id, lastPoll] of sessionObservers.entries()) {
    if (now - lastPoll > OBSERVER_TIMEOUT_MS) {
      sessionObservers.delete(id);
    } else {
      activeCount++;
    }
  }

  return activeCount;
}

/**
 * Clear all observer activity for a session (e.g., when session ends)
 * @param sessionId The live session ID
 */
export function clearSessionActivity(sessionId: string): void {
  observerActivity.delete(sessionId);
}

/**
 * Periodically persist observer counts to database
 * Called by background job to ensure counts survive server restarts
 */
export function getSessionCounts(): Map<string, number> {
  const counts = new Map<string, number>();

  const now = Date.now();
  for (const [sessionId, observers] of observerActivity.entries()) {
    let activeCount = 0;

    for (const [id, lastPoll] of observers.entries()) {
      if (now - lastPoll > OBSERVER_TIMEOUT_MS) {
        observers.delete(id);
      } else {
        activeCount++;
      }
    }

    if (activeCount > 0) {
      counts.set(sessionId, activeCount);
    }
  }

  return counts;
}

/**
 * Cleanup job - removes stale sessions with no observers
 * Run periodically to prevent memory bloat
 */
export function cleanupStaleActivity(): number {
  let removed = 0;

  for (const [sessionId, observers] of observerActivity.entries()) {
    if (observers.size === 0) {
      observerActivity.delete(sessionId);
      removed++;
    }
  }

  return removed;
}

// Start background cleanup job
let cleanupJob: NodeJS.Timer | null = null;

export function startCleanupJob(db: any): void {
  if (cleanupJob) return; // Already running

  cleanupJob = setInterval(async () => {
    try {
      // Clean in-memory stale entries
      const removed = cleanupStaleActivity();
      
      // Optionally persist counts to DB for recovery after restart
      // (commented out — requires database module)
      // const counts = getSessionCounts();
      // for (const [sessionId, count] of counts.entries()) {
      //   await db.update(liveRunSessions)
      //     .set({ observerCount: count })
      //     .where(eq(liveRunSessions.id, sessionId));
      // }

      if (removed > 0) {
        console.log(`[Observer Tracking] Cleaned up ${removed} stale session entries`);
      }
    } catch (err) {
      console.error("[Observer Tracking] Cleanup job error:", err);
    }
  }, CLEANUP_INTERVAL_MS);

  console.log("[Observer Tracking] Cleanup job started (runs every 30s)");
}

export function stopCleanupJob(): void {
  if (cleanupJob) {
    clearInterval(cleanupJob);
    cleanupJob = null;
    console.log("[Observer Tracking] Cleanup job stopped");
  }
}

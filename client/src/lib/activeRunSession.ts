export interface ActiveRunSession {
  id: string;
  startTimestamp: number;
  elapsedSeconds: number;
  pausedDurationMs?: number; // Total milliseconds spent paused
  distanceKm: number;
  cadence: number;
  routeId: string;
  routeName: string;
  routePolyline: string;
  routeWaypoints: Array<{ lat: number; lng: number }>;
  startLat: number;
  startLng: number;
  targetDistance: string;
  levelId: string;
  targetTimeSeconds: number;
  exerciseType?: 'running' | 'walking';
  eventId?: string; // ID of the event if running as part of an event
  audioEnabled: boolean;
  aiCoachEnabled: boolean;
  kmSplits: number[];
  lastKmAnnounced: number;
  status: 'active' | 'paused' | 'completed';
  // GPS backup - downsampled to save localStorage space
  gpsTrackBackup?: Array<{ lat: number; lng: number; timestamp?: number }>;
  // Weather data captured during run
  weatherData?: any;
  // Pace data for each km
  paceData?: Array<{ km: number; pace: string; paceSeconds: number; cumulativeTime: number }>;
  // Last successful database sync timestamp
  lastDbSyncAt?: number;
  // Number of failed sync attempts
  failedSyncAttempts?: number;
}

const STORAGE_KEY = 'activeRunSession';
const MAX_AGE_HOURS = 12;

export function saveActiveRunSession(session: ActiveRunSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save active run session:', e);
  }
}

export function loadActiveRunSession(): ActiveRunSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const session: ActiveRunSession = JSON.parse(stored);
    
    const ageHours = (Date.now() - session.startTimestamp) / (1000 * 60 * 60);
    if (ageHours > MAX_AGE_HOURS) {
      clearActiveRunSession();
      return null;
    }
    
    if (session.status === 'completed') {
      clearActiveRunSession();
      return null;
    }
    
    return session;
  } catch (e) {
    console.error('Failed to load active run session:', e);
    return null;
  }
}

export function clearActiveRunSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear active run session:', e);
  }
}

export function hasActiveRunSession(): boolean {
  return loadActiveRunSession() !== null;
}

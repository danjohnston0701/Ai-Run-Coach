// Data Streamer Service — Backend communication for run data
import { storage } from '@utils/storage';
import { RunMetrics } from '@types/index';

const API_BASE = 'https://api.airuncoach.live/api/garmin-companion';

interface StreamSession {
  sessionId: string;
  authToken: string;
  lastStreamTime: number;
}

export class DataStreamer {
  private session: StreamSession | null = null;
  private streamInterval: NodeJS.Timer | null = null;
  private pendingData: RunMetrics | null = null;

  constructor() {
    this.initializeSession();
  }

  private initializeSession(): void {
    const sessionId = storage.getSessionId();
    const authToken = storage.getAuthToken();

    if (sessionId && authToken) {
      this.session = {
        sessionId,
        authToken,
        lastStreamTime: Date.now(),
      };
    }
  }

  async startSession(): Promise<boolean> {
    const authToken = storage.getAuthToken();
    if (!authToken) {
      console.warn('No auth token available');
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        console.error('Failed to start session:', response.status);
        return false;
      }

      const data = await response.json();
      this.session = {
        sessionId: data.sessionId,
        authToken: authToken,
        lastStreamTime: Date.now(),
      };

      storage.setSessionId(data.sessionId);
      console.log('✓ Session started:', this.session.sessionId);
      return true;
    } catch (e) {
      console.error('Failed to start session:', e);
      return false;
    }
  }

  async endSession(): Promise<void> {
    if (!this.session) return;

    try {
      await fetch(`${API_BASE}/session/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.authToken}`,
        },
        body: JSON.stringify({
          sessionId: this.session.sessionId,
        }),
      });

      console.log('✓ Session ended');
      this.session = null;
    } catch (e) {
      console.error('Failed to end session:', e);
    }
  }

  sendData(metrics: RunMetrics): void {
    if (!this.session) {
      console.warn('No session active');
      return;
    }

    this.pendingData = metrics;
    this.flushData();
  }

  updateGPS(latitude: number, longitude: number, altitude?: number): void {
    if (this.pendingData) {
      this.pendingData.latitude = latitude;
      this.pendingData.longitude = longitude;
      if (altitude !== undefined) {
        this.pendingData.altitude = altitude;
      }
    }
  }

  private async flushData(): Promise<void> {
    if (!this.session || !this.pendingData) return;

    const now = Date.now();
    // Stream data every second
    if (now - this.session.lastStreamTime < 1000) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.authToken}`,
        },
        body: JSON.stringify({
          sessionId: this.session.sessionId,
          timestamp: now,
          metrics: this.pendingData,
        }),
      });

      if (!response.ok) {
        console.error('Failed to stream data:', response.status);
        if (response.status === 401) {
          // Token expired
          this.session = null;
          storage.removeValue('authToken');
        }
      }

      this.session.lastStreamTime = now;
    } catch (e) {
      console.error('Failed to send data:', e);
    }
  }

  startStreaming(): void {
    if (this.streamInterval) return;

    this.streamInterval = setInterval(() => {
      this.flushData();
    }, 250);

    console.log('✓ Data streaming started');
  }

  stopStreaming(): void {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
      console.log('✓ Data streaming stopped');
    }
  }

  isSessionActive(): boolean {
    return this.session !== null;
  }

  getSessionId(): string | null {
    return this.session?.sessionId || null;
  }
}

export const dataStreamer = new DataStreamer();

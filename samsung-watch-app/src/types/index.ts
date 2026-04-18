// Samsung Watch App Types

export interface RunMetrics {
  heartRate: number;
  heartRateZone: number;
  distance: number;
  pace: number;
  cadence: number;
  elapsedTime: number;
  altitude?: number;
  latitude?: number;
  longitude?: number;
}

export interface CoachingData {
  runType: string;
  targetPace: string;
  targetPaceSec: number;
  workoutType: string;
  workoutDesc: string;
  distance: number;
}

export interface AuthToken {
  token: string;
  sessionId: string;
  runnerId?: string;
  runnerName?: string;
  expiresAt: number;
}

export interface RunState {
  isRunning: boolean;
  isPaused: boolean;
  elapsedTime: number;
  isCoached: boolean;
}

export interface PhoneMessage {
  type: 'auth' | 'preparedRun' | 'runUpdate' | 'coachingCue' | 'disconnect' | 'sessionEnded';
  data: Record<string, any>;
}

export interface WatchMessage {
  type: 'ping' | 'runData' | 'startRun' | 'pauseRun' | 'resumeRun' | 'stopRun' | 'requestAuth';
  data?: Record<string, any>;
}

export type HeartRateZone = 1 | 2 | 3 | 4 | 5;

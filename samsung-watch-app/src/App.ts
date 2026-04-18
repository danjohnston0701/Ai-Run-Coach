// Main App Controller — Orchestrates all components
import { phoneLink } from '@services/PhoneLink';
import { dataStreamer } from '@services/DataStreamer';
import { storage } from '@utils/storage';
import { RunScreen } from '@components/RunScreen';
import { RunMetrics, RunState, PhoneMessage, CoachingData } from '@types/index';

export class App {
  private runScreen: RunScreen;
  private runState: RunState = {
    isRunning: false,
    isPaused: false,
    elapsedTime: 0,
    isCoached: false,
  };
  private currentMetrics: RunMetrics = {
    heartRate: 0,
    heartRateZone: 1,
    distance: 0,
    pace: 0,
    cadence: 0,
    elapsedTime: 0,
  };
  private updateInterval: NodeJS.Timer | null = null;
  private lastUpdateTime = Date.now();

  constructor() {
    this.runScreen = new RunScreen('app');
    this.setupEventListeners();
    this.setupPhoneLink();
    this.startUpdateLoop();
  }

  private setupEventListeners(): void {
    // Watch button listeners
    document.addEventListener('rotarydetent', (e: any) => {
      this.onRotaryDetent(e);
    });

    document.addEventListener('click', (e: any) => {
      if (e.target.id === 'start-btn') {
        this.startRun();
      } else if (e.target.id === 'pause-btn') {
        this.pauseRun();
      } else if (e.target.id === 'stop-btn') {
        this.stopRun();
      }
    });

    // Hardware back button
    document.addEventListener('tizenhwkey', (e: any) => {
      if (e.keyName === 'back') {
        if (this.runState.isRunning) {
          this.pauseRun();
        } else {
          tizen.application.getCurrentApplication().exit();
        }
      }
    });
  }

  private setupPhoneLink(): void {
    phoneLink.on('connected', () => {
      console.log('📱 Connected to phone');
    });

    phoneLink.on('authenticated', (data: any) => {
      const token = data.authToken;
      const name = data.runnerName;
      storage.setAuthToken(token);
      if (name) {
        storage.setRunnerName(name);
      }
      console.log('✓ Authenticated:', name);
    });

    phoneLink.on('coachingMode', (data: any) => {
      this.runState.isCoached = true;
      const coachingData: CoachingData = {
        runType: data.runType || 'coached',
        targetPace: data.targetPace || '',
        targetPaceSec: this.parsePace(data.targetPace || ''),
        workoutType: data.workoutType || '',
        workoutDesc: data.workoutDesc || '',
        distance: data.distance || 0,
      };
      this.runScreen.setCoachingData(coachingData);
      console.log('🎯 Coaching mode activated');
    });

    phoneLink.on('coachingCue', (data: any) => {
      if (data.cue) {
        this.runScreen.setCoachingCue(data.cue);
        this.runScreen.setPulseBoost(1.0);
        console.log('💡 Coaching cue:', data.cue);
      }
    });

    phoneLink.on('disconnected', () => {
      console.log('📱 Disconnected from phone');
    });

    phoneLink.on('sessionEnded', () => {
      this.stopRun();
    });
  }

  private startUpdateLoop(): void {
    this.updateInterval = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - this.lastUpdateTime;

      // Update elapsed time if running
      if (this.runState.isRunning && !this.runState.isPaused) {
        this.runState.elapsedTime += deltaMs / 1000;
        this.currentMetrics.elapsedTime = this.runState.elapsedTime;
      }

      // Request sensor data (HR, location) from Tizen
      this.requestSensorData();

      // Stream data if running
      if (this.runState.isRunning && !this.runState.isPaused) {
        this.dataStreamer.sendData(this.currentMetrics);
      }

      // Update UI
      this.runScreen.update(this.currentMetrics, this.runState, now);

      this.lastUpdateTime = now;
    }, 250); // Update every 250ms like Garmin
  }

  private requestSensorData(): void {
    // In a real implementation, this would query Tizen sensors
    // For now, we'll use simulated data for testing

    if (this.runState.isRunning && !this.runState.isPaused) {
      // Simulate increasing heart rate and pace
      if (Math.random() > 0.8) {
        this.currentMetrics.heartRate = Math.min(180, this.currentMetrics.heartRate + Math.random() * 5 - 2);
      }

      if (Math.random() > 0.7) {
        this.currentMetrics.cadence = Math.max(140, Math.min(200, this.currentMetrics.cadence + Math.random() * 4 - 2));
      }

      // Simulate distance and pace
      this.currentMetrics.pace = 300 + Math.sin(Date.now() / 10000) * 30;
      this.currentMetrics.distance += 0.25; // Roughly 1 km every 250 updates (about 1 min)
    }
  }

  startRun(): void {
    if (this.runState.isRunning) return;

    this.runState.isRunning = true;
    this.runState.isPaused = false;
    this.runState.elapsedTime = 0;
    this.currentMetrics.elapsedTime = 0;

    // Start session
    dataStreamer.startSession().then((success) => {
      if (success) {
        dataStreamer.startStreaming();
        console.log('▶️ Run started');

        // Notify phone
        phoneLink.sendCommand('start');
      }
    });
  }

  pauseRun(): void {
    if (!this.runState.isRunning || this.runState.isPaused) return;

    this.runState.isPaused = true;
    dataStreamer.stopStreaming();
    phoneLink.sendCommand('pause');
    console.log('⏸️  Run paused');
  }

  resumeRun(): void {
    if (!this.runState.isPaused) return;

    this.runState.isPaused = false;
    dataStreamer.startStreaming();
    phoneLink.sendCommand('resume');
    console.log('▶️ Run resumed');
  }

  stopRun(): void {
    if (!this.runState.isRunning) return;

    this.runState.isRunning = false;
    this.runState.isPaused = false;
    dataStreamer.stopStreaming();

    // End session
    dataStreamer.endSession();
    phoneLink.sendCommand('stop');
    console.log('⏹️ Run stopped');

    // Reset metrics
    this.currentMetrics = {
      heartRate: 0,
      heartRateZone: 1,
      distance: 0,
      pace: 0,
      cadence: 0,
      elapsedTime: 0,
    };
    this.runState.elapsedTime = 0;
  }

  private onRotaryDetent(e: any): void {
    // Rotary input for menu navigation
    const direction = e.detail.direction; // 'CW' or 'CCW'
    console.log('Rotary input:', direction);

    // Could use this for menu navigation in future
  }

  private parsePace(paceStr: string): number {
    const parts = paceStr.split(':');
    if (parts.length !== 2) return 0;

    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);

    if (isNaN(minutes) || isNaN(seconds)) return 0;
    return minutes * 60 + seconds;
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new App();
  });
} else {
  new App();
}

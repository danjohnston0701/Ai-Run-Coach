// Phone Link Service — Communication with Android companion app
import { EventEmitter } from 'eventemitter2';
import { PhoneMessage, WatchMessage } from '@types/index';

export class PhoneLink extends EventEmitter {
  private isConnected = false;
  private pendingMessages: WatchMessage[] = [];

  constructor() {
    super();
    this.initializePhoneLink();
  }

  private initializePhoneLink(): void {
    if (typeof tizen !== 'undefined' && tizen.messageport) {
      try {
        // Register message port for receiving messages from phone app
        const localPort = tizen.messageport.requestLocalMessagePort('com.airuncoach.watch');
        localPort.onreceived = (remotePort: any, data: string[]) => {
          this.handlePhoneMessage(data);
        };

        // Find phone app's message port
        tizen.messageport.requestRemoteMessagePort('com.airuncoach', 'phone-link').then(
          (remotePort: any) => {
            this.isConnected = true;
            console.log('✓ Phone link connected');
            this.emit('connected');
            this.flushPendingMessages(remotePort);
          },
          (error: any) => {
            console.warn('Phone app not found or not connected:', error);
            // Retry after a delay
            setTimeout(() => this.initializePhoneLink(), 5000);
          }
        );
      } catch (e) {
        console.error('Failed to initialize phone link:', e);
      }
    }
  }

  private handlePhoneMessage(data: string[]): void {
    try {
      // data is an array of strings sent from phone app
      const message: PhoneMessage = JSON.parse(data[0]);
      console.log('📱 Phone message received:', message.type);
      this.emit('message', message);

      switch (message.type) {
        case 'auth':
          this.emit('authenticated', message.data);
          break;
        case 'preparedRun':
          this.emit('coachingMode', message.data);
          break;
        case 'coachingCue':
          this.emit('coachingCue', message.data);
          break;
        case 'disconnect':
          this.isConnected = false;
          this.emit('disconnected');
          break;
        case 'sessionEnded':
          this.emit('sessionEnded');
          break;
      }
    } catch (e) {
      console.error('Failed to parse phone message:', e);
    }
  }

  private flushPendingMessages(remotePort: any): void {
    while (this.pendingMessages.length > 0) {
      const msg = this.pendingMessages.shift();
      if (msg) {
        try {
          remotePort.sendMessage([JSON.stringify(msg)]);
        } catch (e) {
          console.error('Failed to send pending message:', e);
        }
      }
    }
  }

  sendCommand(command: 'start' | 'pause' | 'resume' | 'stop'): void {
    const message: WatchMessage = {
      type:
        command === 'start'
          ? 'startRun'
          : command === 'pause'
            ? 'pauseRun'
            : command === 'resume'
              ? 'resumeRun'
              : 'stopRun',
    };
    this.sendMessage(message);
  }

  sendRunData(data: Record<string, any>): void {
    const message: WatchMessage = {
      type: 'runData',
      data,
    };
    this.sendMessage(message);
  }

  requestAuth(): void {
    const message: WatchMessage = {
      type: 'requestAuth',
    };
    this.sendMessage(message);
  }

  private sendMessage(message: WatchMessage): void {
    if (this.isConnected && typeof tizen !== 'undefined' && tizen.messageport) {
      try {
        tizen.messageport
          .requestRemoteMessagePort('com.airuncoach', 'phone-link')
          .then((remotePort: any) => {
            remotePort.sendMessage([JSON.stringify(message)]);
          });
      } catch (e) {
        console.error('Failed to send message:', e);
        this.pendingMessages.push(message);
      }
    } else {
      this.pendingMessages.push(message);
    }
  }

  isPhoneConnected(): boolean {
    return this.isConnected;
  }
}

export const phoneLink = new PhoneLink();

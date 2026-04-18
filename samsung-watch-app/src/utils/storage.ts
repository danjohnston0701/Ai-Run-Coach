// Storage utility for Samsung watch persistent data

export class StorageManager {
  private prefix = 'airuncoach_';

  getValue(key: string): string | null {
    try {
      const stored = localStorage.getItem(`${this.prefix}${key}`);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error(`Failed to retrieve ${key}:`, e);
      return null;
    }
  }

  setValue(key: string, value: any): void {
    try {
      localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to store ${key}:`, e);
    }
  }

  removeValue(key: string): void {
    try {
      localStorage.removeItem(`${this.prefix}${key}`);
    } catch (e) {
      console.error(`Failed to remove ${key}:`, e);
    }
  }

  clear(): void {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
  }

  // Auth helpers
  getAuthToken(): string | null {
    return this.getValue('authToken');
  }

  setAuthToken(token: string): void {
    this.setValue('authToken', token);
  }

  getSessionId(): string | null {
    return this.getValue('sessionId');
  }

  setSessionId(id: string): void {
    this.setValue('sessionId', id);
  }

  getRunnerName(): string | null {
    return this.getValue('runnerName');
  }

  setRunnerName(name: string): void {
    this.setValue('runnerName', name);
  }
}

export const storage = new StorageManager();

import { loadCoachSettings, saveCoachSettings, type AiCoachSettings } from './coachSettings';

function getMigrationKey(userId: string): string {
  return `dataMigrationCompleted_v1_${userId}`;
}

export async function migrateLocalDataToDatabase(userId: string): Promise<{ runs: number; settings: boolean }> {
  const result = { runs: 0, settings: false };
  const migrationKey = getMigrationKey(userId);
  
  if (localStorage.getItem(migrationKey)) {
    return result;
  }
  
  let allSucceeded = true;
  
  try {
    const runsMigrated = await migrateRuns(userId);
    result.runs = runsMigrated;
  } catch (err) {
    console.error('Run migration failed:', err);
    allSucceeded = false;
  }
  
  try {
    const settingsMigrated = await migrateCoachSettings(userId);
    result.settings = settingsMigrated;
    if (!settingsMigrated) {
      allSucceeded = false;
    }
  } catch (err) {
    console.error('Coach settings migration failed:', err);
    allSucceeded = false;
  }
  
  if (allSucceeded && (result.runs > 0 || result.settings)) {
    localStorage.setItem(migrationKey, new Date().toISOString());
    console.log(`Data migration complete for user ${userId}: ${result.runs} runs, settings: ${result.settings}`);
  } else if (result.runs === 0 && !hasUnsyncedLocalData()) {
    localStorage.setItem(migrationKey, new Date().toISOString());
    console.log(`No data to migrate for user ${userId}`);
  }
  
  return result;
}

function hasUnsyncedLocalData(): boolean {
  const runHistory = localStorage.getItem('runHistory');
  if (runHistory) {
    try {
      const runs = JSON.parse(runHistory);
      if (runs.some((r: any) => !r.dbSynced)) {
        return true;
      }
    } catch {}
  }
  return false;
}

async function migrateRuns(userId: string): Promise<number> {
  const runHistory = localStorage.getItem('runHistory');
  if (!runHistory) return 0;
  
  try {
    const runs = JSON.parse(runHistory);
    const unsyncedRuns = runs.filter((run: any) => !run.dbSynced);
    
    if (unsyncedRuns.length === 0) return 0;
    
    let migratedCount = 0;
    const updatedRuns = [...runs];
    
    for (const run of unsyncedRuns) {
      try {
        const dbRunData = {
          userId,
          distance: run.distance || 0,
          duration: run.totalTime || 0,
          avgPace: run.avgPace || '',
          cadence: run.cadence || undefined,
          elevation: run.elevationGain || undefined,
          difficulty: run.difficulty || 'beginner',
          startLat: run.lat || undefined,
          startLng: run.lng || undefined,
          gpsTrack: run.gpsTrack || undefined,
          paceData: run.kmSplits || undefined,
          weatherData: run.weatherData || undefined,
          eventId: run.eventId || undefined,
        };
        
        const response = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbRunData),
        });
        
        if (response.ok) {
          const savedRun = await response.json();
          const runIndex = updatedRuns.findIndex((r: any) => r.id === run.id);
          if (runIndex !== -1) {
            updatedRuns[runIndex] = {
              ...updatedRuns[runIndex],
              id: savedRun.id,
              dbSynced: true,
            };
          }
          migratedCount++;
        }
      } catch (err) {
        console.warn(`Failed to migrate run ${run.id}:`, err);
      }
    }
    
    localStorage.setItem('runHistory', JSON.stringify(updatedRuns));
    return migratedCount;
  } catch (err) {
    console.error('Failed to parse run history:', err);
    return 0;
  }
}

async function migrateCoachSettings(userId: string): Promise<boolean> {
  try {
    const localSettings = loadCoachSettings();
    
    const response = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coachGender: localSettings.gender,
        coachAccent: localSettings.accent,
        coachTone: localSettings.tone,
      }),
    });
    
    return response.ok;
  } catch (err) {
    console.error('Failed to migrate coach settings:', err);
    return false;
  }
}

export function resetMigrationFlag(userId: string): void {
  localStorage.removeItem(getMigrationKey(userId));
}

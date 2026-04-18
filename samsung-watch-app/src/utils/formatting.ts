// Formatting utilities for watch display

export const formatTime = (seconds: number): string => {
  if (seconds < 0) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const formatPace = (secPerKm: number): string => {
  if (secPerKm <= 0 || secPerKm > 1200) return '--:--';
  
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.floor(secPerKm % 60);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatDistance = (meters: number): string => {
  const km = meters / 1000;
  return km.toFixed(2);
};

export const formatHeartRate = (hr: number): string => {
  return hr > 0 ? hr.toString() : '--';
};

export const formatCadence = (cadence: number): string => {
  return cadence > 0 ? `${cadence} spm` : '-- spm';
};

export const getHeartRateZone = (hr: number): 1 | 2 | 3 | 4 | 5 => {
  const pct = (hr / 185) * 100;
  if (pct < 60) return 1;
  if (pct < 70) return 2;
  if (pct < 80) return 3;
  if (pct < 90) return 4;
  return 5;
};

export const getZoneColor = (zone: 1 | 2 | 3 | 4 | 5): string => {
  const colors: Record<number, string> = {
    1: '#2979FF', // Blue
    2: '#00E676', // Green
    3: '#FFD740', // Amber
    4: '#FF6D00', // Orange
    5: '#F44336', // Red
  };
  return colors[zone];
};

export const getPaceDeviationColor = (targetPaceSec: number, currentPace: number): string => {
  if (targetPaceSec <= 0 || currentPace <= 0) return '#FFFFFF';
  
  const diff = Math.abs(currentPace - targetPaceSec);
  const pct = (diff / targetPaceSec) * 100;
  
  if (pct <= 5) return '#00E676'; // Green — on target
  if (pct <= 12) return '#FFD740'; // Amber — slightly off
  return '#F44336'; // Red — significantly off
};

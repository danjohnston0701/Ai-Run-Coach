/**
 * FIT File Generator
 * Converts AI Run Coach run data to FIT format for Strava upload
 * 
 * FIT (Flexible and Interoperable Data Transfer) is a binary file format used by:
 * - Garmin devices
 * - Strava (accepts FIT files for rich activity data)
 * 
 * FIT files contain: GPS track, HR, cadence, power, temperature, elevation
 * Strava uses these to generate route maps and analyze performance
 */

import { Run } from '@shared/schema';

interface FitGeneratorOptions {
  deviceName?: string;
  manufacturerId?: number;
}

/**
 * Simple FIT file builder (fit-file library)
 * Creates a minimal but valid FIT file structure
 */
export async function generateFitFile(
  run: Run,
  options: FitGeneratorOptions = {}
): Promise<Buffer> {
  const {
    deviceName = 'AI Run Coach',
    manufacturerId = 255, // 255 = Unknown/Custom manufacturer
  } = options;

  // fit-file library for FIT generation
  const FitFile = require('fit-file');
  const fit = new FitFile();

  const startTime = Math.floor(run.completedAt?.getTime() / 1000 || Date.now() / 1000);
  const endTime = startTime + (run.duration || run.elapsedTime || 0);

  // File Header
  fit.addRecord('FileId', {
    type: 4, // activity
    manufacturer: manufacturerId,
    product: 256,
    serialNumber: Math.floor(Math.random() * 1000000000),
    timeCreated: startTime,
    dataType: 0x80, // FIT
  });

  // File Info / Device Info
  fit.addRecord('DeviceInfo', {
    timestamp: startTime,
    deviceIndex: 0,
    manufacturer: manufacturerId,
    product: 256,
    serialNumber: Math.floor(Math.random() * 1000000000),
    hardwareVersion: 1,
    softwareVersion: 100,
  });

  // Session (Summary stats)
  fit.addRecord('Session', {
    timestamp: endTime,
    startTime,
    sport: 1, // running
    subSport: 13, // trail running
    totalDistance: (run.distance || 0) * 1000, // meters
    totalElapsedTime: (run.elapsedTime || run.duration || 0) * 1000, // milliseconds
    totalTimerTime: (run.movingTime || run.duration || 0) * 1000,
    numActiveLaps: 1,
    avgSpeed: run.avgSpeed || 0,
    maxSpeed: run.maxSpeed || 0,
    avgHeartRate: run.avgHeartRate || 0,
    maxHeartRate: run.maxHeartRate || 0,
    avgCadence: run.cadence || 0,
    totalAscent: Math.round(run.elevationGain || 0),
    totalDescent: Math.round(run.elevationLoss || 0),
    messageIndex: 0,
  });

  // Lap
  fit.addRecord('Lap', {
    timestamp: endTime,
    startTime,
    sport: 1, // running
    totalDistance: (run.distance || 0) * 1000,
    totalElapsedTime: (run.elapsedTime || run.duration || 0) * 1000,
    totalTimerTime: (run.movingTime || run.duration || 0) * 1000,
    avgSpeed: run.avgSpeed || 0,
    maxSpeed: run.maxSpeed || 0,
    avgHeartRate: run.avgHeartRate || 0,
    maxHeartRate: run.maxHeartRate || 0,
    avgCadence: run.cadence || 0,
    messageIndex: 0,
  });

  // Add trackpoints (GPS data, HR, cadence)
  if (run.gpsTrack && Array.isArray(run.gpsTrack)) {
    const gpsTrack = run.gpsTrack as any[];

    gpsTrack.forEach((point, index) => {
      const recordTimestamp = startTime + (point.timestamp || index);

      fit.addRecord('Record', {
        timestamp: recordTimestamp,
        latitude: point.lat || point.latitude,
        longitude: point.lng || point.longitude,
        altitude: Math.round(point.elevation || point.altitude || 0),
        distance: point.distance || (index / gpsTrack.length) * (run.distance || 0) * 1000,
        speed: point.speed || 0,
        heartRate: point.heartRate || 0,
        cadence: point.cadence || 0,
        temperature: point.temperature || undefined,
        power: (point as any).power || undefined,
      });
    });
  }

  return fit.toBuffer();
}

/**
 * Alternative: GPX File Generation (simpler, XML-based)
 * Use if FIT binary format is problematic
 */
export function generateGpxFile(run: Run): string {
  const startTime = run.completedAt || new Date();
  const gpsTrack = (run.gpsTrack || []) as any[];

  let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AI Run Coach"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  
  <metadata>
    <name>${run.name || 'Run'}</name>
    <time>${startTime.toISOString()}</time>
  </metadata>

  <trk>
    <name>${run.name || 'Run'}</name>
    <trkseg>`;

  gpsTrack.forEach((point) => {
    const lat = point.lat || point.latitude;
    const lng = point.lng || point.longitude;
    const ele = point.elevation || point.altitude;
    const time = point.time || startTime.toISOString();
    const hr = point.heartRate ? `<hr>${point.heartRate}</hr>` : '';

    gpxContent += `
      <trkpt lat="${lat}" lon="${lng}">
        <ele>${ele}</ele>
        <time>${time}</time>
        ${hr}
      </trkpt>`;
  });

  gpxContent += `
    </trkseg>
  </trk>
</gpx>`;

  return gpxContent;
}

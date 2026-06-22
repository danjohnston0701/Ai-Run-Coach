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
 * Generate FIT file using @garmin/fitsdk
 * Creates a minimal but valid FIT file structure
 */
export async function generateFitFile(
  run: Run,
  options: FitGeneratorOptions = {}
): Promise<Buffer> {
  try {
    const {
      deviceName = 'AI Run Coach',
      manufacturerId = 255, // 255 = Unknown/Custom manufacturer
    } = options;

    // Import Garmin FIT SDK for FIT file generation
    const { Encoder, enums } = await import('@garmin/fitsdk');
    
    const encoder = new Encoder();
    
    const startTime = Math.floor(run.completedAt?.getTime() / 1000 || Date.now() / 1000);
    const endTime = startTime + (run.duration || run.elapsedTime || 0);
    
    // File ID message
    encoder.write({
      name: 'file_id',
      type: enums.File.ACTIVITY,
      manufacturer: enums.Manufacturer.DEVELOPMENT,
      product: 1,
      serial_number: Math.floor(Math.random() * 1000000000),
      time_created: startTime,
    });
    
    // Device Info message
    encoder.write({
      name: 'device_info',
      timestamp: startTime,
      device_index: 0,
      manufacturer: enums.Manufacturer.DEVELOPMENT,
      device_type: enums.DeviceType.WATCH,
      hardware_version: 1,
      software_version: 100,
    });
    
    // Session message (summary)
    encoder.write({
      name: 'session',
      timestamp: endTime,
      start_time: startTime,
      sport: enums.Sport.RUNNING,
      sub_sport: enums.SubSport.RUN,
      total_distance: (run.distance || 0) * 1000, // meters
      total_elapsed_time: (run.elapsedTime || run.duration || 0) * 1000, // milliseconds
      total_timer_time: (run.movingTime || run.duration || 0) * 1000,
      num_active_laps: 1,
      avg_speed: run.avgSpeed || 0,
      max_speed: run.maxSpeed || 0,
      avg_heart_rate: Math.round(run.avgHeartRate || 0),
      max_heart_rate: Math.round(run.maxHeartRate || 0),
      avg_cadence: Math.round(run.cadence || 0),
      total_ascent: Math.round(run.elevationGain || 0),
      total_descent: Math.round(run.elevationLoss || 0),
      message_index: 0,
    });
    
    // Lap message
    encoder.write({
      name: 'lap',
      timestamp: endTime,
      start_time: startTime,
      sport: enums.Sport.RUNNING,
      sub_sport: enums.SubSport.RUN,
      total_distance: (run.distance || 0) * 1000,
      total_elapsed_time: (run.elapsedTime || run.duration || 0) * 1000,
      total_timer_time: (run.movingTime || run.duration || 0) * 1000,
      avg_speed: run.avgSpeed || 0,
      max_speed: run.maxSpeed || 0,
      avg_heart_rate: Math.round(run.avgHeartRate || 0),
      max_heart_rate: Math.round(run.maxHeartRate || 0),
      avg_cadence: Math.round(run.cadence || 0),
      message_index: 0,
    });
    
    // Add trackpoints (GPS records)
    if (run.gpsTrack && Array.isArray(run.gpsTrack)) {
      const gpsTrack = run.gpsTrack as any[];
      
      gpsTrack.forEach((point, index) => {
        const recordTimestamp = startTime + (point.timestamp || index);
        
        encoder.write({
          name: 'record',
          timestamp: recordTimestamp,
          position_lat: point.lat || point.latitude,
          position_long: point.lng || point.longitude,
          altitude: Math.round(point.elevation || point.altitude || 0),
          distance: point.distance || (index / gpsTrack.length) * (run.distance || 0) * 1000,
          speed: point.speed || 0,
          heart_rate: Math.round(point.heartRate || 0),
          cadence: Math.round(point.cadence || 0),
          temperature: point.temperature ? Math.round(point.temperature) : undefined,
        });
      });
    }
    
    // Get the encoded buffer
    const fitBuffer = encoder.finish();
    
    if (!fitBuffer || fitBuffer.length === 0) {
      throw new Error('FIT file generation produced empty buffer');
    }
    
    return fitBuffer;
  } catch (error: any) {
    console.error('FIT file generation error:', {
      errorMessage: error.message,
      errorStack: error.stack,
      runId: run.id,
      hasGpsTrack: !!run.gpsTrack,
      gpsTrackLength: Array.isArray(run.gpsTrack) ? run.gpsTrack.length : 0,
    });
    throw new Error(`FIT generation failed: ${error.message}`);
  }
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

/**
 * FIT File Generator
 * Converts AI Run Coach run data to GPX format (simpler alternative to FIT)
 * GPX is widely supported by Garmin, Strava, and other fitness platforms
 * 
 * GPX (GPS Exchange Format) is a text-based XML format containing:
 * - GPS track with latitude, longitude, elevation
 * - Timestamps for each trackpoint
 * - Heart rate and cadence data in extensions
 */

import { Run } from '@shared/schema';

interface FitGeneratorOptions {
  deviceName?: string;
  manufacturerId?: number;
}

/**
 * Generate GPX file from run data
 * GPX is more reliable than FIT and widely supported
 */
export async function generateFitFile(
  run: Run,
  options: FitGeneratorOptions = {}
): Promise<Buffer> {
  try {
    const { deviceName = 'AI Run Coach' } = options;

    const startTime = run.completedAt || new Date();
    const gpsTrack = (run.gpsTrack || []) as any[];

    // Build GPX XML content
    let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${deviceName}"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v2"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  
  <metadata>
    <name>${run.name || 'Run'}</name>
    <desc>Distance: ${(run.distance / 1000).toFixed(2)} km | Pace: ${run.averagePace || 'N/A'}</desc>
    <author>
      <name>${deviceName}</name>
    </author>
    <time>${startTime.toISOString()}</time>
  </metadata>

  <trk>
    <name>${run.name || 'Run'}</name>
    <desc>Distance: ${(run.distance / 1000).toFixed(2)} km | Duration: ${formatDuration(run.duration)}</desc>
    <trkseg>
`;

    // Add trackpoints
    gpsTrack.forEach((point, index) => {
      const lat = point.lat || point.latitude;
      const lng = point.lng || point.longitude;
      const ele = point.elevation || point.altitude || 0;
      
      // Calculate time for each point
      let pointTime: string;
      if (point.timestamp) {
        // If timestamp is relative (seconds since start)
        const pointDate = new Date(startTime.getTime() + (point.timestamp as number) * 1000);
        pointTime = pointDate.toISOString();
      } else {
        // Estimate based on position in track
        const fractionOfRun = index / Math.max(gpsTrack.length - 1, 1);
        const durationMs = (run.duration || run.elapsedTime || 0) * 1000;
        const pointDate = new Date(startTime.getTime() + fractionOfRun * durationMs);
        pointTime = pointDate.toISOString();
      }

      const hr = point.heartRate ? Math.round(point.heartRate) : null;
      const cad = point.cadence ? Math.round(point.cadence) : null;

      gpxContent += `      <trkpt lat="${lat}" lon="${lng}">
        <ele>${Math.round(ele)}</ele>
        <time>${pointTime}</time>`;

      // Add Garmin extensions for HR and cadence
      if (hr || cad) {
        gpxContent += '\n        <extensions>\n          <gpxtpx:TrackPointExtension>';
        if (hr) gpxContent += `\n            <gpxtpx:hr>${hr}</gpxtpx:hr>`;
        if (cad) gpxContent += `\n            <gpxtpx:cad>${cad}</gpxtpx:cad>`;
        gpxContent += '\n          </gpxtpx:TrackPointExtension>\n        </extensions>';
      }

      gpxContent += '\n      </trkpt>\n';
    });

    gpxContent += `    </trkseg>
  </trk>
</gpx>`;

    const gpxBuffer = Buffer.from(gpxContent, 'utf-8');

    if (!gpxBuffer || gpxBuffer.length === 0) {
      throw new Error('GPX file generation produced empty buffer');
    }

    return gpxBuffer;
  } catch (error: any) {
    console.error('GPX file generation error:', {
      errorMessage: error.message,
      errorStack: error.stack,
      runId: run.id,
      hasGpsTrack: !!run.gpsTrack,
      gpsTrackLength: Array.isArray(run.gpsTrack) ? run.gpsTrack.length : 0,
    });
    throw new Error(`GPX generation failed: ${error.message}`);
  }
}

/**
 * Format duration in milliseconds to readable string
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
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

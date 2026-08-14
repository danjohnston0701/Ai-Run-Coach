package live.airuncoach.airuncoach.service

/**
 * A single ~2-second biometric frame streamed from a companion watch app (Garmin Connect IQ
 * or the Wear OS/Samsung companion app — this type is brand-neutral and shared by both
 * [GarminWatchManager] and [SamsungWatchManager]). Every field maps directly to a key in the
 * watch's "watchData" message. Fields are nullable — older/lesser watch models may not
 * provide all of them.
 */
data class WatchBiometricFrame(
    val elapsedSeconds: Int,

    // GPS
    val lat: Double?,
    val lng: Double?,
    val altMetres: Double?,
    val speedMs: Float?,
    val bearingDeg: Float?,           // 0-360, 0 = North
    val gpsAccuracy: Float?,          // Garmin Pos.Quality 0-4 (4 = best)

    // Biometrics
    val heartRate: Int,               // bpm
    val heartRateZone: Int,           // 1-5
    val cadence: Int,                 // steps per minute

    // Running Dynamics (from Activity.Info — may be 0.0 if unsupported)
    val groundContactTime: Float,     // ms   (200-300 ms normal)
    val groundContactBalance: Float,  // %    (50 = perfect symmetry)
    val verticalOscillation: Float,   // cm   (6-8 cm efficient)
    val verticalRatio: Float,         // %    (8-10 % efficient)
    val strideLength: Float,          // m    per stride

    // Training Effect (updated periodically by watch firmware)
    val aerobicTrainingEffect: Float, // 0-5
    val anaerobicTrainingEffect: Float, // 0-5
    val recoveryTimeMinutes: Int,     // minutes until fully recovered
    val vo2MaxEstimate: Float,        // ml/kg/min

    // Power & Respiration (device-dependent — 0 if unsupported)
    val runningPower: Int,            // watts (Fenix 7/FR965 with Running Power app)
    val respirationRate: Float,       // breaths/min (Fenix 7 series)

    // Environmental
    val ambientPressure: Float,       // Pa (~101325 at sea level)

    // Barometric altitude — Activity.Info.altitude on Fenix/fēnix models uses the pressure
    // altimeter (more accurate than GPS altitude for elevation graphs). Falls back to GPS
    // altMetres when not available (0f = not present).
    val baroAltitude: Float = 0f,     // metres, barometric

    // Authoritative cumulative distance from the watch firmware. The watch's own filtered
    // GPS accumulation is the source of truth for distance in watch-initiated sessions.
    // Null when the watch build predates this field.
    val cumulativeDistanceM: Float? = null,  // metres
)

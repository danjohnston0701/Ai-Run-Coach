package live.airuncoach.airuncoach.wear.sensors

/**
 * Maps a raw location fix (accuracy + age) into the same 0-4 quality scale the Garmin watch
 * app uses (RunView.mc: `_gpsQuality`) — 0=No signal, 1=Last known, 2=Poor, 3=Usable, 4=Good.
 * Drives both the GPS-wait bar UI and the start-gating threshold (>=3 standalone / >=2
 * phone-connected). Pure function — unit-testable without a device.
 */
fun resolveGpsQuality(accuracyMeters: Float?, fixAgeMs: Long?): Int {
    if (accuracyMeters == null || fixAgeMs == null) return 0 // No signal — never had a fix
    if (fixAgeMs > 30_000L) return 1 // Last known — fix exists but is stale
    return when {
        accuracyMeters <= 10f && fixAgeMs < 5_000L -> 4 // Good
        accuracyMeters <= 25f && fixAgeMs < 10_000L -> 3 // Usable
        accuracyMeters <= 50f -> 2 // Poor
        else -> 1 // Last known — have a fix but it's too imprecise/stale to trust
    }
}

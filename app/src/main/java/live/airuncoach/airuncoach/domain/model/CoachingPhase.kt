package live.airuncoach.airuncoach.domain.model

enum class CoachingPhase {
    EARLY,   // First 2km OR first 10% of run
    MID,     // 3-5km OR 40-50% of run
    LATE,    // 7km+ OR 75-90% of run
    FINAL,   // Last 10% of run
    GENERIC  // Any other time
}

fun determinePhase(distanceKm: Double, totalDistanceKm: Double?): CoachingPhase {
    val percentComplete = if (totalDistanceKm != null && totalDistanceKm > 0) {
        (distanceKm / totalDistanceKm) * 100
    } else null
    
    return when {
        percentComplete != null -> when {
            percentComplete >= 90 -> CoachingPhase.FINAL
            percentComplete >= 75 -> CoachingPhase.LATE
            percentComplete in 40.0..50.0 -> CoachingPhase.MID
            percentComplete <= 10 -> CoachingPhase.EARLY
            else -> CoachingPhase.GENERIC
        }
        // Fallback for free runs (no target distance).
        // Was: gap at 2-3km returned GENERIC, meaning all short runs only ever got EARLY
        // technique cues (fired at 1.5km). Fixed: smooth transitions with no gap.
        distanceKm < 3.0 -> CoachingPhase.EARLY   // 0-3km: early / warm-up
        distanceKm < 6.0 -> CoachingPhase.MID      // 3-6km: mid effort
        distanceKm < 8.0 -> CoachingPhase.GENERIC  // 6-8km: transitional
        distanceKm >= 8.0 -> CoachingPhase.LATE    // 8km+: late effort
        else -> CoachingPhase.GENERIC
    }
}

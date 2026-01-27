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
        // Fallback for free runs (no target distance)
        distanceKm <= 2 -> CoachingPhase.EARLY
        distanceKm in 3.0..5.0 -> CoachingPhase.MID
        distanceKm > 5.0 && distanceKm < 7.0 -> CoachingPhase.GENERIC // Added for free runs between mid and late
        distanceKm >= 7.0 -> CoachingPhase.LATE // Simplified for free runs
        else -> CoachingPhase.GENERIC
    }
}

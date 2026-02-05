package live.airuncoach.airuncoach.domain.model

data class Event(
    val id: String,
    val name: String,
    val description: String?,
    val eventType: String, // "parkrun", "marathon", "5k", etc.
    val country: String,
    val city: String?,
    val routeId: String,
    val distance: Double?,
    val difficulty: String?, // "easy", "moderate", "hard"
    val startLat: Double?,
    val startLng: Double?,
    val isActive: Boolean,
    val createdAt: String,
    val scheduleType: String, // "recurring" or "one-time"
    val specificDate: String?, // For one-time events
    val recurrencePattern: String?, // "daily", "weekly", "monthly"
    val dayOfWeek: Int?, // 0-6 (Sunday-Saturday)
    val dayOfMonth: Int?, // 1-31
    val sourceRunId: String?, // If created from a completed run
    val createdByUserId: String
)

data class EventsGroupedByCountry(
    val events: Map<String, List<Event>>
)

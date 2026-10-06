package live.airuncoach.airuncoach.domain.model

data class User(
    val id: String,
    val email: String,
    val name: String,
    val shortUserId: String? = null, // Short 8-digit numeric ID for friend sharing (e.g., "12345678")
    val location: String? = null,
    val age: Int? = null,
    val dob: String? = null,
    val gender: String? = null,
    val height: Double? = null,
    val weight: Double? = null,
    val fitnessLevel: String? = null,
    val desiredFitnessLevel: String? = null,
    val coachName: String = "AI Coach",
    val coachGender: String = "male",
    val coachAccent: String = "british",
    val coachTone: String = "energetic",
    val nicknameStyle: String? = "occasional",  // "none" | "occasional" | "frequent" — nullable so Gson can handle cached JSON missing this field
    val profilePic: String? = null,
    val distanceMinKm: Float = 0f,
    val distanceMaxKm: Float = 50f,
    // 0–3 decimal places for the target-distance control. 0/1 keep the slider, 2/3 swap it for
    // a numeric field. Nullable so Gson treats cached JSON from before this field as 0.
    val targetDistanceDecimals: Int? = null,
    val subscriptionTier: String? = null,
    val subscriptionStatus: String? = null,
    // Orthogonal to subscriptionTier — false only for "no AI Plans" SKU subscribers.
    // Nullable so Gson null (legacy cached JSON / pre-migration accounts) → treated as
    // enabled by default wherever this is read, matching the coach*Enabled fields below.
    val aiPlansEnabled: Boolean? = null,
    val distanceScale: String? = null,
    // In-Run AI Coaching feature preferences (synced with server)
    // Nullable so Gson null → we treat as "default enabled" in loadFromUser()
    val coachPaceEnabled: Boolean? = null,
    val coachNavigationEnabled: Boolean? = null,
    val coachElevationEnabled: Boolean? = null,
    val coachHeartRateEnabled: Boolean? = null,
    val coachCadenceStrideEnabled: Boolean? = null,
    val coachKmSplitsEnabled: Boolean? = null,
    val coachStruggleEnabled: Boolean? = null,
    val coachMotivationalEnabled: Boolean? = null,
    val coachHalfKmCheckInEnabled: Boolean? = null,
    val coachKmSplitIntervalKm: Int? = null,
    // User injuries for AI to consider in training plan design
    val injuries: List<Injury>? = null,
    // Default session type (RUN or WALK) — used for run setup and AI coaching plan generation
    val defaultSessionType: String? = "RUN",
    // ── Trial / Subscription lifecycle ───────────────────────────────────────
    // ISO-8601 date string set by the server on account creation (e.g. "2025-01-10").
    // Used client-side to compute trial countdown and enforce the hard paywall after 14 days.
    val trialExpiresAt: String? = null,
    // Currency inferred from timezone on login (e.g. "NZD", "GBP", "USD")
    // Set server-side and returned in the login response for localized pricing display.
    val currency: String? = null,
    val timezone: String? = null,
    val country: String? = null,
    /** Weight was saved with the lb/kg toggle (so it is definitely kg). */
    val weightUnitConfirmed: Boolean? = null
)

package live.airuncoach.airuncoach.data

import android.content.Context
import android.content.SharedPreferences
import live.airuncoach.airuncoach.domain.model.User

/**
 * Manages user preferences for which AI coaching features are active during runs.
 * All features default to enabled (true). Users can toggle individual features off
 * from the AI Coach Settings screen.
 * 
 * Preferences are stored locally in SharedPreferences for fast access during runs,
 * and synced to the server (Neon DB) so they persist across devices/logins.
 */
class CoachingFeaturePreferences(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREFS_NAME = "coaching_feature_prefs"

        // Preference keys — each maps to a toggleable coaching feature
        const val KEY_PACE_COACHING = "pace_coaching_enabled"
        const val KEY_ROUTE_NAVIGATION = "route_navigation_enabled"
        const val KEY_ELEVATION_COACHING = "elevation_coaching_enabled"
        const val KEY_HEART_RATE_COACHING = "heart_rate_coaching_enabled"
        const val KEY_CADENCE_STRIDE = "cadence_stride_enabled"
        const val KEY_KM_SPLITS = "km_splits_enabled"
        const val KEY_STRUGGLE_DETECTION = "struggle_detection_enabled"
        const val KEY_MOTIVATIONAL_COACHING = "motivational_coaching_enabled"
        const val KEY_HALF_KM_CHECK_IN = "half_km_check_in_enabled"
        const val KEY_KM_SPLIT_INTERVAL = "km_split_interval_km"

        // Default: all features enabled
        private const val DEFAULT_ENABLED = true
        const val DEFAULT_KM_SPLIT_INTERVAL = 1
    }

    /** Pace coaching — target pace guidance, too fast/slow warnings */
    var paceCoachingEnabled: Boolean
        get() = prefs.getBoolean(KEY_PACE_COACHING, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_PACE_COACHING, value).apply()

    /** Route navigation — turn-by-turn directions on mapped routes */
    var routeNavigationEnabled: Boolean
        get() = prefs.getBoolean(KEY_ROUTE_NAVIGATION, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_ROUTE_NAVIGATION, value).apply()

    /** Elevation coaching — hill/gradient advice and terrain tips */
    var elevationCoachingEnabled: Boolean
        get() = prefs.getBoolean(KEY_ELEVATION_COACHING, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_ELEVATION_COACHING, value).apply()

    /** Heart rate coaching — HR zone guidance */
    var heartRateCoachingEnabled: Boolean
        get() = prefs.getBoolean(KEY_HEART_RATE_COACHING, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_HEART_RATE_COACHING, value).apply()

    /** Cadence & stride coaching — running form analysis */
    var cadenceStrideEnabled: Boolean
        get() = prefs.getBoolean(KEY_CADENCE_STRIDE, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_CADENCE_STRIDE, value).apply()

    /** Km split announcements — pace updates at each kilometre */
    var kmSplitsEnabled: Boolean
        get() = prefs.getBoolean(KEY_KM_SPLITS, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_KM_SPLITS, value).apply()

    /** Struggle detection — supportive coaching when pace drops significantly */
    var struggleDetectionEnabled: Boolean
        get() = prefs.getBoolean(KEY_STRUGGLE_DETECTION, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_STRUGGLE_DETECTION, value).apply()

    /** Motivational coaching — milestones (25/50/75%), phase changes, technique tips, positive reinforcement, final push */
    var motivationalCoachingEnabled: Boolean
        get() = prefs.getBoolean(KEY_MOTIVATIONAL_COACHING, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_MOTIVATIONAL_COACHING, value).apply()

    /** 500m check-in — initial assessment at 500m into the run */
    var halfKmCheckInEnabled: Boolean
        get() = prefs.getBoolean(KEY_HALF_KM_CHECK_IN, DEFAULT_ENABLED)
        set(value) = prefs.edit().putBoolean(KEY_HALF_KM_CHECK_IN, value).apply()

    /** Km split interval — how often to get km split coaching (1, 2, 3, 5, or 10 km) */
    var kmSplitIntervalKm: Int
        get() = prefs.getInt(KEY_KM_SPLIT_INTERVAL, DEFAULT_KM_SPLIT_INTERVAL)
        set(value) = prefs.edit().putInt(KEY_KM_SPLIT_INTERVAL, value).apply()

    /**
     * Load preferences from User model (received from server on login).
     * This syncs server-stored preferences to local SharedPreferences.
     */
    fun loadFromUser(user: User) {
        // null from server = feature not yet set = default to enabled (true)
        prefs.edit()
            .putBoolean(KEY_PACE_COACHING, user.coachPaceEnabled ?: true)
            .putBoolean(KEY_ROUTE_NAVIGATION, user.coachNavigationEnabled ?: true)
            .putBoolean(KEY_ELEVATION_COACHING, user.coachElevationEnabled ?: true)
            .putBoolean(KEY_HEART_RATE_COACHING, user.coachHeartRateEnabled ?: true)
            .putBoolean(KEY_CADENCE_STRIDE, user.coachCadenceStrideEnabled ?: true)
            .putBoolean(KEY_KM_SPLITS, user.coachKmSplitsEnabled ?: true)
            .putBoolean(KEY_STRUGGLE_DETECTION, user.coachStruggleEnabled ?: true)
            .putBoolean(KEY_MOTIVATIONAL_COACHING, user.coachMotivationalEnabled ?: true)
            .putBoolean(KEY_HALF_KM_CHECK_IN, user.coachHalfKmCheckInEnabled ?: true)
            .putInt(KEY_KM_SPLIT_INTERVAL, user.coachKmSplitIntervalKm ?: DEFAULT_KM_SPLIT_INTERVAL)
            .apply()
    }
}

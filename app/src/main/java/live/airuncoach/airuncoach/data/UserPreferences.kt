package live.airuncoach.airuncoach.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

// Extension property for DataStore
val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "user_prefs")

/**
 * UserPreferences - Manages user settings and preferences
 * Uses DataStore for persistent storage
 */
class UserPreferences(private val context: Context) {
    
    companion object {
        val AUTO_SYNC_TO_GARMIN = booleanPreferencesKey("auto_sync_to_garmin")
        val SHOW_PACE_AS_MIN_PER_KM = booleanPreferencesKey("show_pace_as_min_per_km")
        val USE_METRIC_UNITS = booleanPreferencesKey("use_metric_units")
    }
    
    /**
     * Auto-sync to Garmin Connect preference
     * Default: true (automatic upload enabled)
     */
    val autoSyncToGarmin: Flow<Boolean> = context.dataStore.data
        .map { preferences ->
            preferences[AUTO_SYNC_TO_GARMIN] ?: true // Default ON
        }
    
    suspend fun setAutoSyncToGarmin(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[AUTO_SYNC_TO_GARMIN] = enabled
        }
    }
    
    /**
     * Pace display preference
     * Default: true (show min/km)
     */
    val showPaceAsMinPerKm: Flow<Boolean> = context.dataStore.data
        .map { preferences ->
            preferences[SHOW_PACE_AS_MIN_PER_KM] ?: true
        }
    
    suspend fun setShowPaceAsMinPerKm(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[SHOW_PACE_AS_MIN_PER_KM] = enabled
        }
    }
    
    /**
     * Unit preference (metric vs imperial)
     * Default: true (metric)
     */
    val useMetricUnits: Flow<Boolean> = context.dataStore.data
        .map { preferences ->
            preferences[USE_METRIC_UNITS] ?: true
        }
    
    suspend fun setUseMetricUnits(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[USE_METRIC_UNITS] = enabled
        }
    }
}

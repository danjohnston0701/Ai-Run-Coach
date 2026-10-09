package live.airuncoach.airuncoach.wear.storage

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "wear_prefs")

/**
 * Persists auth token, runner name, personalized max HR, and last-seen session type — the
 * Wear OS analog of the Garmin watch app's `App.Storage` usage (RunView.mc). Backed by
 * Jetpack DataStore rather than raw SharedPreferences for structured, coroutine-safe access.
 */
class WearPreferences(context: Context) {
    private val dataStore = context.applicationContext.dataStore

    private object Keys {
        val AUTH_TOKEN = stringPreferencesKey("auth_token")
        val RUNNER_NAME = stringPreferencesKey("runner_name")
        // Not "max_hr": older phone builds always sent 185 when the age was unknown, so a value
        // stored under that key can't be trusted as personalised.
        val MAX_HR = intPreferencesKey("personal_max_hr")
        val SESSION_TYPE = stringPreferencesKey("session_type")
        val PLANNED_WORKOUT_ID = stringPreferencesKey("planned_workout_id")
        val PREPARED_RUN = stringPreferencesKey("prepared_run")
        val REJECTED_TOKEN = stringPreferencesKey("rejected_auth_token")
    }

    val authToken: Flow<String?> = dataStore.data.map { it[Keys.AUTH_TOKEN] }
    val runnerName: Flow<String> = dataStore.data.map { it[Keys.RUNNER_NAME] ?: "" }
    /** Null until the phone has sent a real personalised max HR. */
    val maxHr: Flow<Int?> = dataStore.data.map { it[Keys.MAX_HR] }
    val sessionType: Flow<String?> = dataStore.data.map { it[Keys.SESSION_TYPE] }

    suspend fun getAuthTokenOnce(): String? = authToken.first()
    suspend fun getSessionTypeOnce(): String? = sessionType.first()

    suspend fun getMaxHrOnce(): Int? = maxHr.first()

    /** A null maxHr keeps whatever was stored before (an auth without one isn't "unknown now"). */
    suspend fun setAuth(token: String, runnerName: String, maxHr: Int?) {
        dataStore.edit { prefs ->
            prefs[Keys.AUTH_TOKEN] = token
            prefs[Keys.RUNNER_NAME] = runnerName
            if (maxHr != null) prefs[Keys.MAX_HR] = maxHr
        }
    }

    suspend fun setSessionType(sessionType: String) {
        dataStore.edit { prefs -> prefs[Keys.SESSION_TYPE] = sessionType }
    }

    suspend fun setPlannedWorkoutId(id: String?) {
        dataStore.edit { prefs ->
            if (id != null) prefs[Keys.PLANNED_WORKOUT_ID] = id else prefs.remove(Keys.PLANNED_WORKOUT_ID)
        }
    }

    suspend fun getPlannedWorkoutIdOnce(): String? = dataStore.data.map { it[Keys.PLANNED_WORKOUT_ID] }.first()

    /**
     * The phone's last "preparedRun" message, verbatim (JSON), so a prepared session — target,
     * distance, the plan workout it belongs to — survives the watch app being restarted before
     * the run starts. Cleared when the run finishes or the phone cancels the prepare.
     */
    suspend fun setPreparedRun(json: String?) {
        dataStore.edit { prefs ->
            if (json != null) prefs[Keys.PREPARED_RUN] = json else prefs.remove(Keys.PREPARED_RUN)
        }
    }

    suspend fun getPreparedRunOnce(): String? = dataStore.data.map { it[Keys.PREPARED_RUN] }.first()

    /**
     * The server answered 401 to [token]: forget it and remember which one it was, so the same
     * dead token arriving again from the phone isn't adopted (and retried) in a loop. Mirrors
     * DataStreamer.mc's authTokenExpired flag.
     */
    suspend fun rejectAuth(token: String) {
        dataStore.edit { prefs ->
            if (prefs[Keys.AUTH_TOKEN] == token) prefs.remove(Keys.AUTH_TOKEN)
            prefs[Keys.REJECTED_TOKEN] = token
        }
    }

    suspend fun getRejectedTokenOnce(): String? = dataStore.data.map { it[Keys.REJECTED_TOKEN] }.first()
}

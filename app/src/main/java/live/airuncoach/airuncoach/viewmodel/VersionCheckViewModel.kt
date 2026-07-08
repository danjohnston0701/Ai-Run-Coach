package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.BuildConfig
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.AppVersionCheckResponse
import live.airuncoach.airuncoach.service.GarminWatchManager
import javax.inject.Inject

/**
 * Checks app and Garmin companion versions at startup and surfaces update prompts.
 *
 * - Android update: compares installed [BuildConfig.VERSION_CODE] against the server's
 *   latestVersionCode. If behind, exposes [androidUpdateAvailable] with details.
 *
 * - Garmin companion update: compares the installed watch app version (stored in SharedPrefs
 *   by [GarminWatchManager] whenever the watch connects) against the server's latestVersion.
 *   If behind, exposes [garminUpdateAvailable] with version + release note so the UI can
 *   navigate to the GarminWatchUpdateScreen.
 *
 * Both checks are fire-and-forget — a network failure is silently ignored so the app
 * never blocks on startup for a version check.
 */
@HiltViewModel
class VersionCheckViewModel @Inject constructor(
    private val apiService: ApiService,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    companion object {
        private const val TAG = "VersionCheck"
    }

    data class AndroidUpdateInfo(
        val latestVersionName: String,
        val playStoreUrl: String,
        val releaseNote: String,
        val isForced: Boolean,   // true = minVersionCode > installed (must update)
    )

    data class GarminUpdateInfo(
        val installedVersion: String,
        val latestVersion: String,
        val releaseNote: String,
        val connectIqStoreUrl: String,
    )

    private val _androidUpdateAvailable = MutableStateFlow<AndroidUpdateInfo?>(null)
    val androidUpdateAvailable: StateFlow<AndroidUpdateInfo?> = _androidUpdateAvailable.asStateFlow()

    private val _garminUpdateAvailable = MutableStateFlow<GarminUpdateInfo?>(null)
    val garminUpdateAvailable: StateFlow<GarminUpdateInfo?> = _garminUpdateAvailable.asStateFlow()

    /** Call once after the user is logged in (or before — endpoint requires no auth). */
    fun checkVersions() {
        viewModelScope.launch {
            try {
                val response: AppVersionCheckResponse = apiService.checkAppVersion()
                checkAndroid(response)
                checkGarmin(response)
            } catch (e: Exception) {
                // Version check failure must never block app startup
                Log.w(TAG, "Version check failed (will try again next launch): ${e.message}")
            }
        }
    }

    private fun checkAndroid(response: AppVersionCheckResponse) {
        val installed = BuildConfig.VERSION_CODE
        val latest    = response.android.latestVersionCode
        val minimum   = response.android.minVersionCode

        Log.d(TAG, "Android version: installed=$installed latest=$latest min=$minimum")

        if (installed >= latest) {
            Log.d(TAG, "Android app is up to date")
            return
        }

        _androidUpdateAvailable.value = AndroidUpdateInfo(
            latestVersionName = response.android.latestVersionName,
            playStoreUrl      = response.android.playStoreUrl,
            releaseNote       = response.android.releaseNote,
            isForced          = installed < minimum,
        )
        Log.i(TAG, "Android update available → ${response.android.latestVersionName} (forced=${installed < minimum})")
    }

    private fun checkGarmin(response: AppVersionCheckResponse) {
        val latestVersion = response.garmin.latestVersion
        val minVersion    = response.garmin.minVersion

        // Read the version the watch reported on last connection
        val installedVersion = context
            .getSharedPreferences("garmin_watch_prefs", Context.MODE_PRIVATE)
            .getString(GarminWatchManager.PREF_WATCH_APP_VERSION, null)

        Log.d(TAG, "Garmin companion: installed=$installedVersion latest=$latestVersion min=$minVersion")

        if (installedVersion == null) {
            // Watch has never connected to this phone — no prompt
            Log.d(TAG, "No Garmin watch version on record — skipping update check")
            return
        }

        if (!isVersionOlderThan(installedVersion, latestVersion)) {
            Log.d(TAG, "Garmin companion is up to date ($installedVersion)")
            return
        }

        _garminUpdateAvailable.value = GarminUpdateInfo(
            installedVersion  = installedVersion,
            latestVersion     = latestVersion,
            releaseNote       = response.garmin.releaseNote,
            connectIqStoreUrl = response.garmin.connectIqStoreUrl,
        )
        Log.i(TAG, "Garmin companion update available: $installedVersion → $latestVersion")
    }

    /** Dismisses the Android update dialog (stores dismissal so it re-prompts next session). */
    fun dismissAndroidUpdate() {
        _androidUpdateAvailable.value = null
    }

    /** Dismisses the Garmin update prompt. */
    fun dismissGarminUpdate() {
        _garminUpdateAvailable.value = null
    }

    /**
     * Compares two semantic version strings (e.g. "1.3.0" vs "1.4.0").
     * Returns true if [installed] is strictly older than [latest].
     */
    private fun isVersionOlderThan(installed: String, latest: String): Boolean {
        return try {
            val iv = installed.trim().split(".").map { it.toIntOrNull() ?: 0 }
            val lv = latest.trim().split(".").map { it.toIntOrNull() ?: 0 }
            val maxLen = maxOf(iv.size, lv.size)
            for (i in 0 until maxLen) {
                val a = iv.getOrElse(i) { 0 }
                val b = lv.getOrElse(i) { 0 }
                if (a < b) return true
                if (a > b) return false
            }
            false // equal
        } catch (_: Exception) {
            false // parse failure — don't prompt
        }
    }
}

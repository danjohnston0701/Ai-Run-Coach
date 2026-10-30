package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.wear.remote.interactions.RemoteActivityHelper
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors
import live.airuncoach.airuncoach.BuildConfig
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.AppVersionCheckResponse
import live.airuncoach.airuncoach.service.GarminWatchManager
import live.airuncoach.airuncoach.service.SamsungWatchManager
import javax.inject.Inject

/**
 * Checks app and Garmin companion versions at startup and surfaces update prompts.
 *
 * - Android update: compares installed [BuildConfig.VERSION_CODE] against the server's
 *   latestVersionCode. If behind, exposes [androidUpdateAvailable] with details.
 *
 * - Watch app updates ([checkWatchApps]): compares the version the Garmin / Galaxy Watch app
 *   reported on its last connection (stored in SharedPrefs by [GarminWatchManager] /
 *   [SamsungWatchManager]) against the server's latest. If behind, exposes
 *   [garminUpdateAvailable] / [wearUpdateAvailable]. Each watch prompts at most once a day —
 *   MainScreen re-enters composition when the user comes back from the update screen, so
 *   without the throttle the prompt would reopen immediately.
 *
 * All checks are fire-and-forget — a network failure is silently ignored so the app
 * never blocks on startup for a version check.
 */
@HiltViewModel
class VersionCheckViewModel @Inject constructor(
    private val apiService: ApiService,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    companion object {
        private const val TAG = "VersionCheck"
        private const val PREFS = "version_check_prefs"
        private const val KEY_GARMIN_PROMPTED_AT = "garmin_update_prompted_at"
        private const val KEY_WEAR_PROMPTED_AT = "wear_update_prompted_at"
        private const val WATCH_PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000L
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

    data class WearUpdateInfo(
        val installedVersion: String,
        val latestVersion: String,
        val releaseNote: String,
    )

    private val _wearUpdateAvailable = MutableStateFlow<WearUpdateInfo?>(null)
    val wearUpdateAvailable: StateFlow<WearUpdateInfo?> = _wearUpdateAvailable.asStateFlow()

    /** Android app update check — call at startup (endpoint requires no auth). */
    fun checkVersions() {
        viewModelScope.launch {
            try {
                checkAndroid(apiService.checkAppVersion())
            } catch (e: Exception) {
                // Version check failure must never block app startup
                Log.w(TAG, "Version check failed (will try again next launch): ${e.message}")
            }
        }
    }

    /** Garmin + Galaxy Watch app update checks — call from the signed-in main screen. */
    fun checkWatchApps() {
        viewModelScope.launch {
            try {
                val response = apiService.checkAppVersion()
                checkGarmin(response)
                checkWear(response)
            } catch (e: Exception) {
                Log.w(TAG, "Watch version check failed (will try again next launch): ${e.message}")
            }
        }
    }

    private val prefs get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** True (and records the prompt) when this watch hasn't been prompted in the last day. */
    private fun claimDailyPrompt(key: String): Boolean {
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(key, 0L) < WATCH_PROMPT_INTERVAL_MS) return false
        prefs.edit().putLong(key, now).apply()
        return true
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

        if (latestVersion.isNullOrBlank()) {
            // GARMIN_LATEST_VERSION unset on the server — no prompt
            Log.d(TAG, "No latest Garmin version configured — skipping update check")
            return
        }

        if (installedVersion == null) {
            // Watch has never connected to this phone — no prompt
            Log.d(TAG, "No Garmin watch version on record — skipping update check")
            return
        }

        if (!isVersionOlderThan(installedVersion, latestVersion)) {
            Log.d(TAG, "Garmin companion is up to date ($installedVersion)")
            return
        }
        if (!claimDailyPrompt(KEY_GARMIN_PROMPTED_AT)) {
            Log.d(TAG, "Garmin companion $installedVersion is behind $latestVersion — already prompted today")
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

    private fun checkWear(response: AppVersionCheckResponse) {
        val latestVersion = response.wear?.latestVersion?.takeIf { it.isNotBlank() } ?: return
        val installedVersion = context
            .getSharedPreferences(SamsungWatchManager.PREFS_NAME, Context.MODE_PRIVATE)
            .getString(SamsungWatchManager.PREF_WATCH_APP_VERSION, null)
            ?: return // Galaxy Watch app has never connected to this phone
        Log.d(TAG, "Wear OS app: installed=$installedVersion latest=$latestVersion")
        if (!isVersionOlderThan(installedVersion, latestVersion)) return
        if (!claimDailyPrompt(KEY_WEAR_PROMPTED_AT)) return
        _wearUpdateAvailable.value = WearUpdateInfo(
            installedVersion = installedVersion,
            latestVersion    = latestVersion,
            releaseNote      = response.wear.releaseNote,
        )
        Log.i(TAG, "Wear OS app update available: $installedVersion → $latestVersion")
    }

    fun dismissWearUpdate() {
        _wearUpdateAvailable.value = null
    }

    /**
     * Opens this app's Play Store page on the connected watch, where the Wear OS build updates.
     * Opening it on the phone would only offer the phone app. Falls back to the phone listing if
     * no watch accepts the request.
     */
    fun openPlayStoreOnWatch() {
        val listing = Uri.parse("market://details?id=${context.packageName}")
        viewModelScope.launch {
            val opened = withContext(Dispatchers.IO) {
                try {
                    RemoteActivityHelper(context, Executors.newSingleThreadExecutor())
                        .startRemoteActivity(
                            Intent(Intent.ACTION_VIEW, listing).addCategory(Intent.CATEGORY_BROWSABLE)
                        )
                        .get()
                    true
                } catch (e: Exception) {
                    Log.w(TAG, "Couldn't open Play Store on the watch: ${e.message}")
                    false
                }
            }
            if (!opened) {
                try {
                    context.startActivity(Intent(Intent.ACTION_VIEW, listing).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e: Exception) {
                    Log.w(TAG, "Couldn't open Play Store: ${e.message}")
                }
            }
        }
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

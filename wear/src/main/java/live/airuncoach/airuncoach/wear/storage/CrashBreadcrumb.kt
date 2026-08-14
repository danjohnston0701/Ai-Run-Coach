package live.airuncoach.airuncoach.wear.storage

import android.content.Context
import android.util.Log

/**
 * Persists a compact breadcrumb describing the last uncaught exception so it survives an app
 * crash/relaunch — real Wear OS hardware exposes no crash log to sideloaded/dev-mode apps, so
 * this (plus surfacing it once on next open, see RunSessionController) is the only way to
 * diagnose a crash without a cable. Mirrors the Garmin watch app's `_recordCrash`/
 * `_recordBreadcrumb` mechanism (RunView.mc).
 *
 * Deliberately uses plain synchronous SharedPreferences rather than DataStore — an uncaught
 * exception handler needs a write that completes before the process dies, and DataStore's
 * async API doesn't guarantee that in a crash handler's narrow window.
 */
object CrashBreadcrumb {
    private const val PREFS_NAME = "wear_crash_breadcrumb"
    private const val KEY_LAST_CRASH = "last_crash_info"
    private const val MAX_LEN = 120

    fun install(context: Context) {
        val appContext = context.applicationContext
        val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                record(appContext, "uncaught:" + (throwable.message ?: throwable.javaClass.simpleName))
            } catch (e: Exception) {
                // Never let breadcrumb capture itself crash the crash handler.
                Log.e("CrashBreadcrumb", "Failed to persist breadcrumb: ${e.message}")
            }
            previousHandler?.uncaughtException(thread, throwable)
        }
    }

    fun record(context: Context, message: String) {
        val trimmed = if (message.length > MAX_LEN) message.substring(0, MAX_LEN) else message
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LAST_CRASH, trimmed)
            .commit() // synchronous — must land before the process may die
    }

    /** Reads and clears the pending breadcrumb — surfaced once on next app open. */
    fun consumePending(context: Context): String? {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val msg = prefs.getString(KEY_LAST_CRASH, null)
        if (msg != null) {
            prefs.edit().remove(KEY_LAST_CRASH).apply()
        }
        return msg
    }
}

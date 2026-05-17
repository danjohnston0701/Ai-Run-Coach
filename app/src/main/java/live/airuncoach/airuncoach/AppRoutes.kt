package live.airuncoach.airuncoach

import android.net.Uri

object AppRoutes {
    const val LOGIN = "login"
    const val MAIN = "main"
    const val FORGOT_PASSWORD = "forgot_password"
    const val LOCATION_PERMISSION = "location_permission"
    const val AI_CONSENT = "ai_consent"
    const val GARMIN_WATCH_UPDATE = "garmin_watch_update?version={version}&releaseNote={releaseNote}"

    fun garminWatchUpdate(version: String = "", releaseNote: String = "") =
        "garmin_watch_update?version=${Uri.encode(version)}&releaseNote=${Uri.encode(releaseNote)}"
}

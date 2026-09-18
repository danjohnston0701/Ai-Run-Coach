package live.airuncoach.airuncoach.util

import android.content.Context
import java.util.UUID

/**
 * A stable, anonymous id for this install — generated once on first use and kept in plain
 * SharedPreferences (never cleared on sign-out; gone on uninstall, which is the right scope
 * for "did this download convert"). Sent as `deviceId` with pre-login tour events and as
 * `guestDeviceId` on register so the backend can join guest_tour_sessions to the user it became.
 */
object InstallIdentity {
    private const val PREFS = "install_identity"
    private const val KEY = "install_id"

    fun id(context: Context): String {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(KEY, null)?.let { return it }
        val fresh = UUID.randomUUID().toString()
        prefs.edit().putString(KEY, fresh).apply()
        return fresh
    }
}

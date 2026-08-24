package live.airuncoach.airuncoach.utils

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.net.toUri

/**
 * ColorOS (Oppo / OnePlus / Realme) ships a second, non-standard background-app-killer layer
 * on top of stock Android — a separate "Startup Manager" (autostart) allowlist and its own
 * per-app battery management screen — neither of which is covered by the standard
 * `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` exemption the app already requests in
 * RunSessionViewModel.startRun(). Left unaddressed, this silently throttles GPS and Bluetooth
 * mid-run even with a locked screen (confirmed via GPS-track analysis of a real ColorOS user's
 * walk session: dozens of implausible "teleport" jumps consistent with degraded/batched fixes).
 *
 * The component names for these OEM screens are undocumented and vary by ColorOS version, so
 * every entry point here is best-effort: try known candidates in order, swallow any failure,
 * and fall back to the generic App Info screen (always available) so the user can navigate the
 * remaining steps by hand using the on-screen instructions.
 */
object OemBatteryHelper {

    private const val TAG = "OemBatteryHelper"

    /** True for Oppo, OnePlus, and Realme devices — all run ColorOS (OnePlus/Realme are Oppo-owned). */
    fun isColorOSDevice(): Boolean {
        val brand = Build.BRAND.lowercase()
        val manufacturer = Build.MANUFACTURER.lowercase()
        return listOf("oppo", "oneplus", "realme").any { brand.contains(it) || manufacturer.contains(it) }
    }

    private fun tryLaunch(context: Context, intents: List<Intent>): Boolean {
        for (intent in intents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                return true
            } catch (e: Exception) {
                Log.d(TAG, "Candidate intent failed (${intent.component ?: intent.action}): ${e.message}")
            }
        }
        return false
    }

    /**
     * Opens ColorOS's "Startup Manager" (autostart allowlist) screen. Returns true if a
     * candidate resolved; if false, the generic App Info screen was opened as a fallback.
     */
    fun openAutoStartSettings(context: Context): Boolean {
        val candidates = listOf(
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
            ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
        ).map { Intent().apply { component = it } }
        val opened = tryLaunch(context, candidates)
        if (!opened) openAppInfoSettings(context)
        return opened
    }

    /**
     * Opens ColorOS's per-app battery management screen. Returns true if a candidate resolved;
     * if false, the generic App Info screen was opened as a fallback (has a Battery entry too).
     */
    fun openBatteryManagementSettings(context: Context): Boolean {
        val candidates = listOf(
            Intent("com.coloros.powermanager.action.APP_POWER_MANAGEMENT"),
            Intent().apply {
                component = ComponentName("com.coloros.oppoguardelf", "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity")
            },
            Intent().apply {
                component = ComponentName("com.coloros.powermanager", "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity")
            },
        )
        val opened = tryLaunch(context, candidates)
        if (!opened) openAppInfoSettings(context)
        return opened
    }

    /** Always-available fallback: the standard per-app "App Info" settings screen. */
    fun openAppInfoSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = "package:${context.packageName}".toUri()
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Could not open App Info settings either: ${e.message}")
        }
    }
}

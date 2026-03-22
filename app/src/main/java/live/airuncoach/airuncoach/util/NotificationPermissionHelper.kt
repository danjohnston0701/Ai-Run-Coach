package live.airuncoach.airuncoach.util

import android.Manifest
import android.os.Build

/**
 * Helper for requesting POST_NOTIFICATIONS permission.
 * 
 * This permission is required on Android 13+ (API 33+) to show push notifications.
 * On older versions, this is a no-op (permission is granted by default).
 */
object NotificationPermissionHelper {
    
    /**
     * Returns true if we should request notification permission.
     * Only needed on Android 13+ (API 33+).
     */
    fun shouldRequestPermission(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
    }
    
    /**
     * Get the permission string to request.
     */
    fun getPermissionString(): String {
        return Manifest.permission.POST_NOTIFICATIONS
    }
}

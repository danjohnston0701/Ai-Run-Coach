package live.airuncoach.airuncoach.util

import android.app.Activity
import android.util.Log
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

/**
 * Manages in-app updates using Google Play's In-App Update API
 * Handles flexible updates (user can defer) and required updates (forced)
 */
class AppUpdateChecker(private val activity: Activity) {
    
    private val appUpdateManager: AppUpdateManager = AppUpdateManagerFactory.create(activity)
    private val TAG = "AppUpdateChecker"
    private var updateAvailable = false
    private var installStateListener: InstallStateUpdatedListener? = null
    
    /**
     * Check if an app update is available
     * Optionally start the update flow if updateIfAvailable = true
     */
    fun checkForUpdates(updateIfAvailable: Boolean = false, onUpdateFound: (version: Int) -> Unit = {}) {
        val appUpdateInfoTask = appUpdateManager.appUpdateInfo
        
        appUpdateInfoTask.addOnSuccessListener { appUpdateInfo ->
            Log.d(TAG, "Update check - Available: ${appUpdateInfo.updateAvailability()}, Latest: ${appUpdateInfo.availableVersionCode()}")
            
            // Check if flexible update is available
            if (appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
                
                updateAvailable = true
                val availableVersion = appUpdateInfo.availableVersionCode()
                Log.d(TAG, "✅ Update available: version $availableVersion")
                onUpdateFound(availableVersion)
                
                if (updateIfAvailable && appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                    startFlexibleUpdate(appUpdateInfo)
                }
            } else if (appUpdateInfo.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                Log.d(TAG, "Update already in progress...")
                if (appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                    startFlexibleUpdate(appUpdateInfo)
                }
            } else {
                Log.d(TAG, "ℹ️ No update available")
            }
        }
        
        appUpdateInfoTask.addOnFailureListener { exception ->
            Log.e(TAG, "❌ Failed to check for updates: ${exception.message}")
        }
    }
    
    /**
     * Start the in-app update flow
     */
    private fun startFlexibleUpdate(appUpdateInfo: AppUpdateInfo) {
        try {
            val appUpdateOptions = AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE)
                .setAllowAssetPackDeletion(true)
                .build()
            
            appUpdateManager.startUpdateFlow(
                appUpdateInfo,
                activity,
                appUpdateOptions
            )
            Log.d(TAG, "✅ Update flow started")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start update flow: ${e.message}")
        }
    }
    
    /**
     * Set up listener for installation progress (flexible updates only)
     */
    fun setupInstallStateListener(onInstallComplete: () -> Unit = {}) {
        installStateListener = InstallStateUpdatedListener { state ->
            when (state.installStatus()) {
                InstallStatus.PENDING -> {
                    Log.d(TAG, "Update pending...")
                }
                InstallStatus.DOWNLOADING -> {
                    Log.d(TAG, "Downloading update...")
                }
                InstallStatus.DOWNLOADED -> {
                    Log.d(TAG, "✅ Update downloaded - user can install on restart")
                    // Show snackbar/notification prompting user to restart app
                    // This happens automatically in Google Play for flexible updates
                }
                InstallStatus.INSTALLING -> {
                    Log.d(TAG, "Installing update...")
                }
                InstallStatus.INSTALLED -> {
                    Log.d(TAG, "✅ Update installed successfully")
                    onInstallComplete()
                }
                InstallStatus.FAILED -> {
                    Log.e(TAG, "Update failed")
                }
                InstallStatus.UNKNOWN -> {
                    Log.d(TAG, "Update state unknown")
                }
            }
        }
        
        installStateListener?.let {
            appUpdateManager.registerListener(it)
        }
    }
    
    /**
     * Unregister the install state listener
     */
    fun unregisterListener() {
        installStateListener?.let {
            appUpdateManager.unregisterListener(it)
        }
    }
    
    /**
     * Check if update is ready to be installed
     */
    fun isUpdateReadyToInstall(): Boolean {
        val appUpdateInfoTask = appUpdateManager.appUpdateInfo
        var ready = false
        
        appUpdateInfoTask.addOnSuccessListener { appUpdateInfo ->
            ready = appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED
        }
        
        return ready
    }
    
    /**
     * Prompt user to complete update (flexible flow)
     * This shows a system dialog asking user to restart app
     */
    fun promptUserToCompleteUpdate() {
        try {
            appUpdateManager.completeUpdate()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to complete update: ${e.message}")
        }
    }
    
    companion object {
        const val UPDATE_REQUEST_CODE = 9001
    }
}

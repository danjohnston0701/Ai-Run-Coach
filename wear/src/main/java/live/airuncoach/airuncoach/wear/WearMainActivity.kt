package live.airuncoach.airuncoach.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.MaterialTheme
import live.airuncoach.airuncoach.wear.session.RunSessionController
import live.airuncoach.airuncoach.wear.ui.screens.RunScreen

/**
 * The app's single Activity — hosts [RunScreen] directly (no navigation graph; there is only
 * one reachable screen, mirroring RunView.mc being the Garmin watch app's sole live screen).
 */
class WearMainActivity : ComponentActivity() {

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* Health Services / FusedLocationProviderClient calls no-op gracefully if denied. */ }

    private lateinit var controller: RunSessionController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestRuntimePermissionsIfNeeded()

        controller = (application as WearApplication).runSessionController

        if (BuildConfig.DEBUG) {
            intent?.getStringExtra("debug_auth_token")?.let { token ->
                controller.debugInjectAuth(token, intent?.getStringExtra("debug_runner_name") ?: "Debug")
            }
        }

        setContent {
            MaterialTheme {
                RunScreen(controller = controller, onExit = { finish() })
            }
        }
    }

    /**
     * The physical side buttons are delivered to the foreground app as raw key events rather
     * than routing through the Compose back-stack — left unhandled, Wear OS's default action
     * exits straight to the watch face with no confirmation. Mirrors RunView.mc's onKey()/
     * onBack() 1:1 (RunDelegate doc-comment: "Physical START button (top-right) → start /
     * pause / resume", "BACK button (bottom-right) → exit / pause / finish-confirm"):
     *   - KEYCODE_STEM_1 (top button)    → start / resume / pause, same 3-way toggle as Garmin.
     *   - KEYCODE_STEM_2 (bottom button) → same branch as the system back-gesture: toggles
     *     screen while running unpaused, prompts "Finish run?" while paused, prompts
     *     "Exit app?" while idle — never a silent, unconfirmed exit.
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        android.util.Log.d("WearMainActivity", "onKeyDown keyCode=$keyCode (${KeyEvent.keyCodeToString(keyCode)})")
        when (keyCode) {
            KeyEvent.KEYCODE_STEM_1 -> {
                val state = controller.state.value
                when {
                    !state.isRunning -> controller.onIdleStartPressed()
                    state.isPaused -> controller.resumeRun()
                    else -> controller.pauseRun()
                }
                return true
            }
            KeyEvent.KEYCODE_STEM_2 -> {
                controller.onBackPressed()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun requestRuntimePermissionsIfNeeded() {
        val needed = listOf(
            Manifest.permission.BODY_SENSORS,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACTIVITY_RECOGNITION,
        ).filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }
}

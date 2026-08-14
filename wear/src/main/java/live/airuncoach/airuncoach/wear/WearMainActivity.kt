package live.airuncoach.airuncoach.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.MaterialTheme
import live.airuncoach.airuncoach.wear.ui.screens.RunScreen

/**
 * The app's single Activity — hosts [RunScreen] directly (no navigation graph; there is only
 * one reachable screen, mirroring RunView.mc being the Garmin watch app's sole live screen).
 */
class WearMainActivity : ComponentActivity() {

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* Health Services / FusedLocationProviderClient calls no-op gracefully if denied. */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestRuntimePermissionsIfNeeded()

        val controller = (application as WearApplication).runSessionController
        setContent {
            MaterialTheme {
                RunScreen(controller = controller, onExit = { finish() })
            }
        }
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

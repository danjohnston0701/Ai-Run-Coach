package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationPermissionScreen(onPermissionGranted: () -> Unit) {
    val context = LocalContext.current
    var hasNavigated by remember { mutableStateOf(false) }

    // Tracks whether the system permission dialogs have been launched and returned.
    // Once true, show "Continue to App" so the user can proceed regardless of grant/deny.
    var dialogsCompleted by remember { mutableStateOf(false) }

    // Check current permission status
    fun checkPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun checkActivityRecognitionPermission(): Boolean {
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    var hasLocationPermission by remember { mutableStateOf(checkPermission()) }

    // Permission launcher — called after system dialogs complete
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        android.util.Log.d("LocationPermission", "Permission result: $permissions")

        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
        val activityRecognitionGranted = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            permissions[Manifest.permission.ACTIVITY_RECOGNITION] ?: false
        } else {
            true
        }

        if (fineLocationGranted || coarseLocationGranted) {
            hasLocationPermission = true
        }

        if ((fineLocationGranted || coarseLocationGranted) && activityRecognitionGranted) {
            // Core permissions granted — auto-proceed
            android.util.Log.d("LocationPermission", "Permissions GRANTED, navigating...")
            if (!hasNavigated) {
                hasNavigated = true
                onPermissionGranted()
            }
        } else {
            // Dialogs completed but some permissions denied — show "Continue to App"
            android.util.Log.d("LocationPermission", "Some permissions denied, showing continue button")
            dialogsCompleted = true
        }
    }

    // Auto-navigate if permission is already granted on first load
    LaunchedEffect(Unit) {
        if (checkPermission() && checkActivityRecognitionPermission() && !hasNavigated) {
            android.util.Log.d("LocationPermission", "Already has permission, navigating...")
            hasNavigated = true
            onPermissionGranted()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(horizontal = Spacing.xxxl)
            .padding(top = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Title
        Text(
            text = "Enable Tracking",
            style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )

        Spacer(modifier = Modifier.height(Spacing.lg))

        // Description
        Text(
            text = "AI Run Coach needs access to your device's\nGPS and sensors to accurately track your runs,\ncalculate distance, pace, and heart rate.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.xxxxl))

        // Feature list card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
        ) {
            Column(modifier = Modifier.padding(Spacing.xl)) {
                PermissionFeatureRow(
                    icon = R.drawable.icon_location_vector,
                    text = "Real-time GPS tracking during runs"
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
                PermissionFeatureRow(
                    icon = R.drawable.icon_trending_vector,
                    text = "Accurate distance and pace\ncalculation"
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
                PermissionFeatureRow(
                    icon = R.drawable.icon_location_vector,
                    text = "Route mapping and elevation data"
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
                PermissionFeatureRow(
                    icon = R.drawable.icon_timer_vector,
                    text = "Background tracking (screen locked)"
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
                PermissionFeatureRow(
                    icon = R.drawable.icon_heart_vector,
                    text = "Heart rate and cadence tracking"
                )
            }
        }

        Spacer(modifier = Modifier.height(Spacing.xl))

        // Privacy note
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_info_vector),
                contentDescription = null,
                tint = Colors.textMuted,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text(
                text = "Your location data is only used during runs\nand is never shared with third parties.",
                style = AppTextStyles.small,
                color = Colors.textMuted,
                lineHeight = AppTextStyles.small.lineHeight
            )
        }

        Spacer(modifier = Modifier.height(Spacing.xxxxl))

        if (dialogsCompleted) {
            // System dialogs have completed — show "Continue to App" regardless of grant/deny
            Button(
                onClick = {
                    if (!hasNavigated) {
                        hasNavigated = true
                        onPermissionGranted()
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.buttonHeight),
                shape = RoundedCornerShape(BorderRadius.full),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                )
            ) {
                Text(
                    text = "Continue to App",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
        } else {
            // Before dialogs — single "Continue" button that triggers system dialogs.
            // No skip/exit buttons allowed at this stage.
            Button(
                onClick = {
                    android.util.Log.d("LocationPermission", "Continue tapped")
                    hasLocationPermission = checkPermission()

                    if (hasLocationPermission && checkActivityRecognitionPermission()) {
                        // Already granted — proceed directly
                        if (!hasNavigated) {
                            hasNavigated = true
                            onPermissionGranted()
                        }
                    } else {
                        // Launch system permission dialogs
                        val permissions = mutableListOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                            Manifest.permission.BODY_SENSORS
                        )
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                            permissions.add(Manifest.permission.ACTIVITY_RECOGNITION)
                        }
                        locationPermissionLauncher.launch(permissions.toTypedArray())
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.buttonHeight),
                shape = RoundedCornerShape(BorderRadius.full),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                )
            ) {
                Text(
                    text = "Continue",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
        }
    }
}

@Composable
private fun PermissionFeatureRow(icon: Int, text: String) {
    Row(
        verticalAlignment = Alignment.Top,
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            painter = painterResource(id = icon),
            contentDescription = null,
            tint = Colors.primary,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.md))
        Text(
            text = text,
            style = AppTextStyles.body,
            color = Colors.textPrimary
        )
    }
}

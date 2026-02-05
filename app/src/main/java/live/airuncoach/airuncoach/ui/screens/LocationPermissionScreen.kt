package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
    var permissionDenied by remember { mutableStateOf(false) }
    var hasNavigated by remember { mutableStateOf(false) }
    
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
            true // Not needed on older versions
        }
    }

    fun checkBodySensorsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.BODY_SENSORS
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    var hasLocationPermission by remember { mutableStateOf(checkPermission()) }
    
    // Permission launcher for location
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        android.util.Log.d("LocationPermission", "Permission result: $permissions")

        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
        val activityRecognitionGranted = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            permissions[Manifest.permission.ACTIVITY_RECOGNITION] ?: false
        } else {
            true // Not needed on older versions
        }
        val bodySensorsGranted = permissions[Manifest.permission.BODY_SENSORS] ?: false

        android.util.Log.d("LocationPermission", "Location: $fineLocationGranted/$coarseLocationGranted, ActivityRecognition: $activityRecognitionGranted, BodySensors: $bodySensorsGranted")

        if ((fineLocationGranted || coarseLocationGranted) && activityRecognitionGranted) {
            android.util.Log.d("LocationPermission", "Permissions GRANTED, navigating...")
            hasLocationPermission = true
            if (!hasNavigated) {
                hasNavigated = true
                onPermissionGranted()
            }
        } else {
            android.util.Log.d("LocationPermission", "Permission DENIED")
            permissionDenied = true
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

        // Feature List Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = CardDefaults.cardColors(
                containerColor = Colors.backgroundSecondary
            )
        ) {
            Column(
                modifier = Modifier.padding(Spacing.xl)
            ) {
                // Feature 1: Real-time GPS tracking
                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_location_vector),
                        contentDescription = "GPS Icon",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Text(
                        text = "Real-time GPS tracking during runs",
                        style = AppTextStyles.body,
                        color = Colors.textPrimary
                    )
                }

                Spacer(modifier = Modifier.height(Spacing.lg))

                // Feature 2: Accurate distance and pace
                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_trending_vector),
                        contentDescription = "Activity Icon",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Text(
                        text = "Accurate distance and pace\ncalculation",
                        style = AppTextStyles.body,
                        color = Colors.textPrimary
                    )
                }

                Spacer(modifier = Modifier.height(Spacing.lg))

                // Feature 3: Route mapping
                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_location_vector),
                        contentDescription = "Map Icon",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Text(
                        text = "Route mapping and elevation data",
                        style = AppTextStyles.body,
                        color = Colors.textPrimary
                    )
                }

                Spacer(modifier = Modifier.height(Spacing.lg))

                // Feature 4: Background tracking
                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_timer_vector),
                        contentDescription = "Background Icon",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Text(
                        text = "Background tracking (screen locked)",
                        style = AppTextStyles.body,
                        color = Colors.textPrimary
                    )
                }

                Spacer(modifier = Modifier.height(Spacing.lg))

                // Feature 5: Heart rate and cadence
                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_heart_vector),
                        contentDescription = "Heart Rate Icon",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Text(
                        text = "Heart rate and cadence tracking",
                        style = AppTextStyles.body,
                        color = Colors.textPrimary
                    )
                }
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
                contentDescription = "Shield Icon",
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

        // Show permission status for debugging
        if (permissionDenied) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = Spacing.md),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.error.copy(alpha = 0.2f)
                )
            ) {
                Text(
                    text = "⚠️ Permission denied. Please enable location in Settings.",
                    style = AppTextStyles.small,
                    color = Colors.error,
                    modifier = Modifier.padding(Spacing.md),
                    textAlign = TextAlign.Center
                )
            }
        }

        // Enable Location Access Button
        Button(
            onClick = {
                android.util.Log.d("LocationPermission", "Button clicked. Current permission: $hasLocationPermission")

                // Re-check permission status
                hasLocationPermission = checkPermission()

                if (hasLocationPermission) {
                    // Already have permission, proceed
                    android.util.Log.d("LocationPermission", "Has permission, navigating from button...")
                    if (!hasNavigated) {
                        hasNavigated = true
                        onPermissionGranted()
                    }
                } else {
                    // Request permissions
                    android.util.Log.d("LocationPermission", "Requesting permissions...")

                    // Build permissions array
                    val permissions = mutableListOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.BODY_SENSORS
                    )

                    // Add ACTIVITY_RECOGNITION for Android 10+
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
                text = if (hasLocationPermission) "Continue to Dashboard" else "Enable Location Access",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.md))

        // Skip for Now
        TextButton(
            onClick = onPermissionGranted,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "Skip for Now",
                style = AppTextStyles.body,
                color = Colors.primary
            )
        }
    }
}

package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.suspendCancellableCoroutine
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.PhysicalActivityType
import live.airuncoach.airuncoach.domain.model.RunSetupConfig
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.RunSessionViewModel
import kotlin.coroutines.resume

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapMyRunSetupScreen(
    mode: String = "route", // "route" or "no_route"
    initialDistance: Float = 5f,
    initialTargetTimeEnabled: Boolean = false,
    initialHours: Int = 0,
    initialMinutes: Int = 0,
    initialSeconds: Int = 0,
    onNavigateBack: () -> Unit = {},
    onGenerateRoute: (
        distance: Float,
        targetTimeEnabled: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int,
        liveTrackingEnabled: Boolean,
        isGroupRun: Boolean,
        latitude: Double,
        longitude: Double
    ) -> Unit = { _, _, _, _, _, _, _, _, _ -> },
    onStartRunWithoutRoute: (
        distance: Float,
        targetTimeEnabled: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int
    ) -> Unit = { _, _, _, _, _ -> }
) {
    val context = LocalContext.current
    val runSessionViewModel: RunSessionViewModel = hiltViewModel()
    val runState by runSessionViewModel.runState.collectAsState()

    // Minor metadata
    var activityMode by remember { mutableStateOf(ActivityMode.RUN) }

    // Core inputs
    var targetDistance by remember { mutableStateOf(initialDistance) }

    var isTargetTimeEnabled by remember { mutableStateOf(initialTargetTimeEnabled) }
    var targetHours by remember { mutableStateOf(initialHours.toString().padStart(2, '0')) }
    var targetMinutes by remember { mutableStateOf(initialMinutes.toString().padStart(2, '0')) }
    var targetSeconds by remember { mutableStateOf(initialSeconds.toString().padStart(2, '0')) }

    // Social toggles
    var isLiveTrackingEnabled by remember { mutableStateOf(false) }
    var isGroupRunEnabled by remember { mutableStateOf(false) } // visual toggle only for now

    // GPS State
    var currentLocation by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var hasLocationPermission by remember { mutableStateOf(false) }
    var isGettingLocation by remember { mutableStateOf(false) }
    var gpsError by remember { mutableStateOf<String?>(null) }

    // Check permission status
    LaunchedEffect(Unit) {
        hasLocationPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    // Permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }

    // Get current location (fresh)
    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission) {
            isGettingLocation = true
            gpsError = null
            try {
                val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)

                Log.d("MapSetup", "🔄 Requesting fresh GPS location...")

                @SuppressLint("MissingPermission")
                val location = suspendCancellableCoroutine { continuation ->
                    fusedLocationClient.getCurrentLocation(
                        Priority.PRIORITY_HIGH_ACCURACY,
                        null
                    ).addOnSuccessListener { loc ->
                        continuation.resume(loc)
                    }.addOnFailureListener { e ->
                        Log.w("MapSetup", "Fresh location failed, trying lastLocation", e)
                        fusedLocationClient.lastLocation.addOnSuccessListener { lastLoc ->
                            continuation.resume(lastLoc)
                        }.addOnFailureListener {
                            continuation.resume(null)
                        }
                    }
                }

                if (location != null) {
                    currentLocation = Pair(location.latitude, location.longitude)
                    Log.d("MapSetup", "✅ Got GPS: ${location.latitude}, ${location.longitude}")
                } else {
                    gpsError = "Unable to acquire GPS signal"
                    Log.e("MapSetup", "❌ GPS location is null")
                }
            } catch (e: Exception) {
                gpsError = "Error getting GPS location"
                Log.e("MapSetup", "❌ Error getting location", e)
            } finally {
                isGettingLocation = false
            }
        }
    }

    // Header copy by mode
    val title = if (mode != "route") "MAP MY RUN SETUP" else "RUN SETUP"
    val subtitle = if (mode == "route") "Configure your AI-generated route" else "Set your run basics"

    // Button enablement
    val gpsReady = currentLocation != null && !isGettingLocation
    val canProceed = gpsReady && hasLocationPermission

    // Parse HH/MM/SS safely
    val hoursInt = targetHours.toIntOrNull() ?: 0
    val minutesInt = targetMinutes.toIntOrNull() ?: 0
    val secondsInt = targetSeconds.toIntOrNull() ?: 0

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 104.dp) // space for bottom CTA
                .imePadding() // Auto-scroll to keep text fields visible when keyboard opens
        ) {

            item {
                SetupHeader(
                    title = title,
                    subtitle = subtitle,
                    gpsLocked = currentLocation != null,
                    onClose = onNavigateBack
                )
            }

            // GPS alert only when acquiring/error/permission-needed
            item {
                Spacer(modifier = Modifier.height(Spacing.sm))
                GpsAlertIfNeeded(
                    isGettingLocation = isGettingLocation,
                    gpsError = gpsError,
                    hasPermission = hasLocationPermission,
                    onGrantPermission = {
                        locationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                )
            }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            // Compact mode toggle (Run/Walk) — minor metadata
            item {
                CompactModeRow(
                    mode = activityMode,
                    onModeChanged = { activityMode = it }
                )
            }

            item { Spacer(modifier = Modifier.height(Spacing.xl)) }

            // Target distance — KEEP functionally & visually close to your original (as requested)
            item {
                TargetDistanceCard(
                    distance = targetDistance,
                    onDistanceChanged = { targetDistance = it }
                )
            }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            // Target time — same function, more compact / less heavy
            item {
                CompactTargetTimeSection(
                    isEnabled = isTargetTimeEnabled,
                    onEnabledChange = { isTargetTimeEnabled = it },
                    hours = targetHours,
                    minutes = targetMinutes,
                    seconds = targetSeconds,
                    onHoursChange = { if (it.length <= 2) targetHours = it },
                    onMinutesChange = { if (it.length <= 2) targetMinutes = it },
                    onSecondsChange = { if (it.length <= 2) targetSeconds = it }
                )
            }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            // Social — redesigned into a single clean section
            item {
                SocialSection(
                    liveTrackingEnabled = isLiveTrackingEnabled,
                    onToggleLiveTracking = { isLiveTrackingEnabled = it },
                    onManageLiveTracking = { /* Navigate to observers */ },

                    groupRunEnabled = isGroupRunEnabled,
                    onToggleGroupRun = { isGroupRunEnabled = it },
                    onManageGroupRun = { /* Navigate to group run setup */ }
                )
            }

            if (mode == "no_route") {
                item { Spacer(modifier = Modifier.height(Spacing.lg)) }

                // Keep AI Summary as OPTIONAL context, not a gate
                item {
                    AiSummaryCard(
                        text = runState.latestCoachMessage
                            ?: "Your coach will generate a briefing once you prepare your run.",
                        isLoading = runState.isLoadingBriefing
                    )
                }
            }

            item { Spacer(modifier = Modifier.height(Spacing.xxl)) }
        }

        // Bottom CTA — single, clean action. Removes “Prepare → Start” gating.
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Colors.backgroundRoot)
                .padding(Spacing.lg)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {

                if (mode == "route") {
                    PrimaryCtaButton(
                        text = when {
                            !hasLocationPermission -> "GRANT LOCATION"
                            isGettingLocation -> "ACQUIRING GPS…"
                            currentLocation == null -> "WAITING FOR GPS SIGNAL"
                            else -> "GENERATE ROUTES"
                        },
                        leadingIconRes = if (hasLocationPermission && currentLocation != null && !isGettingLocation)
                            R.drawable.icon_location_vector else null,
                        enabled = canProceed,
                        onClick = {
                            currentLocation?.let { (lat, lng) ->
                                onGenerateRoute(
                                    targetDistance,
                                    isTargetTimeEnabled,
                                    hoursInt,
                                    minutesInt,
                                    secondsInt,
                                    isLiveTrackingEnabled,
                                    isGroupRunEnabled,
                                    lat,
                                    lng
                                )
                            }
                        }
                    )
                } else {
                    // no_route mode: single start run action
                    PrimaryCtaButton(
                        text = when {
                            !hasLocationPermission -> "GRANT LOCATION"
                            isGettingLocation -> "ACQUIRING GPS…"
                            currentLocation == null -> "WAITING FOR GPS SIGNAL"
                            else -> "PREPARE RUN"
                        },
                        leadingIconRes = if (hasLocationPermission && currentLocation != null && !isGettingLocation)
                            R.drawable.icon_navigation_vector else null,
                        enabled = canProceed && !runState.isStopping,
                        onClick = {
                            // Fire-and-forget prep (no gating). Run session UI should show loading/coach status.
                            val config = RunSetupConfig(
                                activityType = if (activityMode == ActivityMode.WALK) {
                                    PhysicalActivityType.WALK
                                } else {
                                    PhysicalActivityType.RUN
                                },
                                targetDistance = targetDistance,
                                hasTargetTime = isTargetTimeEnabled,
                                targetHours = hoursInt,
                                targetMinutes = minutesInt,
                                targetSeconds = secondsInt,
                                liveTrackingEnabled = isLiveTrackingEnabled,
                                liveTrackingObservers = emptyList(),
                                isGroupRun = isGroupRunEnabled,
                                groupRunParticipants = emptyList()
                            )
                            runSessionViewModel.setRunConfig(config)
                            runSessionViewModel.fetchWellnessData()
                            // NOTE: prepareRun() is now called in RunSessionScreen when it loads
                            // to avoid duplicate API calls

                            // Navigate immediately
                            onStartRunWithoutRoute(
                                targetDistance,
                                isTargetTimeEnabled,
                                hoursInt,
                                minutesInt,
                                secondsInt
                            )
                        }
                    )
                }

                Text(
                    text = "Target: ${targetDistance.toInt()} km",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.xs),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

/* =====================================================================================
   HEADER + GPS
===================================================================================== */

@Composable
private fun SetupHeader(
    title: String,
    subtitle: String,
    gpsLocked: Boolean,
    onClose: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = subtitle,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Subtle locked indicator only (not a big "GPS confirmed" card)
            if (gpsLocked) {
                Pill(
                    text = "GPS Locked",
                    icon = Icons.Default.LocationOn,
                    containerColor = Colors.primary.copy(alpha = 0.16f),
                    contentColor = Colors.primary
                )
            }
        }

        IconButton(onClick = onClose) {
            Icon(
                painter = painterResource(id = R.drawable.icon_x_vector),
                contentDescription = "Close",
                tint = Colors.textPrimary,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@Composable
private fun GpsAlertIfNeeded(
    isGettingLocation: Boolean,
    gpsError: String?,
    hasPermission: Boolean,
    onGrantPermission: () -> Unit
) {
    // Requirement:
    // - keep red alert while acquiring GPS
    // - do NOT show “GPS confirmed” when secure
    // - still handle permission errors gracefully

    val show = !hasPermission || isGettingLocation || gpsError != null
    if (!show) return

    val title = when {
        !hasPermission -> "Location permission required"
        isGettingLocation -> "Acquiring GPS location…"
        else -> "GPS signal unavailable"
    }
    val subtitle = when {
        !hasPermission -> "Grant permission to continue"
        isGettingLocation -> "Please wait for GPS signal"
        else -> gpsError ?: "Please try again"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.error.copy(alpha = 0.12f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isGettingLocation) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = Colors.error
                )
            } else {
                Icon(
                    Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = Colors.error,
                    modifier = Modifier.size(20.dp)
                )
            }

            Spacer(modifier = Modifier.width(Spacing.sm))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.error
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }

            if (!hasPermission) {
                Button(
                    onClick = onGrantPermission,
                    shape = RoundedCornerShape(BorderRadius.full),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Grant", color = Colors.buttonText, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun Pill(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    containerColor: androidx.compose.ui.graphics.Color,
    contentColor: androidx.compose.ui.graphics.Color
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(BorderRadius.full))
            .background(containerColor)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
        }
        Text(
            text = text,
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
            color = contentColor
        )
    }
}

/* =====================================================================================
   MODE TOGGLE (Run/Walk) — compact, minor UI
===================================================================================== */

private enum class ActivityMode { RUN, WALK }

@Composable
private fun CompactModeRow(
    mode: ActivityMode,
    onModeChanged: (ActivityMode) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = "Mode",
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.textSecondary
        )

        ModePillToggle(
            left = "RUN",
            right = "WALK",
            selectedLeft = (mode == ActivityMode.RUN),
            onSelectLeft = { onModeChanged(ActivityMode.RUN) },
            onSelectRight = { onModeChanged(ActivityMode.WALK) }
        )
    }
}

@Composable
private fun ModePillToggle(
    left: String,
    right: String,
    selectedLeft: Boolean,
    onSelectLeft: () -> Unit,
    onSelectRight: () -> Unit
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(BorderRadius.full))
            .background(Colors.backgroundSecondary.copy(alpha = 0.8f))
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val leftBg = if (selectedLeft) Colors.primary.copy(alpha = 0.20f) else androidx.compose.ui.graphics.Color.Transparent
        val leftFg = if (selectedLeft) Colors.primary else Colors.textMuted

        val rightBg = if (!selectedLeft) Colors.primary.copy(alpha = 0.20f) else androidx.compose.ui.graphics.Color.Transparent
        val rightFg = if (!selectedLeft) Colors.primary else Colors.textMuted

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(BorderRadius.full))
                .background(leftBg)
                .clickable(onClick = onSelectLeft)
                .padding(horizontal = 14.dp, vertical = 8.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(left, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = leftFg)
        }

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(BorderRadius.full))
                .background(rightBg)
                .clickable(onClick = onSelectRight)
                .padding(horizontal = 14.dp, vertical = 8.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(right, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = rightFg)
        }
    }
}

/* =====================================================================================
   TARGET DISTANCE — unchanged (your original)
===================================================================================== */

@Composable
fun TargetDistanceCard(distance: Float, onDistanceChanged: (Float) -> Unit) {
    Column(modifier = Modifier.padding(horizontal = Spacing.lg)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom
        ) {
            Text(
                text = "Target Distance",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(BorderRadius.sm))
                    .background(Colors.backgroundSecondary)
                    .padding(horizontal = Spacing.md, vertical = Spacing.sm)
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_location_vector),
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.xs))
                Text(
                    text = "%.0f km goal".format(distance),
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
            }
        }
        Spacer(modifier = Modifier.height(Spacing.md))
        Slider(
            value = distance,
            onValueChange = onDistanceChanged,
            valueRange = 1f..50f,
            modifier = Modifier.fillMaxWidth(),
            colors = SliderDefaults.colors(
                thumbColor = Colors.primary,
                activeTrackColor = Colors.primary,
                inactiveTrackColor = Colors.backgroundTertiary
            )
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("1 km", style = AppTextStyles.caption, color = Colors.textMuted)
            Text("50 km", style = AppTextStyles.caption, color = Colors.textMuted)
        }
    }
}

/* =====================================================================================
   TARGET TIME — compact replacement (same function, cleaner visual weight)
===================================================================================== */

@Composable
private fun CompactTargetTimeSection(
    isEnabled: Boolean,
    onEnabledChange: (Boolean) -> Unit,
    hours: String,
    minutes: String,
    seconds: String,
    onHoursChange: (String) -> Unit,
    onMinutesChange: (String) -> Unit,
    onSecondsChange: (String) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary.copy(alpha = 0.65f))
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Target Time",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = "Optional pacing goal",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }

                Switch(
                    checked = isEnabled,
                    onCheckedChange = onEnabledChange
                )
            }

            if (isEnabled) {
                Spacer(modifier = Modifier.height(Spacing.md))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TimeField(
                        label = "HH",
                        value = hours,
                        onValueChange = onHoursChange,
                        modifier = Modifier.weight(1f)
                    )
                    TimeField(
                        label = "MM",
                        value = minutes,
                        onValueChange = onMinutesChange,
                        modifier = Modifier.weight(1f)
                    )
                    TimeField(
                        label = "SS",
                        value = seconds,
                        onValueChange = onSecondsChange,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun TimeField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = { raw ->
            val filtered = raw.filter { it.isDigit() }.take(2)
            onValueChange(filtered)
        },
        modifier = modifier,
        singleLine = true,
        textStyle = AppTextStyles.body.copy(
            color = Colors.textPrimary,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        ),
        label = { Text(label, color = Colors.textMuted) },
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Colors.primary.copy(alpha = 0.65f),
            unfocusedBorderColor = Colors.backgroundTertiary,
            focusedLabelColor = Colors.primary,
            unfocusedLabelColor = Colors.textMuted,
            cursorColor = Colors.primary
        ),
        shape = RoundedCornerShape(BorderRadius.md)
    )
}

/* =====================================================================================
   SOCIAL — redesigned (Live Tracking + Group Run)
===================================================================================== */

@Composable
private fun SocialSection(
    liveTrackingEnabled: Boolean,
    onToggleLiveTracking: (Boolean) -> Unit,
    onManageLiveTracking: () -> Unit,

    groupRunEnabled: Boolean,
    onToggleGroupRun: (Boolean) -> Unit,
    onManageGroupRun: () -> Unit
) {
    Column(modifier = Modifier.padding(horizontal = Spacing.lg)) {
        Text(
            text = "Social",
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Spacer(modifier = Modifier.height(Spacing.sm))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(BorderRadius.md),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary.copy(alpha = 0.65f))
        ) {
            Column(modifier = Modifier.padding(vertical = 6.dp)) {

                SocialRowToggle(
                    title = "Live Tracking",
                    subtitle = "Share your live location",
                    enabled = liveTrackingEnabled,
                    onToggle = { onToggleLiveTracking(it) },
                    onManage = onManageLiveTracking
                )

                Divider(color = Colors.backgroundTertiary.copy(alpha = 0.6f))

                SocialRowToggle(
                    title = "Group Run",
                    subtitle = "Invite friends to join",
                    enabled = groupRunEnabled,
                    onToggle = { onToggleGroupRun(it) },
                    onManage = onManageGroupRun
                )
            }
        }
    }
}

@Composable
private fun SocialRowToggle(
    title: String,
    subtitle: String,
    enabled: Boolean,
    onToggle: (Boolean) -> Unit,
    onManage: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Small icon chip (minimal)
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Colors.backgroundTertiary.copy(alpha = 0.7f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_profile_vector),
                contentDescription = null,
                tint = Colors.primary,
                modifier = Modifier.size(18.dp)
            )
        }

        Spacer(modifier = Modifier.width(Spacing.md))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary
            )
            Text(
                text = subtitle,
                style = AppTextStyles.small,
                color = Colors.textMuted
            )
        }

        Switch(
            checked = enabled,
            onCheckedChange = onToggle
        )
/*
        Spacer(modifier = Modifier.width(8.dp))

        // Manage chevron (only useful when enabled)
        val manageAlpha = if (enabled) 1f else 0.35f
        Icon(
            painter = painterResource(id = R.drawable.icon_play_vector),
            contentDescription = "Manage",
            tint = Colors.textMuted.copy(alpha = manageAlpha),
            modifier = Modifier
                .size(22.dp)
                .clickable(enabled = enabled) { onManage() }
        )
        */
    }
}

/* =====================================================================================
   OPTIONAL AI SUMMARY (no longer blocks Start Run)
===================================================================================== */

@Composable
private fun AiSummaryCard(
    text: String,
    isLoading: Boolean
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary.copy(alpha = 0.55f))
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Coach Briefing",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary,
                    modifier = Modifier.weight(1f)
                )

                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = Colors.primary
                    )
                }
            }
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                text = text,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
        }
    }
}

/* =====================================================================================
   CTA BUTTON (single, clean)
===================================================================================== */

@Composable
private fun PrimaryCtaButton(
    text: String,
    leadingIconRes: Int?,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = ButtonDefaults.buttonColors(
            containerColor = Colors.primary,
            contentColor = Colors.buttonText,
            disabledContainerColor = Colors.backgroundTertiary,
            disabledContentColor = Colors.textMuted
        )
    ) {
        if (leadingIconRes != null) {
            Icon(
                painter = painterResource(id = leadingIconRes),
                contentDescription = null,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
        }
        Text(
            text = text,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
        )
    }
}

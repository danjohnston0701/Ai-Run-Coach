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
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
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
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.domain.model.PhysicalActivityType
import live.airuncoach.airuncoach.domain.model.RunSetupConfig
import live.airuncoach.airuncoach.ui.dialogs.FriendPickerDialog
import live.airuncoach.airuncoach.ui.components.OutlinedCtaButton
import live.airuncoach.airuncoach.ui.components.PrepareRunOnWatchButton
import live.airuncoach.airuncoach.ui.components.WatchNeedsPhoneCaption
import live.airuncoach.airuncoach.ui.components.WatchSendState
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.RunSessionViewModel
import live.airuncoach.airuncoach.viewmodel.FriendsViewModel
import live.airuncoach.airuncoach.viewmodel.FriendsUiState
import live.airuncoach.airuncoach.viewmodel.FriendsViewModelFactory
import kotlin.coroutines.resume
import kotlin.math.roundToInt
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.BasicTextField
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.utils.TargetDistance

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MapMyRunSetupScreen(
    mode: String = "route", // "route" or "no_route"
    initialDistance: Float = 5f,
    initialTargetTimeEnabled: Boolean = false,
    initialHours: Int = 0,
    initialMinutes: Int = 0,
    initialSeconds: Int = 0,
    initialAiCoachEnabled: Boolean = false,
    initialSessionType: String = "RUN",
    isGroupRun: Boolean = false,
    groupRunId: String? = null,
    onNavigateBack: () -> Unit = {},
    onGenerateRoute: (
        distance: Float,
        targetTimeEnabled: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int,
        liveTrackingEnabled: Boolean,
        liveTrackingObservers: List<String>,
        isGroupRun: Boolean,
        groupRunParticipants: List<String>,
        latitude: Double,
        longitude: Double,
        aiCoachEnabled: Boolean,
        activityType: String
    ) -> Unit = { _, _, _, _, _, _, _, _, _, _, _, _, _ -> },
    onStartRunWithoutRoute: (
        distance: Float,
        targetTimeEnabled: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int,
        liveTrackingEnabled: Boolean,
        liveTrackingObservers: List<String>,
        isGroupRun: Boolean,
        groupRunParticipants: List<String>,
        activityType: String,
        isWatchMode: Boolean
    ) -> Unit = { _, _, _, _, _, _, _, _, _, _, _ -> }
) {
    val context = LocalContext.current
    // Remembers the last-picked target distance/time so it survives a full app close/reopen
    // (mirrors DashboardViewModel's identically-keyed persistence, which seeds initialDistance
    // for this screen's two real entry points — route generation and free-run setup). Written
    // here too so the value is captured the moment the user adjusts it, not only via Dashboard.
    val targetPrefs = remember { context.getSharedPreferences("user_prefs", android.content.Context.MODE_PRIVATE) }
    val runSessionViewModel: RunSessionViewModel = hiltViewModel()
    val runState by runSessionViewModel.runState.collectAsState()
    // "Prepare for Watch" fires from THIS screen, before RunSessionScreen (which normally sets
    // the group ID) ever mounts — so set it here too, or prepareServiceForWatch() has no
    // groupRunId to hand the service and a watch-started group run is uploaded unlinked.
    LaunchedEffect(groupRunId) {
        groupRunId?.let { runSessionViewModel.setGroupRunId(it) }
    }
    val companionInstalled by runSessionViewModel.isWatchCompanionInstalled.collectAsState()
    var watchSendState by remember { mutableStateOf(WatchSendState.IDLE) }
    
    // Load friends for group run invitations
    val friendsViewModel: FriendsViewModel = remember { 
        FriendsViewModelFactory(context).create(FriendsViewModel::class.java)
    }
    val friendsState by friendsViewModel.friendsState.collectAsState()

    // Minor metadata
    val defaultActivityMode = if (initialSessionType.equals("walk", ignoreCase = true)) ActivityMode.WALK else ActivityMode.RUN
    var activityMode by remember { mutableStateOf(defaultActivityMode) }

    // Core inputs
    val targetDistanceDecimals = remember { SessionManager(context).targetDistanceDecimals() }
    val targetDistanceRange = remember { SessionManager(context).targetDistanceRange() }
    var targetDistance by remember { mutableStateOf(initialDistance) }

    var isTargetTimeEnabled by remember { mutableStateOf(initialTargetTimeEnabled) }
    var targetHours by remember { mutableStateOf(initialHours.toString().padStart(2, '0')) }
    var targetMinutes by remember { mutableStateOf(initialMinutes.toString().padStart(2, '0')) }
    var targetSeconds by remember { mutableStateOf(initialSeconds.toString().padStart(2, '0')) }

    // Social toggles
    var isLiveTrackingEnabled by remember { mutableStateOf(false) }
    var liveTrackingObservers by remember { mutableStateOf<List<String>>(emptyList()) } // User IDs / emails for invited observers
    // Pending email text — lifted from LiveTrackingObserverSection so the Prepare Run button can
    // auto-flush it into liveTrackingObservers even if the user never pressed the ✓ checkmark.
    var liveTrackingPendingEmail by remember { mutableStateOf("") }
    var isGroupRunEnabled by remember { mutableStateOf(isGroupRun) }
    var groupRunParticipants by remember { mutableStateOf<List<String>>(emptyList()) } // User IDs for group run participants
    // AI Coach should be ENABLED by default for better user experience
    var isAiCoachEnabled by remember { mutableStateOf(initialAiCoachEnabled) }

    // TODO: Load group run details if this is a group run screen
    // This would require injecting ApiService directly or creating a ViewModel for it

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

    // Header copy by mode and activity type
    val activityTypeLabel = if (activityMode == ActivityMode.WALK) "WALK" else "RUN"
    val title = if (mode == "route") "MAP MY $activityTypeLabel SETUP" else "CONFIGURE YOUR $activityTypeLabel"
    val subtitle = if (mode == "route") "Configure your route preferences" else "Set your ${activityTypeLabel.lowercase()} details"

    // Button enablement
    val gpsReady = currentLocation != null && !isGettingLocation
    val canProceed = gpsReady && hasLocationPermission

    // Parse HH/MM/SS safely
    val hoursInt = targetHours.toIntOrNull() ?: 0
    val minutesInt = targetMinutes.toIntOrNull() ?: 0
    val secondsInt = targetSeconds.toIntOrNull() ?: 0
    val isKeyboardVisible = WindowInsets.isImeVisible
    val density = LocalDensity.current
    // Bottom padding = the fixed CTA bar's height, so the Social / Group Run section can always be
    // scrolled fully above it (140.dp floor = one button + padding + the target caption).
    // Measured, not fixed: the bar is roughly twice as tall when the watch options (Prepare for
    // Watch + the "take your phone" caption + Prepare on Phone) are stacked in it.
    var ctaBarHeightPx by remember { mutableIntStateOf(0) }
    val ctaBarHeight = with(density) { ctaBarHeightPx.toDp() }.coerceAtLeast(140.dp)
    val bottomContentPadding = if (isKeyboardVisible) {
        with(density) { WindowInsets.ime.getBottom(this).toDp() } + ctaBarHeight
    } else {
        ctaBarHeight
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 0.dp),
            contentPadding = PaddingValues(bottom = bottomContentPadding)
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

            // Target distance — HIDE for group runs (distance is already set in group run record)
            if (!isGroupRun) {
                item {
                    TargetDistanceCard(
                        distance = targetDistance,
                        decimals = targetDistanceDecimals,
                        range = targetDistanceRange,
                        onDistanceChanged = {
                            // Snap to the configured places (not always whole km — that's what
                            // made the setting inert before).
                            val value = TargetDistance.round(it, targetDistanceDecimals)
                            targetDistance = value
                            targetPrefs.edit().putFloat("target_distance_km", value).apply()
                        }
                    )
                }

                item { Spacer(modifier = Modifier.height(Spacing.lg)) }
            }

            // Target time — same function, more compact / less heavy
            item {
                CompactTargetTimeSection(
                    isEnabled = isTargetTimeEnabled,
                    onEnabledChange = {
                        isTargetTimeEnabled = it
                        targetPrefs.edit().putBoolean("target_time_enabled", it).apply()
                    },
                    hours = targetHours,
                    minutes = targetMinutes,
                    seconds = targetSeconds,
                    onHoursChange = { if (it.length <= 2) { targetHours = it; targetPrefs.edit().putString("target_hours", it).apply() } },
                    onMinutesChange = { if (it.length <= 2) { targetMinutes = it; targetPrefs.edit().putString("target_minutes", it).apply() } },
                    onSecondsChange = { if (it.length <= 2) { targetSeconds = it; targetPrefs.edit().putString("target_seconds", it).apply() } }
                )
            }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            // AI Coach toggle
            item {
                AiCoachToggleSection(
                    enabled = isAiCoachEnabled,
                    onToggle = { isAiCoachEnabled = it },
                    mode = mode
                )
            }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            // Group Run toggle — HIDE if this is already a group run (toggle is already enabled)
            if (!isGroupRun) {
                item {
                    val friendsList = when (friendsState) {
                        is FriendsUiState.Success -> (friendsState as FriendsUiState.Success).friends
                        else -> emptyList()
                    }
                    GroupRunSection(
                        liveTrackingEnabled = isLiveTrackingEnabled,
                        onToggleLiveTracking = { isLiveTrackingEnabled = it },
                        liveTrackingObservers = liveTrackingObservers,
                        onObserversChanged = { liveTrackingObservers = it },
                        pendingEmail = liveTrackingPendingEmail,
                        onPendingEmailChange = { liveTrackingPendingEmail = it },
                        groupRunEnabled = isGroupRunEnabled,
                        onToggleGroupRun = { isGroupRunEnabled = it },
                        groupRunParticipants = groupRunParticipants,
                        onParticipantsChanged = { groupRunParticipants = it },
                        friends = friendsList,
                        isLoadingFriends = friendsState is FriendsUiState.Loading
                    )
                }
            }
/*Hide AI Pre-Summary text
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

 */

            // contentPadding handles bottom clearance above the fixed CTA bar
        }

        // Bottom CTA — single, clean action. Removes “Prepare → Start” gating.
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .onSizeChanged { ctaBarHeightPx = it.height }
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
                                // Flush any typed-but-not-confirmed observer email, mirroring
                                // the no-route Prepare Run flush below.
                                val trimmedPending = liveTrackingPendingEmail.trim()
                                val finalObservers = if (trimmedPending.contains("@") && trimmedPending.isNotEmpty()
                                    && !liveTrackingObservers.contains(trimmedPending)) {
                                    liveTrackingObservers + trimmedPending
                                } else {
                                    liveTrackingObservers
                                }
                                onGenerateRoute(
                                    targetDistance,
                                    isTargetTimeEnabled,
                                    hoursInt,
                                    minutesInt,
                                    secondsInt,
                                    isLiveTrackingEnabled,
                                    finalObservers,
                                    isGroupRunEnabled,
                                    groupRunParticipants,
                                    lat,
                                    lng,
                                    isAiCoachEnabled,
                                    if (activityMode == ActivityMode.WALK) "WALK" else "RUN"
                                )
                            }
                        }
                    )
                } else {
                    // no_route mode: conditional layout based on watch availability
                    if (companionInstalled) {
                        // Stacked when a watch is available: Prepare for Watch, then the "take your
                        // phone" caption, then Prepare on Phone — so nobody reads the watch option
                        // as "the watch does it all" and leaves the phone behind.
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                        ) {
                            Box(modifier = Modifier.fillMaxWidth()) {
                                PrepareRunOnWatchButton(
                                    companionInstalled = companionInstalled,
                                    sendState = watchSendState,
                                    isPrimary = true,
                                    onPrepare = {
                                        watchSendState = WatchSendState.SENDING

                                        // Auto-flush any pending email before building config
                                        val watchPending = liveTrackingPendingEmail.trim()
                                        val watchObservers = if (watchPending.contains("@") && watchPending.isNotEmpty()
                                            && !liveTrackingObservers.contains(watchPending)
                                        ) {
                                            liveTrackingPendingEmail = ""
                                            liveTrackingObservers + watchPending
                                        } else {
                                            liveTrackingObservers
                                        }

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
                                            aiCoachEnabled = isAiCoachEnabled,
                                            liveTrackingEnabled = isLiveTrackingEnabled,
                                            liveTrackingObservers = watchObservers,
                                            isGroupRun = isGroupRunEnabled,
                                            groupRunParticipants = groupRunParticipants,
                                            isWatchMode = true
                                        )
                                        // Set config BEFORE preparing watch so that
                                        // prepareRunOnWatch() reads the correct sessionType
                                        runSessionViewModel.setRunConfig(config)
                                        runSessionViewModel.fetchWellnessData()

                                        // Prepare watch — now reads correct activityType from runConfig
                                        runSessionViewModel.prepareRunOnWatch(
                                            distanceKm = targetDistance,
                                            runType = "free"
                                        )
                                        watchSendState = WatchSendState.SENT

                                        onStartRunWithoutRoute(
                                            targetDistance,
                                            isTargetTimeEnabled,
                                            hoursInt,
                                            minutesInt,
                                            secondsInt,
                                            isLiveTrackingEnabled,
                                            watchObservers,
                                            isGroupRunEnabled,
                                            groupRunParticipants,
                                            if (activityMode == ActivityMode.WALK) "WALK" else "RUN",
                                            true  // isWatchMode — navigate to the watch-standby run screen
                                        )
                                    }
                                )
                            }

                            WatchNeedsPhoneCaption(isWalk = activityMode == ActivityMode.WALK)

                            // Prepare on Phone — secondary outlined action
                            Box(modifier = Modifier.fillMaxWidth()) {
                                OutlinedCtaButton(
                                    text = when {
                                        !hasLocationPermission -> "GRANT LOCATION"
                                        isGettingLocation -> "ACQUIRING GPS…"
                                        currentLocation == null -> "WAITING FOR GPS SIGNAL"
                                        else -> "Prepare ${if (activityMode == ActivityMode.WALK) "Walk" else "Run"} on Phone"
                                    },
                                    leadingIconRes = if (hasLocationPermission && currentLocation != null && !isGettingLocation)
                                        R.drawable.icon_navigation_vector else null,
                                    enabled = canProceed && !runState.isStopping,
                                    onClick = {
                                        // Auto-flush any pending email before building config
                                        val phonePending = liveTrackingPendingEmail.trim()
                                        val phoneObservers = if (phonePending.contains("@") && phonePending.isNotEmpty()
                                            && !liveTrackingObservers.contains(phonePending)
                                        ) {
                                            liveTrackingPendingEmail = ""
                                            liveTrackingObservers + phonePending
                                        } else {
                                            liveTrackingObservers
                                        }

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
                                            aiCoachEnabled = isAiCoachEnabled,
                                            liveTrackingEnabled = isLiveTrackingEnabled,
                                            liveTrackingObservers = phoneObservers,
                                            isGroupRun = isGroupRunEnabled,
                                            groupRunParticipants = groupRunParticipants
                                        )
                                        runSessionViewModel.setRunConfig(config)
                                        runSessionViewModel.fetchWellnessData()

                                        onStartRunWithoutRoute(
                                            targetDistance,
                                            isTargetTimeEnabled,
                                            hoursInt,
                                            minutesInt,
                                            secondsInt,
                                            isLiveTrackingEnabled,
                                            phoneObservers,
                                            isGroupRunEnabled,
                                            groupRunParticipants,
                                            if (activityMode == ActivityMode.WALK) "WALK" else "RUN",
                                            false  // isWatchMode — phone starts tracking immediately
                                        )
                                    }
                                )
                            }
                        }
                    } else {
                        PrimaryCtaButton(
                            text = when {
                                !hasLocationPermission -> "GRANT LOCATION"
                                isGettingLocation -> "ACQUIRING GPS…"
                                currentLocation == null -> "WAITING FOR GPS SIGNAL"
                                else -> "PREPARE ${if (activityMode == ActivityMode.WALK) "WALK" else "RUN"}"
                            },
                            leadingIconRes = if (hasLocationPermission && currentLocation != null && !isGettingLocation)
                                R.drawable.icon_navigation_vector else null,
                            enabled = canProceed && !runState.isStopping,
                            onClick = {
                                // Auto-flush any email the user typed but didn't confirm with ✓
                                val trimmedPending = liveTrackingPendingEmail.trim()
                                val finalObservers = if (trimmedPending.contains("@") && trimmedPending.isNotEmpty()
                                    && !liveTrackingObservers.contains(trimmedPending)
                                ) {
                                    liveTrackingPendingEmail = ""
                                    liveTrackingObservers + trimmedPending
                                } else {
                                    liveTrackingObservers
                                }

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
                                    aiCoachEnabled = isAiCoachEnabled,
                                    liveTrackingEnabled = isLiveTrackingEnabled,
                                    liveTrackingObservers = finalObservers,
                                    isGroupRun = isGroupRunEnabled,
                                    groupRunParticipants = groupRunParticipants
                                )
                                runSessionViewModel.setRunConfig(config)
                                runSessionViewModel.fetchWellnessData()

                                onStartRunWithoutRoute(
                                    targetDistance,
                                    isTargetTimeEnabled,
                                    hoursInt,
                                    minutesInt,
                                    secondsInt,
                                    isLiveTrackingEnabled,
                                    finalObservers,
                                    isGroupRunEnabled,
                                    groupRunParticipants,
                                    if (activityMode == ActivityMode.WALK) "WALK" else "RUN",
                                    false  // isWatchMode — phone starts tracking immediately
                                )
                            }
                        )
                    }
                }

                Text(
                    text = "Target: ${TargetDistance.format(targetDistance, targetDistanceDecimals)} km",
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
   (SetupHeader / CompactModeRow / CompactTargetTimeSection / AiCoachToggleSection /
   GroupRunSection / PrimaryCtaButton are `internal` rather than private so the onboarding
   feature tour — OnboardingTourScreen.kt's MockRunSetupScreen — can compose a pixel-faithful
   clone of this screen from the real building blocks instead of hand-drawing an approximation.)
===================================================================================== */

@Composable
internal fun SetupHeader(
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
internal fun GpsAlertIfNeeded(
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

internal enum class ActivityMode { RUN, WALK }

@Composable
internal fun CompactModeRow(
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
            text = "Session Type:",
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

/**
 * @param decimals 0–3 places from the user's profile. The value badge is always a tappable
 *   numeric field limited to that many places. At 0 or 1 a slider (whole km, or tenths over a
 *   span capped at 25 km) sits under it for quick selection; at 2 or 3 the slider is gone
 *   entirely, because it cannot express a real race distance — a half marathon is 21.0975 km
 *   and a marathon 42.195.
 */
@Composable
fun TargetDistanceCard(
    distance: Float,
    onDistanceChanged: (Float) -> Unit,
    decimals: Int = 0,
    range: ClosedFloatingPointRange<Float> = 1f..50f,
) {
    val textEntry = TargetDistance.usesTextEntry(decimals)
    // Held as text while editing so partial input ("21." on the way to "21.098") survives.
    var editing by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    LaunchedEffect(distance, decimals, editing) {
        if (!editing) draft = TargetDistance.format(distance, decimals)
    }
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
                BasicTextField(
                    value = draft,
                    onValueChange = { raw ->
                        editing = true
                        draft = TargetDistance.sanitizeInput(raw, decimals)
                        draft.toFloatOrNull()
                            ?.takeIf { it in 0.1f..500f } // typed targets aren't bound by the slider window
                            ?.let(onDistanceChanged)
                    },
                    textStyle = AppTextStyles.body.copy(
                        fontWeight = FontWeight.Bold,
                        color = Colors.primary,
                    ),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = if (decimals == 0) KeyboardType.Number else KeyboardType.Decimal),
                    keyboardActions = KeyboardActions(onDone = { editing = false }),
                    cursorBrush = SolidColor(Colors.primary),
                    modifier = Modifier.width(if (textEntry) 80.dp else 56.dp),
                )
                Text(
                    text = " km goal",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
            }
        }
        Spacer(modifier = Modifier.height(Spacing.xs))
        Text(
            text = if (textEntry) "Tap the distance to type an exact target (up to $decimals decimal places)"
                   else "Slide, or tap the distance to type it",
            style = AppTextStyles.caption,
            color = Colors.textMuted
        )
        if (!textEntry) {
            Spacer(modifier = Modifier.height(Spacing.sm))
            Slider(
                value = distance.coerceIn(range),
                onValueChange = { editing = false; onDistanceChanged(it) },
                valueRange = range,
                // 0 dp: snap to whole kilometres (N km span = N−1 intermediate steps).
                // 1 dp: run continuously and let the caller round to tenths — hundreds of tick
                // marks would be unreadable.
                steps = if (decimals == 0) (range.endInclusive - range.start).roundToInt().coerceAtLeast(1) - 1 else 0,
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
                Text("${range.start.roundToInt()} km", style = AppTextStyles.caption, color = Colors.textMuted)
                Text("${range.endInclusive.roundToInt()} km", style = AppTextStyles.caption, color = Colors.textMuted)
            }
        }
    }
}

/* =====================================================================================
   TARGET TIME — compact replacement (same function, cleaner visual weight)
===================================================================================== */

@Composable
internal fun CompactTargetTimeSection(
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
   AI COACH TOGGLE
===================================================================================== */

@Composable
internal fun AiCoachToggleSection(
    enabled: Boolean,
    onToggle: (Boolean) -> Unit,
    mode: String = "route"
) {
    Column(modifier = Modifier.padding(horizontal = Spacing.lg)) {
        Text(
            text = "AI Coach",
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(BorderRadius.md),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary.copy(alpha = 0.65f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(
                            if (enabled) Colors.primary.copy(alpha = 0.18f)
                            else Colors.backgroundTertiary.copy(alpha = 0.7f)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_ai_vector),
                        contentDescription = null,
                        tint = if (enabled) Colors.primary else Colors.textMuted,
                        modifier = Modifier.size(18.dp)
                    )
                }

                Spacer(modifier = Modifier.width(Spacing.md))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Enable AI Coach",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = if (enabled) {
                            if (mode == "no_route") "AI feedback during your run" else "Coach will guide your run"
                        } else {
                            "Off – run without coaching"
                        },
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }

                Switch(
                    checked = enabled,
                    onCheckedChange = onToggle
                )
            }
        }
    }
}

/* =====================================================================================
   SOCIAL SECTION — Live Tracking + Group Run
===================================================================================== */

@Composable
internal fun GroupRunSection(
    liveTrackingEnabled: Boolean,
    onToggleLiveTracking: (Boolean) -> Unit,
    liveTrackingObservers: List<String>,
    onObserversChanged: (List<String>) -> Unit,
    pendingEmail: String,
    onPendingEmailChange: (String) -> Unit,
    groupRunEnabled: Boolean,
    onToggleGroupRun: (Boolean) -> Unit,
    groupRunParticipants: List<String>,
    onParticipantsChanged: (List<String>) -> Unit,
    friends: List<Friend>,
    isLoadingFriends: Boolean = false,
    // Onboarding tour only: lets the tour pulse ONE of the two rows at a time. The rows live
    // inside this shared card, so the tour can't wrap them from outside the way it wraps the
    // sections it composes itself. A Modifier rather than a wrapper composable so the caller
    // owns the animation — see OnboardingTourScreen's Modifier.tourHighlight. Default no-op.
    liveTrackingRowModifier: Modifier = Modifier,
    groupRunRowModifier: Modifier = Modifier
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
                // Live Tracking toggle + expandable observer picker
                Column(modifier = liveTrackingRowModifier) {
                    SocialRowToggle(
                        title = "Live Tracking",
                        subtitle = "Share your live location",
                        enabled = liveTrackingEnabled,
                        onToggle = { onToggleLiveTracking(it) }
                    )

                    // Expandable observer section (shown when Live Tracking is enabled)
                    if (liveTrackingEnabled) {
                        HorizontalDivider(color = Colors.backgroundTertiary.copy(alpha = 0.6f))
                        LiveTrackingObserverSection(
                            observers = liveTrackingObservers,
                            onObserversChanged = onObserversChanged,
                            pendingEmail = pendingEmail,
                            onPendingEmailChange = onPendingEmailChange,
                            friends = friends
                        )
                    }
                }

                HorizontalDivider(color = Colors.backgroundTertiary.copy(alpha = 0.6f))

                // Group Run toggle + expandable participant picker
                Column(modifier = groupRunRowModifier) {
                    SocialRowToggle(
                        title = "Group Session",
                        subtitle = "Invite friends to join",
                        enabled = groupRunEnabled,
                        onToggle = { onToggleGroupRun(it) }
                    )

                    // Expandable participant section (shown when Group Run is enabled)
                    if (groupRunEnabled) {
                        HorizontalDivider(color = Colors.backgroundTertiary.copy(alpha = 0.6f))
                        GroupRunParticipantSection(
                            participants = groupRunParticipants,
                            onParticipantsChanged = onParticipantsChanged,
                            friends = friends,
                            isLoadingFriends = isLoadingFriends
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SocialRowToggle(
    title: String,
    subtitle: String,
    enabled: Boolean,
    onToggle: (Boolean) -> Unit
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
                painter = painterResource(id = R.drawable.icon_people_vector),
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
    }
}

/* =====================================================================================
   GROUP RUN — Participant Picker (expanded when Group Run enabled)
===================================================================================== */

@Composable
private fun GroupRunParticipantSection(
    participants: List<String>,
    onParticipantsChanged: (List<String>) -> Unit,
    friends: List<Friend>,
    isLoadingFriends: Boolean = false
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = 12.dp)
    ) {
        // Header: "Who's running with you?"
        Text(
            text = "Who's running with you?",
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.textPrimary,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        // Loading state
        if (isLoadingFriends) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Spacing.lg),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Colors.primary)
            }
        } else if (friends.isEmpty()) {
            // No friends message
            Text(
                text = "No friends yet — add friends from the Profile page!",
                style = AppTextStyles.small,
                color = Colors.textMuted,
                modifier = Modifier.padding(vertical = Spacing.md)
            )
        } else {
            // Friends list with checkboxes — uses Column (not LazyColumn) so the outer
            // LazyColumn can scroll through all items without a nested-scroll conflict.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Colors.backgroundTertiary.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                    .padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                friends.forEach { friend ->
                    val isSelected = friend.id in participants
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onParticipantsChanged(
                                    if (isSelected) {
                                        participants.filter { it != friend.id }
                                    } else {
                                        participants + friend.id
                                    }
                                )
                            }
                            .padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Checkbox
                        Checkbox(
                            checked = isSelected,
                            onCheckedChange = { checked ->
                                onParticipantsChanged(
                                    if (checked) {
                                        participants + friend.id
                                    } else {
                                        participants.filter { it != friend.id }
                                    }
                                )
                            },
                            colors = CheckboxDefaults.colors(
                                checkedColor = Colors.primary,
                                uncheckedColor = Colors.primary.copy(alpha = 0.5f)
                            )
                        )

                        // Avatar placeholder
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(Colors.primary.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                friend.name.firstOrNull()?.uppercaseChar().toString(),
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                color = Colors.primary
                            )
                        }

                        // Friend name and fitness level
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                friend.name,
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.textPrimary
                            )
                            friend.fitnessLevel?.let { level ->
                                Text(
                                    level,
                                    style = AppTextStyles.small,
                                    color = Colors.textMuted
                                )
                            }
                        }
                    }
                }
            }

            // Selected count summary
            if (participants.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "${participants.size} friend${if (participants.size != 1) "s" else ""} selected",
                    style = AppTextStyles.small,
                    color = Colors.primary,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

/* =====================================================================================
   LIVE TRACKING — Observer Picker (expanded when Live Tracking enabled)
===================================================================================== */

@Composable
internal fun LiveTrackingObserverSection(
    observers: List<String>,
    onObserversChanged: (List<String>) -> Unit,
    pendingEmail: String,
    onPendingEmailChange: (String) -> Unit,
    friends: List<Friend>
) {
    var showFriendPicker by remember { mutableStateOf(false) }
    // emailInput is now lifted to the parent screen so the Prepare Run button can auto-flush it
    val emailInput = pendingEmail
    fun addEmailIfValid() {
        val trimmed = emailInput.trim()
        if (trimmed.contains("@") && trimmed.isNotEmpty() && !observers.contains(trimmed)) {
            onObserversChanged(observers + trimmed)
            onPendingEmailChange("")
        }
    }
    
    // Friend picker dialog — only shows friend IDs (emails are added separately)
    if (showFriendPicker) {
        // Pre-select the friend IDs already in the list (emails excluded)
        val alreadySelectedFriendIds = observers.filter { !it.contains("@") }
        FriendPickerDialog(
            friends = friends,
            onFriendsSelected = { selectedFriendIds ->
                // Replace friend IDs in the list; preserve existing email entries
                val existingEmails = observers.filter { it.contains("@") }
                onObserversChanged(existingEmails + selectedFriendIds)
            },
            onDismiss = { showFriendPicker = false },
            initialSelected = alreadySelectedFriendIds
        )
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = 12.dp)
    ) {
        // Header: "Who can watch?"
        Text(
            text = "Who can watch?",
            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.textPrimary,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        // Add friend button
        Button(
            onClick = { showFriendPicker = !showFriendPicker },
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Colors.backgroundTertiary.copy(alpha = 0.7f)
            )
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_people_vector),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = Colors.primary
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                "Add Friend",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Email input with prominent "Add Email" button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextField(
                value = emailInput,
                onValueChange = { onPendingEmailChange(it) },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
                placeholder = {
                    Text(
                        "email@example.com",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                },
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Colors.backgroundTertiary.copy(alpha = 0.5f),
                    unfocusedContainerColor = Colors.backgroundTertiary.copy(alpha = 0.3f),
                    focusedIndicatorColor = Colors.primary,
                    unfocusedIndicatorColor = Colors.backgroundTertiary.copy(alpha = 0.5f)
                ),
                textStyle = AppTextStyles.small,
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Email,
                    imeAction = androidx.compose.ui.text.input.ImeAction.Done
                ),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                    onDone = { addEmailIfValid() }
                )
            )

            // Prominent "Add Email" button
            Button(
                onClick = { addEmailIfValid() },
                modifier = Modifier
                    .fillMaxHeight()
                    .width(56.dp),
                enabled = emailInput.trim().isNotEmpty(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    disabledContainerColor = Colors.backgroundTertiary.copy(alpha = 0.5f)
                ),
                shape = RoundedCornerShape(BorderRadius.md)
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_check_vector),
                    contentDescription = "Add email",
                    tint = if (emailInput.trim().isNotEmpty()) Colors.textPrimary else Colors.textMuted,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // Invited Observers section — shows count and list when observers are added
        if (observers.isNotEmpty()) {
            Spacer(modifier = Modifier.height(16.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(BorderRadius.md),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary.copy(alpha = 0.6f))
            ) {
                Column(modifier = Modifier.padding(Spacing.md)) {
                    // Header with count
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_people_vector),
                                contentDescription = null,
                                tint = Colors.primary,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = "Invited Observers",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.textPrimary
                            )
                        }
                        // Count badge
                        Box(
                            modifier = Modifier
                                .background(Colors.primary, CircleShape)
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = observers.size.toString(),
                                style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                                color = Colors.textPrimary
                            )
                        }
                    }

                    HorizontalDivider(
                        color = Colors.backgroundTertiary.copy(alpha = 0.5f),
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    // List of observers
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        observers.forEach { observer ->
                            val displayName = if (observer.contains("@")) {
                                observer
                            } else {
                                friends.find { it.id == observer }?.name ?: observer
                            }
                            val isEmail = observer.contains("@")

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(
                                        painter = painterResource(
                                            id = if (isEmail) R.drawable.icon_email else R.drawable.icon_people_vector
                                        ),
                                        contentDescription = null,
                                        tint = Colors.textMuted,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = displayName,
                                        style = AppTextStyles.small,
                                        color = Colors.textPrimary
                                    )
                                }
                                IconButton(
                                    onClick = {
                                        onObserversChanged(observers.filter { it != observer })
                                    },
                                    modifier = Modifier.size(24.dp)
                                ) {
                                    Icon(
                                        painter = painterResource(id = R.drawable.icon_close_vector),
                                        contentDescription = "Remove",
                                        tint = Colors.textMuted,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
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
internal fun PrimaryCtaButton(
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

// OutlinedCtaButton moved to ui.components.OutlinedCtaButton — shared with
// RouteSelectionScreen and WorkoutDetailScreen (see that file for rationale).

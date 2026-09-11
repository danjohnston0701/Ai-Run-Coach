package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.math.roundToInt
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.HeartRateZones
import live.airuncoach.airuncoach.network.model.WorkoutDetails
import live.airuncoach.airuncoach.network.model.DynamicCoachingPhase
import live.airuncoach.airuncoach.ui.components.OutlinedCtaButton
import live.airuncoach.airuncoach.ui.components.PrepareRunOnWatchButton
import live.airuncoach.airuncoach.ui.components.WorkoutTypeBadge
import live.airuncoach.airuncoach.ui.components.workoutTypeColor
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.util.WorkoutHolder
import live.airuncoach.airuncoach.viewmodel.DashboardViewModel
import live.airuncoach.airuncoach.viewmodel.FriendsUiState
import live.airuncoach.airuncoach.viewmodel.FriendsViewModel
import live.airuncoach.airuncoach.viewmodel.FriendsViewModelFactory
import live.airuncoach.airuncoach.viewmodel.RunSessionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutDetailScreen(
    workout: WorkoutDetails,
    onNavigateBack: () -> Unit,
    onStartWorkout: (WorkoutDetails) -> Unit,
    onMarkComplete: (WorkoutDetails) -> Unit,
    onSkipWorkout: (WorkoutDetails) -> Unit = {}
) {
    val context = LocalContext.current
    val color = workoutTypeColor(workout.workoutType)
    val runSessionViewModel: RunSessionViewModel = hiltViewModel()
    val companionInstalled by runSessionViewModel.isWatchCompanionInstalled.collectAsState()
    // User age for age-adjusted HR zone calculations (Tanaka formula: 208 - 0.7×age)
    val dashboardViewModel: DashboardViewModel = hiltViewModel()
    val currentUser by dashboardViewModel.user.collectAsState()
    val userMaxHR: Int = currentUser?.age
        ?.let { age -> (208 - 0.7 * age).toInt().coerceIn(150, 220) }
        ?: 190  // Tanaka fallback for unknown age
    // Drive watch send state from ViewModel (supports async prepare-coaching flow)
    val watchSendState by runSessionViewModel.watchSendState.collectAsState()

    // ── Live Tracking observer invites (same picker as the free-run setup screen) ──
    val friendsViewModel: FriendsViewModel = remember {
        FriendsViewModelFactory(context).create(FriendsViewModel::class.java)
    }
    val friendsState by friendsViewModel.friendsState.collectAsState()
    var isLiveTrackingEnabled by remember { mutableStateOf(false) }
    var liveTrackingObservers by remember { mutableStateOf<List<String>>(emptyList()) }
    var liveTrackingPendingEmail by remember { mutableStateOf("") }
    // Flushes any typed-but-not-confirmed email into the observer list — called right
    // before starting the workout so a forgotten "✓" tap doesn't drop the invite.
    fun flushPendingObserverEmail(): List<String> {
        val trimmed = liveTrackingPendingEmail.trim()
        return if (trimmed.contains("@") && !liveTrackingObservers.contains(trimmed)) {
            liveTrackingObservers + trimmed
        } else {
            liveTrackingObservers
        }
    }

    // ── AI Coaching generation state ──────────────────────────────────────
    val coachingState by runSessionViewModel.coachingGenerationState.collectAsState()
    val isCoachingReady = coachingState == RunSessionViewModel.CoachingGenerationState.READY ||
                          coachingState == RunSessionViewModel.CoachingGenerationState.FAILED
    val isCoachingGenerating = coachingState == RunSessionViewModel.CoachingGenerationState.GENERATING
    // Coaching plan being READY does not mean the session's Polly audio is cached yet —
    // that finishes separately, in the background, slightly later. Starting before it's done
    // means the first coaching cue(s) miss the instant pre-cached audio and fall back to a
    // live Polly call or Android TTS.
    val isAudioPreloading by runSessionViewModel.isAudioPreloading.collectAsState()

    // Trigger AI coaching generation as soon as the screen opens
    LaunchedEffect(workout.id) {
        if (workout.workoutType != "rest") {
            runSessionViewModel.generateCoachingForWorkout(workout.id, sessionType = workout.sessionType)
        }
    }

    // ── GPS / permission state ─────────────────────────────────────────────
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        )
    }
    var isGettingLocation by remember { mutableStateOf(false) }
    var gpsReady by remember { mutableStateOf(false) }
    var gpsError by remember { mutableStateOf<String?>(null) }

    // Permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        hasLocationPermission = granted
        if (!granted) gpsError = "Location permission denied"
    }

    // Request permission immediately on first load if not already granted
    LaunchedEffect(Unit) {
        if (!hasLocationPermission) {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    // Acquire GPS fix once we have permission
    LaunchedEffect(hasLocationPermission) {
        if (!hasLocationPermission) return@LaunchedEffect
        if (gpsReady) return@LaunchedEffect

        isGettingLocation = true
        gpsError = null
        Log.d("WorkoutDetail", "📡 Acquiring GPS fix...")

        try {
            val fusedClient = LocationServices.getFusedLocationProviderClient(context)

            @SuppressLint("MissingPermission")
            val location = suspendCancellableCoroutine { cont ->
                fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                    .addOnSuccessListener { loc -> cont.resume(loc) }
                    .addOnFailureListener { e ->
                        Log.w("WorkoutDetail", "High-accuracy failed, falling back to lastLocation", e)
                        fusedClient.lastLocation
                            .addOnSuccessListener { last -> cont.resume(last) }
                            .addOnFailureListener { cont.resume(null) }
                    }
            }

            if (location != null) {
                gpsReady = true
                Log.d("WorkoutDetail", "✅ GPS ready: ${location.latitude}, ${location.longitude}")
            } else {
                gpsError = "Unable to acquire GPS signal"
                Log.e("WorkoutDetail", "❌ GPS location returned null")
            }
        } catch (e: Exception) {
            gpsError = "GPS error: ${e.message}"
            Log.e("WorkoutDetail", "❌ Exception acquiring GPS", e)
        } finally {
            isGettingLocation = false
        }
    }

    // "Start on Phone" is only enabled once GPS is confirmed AND coaching is ready
    val canStart = hasLocationPermission && gpsReady && !isGettingLocation && isCoachingReady && !isAudioPreloading

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "Generate Session",
                            style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Text(
                            workoutTypeLabel(workout.workoutType),
                            style = AppTextStyles.small,
                            color = Colors.textMuted
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(R.drawable.icon_arrow_back_vector), "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot),
                windowInsets = WindowInsets(0)
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        // Block the whole detail screen behind a loading view until the AI coaching plan is
        // ready (or has definitively failed) — rather than showing the full screen with a
        // banner buried down in the Actions section while session_instructions generation
        // (now on-demand, can take ~20-30s) is still in flight. Rest days never trigger
        // generation (see the LaunchedEffect above) so they skip straight to the full screen.
        if (workout.workoutType != "rest" && !isCoachingReady) {
            GeneratingSessionView(
                workoutTypeLabel = workoutTypeLabel(workout.workoutType),
                modifier = Modifier.fillMaxSize().padding(padding)
            )
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg)
        ) {

            // ── GPS status banner ──────────────────────────────────────────────
            if (workout.workoutType != "rest") {
                WorkoutGpsBanner(
                    hasPermission = hasLocationPermission,
                    isAcquiring = isGettingLocation,
                    isReady = gpsReady,
                    error = gpsError,
                    onGrantPermission = {
                        locationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    },
                    onRetry = {
                        gpsError = null
                        gpsReady = false
                        // Re-trigger the LaunchedEffect by toggling permission state
                        hasLocationPermission = ContextCompat.checkSelfPermission(
                            context, Manifest.permission.ACCESS_FINE_LOCATION
                        ) == PackageManager.PERMISSION_GRANTED ||
                        ContextCompat.checkSelfPermission(
                            context, Manifest.permission.ACCESS_COARSE_LOCATION
                        ) == PackageManager.PERMISSION_GRANTED
                    }
                )
                Spacer(modifier = Modifier.height(Spacing.md))
            }

            // ── Hero section ───────────────────────────────────────────────────
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(modifier = Modifier.padding(Spacing.xl), horizontalAlignment = Alignment.CenterHorizontally) {
                    WorkoutTypeBadge(workout.workoutType)
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        workout.description ?: workoutTypeLabel(workout.workoutType),
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // ── Key stats ─────────────────────────────────────────────────────
            if (workout.workoutType != "rest") {
                // Top row: Distance + Intensity (50/50)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    workout.distance?.let {
                        WorkoutStatCard(label = "Distance", value = "${it}km", icon = R.drawable.icon_target_vector, modifier = Modifier.weight(1f))
                    }
                    run {
                        val isIntervalType = workout.workoutType.lowercase() in
                                setOf("hill_repeats", "intervals", "fartlek")
                        val peakZone = resolveZoneNumber(workout, userMaxHR)
                        val baseZone = if (isIntervalType) resolveBaseZoneNumber(workout, userMaxHR) else peakZone
                        val peakZoneInfo = HeartRateZones.getZoneInfo(peakZone)
                        // For interval workouts show the zone range (e.g. "Z2 → Z4"), else single zone
                        val zoneLabel = if (isIntervalType && baseZone != peakZone)
                            "Z$baseZone → Z$peakZone" else "Zone $peakZone"
                        val effortLabel = peakZoneInfo.effort
                        WorkoutStatCard(label = "Intensity", value = zoneLabel, subtitleValue = effortLabel, icon = R.drawable.icon_heart_vector, modifier = Modifier.weight(1f))
                    }
                    // Spacer if intensity is missing
                    if (workout.intensity == null) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.md))

                // Bottom row: Target Pace (full width)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    workout.targetPace?.let {
                        WorkoutStatCard(label = "Target Pace", value = it, icon = R.drawable.icon_timer_vector, modifier = Modifier.weight(1f))
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))

                // ── Zone description and pace guidance ─────────────────────────────
                workout.intensity?.let {
                    val isIntervalType = workout.workoutType.lowercase() in
                            setOf("hill_repeats", "intervals", "fartlek")
                    val peakZone = resolveZoneNumber(workout, userMaxHR)
                    val baseZone = if (isIntervalType) resolveBaseZoneNumber(workout, userMaxHR) else peakZone
                    val zoneInfo = HeartRateZones.getZoneInfo(peakZone)

                    // Section header — for interval workouts explain it's a range
                    Text(
                        if (isIntervalType && baseZone != peakZone)
                            "Session Intensity Range"
                        else
                            "Intensity Explained",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        if (isIntervalType && baseZone != peakZone)
                            "This session moves between zones. The recovery/base phase runs at Zone $baseZone (${HeartRateZones.getZoneInfo(baseZone).effort.lowercase()}), and the work intervals push into Zone $peakZone (${zoneInfo.effort.lowercase()}). Zone 1 is very easy recovery pace, Zone 5 is all-out sprint."
                        else
                            "Intensity zones (1-5) guide your effort level. Zone 1 is very easy recovery pace, Zone 5 is all-out sprint. RPE (Rated Perceived Exertion) is simply how hard the effort feels to you.",
                        style = AppTextStyles.small,
                        color = Colors.textSecondary
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))

                    // Peak zone card (work interval / session zone)
                    fun zoneColor(z: Int) = when (z) {
                        1    -> Colors.success
                        2    -> Colors.primary
                        3    -> Colors.warning
                        4, 5 -> Colors.error
                        else -> Colors.textMuted
                    }

                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, zoneColor(peakZone).copy(alpha = 0.3f), RoundedCornerShape(12.dp)),
                        colors = CardDefaults.cardColors(containerColor = zoneColor(peakZone).copy(alpha = 0.05f)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(Spacing.lg)) {
                            // For interval workouts, label the peak zone as the work interval zone
                            val cardTitle = if (isIntervalType && baseZone != peakZone)
                                "${zoneInfo.name} — Work Intervals" else zoneInfo.name
                            Text(cardTitle, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                            Spacer(modifier = Modifier.height(Spacing.sm))

                            Text("What it feels like:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            Text(zoneInfo.description, style = AppTextStyles.small, color = Colors.textSecondary)

                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("Pace guidance:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            // For interval workouts use intervalTargetPace for the work zone;
                            // for regular workouts use targetPace.
                            val workPace = if (isIntervalType) workout.intervalTargetPace else workout.targetPace
                            val basePace = workout.targetPace
                            if (!workPace.isNullOrBlank()) {
                                Text(
                                    "Work interval target pace: ${workPace}/km",
                                    style = AppTextStyles.small,
                                    color = Colors.textSecondary
                                )
                            } else if (!basePace.isNullOrBlank() && !isIntervalType) {
                                Text(
                                    "Your target pace for this session: ${basePace}/km",
                                    style = AppTextStyles.small,
                                    color = Colors.textSecondary
                                )
                            } else {
                                Text(zoneInfo.paceGuidance, style = AppTextStyles.small, color = Colors.textSecondary)
                            }

                            // Work-interval HR targets
                            val workHrMin = if (isIntervalType) workout.intervalHeartRateMin else null
                            val workHrMax = if (isIntervalType) workout.intervalHeartRateMax else null
                            val hrMin = workHrMin ?: workout.hrZoneMinBpm
                            val hrMax = workHrMax ?: workout.hrZoneMaxBpm
                            val storedBpmsValid = hrMin != null && hrMax != null &&
                                    hrMin > 50 && hrMax < 230 && hrMin < hrMax
                            if (storedBpmsValid) {
                                Spacer(modifier = Modifier.height(Spacing.sm))
                                val hrLabel = if (workHrMin != null) "Work interval heart rate:" else "Target heart rate:"
                                Text(hrLabel, style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                                Text("Keep your HR between $hrMin and $hrMax bpm", style = AppTextStyles.small, color = Colors.textSecondary)
                                if (isIntervalType && workout.restHeartRateMax != null) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text("Recovery target: HR below ${workout.restHeartRateMax} bpm", style = AppTextStyles.small, color = Colors.textSecondary)
                                }
                            } else if (userMaxHR > 0) {
                                val fallbackRange = HeartRateZones.getTargetHRRange(peakZone, userMaxHR)
                                Spacer(modifier = Modifier.height(Spacing.sm))
                                val hrLabel = if (isIntervalType) "Work interval heart rate:" else "Target heart rate:"
                                Text(hrLabel, style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                                Text("Keep your HR between ${fallbackRange.first} and ${fallbackRange.last} bpm", style = AppTextStyles.small, color = Colors.textSecondary)
                                if (isIntervalType && workout.restHeartRateMax != null) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text("Recovery target: HR below ${workout.restHeartRateMax} bpm", style = AppTextStyles.small, color = Colors.textSecondary)
                                }
                            }

                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("Benefits:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            Text(zoneInfo.benefits, style = AppTextStyles.small, color = Colors.textSecondary)
                        }
                    }

                    // For interval workouts, show a second mini-card for the base/recovery zone
                    if (isIntervalType && baseZone != peakZone) {
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        val baseInfo = HeartRateZones.getZoneInfo(baseZone)
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, zoneColor(baseZone).copy(alpha = 0.3f), RoundedCornerShape(12.dp)),
                            colors = CardDefaults.cardColors(containerColor = zoneColor(baseZone).copy(alpha = 0.05f)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Column(modifier = Modifier.padding(Spacing.lg)) {
                                Text("${baseInfo.name} — Warm-up / Recovery", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                                Spacer(modifier = Modifier.height(Spacing.sm))
                                Text("What it feels like:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                                Text(baseInfo.description, style = AppTextStyles.small, color = Colors.textSecondary)
                                if (!workout.targetPace.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(Spacing.sm))
                                    Text("Pace guidance:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                                    Text("Base / recovery pace: ${workout.targetPace}/km", style = AppTextStyles.small, color = Colors.textSecondary)
                                }
                                // Recovery HR cap
                                if (workout.restHeartRateMax != null) {
                                    Spacer(modifier = Modifier.height(Spacing.sm))
                                    Text("Recovery heart rate:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                                    Text("HR below ${workout.restHeartRateMax} bpm", style = AppTextStyles.small, color = Colors.textSecondary)
                                }
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Zone comparison chart ──────────────────────────────────────────
            workout.intensity?.let {
                val isIntervalType = workout.workoutType.lowercase() in
                        setOf("hill_repeats", "intervals", "fartlek")
                val peakZone = resolveZoneNumber(workout, userMaxHR)
                val baseZone = if (isIntervalType) resolveBaseZoneNumber(workout, userMaxHR) else peakZone

                // Build the list of zones to show based on session type
                // Interval workouts: show full range from baseZone..peakZone plus one zone above
                // Regular workouts: show zone-1, zone (highlighted), zone+1 (clamped to 1-5)
                val zonesToShow: List<Int> = if (isIntervalType && baseZone != peakZone) {
                    // Show from baseZone-1 (if ≥1) through peakZone+1 (if ≤5)
                    val low  = (baseZone - 1).coerceAtLeast(1)
                    val high = (peakZone + 1).coerceAtMost(5)
                    (low..high).toList()
                } else {
                    listOf(
                        (peakZone - 1).coerceAtLeast(1),
                        peakZone,
                        (peakZone + 1).coerceAtMost(5)
                    ).distinct()
                }

                val sectionTitle = if (isIntervalType && baseZone != peakZone)
                    "How Zone $baseZone–$peakZone Compare"
                else
                    "How Zone $peakZone Compares"

                Text(sectionTitle, style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                Spacer(modifier = Modifier.height(Spacing.sm))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        val zoneNames = mapOf(
                            1 to ("Recovery" to Colors.success),
                            2 to ("Aerobic/Endurance" to Colors.primary),
                            3 to ("Tempo" to Colors.warning),
                            4 to ("VO2 Max" to Colors.error),
                            5 to ("Maximum Effort" to Colors.error)
                        )
                        // Reference pace: for interval work zone use intervalTargetPace; base uses targetPace
                        val workPaceRef = if (isIntervalType && !workout.intervalTargetPace.isNullOrBlank())
                            workout.intervalTargetPace else workout.targetPace

                        zonesToShow.forEachIndexed { idx, z ->
                            if (idx > 0) {
                                Spacer(modifier = Modifier.height(Spacing.md))
                                HorizontalDivider(color = Colors.backgroundSecondary, thickness = 0.5.dp)
                                Spacer(modifier = Modifier.height(Spacing.md))
                            }

                            val (zoneSub, zoneColor) = zoneNames[z] ?: ("" to Colors.textMuted)
                            val isWorkZone    = z == peakZone && isIntervalType && baseZone != peakZone
                            val isBaseZone    = z == baseZone && isIntervalType && baseZone != peakZone
                            val isSessionZone = z == peakZone && !isIntervalType

                            val label = when {
                                isWorkZone    -> "Zone $z — WORK INTERVALS"
                                isBaseZone    -> "Zone $z — RECOVERY"
                                isSessionZone -> "Zone $z (YOUR SESSION)"
                                else          -> "Zone $z"
                            }

                            // For the work zone use intervalTargetPace; for base/recovery use targetPace
                            val paceRef = if (isWorkZone) workPaceRef else workout.targetPace
                            val highlighted = isWorkZone || isSessionZone || (isBaseZone)

                            val rowModifier = if (highlighted)
                                Modifier
                                    .fillMaxWidth()
                                    .background(zoneColor.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                                    .padding(Spacing.md)
                            else
                                Modifier.fillMaxWidth()

                            Row(modifier = rowModifier, verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(label,
                                        style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                                        color = zoneColor)
                                    Text(zoneSub, style = AppTextStyles.small, color = Colors.textMuted)
                                }
                                Text(
                                    calculateZonePaceRange(z, paceRef),
                                    style = if (highlighted)
                                        AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold)
                                    else
                                        AppTextStyles.small,
                                    color = if (highlighted) zoneColor else Colors.textSecondary
                                )
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Instructions ──────────────────────────────────────────────────
            if (!workout.instructions.isNullOrEmpty()) {
                Text("Workout Instructions", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                Spacer(modifier = Modifier.height(Spacing.sm))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        workout.instructions,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(Spacing.lg)
                    )
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Structure breakdown ───────────────────────────────────────────
            // Driven by the real AI-generated phases for this session (activeSessionCoachingPlan,
            // populated by generateCoachingForWorkout() above) — not a hardcoded per-workoutType
            // template, so what's shown here always matches what the in-run coaching actually does.
            val coachingPlanPhases = runSessionViewModel.activeSessionCoachingPlan?.phases.orEmpty()
            if (isCoachingReady && coachingPlanPhases.isNotEmpty()) {
                WorkoutStructureSection(coachingPlanPhases)
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Why this workout ──────────────────────────────────────────────
            val why = workoutWhyText(workout.workoutType)
            Text("Why this workout?", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Spacer(modifier = Modifier.height(Spacing.sm))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.06f)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(modifier = Modifier.padding(Spacing.lg)) {
                    Icon(painterResource(R.drawable.icon_ai_vector), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(why, style = AppTextStyles.body, color = Colors.textSecondary)
                }
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            // ── Actions ───────────────────────────────────────────────────────
            if (workout.isCompleted) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.success, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Workout Complete!", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.success)
                }
            } else if (workout.workoutType != "rest") {

                // ── AI Coaching generation banner ──────────────────────────
                AiCoachingGenerationBanner(
                    state = coachingState,
                    modifier = Modifier.padding(bottom = Spacing.sm),
                    onRegenerate = { runSessionViewModel.regenerateCoachingForWorkout(workout.id) }
                )

                // ── Invite Observers (Live Tracking) ────────────────────────
                val friendsList = when (friendsState) {
                    is FriendsUiState.Success -> (friendsState as FriendsUiState.Success).friends
                    else -> emptyList()
                }
                WorkoutLiveTrackingSection(
                    enabled = isLiveTrackingEnabled,
                    onToggle = { isLiveTrackingEnabled = it },
                    observers = liveTrackingObservers,
                    onObserversChanged = { liveTrackingObservers = it },
                    pendingEmail = liveTrackingPendingEmail,
                    onPendingEmailChange = { liveTrackingPendingEmail = it },
                    friends = friendsList
                )

                Spacer(modifier = Modifier.height(Spacing.md))

                // Commits the current live-tracking selection (flushing any unconfirmed
                // pending email) into WorkoutHolder so MainScreen can fold it into the
                // RunSetupConfig built when the workout is actually started.
                val commitLiveTrackingSelection = {
                    WorkoutHolder.liveTrackingEnabled = isLiveTrackingEnabled
                    WorkoutHolder.liveTrackingObservers = flushPendingObserverEmail()
                }

                // ── Watch vs Phone primary action ─────────────────────────────────
                // When a watch is connected: "Prepare for Watch" = primary filled teal,
                //   "Start on Phone" = secondary outlined button below.
                // When no watch connected: "Start on Phone" = primary filled teal (original).
                val watchReady = companionInstalled && isCoachingReady && !isAudioPreloading
                val onPrepareWatch = {
                    commitLiveTrackingSelection()
                    runSessionViewModel.prepareRunOnWatchWithCoaching(
                        workoutId        = workout.id,
                        distanceKm       = workout.distance?.toFloat() ?: 0f,
                        workoutType      = workout.workoutType,
                        workoutIntensity = workout.intensity,
                        targetPace       = workout.targetPace,
                        intervalCount    = workout.intervalCount,
                        intervalDistKm   = workout.intervalDistanceMeters?.let { it / 1000f },
                        intervalDurSecs  = workout.intervalDurationSeconds
                    )
                    // Signal to the run screen that it should NOT auto-start —
                    // it must wait for the watch to send the "start" command.
                    WorkoutHolder.isWatchMode = true
                    onStartWorkout(workout)
                }
                val onStartPhone = {
                    commitLiveTrackingSelection()
                    onStartWorkout(workout)
                }

                // Watch connected: "Prepare for Watch" (primary filled, left) and
                // "Start on Phone" (secondary outlined, right) side by side.
                if (watchReady) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        Box(modifier = Modifier.weight(1f)) {
                            PrepareRunOnWatchButton(
                                companionInstalled = watchReady,
                                sendState = watchSendState,
                                isPrimary = true,
                                onPrepare = onPrepareWatch
                            )
                        }
                        Box(modifier = Modifier.weight(1f)) {
                            OutlinedCtaButton(
                                text = "Start on Phone",
                                leadingIconRes = R.drawable.icon_play_vector,
                                enabled = canStart,
                                onClick = onStartPhone
                            )
                        }
                    }
                } else {
                    Button(
                        onClick = onStartPhone,
                        enabled = canStart,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            disabledContainerColor = Colors.primary.copy(alpha = 0.35f)
                        ),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        if (isCoachingGenerating || isAudioPreloading) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Colors.buttonText)
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text("Preparing AI Coaching…", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                        } else if (isGettingLocation) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Colors.buttonText)
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text("Acquiring GPS…", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                        } else if (!hasLocationPermission) {
                            Icon(Icons.Default.LocationOn, null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text("Location Required", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                        } else {
                            Icon(painterResource(R.drawable.icon_play_vector), null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text("Start on Phone", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                        }
                    }
                }

                // Big spacer separating start action from the "done without running" actions
                Spacer(modifier = Modifier.height(28.dp))

                OutlinedButton(
                    onClick = { onMarkComplete(workout) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Mark as Done (no GPS)", style = AppTextStyles.body)
                }
                Spacer(modifier = Modifier.height(Spacing.sm))
                OutlinedButton(
                    onClick = { onSkipWorkout(workout) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textMuted)
                ) {
                    Icon(painterResource(R.drawable.icon_x_vector), null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Skip Session", style = AppTextStyles.body)
                }
            } else {
                // Rest day
                Button(
                    onClick = { onMarkComplete(workout) },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.success),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Log Rest Day", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                }
            }

            Spacer(modifier = Modifier.height(Spacing.xl))
        }
    }
}

// ── Full-screen "generating" loading view ──────────────────────────────────────

/**
 * Shown in place of the whole workout detail screen while the AI coaching plan
 * (session_instructions) is being generated or is not yet known to have failed.
 * Replaced by the full detail screen once coachingGenerationState reaches READY or FAILED.
 */
@Composable
private fun GeneratingSessionView(workoutTypeLabel: String, modifier: Modifier = Modifier) {
    val pulse by rememberInfiniteTransition(label = "generating-session-pulse").animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )
    Column(
        modifier = modifier.padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(48.dp),
            strokeWidth = 3.dp,
            color = Color(0xFF00E5FF).copy(alpha = pulse)
        )
        Spacer(modifier = Modifier.height(Spacing.xl))
        Text(
            "Generating your full session",
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(
            "Your AI coach is building the $workoutTypeLabel session — phases, pacing targets, and live coaching cues.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )
    }
}

// ── AI Coaching generation banner ─────────────────────────────────────────────

/**
 * Displays a bottom banner showing the AI coaching generation progress.
 *
 * States:
 *  - IDLE / not shown (handled externally)
 *  - GENERATING → pulsing cyan banner "Generating your AI coaching plan…"
 *  - READY       → green banner "AI coaching ready" (long-press to regenerate if plan seems wrong)
 *  - FAILED      → amber notice with a "Retry" button to regenerate
 *
 * @param onRegenerate Called when the user requests a fresh coaching plan (bypasses server cache).
 */
// ── Invite Observers (Live Tracking) ──────────────────────────────────────────
// Same picker used on the free-run setup screen (MapMyRunSetupScreen.kt's
// LiveTrackingObserverSection), so planned-workout starts get the same invite
// capability as free runs.

@Composable
private fun WorkoutLiveTrackingSection(
    enabled: Boolean,
    onToggle: (Boolean) -> Unit,
    observers: List<String>,
    onObserversChanged: (List<String>) -> Unit,
    pendingEmail: String,
    onPendingEmailChange: (String) -> Unit,
    friends: List<live.airuncoach.airuncoach.domain.model.Friend>
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary.copy(alpha = 0.65f))
    ) {
        Column(modifier = Modifier.padding(vertical = 6.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Live Tracking",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = "Invite friends to watch this session",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
                Switch(checked = enabled, onCheckedChange = onToggle)
            }

            if (enabled) {
                HorizontalDivider(color = Colors.backgroundTertiary.copy(alpha = 0.6f))
                LiveTrackingObserverSection(
                    observers = observers,
                    onObserversChanged = onObserversChanged,
                    pendingEmail = pendingEmail,
                    onPendingEmailChange = onPendingEmailChange,
                    friends = friends
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AiCoachingGenerationBanner(
    state: RunSessionViewModel.CoachingGenerationState,
    modifier: Modifier = Modifier,
    onRegenerate: () -> Unit = {},
) {
    if (state == RunSessionViewModel.CoachingGenerationState.IDLE) return

    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 0.5f,
        targetValue  = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    val bgColor: Color
    val accentColor: Color
    val icon: String
    val message: String
    val subMessage: String?
    val showRetry: Boolean
    when (state) {
        RunSessionViewModel.CoachingGenerationState.GENERATING -> {
            bgColor     = Color(0xFF001A2E)
            accentColor = Color(0xFF00E5FF)
            icon        = "⚡"
            message     = "Generating your AI coaching plan…"
            subMessage  = "Preparing phases, triggers & pacing targets for this session"
            showRetry   = false
        }
        RunSessionViewModel.CoachingGenerationState.READY -> {
            bgColor     = Color(0xFF001A14)
            accentColor = Color(0xFF00FF88)
            icon        = "✓"
            message     = "AI coaching ready"
            subMessage  = null
            showRetry   = false
        }
        RunSessionViewModel.CoachingGenerationState.FAILED -> {
            bgColor     = Color(0xFF1A1200)
            accentColor = Color(0xFFFFB300)
            icon        = "⚠"
            message     = "Coaching unavailable — run will still be tracked"
            subMessage  = null
            showRetry   = true
        }
        else -> return
    }

    val dynamicAlpha = if (state == RunSessionViewModel.CoachingGenerationState.GENERATING) pulse else 1f

    // Long-press on the READY banner to force-regenerate (e.g. when the plan sounded wrong).
    val bannerModifier = modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(12.dp))
        .background(bgColor)
        .border(
            width = 1.dp,
            color = accentColor.copy(alpha = dynamicAlpha),
            shape = RoundedCornerShape(12.dp)
        )
        .then(
            if (state == RunSessionViewModel.CoachingGenerationState.READY) {
                Modifier.combinedClickable(
                    onClick = {},
                    onLongClick = onRegenerate
                )
            } else Modifier
        )
        .padding(horizontal = 16.dp, vertical = 12.dp)

    Box(modifier = bannerModifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (state == RunSessionViewModel.CoachingGenerationState.GENERATING) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = accentColor
                )
            } else {
                Text(icon, fontSize = 14.sp, color = accentColor)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    message,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor.copy(alpha = dynamicAlpha)
                )
                if (subMessage != null) {
                    Text(
                        subMessage,
                        fontSize = 11.sp,
                        color = accentColor.copy(alpha = 0.6f)
                    )
                }
            }
            // Retry button shown when coaching generation failed
            if (showRetry) {
                Text(
                    "Retry",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = accentColor,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(accentColor.copy(alpha = 0.15f))
                        .clickable(onClick = onRegenerate)
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                )
            }
        }
    }
}

// ── GPS status banner ─────────────────────────────────────────────────────────

@Composable
private fun WorkoutGpsBanner(
    hasPermission: Boolean,
    isAcquiring: Boolean,
    isReady: Boolean,
    error: String?,
    onGrantPermission: () -> Unit,
    onRetry: () -> Unit
) {
    // Once GPS is locked, hide the banner entirely — no need to celebrate, just unblock the button
    if (isReady) return

    val title = when {
        !hasPermission -> "Location permission required"
        isAcquiring    -> "Acquiring GPS signal…"
        error != null  -> "GPS signal unavailable"
        else           -> "Waiting for GPS…"
    }
    val subtitle = when {
        !hasPermission -> "Tap Grant below to enable location access"
        isAcquiring    -> "Please wait — this usually takes a few seconds"
        error != null  -> error
        else           -> "Please wait…"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = if (isAcquiring) Colors.primary.copy(alpha = 0.08f)
                             else Colors.error.copy(alpha = 0.12f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isAcquiring) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = Colors.primary
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
                    color = if (isAcquiring) Colors.primary else Colors.error
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }

            when {
                !hasPermission -> Button(
                    onClick = onGrantPermission,
                    shape = RoundedCornerShape(BorderRadius.full),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Text("Grant", color = Colors.buttonText, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold))
                }
                error != null -> TextButton(onClick = onRetry) {
                    Text("Retry", color = Colors.primary, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

// ── Shared helpers (unchanged) ────────────────────────────────────────────────

@Composable
fun WorkoutStatCard(label: String, value: String, icon: Int, modifier: Modifier = Modifier, subtitleValue: String? = null) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(painterResource(icon), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            if (subtitleValue != null) {
                Text(subtitleValue, style = AppTextStyles.small, color = Colors.primary, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(2.dp))
            }
            Text(label, style = AppTextStyles.small, color = Colors.textMuted)
        }
    }
}

@Composable
fun WorkoutStructureSection(phases: List<DynamicCoachingPhase>) {
    Text("Workout Structure", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
    Spacer(modifier = Modifier.height(Spacing.sm))

    phases.sortedBy { it.order }.forEach { phase ->
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
            shape = RoundedCornerShape(10.dp)
        ) {
            Row(modifier = Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.width(4.dp).height(40.dp).background(phaseEffortColor(phase.effort), RoundedCornerShape(2.dp)))
                Spacer(modifier = Modifier.width(Spacing.md))
                Column {
                    Text(formatPhaseLabel(phase), style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Text(formatPhaseDetail(phase), style = AppTextStyles.small, color = Colors.textSecondary)
                }
            }
        }
        Spacer(modifier = Modifier.height(Spacing.sm))
    }
}

private fun phaseEffortColor(effort: String): Color = when (effort.lowercase()) {
    "easy" -> Colors.success
    "moderate" -> Colors.primary
    "threshold" -> Colors.warning
    "hard", "max" -> Colors.error
    else -> Colors.textSecondary
}

private fun formatPhaseLabel(phase: DynamicCoachingPhase): String {
    val base = when (phase.name.lowercase()) {
        "warmup", "warm_up" -> "Warm-up"
        "cooldown", "cool_down" -> "Cool-down"
        "main_effort" -> "Main effort"
        "work" -> "Work interval"
        "recovery_walk" -> "Recovery walk"
        "recovery" -> "Recovery"
        else -> phase.name.replace("_", " ").replaceFirstChar { it.uppercase() }
    }
    val reps = phase.repetitions ?: 1
    return if (reps > 1) "$base × $reps" else base
}

private fun formatPhaseDetail(phase: DynamicCoachingPhase): String {
    val stats = mutableListOf<String>()
    phase.durationMinutes?.let { minutes ->
        val whole = minutes.roundToInt()
        stats.add(if (minutes == whole.toDouble()) "$whole min" else String.format(java.util.Locale.US, "%.1f min", minutes))
    }
    phase.distanceKm?.let { km -> stats.add(String.format(java.util.Locale.US, "%.1f km", km)) }
    if (phase.targetPaceMin != null && phase.targetPaceMax != null) {
        stats.add("${formatPhasePace(phase.targetPaceMin)}–${formatPhasePace(phase.targetPaceMax)}/km")
    }
    if (phase.targetHRMin != null && phase.targetHRMax != null) {
        stats.add("${phase.targetHRMin}–${phase.targetHRMax} bpm")
    }
    val header = stats.joinToString(" • ").ifBlank { "${phase.effort.replaceFirstChar { it.uppercase() }} effort" }
    val instructions = phase.phaseInstructions?.trim()?.takeIf { it.isNotBlank() }
    return if (instructions != null) "$header — $instructions" else header
}

private fun formatPhasePace(secondsPerKm: Int): String {
    val minutes = secondsPerKm / 60
    val seconds = secondsPerKm % 60
    return String.format(java.util.Locale.US, "%d:%02d", minutes, seconds)
}

/**
 * Resolve the PEAK HR zone number (1-5) for display and HR range calculations.
 *
 * For INTERVAL workouts (hill_repeats, intervals, fartlek):
 *  - hrZoneNumber and the intensity string represent the session-average / base/recovery zone
 *    (e.g. "z2" for a fartlek that peaks at zone 4). We skip both and instead:
 *    1. Derive the peak zone from intervalHeartRateMax + userMaxHR if available.
 *    2. Fall back to workout-type defaults (zone 4 for fartlek/intervals/hill_repeats).
 *
 * For NON-INTERVAL workouts:
 *  - hrZoneNumber is the session zone — use it as highest priority.
 *  - Fall back to intensity string, then workout-type defaults.
 */
fun resolveZoneNumber(workout: WorkoutDetails, userMaxHR: Int = 190): Int {
    val isIntervalWorkout = workout.workoutType.lowercase() in
            setOf("hill_repeats", "intervals", "fartlek")

    if (!isIntervalWorkout) {
        // Non-interval: hrZoneNumber IS the session zone — use it first
        workout.hrZoneNumber?.let { if (it in 1..5) return it }

        // Parse "z1"-"z5" from intensity string
        workout.intensity?.let { intensity ->
            Regex("z([1-5])", RegexOption.IGNORE_CASE).find(intensity)
                ?.groupValues?.get(1)?.toIntOrNull()
                ?.let { return it }
        }
    } else {
        // Interval workouts: derive PEAK zone from work-interval HR if available
        workout.intervalHeartRateMax?.let { intervalHrMax ->
            if (intervalHrMax in 50..230) {
                val hrPercent = intervalHrMax.toDouble() / userMaxHR * 100
                return when {
                    hrPercent >= 90 -> 5
                    hrPercent >= 80 -> 4
                    hrPercent >= 70 -> 3
                    hrPercent >= 60 -> 2
                    else            -> 1
                }
            }
        }
        // No interval HR data — fall through to type defaults below
    }

    // Workout type default
    return when (workout.workoutType.lowercase()) {
        "recovery", "rest"          -> 1
        "easy", "long_run"          -> 2
        "tempo"                     -> 3
        "intervals", "hill_repeats",
        "fartlek"                   -> 4
        else                        -> 2
    }
}

/**
 * Resolve the BASE/RECOVERY zone for interval workouts.
 *
 * For fartlek / intervals / hill_repeats the server-supplied intensity string ("z2", "z1", etc.)
 * encodes the warm-up / recovery pace — not the peak. This helper reads that base zone so the
 * UI can display the full range (e.g. "Zone 2 → Zone 4").
 *
 * For non-interval workouts, falls back to resolveZoneNumber().
 */
fun resolveBaseZoneNumber(workout: WorkoutDetails, userMaxHR: Int = 190): Int {
    val isIntervalWorkout = workout.workoutType.lowercase() in
            setOf("hill_repeats", "intervals", "fartlek")

    if (!isIntervalWorkout) return resolveZoneNumber(workout, userMaxHR)

    // For interval workouts the intensity string IS the base/recovery zone
    workout.intensity?.let { intensity ->
        Regex("z([1-5])", RegexOption.IGNORE_CASE).find(intensity)
            ?.groupValues?.get(1)?.toIntOrNull()
            ?.let { return it }
    }

    // Default base zone for all interval types is zone 2
    return 2
}

/**
 * Calculate dynamic pace range for a given zone based on target pace.
 *
 * When a workout has a specific target pace (from enrichment), we calculate the range
 * by applying zone-specific offsets:
 * - Zone 1: ~40-50% slower than target pace
 * - Zone 2: +-10-15% of target pace (e.g., 8:30 target -> 7:30-9:45)
 * - Zone 3: ~10-20% faster than target pace
 *
 * Falls back to hardcoded ranges if no target pace is available.
 */
fun calculateZonePaceRange(zoneNumber: Int, targetPace: String?): String {
    if (targetPace.isNullOrBlank()) {
        // Fallback to generic zone ranges (population average)
        return when (zoneNumber) {
            1 -> "6–8 min/km"           // Very easy recovery walk
            2 -> "7:30–9:45 min/km"     // Default Zone 2 range
            3 -> "6:00–8:00 min/km"     // Tempo pace
            4 -> "4:30–6:00 min/km"     // Interval pace
            5 -> "3:00–5:00 min/km"     // Sprint pace
            else -> "7:30–9:45 min/km"
        }
    }

    // Parse target pace (format: "M:SS/km")
    val parts = targetPace.split(":")
    if (parts.size < 2) return "7:30–9:45 min/km" // Fallback if parsing fails

    val minutes = parts[0].toIntOrNull() ?: return "7:30–9:45 min/km"
    val seconds = parts[1].split("/")[0].toIntOrNull() ?: return "7:30–9:45 min/km"
    val totalSeconds = minutes * 60 + seconds

    // Calculate range based on zone
    val (slowerPercent, fasterPercent) = when (zoneNumber) {
        1 -> Pair(1.4, 1.6)           // 40-60% slower than Zone 2 target
        2 -> Pair(0.85, 1.15)         // ±15% around target pace
        3 -> Pair(0.75, 0.90)         // 10-25% faster than target
        4 -> Pair(0.65, 0.75)         // 25-35% faster than target
        5 -> Pair(0.55, 0.70)         // 30-45% faster than target
        else -> Pair(0.85, 1.15)      // Default to Zone 2 range
    }

    val slowerSeconds = (totalSeconds * slowerPercent).toInt()
    val fasterSeconds = (totalSeconds * fasterPercent).toInt()

    // Format back to "M:SS–M:SS min/km"
    val slowerMin = slowerSeconds / 60
    val slowerSec = slowerSeconds % 60
    val fasterMin = fasterSeconds / 60
    val fasterSec = fasterSeconds % 60

    return String.format(
        "%d:%02d–%d:%02d min/km",
        slowerMin, slowerSec,
        fasterMin, fasterSec
    )
}

fun workoutWhyText(type: String) = when (type) {
    "easy" -> "Easy runs build your aerobic base — the foundation of all running fitness. These runs train your body to burn fat efficiently and prepare you for harder sessions later in the week."
    "long_run" -> "The long run is the cornerstone of your training. It builds endurance, teaches your body to manage fuel over time, and builds the mental resilience needed for race day."
    "tempo" -> "Tempo runs raise your lactate threshold — the pace you can sustain before fatigue kicks in. This is the most direct route to running faster for longer."
    "intervals" -> "High-intensity intervals improve your VO₂ max (maximal oxygen uptake) and running economy. Short bursts at race effort or faster teach your body to move more efficiently."
    "hill_repeats" -> "Hill repeats build strength, power, and running form. They're resistance training for runners — building the muscles needed to sustain pace when tired."
    "recovery" -> "Recovery runs flush out fatigue from hard sessions without adding stress. They keep your legs moving and set you up for the next quality session."
    "rest" -> "Rest is where adaptation happens. Your body repairs muscle, replenishes glycogen, and grows stronger. Skipping rest leads to injury and underperformance."
    else -> "This workout is prescribed by your AI coach to optimally develop your running fitness towards your goal."
}

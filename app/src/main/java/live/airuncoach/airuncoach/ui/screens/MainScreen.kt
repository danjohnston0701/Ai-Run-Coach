

package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.google.gson.Gson
import kotlinx.coroutines.delay

import live.airuncoach.airuncoach.AppRoutes
import live.airuncoach.airuncoach.MainActivity
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.PhysicalActivityType
import live.airuncoach.airuncoach.domain.model.RunSetupConfig
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.util.RunConfigHolder
import live.airuncoach.airuncoach.util.WorkoutHolder
import live.airuncoach.airuncoach.viewmodel.DashboardViewModel
import live.airuncoach.airuncoach.viewmodel.RouteGenerationViewModel
import live.airuncoach.airuncoach.viewmodel.TrainingPlanViewModel
import live.airuncoach.airuncoach.ui.components.PromoCodeDialog

sealed class Screen(val route: String, val label: String, val resourceId: Int) {
    object Home : Screen("home", "Home", R.drawable.icon_home_vector)
    object History : Screen("history", "History", R.drawable.icon_chart_vector)
    object Goals : Screen("goals", "Goals", R.drawable.icon_target_vector)
    object AiPlans : Screen("ai_plans", "Ai Plans", R.drawable.icon_calendar_vector)
    object Profile : Screen("profile", "Profile", R.drawable.icon_profile_vector)
}

val items = listOf(
    Screen.Home,
    Screen.History,
    Screen.Goals,
    Screen.AiPlans,
    Screen.Profile,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(onNavigateToLogin: () -> Unit) {
    val navController = rememberNavController()
    var showLocationPermissionDialog by remember { mutableStateOf(false) }
    var onLocationPermissionGranted: (() -> Unit)? by remember { mutableStateOf(null) }
    var showPromoCodeDialog by remember { mutableStateOf(false) }
    var promoCodeLoading by remember { mutableStateOf(false) }

    // Permission requests are now handled in LocationPermissionScreen
    // Only request notification permission here if needed
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted ->
            // Handle notification permission result
        }
    )

    LaunchedEffect(Unit) {
        // Request notification permission for Android 13+ if not already granted
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // ── Deep-link / notification routing ──────────────────────────────────────
    // run_summary and run_session live in THIS inner NavHost, not the root one.
    // MainActivity.pendingDeepLink is set by both cold-launch (onCreate) and
    // warm-launch (onNewIntent → handleNotificationIntent) paths and consumed here.
    val deepLinkRoute = MainActivity.pendingDeepLink.value
    LaunchedEffect(deepLinkRoute) {
        val route = deepLinkRoute ?: return@LaunchedEffect
        delay(300) // let the inner NavHost finish initial composition
        Log.d("MainScreen", "Consuming pendingDeepLink → $route")
        try {
            navController.navigate(route)
        } catch (e: Exception) {
            Log.e("MainScreen", "Deep-link navigation failed: $route", e)
        }
        MainActivity.pendingDeepLink.value = null // consume
    }

    // Hide bottom navigation during run session
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val isRunSession = currentRoute?.startsWith("run_session") == true

    Scaffold(
        containerColor = Colors.backgroundRoot,
        bottomBar = {
            // Completely hide navigation bar during run session
            if (isRunSession) return@Scaffold
            
            NavigationBar(
                containerColor = Colors.backgroundRoot.copy(alpha = 0.95f),
                tonalElevation = 8.dp
            ) {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination
                val currentRoute = currentDestination?.route
                items.forEach { screen ->
                    // Home is selected when on home, map_my_run_setup, route_generation, or run_session
                    val isSelected = if (screen.route == Screen.Home.route) {
                        currentRoute == Screen.Home.route ||
                                currentRoute?.startsWith("map_my_run_setup") == true ||
                                currentRoute == "route_generation/{distance}/{timeEnabled}/{hours}/{minutes}" ||
                                currentRoute == "route_generating/{distanceKm}" ||
                                currentRoute == "route_selection/{distanceKm}" ||
                                currentRoute == "run_session/{routeId}" ||
                                currentRoute == "run_session"
                    } else {
                        currentDestination?.hierarchy?.any { it.route == screen.route } == true
                    }
                    val isRunSessionRoute = currentRoute?.startsWith("run_session") == true
                    NavigationBarItem(
                        icon = {
                            Icon(
                                painter = painterResource(id = screen.resourceId),
                                contentDescription = screen.label,
                                modifier = Modifier.size(24.dp)
                            )
                        },
                        label = {
                            Text(
                                text = screen.label,
                                style = AppTextStyles.caption.copy(
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                )
                            )
                        },
                        selected = isSelected,
                        enabled = !isRunSessionRoute,
                        onClick = {
                            if (isRunSessionRoute) return@NavigationBarItem
                            navController.navigate(screen.route) {
                                // Pop everything up to and including home to clear the back stack
                                popUpTo(Screen.Home.route) {
                                    inclusive = true
                                }
                                launchSingleTop = true
                                restoreState = false
                            }
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Colors.primary,
                            unselectedIconColor = Colors.textMuted,
                            selectedTextColor = Colors.primary,
                            unselectedTextColor = Colors.textMuted,
                            indicatorColor = Colors.backgroundRoot,
                            disabledIconColor = Colors.textMuted,
                            disabledTextColor = Colors.textMuted
                        ),
                        alwaysShowLabel = true
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController,
            startDestination = Screen.Home.route,
            Modifier.padding(innerPadding)
        ) {
            composable(Screen.Home.route) { backStackEntry ->
                val dashboardViewModel: DashboardViewModel = hiltViewModel()
                // Use backStackEntry as refresh key - it changes when navigating back
                val refreshKey = backStackEntry.lifecycle.currentState.hashCode()
                DashboardScreen(
                    onNavigateToRouteGeneration = {
                        val dist = dashboardViewModel.targetDistance.value
                        val timeOn = dashboardViewModel.isTargetTimeEnabled.value
                        val h = dashboardViewModel.targetHours.value
                        val m = dashboardViewModel.targetMinutes.value
                        val s = dashboardViewModel.targetSeconds.value
                        // For route mode: always default to AI Coach disabled
                        navController.navigate("map_my_run_setup/route/$dist/$timeOn/$h/$m/$s/false")
                    },
                    onNavigateToFreeRunSetup = {
                        val dist = dashboardViewModel.targetDistance.value
                        val timeOn = dashboardViewModel.isTargetTimeEnabled.value
                        val h = dashboardViewModel.targetHours.value
                        val m = dashboardViewModel.targetMinutes.value
                        val s = dashboardViewModel.targetSeconds.value
                        val aiCoach = dashboardViewModel.isAiCoachEnabled.value
                        // For free run mode: preserve dashboard preference
                        navController.navigate("map_my_run_setup/no_route/$dist/$timeOn/$h/$m/$s/$aiCoach")
                    },
                    onNavigateToRunSession = {
                        navController.navigate("run_session") {
                            popUpTo("map_my_run_setup") { inclusive = true }
                        }
                    },
                    onNavigateToPreviousRuns = {
                        navController.navigate("previous_runs")
                    },
                    onNavigateToGoals = {
                        navController.navigate(Screen.Goals.route)
                    },
                    onNavigateToProfile = {
                        navController.navigate(Screen.Profile.route)
                    },
                    onNavigateToHistory = {
                        navController.navigate(Screen.History.route)
                    },
                    onNavigateToLocationPermission = {
                        // Store the callback to refresh permissions when dialog closes
                        onLocationPermissionGranted = { dashboardViewModel.checkLocationPermission() }
                        showLocationPermissionDialog = true
                    },
                    onCreateGoal = {
                        navController.navigate("create_goal")
                    },
                    refreshKey = refreshKey
                )
            }
            composable(Screen.History.route) {
                val currentBackStack by navController.currentBackStackEntryAsState()
                PreviousRunsScreen(
                    onNavigateToRunSummary = {
                        navController.navigate("run_summary/$it")
                    },
                    isActiveDestination = currentBackStack?.destination?.route == Screen.History.route
                )
            }
            composable(Screen.Goals.route) {
                val currentBackStack by navController.currentBackStackEntryAsState()
                GoalsScreen(
                    onCreateGoal = { navController.navigate("create_goal") },
                    onNavigateBack = {
                        if (navController.previousBackStackEntry != null) {
                            navController.popBackStack()
                        }
                    },
                    onGeneratePlanForGoal = { goal ->
                        // Store goal for wizard prefill then navigate
                        live.airuncoach.airuncoach.util.GoalPlanHolder.prefilledGoal = goal
                        navController.navigate("generate_plan")
                    },
                    onNavigateToRunSummary = { runId ->
                        navController.navigate("run_summary/$runId")
                    },
                    isActiveDestination = currentBackStack?.destination?.route == Screen.Goals.route
                )
            }
            composable(Screen.Profile.route) {
                ProfileScreen(
                    onNavigateToLogin = onNavigateToLogin,
                    onNavigateToFriends = { navController.navigate("friends") },
                    onNavigateToGroupRuns = { navController.navigate("group_runs") },
                    onNavigateToCoachSettings = { navController.navigate("coach_settings") },
                    onNavigateToPersonalDetails = { navController.navigate("personal_details") },
                    onNavigateToFitnessLevel = { navController.navigate("fitness_level") },
                    onNavigateToMyData = { navController.navigate("my_data") },
                    onNavigateToGoals = { navController.navigate("goals") },
                    onNavigateToDistanceScale = { navController.navigate("distance_scale") },
                    onNavigateToNotifications = { navController.navigate("notification_settings") },
                    onNavigateToConnectedDevices = { navController.navigate("connected_devices") },
                    onNavigateToSubscription = { navController.navigate("subscription") },
                    onNavigateToCoachingProgramme = { navController.navigate("coaching_programme") },
                    onNavigateToInjuries = { navController.navigate("injuries") }
                )
            }
            composable("my_data") {
                MyDataScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable("injuries") {
                InjuryManagementScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            // Map My Run Setup Screen (the beautiful redesigned one!)
            composable("map_my_run_setup/{mode}/{dist}/{timeOn}/{h}/{m}/{s}/{aiCoach}") { backStackEntry ->
                val mode = backStackEntry.arguments?.getString("mode") ?: "route"
                val dist = backStackEntry.arguments?.getString("dist")?.toFloatOrNull() ?: 5f
                val timeOn = backStackEntry.arguments?.getString("timeOn")?.toBooleanStrictOrNull() ?: false
                val h = backStackEntry.arguments?.getString("h")?.toIntOrNull() ?: 0
                val m = backStackEntry.arguments?.getString("m")?.toIntOrNull() ?: 0
                val s = backStackEntry.arguments?.getString("s")?.toIntOrNull() ?: 0
                val aiCoach = backStackEntry.arguments?.getString("aiCoach")?.toBooleanStrictOrNull() ?: false
                val parentEntry = remember(backStackEntry) {
                    navController.getBackStackEntry(navController.graph.id)
                }
                val routeViewModel: RouteGenerationViewModel = hiltViewModel(parentEntry)
                var isNavigatingToRoute by remember { mutableStateOf(false) }
                
                // Reset isNavigatingToRoute flag when navigating back to this screen
                // This allows users to re-generate routes after coming back from route selection
                LaunchedEffect(backStackEntry) {
                    isNavigatingToRoute = false
                }
                
                MapMyRunSetupScreen(
                    mode = mode,
                    initialDistance = dist,
                    initialTargetTimeEnabled = timeOn,
                    initialHours = h,
                    initialMinutes = m,
                    initialSeconds = s,
                    initialAiCoachEnabled = aiCoach,
                    onNavigateBack = { navController.popBackStack() },
                    onGenerateRoute = { distance, hasTime, hours, minutes, seconds, _, _, latitude, longitude, aiCoach ->
                        // Guard against double-taps - only allow one navigation at a time
                        if (isNavigatingToRoute) return@MapMyRunSetupScreen
                        isNavigatingToRoute = true
                        
                        // Clear any previous routes/error so route_generating starts fresh
                        // (without this, stale routes from a previous generation cause immediate
                        //  auto-navigation to route_selection with old results)
                        routeViewModel.clearRoutes()
                        routeViewModel.clearError()
                        
                        // Store route generation params to RouteGenerationParamsHolder for later use
                        live.airuncoach.airuncoach.util.RouteGenerationParamsHolder.setParams(
                            distance = distance,
                            hasTime = hasTime,
                            hours = hours,
                            minutes = minutes,
                            seconds = seconds,
                            latitude = latitude,
                            longitude = longitude,
                            aiCoachEnabled = aiCoach
                        )
                        
                        // Navigate to check_route_availability - it will handle the API check itself
                        navController.navigate("check_route_availability")
                    },
                    onStartRunWithoutRoute = { distance, hasTime, hours, minutes, seconds ->
                        // Create RunSetupConfig and start run without route
                        val config = RunSetupConfig(
                            activityType = PhysicalActivityType.RUN,
                            targetDistance = distance,
                            hasTargetTime = hasTime,
                            targetHours = hours,
                            targetMinutes = minutes,
                            targetSeconds = seconds,
                            liveTrackingEnabled = false,
                            liveTrackingObservers = emptyList(),
                            isGroupRun = false,
                            groupRunParticipants = emptyList()
                        )
                        RunConfigHolder.setConfig(config)
                        navController.navigate("run_session") {
                            popUpTo("map_my_run_setup") { inclusive = true }
                        }
                    }
                )
            }
            
            // ── Run Route Availability Check ──────────────────────────────────
            // NOTE: There is a second composable("check_route_availability") below (the active one).
            // This first registration is intentionally kept as dead code to avoid NavGraph conflicts,
            // but the second one (lower in file) is the one that actually runs.
            composable("check_route_availability_legacy_unused") { backStackEntry ->
                val featureLimitViewModel: live.airuncoach.airuncoach.viewmodel.FeatureLimitViewModel = hiltViewModel()
                val availability by featureLimitViewModel.runRouteAvailability.collectAsState()
                val isLoading by featureLimitViewModel.runRouteLoading.collectAsState()

                if (isLoading) {
                    // Show loading while we check
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (availability != null) {
                    if (availability!!.isAvailable) {
                        // User can create route - navigate and cleanup
                        LaunchedEffect(Unit) {
                            featureLimitViewModel.resetRunRouteAvailability()
                            // Get stored params from holder
                            val params = live.airuncoach.airuncoach.util.RouteGenerationParamsHolder.peek()
                            if (params != null) {
                                // Navigate to loading screen - route generation will happen there
                                navController.navigate("route_generating/${params.distance.toInt()}") {
                                    popUpTo("check_route_availability") { inclusive = true }
                                }
                            } else {
                                // No params - go back
                                navController.popBackStack()
                            }
                        }
                    } else {
                        // Limit reached - show upsell screen
                        live.airuncoach.airuncoach.ui.components.RunRouteLimitUpsellScreen(
                            nextRenewalDate = availability!!.renewalDate,
                            usedCount = availability!!.used,
                            limitCount = availability!!.limit,
                            onUpgradeClick = {
                                // Navigate to subscription screen
                                navController.navigate(Screen.Profile.route) {
                                    popUpTo("check_route_availability") { inclusive = true }
                                }
                            },
                            onPromoCodeClick = {
                                // Go back
                                navController.popBackStack()
                            },
                            onBackClick = {
                                navController.popBackStack()
                            }
                        )
                    }
                } else {
                    // Default: allow access (error case)
                    LaunchedEffect(Unit) {
                        featureLimitViewModel.resetRunRouteAvailability()
                        // Get stored params from holder
                        val params = live.airuncoach.airuncoach.util.RouteGenerationParamsHolder.peek()
                        if (params != null) {
                            // Navigate to loading screen - route generation will happen there
                            navController.navigate("route_generating/${params.distance.toInt()}") {
                                popUpTo("check_route_availability") { inclusive = true }
                            }
                        } else {
                            // No params - go back
                            navController.popBackStack()
                        }
                    }
                }
            }
            
            // NEW: Route Generating Loading Screen
            composable("route_generating/{distanceKm}") { backStackEntry ->
                val context = LocalContext.current
                val distanceKm = backStackEntry.arguments?.getString("distanceKm")?.toDoubleOrNull() ?: 5.0
                
                // Get user's coach name from SharedPreferences
                val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
                val gson = Gson()
                val userJson = sharedPrefs.getString("user", null)
                val user = if (userJson != null) gson.fromJson(userJson, User::class.java) else null
                val coachName = user?.coachName ?: "AI Coach"
                
                // Get activity-scoped ViewModel (SAME instance as setup screen!)
                val parentEntry = remember(backStackEntry) {
                    navController.getBackStackEntry(navController.graph.id)
                }
                val viewModel: RouteGenerationViewModel = hiltViewModel(parentEntry)
                val routes by viewModel.routes.collectAsState()
                val isLoading by viewModel.isLoading.collectAsState()
                val error by viewModel.error.collectAsState()
                
                // Trigger route generation when this screen is first shown
                LaunchedEffect(Unit) {
                    // Consume params here - this is the definitive place generation happens
                    val params = live.airuncoach.airuncoach.util.RouteGenerationParamsHolder.consume()
                    if (params != null && routes.isEmpty() && !isLoading) {
                        Log.d("RouteNavigation", "🚀 Starting route generation from route_generating screen")
                        
                        // Store target time + distance so it persists through route generation → selection → run session
                        viewModel.setTargetTime(params.hasTime, params.hours, params.minutes, params.seconds, params.distance.toDouble())
                        
                        // Generate routes with GPS location
                        val targetTimeMinutes = if (params.hasTime) params.hours * 60 + params.minutes else null
                        
                        viewModel.generateIntelligentRoutes(
                            latitude = params.latitude,
                            longitude = params.longitude,
                            distanceKm = params.distance.toDouble(),
                            activityType = "run",
                            preferTrails = true,
                            avoidHills = false,
                            targetTime = targetTimeMinutes,
                            aiCoachEnabled = params.aiCoachEnabled
                        )
                    } else if (params == null) {
                        Log.e("RouteNavigation", "❌ No route params available - cannot generate routes")
                    }
                }
                
                // Show loading screen (or error state if generation failed)
                RouteGeneratingLoadingScreen(
                    distanceKm = distanceKm,
                    coachName = coachName,
                    error = if (!isLoading) error else null,
                    onRetry = {
                        viewModel.retryGeneration()
                    },
                    onGoBack = {
                        viewModel.clearError()
                        navController.popBackStack()
                    }
                )
                
                // Auto-navigate when routes are ready.
                // Enforce a minimum 3-second loading time so the backend has a chance to
                // assess all tiers and return the best possible set of routes.
                // This prevents the screen flashing away instantly when only 1 route is found quickly.
                val generationStartTime = remember { System.currentTimeMillis() }
                LaunchedEffect(routes.size, isLoading) {
                    Log.d("RouteNavigation", "📊 Routes size: ${routes.size}, isLoading: $isLoading, error: $error")
                    if (routes.isNotEmpty() && !isLoading) {
                        val elapsed = System.currentTimeMillis() - generationStartTime
                        val minLoadMs = 3_000L
                        if (elapsed < minLoadMs) {
                            Log.d("RouteNavigation", "⏳ Waiting ${minLoadMs - elapsed}ms to meet minimum load time...")
                            delay(minLoadMs - elapsed)
                        }
                        Log.d("RouteNavigation", "✨ AUTO-NAVIGATING to route selection with ${routes.size} routes")
                        navController.navigate("route_selection/${distanceKm.toInt()}") {
                            popUpTo("route_generating/${distanceKm.toInt()}") { inclusive = true }
                        }
                    }
                }
            }
            
            // Screen 3: Route Selection
            composable("route_selection/{distanceKm}") { backStackEntry ->
                val distanceKm = backStackEntry.arguments?.getString("distanceKm")?.toDoubleOrNull() ?: 5.0
                // Get activity-scoped ViewModel (SAME instance as setup and loading screens!)
                val parentEntry = remember(backStackEntry) {
                    navController.getBackStackEntry(navController.graph.id)
                }
                val viewModel: RouteGenerationViewModel = hiltViewModel(parentEntry)
                val routes by viewModel.routes.collectAsState()
                val hasTargetTime by viewModel.hasTargetTime.collectAsState()
                val targetHours by viewModel.targetHours.collectAsState()
                val targetMinutes by viewModel.targetMinutes.collectAsState()
                val targetSeconds by viewModel.targetSeconds.collectAsState()
                val originalTargetDistanceKm by viewModel.originalTargetDistanceKm.collectAsState()
                var selectedRouteId by remember { mutableStateOf<String?>(null) }
                var aiCoachEnabled by remember { mutableStateOf(false) }
                
                RouteSelectionScreen(
                    routes = routes,
                    distanceKm = distanceKm,
                    selectedRouteId = selectedRouteId,
                    onRouteSelected = { selectedRouteId = it },
                    onStartRun = {
                        // Get selected route and store in RunConfigHolder
                        selectedRouteId?.let { routeId ->
                            val selectedRoute = routes.find { it.id == routeId }
                            selectedRoute?.let { route ->
                                // Pro-rata target time based on actual route distance vs original target distance
                                // e.g. User set 22min for 5km, picks 4.7km route → adjusted time = 22 * (4.7/5.0) = 20:41
                                val adjustedHours: Int
                                val adjustedMinutes: Int
                                val adjustedSeconds: Int
                                if (hasTargetTime && originalTargetDistanceKm > 0) {
                                    val originalTotalSeconds = targetHours * 3600 + targetMinutes * 60 + targetSeconds
                                    val ratio = route.distance / originalTargetDistanceKm
                                    val adjustedTotalSeconds = (originalTotalSeconds * ratio).toInt()
                                    adjustedHours = adjustedTotalSeconds / 3600
                                    adjustedMinutes = (adjustedTotalSeconds % 3600) / 60
                                    adjustedSeconds = adjustedTotalSeconds % 60
                                } else {
                                    adjustedHours = targetHours
                                    adjustedMinutes = targetMinutes
                                    adjustedSeconds = targetSeconds
                                }
                                
                                // Create RunSetupConfig with route + pro-rated target time
                                val config = RunSetupConfig(
                                    targetDistance = route.distance.toFloat(),
                                    hasTargetTime = hasTargetTime,
                                    targetHours = adjustedHours,
                                    targetMinutes = adjustedMinutes,
                                    targetSeconds = adjustedSeconds,
                                    route = route
                                )
                                RunConfigHolder.setConfig(config)
                                
                                navController.navigate("run_session/$routeId") {
                                    popUpTo("route_selection/${distanceKm.toInt()}") { inclusive = true }
                                }
                            }
                        }
                    },
                    onBack = { navController.popBackStack() },
                    onRegenerateRoutes = {
                        viewModel.clearRoutes()
                        navController.navigate("map_my_run_setup/route/${distanceKm}/${hasTargetTime}/${targetHours}/${targetMinutes}/${targetSeconds}/${aiCoachEnabled}") {
                            popUpTo("route_selection/${distanceKm.toInt()}") { inclusive = true }
                        }
                    },
                    aiCoachEnabled = aiCoachEnabled,
                    onAiCoachToggle = { aiCoachEnabled = it }
                )
            }
            // Run session WITHOUT a route
            composable("run_session") {
                RunSessionScreen(
                    hasRoute = false,
                    onEndRun = { runId ->
                        navController.navigate("run_summary/$runId") {
                            popUpTo("run_session") { inclusive = true }
                        }
                    },
                    onCancel = {
                        // Clear run config and go back to dashboard
                        RunConfigHolder.clearConfig()
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Home.route) { inclusive = true }
                        }
                    }
                )
            }
            // Run session WITH a route
            composable("run_session/{routeId}") { backStackEntry ->
                val routeId = backStackEntry.arguments?.getString("routeId") ?: ""
                RunSessionScreen(
                    hasRoute = routeId.isNotEmpty(),
                    onEndRun = { runId ->
                        navController.navigate("run_summary/$runId") {
                            popUpTo("run_session/{routeId}") { inclusive = true }
                        }
                    },
                    onCancel = {
                        // Clear run config and go back to dashboard
                        RunConfigHolder.clearConfig()
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Home.route) { inclusive = true }
                        }
                    }
                )
            }
            composable("run_summary/{runId}") { backStackEntry ->
                val runId = backStackEntry.arguments?.getString("runId")
                RunSummaryScreenFlagship(
                    runId = runId ?: "",
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToLogin = {
                        navController.navigate("login") {
                            popUpTo("login") { inclusive = true }
                        }
                    },
                    onNavigateToShareImage = { id ->
                        navController.navigate("share_image/$id")
                    }
                )
            }
            composable("share_image/{runId}") { backStackEntry ->
                val runId = backStackEntry.arguments?.getString("runId") ?: ""
                ShareImageEditorScreen(
                    runId = runId,
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            // Observer run session (invited to watch a friend's live run)
            composable("observer_session/{sessionId}") { backStackEntry ->
                val sessionId = backStackEntry.arguments?.getString("sessionId") ?: ""
                ObserverRunSessionScreen(
                    sessionId = sessionId,
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable("previous_runs") {
                val currentBackStack by navController.currentBackStackEntryAsState()
                PreviousRunsScreen(
                    onNavigateToRunSummary = {
                        navController.navigate("run_summary/$it")
                    },
                    isActiveDestination = currentBackStack?.destination?.route == "previous_runs"
                )
            }
            composable("create_goal") {
                CreateGoalScreen(
                    onDismiss = { navController.popBackStack() },
                    onCreateGoal = {
                        // TODO: Save goal
                        navController.popBackStack()
                    }
                )
            }
            composable("friends") {
                FriendsScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            // ── Coaching Programme routes ───────────────────────────────────────
            composable(Screen.AiPlans.route) {
                val currentBackStack by navController.currentBackStackEntryAsState()
                val featureLimitViewModel: live.airuncoach.airuncoach.viewmodel.FeatureLimitViewModel = hiltViewModel()
                
                CoachingProgrammeScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onCreatePlan = {
                        // Check feature availability before navigating
                        featureLimitViewModel.checkAiPlanAvailability()
                        navController.navigate("check_plan_availability")
                    },
                    onOpenPlan = { planId -> navController.navigate("training_plan/$planId") },
                    onNavigateToSubscription = { navController.navigate(Screen.Profile.route) },
                    isActiveDestination = currentBackStack?.destination?.route == Screen.AiPlans.route
                )
            }
            // Keep legacy route for backwards compatibility with ProfileScreen
            composable("coaching_programme") {
                val currentBackStack by navController.currentBackStackEntryAsState()
                val featureLimitViewModel: live.airuncoach.airuncoach.viewmodel.FeatureLimitViewModel = hiltViewModel()
                
                CoachingProgrammeScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onCreatePlan = {
                        // Check feature availability before navigating
                        featureLimitViewModel.checkAiPlanAvailability()
                        navController.navigate("check_plan_availability")
                    },
                    onOpenPlan = { planId -> navController.navigate("training_plan/$planId") },
                    onNavigateToSubscription = { navController.navigate(Screen.Profile.route) },
                    isActiveDestination = currentBackStack?.destination?.route == "coaching_programme"
                )
            }
            // ── AI Plan Availability Check ──────────────────────────────────
            composable("check_plan_availability") {
                val featureLimitViewModel: live.airuncoach.airuncoach.viewmodel.FeatureLimitViewModel = hiltViewModel()
                val availability by featureLimitViewModel.aiPlanAvailability.collectAsState()
                val isLoading by featureLimitViewModel.aiPlanLoading.collectAsState()

                if (isLoading) {
                    // Show loading while we check
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (availability != null) {
                    if (availability!!.isAvailable) {
                        // User can create plan - navigate and cleanup
                        LaunchedEffect(Unit) {
                            featureLimitViewModel.resetAiPlanAvailability()
                            navController.navigate("generate_plan") {
                                popUpTo("check_plan_availability") { inclusive = true }
                            }
                        }
                    } else {
                        // Limit reached - show upsell screen
                        live.airuncoach.airuncoach.ui.components.AiPlanLimitUpsellScreen(
                            nextRenewalDate = availability!!.renewalDate,
                            usedCount = availability!!.used,
                            limitCount = availability!!.limit,
                            onUpgradeClick = {
                                // Navigate to subscription screen
                                navController.navigate(Screen.Profile.route) {
                                    popUpTo("check_plan_availability") { inclusive = true }
                                }
                            },
                            onPromoCodeClick = {
                                // Show promo code dialog
                                showPromoCodeDialog = true
                            },
                            onBackClick = {
                                navController.popBackStack()
                            }
                        )
                    }
                } else {
                    // Default: allow access (error case)
                    LaunchedEffect(Unit) {
                        featureLimitViewModel.resetAiPlanAvailability()
                        navController.navigate("generate_plan") {
                            popUpTo("check_plan_availability") { inclusive = true }
                        }
                    }
                }
            }
            // ── Run Route Availability Check ───────────────────────��─────────
            // This is the ACTIVE composable for "check_route_availability".
            // Key fix: ONLY navigate to route_generating from the availability.isAvailable branch.
            // The else branch (null availability, not yet loaded) shows a loading indicator.
            // This prevents a race condition where two navigations to route_generating were created:
            //   1. The else branch fires on the very first frame (before isLoading becomes true)
            //   2. The isAvailable branch fires after the API returns
            // Both would push route_generating, the second with null params → stuck loading forever.
            composable("check_route_availability") {
                val featureLimitViewModel: live.airuncoach.airuncoach.viewmodel.FeatureLimitViewModel = hiltViewModel()
                val availability by featureLimitViewModel.runRouteAvailability.collectAsState()
                val isLoading by featureLimitViewModel.runRouteLoading.collectAsState()
                
                // Trigger availability check. This sets isLoading=true on next dispatch,
                // which prevents the else branch below from ever navigating.
                LaunchedEffect(Unit) {
                    featureLimitViewModel.checkRunRouteAvailability()
                }

                when {
                    // Loading OR not yet started (first frame, before isLoading=true is dispatched)
                    isLoading || availability == null -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                    availability!!.isAvailable -> {
                        // User can create route - navigate ONCE from here
                        val params = live.airuncoach.airuncoach.util.RouteGenerationParamsHolder.peek()
                        if (params != null) {
                            LaunchedEffect(Unit) {
                                featureLimitViewModel.resetRunRouteAvailability()
                                navController.navigate("route_generating/${params.distance.toInt()}") {
                                    popUpTo("check_route_availability") { inclusive = true }
                                }
                            }
                        } else {
                            LaunchedEffect(Unit) {
                                navController.popBackStack()
                            }
                        }
                    }
                    else -> {
                        // Limit reached - show upsell screen
                        live.airuncoach.airuncoach.ui.components.RunRouteLimitUpsellScreen(
                            nextRenewalDate = availability!!.renewalDate,
                            usedCount = availability!!.used,
                            limitCount = availability!!.limit,
                            onUpgradeClick = {
                                navController.navigate(Screen.Profile.route) {
                                    popUpTo("check_route_availability") { inclusive = true }
                                }
                            },
                            onPromoCodeClick = { showPromoCodeDialog = true },
                            onBackClick = { navController.popBackStack() }
                        )
                    }
                }
            }
            composable("generate_plan") {
                val goal = live.airuncoach.airuncoach.util.GoalPlanHolder.consume()
                GeneratePlanScreen(
                    prefilledGoal = goal,
                    onNavigateBack = { navController.popBackStack() },
                    onPlanCreated = { planId ->
                        // Pop the generate_plan screen off the stack (inclusive),
                        // then navigate to the new plan — works whether we came from
                        // coaching_programme OR the goals screen.
                        navController.navigate("training_plan/$planId") {
                            popUpTo("generate_plan") { inclusive = true }
                        }
                    },
                    onCreateGoalFirst = {
                        // Navigate to CreateGoalScreen in "returnToPlan" mode.
                        // After goal creation the screen will navigate back to generate_plan
                        // with the goal pre-filled via GoalPlanHolder.
                        navController.navigate("create_goal_for_plan")
                    }
                )
            }

            composable("create_goal_for_plan") {
                CreateGoalScreen(
                    onDismiss = { navController.popBackStack() },
                    onCreateGoal = { navController.popBackStack() },
                    onGoalCreatedForPlan = { goalId ->
                        // Goal was created — route through a loader that sets GoalPlanHolder
                        // then forwards into generate_plan with the goal pre-filled.
                        navController.navigate("goals_select_for_plan/$goalId") {
                            popUpTo("create_goal_for_plan") { inclusive = true }
                        }
                    }
                )
            }

            composable("goals_select_for_plan/{goalId}") { backStackEntry ->
                val goalId = backStackEntry.arguments?.getString("goalId") ?: run {
                    navController.popBackStack()
                    return@composable
                }
                val goalsVm: live.airuncoach.airuncoach.viewmodel.GoalsViewModel =
                    androidx.lifecycle.viewmodel.compose.viewModel(
                        factory = live.airuncoach.airuncoach.viewmodel.GoalsViewModelFactory(
                            androidx.compose.ui.platform.LocalContext.current
                        )
                    )
                val goalsState by goalsVm.goalsState.collectAsState()

                LaunchedEffect(goalId) { goalsVm.loadGoals(forceRefresh = true) }

                LaunchedEffect(goalsState) {
                    if (goalsState is live.airuncoach.airuncoach.viewmodel.GoalsUiState.Success) {
                        val allGoals = (goalsState as live.airuncoach.airuncoach.viewmodel.GoalsUiState.Success).goals
                        val match = allGoals.firstOrNull { it.id == goalId }
                        if (match != null) {
                            live.airuncoach.airuncoach.util.GoalPlanHolder.prefilledGoal = match
                        }
                        navController.navigate("generate_plan") {
                            popUpTo("goals_select_for_plan/$goalId") { inclusive = true }
                        }
                    }
                }

                // Brief loading screen while we wait
                Box(
                    modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Colors.primary)
                }
            }
            composable("training_plan/{planId}") { backStackEntry ->
                val planId = backStackEntry.arguments?.getString("planId") ?: return@composable

                // ── Cross-ViewModel plan removal ────────────────────────────────────
                // TrainingPlanDashboardScreen and CoachingProgrammeScreen each hold their own
                // TrainingPlanViewModel instance (Hilt scopes them to their back stack entries).
                // When the user cancels a plan here, the detail VM signals success. We grab the
                // LIST VM (scoped to the plans-list back stack entry) and remove the plan from
                // it immediately — BEFORE navigating back — so the cancelled plan is never
                // briefly visible when the list screen regains focus.
                val detailViewModel: TrainingPlanViewModel = hiltViewModel()
                val planCancelSuccess by detailViewModel.planActionSuccess.collectAsState()

                val plansListEntry = remember(backStackEntry) {
                    try { navController.getBackStackEntry(Screen.AiPlans.route) } catch (_: Exception) {
                        try { navController.getBackStackEntry("coaching_programme") } catch (_: Exception) { null }
                    }
                }
                val listViewModel: TrainingPlanViewModel? =
                    if (plansListEntry != null) hiltViewModel(plansListEntry) else null

                // Get the currently selected tab from the list ViewModel so we reload the right tab
                val selectedTab by (listViewModel?.selectedTab?.collectAsState() ?: remember { mutableIntStateOf(0) })
                
                LaunchedEffect(planCancelSuccess) {
                    if (planCancelSuccess && planId.isNotBlank()) {
                        // Optimistically remove from the list (zero-flicker) then refresh from
                        // the server. Since abandonPlan() awaited the API before setting this
                        // flag, the plan is already "cancelled" server-side, so the refresh
                        // will return the correct tab-filtered list.
                        listViewModel?.removePlanFromList(planId)
                        // Reload the currently selected tab (not hardcoded "active")
                        val statusMap = mapOf(0 to "active", 1 to "completed", 2 to "cancelled")
                        val currentStatus = statusMap[selectedTab] ?: "active"
                        listViewModel?.loadUserPlans(currentStatus)
                        // Clear the flag here (not in the child composable) to avoid the race
                        // where clearPlanActionSuccess() runs before this effect processes it.
                        detailViewModel.clearPlanActionSuccess()
                    }
                }

                TrainingPlanDashboardScreen(
                    planId = planId,
                    onNavigateBack = { 
                        // Reset to active tab when returning from plan detail
                        // This ensures newly created plans appear in the active tab
                        navController.popBackStack()
                    },
                    onStartWorkout = { workout ->
                        WorkoutHolder.currentWorkout = workout
                        navController.navigate("workout_detail")
                    },
                    onViewWorkoutDetail = { workout ->
                        WorkoutHolder.currentWorkout = workout
                        navController.navigate("workout_detail")
                    },
                    onViewAdaptations = { pid ->
                        navController.navigate("adaptation_review/$pid")
                    }
                )
            }
            composable("workout_detail") {
                // Capture workout in remembered state so that WorkoutHolder.clear()
                // called during "Start This Workout" doesn't cause this composable to
                // recompose with a null workout and accidentally pop run_session off the stack.
                val workout = remember { WorkoutHolder.currentWorkout }
                val planCtxForComplete = remember { WorkoutHolder.planContext }
                // Scope ViewModel to the training_plan back stack entry so it is the SAME
                // instance that TrainingPlanDashboardScreen uses — calling completeWorkout here
                // will update planDetailState and refresh the progress bar immediately on back.
                val currentEntry = navController.currentBackStackEntry
                val planBackStackEntry = remember(currentEntry) {
                    try { navController.getBackStackEntry("training_plan/{planId}") } catch (_: Exception) { null }
                }
                val trainingPlanViewModel: TrainingPlanViewModel =
                    if (planBackStackEntry != null) hiltViewModel(planBackStackEntry) else hiltViewModel()
                if (workout == null) {
                    LaunchedEffect(Unit) { navController.popBackStack() }
                } else {
                    WorkoutDetailScreen(
                        workout = workout,
                        onNavigateBack = { navController.popBackStack() },
                        onStartWorkout = { w ->
                            // Build a RunSetupConfig pre-loaded with coaching plan context
                            // so the in-run AI coach knows which plan workout is being executed.
                            val planCtx = WorkoutHolder.planContext
                            val targetDistanceKm = w.distance?.toFloat()
                            val config = RunSetupConfig(
                                activityType = PhysicalActivityType.RUN,
                                targetDistance = targetDistanceKm,
                                // Wire target time if the workout has a duration set
                                hasTargetTime = w.duration != null,
                                targetHours   = (w.duration ?: 0) / 3600,
                                targetMinutes = ((w.duration ?: 0) % 3600) / 60,
                                targetSeconds = (w.duration ?: 0) % 60,
                                // Coaching programme context
                                trainingPlanId      = planCtx?.planId,
                                workoutId           = w.id,
                                workoutType         = w.workoutType,
                                workoutIntensity    = w.intensity,
                                workoutDescription  = w.description,
                                planGoalType        = planCtx?.goalType,
                                planWeekNumber      = planCtx?.weekNumber,
                                planTotalWeeks      = planCtx?.totalWeeks
                            )
                            RunConfigHolder.setConfig(config)
                            // Clear AFTER setting config so recomposition of this composable
                            // sees a null workout but can no longer trigger popBackStack during
                            // the same frame (LaunchedEffect defers it to next frame).
                            WorkoutHolder.clear()
                            navController.navigate("run_session")
                        },
                        onMarkComplete = { w ->
                            // Capture planId before clearing WorkoutHolder
                            val planId = planCtxForComplete?.planId
                            WorkoutHolder.clear()
                            if (planId != null) {
                                trainingPlanViewModel.completeWorkout(w.id, null, planId)
                            }
                            navController.popBackStack()
                        },
                        onSkipWorkout = { w ->
                            // Capture planId before clearing WorkoutHolder
                            val planId = planCtxForComplete?.planId
                            WorkoutHolder.clear()
                            if (planId != null) {
                                trainingPlanViewModel.skipWorkout(w.id, planId)
                            }
                            navController.popBackStack()
                        }
                    )
                }
            }

            composable("group_runs") {
                GroupRunsScreen(
                    onCreateGroupRun = { navController.navigate("create_group_run") },
                    onNavigateToDetail = { groupRunId -> navController.navigate("group_run_detail/$groupRunId") },
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable("create_group_run") {
                CreateGroupRunScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onCreated = { groupRunId ->
                        // Navigate to the detail screen after creation
                        navController.navigate("group_run_detail/$groupRunId") {
                            popUpTo("group_runs")
                        }
                    }
                )
            }
            composable("group_run_detail/{groupRunId}") { backStackEntry ->
                val groupRunId = backStackEntry.arguments?.getString("groupRunId") ?: return@composable
                GroupRunDetailScreen(
                    groupRunId = groupRunId,
                    onNavigateBack = { navController.popBackStack() },
                    onStartRun = { _ ->
                        // TODO: Start run with groupRunId context — pass groupRunId to RunSession
                        navController.navigate("run_session")
                    },
                    onViewResults = { grId ->
                        navController.navigate("group_run_results/$grId")
                    }
                )
            }
            composable("coach_settings") {
                CoachSettingsScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToDashboard = {
                        // After onboarding complete, clear backstack and go to home/dashboard
                        navController.navigate("home") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }
            composable("personal_details") {
                PersonalDetailsScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToCoachSettings = {
                        // During onboarding, insert fitness level step before coach settings
                        navController.navigate("fitness_level_onboarding") {
                            popUpTo("personal_details") { inclusive = true }
                        }
                    }
                )
            }
            // Onboarding-specific fitness level screen — continues to coach settings on save
            composable("fitness_level_onboarding") {
                FitnessLevelScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateNext = {
                        navController.navigate("coach_settings") {
                            popUpTo("fitness_level_onboarding") { inclusive = true }
                        }
                    },
                    isOnboarding = true
                )
            }
            composable("fitness_level") { FitnessLevelScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("distance_scale") { DistanceScaleScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("notifications") { NotificationsScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("notification_settings") { NotificationSettingsScreen(onNavigateBack = { navController.popBackStack() }) }
            
            composable("adaptation_review/{planId}") { backStackEntry ->
                val planId = backStackEntry.arguments?.getString("planId") ?: return@composable
                AdaptationReviewScreen(
                    planId = planId,
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable("connected_devices") { 
                ConnectedDevicesScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToGarminConnect = { navController.navigate("garmin_connect") },
                    onNavigateToGarminWatchApp = { navController.navigate("garmin_watch_app") },
                    onNavigateToGarminPermissions = { navController.navigate("garmin_permissions") },
                    onNavigateToStrava = { navController.navigate("strava_oauth") }
                )
            }
            composable("garmin_connect") { 
                GarminConnectScreen(onNavigateBack = { navController.popBackStack() })
            }
            composable("garmin_watch_app") {
                GarminCompanionPromptScreen(
                    onDismiss = { navController.popBackStack() },
                    onInstall = { /* URL opened inside GarminCompanionPromptScreen */ },
                    onMaybeLater = { navController.popBackStack() }
                )
            }
            composable("garmin_permissions") { 
                // GarminPermissionsScreen - Manages Garmin data access permissions
                // User can view which permissions are granted and re-authorize for new scopes
                GarminPermissionsScreenWrapper(onNavigateBack = { navController.popBackStack() })
            }
            composable("strava_oauth") {
                // Strava OAuth integration screen
                // Launches browser for OAuth authorization, handles callback
                StravaOAuthScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onAuthSuccess = { 
                        // After successful auth, go back to Connected Devices
                        navController.popBackStack()
                    }
                )
            }
            composable("subscription") {
                SubscriptionScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToLogin = onNavigateToLogin
                )
            }
        }
    }
    
    // Show promo code dialog when requested
    if (showPromoCodeDialog) {
        PromoCodeDialog(
            isVisible = true,
            isLoading = promoCodeLoading,
            onDismiss = { 
                showPromoCodeDialog = false
            },
            onRedeem = { code ->
                // TODO: Implement full promo code redemption flow
                // This will need to:
                // 1. Call apiService.redeemPromoCode(PromoCodeRequest(code))
                // 2. Show success/error message
                // 3. Refresh feature limit checks
                promoCodeLoading = false
                showPromoCodeDialog = false
            }
        )
    }
    
    // Show location permission dialog when requested
    if (showLocationPermissionDialog) {
        LocationPermissionDialog(
            onDismiss = { showLocationPermissionDialog = false },
            onPermissionGranted = {
                showLocationPermissionDialog = false
                onLocationPermissionGranted?.invoke()
            }
        )
    }
}

@Composable
private fun LocationPermissionDialog(
    onDismiss: () -> Unit,
    onPermissionGranted: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.32f))
            .clickable { onDismiss() },
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .background(Colors.backgroundRoot, shape = RoundedCornerShape(16.dp))
                .clip(RoundedCornerShape(16.dp))
                .clickable(enabled = false) {} // Prevent clicks from propagating to the scrim
        ) {
            LocationPermissionScreen(
                onPermissionGranted = onPermissionGranted
            )
        }
    }
}

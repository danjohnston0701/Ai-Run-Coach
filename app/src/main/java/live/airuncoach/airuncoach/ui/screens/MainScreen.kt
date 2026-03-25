

package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
                        navController.navigate("map_my_run_setup/route/$dist/$timeOn/$h/$m/$s")
                    },
                    onNavigateToFreeRunSetup = {
                        val dist = dashboardViewModel.targetDistance.value
                        val timeOn = dashboardViewModel.isTargetTimeEnabled.value
                        val h = dashboardViewModel.targetHours.value
                        val m = dashboardViewModel.targetMinutes.value
                        val s = dashboardViewModel.targetSeconds.value
                        navController.navigate("map_my_run_setup/no_route/$dist/$timeOn/$h/$m/$s")
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
                    onCreateGoal = {
                        navController.navigate("create_goal")
                    },
                    refreshKey = refreshKey
                )
            }
            composable(Screen.History.route) { 
                PreviousRunsScreen(
                    onNavigateToRunSummary = {
                        navController.navigate("run_summary/$it")
                    }
                )
            }
            composable(Screen.Goals.route) {
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
                    }
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
                    onNavigateToCoachingProgramme = { navController.navigate("coaching_programme") }
                )
            }
            composable("my_data") {
                MyDataScreen()
            }
            // Map My Run Setup Screen (the beautiful redesigned one!)
            composable("map_my_run_setup/{mode}/{dist}/{timeOn}/{h}/{m}/{s}") { backStackEntry ->
                val mode = backStackEntry.arguments?.getString("mode") ?: "route"
                val dist = backStackEntry.arguments?.getString("dist")?.toFloatOrNull() ?: 5f
                val timeOn = backStackEntry.arguments?.getString("timeOn")?.toBooleanStrictOrNull() ?: false
                val h = backStackEntry.arguments?.getString("h")?.toIntOrNull() ?: 0
                val m = backStackEntry.arguments?.getString("m")?.toIntOrNull() ?: 0
                val s = backStackEntry.arguments?.getString("s")?.toIntOrNull() ?: 0
                val parentEntry = remember(backStackEntry) {
                    navController.getBackStackEntry(navController.graph.id)
                }
                val viewModel: RouteGenerationViewModel = hiltViewModel(parentEntry)

                MapMyRunSetupScreen(
                    mode = mode,
                    initialDistance = dist,
                    initialTargetTimeEnabled = timeOn,
                    initialHours = h,
                    initialMinutes = m,
                    initialSeconds = s,
                    onNavigateBack = { navController.popBackStack() },
                    onGenerateRoute = { distance, hasTime, hours, minutes, seconds, liveTracking, groupRun, latitude, longitude ->
                        // Store target time + distance so it persists through route generation → selection → run session
                        viewModel.setTargetTime(hasTime, hours, minutes, seconds, distance.toDouble())
                        
                        // Generate routes with GPS location from setup screen
                        val targetTimeMinutes = if (hasTime) hours * 60 + minutes else null
                        
                        viewModel.generateIntelligentRoutes(
                            latitude = latitude,
                            longitude = longitude,
                            distanceKm = distance.toDouble(),
                            activityType = "run",
                            preferTrails = true,
                            avoidHills = false,
                            targetTime = targetTimeMinutes,
                            aiCoachEnabled = true
                        )
                        
                        // Navigate to loading screen
                        navController.navigate("route_generating/${distance.toInt()}") {
                            popUpTo("map_my_run_setup") { inclusive = true }
                        }
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
                
                // Always show the loading screen content
                RouteGeneratingLoadingScreen(
                    distanceKm = distanceKm,
                    coachName = coachName
                )
                
                // Auto-navigate when routes are ready OR if there's an error
                LaunchedEffect(routes.size, isLoading, error) {
                    Log.d("RouteNavigation", "📊 Routes size: ${routes.size}, isLoading: $isLoading, error: $error")
                    if (routes.isNotEmpty() && !isLoading) {
                        Log.d("RouteNavigation", "✨ AUTO-NAVIGATING to route selection with ${routes.size} routes")
                        navController.navigate("route_selection/${distanceKm.toInt()}") {
                            popUpTo("route_generating/${distanceKm.toInt()}") { inclusive = true }
                        }
                    } else if (error != null && !isLoading) {
                        Log.d("RouteNavigation", "❌ ERROR occurred, navigating back to route generation")
                        navController.popBackStack()
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
                var aiCoachEnabled by remember { mutableStateOf(true) }
                
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
                        navController.navigate("map_my_run_setup/route/${distanceKm}/${hasTargetTime}/${targetHours}/${targetMinutes}/${targetSeconds}") {
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
            composable("previous_runs") {
                PreviousRunsScreen(
                    onNavigateToRunSummary = {
                        navController.navigate("run_summary/$it")
                    }
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
                CoachingProgrammeScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onCreatePlan = { navController.navigate("generate_plan") },
                    onOpenPlan = { planId -> navController.navigate("training_plan/$planId") }
                )
            }
            // Keep legacy route for backwards compatibility with ProfileScreen
            composable("coaching_programme") {
                CoachingProgrammeScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onCreatePlan = { navController.navigate("generate_plan") },
                    onOpenPlan = { planId -> navController.navigate("training_plan/$planId") }
                )
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
                    }
                )
            }
            composable("training_plan/{planId}") { backStackEntry ->
                val planId = backStackEntry.arguments?.getString("planId") ?: return@composable
                TrainingPlanDashboardScreen(
                    planId = planId,
                    onNavigateBack = { navController.popBackStack() },
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
                        navController.navigate("coach_settings") {
                            popUpTo("personal_details") { inclusive = true }
                        }
                    }
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
                    onNavigateToGarminPermissions = { navController.navigate("garmin_permissions") }
                )
            }
            composable("garmin_connect") { 
                GarminConnectScreen(onNavigateBack = { navController.popBackStack() })
            }
            composable("garmin_permissions") { 
                // GarminPermissionsScreen - Manages Garmin data access permissions
                // User can view which permissions are granted and re-authorize for new scopes
                GarminPermissionsScreenWrapper(onNavigateBack = { navController.popBackStack() })
            }
            composable("subscription") { SubscriptionScreen(onNavigateBack = { navController.popBackStack() }) }
        }
    }
}

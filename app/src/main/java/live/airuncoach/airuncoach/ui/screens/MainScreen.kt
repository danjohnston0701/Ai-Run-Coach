

package live.airuncoach.airuncoach.ui.screens

import android.Manifest
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
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.PhysicalActivityType
import live.airuncoach.airuncoach.domain.model.RunSetupConfig
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.util.RunConfigHolder
import live.airuncoach.airuncoach.viewmodel.DashboardViewModel
import live.airuncoach.airuncoach.viewmodel.RouteGenerationViewModel

sealed class Screen(val route: String, val label: String, val resourceId: Int) {
    object Home : Screen("home", "Home", R.drawable.icon_home_vector)
    object History : Screen("history", "History", R.drawable.icon_chart_vector)
    object Events : Screen("events", "Events", R.drawable.icon_calendar_vector)
    object Goals : Screen("goals", "Goals", R.drawable.icon_target_vector)
    object Profile : Screen("profile", "Profile", R.drawable.icon_profile_vector)
}

val items = listOf(
    Screen.Home,
    Screen.History,
    Screen.Events,
    Screen.Goals,
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

    Scaffold(
        containerColor = Colors.backgroundRoot,
        bottomBar = {
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
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(Screen.Home.route) {
                                    inclusive = false
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
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
            composable(Screen.Home.route) {
                val dashboardViewModel: DashboardViewModel = hiltViewModel()
                DashboardScreen(
                    onNavigateToRouteGeneration = {
                        navController.navigate("map_my_run_setup/route")
                    },
                    onNavigateToRunSession = {
                        navController.navigate("map_my_run_setup/no_route")
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
                    }
                )
            }
            composable(Screen.History.route) { 
                PreviousRunsScreen(
                    onNavigateToRunSummary = {
                        navController.navigate("run_summary/$it")
                    }
                )
            }
            composable(Screen.Events.route) { EventsScreen() }
            composable(Screen.Goals.route) {
                GoalsScreen(
                    onCreateGoal = { navController.navigate("create_goal") },
                    onNavigateBack = {
                        if (navController.previousBackStackEntry != null) {
                            navController.popBackStack()
                        }
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
                    onNavigateToGoals = { navController.navigate("goals") },
                    onNavigateToDistanceScale = { navController.navigate("distance_scale") },
                    onNavigateToNotifications = { navController.navigate("notifications") },
                    onNavigateToConnectedDevices = { navController.navigate("connected_devices") },
                    onNavigateToSubscription = { navController.navigate("subscription") }
                )
            }
            // Map My Run Setup Screen (the beautiful redesigned one!)
            composable("map_my_run_setup/{mode}") { backStackEntry ->
                val mode = backStackEntry.arguments?.getString("mode") ?: "route"
                val viewModel: RouteGenerationViewModel = hiltViewModel(navController.getBackStackEntry(navController.graph.id))

                MapMyRunSetupScreen(
                    mode = mode,
                    initialDistance = 5f,
                    initialTargetTimeEnabled = false,
                    initialHours = 0,
                    initialMinutes = 0,
                    initialSeconds = 0,
                    onNavigateBack = { navController.popBackStack() },
                    onGenerateRoute = { distance, hasTime, hours, minutes, seconds, liveTracking, groupRun ->
                        // Calculate target time in minutes for backend
                        val targetTimeMinutes = if (hasTime) hours * 60 + minutes else null
                        
                        // TODO: Get actual location - for now using dummy coordinates
                        val latitude = 37.7749  // San Francisco as placeholder
                        val longitude = -122.4194
                        
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
                val distanceKm = backStackEntry.arguments?.getString("distanceKm")?.toDoubleOrNull() ?: 5.0
                // Get activity-scoped ViewModel (SAME instance as setup screen!)
                val viewModel: RouteGenerationViewModel = hiltViewModel(navController.getBackStackEntry(navController.graph.id))
                val routes by viewModel.routes.collectAsState()
                val isLoading by viewModel.isLoading.collectAsState()
                
                // Always show the loading screen content
                RouteGeneratingLoadingScreen(
                    distanceKm = distanceKm,
                    coachName = "Coach Carter"
                )
                
                // Auto-navigate when routes are ready
                LaunchedEffect(routes.size, isLoading) {
                    Log.d("RouteNavigation", "📊 Routes size: ${routes.size}, isLoading: $isLoading")
                    if (routes.isNotEmpty() && !isLoading) {
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
                val viewModel: RouteGenerationViewModel = hiltViewModel(navController.getBackStackEntry(navController.graph.id))
                val routes by viewModel.routes.collectAsState()
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
                                // Create RunSetupConfig with route
                                val config = RunSetupConfig(
                                    targetDistance = route.distance.toFloat(),
                                    hasTargetTime = false,
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
                        navController.navigate("run_setup/route") {
                            popUpTo("route_selection/${distanceKm.toInt()}") { inclusive = true }
                        }
                    },
                    aiCoachEnabled = aiCoachEnabled,
                    onAiCoachToggle = { aiCoachEnabled = it }
                )
            }
            composable("run_session/{routeId}") { backStackEntry ->
                val routeId = backStackEntry.arguments?.getString("routeId") ?: ""
                RunSessionScreen(
                    hasRoute = routeId.isNotEmpty(),
                    onEndRun = { runId ->
                        navController.navigate("run_summary/$runId") {
                            popUpTo("run_session/{routeId}") { inclusive = true }
                        }
                    }
                )
            }
            composable("run_summary/{runId}") { backStackEntry ->
                val runId = backStackEntry.arguments?.getString("runId")
                RunSummaryScreen(
                    runId = runId ?: "",
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToLogin = {
                        navController.navigate("login") {
                            popUpTo("login") { inclusive = true }
                        }
                    }
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
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToFindFriends = { navController.navigate("find_friends") }
                )
            }
            composable("find_friends") {
                FindFriendsScreen(onNavigateBack = { navController.popBackStack() })
            }
            composable("group_runs") {
                GroupRunsScreen(
                    onCreateGroupRun = { navController.navigate("create_group_run") },
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable("create_group_run") {
                CreateGroupRunScreen(onNavigateBack = { navController.popBackStack() })
            }
            composable("coach_settings") { CoachSettingsScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("personal_details") { PersonalDetailsScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("fitness_level") { FitnessLevelScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("distance_scale") { DistanceScaleScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("notifications") { NotificationsScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("connected_devices") { ConnectedDevicesScreen(onNavigateBack = { navController.popBackStack() }) }
            composable("subscription") { SubscriptionScreen(onNavigateBack = { navController.popBackStack() }) }
        }
    }
}

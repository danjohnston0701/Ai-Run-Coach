

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import live.airuncoach.airuncoach.AppRoutes
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors

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
                    // Home is selected when on home, route_generation, or run_session
                    val isSelected = if (screen.route == Screen.Home.route) {
                        currentRoute == Screen.Home.route || 
                        currentRoute == "route_generation" || 
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
        NavHost(navController, startDestination = Screen.Home.route, Modifier.padding(innerPadding)) {
            composable(Screen.Home.route) { 
                DashboardScreen(
                    onNavigateToRouteGeneration = {
                        navController.navigate("route_generation")
                    },
                    onNavigateToRunSession = {
                        navController.navigate("run_session")
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
            composable(Screen.History.route) { HistoryScreen() }
            composable(Screen.Events.route) { EventsScreen() }
            composable(Screen.Goals.route) { 
                GoalsScreen(
                    onCreateGoal = { navController.navigate("create_goal") }
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
            composable("route_generation") {
                RouteGenerationScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onRouteSelected = { routeId ->
                        // Navigate to run session with the selected route
                        navController.navigate("run_session/$routeId")
                    }
                )
            }
            composable("run_session") { 
                RunSessionScreen(onNavigateBack = { navController.popBackStack() })
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
                FriendsScreen(onNavigateToFindFriends = { navController.navigate("find_friends") })
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

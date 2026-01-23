package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
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

@Composable
fun MainScreen() {
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
                items.forEach { screen ->
                    val isSelected = currentDestination?.hierarchy?.any { it.route == screen.route } == true
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
                                popUpTo(navController.graph.findStartDestination().id) {
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
                        // TODO: Navigate to route generation screen
                        // For now, this will be a placeholder
                    },
                    onNavigateToRunSession = {
                        // TODO: Navigate to run session screen
                        // For now, this will be a placeholder
                    },
                    onNavigateToGoals = {
                        navController.navigate(Screen.Goals.route)
                    },
                    onNavigateToProfile = {
                        navController.navigate(Screen.Profile.route)
                    },
                    onNavigateToHistory = {
                        navController.navigate(Screen.History.route)
                    }
                )
            }
            composable(Screen.History.route) { HistoryScreen() }
            composable(Screen.Events.route) { EventsScreen() }
            composable(Screen.Goals.route) { GoalsScreen() }
            composable(Screen.Profile.route) { ProfileScreen() }
        }
    }
}

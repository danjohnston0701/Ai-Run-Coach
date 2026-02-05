package live.airuncoach.airuncoach.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import live.airuncoach.airuncoach.AppRoutes
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.ui.screens.LoginScreen
import live.airuncoach.airuncoach.ui.screens.SignUpScreen
import live.airuncoach.airuncoach.ui.screens.LocationPermissionScreen
import live.airuncoach.airuncoach.ui.screens.MainScreen

@Composable
fun RootNavigationGraph(navController: NavHostController) {
    // Always start at LOGIN and let the screen handle navigation if already logged in
    NavHost(
        navController = navController,
        startDestination = AppRoutes.LOGIN
    ) {
        composable(AppRoutes.LOGIN) {
            LoginScreen(
                onNavigateToLocationPermission = {
                    navController.navigate("location_permission") {
                        popUpTo(AppRoutes.LOGIN) {
                            inclusive = true
                        }
                    }
                },
                onNavigateToMain = {
                    navController.navigate(AppRoutes.MAIN) {
                        popUpTo(AppRoutes.LOGIN) {
                            inclusive = true
                        }
                    }
                },
                onNavigateToSignUp = {
                    navController.navigate("sign_up")
                }
            )
        }
        composable("sign_up") {
            SignUpScreen(
                onNavigateToLocationPermission = {
                    navController.navigate("location_permission") {
                        popUpTo("sign_up") {
                            inclusive = true
                        }
                    }
                },
                onNavigateToMain = {
                    navController.navigate(AppRoutes.MAIN) {
                        popUpTo("sign_up") {
                            inclusive = true
                        }
                    }
                },
                onNavigateToSignIn = {
                    navController.popBackStack()
                }
            )
        }
        composable("location_permission") {
            LocationPermissionScreen(
                onPermissionGranted = {
                    navController.navigate(AppRoutes.MAIN) {
                        popUpTo("location_permission") {
                            inclusive = true
                        }
                    }
                }
            )
        }
        composable(AppRoutes.MAIN) {
            MainScreen(
                onNavigateToLogin = {
                    navController.navigate(AppRoutes.LOGIN) {
                        popUpTo(AppRoutes.MAIN) {
                            inclusive = true
                        }
                    }
                }
            )
        }
    }
}

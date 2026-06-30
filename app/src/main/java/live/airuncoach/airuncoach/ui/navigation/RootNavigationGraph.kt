package live.airuncoach.airuncoach.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import live.airuncoach.airuncoach.AppRoutes
import live.airuncoach.airuncoach.data.AiConsentManager
import live.airuncoach.airuncoach.data.SessionManager
import androidx.navigation.NavType
import androidx.navigation.navArgument
import live.airuncoach.airuncoach.ui.screens.AiConsentScreen
import live.airuncoach.airuncoach.ui.screens.ForgotPasswordScreen
import live.airuncoach.airuncoach.ui.screens.GarminWatchUpdateScreen
import live.airuncoach.airuncoach.ui.screens.LoginScreen
import live.airuncoach.airuncoach.ui.screens.SignUpScreen
import live.airuncoach.airuncoach.ui.screens.LocationPermissionScreen
import live.airuncoach.airuncoach.ui.screens.MainScreen
import live.airuncoach.airuncoach.ui.screens.PersonalDetailsScreen
import live.airuncoach.airuncoach.ui.screens.CoachSettingsScreen

@Composable
fun RootNavigationGraph(navController: NavHostController) {
    val context = LocalContext.current
    val consentManager = remember { AiConsentManager(context) }

    // Always start at LOGIN and let the screen handle navigation if already logged in
    NavHost(
        navController = navController,
        startDestination = AppRoutes.LOGIN
    ) {
        composable(AppRoutes.LOGIN) {
            LoginScreen(
                onNavigateToLocationPermission = {
                    navController.navigate(AppRoutes.LOCATION_PERMISSION) {
                        popUpTo(AppRoutes.LOGIN) { inclusive = true }
                    }
                },
                onNavigateToMain = {
                    navController.navigate(AppRoutes.MAIN) {
                        popUpTo(AppRoutes.LOGIN) { inclusive = true }
                    }
                },
                onNavigateToSignUp = {
                    navController.navigate("sign_up")
                },
                onNavigateToForgotPassword = {
                    navController.navigate(AppRoutes.FORGOT_PASSWORD)
                }
            )
        }

        composable(AppRoutes.FORGOT_PASSWORD) {
            ForgotPasswordScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("sign_up") {
            SignUpScreen(
                onNavigateToLocationPermission = {
                    navController.navigate(AppRoutes.LOCATION_PERMISSION) {
                        popUpTo("sign_up") { inclusive = true }
                    }
                },
                onNavigateToMain = {
                    navController.navigate(AppRoutes.MAIN) {
                        popUpTo("sign_up") { inclusive = true }
                    }
                },
                onNavigateToSignIn = {
                    navController.popBackStack()
                },
                onNavigateToProfile = {
                    // New user: must do permissions FIRST before profile setup
                    navController.navigate(AppRoutes.LOCATION_PERMISSION) {
                        popUpTo("sign_up") { inclusive = true }
                    }
                },
                onNavigateToCoachSettings = {
                    // User completed profile: must do permissions FIRST if not already done
                    navController.navigate(AppRoutes.LOCATION_PERMISSION) {
                        popUpTo("sign_up") { inclusive = true }
                    }
                }
            )
        }

        composable(AppRoutes.LOCATION_PERMISSION) {
            val sessionManager = remember { SessionManager(context) }
            LocationPermissionScreen(
                onPermissionGranted = {
                    // After permissions, check if user is in onboarding flow
                    when {
                        sessionManager.needsProfileSetup() -> {
                            // New user: proceed to personal details
                            navController.navigate("personal_details") {
                                popUpTo(AppRoutes.LOCATION_PERMISSION) { inclusive = true }
                            }
                        }
                        sessionManager.needsCoachSetup() -> {
                            // User completed profile: proceed to coach settings
                            navController.navigate("coach_settings") {
                                popUpTo(AppRoutes.LOCATION_PERMISSION) { inclusive = true }
                            }
                        }
                        else -> {
                            // Existing user: check if they've seen the AI consent screen
                            if (consentManager.hasSeenConsent()) {
                                navController.navigate(AppRoutes.MAIN) {
                                    popUpTo(AppRoutes.LOCATION_PERMISSION) { inclusive = true }
                                }
                            } else {
                                navController.navigate(AppRoutes.AI_CONSENT) {
                                    popUpTo(AppRoutes.LOCATION_PERMISSION) { inclusive = true }
                                }
                            }
                        }
                    }
                }
            )
        }

        composable(AppRoutes.AI_CONSENT) {
            AiConsentScreen(
                onConsentDecided = { _ ->
                    // Regardless of grant/decline, navigate to main app.
                    // The choice is stored in AiConsentManager.
                    navController.navigate(AppRoutes.MAIN) {
                        popUpTo(AppRoutes.AI_CONSENT) { inclusive = true }
                    }
                }
            )
        }

        composable(AppRoutes.MAIN) {
            MainScreen(
                onNavigateToLogin = {
                    navController.navigate(AppRoutes.LOGIN) {
                        popUpTo(AppRoutes.MAIN) { inclusive = true }
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

        composable("coach_settings") {
            CoachSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDashboard = {
                    navController.navigate(AppRoutes.LOCATION_PERMISSION) {
                        popUpTo("coach_settings") { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = AppRoutes.GARMIN_WATCH_UPDATE,
            arguments = listOf(
                navArgument("version") {
                    type = NavType.StringType
                    defaultValue = ""
                    nullable = true
                },
                navArgument("releaseNote") {
                    type = NavType.StringType
                    defaultValue = ""
                    nullable = true
                }
            )
        ) { backStackEntry ->
            GarminWatchUpdateScreen(
                version = backStackEntry.arguments?.getString("version") ?: "",
                releaseNote = backStackEntry.arguments?.getString("releaseNote") ?: "",
                onBack = { navController.popBackStack() }
            )
        }
    }
}

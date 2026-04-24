package live.airuncoach.airuncoach.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import live.airuncoach.airuncoach.AppRoutes
import live.airuncoach.airuncoach.data.AiConsentManager
import live.airuncoach.airuncoach.ui.screens.AiConsentScreen
import live.airuncoach.airuncoach.ui.screens.ForgotPasswordScreen
import live.airuncoach.airuncoach.ui.screens.LoginScreen
import live.airuncoach.airuncoach.ui.screens.SignUpScreen
import live.airuncoach.airuncoach.ui.screens.LocationPermissionScreen
import live.airuncoach.airuncoach.ui.screens.MainScreen

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
                    navController.navigate("personal_details") {
                        popUpTo("sign_up") { inclusive = true }
                    }
                },
                onNavigateToCoachSettings = {
                    navController.navigate("coach_settings") {
                        popUpTo("sign_up") { inclusive = true }
                    }
                }
            )
        }

        composable(AppRoutes.LOCATION_PERMISSION) {
            LocationPermissionScreen(
                onPermissionGranted = {
                    // After permissions, check if user has seen the AI consent screen.
                    // If not, show it now (mandatory once per install).
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
    }
}

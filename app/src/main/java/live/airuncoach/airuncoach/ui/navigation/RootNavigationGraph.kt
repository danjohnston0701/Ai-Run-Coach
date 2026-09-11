package live.airuncoach.airuncoach.ui.navigation

import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import live.airuncoach.airuncoach.AppRoutes
import live.airuncoach.airuncoach.MainActivity
import live.airuncoach.airuncoach.data.AiConsentManager
import live.airuncoach.airuncoach.data.SessionManager
import androidx.navigation.NavType
import androidx.navigation.navArgument
import live.airuncoach.airuncoach.ui.screens.AiCoachingOnboardingScreen
import live.airuncoach.airuncoach.ui.screens.AiConsentScreen
import live.airuncoach.airuncoach.ui.screens.EmailVerificationScreen
import live.airuncoach.airuncoach.ui.screens.FitnessLevelScreen
import live.airuncoach.airuncoach.ui.screens.ForgotPasswordScreen
import live.airuncoach.airuncoach.ui.screens.GarminWatchUpdateScreen
import live.airuncoach.airuncoach.ui.screens.InSessionCoachingSettingsScreen
import live.airuncoach.airuncoach.ui.screens.InjuryOnboardingScreen
import live.airuncoach.airuncoach.ui.screens.LoginScreen
import live.airuncoach.airuncoach.ui.screens.ObserverLoginScreen
import live.airuncoach.airuncoach.ui.screens.ObserverRunSessionScreen
import live.airuncoach.airuncoach.ui.screens.OnboardingIntroScreen
import live.airuncoach.airuncoach.ui.screens.SignUpScreen
import live.airuncoach.airuncoach.ui.screens.LocationPermissionScreen
import live.airuncoach.airuncoach.ui.screens.PermissionsAndConsentsScreen
import live.airuncoach.airuncoach.ui.screens.MainScreen
import live.airuncoach.airuncoach.ui.screens.PersonalDetailsScreen
import live.airuncoach.airuncoach.ui.screens.CoachSettingsScreen
import live.airuncoach.airuncoach.ui.screens.OnboardingSubscriptionScreen
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.viewmodel.VersionCheckViewModel

@Composable
fun RootNavigationGraph(navController: NavHostController) {
    val context = LocalContext.current
    val consentManager = remember { AiConsentManager(context) }
    val versionCheckViewModel: VersionCheckViewModel = hiltViewModel()
    val androidUpdate = versionCheckViewModel.androidUpdateAvailable.collectAsState().value
    val appContext = context

    // Check before login navigation so stale installs cannot enter the app.
    LaunchedEffect(Unit) {
        versionCheckViewModel.checkVersions()
    }

    // Observer email-invite / non-registered-observer deep links ("observer_login/{token}",
    // "observer_session_standalone/{sessionId}") must be reachable WITHOUT logging in — the
    // whole point of these routes is a person who doesn't have an account tapping a link.
    // MainActivity.pendingDeepLink is otherwise only consumed by MainScreen's inner NavHost
    // (which requires AppRoutes.MAIN, i.e. an authenticated session) — for these two route
    // prefixes specifically, consume it here on the pre-login root graph instead.
    val pendingDeepLink = MainActivity.pendingDeepLink.value
    LaunchedEffect(pendingDeepLink) {
        val route = pendingDeepLink ?: return@LaunchedEffect
        if (route.startsWith("observer_login/") || route.startsWith("observer_session_standalone/")) {
            navController.navigate(route)
            MainActivity.pendingDeepLink.value = null // consume so MainScreen doesn't also try
        }
    }

    NavHost(
        navController = navController,
        startDestination = AppRoutes.LOGIN
    ) {
        rootNavigationDestinations(navController, consentManager, appContext)
    }

    if (androidUpdate?.isForced == true) {
        val update = androidUpdate
        AlertDialog(
            onDismissRequest = {},
            containerColor = Colors.backgroundSecondary,
            title = {
                Text(
                    text = "Update Required",
                    style = AppTextStyles.h3,
                    color = Colors.textPrimary
                )
            },
            text = {
                Column {
                    Text(
                        text = "Please update AI Run Coach to continue.",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                    if (update.releaseNote.isNotBlank()) {
                        Spacer(modifier = androidx.compose.ui.Modifier.height(8.dp))
                        Text(
                            text = update.releaseNote,
                            style = AppTextStyles.small,
                            color = Colors.textSecondary
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val marketIntent = Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("market://details?id=${context.packageName}")
                        )
                        try {
                            context.startActivity(marketIntent)
                        } catch (_: Exception) {
                            context.startActivity(
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse(
                                        update.playStoreUrl.ifBlank {
                                            "https://play.google.com/store/apps/details?id=${context.packageName}"
                                        }
                                    )
                                )
                            )
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Update Now", color = Colors.buttonText)
                }
            }
        )
    }
}

private fun NavGraphBuilder.rootNavigationDestinations(
    navController: NavHostController,
    consentManager: AiConsentManager,
    appContext: android.content.Context
) {

    // Always start at LOGIN and let the screen handle navigation if already logged in
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
                },
                onNavigateToObserverSession = { sessionId ->
                    // Navigate to standalone observer session (from login, not logged-in user)
                    navController.navigate("observer_session_standalone/$sessionId") {
                        popUpTo(AppRoutes.LOGIN) { inclusive = true }
                    }
                },
                onNavigateToEmailVerification = { email ->
                    navController.navigate("email_verification/${java.net.URLEncoder.encode(email, "UTF-8")}")
                }
            )
        }

        // Standalone observer session (accessed from login screen with a resolved token —
        // no account required to watch).
        composable("observer_session_standalone/{sessionId}") { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getString("sessionId") ?: ""
            ObserverRunSessionScreen(
                sessionId = sessionId,
                onNavigateBack = { navController.popBackStack() },
                isStandaloneObserver = true
            )
        }

        // Observer login for non-registered users (via email invite token / deep link).
        composable("observer_login/{token}") { backStackEntry ->
            val token = backStackEntry.arguments?.getString("token") ?: ""
            ObserverLoginScreen(
                initialToken = token,
                onObserverSessionStarted = { sessionId ->
                    navController.navigate("observer_session_standalone/$sessionId") {
                        popUpTo("observer_login/$token") { inclusive = true }
                    }
                },
                onNavigateBack = { navController.popBackStack() }
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
                    // After sign-up, user MUST go through location permissions FIRST
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
                    navController.navigate("onboarding_intro") {
                        popUpTo("sign_up") { inclusive = true }
                    }
                },
                onNavigateToCoachSettings = {
                    navController.navigate("ai_coaching_onboarding") {
                        popUpTo("sign_up") { inclusive = true }
                    }
                },
                onNavigateToEmailVerification = { email ->
                    navController.navigate("email_verification/${java.net.URLEncoder.encode(email, "UTF-8")}")
                }
            )
        }

        composable(
            route = "email_verification/{email}",
            arguments = listOf(navArgument("email") { type = NavType.StringType })
        ) { backStackEntry ->
            val email = java.net.URLDecoder.decode(
                backStackEntry.arguments?.getString("email") ?: "", "UTF-8"
            )
            EmailVerificationScreen(
                email = email,
                onNavigateBack = { navController.popBackStack() },
                onVerificationSuccess = {
                    // popUpTo(AppRoutes.LOGIN) rather than "sign_up" — this screen is now also
                    // reached from LoginScreen (returning user whose account was never verified),
                    // where "sign_up" was never pushed onto the back stack. LOGIN is the graph's
                    // startDestination so it's always present, clearing the whole auth flow
                    // (login/sign_up/email_verification) regardless of which one led here.
                    navController.navigate("onboarding_intro") {
                        popUpTo(AppRoutes.LOGIN) { inclusive = true }
                    }
                }
            )
        }

        composable("permissions_and_consents") {
            PermissionsAndConsentsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToPersonalDetails = {
                    navController.navigate("personal_details") {
                        popUpTo("permissions_and_consents") { inclusive = true }
                    }
                }
            )
        }

        composable(AppRoutes.LOCATION_PERMISSION) {
            val sessionManager = remember { SessionManager(appContext) }
            LocationPermissionScreen(
                onPermissionGranted = {
                    when {
                        sessionManager.needsProfileSetup() -> {
                            // New user: show intro screen first
                            navController.navigate("onboarding_intro") {
                                popUpTo(AppRoutes.LOCATION_PERMISSION) { inclusive = true }
                            }
                        }
                        sessionManager.needsCoachSetup() -> {
                            navController.navigate("ai_coaching_onboarding") {
                                popUpTo(AppRoutes.LOCATION_PERMISSION) { inclusive = true }
                            }
                        }
                        else -> {
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

        // New intro screen — first step for new users after location permissions
        composable("onboarding_intro") {
            OnboardingIntroScreen(
                onGetStarted = {
                    navController.navigate("personal_details") {
                        popUpTo("onboarding_intro") { inclusive = true }
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
            val sessionManager = remember { SessionManager(appContext) }
            
            // Check if user needs to complete onboarding on app restart
            if (sessionManager.needsProfileSetup()) {
                // Navigate to personal details
                navController.navigate("personal_details") {
                    popUpTo(AppRoutes.MAIN) { inclusive = true }
                }
            } else if (sessionManager.needsCoachSetup()) {
                // Navigate to coach settings
                navController.navigate("coach_settings") {
                    popUpTo(AppRoutes.MAIN) { inclusive = true }
                }
            } else {
                // Only show MainScreen if onboarding is complete
                MainScreen(
                    onNavigateToLogin = {
                        navController.navigate(AppRoutes.LOGIN) {
                            popUpTo(AppRoutes.MAIN) { inclusive = true }
                        }
                    },
                    onNavigateToGarminUpdate = { version, releaseNote ->
                        navController.navigate(AppRoutes.garminWatchUpdate(version, releaseNote))
                    }
                )
            }
        }

        composable("personal_details") {
            PersonalDetailsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToCoachSettings = {
                    // No injuries — proceed to fitness level first
                    navController.navigate("fitness_level_onboarding") {
                        popUpTo("personal_details") { inclusive = true }
                    }
                }
            )
        }

        composable("injury_onboarding") {
            InjuryOnboardingScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToFitnessLevel = {
                    navController.navigate("fitness_level_onboarding") {
                        popUpTo("injury_onboarding") { inclusive = true }
                    }
                }
            )
        }

        composable("fitness_level_onboarding") {
            FitnessLevelScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateNext = {
                    navController.navigate("ai_coaching_onboarding") {
                        popUpTo("fitness_level_onboarding") { inclusive = true }
                    }
                },
                isOnboarding = true
            )
        }

        // AI Coaching consent/intro screen — shown in onboarding before coach settings
        composable("ai_coaching_onboarding") {
            AiCoachingOnboardingScreen(
                onEnableAndContinue = {
                    navController.navigate("coach_settings") {
                        popUpTo("ai_coaching_onboarding") { inclusive = true }
                    }
                },
                onSkip = {
                    navController.navigate("coach_settings") {
                        popUpTo("ai_coaching_onboarding") { inclusive = true }
                    }
                }
            )
        }

        composable("coach_settings") {
            CoachSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDashboard = {
                    navController.navigate("coaching_prompts_settings") {
                        popUpTo("coach_settings") { inclusive = true }
                    }
                },
                isOnboarding = true
            )
        }

        // In-session coaching prompts screen — second part of coach setup in onboarding
        composable("coaching_prompts_settings") {
            InSessionCoachingSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDashboard = {
                    navController.navigate("onboarding_subscription") {
                        popUpTo("coaching_prompts_settings") { inclusive = true }
                    }
                }
            )
        }

        composable("onboarding_subscription") {
            OnboardingSubscriptionScreen(
                onNavigateToPermissions = {
                    navController.navigate(AppRoutes.LOCATION_PERMISSION) {
                        popUpTo("onboarding_subscription") { inclusive = true }
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

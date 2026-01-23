package live.airuncoach.airuncoach

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import live.airuncoach.airuncoach.ui.screens.LocationPermissionScreen
import live.airuncoach.airuncoach.ui.screens.LoginScreen
import live.airuncoach.airuncoach.ui.screens.MainScreen
import live.airuncoach.airuncoach.ui.theme.AiRunCoachTheme

object AppRoutes {
    const val LOGIN = "login"
    const val LOCATION_PERMISSION = "location_permission"
    const val MAIN = "main"
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AiRunCoachTheme {
                val navController = rememberNavController()
                NavHost(navController = navController, startDestination = AppRoutes.LOGIN) {
                    composable(AppRoutes.LOGIN) {
                        LoginScreen(onLoginSuccess = { navController.navigate(AppRoutes.LOCATION_PERMISSION) })
                    }
                    composable(AppRoutes.LOCATION_PERMISSION) {
                        LocationPermissionScreen(onPermissionGranted = { navController.navigate(AppRoutes.MAIN) })
                    }
                    composable(AppRoutes.MAIN) {
                        MainScreen()
                    }
                }
            }
        }
    }
}

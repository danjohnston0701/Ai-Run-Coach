package live.airuncoach.airuncoach

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.GarminAuthManager
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.service.RunTrackingService
import live.airuncoach.airuncoach.ui.navigation.RootNavigationGraph
import live.airuncoach.airuncoach.ui.theme.AiRunCoachTheme

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    
    private lateinit var garminAuthManager: GarminAuthManager
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        android.util.Log.d("MainActivity", "onCreate called")
        
        // Initialize RetrofitClient before anything else
        try {
            RetrofitClient.initialize(this, SessionManager(this))
            android.util.Log.d("MainActivity", "✅ RetrofitClient initialized")
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "❌ Failed to initialize RetrofitClient: ${e.message}", e)
        }
        
        // Initialize Garmin auth manager
        garminAuthManager = GarminAuthManager(this)
        
        // Handle OAuth callback if present
        handleGarminOAuthCallback(intent)
        
        // Global exception handler - prevent crashes from framework bugs
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            // Handle known harmless Compose framework issues
            if (throwable.message?.contains("ACTION_HOVER_EXIT event was not cleared") == true ||
                throwable.message?.contains("ACTION_HOVER_EXIT") == true ||
                throwable.message?.contains("Sending motion event") == true) {
                android.util.Log.w("MainActivity", "Ignored Compose framework bug: ${throwable.message}")
                // Suppress this error - it's a harmless framework issue on some devices
                // Do NOT call the default handler, preventing crash
                return@setDefaultUncaughtExceptionHandler
            }

            // For other exceptions, delegate to default handler
            defaultHandler?.uncaughtException(thread, throwable)
        }
        
        // Check if this is launching from an active run notification
        val launchToActiveRun = intent?.getBooleanExtra(RunTrackingService.EXTRA_ACTIVE_RUN, false) == true
        Log.d("MainActivity", "Launch to active run: $launchToActiveRun")

        try {
            Log.d("MainActivity", "Setting content...")
            setContent {
                Log.d("MainActivity", "Inside setContent composable")
                AiRunCoachTheme {
                    Log.d("MainActivity", "Theme applied")
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        Log.d("MainActivity", "Creating navigation...")
                        val navController = rememberNavController()
                        Log.d("MainActivity", "NavController created")
                        
                        // Navigate to active run if launched from notification
                        LaunchedEffect(navController, launchToActiveRun) {
                            if (launchToActiveRun) {
                                navController.navigate("run_session") {
                                    popUpTo("run_session") { inclusive = true }
                                }
                            }
                        }
                        
                        RootNavigationGraph(navController = navController)
                        Log.d("MainActivity", "Navigation graph set up")
                    }
                }
            }
            android.util.Log.d("MainActivity", "setContent completed successfully")
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "FATAL ERROR in setContent: ${e.message}", e)
            e.printStackTrace()
            // Show error screen
            setContent {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(androidx.compose.ui.graphics.Color(0xFF0A0F1A))
                        .padding(24.dp),
                    contentAlignment = androidx.compose.ui.Alignment.Center
                ) {
                    androidx.compose.material3.Text(
                        text = "Error starting app:\n\n${e.message}\n\n${e.stackTraceToString()}",
                        modifier = Modifier.fillMaxWidth(),
                        color = androidx.compose.ui.graphics.Color.White,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
    
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        android.util.Log.d("MainActivity", "onNewIntent called")
        handleGarminOAuthCallback(intent)
    }
    
    private fun handleGarminOAuthCallback(intent: Intent?) {
        intent?.data?.let { uri ->
            android.util.Log.d("MainActivity", "Received URI: $uri")
            
            if (uri.scheme == "airuncoach" && uri.host == "garmin" && uri.path == "/auth-complete") {
                android.util.Log.d("MainActivity", "✅ Garmin OAuth callback detected!")
                
                val success = uri.getQueryParameter("success") == "true"
                val token = uri.getQueryParameter("token")
                val error = uri.getQueryParameter("error")
                
                if (success && token != null) {
                    // Backend has already exchanged the token
                    // Now fetch the stored access token from backend
                    lifecycleScope.launch {
                        val result = garminAuthManager.fetchStoredToken(token)
                        
                        if (result.isSuccess) {
                            android.util.Log.d("MainActivity", "✅ Garmin authentication successful!")
                            // Show success toast/message
                        } else {
                            android.util.Log.e("MainActivity", "❌ Failed to fetch token: ${result.exceptionOrNull()?.message}")
                        }
                    }
                } else {
                    android.util.Log.e("MainActivity", "❌ Garmin authentication failed: $error")
                }
            }
        }
    }
}

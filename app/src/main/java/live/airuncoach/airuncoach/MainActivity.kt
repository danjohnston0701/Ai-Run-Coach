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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.GarminAuthManager
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.service.GarminWatchManager
import live.airuncoach.airuncoach.service.RunTrackingService
import live.airuncoach.airuncoach.ui.navigation.RootNavigationGraph
import live.airuncoach.airuncoach.ui.theme.AiRunCoachTheme

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    
    private lateinit var garminAuthManager: GarminAuthManager

    // Garmin watch bridge — initialized at app startup so the watch can connect
    // and receive an auth token without the user needing to start a run first.
    private var garminWatchManager: GarminWatchManager? = null
    
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

        // Initialize Garmin watch bridge at app startup.
        // This allows the watch companion app to receive an auth token as soon as
        // the phone app opens — without requiring a run to be in progress.
        initGarminWatchBridge()
        
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
        
        // Check if this is a shared run deep link
        val sharedRunId = extractSharedRunId(intent)
        Log.d("MainActivity", "Shared run deep link: $sharedRunId")

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
                        // Only navigate after navigation graph is set up (when graph is not empty)
                        LaunchedEffect(navController, launchToActiveRun, sharedRunId) {
                            // Add delay to ensure navigation graph is ready
                            delay(100)
                            if (launchToActiveRun) {
                                try {
                                    val currentRoute = navController.currentBackStackEntry?.destination?.route
                                    if (currentRoute != null && currentRoute != "run_session") {
                                        navController.navigate("run_session") {
                                            popUpTo(0) { inclusive = true }
                                        }
                                    }
                                } catch (e: Exception) {
                                    Log.e("MainActivity", "Navigation failed", e)
                                }
                            } else if (sharedRunId != null) {
                                try {
                                    Log.d("MainActivity", "Navigating to shared run: $sharedRunId")
                                    navController.navigate("run_summary/$sharedRunId")
                                } catch (e: Exception) {
                                    Log.e("MainActivity", "Shared run navigation failed", e)
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

    /**
     * Extract a run ID from deep link intents:
     * - airuncoach://run/{runId}?ref={token}
     * - https://airuncoach.live/share/{token} (resolved via API)
     */
    private fun extractSharedRunId(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        Log.d("MainActivity", "Checking deep link URI: $uri")

        // Custom scheme: airuncoach://run/{runId}
        if (uri.scheme == "airuncoach" && uri.host == "run") {
            val runId = uri.pathSegments?.firstOrNull()
            if (!runId.isNullOrBlank()) {
                Log.d("MainActivity", "Extracted runId from custom scheme: $runId")
                return runId
            }
        }

        // HTTPS link: https://airuncoach.live/share/{token}
        // For HTTPS links, the landing page JavaScript will redirect to airuncoach://run/{runId}
        // so this case is a fallback — the primary path is the custom scheme above
        if (uri.host == "airuncoach.live" && uri.path?.startsWith("/share/") == true) {
            val token = uri.pathSegments?.getOrNull(1)
            if (!token.isNullOrBlank()) {
                Log.d("MainActivity", "HTTPS share link detected, token: $token")
                // The landing page JS will try the deep link first, so this path means
                // the app was opened directly from the HTTPS link via app link verification.
                // We'll resolve the token to a runId asynchronously.
                lifecycleScope.launch {
                    try {
                        val response = live.airuncoach.airuncoach.network.RetrofitClient.apiService.getSharedRun(token)
                        Log.d("MainActivity", "Resolved share token to runId: ${response.runId}")
                        // Note: At this point the navController may need a reference
                        // For now, store in a companion object for the LaunchedEffect to pick up
                        pendingSharedRunId = response.runId
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Failed to resolve share token", e)
                    }
                }
            }
        }

        return null
    }

    // ── Garmin watch bridge ───────────────────────────────────────────────────

    /**
     * Initialize the Garmin ConnectIQ bridge so the watch companion app receives
     * an auth token as soon as the phone app is opened — even with no active run.
     *
     * Flow:
     *   1. ConnectIQ SDK starts up (WIRELESS / Bluetooth)
     *   2. onSdkReady fires → finds paired watch → resolves companion app
     *   3. onWatchAppReady fires → we push "auth" message with JWT + runner name
     *   4. Watch receives "auth" → saves token → shows "Ready" screen
     */
    private fun initGarminWatchBridge() {
        try {
            val sessionManager = SessionManager(this)

            garminWatchManager = GarminWatchManager(this).also { mgr ->
                mgr.onWatchAppReady = {
                    // Watch companion app is resolved and listening — push auth immediately
                    val token = sessionManager.getAuthToken()
                    val name  = sessionManager.getUserName() ?: ""
                    if (token != null) {
                        Log.d("MainActivity", "Watch app ready — sending auth token to watch")
                        mgr.sendAuth(token, name)
                    } else {
                        Log.d("MainActivity", "Watch app ready but user not logged in — skipping auth push")
                    }
                }
                mgr.initialize()
                Log.d("MainActivity", "✅ GarminWatchManager initialized at app startup")
            }
        } catch (e: Exception) {
            // Non-fatal: Garmin Connect app may not be installed on this device
            Log.w("MainActivity", "GarminWatchManager init skipped (non-fatal): ${e.message}")
            garminWatchManager = null
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            garminWatchManager?.shutdown()
        } catch (e: Exception) {
            Log.w("MainActivity", "GarminWatchManager shutdown: ${e.message}")
        }
    }

    companion object {
        @Volatile
        var pendingSharedRunId: String? = null
    }
}

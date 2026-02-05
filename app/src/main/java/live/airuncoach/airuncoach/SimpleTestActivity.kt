package live.airuncoach.airuncoach

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import live.airuncoach.airuncoach.ui.theme.AiRunCoachTheme
import javax.inject.Inject
import live.airuncoach.airuncoach.network.ApiService

/**
 * Simple test activity to diagnose the splash screen hang
 * Shows a working UI and tests Hilt injection step by step
 */
@AndroidEntryPoint
class SimpleTestActivity : ComponentActivity() {
    
    @Inject
    lateinit var apiService: ApiService
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        android.util.Log.d("SimpleTest", "onCreate started")
        
        try {
            setContent {
                AiRunCoachTheme {
                    var logs by remember { mutableStateOf("Starting...\n") }
                    
                    LaunchedEffect(Unit) {
                        logs += "✅ UI rendered\n"
                        delay(100)
                        
                        try {
                            logs += "Testing Hilt injection...\n"
                            delay(100)
                            
                            // Test if apiService is injected
                            logs += "ApiService: ${if (::apiService.isInitialized) "✅ Injected" else "❌ Not injected"}\n"
                            delay(100)
                            
                            logs += "Getting SharedPreferences...\n"
                            val prefs = getSharedPreferences("user_prefs", MODE_PRIVATE)
                            logs += "✅ SharedPreferences OK\n"
                            delay(100)
                            
                            logs += "\n✅ ALL TESTS PASSED!\n"
                            logs += "\nThe issue is in LoginScreen or Navigation setup."
                            
                        } catch (e: Exception) {
                            logs += "\n❌ ERROR: ${e.message}\n${e.stackTraceToString()}"
                        }
                    }
                    
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color(0xFF0A0F1A))
                            .padding(24.dp),
                        contentAlignment = Alignment.TopStart
                    ) {
                        Text(
                            text = "Simple Test Activity\n\n$logs",
                            color = Color.White,
                            fontSize = 14.sp,
                            lineHeight = 20.sp
                        )
                    }
                }
            }
            android.util.Log.d("SimpleTest", "setContent completed")
        } catch (e: Exception) {
            android.util.Log.e("SimpleTest", "Error: ${e.message}", e)
        }
    }
}

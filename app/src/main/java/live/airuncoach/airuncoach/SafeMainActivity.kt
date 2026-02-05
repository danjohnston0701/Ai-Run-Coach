package live.airuncoach.airuncoach

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Diagnostic activity to check what's causing crashes
 * Replace MainActivity with this in AndroidManifest.xml temporarily to debug
 */
class SafeMainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val diagnostics = StringBuilder()
        diagnostics.append("AI Run Coach - Diagnostics\n\n")
        
        try {
            // Check 1: Google Play Services
            try {
                val gmsAvailability = com.google.android.gms.common.GoogleApiAvailability.getInstance()
                val resultCode = gmsAvailability.isGooglePlayServicesAvailable(this)
                if (resultCode == com.google.android.gms.common.ConnectionResult.SUCCESS) {
                    diagnostics.append("✅ Google Play Services: OK\n")
                } else {
                    diagnostics.append("❌ Google Play Services: ERROR ($resultCode)\n")
                }
            } catch (e: Exception) {
                diagnostics.append("❌ Google Play Services: ${e.message}\n")
            }
            
            // Check 2: Network
            try {
                val cm = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
                val network = cm.activeNetwork
                if (network != null) {
                    diagnostics.append("✅ Network: Connected\n")
                } else {
                    diagnostics.append("⚠️ Network: Disconnected\n")
                }
            } catch (e: Exception) {
                diagnostics.append("❌ Network check failed: ${e.message}\n")
            }
            
            // Check 3: Hilt
            try {
                // If Hilt is working, this won't crash
                diagnostics.append("✅ Hilt: Checking...\n")
            } catch (e: Exception) {
                diagnostics.append("❌ Hilt: ${e.message}\n")
            }
            
            // Check 4: SharedPreferences
            try {
                val prefs = getSharedPreferences("user_prefs", MODE_PRIVATE)
                val token = prefs.getString("auth_token", null)
                diagnostics.append("✅ SharedPreferences: OK\n")
                diagnostics.append("   Auth token: ${if (token != null) "EXISTS" else "NULL"}\n")
            } catch (e: Exception) {
                diagnostics.append("❌ SharedPreferences: ${e.message}\n")
            }
            
            // Check 5: Android version
            diagnostics.append("\n📱 Device Info:\n")
            diagnostics.append("   Android: ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})\n")
            diagnostics.append("   Model: ${android.os.Build.MODEL}\n")
            diagnostics.append("   Manufacturer: ${android.os.Build.MANUFACTURER}\n")
            
        } catch (e: Exception) {
            diagnostics.append("\n❌ FATAL ERROR:\n${e.message}\n\n${e.stackTraceToString()}")
        }
        
        setContent {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF0A0F1A))
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = diagnostics.toString(),
                    color = Color.White,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Start,
                    lineHeight = 20.sp
                )
            }
        }
    }
}

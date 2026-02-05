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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * NO HILT - Ultra simple activity to test if basic app works
 */
class UltraSimpleActivity : ComponentActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        android.util.Log.d("UltraSimple", "onCreate called")
        
        try {
            setContent {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF00D4FF))
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "✅ APP WORKS!\n\nNo Hilt version.\n\nIf you see this, the problem is with Hilt dependency injection.",
                        color = Color.White,
                        fontSize = 18.sp
                    )
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("UltraSimple", "Error: ${e.message}", e)
        }
    }
}

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

@Composable
fun RouteGeneratingLoadingScreen(
    distanceKm: Double,
    coachName: String
) {
    var subtitleIndex by remember { mutableIntStateOf(0) }
    val subtitles = listOf(
        "Analyzing terrain and finding the best routes",
        "Checking trail conditions and surfaces",
        "Calculating optimal elevation profiles",
        "Finding scenic paths and viewpoints",
        "Ensuring a balanced route difficulty"
    )
    
    LaunchedEffect(Unit) {
        while (true) {
            delay(3000)
            subtitleIndex = (subtitleIndex + 1) % subtitles.size
        }
    }
    
    val infiniteTransition = rememberInfiniteTransition(label = "")
    
    // AI pulse animation
    val aiScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = EaseInOutCubic),
            repeatMode = RepeatMode.Reverse
        ),
        label = ""
    )
    
    // Sparkle rotation
    val sparkleRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = ""
    )
    
    // Dots animation
    val dotsProgress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 3f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = ""
    )
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A1628)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            // Title
            Text(
                text = "CHOOSE YOUR ROUTE",
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            
            Text(
                text = "Select from 0 route options for your ${distanceKm.roundToInt()}km run",
                color = Color(0xFF8B9AA8),
                fontSize = 14.sp,
                modifier = Modifier.padding(bottom = 60.dp)
            )
            
            // AI + Sparkle Animation (replaced brain with AI sparkle icon)
            Box(
                modifier = Modifier.size(200.dp),
                contentAlignment = Alignment.Center
            ) {
                // Outer glow ring
                Box(
                    modifier = Modifier
                        .size(180.dp)
                        .scale(aiScale)
                        .clip(CircleShape)
                        .background(Color(0xFF0A4D5C).copy(alpha = 0.3f))
                )
                
                // Main AI circle with sparkle icon
                Box(
                    modifier = Modifier
                        .size(140.dp)
                        .scale(aiScale)
                        .clip(CircleShape)
                        .background(Color(0xFF0A4D5C)),
                    contentAlignment = Alignment.Center
                ) {
                    // AI Sparkle Icon (✨⚡💡) - using sparkle/lightning to represent AI thinking
                    Text("✨", fontSize = 64.sp)
                }
                
                // Rotating sparkle
                Box(
                    modifier = Modifier
                        .offset(y = (-70).dp)
                        .rotate(sparkleRotation)
                ) {
                    Text("⚡", fontSize = 32.sp)
                }
            }
            
            Spacer(Modifier.height(40.dp))
            
            // "Coach Carter is thinking..."
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "$coachName is thinking",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = ".".repeat(dotsProgress.toInt() + 1),
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.width(30.dp)
                )
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Subtitle with location icon
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("📍", fontSize = 18.sp)
                Spacer(Modifier.width(8.dp))
                Text(
                    text = subtitles[subtitleIndex],
                    color = Color(0xFF8B9AA8),
                    fontSize = 14.sp
                )
            }
            
            Spacer(Modifier.height(24.dp))
            
            // Animated dots
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                repeat(3) { index ->
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(
                                if (index <= dotsProgress.toInt()) Color(0xFF00E5FF)
                                else Color(0xFF2A3644)
                            )
                    )
                }
            }
        }
    }
}

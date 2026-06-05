package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

@Composable
fun RouteGeneratingLoadingScreen(
    distanceKm: Double,
    coachName: String = "AI Coach",
    error: String? = null,
    onRetry: (() -> Unit)? = null,
    onGoBack: (() -> Unit)? = null,
) {
    // Show error state if there's an error
    if (error != null) {
        RouteGenerationErrorScreen(
            error = error,
            onRetry = onRetry,
            onGoBack = onGoBack,
        )
        return
    }

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
                text = "GENERATING YOUR ROUTES",
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

@Composable
private fun RouteGenerationErrorScreen(
    error: String,
    onRetry: (() -> Unit)?,
    onGoBack: (() -> Unit)?,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A1628)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .padding(32.dp)
                .fillMaxWidth()
        ) {
            // Error icon
            Text(
                text = "😕",
                fontSize = 72.sp,
                modifier = Modifier.padding(bottom = 24.dp)
            )

            Text(
                text = "Couldn't Find a Route",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Error card
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFF1A2840))
                    .padding(20.dp)
            ) {
                Text(
                    text = error,
                    color = Color(0xFFB0BEC5),
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    lineHeight = 22.sp,
                )
            }

            Spacer(Modifier.height(12.dp))

            Text(
                text = "Try a different distance (e.g. 5km) or move to an area with more connected paths.",
                color = Color(0xFF546E7A),
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                lineHeight = 20.sp,
                modifier = Modifier.padding(horizontal = 8.dp)
            )

            Spacer(Modifier.height(32.dp))

            // Try Again button
            if (onRetry != null) {
                Button(
                    onClick = onRetry,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF00E5FF),
                        contentColor = Color(0xFF0A1628)
                    )
                ) {
                    Text(
                        text = "Try Again",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(Modifier.height(12.dp))
            }

            // Go Back button
            if (onGoBack != null) {
                OutlinedButton(
                    onClick = onGoBack,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Color(0xFF8B9AA8)
                    )
                ) {
                    Text(
                        text = "Change Distance",
                        fontSize = 16.sp
                    )
                }
            }
        }
    }
}

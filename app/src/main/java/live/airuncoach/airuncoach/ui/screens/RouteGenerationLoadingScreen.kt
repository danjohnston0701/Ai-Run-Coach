package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@Composable
fun RouteGenerationLoadingScreen(
    coachName: String = "Coach Carter",
    targetDistance: Float = 5f
) {
    // Pulsing animation for the AI brain icon
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )
    
    // Rotating animation for the progress ring
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )
    
    // Cycling status messages
    val statusMessages = listOf(
        "Analyzing terrain and finding the best routes",
        "Calculating optimal waypoints",
        "Evaluating route difficulty",
        "Checking elevation profiles",
        "Creating diverse circuit options"
    )
    
    var currentMessageIndex by remember { mutableStateOf(0) }
    
    LaunchedEffect(Unit) {
        while (true) {
            delay(2500)
            currentMessageIndex = (currentMessageIndex + 1) % statusMessages.size
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(Spacing.xl)
        ) {
            // Animated AI Brain Icon with rotating ring
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(200.dp)
            ) {
                // Rotating outer ring
                Box(
                    modifier = Modifier
                        .size(180.dp)
                        .rotate(rotation)
                        .border(
                            width = 3.dp,
                            brush = Brush.sweepGradient(
                                listOf(
                                    Colors.primary,
                                    Colors.primary.copy(alpha = 0.3f),
                                    Colors.primary,
                                )
                            ),
                            shape = CircleShape
                        )
                )
                
                // Pulsing AI Brain Circle
                Box(
                    modifier = Modifier
                        .size(140.dp)
                        .scale(scale)
                        .clip(CircleShape)
                        .background(
                            brush = Brush.radialGradient(
                                listOf(
                                    Colors.primary.copy(alpha = 0.3f),
                                    Colors.primary.copy(alpha = 0.1f)
                                )
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    // AI Brain Icon (using placeholder - replace with your brain icon)
                    Text(
                        text = "🧠",
                        style = AppTextStyles.h1.copy(fontSize = androidx.compose.ui.unit.TextUnit(60f, androidx.compose.ui.unit.TextUnitType.Sp)),
                        modifier = Modifier.scale(scale)
                    )
                }
                
                // Sparkle effect (top right)
                Text(
                    text = "✨",
                    style = AppTextStyles.h3,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 10.dp, y = (-10).dp)
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.xxl))
            
            // Coach name with thinking text
            Text(
                text = "$coachName is thinking...",
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Animated status message with location icon
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "📍",
                    style = AppTextStyles.body
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    text = statusMessages[currentMessageIndex],
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.widthIn(max = 280.dp)
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.xl))
            
            // Three-dot loading indicator
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                repeat(3) { index ->
                    val dotScale by infiniteTransition.animateFloat(
                        initialValue = 0.5f,
                        targetValue = 1f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(600, delayMillis = index * 200, easing = FastOutSlowInEasing),
                            repeatMode = RepeatMode.Reverse
                        ),
                        label = "dot$index"
                    )
                    
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .scale(dotScale)
                            .clip(CircleShape)
                            .background(Colors.primary)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.xxl))
            
            // Info text
            Text(
                text = "Generating ${targetDistance.toInt()}km route options for your ${targetDistance.toInt()}km run",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                textAlign = TextAlign.Center
            )
        }
    }
}

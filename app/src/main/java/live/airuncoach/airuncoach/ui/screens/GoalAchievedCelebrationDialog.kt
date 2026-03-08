package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.*
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Data class representing a single confetti particle
 */
data class ConfettiParticle(
    val x: Float,
    val y: Float,
    val color: Color,
    val size: Float,
    val rotation: Float,
    val rotationSpeed: Float,
    val velocityX: Float,
    val velocityY: Float,
    val shape: ConfettiShape
)

enum class ConfettiShape {
    RECTANGLE, CIRCLE, TRIANGLE
}

@Composable
fun GoalAchievedCelebrationDialog(
    goalTitle: String,
    goalType: String,
    runDistance: String,
    onKeepActive: () -> Unit,
    onMarkComplete: () -> Unit,
    onDismiss: () -> Unit
) {
    var showConfetti by remember { mutableStateOf(true) }
    var particles by remember { mutableStateOf<List<ConfettiParticle>>(emptyList()) }
    
    // Generate confetti particles
    LaunchedEffect(Unit) {
        particles = generateConfettiParticles(150)
        // Stop confetti after 3 seconds
        delay(3000)
        showConfetti = false
    }
    
    // Animation for particles falling
    val infiniteTransition = rememberInfiniteTransition(label = "confetti")
    val time by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "time"
    )
    
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.6f)),
            contentAlignment = Alignment.Center
        ) {
            // Confetti animation
            if (showConfetti) {
                ConfettiAnimation(
                    particles = particles,
                    modifier = Modifier.fillMaxSize()
                )
            }
            
            // Celebration card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.backgroundSecondary
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Trophy icon
                    Box(
                        modifier = Modifier
                            .size(80.dp)
                            .background(
                                color = Colors.primary.copy(alpha = 0.15f),
                                shape = RoundedCornerShape(40.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_trophy_vector),
                            contentDescription = "Goal Achieved",
                            tint = Colors.primary,
                            modifier = Modifier.size(48.dp)
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Title
                    Text(
                        text = "🎉 Goal Achieved! 🎉",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary,
                        textAlign = TextAlign.Center
                    )
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    // Goal name
                    Text(
                        text = goalTitle,
                        style = AppTextStyles.h4,
                        color = Colors.textPrimary,
                        textAlign = TextAlign.Center
                    )
                    
                    Spacer(modifier = Modifier.height(4.dp))
                    
                    // Goal type badge
                    Text(
                        text = getGoalTypeLabel(goalType),
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Run distance info
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Colors.backgroundTertiary)
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_map_pin_vector),
                            contentDescription = null,
                            tint = Colors.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Run: $runDistance",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    // Options
                    Text(
                        text = "What would you like to do?",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        textAlign = TextAlign.Center
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Keep Active Button
                    Button(
                        onClick = onKeepActive,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary.copy(alpha = 0.2f),
                            contentColor = Colors.primary
                        )
                    ) {
                        Text(
                            text = "Keep Goal Active",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    // Mark Complete Button
                    Button(
                        onClick = onMarkComplete,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        )
                    ) {
                        Text(
                            text = "Mark as Complete",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    // Dismiss Button
                    TextButton(onClick = onDismiss) {
                        Text(
                            text = "Maybe Later",
                            style = AppTextStyles.body,
                            color = Colors.textMuted
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ConfettiAnimation(
    particles: List<ConfettiParticle>,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "confetti")
    val animationProgress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "progress"
    )
    
    Canvas(modifier = modifier) {
        particles.forEach { particle ->
            val currentY = particle.y + (animationProgress * particle.velocityY * 500)
            val currentX = particle.x + sin(animationProgress * 3.14f * 2) * particle.velocityX * 50
            
            // Only draw particles that are within the screen
            if (currentY < size.height + 100 && currentY > -100) {
                rotate(
                    degrees = particle.rotation + (animationProgress * particle.rotationSpeed * 360),
                    pivot = Offset(currentX, currentY)
                ) {
                    when (particle.shape) {
                        ConfettiShape.RECTANGLE -> {
                            drawRect(
                                color = particle.color,
                                topLeft = Offset(currentX - particle.size / 2, currentY - particle.size / 2),
                                size = androidx.compose.ui.geometry.Size(particle.size, particle.size * 0.6f)
                            )
                        }
                        ConfettiShape.CIRCLE -> {
                            drawCircle(
                                color = particle.color,
                                radius = particle.size / 2,
                                center = Offset(currentX, currentY)
                            )
                        }
                        ConfettiShape.TRIANGLE -> {
                            val path = androidx.compose.ui.graphics.Path().apply {
                                moveTo(currentX, currentY - particle.size / 2)
                                lineTo(currentX - particle.size / 2, currentY + particle.size / 2)
                                lineTo(currentX + particle.size / 2, currentY + particle.size / 2)
                                close()
                            }
                            drawPath(path = path, color = particle.color)
                        }
                    }
                }
            }
        }
    }
}

private fun generateConfettiParticles(count: Int): List<ConfettiParticle> {
    val colors = listOf(
        Color(0xFF00D4FF), // Cyan
        Color(0xFF00FF85), // Green
        Color(0xFFFF006B), // Pink
        Color(0xFFFFB800), // Gold
        Color(0xFF9B59B6), // Purple
        Color(0xFFE74C3C), // Red
        Color(0xFF3498DB), // Blue
        Color(0xFF2ECC71)  // Emerald
    )
    
    val shapes = ConfettiShape.values()
    
    return List(count) {
        ConfettiParticle(
            x = Random.nextFloat() * 1000,
            y = Random.nextFloat() * -500 - 50,
            color = colors.random(),
            size = Random.nextFloat() * 15 + 8,
            rotation = Random.nextFloat() * 360,
            rotationSpeed = Random.nextFloat() * 2 - 1,
            velocityX = Random.nextFloat() * 2 - 1,
            velocityY = Random.nextFloat() * 0.5f + 0.3f,
            shape = shapes.random()
        )
    }
}
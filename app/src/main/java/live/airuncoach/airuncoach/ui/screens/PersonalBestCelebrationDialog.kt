package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import live.airuncoach.airuncoach.ui.theme.*

/**
 * Celebration dialog shown when the current run sets one or more personal bests.
 *
 * Design mirrors [GoalAchievedCelebrationDialog] — confetti overlay + card — but uses a
 * gold colour scheme and a medal emoji instead of a trophy icon to visually distinguish
 * the two celebration types.
 *
 * @param categories  List of PB category names, e.g. ["Fastest 1K", "5K"]
 * @param onDismiss   Called when the user taps "Nice one!" or dismisses the dialog.
 */
@Composable
fun PersonalBestCelebrationDialog(
    categories: List<String>,
    onDismiss: () -> Unit
) {
    var showConfetti by remember { mutableStateOf(true) }
    var particles by remember { mutableStateOf<List<ConfettiParticle>>(emptyList()) }

    LaunchedEffect(Unit) {
        particles = generatePersonalBestConfetti(150)
        delay(3500)
        showConfetti = false
    }

    // Pulse animation for the medal icon
    val pulseTransition = rememberInfiniteTransition(label = "pbPulse")
    val scale by pulseTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(700, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "medalScale"
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
                .background(Color.Black.copy(alpha = 0.65f)),
            contentAlignment = Alignment.Center
        ) {
            // Confetti overlay (reuses the existing ConfettiAnimation composable)
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
                    // Pulsing medal emoji
                    Box(
                        modifier = Modifier
                            .size(80.dp)
                            .scale(scale)
                            .background(
                                color = Color(0xFFFFB800).copy(alpha = 0.15f),
                                shape = RoundedCornerShape(40.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = "🏅", fontSize = 44.sp)
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "New Personal Best!",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Color(0xFFFFB800),   // gold
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = if (categories.size == 1)
                            "You set a new record in ${categories.first()}!"
                        else
                            "You set ${categories.size} new records!",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        textAlign = TextAlign.Center
                    )

                    if (categories.size > 1) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Colors.backgroundTertiary)
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            categories.forEach { cat ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text("⭐ ", fontSize = 14.sp)
                                    Text(
                                        text = cat,
                                        style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                        color = Colors.textPrimary
                                    )
                                }
                            }
                        }
                    } else {
                        // Single PB — show it as a badge
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color(0xFFFFB800).copy(alpha = 0.15f))
                                .padding(horizontal = 20.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("⭐ ", fontSize = 16.sp)
                            Text(
                                text = categories.first(),
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                color = Color(0xFFFFB800)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    Button(
                        onClick = onDismiss,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFFFB800),
                            contentColor = Color.Black
                        )
                    ) {
                        Text(
                            text = "Nice one! 🎉",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
            }
        }
    }
}

/** Gold + warm palette confetti for PB celebrations (distinct from goal's cyan palette). */
private fun generatePersonalBestConfetti(count: Int): List<ConfettiParticle> {
    val colors = listOf(
        Color(0xFFFFB800), // Gold
        Color(0xFFFFC832), // Light gold
        Color(0xFFFF8C00), // Amber
        Color(0xFFFFD700), // Yellow gold
        Color(0xFFFF6B35), // Orange
        Color(0xFFFFFFFF), // White sparkle
        Color(0xFFFFF0A0), // Pale gold
        Color(0xFF00D4FF), // Cyan accent
    )
    val shapes = ConfettiShape.entries.toTypedArray()
    return List(count) {
        ConfettiParticle(
            x = kotlin.random.Random.nextFloat() * 1000,
            y = kotlin.random.Random.nextFloat() * -500 - 50,
            color = colors.random(),
            size = kotlin.random.Random.nextFloat() * 14 + 8,
            rotation = kotlin.random.Random.nextFloat() * 360,
            rotationSpeed = kotlin.random.Random.nextFloat() * 2 - 1,
            velocityX = kotlin.random.Random.nextFloat() * 2 - 1,
            velocityY = kotlin.random.Random.nextFloat() * 0.5f + 0.3f,
            shape = shapes.random()
        )
    }
}

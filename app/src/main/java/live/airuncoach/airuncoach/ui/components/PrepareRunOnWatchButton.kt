package live.airuncoach.airuncoach.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * "Prepare for Watch" button — only rendered when the Garmin companion app
 * is confirmed installed on the paired watch.
 *
 * IDLE state renders as a full-width row button: watch icon left, "Prepare for Watch" text.
 * When isPrimary = true the background is filled teal (watch = primary action).
 * When isPrimary = false it uses a dark background with a teal outline (secondary).
 * SENDING state shows a pulsing "Sending to watch…" indicator.
 * SENT state shows a green "✓ Watch Ready" confirmation.
 */

enum class WatchSendState { IDLE, SENDING, SENT }

@Composable
fun PrepareRunOnWatchButton(
    companionInstalled: Boolean,
    sendState: WatchSendState,
    onPrepare: () -> Unit,
    modifier: Modifier = Modifier,
    isPrimary: Boolean = false
) {
    AnimatedVisibility(
        visible = companionInstalled,
        enter = fadeIn(tween(300)),
        exit  = fadeOut(tween(200)),
        modifier = modifier
    ) {
        when (sendState) {
            WatchSendState.IDLE -> {
                val teal = Color(0xFF00E5FF)
                if (isPrimary) {
                    // Filled teal — watch is the primary action
                    Button(
                        onClick = onPrepare,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = teal),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Watch,
                            contentDescription = null,
                            tint = Color(0xFF0A1628),
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            "Prepare for Watch",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0A1628)
                        )
                    }
                } else {
                    // Outlined / dark background — secondary
                    Button(
                        onClick = onPrepare,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0A1628)),
                        shape = RoundedCornerShape(16.dp),
                        border = androidx.compose.foundation.BorderStroke(1.5.dp, teal)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Watch,
                            contentDescription = null,
                            tint = teal,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            "Prepare for Watch",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = teal
                        )
                    }
                }
            }

            WatchSendState.SENDING -> {
                val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
                    initialValue = 0.4f,
                    targetValue  = 1f,
                    animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
                    label = "alpha"
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF0A1628))
                        .border(1.5.dp, Color(0xFF00E5FF).copy(alpha = pulse), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Sending…",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF00E5FF).copy(alpha = pulse)
                    )
                }
            }

            WatchSendState.SENT -> {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF0D2B1A))
                        .border(1.5.dp, Color(0xFF00FF88), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        Text("✓", fontSize = 16.sp, color = Color(0xFF00FF88), fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            "Ready",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF00FF88)
                        )
                    }
                }
            }
        }
    }
}

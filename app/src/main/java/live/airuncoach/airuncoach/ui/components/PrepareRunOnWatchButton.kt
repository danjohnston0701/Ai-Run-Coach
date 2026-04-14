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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.R

/**
 * "Prepare Run on Watch" button — only rendered when the Garmin companion app
 * is confirmed installed on the paired watch ([companionInstalled] = true).
 *
 * States:
 *  - idle      → cyan outlined button, watch icon, "Prepare Run on Watch"
 *  - sending   → pulsing "Sending to watch…" text
 *  - sent      → green "✓ Watch Ready — press START on watch"
 *
 * @param companionInstalled  from GarminWatchManager.isCompanionAppInstalled
 * @param onPrepare           called when user taps the button; caller sends the
 *                            payload and updates [sendState] accordingly
 * @param sendState           current send state driven by the caller
 */

enum class WatchSendState { IDLE, SENDING, SENT }

@Composable
fun PrepareRunOnWatchButton(
    companionInstalled: Boolean,
    sendState: WatchSendState,
    onPrepare: () -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = companionInstalled,
        enter = fadeIn(tween(300)),
        exit  = fadeOut(tween(200)),
        modifier = modifier
    ) {
        when (sendState) {
            WatchSendState.IDLE -> {
                Button(
                    onClick = onPrepare,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF0A1628)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(
                        1.5.dp, Color(0xFF00E5FF)
                    )
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_garmin_logo),
                        contentDescription = null,
                        tint = Color(0xFF00E5FF),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "Prepare Run on Watch",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF00E5FF)
                    )
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
                        .height(52.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF0A1628))
                        .border(1.5.dp, Color(0xFF00E5FF).copy(alpha = pulse), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Sending to watch…",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF00E5FF).copy(alpha = pulse)
                    )
                }
            }

            WatchSendState.SENT -> {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF0D2B1A))
                        .border(1.5.dp, Color(0xFF00FF88), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("✓", fontSize = 18.sp, color = Color(0xFF00FF88), fontWeight = FontWeight.Bold)
                        Text(
                            "Watch Ready — press START on watch",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF00FF88)
                        )
                    }
                }
            }
        }
    }
}

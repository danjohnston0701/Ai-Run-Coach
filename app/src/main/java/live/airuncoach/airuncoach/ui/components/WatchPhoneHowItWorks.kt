package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * The single explanation of how a watch and the phone work together, reused everywhere a runner
 * meets the watch (Garmin install prompt, Connected Devices, Useful Tips, onboarding tour) so the
 * message never drifts between screens:
 *
 *  - LIVE AI COACHING needs the phone: prepare on the phone, keep it with you, start on the
 *    watch. Coaching is generated and played by the phone (through its speaker or headphones);
 *    the watch shows metrics and relays controls but can't coach on its own.
 *  - WATCH ONLY is a genuine option, not a failure mode: the run records on the watch and syncs
 *    afterwards for the full post-run AI analysis — just without real-time coaching.
 *
 * Mirrors iOS WatchPhoneHowItWorks (HomeScreens.swift).
 */
@Composable
fun WatchPhoneHowItWorks(
    modifier: Modifier = Modifier,
    title: String = "How your watch and phone work together"
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(BorderRadius.md))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        Text(
            text = title,
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        HowItWorksOption(
            icon = Icons.Default.PhoneAndroid,
            accent = Colors.primary,
            heading = "Watch + phone: live AI coaching",
            steps = listOf(
                "Prepare your session on your phone",
                "Keep your phone with you for the whole session",
                "Press Start on your watch"
            ),
            footnote = "Coaching is created on your phone and plays through its speaker or your headphones — the watch can't coach on its own."
        )
        HowItWorksOption(
            icon = Icons.Default.Watch,
            accent = Colors.success,
            heading = "Watch only: full analysis afterwards",
            steps = listOf(
                "Leave your phone at home and press Start on your watch",
                "Your run syncs to AI Run Coach when you're back"
            ),
            footnote = "You get the full post-run AI analysis — just no real-time coaching during the session."
        )
    }
}

/**
 * Run Summary card for a session recorded on the watch without a prepared phone session. Leads
 * with what the runner DID get (the analysis on this screen), then how to get live coaching next
 * time — informative, not a telling-off.
 */
@Composable
fun WatchOnlyRunNotice(isWalk: Boolean, modifier: Modifier = Modifier) {
    val session = if (isWalk) "walk" else "run"
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(BorderRadius.md))
            .background(Colors.primary.copy(alpha = 0.08f))
            .border(1.dp, Colors.primary.copy(alpha = 0.35f), RoundedCornerShape(BorderRadius.md))
            .padding(Spacing.lg),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            imageVector = Icons.Default.Watch,
            contentDescription = null,
            tint = Colors.primary,
            modifier = Modifier.size(22.dp)
        )
        Spacer(Modifier.width(Spacing.md))
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Text(
                text = "Recorded on your watch",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Text(
                text = "This $session was recorded on your watch without a session prepared on your phone, so there was no live coaching during it — your full AI analysis is below.",
                style = AppTextStyles.small,
                color = Colors.textSecondary
            )
            Text(
                text = "For real-time AI coaching next time: prepare your session on your phone, keep your phone with you, then press Start on your watch.",
                style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary
            )
        }
    }
}

@Composable
private fun HowItWorksOption(
    icon: ImageVector,
    accent: Color,
    heading: String,
    steps: List<String>,
    footnote: String
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(imageVector = icon, contentDescription = null, tint = accent, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Spacing.sm))
            Text(
                text = heading,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                color = accent
            )
        }
        steps.forEachIndexed { i, step ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(accent.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = "${i + 1}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = accent)
                }
                Spacer(Modifier.width(Spacing.sm))
                Text(text = step, style = AppTextStyles.small, color = Colors.textPrimary)
            }
        }
        Spacer(Modifier.height(2.dp))
        Text(text = footnote, style = AppTextStyles.caption, color = Colors.textSecondary)
    }
}

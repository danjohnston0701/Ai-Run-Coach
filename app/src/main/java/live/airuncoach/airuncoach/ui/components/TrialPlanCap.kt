package live.airuncoach.airuncoach.ui.components

import android.os.Build
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.network.model.TrialCapInfo
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

// Free-trial plan cap (server/plan-trial-cap.ts): a plan made on the free trial has only its
// first few sessions unlocked; later sessions and the weeks not generated yet are shown greyed
// and blurred with a lock, and every tap on them goes to the subscription screen.

/** Greyed and blurred: the look of anything locked by the free-trial cap. Blur needs Android 12+. */
fun Modifier.trialLocked(): Modifier =
    this.alpha(0.45f).let { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) it.blur(5.dp) else it }

/** Small "Unlock with AI Plans" badge laid over locked content. */
@Composable
fun TrialLockBadge(text: String = "Unlock with AI Plans") {
    Surface(shape = RoundedCornerShape(50), color = Colors.backgroundRoot.copy(alpha = 0.9f),
        border = BorderStroke(1.dp, Colors.primary.copy(alpha = 0.5f))) {
        Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(painterResource(R.drawable.icon_lock), null, tint = Colors.primary, modifier = Modifier.size(12.dp))
            Spacer(Modifier.width(6.dp))
            Text(text, style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold), color = Colors.primary)
        }
    }
}

/**
 * Plan-screen banner while the plan is capped: how many free sessions are done, what the trial
 * includes, and the way to unlock the rest. Once the free sessions are done it says so plainly.
 */
@Composable
fun TrialPlanBanner(cap: TrialCapInfo, totalWeeks: Int, onUpgrade: () -> Unit) {
    val done = cap.freeSessionsCompleted.coerceAtMost(cap.freeSessions)
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.10f)),
        border = BorderStroke(1.dp, Colors.primary.copy(alpha = 0.35f)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(R.drawable.icon_lock), null, tint = Colors.primary, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(Spacing.sm))
                Text(
                    if (cap.allFreeSessionsDone) "You've finished your free sessions" else "Free trial plan",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary
                )
            }
            Spacer(Modifier.height(Spacing.sm))
            Text(
                if (cap.allFreeSessionsDone)
                    "Great start! Upgrade to a plan with AI Plans to keep going: the rest of your $totalWeeks-week plan is built around how these sessions went."
                else
                    "Your free trial includes the first ${cap.freeSessions} sessions of this plan. Upgrade to a plan with AI Plans to unlock all $totalWeeks weeks.",
                style = AppTextStyles.small, color = Colors.textSecondary
            )
            Spacer(Modifier.height(Spacing.md))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("$done of ${cap.freeSessions} free sessions done", style = AppTextStyles.small, color = Colors.textSecondary)
            }
            Spacer(Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = { done.toFloat() / cap.freeSessions.coerceAtLeast(1) },
                modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                color = Colors.primary, trackColor = Colors.backgroundTertiary
            )
            Spacer(Modifier.height(Spacing.md))
            Button(onClick = onUpgrade, modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)) {
                Text("Unlock your full plan", color = Colors.buttonText, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** A locked session row: the session greyed and blurred under a lock badge. Tapping it upgrades. */
@Composable
fun LockedSessionRow(onUpgrade: () -> Unit, content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Box(modifier = Modifier.fillMaxWidth().trialLocked()) { content() }
        // Covers the row so its own buttons (complete / skip) can't be pressed through the blur.
        Box(modifier = Modifier.matchParentSize().clickable { onUpgrade() })
        TrialLockBadge()
    }
}

/** A week that isn't generated yet: placeholder rows, greyed and blurred, with a lock. */
@Composable
fun LockedWeekPlaceholder(weekNumber: Int, onUpgrade: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onUpgrade() },
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Column(modifier = Modifier.fillMaxWidth().padding(Spacing.lg).trialLocked()) {
                Text("Week $weekNumber", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                Spacer(Modifier.height(Spacing.sm))
                // Shapes only: the week's sessions don't exist until the plan is unlocked.
                listOf(0.75f, 0.55f, 0.65f).forEach { width ->
                    Box(Modifier.fillMaxWidth(width).height(10.dp).clip(RoundedCornerShape(5.dp)).background(Colors.textMuted.copy(alpha = 0.5f)))
                    Spacer(Modifier.height(Spacing.sm))
                }
            }
            TrialLockBadge("Week $weekNumber · Unlocks with AI Plans")
        }
    }
}

/** Today's session is past the free ones: say so instead of offering to start it. */
@Composable
fun LockedTodayCard(onUpgrade: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onUpgrade() },
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(R.drawable.icon_lock), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(Spacing.md))
                Text("Today's session is locked", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            }
            Spacer(Modifier.height(Spacing.sm))
            Text("You've used the free sessions in your trial plan. Upgrade to a plan with AI Plans to carry on.",
                style = AppTextStyles.small, color = Colors.textSecondary)
            Spacer(Modifier.height(Spacing.md))
            Button(onClick = onUpgrade, modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)) {
                Text("Unlock your full plan", color = Colors.buttonText, fontWeight = FontWeight.Bold)
            }
        }
    }
}

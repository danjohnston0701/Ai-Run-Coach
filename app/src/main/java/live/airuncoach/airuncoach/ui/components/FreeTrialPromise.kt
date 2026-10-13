package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCardOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * Length of the free trial. Must match the server's FREE_TRIAL_DAYS (server/tier-limits.ts) —
 * the server sets users.trial_expires_at; this is only used for the marketing copy.
 */
const val FREE_TRIAL_DAYS = 30

/**
 * The "no credit card" free-trial promise — our biggest point of difference (most running
 * apps take a card up front and auto-charge if you forget to cancel). One component so the
 * wording is identical on the welcome screen, the tour and the plan screens.
 *
 * [compact] = a single-line pill for tight spots (under a CTA); otherwise a full card.
 */
@Composable
fun FreeTrialPromise(modifier: Modifier = Modifier, compact: Boolean = false) {
    if (compact) {
        Row(
            modifier = modifier
                .background(Colors.success.copy(alpha = 0.12f), RoundedCornerShape(BorderRadius.full))
                .border(BorderStroke(1.dp, Colors.success.copy(alpha = 0.4f)), RoundedCornerShape(BorderRadius.full))
                .padding(horizontal = Spacing.md, vertical = Spacing.xs + 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(Icons.Default.CreditCardOff, contentDescription = null, tint = Colors.success, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(Spacing.xs + 2.dp))
            Text(
                text = "$FREE_TRIAL_DAYS days free · No credit card · Nothing to cancel",
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Colors.success.copy(alpha = 0.08f), RoundedCornerShape(BorderRadius.md))
            .border(BorderStroke(1.dp, Colors.success.copy(alpha = 0.45f)), RoundedCornerShape(BorderRadius.md))
            .padding(Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.CreditCardOff, contentDescription = null, tint = Colors.success, modifier = Modifier.size(22.dp))
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text(
                text = "$FREE_TRIAL_DAYS days free. No credit card.",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
        }
        Spacer(modifier = Modifier.height(Spacing.md))
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.fillMaxWidth()) {
            PromiseLine("No card or payment details needed to start")
            PromiseLine("Nothing to cancel — you're never charged automatically when it ends")
            PromiseLine("Live AI coaching and post-run analysis from your very first run")
        }
        Spacer(modifier = Modifier.height(Spacing.md))
        Text(
            text = "Most running apps want your card up front and charge you if you forget to cancel. We don't.",
            style = AppTextStyles.caption,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun PromiseLine(text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(
            Icons.Default.CheckCircle,
            contentDescription = null,
            tint = Colors.success,
            modifier = Modifier.size(18.dp).padding(top = 1.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(text = text, style = AppTextStyles.small, color = Colors.textPrimary)
    }
}

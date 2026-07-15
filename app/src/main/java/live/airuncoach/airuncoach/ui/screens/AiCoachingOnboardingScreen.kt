package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.AiConsentManager
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * AI Coaching onboarding screen — shown in the new user onboarding flow
 * before the Coach Settings personality screen.
 *
 * Introduces what the AI coach does, discloses data usage clearly, and
 * gives the user an explicit opt-in choice. Consent is recorded via
 * AiConsentManager so that CoachSettingsViewModel picks up the correct
 * initial state when it loads.
 */
@Composable
fun AiCoachingOnboardingScreen(
    onEnableAndContinue: () -> Unit,
    onSkip: () -> Unit
) {
    val context = LocalContext.current
    val consentManager = AiConsentManager(context)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.xxxl)
            .padding(top = 56.dp, bottom = 120.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        // Icon
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(
                    Colors.primary.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(BorderRadius.full)
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_ai_vector),
                contentDescription = null,
                tint = Colors.primary,
                modifier = Modifier.size(36.dp)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.xxxl))

        Text(
            text = "Your AI Running Coach",
            style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.md))

        Text(
            text = "Your coach listens to your pace, heart rate, and effort in real time — and responds the way a real coach would.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.xxxl))

        // What the coach does
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
        ) {
            Column(modifier = Modifier.padding(Spacing.xl)) {
                Text(
                    text = "What your coach does",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )

                Spacer(modifier = Modifier.height(Spacing.lg))

                AiFeatureRow(
                    icon = R.drawable.icon_trending_vector,
                    title = "Real-time pace guidance",
                    description = "Keeps you on target — tells you when to ease off or push harder."
                )

                Spacer(modifier = Modifier.height(Spacing.md))

                AiFeatureRow(
                    icon = R.drawable.icon_heart_vector,
                    title = "Heart rate and effort coaching",
                    description = "Monitors your zones and warns you before you redline."
                )

                Spacer(modifier = Modifier.height(Spacing.md))

                AiFeatureRow(
                    icon = R.drawable.icon_timer_vector,
                    title = "Km splits and milestones",
                    description = "Regular updates on your progress, pacing, and what's coming next."
                )

                Spacer(modifier = Modifier.height(Spacing.md))

                AiFeatureRow(
                    icon = R.drawable.icon_ai_vector,
                    title = "Adaptive session plans",
                    description = "Your training plan evolves based on how your runs actually go."
                )
            }
        }

        Spacer(modifier = Modifier.height(Spacing.xl))

        // Data disclosure — brief and honest
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(BorderRadius.md),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
        ) {
            Column(modifier = Modifier.padding(Spacing.lg)) {
                Text(
                    text = "Data & privacy",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
                Text(
                    text = "Real-time coaching uses OpenAI. Your pace, heart rate, and session data are shared with OpenAI to generate coaching. No personal identifiers are ever included. OpenAI does not retain this data after processing. You can disable AI coaching at any time in settings.",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
        }

        Spacer(modifier = Modifier.height(Spacing.xxxl))

        // Primary CTA
        Button(
            onClick = {
                consentManager.setConsent(granted = true)
                onEnableAndContinue()
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
        ) {
            Text(
                text = "Enable AI Coaching",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.lg))

        // Secondary — skip
        TextButton(
            onClick = {
                consentManager.setConsent(granted = false)
                onSkip()
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "Continue without AI coaching",
                style = AppTextStyles.body,
                color = Colors.textMuted
            )
        }
    }
}

@Composable
private fun AiFeatureRow(
    icon: Int,
    title: String,
    description: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            painter = painterResource(id = icon),
            contentDescription = null,
            tint = Colors.primary,
            modifier = Modifier
                .size(20.dp)
                .padding(top = 2.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary
            )
            Text(
                text = description,
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
        }
    }
}

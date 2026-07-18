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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * Onboarding introduction screen — the first step after location permissions for new users.
 *
 * Sets clear expectations about what the setup process involves, why we collect the
 * information we do, and how it is used. No surprises downstream.
 *
 * Deliberately simple — no animations, no emoji, no marketing copy.
 */
@Composable
fun OnboardingIntroScreen(
    onGetStarted: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.xxxl)
            .navigationBarsPadding()
            .padding(top = 32.dp, bottom = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        Text(
            text = "Let's get you set up",
            style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.md))

        Text(
            text = "We'll ask you a few questions so your training plan and AI coach are built around you — not a generic template.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.xxxl))

        // Setup steps overview
        OnboardingStep(
            number = "1",
            title = "Personal details",
            description = "Some basic info about you to help your AI coach know you better."
        )

        Spacer(modifier = Modifier.height(Spacing.lg))

        OnboardingStep(
            number = "2",
            title = "Fitness Level",
            description = "Your current fitness level — so we can start you in the right place."
        )

        Spacer(modifier = Modifier.height(Spacing.lg))

        OnboardingStep(
            number = "3",
            title = "AI coach preferences",
            description = "Name, voice, and coaching style — your coach, your way."
        )

        Spacer(modifier = Modifier.height(Spacing.lg))

        OnboardingStep(
            number = "4",
            title = "In-run coaching",
            description = "Choose which real-time coaching features are active during your runs."
        )

        Spacer(modifier = Modifier.height(Spacing.xxxl))

        // Privacy note
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(BorderRadius.md),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
        ) {
            Text(
                text = "Your data is used only to personalise your training. It is never sold or shared with third parties for marketing.",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(Spacing.lg)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.xxxl))

        Button(
            onClick = onGetStarted,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
        ) {
            Text(
                text = "Get Started",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
            )
        }
    }
}

@Composable
private fun OnboardingStep(
    number: String,
    title: String,
    description: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        // Step number badge
        Box(
            modifier = Modifier
                .size(32.dp)
                .background(
                    Colors.primary.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(BorderRadius.full)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = number,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                color = Colors.primary
            )
        }

        Spacer(modifier = Modifier.width(Spacing.lg))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = description,
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
        }
    }
}

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
 * AI Coaching Consent screen — shown once per install in the auth flow.
 *
 * Discloses what data is shared, who receives it, and the zero-retention policy.
 * The user must make an explicit choice before reaching the main app.
 * There is no path to skip this screen.
 */
@Composable
fun AiConsentScreen(
    onConsentDecided: (granted: Boolean) -> Unit
) {
    val context = LocalContext.current
    val consentManager = AiConsentManager(context)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.xxxl)
            .padding(top = 48.dp, bottom = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Icon
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(Colors.primary.copy(alpha = 0.15f), shape = RoundedCornerShape(BorderRadius.full)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_ai_vector),
                contentDescription = "AI Coaching",
                tint = Colors.primary,
                modifier = Modifier.size(36.dp)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.xl))

        Text(
            text = "AI Coaching Consent",
            style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.md))

        Text(
            text = "AI Run Coach uses OpenAI to generate personalised coaching during and after your runs. Before we proceed, we need your explicit consent to share workout data.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.xl))

        // Disclosure card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
        ) {
            Column(modifier = Modifier.padding(Spacing.xl)) {
                Text(
                    text = "What data is shared",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.md))

                ConsentDataRow(icon = R.drawable.icon_trending_vector, text = "Pace, heart rate, and cadence")
                ConsentDataRow(icon = R.drawable.icon_location_vector, text = "Elevation and route data")
                ConsentDataRow(icon = R.drawable.icon_timer_vector, text = "Activity history and session details")

                Spacer(modifier = Modifier.height(Spacing.lg))

                HorizontalDivider(color = Colors.border.copy(alpha = 0.5f))

                Spacer(modifier = Modifier.height(Spacing.lg))

                Text(
                    text = "Who receives it",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
                Text(
                    text = "OpenAI — used solely for generating your coaching analysis.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )

                Spacer(modifier = Modifier.height(Spacing.lg))

                HorizontalDivider(color = Colors.border.copy(alpha = 0.5f))

                Spacer(modifier = Modifier.height(Spacing.lg))

                Text(
                    text = "Privacy guarantees",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.md))

                ConsentGuaranteeRow(text = "No personal identifiers (name, email, or account details) are ever shared")
                Spacer(modifier = Modifier.height(Spacing.sm))
                ConsentGuaranteeRow(text = "Zero-retention policy — data is not stored by OpenAI after processing")
                Spacer(modifier = Modifier.height(Spacing.sm))
                ConsentGuaranteeRow(text = "You can disable AI coaching at any time in Coach Settings")
            }
        }

        Spacer(modifier = Modifier.height(Spacing.xxxxl))

        // Allow button
        Button(
            onClick = {
                consentManager.setConsent(granted = true)
                onConsentDecided(true)
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(Spacing.buttonHeight),
            shape = RoundedCornerShape(BorderRadius.full),
            colors = ButtonDefaults.buttonColors(
                containerColor = Colors.primary,
                contentColor = Colors.buttonText
            )
        ) {
            Text(
                text = "Allow AI Coaching",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.md))

        // Decline button — always visible, no way to skip
        OutlinedButton(
            onClick = {
                consentManager.setConsent(granted = false)
                onConsentDecided(false)
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(Spacing.buttonHeight),
            shape = RoundedCornerShape(BorderRadius.full),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textSecondary),
            border = androidx.compose.foundation.BorderStroke(1.dp, Colors.border)
        ) {
            Text(
                text = "Not Now — Disable AI Coaching",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium)
            )
        }
    }
}

/**
 * Reusable composable for the consent bottom sheet — shown inline when the user
 * tries to enable AI coaching (coach settings, plan generation) without prior consent.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiConsentBottomSheet(
    onAllow: () -> Unit,
    onDecline: () -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Colors.backgroundSecondary,
        shape = RoundedCornerShape(topStart = BorderRadius.xl, topEnd = BorderRadius.xl)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.xl)
                .padding(bottom = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(Colors.primary.copy(alpha = 0.15f), shape = RoundedCornerShape(BorderRadius.full)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_ai_vector),
                    contentDescription = "AI Coaching",
                    tint = Colors.primary,
                    modifier = Modifier.size(28.dp)
                )
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            Text(
                text = "Enable AI Coaching?",
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(Spacing.sm))

            Text(
                text = "AI coaching sends your workout data (pace, heart rate, cadence, elevation) to OpenAI for analysis. No personal identifiers are shared and data is not retained after processing.",
                style = AppTextStyles.body,
                color = Colors.textSecondary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(Spacing.xl))

            Button(
                onClick = onAllow,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.buttonHeight),
                shape = RoundedCornerShape(BorderRadius.full),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                )
            ) {
                Text("Allow AI Coaching", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            TextButton(
                onClick = onDecline,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    "Not Now",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                    color = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
private fun ConsentDataRow(icon: Int, text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painter = painterResource(id = icon),
            contentDescription = null,
            tint = Colors.primary,
            modifier = Modifier.size(18.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.md))
        Text(text = text, style = AppTextStyles.body, color = Colors.textPrimary)
    }
}

@Composable
private fun ConsentGuaranteeRow(text: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_check_vector),
            contentDescription = null,
            tint = Colors.success,
            modifier = Modifier
                .size(18.dp)
                .padding(top = 2.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.md))
        Text(
            text = text,
            style = AppTextStyles.body,
            color = Colors.textSecondary
        )
    }
}

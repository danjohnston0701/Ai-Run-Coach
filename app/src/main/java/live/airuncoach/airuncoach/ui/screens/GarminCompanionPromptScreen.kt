package live.airuncoach.airuncoach.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@Composable
fun GarminCompanionPromptScreen(
    onDismiss: () -> Unit,
    onInstall: () -> Unit,
    onMaybeLater: () -> Unit
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(Spacing.lg)
            .verticalScroll(scrollState),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Close button
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            IconButton(onClick = onDismiss) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Close",
                    tint = Colors.textSecondary
                )
            }
        }

        Spacer(modifier = Modifier.height(Spacing.md))

        // Watch icon/image
        Icon(
            painter = painterResource(id = R.drawable.icon_timer_vector),
            contentDescription = "Garmin Watch",
            tint = Colors.primary,
            modifier = Modifier.size(80.dp)
        )

        Spacer(modifier = Modifier.height(Spacing.lg))

        // Title
        Text(
            text = "Get AI Coaching on Your Garmin Watch!",
            style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.sm))

        // Subtitle
        Text(
            text = "Install our companion app on your watch for the ultimate running experience",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.xl))

        // Benefits section
        Text(
            text = "What You'll Get:",
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )

        Spacer(modifier = Modifier.height(Spacing.md))

        // Benefit cards
        BenefitCard(
            icon = "💓",
            title = "Real-Time Heart Rate",
            description = "Live HR monitoring with zone alerts directly on your watch"
        )

        Spacer(modifier = Modifier.height(Spacing.sm))

        BenefitCard(
            icon = "🗣️",
            title = "AI Coaching on Watch",
            description = "Get personalized audio and text coaching without looking at your phone"
        )

        Spacer(modifier = Modifier.height(Spacing.sm))

        BenefitCard(
            icon = "📊",
            title = "Advanced Running Metrics",
            description = "Cadence, stride length, ground contact time, vertical oscillation & more"
        )

        Spacer(modifier = Modifier.height(Spacing.sm))

        BenefitCard(
            icon = "🎯",
            title = "Single Activity",
            description = "No need to run both apps - watch and phone sync automatically"
        )

        Spacer(modifier = Modifier.height(Spacing.sm))

        BenefitCard(
            icon = "⚡",
            title = "Running Power",
            description = "See your running power output in real-time (if watch supports it)"
        )

        Spacer(modifier = Modifier.height(Spacing.xl))

        // Data comparison
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = Colors.backgroundSecondary
            ),
            shape = RoundedCornerShape(BorderRadius.md)
        ) {
            Column(
                modifier = Modifier.padding(Spacing.md)
            ) {
                Text(
                    text = "Data You'll Stream:",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                
                Spacer(modifier = Modifier.height(Spacing.sm))

                DataComparisonRow("Without Companion", "With Companion")
                Spacer(modifier = Modifier.height(Spacing.xs))
                HorizontalDivider(color = Colors.backgroundTertiary)
                Spacer(modifier = Modifier.height(Spacing.xs))
                
                DataItemRow("Heart Rate", hasBasic = false, hasAdvanced = true)
                DataItemRow("GPS Location", hasBasic = false, hasAdvanced = true)
                DataItemRow("Cadence", hasBasic = false, hasAdvanced = true)
                DataItemRow("Pace & Speed", hasBasic = false, hasAdvanced = true)
                DataItemRow("Elevation", hasBasic = false, hasAdvanced = true)
                DataItemRow("Running Dynamics", hasBasic = false, hasAdvanced = true)
                DataItemRow("Running Power", hasBasic = false, hasAdvanced = true)
            }
        }

        Spacer(modifier = Modifier.height(Spacing.xl))

        // Install button
        Button(
            onClick = {
                onInstall()
                // Open Connect IQ Store
                val connectIQUrl = "https://apps.garmin.com/en-US/apps/YOUR_APP_ID"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(connectIQUrl))
                context.startActivity(intent)
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = ButtonDefaults.buttonColors(
                containerColor = Colors.primary,
                contentColor = Colors.buttonText
            )
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_timer_vector),
                contentDescription = null,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text(
                "Install on Garmin Watch",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.md))

        // Maybe later button
        TextButton(
            onClick = onMaybeLater,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                "Maybe Later",
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
        }

        Spacer(modifier = Modifier.height(Spacing.lg))
    }
}

@Composable
private fun BenefitCard(
    icon: String,
    title: String,
    description: String
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        shape = RoundedCornerShape(BorderRadius.md)
    ) {
        Row(
            modifier = Modifier.padding(Spacing.md),
            verticalAlignment = Alignment.Top
        ) {
            Text(
                text = icon,
                style = AppTextStyles.h2,
                modifier = Modifier.padding(end = Spacing.md)
            )
            Column {
                Text(
                    text = title,
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.xs))
                Text(
                    text = description,
                    style = AppTextStyles.small,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
private fun DataComparisonRow(basic: String, advanced: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = basic,
            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
            color = Colors.textSecondary,
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center
        )
        Text(
            text = advanced,
            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
            color = Colors.primary,
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun DataItemRow(
    name: String,
    hasBasic: Boolean,
    hasAdvanced: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = name,
            style = AppTextStyles.small,
            color = Colors.textPrimary,
            modifier = Modifier.weight(1.5f)
        )
        
        Icon(
            imageVector = if (hasBasic) Icons.Default.Check else Icons.Default.Close,
            contentDescription = null,
            tint = if (hasBasic) Colors.success else Colors.textMuted,
            modifier = Modifier
                .weight(1f)
                .size(16.dp)
        )
        
        Icon(
            imageVector = if (hasAdvanced) Icons.Default.Check else Icons.Default.Close,
            contentDescription = null,
            tint = if (hasAdvanced) Colors.success else Colors.textMuted,
            modifier = Modifier
                .weight(1f)
                .size(16.dp)
        )
    }
}

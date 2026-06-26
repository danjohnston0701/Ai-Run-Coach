package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Feature Limit Upsell Screen
 *
 * Shown when a user tries to access a feature but has reached their usage limit.
 * Instead of showing a form and then an error, we check limits upfront and show
 * this elegant upsell screen with clear upgrade path.
 *
 * Reusable for all features: AI Plans, Run Routes, Post-Run Analysis, etc.
 */
@Composable
fun FeatureLimitUpsellScreen(
    featureName: String,                    // "AI Plan Generation", "Run Route Creation"
    message: String,                        // "You've reached your monthly limit..."
    usedCount: Int,                         // 5 (plans used)
    limitCount: Int,                        // 5 (max allowed)
    onUpgradeClick: () -> Unit,
    onPromoCodeClick: () -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier,
    featureEmoji: String = "🔒",            // 📋, 🗺️, 📊, etc.
    nextRenewalDate: LocalDate? = null,     // When subscription renews
    renewalLabel: String = "Your plan resets on:"
) {
    Box(
        modifier = modifier
            .fillMaxSize()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
        ) {
        // ── Header with Back Button ──────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBackClick) {
                Text(
                    "< Back",
                    style = AppTextStyles.body,
                    color = Colors.primary
                )
            }
        }

        // ── Main Content ────────────────────────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = Spacing.lg),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth()
            ) {
                // Large Lock Icon
                Text(
                    featureEmoji,
                    fontSize = 72.sp,
                    modifier = Modifier.padding(bottom = Spacing.md)
                )

                // Lock Badge
                Card(
                    modifier = Modifier.size(80.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Colors.error.copy(alpha = 0.15f)
                    ),
                    shape = RoundedCornerShape(50)
                ) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = "Locked",
                            tint = Colors.error,
                            modifier = Modifier.size(40.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.xl))

                // Feature Name
                Text(
                    featureName,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = Colors.textPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(bottom = Spacing.md)
                )

                // Main Message
                Text(
                    message,
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(bottom = Spacing.lg)
                )

                // Usage Stats Card
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = Spacing.md),
                    colors = CardDefaults.cardColors(
                        containerColor = Colors.backgroundSecondary
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(Spacing.md),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Usage progress
                        LinearProgressIndicator(
                            progress = { 1f },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp)),
                            color = Colors.error,
                            trackColor = Colors.error.copy(alpha = 0.2f),
                        )

                        Spacer(modifier = Modifier.height(Spacing.md))

                        // Usage text
                        Text(
                            "$usedCount of $limitCount $featureName${if (limitCount != 1) "s" else ""} used",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                            color = Colors.textPrimary,
                            textAlign = TextAlign.Center
                        )

                        // Renewal date (if available)
                        if (nextRenewalDate != null) {
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text(
                                renewalLabel,
                                style = AppTextStyles.small,
                                color = Colors.textSecondary,
                                textAlign = TextAlign.Center
                            )
                            Text(
                                nextRenewalDate.format(
                                    DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy")
                                ),
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.primary,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.lg))

                // Info Box
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = Colors.primary.copy(alpha = 0.1f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        "💡 Upgrade to access unlimited $featureName and other premium features",
                        style = AppTextStyles.small,
                        color = Colors.textPrimary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(Spacing.md)
                    )
                }
            }
        }

        // ── Action Buttons ──────────────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg)
                .padding(bottom = Spacing.xl),
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            // Primary: Upgrade Button
            Button(
                onClick = onUpgradeClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    "Upgrade Subscription",
                    style = AppTextStyles.body.copy(
                        color = Colors.buttonText,
                        fontWeight = FontWeight.SemiBold
                    )
                )
            }

            // Secondary: Promo Code Button
            OutlinedButton(
                onClick = onPromoCodeClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Colors.primary
                ),
                border = ButtonDefaults.outlinedButtonBorder,
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    "Have a Promo Code?",
                    style = AppTextStyles.body.copy(
                        color = Colors.primary,
                        fontWeight = FontWeight.SemiBold
                    )
                )
            }

            // Divider
            Spacer(modifier = Modifier.height(Spacing.sm))
            HorizontalDivider(color = Colors.backgroundSecondary)
            Spacer(modifier = Modifier.height(Spacing.sm))

            // Info text
            Text(
                "Upgrade now to start creating unlimited plans and accessing premium features. Your current plan renews automatically every month.",
                style = AppTextStyles.small,
                color = Colors.textSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = Spacing.sm)
            )
        }
        }
    }
}

/**
 * Preview of the Feature Limit Upsell Screen
 */
@Suppress("UnusedMaterialScaffoldPaddingParameter")
@Composable
fun FeatureLimitUpsellScreenPreview() {
    FeatureLimitUpsellScreen(
        featureName = "AI Plan Generation",
        featureEmoji = "📋",
        message = "You've reached your monthly limit for AI-powered training plans.",
        usedCount = 5,
        limitCount = 5,
        nextRenewalDate = LocalDate.now().plusDays(25),
        onUpgradeClick = { },
        onPromoCodeClick = { },
        onBackClick = { }
    )
}

// ── Variations for Different Features ────────────────────────────────────────

/**
 * Feature Limit Upsell for AI Plan Generation
 */
@Composable
fun AiPlanLimitUpsellScreen(
    nextRenewalDate: LocalDate? = null,
    usedCount: Int = 5,
    limitCount: Int = 5,
    onUpgradeClick: () -> Unit = { },
    onPromoCodeClick: () -> Unit = { },
    onBackClick: () -> Unit = { }
) {
    FeatureLimitUpsellScreen(
        featureName = "AI Plan Generation",
        featureEmoji = "📋",
        message = "You've reached your monthly limit for AI-powered training plans.",
        usedCount = usedCount,
        limitCount = limitCount,
        nextRenewalDate = nextRenewalDate,
        onUpgradeClick = onUpgradeClick,
        onPromoCodeClick = onPromoCodeClick,
        onBackClick = onBackClick
    )
}

/**
 * Feature Limit Upsell for Run Route Creation
 */
@Composable
fun RunRouteLimitUpsellScreen(
    nextRenewalDate: LocalDate? = null,
    usedCount: Int = 10,
    limitCount: Int = 10,
    onUpgradeClick: () -> Unit = { },
    onPromoCodeClick: () -> Unit = { },
    onBackClick: () -> Unit = { }
) {
    FeatureLimitUpsellScreen(
        featureName = "Run Route Creation",
        featureEmoji = "🗺️",
        message = "You've reached your monthly limit for creating custom run routes.",
        usedCount = usedCount,
        limitCount = limitCount,
        nextRenewalDate = nextRenewalDate,
        onUpgradeClick = onUpgradeClick,
        onPromoCodeClick = onPromoCodeClick,
        onBackClick = onBackClick
    )
}

// ── Trial Expired Hard Wall ───────────────────────────────────────────────────

/**
 * Full-screen paywall shown when the user's 14-day free trial has expired.
 *
 * This screen is presented as a non-dismissible overlay over the entire app.
 * The user CANNOT start a run, view history, or use any feature until they
 * either upgrade to a paid plan or sign out.  It has no Back button.
 */
@Composable
fun TrialExpiredWallScreen(
    onUpgradeClick: () -> Unit,
    onSignOutClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
        ) {
            // ── Main Content ────────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = Spacing.lg),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Spacer(modifier = Modifier.height(Spacing.xxxl))

                    // Icon
                    Text("🏃", fontSize = 72.sp, modifier = Modifier.padding(bottom = Spacing.md))

                    // Lock badge
                    Card(
                        modifier = Modifier.size(80.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = Colors.error.copy(alpha = 0.15f)
                        ),
                        shape = RoundedCornerShape(50)
                    ) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Lock,
                                contentDescription = "Trial Expired",
                                tint = Colors.error,
                                modifier = Modifier.size(40.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(Spacing.xl))

                    Text(
                        "Your Free Trial Has Ended",
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = Spacing.md)
                    )

                    Text(
                        "You've had 14 days to experience the power of AI Run Coach. " +
                        "Upgrade now to unlock unlimited AI coaching, post-run analysis, routes and training plans.",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = Spacing.lg)
                    )

                    // Feature summary card
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = Spacing.md),
                        colors = CardDefaults.cardColors(
                            containerColor = Colors.backgroundSecondary
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(Spacing.md),
                            verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                        ) {
                            TrialFeatureHighlight("🎙️", "Real-time AI coaching while you run")
                            TrialFeatureHighlight("📊", "Detailed AI post-run analysis")
                            TrialFeatureHighlight("🗺️", "AI-generated personalised routes")
                            TrialFeatureHighlight("📋", "Custom AI training plans")
                            TrialFeatureHighlight("💪", "Heart rate, cadence & pace coaching")
                        }
                    }
                }
            }

            // ── Action Buttons ──────────────────────────────────────────────
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg)
                    .padding(bottom = Spacing.xl),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Button(
                    onClick = onUpgradeClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        "Upgrade to Continue",
                        style = AppTextStyles.body.copy(
                            color = Colors.buttonText,
                            fontWeight = FontWeight.Bold
                        )
                    )
                }

                OutlinedButton(
                    onClick = onSignOutClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textSecondary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        "Sign Out",
                        style = AppTextStyles.body.copy(color = Colors.textSecondary)
                    )
                }

                Text(
                    "Starting from \$7.99/month. Cancel any time.",
                    style = AppTextStyles.small,
                    color = Colors.textMuted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.sm)
                )
            }
        }
    }
}

@Composable
private fun TrialFeatureHighlight(emoji: String, text: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(emoji, fontSize = 18.sp)
        Text(text, style = AppTextStyles.body, color = Colors.textPrimary)
    }
}

/**
 * Feature Limit Upsell for Post-Run Analysis
 */
@Composable
fun PostRunAnalysisLimitUpsellScreen(
    nextRenewalDate: LocalDate? = null,
    usedCount: Int = 20,
    limitCount: Int = 20,
    onUpgradeClick: () -> Unit = { },
    onPromoCodeClick: () -> Unit = { },
    onBackClick: () -> Unit = { }
) {
    FeatureLimitUpsellScreen(
        featureName = "Post-Run Analysis",
        featureEmoji = "📊",
        message = "You've reached your monthly limit for AI-powered post-run analysis.",
        usedCount = usedCount,
        limitCount = limitCount,
        nextRenewalDate = nextRenewalDate,
        onUpgradeClick = onUpgradeClick,
        onPromoCodeClick = onPromoCodeClick,
        onBackClick = onBackClick
    )
}

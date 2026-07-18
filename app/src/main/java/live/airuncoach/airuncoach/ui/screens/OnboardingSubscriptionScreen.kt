package live.airuncoach.airuncoach.ui.screens

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModel

/**
 * Onboarding-specific subscription screen shown after AI Coach Settings.
 * Explains the free trial clearly and offers the same localized Google Play plans
 * as the subscription screen.
 * Users can dismiss to continue to the app with trial access.
 */
@Composable
fun OnboardingSubscriptionScreen(
    viewModel: SubscriptionViewModel = hiltViewModel(),
    onNavigateToPermissions: () -> Unit = {}
) {
    val subscriptions by viewModel.subscriptions.collectAsState()
    val billingConnectionState by viewModel.billingConnectionState.collectAsState()
    val context = LocalContext.current
    val activity = context as? Activity
    val sessionManager = remember { SessionManager(context) }
    val userCurrency by viewModel.userCurrency.collectAsState()
    val pricingData by viewModel.pricingData.collectAsState()
    
    var isAnnual by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        // Warm welcome header — avoid implying the trial has already counted down.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Colors.backgroundSecondary)
                .padding(vertical = Spacing.xxxl)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Your Ai Run Coach trial starts here",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Colors.textPrimary,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    text = "Experience smarter runs, meaningful insights, and realtime feedback as you run.",
                    fontSize = 14.sp,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center
                )
            }
        }

        // Main content
        if (billingConnectionState) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Colors.backgroundRoot),
                contentPadding = PaddingValues(vertical = Spacing.lg)
            ) {
                // Trial limitations banner
                item {
                    TrialWelcomeCard()
                }

                // Features during trial
                item {
                    FeaturesAvailableDuringTrial()
                }

                // What's available in paid plans
                item {
                    WhatsIncludedInPaidPlans()
                }

                // Plan selection - show both Lite and Standard
                item {
                    Text(
                        text = "Choose Your Plan",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                    )
                }

                // Billing period toggle
                item {
                    OnboardingBillingPeriodToggle(isAnnual = isAnnual, onToggle = { isAnnual = it })
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }

                // Lite Plan
                item {
                    OnboardingPlanCard(
                        plan = PlanData.LITE.localizedFor(
                            currency = userCurrency,
                            pricing = pricingData,
                            monthlyTier = pricingData?.liteMonthly,
                            annualTier = pricingData?.liteAnnual
                        ),
                        isAnnual = isAnnual,
                        onUpgradeClick = {
                            activity?.let {
                                val productId = if (isAnnual) "lite_annual" else "lite_monthly"
                                val liteProduct = subscriptions.find { sub -> sub.productId == productId }
                                if (liteProduct != null) {
                                    viewModel.purchaseSubscription(it, liteProduct)
                                }
                            }
                        }
                    )
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }

                // Standard Plan - Recommended
                item {
                    OnboardingPlanCard(
                        plan = PlanData.STANDARD.localizedFor(
                            currency = userCurrency,
                            pricing = pricingData,
                            monthlyTier = pricingData?.standardMonthly,
                            annualTier = pricingData?.standardAnnual
                        ),
                        isPopular = true,
                        isAnnual = isAnnual,
                        onUpgradeClick = {
                            activity?.let {
                                val productId = if (isAnnual) "standard_annual" else "standard_monthly"
                                val standardProduct = subscriptions.find { sub -> sub.productId == productId }
                                if (standardProduct != null) {
                                    viewModel.purchaseSubscription(it, standardProduct)
                                }
                            }
                        }
                    )
                    Spacer(modifier = Modifier.height(Spacing.xxl))
                }

                // Continue with trial button
                item {
                    Button(
                        onClick = {
                            sessionManager.clearOnboardingFlags()
                        onNavigateToPermissions()
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                            .padding(horizontal = Spacing.lg),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.backgroundSecondary,
                            contentColor = Colors.textPrimary
                        ),
                        shape = RoundedCornerShape(BorderRadius.lg)
                    ) {
                        Text(
                            "Continue with Free Trial",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 16.sp
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.md))
                }

                // Footnotes
                item {
                    Text(
                        text = "You can upgrade anytime. No credit card commitment needed.",
                        fontSize = 12.sp,
                        color = Colors.textMuted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = Spacing.lg)
                    )
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }

                item {
                    Text(
                        text = "Prices shown in $userCurrency. Subscriptions renew automatically and can be cancelled in Google Play.",
                        fontSize = 12.sp,
                        color = Colors.textMuted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = Spacing.lg, vertical = Spacing.lg)
                    )
                    Spacer(modifier = Modifier.height(Spacing.xxxl))
                }
            }
        } else {
            // Loading state
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Colors.backgroundDefault),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Colors.primary)
            }
        }
    }
}

/**
 * Prominent banner showing trial limitations
 */
@Composable
private fun TrialWelcomeCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(bottom = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                verticalAlignment = Alignment.Top
            ) {
                Text("✨", fontSize = 24.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Explore the full power of your AI coach",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    Text(
                        text = "Your trial includes:",
                        fontSize = 13.sp,
                        color = Colors.textSecondary
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            FeatureItem("15 km of realtime AI coaching and run insights")
            FeatureItem("3 post-run AI summaries")
            FeatureItem("Garmin watch compatibility for enhanced insights and reporting")
        }
    }
}

/**
 * Shows what features are available during the trial
 */
@Composable
private fun FeaturesAvailableDuringTrial() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(bottom = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            Text(
                text = "✅ What You Can Do During Trial",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            FeatureItem("Record and track your runs")
            FeatureItem("Get detailed AI insights from eligible runs")
            FeatureItem("Receive post-run summaries within your trial allowance")
            FeatureItem("Use Ai Run Coach Garmin watch app - download from Garmin IQ")
        }
    }
}

/**
 * Shows what's unlocked in paid plans
 */
@Composable
private fun WhatsIncludedInPaidPlans() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(bottom = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.08f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            Text(
                text = "🚀 Unlock with Paid Plans",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            FeatureItem("Unlock AI route generation")
            FeatureItem("Create personalized AI coaching plans")
            FeatureItem("Continue AI coaching and insights beyond the trial allowance")
        }
    }
}

@Composable
private fun FeatureItem(text: String) {
    Text(
        text = "✓ $text",
        fontSize = 13.sp,
        color = Colors.textPrimary,
        modifier = Modifier.padding(bottom = Spacing.xs)
    )
}

/**
 * Billing period toggle for onboarding flow
 */
@Composable
private fun OnboardingBillingPeriodToggle(
    isAnnual: Boolean,
    onToggle: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .background(Colors.backgroundTertiary, RoundedCornerShape(10.dp))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        // Monthly button
        Button(
            onClick = { onToggle(false) },
            modifier = Modifier
                .weight(1f)
                .height(38.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (!isAnnual) Colors.backgroundSecondary else Color.Transparent
            ),
            shape = RoundedCornerShape(8.dp),
            elevation = ButtonDefaults.buttonElevation(0.dp, 0.dp, 0.dp)
        ) {
            Text(
                text = "Monthly",
                fontSize = 14.sp,
                fontWeight = if (!isAnnual) FontWeight.SemiBold else FontWeight.Normal,
                color = if (!isAnnual) Colors.textPrimary else Colors.textSecondary
            )
        }

        // Annual button
        Button(
            onClick = { onToggle(true) },
            modifier = Modifier
                .weight(1f)
                .height(38.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isAnnual) Colors.backgroundSecondary else Color.Transparent
            ),
            shape = RoundedCornerShape(8.dp),
            elevation = ButtonDefaults.buttonElevation(0.dp, 0.dp, 0.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Annual",
                    fontSize = 14.sp,
                    fontWeight = if (isAnnual) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (isAnnual) Colors.textPrimary else Colors.textSecondary
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Surface(
                    color = if (isAnnual) Color(0xFF22C55E) else Color(0xFF22C55E).copy(alpha = 0.55f),
                    shape = RoundedCornerShape(999.dp)
                ) {
                    Text(
                        text = "SAVE 17%",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                    )
                }
            }
        }
    }
}

/**
 * Plan card for onboarding flow
 */
@Composable
private fun OnboardingPlanCard(
    plan: PlanData,
    isPopular: Boolean = false,
    isAnnual: Boolean = false,
    onUpgradeClick: () -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .border(
                width = if (isPopular) 2.dp else 1.dp,
                color = if (isPopular) plan.accentColor else Colors.backgroundSecondary,
                shape = RoundedCornerShape(16.dp)
            ),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            // Header with name and badges
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = plan.name,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Colors.textPrimary
                )

                if (isPopular) {
                    Surface(
                        color = plan.accentColor,
                        shape = RoundedCornerShape(999.dp)
                    ) {
                        Text(
                            text = "RECOMMENDED",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = Colors.buttonText,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Price
            val displayPrice = if (isAnnual && plan.annualPriceDisplay.isNotEmpty()) {
                plan.annualPriceDisplay
            } else {
                plan.monthlyPriceDisplay
            }
            val displaySuffix = if (isAnnual && plan.annualPriceDisplay.isNotEmpty()) {
                plan.annualPriceSuffix
            } else {
                plan.monthlyPriceSuffix
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Start
            ) {
                Text(
                    text = displayPrice,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.width(Spacing.xs))
                Text(
                    text = displaySuffix,
                    fontSize = 14.sp,
                    color = Colors.textSecondary
                )
            }

            // Monthly equivalent for annual
            if (isAnnual && plan.annualMonthlyEquivalent.isNotEmpty()) {
                Text(
                    text = plan.annualMonthlyEquivalent,
                    fontSize = 12.sp,
                    color = Colors.textSecondary,
                    modifier = Modifier.padding(top = Spacing.xs)
                )
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Features list
            Column(modifier = Modifier.fillMaxWidth()) {
                plan.features.forEach { feature ->
                    PlanFeatureItem(feature)
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Upgrade button
            Button(
                onClick = onUpgradeClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isPopular) plan.accentColor else Colors.primary,
                    contentColor = Colors.buttonText
                ),
                shape = RoundedCornerShape(BorderRadius.lg)
            ) {
                Text(
                    "Upgrade Now",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp
                )
            }
        }
    }
}

@Composable
private fun PlanFeatureItem(feature: PlanFeature) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs),
        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = if (feature.included) "✓" else "✗",
            fontSize = 16.sp,
            color = if (feature.included) Color(0xFF22C55E) else Color(0xFFEF4444),
            fontWeight = FontWeight.Bold
        )
        Text(
            text = feature.text,
            fontSize = 13.sp,
            color = if (feature.included) Colors.textPrimary else Colors.textMuted
        )
    }
}

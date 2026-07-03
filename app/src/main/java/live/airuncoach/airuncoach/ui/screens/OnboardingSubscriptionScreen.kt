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
import androidx.compose.ui.graphics.Brush
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
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Onboarding-specific subscription screen shown after AI Coach Settings.
 * Emphasizes the 14-day free trial with limited features and a clear upgrade CTA.
 * Users can dismiss to continue to the app with trial access.
 */
@Composable
fun OnboardingSubscriptionScreen(
    viewModel: SubscriptionViewModel = hiltViewModel(),
    onNavigateToMain: () -> Unit = {}
) {
    val subscriptions by viewModel.subscriptions.collectAsState()
    val billingConnectionState by viewModel.billingConnectionState.collectAsState()
    val context = LocalContext.current
    val activity = context as? Activity
    val sessionManager = remember { SessionManager(context) }
    val trialDaysRemaining = viewModel.trialDaysRemaining()
    val trialExpiresAt = viewModel.getTrialExpiresAt()
    
    var isAnnual by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        // Header: Welcome to your 14-day trial
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = Brush.verticalGradient(
                        colors = listOf(Colors.primary, Colors.primary.copy(alpha = 0.8f))
                    )
                )
                .padding(vertical = Spacing.xxxl)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "🎉 Your 14-Day Trial Starts Today",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    text = "Limited access to explore AI Run Coach",
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.9f),
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
                    TrialLimitationsBanner(trialDaysRemaining, trialExpiresAt)
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
                        plan = OnboardingPlanData.LITE,
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
                        plan = OnboardingPlanData.STANDARD,
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
                            onNavigateToMain()
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
                        text = "All prices in USD. Auto-renew can be cancelled anytime.",
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
private fun TrialLimitationsBanner(daysRemaining: Int, expiresAt: LocalDate?) {
    val expiryText = expiresAt?.format(DateTimeFormatter.ofPattern("MMM d")) ?: "soon"
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(bottom = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF3C7)),
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
                Text("⏱️", fontSize = 24.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Your Free Trial: $daysRemaining days remaining",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF92400E)
                    )
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    Text(
                        text = "Expires on $expiryText",
                        fontSize = 13.sp,
                        color = Color(0xB3744210)
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Trial limitations
            Text(
                text = "🚫 Limited Features During Trial:",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF92400E)
            )
            Spacer(modifier = Modifier.height(Spacing.xs))

            LimitationItem("❌ Cannot generate AI-powered run routes")
            LimitationItem("❌ Cannot generate AI coaching training plans")
            LimitationItem("⚠️ Limited in-run AI coaching features")
            LimitationItem("⚠️ Limited route analysis and suggestions")
        }
    }
}

@Composable
private fun LimitationItem(text: String) {
    Text(
        text = text,
        fontSize = 13.sp,
        color = Color(0xFF744210),
        modifier = Modifier.padding(start = Spacing.md, bottom = Spacing.xs)
    )
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
            FeatureItem("View basic run stats and metrics")
            FeatureItem("Try core AI coaching features")
            FeatureItem("Explore the app experience")
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

            FeatureItem("Generate unlimited AI-powered routes")
            FeatureItem("Create personalized training plans")
            FeatureItem("Full AI in-run coaching features")
            FeatureItem("Unlimited route analysis")
            FeatureItem("Advanced performance insights")
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
    plan: OnboardingPlanData,
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
                    OnboardingFeatureItem(feature)
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
private fun OnboardingFeatureItem(feature: OnboardingPlanFeature) {
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

/**
 * Plan data for onboarding
 */
data class OnboardingPlanData(
    val name: String,
    val monthlyPriceDisplay: String,
    val monthlyPriceSuffix: String = "/month",
    val annualPriceDisplay: String = "",
    val annualPriceSuffix: String = "/year",
    val annualMonthlyEquivalent: String = "",
    val accentColor: Color,
    val features: List<OnboardingPlanFeature>
) {
    companion object {
        val LITE = OnboardingPlanData(
            name = "Lite",
            monthlyPriceDisplay = "$7.99",
            monthlyPriceSuffix = "/month",
            annualPriceDisplay = "$79.99",
            annualPriceSuffix = "/year",
            annualMonthlyEquivalent = "$6.67/month — save $15.89",
            accentColor = Colors.primary,
            features = listOf(
                OnboardingPlanFeature("Unlimited AI runs", true),
                OnboardingPlanFeature("50km AI coaching/month", true),
                OnboardingPlanFeature("15 post-run summaries/month", true),
                OnboardingPlanFeature("10 AI route generations/month", true),
                OnboardingPlanFeature("1 AI training plan/month", true)
            )
        )

        val STANDARD = OnboardingPlanData(
            name = "Standard",
            monthlyPriceDisplay = "$14.99",
            monthlyPriceSuffix = "/month",
            annualPriceDisplay = "$149.99",
            annualPriceSuffix = "/year",
            annualMonthlyEquivalent = "$12.50/month — save $29.89",
            accentColor = Color(0xFFA78BFA),
            features = listOf(
                OnboardingPlanFeature("Unlimited AI runs", true),
                OnboardingPlanFeature("200km AI coaching/month", true),
                OnboardingPlanFeature("50 post-run summaries/month", true),
                OnboardingPlanFeature("30 AI route generations/month", true),
                OnboardingPlanFeature("3 AI training plans/month", true)
            )
        )
    }
}

data class OnboardingPlanFeature(
    val text: String,
    val included: Boolean
)

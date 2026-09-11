package live.airuncoach.airuncoach.ui.screens

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.coroutines.delay
import live.airuncoach.airuncoach.MainActivity
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.util.AppAnalytics
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModel

/**
 * Onboarding-specific subscription screen shown after AI Coach Settings.
 *
 * Redesigned 2026-08-14 after a suspected activation-drop-off issue: users were completing
 * onboarding but not doing a first run. Root causes addressed here:
 *  1. The whole screen used to be gated behind Play Billing connecting — any device that
 *     couldn't reach Play Billing (no Play Store signed in, MDM-managed device, region
 *     restriction, a network blip) got stuck on an infinite spinner with no way to reach the
 *     dashboard. The primary "Continue to Dashboard" CTA below no longer depends on billing
 *     at all — only the opt-in "See plans & pricing" section does, and that now has a timeout
 *     + graceful fallback instead of spinning forever.
 *  2. Pricing/plan cards were the default, forced view — reads as a paywall before the user
 *     has done anything in the app. Plans are now behind an explicit opt-in toggle, so pricing
 *     is still fully visible for anyone who wants it (transparency was a deliberate goal),
 *     without it being the thing standing between signup and the dashboard.
 *  3. The free-trial reassurance ("no credit card required") is now directly attached to the
 *     primary CTA instead of buried in a footnote below two cards of trial-limitation copy.
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
    var showPlans by remember { mutableStateOf(false) }
    var billingTimedOut by remember { mutableStateOf(false) }
    var aiPlansToggle by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_SUBSCRIPTION_VIEWED)
    }

    // Give billing a few seconds to connect before treating it as unavailable. This only
    // gates the opt-in "See plans" section now — never the primary continue path.
    LaunchedEffect(billingConnectionState) {
        if (!billingConnectionState) {
            delay(4000)
            if (!billingConnectionState) billingTimedOut = true
        } else {
            billingTimedOut = false
        }
    }

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

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundRoot),
            contentPadding = PaddingValues(vertical = Spacing.lg)
        ) {
            // Condensed trial summary — one card instead of two, so the primary CTA is
            // reachable without scrolling past a wall of feature bullets first.
            item {
                TrialSummaryCard()
            }

            // ━━ Quick-access CTAs — ABOVE the primary "Continue to Dashboard" CTA and styled
            // as bold as it, not a secondary/muted option below it. Surfaced here (rather than
            // left for the user to discover once already on the dashboard) so a user with a
            // watch on hand can pair it immediately, and a new user can see what the app
            // actually does before landing cold on an empty dashboard. Both reuse
            // MainActivity.pendingDeepLink, the same mechanism notification deep-links use, to
            // jump straight to the destination once the remaining onboarding/permission/consent
            // steps resolve — see MainScreen.kt.
            item {
                OnboardingBoldCta(
                    icon = Icons.Filled.Watch,
                    text = "Connect a Garmin or Samsung watch",
                    filled = true,
                    onClick = {
                        AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_CONNECT_WATCH_TAPPED)
                        sessionManager.clearOnboardingFlags()
                        MainActivity.pendingDeepLink.value = "connected_devices"
                        onNavigateToPermissions()
                    }
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
                OnboardingBoldCta(
                    icon = Icons.Filled.Explore,
                    text = "Take a quick tour of Ai Run Coach",
                    filled = false,
                    onClick = {
                        AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_TAKE_TOUR_TAPPED)
                        sessionManager.clearOnboardingFlags()
                        MainActivity.pendingDeepLink.value = "onboarding_tour"
                        onNavigateToPermissions()
                    }
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ━━ PRIMARY CTA — always visible, never depends on billing connecting ━━━━━━━━━━
            item {
                Button(
                    onClick = {
                        AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_CONTINUE_TO_DASHBOARD_TAPPED)
                        sessionManager.clearOnboardingFlags()
                        onNavigateToPermissions()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .padding(horizontal = Spacing.lg)
                        .padding(top = Spacing.md),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    ),
                    shape = RoundedCornerShape(BorderRadius.lg)
                ) {
                    Text(
                        "Continue to Dashboard",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }
                Text(
                    text = "Free 14-day trial — no credit card required",
                    fontSize = 12.sp,
                    color = Colors.textMuted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg, vertical = Spacing.sm)
                )
            }

            // Secondary, opt-in pricing — kept fully available (transparency matters) but no
            // longer forced in front of the user before they've reached the app at all.
            item {
                TextButton(
                    onClick = {
                        if (!showPlans) {
                            AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_SEE_PLANS_TAPPED)
                        }
                        showPlans = !showPlans
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm)
                ) {
                    Text(
                        text = if (showPlans) "Hide plans & pricing" else "See plans & pricing",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Colors.primary
                    )
                }
            }

            if (showPlans) {
                item { WhatsIncludedInPaidPlans() }

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

                if (billingConnectionState) {
                    item {
                        OnboardingBillingPeriodToggle(isAnnual = isAnnual, onToggle = { isAnnual = it })
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    // AI Plans toggle — applies to both the Monthly and Annual tabs above.
                    item {
                        AiPlansToggleRow(aiPlansEnabled = aiPlansToggle, onToggle = { aiPlansToggle = it })
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    item {
                        val liteBase = if (aiPlansToggle) PlanData.LITE else PlanData.LITE_NOAI
                        OnboardingPlanCard(
                            plan = liteBase.localizedFor(
                                currency = userCurrency,
                                pricing = pricingData,
                                monthlyTier = if (aiPlansToggle) pricingData?.liteMonthly else pricingData?.liteNoAiMonthly,
                                annualTier = if (aiPlansToggle) pricingData?.liteAnnual else pricingData?.liteNoAiAnnual
                            ),
                            isAnnual = isAnnual,
                            onUpgradeClick = {
                                AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_PLAN_PURCHASE_TAPPED)
                                activity?.let {
                                    val productId = resolveProductId("lite", isAnnual, aiPlansToggle)
                                    val liteProduct = subscriptions.find { sub -> sub.productId == productId }
                                    if (liteProduct != null) {
                                        viewModel.purchaseSubscription(it, liteProduct)
                                    }
                                }
                            }
                        )
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    item {
                        val standardBase = if (aiPlansToggle) PlanData.STANDARD else PlanData.STANDARD_NOAI
                        OnboardingPlanCard(
                            plan = standardBase.localizedFor(
                                currency = userCurrency,
                                pricing = pricingData,
                                monthlyTier = if (aiPlansToggle) pricingData?.standardMonthly else pricingData?.standardNoAiMonthly,
                                annualTier = if (aiPlansToggle) pricingData?.standardAnnual else pricingData?.standardNoAiAnnual
                            ),
                            isPopular = true,
                            isAnnual = isAnnual,
                            onUpgradeClick = {
                                AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_PLAN_PURCHASE_TAPPED)
                                activity?.let {
                                    val productId = resolveProductId("standard", isAnnual, aiPlansToggle)
                                    val standardProduct = subscriptions.find { sub -> sub.productId == productId }
                                    if (standardProduct != null) {
                                        viewModel.purchaseSubscription(it, standardProduct)
                                    }
                                }
                            }
                        )
                        Spacer(modifier = Modifier.height(Spacing.xxl))
                    }

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
                } else if (billingTimedOut) {
                    item {
                        Text(
                            text = "Plans are temporarily unavailable. You can view and subscribe anytime from Settings → Subscription.",
                            fontSize = 13.sp,
                            color = Colors.textSecondary,
                            textAlign = TextAlign.Center,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = Spacing.lg, vertical = Spacing.xxl)
                        )
                    }
                } else {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = Spacing.xxl),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = Colors.primary)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Bold CTA button used for the "connect a watch" / "take a tour" onboarding shortcuts — styled
 * as prominently as a real call-to-action (filled or bold-outlined, same height family as the
 * primary "Continue to Dashboard" button below it), not a muted secondary row.
 */
@Composable
private fun OnboardingBoldCta(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    filled: Boolean,
    onClick: () -> Unit,
) {
    if (filled) {
        Button(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .padding(horizontal = Spacing.lg),
            colors = ButtonDefaults.buttonColors(
                containerColor = Colors.primary,
                contentColor = Colors.buttonText,
            ),
            shape = RoundedCornerShape(BorderRadius.lg),
        ) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text(text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .padding(horizontal = Spacing.lg),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary),
            border = androidx.compose.foundation.BorderStroke(2.dp, Colors.primary),
            shape = RoundedCornerShape(BorderRadius.lg),
        ) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text(text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    }
}

/**
 * Condensed trial summary — merges the old two-card layout (limitations + "what you can do")
 * into one, so the primary CTA is reachable within roughly one screen's worth of scrolling.
 */
@Composable
private fun TrialSummaryCard() {
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
                        text = "Your free trial includes",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary
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

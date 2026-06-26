package live.airuncoach.airuncoach.ui.screens

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.android.billingclient.api.ProductDetails
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun SubscriptionScreen(
    viewModel: SubscriptionViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit = {},
    @Suppress("UNUSED_PARAMETER") onNavigateToLogin: () -> Unit = {},
    @Suppress("UNUSED_PARAMETER") onBackClick: () -> Unit = {}
) {
    val subscriptions by viewModel.subscriptions.collectAsState()
    val billingConnectionState by viewModel.billingConnectionState.collectAsState()
    val context = LocalContext.current
    val activity = context as? Activity
    val isPremium = viewModel.isPremiumUser()
    val isTrialExpired = viewModel.isTrialExpired()
    val trialDaysRemaining = viewModel.trialDaysRemaining()
    val trialExpiresAt = viewModel.getTrialExpiresAt()

    // Open directly to Plans tab if trial has expired so user sees the upgrade path immediately
    var selectedTab by remember { mutableIntStateOf(if (isTrialExpired) 0 else 0) } // 0 = Plans, 1 = Usage

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        // Navigation Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Colors.backgroundDefault)
                .padding(horizontal = Spacing.lg, vertical = Spacing.lg),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                modifier = Modifier
                    .size(24.dp)
                    .clickable { onNavigateBack() },
                tint = Colors.textPrimary
            )
            Text(
                text = "Account Management",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.width(24.dp))
        }

        // Tab Bar
        CustomTabBar(selectedTab = selectedTab) { selectedTab = it }

        // Content
        if (billingConnectionState) {
            when (selectedTab) {
                0 -> PlansTabContent(
                    subscriptions = subscriptions,
                    isPremium = isPremium,
                    activity = activity,
                    viewModel = viewModel,
                    isTrialExpired = isTrialExpired,
                    trialDaysRemaining = trialDaysRemaining,
                    trialExpiresAt = trialExpiresAt
                )
                1 -> UsageTabContent(
                    viewModel = viewModel,
                    isTrialExpired = isTrialExpired,
                    trialDaysRemaining = trialDaysRemaining,
                    trialExpiresAt = trialExpiresAt,
                    onUpgradeClick = { selectedTab = 0 }
                )
            }
        } else {
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

@Composable
private fun CustomTabBar(
    selectedTab: Int,
    onTabSelected: (Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Colors.backgroundDefault)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Colors.backgroundSecondary)
                .padding(horizontal = Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            listOf("Plans", "Usage").forEachIndexed { index, label ->
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onTabSelected(index) }
                        .padding(vertical = Spacing.lg),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = label,
                        fontSize = 16.sp,
                        fontWeight = if (selectedTab == index) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (selectedTab == index) Colors.textPrimary else Colors.textSecondary
                    )
                }
            }
        }
        
        // Animated indicator
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(Colors.backgroundSecondary)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.5f)
                    .height(2.dp)
                    .background(Colors.primary)
                    .align(if (selectedTab == 0) Alignment.TopStart else Alignment.TopEnd)
            )
        }
    }
}

@Composable
private fun PlansTabContent(
    subscriptions: List<ProductDetails>,
    isPremium: Boolean,
    activity: Activity?,
    viewModel: SubscriptionViewModel,
    isTrialExpired: Boolean = false,
    trialDaysRemaining: Int = 0,
    trialExpiresAt: LocalDate? = null
) {
    // Hoisted OUTSIDE LazyColumn so scrolling can never reset it
    var isAnnual by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundDefault),
        contentPadding = PaddingValues(vertical = Spacing.lg)
    ) {
        // Trial expired urgent banner
        if (isTrialExpired && !isPremium) {
            item {
                TrialExpiredBanner()
            }
        }

        // Trial countdown banner (active trial, not expired, not paid)
        if (!isTrialExpired && !isPremium && trialDaysRemaining > 0) {
            item {
                TrialCountdownBanner(daysRemaining = trialDaysRemaining, expiresAt = trialExpiresAt)
            }
        }

        // Subtitle
        item {
            Text(
                text = if (isTrialExpired && !isPremium) "Upgrade to continue running with AI coaching"
                       else "Choose a plan that fits your running",
                fontSize = 16.sp,
                color = if (isTrialExpired && !isPremium) Colors.textPrimary else Colors.textSecondary,
                fontWeight = if (isTrialExpired && !isPremium) FontWeight.SemiBold else FontWeight.Normal,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.xl, vertical = Spacing.lg)
            )
        }

        // Billing Period Toggle — state lives in the parent composable, never resets on scroll
        item {
            BillingPeriodToggle(isAnnual = isAnnual, onToggle = { isAnnual = it })
        }

        // Plan Cards
        val freeTier = PlanData.FREE_TRIAL
        val liteTier = PlanData.LITE
        val standardTier = PlanData.STANDARD

        // Free trial card — only shown when the user is NOT already paid
        if (!isPremium) {
            item {
                PlanCard(
                    plan = freeTier,
                    isCurrent = !isPremium && !isTrialExpired,
                    isExpired = isTrialExpired,
                    isAnnual = isAnnual,
                    onUpgradeClick = {}
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
        }

        item {
            PlanCard(
                plan = liteTier,
                isCurrent = false,
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

        item {
            PlanCard(
                plan = standardTier,
                isCurrent = false,
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
            Spacer(modifier = Modifier.height(Spacing.xxxl))
        }

        // Manage Subscription Link (Paid users)
        if (isPremium) {
            item {
                Text(
                    text = "Manage Subscription",
                    fontSize = 14.sp,
                    color = Colors.primary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = Spacing.lg)
                        .clickable { /* Open Google Play subscription management */ }
                )
            }
        }

        // Footnotes
        item {
            Text(
                text = "All prices in USD (US Dollars).",
                fontSize = 12.sp,
                color = Colors.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.xl, vertical = Spacing.sm)
            )
        }

        item {
            Text(
                text = "Subscriptions auto-renew automatically. Cancel any time in Settings > Google Play > Account.",
                fontSize = 12.sp,
                color = Colors.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.xl, vertical = Spacing.sm)
            )
        }

        // Links Section
        item {
            Spacer(modifier = Modifier.height(Spacing.xxl))
            LinksSection()
            Spacer(modifier = Modifier.height(Spacing.xxl))
        }

        // Danger Zone
        item {
            DeleteAccountSection()
            Spacer(modifier = Modifier.height(Spacing.xxxl))
        }
    }
}

/**
 * Controlled billing period toggle — state is owned by the parent so it survives scrolling.
 */
@Composable
private fun BillingPeriodToggle(
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

        // Annual button — always shows SAVE badge to entice users
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
                // Always visible to make the saving obvious even before clicking
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

/** Shown at the top of the Plans tab when the free trial has expired. */
@Composable
private fun TrialExpiredBanner() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(top = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFEF4444).copy(alpha = 0.12f)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("⏰", fontSize = 28.sp)
            Column {
                Text(
                    text = "Your free trial has ended",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFEF4444)
                )
                Text(
                    text = "Upgrade now to continue using AI Run Coach",
                    fontSize = 13.sp,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

/** Shown during the active trial period to show days remaining. */
@Composable
private fun TrialCountdownBanner(daysRemaining: Int, expiresAt: LocalDate?) {
    val isUrgent = daysRemaining <= 3
    val bannerColor = if (isUrgent) Color(0xFFF59E0B) else Colors.primary
    val expiryText = expiresAt?.format(DateTimeFormatter.ofPattern("d MMM yyyy")) ?: "soon"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(top = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = bannerColor.copy(alpha = 0.12f)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(if (isUrgent) "⚠️" else "🎉", fontSize = 28.sp)
            Column {
                Text(
                    text = if (daysRemaining == 1) "1 day left in your free trial"
                           else "$daysRemaining days left in your free trial",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = bannerColor
                )
                Text(
                    text = "Trial expires $expiryText — upgrade to keep your AI coach",
                    fontSize = 13.sp,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
private fun PlanCard(
    plan: PlanData,
    isCurrent: Boolean = false,
    isPopular: Boolean = false,
    isExpired: Boolean = false,
    isAnnual: Boolean = false,
    onUpgradeClick: () -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .border(
                width = if (isCurrent) 2.dp else 0.dp,
                color = if (isCurrent) plan.accentColor else Color.Transparent,
                shape = RoundedCornerShape(20.dp)
            ),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(20.dp)
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
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Colors.textPrimary
                )
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (isPopular) {
                        Surface(
                            color = plan.accentColor,
                            shape = RoundedCornerShape(999.dp)
                        ) {
                            Text(
                                text = "MOST POPULAR",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = Colors.buttonText,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                            )
                        }
                    }
                    
                    if (isExpired) {
                        Surface(
                            color = Color(0xFFEF4444).copy(alpha = 0.15f),
                            shape = RoundedCornerShape(999.dp)
                        ) {
                            Text(
                                text = "EXPIRED",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFEF4444),
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                            )
                        }
                    } else if (isCurrent) {
                        Surface(
                            color = plan.accentColor.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(999.dp)
                        ) {
                            Text(
                                text = "CURRENT",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = plan.accentColor,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Price — switches between monthly and annual based on the toggle
            val hasAnnual = plan.annualPriceDisplay.isNotEmpty()
            val displayPrice = if (isAnnual && hasAnnual) plan.annualPriceDisplay else plan.monthlyPriceDisplay
            val displaySuffix = if (isAnnual && hasAnnual) plan.annualPriceSuffix else plan.monthlyPriceSuffix
            val displayEquivalent = when {
                isAnnual && hasAnnual -> plan.annualMonthlyEquivalent
                !hasAnnual -> plan.monthlyEquivalent  // FREE_TRIAL
                else -> ""
            }

            Row(
                horizontalArrangement = Arrangement.Start,
                verticalAlignment = Alignment.Bottom
            ) {
                Text(
                    text = displayPrice,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = plan.accentColor,
                    lineHeight = 24.sp
                )
                if (displaySuffix.isNotEmpty()) {
                    Text(
                        text = displaySuffix,
                        fontSize = 14.sp,
                        color = Colors.textMuted,
                        modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
                    )
                }
            }

            if (displayEquivalent.isNotEmpty()) {
                Text(
                    text = displayEquivalent,
                    fontSize = 12.sp,
                    color = Colors.textMuted,
                    modifier = Modifier.padding(top = Spacing.xs)
                )
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Divider
            HorizontalDivider(
                color = Colors.border,
                thickness = 1.dp,
                modifier = Modifier.padding(vertical = Spacing.md)
            )

            // Features
            plan.features.forEach { feature ->
                FeatureRow(
                    icon = if (feature.included) Icons.Default.CheckCircle else Icons.Default.Cancel,
                    text = feature.text,
                    isIncluded = feature.included,
                    accentColor = plan.accentColor
                )
                if (feature != plan.features.last()) {
                    Spacer(modifier = Modifier.height(Spacing.sm))
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Upgrade Button
            if (!isCurrent) {
                Button(
                    onClick = onUpgradeClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(46.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = plan.accentColor
                    ),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text(
                        text = "Upgrade to ${plan.name}",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.buttonText
                    )
                }
            }
        }
    }
}

@Composable
private fun FeatureRow(
    icon: ImageVector,
    text: String,
    isIncluded: Boolean,
    accentColor: Color
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        verticalAlignment = Alignment.Top,
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = if (isIncluded) accentColor else Colors.textMuted
        )
        Text(
            text = text,
            fontSize = 14.sp,
            color = if (isIncluded) Colors.textPrimary else Colors.textMuted
        )
    }
}

@Composable
private fun LinksSection() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(20.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            LinkRow("Change Password", Icons.Default.Lock)
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            LinkRow("Privacy Policy", Icons.Default.Security)
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            LinkRow("Terms of Use", Icons.Default.Description)
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            LinkRow("Get Support", Icons.AutoMirrored.Filled.Help)
        }
    }
}

@Composable
private fun LinkRow(label: String, icon: ImageVector) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { /* Handle navigation */ }
            .padding(Spacing.lg),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = Colors.textSecondary
            )
            Text(
                text = label,
                fontSize = 16.sp,
                color = Colors.textPrimary
            )
        }
        Icon(
            imageVector = Icons.Default.ChevronRight,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = Colors.textMuted
        )
    }
}

@Composable
private fun DeleteAccountSection() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
    ) {
        Button(
            onClick = { /* Show delete account bottom sheet */ },
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFFEF4444).copy(alpha = 0.08f)
            ),
            shape = RoundedCornerShape(20.dp)
        ) {
            Text(
                text = "Delete Account",
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFFEF4444)
            )
        }

        Text(
            text = "Permanently removes your account",
            fontSize = 12.sp,
            color = Colors.textMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.sm)
        )
    }
}

@Composable
private fun UsageTabContent(
    viewModel: SubscriptionViewModel,
    isTrialExpired: Boolean = false,
    trialDaysRemaining: Int = 0,
    trialExpiresAt: LocalDate? = null,
    onUpgradeClick: () -> Unit = {}
) {
    val usageState by viewModel.usageState.collectAsState()
    val isPremium = viewModel.isPremiumUser()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundDefault),
        contentPadding = PaddingValues(vertical = Spacing.lg)
    ) {
        // Trial expired urgent banner above the plan info
        if (isTrialExpired && !isPremium) {
            item { TrialExpiredBanner() }
        } else if (!isTrialExpired && !isPremium && trialDaysRemaining > 0) {
            item { TrialCountdownBanner(daysRemaining = trialDaysRemaining, expiresAt = trialExpiresAt) }
        }

        // Current Plan Banner
        item {
            when (usageState) {
                is SubscriptionViewModel.UsageState.Success -> {
                    val usage = (usageState as SubscriptionViewModel.UsageState.Success).usage
                    CurrentPlanBanner(
                        tierName = usage.tier.replaceFirstChar { it.uppercase() },
                        resetDate = usage.yearMonth,
                        isTrialExpired = isTrialExpired,
                        trialDaysRemaining = trialDaysRemaining,
                        trialExpiresAt = trialExpiresAt,
                        isPremium = isPremium
                    )
                }
                else -> {
                    CurrentPlanBanner(
                        tierName = "Loading...",
                        resetDate = "",
                        isTrialExpired = isTrialExpired,
                        trialDaysRemaining = trialDaysRemaining,
                        trialExpiresAt = trialExpiresAt,
                        isPremium = isPremium
                    )
                }
            }
        }

        // Usage Rows — limit values reflect the trial caps (15km, 3 summaries, 0 routes, 0 plans)
        item {
            when (usageState) {
                is SubscriptionViewModel.UsageState.Success -> {
                    val usage = (usageState as SubscriptionViewModel.UsageState.Success).usage
                    UsageRowsContainer(usage, isTrialExpired = isTrialExpired, isPremium = isPremium)
                }
                is SubscriptionViewModel.UsageState.Loading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(Spacing.lg),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                is SubscriptionViewModel.UsageState.Error -> {
                    Text(
                        text = "Failed to load usage data",
                        color = Colors.textMuted,
                        modifier = Modifier.padding(Spacing.lg)
                    )
                }
            }
        }

        // Upgrade CTA — urgent messaging if trial expired
        item {
            UpgradeCTA(isUrgent = isTrialExpired && !isPremium, onUpgradeClick = onUpgradeClick)
        }
    }

    // Load usage data on first composition
    LaunchedEffect(Unit) {
        viewModel.loadUsageData()
    }
}

@Composable
private fun CurrentPlanBanner(
    tierName: String = "Loading...",
    resetDate: String = "",
    isTrialExpired: Boolean = false,
    trialDaysRemaining: Int = 0,
    trialExpiresAt: LocalDate? = null,
    isPremium: Boolean = false
) {
    val isFreeTrial = !isPremium
    val tierColor = when {
        isTrialExpired -> Color(0xFFEF4444)
        tierName.lowercase() == "lite" -> Colors.primary
        tierName.lowercase() == "standard" -> Color(0xFFA78BFA)
        else -> Color(0xFF8E9BAE)
    }

    // Parse reset date (format: YYYY-MM) to human readable (1 Jul 2026)
    val displayResetDate = try {
        val parts = resetDate.split("-")
        if (parts.size == 2) {
            val year = parts[0]
            val month = parts[1].toIntOrNull() ?: 1
            val monthName = arrayOf("Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")[month - 1]
            "1 $monthName $year"
        } else {
            "Next month"
        }
    } catch (_: Exception) { "Next month" }

    // Trial expiry display
    val trialExpiryDisplay = trialExpiresAt?.format(DateTimeFormatter.ofPattern("d MMM yyyy")) ?: ""

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(top = Spacing.lg),
        colors = CardDefaults.cardColors(
            containerColor = if (isTrialExpired && isFreeTrial)
                Color(0xFFEF4444).copy(alpha = 0.08f)
            else Colors.backgroundSecondary
        ),
        shape = RoundedCornerShape(20.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = if (isFreeTrial) "Free Trial" else "Current Plan",
                    fontSize = 12.sp,
                    color = Colors.textMuted
                )
                Text(
                    text = when {
                        isTrialExpired && isFreeTrial -> "Trial Expired"
                        isFreeTrial -> "14-Day Trial"
                        else -> tierName
                    },
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = tierColor
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                when {
                    isTrialExpired && isFreeTrial -> {
                        Text("Trial ended", fontSize = 12.sp, color = Color(0xFFEF4444))
                        if (trialExpiryDisplay.isNotEmpty()) {
                            Text(trialExpiryDisplay, fontSize = 14.sp, color = Color(0xFFEF4444),
                                fontWeight = FontWeight.SemiBold)
                        }
                    }
                    isFreeTrial && trialExpiresAt != null -> {
                        Text("Expires", fontSize = 12.sp, color = Colors.textMuted)
                        Text(trialExpiryDisplay, fontSize = 14.sp, color = Colors.textSecondary)
                        if (trialDaysRemaining > 0) {
                            Text(
                                text = "$trialDaysRemaining days left",
                                fontSize = 12.sp,
                                color = if (trialDaysRemaining <= 3) Color(0xFFF59E0B) else Colors.primary,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                    else -> {
                        Text("Resets", fontSize = 12.sp, color = Colors.textMuted)
                        Text(displayResetDate, fontSize = 14.sp, color = Colors.textSecondary)
                    }
                }
            }
        }
    }
}

@Composable
private fun UsageRowsContainer(
    usage: SubscriptionViewModel.UsageData,
    isTrialExpired: Boolean = false,
    isPremium: Boolean = false
) {
    // For free-trial users the caps are fixed regardless of what the server returns,
    // so we always display the correct trial limits in the UI.
    val isFreeTrial = !isPremium
    val coachingLimit = if (isFreeTrial) 15 else usage.aiCoachingKmLimit
    val summariesLimit = if (isFreeTrial) 3 else usage.postRunAnalysesLimit
    val routesLimit = if (isFreeTrial) 0 else usage.routesGeneratedLimit
    val plansLimit = if (isFreeTrial) 0 else usage.trainingPlansLimit

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(top = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(20.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            UsageRow(
                icon = Icons.Default.Favorite,
                title = "AI Coaching",
                usage = usage.aiCoachingKmUsed,
                limit = coachingLimit,
                unit = "km",
                accentColor = Color(0xFF34D399),
                isUnlimited = !isFreeTrial && usage.aiCoachingKmLimit == -1,
                isLocked = isFreeTrial && isTrialExpired
            )
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            UsageRow(
                icon = Icons.Default.Description,
                title = "AI Run Summaries",
                usage = usage.postRunAnalysesUsed,
                limit = summariesLimit,
                unit = "summaries",
                accentColor = Color(0xFFF59E0B),
                isUnlimited = !isFreeTrial && usage.postRunAnalysesLimit == -1,
                isLocked = isFreeTrial && isTrialExpired
            )
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            UsageRow(
                icon = Icons.Default.Place,
                title = "AI Routes",
                usage = usage.routesGeneratedUsed,
                limit = routesLimit,
                unit = "routes",
                accentColor = Colors.primary,
                isUnlimited = !isFreeTrial && usage.routesGeneratedLimit == -1,
                isLocked = isFreeTrial,   // Always locked on free trial
                lockedLabel = "Paid plans only"
            )
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            UsageRow(
                icon = Icons.Default.DateRange,
                title = "AI Training Plans",
                usage = usage.trainingPlansUsed,
                limit = plansLimit,
                unit = "plans",
                accentColor = Color(0xFFA78BFA),
                isUnlimited = !isFreeTrial && usage.trainingPlansLimit == -1,
                isLocked = isFreeTrial,   // Always locked on free trial
                lockedLabel = "Paid plans only"
            )
        }
    }
}

@Composable
private fun UsageRow(
    icon: ImageVector,
    title: String,
    usage: Int,
    limit: Int,
    unit: String,
    accentColor: Color,
    isUnlimited: Boolean = false,
    isLocked: Boolean = false,       // Feature not available on this plan at all
    lockedLabel: String = "Upgrade required"
) {
    val progressValue = when {
        isLocked || limit <= 0 -> 1f
        isUnlimited -> 0f
        else -> (usage.toFloat() / limit.toFloat()).coerceIn(0f, 1f)
    }
    val barColor = when {
        isLocked -> Color(0xFFEF4444)
        isUnlimited -> accentColor
        usage >= limit -> Color(0xFFFF5252)
        usage >= (limit * 0.8f) -> Color(0xFFF59E0B)
        else -> accentColor
    }
    val countColor = when {
        isLocked -> Color(0xFFEF4444)
        isUnlimited -> Colors.textSecondary
        usage >= limit -> Color(0xFFFF5252)
        usage >= (limit * 0.8f) -> Color(0xFFF59E0B)
        else -> Colors.textSecondary
    }

    val displayText = when {
        isLocked -> lockedLabel
        isUnlimited -> "Unlimited"
        else -> "$usage / $limit $unit"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.lg)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(Spacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier.width(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isLocked) Icons.Default.Lock else icon,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = if (isLocked) Color(0xFFEF4444) else accentColor
                    )
                }
                Text(
                    text = title,
                    fontSize = 16.sp,
                    color = if (isLocked) Colors.textMuted else Colors.textPrimary
                )
            }
            Text(
                text = displayText,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = countColor
            )
        }

        if (!isUnlimited) {
            Spacer(modifier = Modifier.height(Spacing.sm))

            LinearProgressIndicator(
                progress = { progressValue },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = barColor,
                trackColor = Colors.backgroundTertiary
            )
        }
    }
}

@Composable
private fun UpgradeCTA(isUrgent: Boolean = false, onUpgradeClick: () -> Unit = {}) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(top = Spacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Button(
            onClick = onUpgradeClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isUrgent) Color(0xFFEF4444) else Colors.primary
            ),
            shape = RoundedCornerShape(20.dp)
        ) {
            Icon(
                imageVector = Icons.Default.ArrowUpward,
                contentDescription = null,
                modifier = Modifier
                    .size(18.dp)
                    .padding(end = Spacing.sm)
            )
            Text(
                text = if (isUrgent) "Upgrade now to continue" else "Upgrade for more",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.buttonText
            )
        }
        if (isUrgent) {
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                text = "Your free trial has ended. Upgrade to unlock AI coaching.",
                fontSize = 12.sp,
                color = Colors.textMuted,
                textAlign = TextAlign.Center
            )
        }
    }
}

// Plan Data Model
data class PlanFeature(
    val text: String,
    val included: Boolean
)

data class PlanData(
    val name: String,
    // Monthly billing
    val monthlyPriceDisplay: String,
    val monthlyPriceSuffix: String = "/month",
    // Annual billing — empty strings mean the plan has no annual option (e.g. Free Trial)
    val annualPriceDisplay: String = "",
    val annualPriceSuffix: String = "/year",
    /** Displayed under the annual price, e.g. "USD · $6.67/month" */
    val annualMonthlyEquivalent: String = "",
    val accentColor: Color,
    val features: List<PlanFeature>,
    // Legacy alias kept for the FREE_TRIAL card which has no annual price
    val priceDisplay: String = monthlyPriceDisplay,
    val priceSuffix: String = monthlyPriceSuffix,
    val monthlyEquivalent: String = ""
) {
    companion object {
        /** 14-day free trial card — shown to non-paid users on the Plans tab */
        val FREE_TRIAL = PlanData(
            name = "Free Trial",
            monthlyPriceDisplay = "14 Days",
            monthlyPriceSuffix = " free",
            accentColor = Color(0xFF8E9BAE),
            monthlyEquivalent = "No credit card required",
            features = listOf(
                PlanFeature("15km of AI Coaching during trial", true),
                PlanFeature("3 AI Post-Run Summaries during trial", true),
                PlanFeature("No AI Route Generation", false),
                PlanFeature("No AI Training Plans", false),
                PlanFeature("Full access expires after 14 days", false)
            )
        )

        val LITE = PlanData(
            name = "Lite",
            monthlyPriceDisplay = "USD $7.99",
            monthlyPriceSuffix = "/month",
            annualPriceDisplay = "USD $79.99",
            annualPriceSuffix = "/year",
            annualMonthlyEquivalent = "USD $6.67/month — save $15.89",
            accentColor = Colors.primary,
            features = listOf(
                PlanFeature("Unlimited AI Runs", true),
                PlanFeature("50km of AI Coaching per month", true),
                PlanFeature("15 AI Post-Run Summaries per month", true),
                PlanFeature("10 AI Route Generations per month", true),
                PlanFeature("1 AI Training Plan per month", true)
            )
        )

        val STANDARD = PlanData(
            name = "Standard",
            monthlyPriceDisplay = "USD $14.99",
            monthlyPriceSuffix = "/month",
            annualPriceDisplay = "USD $149.99",
            annualPriceSuffix = "/year",
            annualMonthlyEquivalent = "USD $12.50/month — save $29.89",
            accentColor = Color(0xFFA78BFA),
            features = listOf(
                PlanFeature("Unlimited AI Runs", true),
                PlanFeature("200km of AI Coaching per month", true),
                PlanFeature("50 AI Post-Run Summaries per month", true),
                PlanFeature("30 AI Route Generations per month", true),
                PlanFeature("3 AI Training Plan generations per month", true)
            )
        )
    }
}

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
    
    var selectedTab by remember { mutableIntStateOf(0) } // 0 = Plans, 1 = Usage

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
                0 -> PlansTabContent(subscriptions, isPremium, activity, viewModel)
                1 -> UsageTabContent(viewModel)
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
    viewModel: SubscriptionViewModel
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundDefault),
        contentPadding = PaddingValues(vertical = Spacing.lg)
    ) {
        // Subtitle
        item {
            Text(
                text = "Choose a plan that fits your running",
                fontSize = 16.sp,
                color = Colors.textSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.xl, vertical = Spacing.lg)
            )
        }

        // Billing Period Toggle
        item {
            BillingPeriodToggle()
        }

        // Plan Cards
        val freeTier = PlanData.FREE
        val liteTier = PlanData.LITE
        val standardTier = PlanData.STANDARD

        item {
            PlanCard(
                plan = freeTier,
                isCurrent = !isPremium,
                onUpgradeClick = {}
            )
            Spacer(modifier = Modifier.height(Spacing.lg))
        }

        item {
            PlanCard(
                plan = liteTier,
                isCurrent = false,
                onUpgradeClick = {
                    activity?.let {
                        val liteProduct = subscriptions.find { sub ->
                            sub.productId.startsWith("lite_")
                        }
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
                onUpgradeClick = {
                    activity?.let {
                        val standardProduct = subscriptions.find { sub ->
                            sub.productId.startsWith("standard_")
                        }
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
                text = "Prices shown in your local currency.",
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

@Composable
private fun BillingPeriodToggle() {
    var isAnnual by remember { mutableStateOf<Boolean>(true) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .background(Colors.backgroundTertiary, RoundedCornerShape(10.dp))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Button(
            onClick = { isAnnual = false },
            modifier = Modifier
                .weight(1f)
                .height(38.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (!isAnnual) Colors.backgroundSecondary else Color.Transparent
            ),
            shape = RoundedCornerShape(8.dp)
        ) {
            Text(
                text = "Monthly",
                fontSize = 14.sp,
                fontWeight = if (!isAnnual) FontWeight.SemiBold else FontWeight.Normal,
                color = if (!isAnnual) Colors.textPrimary else Colors.textSecondary
            )
        }

        Box(modifier = Modifier.width(1.dp).height(32.dp).background(Colors.backgroundTertiary))

        Button(
            onClick = { isAnnual = true },
            modifier = Modifier
                .weight(1f)
                .height(38.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isAnnual) Colors.backgroundSecondary else Color.Transparent
            ),
            shape = RoundedCornerShape(8.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Annual",
                    fontSize = 14.sp,
                    fontWeight = if (isAnnual) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (isAnnual) Colors.textPrimary else Colors.textSecondary
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                if (isAnnual) {
                    Surface(
                        color = Color(0xFF22C55E),
                        shape = RoundedCornerShape(999.dp),
                        modifier = Modifier.height(20.dp).padding(horizontal = 5.dp)
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
}

@Composable
private fun PlanCard(
    plan: PlanData,
    isCurrent: Boolean = false,
    isPopular: Boolean = false,
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
                    
                    if (isCurrent) {
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

            // Price
            Row(
                horizontalArrangement = Arrangement.Start,
                verticalAlignment = Alignment.Bottom
            ) {
                Text(
                    text = plan.priceDisplay,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = plan.accentColor,
                    lineHeight = 24.sp
                )
                if (plan.priceSuffix.isNotEmpty()) {
                    Text(
                        text = plan.priceSuffix,
                        fontSize = 14.sp,
                        color = Colors.textMuted,
                        modifier = Modifier.padding(start = 4.dp)
                    )
                }
            }

            if (plan.monthlyEquivalent.isNotEmpty()) {
                Text(
                    text = plan.monthlyEquivalent,
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
private fun UsageTabContent(viewModel: SubscriptionViewModel) {
    val usageState by viewModel.usageState.collectAsState()
    
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundDefault),
        contentPadding = PaddingValues(vertical = Spacing.lg)
    ) {
        // Current Plan Banner
        item {
            when (usageState) {
                is SubscriptionViewModel.UsageState.Success -> {
                    val usage = (usageState as SubscriptionViewModel.UsageState.Success).usage
                    CurrentPlanBanner(
                        tierName = usage.tier.replaceFirstChar { it.uppercase() },
                        resetDate = usage.yearMonth
                    )
                }
                else -> {
                    CurrentPlanBanner(tierName = "Loading...", resetDate = "")
                }
            }
        }

        // Usage Rows
        item {
            when (usageState) {
                is SubscriptionViewModel.UsageState.Success -> {
                    val usage = (usageState as SubscriptionViewModel.UsageState.Success).usage
                    UsageRowsContainer(usage)
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

        // Upgrade CTA (Free users only)
        item {
            UpgradeCTA()
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
    resetDate: String = ""
) {
    val tierColor = when (tierName.lowercase()) {
        "lite" -> Colors.primary
        "standard" -> Color(0xFFA78BFA)
        else -> Color(0xFF8E9BAE)
    }
    
    // Parse reset date (format: YYYY-MM) to human readable (1 Jul 2026)
    val displayResetDate = try {
        val parts = resetDate.split("-")
        if (parts.size == 2) {
            val year = parts[0]
            val month = parts[1].toIntOrNull() ?: 1
            val monthName = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")[month - 1]
            "1 $monthName $year"
        } else {
            "Next month"
        }
    } catch (e: Exception) {
        "Next month"
    }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(top = Spacing.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(20.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = "Current Plan",
                    fontSize = 12.sp,
                    color = Colors.textMuted
                )
                Text(
                    text = tierName,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = tierColor
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "Resets",
                    fontSize = 12.sp,
                    color = Colors.textMuted
                )
                Text(
                    text = displayResetDate,
                    fontSize = 14.sp,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
private fun UsageRowsContainer(usage: SubscriptionViewModel.UsageData) {
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
                limit = usage.aiCoachingKmLimit,
                unit = "km",
                accentColor = Color(0xFF34D399),
                isUnlimited = usage.aiCoachingKmLimit == -1
            )
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            UsageRow(
                icon = Icons.Default.Description,
                title = "AI Run Summaries",
                usage = usage.postRunAnalysesUsed,
                limit = usage.postRunAnalysesLimit,
                unit = "summaries",
                accentColor = Color(0xFFF59E0B),
                isUnlimited = usage.postRunAnalysesLimit == -1
            )
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            UsageRow(
                icon = Icons.Default.Place,
                title = "AI Routes",
                usage = usage.routesGeneratedUsed,
                limit = usage.routesGeneratedLimit,
                unit = "routes",
                accentColor = Colors.primary,
                isUnlimited = usage.routesGeneratedLimit == -1
            )
            HorizontalDivider(color = Colors.border, thickness = 1.dp)
            UsageRow(
                icon = Icons.Default.DateRange,
                title = "AI Training Plans",
                usage = usage.trainingPlansUsed,
                limit = usage.trainingPlansLimit,
                unit = "plans",
                accentColor = Color(0xFFA78BFA),
                isUnlimited = usage.trainingPlansLimit == -1
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
    isUnlimited: Boolean = false
) {
    val progressValue = if (isUnlimited || limit <= 0) 0f else (usage.toFloat() / limit.toFloat()).coerceIn(0f, 1f)
    val barColor = when {
        isUnlimited -> accentColor
        usage >= limit -> Color(0xFFFF5252)
        usage >= (limit * 0.8f) -> Color(0xFFF59E0B)
        else -> accentColor
    }
    val countColor = when {
        isUnlimited -> Colors.textSecondary
        usage >= limit -> Color(0xFFFF5252)
        usage >= (limit * 0.8f) -> Color(0xFFF59E0B)
        else -> Colors.textSecondary
    }
    
    val displayText = if (isUnlimited) "Unlimited" else "$usage / $limit $unit"

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
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = accentColor
                    )
                }
                Text(
                    text = title,
                    fontSize = 16.sp,
                    color = Colors.textPrimary
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
private fun UpgradeCTA() {
    Button(
        onClick = { /* Switch to Plans tab */ },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(top = Spacing.xxl)
            .height(46.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
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
            text = "Upgrade for more",
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            color = Colors.buttonText
        )
    }
}

// Plan Data Model
data class PlanFeature(
    val text: String,
    val included: Boolean
)

data class PlanData(
    val name: String,
    val priceDisplay: String,
    val priceSuffix: String = "",
    val monthlyEquivalent: String = "",
    val accentColor: Color,
    val features: List<PlanFeature>
) {
    companion object {
        val FREE = PlanData(
            name = "Free",
            priceDisplay = "Free",
            priceSuffix = "",
            accentColor = Color(0xFF8E9BAE),
            features = listOf(
                PlanFeature("1 AI Run per month", true),
                PlanFeature("10km of AI Coaching per month", true),
                PlanFeature("5 AI Post-Run Summaries per month", true),
                PlanFeature("3 AI Route Generations per month", true),
                PlanFeature("No AI Training Plans", false)
            )
        )

        val LITE = PlanData(
            name = "Lite",
            priceDisplay = "$7.99",
            priceSuffix = "/month",
            monthlyEquivalent = "$6.67/month",
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
            priceDisplay = "$14.99",
            priceSuffix = "/month",
            monthlyEquivalent = "$12.50/month",
            accentColor = Color(0xFFA78BFA),
            features = listOf(
                PlanFeature("20 AI Runs per month", true),
                PlanFeature("200km of AI Coaching per month", true),
                PlanFeature("50 AI Post-Run Summaries per month", true),
                PlanFeature("30 AI Route Generations per month", true),
                PlanFeature("3 AI Training Plan generations per month", true)
            )
        )
    }
}

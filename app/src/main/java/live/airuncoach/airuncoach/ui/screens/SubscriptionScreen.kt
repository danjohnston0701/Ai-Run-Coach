package live.airuncoach.airuncoach.ui.screens

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.android.billingclient.api.ProductDetails
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModel

/**
 * Subscription/Premium features screen.
 * Displays available subscription options and allows users to purchase.
 */
@Composable
fun SubscriptionScreen(
    viewModel: SubscriptionViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit = {},
    onNavigateToLogin: () -> Unit = {},
    onBackClick: () -> Unit = {}
) {
    val subscriptions by viewModel.subscriptions.collectAsState()
    val billingConnectionState by viewModel.billingConnectionState.collectAsState()
    val context = LocalContext.current
    val activity = context as? Activity

    val isPremium = viewModel.isPremiumUser()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        // Top Bar with Back Button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
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
                text = "Premium Subscription",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.width(24.dp)) // Spacer for balance
        }

        if (billingConnectionState) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Colors.backgroundRoot),
                contentPadding = PaddingValues(16.dp)
            ) {
                // Header
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Choose Your Plan",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                            color = Colors.primary
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Select a plan to unlock AI coaching and personalized training",
                            fontSize = 14.sp,
                            color = Colors.textSecondary,
                            textAlign = TextAlign.Center
                        )
                    }
                }

                // Features Comparison
                item {
                    SubscriptionFeaturesComparison()
                }

                // Organize subscriptions by tier
                val liteSubscriptions = subscriptions.filter { sub ->
                    sub.productId.startsWith("lite_")
                }.sortedBy { it.productId }
                
                val standardSubscriptions = subscriptions.filter { sub ->
                    sub.productId.startsWith("standard_")
                }.sortedBy { it.productId }

                // Lite Tier Section
                if (liteSubscriptions.isNotEmpty()) {
                    item {
                        Text(
                            text = "Lite Plan",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Colors.textPrimary,
                            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
                        )
                    }
                    
                    item {
                        Text(
                            text = "Essential AI coaching features",
                            fontSize = 13.sp,
                            color = Colors.textSecondary,
                            modifier = Modifier.padding(bottom = 12.dp)
                        )
                    }
                    
                    items(liteSubscriptions.size) { index ->
                        SubscriptionCard(
                            productDetails = liteSubscriptions[index],
                            isPurchased = isPremium,
                            tier = "Lite",
                            onPurchaseClick = {
                                if (activity != null) {
                                    viewModel.purchaseSubscription(activity, liteSubscriptions[index])
                                }
                            }
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                    }
                }

                // Standard Tier Section
                if (standardSubscriptions.isNotEmpty()) {
                    item {
                        Text(
                            text = "Standard Plan",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Colors.textPrimary,
                            modifier = Modifier.padding(top = 20.dp, bottom = 8.dp)
                        )
                    }
                    
                    item {
                        Text(
                            text = "Full suite of AI coaching and analytics",
                            fontSize = 13.sp,
                            color = Colors.textSecondary,
                            modifier = Modifier.padding(bottom = 12.dp)
                        )
                    }
                    
                    items(standardSubscriptions.size) { index ->
                        SubscriptionCard(
                            productDetails = standardSubscriptions[index],
                            isPurchased = isPremium,
                            tier = "Standard",
                            onPurchaseClick = {
                                if (activity != null) {
                                    viewModel.purchaseSubscription(activity, standardSubscriptions[index])
                                }
                            }
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                    }
                }

                // Current Subscription Status
                if (isPremium) {
                    item {
                        CurrentSubscriptionStatusCard(viewModel = viewModel)
                    }
                }

                // Footer
                item {
                    Spacer(modifier = Modifier.height(32.dp))
                    Text(
                        text = "Subscriptions renew automatically. Cancel anytime in your Google Play settings.",
                        fontSize = 12.sp,
                        color = Colors.textMuted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                    )
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Loading subscription plans...",
                    color = Colors.textSecondary
                )
            }
        }
    }
}

/**
 * Shows features comparison between Lite and Standard tiers.
 */
@Composable
fun SubscriptionFeaturesComparison() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "What's Included",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.textPrimary,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            
            val freeFeatures = listOf(
                "✗ No AI Training Plans"
            )
            
            val liteFeatures = listOf(
                "1 AI Training Plan per month",
                "Basic performance tracking",
                "Weekly coaching tips",
                "Mobile app access"
            )
            
            val standardFeatures = listOf(
                "3 AI Training Plans per month",
                "Advanced training plan customization",
                "Real-time performance analytics",
                "Injury prevention recommendations",
                "Priority support",
                "Export training history"
            )
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Free Tier
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Free",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textMuted,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                    freeFeatures.forEach { feature ->
                        Text(
                            text = feature,
                            fontSize = 11.sp,
                            color = Colors.textMuted,
                            lineHeight = 14.sp
                        )
                    }
                }
                
                // Lite Features
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Lite",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                    liteFeatures.forEach { feature ->
                        Row(
                            modifier = Modifier.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = "Included",
                                tint = Colors.primary,
                                modifier = Modifier
                                    .size(14.dp)
                                    .padding(top = 2.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = feature,
                                fontSize = 11.sp,
                                color = Colors.textSecondary,
                                lineHeight = 14.sp
                            )
                        }
                    }
                }
                
                // Standard Features
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Standard",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                    standardFeatures.forEach { feature ->
                        Row(
                            modifier = Modifier.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = "Included",
                                tint = Colors.primary,
                                modifier = Modifier
                                    .size(14.dp)
                                    .padding(top = 2.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = feature,
                                fontSize = 11.sp,
                                color = Colors.textSecondary,
                                lineHeight = 14.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Individual subscription option card.
 */
@Composable
fun SubscriptionCard(
    productDetails: ProductDetails,
    isPurchased: Boolean,
    tier: String = "",
    onPurchaseClick: () -> Unit
) {
    val offerDetails = productDetails.subscriptionOfferDetails?.firstOrNull()
    val pricingPhase = offerDetails?.pricingPhases?.pricingPhaseList?.firstOrNull()
    
    // Determine if this is monthly or annual based on product ID
    val isMonthly = productDetails.productId.contains("monthly")
    val billingPeriod = if (isMonthly) "month" else "year"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        border = if (isPurchased)
            BorderStroke(width = 2.dp, color = Colors.primary)
        else null
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (isMonthly) "Monthly" else "Annual",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    if (!isMonthly) {
                        Text(
                            text = "Save 17%",
                            fontSize = 12.sp,
                            color = Colors.primary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                if (isPurchased) {
                    Surface(
                        color = Colors.primary,
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = "ACTIVE",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = androidx.compose.ui.graphics.Color.White,
                            modifier = Modifier.padding(6.dp, 4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Price
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = pricingPhase?.formattedPrice ?: "Loading...",
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.primary
                    )
                    Text(
                        text = "per $billingPeriod",
                        fontSize = 12.sp,
                        color = Colors.textSecondary
                    )
                }

                if (!isPurchased) {
                    Button(
                        onClick = onPurchaseClick,
                        modifier = Modifier.height(40.dp)
                    ) {
                        Text("Subscribe")
                    }
                }
            }
        }
    }
}

/**
 * Shows current subscription status for premium users.
 */
@Composable
fun CurrentSubscriptionStatusCard(viewModel: SubscriptionViewModel) {
    val activeSubscriptionId = viewModel.getActiveSubscriptionId()

    if (activeSubscriptionId != null) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            colors = CardDefaults.cardColors(
                containerColor = Colors.backgroundSecondary
            )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = "Your Subscription",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = activeSubscriptionId,
                    fontSize = 14.sp,
                    color = Colors.textSecondary
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Manage your subscription in Google Play Store settings",
                    fontSize = 12.sp,
                    color = Colors.textMuted
                )
            }
        }
    }
}

// Helper for border
@Composable
fun BorderStroke(width: androidx.compose.ui.unit.Dp, color: androidx.compose.ui.graphics.Color): androidx.compose.foundation.BorderStroke {
    return androidx.compose.foundation.BorderStroke(width, color)
}

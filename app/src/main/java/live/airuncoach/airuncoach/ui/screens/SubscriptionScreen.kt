package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.gson.JsonParser
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.PromoCodeRequest
import live.airuncoach.airuncoach.network.model.UsageResponse
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.DeleteAccountState
import live.airuncoach.airuncoach.viewmodel.DowngradeState

import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModel
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModelFactory
import retrofit2.HttpException
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

// ─────────────────────────────────────────────────────────────────────────────
// Promo code state machine
// ─────────────────────────────────────────────────────────────────────────────

sealed class PromoCodeState {
    object Idle : PromoCodeState()
    object Loading : PromoCodeState()
    data class Error(val message: String = "Promo Code is not valid.") : PromoCodeState()
    data class Success(val validUntil: String) : PromoCodeState()
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubscriptionScreen(
    onNavigateBack: () -> Unit,
    onNavigateToLogin: () -> Unit = {}
) {
    val context = LocalContext.current
    val viewModel: SubscriptionViewModel = viewModel(factory = SubscriptionViewModelFactory(context))
    val deleteAccountState by viewModel.deleteAccountState.collectAsState()
    val downgradeState by viewModel.downgradeState.collectAsState()
    val usage by viewModel.usage.collectAsState()

    // Dialog state machine:
    //   0 — no dialog
    //   1 — paid subscription warning (downgrade vs delete)
    //   2 — final irreversible delete confirmation
    var dialogStep by remember { mutableIntStateOf(0) }

    var selectedTab by remember { mutableIntStateOf(0) }
    var selectedTier by remember { mutableStateOf<String?>(null) }
    val tabs = listOf("Plans", "Usage")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Account Management",
                        style = AppTextStyles.h2,
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Colors.textPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                )
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0)
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Tab selector
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = Spacing.md),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.lg),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    tabs.forEachIndexed { index, tab ->
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { selectedTab = index },
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = tab,
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                color = if (selectedTab == index) Colors.textPrimary else Colors.textSecondary
                            )
                            if (selectedTab == index) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Box(
                                    modifier = Modifier
                                        .height(3.dp)
                                        .fillMaxWidth(0.6f)
                                        .background(Colors.primary, shape = RoundedCornerShape(2.dp))
                                )
                            }
                        }
                    }
                }
            }

            // PLANS TAB
            if (selectedTab == 0) {
                item {
                    Text(
                        text = "Choose a plan that fits your training",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(vertical = Spacing.md)
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }

                item {
                    TierCard(
                        name = "Free",
                        price = null,
                        badge = "CURRENT",
                        features = listOf(
                            "1 AI Run per month",
                            "5km of AI Coaching per month",
                            "1 AI Post-Run Summaries per month",
                            "1 AI Route Generations per month"
                        ),
                        isSelected = selectedTier == "free" || selectedTier == null,
                        onClick = { selectedTier = "free" }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }

                item {
                    TierCard(
                        name = "Lite",
                        price = "$9.99/month (USD)",
                        badge = null,
                        features = listOf(
                            "50km of AI Coaching per month",
                            "10 AI Post-Run Summaries per month",
                            "5 AI Route Generations per month",
                            "1 AI Training Plan generations per month"
                        ),
                        isSelected = selectedTier == "lite",
                        onClick = { selectedTier = "lite" }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }

                item {
                    TierCard(
                        name = "Standard",
                        price = "$14.99/month (USD)",
                        badge = "MOST POPULAR",
                        features = listOf(
                            "200km of AI Coaching per month",
                            "50 AI Post-Run Summaries per month",
                            "30 AI Route Generations per month",
                            "3 AI Training Plan generations per month"
                        ),
                        isSelected = selectedTier == "standard",
                        onClick = { selectedTier = "standard" }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }

                // Action button based on selected tier
                if (selectedTier != null && selectedTier != "free") {
                    item {
                        val buttonText = when (selectedTier) {
                            "lite" -> "Upgrade to Lite"
                            "standard" -> "Upgrade to Standard"
                            else -> "Subscribe Now"
                        }
                        
                        Button(
                            onClick = { /* TODO: wire up Google Play subscription */ },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
                            shape = RoundedCornerShape(BorderRadius.lg),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Colors.primary,
                                contentColor = Colors.buttonText
                            )
                        ) {
                            Text(buttonText, style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
                        }
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }
                }

                item {
                    Text(
                        text = "Pricing displayed in USD. You will be charged in your local currency.",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                    )
                    Spacer(modifier = Modifier.height(Spacing.xxxxl))
                }
            }

            // USAGE TAB
            if (selectedTab == 1) {
                item {
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        text = "Current Plan",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(Spacing.md)
                            .background(Colors.backgroundSecondary, shape = RoundedCornerShape(BorderRadius.lg))
                            .padding(Spacing.lg),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Free",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.textSecondary
                            )
                            Text(
                                text = "Resets 1 Jul 2026",
                                style = AppTextStyles.caption,
                                color = Colors.textMuted
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }

                item {
                    MonthlyUsageSection(usage = usage)
                    Spacer(modifier = Modifier.height(Spacing.lg))

                    Button(
                        onClick = { /* TODO: navigate to plans */ },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(BorderRadius.lg),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        )
                    ) {
                        Text("Upgrade for more", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
                    }
                    Spacer(modifier = Modifier.height(Spacing.xxxxl))
                }
            }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }
            item { CouponCodeSection() }

            // Danger zone
            item { Spacer(modifier = Modifier.height(Spacing.xxxxl)) }
            item {
                HorizontalDivider(color = Colors.border.copy(alpha = 0.4f))
                Spacer(modifier = Modifier.height(Spacing.xl))
            }
            item { DangerZoneSection(
                deleteAccountState = deleteAccountState,
                downgradeState = downgradeState,
                onDeleteTap = {
                    viewModel.resetDeleteState()
                    viewModel.resetDowngradeState()
                    dialogStep = if (viewModel.isOnPaidPlan) 1 else 2
                }
            ) }

            item { Spacer(modifier = Modifier.height(Spacing.xxxxl)) }
        }
    }

    // Step 1: Paid subscription warning
    if (dialogStep == 1) {
        SubscriptionWarningDialog(
            onKeepAccount = {
                dialogStep = 0
                viewModel.downgradeToFree(onDowngraded = onNavigateBack)
            },
            onDeleteAnyway = { dialogStep = 2 },
            onDismiss = { dialogStep = 0 }
        )
    }

    // Step 2: Final irreversible delete confirmation
    if (dialogStep == 2) {
        DeleteConfirmationDialog(
            onConfirm = {
                dialogStep = 0
                viewModel.deleteAccount(onAccountDeleted = onNavigateToLogin)
            },
            onDismiss = { dialogStep = 0 }
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Danger zone section
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DangerZoneSection(
    deleteAccountState: DeleteAccountState,
    downgradeState: DowngradeState,
    onDeleteTap: () -> Unit
) {
    val isWorking = deleteAccountState is DeleteAccountState.Loading ||
            downgradeState is DowngradeState.Loading

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Danger Zone",
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = Colors.error,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(
            text = "Deleting your account permanently removes all your data including run history, training plans, and goals. This action cannot be undone.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(Spacing.lg))

        if (deleteAccountState is DeleteAccountState.Error) {
            ErrorBanner(message = deleteAccountState.message)
            Spacer(modifier = Modifier.height(Spacing.md))
        }

        if (downgradeState is DowngradeState.Error) {
            ErrorBanner(message = downgradeState.message)
            Spacer(modifier = Modifier.height(Spacing.md))
        }

        OutlinedButton(
            onClick = onDeleteTap,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.error),
            border = androidx.compose.foundation.BorderStroke(1.dp, Colors.error.copy(alpha = 0.6f)),
            enabled = !isWorking
        ) {
            if (isWorking) {
                CircularProgressIndicator(
                    color = Colors.error,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp)
                )
            } else {
                Text(
                    "Delete Account",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.error.copy(alpha = 0.15f))
    ) {
        Text(
            text = message,
            style = AppTextStyles.small,
            color = Colors.error,
            modifier = Modifier.padding(Spacing.md),
            textAlign = TextAlign.Center
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert dialogs
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun SubscriptionWarningDialog(
    onKeepAccount: () -> Unit,
    onDeleteAnyway: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Colors.backgroundSecondary,
        icon = {
            Icon(
                Icons.Filled.Warning,
                contentDescription = null,
                tint = Color(0xFFFFD700),
                modifier = Modifier.size(36.dp)
            )
        },
        title = {
            Text(
                "You Have an Active Subscription",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Text(
                    "Deleting your account will immediately cancel your subscription with no refund for the remaining billing period.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(Spacing.xs))
                Text(
                    "You can keep your account and downgrade to the free tier instead — all your run history and data will be preserved.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center
                )
            }
        },
        confirmButton = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                Button(
                    onClick = onKeepAccount,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    ),
                    shape = RoundedCornerShape(BorderRadius.md)
                ) {
                    Text("Keep Account — Switch to Free", fontWeight = FontWeight.Bold)
                }
                OutlinedButton(
                    onClick = onDeleteAnyway,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.error),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Colors.error.copy(alpha = 0.6f)),
                    shape = RoundedCornerShape(BorderRadius.md)
                ) {
                    Text("Delete Account Anyway", fontWeight = FontWeight.Bold)
                }
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Cancel", color = Colors.textSecondary)
                }
            }
        },
        dismissButton = {}
    )
}

@Composable
private fun DeleteConfirmationDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    val bulletPoints = listOf(
        "All run history and GPS data",
        "Training plans and goals",
        "Performance analytics and AI insights",
        "Friends, clubs, and social activity",
        "Any active subscription (no refund)"
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Colors.backgroundSecondary,
        title = {
            Text(
                "Permanently Delete Account?",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                color = Colors.error,
                textAlign = TextAlign.Center
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Text(
                    "This will permanently and irreversibly delete your account and all associated data, including:",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
                bulletPoints.forEach { item ->
                    Row(
                        verticalAlignment = Alignment.Top,
                        modifier = Modifier.padding(start = Spacing.sm)
                    ) {
                        Text("•  ", style = AppTextStyles.body, color = Colors.textSecondary)
                        Text(item, style = AppTextStyles.body, color = Colors.textSecondary)
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.xs))
                Text(
                    "This action cannot be undone. There is no recovery.",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.error
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.error,
                    contentColor = Color.White
                ),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(BorderRadius.md)
            ) {
                Text("Yes, Delete Everything", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Colors.textSecondary)
            }
        }
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly usage meters
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun MonthlyUsageSection(usage: UsageResponse?) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.lg)
        ) {
            if (usage == null) {
                repeat(4) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(14.dp)
                            .clip(RoundedCornerShape(BorderRadius.sm))
                            .background(Colors.border.copy(alpha = 0.3f))
                    )
                    Spacer(modifier = Modifier.height(Spacing.xs))
                }
            } else {
                UsageMeter(
                    label = "AI Coaching",
                    unit = "km",
                    used = usage.usage.aiCoachingKm,
                    limit = usage.limits.aiCoachingKm
                )
                UsageMeter(
                    label = "Training Plans",
                    unit = "plans",
                    used = usage.usage.trainingPlansGenerated.toFloat(),
                    limit = usage.limits.trainingPlansGenerated?.toFloat()
                )
                UsageMeter(
                    label = "Route Generations",
                    unit = "routes",
                    used = usage.usage.routesGenerated.toFloat(),
                    limit = usage.limits.routesGenerated?.toFloat()
                )
                UsageMeter(
                    label = "Post-Run AI Analyses",
                    unit = "analyses",
                    used = usage.usage.postRunAnalyses.toFloat(),
                    limit = usage.limits.postRunAnalyses?.toFloat()
                )

                val parts = usage.yearMonth.split("-")
                val monthInt = parts.getOrNull(1)?.toIntOrNull() ?: 1
                val yearInt  = parts.getOrNull(0)?.toIntOrNull() ?: 2025
                val nextMonth = monthInt % 12 + 1
                val nextYear  = if (monthInt == 12) yearInt + 1 else yearInt
                val nextMonthName = java.time.Month.of(nextMonth)
                    .getDisplayName(java.time.format.TextStyle.FULL, Locale.getDefault())

                Text(
                    text = "Resets 1 $nextMonthName $nextYear",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
fun UsageMeter(
    label: String,
    unit: String,
    used: Float,
    limit: Float?   // null = Unlimited
) {
    val isUnlimited = limit == null
    val safeLimit = limit ?: 0f
    val progress = if (isUnlimited || safeLimit == 0f) 0f else (used / safeLimit).coerceIn(0f, 1f)
    val isNearLimit = !isUnlimited && progress >= 0.8f
    val isAtLimit   = !isUnlimited && progress >= 1f

    val barColor = when {
        isAtLimit   -> Colors.error
        isNearLimit -> Color(0xFFFFA000)
        else        -> Colors.primary
    }

    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = label,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                color = Colors.textPrimary
            )
            if (isUnlimited) {
                Text(
                    text = "Unlimited",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                    color = Colors.success
                )
            } else {
                val usedLabel = if (used == used.toLong().toFloat()) used.toInt().toString()
                                else "%.1f".format(used)
                val limitLabel = safeLimit.toInt().toString()
                Text(
                    text = "$usedLabel / $limitLabel $unit",
                    style = AppTextStyles.caption,
                    color = if (isAtLimit) Colors.error else Colors.textSecondary
                )
            }
        }

        if (!isUnlimited) {
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(BorderRadius.full)),
                color = barColor,
                trackColor = Colors.border.copy(alpha = 0.3f)
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Promo code section
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CouponCodeSection() {
    val context = LocalContext.current
    val sessionManager = remember { SessionManager(context) }
    val apiService = remember { RetrofitClient(context, sessionManager).instance }
    val coroutineScope = rememberCoroutineScope()

    var couponCode by remember { mutableStateOf("") }
    var promoState by remember { mutableStateOf<PromoCodeState>(PromoCodeState.Idle) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Text(
            text = "Have a promo code?",
            style = AppTextStyles.body,
            color = Colors.textSecondary
        )

        if (promoState is PromoCodeState.Error) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.error.copy(alpha = 0.15f)),
                shape = RoundedCornerShape(BorderRadius.md)
            ) {
                Text(
                    text = (promoState as PromoCodeState.Error).message,
                    style = AppTextStyles.caption,
                    color = Colors.error,
                    modifier = Modifier.padding(Spacing.sm),
                    textAlign = TextAlign.Center
                )
            }
        }

        if (promoState is PromoCodeState.Success) {
            val successState = promoState as PromoCodeState.Success
            val expirationDate = try {
                val calendar = Calendar.getInstance()
                val dateFormat = SimpleDateFormat("MMM d, yyyy", Locale.getDefault())
                val instant = java.time.Instant.parse(successState.validUntil)
                calendar.timeInMillis = instant.toEpochMilli()
                dateFormat.format(calendar.time)
            } catch (_: Exception) {
                successState.validUntil
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.success.copy(alpha = 0.15f)),
                shape = RoundedCornerShape(BorderRadius.md)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Spacing.sm),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    Text(
                        text = "Promo Code has been applied to your account",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = Colors.success,
                        textAlign = TextAlign.Center
                    )
                    Text(
                        text = "Valid until $expirationDate",
                        style = AppTextStyles.caption,
                        color = Colors.success,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = couponCode,
                onValueChange = { newValue ->
                    couponCode = newValue
                    if (promoState !is PromoCodeState.Success) {
                        promoState = PromoCodeState.Idle
                    }
                },
                label = { Text("Enter code") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Colors.textPrimary,
                    cursorColor = Colors.primary,
                    focusedBorderColor = if (promoState is PromoCodeState.Error) Colors.error else Colors.primary,
                    unfocusedBorderColor = if (promoState is PromoCodeState.Error) Colors.error else Colors.textMuted,
                    disabledBorderColor = Colors.textMuted
                ),
                enabled = promoState !is PromoCodeState.Loading && promoState !is PromoCodeState.Success,
                isError = promoState is PromoCodeState.Error
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Button(
                onClick = {
                    if (couponCode.isNotBlank()) {
                        promoState = PromoCodeState.Loading
                        coroutineScope.launch {
                            try {
                                val response = apiService.redeemPromoCode(
                                    PromoCodeRequest(code = couponCode)
                                )
                                if (response.success && response.grantedUntil != null) {
                                    promoState = PromoCodeState.Success(validUntil = response.grantedUntil)
                                    couponCode = ""
                                } else {
                                    promoState = PromoCodeState.Error(
                                        response.message.ifBlank { "Promo Code is not valid." }
                                    )
                                }
                            } catch (e: HttpException) {
                                val serverMsg = try {
                                    val body = e.response()?.errorBody()?.string() ?: ""
                                    JsonParser.parseString(body)
                                        .asJsonObject.get("message")?.asString
                                } catch (_: Exception) { null }
                                promoState = PromoCodeState.Error(
                                    serverMsg ?: "Promo Code is not valid."
                                )
                            } catch (_: Exception) {
                                promoState = PromoCodeState.Error("Promo Code is not valid.")
                            }
                        }
                    }
                },
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary.copy(alpha = 0.5f),
                    contentColor = Colors.buttonText
                ),
                enabled = couponCode.isNotBlank() &&
                        promoState !is PromoCodeState.Loading &&
                        promoState !is PromoCodeState.Success
            ) {
                if (promoState is PromoCodeState.Loading) {
                    CircularProgressIndicator(
                        color = Colors.buttonText,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(16.dp)
                    )
                } else {
                    Text("Redeem")
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Header + feature + plan composables
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun TierCard(
    name: String,
    price: String? = null,
    badge: String? = null,
    features: List<String>,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 2.dp,
                color = if (isSelected) Colors.primary else Colors.border.copy(alpha = 0.3f),
                shape = RoundedCornerShape(BorderRadius.lg)
            )
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            // Header with name, price and badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    modifier = Modifier.weight(1f)
                ) {
                    RadioButton(
                        selected = isSelected,
                        onClick = onClick,
                        colors = RadioButtonDefaults.colors(
                            selectedColor = Colors.primary,
                            unselectedColor = Colors.textMuted
                        )
                    )
                    Column {
                        Text(
                            text = name,
                            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        if (price != null) {
                            Text(
                                text = price,
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                                color = Colors.textSecondary
                            )
                        }
                    }
                }
                if (badge != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(BorderRadius.full))
                            .background(Color(0xFF6366F1).copy(alpha = 0.2f))
                            .padding(horizontal = Spacing.sm, vertical = Spacing.xs)
                    ) {
                        Text(
                            text = badge,
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                            color = Color(0xFF6366F1)
                        )
                    }
                }
            }

            // Feature list
            HorizontalDivider(color = Colors.border.copy(alpha = 0.2f))
            
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                features.forEach { feature ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_check_vector),
                            contentDescription = null,
                            tint = if (isSelected) Colors.primary else Color(0xFF4F46E5),
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = feature,
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
        }
    }
}

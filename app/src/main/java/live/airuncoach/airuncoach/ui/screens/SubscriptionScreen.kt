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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import live.airuncoach.airuncoach.viewmodel.Plan
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
    val plans by viewModel.plans.collectAsState()
    val selectedPlan by viewModel.selectedPlan.collectAsState()
    val deleteAccountState by viewModel.deleteAccountState.collectAsState()
    val downgradeState by viewModel.downgradeState.collectAsState()
    val usage by viewModel.usage.collectAsState()

    // Dialog state machine:
    //   0 — no dialog
    //   1 — paid subscription warning (downgrade vs delete)
    //   2 — final irreversible delete confirmation
    var dialogStep by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "My Account",
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
            item { PremiumHeader() }
            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            item { SectionTitle(title = "Unlock Premium Features") }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
            item { PremiumFeature(icon = R.drawable.icon_mic_vector, title = "AI Coach", description = "Personalized real-time coaching") }
            item { PremiumFeature(icon = R.drawable.icon_navigation_vector, title = "Unlimited Routes", description = "Generate unlimited AI routes") }
            item { PremiumFeature(icon = R.drawable.icon_people_vector, title = "Group Runs", description = "Create and join group runs") }
            item { PremiumFeature(icon = R.drawable.icon_chart_vector, title = "Advanced Analytics", description = "Detailed performance insights") }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }
            item { SectionTitle(title = "Choose Your Plan") }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }

            items(plans) { plan ->
                PlanSelector(
                    plan = plan,
                    isSelected = plan == selectedPlan,
                    onClick = { viewModel.selectPlan(plan) }
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
            }

            // Monthly usage meters
            item { Spacer(modifier = Modifier.height(Spacing.lg)) }
            item { SectionTitle(title = "This Month's Usage") }
            item { Spacer(modifier = Modifier.height(Spacing.sm)) }
            item { MonthlyUsageSection(usage = usage) }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            item {
                Button(
                    onClick = { /* TODO: wire up payment processor */ },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    )
                ) {
                    Text("Subscribe Now", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
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
                isOnPaidPlan = viewModel.isOnPaidPlan,
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
    isOnPaidPlan: Boolean,
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
fun PremiumHeader() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_crown_vector),
            contentDescription = "Premium",
            tint = Color(0xFFFFD700),
            modifier = Modifier.size(60.dp)
        )
        Text(
            text = "Upgrade to Premium",
            style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Text(
            text = "Unlock the full potential of your AI running coach",
            style = AppTextStyles.body,
            color = Colors.textSecondary
        )
    }
}

@Composable
fun PremiumFeature(icon: Int, title: String, description: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Colors.backgroundSecondary),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(id = icon),
                contentDescription = title,
                tint = Colors.primary,
                modifier = Modifier.size(24.dp)
            )
        }
        Spacer(modifier = Modifier.width(Spacing.md))
        Column {
            Text(
                text = title,
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Text(
                text = description,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
        }
    }
}

@Composable
fun PlanSelector(plan: Plan, isSelected: Boolean, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 2.dp,
                color = if (isSelected) Colors.primary else Color.Transparent,
                shape = RoundedCornerShape(BorderRadius.md)
            )
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(
                    selected = isSelected,
                    onClick = onClick,
                    colors = RadioButtonDefaults.colors(
                        selectedColor = Colors.primary,
                        unselectedColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Column {
                    Text(
                        text = plan.name,
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = plan.price,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }
            if (plan.discount != null) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(BorderRadius.full))
                        .background(Colors.success.copy(alpha = 0.2f))
                        .padding(horizontal = Spacing.sm, vertical = Spacing.xs)
                ) {
                    Text(
                        text = plan.discount,
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = Colors.success
                    )
                }
            }
        }
    }
}

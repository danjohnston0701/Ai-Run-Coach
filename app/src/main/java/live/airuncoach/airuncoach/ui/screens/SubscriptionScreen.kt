
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.DeleteAccountState
import live.airuncoach.airuncoach.viewmodel.DowngradeState
import live.airuncoach.airuncoach.viewmodel.Plan
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModel
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModelFactory

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

    // Dialog state machine:
    //   Step 0 — no dialog
    //   Step 1 — paid plan warning (downgrade vs delete choice)
    //   Step 2 — final irreversible delete confirmation
    var dialogStep by remember { mutableIntStateOf(0) }

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

            items(plans.size) { index ->
                val plan = plans[index]
                PlanSelector(plan = plan, isSelected = plan == selectedPlan, onClick = { viewModel.selectPlan(plan) })
                Spacer(modifier = Modifier.height(Spacing.sm))
            }

            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            item {
                Button(
                    onClick = { /* TODO: Handle subscription */ },
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

            // ── Account Deletion ─────────────────────────────────────────────────
            item { Spacer(modifier = Modifier.height(Spacing.xxxxl)) }

            item {
                HorizontalDivider(color = Colors.border.copy(alpha = 0.4f))
                Spacer(modifier = Modifier.height(Spacing.xl))
            }

            item {
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

                    // Show error if deletion failed
                    if (deleteAccountState is DeleteAccountState.Error) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = Spacing.md),
                            colors = CardDefaults.cardColors(
                                containerColor = Colors.error.copy(alpha = 0.15f)
                            )
                        ) {
                            Text(
                                text = (deleteAccountState as DeleteAccountState.Error).message,
                                style = AppTextStyles.small,
                                color = Colors.error,
                                modifier = Modifier.padding(Spacing.md),
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    // Show error if downgrade failed
                    if (downgradeState is DowngradeState.Error) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = Spacing.md),
                            colors = CardDefaults.cardColors(
                                containerColor = Colors.error.copy(alpha = 0.15f)
                            )
                        ) {
                            Text(
                                text = (downgradeState as DowngradeState.Error).message,
                                style = AppTextStyles.small,
                                color = Colors.error,
                                modifier = Modifier.padding(Spacing.md),
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    val isWorking = deleteAccountState is DeleteAccountState.Loading ||
                            downgradeState is DowngradeState.Loading

                    OutlinedButton(
                        onClick = {
                            viewModel.resetDeleteState()
                            viewModel.resetDowngradeState()
                            // If user is on a paid plan, show the subscription warning first
                            dialogStep = if (viewModel.isOnPaidPlan) 1 else 2
                        },
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

            item { Spacer(modifier = Modifier.height(Spacing.xxxxl)) }
        }
    }

    // ── Step 1: Paid subscription warning ────────────────────────────────────
    // Shown when user has an active paid plan. Offers a "keep account / downgrade"
    // path before they can proceed to delete.
    if (dialogStep == 1) {
        AlertDialog(
            onDismissRequest = { dialogStep = 0 },
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
                    // Primary action: keep account, downgrade to free
                    Button(
                        onClick = {
                            dialogStep = 0
                            viewModel.downgradeToFree(onDowngraded = onNavigateBack)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        ),
                        shape = RoundedCornerShape(BorderRadius.md)
                    ) {
                        Text("Keep Account — Switch to Free", fontWeight = FontWeight.Bold)
                    }

                    // Secondary action: proceed to the irreversible confirmation
                    OutlinedButton(
                        onClick = { dialogStep = 2 },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.error),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Colors.error.copy(alpha = 0.6f)),
                        shape = RoundedCornerShape(BorderRadius.md)
                    ) {
                        Text("Delete Account Anyway", fontWeight = FontWeight.Bold)
                    }

                    TextButton(
                        onClick = { dialogStep = 0 },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Cancel", color = Colors.textSecondary)
                    }
                }
            },
            dismissButton = {}
        )
    }

    // ── Step 2: Final irreversible delete confirmation ────────────────────────
    if (dialogStep == 2) {
        AlertDialog(
            onDismissRequest = { dialogStep = 0 },
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
                    val items = listOf(
                        "All run history and GPS data",
                        "Training plans and goals",
                        "Performance analytics and AI insights",
                        "Friends, clubs, and social activity",
                        "Any active subscription (no refund)"
                    )
                    items.forEach { item ->
                        Row(
                            verticalAlignment = Alignment.Top,
                            modifier = Modifier.padding(start = Spacing.sm)
                        ) {
                            Text(
                                "•  ",
                                style = AppTextStyles.body,
                                color = Colors.textSecondary
                            )
                            Text(
                                item,
                                style = AppTextStyles.body,
                                color = Colors.textSecondary
                            )
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
                    onClick = {
                        dialogStep = 0
                        viewModel.deleteAccount(onAccountDeleted = onNavigateToLogin)
                    },
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
                TextButton(onClick = { dialogStep = 0 }) {
                    Text("Cancel", color = Colors.textSecondary)
                }
            }
        )
    }
}

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
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        )
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CouponCodeSection() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Text(
            text = "Have a coupon code?",
            style = AppTextStyles.body,
            color = Colors.textSecondary
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = "",
                onValueChange = {},
                label = { Text("Enter code") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Colors.textPrimary,
                    cursorColor = Colors.primary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Colors.textMuted,
                    disabledBorderColor = Colors.textMuted
                )
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Button(
                onClick = { /* TODO: Redeem code */ },
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary.copy(alpha = 0.5f),
                    contentColor = Colors.buttonText
                )
            ) {
                Text("Redeem")
            }
        }
    }
}

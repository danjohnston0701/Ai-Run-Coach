
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
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.Plan
import live.airuncoach.airuncoach.viewmodel.SubscriptionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubscriptionScreen(onNavigateBack: () -> Unit) {
    val viewModel: SubscriptionViewModel = viewModel()
    val plans by viewModel.plans.collectAsState()
    val selectedPlan by viewModel.selectedPlan.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Subscription") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundRoot)
                .padding(Spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            item { PremiumHeader() }
            item { Spacer(modifier = Modifier.height(Spacing.lg)) }

            item { SectionTitle(title = "Unlock Premium Features") }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
            item { PremiumFeature(icon = R.drawable.icon_profile_vector, title = "AI Coach", description = "Personalized real-time coaching") }
            item { PremiumFeature(icon = R.drawable.icon_play_vector, title = "Unlimited Routes", description = "Generate unlimited AI routes") }
            item { PremiumFeature(icon = R.drawable.icon_profile_vector, title = "Group Runs", description = "Create and join group runs") }
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
        }
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

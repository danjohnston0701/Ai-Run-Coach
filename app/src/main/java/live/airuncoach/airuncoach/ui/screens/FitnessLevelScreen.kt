
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.FitnessLevelViewModel
import live.airuncoach.airuncoach.viewmodel.FitnessLevelViewModelFactory

/**
 * Fitness level selection screen.
 *
 * @param onNavigateBack  Called when the back arrow is tapped (or when saving in settings mode).
 * @param onNavigateNext  Called after saving when [isOnboarding] is true — navigates forward in the
 *                        onboarding flow instead of popping the back stack.
 * @param isOnboarding    When true the screen shows an onboarding header and a "Continue" CTA
 *                        instead of "Save Changes", and calls [onNavigateNext] on confirm.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FitnessLevelScreen(
    onNavigateBack: () -> Unit,
    onNavigateNext: (() -> Unit)? = null,
    isOnboarding: Boolean = false
) {
    val context = LocalContext.current
    val viewModel: FitnessLevelViewModel = viewModel(factory = FitnessLevelViewModelFactory(context))
    val fitnessLevel by viewModel.fitnessLevel.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Fitness Level", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0) // outer Scaffold already applies nav bar insets
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Spacing.lg)
        ) {
            item {
                if (isOnboarding) {
                    Text(
                        "Almost there!",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    Text(
                        "This is one of the most important inputs for your AI coach. " +
                        "Knowing your current fitness level helps us set realistic training " +
                        "paces and volumes from day one — especially if you haven't synced " +
                        "any runs yet.",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                    Spacer(modifier = Modifier.height(Spacing.lg))
                } else {
                    SectionTitle(title = "Select Your Fitness Level")
                }
                Spacer(modifier = Modifier.height(Spacing.md))
            }
            items(viewModel.fitnessLevels.size) { index ->
                val level = viewModel.fitnessLevels[index]
                val description = viewModel.fitnessLevelDescriptions[level] ?: ""
                FitnessLevelSelector(
                    level = level,
                    description = description,
                    isSelected = level == fitnessLevel,
                    onClick = { viewModel.onFitnessLevelChanged(level) }
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
            item {
                Spacer(modifier = Modifier.height(Spacing.xl))
                Button(
                    onClick = {
                        viewModel.saveFitnessLevel()
                        if (isOnboarding && onNavigateNext != null) {
                            onNavigateNext()
                        } else {
                            onNavigateBack()
                        }
                    },
                    enabled = fitnessLevel.isNotBlank(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text(
                        if (isOnboarding) "Continue" else "Save Changes",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                    )
                }
                if (isOnboarding) {
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    androidx.compose.material3.TextButton(
                        onClick = {
                            // Allow skipping — profile remains blank, plan screen will surface a reminder
                            if (onNavigateNext != null) onNavigateNext() else onNavigateBack()
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Skip for now", style = AppTextStyles.body, color = Colors.textMuted)
                    }
                }
            }
        }
    }
}

@Composable
fun FitnessLevelSelector(
    level: String,
    description: String = "",
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) Colors.primary.copy(alpha = 0.2f) else Colors.backgroundSecondary
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = level,
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                if (description.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = description,
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }
            if (isSelected) {
                RadioButton(
                    selected = true,
                    onClick = {},
                    colors = RadioButtonDefaults.colors(selectedColor = Colors.primary)
                )
            }
        }
    }
}

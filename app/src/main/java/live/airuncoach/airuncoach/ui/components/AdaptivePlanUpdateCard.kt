package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.network.model.PendingAdaptation
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * Adaptive Plan Update Card
 * 
 * Displays pending AI coaching plan adaptations with accept/decline buttons.
 * Shows the wand icon, reasoning, and action buttons matching the iOS design.
 * 
 * Features:
 * - Displays a single pending adaptation or shows "loading" state
 * - Shows the AI's reasoning for the suggested changes
 * - Accept and Decline buttons with distinct styling
 * - Loading and error states
 */
@Composable
fun AdaptivePlanUpdateCard(
    adaptation: PendingAdaptation?,
    modifier: Modifier = Modifier,
    isLoading: Boolean = false,
    onAccept: (String) -> Unit = {},
    onDecline: (String) -> Unit = {},
) {
    if (adaptation == null && !isLoading) {
        return // Don't show anything if no adaptation and not loading
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp)),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary,
            contentColor = Colors.textPrimary
        ),
        shape = RoundedCornerShape(16.dp),
        border = null
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            // Header with wand icon and title
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.AutoAwesome,
                    contentDescription = "Adaptive Plan Update",
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = "Adaptive Plan Update",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary,
                    fontSize = 16.sp
                )
            }

            if (isLoading) {
                // Loading state
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(80.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(32.dp),
                        color = Colors.primary,
                        strokeWidth = 2.dp
                    )
                }
            } else if (adaptation != null) {
                // AI Suggestion text
                Text(
                    text = adaptation.aiSuggestion ?: "AI analysis for upcoming workouts",
                    style = AppTextStyles.body,
                    color = Colors.textPrimary,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )

                // Changes count badge (if available)
                if (adaptation.changes != null && adaptation.changes.isNotEmpty()) {
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Colors.primary.copy(alpha = 0.1f)),
                        color = Colors.primary.copy(alpha = 0.1f)
                    ) {
                        Text(
                            text = "Affects ${adaptation.changes.size} upcoming workouts",
                            style = AppTextStyles.caption,
                            color = Colors.primary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(8.dp, 4.dp)
                        )
                    }
                }

                // Action buttons
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    // Decline button - outlined style
                    OutlinedButton(
                        onClick = { onDecline(adaptation.id) },
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Colors.textSecondary
                        ),
                        border = ButtonDefaults.outlinedButtonBorder.copy(
                            width = 1.dp
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(
                            text = "Decline",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    // Accept button - filled style with checkmark
                    Button(
                        onClick = { onAccept(adaptation.id) },
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.success.copy(alpha = 0.85f),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "✓",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Accept Changes",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Adaptive Plan Update Section
 * 
 * Full-featured section for displaying adaptations in the run summary.
 * Handles multiple adaptations with carousel-like display.
 */
@Composable
fun AdaptivePlanUpdateSection(
    adaptations: List<PendingAdaptation>,
    modifier: Modifier = Modifier,
    isLoading: Boolean = false,
    onAccept: (String) -> Unit = {},
    onDecline: (String) -> Unit = {},
) {
    if (adaptations.isEmpty() && !isLoading) {
        return // Don't show anything if no adaptations and not loading
    }

    var selectedAdaptationIndex by remember { mutableIntStateOf(0) }
    val selectedAdaptation = if (selectedAdaptationIndex < adaptations.size) {
        adaptations[selectedAdaptationIndex]
    } else {
        null
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        // Show count of pending adaptations (only if more than 1)
        if (adaptations.size > 1) {
            Text(
                text = "${adaptations.size} pending adaptations",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
        }

        // Main adaptation card
        AdaptivePlanUpdateCard(
            adaptation = selectedAdaptation,
            isLoading = isLoading,
            onAccept = onAccept,
            onDecline = onDecline
        )

        // Pagination indicator (only if more than 1)
        if (adaptations.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                repeat(adaptations.size) { index ->
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(
                                if (index == selectedAdaptationIndex) {
                                    Colors.primary
                                } else {
                                    Colors.primary.copy(alpha = 0.3f)
                                }
                            )
                    )
                    if (index < adaptations.size - 1) {
                        Spacer(modifier = Modifier.width(6.dp))
                    }
                }
            }
        }
    }
}

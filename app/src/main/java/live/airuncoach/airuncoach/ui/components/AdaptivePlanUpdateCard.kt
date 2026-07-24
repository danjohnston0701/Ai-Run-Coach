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
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary,
            contentColor = Colors.textPrimary
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header with wand icon and title
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.AutoAwesome,
                    contentDescription = "Adaptive Plan Update",
                    tint = Colors.primary,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = "Adaptive Plan Update",
                    style = AppTextStyles.h4,
                    fontWeight = FontWeight.SemiBold,
                    color = Colors.textPrimary,
                    fontSize = 15.sp
                )
            }

            if (isLoading) {
                // Loading state
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(60.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(28.dp),
                        color = Colors.primary,
                        strokeWidth = 2.dp
                    )
                }
            } else if (adaptation != null) {
                // AI Suggestion text — the meat of the card
                // This is the personalized AI reasoning, so it should be prominent
                if (!adaptation.aiSuggestion.isNullOrBlank()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        // AI emoji/icon to match iOS style
                        Text(
                            text = "🧠",
                            fontSize = 14.sp,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                        Text(
                            text = adaptation.aiSuggestion,
                            style = AppTextStyles.body,
                            color = Colors.textPrimary,
                            fontSize = 13.sp,
                            lineHeight = 18.sp,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                // Action buttons — more prominent spacing
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Decline button - outlined style
                    OutlinedButton(
                        onClick = { onDecline(adaptation.id) },
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Colors.textSecondary
                        ),
                        border = ButtonDefaults.outlinedButtonBorder.copy(width = 1.dp),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(
                            text = "Decline",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    // Accept button - filled cyan/teal to match iOS
                    Button(
                        onClick = { onAccept(adaptation.id) },
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF00BCD4),  // Cyan to match iOS
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "✓",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Accept Changes",
                                fontSize = 13.sp,
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
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Main adaptation card (shows first adaptation if multiple exist)
        AdaptivePlanUpdateCard(
            adaptation = selectedAdaptation,
            isLoading = isLoading,
            onAccept = onAccept,
            onDecline = onDecline
        )

        // Simple pagination indicator (only if more than 1 adaptation)
        if (adaptations.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
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
                                    Colors.primary.copy(alpha = 0.25f)
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

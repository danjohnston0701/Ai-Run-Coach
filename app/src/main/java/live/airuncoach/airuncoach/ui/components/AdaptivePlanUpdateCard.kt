package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.network.model.PendingAdaptation
import live.airuncoach.airuncoach.ui.screens.AdaptationCard
import live.airuncoach.airuncoach.ui.theme.Colors

/**
 * Adaptive Plan Update Section
 *
 * Full-featured section for displaying adaptations in the run summary.
 * Handles multiple adaptations with carousel-like display.
 *
 * Renders each adaptation with the same [AdaptationCard] used on the dedicated
 * Adaptations screen (AdaptationReviewScreen) — not a separate bespoke layout —
 * so the run-summary presentation (header/reason, date, status badge, full AI
 * suggestion text, changes breakdown, accept/decline buttons) always matches it.
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
    val selectedAdaptation = adaptations.getOrNull(selectedAdaptationIndex)

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (selectedAdaptation == null) {
            // Loading, or index momentarily out of range — same card shell as AdaptationCard
            // so the loading state doesn't look like a different component.
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                shape = RoundedCornerShape(12.dp)
            ) {
                Box(
                    modifier = Modifier.fillMaxWidth().height(80.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp), color = Colors.primary, strokeWidth = 2.dp)
                }
            }
        } else {
            AdaptationCard(
                adaptation = selectedAdaptation,
                onAccept = { onAccept(selectedAdaptation.id) },
                onDecline = { onDecline(selectedAdaptation.id) }
            )
        }

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

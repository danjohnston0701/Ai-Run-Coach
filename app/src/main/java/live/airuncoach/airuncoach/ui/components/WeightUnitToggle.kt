package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.utils.WeightUnit

/** kg | lb switch shown next to a body-weight field. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WeightUnitToggle(unit: WeightUnit, onUnitChange: (WeightUnit) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        WeightUnit.entries.forEach { option ->
            FilterChip(
                selected = unit == option,
                onClick = { if (unit != option) onUnitChange(option) },
                label = { Text(option.label) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Colors.primary.copy(alpha = 0.2f),
                    selectedLabelColor = Colors.primary,
                    labelColor = Colors.textSecondary,
                ),
            )
        }
    }
}

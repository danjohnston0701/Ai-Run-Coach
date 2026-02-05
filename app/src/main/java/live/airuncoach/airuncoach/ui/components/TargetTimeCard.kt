package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@Composable
fun TargetTimeCard(
    isEnabled: Boolean,
    onEnabledChange: (Boolean) -> Unit,
    hours: String,
    minutes: String,
    seconds: String,
    onHoursChange: (String) -> Unit,
    onMinutesChange: (String) -> Unit,
    onSecondsChange: (String) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.8f)
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Clock icon with background
                Box(
                    modifier = Modifier
                        .size(50.dp)
                        .clip(CircleShape)
                        .background(Colors.backgroundTertiary),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_timer_vector),
                        contentDescription = "Target Time",
                        tint = Colors.primary,
                        modifier = Modifier.size(28.dp)
                    )
                }
                
                Spacer(modifier = Modifier.width(Spacing.md))
                
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "TARGET TIME",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = if (isEnabled) "Set your goal time" else "Tap to enable",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
                
                // Toggle switch styled
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(BorderRadius.full))
                        .clickable { onEnabledChange(!isEnabled) }
                        .background(if (isEnabled) Colors.primary else Colors.backgroundTertiary)
                        .padding(horizontal = Spacing.md, vertical = Spacing.sm),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isEnabled) "ON" else "OFF",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = if (isEnabled) Colors.buttonText else Colors.textMuted
                    )
                }
            }
            
            if (isEnabled) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.Bottom
                ) {
                    TimePickerColumn(value = hours, label = "HOURS", onValueChange = onHoursChange)
                    Text(
                        text = ":",
                        style = AppTextStyles.h2,
                        color = Colors.textMuted,
                        modifier = Modifier.padding(bottom = 4.dp, start = 4.dp, end = 4.dp)
                    )
                    TimePickerColumn(value = minutes, label = "MINUTES", onValueChange = onMinutesChange)
                    Text(
                        text = ":",
                        style = AppTextStyles.h2,
                        color = Colors.textMuted,
                        modifier = Modifier.padding(bottom = 4.dp, start = 4.dp, end = 4.dp)
                    )
                    TimePickerColumn(value = seconds, label = "SECONDS", onValueChange = onSecondsChange)
                }
            }
        }
    }
}

@Composable
fun TimePickerColumn(value: String, label: String, onValueChange: (String) -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            style = AppTextStyles.caption.copy(
                fontSize = androidx.compose.ui.unit.TextUnit(9f, androidx.compose.ui.unit.TextUnitType.Sp),
                fontWeight = FontWeight.Medium
            ),
            color = Colors.textMuted
        )
        Box(
            modifier = Modifier
                .size(width = 48.dp, height = 40.dp)
                .clip(RoundedCornerShape(BorderRadius.sm))
                .background(Colors.backgroundTertiary)
                .clickable { /* Could open number picker dialog */ },
            contentAlignment = Alignment.Center
        ) {
            androidx.compose.foundation.text.BasicTextField(
                value = value,
                onValueChange = onValueChange,
                textStyle = AppTextStyles.h3.copy(
                    color = Colors.primary,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    fontWeight = FontWeight.Bold
                ),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                ),
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(Colors.primary)
            )
        }
    }
}

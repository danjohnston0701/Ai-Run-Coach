package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.network.model.WeekDetails
import live.airuncoach.airuncoach.network.model.WorkoutDetails
import live.airuncoach.airuncoach.network.model.WorkoutScheduleUpdate
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import java.text.SimpleDateFormat
import java.util.*

/**
 * Represents a workout with its current and proposed schedule
 */
data class ScheduleEditState(
    val workout: WorkoutDetails,
    val currentDay: Int,  // 0=Sun, 1=Mon, etc.
    val currentDate: String,  // ISO date
    var selectedDay: Int = -1,  // -1 means not changed
    var selectedDate: String? = null
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangeScheduleDialog(
    week: WeekDetails,
    planCreatedAt: String?,
    onDismiss: () -> Unit,
    onConfirm: (weekNumber: Int, updates: List<WorkoutScheduleUpdate>) -> Unit,
    isLoading: Boolean = false
) {
    var editStates by remember {
        mutableStateOf(
            week.workouts.map { workout ->
                ScheduleEditState(
                    workout = workout,
                    currentDay = workout.dayOfWeek,
                    currentDate = workout.scheduledDate ?: ""
                )
            }
        )
    }

    val dayNames = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
    
    // Calculate week start date for context
    val weekStartDate = remember {
        calculateWeekStartDate(planCreatedAt, week.weekNumber)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(
                    "Change Schedule",
                    style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Week ${week.weekNumber}",
                    style = AppTextStyles.small,
                    color = Colors.textMuted
                )
            }
        },
        text = {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                items(editStates) { editState ->
                    ScheduleEditRow(
                        editState = editState,
                        dayNames = dayNames,
                        weekStartDate = weekStartDate,
                        onChange = { newDay, newDate ->
                            editStates = editStates.map {
                                if (it.workout.id == editState.workout.id) {
                                    it.copy(selectedDay = newDay, selectedDate = newDate)
                                } else it
                            }
                        }
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    // Collect only changed workouts
                    val updates = editStates
                        .filter { it.selectedDay != -1 }
                        .map { state ->
                            WorkoutScheduleUpdate(
                                workoutId = state.workout.id,
                                dayOfWeek = state.selectedDay,
                                scheduledDate = state.selectedDate ?: state.currentDate
                            )
                        }
                    onConfirm(week.weekNumber, updates)
                },
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                enabled = !isLoading && editStates.any { it.selectedDay != -1 }
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = Colors.buttonText,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(
                    if (isLoading) "Saving..." else "Apply Changes",
                    color = Colors.buttonText
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isLoading
            ) {
                Text("Cancel", color = Colors.textPrimary)
            }
        },
        containerColor = Colors.backgroundSecondary,
        modifier = Modifier.clip(RoundedCornerShape(16.dp))
    )
}

@Composable
private fun ScheduleEditRow(
    editState: ScheduleEditState,
    dayNames: List<String>,
    weekStartDate: Calendar?,
    onChange: (newDay: Int, newDate: String) -> Unit
) {
    val dayName = dayNames.getOrElse(editState.currentDay % 7) { "Day" }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Colors.backgroundTertiary, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundRoot),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            // Current session info
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        editState.workout.description
                            ?: workoutTypeLabel(editState.workout.workoutType),
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary,
                        maxLines = 1
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "Currently: $dayName",
                            style = AppTextStyles.small,
                            color = Colors.textMuted
                        )
                        if (editState.workout.distance != null) {
                            Text(
                                "${editState.workout.distance}km",
                                style = AppTextStyles.small,
                                color = Colors.textMuted
                            )
                        }
                    }
                }
            }

            if (editState.selectedDay != -1) {
                Spacer(modifier = Modifier.height(Spacing.sm))
                HorizontalDivider(color = Colors.backgroundTertiary, thickness = 1.dp)
                Spacer(modifier = Modifier.height(Spacing.sm))

                // Day selector
                Text(
                    "Change to:",
                    style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                DayPickerGrid(
                    dayNames = dayNames,
                    selectedDay = editState.selectedDay,
                    currentDay = editState.currentDay,
                    weekStartDate = weekStartDate,
                    onDaySelected = { newDay, newDate ->
                        onChange(newDay, newDate)
                    }
                )
            } else {
                // Collapsed state — show button to expand
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedButton(
                    onClick = {
                        // Auto-select same day as default
                        onChange(editState.currentDay, editState.currentDate)
                    },
                    modifier = Modifier
                        .align(Alignment.End)
                        .height(32.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        "Reschedule",
                        style = AppTextStyles.small,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun DayPickerGrid(
    dayNames: List<String>,
    selectedDay: Int,
    currentDay: Int,
    weekStartDate: Calendar?,
    onDaySelected: (day: Int, date: String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in 0 until 2) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                for (col in 0 until 4) {
                    val dayOfWeek = row * 4 + col
                    if (dayOfWeek < 7) {
                        DayButton(
                            dayOfWeek = dayOfWeek,
                            dayName = dayNames[dayOfWeek],
                            isSelected = selectedDay == dayOfWeek,
                            isCurrent = currentDay == dayOfWeek,
                            weekStartDate = weekStartDate,
                            onClick = { date ->
                                onDaySelected(dayOfWeek, date)
                            },
                            modifier = Modifier.weight(1f)
                        )
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun DayButton(
    dayOfWeek: Int,
    dayName: String,
    isSelected: Boolean,
    isCurrent: Boolean,
    weekStartDate: Calendar?,
    onClick: (date: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val dateString = remember(weekStartDate, dayOfWeek) {
        if (weekStartDate != null) {
            val cal = weekStartDate.clone() as Calendar
            cal.add(Calendar.DAY_OF_MONTH, dayOfWeek)
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            sdf.format(cal.time)
        } else ""
    }

    val backgroundColor = when {
        isSelected -> Colors.primary
        isCurrent -> Colors.primary.copy(alpha = 0.15f)
        else -> Colors.backgroundRoot
    }

    val textColor = when {
        isSelected -> Colors.buttonText
        else -> Colors.textPrimary
    }

    Button(
        onClick = { onClick(dateString) },
        modifier = modifier
            .height(56.dp)
            .border(
                width = 1.dp,
                color = if (isCurrent) Colors.primary else Colors.backgroundTertiary,
                shape = RoundedCornerShape(10.dp)
            ),
        colors = ButtonDefaults.buttonColors(containerColor = backgroundColor),
        shape = RoundedCornerShape(10.dp)
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                dayName,
                style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                color = textColor,
                fontSize = 12.sp
            )
        }
    }
}

/**
 * Calculate the Monday of the week given plan creation date and week number
 */
private fun calculateWeekStartDate(planCreatedAt: String?, weekNumber: Int): Calendar? {
    if (planCreatedAt == null) return null
    
    return try {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        val planCreatedDate = sdf.parse(planCreatedAt) ?: return null
        
        val planCalendar = Calendar.getInstance().apply {
            time = planCreatedDate
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            
            // Adjust to Monday of that week
            val dayOfWeek = get(Calendar.DAY_OF_WEEK)
            val daysToMonday = if (dayOfWeek == 1) 6 else dayOfWeek - 2
            add(Calendar.DAY_OF_MONTH, -daysToMonday)
            
            // Move forward to the requested week
            add(Calendar.WEEK_OF_YEAR, weekNumber - 1)
        }
        
        planCalendar
    } catch (_: Exception) {
        null
    }
}

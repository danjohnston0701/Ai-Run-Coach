package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.CreateGoalState
import live.airuncoach.airuncoach.viewmodel.GoalsViewModel
import live.airuncoach.airuncoach.viewmodel.GoalsViewModelFactory
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditGoalScreen(
    goal: Goal,
    onDismiss: () -> Unit,
    onSaveComplete: () -> Unit,
    viewModel: GoalsViewModel = viewModel(factory = GoalsViewModelFactory(LocalContext.current))
) {
    var goalTitle by remember { mutableStateOf(goal.title) }
    var targetDate by remember { mutableStateOf(goal.targetDate ?: "") }
    var showDatePicker by remember { mutableStateOf(false) }
    val datePickerState = rememberDatePickerState()
    var description by remember { mutableStateOf(goal.description ?: "") }
    var notes by remember { mutableStateOf(goal.notes ?: "") }
    
    // Event-specific fields
    var eventName by remember { mutableStateOf(goal.eventName ?: "") }
    var eventLocation by remember { mutableStateOf(goal.eventLocation ?: "") }
    
    // Distance/Time fields
    var selectedDistance by remember { mutableStateOf(goal.distanceTarget ?: "") }
    var customDistance by remember { mutableStateOf("") }
    var timeHours by remember { mutableStateOf("") }
    var timeMinutes by remember { mutableStateOf("") }
    var timeSeconds by remember { mutableStateOf("") }
    
    // Health & Wellbeing fields
    var selectedHealthTarget by remember { mutableStateOf(goal.healthTarget ?: "") }
    var customHealthGoal by remember { mutableStateOf("") }
    
    // Consistency fields
    var weeklyRunTarget by remember { mutableStateOf(goal.weeklyRunTarget?.toString() ?: "") }
    
    // Observe create goal state
    val createGoalState by viewModel.createGoalState.collectAsState()
    
    // Show loading/error states
    var showError by remember { mutableStateOf<String?>(null) }
    
    // Determine goal type from string
    val goalType = when (goal.type) {
        "EVENT" -> GoalType.EVENT
        "DISTANCE_TIME" -> GoalType.DISTANCE_TIME
        "HEALTH_WELLBEING" -> GoalType.HEALTH_WELLBEING
        "CONSISTENCY" -> GoalType.CONSISTENCY
        else -> null
    }
    var selectedType by remember { mutableStateOf(goalType) }
    
    // Initialize time fields if time target exists
    LaunchedEffect(goal.timeTargetSeconds) {
        goal.timeTargetSeconds?.let { seconds ->
            timeHours = (seconds / 3600).toString()
            timeMinutes = ((seconds % 3600) / 60).toString()
            timeSeconds = (seconds % 60).toString()
        }
    }
    
    // Handle state changes
    LaunchedEffect(createGoalState) {
        when (createGoalState) {
            is CreateGoalState.Success -> {
                viewModel.resetCreateGoalState()
                onSaveComplete()
            }
            is CreateGoalState.Error -> {
                showError = (createGoalState as CreateGoalState.Error).message
            }
            else -> {}
        }
    }
    
    // Function to handle goal update
    val handleUpdateGoal = {
        if (goalTitle.isBlank()) {
            showError = "Please enter a goal title"
        } else {
            // Calculate time target in seconds
            val timeTargetSeconds = if (timeHours.isNotBlank() || timeMinutes.isNotBlank() || timeSeconds.isNotBlank()) {
                val hours = timeHours.toIntOrNull() ?: 0
                val minutes = timeMinutes.toIntOrNull() ?: 0
                val seconds = timeSeconds.toIntOrNull() ?: 0
                (hours * 3600) + (minutes * 60) + seconds
            } else null
            
            // Determine distance target (prefer selected, fallback to custom)
            val finalDistanceTarget = selectedDistance.ifBlank { customDistance.ifBlank { null } }
            
            // Determine health target (prefer selected, fallback to custom)
            val finalHealthTarget = selectedHealthTarget.ifBlank { customHealthGoal.ifBlank { null } }
            
            // Parse weekly run target
            val finalWeeklyTarget = weeklyRunTarget.toIntOrNull()
            
            goal.id?.let { goalId ->
                viewModel.editGoal(
                    goalId = goalId,
                    title = goalTitle,
                    description = description.ifBlank { null },
                    notes = notes.ifBlank { null },
                    targetDate = targetDate.ifBlank { null },
                    eventName = eventName.ifBlank { null },
                    eventLocation = eventLocation.ifBlank { null },
                    distanceTarget = finalDistanceTarget,
                    timeTargetSeconds = timeTargetSeconds,
                    healthTarget = finalHealthTarget,
                    weeklyRunTarget = finalWeeklyTarget
                )
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot.copy(alpha = 0.98f))
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = Spacing.lg, vertical = Spacing.xl)
        ) {
            item {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Edit Goal",
                        style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Icon(
                        painter = painterResource(id = R.drawable.icon_close_vector),
                        contentDescription = "Close",
                        tint = Colors.textMuted,
                        modifier = Modifier
                            .size(28.dp)
                            .clickable { onDismiss() }
                    )
                }
                Spacer(modifier = Modifier.height(Spacing.xl))
            }
            
            item {
                // Goal Title (required)
                FormField(
                    label = "Goal Title *",
                    value = goalTitle,
                    onValueChange = { goalTitle = it },
                    placeholder = "e.g., Run my first marathon"
                )
                Spacer(modifier = Modifier.height(Spacing.md))
            }
            
            item {
                // Target Date (optional)
                FormFieldLabel(text = "Target Date (optional)")
                Spacer(modifier = Modifier.height(Spacing.sm))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .clip(RoundedCornerShape(BorderRadius.sm))
                        .background(Colors.backgroundSecondary)
                        .clickable { showDatePicker = true }
                        .padding(horizontal = Spacing.md),
                    contentAlignment = Alignment.CenterStart
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = targetDate.ifBlank { "Select a date" },
                            style = AppTextStyles.body,
                            color = if (targetDate.isBlank()) Colors.textMuted else Colors.textPrimary
                        )
                        Icon(
                            painter = painterResource(id = R.drawable.icon_calendar_vector),
                            contentDescription = "Select date",
                            tint = Colors.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.md))
            }
            
            // Conditional fields based on goal type
            selectedType?.let { type ->
                when (type) {
                    GoalType.EVENT -> {
                        item {
                            FormField(
                                label = "Event Name",
                                value = eventName,
                                onValueChange = { eventName = it },
                                placeholder = "e.g., London Marathon 2025"
                            )
                            Spacer(modifier = Modifier.height(Spacing.md))
                            
                            FormField(
                                label = "Event Location",
                                value = eventLocation,
                                onValueChange = { eventLocation = it },
                                placeholder = "e.g., London, UK"
                            )
                            Spacer(modifier = Modifier.height(Spacing.md))
                            
                            DistanceTargetSection(
                                selectedDistance = selectedDistance,
                                customDistance = customDistance,
                                onDistanceSelected = { selectedDistance = it },
                                onCustomDistanceChange = { customDistance = it }
                            )
                            Spacer(modifier = Modifier.height(Spacing.md))
                            
                            TimeTargetSection(
                                hours = timeHours,
                                minutes = timeMinutes,
                                seconds = timeSeconds,
                                onHoursChange = { timeHours = it },
                                onMinutesChange = { timeMinutes = it },
                                onSecondsChange = { timeSeconds = it }
                            )
                            Spacer(modifier = Modifier.height(Spacing.md))
                        }
                    }
                    GoalType.DISTANCE_TIME -> {
                        item {
                            DistanceTargetSection(
                                selectedDistance = selectedDistance,
                                customDistance = customDistance,
                                onDistanceSelected = { selectedDistance = it },
                                onCustomDistanceChange = { customDistance = it }
                            )
                            Spacer(modifier = Modifier.height(Spacing.md))
                            
                            TimeTargetSection(
                                hours = timeHours,
                                minutes = timeMinutes,
                                seconds = timeSeconds,
                                onHoursChange = { timeHours = it },
                                onMinutesChange = { timeMinutes = it },
                                onSecondsChange = { timeSeconds = it }
                            )
                            Spacer(modifier = Modifier.height(Spacing.md))
                        }
                    }
                    GoalType.HEALTH_WELLBEING -> {
                        item {
                            HealthTargetSection(
                                selectedTarget = selectedHealthTarget,
                                customGoal = customHealthGoal,
                                onTargetSelected = { selectedHealthTarget = it },
                                onCustomGoalChange = { customHealthGoal = it }
                            )
                            Spacer(modifier = Modifier.height(Spacing.md))
                        }
                    }
                    GoalType.CONSISTENCY -> {
                        item {
                            WeeklyRunTargetSection(
                                value = weeklyRunTarget,
                                onValueChange = { weeklyRunTarget = it }
                            )
                            Spacer(modifier = Modifier.height(Spacing.md))
                        }
                    }
                    else -> {}
                }
            }
            
            item {
                // Description (optional)
                FormFieldMultiline(
                    label = "Description (optional)",
                    value = description,
                    onValueChange = { description = it },
                    placeholder = "Add any details about your goal..."
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                
                // Notes (optional)
                FormFieldMultiline(
                    label = "Notes (optional)",
                    value = notes,
                    onValueChange = { notes = it },
                    placeholder = "Training notes, motivation, etc..."
                )
                Spacer(modifier = Modifier.height(Spacing.xxl))
            }
            
            item {
                // Error message
                if (showError != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Colors.error.copy(alpha = 0.1f), RoundedCornerShape(BorderRadius.sm))
                            .padding(Spacing.md)
                    ) {
                        Text(
                            text = showError ?: "",
                            style = AppTextStyles.body,
                            color = Colors.error
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
                
                // Action Buttons
                Button(
                    onClick = handleUpdateGoal,
                    enabled = createGoalState !is CreateGoalState.Loading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    )
                ) {
                    if (createGoalState is CreateGoalState.Loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = Colors.buttonText
                        )
                    } else {
                        Text(
                            text = "Save Changes",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.md))
                
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Colors.textPrimary
                    ),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Colors.textMuted)
                ) {
                    Text(
                        text = "Cancel",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                    )
                }
                Spacer(modifier = Modifier.height(Spacing.xl))
            }
        }
    }
    
    // Date Picker Dialog
    if (showDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            val sdf = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
                            sdf.timeZone = TimeZone.getTimeZone("UTC")
                            targetDate = sdf.format(Date(millis))
                        }
                        showDatePicker = false
                    }
                ) {
                    Text("Confirm", color = Colors.primary)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text("Cancel", color = Colors.textMuted)
                }
            },
            colors = DatePickerDefaults.colors(
                containerColor = Colors.backgroundSecondary,
            )
        ) {
            DatePicker(
                state = datePickerState,
                colors = DatePickerDefaults.colors(
                    containerColor = Colors.backgroundSecondary,
                    titleContentColor = Colors.textPrimary,
                    headlineContentColor = Colors.textPrimary,
                    weekdayContentColor = Colors.textMuted,
                    dayContentColor = Colors.textPrimary,
                    selectedDayContainerColor = Colors.primary,
                    selectedDayContentColor = Colors.backgroundRoot,
                    todayContentColor = Colors.primary,
                    todayDateBorderColor = Colors.primary,
                    yearContentColor = Colors.textPrimary,
                    selectedYearContainerColor = Colors.primary,
                    selectedYearContentColor = Colors.backgroundRoot,
                    navigationContentColor = Colors.textPrimary,
                    subheadContentColor = Colors.textPrimary,
                )
            )
        }
    }
}
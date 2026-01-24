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
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.CreateGoalState
import live.airuncoach.airuncoach.viewmodel.GoalsViewModel
import live.airuncoach.airuncoach.viewmodel.GoalsViewModelFactory

enum class GoalType {
    EVENT, DISTANCE_TIME, HEALTH_WELLBEING, CONSISTENCY
}

@Composable
fun CreateGoalScreen(
    onDismiss: () -> Unit = {},
    onCreateGoal: () -> Unit = {},
    viewModel: GoalsViewModel = viewModel(factory = GoalsViewModelFactory(LocalContext.current))
) {
    var selectedType by remember { mutableStateOf<GoalType?>(null) }
    var goalTitle by remember { mutableStateOf("") }
    var targetDate by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    
    // Event-specific fields
    var eventName by remember { mutableStateOf("") }
    var eventLocation by remember { mutableStateOf("") }
    
    // Distance/Time fields
    var selectedDistance by remember { mutableStateOf("") }
    var customDistance by remember { mutableStateOf("") }
    var timeHours by remember { mutableStateOf("") }
    var timeMinutes by remember { mutableStateOf("") }
    var timeSeconds by remember { mutableStateOf("") }
    
    // Health & Wellbeing fields
    var selectedHealthTarget by remember { mutableStateOf("") }
    var customHealthGoal by remember { mutableStateOf("") }
    
    // Consistency fields
    var weeklyRunTarget by remember { mutableStateOf("") }
    
    // Observe create goal state
    val createGoalState by viewModel.createGoalState.collectAsState()
    
    // Show loading/error states
    var showError by remember { mutableStateOf<String?>(null) }
    
    // Handle state changes
    LaunchedEffect(createGoalState) {
        when (createGoalState) {
            is CreateGoalState.Success -> {
                viewModel.resetCreateGoalState()
                onCreateGoal()
            }
            is CreateGoalState.Error -> {
                showError = (createGoalState as CreateGoalState.Error).message
            }
            else -> {}
        }
    }
    
    // Function to handle goal creation
    val handleCreateGoal = {
        // Validation
        if (selectedType == null) {
            showError = "Please select a goal type"
        } else if (goalTitle.isBlank()) {
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
            
            viewModel.createGoal(
                type = selectedType.toString(),
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
                        text = "Set a New Goal",
                        style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Icon(
                        painter = painterResource(id = R.drawable.icon_play_vector),
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
                // Goal Type Selection
                Text(
                    text = "Goal Type",
                    style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                
                // 2x2 Grid of goal types
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                    ) {
                        GoalTypeCard(
                            modifier = Modifier.weight(1f),
                            title = "Event",
                            subtitle = "Race or\ncompetition",
                            icon = R.drawable.icon_calendar_vector,
                            isSelected = selectedType == GoalType.EVENT,
                            onClick = { selectedType = GoalType.EVENT }
                        )
                        GoalTypeCard(
                            modifier = Modifier.weight(1f),
                            title = "Distance/Time",
                            subtitle = "Personal record\ntarget",
                            icon = R.drawable.icon_timer_vector,
                            isSelected = selectedType == GoalType.DISTANCE_TIME,
                            onClick = { selectedType = GoalType.DISTANCE_TIME }
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                    ) {
                        GoalTypeCard(
                            modifier = Modifier.weight(1f),
                            title = "Health &\nWellbeing",
                            subtitle = "Fitness or weight\ngoals",
                            icon = R.drawable.icon_profile_vector,
                            isSelected = selectedType == GoalType.HEALTH_WELLBEING,
                            onClick = { selectedType = GoalType.HEALTH_WELLBEING }
                        )
                        GoalTypeCard(
                            modifier = Modifier.weight(1f),
                            title = "Consistency",
                            subtitle = "Run frequency\ntarget",
                            icon = R.drawable.icon_chart_vector,
                            isSelected = selectedType == GoalType.CONSISTENCY,
                            onClick = { selectedType = GoalType.CONSISTENCY }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.xl))
            }
            
            if (selectedType != null) {
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
                            .clickable { /* Open date picker */ }
                            .padding(horizontal = Spacing.md),
                        contentAlignment = Alignment.CenterEnd
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_play_vector),
                            contentDescription = "Select date",
                            tint = Colors.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
                
                // Conditional fields based on goal type
                when (selectedType) {
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
                        onClick = handleCreateGoal,
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
                                text = "Create Goal",
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
    }
}

@Composable
fun GoalTypeCard(
    modifier: Modifier = Modifier,
    title: String,
    subtitle: String,
    icon: Int,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = modifier
            .height(120.dp)
            .clickable(onClick = onClick)
            .then(
                if (isSelected) {
                    Modifier.border(2.dp, Colors.primary, RoundedCornerShape(BorderRadius.md))
                } else {
                    Modifier.border(1.dp, Colors.backgroundTertiary, RoundedCornerShape(BorderRadius.md))
                }
            ),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) Colors.backgroundSecondary.copy(alpha = 0.8f) else Colors.backgroundSecondary.copy(alpha = 0.4f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(Spacing.md),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Icon(
                painter = painterResource(id = icon),
                contentDescription = title,
                tint = if (isSelected) Colors.primary else Colors.textMuted,
                modifier = Modifier.size(24.dp)
            )
            Column {
                Text(
                    text = title,
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = if (isSelected) Colors.primary else Colors.textPrimary
                )
                Text(
                    text = subtitle,
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    lineHeight = androidx.compose.ui.unit.TextUnit(14f, androidx.compose.ui.unit.TextUnitType.Sp)
                )
            }
        }
    }
}

@Composable
fun FormFieldLabel(text: String) {
    Text(
        text = text,
        style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
        color = Colors.textPrimary
    )
}

@Composable
fun FormField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String
) {
    FormFieldLabel(text = label)
    Spacer(modifier = Modifier.height(Spacing.sm))
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        textStyle = AppTextStyles.body.copy(color = Colors.textPrimary),
        cursorBrush = SolidColor(Colors.primary),
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .clip(RoundedCornerShape(BorderRadius.sm))
            .background(Colors.backgroundSecondary)
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.CenterStart
            ) {
                if (value.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = AppTextStyles.body,
                        color = Colors.textMuted
                    )
                }
                innerTextField()
            }
        }
    )
}

@Composable
fun FormFieldMultiline(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String
) {
    FormFieldLabel(text = label)
    Spacer(modifier = Modifier.height(Spacing.sm))
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        textStyle = AppTextStyles.body.copy(color = Colors.textPrimary),
        cursorBrush = SolidColor(Colors.primary),
        modifier = Modifier
            .fillMaxWidth()
            .height(100.dp)
            .clip(RoundedCornerShape(BorderRadius.sm))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.md),
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.TopStart
            ) {
                if (value.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = AppTextStyles.body,
                        color = Colors.textMuted
                    )
                }
                innerTextField()
            }
        }
    )
}

@Composable
fun DistanceTargetSection(
    selectedDistance: String,
    customDistance: String,
    onDistanceSelected: (String) -> Unit,
    onCustomDistanceChange: (String) -> Unit
) {
    FormFieldLabel(text = "Distance Target")
    Spacer(modifier = Modifier.height(Spacing.sm))
    
    // Distance buttons
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            DistanceChip(
                text = "5K",
                isSelected = selectedDistance == "5K",
                onClick = { onDistanceSelected("5K") }
            )
            DistanceChip(
                text = "10K",
                isSelected = selectedDistance == "10K",
                onClick = { onDistanceSelected("10K") }
            )
            DistanceChip(
                text = "Half Marathon",
                isSelected = selectedDistance == "Half Marathon",
                onClick = { onDistanceSelected("Half Marathon") }
            )
            DistanceChip(
                text = "Marathon",
                isSelected = selectedDistance == "Marathon",
                onClick = { onDistanceSelected("Marathon") }
            )
        }
        DistanceChip(
            text = "Ultra Marathon",
            isSelected = selectedDistance == "Ultra Marathon",
            onClick = { onDistanceSelected("Ultra Marathon") },
            modifier = Modifier.width(150.dp)
        )
        
        // Custom distance input
        BasicTextField(
            value = customDistance,
            onValueChange = onCustomDistanceChange,
            textStyle = AppTextStyles.body.copy(color = Colors.textPrimary),
            cursorBrush = SolidColor(Colors.primary),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
                .clip(RoundedCornerShape(BorderRadius.sm))
                .background(Colors.backgroundSecondary)
                .padding(horizontal = Spacing.md, vertical = Spacing.sm),
            decorationBox = { innerTextField ->
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.CenterStart
                ) {
                    if (customDistance.isEmpty()) {
                        Text(
                            text = "Or enter custom distance...",
                            style = AppTextStyles.body,
                            color = Colors.textMuted
                        )
                    }
                    innerTextField()
                }
            }
        )
    }
}

@Composable
fun DistanceChip(
    text: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .height(44.dp)
            .clip(RoundedCornerShape(BorderRadius.full))
            .background(if (isSelected) Colors.primary.copy(alpha = 0.2f) else Colors.backgroundSecondary)
            .border(
                1.dp,
                if (isSelected) Colors.primary else Colors.backgroundTertiary,
                RoundedCornerShape(BorderRadius.full)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = AppTextStyles.body.copy(fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal),
            color = if (isSelected) Colors.primary else Colors.textPrimary
        )
    }
}

@Composable
fun TimeTargetSection(
    hours: String,
    minutes: String,
    seconds: String,
    onHoursChange: (String) -> Unit,
    onMinutesChange: (String) -> Unit,
    onSecondsChange: (String) -> Unit
) {
    FormFieldLabel(text = "Time Target (optional)")
    Spacer(modifier = Modifier.height(Spacing.sm))
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        verticalAlignment = Alignment.CenterVertically
    ) {
        TimeInput(
            value = hours,
            onValueChange = onHoursChange,
            placeholder = "HH",
            modifier = Modifier.weight(1f)
        )
        Text(
            text = ":",
            style = AppTextStyles.h3,
            color = Colors.textMuted
        )
        TimeInput(
            value = minutes,
            onValueChange = onMinutesChange,
            placeholder = "MM",
            modifier = Modifier.weight(1f)
        )
        Text(
            text = ":",
            style = AppTextStyles.h3,
            color = Colors.textMuted
        )
        TimeInput(
            value = seconds,
            onValueChange = onSecondsChange,
            placeholder = "SS",
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
fun TimeInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        textStyle = AppTextStyles.h4.copy(
            color = Colors.textPrimary,
            textAlign = TextAlign.Center,
            fontWeight = FontWeight.Medium
        ),
        cursorBrush = SolidColor(Colors.primary),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier = modifier
            .height(50.dp)
            .clip(RoundedCornerShape(BorderRadius.sm))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.sm),
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                if (value.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = AppTextStyles.h4.copy(textAlign = TextAlign.Center),
                        color = Colors.textMuted
                    )
                }
                innerTextField()
            }
        }
    )
}

@Composable
fun HealthTargetSection(
    selectedTarget: String,
    customGoal: String,
    onTargetSelected: (String) -> Unit,
    onCustomGoalChange: (String) -> Unit
) {
    FormFieldLabel(text = "Health Target")
    Spacer(modifier = Modifier.height(Spacing.sm))
    
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            DistanceChip(
                text = "Improve fitness",
                isSelected = selectedTarget == "Improve fitness",
                onClick = { onTargetSelected("Improve fitness") },
                modifier = Modifier.weight(1f)
            )
            DistanceChip(
                text = "Improve endurance",
                isSelected = selectedTarget == "Improve endurance",
                onClick = { onTargetSelected("Improve endurance") },
                modifier = Modifier.weight(1f)
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            DistanceChip(
                text = "Lose weight",
                isSelected = selectedTarget == "Lose weight",
                onClick = { onTargetSelected("Lose weight") },
                modifier = Modifier.weight(1f)
            )
            DistanceChip(
                text = "Build strength",
                isSelected = selectedTarget == "Build strength",
                onClick = { onTargetSelected("Build strength") },
                modifier = Modifier.weight(1f)
            )
            DistanceChip(
                text = "Better recovery",
                isSelected = selectedTarget == "Better recovery",
                onClick = { onTargetSelected("Better recovery") },
                modifier = Modifier.weight(1f)
            )
        }
        
        // Custom health goal input
        BasicTextField(
            value = customGoal,
            onValueChange = onCustomGoalChange,
            textStyle = AppTextStyles.body.copy(color = Colors.textPrimary),
            cursorBrush = SolidColor(Colors.primary),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
                .clip(RoundedCornerShape(BorderRadius.sm))
                .background(Colors.backgroundSecondary)
                .padding(horizontal = Spacing.md, vertical = Spacing.sm),
            decorationBox = { innerTextField ->
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.CenterStart
                ) {
                    if (customGoal.isEmpty()) {
                        Text(
                            text = "Or enter custom health goal...",
                            style = AppTextStyles.body,
                            color = Colors.textMuted
                        )
                    }
                    innerTextField()
                }
            }
        )
    }
}

@Composable
fun WeeklyRunTargetSection(
    value: String,
    onValueChange: (String) -> Unit
) {
    FormFieldLabel(text = "Weekly Run Target")
    Spacer(modifier = Modifier.height(Spacing.sm))
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        verticalAlignment = Alignment.CenterVertically
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = AppTextStyles.body.copy(
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            ),
            cursorBrush = SolidColor(Colors.primary),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier
                .width(100.dp)
                .height(50.dp)
                .clip(RoundedCornerShape(BorderRadius.sm))
                .background(Colors.backgroundSecondary)
                .padding(Spacing.sm),
            decorationBox = { innerTextField ->
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    if (value.isEmpty()) {
                        Text(
                            text = "e.g., 3",
                            style = AppTextStyles.body.copy(textAlign = TextAlign.Center),
                            color = Colors.textMuted
                        )
                    }
                    innerTextField()
                }
            }
        )
        Text(
            text = "runs per week",
            style = AppTextStyles.body,
            color = Colors.textMuted
        )
    }
}

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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import live.airuncoach.airuncoach.data.SessionManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.PersonalDetailsViewModel
import live.airuncoach.airuncoach.viewmodel.PersonalDetailsViewModelFactory

/**
 * Visual transformation for dd/mm/yyyy date format
 * Handles cursor positioning correctly by only storing digits in the state
 */
class DateOfBirthTransformation : VisualTransformation {
    override fun filter(text: androidx.compose.ui.text.AnnotatedString): TransformedText {
        val digitsOnly = text.text.filter { it.isDigit() }
        val formatted = when {
            digitsOnly.length <= 2 -> digitsOnly
            digitsOnly.length <= 4 -> "${digitsOnly.take(2)}/${digitsOnly.drop(2)}"
            digitsOnly.length <= 8 -> "${digitsOnly.take(2)}/${digitsOnly.drop(2).take(2)}/${digitsOnly.drop(4)}"
            else -> "${digitsOnly.take(2)}/${digitsOnly.drop(2).take(2)}/${digitsOnly.drop(4).take(4)}"
        }

        return TransformedText(
            text = androidx.compose.ui.text.AnnotatedString(formatted),
            offsetMapping = DateOffsetMapping(digitsOnly, formatted)
        )
    }
}

/**
 * Maps cursor positions from formatted text (with slashes) to original text (digits only)
 * 
 * Handles edge cases:
 * - Empty strings (returns 0)
 * - Cursor at end of string (handled with length checks)
 * - Samsung keyboard batch edits (clamped to valid ranges)
 * - Never returns index > formatted/original string length
 */
private class DateOffsetMapping(private val digitsOnly: String, private val formatted: String) : OffsetMapping {
    override fun originalToTransformed(offset: Int): Int {
        // Handle empty string case
        if (digitsOnly.isEmpty()) return 0
        
        // Map cursor position from digits-only to formatted
        // offset is the position in the digits-only string
        val clampedOffset = minOf(offset, digitsOnly.length)
        
        // Calculate transformed position based on how many digits we're showing
        val transformedPos = when {
            clampedOffset <= 2 -> clampedOffset
            clampedOffset <= 4 -> clampedOffset + 1 // Add 1 for the first "/"
            else -> clampedOffset + 2 // Add 2 for both "/" characters
        }
        
        // CRITICAL: Ensure we never return an index larger than the formatted string
        return minOf(transformedPos, formatted.length)
    }

    override fun transformedToOriginal(offset: Int): Int {
        // Handle empty string case
        if (formatted.isEmpty()) return 0
        
        // Map cursor position from formatted to digits-only
        // offset is the position in the formatted string (with slashes)
        var digitCount = 0
        for (i in 0 until minOf(offset, formatted.length)) {
            when (i) {
                2, 5 -> {} // Skip slashes
                else -> digitCount++
            }
        }
        
        // CRITICAL: Ensure we never return an index larger than the digits-only string
        return minOf(digitCount, digitsOnly.length)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonalDetailsScreen(
    onNavigateBack: () -> Unit = {},
    onNavigateToInjuries: () -> Unit = {},
    onNavigateToCoachSettings: () -> Unit = {}
) {
    val context = LocalContext.current
    val viewModel: PersonalDetailsViewModel = viewModel(factory = PersonalDetailsViewModelFactory(context))
    val sessionManager = remember { SessionManager(context) }
    val name by viewModel.name.collectAsState()
    val email by viewModel.email.collectAsState()
    val dateOfBirth by viewModel.dateOfBirth.collectAsState()
    val gender by viewModel.gender.collectAsState()
    val weight by viewModel.weight.collectAsState()
    val height by viewModel.height.collectAsState()
    val defaultSessionType by viewModel.defaultSessionType.collectAsState()
    val coroutineScope = rememberCoroutineScope()
    var showGenderMenu by remember { mutableStateOf(false) }
    var hasInjuries by remember { mutableStateOf(false) }  // Default to "No" for injuries
    
    val genderOptions = listOf("Male", "Female", "Non-binary", "Prefer not to say")

    Scaffold(
        modifier = Modifier.imePadding(), // Scaffold shrinks above keyboard so Save button stays visible
        topBar = {
            TopAppBar(
                title = { Text("Personal Details", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
                    }
                },
                windowInsets = WindowInsets(0), // parent Scaffold already consumed status bar insets
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            // Sticky save button — no navigationBarsPadding() here because the outer
            // MainScreen Scaffold already consumed nav bar insets via innerPadding
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Colors.backgroundRoot,
                shadowElevation = 8.dp
            ) {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            viewModel.saveDetails()
                            // If user has injuries, go to injury logging
                            if (hasInjuries == true) {
                                onNavigateToInjuries()
                            } else {
                                // Clear profile setup flag and navigate accordingly
                                sessionManager.setNeedsProfileSetup(false)
                                if (sessionManager.needsCoachSetup()) {
                                    onNavigateToCoachSettings()
                                } else {
                                    onNavigateBack()
                                }
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    // hasInjuries defaults to false ("No"), so button is always enabled
                ) {
                    Text("Save Changes", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Spacing.lg)
                .padding(bottom = Spacing.xl) // Safe bottom padding (24.dp) instead of massive 120.dp
        ) {
            item {
                SectionTitle(title = "Full Name")
                OutlinedTextField(
                    value = name,
                    onValueChange = viewModel::onNameChanged,
                    label = { Text("Enter your full name") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
            item {
                SectionTitle(title = "Email")
                OutlinedTextField(
                    value = email,
                    onValueChange = viewModel::onEmailChanged,
                    label = { Text("Enter your email address") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
            item {
                SectionTitle(title = "Date of Birth")
                OutlinedTextField(
                    value = dateOfBirth,
                    onValueChange = viewModel::onDateOfBirthChanged,
                    label = { Text("dd/mm/yyyy") },
                    placeholder = { Text("01/01/1990") },
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = DateOfBirthTransformation(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
            item {
                SectionTitle(title = "Gender")
                Box(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = gender,
                        onValueChange = {},
                        label = { Text("Select your gender") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showGenderMenu = true },
                        enabled = false,
                        colors = OutlinedTextFieldDefaults.colors(
                            disabledTextColor = Colors.textPrimary,
                            disabledBorderColor = Colors.textMuted,
                            disabledLabelColor = Colors.textSecondary
                        ),
                        trailingIcon = {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_chevron_down_vector),
                                contentDescription = "Dropdown",
                                tint = Colors.textMuted,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    )
                    // Invisible clickable overlay to handle clicks
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .clickable { showGenderMenu = true }
                    )
                    DropdownMenu(
                        expanded = showGenderMenu,
                        onDismissRequest = { showGenderMenu = false },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        genderOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { 
                                    Text(
                                        text = option,
                                        style = AppTextStyles.body,
                                        color = Colors.textPrimary
                                    ) 
                                },
                                onClick = {
                                    viewModel.onGenderChanged(option)
                                    showGenderMenu = false
                                }
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
            item {
                SectionTitle(title = "Weight (kg)")
                OutlinedTextField(
                    value = weight,
                    onValueChange = viewModel::onWeightChanged,
                    label = { Text("Enter your weight in kilograms") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
            item {
                SectionTitle(title = "Height (cm)")
                OutlinedTextField(
                    value = height,
                    onValueChange = viewModel::onHeightChanged,
                    label = { Text("Enter your height in centimeters") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
            item {
                SectionTitle(title = "Default Session Type")
                Text(
                    "What's your primary activity?",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    Button(
                        onClick = { viewModel.onDefaultSessionTypeChanged("Run") },
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (defaultSessionType == "Run") Colors.primary else Colors.backgroundSecondary,
                            contentColor = if (defaultSessionType == "Run") Colors.buttonText else Colors.textPrimary
                        ),
                        shape = RoundedCornerShape(BorderRadius.md),
                        border = if (defaultSessionType != "Run") androidx.compose.foundation.BorderStroke(1.dp, Colors.border) else null
                    ) {
                        Text("Run", style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold))
                    }
                    Button(
                        onClick = { viewModel.onDefaultSessionTypeChanged("Walk") },
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (defaultSessionType == "Walk") Colors.primary else Colors.backgroundSecondary,
                            contentColor = if (defaultSessionType == "Walk") Colors.buttonText else Colors.textPrimary
                        ),
                        shape = RoundedCornerShape(BorderRadius.md),
                        border = if (defaultSessionType != "Walk") androidx.compose.foundation.BorderStroke(1.dp, Colors.border) else null
                    ) {
                        Text("Walk", style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold))
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
            item {
                SectionTitle(title = "Health & Injuries")
                Text(
                    "Do you have any injuries or medical conditions your AI Coach needs to be aware of?",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    Button(
                        onClick = { hasInjuries = true },
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (hasInjuries == true) Colors.primary else Colors.backgroundSecondary,
                            contentColor = if (hasInjuries == true) Colors.buttonText else Colors.textPrimary
                        ),
                        shape = RoundedCornerShape(BorderRadius.md),
                        border = if (hasInjuries != true) androidx.compose.foundation.BorderStroke(1.dp, Colors.border) else null
                    ) {
                        Text("Yes", style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold))
                    }
                    Button(
                        onClick = { hasInjuries = false },
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (hasInjuries == false) Colors.primary else Colors.backgroundSecondary,
                            contentColor = if (hasInjuries == false) Colors.buttonText else Colors.textPrimary
                        ),
                        shape = RoundedCornerShape(BorderRadius.md),
                        border = if (hasInjuries != false) androidx.compose.foundation.BorderStroke(1.dp, Colors.border) else null
                    ) {
                        Text("No", style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold))
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }
        }
    }
}

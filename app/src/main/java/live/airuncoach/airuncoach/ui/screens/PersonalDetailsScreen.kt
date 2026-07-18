package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import live.airuncoach.airuncoach.data.SessionManager
import androidx.compose.ui.text.font.FontWeight
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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PersonalDetailsScreen(
    onNavigateBack: () -> Unit = {},
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
    var showDayMenu by remember { mutableStateOf(false) }
    var showMonthMenu by remember { mutableStateOf(false) }
    var yearOnly by remember { mutableStateOf(false) }
    var dobDay by remember { mutableStateOf("") }
    var dobMonth by remember { mutableStateOf("") }
    var dobYear by remember { mutableStateOf("") }
    val isKeyboardVisible = WindowInsets.isImeVisible
    val density = LocalDensity.current
    val bottomContentPadding = if (isKeyboardVisible) {
        with(density) { WindowInsets.ime.getBottom(this).toDp() }
    } else {
        with(density) { WindowInsets.navigationBars.getBottom(this).toDp() } + Spacing.xl
    }
    
    val genderOptions = listOf("Male", "Female", "Prefer not to say")
    val monthOptions = listOf(
        "01" to "Jan", "02" to "Feb", "03" to "Mar", "04" to "Apr",
        "05" to "May", "06" to "Jun", "07" to "Jul", "08" to "Aug",
        "09" to "Sep", "10" to "Oct", "11" to "Nov", "12" to "Dec"
    )
    val dayOptions = listOf("-") + (1..31).map { it.toString().padStart(2, '0') }
    val monthDisplayOptions = listOf("-") + monthOptions.map { it.second }

    LaunchedEffect(dateOfBirth) {
        if (dateOfBirth.length == 8) {
            dobDay = dateOfBirth.take(2)
            dobMonth = dateOfBirth.drop(2).take(2)
            dobYear = dateOfBirth.drop(4)
        }
    }

    Scaffold(
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
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Spacing.lg),
            contentPadding = PaddingValues(bottom = bottomContentPadding)
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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "I only want to provide my year of birth",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary,
                        modifier = Modifier.weight(1f)
                    )
                    Switch(
                        checked = yearOnly,
                        onCheckedChange = {
                            yearOnly = it
                            if (it) {
                                dobDay = "01"
                                dobMonth = "01"
                                viewModel.onDateOfBirthChanged("0101$dobYear")
                            } else {
                                dobDay = ""
                                dobMonth = ""
                                showDayMenu = false
                                showMonthMenu = false
                                viewModel.onDateOfBirthChanged("")
                            }
                        }
                    )
                }
                Text(
                    text = "Used to estimate your maximum heart rate and personalise training intensity.",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary,
                    modifier = Modifier.padding(top = Spacing.xs)
                )
                if (yearOnly) {
                    OutlinedTextField(
                        value = dobYear,
                        onValueChange = {
                            dobYear = it.filter(Char::isDigit).take(4)
                            viewModel.onDateOfBirthChanged("0101$dobYear")
                        },
                        placeholder = { Text("Year") },
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                            keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Colors.textPrimary,
                            unfocusedTextColor = Colors.textPrimary,
                            cursorColor = Colors.primary,
                            focusedBorderColor = Colors.primary,
                            unfocusedBorderColor = Colors.textMuted
                        )
                    )
                } else {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        DobDropdown(
                            value = dobDay.ifBlank { "-" },
                            options = dayOptions,
                            onSelected = {
                                dobDay = if (it == "-") "" else it
                                viewModel.onDateOfBirthChanged(
                                    "${if (it == "-") "" else it}$dobMonth$dobYear"
                                )
                            },
                            expanded = showDayMenu,
                            onExpandedChange = { showDayMenu = it },
                            modifier = Modifier.weight(0.9f)
                        )
                        DobDropdown(
                            value = monthOptions.firstOrNull { it.first == dobMonth }?.second
                                ?: "-",
                            options = monthDisplayOptions,
                            onSelected = { label ->
                                val month = monthOptions.firstOrNull { it.second == label }?.first.orEmpty()
                                dobMonth = month
                                viewModel.onDateOfBirthChanged("$dobDay$month$dobYear")
                            },
                            expanded = showMonthMenu,
                            onExpandedChange = { showMonthMenu = it },
                            modifier = Modifier.weight(1.2f)
                        )
                        OutlinedTextField(
                            value = dobYear,
                            onValueChange = {
                                dobYear = it.filter(Char::isDigit).take(4)
                                viewModel.onDateOfBirthChanged("$dobDay$dobMonth$dobYear")
                            },
                            placeholder = { Text("Year") },
                            singleLine = true,
                            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                                keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                            ),
                            modifier = Modifier.weight(1.1f),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Colors.textPrimary,
                                unfocusedTextColor = Colors.textPrimary,
                                cursorColor = Colors.primary,
                                focusedBorderColor = Colors.primary,
                                unfocusedBorderColor = Colors.textMuted
                            )
                        )
                    }
                }
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
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Colors.textPrimary,
                            unfocusedTextColor = Colors.textPrimary,
                            focusedBorderColor = Colors.primary,
                            unfocusedBorderColor = Colors.textMuted,
                            focusedLabelColor = Colors.primary,
                            unfocusedLabelColor = Colors.textSecondary
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
                Spacer(modifier = Modifier.height(Spacing.md))
                Button(
                    onClick = {
                        coroutineScope.launch {
                            viewModel.saveDetails()
                            sessionManager.setNeedsProfileSetup(false)
                            if (sessionManager.needsCoachSetup()) {
                                onNavigateToCoachSettings()
                            } else {
                                onNavigateBack()
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                ) {
                    Text("Save Changes", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

@Composable
private fun DobDropdown(
    value: String,
    options: List<String>,
    onSelected: (String) -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onExpandedChange(true) },
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Colors.textPrimary,
                unfocusedTextColor = Colors.textPrimary,
                focusedBorderColor = Colors.primary,
                unfocusedBorderColor = Colors.textMuted
            )
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .clickable { onExpandedChange(true) }
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { onExpandedChange(false) },
            modifier = Modifier
                .widthIn(min = 120.dp, max = 220.dp)
                .heightIn(max = 280.dp)
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option, color = Colors.textPrimary) },
                    onClick = {
                        onSelected(option)
                        onExpandedChange(false)
                    }
                )
            }
        }
    }
}

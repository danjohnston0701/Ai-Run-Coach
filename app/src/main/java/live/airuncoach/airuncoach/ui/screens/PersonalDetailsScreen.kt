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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonalDetailsScreen(onNavigateBack: () -> Unit) {
    val context = LocalContext.current
    val viewModel: PersonalDetailsViewModel = viewModel(factory = PersonalDetailsViewModelFactory(context))
    val name by viewModel.name.collectAsState()
    val email by viewModel.email.collectAsState()
    val dateOfBirth by viewModel.dateOfBirth.collectAsState()
    val gender by viewModel.gender.collectAsState()
    val weight by viewModel.weight.collectAsState()
    val height by viewModel.height.collectAsState()
    val coroutineScope = rememberCoroutineScope()
    var showGenderMenu by remember { mutableStateOf(false) }
    
    val genderOptions = listOf("Male", "Female", "Non-binary", "Prefer not to say")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Personal Details", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .padding(Spacing.lg)
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
                Box {
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
                                painter = painterResource(id = R.drawable.icon_play_vector),
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
                        modifier = Modifier
                            .fillMaxWidth(0.9f)
                            .background(Colors.backgroundSecondary)
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
                Button(
                    onClick = {
                        coroutineScope.launch {
                            viewModel.saveDetails()
                        }
                        onNavigateBack()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Save Changes", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

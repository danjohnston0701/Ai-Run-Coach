package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ChangePasswordViewModel
import android.widget.Toast

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChangePasswordScreen(
    viewModel: ChangePasswordViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit = {},
    onSuccess: () -> Unit = {}
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val isKeyboardVisible = WindowInsets.isImeVisible

    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }

    var showCurrentPassword by remember { mutableStateOf(false) }
    var showNewPassword by remember { mutableStateOf(false) }
    var showConfirmPassword by remember { mutableStateOf(false) }

    // Handle success
    LaunchedEffect(state) {
        if (state is ChangePasswordViewModel.ChangePasswordState.Success) {
            Toast.makeText(context, "Password changed successfully", Toast.LENGTH_SHORT).show()
            viewModel.resetState()
            onSuccess()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        // Navigation Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Colors.backgroundDefault)
                .padding(horizontal = Spacing.lg, vertical = Spacing.lg),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                modifier = Modifier
                    .size(24.dp)
                    .clickable { onNavigateBack() },
                tint = Colors.textPrimary
            )
            Text(
                text = "Change Password",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.width(24.dp))
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundDefault),
            contentPadding = PaddingValues(
                start = Spacing.lg,
                top = Spacing.lg,
                end = Spacing.lg,
                bottom = if (isKeyboardVisible) 0.dp else Spacing.lg
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.lg)
        ) {
            // Description
            item {
                Text(
                    text = "Please enter your current password and then choose a new password.",
                    fontSize = 14.sp,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = Spacing.lg)
                )
            }

            // Error message
            if (state is ChangePasswordViewModel.ChangePasswordState.Error) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = Color(0xFFEF4444).copy(alpha = 0.12f)
                        )
                    ) {
                        Text(
                            text = (state as ChangePasswordViewModel.ChangePasswordState.Error).message,
                            fontSize = 14.sp,
                            color = Color(0xFFEF4444),
                            modifier = Modifier.padding(Spacing.lg)
                        )
                    }
                }
            }

            // Current Password Field
            item {
                PasswordFieldWithLabel(
                    label = "Current Password",
                    value = currentPassword,
                    onValueChange = { currentPassword = it },
                    isVisible = showCurrentPassword,
                    onToggleVisibility = { showCurrentPassword = !showCurrentPassword },
                    enabled = state !is ChangePasswordViewModel.ChangePasswordState.Loading
                )
            }

            // New Password Field
            item {
                PasswordFieldWithLabel(
                    label = "New Password",
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    isVisible = showNewPassword,
                    onToggleVisibility = { showNewPassword = !showNewPassword },
                    enabled = state !is ChangePasswordViewModel.ChangePasswordState.Loading
                )
            }

            // Confirm Password Field
            item {
                PasswordFieldWithLabel(
                    label = "Confirm New Password",
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it },
                    isVisible = showConfirmPassword,
                    onToggleVisibility = { showConfirmPassword = !showConfirmPassword },
                    enabled = state !is ChangePasswordViewModel.ChangePasswordState.Loading
                )
            }

            // Change Password Button
            item {
                Button(
                    onClick = {
                        viewModel.changePassword(currentPassword, newPassword, confirmPassword)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        disabledContainerColor = Colors.primary.copy(alpha = 0.5f)
                    ),
                    enabled = state !is ChangePasswordViewModel.ChangePasswordState.Loading && 
                             currentPassword.isNotEmpty() && newPassword.isNotEmpty() && confirmPassword.isNotEmpty(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (state is ChangePasswordViewModel.ChangePasswordState.Loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = Colors.buttonText,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = "Change Password",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Colors.buttonText
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PasswordFieldWithLabel(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    isVisible: Boolean,
    onToggleVisibility: () -> Unit,
    enabled: Boolean
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Text(
            text = label,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Colors.textPrimary
        )
        
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .background(Colors.backgroundSecondary),
            visualTransformation = if (isVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = {
                IconButton(onClick = onToggleVisibility, enabled = enabled) {
                    Icon(
                        imageVector = if (isVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                        contentDescription = if (isVisible) "Hide password" else "Show password",
                        tint = Colors.textSecondary
                    )
                }
            },
            enabled = enabled,
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Colors.primary,
                unfocusedBorderColor = Colors.border,
                cursorColor = Colors.primary,
                unfocusedTextColor = Colors.textPrimary,
                focusedTextColor = Colors.textPrimary
            )
        )
    }
}

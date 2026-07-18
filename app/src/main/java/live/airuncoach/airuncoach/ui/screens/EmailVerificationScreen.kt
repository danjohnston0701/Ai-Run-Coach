package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.LoginViewModel
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EmailVerificationScreen(
    email: String,
    onNavigateBack: () -> Unit = {},
    onVerificationSuccess: () -> Unit = {},
    viewModel: LoginViewModel = hiltViewModel()
) {
    val loginState by viewModel.loginState.collectAsState()
    var otp by remember { mutableStateOf("") }
    var resendCooldown by remember { mutableIntStateOf(0) }
    var showChangeEmailDialog by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    val density = LocalDensity.current
    val isKeyboardVisible = WindowInsets.isImeVisible
    val bottomContentPadding = with(density) {
        maxOf(
            if (isKeyboardVisible) WindowInsets.ime.getBottom(this) else 0,
            WindowInsets.navigationBars.getBottom(this)
        ).toDp() + Spacing.xl
    }

    // The displayed email — updates if user changes it
    val displayEmail = loginState.pendingVerificationEmail.ifBlank { email }

    // Countdown timer for resend cooldown
    LaunchedEffect(resendCooldown) {
        if (resendCooldown > 0) {
            delay(1000)
            resendCooldown--
        }
    }

    // Auto-submit when 6 digits entered
    LaunchedEffect(otp) {
        if (otp.length == 6) {
            viewModel.verifyEmail(otp, displayEmail)
        }
    }

    // Navigate on successful verification
    LaunchedEffect(loginState.isLoginSuccessful) {
        if (loginState.isLoginSuccessful) {
            onVerificationSuccess()
        }
    }

    // After email change success: clear OTP, close dialog, reset cooldown
    LaunchedEffect(loginState.changeEmailSuccess) {
        if (loginState.changeEmailSuccess) {
            otp = ""
            showChangeEmailDialog = false
            resendCooldown = 60
            viewModel.clearChangeEmailSuccess()
        }
    }

    // Request focus when screen opens
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = {
                        viewModel.resetVerificationState()
                        onNavigateBack()
                    }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Colors.textPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Spacing.lg)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(40.dp))

            // Email icon
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(
                        color = Colors.primary.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(24.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "✉️", fontSize = 36.sp)
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            Text(
                text = "Check your email",
                style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            Text(
                text = "We sent a 6-digit verification code to",
                style = AppTextStyles.body,
                color = Colors.textSecondary,
                textAlign = TextAlign.Center
            )
            Text(
                text = displayEmail,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                color = Colors.primary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(Spacing.sm))

            // "Wrong email?" link
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Wrong email? ",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
                Text(
                    text = "Change it",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary,
                    modifier = Modifier.clickable { showChangeEmailDialog = true }
                )
            }

            Spacer(modifier = Modifier.height(Spacing.xxxl))

            // Visible BasicTextField keeps Android's native paste action available.
            BasicTextField(
                value = otp,
                onValueChange = { new ->
                    otp = new.filter(Char::isDigit).take(6)
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier
                    .focusRequester(focusRequester)
                    .fillMaxWidth()
                    .clickable { focusRequester.requestFocus() },
                cursorBrush = SolidColor(Colors.primary),
                textStyle = TextStyle(color = Colors.backgroundRoot),
                decorationBox = { innerTextField ->
                    Box(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            repeat(6) { index ->
                                val char = otp.getOrNull(index)
                                val isFocused = index == otp.length && otp.length < 6
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .aspectRatio(0.9f)
                                        .background(
                                            color = if (char != null) Colors.primary.copy(alpha = 0.08f)
                                            else Colors.backgroundSecondary,
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        .border(
                                            width = if (isFocused) 2.dp else 1.dp,
                                            color = if (isFocused) Colors.primary
                                            else if (char != null) Colors.primary.copy(alpha = 0.4f)
                                            else Colors.backgroundSecondary,
                                            shape = RoundedCornerShape(10.dp)
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = char?.toString() ?: if (isFocused) "|" else "",
                                        style = TextStyle(
                                            fontSize = 22.sp,
                                            fontWeight = FontWeight.Bold,
                                            fontFamily = FontFamily.Monospace,
                                            color = if (char != null) Colors.textPrimary else Colors.primary
                                        )
                                    )
                                }
                            }
                        }
                        Box(modifier = Modifier.size(1.dp)) {
                            innerTextField()
                        }
                    }
                }
            )

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Error message
            if (loginState.error != null) {
                Text(
                    text = loginState.error!!,
                    style = AppTextStyles.body,
                    color = Colors.error,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(Spacing.md))
            }

            // Loading indicator
            if (loginState.isLoading) {
                CircularProgressIndicator(
                    color = Colors.primary,
                    modifier = Modifier.size(28.dp),
                    strokeWidth = 2.dp
                )
                Spacer(modifier = Modifier.height(Spacing.md))
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            // Verify button
            Button(
                onClick = { viewModel.verifyEmail(otp, displayEmail) },
                enabled = otp.length == 6 && !loginState.isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText,
                    disabledContainerColor = Colors.primary.copy(alpha = 0.3f),
                    disabledContentColor = Colors.buttonText.copy(alpha = 0.5f)
                )
            ) {
                Text(
                    text = "Verify Email",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            // Resend section
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Didn't receive a code? ",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
                if (resendCooldown > 0) {
                    Text(
                        text = "Resend in ${resendCooldown}s",
                        style = AppTextStyles.body,
                        color = Colors.textMuted
                    )
                } else {
                    Text(
                        text = "Resend",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary,
                        modifier = Modifier.clickable {
                            viewModel.resendVerificationEmail(displayEmail)
                            otp = ""
                            resendCooldown = 60
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            Text(
                text = "The code expires after 24 hours.",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(bottomContentPadding))
        }
    }

    // ── Change Email Dialog ────────────────────────────────────────────────
    if (showChangeEmailDialog) {
        ChangeVerificationEmailDialog(
            currentEmail = displayEmail,
            isLoading = loginState.isLoading,
            error = loginState.changeEmailError,
            onDismiss = {
                @Suppress("UNUSED_VALUE")
                showChangeEmailDialog = false
            },
            onConfirm = { updatedEmail -> viewModel.updateVerificationEmail(updatedEmail, displayEmail) }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChangeVerificationEmailDialog(
    currentEmail: String,
    isLoading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var newEmail by remember { mutableStateOf("") }
    val isValid = android.util.Patterns.EMAIL_ADDRESS.matcher(newEmail.trim()).matches()
        && newEmail.trim().lowercase() != currentEmail.trim().lowercase()

    Dialog(onDismissRequest = { if (!isLoading) onDismiss() }) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.ime)
        ) {
            Column(
                modifier = Modifier.padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Change Email Address",
                    style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )

                Spacer(modifier = Modifier.height(Spacing.sm))

                Text(
                    text = "Enter the correct email address. We'll send a new verification code.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(Spacing.lg))

                OutlinedTextField(
                    value = newEmail,
                    onValueChange = { newEmail = it },
                    label = { Text("New email address") },
                    placeholder = { Text("you@example.com") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isLoading,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )

                if (error != null) {
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        text = error,
                        style = AppTextStyles.caption,
                        color = Colors.error,
                        textAlign = TextAlign.Center
                    )
                }

                Spacer(modifier = Modifier.height(Spacing.xl))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        enabled = !isLoading,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(BorderRadius.md)
                    ) {
                        Text("Cancel", color = Colors.textSecondary)
                    }

                    Button(
                        onClick = { onConfirm(newEmail.trim()) },
                        enabled = isValid && !isLoading,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(BorderRadius.md),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = Colors.buttonText,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(
                                "Update",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                color = Colors.buttonText
                            )
                        }
                    }
                }
            }
        }
    }
}

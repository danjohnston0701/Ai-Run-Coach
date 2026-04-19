package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.ForgotPasswordRequest
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import kotlinx.coroutines.launch

private sealed class ForgotPasswordState {
    object Idle : ForgotPasswordState()
    object Loading : ForgotPasswordState()
    data class Success(val email: String) : ForgotPasswordState()
    data class Error(val message: String) : ForgotPasswordState()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForgotPasswordScreen(
    onNavigateBack: () -> Unit = {}
) {
    var email by remember { mutableStateOf("") }
    var screenState by remember { mutableStateOf<ForgotPasswordState>(ForgotPasswordState.Idle) }
    val coroutineScope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.xxxl)
                .padding(top = 80.dp)
                .padding(bottom = Spacing.xxxl),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            // Logo
            Box(
                modifier = Modifier
                    .size(120.dp)
                    .background(
                        color = Color(0xFF1A2332),
                        shape = RoundedCornerShape(BorderRadius.xl)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    painter = painterResource(id = R.drawable.icon),
                    contentDescription = "AI Run Coach Logo",
                    modifier = Modifier.size(80.dp)
                )
            }

            Spacer(modifier = Modifier.height(Spacing.xxxl))

            // Title
            Text(
                text = "Forgot Password?",
                style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )

            Spacer(modifier = Modifier.height(Spacing.sm))

            // Subtitle
            Text(
                text = "Enter your email and we'll send you\na link to reset your password.",
                style = AppTextStyles.body,
                color = Colors.textSecondary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(Spacing.xxxxl))

            if (screenState is ForgotPasswordState.Success) {
                // ── Success state ────────────────────────────────────────────
                val sentEmail = (screenState as ForgotPasswordState.Success).email

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = Color(0xFF0F3D2E),
                            shape = RoundedCornerShape(BorderRadius.md)
                        )
                        .padding(Spacing.lg),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "✓",
                            fontSize = 32.sp,
                            color = Color(0xFF34D399)
                        )
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            text = "Check your inbox",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(Spacing.xs))
                        Text(
                            text = "We've sent a reset link to\n$sentEmail",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(Spacing.xs))
                        Text(
                            text = "The link expires in 1 hour.",
                            style = AppTextStyles.small,
                            color = Colors.textMuted,
                            textAlign = TextAlign.Center
                        )
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.xxxl))

                // Back to login button
                Button(
                    onClick = onNavigateBack,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(Spacing.buttonHeight),
                    shape = RoundedCornerShape(BorderRadius.full),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    )
                ) {
                    Text(
                        text = "Back to Sign In",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                    )
                }

            } else {
                // ── Input state (Idle / Loading / Error) ─────────────────────

                // Email label
                Text(
                    text = "Email",
                    style = AppTextStyles.body,
                    color = Colors.textPrimary,
                    modifier = Modifier.align(Alignment.Start)
                )
                Spacer(modifier = Modifier.height(Spacing.sm))

                // Email input
                OutlinedTextField(
                    value = email,
                    onValueChange = {
                        email = it
                        // Clear error when user starts typing
                        if (screenState is ForgotPasswordState.Error) {
                            screenState = ForgotPasswordState.Idle
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(Spacing.inputHeight),
                    placeholder = {
                        Text(
                            text = "you@example.com",
                            color = Colors.textMuted,
                            style = AppTextStyles.body
                        )
                    },
                    leadingIcon = {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_email),
                            contentDescription = "Email Icon",
                            tint = Colors.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    },
                    textStyle = AppTextStyles.body,
                    shape = RoundedCornerShape(BorderRadius.md),
                    colors = TextFieldDefaults.outlinedTextFieldColors(
                        containerColor = Colors.backgroundTertiary,
                        focusedBorderColor = if (screenState is ForgotPasswordState.Error)
                            Colors.error else Colors.primary,
                        unfocusedBorderColor = if (screenState is ForgotPasswordState.Error)
                            Colors.error else Color.Transparent,
                        cursorColor = Colors.primary,
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary
                    ),
                    singleLine = true,
                    enabled = screenState !is ForgotPasswordState.Loading
                )

                Spacer(modifier = Modifier.height(Spacing.xxxl))

                // Send button
                Button(
                    onClick = {
                        val trimmedEmail = email.trim()
                        if (trimmedEmail.isBlank()) return@Button
                        coroutineScope.launch {
                            screenState = ForgotPasswordState.Loading
                            try {
                                RetrofitClient.apiService.forgotPassword(
                                    ForgotPasswordRequest(email = trimmedEmail)
                                )
                                // Always treat 200 as success regardless of whether
                                // the email was registered — protects user privacy
                                screenState = ForgotPasswordState.Success(trimmedEmail)
                            } catch (e: retrofit2.HttpException) {
                                if (e.code() == 500) {
                                    screenState = ForgotPasswordState.Error(
                                        "Couldn't send the email — please try again."
                                    )
                                } else {
                                    // Any other HTTP code (404, 422, etc.) → still show success
                                    screenState = ForgotPasswordState.Success(trimmedEmail)
                                }
                            } catch (_: Exception) {
                                screenState = ForgotPasswordState.Error(
                                    "No internet connection. Please check your network."
                                )
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(Spacing.buttonHeight),
                    shape = RoundedCornerShape(BorderRadius.full),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    ),
                    enabled = screenState !is ForgotPasswordState.Loading && email.isNotBlank()
                ) {
                    if (screenState is ForgotPasswordState.Loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = Colors.buttonText,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = "Send Reset Link",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }

                // Error message
                if (screenState is ForgotPasswordState.Error) {
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        text = (screenState as ForgotPasswordState.Error).message,
                        style = AppTextStyles.small,
                        color = Colors.error,
                        textAlign = TextAlign.Center
                    )
                }

                Spacer(modifier = Modifier.height(Spacing.lg))

                // Back to login
                TextButton(onClick = onNavigateBack) {
                    Text(
                        text = "Back to Sign In",
                        style = AppTextStyles.small,
                        color = Colors.textSecondary
                    )
                }
            }
        }
    }
}

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ForgotPasswordViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForgotPasswordScreen(
    onNavigateBack: () -> Unit = {},
    viewModel: ForgotPasswordViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

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
                .padding(top = 20.dp)
                .padding(bottom = Spacing.xxxl),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Back Button
            Row(
                modifier = Modifier
                    .fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            if (state.isEmailSent) {
                // Success State
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    // Success Icon
                    Box(
                        modifier = Modifier
                            .size(80.dp)
                            .background(
                                color = Colors.primary.copy(alpha = 0.1f),
                                shape = RoundedCornerShape(BorderRadius.xl)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_email),
                            contentDescription = "Email Sent",
                            tint = Colors.primary,
                            modifier = Modifier.size(40.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(Spacing.xxxl))

                    // Title
                    Text(
                        text = "Check your email",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(Spacing.md))

                    // Description
                    Text(
                        text = "We've sent a password reset link to ${state.email}. The link expires in 1 hour.",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(Spacing.lg))

                    // Info Box
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                color = Colors.backgroundTertiary,
                                shape = RoundedCornerShape(BorderRadius.md)
                            )
                            .padding(Spacing.md)
                    ) {
                        Text(
                            text = "💡 Check your spam folder if you don't see the email within a few minutes.",
                            style = AppTextStyles.small,
                            color = Colors.textSecondary,
                            textAlign = TextAlign.Center
                        )
                    }

                    Spacer(modifier = Modifier.height(Spacing.xxxxl))

                    // Back to Login Button
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
                            text = "Back to Login",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
            } else {
                // Form State
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Logo
                    Box(
                        modifier = Modifier
                            .size(100.dp)
                            .background(
                                color = Color(0xFF1A2332),
                                shape = RoundedCornerShape(BorderRadius.xl)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.icon),
                            contentDescription = "AI Run Coach Logo",
                            modifier = Modifier.size(70.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(Spacing.xxxl))

                    // Title
                    Text(
                        text = "Forgot Password?",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(Spacing.sm))

                    // Subtitle
                    Text(
                        text = "Enter your email and we'll send you a reset link",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(Spacing.xxxxl))

                    // Email Field
                    Text(
                        text = "Email",
                        style = AppTextStyles.body,
                        color = Colors.textPrimary,
                        modifier = Modifier.align(Alignment.Start)
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    OutlinedTextField(
                        value = state.email,
                        onValueChange = { viewModel.onEmailChange(it) },
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
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Done
                        ),
                        textStyle = AppTextStyles.body,
                        shape = RoundedCornerShape(BorderRadius.md),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Colors.backgroundTertiary,
                            unfocusedContainerColor = Colors.backgroundTertiary,
                            focusedBorderColor = Colors.primary,
                            unfocusedBorderColor = Color.Transparent,
                            cursorColor = Colors.primary,
                            focusedTextColor = Colors.textPrimary,
                            unfocusedTextColor = Colors.textPrimary
                        ),
                        singleLine = true,
                        enabled = !state.isLoading
                    )

                    Spacer(modifier = Modifier.height(Spacing.xxxl))

                    // Error message
                    if (state.error != null) {
                        Text(
                            text = state.error ?: "",
                            style = AppTextStyles.small,
                            color = Colors.error,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(Spacing.md))
                    }

                    // Send Reset Link Button
                    Button(
                        onClick = { viewModel.sendResetEmail() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(Spacing.buttonHeight),
                        shape = RoundedCornerShape(BorderRadius.full),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        ),
                        enabled = !state.isLoading && state.email.isNotBlank()
                    ) {
                        if (state.isLoading) {
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

                    Spacer(modifier = Modifier.height(Spacing.lg))

                    // Back to Login Link
                    TextButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    ) {
                        Text(
                            text = "Back to Login",
                            style = AppTextStyles.body,
                            color = Colors.primary
                        )
                    }
                }
            }
        }
    }
}

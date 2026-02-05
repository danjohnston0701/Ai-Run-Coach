package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.ui.focus.onFocusEvent
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.LoginViewModel
import androidx.compose.foundation.ExperimentalFoundationApi

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun SignUpScreen(
    onNavigateToLocationPermission: () -> Unit = {},
    onNavigateToMain: () -> Unit = {},
    onNavigateToSignIn: () -> Unit = {},
    viewModel: LoginViewModel = hiltViewModel()
) {
    val loginState by viewModel.loginState.collectAsState()
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmPasswordVisible by remember { mutableStateOf(false) }
    
    // Keyboard handling
    val nameBringIntoView = remember { BringIntoViewRequester() }
    val emailBringIntoView = remember { BringIntoViewRequester() }
    val passwordBringIntoView = remember { BringIntoViewRequester() }
    val confirmPasswordBringIntoView = remember { BringIntoViewRequester() }
    val coroutineScope = rememberCoroutineScope()

    // Navigate on successful registration
    LaunchedEffect(loginState.isLoginSuccessful) {
        if (loginState.isLoginSuccessful) {
            // After sign up, always show location permission screen
            onNavigateToLocationPermission()
        }
    }

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
                .padding(top = 60.dp)
                .padding(bottom = Spacing.xxxl),
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

            Spacer(modifier = Modifier.height(Spacing.xl))

            // Title
            Text(
                text = "AI Run Coach",
                style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )

            Spacer(modifier = Modifier.height(Spacing.sm))

            // Subtitle
            Text(
                text = "Create an account to start your journey",
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )

            Spacer(modifier = Modifier.height(Spacing.xxxl))

            // Name Field
            Text(
                text = "Name",
                style = AppTextStyles.body,
                color = Colors.textPrimary,
                modifier = Modifier.align(Alignment.Start)
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            OutlinedTextField(
                value = loginState.name,
                onValueChange = { viewModel.onNameChange(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.inputHeight)
                    .bringIntoViewRequester(nameBringIntoView)
                    .onFocusEvent { focusState ->
                        if (focusState.isFocused) {
                            coroutineScope.launch {
                                nameBringIntoView.bringIntoView()
                            }
                        }
                    },
                placeholder = {
                    Text(
                        text = "Your name",
                        color = Colors.textMuted,
                        style = AppTextStyles.body
                    )
                },
                leadingIcon = {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_person),
                        contentDescription = "Name Icon",
                        tint = Colors.textMuted,
                        modifier = Modifier.size(20.dp)
                    )
                },
                textStyle = AppTextStyles.body,
                shape = RoundedCornerShape(BorderRadius.md),
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = Colors.backgroundTertiary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Color.Transparent,
                    cursorColor = Colors.primary,
                    focusedTextColor = Colors.textPrimary,
                    unfocusedTextColor = Colors.textPrimary
                ),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Email Field
            Text(
                text = "Email",
                style = AppTextStyles.body,
                color = Colors.textPrimary,
                modifier = Modifier.align(Alignment.Start)
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            OutlinedTextField(
                value = loginState.email,
                onValueChange = { viewModel.onEmailChange(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.inputHeight)
                    .bringIntoViewRequester(emailBringIntoView)
                    .onFocusEvent { focusState ->
                        if (focusState.isFocused) {
                            coroutineScope.launch {
                                emailBringIntoView.bringIntoView()
                            }
                        }
                    },
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
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Color.Transparent,
                    cursorColor = Colors.primary,
                    focusedTextColor = Colors.textPrimary,
                    unfocusedTextColor = Colors.textPrimary
                ),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Password Field
            Text(
                text = "Password",
                style = AppTextStyles.body,
                color = Colors.textPrimary,
                modifier = Modifier.align(Alignment.Start)
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            OutlinedTextField(
                value = loginState.password,
                onValueChange = { viewModel.onPasswordChange(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.inputHeight)
                    .bringIntoViewRequester(passwordBringIntoView)
                    .onFocusEvent { focusState ->
                        if (focusState.isFocused) {
                            coroutineScope.launch {
                                passwordBringIntoView.bringIntoView()
                            }
                        }
                    },
                placeholder = {
                    Text(
                        text = "Enter your password",
                        color = Colors.textMuted,
                        style = AppTextStyles.body
                    )
                },
                leadingIcon = {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_lock),
                        contentDescription = "Password Icon",
                        tint = Colors.textMuted,
                        modifier = Modifier.size(20.dp)
                    )
                },
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            painter = painterResource(
                                id = if (passwordVisible) R.drawable.icon_eye_off
                                else R.drawable.icon_eye
                            ),
                            contentDescription = if (passwordVisible) "Hide password" else "Show password",
                            tint = Colors.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                },
                visualTransformation = if (passwordVisible) VisualTransformation.None
                else PasswordVisualTransformation(),
                textStyle = AppTextStyles.body,
                shape = RoundedCornerShape(BorderRadius.md),
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = Colors.backgroundTertiary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Color.Transparent,
                    cursorColor = Colors.primary,
                    focusedTextColor = Colors.textPrimary,
                    unfocusedTextColor = Colors.textPrimary
                ),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Confirm Password Field
            Text(
                text = "Confirm Password",
                style = AppTextStyles.body,
                color = Colors.textPrimary,
                modifier = Modifier.align(Alignment.Start)
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            OutlinedTextField(
                value = loginState.confirmPassword,
                onValueChange = { viewModel.onConfirmPasswordChange(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.inputHeight)
                    .bringIntoViewRequester(confirmPasswordBringIntoView)
                    .onFocusEvent { focusState ->
                        if (focusState.isFocused) {
                            coroutineScope.launch {
                                confirmPasswordBringIntoView.bringIntoView()
                            }
                        }
                    },
                placeholder = {
                    Text(
                        text = "Confirm your password",
                        color = Colors.textMuted,
                        style = AppTextStyles.body
                    )
                },
                leadingIcon = {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_lock),
                        contentDescription = "Confirm Password Icon",
                        tint = Colors.textMuted,
                        modifier = Modifier.size(20.dp)
                    )
                },
                trailingIcon = {
                    IconButton(onClick = { confirmPasswordVisible = !confirmPasswordVisible }) {
                        Icon(
                            painter = painterResource(
                                id = if (confirmPasswordVisible) R.drawable.icon_eye_off
                                else R.drawable.icon_eye
                            ),
                            contentDescription = if (confirmPasswordVisible) "Hide password" else "Show password",
                            tint = Colors.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                },
                visualTransformation = if (confirmPasswordVisible) VisualTransformation.None
                else PasswordVisualTransformation(),
                textStyle = AppTextStyles.body,
                shape = RoundedCornerShape(BorderRadius.md),
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = Colors.backgroundTertiary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Color.Transparent,
                    cursorColor = Colors.primary,
                    focusedTextColor = Colors.textPrimary,
                    unfocusedTextColor = Colors.textPrimary
                ),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(Spacing.xxxl))

            // Create Account Button
            Button(
                onClick = { viewModel.register() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.buttonHeight),
                shape = RoundedCornerShape(BorderRadius.full),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                ),
                enabled = !loginState.isLoading &&
                        loginState.name.isNotBlank() &&
                        loginState.email.isNotBlank() &&
                        loginState.password.isNotBlank() &&
                        loginState.confirmPassword.isNotBlank()
            ) {
                if (loginState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Colors.buttonText,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = "Create Account",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Error message
            if (loginState.error != null) {
                Text(
                    text = loginState.error ?: "",
                    style = AppTextStyles.small,
                    color = Colors.error,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(Spacing.md))
            }

            // Sign In Link
            val annotatedString = buildAnnotatedString {
                withStyle(style = SpanStyle(color = Colors.textSecondary)) {
                    append("Already have an account? ")
                }
                withStyle(
                    style = SpanStyle(
                        color = Colors.primary,
                        fontWeight = FontWeight.Bold
                    )
                ) {
                    append("Sign In")
                }
            }

            Text(
                text = annotatedString,
                style = AppTextStyles.body,
                modifier = Modifier.clickable { onNavigateToSignIn() }
            )

            Spacer(modifier = Modifier.height(Spacing.xl))

            // Terms and Privacy
            Text(
                text = "By continuing, you agree to our Terms of\nService and Privacy Policy",
                style = AppTextStyles.small,
                color = Colors.textMuted,
                textAlign = TextAlign.Center
            )
        }
    }
}

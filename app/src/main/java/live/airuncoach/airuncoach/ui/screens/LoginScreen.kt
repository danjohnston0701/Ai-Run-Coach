package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.foundation.border
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.LoginState
import live.airuncoach.airuncoach.viewmodel.LoginViewModel
import live.airuncoach.airuncoach.viewmodel.LoginViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(onLoginSuccess: () -> Unit) {
    val context = LocalContext.current
    val sessionManager = remember { SessionManager(context) }
    val viewModel: LoginViewModel = viewModel(
        factory = LoginViewModelFactory(context, sessionManager)
    )

    val loginState by viewModel.loginState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var isLogin by remember { mutableStateOf(true) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }

    // Handle login state changes
    LaunchedEffect(loginState) {
        when (loginState) {
            is LoginState.Success -> {
                onLoginSuccess()
            }
            is LoginState.Error -> {
                scope.launch {
                    snackbarHostState.showSnackbar((loginState as LoginState.Error).message)
                    viewModel.resetState()
                }
            }
            else -> {}
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundRoot)
                .verticalScroll(rememberScrollState())
                .padding(Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Spacer(modifier = Modifier.height(Spacing.xxxxl))
            
            Image(
                painter = painterResource(id = R.drawable.icon),
                contentDescription = "App Logo",
                modifier = Modifier.size(80.dp)
            )
            
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            Text(
                text = "AI Run Coach",
                style = AppTextStyles.h1,
                color = Colors.textPrimary
            )
            
            Spacer(modifier = Modifier.height(Spacing.sm))
            
            Text(
                text = if (isLogin) "Welcome back! Sign in to continue" else "Create an account to start your journey",
                style = AppTextStyles.body,
                color = Colors.textSecondary,
                textAlign = TextAlign.Center
            )
            
            Spacer(modifier = Modifier.height(Spacing.xxxl))

            // Name field (only for registration)
            if (!isLogin) {
                AppTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = "Name",
                    leadingIcon = R.drawable.icon_person,
                    enabled = loginState !is LoginState.Loading
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // Email field
            AppTextField(
                value = email,
                onValueChange = { email = it },
                label = "Email",
                leadingIcon = R.drawable.icon_email,
                enabled = loginState !is LoginState.Loading
            )
            
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            // Password field
            AppTextField(
                value = password,
                onValueChange = { password = it },
                label = "Password",
                leadingIcon = R.drawable.icon_lock,
                isPassword = true,
                enabled = loginState !is LoginState.Loading
            )

            // Confirm password field (only for registration)
            if (!isLogin) {
                Spacer(modifier = Modifier.height(Spacing.lg))
                AppTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it },
                    label = "Confirm Password",
                    leadingIcon = R.drawable.icon_lock,
                    isPassword = true,
                    enabled = loginState !is LoginState.Loading
                )
            }

            Spacer(modifier = Modifier.height(Spacing.xxl))

            // Submit button
            Button(
                onClick = {
                    if (isLogin) {
                        viewModel.login(email.trim(), password)
                    } else {
                        viewModel.register(name.trim(), email.trim(), password, confirmPassword)
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
                enabled = loginState !is LoginState.Loading
            ) {
                Text(
                    text = if (loginState is LoginState.Loading) {
                        "Loading..."
                    } else {
                        if (isLogin) "Sign In" else "Create Account"
                    },
                    style = AppTextStyles.h4
                )
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Toggle between login and register
            val annotatedString = AnnotatedString.Builder().apply {
                append(if (isLogin) "Don't have an account? " else "Already have an account? ")
                pushStyle(AppTextStyles.link.toSpanStyle())
                append(if (isLogin) "Sign Up" else "Sign In")
                pop()
            }.toAnnotatedString()

            ClickableText(
                text = annotatedString,
                onClick = {
                    isLogin = !isLogin
                    viewModel.resetState()
                },
                style = AppTextStyles.body.copy(color = Colors.textSecondary)
            )

            Spacer(modifier = Modifier.height(Spacing.xxxl))

            Text(
                text = "By continuing, you agree to our Terms of Service and Privacy Policy",
                style = AppTextStyles.small,
                color = Colors.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(vertical = Spacing.lg)
            )
        }

        // Snackbar for errors
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(Spacing.lg)
        ) { data ->
            Snackbar(
                snackbarData = data,
                containerColor = Colors.error,
                contentColor = Colors.textPrimary
            )
        }
    }
}

@Composable
fun AppTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    leadingIcon: Int,
    isPassword: Boolean = false,
    enabled: Boolean = true
) {
    var passwordVisible by remember { mutableStateOf(false) }
    var isFocused by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = if (isFocused) Colors.primary else Colors.border,
                shape = RoundedCornerShape(BorderRadius.sm)
            )
            .background(Color.Transparent)
            .padding(horizontal = Spacing.md, vertical = Spacing.sm)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Leading icon
            Icon(
                painter = painterResource(id = leadingIcon),
                contentDescription = null,
                tint = if (enabled) Colors.textMuted else Colors.textMuted.copy(alpha = 0.5f),
                modifier = Modifier.size(24.dp)
            )

            Spacer(modifier = Modifier.width(Spacing.sm))

            // Text field
            Box(modifier = Modifier.weight(1f)) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    textStyle = AppTextStyles.body.copy(color = Colors.textPrimary),
                    visualTransformation = if (isPassword && !passwordVisible) PasswordVisualTransformation() else VisualTransformation.None,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (isPassword) KeyboardType.Password else KeyboardType.Text
                    ),
                    singleLine = true,
                    enabled = enabled,
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(Colors.primary),
                    decorationBox = { innerTextField ->
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.CenterStart
                        ) {
                            if (value.isEmpty()) {
                                Text(
                                    text = label,
                                    style = AppTextStyles.body,
                                    color = Colors.textMuted
                                )
                            }
                            innerTextField()
                        }
                    }
                )
            }

            // Trailing icon (password visibility toggle)
            if (isPassword) {
                Spacer(modifier = Modifier.width(Spacing.sm))
                val icon = if (passwordVisible) R.drawable.icon_eye_off else R.drawable.icon_eye
                Icon(
                    painter = painterResource(id = icon),
                    contentDescription = if (passwordVisible) "Hide password" else "Show password",
                    modifier = Modifier
                        .size(24.dp)
                        .clickable { passwordVisible = !passwordVisible },
                    tint = Colors.textMuted
                )
            }
        }
    }
}

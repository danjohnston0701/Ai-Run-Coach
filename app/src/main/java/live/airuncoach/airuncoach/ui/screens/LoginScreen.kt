package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.AppRoutes
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.LoginViewModel
import androidx.compose.foundation.ExperimentalFoundationApi

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun LoginScreen(
    onNavigateToLocationPermission: () -> Unit = {},
    onNavigateToMain: () -> Unit = {},
    onNavigateToSignUp: () -> Unit = {},
    viewModel: LoginViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val loginState by viewModel.loginState.collectAsState()
    var passwordVisible by remember { mutableStateOf(false) }
    var isCheckingAuth by remember { mutableStateOf(true) }
    
    // Keyboard handling
    val emailBringIntoView = remember { BringIntoViewRequester() }
    val passwordBringIntoView = remember { BringIntoViewRequester() }
    val coroutineScope = rememberCoroutineScope()

    // Check if already logged in on first load
    LaunchedEffect(Unit) {
        try {
            val sessionManager = SessionManager(context)
            val token = sessionManager.getAuthToken()
            
            android.util.Log.d("LoginScreen", "Checking auth token: ${if (token != null) "EXISTS" else "NULL"}")
            
            // Only auto-navigate if we have a valid non-empty token
            if (!token.isNullOrBlank() && token.length > 10) {
                android.util.Log.d("LoginScreen", "Valid token found, checking permissions...")
                
                // User appears to be logged in, check if location permission is granted
                val hasLocationPermission = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                
                if (hasLocationPermission) {
                    // Already logged in and has permission, go to main
                    android.util.Log.d("LoginScreen", "Has location permission, navigating to main")
                    onNavigateToMain()
                } else {
                    // Logged in but needs location permission
                    android.util.Log.d("LoginScreen", "No location permission, showing permission screen")
                    onNavigateToLocationPermission()
                }
                return@LaunchedEffect
            } else {
                android.util.Log.d("LoginScreen", "No valid token, showing login screen")
            }
        } catch (e: Exception) {
            // If check fails, just continue to show login screen
            android.util.Log.e("LoginScreen", "Error checking auth: ${e.message}")
        }
        isCheckingAuth = false
    }

    // Navigate on successful login
    LaunchedEffect(loginState.isLoginSuccessful) {
        if (loginState.isLoginSuccessful) {
            android.util.Log.d("LoginScreen", "Login successful, navigating to location permission")
            // After login, always show location permission screen first
            onNavigateToLocationPermission()
        }
    }

    // Show loading while checking auth
    if (isCheckingAuth) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundRoot),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = Colors.primary)
        }
        return
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
                text = "AI Run Coach",
                style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )

            Spacer(modifier = Modifier.height(Spacing.sm))

            // Subtitle
            Text(
                text = "Welcome back! Sign in to continue",
                style = AppTextStyles.body,
                color = Colors.textSecondary
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

            Spacer(modifier = Modifier.height(Spacing.xxxl))

            // Sign In Button
            Button(
                onClick = { viewModel.login() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Spacing.buttonHeight),
                shape = RoundedCornerShape(BorderRadius.full),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                ),
                enabled = !loginState.isLoading && loginState.email.isNotBlank() && loginState.password.isNotBlank()
            ) {
                if (loginState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Colors.buttonText,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = "Sign In",
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

            // Sign Up Link
            val annotatedString = buildAnnotatedString {
                withStyle(style = SpanStyle(color = Colors.textSecondary)) {
                    append("Don't have an account? ")
                }
                withStyle(
                    style = SpanStyle(
                        color = Colors.primary,
                        fontWeight = FontWeight.Bold
                    )
                ) {
                    append("Sign Up")
                }
            }

            Text(
                text = annotatedString,
                style = AppTextStyles.body,
                modifier = Modifier.clickable { onNavigateToSignUp() }
            )

            Spacer(modifier = Modifier.height(Spacing.xxxl))

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

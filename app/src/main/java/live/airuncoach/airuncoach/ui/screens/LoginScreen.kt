package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.ui.focus.onFocusEvent
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.LoginViewModel
import live.airuncoach.airuncoach.viewmodel.ObserverLoginViewModel
import live.airuncoach.airuncoach.util.NotificationPermissionHelper
import live.airuncoach.airuncoach.util.CredentialManagerHelper
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.text.ClickableText
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.activity.ComponentActivity

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun LoginScreen(
    onNavigateToLocationPermission: () -> Unit = {},
    onNavigateToMain: () -> Unit = {},
    onNavigateToSignUp: () -> Unit = {},
    onNavigateToForgotPassword: () -> Unit = {},
    onNavigateToObserverSession: (sessionId: String) -> Unit = {}, // TODO: Remove when Live Share is enabled
    onNavigateToEmailVerification: (email: String) -> Unit = {},
    onNavigateToTour: () -> Unit = {},
    viewModel: LoginViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val loginState by viewModel.loginState.collectAsState()
    var passwordVisible by remember { mutableStateOf(false) }
    var isCheckingAuth by remember { mutableStateOf(true) }
    var showObserverTokenInput by remember { mutableStateOf(false) }
    // Fresh install vs returning device. A device that has never had an account signed in
    // gets a create-account-first welcome (the download → account step is where we lose
    // people); any device with a previous login gets the sign-in form straight away.
    // "Log in" on the welcome flips this for the session so existing users on a new phone
    // aren't stuck.
    var showSignInForm by remember { mutableStateOf(SessionManager(context).hasEverLoggedIn()) }
    
    // Keyboard handling
    val emailBringIntoView = remember { BringIntoViewRequester() }
    val passwordBringIntoView = remember { BringIntoViewRequester() }
    val coroutineScope = rememberCoroutineScope()
    val density = LocalDensity.current
    val isKeyboardVisible = WindowInsets.isImeVisible
    val bottomContentPadding = with(density) {
        maxOf(
            if (isKeyboardVisible) WindowInsets.ime.getBottom(this) else 0,
            WindowInsets.navigationBars.getBottom(this)
        ).toDp() + Spacing.xxxl
    }
    
    // Notification permission launcher
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted: Boolean ->
            if (isGranted) {
                android.util.Log.d("LoginScreen", "Notification permission granted ✅")
            } else {
                android.util.Log.d("LoginScreen", "Notification permission denied")
            }
        }
    )

    // Check if already logged in on first load.
    // We validate the token LOCALLY by decoding the JWT exp claim — no network
    // call needed. This avoids logging the user out due to transient network
    // errors or server blips on app startup. True server-side rejection (401)
    // is handled by the RetrofitClient interceptor at runtime.
    LaunchedEffect(Unit) {
        val sessionManager = SessionManager(context)
        val token = sessionManager.getAuthToken()

        android.util.Log.d("LoginScreen", "Checking auth token: ${if (token != null) "EXISTS (len=${token.length})" else "NULL"}")

        if (sessionManager.isSessionValid()) {
            // Token exists and has not yet expired — go straight to the app.
            android.util.Log.d("LoginScreen", "Session valid (local JWT check), skipping login screen")

            val hasLocationPermission = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (hasLocationPermission) {
                android.util.Log.d("LoginScreen", "Has location permission → MainScreen")
                onNavigateToMain()
            } else {
                android.util.Log.d("LoginScreen", "Needs location permission → PermissionScreen")
                onNavigateToLocationPermission()
            }
            return@LaunchedEffect
        }

        // No token or token has expired — show the login screen.
        android.util.Log.d("LoginScreen", "No valid session (token missing or expired), showing login screen")
        isCheckingAuth = false
    }

    // Navigate to email verification when the server rejects login with 403/requiresVerification
    // (LoginViewModel.login() sets these flags but deliberately leaves `error` null for this case
    // — see the comment there — so without this the user got no feedback and stayed stuck on the
    // login screen with the button just going back to idle. SignUpScreen already has the
    // equivalent effect for the just-registered path; LoginScreen never had it for the
    // returning-user path.
    LaunchedEffect(loginState.requiresEmailVerification) {
        if (loginState.requiresEmailVerification && loginState.pendingVerificationEmail.isNotBlank()) {
            onNavigateToEmailVerification(loginState.pendingVerificationEmail)
        }
    }

    // Navigate on successful login
    LaunchedEffect(loginState.isLoginSuccessful) {
        if (loginState.isLoginSuccessful) {
            android.util.Log.d("LoginScreen", "Login successful, requesting notification permission")

            // Only offer to save credentials if they didn't come from the password manager.
            // If user logged in with saved credentials, don't prompt to save the same credentials again.
            if (!loginState.credentialsFromPasswordManager) {
                // Offer to save credentials to Samsung Pass / Google Password Manager.
                // This shows the system "Save password?" bottom sheet before navigating away.
                val activity = context as? ComponentActivity
                if (activity != null) {
                    CredentialManagerHelper.saveCredential(
                        activity = activity,
                        email = loginState.email,
                        password = loginState.password
                    )
                }
            } else {
                android.util.Log.d("LoginScreen", "Credentials from password manager — skipping save prompt")
            }

            // Request notification permission after successful login
            if (NotificationPermissionHelper.shouldRequestPermission()) {
                notificationPermissionLauncher.launch(NotificationPermissionHelper.getPermissionString())
            }
            
            // After a brief delay, navigate to location permission screen
            kotlinx.coroutines.delay(500)
            onNavigateToLocationPermission()
        }
    }

    // On screen load: try to retrieve saved credentials from Samsung Pass / Google PM
    // If the user has saved credentials, pre-fill the fields automatically.
    LaunchedEffect(isCheckingAuth) {
        if (!isCheckingAuth) {
            val activity = context as? ComponentActivity ?: return@LaunchedEffect
            val saved = CredentialManagerHelper.getSavedCredential(activity)
            if (saved != null) {
                viewModel.onEmailChange(saved.first)
                viewModel.onPasswordChange(saved.second)
                // Mark credentials as coming from password manager so we don't re-prompt to save them
                viewModel.markCredentialsFromPasswordManager(true)
                android.util.Log.d("LoginScreen", "Pre-filled credentials from password manager")
            }
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
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.xxxl)
                .padding(top = 80.dp)
                .padding(bottom = 0.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Title (the app-icon logo that used to sit above this was removed — it pushed
            // the form and the sign-up CTA below the fold on smaller phones for no benefit)
            Text(
                text = "Ai Run Coach",
                style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )

            Spacer(modifier = Modifier.height(Spacing.sm))

            if (!showSignInForm) {
                NewInstallWelcome(
                    onCreateAccount = onNavigateToSignUp,
                    onTakeTour = onNavigateToTour,
                    onSignInInstead = { showSignInForm = true },
                    onObserverSession = onNavigateToObserverSession,
                )
                Spacer(modifier = Modifier.height(Spacing.xxxl))
                LoginTermsText()
                Spacer(modifier = Modifier.height(bottomContentPadding))
                return@Column
            }

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
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next
                ),
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
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done
                ),
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

            Spacer(modifier = Modifier.height(Spacing.sm))

            // Forgot password link
            TextButton(
                onClick = onNavigateToForgotPassword,
                modifier = Modifier.align(Alignment.End)
            ) {
                Text(
                    text = "Forgot Password?",
                    style = AppTextStyles.small,
                    color = Colors.primary
                )
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

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Divider
            HorizontalDivider(color = Colors.primary.copy(alpha = 0.2f))

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Observer token input — expands when user taps the button
            ObserverTokenInputSection(
                isExpanded = showObserverTokenInput,
                onExpandToggle = { showObserverTokenInput = it },
                onSessionStarted = onNavigateToObserverSession
            )

            Spacer(modifier = Modifier.height(Spacing.xxxl))

            LoginTermsText()
            Spacer(modifier = Modifier.height(bottomContentPadding))
        }
    }
}

/**
 * What a fresh install sees instead of the sign-in form: one job, get them to create an
 * account. "Take a tour" lets them see the product before committing (the tour runs
 * pre-login — see RootNavigationGraph's "onboarding_tour_preview"), and the sign-in link is
 * the escape hatch for an existing user on a new device.
 */
@Composable
private fun NewInstallWelcome(
    onCreateAccount: () -> Unit,
    onTakeTour: () -> Unit,
    onSignInInstead: () -> Unit,
    onObserverSession: (sessionId: String) -> Unit,
) {
    var showObserverInput by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "Your AI running coach — live in your ear, every run",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.xxxxl))

        Text(
            text = "Get started with a free account",
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(
            text = "14-day free trial. No card needed — real-time AI coaching, post-run analysis and training plans from your first run.",
            style = AppTextStyles.small,
            color = Colors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(Spacing.xl))

        Button(
            onClick = onCreateAccount,
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
                text = "Create a Free Account",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.md))

        OutlinedButton(
            onClick = onTakeTour,
            modifier = Modifier
                .fillMaxWidth()
                .height(Spacing.buttonHeight),
            shape = RoundedCornerShape(BorderRadius.full),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary),
            border = BorderStroke(1.dp, Colors.primary)
        ) {
            Text(
                text = "Take a Tour First",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.SemiBold)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.xl))

        val signInString = buildAnnotatedString {
            withStyle(style = SpanStyle(color = Colors.textSecondary)) {
                append("Already have an account? ")
            }
            withStyle(style = SpanStyle(color = Colors.primary, fontWeight = FontWeight.Bold)) {
                append("Log In")
            }
        }
        Text(
            text = signInString,
            style = AppTextStyles.body,
            modifier = Modifier
                .clickable { onSignInInstead() }
                .padding(Spacing.sm)
        )

        Spacer(modifier = Modifier.height(Spacing.lg))
        HorizontalDivider(color = Colors.primary.copy(alpha = 0.2f))
        Spacer(modifier = Modifier.height(Spacing.lg))

        // Invited to watch someone's live run? No account needed — same entry point the
        // sign-in form offers, so a brand-new download with an invite isn't stuck.
        ObserverTokenInputSection(
            isExpanded = showObserverInput,
            onExpandToggle = { showObserverInput = it },
            onSessionStarted = onObserverSession
        )
    }
}

/** Terms / Privacy footer shared by the sign-in form and the new-install welcome. */
@Composable
private fun LoginTermsText() {
    val uriHandler = LocalUriHandler.current
    val termsUrl = "https://airuncoach.live/privacy"

    val termsAnnotatedString = buildAnnotatedString {
        append("By continuing, you agree to our ")
        pushStringAnnotation(tag = "URL", annotation = termsUrl)
        withStyle(
            style = SpanStyle(
                color = Colors.primary,
                textDecoration = TextDecoration.Underline
            )
        ) {
            append("Terms of Service")
        }
        pop()
        append(" and ")
        pushStringAnnotation(tag = "URL", annotation = termsUrl)
        withStyle(
            style = SpanStyle(
                color = Colors.primary,
                textDecoration = TextDecoration.Underline
            )
        ) {
            append("Privacy Policy")
        }
        pop()
    }

    ClickableText(
        text = termsAnnotatedString,
        style = AppTextStyles.small.copy(
            color = Colors.textMuted,
            textAlign = TextAlign.Center
        ),
        onClick = { offset ->
            termsAnnotatedString.getStringAnnotations(tag = "URL", start = offset, end = offset)
                .firstOrNull()?.let { annotation ->
                    uriHandler.openUri(annotation.item)
                }
        }
    )
}

/**
 * Expandable observer token input section on the login screen.
 * User taps "Observe Live Run" button to expand, then enters invitation token and confirms.
 */
@Composable
private fun ObserverTokenInputSection(
    isExpanded: Boolean,
    onExpandToggle: (Boolean) -> Unit,
    onSessionStarted: (sessionId: String) -> Unit
) {
    val viewModel: ObserverLoginViewModel = hiltViewModel()
    val token by viewModel.token.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val resolvedSessionId by viewModel.resolvedSessionId.collectAsState()

    // Navigate when session is resolved
    LaunchedEffect(resolvedSessionId) {
        resolvedSessionId?.let { onSessionStarted(it) }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        // Tap to expand button
        OutlinedButton(
            onClick = { onExpandToggle(!isExpanded) },
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = Colors.primary
            ),
            border = BorderStroke(1.dp, Colors.primary)
        ) {
            Text(
                "🏃 Observe Live Run",
                style = AppTextStyles.body,
                color = Colors.primary
            )
        }

        // Expanded input area
        if (isExpanded) {
            Spacer(modifier = Modifier.height(Spacing.md))

            Text(
                "Enter your invitation token",
                style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            // Token input field
            TextField(
                value = token,
                onValueChange = { viewModel.setToken(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                placeholder = {
                    Text(
                        "Paste token from email",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                },
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Colors.backgroundTertiary.copy(alpha = 0.5f),
                    unfocusedContainerColor = Colors.backgroundTertiary.copy(alpha = 0.3f),
                    focusedIndicatorColor = Colors.primary,
                    unfocusedIndicatorColor = Colors.backgroundTertiary.copy(alpha = 0.5f)
                ),
                textStyle = AppTextStyles.small,
                singleLine = true
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // Error message
            if (error != null) {
                Text(
                    error ?: "",
                    style = AppTextStyles.small,
                    color = Colors.error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 8.dp)
                )
            }

            // Confirm button
            Button(
                onClick = { viewModel.validateAndLoadSession(token) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                enabled = token.isNotBlank() && !isLoading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    disabledContainerColor = Colors.backgroundTertiary.copy(alpha = 0.5f)
                )
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Colors.textPrimary,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        "Watch Now",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            Text(
                "Invited to watch a run? Enter your token",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

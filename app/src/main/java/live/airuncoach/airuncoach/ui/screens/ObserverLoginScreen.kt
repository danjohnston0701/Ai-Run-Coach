package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.viewmodel.ObserverLoginViewModel

/**
 * Entry screen for non-registered observers to watch a live run.
 *
 * Two entry paths:
 * 1. Deep link: airuncoach://observe/{token}  — token is auto-filled and submitted immediately
 * 2. Manual:    Tap "Observe Live Run" on the login screen, type/paste token
 *
 * On success the caller receives the resolved session ID and navigates to
 * ObserverRunSessionScreen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ObserverLoginScreen(
    initialToken: String? = null,
    onObserverSessionStarted: (sessionId: String) -> Unit,
    onNavigateBack: () -> Unit
) {
    val viewModel: ObserverLoginViewModel = hiltViewModel()
    val token by viewModel.token.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val resolvedSessionId by viewModel.resolvedSessionId.collectAsState()

    // When token arrives via deep link, auto-fill and immediately validate
    LaunchedEffect(initialToken) {
        if (!initialToken.isNullOrBlank()) {
            viewModel.setToken(initialToken)
            viewModel.validateAndLoadSession(initialToken)
        }
    }

    // Navigate as soon as we have a resolved session ID
    LaunchedEffect(resolvedSessionId) {
        resolvedSessionId?.let { onObserverSessionStarted(it) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("Watch Live Run", style = AppTextStyles.h4, color = Color.White)
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.primary,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        containerColor = Colors.backgroundRoot
    ) { paddingValues ->

        if (isLoading) {
            // Full-screen loading while validating token
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .background(Colors.backgroundRoot),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    CircularProgressIndicator(color = Colors.primary)
                    Text(
                        "Loading run session…",
                        style = AppTextStyles.body,
                        color = Colors.textMuted
                    )
                }
            }
            return@Scaffold
        }

        // Token entry form
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {

            Spacer(modifier = Modifier.height(24.dp))

            // Icon + header
            Text("👟", fontSize = 40.sp)
            Text(
                "Enter Your Invite Token",
                style = AppTextStyles.h3,
                color = Colors.textPrimary
            )
            Text(
                "You were sent a token in the invite email. Paste it below to join the live run.",
                style = AppTextStyles.body,
                color = Colors.textMuted
            )

            // Token input
            TokenInputField(
                value = token,
                onValueChange = { viewModel.setToken(it) },
                isLoading = isLoading,
                modifier = Modifier.fillMaxWidth()
            )

            // Error card
            if (error != null) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0x1FFF4444)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            Icons.Default.Clear,
                            contentDescription = null,
                            tint = Color(0xFFFF4444),
                            modifier = Modifier.size(18.dp).padding(top = 2.dp)
                        )
                        Text(
                            text = error!!,
                            style = AppTextStyles.body,
                            color = Color(0xFFFF4444),
                            fontSize = 14.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Primary CTA
            Button(
                onClick = { viewModel.validateAndLoadSession(token) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                enabled = token.isNotBlank(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    disabledContainerColor = Colors.primary.copy(alpha = 0.4f)
                )
            ) {
                Text("Watch Live Run", fontSize = 16.sp, color = Color.White)
            }

            // Secondary cancel
            OutlinedButton(
                onClick = onNavigateBack,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Text("Cancel", fontSize = 16.sp)
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

/**
 * Monospace token input with character counter.
 */
@Composable
fun TokenInputField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    isLoading: Boolean = false
) {
    Column(modifier = modifier) {
        TextField(
            value = value,
            onValueChange = { raw ->
                // Tokens are hex strings — only allow alphanumeric
                onValueChange(raw.filter { it.isLetterOrDigit() }.lowercase())
            },
            modifier = Modifier.fillMaxWidth(),
            placeholder = {
                Text(
                    "Paste your 64-character token here",
                    style = AppTextStyles.body,
                    color = Colors.textMuted,
                    fontSize = 13.sp
                )
            },
            singleLine = true,
            enabled = !isLoading,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Colors.backgroundRoot,
                unfocusedContainerColor = Colors.backgroundRoot,
                focusedIndicatorColor = Colors.primary,
                unfocusedIndicatorColor = Colors.primary.copy(alpha = 0.3f)
            ),
            textStyle = AppTextStyles.body.copy(
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                fontSize = 12.sp
            ),
            trailingIcon = when {
                value.isNotBlank() && value.length == 64 -> {
                    {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = "Token looks good",
                            tint = Color(0xFF4CAF50),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                value.isNotBlank() -> {
                    {
                        IconButton(onClick = { onValueChange("") }) {
                            Icon(
                                Icons.Default.Clear,
                                contentDescription = "Clear",
                                tint = Colors.textMuted,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
                else -> null
            }
        )

        if (value.isNotBlank()) {
            val countColor = if (value.length == 64) Color(0xFF4CAF50) else Colors.textMuted
            Text(
                "${value.length} / 64 characters${if (value.length == 64) " ✓" else ""}",
                style = AppTextStyles.caption,
                color = countColor,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 6.dp, start = 2.dp)
            )
        }
    }
}

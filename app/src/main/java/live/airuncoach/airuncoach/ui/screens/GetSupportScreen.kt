package live.airuncoach.airuncoach.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.BuildConfig
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.SupportRequest
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GetSupportScreen(
    onNavigateBack: () -> Unit = {}
) {
    val context = LocalContext.current
    val isKeyboardVisible = WindowInsets.isImeVisible
    val scope = rememberCoroutineScope()

    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var sentOk by remember { mutableStateOf(false) }
    var sendError by remember { mutableStateOf<String?>(null) }

    val deviceInfo = "Android ${android.os.Build.VERSION.RELEASE} · ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"

    // Last resort only: hand the message to the phone's mail client. This used to be the ONLY
    // path — no ticket was ever logged, and on a phone with no mail app configured (common)
    // the request silently went nowhere.
    fun openMailClientFallback() {
        val emailBody = buildString {
            appendLine(message)
            appendLine()
            appendLine("---")
            appendLine("App Version: ${BuildConfig.VERSION_NAME}")
            appendLine("Device: $deviceInfo")
        }
        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("mailto:support@airuncoach.live")
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, emailBody)
        }
        try {
            context.startActivity(intent)
        } catch (_: Exception) {
            val fallbackIntent = Intent(Intent.ACTION_SEND).apply {
                type = "message/rfc822"
                putExtra(Intent.EXTRA_EMAIL, arrayOf("support@airuncoach.live"))
                putExtra(Intent.EXTRA_SUBJECT, subject)
                putExtra(Intent.EXTRA_TEXT, emailBody)
            }
            try {
                context.startActivity(Intent.createChooser(fallbackIntent, "Send Email"))
            } catch (_: Exception) {
                sendError = "Couldn't send. Please email support@airuncoach.live directly."
            }
        }
    }

    // Primary path: log a ticket via POST /api/support/contact — the server emails
    // support@airuncoach.live with the user's account details attached and auto-replies to them.
    fun sendSupportEmail() {
        if (subject.isBlank() || message.isBlank() || isSending) return
        isSending = true
        sendError = null
        scope.launch {
            try {
                val response = RetrofitClient.apiService.submitSupportRequest(
                    SupportRequest(
                        subject = subject.trim(),
                        message = message.trim(),
                        appVersion = BuildConfig.VERSION_NAME,
                        deviceInfo = deviceInfo,
                    )
                )
                if (response.ok) {
                    sentOk = true
                } else {
                    sendError = response.error ?: "Couldn't log your request. Opening your email app instead…"
                    openMailClientFallback()
                }
            } catch (e: Exception) {
                android.util.Log.w("GetSupportScreen", "Support ticket POST failed, falling back to mail client: ${e.message}")
                sendError = "Couldn't reach our servers. Opening your email app instead…"
                openMailClientFallback()
            } finally {
                isSending = false
            }
        }
    }

    if (sentOk) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundRoot)
                .padding(Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("✅", fontSize = 56.sp)
            Spacer(modifier = Modifier.height(Spacing.lg))
            Text(
                "Request sent",
                fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "Your ticket has been logged with our support team. We've emailed you a copy and will reply to your account email within 24 hours on business days.",
                fontSize = 15.sp, color = Colors.textSecondary, textAlign = TextAlign.Center, lineHeight = 22.sp
            )
            Spacer(modifier = Modifier.height(Spacing.xl))
            Button(
                onClick = onNavigateBack,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Done", color = Colors.buttonText, fontWeight = FontWeight.SemiBold)
            }
        }
        return
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
                text = "Get Support",
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
                    text = "Let us know how we can help. Fill out the form below and we'll get back to you as soon as possible.",
                    fontSize = 14.sp,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = Spacing.lg)
                )
            }

            // Subject Field
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Text(
                        text = "Subject",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Colors.textPrimary
                    )
                    
                    OutlinedTextField(
                        value = subject,
                        onValueChange = { subject = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Colors.backgroundSecondary),
                        placeholder = {
                            Text("e.g., App crashing, Feature request, etc.", color = Colors.textMuted)
                        },
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
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

            // Message Field
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Text(
                        text = "Message",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Colors.textPrimary
                    )
                    
                    OutlinedTextField(
                        value = message,
                        onValueChange = { message = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp)
                            .background(Colors.backgroundSecondary),
                        placeholder = {
                            Text("Please describe your issue or question in detail...", color = Colors.textMuted)
                        },
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
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

            // Attachment Hint
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(Spacing.lg),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Image,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                            tint = Colors.textSecondary
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Attach a screenshot",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Colors.textPrimary
                            )
                            Text(
                                text = "Screenshots help us understand the issue better",
                                fontSize = 12.sp,
                                color = Colors.textMuted
                            )
                        }
                    }
                }
            }

            // Send Button
            item {
                sendError?.let { err ->
                    Text(
                        text = err,
                        fontSize = 13.sp,
                        color = Colors.warning,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.sm)
                    )
                }
                Button(
                    onClick = { sendSupportEmail() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        disabledContainerColor = Colors.primary.copy(alpha = 0.5f)
                    ),
                    enabled = subject.isNotEmpty() && message.isNotEmpty() && !isSending,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (isSending) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = Colors.buttonText
                            )
                        } else {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Send,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                                tint = Colors.buttonText
                            )
                        }
                        Text(
                            text = if (isSending) "Sending…" else "Send Support Request",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Colors.buttonText
                        )
                    }
                }
            }

            // Footer Text
            item {
                Text(
                    text = "We typically respond to support requests within 24 hours.",
                    fontSize = 12.sp,
                    color = Colors.textMuted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.lg)
                )
            }
        }
    }
}

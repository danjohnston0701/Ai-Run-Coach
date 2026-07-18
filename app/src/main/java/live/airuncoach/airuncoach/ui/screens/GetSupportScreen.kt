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
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GetSupportScreen(
    onNavigateBack: () -> Unit = {}
) {
    val context = LocalContext.current
    val isKeyboardVisible = WindowInsets.isImeVisible
    
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }

    fun sendSupportEmail() {
        if (subject.isBlank() || message.isBlank()) {
            return
        }

        val emailBody = buildString {
            appendLine(message)
            appendLine()
            appendLine("---")
            appendLine("Device Info:")
            appendLine("Android Version: ${android.os.Build.VERSION.RELEASE}")
            appendLine("Device Model: ${android.os.Build.MODEL}")
            appendLine("App Version: 1.0") // You can get this from BuildConfig if available
        }

        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("mailto:support@airuncoach.live")
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, emailBody)
        }

        try {
            context.startActivity(intent)
        } catch (_: Exception) {
            // Fallback: open email client selector
            val fallbackIntent = Intent(Intent.ACTION_SEND).apply {
                type = "message/rfc822"
                putExtra(Intent.EXTRA_EMAIL, arrayOf("support@airuncoach.live"))
                putExtra(Intent.EXTRA_SUBJECT, subject)
                putExtra(Intent.EXTRA_TEXT, emailBody)
            }
            context.startActivity(Intent.createChooser(fallbackIntent, "Send Email"))
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
                Button(
                    onClick = { sendSupportEmail() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        disabledContainerColor = Colors.primary.copy(alpha = 0.5f)
                    ),
                    enabled = subject.isNotEmpty() && message.isNotEmpty(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = Colors.buttonText
                        )
                        Text(
                            text = "Send Support Request",
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

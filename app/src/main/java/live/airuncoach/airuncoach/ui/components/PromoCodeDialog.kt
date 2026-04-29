package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors

/**
 * Dialog for entering and redeeming promo codes
 */
@Composable
fun PromoCodeDialog(
    isVisible: Boolean,
    onDismiss: () -> Unit,
    onRedeem: (code: String) -> Unit,
    isLoading: Boolean = false,
) {
    if (!isVisible) return

    var code by rememberSaveable { mutableStateOf("") }
    val focusRequester = remember { FocusRequester() }

    // Request focus when dialog appears
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .background(Colors.backgroundRoot),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundRoot),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Title
                Text(
                    "Promo Code",
                    style = AppTextStyles.h2,
                    color = Colors.textPrimary
                )

                // Description
                Text(
                    "Enter your promo code to unlock unlimited access",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )

                // Text Field with auto-focus
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.uppercase() },
                    label = {
                        Text(
                            "Promo Code",
                            style = AppTextStyles.small,
                            color = Colors.textSecondary
                        )
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            if (code.isNotBlank() && !isLoading) {
                                onRedeem(code)
                            }
                        }
                    ),
                    textStyle = AppTextStyles.body.copy(color = Colors.textPrimary),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.backgroundSecondary,
                        focusedLabelColor = Colors.primary,
                        unfocusedLabelColor = Colors.textSecondary,
                    )
                )

                // Buttons
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)
                ) {
                    TextButton(
                        onClick = onDismiss,
                        modifier = Modifier.height(40.dp)
                    ) {
                        Text(
                            "Cancel",
                            style = AppTextStyles.body,
                            color = Colors.primary
                        )
                    }

                    Button(
                        onClick = { onRedeem(code) },
                        enabled = code.isNotBlank() && !isLoading,
                        modifier = Modifier.height(40.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            disabledContainerColor = Colors.backgroundSecondary
                        )
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = Colors.textPrimary,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(
                                "Redeem",
                                style = AppTextStyles.body,
                                color = Colors.textPrimary
                            )
                        }
                    }
                }
            }
        }
    }
}

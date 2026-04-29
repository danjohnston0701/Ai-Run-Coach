package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
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

    var code by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Promo Code",
                style = AppTextStyles.h2,
                color = Colors.textPrimary
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    "Enter your promo code to unlock unlimited access",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )

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
                        .height(56.dp),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            if (code.isNotBlank()) {
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
            }
        },
        confirmButton = {
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
        },
        dismissButton = {
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
        },
        containerColor = Colors.backgroundRoot,
        titleContentColor = Colors.textPrimary,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.background(Colors.backgroundRoot)
    )
}

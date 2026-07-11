package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.DeleteAccountViewModel
import android.widget.Toast

@Composable
fun DeleteAccountScreen(
    viewModel: DeleteAccountViewModel = hiltViewModel(),
    userId: String = "",
    onNavigateBack: () -> Unit = {},
    onNavigateToLogin: () -> Unit = {}
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var showConfirmDialog by remember { mutableStateOf(false) }

    // Handle success - logout and navigate to login
    LaunchedEffect(state) {
        if (state is DeleteAccountViewModel.DeleteAccountState.Success) {
            Toast.makeText(
                context,
                "Account deleted successfully",
                Toast.LENGTH_SHORT
            ).show()
            viewModel.resetState()
            onNavigateToLogin()
        }
    }

    if (showConfirmDialog) {
        DeleteAccountConfirmationDialog(
            onConfirm = {
                viewModel.deleteAccount(userId)
                showConfirmDialog = false
            },
            onCancel = {
                showConfirmDialog = false
            }
        )
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
                text = "Delete Account",
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
            contentPadding = PaddingValues(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.lg)
        ) {
            // Warning Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFEF4444).copy(alpha = 0.12f)
                    ),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(Spacing.lg),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                            tint = Color(0xFFEF4444)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Delete Account",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFEF4444)
                            )
                            Text(
                                text = "This action cannot be undone. You will permanently lose all your data.",
                                fontSize = 13.sp,
                                color = Color(0xFFEF4444),
                                modifier = Modifier.padding(top = Spacing.sm)
                            )
                        }
                    }
                }
            }

            // What will be deleted section
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Text(
                        text = "What will be deleted:",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Colors.textPrimary
                    )
                    
                    listOf(
                        "Your profile and personal information",
                        "All your running data and statistics",
                        "Training plans and coaching history",
                        "Connected devices and integrations",
                        "Friends list and social connections",
                        "All stored files and preferences"
                    ).forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("•", fontSize = 16.sp, color = Color(0xFFEF4444))
                            Text(
                                text = item,
                                fontSize = 14.sp,
                                color = Colors.textSecondary
                            )
                        }
                    }
                }
            }

            // Error message
            if (state is DeleteAccountViewModel.DeleteAccountState.Error) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = Color(0xFFEF4444).copy(alpha = 0.12f)
                        )
                    ) {
                        Text(
                            text = (state as DeleteAccountViewModel.DeleteAccountState.Error).message,
                            fontSize = 14.sp,
                            color = Color(0xFFEF4444),
                            modifier = Modifier.padding(Spacing.lg)
                        )
                    }
                }
            }

            // Delete Button
            item {
                Button(
                    onClick = { showConfirmDialog = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFEF4444)
                    ),
                    enabled = state !is DeleteAccountViewModel.DeleteAccountState.Loading,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (state is DeleteAccountViewModel.DeleteAccountState.Loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = Colors.buttonText,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = "Delete My Account",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Colors.buttonText
                        )
                    }
                }
            }

            // Info text
            item {
                Text(
                    text = "After deletion, you will be logged out and cannot sign in with this email address again.",
                    fontSize = 12.sp,
                    color = Colors.textMuted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
private fun DeleteAccountConfirmationDialog(
    onConfirm: () -> Unit = {},
    onCancel: () -> Unit = {}
) {
    AlertDialog(
        onDismissRequest = onCancel,
        icon = {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = Color(0xFFEF4444)
            )
        },
        title = {
            Text(
                text = "Are you sure?",
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Text(
                text = "This permanently deletes all of your data and cannot be reversed.",
                fontSize = 14.sp
            )
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFEF4444)
                )
            ) {
                Text("Delete Account")
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text("Cancel")
            }
        }
    )
}



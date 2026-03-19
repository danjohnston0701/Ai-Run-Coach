package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.model.PendingAdaptation
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.AdaptationViewModel

/**
 * Screen for reviewing and accepting/declining AI-suggested plan adaptations.
 * Shows pending adaptations with reasons and suggested changes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdaptationReviewScreen(
    planId: String,
    onNavigateBack: () -> Unit,
    viewModel: AdaptationViewModel = hiltViewModel()
) {
    val scope = rememberCoroutineScope()
    val adaptations by viewModel.pendingAdaptations.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    var selectedAdaptation by remember { mutableStateOf<PendingAdaptation?>(null) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    var pendingAction by remember { mutableStateOf<String?>(null) } // "accept" or "decline"

    LaunchedEffect(planId) {
        viewModel.loadPendingAdaptations(planId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Plan Adaptations") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot,
                    titleContentColor = Colors.textPrimary
                )
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Spacing.md),
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            if (isLoading) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Colors.primary)
                    }
                }
            } else if (!errorMessage.isNullOrBlank()) {
                item {
                    AdaptationErrorCard(message = errorMessage!!)
                }
            } else if (adaptations.isEmpty()) {
                item {
                    AdaptationEmptyState()
                }
            } else {
                item {
                    Text(
                        text = "${adaptations.size} pending ${if (adaptations.size > 1) "adaptations" else "adaptation"}",
                        style = AppTextStyles.body,
                        color = Colors.textMuted,
                        fontSize = 12.sp
                    )
                }

                items(adaptations) { adaptation ->
                    AdaptationCard(
                        adaptation = adaptation,
                        onAccept = {
                            selectedAdaptation = adaptation
                            pendingAction = "accept"
                            showConfirmDialog = true
                        },
                        onDecline = {
                            selectedAdaptation = adaptation
                            pendingAction = "decline"
                            showConfirmDialog = true
                        }
                    )
                }
            }
        }
    }

    // Confirmation dialog
    if (showConfirmDialog && selectedAdaptation != null) {
        val isAccepting = pendingAction == "accept"
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = {
                Text(
                    if (isAccepting) "Accept Adaptation?" else "Decline Adaptation?",
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Text(
                    if (isAccepting) {
                        "Apply this adaptation to your upcoming workouts? This will modify ${selectedAdaptation!!.reason} based on AI analysis."
                    } else {
                        "Skip this suggestion? You can accept it later if you change your mind."
                    },
                    style = AppTextStyles.body,
                    fontSize = 14.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            if (isAccepting) {
                                viewModel.acceptAdaptation(selectedAdaptation!!.id)
                            } else {
                                viewModel.declineAdaptation(selectedAdaptation!!.id)
                            }
                            showConfirmDialog = false
                            selectedAdaptation = null
                            pendingAction = null
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isAccepting) Colors.success else Colors.warning
                    )
                ) {
                    Text(if (isAccepting) "Accept" else "Decline")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun AdaptationCard(
    adaptation: PendingAdaptation,
    onAccept: () -> Unit,
    onDecline: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary,
            contentColor = Colors.textPrimary
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            // Header with reason
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                    text = reasonToDisplayName(adaptation.reason),
                    style = AppTextStyles.body,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = Colors.primary
                )
                    Text(
                        text = adaptation.adaptationDate.take(10),
                        style = AppTextStyles.caption,
                        fontSize = 11.sp,
                        color = Colors.textMuted
                    )
                }

                // Status badge
                Surface(
                    color = Colors.primary.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "Pending",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = AppTextStyles.caption,
                        fontSize = 10.sp,
                        color = Colors.primary,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            HorizontalDivider(
                modifier = Modifier.fillMaxWidth(),
                color = Colors.textMuted.copy(alpha = 0.2f),
                thickness = 0.5.dp
            )

            // AI Suggestion
            if (!adaptation.aiSuggestion.isNullOrBlank()) {
                Text(
                    text = adaptation.aiSuggestion,
                    style = AppTextStyles.body,
                    fontSize = 13.sp,
                    color = Colors.textPrimary,
                    lineHeight = 18.sp
                )
            }

            // Changes preview
            if (adaptation.changes != null && adaptation.changes.isNotEmpty()) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = Spacing.sm),
                    color = Colors.primary.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(Spacing.sm),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        adaptation.changes.forEach { (key, value) ->
                            if (key != "upcoming_workout_adjustments") {
                                Text(
                                    text = "• $key: $value",
                                    style = AppTextStyles.caption,
                                    fontSize = 11.sp,
                                    color = Colors.textPrimary
                                )
                            }
                        }
                    }
                }
            }

            // Action buttons
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                OutlinedButton(
                    onClick = onDecline,
                    modifier = Modifier
                        .weight(1f)
                        .height(40.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Colors.warning
                    )
                ) {
                    Text("Decline", fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }

                Button(
                    onClick = onAccept,
                    modifier = Modifier
                        .weight(1f)
                        .height(40.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.success
                    )
                ) {
                    Text("Accept", fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
fun AdaptationErrorCard(message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Colors.warning.copy(alpha = 0.15f),
            contentColor = Colors.warning
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("⚠️", fontSize = 20.sp)
            Text(
                text = message,
                style = AppTextStyles.body,
                fontSize = 13.sp,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
fun AdaptationEmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        Text("✅", fontSize = 48.sp)
        Text(
            text = "No pending adaptations",
            style = AppTextStyles.body,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            color = Colors.textPrimary,
            textAlign = TextAlign.Center
        )
        Text(
            text = "Your plan is all set. AI will suggest adaptations based on your performance.",
            style = AppTextStyles.body,
            fontSize = 13.sp,
            color = Colors.textMuted,
            textAlign = TextAlign.Center
        )
    }
}

private fun reasonToDisplayName(reason: String): String = when (reason) {
    "missed_workout" -> "Missed Workout"
    "injury" -> "Injury Recovery"
    "over_training" -> "Over Training Detected"
    "ahead_of_schedule" -> "Ahead of Schedule"
    else -> reason.replace("_", " ").replaceFirstChar { it.uppercase() }
}

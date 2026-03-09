package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.domain.model.GroupRunParticipant
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.GroupRunDetailState
import live.airuncoach.airuncoach.viewmodel.GroupRunDetailViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupRunDetailScreen(
    groupRunId: String,
    onNavigateBack: () -> Unit,
    onStartRun: (String) -> Unit,  // navigate to run session with groupRunId
    onViewResults: (String) -> Unit
) {
    val viewModel: GroupRunDetailViewModel = hiltViewModel()
    val state by viewModel.state.collectAsState()
    val actionLoading by viewModel.actionLoading.collectAsState()
    val actionError by viewModel.actionError.collectAsState()
    val startedGroupRunId by viewModel.startedGroupRunId.collectAsState()

    // Load on entry
    LaunchedEffect(groupRunId) {
        viewModel.loadGroupRun(groupRunId)
    }

    // When organiser taps Start, navigate to run screen
    LaunchedEffect(startedGroupRunId) {
        startedGroupRunId?.let {
            viewModel.clearStartedRun()
            onStartRun(it)
        }
    }

    // Show invite friends dialog
    var showInviteDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        when (val s = state) {
                            is GroupRunDetailState.Success -> s.groupRun.name
                            else -> "Group Run"
                        },
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(R.drawable.icon_arrow_back_vector), "Back", tint = Colors.textPrimary)
                    }
                },
                actions = {
                    if (state is GroupRunDetailState.Success && (state as GroupRunDetailState.Success).groupRun.isOrganiser) {
                        IconButton(onClick = { showInviteDialog = true }) {
                            Icon(painterResource(R.drawable.icon_plus_vector), "Invite friends", tint = Colors.primary)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->

        when (val s = state) {
            is GroupRunDetailState.Loading -> {
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Colors.primary)
                }
            }

            is GroupRunDetailState.Error -> {
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(s.message, style = AppTextStyles.body, color = Colors.textSecondary)
                        Spacer(modifier = Modifier.height(Spacing.md))
                        Button(onClick = { viewModel.loadGroupRun(groupRunId) },
                            colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)) {
                            Text("Retry", color = Colors.buttonText)
                        }
                    }
                }
            }

            is GroupRunDetailState.Success -> {
                val gr = s.groupRun
                GroupRunDetailContent(
                    groupRun = gr,
                    actionLoading = actionLoading,
                    actionError = actionError,
                    onAccept = { viewModel.respond(groupRunId, true) },
                    onDecline = { viewModel.respond(groupRunId, false) },
                    onMarkReady = { viewModel.markReady(groupRunId) },
                    onStartRun = { viewModel.startRun(groupRunId) },
                    onViewResults = { onViewResults(groupRunId) },
                    onClearError = { viewModel.clearActionError() },
                    modifier = Modifier.padding(padding)
                )

                // Invite friends dialog (organiser only)
                if (showInviteDialog) {
                    InviteFriendsDialog(
                        groupRun = gr,
                        onDismiss = { showInviteDialog = false },
                        onInvite = { userIds ->
                            viewModel.inviteFriends(groupRunId, userIds)
                            showInviteDialog = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun GroupRunDetailContent(
    groupRun: GroupRun,
    actionLoading: Boolean,
    actionError: String?,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onMarkReady: () -> Unit,
    onStartRun: () -> Unit,
    onViewResults: () -> Unit,
    onClearError: () -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.lg)
    ) {

        // ── Run Info Card ──────────────────────────────────────────────────────
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    // Date
                    if (groupRun.dateTime.isNotEmpty()) {
                        GroupRunDetailRow(
                            icon = R.drawable.icon_calendar_vector,
                            label = formatGroupRunDate(groupRun.dateTime)
                        )
                        Spacer(modifier = Modifier.height(Spacing.sm))
                    }
                    // Meeting point
                    if (!groupRun.meetingPoint.isNullOrEmpty()) {
                        GroupRunDetailRow(
                            icon = R.drawable.icon_map_pin_vector,
                            label = groupRun.meetingPoint
                        )
                        Spacer(modifier = Modifier.height(Spacing.sm))
                    }
                    // Distance
                    GroupRunDetailRow(
                        icon = R.drawable.icon_target_vector,
                        label = "${groupRun.distance} km"
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    // Participants
                    GroupRunDetailRow(
                        icon = R.drawable.icon_people_vector,
                        label = buildString {
                            append("${groupRun.currentParticipants} going")
                            if (groupRun.maxParticipants != null) append(" (max ${groupRun.maxParticipants})")
                        }
                    )
                    // Description
                    if (groupRun.description.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(Spacing.md))
                        HorizontalDivider(color = Colors.backgroundRoot, thickness = 1.dp)
                        Spacer(modifier = Modifier.height(Spacing.md))
                        Text(groupRun.description, style = AppTextStyles.body, color = Colors.textSecondary)
                    }
                }
            }
            Spacer(modifier = Modifier.height(Spacing.lg))
        }

        // ── Error banner ───────────────────────────────────────────────────────
        if (actionError != null) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.warning.copy(alpha = 0.15f))
                ) {
                    Row(
                        modifier = Modifier.padding(Spacing.md),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(actionError, style = AppTextStyles.small, color = Colors.warning, modifier = Modifier.weight(1f))
                        IconButton(onClick = onClearError, modifier = Modifier.size(24.dp)) {
                            Icon(painterResource(R.drawable.icon_x_vector), "Dismiss", tint = Colors.warning, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.md))
            }
        }

        // ── Action Buttons ─────────────────────────────────────────────────────
        item {
            GroupRunActionButtons(
                groupRun = groupRun,
                actionLoading = actionLoading,
                onAccept = onAccept,
                onDecline = onDecline,
                onMarkReady = onMarkReady,
                onStartRun = onStartRun,
                onViewResults = onViewResults
            )
            Spacer(modifier = Modifier.height(Spacing.lg))
        }

        // ── Participants header ────────────────────────────────────────────────
        item {
            Text(
                "Participants (${groupRun.participants.size})",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.md))
        }

        // ── Participants list ──────────────────────────────────────────────────
        if (groupRun.participants.isEmpty()) {
            item {
                Text(
                    "No participants yet",
                    style = AppTextStyles.body,
                    color = Colors.textMuted
                )
            }
        } else {
            items(groupRun.participants) { participant ->
                ParticipantRow(participant = participant)
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
        }
    }
}

@Composable
fun GroupRunActionButtons(
    groupRun: GroupRun,
    actionLoading: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onMarkReady: () -> Unit,
    onStartRun: () -> Unit,
    onViewResults: () -> Unit
) {
    if (actionLoading) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Colors.primary, strokeWidth = 2.dp)
            Text("Updating...", style = AppTextStyles.small, color = Colors.textMuted)
        }
        return
    }

    when {
        // Completed run — show results
        groupRun.status == "completed" -> {
            Button(
                onClick = onViewResults,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
            ) {
                Icon(painterResource(R.drawable.icon_trophy_vector), null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text("View Results", color = Colors.buttonText)
            }
        }

        // Pending invitation — accept / decline
        groupRun.myInvitationStatus == "pending" -> {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                Button(
                    onClick = onAccept,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Accept Invitation", color = Colors.buttonText)
                }
                OutlinedButton(
                    onClick = onDecline,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Decline", color = Colors.textSecondary)
                }
            }
        }

        // Organiser — start run (when in pending/upcoming)
        groupRun.isOrganiser && groupRun.status != "active" -> {
            val readyCount = groupRun.participants.count { it.readyToStart }
            val acceptedCount = groupRun.participants.count { it.invitationStatus == "accepted" }
            Column {
                if (acceptedCount > 0) {
                    Text(
                        "$readyCount/$acceptedCount participants ready",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                }
                Button(
                    onClick = onStartRun,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.success)
                ) {
                    Icon(painterResource(R.drawable.icon_play_vector), null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Start Group Run", color = Colors.buttonText)
                }
            }
        }

        // Active run — participant ready to start
        groupRun.status == "active" && groupRun.isJoined && !groupRun.isOrganiser -> {
            val myParticipant = groupRun.participants.find { it.userId == "" }
            if (myParticipant?.readyToStart != true) {
                Button(
                    onClick = onMarkReady,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("I'm Ready — Start My Run", color = Colors.buttonText)
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.success, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("You're ready! Waiting for the organiser to start.", style = AppTextStyles.small, color = Colors.textSecondary)
                }
            }
        }

        // Accepted participant — mark ready
        groupRun.isJoined && groupRun.status != "active" && !groupRun.isOrganiser -> {
            val myParticipant = groupRun.participants.find { it.role != "organiser" && it.invitationStatus == "accepted" }
            if (myParticipant?.readyToStart != true) {
                OutlinedButton(
                    onClick = onMarkReady,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary)
                ) {
                    Text("Mark as Ready")
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.success, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("You're ready!", style = AppTextStyles.small, color = Colors.success)
                }
            }
        }
    }
}

@Composable
fun ParticipantRow(participant: GroupRunParticipant) {
    val statusColor = when (participant.invitationStatus) {
        "accepted" -> Colors.success
        "declined" -> Colors.warning
        else -> Colors.textMuted
    }
    val statusLabel = when (participant.invitationStatus) {
        "accepted" -> "Going"
        "declined" -> "Declined"
        else -> "Invited"
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Avatar
        Surface(
            modifier = Modifier.size(40.dp).clip(CircleShape),
            color = Colors.primary.copy(alpha = 0.15f),
            shape = CircleShape
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = participant.userName.take(1).uppercase(),
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
            }
        }
        Spacer(modifier = Modifier.width(Spacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(participant.userName, style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium), color = Colors.textPrimary)
                if (participant.role == "organiser") {
                    Spacer(modifier = Modifier.width(6.dp))
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = Colors.primary.copy(alpha = 0.15f)
                    ) {
                        Text(
                            "Organiser",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
        }

        // Ready badge
        if (participant.readyToStart && participant.invitationStatus == "accepted") {
            Surface(
                shape = MaterialTheme.shapes.small,
                color = Colors.success.copy(alpha = 0.15f)
            ) {
                Text(
                    "Ready",
                    style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                    color = Colors.success,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
            Spacer(modifier = Modifier.width(6.dp))
        }

        // Invitation status
        Surface(
            shape = MaterialTheme.shapes.small,
            color = statusColor.copy(alpha = 0.12f)
        ) {
            Text(
                statusLabel,
                style = AppTextStyles.small,
                color = statusColor,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
            )
        }
    }
}

@Composable
fun GroupRunDetailRow(icon: Int, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(painterResource(icon), null, tint = Colors.primary, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(label, style = AppTextStyles.body, color = Colors.textPrimary)
    }
}

@Composable
fun InviteFriendsDialog(
    groupRun: GroupRun,
    onDismiss: () -> Unit,
    onInvite: (List<String>) -> Unit
) {
    // For now we show a simple message — the full friend picker is in CreateGroupRunScreen
    // This dialog is a quick re-invite from the detail screen
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Colors.backgroundSecondary,
        title = {
            Text("Invite Friends", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
        },
        text = {
            Text(
                "Use the share link below to invite more runners:\n\n${
                    if (!groupRun.inviteToken.isNullOrEmpty())
                        "https://airuncoach.live/group-runs/join/${groupRun.inviteToken}"
                    else "Create the run first to get an invite link"
                }",
                style = AppTextStyles.small,
                color = Colors.textSecondary
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = Colors.primary)
            }
        }
    )
}

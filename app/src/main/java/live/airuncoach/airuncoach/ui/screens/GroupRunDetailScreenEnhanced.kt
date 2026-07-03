package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
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
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.domain.model.GroupRunParticipant
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.GroupRunDetailState
import live.airuncoach.airuncoach.viewmodel.GroupRunDetailViewModel
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupRunDetailScreenEnhanced(
    groupRunId: String,
    onNavigateBack: () -> Unit,
    onStartRun: (String) -> Unit,
    onViewResults: (String) -> Unit
) {
    val viewModel: GroupRunDetailViewModel = hiltViewModel()
    val state by viewModel.state.collectAsState()
    val actionLoading by viewModel.actionLoading.collectAsState()
    val actionError by viewModel.actionError.collectAsState()
    val startedGroupRunId by viewModel.startedGroupRunId.collectAsState()

    var showInviteDialog by remember { mutableStateOf(false) }
    var showEditDialog by remember { mutableStateOf(false) }
    var showCancelConfirmation by remember { mutableStateOf(false) }
    val cancelledGroupRun by viewModel.cancelledGroupRun.collectAsState()

    LaunchedEffect(groupRunId) {
        viewModel.loadGroupRun(groupRunId)
    }

    LaunchedEffect(startedGroupRunId) {
        startedGroupRunId?.let {
            viewModel.clearStartedRun()
            onStartRun(it)
        }
    }

    LaunchedEffect(cancelledGroupRun) {
        if (cancelledGroupRun) onNavigateBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        when (val s = state) {
                            is GroupRunDetailState.Success -> s.groupRun.name ?: "Group Run"
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
                        IconButton(onClick = { showEditDialog = true }) {
                            Icon(Icons.Default.Edit, "Edit", tint = Colors.primary)
                        }
                        IconButton(onClick = { showCancelConfirmation = true }) {
                            Icon(Icons.Default.Close, "Cancel", tint = Colors.warning)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot),
                windowInsets = WindowInsets(0)
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0)
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
                GroupRunDetailContentEnhanced(
                    groupRun = gr,
                    actionLoading = actionLoading,
                    actionError = actionError,
                    onAccept = { viewModel.respond(groupRunId, true) },
                    onDecline = { viewModel.respond(groupRunId, false) },
                    onMarkReady = { viewModel.markReady(groupRunId) },
                    onStartRun = { viewModel.startRun(groupRunId) },
                    onViewResults = { onViewResults(groupRunId) },
                    onInviteMore = { showInviteDialog = true },
                    onClearError = { viewModel.clearActionError() },
                    modifier = Modifier.padding(padding)
                )

                // Invite friends dialog
                if (showInviteDialog) {
                    val friends by viewModel.friends.collectAsState()
                    val loadingFriends by viewModel.loadingFriends.collectAsState()
                    LaunchedEffect(showInviteDialog) { viewModel.loadFriends() }
                    InviteFriendsDialogEnhanced(
                        friends = friends,
                        loading = loadingFriends,
                        existingParticipantIds = gr.participants?.map { it.userId }?.toSet() ?: emptySet(),
                        onInvite = { userIds ->
                            viewModel.inviteFriends(groupRunId, userIds)
                            showInviteDialog = false
                        },
                        onDismiss = { showInviteDialog = false }
                    )
                }

                // Cancel confirmation dialog
                if (showCancelConfirmation) {
                    AlertDialog(
                        onDismissRequest = { showCancelConfirmation = false },
                        containerColor = Colors.backgroundSecondary,
                        title = { Text("Cancel Group Run?", style = AppTextStyles.h4, color = Colors.textPrimary) },
                        text = { Text("This will permanently delete the run for all participants. This cannot be undone.", style = AppTextStyles.body, color = Colors.textSecondary) },
                        confirmButton = {
                            Button(
                                onClick = {
                                    showCancelConfirmation = false
                                    viewModel.cancelRun(groupRunId)
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Colors.warning)
                            ) {
                                Text("Yes, Cancel Run", color = Colors.buttonText)
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showCancelConfirmation = false }) {
                                Text("Keep Run", color = Colors.primary)
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun GroupRunDetailContentEnhanced(
    groupRun: GroupRun,
    actionLoading: Boolean,
    actionError: String?,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onMarkReady: () -> Unit,
    onStartRun: () -> Unit,
    onViewResults: () -> Unit,
    onInviteMore: () -> Unit,
    onClearError: () -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.lg)
    ) {

        // ══════════════════════════════════════════════════════════════════════
        // EVENT DETAILS SECTION
        // ══════════════════════════════════════════════════════════════════════
        item {
            EventDetailsCard(groupRun = groupRun)
            Spacer(modifier = Modifier.height(Spacing.lg))
        }

        // ══════════════════════════════════════════════════════════════════════
        // ERROR BANNER
        // ══════════════════════════════════════════════════════════════════════
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

        // ══════════════════════════════════════════════════════════════════════
        // ACTION BUTTONS
        // ══════════════════════════════════════════════════════════════════════
        item {
            GroupRunActionButtonsEnhanced(
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

        // ══════════════════════════════════════════════════════════════════════
        // PARTICIPANTS SECTION
        // ══════════════════════════════════════════════════════════════════════
        item {
            ParticipantsSectionHeader(
                total = groupRun.participants?.size ?: 0,
                accepted = groupRun.participants?.count { it.invitationStatus == "accepted" } ?: 0,
                onInviteMore = if (groupRun.isOrganiser) {{ onInviteMore() }} else null
            )
            Spacer(modifier = Modifier.height(Spacing.md))
        }

        // Accepted participants
        val acceptedParticipants = groupRun.participants?.filter { it.invitationStatus == "accepted" } ?: emptyList()
        if (acceptedParticipants.isNotEmpty()) {
            item {
                Text(
                    "Going (${acceptedParticipants.size})",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
            items(acceptedParticipants) { participant ->
                ParticipantRowEnhanced(participant = participant, status = "accepted")
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
        }

        // Pending participants
        val pendingParticipants = groupRun.participants?.filter { it.invitationStatus == "pending" } ?: emptyList()
        if (pendingParticipants.isNotEmpty()) {
            item {
                Text(
                    "Invited (${pendingParticipants.size})",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textMuted
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
            items(pendingParticipants) { participant ->
                ParticipantRowEnhanced(participant = participant, status = "pending")
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
        }

        // Declined participants
        val declinedParticipants = groupRun.participants?.filter { it.invitationStatus == "declined" } ?: emptyList()
        if (declinedParticipants.isNotEmpty()) {
            item {
                Text(
                    "Declined (${declinedParticipants.size})",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.warning
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
            items(declinedParticipants) { participant ->
                ParticipantRowEnhanced(participant = participant, status = "declined")
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
        }

        // Empty state
        if (groupRun.participants?.isEmpty() != false) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Spacing.lg),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "No participants yet",
                        style = AppTextStyles.body,
                        color = Colors.textMuted
                    )
                }
            }
        }

        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
    }
}

@Composable
fun EventDetailsCard(groupRun: GroupRun) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Title
            Text(
                text = groupRun.name ?: "Untitled Run",
                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // Description
            groupRun.description?.let {
                if (it.isNotEmpty()) {
                    Text(
                        text = it,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
            }

            // Status badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatusBadge(status = groupRun.status)
                if (groupRun.isOrganiser) {
                    Text(
                        "You're the organiser",
                        style = AppTextStyles.small,
                        color = Colors.primary,
                        modifier = Modifier
                            .background(Colors.primary.copy(alpha = 0.15f), CircleShape)
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))
            HorizontalDivider(color = Colors.backgroundRoot, thickness = 1.dp)
            Spacer(modifier = Modifier.height(Spacing.md))

            // Event details grid
            EventDetailsGrid(groupRun = groupRun)
        }
    }
}

@Composable
fun EventDetailsGrid(groupRun: GroupRun) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        // Date & Time
        if (!groupRun.dateTime.isNullOrEmpty()) {
            EventDetailRow(
                icon = R.drawable.icon_calendar_vector,
                label = "Date & Time",
                value = formatGroupRunDate(groupRun.dateTime)
            )
        }

        // Distance
        if (groupRun.distance != null) {
            EventDetailRow(
                icon = R.drawable.icon_target_vector,
                label = "Distance",
                value = "${groupRun.distance} km"
            )
        }

        // Meeting point
        groupRun.meetingPoint?.let {
            if (it.isNotEmpty()) {
                EventDetailRow(
                    icon = R.drawable.icon_map_pin_vector,
                    label = "Meeting Point",
                    value = it
                )
            }
        }

        // Participants
        EventDetailRow(
            icon = R.drawable.icon_people_vector,
            label = "Participants",
            value = buildString {
                append("${groupRun.currentParticipants ?: 0}")
                if (groupRun.maxParticipants != null) append("/${groupRun.maxParticipants}")
            }
        )

        // Organiser
        EventDetailRow(
            icon = R.drawable.icon_people_vector,
            label = "Organiser",
            value = groupRun.creatorName ?: "Unknown"
        )
    }
}

@Composable
fun EventDetailRow(icon: Int, label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        Icon(
            painterResource(icon),
            contentDescription = null,
            tint = Colors.primary,
            modifier = Modifier.size(20.dp)
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = AppTextStyles.small, color = Colors.textMuted)
            Text(value, style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium), color = Colors.textPrimary)
        }
    }
}

@Composable
fun StatusBadge(status: String?) {
    val (label, bgColor, textColor) = when (status) {
        "active" -> Triple("Live Now", Colors.success.copy(alpha = 0.15f), Colors.success)
        "completed" -> Triple("Completed", Colors.textMuted.copy(alpha = 0.15f), Colors.textMuted)
        "cancelled" -> Triple("Cancelled", Colors.warning.copy(alpha = 0.15f), Colors.warning)
        else -> Triple("Upcoming", Colors.primary.copy(alpha = 0.15f), Colors.primary)
    }
    
    Surface(
        color = bgColor,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            label,
            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
            color = textColor,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
fun ParticipantsSectionHeader(total: Int, accepted: Int, onInviteMore: (() -> Unit)?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                "Participants",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Text(
                "$accepted going • $total invited",
                style = AppTextStyles.small,
                color = Colors.textMuted
            )
        }
        if (onInviteMore != null) {
            IconButton(onClick = onInviteMore) {
                Icon(Icons.Default.PersonAdd, "Invite more", tint = Colors.primary)
            }
        }
    }
}

@Composable
fun ParticipantRowEnhanced(participant: GroupRunParticipant, status: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundRoot)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            // Avatar
            Surface(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape),
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

            // Name & status
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Text(
                        participant.userName,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                        color = Colors.textPrimary
                    )
                    if (participant.role == "organiser") {
                        Text(
                            "Organiser",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                            color = Colors.primary,
                            modifier = Modifier
                                .background(Colors.primary.copy(alpha = 0.15f), CircleShape)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
                if (participant.readyToStart && status == "accepted") {
                    Text("Ready", style = AppTextStyles.small, color = Colors.success)
                }
            }

            // Status badge
            val statusColor = when (status) {
                "accepted" -> Colors.success
                "declined" -> Colors.warning
                else -> Colors.textMuted
            }
            val statusLabel = when (status) {
                "accepted" -> "✓ Going"
                "declined" -> "✗ Declined"
                else -> "◇ Invited"
            }
            Text(
                statusLabel,
                style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                color = statusColor
            )
        }
    }
}

@Composable
fun GroupRunActionButtonsEnhanced(
    groupRun: GroupRun,
    actionLoading: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onMarkReady: () -> Unit,
    onStartRun: () -> Unit,
    onViewResults: () -> Unit
) {
    if (actionLoading) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md)
        ) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Colors.primary, strokeWidth = 2.dp)
            Text("Updating...", style = AppTextStyles.small, color = Colors.textMuted)
        }
        return
    }

    when {
        groupRun.status == "completed" -> {
            Button(
                onClick = onViewResults,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
            ) {
                Icon(Icons.Default.EmojiEvents, null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text("View Results", color = Colors.buttonText)
            }
        }

        groupRun.myInvitationStatus == "pending" -> {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                Button(
                    onClick = onAccept,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Accept", color = Colors.buttonText)
                }
                OutlinedButton(
                    onClick = onDecline,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Decline", color = Colors.textSecondary)
                }
            }
        }

        groupRun.isOrganiser && groupRun.status != "active" -> {
            val readyCount = groupRun.participants?.count { it.readyToStart } ?: 0
            val acceptedCount = groupRun.participants?.count { it.invitationStatus == "accepted" } ?: 0
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                if (acceptedCount > 0) {
                    Text(
                        "$readyCount/$acceptedCount participants ready",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
                Button(
                    onClick = onStartRun,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.success)
                ) {
                    Icon(Icons.Default.PlayArrow, null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Start Group Run", color = Colors.buttonText)
                }
            }
        }

        groupRun.status == "active" && groupRun.isJoined && !groupRun.isOrganiser -> {
            val myParticipant = groupRun.participants?.find { it.userId == "" }
            if (myParticipant?.readyToStart != true) {
                Button(
                    onClick = onMarkReady,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("I'm Ready — Start My Run", color = Colors.buttonText)
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.Check, null, tint = Colors.success, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("You're ready! Waiting for organiser...", style = AppTextStyles.small, color = Colors.textSecondary)
                }
            }
        }

        groupRun.myInvitationStatus == "accepted" && groupRun.status != "active" && !groupRun.isOrganiser -> {
            val myParticipant = groupRun.participants?.find { it.invitationStatus == "accepted" && it.role != "organiser" }
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                if (myParticipant?.readyToStart != true) {
                    OutlinedButton(
                        onClick = onMarkReady,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary)
                    ) {
                        Icon(Icons.Default.Check, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(Spacing.xs))
                        Text("Mark as Ready")
                    }
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Check, null, tint = Colors.success, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("You're ready!", style = AppTextStyles.small, color = Colors.success)
                    }
                }
                OutlinedButton(
                    onClick = onDecline,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.warning)
                ) {
                    Icon(Icons.Default.Close, null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(Spacing.xs))
                    Text("Can't Make It")
                }
            }
        }

        groupRun.myInvitationStatus == "declined" && groupRun.status != "active" && !groupRun.isOrganiser -> {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Close, null, tint = Colors.warning, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("You declined this run", style = AppTextStyles.small, color = Colors.textMuted)
                }
                Button(
                    onClick = onAccept,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.success)
                ) {
                    Icon(Icons.Default.Check, null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(Spacing.xs))
                    Text("I Can Make It", color = Colors.buttonText)
                }
            }
        }
    }
}

@Composable
fun InviteFriendsDialogEnhanced(
    friends: List<Friend>,
    loading: Boolean,
    existingParticipantIds: Set<String>,
    onInvite: (List<String>) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedIds by remember { mutableStateOf(emptySet<String>()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Colors.backgroundSecondary,
        title = {
            Text("Invite Friends", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
        },
        text = {
            if (loading) {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(32.dp), color = Colors.primary)
                }
            } else if (friends.isEmpty()) {
                Text("No friends to invite yet. Add friends from your profile.", style = AppTextStyles.body, color = Colors.textSecondary)
            } else {
                Column(modifier = Modifier.fillMaxWidth()) {
                    val inviteable = friends.filter { it.id !in existingParticipantIds }
                    if (inviteable.isEmpty()) {
                        Text("All your friends have already been invited.", style = AppTextStyles.body, color = Colors.textSecondary)
                    } else {
                        inviteable.forEach { friend ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = friend.id in selectedIds,
                                    onCheckedChange = { checked ->
                                        selectedIds = if (checked) selectedIds + friend.id else selectedIds - friend.id
                                    },
                                    colors = CheckboxDefaults.colors(checkedColor = Colors.primary)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    friend.name,
                                    style = AppTextStyles.body,
                                    color = Colors.textPrimary,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { if (selectedIds.isNotEmpty()) onInvite(selectedIds.toList()) else onDismiss() },
                enabled = !loading,
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
            ) {
                Text(if (selectedIds.isEmpty()) "Cancel" else "Invite (${selectedIds.size})", color = Colors.buttonText)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = Colors.textSecondary)
            }
        }
    )
}



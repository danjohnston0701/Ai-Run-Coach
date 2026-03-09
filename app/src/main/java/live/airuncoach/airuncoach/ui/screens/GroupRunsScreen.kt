package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.GroupRunsUiState
import live.airuncoach.airuncoach.viewmodel.GroupRunsViewModel


import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupRunsScreen(
    onCreateGroupRun: () -> Unit,
    onNavigateToDetail: (String) -> Unit,
    onNavigateBack: () -> Unit
) {
    val viewModel: GroupRunsViewModel = hiltViewModel()
    val groupRunsState by viewModel.groupRunsState.collectAsState()
    val selectedTab by viewModel.selectedTab.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Group Runs",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            painterResource(id = R.drawable.icon_arrow_back_vector),
                            contentDescription = "Back",
                            tint = Colors.textPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCreateGroupRun,
                containerColor = Colors.primary
            ) {
                Icon(
                    painterResource(id = R.drawable.icon_plus_vector),
                    contentDescription = "Create Group Run",
                    tint = Colors.buttonText
                )
            }
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Tab row
            val tabs = listOf("upcoming" to "Upcoming", "my" to "My Runs", "past" to "Past")
            TabRow(
                selectedTabIndex = tabs.indexOfFirst { it.first == selectedTab }.coerceAtLeast(0),
                containerColor = Colors.backgroundRoot,
                contentColor = Colors.primary,
            ) {
                tabs.forEach { (key, label) ->
                    Tab(
                        selected = selectedTab == key,
                        onClick = { viewModel.selectTab(key) },
                        text = {
                            Text(
                                label,
                                style = AppTextStyles.small.copy(fontWeight = FontWeight.Medium),
                                color = if (selectedTab == key) Colors.primary else Colors.textMuted
                            )
                        }
                    )
                }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                when (val state = groupRunsState) {
                    is GroupRunsUiState.Loading -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                            color = Colors.primary
                        )
                    }

                    is GroupRunsUiState.Success -> {
                        if (state.groupRuns.isEmpty()) {
                            EmptyGroupRunsState(onCreateGroupRun)
                        } else {
                            GroupRunsList(
                                groupRuns = state.groupRuns,
                                onGroupRunClick = { onNavigateToDetail(it.id) },
                                onAcceptInvite = { viewModel.respondToInvite(it.id, true) },
                                onDeclineInvite = { viewModel.respondToInvite(it.id, false) },
                                onJoin = { viewModel.joinGroupRun(it.id) }
                            )
                        }
                    }

                    is GroupRunsUiState.Error -> {
                        ErrorGroupRunsState(
                            errorMessage = state.message,
                            onRetry = { viewModel.loadGroupRuns() },
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun GroupRunsList(
    groupRuns: List<GroupRun>,
    onGroupRunClick: (GroupRun) -> Unit,
    onAcceptInvite: (GroupRun) -> Unit,
    onDeclineInvite: (GroupRun) -> Unit,
    onJoin: (GroupRun) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.md)
    ) {
        items(groupRuns) { groupRun ->
            GroupRunCard(
                groupRun = groupRun,
                onClick = { onGroupRunClick(groupRun) },
                onAcceptInvite = { onAcceptInvite(groupRun) },
                onDeclineInvite = { onDeclineInvite(groupRun) },
                onJoin = { onJoin(groupRun) }
            )
            Spacer(modifier = Modifier.height(Spacing.md))
        }
    }
}

@Composable
fun GroupRunCard(
    groupRun: GroupRun,
    onClick: () -> Unit,
    onAcceptInvite: () -> Unit,
    onDeclineInvite: () -> Unit,
    onJoin: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {

            // Header: name + status badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = groupRun.name,
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary,
                    modifier = Modifier.weight(1f)
                )
                GroupRunStatusBadge(status = groupRun.status, myInvitationStatus = groupRun.myInvitationStatus)
            }

            if (groupRun.description.isNotEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = groupRun.description,
                    style = AppTextStyles.small,
                    color = Colors.textSecondary,
                    maxLines = 2
                )
            }

            Spacer(modifier = Modifier.height(Spacing.sm))
            HorizontalDivider(color = Colors.backgroundRoot, thickness = 1.dp)
            Spacer(modifier = Modifier.height(Spacing.sm))

            // Stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.lg)
            ) {
                GroupRunStat(
                    icon = R.drawable.icon_target_vector,
                    label = "${groupRun.distance} km"
                )
                if (groupRun.dateTime.isNotEmpty()) {
                    GroupRunStat(
                        icon = R.drawable.icon_calendar_vector,
                        label = formatGroupRunDate(groupRun.dateTime)
                    )
                }
                GroupRunStat(
                    icon = R.drawable.icon_people_vector,
                    label = buildString {
                        append("${groupRun.currentParticipants}")
                        if (groupRun.maxParticipants != null) append("/${groupRun.maxParticipants}")
                    }
                )
            }

            if (!groupRun.meetingPoint.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        painterResource(R.drawable.icon_map_pin_vector),
                        contentDescription = null,
                        tint = Colors.textMuted,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = groupRun.meetingPoint,
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
            }

            // Organiser name
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Organised by ${groupRun.creatorName}",
                style = AppTextStyles.small,
                color = Colors.textMuted
            )

            // Action buttons for pending invitations
            if (groupRun.myInvitationStatus == "pending") {
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Button(
                        onClick = onAcceptInvite,
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        Text("Accept", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                    }
                    OutlinedButton(
                        onClick = onDeclineInvite,
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        Text("Decline", style = AppTextStyles.small, color = Colors.textSecondary)
                    }
                }
            }

            // Join button for public runs
            if (groupRun.isPublic && !groupRun.isJoined && !groupRun.isOrganiser
                && groupRun.myInvitationStatus == null
                && groupRun.status != "completed" && groupRun.status != "cancelled") {
                Spacer(modifier = Modifier.height(Spacing.sm))
                OutlinedButton(
                    onClick = onJoin,
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(vertical = 8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary)
                ) {
                    Text("Join Run", style = AppTextStyles.small.copy(fontWeight = FontWeight.Medium))
                }
            }
        }
    }
}

@Composable
fun GroupRunStat(icon: Int, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            painterResource(icon),
            contentDescription = null,
            tint = Colors.primary,
            modifier = Modifier.size(14.dp)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(label, style = AppTextStyles.small, color = Colors.textSecondary)
    }
}

@Composable
fun GroupRunStatusBadge(status: String, myInvitationStatus: String?) {
    val (label, color) = when {
        myInvitationStatus == "pending" -> "Invited" to Colors.warning
        status == "active" -> "Live" to Colors.success
        status == "completed" -> "Done" to Colors.textMuted
        status == "cancelled" -> "Cancelled" to Colors.warning
        else -> "Upcoming" to Colors.primary
    }
    Surface(
        shape = MaterialTheme.shapes.small,
        color = color.copy(alpha = 0.15f)
    ) {
        Text(
            text = label,
            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
            color = color,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

@Composable
fun EmptyGroupRunsState(onCreateGroupRun: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_people_vector),
            contentDescription = "No Group Runs",
            tint = Colors.textMuted,
            modifier = Modifier.size(80.dp)
        )
        Spacer(modifier = Modifier.height(Spacing.lg))
        Text(
            text = "No Group Runs",
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(
            text = "Organise a run with friends!\nTap + to create one.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
        )
        Spacer(modifier = Modifier.height(Spacing.xl))
        Button(
            onClick = onCreateGroupRun,
            colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
        ) {
            Text("Create Group Run", color = Colors.buttonText)
        }
    }
}

@Composable
fun ErrorGroupRunsState(
    errorMessage: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_x_circle),
            contentDescription = "Error",
            tint = Colors.warning,
            modifier = Modifier.size(64.dp)
        )
        Spacer(modifier = Modifier.height(Spacing.lg))
        Text(
            text = errorMessage,
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            modifier = Modifier.padding(horizontal = Spacing.lg)
        )
        Spacer(modifier = Modifier.height(Spacing.xl))
        if (!errorMessage.contains("coming soon", ignoreCase = true)) {
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
            ) {
                Text("Retry", color = Colors.buttonText)
            }
        }
    }
}

fun formatGroupRunDate(isoDateTime: String): String {
    return try {
        val zdt = ZonedDateTime.parse(isoDateTime)
        zdt.format(DateTimeFormatter.ofPattern("EEE d MMM, h:mm a", Locale.getDefault()))
    } catch (_: Exception) {
        isoDateTime.take(16).replace("T", " ")
    }
}

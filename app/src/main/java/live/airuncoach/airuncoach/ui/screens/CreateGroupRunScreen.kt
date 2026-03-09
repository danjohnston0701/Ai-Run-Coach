package live.airuncoach.airuncoach.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.CreateGroupRunState
import live.airuncoach.airuncoach.viewmodel.CreateGroupRunViewModel
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Calendar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateGroupRunScreen(
    onNavigateBack: () -> Unit,
    onCreated: (String) -> Unit = {}
) {
    val viewModel: CreateGroupRunViewModel = hiltViewModel()
    val runName by viewModel.runName.collectAsState()
    val meetingPoint by viewModel.meetingPoint.collectAsState()
    val description by viewModel.description.collectAsState()
    val distance by viewModel.distance.collectAsState()
    val maxParticipants by viewModel.maxParticipants.collectAsState()
    val dateTime by viewModel.dateTime.collectAsState()
    val isPublic by viewModel.isPublic.collectAsState()
    val friends by viewModel.friends.collectAsState()
    val selectedFriendIds by viewModel.selectedFriendIds.collectAsState()
    val loadingFriends by viewModel.loadingFriends.collectAsState()
    val validationError by viewModel.validationError.collectAsState()
    val createState by viewModel.createState.collectAsState()

    val context = LocalContext.current

    // Navigate away on success
    LaunchedEffect(createState) {
        if (createState is CreateGroupRunState.Success) {
            val created = (createState as CreateGroupRunState.Success).groupRun
            onCreated(created.id)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Create Group Run",
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
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg)
        ) {
            // ── Run Name ──────────────────────────────────────────────────────
            OutlinedTextField(
                value = runName,
                onValueChange = viewModel::onRunNameChanged,
                label = { Text("Run Name *") },
                modifier = Modifier.fillMaxWidth(),
                colors = groupRunTextFieldColors()
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // ── Meeting Point ─────────────────────────────────────────────────
            OutlinedTextField(
                value = meetingPoint,
                onValueChange = viewModel::onMeetingPointChanged,
                label = { Text("Meeting Point") },
                placeholder = { Text("e.g. Waipa car park, Main entrance") },
                modifier = Modifier.fillMaxWidth(),
                colors = groupRunTextFieldColors()
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // ── Description ───────────────────────────────────────────────────
            OutlinedTextField(
                value = description,
                onValueChange = viewModel::onDescriptionChanged,
                label = { Text("Description") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                colors = groupRunTextFieldColors()
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // ── Distance + Max Participants ───────────────────────────────────
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                OutlinedTextField(
                    value = distance,
                    onValueChange = viewModel::onDistanceChanged,
                    label = { Text("Distance (km) *") },
                    modifier = Modifier.weight(1f),
                    colors = groupRunTextFieldColors()
                )
                OutlinedTextField(
                    value = maxParticipants,
                    onValueChange = viewModel::onMaxParticipantsChanged,
                    label = { Text("Max Participants") },
                    modifier = Modifier.weight(1f),
                    colors = groupRunTextFieldColors()
                )
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // ── Date & Time picker ────────────────────────────────────────────
            val displayDate = if (dateTime.isNotEmpty()) formatGroupRunDate(dateTime) else "Tap to set date & time"
            OutlinedTextField(
                value = displayDate,
                onValueChange = {},
                readOnly = true,
                label = { Text("Date & Time *") },
                trailingIcon = {
                    Icon(
                        painterResource(R.drawable.icon_calendar_vector),
                        contentDescription = "Pick date",
                        tint = Colors.primary
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        val cal = Calendar.getInstance()
                        DatePickerDialog(
                            context,
                            { _, year, month, day ->
                                TimePickerDialog(
                                    context,
                                    { _, hour, minute ->
                                        val ldt = LocalDateTime.of(year, month + 1, day, hour, minute)
                                        val iso = ldt.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) + "Z"
                                        viewModel.onDateTimeChanged(iso)
                                    },
                                    cal.get(Calendar.HOUR_OF_DAY),
                                    cal.get(Calendar.MINUTE),
                                    false
                                ).show()
                            },
                            cal.get(Calendar.YEAR),
                            cal.get(Calendar.MONTH),
                            cal.get(Calendar.DAY_OF_MONTH)
                        ).apply {
                            datePicker.minDate = System.currentTimeMillis()
                        }.show()
                    },
                colors = groupRunTextFieldColors()
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // ── Public / Private toggle ───────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        "Public Run",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                        color = Colors.textPrimary
                    )
                    Text(
                        "Anyone can discover and join",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
                Switch(
                    checked = isPublic,
                    onCheckedChange = viewModel::onIsPublicChanged,
                    colors = SwitchDefaults.colors(checkedThumbColor = Colors.primary, checkedTrackColor = Colors.primary.copy(alpha = 0.4f))
                )
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            // ── Invite Friends ────────────────────────────────────────────────
            Text(
                "Invite Friends",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))

            if (loadingFriends) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Colors.primary)
            } else if (friends.isEmpty()) {
                Text(
                    "No friends yet — add friends from the Profile page!",
                    style = AppTextStyles.small,
                    color = Colors.textMuted
                )
            } else {
                friends.forEach { friend ->
                    FriendInviteRow(
                        friend = friend,
                        selected = friend.id in selectedFriendIds,
                        onToggle = { viewModel.toggleFriendSelected(friend.id) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            // ── Validation error ──────────────────────────────────────────────
            if (validationError != null) {
                Text(
                    text = validationError!!,
                    style = AppTextStyles.small,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = Spacing.sm)
                )
            }

            // ── Create error ──────────────────────────────────────────────────
            if (createState is CreateGroupRunState.Error) {
                Text(
                    text = (createState as CreateGroupRunState.Error).message,
                    style = AppTextStyles.small,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = Spacing.sm)
                )
            }

            // ── Action buttons ────────────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                OutlinedButton(
                    onClick = onNavigateBack,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Cancel", color = Colors.textSecondary)
                }
                Button(
                    onClick = {
                        viewModel.clearValidationError()
                        viewModel.createGroupRun()
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    enabled = createState !is CreateGroupRunState.Loading
                ) {
                    if (createState is CreateGroupRunState.Loading) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Colors.buttonText, strokeWidth = 2.dp)
                    } else {
                        Text("Create Run", color = Colors.buttonText)
                    }
                }
            }

            // Bottom padding for scrolling
            Spacer(modifier = Modifier.height(Spacing.xl))
        }
    }
}

@Composable
fun FriendInviteRow(
    friend: Friend,
    selected: Boolean,
    onToggle: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggle() }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Avatar placeholder
        Surface(
            modifier = Modifier.size(36.dp).clip(CircleShape),
            color = Colors.primary.copy(alpha = 0.2f),
            shape = CircleShape
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = friend.name.take(1).uppercase(),
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
            }
        }
        Spacer(modifier = Modifier.width(Spacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(friend.name, style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium), color = Colors.textPrimary)
            friend.fitnessLevel?.let { level ->
                Text(level, style = AppTextStyles.small, color = Colors.textMuted)
            }
        }
        Checkbox(
            checked = selected,
            onCheckedChange = { onToggle() },
            colors = CheckboxDefaults.colors(checkedColor = Colors.primary)
        )
    }
}

@Composable
fun groupRunTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Colors.textPrimary,
    unfocusedTextColor = Colors.textPrimary,
    cursorColor = Colors.primary,
    focusedBorderColor = Colors.primary,
    unfocusedBorderColor = Colors.textMuted,
    focusedLabelColor = Colors.primary,
    unfocusedLabelColor = Colors.textMuted
)

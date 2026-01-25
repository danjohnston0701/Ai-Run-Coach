
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.CreateGroupRunViewModel

@Composable
fun CreateGroupRunScreen(onNavigateBack: () -> Unit) {
    val viewModel: CreateGroupRunViewModel = viewModel()
    val runName by viewModel.runName.collectAsState()
    val meetingPoint by viewModel.meetingPoint.collectAsState()
    val description by viewModel.description.collectAsState()
    val distance by viewModel.distance.collectAsState()
    val maxParticipants by viewModel.maxParticipants.collectAsState()
    val dateTime by viewModel.dateTime.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create Group Run", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(id = R.drawable.icon_play_vector), contentDescription = "Back", tint = Colors.textPrimary)
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
                .padding(Spacing.lg)
        ) {
            OutlinedTextField(
                value = runName,
                onValueChange = viewModel::onRunNameChanged,
                label = { Text("Run Name *") },
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    textColor = Colors.textPrimary,
                    cursorColor = Colors.primary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Colors.textMuted
                )
            )
            Spacer(modifier = Modifier.height(Spacing.md))
            OutlinedTextField(
                value = meetingPoint,
                onValueChange = viewModel::onMeetingPointChanged,
                label = { Text("Meeting Point *") },
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    textColor = Colors.textPrimary,
                    cursorColor = Colors.primary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Colors.textMuted
                )
            )
            Spacer(modifier = Modifier.height(Spacing.md))
            OutlinedTextField(
                value = description,
                onValueChange = viewModel::onDescriptionChanged,
                label = { Text("Description") },
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    textColor = Colors.textPrimary,
                    cursorColor = Colors.primary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Colors.textMuted
                )
            )
            Spacer(modifier = Modifier.height(Spacing.md))
            Row {
                OutlinedTextField(
                    value = distance,
                    onValueChange = viewModel::onDistanceChanged,
                    label = { Text("Distance (km)") },
                    modifier = Modifier.weight(1f),
                    colors = TextFieldDefaults.outlinedTextFieldColors(
                        textColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.width(Spacing.md))
                OutlinedTextField(
                    value = maxParticipants,
                    onValueChange = viewModel::onMaxParticipantsChanged,
                    label = { Text("Max Participants") },
                    modifier = Modifier.weight(1f),
                    colors = TextFieldDefaults.outlinedTextFieldColors(
                        textColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
            }
            Spacer(modifier = Modifier.height(Spacing.md))
            OutlinedTextField(
                value = dateTime,
                onValueChange = viewModel::onDateTimeChanged,
                label = { Text("Date & Time") },
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    textColor = Colors.textPrimary,
                    cursorColor = Colors.primary,
                    focusedBorderColor = Colors.primary,
                    unfocusedBorderColor = Colors.textMuted
                )
            )
            Spacer(modifier = Modifier.height(Spacing.xl))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                Button(
                    onClick = onNavigateBack,
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Text("Cancel", color = Colors.textPrimary)
                }
                Spacer(modifier = Modifier.width(Spacing.md))
                Button(
                    onClick = { 
                        viewModel.createGroupRun()
                        onNavigateBack() 
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Create")
                }
            }
        }
    }
}

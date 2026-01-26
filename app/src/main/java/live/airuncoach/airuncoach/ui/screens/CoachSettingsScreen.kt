
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.CoachSettingsViewModel
import live.airuncoach.airuncoach.viewmodel.CoachSettingsViewModelFactory
import live.airuncoach.airuncoach.viewmodel.CoachingTone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachSettingsScreen(onNavigateBack: () -> Unit) {
    val context = LocalContext.current
    val viewModel: CoachSettingsViewModel = viewModel(factory = CoachSettingsViewModelFactory(context))
    val coachName by viewModel.coachName.collectAsState()
    val voiceGender by viewModel.voiceGender.collectAsState()
    val accent by viewModel.accent.collectAsState()
    val coachingTone by viewModel.coachingTone.collectAsState()
    val coroutineScope = rememberCoroutineScope()

    Scaffold(
        topBar = {
             TopAppBar(
                title = { Text("AI Coach Settings", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Spacing.lg)
        ) {
            item {
                SectionTitle(title = "Coach Name")
                OutlinedTextField(
                    value = coachName,
                    onValueChange = viewModel::onCoachNameChanged,
                    label = { Text("Give your AI coach a personalized name") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            item {
                SectionTitle(title = "Voice Gender")
                Row(modifier = Modifier.fillMaxWidth()) {
                    GenderButton(
                        text = "Male",
                        isSelected = voiceGender == "male",
                        onClick = { viewModel.onVoiceGenderChanged("male") },
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    GenderButton(
                        text = "Female",
                        isSelected = voiceGender == "female",
                        onClick = { viewModel.onVoiceGenderChanged("female") },
                        modifier = Modifier.weight(1f)
                    )
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            item {
                SectionTitle(title = "Accent")
                Column {
                    viewModel.availableAccents.forEach { accentName ->
                        AccentSelector(
                            accent = accentName,
                            isSelected = accent.equals(accentName, ignoreCase = true),
                            onClick = { viewModel.onAccentChanged(accentName) }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            item {
                SectionTitle(title = "Coaching Tone")
                Column {
                    viewModel.availableTones.forEach { tone ->
                        ToneSelector(
                            tone = tone,
                            isSelected = coachingTone.equals(tone.name, ignoreCase = true),
                            onClick = { viewModel.onCoachingToneChanged(tone.name) }
                        )
                        Spacer(modifier = Modifier.height(Spacing.sm))
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.xl))
            }

            item {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            viewModel.saveSettings()
                            onNavigateBack()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Save Changes", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

@Composable
fun GenderButton(text: String, isSelected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(
        onClick = onClick,
        modifier = modifier.height(50.dp),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) Colors.primary else Colors.backgroundSecondary,
            contentColor = if (isSelected) Colors.buttonText else Colors.textPrimary
        )
    ) {
        Text(text)
    }
}

@Composable
fun AccentSelector(accent: String, isSelected: Boolean, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) Colors.primary.copy(alpha = 0.2f) else Colors.backgroundSecondary
        ),
        border = BorderStroke(2.dp, if (isSelected) Colors.primary else Color.Transparent)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = accent,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                color = Colors.textPrimary
            )
            if (isSelected) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_play_vector),
                    contentDescription = "Selected",
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
fun ToneSelector(tone: CoachingTone, isSelected: Boolean, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 2.dp,
                color = if (isSelected) Colors.primary else Color.Transparent,
                shape = RoundedCornerShape(BorderRadius.md)
            )
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = tone.name,
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Text(
                    text = tone.description,
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            }
            if (isSelected) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_play_vector),
                    contentDescription = "Selected",
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

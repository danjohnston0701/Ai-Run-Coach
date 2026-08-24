
package live.airuncoach.airuncoach.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
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
import live.airuncoach.airuncoach.util.NotificationPermissionHelper

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CoachSettingsScreen(
    onNavigateBack: () -> Unit = {},
    onNavigateToDashboard: () -> Unit = {},
    isOnboarding: Boolean = false
) {
    val context = LocalContext.current
    val viewModel: CoachSettingsViewModel = viewModel(factory = CoachSettingsViewModelFactory(context))
    val coachName by viewModel.coachName.collectAsState()
    val voiceGender by viewModel.voiceGender.collectAsState()
    val accent by viewModel.accent.collectAsState()
    val coachingTone by viewModel.coachingTone.collectAsState()
    val coroutineScope = rememberCoroutineScope()
    val isKeyboardVisible = WindowInsets.isImeVisible
    val density = LocalDensity.current
    val bottomContentPadding = if (isKeyboardVisible) {
        with(density) { WindowInsets.ime.getBottom(this).toDp() }
    } else {
        Spacing.xl
    }

    // Notification permission launcher
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted: Boolean ->
            if (isGranted) {
                android.util.Log.d("CoachSettingsScreen", "Notification permission granted ✅")
            } else {
                android.util.Log.d("CoachSettingsScreen", "Notification permission denied")
            }
        }
    )

    // Request notification permission on first load if needed (new user onboarding)
    LaunchedEffect(Unit) {
        if (NotificationPermissionHelper.shouldRequestPermission()) {
            notificationPermissionLauncher.launch(NotificationPermissionHelper.getPermissionString())
        }
    }

    // Master AI toggle + consent sheet visibility
    val masterAiEnabled by viewModel.masterAiEnabled.collectAsState()
    val showConsentSheet by viewModel.showConsentSheet.collectAsState()

    // Individual coaching trigger toggles — only shown outside onboarding, where this
    // screen is the single consolidated "AI Coaching Settings" screen in the profile.
    // During onboarding these live on their own screen (InSessionCoachingSettingsScreen).
    val paceCoachingEnabled by viewModel.paceCoachingEnabled.collectAsState()
    val routeNavigationEnabled by viewModel.routeNavigationEnabled.collectAsState()
    val elevationCoachingEnabled by viewModel.elevationCoachingEnabled.collectAsState()
    val heartRateCoachingEnabled by viewModel.heartRateCoachingEnabled.collectAsState()
    val cadenceStrideEnabled by viewModel.cadenceStrideEnabled.collectAsState()
    val kmSplitsEnabled by viewModel.kmSplitsEnabled.collectAsState()
    val struggleDetectionEnabled by viewModel.struggleDetectionEnabled.collectAsState()
    val motivationalCoachingEnabled by viewModel.motivationalCoachingEnabled.collectAsState()
    val halfKmCheckInEnabled by viewModel.halfKmCheckInEnabled.collectAsState()
    val kmSplitIntervalKm by viewModel.kmSplitIntervalKm.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "AI Coach Settings",
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
                windowInsets = WindowInsets(0),
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot,
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Spacing.lg),
            contentPadding = PaddingValues(bottom = bottomContentPadding)
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
                val isNewZealand = accent.equals("New Zealand", ignoreCase = true)
                
                Row(modifier = Modifier.fillMaxWidth()) {
                    GenderButton(
                        text = "Male",
                        isSelected = voiceGender == "male",
                        onClick = { viewModel.onVoiceGenderChanged("male") },
                        modifier = Modifier.weight(1f),
                        enabled = !isNewZealand
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    GenderButton(
                        text = "Female",
                        isSelected = voiceGender == "female",
                        onClick = { viewModel.onVoiceGenderChanged("female") },
                        modifier = Modifier.weight(1f)
                    )
                }
                
                // Help text for New Zealand voice limitation
                if (isNewZealand) {
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        text = "New Zealand accent only supports a female voice",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(horizontal = Spacing.xs)
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
                        
                        // Help text for accents with limited voice options
                        if (accent.equals(accentName, ignoreCase = true)) {
                            when {
                                accentName.equals("New Zealand", ignoreCase = true) -> {
                                    Spacer(modifier = Modifier.height(Spacing.sm))
                                    Text(
                                        text = "ℹ️ New Zealand only supports a female voice",
                                        style = AppTextStyles.caption,
                                        color = Colors.textSecondary,
                                        modifier = Modifier.padding(start = Spacing.lg, end = Spacing.md)
                                    )
                                }
                                accentName.equals("Scottish", ignoreCase = true) -> {
                                    Spacer(modifier = Modifier.height(Spacing.sm))
                                    Text(
                                        text = "🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scottish accent uses British English voices",
                                        style = AppTextStyles.caption,
                                        color = Colors.textSecondary,
                                        modifier = Modifier.padding(start = Spacing.lg, end = Spacing.md)
                                    )
                                }
                            }
                        }
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

            // Master AI Coach toggle
            item {
                SectionTitle(title = "AI Coaching")
            }

            item {
                MasterAiToggle(
                    enabled = masterAiEnabled,
                    onToggle = viewModel::onMasterAiToggled
                )
                Spacer(modifier = Modifier.height(Spacing.xl))
            }

            // Individual coaching prompt/trigger toggles — consolidated here for the
            // profile's "AI Coaching Settings" screen. Onboarding shows these on their
            // own separate step instead (InSessionCoachingSettingsScreen), so skip them here.
            if (!isOnboarding) {
                item {
                    SectionTitle(title = "Coaching Prompts")
                    Text(
                        text = "Choose which real-time coaching prompts are active during your runs.",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(bottom = Spacing.lg)
                    )
                }

                if (!masterAiEnabled) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(BorderRadius.md),
                            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                        ) {
                            Text(
                                text = "AI coaching is currently disabled. Enable it above to configure these prompts.",
                                style = AppTextStyles.body,
                                color = Colors.textMuted,
                                modifier = Modifier.padding(Spacing.xl)
                            )
                        }
                        Spacer(modifier = Modifier.height(Spacing.xl))
                    }
                } else {
                    item {
                        CoachingFeatureToggle(
                            title = "Pace Coaching",
                            description = "Target pace guidance — warns when you're going too fast or slow",
                            enabled = paceCoachingEnabled,
                            onToggle = viewModel::onPaceCoachingToggled
                        )
                    }

                    item {
                        CoachingFeatureToggle(
                            title = "Route Navigation",
                            description = "Turn-by-turn voice directions on mapped routes",
                            enabled = routeNavigationEnabled,
                            onToggle = viewModel::onRouteNavigationToggled
                        )
                    }

                    item {
                        CoachingFeatureToggle(
                            title = "Elevation Coaching",
                            description = "Hill and gradient advice — pacing tips on climbs and descents",
                            enabled = elevationCoachingEnabled,
                            onToggle = viewModel::onElevationCoachingToggled
                        )
                    }

                    item {
                        CoachingFeatureToggle(
                            title = "Heart Rate Coaching",
                            description = "Heart rate zone guidance during your run",
                            enabled = heartRateCoachingEnabled,
                            onToggle = viewModel::onHeartRateCoachingToggled
                        )
                    }

                    item {
                        CoachingFeatureToggle(
                            title = "Cadence & Stride",
                            description = "Running form analysis — stride length and cadence coaching",
                            enabled = cadenceStrideEnabled,
                            onToggle = viewModel::onCadenceStrideToggled
                        )
                    }

                    item {
                        CoachingFeatureToggle(
                            title = "500m Check-In",
                            description = "Initial pace assessment at 500 metres in",
                            enabled = halfKmCheckInEnabled,
                            onToggle = viewModel::onHalfKmCheckInToggled
                        )
                    }

                    item {
                        CoachingFeatureToggle(
                            title = "Km Split Updates",
                            description = "Pace and progress updates at each split interval",
                            enabled = kmSplitsEnabled,
                            onToggle = viewModel::onKmSplitsToggled
                        )
                    }

                    if (kmSplitsEnabled) {
                        item {
                            KmSplitIntervalSelector(
                                selectedInterval = kmSplitIntervalKm,
                                availableIntervals = viewModel.availableKmSplitIntervals,
                                onIntervalChanged = viewModel::onKmSplitIntervalChanged
                            )
                        }
                    }

                    item {
                        CoachingFeatureToggle(
                            title = "Struggle Detection",
                            description = "Supportive coaching when your pace drops significantly",
                            enabled = struggleDetectionEnabled,
                            onToggle = viewModel::onStruggleDetectionToggled
                        )
                    }

                    item {
                        CoachingFeatureToggle(
                            title = "Motivational Coaching",
                            description = "Milestones, phase changes, technique tips, and encouragement",
                            enabled = motivationalCoachingEnabled,
                            onToggle = viewModel::onMotivationalCoachingToggled
                        )
                    }

                    item { Spacer(modifier = Modifier.height(Spacing.xl)) }
                }
            }

            item {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            viewModel.saveSettings()
                            onNavigateToDashboard()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text(
                        if (isOnboarding) "Continue" else "Save Changes",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    }

    // AI Consent bottom sheet — shown every time the master toggle is turned ON
    if (showConsentSheet) {
        AiConsentBottomSheet(
            onAllow = viewModel::onConsentGrantedFromSettings,
            onDecline = viewModel::onConsentDeclinedFromSettings,
            onDismiss = viewModel::dismissConsentSheet
        )
    }
}

@Composable
fun MasterAiToggle(enabled: Boolean, onToggle: (Boolean) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = if (enabled) Colors.primary.copy(alpha = 0.15f) else Colors.backgroundSecondary
        ),
        border = if (enabled) BorderStroke(1.dp, Colors.primary.copy(alpha = 0.4f)) else BorderStroke(1.dp, Color.Transparent)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f).padding(end = Spacing.md)) {
                Text(
                    text = "AI Coach Enabled",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = if (enabled) Colors.primary else Colors.textPrimary
                )
                Text(
                    text = if (enabled)
                        "AI coaching is active — workout data shared with OpenAI"
                    else
                        "AI coaching is off — no data shared with third parties",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
            Switch(
                checked = enabled,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Colors.primary,
                    uncheckedThumbColor = Colors.textMuted,
                    uncheckedTrackColor = Colors.backgroundRoot
                )
            )
        }
    }
}

@Composable
fun GenderButton(
    text: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(50.dp),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) Colors.primary else Colors.backgroundSecondary,
            contentColor = if (isSelected) Colors.buttonText else Colors.textPrimary,
            disabledContainerColor = Colors.backgroundSecondary.copy(alpha = 0.5f),
            disabledContentColor = Colors.textMuted
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
                    painter = painterResource(id = R.drawable.icon_check_vector),
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
                    painter = painterResource(id = R.drawable.icon_check_vector),
                    contentDescription = "Selected",
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
fun CoachingFeatureToggle(
    title: String,
    description: String,
    enabled: Boolean,
    onToggle: (Boolean) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = Spacing.md)
            ) {
                Text(
                    text = title,
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.SemiBold),
                    color = if (enabled) Colors.textPrimary else Colors.textMuted
                )
                Text(
                    text = description,
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
            Switch(
                checked = enabled,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Colors.primary,
                    uncheckedThumbColor = Colors.textMuted,
                    uncheckedTrackColor = Colors.backgroundRoot
                )
            )
        }
    }
}

@Composable
fun KmSplitIntervalSelector(
    selectedInterval: Int,
    availableIntervals: List<Int>,
    onIntervalChanged: (Int) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = Spacing.lg, end = Spacing.xs, top = Spacing.xs, bottom = Spacing.xs),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.6f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md)
        ) {
            Text(
                text = "Split Interval",
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Medium),
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                availableIntervals.forEach { interval ->
                    val isSelected = interval == selectedInterval
                    Button(
                        onClick = { onIntervalChanged(interval) },
                        modifier = Modifier
                            .weight(1f)
                            .height(36.dp),
                        shape = RoundedCornerShape(BorderRadius.md),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isSelected) Colors.primary else Colors.backgroundRoot,
                            contentColor = if (isSelected) Colors.buttonText else Colors.textSecondary
                        ),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                    ) {
                        Text(
                            text = "${interval}km",
                            style = AppTextStyles.caption.copy(fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                        )
                    }
                }
            }
        }
    }
}

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.CoachSettingsViewModel
import live.airuncoach.airuncoach.viewmodel.CoachSettingsViewModelFactory

/**
 * In-Session Coaching Settings screen — the final onboarding step before the subscription screen.
 *
 * Shows the individual real-time coaching feature toggles, all enabled by default.
 * The user can customise which types of coaching prompts fire during their runs.
 * All toggles are also accessible post-onboarding in the Coach Settings section of the profile.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InSessionCoachingSettingsScreen(
    onNavigateBack: () -> Unit = {},
    onNavigateToDashboard: () -> Unit = {}
) {
    val context = LocalContext.current
    val viewModel: CoachSettingsViewModel = viewModel(factory = CoachSettingsViewModelFactory(context))
    val sessionManager = remember { SessionManager(context) }
    val coroutineScope = rememberCoroutineScope()

    val masterAiEnabled by viewModel.masterAiEnabled.collectAsState()
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
                        "Coaching Prompts",
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
        bottomBar = {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding(),
                color = Colors.backgroundRoot,
                shadowElevation = 8.dp
            ) {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            viewModel.saveSettings()
                            sessionManager.setNeedsCoachSetup(false)
                            sessionManager.clearOnboardingFlags()
                            onNavigateToDashboard()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text(
                        "Save & Continue",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Spacing.lg)
        ) {
            item {
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    text = "Choose which real-time coaching prompts are active during your runs. You can change these at any time in your profile.",
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
                            text = "AI coaching is currently disabled. Enable it in the previous step to configure these prompts.",
                            style = AppTextStyles.body,
                            color = Colors.textMuted,
                            modifier = Modifier.padding(Spacing.xl)
                        )
                    }
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
            }

            item { Spacer(modifier = Modifier.height(Spacing.xl)) }
        }
    }
}

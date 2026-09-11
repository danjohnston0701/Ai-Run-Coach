@file:OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.DirectionsRun
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.ShareLocation
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.AiCoachingNote
import live.airuncoach.airuncoach.domain.model.GeneratedRoute
import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LatLng
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.domain.model.RouteDifficulty
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.domain.model.TerrainType
import live.airuncoach.airuncoach.ui.components.OutlinedCtaButton
import live.airuncoach.airuncoach.viewmodel.AiAnalysisState
import com.google.android.gms.location.LocationServices
import com.google.maps.android.PolyUtil
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import live.airuncoach.airuncoach.ui.components.PrepareRunOnWatchButton
import live.airuncoach.airuncoach.ui.components.WatchSendState
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.util.AppAnalytics
import kotlin.math.absoluteValue

/**
 * Feature-tour walkthrough offered as an option from [OnboardingSubscriptionScreen], covering
 * every major feature so a new user sees what the app actually does before landing cold on the
 * dashboard.
 *
 * Rebuilt 2026-09 after the first version's mock screens read as generic and nothing like the
 * real app (confirmed by the developer, not just a hunch). This version pulls its structure,
 * copy, icon resources (R.drawable.icon_*, the same assets the real screens use), and text
 * styles (AppTextStyles) directly from the real DashboardScreen.kt / ProfileScreen.kt /
 * InjuryManagementScreen.kt / MapMyRunSetupScreen.kt / RunSummaryScreen.kt — e.g. the real
 * button reads "RUN WITHOUT ROUTE" / "RUN WITH ROUTE" (all-caps), Profile groups settings under
 * "Social" / "Ai Coach" / "Profile" / "Settings" with "Health & Injuries" as its real label, and
 * the real run-summary tab row is "Ai Insights / Summary / Graphs / Data / Badges" — all of
 * which the previous version got wrong or approximated generically. Still fake data, no
 * ViewModels, no live backend calls — a faithful VISUAL clone, not the genuine screen — but
 * built to be recognizable as "yep that's my dashboard" rather than a generic mockup.
 *
 * Second pass (2026-09-12, after the developer flagged the Run Without Route and Run Summary
 * mocks as nothing like the real screens): those two, plus the new Run With Route sequence,
 * now compose the REAL screens' own building blocks — MapMyRunSetupScreen's section
 * composables, RunSummaryScreen's top bar + tab contents, RouteGeneratingLoadingScreen and
 * RouteSelectionScreen's RouteCard — fed fabricated-but-realistic data (a full GPS loop near
 * the user, splits, HR, coaching notes, three generated routes). See MockRunSetupScreen,
 * MockRunSummaryScreen and MockRouteGenerationStep. The tour ends on a "Finish Tour" page
 * after the route-selection step.
 *
 * Interactive steps use a self-contained mock screen driven by tapping the highlighted element
 * exactly as a real user would, matching a scripted guided-tour convention (Duolingo-style)
 * rather than free exploration. See MainScreen.kt's "onboarding_tour" route for how this is
 * reached via MainActivity.pendingDeepLink.
 *
 * Opens with a device-choice question (Garmin Watch / Phone only — Apple Watch is intentionally
 * not offered here, since it cannot pair with an Android phone at all, and Samsung Watch is held
 * back until the Wear OS companion is published; iOS's equivalent OnboardingTourScreen.swift
 * offers Apple Watch / Garmin Watch / Phone only) so later steps
 * can skip whichever watch-brand page doesn't apply, and the Run Without a Route step can
 * correctly show "Prepare for Watch" only for users who have a watch to prepare for.
 */
private enum class TourWatchChoice { GARMIN_WATCH, SAMSUNG_WATCH, PHONE_ONLY }

private data class InfoPage(
    val icon: ImageVector,
    val title: String,
    val description: String,
)

@Composable
fun OnboardingTourScreen(
    onFinish: () -> Unit,
) {
    var watchChoice by remember { mutableStateOf<TourWatchChoice?>(null) }

    // Fires once, on first composition — "started" means the tour screen was actually reached,
    // not just the "Take a tour" button tapped (permission/consent steps can intervene between
    // the tap and this screen mounting). Server preserves the first occurrence, so this is safe
    // to call every time the screen mounts. Non-fatal: tracking must never block or crash the
    // tour itself.
    LaunchedEffect(Unit) {
        try {
            live.airuncoach.airuncoach.network.RetrofitClient.apiService.recordOnboardingTourEvent(
                live.airuncoach.airuncoach.network.model.OnboardingTourEventRequest(event = "started")
            )
        } catch (e: Exception) {
            android.util.Log.w("OnboardingTourScreen", "Failed to record tour start (non-fatal): ${e.message}")
        }
    }

    if (watchChoice == null) {
        WatchChoiceScreen(
            onChoose = { watchChoice = it },
            onSkip = onFinish,
        )
    } else {
        TourStepController(watchChoice = watchChoice!!, onFinish = onFinish)
    }
}

@Composable
private fun WatchChoiceScreen(
    onChoose: (TourWatchChoice) -> Unit,
    onSkip: () -> Unit,
) {
    val context = LocalContext.current
    Column(modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
            horizontalArrangement = Arrangement.End,
        ) {
            TextButton(onClick = {
                AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_TOUR_SKIPPED)
                onSkip()
            }) {
                Text("Skip", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Colors.textSecondary)
            }
        }
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "How will you run with Ai Run Coach?",
                fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Colors.textPrimary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                text = "We'll tailor the rest of this tour to what you're using.",
                fontSize = 14.sp, color = Colors.textSecondary, textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(Spacing.xl))
            WatchChoiceOption(R.drawable.icon_watch_vector, "Garmin Watch") { onChoose(TourWatchChoice.GARMIN_WATCH) }
            Spacer(modifier = Modifier.height(Spacing.sm))
            // Samsung Watch deliberately not offered yet (2026-09-12): the Wear OS companion
            // (`wear/`) isn't published on Google Play / Galaxy Store, so a user who picked it
            // would be toured through a device they can't actually pair. TourWatchChoice
            // .SAMSUNG_WATCH stays so re-adding the option is a one-liner once it ships.
            WatchChoiceOption(R.drawable.icon_profile_vector, "Phone only") { onChoose(TourWatchChoice.PHONE_ONLY) }
        }
    }
}

@Composable
private fun WatchChoiceOption(iconRes: Int, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(BorderStroke(1.dp, Colors.primary.copy(alpha = 0.3f)), RoundedCornerShape(BorderRadius.lg))
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.lg, vertical = Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(painterResource(id = iconRes), contentDescription = null, tint = Colors.primary, modifier = Modifier.size(24.dp))
        Spacer(modifier = Modifier.width(Spacing.md))
        Text(label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Colors.textPrimary)
    }
}

// ── Step sequence ────────────────────────────────────────────────────────────────────────────
// Info pages are split into "lead" (before the interactive sequence) and "tail" (after it), so
// the controller can interleave the two — see TourStepController's `when`.

private fun leadPages(): List<InfoPage> = listOf(
    InfoPage(Icons.Filled.Flag, "Set Your Goals", "Tell us what you're working towards — a race, a distance PB, or just building a consistent habit — and Ai Run Coach tailors everything else around it."),
    InfoPage(Icons.Filled.Psychology, "AI Training Plans", "Get a personalised training plan generated by AI, built around your goal, fitness level, and schedule — and adjusted automatically as your training progresses."),
)

private fun tailPages(): List<InfoPage> = listOf(
    // Closing page — reached only after the interactive Run With Route sequence. Its button
    // reads "Finish Tour" (InfoPageContent's isLast), which is what actually ends the tour.
    InfoPage(
        Icons.AutoMirrored.Filled.DirectionsRun, "You're Ready to Run",
        "That's the tour. Set a goal, start a free run, or generate a route from your Dashboard whenever you're ready — your AI coach will be with you every step of the way.",
    ),
)

/** Total interactive steps between the lead and tail info pages — see the `when` in TourStepController. */
private const val INTERACTIVE_STEP_COUNT = 12

@Composable
private fun TourStepController(
    watchChoice: TourWatchChoice,
    onFinish: () -> Unit,
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val lead = remember { leadPages() }
    val tail = remember { tailPages() }
    val totalSteps = lead.size + INTERACTIVE_STEP_COUNT + tail.size
    var step by remember { mutableIntStateOf(0) }

    fun advance() {
        if (step >= totalSteps - 1) {
            AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_TOUR_COMPLETED)
            // Only fires on reaching the natural end (this branch) — never on Skip — so
            // the completed timestamp genuinely means "finished the tour," not "opened it."
            coroutineScope.launch {
                try {
                    live.airuncoach.airuncoach.network.RetrofitClient.apiService.recordOnboardingTourEvent(
                        live.airuncoach.airuncoach.network.model.OnboardingTourEventRequest(event = "completed")
                    )
                } catch (e: Exception) {
                    android.util.Log.w("OnboardingTourScreen", "Failed to record tour completion (non-fatal): ${e.message}")
                }
            }
            onFinish()
        } else {
            step += 1
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TourProgressDots(current = step, total = totalSteps)
            TextButton(onClick = {
                AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_TOUR_SKIPPED)
                onFinish()
            }) {
                Text("Skip", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Colors.textSecondary)
            }
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            val interactiveIndex = step - lead.size
            when {
                step < lead.size -> InfoPageContent(lead[step], onNext = ::advance, isLast = false)
                interactiveIndex in 0 until INTERACTIVE_STEP_COUNT -> InteractiveStep(
                    index = interactiveIndex,
                    watchChoice = watchChoice,
                    onAdvance = ::advance,
                )
                else -> {
                    val tailIndex = step - lead.size - INTERACTIVE_STEP_COUNT
                    InfoPageContent(tail[tailIndex], onNext = ::advance, isLast = step == totalSteps - 1)
                }
            }
        }
    }
}

@Composable
private fun TourProgressDots(current: Int, total: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        repeat(total) { i ->
            Box(
                modifier = Modifier
                    .padding(horizontal = 2.dp)
                    .size(if (i == current) 8.dp else 6.dp)
                    .background(
                        color = if (i == current) Colors.primary else Colors.textMuted.copy(alpha = 0.35f),
                        shape = CircleShape,
                    ),
            )
        }
    }
}

@Composable
private fun InfoPageContent(page: InfoPage, onNext: () -> Unit, isLast: Boolean) {
    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier.size(96.dp).background(Colors.primary.copy(alpha = 0.12f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(page.icon, contentDescription = null, tint = Colors.primary, modifier = Modifier.size(44.dp))
            }
            Spacer(modifier = Modifier.height(Spacing.xl))
            Text(page.title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Colors.textPrimary, textAlign = TextAlign.Center)
            Spacer(modifier = Modifier.height(Spacing.md))
            Text(page.description, fontSize = 15.sp, color = Colors.textSecondary, textAlign = TextAlign.Center, lineHeight = 22.sp)
        }
        Button(
            onClick = onNext,
            modifier = Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Spacing.lg).padding(bottom = Spacing.xl),
            colors = ButtonDefaults.buttonColors(containerColor = Colors.primary, contentColor = Colors.buttonText),
            shape = RoundedCornerShape(BorderRadius.lg),
        ) {
            Text(if (isLast) "Finish Tour" else "Next", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
    }
}

// ── Interactive mock-screen steps ───────────────────────────────────────────────────────────
//
// Fake data, no ViewModels, no network calls, but built from the real screens' actual structure,
// copy, icon resources, and text styles — see the file-level doc comment above for what changed
// and why. Only the highlighted element responds to taps, matching a scripted guided-tour
// convention (Duolingo-style) rather than free exploration.

@Composable
private fun InteractiveStep(index: Int, watchChoice: TourWatchChoice, onAdvance: () -> Unit) {
    when (index) {
        0 -> MockDashboardScreen(highlight = DashboardHighlight.PROFILE_TAB, onHighlightTapped = onAdvance)
        1 -> MockProfileScreen(highlight = ProfileHighlight.CONNECTED_DEVICES, onHighlightTapped = onAdvance)
        2 -> MockConnectedDevicesScreen(watchChoice = watchChoice, onBack = onAdvance)
        3 -> MockProfileScreen(highlight = ProfileHighlight.INJURIES, onHighlightTapped = onAdvance)
        4 -> MockInjuryManagementScreen(onBack = onAdvance)
        5 -> MockDashboardScreen(highlight = DashboardHighlight.RUN_WITHOUT_ROUTE, onHighlightTapped = onAdvance)
        6 -> MockRunSetupScreen(mode = "no_route", watchChoice = watchChoice, onProceed = onAdvance)
        7 -> MockRunSummaryScreen(onFinished = onAdvance)
        8 -> MockAiPlansScreen(onAdvance = onAdvance)
        9 -> MockDashboardScreen(highlight = DashboardHighlight.RUN_WITH_ROUTE, onHighlightTapped = onAdvance)
        10 -> MockRunSetupScreen(mode = "route", watchChoice = watchChoice, onProceed = onAdvance)
        11 -> MockRouteGenerationStep(watchChoice = watchChoice, onAdvance = onAdvance)
    }
}

/** Persistent prompt banner shown at the bottom of every interactive mock screen. */
@Composable
private fun TourPromptBanner(text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Colors.primary,
        shape = RoundedCornerShape(topStart = BorderRadius.lg, topEnd = BorderRadius.lg),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text, color = Colors.buttonText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        }
    }
}

/** Wraps a tap target with a pulsing highlight border so it reads as "tap here." */
@Composable
private fun TourHighlight(
    modifier: Modifier = Modifier,
    // Colors.primary is invisible as a border against content already filled with
    // Colors.primary (e.g. the Dashboard's "RUN WITHOUT ROUTE" button) — confirmed on-device,
    // the pulse simply disappeared into the fill. Callers wrapping a primary-filled element
    // should pass a contrasting color (e.g. Colors.buttonText) instead.
    highlightColor: Color = Colors.primary,
    content: @Composable () -> Unit,
) {
    val transition = rememberInfiniteTransition(label = "tourHighlight")
    val alpha by transition.animateFloat(
        initialValue = 0.35f, targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(650), repeatMode = RepeatMode.Reverse),
        label = "tourHighlightAlpha",
    )
    Box(
        modifier = modifier
            .border(BorderStroke(2.dp, highlightColor.copy(alpha = alpha)), RoundedCornerShape(BorderRadius.md)),
    ) {
        content()
    }
}

// Mock bottom nav bar shared by the Dashboard/Profile mock screens.
private enum class MockTab { HOME, PROFILE }

@Composable
private fun MockBottomNav(selected: MockTab, highlightProfile: Boolean, onProfileTapped: () -> Unit) {
    // Matches the real 5-tab bar exactly — Screen.Home/History/Goals/AiPlans/Profile in
    // MainScreen.kt, including their actual drawable resources (icon_target_vector is Goals'
    // real icon, NOT Home's — a previous version of this mock got that wrong).
    // windowInsets = 0: the tour is hosted inside MainScreen's Scaffold, whose innerPadding
    // already excludes the system navigation bar. NavigationBar's default insets would pad
    // for it a second time — that was the visible dead strip under the mock tab bar.
    NavigationBar(
        containerColor = Colors.backgroundRoot.copy(alpha = 0.95f),
        tonalElevation = 8.dp,
        windowInsets = WindowInsets(0),
    ) {
        NavigationBarItem(
            selected = selected == MockTab.HOME,
            onClick = {},
            icon = { Icon(painterResource(id = R.drawable.icon_home_vector), contentDescription = "Home") },
            label = { Text("Home") },
        )
        NavigationBarItem(selected = false, onClick = {}, icon = { Icon(painterResource(id = R.drawable.icon_chart_vector), contentDescription = "History") }, label = { Text("History") })
        NavigationBarItem(selected = false, onClick = {}, icon = { Icon(painterResource(id = R.drawable.icon_target_vector), contentDescription = "Goals") }, label = { Text("Goals") })
        NavigationBarItem(selected = false, onClick = {}, icon = { Icon(painterResource(id = R.drawable.icon_calendar_vector), contentDescription = "AI Plans") }, label = { Text("AI Plans") })
        val profileIcon: @Composable () -> Unit = { Icon(painterResource(id = R.drawable.icon_profile_vector), contentDescription = "Profile") }
        NavigationBarItem(
            selected = selected == MockTab.PROFILE,
            onClick = onProfileTapped,
            icon = { if (highlightProfile) TourHighlight { profileIcon() } else profileIcon() },
            label = { Text("Profile") },
        )
    }
}

private enum class DashboardHighlight { PROFILE_TAB, RUN_WITHOUT_ROUTE, RUN_WITH_ROUTE }

@Composable
private fun MockDashboardScreen(highlight: DashboardHighlight, onHighlightTapped: () -> Unit) {
    val context = LocalContext.current
    // Real user name (from the session, not a fake placeholder) — same source the real
    // Dashboard reads for WelcomeSection. Goal is deliberately null: this tour runs during
    // onboarding, before the user has ever set a goal, so the real "No active goal" empty
    // state (GoalCard) is the honest thing to show, not a fabricated one.
    val userName = remember { SessionManager(context).getUserName() }
    var currentTime by remember { mutableStateOf(SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date())) }
    var weather by remember { mutableStateOf<live.airuncoach.airuncoach.domain.model.WeatherData?>(null) }
    LaunchedEffect(Unit) {
        currentTime = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date())
        weather = try {
            live.airuncoach.airuncoach.data.WeatherRepository(context).getCurrentWeather()
        } catch (e: Exception) {
            null
        }
    }

    Scaffold(
        containerColor = Colors.backgroundRoot,
        // Same reasoning as MockBottomNav's windowInsets: MainScreen's Scaffold already applies
        // the status/navigation bar insets, so the default here double-padded top and bottom.
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            MockBottomNav(
                selected = MockTab.HOME,
                highlightProfile = highlight == DashboardHighlight.PROFILE_TAB,
                onProfileTapped = { if (highlight == DashboardHighlight.PROFILE_TAB) onHighlightTapped() },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(top = Spacing.lg)) {
                WelcomeSection(
                    userName = userName,
                    profilePicUrl = null,
                    aiCoachName = null,
                    sessionType = "RUN",
                    onProfileClick = {},
                )
                Spacer(modifier = Modifier.height(Spacing.xl))

                GoalCard(goal = null, onClick = {}, onAddGoal = {})
                Spacer(modifier = Modifier.height(Spacing.md))

                if (weather != null) {
                    TimeAndWeatherBar(time = currentTime, weather = weather!!)
                } else {
                    NoWeatherDataBar(time = currentTime)
                }
                Spacer(modifier = Modifier.height(Spacing.xl))

                val actionButtons: @Composable () -> Unit = {
                    ActionButtons(
                        sessionType = "RUN",
                        onMapMyRun = { if (highlight == DashboardHighlight.RUN_WITH_ROUTE) onHighlightTapped() },
                        onRunWithoutRoute = { if (highlight == DashboardHighlight.RUN_WITHOUT_ROUTE) onHighlightTapped() },
                        isEnabled = true,
                    )
                }
                if (highlight == DashboardHighlight.RUN_WITHOUT_ROUTE || highlight == DashboardHighlight.RUN_WITH_ROUTE) {
                    TourHighlight(highlightColor = Colors.buttonText) { actionButtons() }
                } else {
                    actionButtons()
                }
                Spacer(modifier = Modifier.height(Spacing.md))

                // recentRun = null — a new user genuinely has no previous sessions yet, so the
                // real card's own honest empty state ("No previous sessions yet…") is correct.
                PreviousRunsCard(recentRun = null, onClick = {})
                Spacer(modifier = Modifier.height(Spacing.xl))
            }
            TourPromptBanner(
                when (highlight) {
                    DashboardHighlight.PROFILE_TAB -> "This is your Dashboard. Tap the Profile tab below to keep going."
                    DashboardHighlight.RUN_WITHOUT_ROUTE -> "Tap \"RUN WITHOUT ROUTE\" to see how a free run starts."
                    DashboardHighlight.RUN_WITH_ROUTE -> "Back on your Dashboard. Tap \"RUN WITH ROUTE\" to have a route generated for you."
                }
            )
        }
    }
}

private enum class ProfileHighlight { CONNECTED_DEVICES, INJURIES }

@Composable
private fun MockProfileScreen(highlight: ProfileHighlight, onHighlightTapped: () -> Unit) {
    val scrollState = rememberScrollState()
    // Connected Devices sits under "Settings," near the bottom of the real Profile screen —
    // confirmed on-device that it's off-screen by default, so the prompt below ("Tap Connected
    // Devices") pointed at something not currently visible. Health & Injuries, under "Profile,"
    // is high enough to already be on-screen and doesn't need this.
    LaunchedEffect(highlight) {
        if (highlight == ProfileHighlight.CONNECTED_DEVICES) {
            delay(300)
            scrollState.animateScrollTo(scrollState.maxValue)
        }
    }
    // Real user name — same session source the real ProfileScreen header and the Dashboard
    // mock above use. Falls back to the real screen's own placeholder, never a fake name.
    val context = LocalContext.current
    val userName = remember { SessionManager(context).getUserName()?.takeIf { it.isNotBlank() } ?: "Runner" }
    Scaffold(
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0), // see MockDashboardScreen
        bottomBar = { MockBottomNav(selected = MockTab.PROFILE, highlightProfile = false, onProfileTapped = {}) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.weight(1f).verticalScroll(scrollState).padding(top = Spacing.xl)) {
                // ── ProfileHeader — real avatar circle + name + subscription pill ──
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg),
                ) {
                    Box(
                        modifier = Modifier
                            .size(85.dp)
                            .background(Colors.primary.copy(alpha = 0.2f), CircleShape)
                            .border(4.dp, Colors.primary, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(painterResource(id = R.drawable.icon_profile_vector), contentDescription = null, tint = Colors.primary, modifier = Modifier.size(50.dp))
                    }
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(userName, style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    Box(
                        modifier = Modifier
                            .background(Colors.primary.copy(alpha = 0.1f), RoundedCornerShape(BorderRadius.full))
                            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
                    ) {
                        Text("FREE", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.primary)
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.xl))

                ProfileSectionTitle("Social")
                ProfileSection {
                    ProfileRow(R.drawable.icon_people_vector, "Friends", null, false) {}
                    ProfileRow(R.drawable.icon_people_vector, "Group Runs", null, false) {}
                }
                Spacer(modifier = Modifier.height(Spacing.md))

                ProfileSectionTitle("Ai Coach")
                ProfileSection {
                    ProfileRow(R.drawable.icon_ai_vector, "Ai Coach Settings", null, false) {}
                    ProfileRow(R.drawable.icon_calendar_vector, "Coaching Programme", null, false) {}
                }
                Spacer(modifier = Modifier.height(Spacing.md))

                ProfileSectionTitle("Profile")
                ProfileSection {
                    ProfileRow(R.drawable.icon_profile_vector, "Personal Details", null, false) {}
                    ProfileRow(R.drawable.icon_heart_vector, "Health & Injuries", null, highlight == ProfileHighlight.INJURIES) {
                        if (highlight == ProfileHighlight.INJURIES) onHighlightTapped()
                    }
                    ProfileRow(R.drawable.icon_target_vector, "Goals", null, false) {}
                }
                Spacer(modifier = Modifier.height(Spacing.md))

                ProfileSectionTitle("Settings")
                ProfileSection {
                    ProfileRow(R.drawable.icon_watch_vector, "Connected Devices", null, highlight == ProfileHighlight.CONNECTED_DEVICES) {
                        if (highlight == ProfileHighlight.CONNECTED_DEVICES) onHighlightTapped()
                    }
                    ProfileRow(R.drawable.icon_watch_vector, "My Account", "Free", false) {}
                }
                Spacer(modifier = Modifier.height(Spacing.xl))
            }
            TourPromptBanner(
                if (highlight == ProfileHighlight.CONNECTED_DEVICES) "Tap \"Connected Devices\" to see how pairing a watch works."
                else "Tap \"Health & Injuries\" to see how AI Plans train around an injury."
            )
        }
    }
}

@Composable
private fun ProfileSectionTitle(title: String) {
    Text(
        title, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted,
        modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
    )
}

@Composable
private fun ProfileSection(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
    ) {
        Column { content() }
    }
}

@Composable
private fun ProfileRow(iconRes: Int, label: String, value: String?, highlighted: Boolean, onClick: () -> Unit) {
    val row: @Composable () -> Unit = {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(id = iconRes), contentDescription = null, tint = Colors.textMuted, modifier = Modifier.size(24.dp))
                Spacer(modifier = Modifier.width(Spacing.md))
                Text(label, style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium), color = Colors.textPrimary)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (value != null) {
                    Text(value, style = AppTextStyles.body, color = Colors.textSecondary)
                    Spacer(modifier = Modifier.width(Spacing.sm))
                }
                Icon(painterResource(id = R.drawable.icon_chevron_right_vector), contentDescription = null, tint = Colors.textMuted, modifier = Modifier.size(16.dp))
            }
        }
    }
    if (highlighted) TourHighlight(modifier = Modifier.fillMaxWidth()) { row() } else row()
}

@Composable
private fun MockConnectedDevicesScreen(watchChoice: TourWatchChoice, onBack: () -> Unit) {
    // The REAL screen, not a hand-copied clone — a new onboarding user genuinely has no
    // devices connected yet, so its default hiltViewModel() state is truthful here, and the
    // "Get Watch App"/"Connect Strava" buttons' default no-op callbacks keep the tour from
    // wandering into a real OAuth flow or Play Store link.
    Box(modifier = Modifier.fillMaxSize()) {
        ConnectedDevicesScreen(onNavigateBack = onBack)
        Box(modifier = Modifier.align(Alignment.BottomCenter)) {
            TourPromptBanner("Tap the back arrow above to return to your Profile.")
        }
    }
}

@Composable
private fun MockInjuryManagementScreen(onBack: () -> Unit) {
    var selectedTab by remember { mutableIntStateOf(0) }
    Column(modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TourHighlight {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary,
                    modifier = Modifier.size(24.dp).clickable(onClick = onBack),
                )
            }
            Spacer(modifier = Modifier.width(Spacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text("Health & Injuries", fontSize = 19.sp, fontWeight = FontWeight.Bold, color = Colors.textPrimary)
                Text("Track your injuries and conditions", fontSize = 12.sp, color = Colors.textSecondary)
            }
            Button(
                onClick = {},
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary, contentColor = Colors.buttonText),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.height(40.dp),
                contentPadding = PaddingValues(horizontal = 12.dp),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Add", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        val tabs = listOf(Triple("Recovering", Color(0xFFFFB300), 0), Triple("Chronic", Color(0xFFAB47BC), 1), Triple("Healed", Colors.success, 2))
        TabRow(selectedTabIndex = selectedTab, containerColor = Colors.backgroundRoot, contentColor = Colors.primary) {
            tabs.forEach { (label, _, index) ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    selectedContentColor = Colors.primary,
                    unselectedContentColor = Colors.textMuted,
                ) {
                    Text(
                        label, modifier = Modifier.padding(vertical = 12.dp),
                        fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal,
                        color = if (selectedTab == index) Colors.primary else Colors.textMuted,
                    )
                }
            }
        }
        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Spacing.lg)) {
            if (selectedTab == 0) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.width(4.dp).height(40.dp).background(Color(0xFFFFB300), RoundedCornerShape(2.dp)))
                            Spacer(modifier = Modifier.width(Spacing.md))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Right knee · Lateral", fontWeight = FontWeight.Bold, color = Colors.textPrimary)
                                Text("Since 3 weeks ago", fontSize = 11.sp, color = Colors.textMuted)
                            }
                        }
                        Spacer(modifier = Modifier.height(Spacing.md))
                        HorizontalDivider(color = Colors.border)
                        Spacer(modifier = Modifier.height(Spacing.md))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Warning, contentDescription = null, tint = Colors.warning, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Moderate", fontSize = 12.sp, color = Colors.warning, fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            "Your AI Training Plan is applying conservative load management and capping weekly mileage increases while this heals.",
                            fontSize = 12.sp, color = Colors.primary, lineHeight = 16.sp,
                        )
                    }
                }
            } else {
                Text("No entries in this category yet.", fontSize = 13.sp, color = Colors.textMuted)
            }
            Spacer(modifier = Modifier.height(Spacing.xl))
        }
        TourPromptBanner("Tap the back arrow above to head back to your Dashboard.")
    }
}

// ── Run setup (real MapMyRunSetupScreen structure) ──────────────────────────────────────────

/**
 * Faithful clone of MapMyRunSetupScreen for both of its modes ("no_route" = Dashboard's RUN
 * WITHOUT ROUTE, "route" = RUN WITH ROUTE). Composed from that screen's own `internal` section
 * composables (SetupHeader, GpsAlertIfNeeded, CompactModeRow, TargetDistanceCard,
 * CompactTargetTimeSection, AiCoachToggleSection, GroupRunSection, PrimaryCtaButton /
 * OutlinedCtaButton / PrepareRunOnWatchButton) laid out in the same order with the same
 * spacing and the same fixed bottom CTA bar — so it IS the real screen visually, minus the
 * ViewModel, GPS, friends fetch and persistence. Every control is live (distance slider,
 * Run/Walk, target time, AI Coach, Social toggles) so the user can poke at it exactly as
 * they would on the real thing; only the highlighted CTA advances the tour. The previous
 * hand-drawn version ("Target distance 5.0 km" card + a button) looked nothing like it.
 *
 * The real screen spends its first moments on "ACQUIRING GPS…" before the "GPS Locked" pill
 * appears and the CTA enables; a short fake acquisition reproduces that beat.
 */
@Composable
private fun MockRunSetupScreen(mode: String, watchChoice: TourWatchChoice, onProceed: () -> Unit) {
    val hasWatch = watchChoice != TourWatchChoice.PHONE_ONLY
    var activityMode by remember { mutableStateOf(ActivityMode.RUN) }
    var targetDistance by remember { mutableFloatStateOf(5f) }
    var isTargetTimeEnabled by remember { mutableStateOf(false) }
    var targetHours by remember { mutableStateOf("00") }
    var targetMinutes by remember { mutableStateOf("30") }
    var targetSeconds by remember { mutableStateOf("00") }
    var isAiCoachEnabled by remember { mutableStateOf(true) }
    var isLiveTrackingEnabled by remember { mutableStateOf(false) }
    var liveTrackingObservers by remember { mutableStateOf<List<String>>(emptyList()) }
    var liveTrackingPendingEmail by remember { mutableStateOf("") }
    var isGroupRunEnabled by remember { mutableStateOf(false) }
    var groupRunParticipants by remember { mutableStateOf<List<String>>(emptyList()) }
    var gpsLocked by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay(1400); gpsLocked = true }

    val activityTypeLabel = if (activityMode == ActivityMode.WALK) "WALK" else "RUN"
    val title = if (mode == "route") "MAP MY $activityTypeLabel SETUP" else "CONFIGURE YOUR $activityTypeLabel"
    val subtitle = if (mode == "route") "Configure your route preferences" else "Set your ${activityTypeLabel.lowercase()} details"

    Column(modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot)) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                // Same clearance the real screen reserves above its fixed CTA bar.
                contentPadding = PaddingValues(bottom = 140.dp),
            ) {
                item { SetupHeader(title = title, subtitle = subtitle, gpsLocked = gpsLocked, onClose = {}) }
                item {
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    GpsAlertIfNeeded(isGettingLocation = !gpsLocked, gpsError = null, hasPermission = true, onGrantPermission = {})
                }
                item { Spacer(modifier = Modifier.height(Spacing.lg)) }
                item { CompactModeRow(mode = activityMode, onModeChanged = { activityMode = it }) }
                item { Spacer(modifier = Modifier.height(Spacing.xl)) }
                item {
                    TargetDistanceCard(distance = targetDistance, onDistanceChanged = { targetDistance = it.roundToInt().toFloat() })
                }
                item { Spacer(modifier = Modifier.height(Spacing.lg)) }
                item {
                    CompactTargetTimeSection(
                        isEnabled = isTargetTimeEnabled,
                        onEnabledChange = { isTargetTimeEnabled = it },
                        hours = targetHours, minutes = targetMinutes, seconds = targetSeconds,
                        onHoursChange = { if (it.length <= 2) targetHours = it },
                        onMinutesChange = { if (it.length <= 2) targetMinutes = it },
                        onSecondsChange = { if (it.length <= 2) targetSeconds = it },
                    )
                }
                item { Spacer(modifier = Modifier.height(Spacing.lg)) }
                item { AiCoachToggleSection(enabled = isAiCoachEnabled, onToggle = { isAiCoachEnabled = it }, mode = mode) }
                item { Spacer(modifier = Modifier.height(Spacing.lg)) }
                item {
                    GroupRunSection(
                        liveTrackingEnabled = isLiveTrackingEnabled,
                        onToggleLiveTracking = { isLiveTrackingEnabled = it },
                        liveTrackingObservers = liveTrackingObservers,
                        onObserversChanged = { liveTrackingObservers = it },
                        pendingEmail = liveTrackingPendingEmail,
                        onPendingEmailChange = { liveTrackingPendingEmail = it },
                        groupRunEnabled = isGroupRunEnabled,
                        onToggleGroupRun = { isGroupRunEnabled = it },
                        groupRunParticipants = groupRunParticipants,
                        onParticipantsChanged = { groupRunParticipants = it },
                        friends = emptyList(),
                        isLoadingFriends = false,
                    )
                }
            }

            // Fixed bottom CTA bar — identical structure to the real screen's.
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Colors.backgroundRoot)
                    .padding(Spacing.lg),
            ) {
                Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    val verb = if (activityMode == ActivityMode.WALK) "Walk" else "Run"
                    when {
                        mode == "route" -> {
                            val cta: @Composable () -> Unit = {
                                PrimaryCtaButton(
                                    text = if (gpsLocked) "GENERATE ROUTES" else "ACQUIRING GPS…",
                                    leadingIconRes = if (gpsLocked) R.drawable.icon_location_vector else null,
                                    enabled = gpsLocked,
                                    onClick = onProceed,
                                )
                            }
                            if (gpsLocked) TourHighlight(highlightColor = Colors.buttonText) { cta() } else cta()
                        }
                        hasWatch -> Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            Box(modifier = Modifier.weight(1f)) {
                                TourHighlight(highlightColor = Colors.buttonText) {
                                    PrepareRunOnWatchButton(
                                        companionInstalled = true,
                                        sendState = WatchSendState.IDLE,
                                        isPrimary = true,
                                        onPrepare = onProceed,
                                    )
                                }
                            }
                            Box(modifier = Modifier.weight(1f)) {
                                OutlinedCtaButton(
                                    text = if (gpsLocked) "Prepare $verb" else "GPS…",
                                    leadingIconRes = if (gpsLocked) R.drawable.icon_navigation_vector else null,
                                    enabled = gpsLocked,
                                    onClick = onProceed,
                                )
                            }
                        }
                        else -> {
                            val cta: @Composable () -> Unit = {
                                PrimaryCtaButton(
                                    text = if (gpsLocked) "PREPARE ${verb.uppercase()}" else "ACQUIRING GPS…",
                                    leadingIconRes = if (gpsLocked) R.drawable.icon_navigation_vector else null,
                                    enabled = gpsLocked,
                                    onClick = onProceed,
                                )
                            }
                            if (gpsLocked) TourHighlight(highlightColor = Colors.buttonText) { cta() } else cta()
                        }
                    }
                    Text(
                        text = "Target: ${targetDistance.roundToInt()} km",
                        style = AppTextStyles.caption, color = Colors.textMuted,
                        modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
        TourPromptBanner(
            when {
                !gpsLocked -> "Locking on to GPS, just like the real thing…"
                mode == "route" -> "Set your distance and preferences, then tap \"GENERATE ROUTES\"."
                hasWatch -> "Everything here is live — try it. Then tap \"Prepare for Watch\" (or \"Prepare Run\") to see what a finished run looks like."
                else -> "Everything here is live — try it. Then tap \"PREPARE RUN\" to see what a finished run looks like."
            }
        )
    }
}

// ── Run summary (the real screen's own tab contents, fed a fabricated run) ─────────────────

/**
 * Uses RunSummaryScreen.kt's real top bar and real tab contents (AiInsightsTabContent /
 * SummaryTabContent / GraphsTabContent / DataTabFlagship / AchievementsTabFlagship — all
 * `internal` for this purpose) driven by a fabricated but realistic [RunSession] from
 * [buildTourRun]: a full GPS loop near the user, km splits, HR/cadence per point, elevation,
 * in-run coaching notes and a pre-written coach debrief in place of the live AI analysis.
 * So the map card, stat grid, charts, splits table and Data tab are exactly what a real run
 * produces — the previous version was a hand-drawn list of seven label/value rows.
 *
 * All five tabs are explorable. The guided path is Data → "Download Run as .GPX" → "Upload to
 * Strava": the real Strava button just opens Strava's web uploader, which needs the .GPX
 * already on the device, so the tour teaches that order.
 */
@Composable
private fun MockRunSummaryScreen(onFinished: () -> Unit) {
    val location = rememberTourLocation()
    val run = remember(location) { buildTourRun(centerLat = location.first, centerLng = location.second) }
    val analysis = remember { AiAnalysisState.Freeform(markdown = TOUR_RUN_DEBRIEF, title = "Coach's Debrief") }
    var selectedTab by remember { mutableIntStateOf(0) }
    var comments by remember { mutableStateOf("") }
    var gpxDownloaded by remember { mutableStateOf(false) }
    // Tab indices with no Group Run / Dynamics tabs: Ai Insights, Summary, Graphs, Data, Badges.
    val dataTabIndex = 3

    Column(modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot)) {
        RunSummaryTopBarFlagship(
            title = run.name ?: "Run Insights",
            subtitle = "${run.getFormattedDate()} • ${SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(run.startTime))}",
            onBack = {}, onRename = {}, onShare = {},
            difficultyLabel = null,
        )
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when (selectedTab) {
                0 -> AiInsightsTabContent(
                    run = run, lastRunForDelta = null, analysisState = analysis,
                    comments = comments, onCommentsChange = { comments = it },
                    onGenerateAi = {}, coachingNotes = run.aiCoachingNotes,
                    onShareCard = {}, onDelete = {},
                    selectedTab = selectedTab, onTabSelected = { selectedTab = it },
                )
                1 -> SummaryTabContent(
                    run = run, lastRunForDelta = null, onDelete = {},
                    selectedTab = selectedTab, onTabSelected = { selectedTab = it },
                )
                2 -> GraphsTabContent(
                    run = run, onDelete = {},
                    selectedTab = selectedTab, onTabSelected = { selectedTab = it },
                )
                dataTabIndex -> DataTabFlagship(
                    run = run,
                    onDownloadGpx = { gpxDownloaded = true },
                    onDelete = {},
                    selectedTab = selectedTab, onTabSelected = { selectedTab = it },
                    onUploadToStrava = { if (gpxDownloaded) onFinished() },
                    downloadButtonModifier = if (gpxDownloaded) Modifier else Modifier.tourHighlight(),
                    stravaButtonModifier = if (gpxDownloaded) Modifier.tourHighlight() else Modifier,
                )
                else -> AchievementsTabFlagship(
                    run = run, analysisState = analysis, onDelete = {},
                    selectedTab = selectedTab, onTabSelected = { selectedTab = it },
                )
            }
        }
        TourPromptBanner(
            when {
                selectedTab != dataTabIndex -> "Every run gets this full breakdown — explore the tabs, then open \"Data\" to keep going."
                !gpxDownloaded -> "Scroll down: Strava needs the file on your device first — tap \"Download Run as .GPX\"."
                else -> "Now tap \"Upload to Strava\" — it opens Strava's uploader where you pick that .GPX file."
            }
        )
    }
}

/** Modifier form of [TourHighlight] for buttons that live inside real, non-tour composables. */
@Composable
private fun Modifier.tourHighlight(highlightColor: Color = Colors.primary): Modifier {
    val transition = rememberInfiniteTransition(label = "tourHighlightModifier")
    val alpha by transition.animateFloat(
        initialValue = 0.35f, targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(650), repeatMode = RepeatMode.Reverse),
        label = "tourHighlightModifierAlpha",
    )
    return this.border(BorderStroke(2.dp, highlightColor.copy(alpha = alpha)), RoundedCornerShape(BorderRadius.md))
}

// ── Route generation → route selection (real loading screen + real RouteCards) ─────────────

private enum class RouteGenState { GENERATING, SELECTING }

/**
 * What follows "GENERATE ROUTES" on the real app: RouteGeneratingLoadingScreen (the real
 * composable — it's ViewModel-free) for a few seconds, then RouteSelectionScreen's layout with
 * its real [RouteCard]s — live Google Maps tiles, gradient polyline, start/finish markers,
 * difficulty badge, distance/time/elevation stats — over three fabricated loops near the
 * user's location from [buildTourRoutes]. Selecting a card highlights it exactly as the real
 * screen does; the CTA row (Prepare for Watch / START RUN, or a single START RUN) advances.
 */
@Composable
private fun MockRouteGenerationStep(watchChoice: TourWatchChoice, onAdvance: () -> Unit) {
    val hasWatch = watchChoice != TourWatchChoice.PHONE_ONLY
    val location = rememberTourLocation()
    val routes = remember(location) { buildTourRoutes(centerLat = location.first, centerLng = location.second) }
    var state by remember { mutableStateOf(RouteGenState.GENERATING) }
    var selectedRouteId by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { delay(3200); state = RouteGenState.SELECTING }

    when (state) {
        RouteGenState.GENERATING -> RouteGeneratingLoadingScreen(distanceKm = 5.0)
        RouteGenState.SELECTING -> Column(modifier = Modifier.fillMaxSize().background(Color(0xFF0A1628))) {
            // Header — RouteSelectionScreen's TopAppBar, without its system-bar inset (the
            // outer MainScreen Scaffold already applies it).
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = {}) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Column {
                    Text("SELECT YOUR ROUTE", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
                    Text("Choose from ${routes.size} routes", style = MaterialTheme.typography.bodySmall, color = Color(0xFF8B9AA8))
                }
            }
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 132.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    for (difficulty in listOf(RouteDifficulty.EASY, RouteDifficulty.MODERATE, RouteDifficulty.HARD)) {
                        val group = routes.filter { it.difficulty == difficulty }
                        if (group.isEmpty()) continue
                        item { DifficultyHeader("${difficulty.name} ROUTES", Color(0xFFFFD700)) }
                        items(group) { route ->
                            RouteCard(route = route, isSelected = route.id == selectedRouteId, onSelect = { selectedRouteId = route.id })
                        }
                    }
                }
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xFF0A1628))))
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (hasWatch && selectedRouteId != null) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(modifier = Modifier.weight(1f)) {
                                TourHighlight(highlightColor = Colors.buttonText) {
                                    PrepareRunOnWatchButton(
                                        companionInstalled = true, sendState = WatchSendState.IDLE,
                                        isPrimary = true, onPrepare = onAdvance,
                                    )
                                }
                            }
                            Box(modifier = Modifier.weight(1f)) {
                                OutlinedCtaButton(text = "START RUN", leadingIconRes = null, enabled = true, onClick = onAdvance)
                            }
                        }
                    } else {
                        val startButton: @Composable () -> Unit = {
                            Button(
                                onClick = onAdvance,
                                enabled = selectedRouteId != null,
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E5FF), disabledContainerColor = Color(0xFF1A2634)),
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Text("START RUN", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = if (selectedRouteId != null) Color.Black else Color.Gray)
                            }
                        }
                        if (selectedRouteId != null) TourHighlight(highlightColor = Color.Black) { startButton() } else startButton()
                    }
                }
            }
            TourPromptBanner(
                when {
                    selectedRouteId == null -> "Three routes, three difficulties — tap one to select it."
                    hasWatch -> "Tap \"Prepare for Watch\" or \"START RUN\" and you'd be off. That's the last stop."
                    else -> "Tap \"START RUN\" and you'd be off. That's the last stop."
                }
            )
        }
    }
}

// ── Fabricated demo data ─────────────────────────────────────────────────────────────────────

/**
 * Best-effort centre for the demo map content: the device's last known location when we
 * already hold the permission (the tour runs after onboarding's permission step), otherwise a
 * fixed fallback so the maps still render something coherent. Never requests permission itself.
 */
@android.annotation.SuppressLint("MissingPermission") // checked explicitly just above the call
@Composable
private fun rememberTourLocation(): Pair<Double, Double> {
    val context = LocalContext.current
    var location by remember { mutableStateOf(TOUR_FALLBACK_LOCATION) }
    LaunchedEffect(Unit) {
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.ACCESS_FINE_LOCATION,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED ||
            androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.ACCESS_COARSE_LOCATION,
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (!granted) return@LaunchedEffect
        try {
            LocationServices.getFusedLocationProviderClient(context).lastLocation.addOnSuccessListener { loc ->
                if (loc != null) location = Pair(loc.latitude, loc.longitude)
            }
        } catch (e: Exception) {
            android.util.Log.w("OnboardingTourScreen", "Tour location lookup failed (non-fatal): ${e.message}")
        }
    }
    return location
}

// Hyde Park, London — only used when no last-known location is available.
private val TOUR_FALLBACK_LOCATION = Pair(51.5073, -0.1657)

/**
 * A closed loop of [count] lat/lng points around a centre whose perimeter is ~[distanceKm].
 * [wobble]/[lobes] bend the ellipse so the three demo routes aren't identical shapes.
 */
private fun tourLoop(
    centerLat: Double, centerLng: Double, distanceKm: Double,
    aspect: Double, lobes: Int, wobble: Double, rotation: Double, count: Int = 160,
): List<Pair<Double, Double>> {
    // Ramanujan's ellipse perimeter approximation, inverted for the semi-major axis.
    val b = 1.0 / aspect
    val perimeterUnit = PI * (3 * (1 + b) - sqrt((3 + b) * (1 + 3 * b)))
    val a = distanceKm / perimeterUnit
    val kmPerDegLat = 111.32
    val kmPerDegLng = 111.32 * cos(Math.toRadians(centerLat))
    val open = (0 until count).map { i ->
        val t = 2 * PI * i / count
        val r = 1 + wobble * sin(lobes * t)
        val x = a * cos(t) * r
        val y = a * b * sin(t) * r
        val xr = x * cos(rotation) - y * sin(rotation)
        val yr = x * sin(rotation) + y * cos(rotation)
        Pair(centerLat + yr / kmPerDegLat, centerLng + xr / kmPerDegLng)
    }
    return open + open.first() // close the loop so start and finish markers coincide
}

/** 6.42 km / 32:10 easy-tempo loop — the run the summary demo shows. */
private fun buildTourRun(centerLat: Double, centerLng: Double): RunSession {
    val distanceM = 6420.0
    val durationMs = 32L * 60_000 + 10_000
    val start = System.currentTimeMillis() - 2L * 60 * 60 * 1000
    val loop = tourLoop(centerLat, centerLng, distanceM / 1000.0, aspect = 1.6, lobes = 3, wobble = 0.10, rotation = 0.4)
    val n = loop.size
    val points = loop.mapIndexed { i, (lat, lng) ->
        val f = i.toDouble() / (n - 1)
        // Gentle negative split with two short climbs; HR drifts up, cadence steady.
        val speed = (3.25 + 0.18 * f - 0.22 * sin(2 * PI * f * 2).coerceAtLeast(0.0)).toFloat()
        LocationPoint(
            latitude = lat, longitude = lng,
            timestamp = start + (durationMs * f).toLong(),
            speed = speed,
            altitude = 38.0 + 11.0 * sin(2 * PI * f * 2) + 6.0 * sin(2 * PI * f * 5),
            heartRate = (138 + 16 * f + 6 * sin(2 * PI * f * 2)).roundToInt(),
            cadence = (170 + 3 * sin(2 * PI * f * 3)).roundToInt(),
        )
    }
    val splitPaces = listOf("5:08", "5:04", "5:02", "4:58", "5:05", "4:56")
    val splits = splitPaces.mapIndexed { i, pace ->
        val (m, sec) = pace.split(":").map { it.toInt() }
        KmSplit(km = i + 1, time = (m * 60 + sec) * 1000L, pace = pace)
    }
    return RunSession(
        id = "tour-demo-run",
        startTime = start,
        endTime = start + durationMs,
        duration = durationMs,
        distance = distanceM,
        averageSpeed = (distanceM / (durationMs / 1000.0)).toFloat(),
        maxSpeed = 3.9f,
        averagePace = "5:01",
        calories = 412,
        cadence = 172,
        heartRate = 148,
        routePoints = points,
        kmSplits = splits,
        weatherAtStart = null,
        weatherAtEnd = null,
        totalElevationGain = 48.0,
        totalElevationLoss = 46.0,
        averageGradient = 0.8f,
        maxGradient = 4.2f,
        terrainType = TerrainType.FLAT,
        routeHash = null,
        routeName = null,
        name = "Morning Run",
        difficulty = "easy",
        maxCadence = 178,
        minHeartRate = 121,
        totalSteps = 5530,
        aiCoachingNotes = listOf(
            AiCoachingNote(time = 4L * 60_000 + 30_000, message = "Nice and relaxed through the first kilometre — you're bang on your target pace."),
            AiCoachingNote(time = 13L * 60_000 + 10_000, message = "Short climb coming up. Shorten your stride, keep the cadence, and let the pace drift a touch."),
            AiCoachingNote(time = 21L * 60_000 + 45_000, message = "Heart rate's crept into zone 3 — that's fine for today. Breathe out long and stay smooth."),
            AiCoachingNote(time = 29L * 60_000 + 20_000, message = "Final kilometre. You've got plenty left — pick it up gently to the finish."),
        ),
    )
}

private const val TOUR_RUN_DEBRIEF = """
**Great session.** You held 5:01/km across 6.42 km with a slight negative split — the last two kilometres were your fastest, which tells me you paced the first half sensibly.

**What went well**
- Cadence sat at 170–175 spm the whole way, including both climbs
- Heart rate climbed steadily from zone 2 into low zone 3 without any spikes
- Your fastest kilometre (4:56) came at the end, not the start

**One thing to work on**
Both short climbs cost you ~10 s/km more than they needed to. Next time, ease off a fraction earlier at the base and let the effort — not the pace — stay constant.

**Next up**
Recover tomorrow, then we'll build on this with a slightly longer easy run.
"""

/** Three 5 km-ish loops of increasing difficulty near the centre — feeds the real [RouteCard]s. */
private fun buildTourRoutes(centerLat: Double, centerLng: Double): List<GeneratedRoute> {
    fun route(
        id: String, name: String, distanceKm: Double, difficulty: RouteDifficulty,
        gain: Double, loss: Double, incline: Double, decline: Double, template: String,
        aspect: Double, lobes: Int, wobble: Double, rotation: Double, offsetLatKm: Double, offsetLngKm: Double,
    ): GeneratedRoute {
        val kmPerDegLat = 111.32
        val kmPerDegLng = 111.32 * cos(Math.toRadians(centerLat))
        val loop = tourLoop(
            centerLat + offsetLatKm / kmPerDegLat, centerLng + offsetLngKm / kmPerDegLng,
            distanceKm, aspect, lobes, wobble, rotation, count = 120,
        )
        val gms = loop.map { (lat, lng) -> com.google.android.gms.maps.model.LatLng(lat, lng) }
        val minutes = distanceKm * 5.3
        return GeneratedRoute(
            id = id, name = name, distance = distanceKm, duration = minutes,
            polyline = PolyUtil.encode(gms),
            waypoints = listOf(LatLng(loop.first().first, loop.first().second)),
            difficulty = difficulty,
            elevationGain = gain, elevationLoss = loss,
            maxInclineDegrees = incline, maxDeclineDegrees = decline,
            instructions = emptyList(), turnInstructions = emptyList(),
            backtrackRatio = 0.05, angularSpread = 340.0,
            templateName = template,
        )
    }
    return listOf(
        route("tour-route-easy", "Park Loop", 5.1, RouteDifficulty.EASY, 22.0, 21.0, 1.8, 2.1, "Park Loop",
            aspect = 1.4, lobes = 2, wobble = 0.08, rotation = 0.2, offsetLatKm = 0.0, offsetLngKm = 0.0),
        route("tour-route-moderate", "Riverside Circuit", 5.3, RouteDifficulty.MODERATE, 64.0, 62.0, 4.9, 5.4, "Riverside Circuit",
            aspect = 2.1, lobes = 3, wobble = 0.12, rotation = 1.1, offsetLatKm = 0.35, offsetLngKm = -0.4),
        route("tour-route-hard", "Hill Climb Loop", 5.6, RouteDifficulty.HARD, 148.0, 146.0, 9.7, 11.2, "Hill Climb Loop",
            aspect = 1.2, lobes = 4, wobble = 0.15, rotation = 2.3, offsetLatKm = -0.5, offsetLngKm = 0.3),
    )
}

private enum class AiPlansStepState { EMPTY, GENERATING, READY }

@Composable
private fun MockAiPlansScreen(onAdvance: () -> Unit) {
    var state by remember { mutableStateOf(AiPlansStepState.EMPTY) }
    LaunchedEffect(state) {
        if (state == AiPlansStepState.GENERATING) {
            delay(1200)
            state = AiPlansStepState.READY
        }
    }
    Column(modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot)) {
        Row(modifier = Modifier.fillMaxWidth().padding(Spacing.lg), verticalAlignment = Alignment.CenterVertically) {
            Text("Coaching Programme", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when (state) {
                AiPlansStepState.EMPTY -> {
                    // The real empty state (NoPlanState from CoachingProgrammeScreen.kt) — a
                    // new onboarding user genuinely has no plan yet, so this is exactly what
                    // they'd see on the real AI Plans tab, not an approximation of it.
                    TourHighlight(modifier = Modifier.fillMaxSize()) {
                        NoPlanState(onCreatePlan = { state = AiPlansStepState.GENERATING })
                    }
                }
                AiPlansStepState.GENERATING -> {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator(color = Colors.primary)
                        Spacer(modifier = Modifier.height(Spacing.lg))
                        Text("Generating your training plan…", style = AppTextStyles.body, color = Colors.textSecondary, textAlign = TextAlign.Center)
                    }
                }
                AiPlansStepState.READY -> {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Box(
                            modifier = Modifier.size(96.dp).background(Colors.primary.copy(alpha = 0.12f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Psychology, contentDescription = null, tint = Colors.primary, modifier = Modifier.size(44.dp))
                        }
                        Spacer(modifier = Modifier.height(Spacing.xl))
                        Text("Your Plan Is Ready", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Colors.textPrimary, textAlign = TextAlign.Center)
                        Spacer(modifier = Modifier.height(Spacing.md))
                        Text(
                            "Built around your goal, fitness level, and schedule — and it adjusts automatically as your training progresses.",
                            fontSize = 15.sp, color = Colors.textSecondary, textAlign = TextAlign.Center, lineHeight = 22.sp,
                        )
                        Spacer(modifier = Modifier.height(Spacing.xl))
                        TourHighlight {
                            Button(
                                onClick = onAdvance,
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary, contentColor = Colors.buttonText),
                                shape = RoundedCornerShape(BorderRadius.lg),
                            ) {
                                Text("Continue", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            }
                        }
                    }
                }
            }
        }
        TourPromptBanner(
            when (state) {
                AiPlansStepState.EMPTY -> "Tap \"Generate My Training Plan\" to see your AI Coach build one."
                AiPlansStepState.GENERATING -> "Your AI Coach is putting your plan together…"
                AiPlansStepState.READY -> "Tap Continue — one more thing to show you."
            }
        )
    }
}

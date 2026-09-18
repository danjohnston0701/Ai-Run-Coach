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
import androidx.compose.foundation.lazy.rememberLazyListState
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
import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LatLng
import live.airuncoach.airuncoach.domain.model.LocationPoint
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
 * mocks as nothing like the real screens): both now compose the REAL screens' own building
 * blocks — MapMyRunSetupScreen's section composables, RunSummaryScreen's top bar + tab
 * contents — fed fabricated-but-realistic data (a full GPS loop near the user, splits, HR,
 * coaching notes). See MockRunSetupScreen and MockRunSummaryScreen. The tour ends on a
 * "Finish Tour" page.
 *
 * Third pass (2026-09-14): the Run With Route sequence (Dashboard → setup → generating →
 * route selection) was REMOVED. It drew three fabricated loops — a parametric ellipse with a
 * sine wobble — over genuine map tiles, and read as exactly what it was. The step is better
 * spent slowing down on Run Without a Route and actually showing what the setup screen can
 * do: MockRunSetupScreen now walks target time, in-run AI coaching, group runs and live
 * tracking, pulsing each control and scrolling it into view. Route generation is still
 * mentioned in the closing page's copy. Kept 1:1 with iOS's OnboardingTourScreen.swift.
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

/** Step 0 is the watch-choice screen; the paged tour is 1..TOUR_TOTAL_STEPS. */
private const val TOUR_TOTAL_STEPS = 2 + 10 + 1 // leadPages + INTERACTIVE_STEP_COUNT + tailPages
private const val TOUR_WATCH_CHOICE_STEP = 0

/**
 * Stable page names sent with each tour event so "furthest step" reads as a screen, not a
 * number. Keep in lockstep with leadPages()/InteractiveStep()/tailPages() and with the iOS
 * `tourStepName` — the two apps share the same 12-page tour.
 */
private fun tourStepName(step: Int): String = when (step) {
    TOUR_WATCH_CHOICE_STEP -> "watch_choice"
    1 -> "goals_intro"
    2 -> "ai_plans_intro"
    3 -> "dashboard_profile_tab"
    4 -> "profile_connected_devices"
    5 -> "connected_devices"
    6 -> "profile_injuries"
    7 -> "injury_management"
    8 -> "dashboard_run_without_route"
    9 -> "run_setup"
    10 -> "run_session"
    11 -> "run_summary"
    12 -> "ai_plans"
    13 -> "ready_to_run"
    else -> "step_$step"
}

/**
 * Fire-and-forget tour telemetry. Uses its own IO scope rather than a composable's, because the
 * "left" and "skipped" events are sent as the screen is going away and must outlive it.
 * Non-fatal: tracking must never block or crash the tour itself.
 */
private fun recordTourEvent(event: String, step: Int? = null) {
    // Pre-login preview: there's no user to attribute the event to and the endpoint is
    // authenticated, so don't fire (it would only 401 and be dropped anyway).
    if (!tourTelemetryEnabled) return
    kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
        try {
            live.airuncoach.airuncoach.network.RetrofitClient.apiService.recordOnboardingTourEvent(
                live.airuncoach.airuncoach.network.model.OnboardingTourEventRequest(
                    event = event,
                    step = step,
                    totalSteps = TOUR_TOTAL_STEPS,
                    stepName = step?.let(::tourStepName),
                )
            )
        } catch (e: Exception) {
            android.util.Log.w("OnboardingTourScreen", "Failed to record tour '$event' (non-fatal): ${e.message}")
        }
    }
}

/**
 * Process-wide switch for the tour's telemetry + authenticated fetches, set by [OnboardingTourScreen]
 * from its `isPreLogin` flag. Module-level rather than threaded through every mock screen because
 * recordTourEvent() is deliberately scope-free (see its doc) and has no composable context.
 */
@Volatile
private var tourTelemetryEnabled = true

@Composable
fun OnboardingTourScreen(
    onFinish: () -> Unit,
    /**
     * True when reached from the fresh-install welcome (RootNavigationGraph's
     * "onboarding_tour_preview") rather than from a signed-in session: no telemetry, no
     * authenticated fetches, and the closing page's CTA becomes "Create a Free Account"
     * ([onCreateAccount]) instead of "Finish Tour".
     */
    isPreLogin: Boolean = false,
    onCreateAccount: () -> Unit = onFinish,
) {
    tourTelemetryEnabled = !isPreLogin
    var watchChoice by remember { mutableStateOf<TourWatchChoice?>(null) }
    // Where the user currently is, for the "left" event below. 0 until a watch is chosen.
    var currentStep by remember { mutableIntStateOf(TOUR_WATCH_CHOICE_STEP) }

    // Fires once, on first composition — "started" means the tour screen was actually reached,
    // not just the "Take a tour" button tapped (permission/consent steps can intervene between
    // the tap and this screen mounting). Server preserves the first occurrence, so this is safe
    // to call every time the screen mounts.
    LaunchedEffect(Unit) { recordTourEvent("started", TOUR_WATCH_CHOICE_STEP) }

    // "left": the app was backgrounded or closed mid-tour. ON_STOP fires for home/recents/
    // swipe-away (a hard kill can pre-empt the request — the server then shows the last
    // 'step' with no completion, which reads the same way). Disposed when the tour finishes,
    // so completing or skipping never also reports a "left".
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_STOP) recordTourEvent("left", currentStep)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    if (watchChoice == null) {
        WatchChoiceScreen(
            onChoose = { watchChoice = it },
            onSkip = {
                recordTourEvent("skipped", TOUR_WATCH_CHOICE_STEP)
                onFinish()
            },
        )
    } else {
        TourStepController(
            watchChoice = watchChoice!!,
            onStepShown = { currentStep = it },
            onFinish = onFinish,
            isPreLogin = isPreLogin,
            onCreateAccount = onCreateAccount,
        )
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
private const val INTERACTIVE_STEP_COUNT = 10

@Composable
private fun TourStepController(
    watchChoice: TourWatchChoice,
    /** Reports the 1-based tour page now on screen (for the parent's "left" tracking). */
    onStepShown: (Int) -> Unit,
    onFinish: () -> Unit,
    isPreLogin: Boolean = false,
    onCreateAccount: () -> Unit = onFinish,
) {
    val context = LocalContext.current
    val lead = remember { leadPages() }
    val tail = remember { tailPages() }
    val totalSteps = lead.size + INTERACTIVE_STEP_COUNT + tail.size
    var step by remember { mutableIntStateOf(0) }

    // One "step" event per page shown (step is 0-based here, 1-based on the wire — 0 is the
    // watch-choice screen). This is what answers "how far did they get?".
    LaunchedEffect(step) {
        onStepShown(step + 1)
        recordTourEvent("step", step + 1)
    }

    fun advance() {
        if (step >= totalSteps - 1) {
            AppAnalytics.logEvent(context, AppAnalytics.Event.ONBOARDING_TOUR_COMPLETED)
            if (isPreLogin) {
                // Preview from the fresh-install welcome: the natural end is the sign-up
                // form. Don't mark the (not-yet-existing) account's tour as completed — the
                // real post-onboarding tour offer should still stand once they have one.
                onCreateAccount()
                return
            }
            // Only fires on reaching the natural end (this branch) — never on Skip — so
            // the completed timestamp genuinely means "finished the tour," not "opened it."
            SessionManager(context).setOnboardingTourCompleted()
            recordTourEvent("completed", totalSteps)
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
                recordTourEvent("skipped", step + 1)
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
                    InfoPageContent(
                        tail[tailIndex], onNext = ::advance, isLast = step == totalSteps - 1,
                        lastLabel = if (isPreLogin) "Create a Free Account" else "Finish Tour",
                    )
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
private fun InfoPageContent(page: InfoPage, onNext: () -> Unit, isLast: Boolean, lastLabel: String = "Finish Tour") {
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
            Text(if (isLast) lastLabel else "Next", fontWeight = FontWeight.Bold, fontSize = 16.sp)
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
        6 -> MockRunSetupScreen(watchChoice = watchChoice, onProceed = onAdvance)
        7 -> MockRunSessionScreen(onFinished = onAdvance)
        8 -> MockRunSummaryScreen(onFinished = onAdvance)
        9 -> MockAiPlansScreen(onAdvance = onAdvance)
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

/** [TourHighlight] when [active], otherwise the content untouched — keeps call sites flat. */
@Composable
private fun TourHighlightIf(active: Boolean, content: @Composable () -> Unit) {
    if (active) TourHighlight { content() } else content()
}

/**
 * Prompt banner that also advances a multi-beat step (the Run Without a Route walkthrough).
 * Separate from [TourPromptBanner] so the plain banner stays exactly as it is everywhere else.
 */
@Composable
private fun TourPromptBannerWithNext(text: String, nextLabel: String, onNext: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Colors.primary,
        shape = RoundedCornerShape(topStart = BorderRadius.lg, topEnd = BorderRadius.lg),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            Text(
                text = text,
                style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.buttonText,
                modifier = Modifier.weight(1f),
            )
            Button(
                onClick = onNext,
                colors = ButtonDefaults.buttonColors(containerColor = Colors.buttonText),
                shape = RoundedCornerShape(percent = 50),
                contentPadding = PaddingValues(horizontal = Spacing.md, vertical = 6.dp),
            ) {
                Text(
                    text = nextLabel,
                    style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary,
                )
            }
        }
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

private enum class DashboardHighlight { PROFILE_TAB, RUN_WITHOUT_ROUTE }

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
                        onMapMyRun = {},
                        onRunWithoutRoute = { if (highlight == DashboardHighlight.RUN_WITHOUT_ROUTE) onHighlightTapped() },
                        isEnabled = true,
                    )
                }
                if (highlight == DashboardHighlight.RUN_WITHOUT_ROUTE) {
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
/**
 * Walks the four things this screen can do — target time, in-run AI coaching, group runs,
 * live tracking — pulsing each control and scrolling it into view, with a line of copy
 * explaining it. Previously this rendered once with a banner reading "Everything here is
 * live — try it", which told a new user nothing about what was on the screen. The user can
 * still touch anything at any point; Next just moves the spotlight on. The final beat drops
 * the highlight and points at the CTA.
 *
 * No "invite a friend" beat: the tour has no friends list (a brand-new user has none), so the
 * copy describes what the toggles do rather than asking the user to pick someone.
 */
private enum class SetupHighlight { TARGET_TIME, AI_COACH, GROUP_RUN, LIVE_TRACKING }

/**
 * Beat copy + which control it points at, in the order the tour walks them.
 *
 * Order follows the screen top-to-bottom (target time → AI coach → GroupRunSection's Live
 * Tracking row then its Group Session row) so the spotlight only ever moves downward. iOS's
 * setup screen orders its sections differently and its beats follow ITS layout — the two
 * lists deliberately don't match, since no one sees both and a jumping spotlight is worse
 * than cross-platform beat parity nobody can observe.
 */
private val setupBeats: List<Pair<SetupHighlight, String>> = listOf(
    SetupHighlight.TARGET_TIME to
        "Set a target time and your coach paces you to it — you'll hear how far ahead or behind you are as you run.",
    SetupHighlight.AI_COACH to
        "In-run AI coaching, on or off. Leave it on for live cues on pace, heart rate and form; switch it off for a quiet run.",
    SetupHighlight.LIVE_TRACKING to
        "Live Tracking shares your run as it happens. Invite friends by email and they can follow you on a map, no account needed.",
    SetupHighlight.GROUP_RUN to
        "Turn any run into a group session — everyone runs their own route, and you all see each other's progress in real time.",
)

@Composable
private fun MockRunSetupScreen(watchChoice: TourWatchChoice, onProceed: () -> Unit) {
    val hasWatch = watchChoice != TourWatchChoice.PHONE_ONLY
    var beat by remember { mutableIntStateOf(0) }
    val isLastBeat = beat >= setupBeats.size
    val highlight = if (isLastBeat) null else setupBeats[beat].first
    val listState = rememberLazyListState()

    // Scroll the control being called out into view. These indices are the LazyColumn item
    // positions below — the four controls sit well below the fold on a phone, so a pulse the
    // user can't see would be useless. Live Tracking and Group Run share one item (they're
    // both rows of GroupRunSection's card), hence the same index for both.
    LaunchedEffect(beat) {
        val index = when (highlight) {
            SetupHighlight.TARGET_TIME -> 7
            SetupHighlight.AI_COACH -> 9
            SetupHighlight.GROUP_RUN, SetupHighlight.LIVE_TRACKING -> 11
            null -> return@LaunchedEffect
        }
        listState.animateScrollToItem(index)
    }
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
    val title = "CONFIGURE YOUR $activityTypeLabel"
    val subtitle = "Set your ${activityTypeLabel.lowercase()} details"

    Column(modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot)) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            LazyColumn(
                state = listState,
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
                    TourHighlightIf(highlight == SetupHighlight.TARGET_TIME) {
                    CompactTargetTimeSection(
                        isEnabled = isTargetTimeEnabled,
                        onEnabledChange = { isTargetTimeEnabled = it },
                        hours = targetHours, minutes = targetMinutes, seconds = targetSeconds,
                        onHoursChange = { if (it.length <= 2) targetHours = it },
                        onMinutesChange = { if (it.length <= 2) targetMinutes = it },
                        onSecondsChange = { if (it.length <= 2) targetSeconds = it },
                    )
                    }
                }
                item { Spacer(modifier = Modifier.height(Spacing.lg)) }
                item {
                    TourHighlightIf(highlight == SetupHighlight.AI_COACH) {
                        AiCoachToggleSection(enabled = isAiCoachEnabled, onToggle = { isAiCoachEnabled = it }, mode = "no_route")
                    }
                }
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
                        // The two rows live inside GroupRunSection's shared card, so they take
                        // the pulse as a Modifier rather than being wrapped from out here.
                        liveTrackingRowModifier = if (highlight == SetupHighlight.LIVE_TRACKING)
                            Modifier.tourHighlight() else Modifier,
                        groupRunRowModifier = if (highlight == SetupHighlight.GROUP_RUN)
                            Modifier.tourHighlight() else Modifier,
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
        if (isLastBeat) {
            TourPromptBanner(
                when {
                    !gpsLocked -> "Locking on to GPS, just like the real thing…"
                    hasWatch -> "That's the setup screen. Tap \"Prepare for Watch\" (or \"Prepare Run\") to open the run screen."
                    else -> "That's the setup screen. Tap \"PREPARE RUN\" to open the run screen."
                }
            )
        } else {
            TourPromptBannerWithNext(
                text = setupBeats[beat].second,
                nextLabel = if (beat == setupBeats.size - 1) "Got it" else "Next",
                onNext = { beat += 1 },
            )
        }
    }
}

// ── Run session (the real run screen's own instruments, driven by a genuine timer) ─────────

private enum class MockRunPhase { PREPARING, BRIEFED, RUNNING, PAUSED, SAVING }

/** Simulated steady effort for the instruments while the (real) timer runs. */
private const val TOUR_RUN_PACE_SEC_PER_KM = 330 // 5:30/km

/** Fired once, a few seconds into the run, so the in-run coaching panel is seen too. */
private const val TOUR_RUN_FIRST_CUE_AT_SEC = 6
private const val TOUR_RUN_FIRST_CUE =
    "Nice and steady — that's the pace. Drop your shoulders, quick light steps, and settle in. I'll call your split at the first kilometre."

/**
 * The REAL run screen's building blocks — RunSessionScreen.kt's TopBarSection,
 * AiCoachLivePanel, FreeRunEliteDashboard, ControlButtons and RunSavingOverlay — with the
 * ViewModel replaced by a small state machine that walks the phone-prepared session exactly
 * as a runner experiences it:
 *
 *  1. "Coach is preparing…" (the panel's real loading state), then the pre-run brief text
 *     a phone-prepared session shows before Start.
 *  2. Start Run → a genuine wall-clock timer in the real dashboard; distance/pace/cadence/HR
 *     are simulated at a steady 5:30/km so the instruments come alive. Pause/Resume work.
 *  3. An in-run coaching cue lands a few seconds in, then Stop is spotlit → the real
 *     "Stop run?" confirmation → the real saving overlay → the Run Summary step.
 *
 * Added 2026-09-19 so the tour shows the prepare → run → summary flow end-to-end (it used
 * to jump from the setup screen straight to a finished run). Not on iOS yet.
 */
@Composable
private fun MockRunSessionScreen(onFinished: () -> Unit) {
    val context = LocalContext.current
    val firstName = remember {
        SessionManager(context).getUserName()?.trim()?.takeIf { it.isNotBlank() }?.substringBefore(' ')
    }
    var phase by remember { mutableStateOf(MockRunPhase.PREPARING) }
    var elapsedSec by remember { mutableIntStateOf(0) }
    var coachMessage by remember { mutableStateOf<String?>(null) }
    var showStopConfirm by remember { mutableStateOf(false) }
    var showPauseConfirm by remember { mutableStateOf(false) }
    var cueFired by remember { mutableStateOf(false) }

    // The same generic brief RunSessionViewModel shows for a phone-prepared session with no
    // coaching-plan brief (weather + distance + "tap Start"), personalised the same way.
    val briefText = remember {
        val greeting = if (firstName != null) "Right, $firstName —" else "Right —"
        "$greeting 5 km easy run today. GPS is locked and I'm with you the whole way: I'll call your pace each kilometre, " +
            "check in at halfway, and let you know if you're drifting off target. Tap Start when you're ready."
    }

    // 1. Preparing → briefed, mirroring the real screen's "Coach is preparing…" wait.
    LaunchedEffect(Unit) {
        delay(2200)
        coachMessage = briefText
        phase = MockRunPhase.BRIEFED
    }

    // 2. Genuine timer — one tick per wall-clock second while running.
    LaunchedEffect(phase) {
        if (phase != MockRunPhase.RUNNING) return@LaunchedEffect
        while (true) {
            delay(1000)
            elapsedSec += 1
            if (!cueFired && elapsedSec >= TOUR_RUN_FIRST_CUE_AT_SEC) {
                cueFired = true
                coachMessage = TOUR_RUN_FIRST_CUE
            }
        }
    }

    // 3. Saving → summary, through the real overlay for the same beat a real save takes.
    LaunchedEffect(phase) {
        if (phase == MockRunPhase.SAVING) {
            delay(1800)
            onFinished()
        }
    }

    val isRunning = phase == MockRunPhase.RUNNING
    val isPaused = phase == MockRunPhase.PAUSED
    val isSaving = phase == MockRunPhase.SAVING
    val timeStr = String.format(Locale.US, "%02d:%02d", elapsedSec / 60, elapsedSec % 60)
    val distanceKm = elapsedSec.toDouble() / TOUR_RUN_PACE_SEC_PER_KM
    val distanceStr = String.format(Locale.US, "%.2f", distanceKm)
    val hasMoved = elapsedSec > 0
    val paceStr = if (hasMoved) "5:30" else "0:00"
    // Small live wobble so the instant pace / cadence / HR read as live sensors, not labels.
    val wobble = if (hasMoved) ((elapsedSec * 7) % 5) - 2 else 0
    val currentPaceStr = if (hasMoved) {
        val sec = TOUR_RUN_PACE_SEC_PER_KM + wobble * 2
        String.format(Locale.US, "%d:%02d", sec / 60, sec % 60)
    } else "0:00"
    val cadenceStr = if (hasMoved) "${170 + wobble}" else "0"
    val heartRateStr = if (hasMoved) "${minOf(152, 118 + elapsedSec * 2) + wobble}" else "0"
    val highlightStop = isRunning && cueFired

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = Colors.backgroundRoot,
            contentWindowInsets = WindowInsets(0),
            bottomBar = {
                Column {
                    // The real bottom bar; Stop gets the spotlight once the coaching cue
                    // has landed, so the runner sees the whole in-run beat first.
                    val bar: @Composable () -> Unit = {
                        ControlButtons(
                            isRunning = isRunning,
                            isPaused = isPaused,
                            isStopping = isSaving,
                            onStart = { if (phase == MockRunPhase.BRIEFED) phase = MockRunPhase.RUNNING },
                            onPause = { showPauseConfirm = true },
                            onResume = { phase = MockRunPhase.RUNNING },
                            onStop = { showStopConfirm = true },
                            onCancel = {},
                        )
                    }
                    if (highlightStop) TourHighlight { bar() } else if (phase == MockRunPhase.BRIEFED) {
                        TourHighlight(highlightColor = Colors.buttonText) { bar() }
                    } else bar()
                    TourPromptBanner(
                        when (phase) {
                            MockRunPhase.PREPARING -> "This is your run screen. When you prepare a session on your phone, your coach gets ready first…"
                            MockRunPhase.BRIEFED -> "Your coach briefs you before every run — this is what they'll say. Tap \"Start Run\" to begin."
                            MockRunPhase.RUNNING -> if (!cueFired)
                                "That's a real timer. Time, distance, pace, cadence and heart rate all live here while you run."
                            else
                                "Coaching cues land here mid-run, spoken in your ear. Tap Stop when you're ready to see your run summary."
                            MockRunPhase.PAUSED -> "Paused — tap Resume to keep going, or Stop to finish and see your summary."
                            MockRunPhase.SAVING -> "Saving your run…"
                        }
                    )
                }
            },
        ) { padding ->
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(bottom = Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                item {
                    TopBarSection(
                        isCoachEnabled = true,
                        isMuted = false,
                        actionsEnabled = !(isRunning || isPaused),
                        micEnabled = true,
                        onCoachToggle = {},
                        onMicClick = {},
                        onShareClick = {},
                        onCloseClick = {},
                    )
                }
                item {
                    AiCoachLivePanel(
                        message = coachMessage,
                        isLoading = phase == MockRunPhase.PREPARING,
                        modifier = Modifier.padding(horizontal = Spacing.md),
                    )
                }
                item {
                    FreeRunEliteDashboard(
                        time = timeStr,
                        distanceKmStr = distanceStr,
                        paceStr = paceStr,
                        currentPaceStr = currentPaceStr,
                        cadenceStr = cadenceStr,
                        heartRateStr = heartRateStr,
                        aiCoachMessage = null,
                        aiSpeaking = coachMessage != null || phase == MockRunPhase.PREPARING,
                        isRunning = isRunning,
                        isLoadingBriefing = phase == MockRunPhase.PREPARING,
                    )
                }
            }
        }

        if (isSaving) RunSavingOverlay()
    }

    // The real screen's own confirmations, so the flow matches what a runner will meet.
    if (showPauseConfirm) {
        AlertDialog(
            onDismissRequest = { showPauseConfirm = false },
            title = { Text("Pause run?") },
            text = { Text("This will pause tracking until you resume.") },
            confirmButton = {
                TextButton(onClick = { showPauseConfirm = false; phase = MockRunPhase.PAUSED }) { Text("Pause") }
            },
            dismissButton = { TextButton(onClick = { showPauseConfirm = false }) { Text("Cancel") } },
        )
    }
    if (showStopConfirm) {
        AlertDialog(
            onDismissRequest = { showStopConfirm = false },
            title = { Text("Stop run?") },
            text = { Text("This will end the session and save your run.") },
            confirmButton = {
                TextButton(onClick = { showStopConfirm = false; phase = MockRunPhase.SAVING }) { Text("Stop") }
            },
            dismissButton = { TextButton(onClick = { showStopConfirm = false }) { Text("Cancel") } },
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
    // Genuine run from the backend (see loadTourDemoRun); null while loading, during which the
    // real screen's own centred spinner is shown — exactly what a real open looks like.
    var demo by remember { mutableStateOf<TourDemoRun?>(null) }
    LaunchedEffect(Unit) { demo = loadTourDemoRun(fallbackCenter = location) }
    val loaded = demo
    if (loaded == null) {
        Box(modifier = Modifier.fillMaxSize().background(Colors.backgroundRoot), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Colors.primary)
        }
        return
    }
    val run = loaded.run
    val analysis = loaded.analysis
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

// ── Demo run: genuine record from the backend, fabricated fallback ──────────────────────────

private data class TourDemoRun(val run: RunSession, val analysis: AiAnalysisState)

/**
 * The run the summary step shows. Preferred source is the genuine run the backend designates
 * for the tour (GET /api/onboarding-tour/demo-run — a real Garmin-recorded 5 km with GPS, HR,
 * splits and a saved AI analysis). Until that endpoint is deployed, the same run is fetched
 * directly by ID (GET /api/runs/{id} currently doesn't enforce ownership). Only when both fail
 * (offline) does the tour fall back to the locally fabricated run, so the step never dead-ends.
 */
private const val TOUR_DEMO_RUN_ID = "09b2fa5f-1b16-4de3-a89a-85129644a9c8"

private suspend fun loadTourDemoRun(fallbackCenter: Pair<Double, Double>): TourDemoRun {
    val api = live.airuncoach.airuncoach.network.RetrofitClient.apiService
    // Both endpoints are authenticated — pre-login they'd just 401 twice before falling
    // through, so go straight to the fabricated run.
    if (tourTelemetryEnabled) try {
        val response = api.getOnboardingTourDemoRun()
        return TourDemoRun(response.run, parseTourAnalysis(response.analysis))
    } catch (e: Exception) {
        android.util.Log.w("OnboardingTourScreen", "Demo-run endpoint unavailable, trying direct fetch: ${e.message}")
    }
    if (tourTelemetryEnabled) try {
        val run = api.getRunById(TOUR_DEMO_RUN_ID)
        val analysis = try { api.getRunAnalysisRecord(TOUR_DEMO_RUN_ID)?.analysis } catch (e: Exception) { null }
        return TourDemoRun(run, parseTourAnalysis(analysis))
    } catch (e: Exception) {
        android.util.Log.w("OnboardingTourScreen", "Demo run fetch failed, using fabricated run: ${e.message}")
    }
    return TourDemoRun(
        run = buildTourRun(centerLat = fallbackCenter.first, centerLng = fallbackCenter.second),
        analysis = AiAnalysisState.Freeform(markdown = TOUR_RUN_DEBRIEF, title = "Coach's Debrief"),
    )
}

/** Same freeform / comprehensive / basic detection RunSummaryViewModel.loadSavedAnalysis applies. */
private fun parseTourAnalysis(json: com.google.gson.JsonElement?): AiAnalysisState {
    if (json == null || !json.isJsonObject) return AiAnalysisState.Idle
    return try {
        var obj = json.asJsonObject
        if (obj.has("freeform") && obj.get("freeform").asBoolean) {
            val markdown = obj.get("markdown")?.asString ?: return AiAnalysisState.Idle
            return AiAnalysisState.Freeform(markdown, obj.get("title")?.asString)
        }
        if (!obj.has("performanceScore") && !obj.has("overallScore") && obj.has("analysis") && obj.get("analysis").isJsonObject) {
            obj = obj.getAsJsonObject("analysis")
        }
        val gson = com.google.gson.Gson()
        when {
            obj.has("performanceScore") -> AiAnalysisState.Comprehensive(
                gson.fromJson(obj, live.airuncoach.airuncoach.network.model.ComprehensiveRunAnalysis::class.java)
            )
            obj.has("overallScore") -> AiAnalysisState.Basic(
                gson.fromJson(obj, live.airuncoach.airuncoach.network.model.BasicRunInsights::class.java)
            )
            else -> AiAnalysisState.Idle
        }
    } catch (e: Exception) {
        android.util.Log.w("OnboardingTourScreen", "Could not parse demo-run analysis: ${e.message}")
        AiAnalysisState.Idle
    }
}

// ── Fabricated demo data (offline fallback only) ─────────────────────────────────────────────

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

/** 6.42 km / 32:10 easy-tempo loop — offline fallback for the summary demo (see loadTourDemoRun). */
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

package live.airuncoach.airuncoach.wear.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.foundation.background
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.input.runScreenDoubleTapGesture
import live.airuncoach.airuncoach.wear.input.runScreenSwipeToggle
import live.airuncoach.airuncoach.wear.session.RunSessionController
import live.airuncoach.airuncoach.wear.ui.BackAction
import live.airuncoach.airuncoach.wear.ui.Overlay
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * Root screen — the single reachable destination in this app (mirroring RunView.mc being the
 * only reachable Garmin watch screen; there is no separate "StartView" here). Selects between
 * the Waiting / prepare-on-phone / GPS-wait / ready / paused screens and the Diamond/Grid
 * dashboard, wires input, and hosts the finish/exit confirmation dialogs.
 *
 * Run control: a Galaxy Watch's top button is the system Home key and never reaches the app,
 * so START, RESUME and FINISH are on-screen buttons (ready and paused screens), and the bottom
 * button (BACK) pauses mid-run. Watches with an extra app-usable button (KEYCODE_STEM_1) can
 * also start/pause/resume with it — see WearMainActivity.onKeyDown. [confirmDialog] is driven
 * by [RunSessionController.pendingConfirm] so the physical bottom button, the system
 * back-gesture (BackHandler below) and the FINISH button share one source of truth.
 */
@Composable
fun RunScreen(controller: RunSessionController, onExit: () -> Unit) {
    val state by controller.state.collectAsState()
    val confirmDialog by controller.pendingConfirm.collectAsState()

    BackHandler(enabled = confirmDialog == null) {
        controller.onBackPressed()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(WearColors.Background)
            .runScreenDoubleTapGesture(
                onDoubleTap = {
                    if (state.isRunning && !state.isPaused) controller.requestTalkToCoach()
                }
            )
            .runScreenSwipeToggle(onToggle = { controller.toggleScreen() })
    ) {
        when {
            state.overlay == Overlay.WAITING -> WaitingOverlay()
            // Ahead of GPS wait: GPS keeps acquiring behind it, and the prepare step is the
            // thing the runner needs to see first.
            state.showPrepareGate -> PrepareGateOverlay(
                isPhoneConnected = state.isPhoneConnected,
                onContinueWithoutCoaching = { controller.continueWithoutCoaching() }
            )
            state.overlay == Overlay.GPS_WAIT -> GpsWaitOverlay(quality = state.gpsQuality)
            state.showReady -> ReadyOverlay(state, onStart = { controller.startRun() })
            state.isPaused -> PausedOverlay(
                state,
                onResume = { controller.resumeRun() },
                onFinish = { controller.requestFinish() }
            )
            state.screenPage == 0 -> DiamondDashboard(state, onDone = { controller.dismissFinished() })
            else -> GridDashboard(state, onDone = { controller.dismissFinished() })
        }
    }

    confirmDialog?.let { action ->
        ConfirmDialog(
            message = when (action) {
                BackAction.ConfirmFinish -> if (state.isWalk) "Finish walk?" else "Finish run?"
                else -> "Exit app?"
            },
            onConfirm = {
                controller.clearPendingConfirm()
                when (action) {
                    BackAction.ConfirmFinish -> controller.finishRun()
                    BackAction.ConfirmExit -> onExit()
                    else -> Unit
                }
            },
            onDismiss = { controller.clearPendingConfirm() }
        )
    }
}

@Composable
private fun ConfirmDialog(message: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().background(WearColors.Background)) {
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = message,
                color = WearColors.White,
                style = TextStyle(fontSize = 14.sp, textAlign = TextAlign.Center)
            )
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.height(16.dp))
            PillButton("YES", WearColors.StartGreen, WearColors.Background, onConfirm)
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.height(8.dp))
            PillButton("CANCEL", WearColors.DividerGray, WearColors.White, onDismiss)
        }
    }
}

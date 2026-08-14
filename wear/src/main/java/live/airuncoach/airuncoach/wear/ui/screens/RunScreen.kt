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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Text
import live.airuncoach.airuncoach.wear.input.runScreenSwipeToggle
import live.airuncoach.airuncoach.wear.input.runScreenTapGestures
import live.airuncoach.airuncoach.wear.session.RunSessionController
import live.airuncoach.airuncoach.wear.ui.BackAction
import live.airuncoach.airuncoach.wear.ui.Overlay
import live.airuncoach.airuncoach.wear.ui.theme.WearColors

/**
 * Root screen — the single reachable destination in this app (mirroring RunView.mc being the
 * only reachable Garmin watch screen; there is no separate "StartView" here). Selects between
 * the Waiting/GPS-wait overlays and the Diamond/Grid dashboard, wires input, and hosts the
 * finish/exit confirmation dialogs driven by [RunSessionController.onBackPressed].
 */
@Composable
fun RunScreen(controller: RunSessionController, onExit: () -> Unit) {
    val state by controller.state.collectAsState()
    var confirmDialog by remember { mutableStateOf<BackAction?>(null) }

    BackHandler(enabled = confirmDialog == null) {
        when (val action = controller.onBackPressed()) {
            BackAction.ConfirmFinish, BackAction.ConfirmExit -> confirmDialog = action
            else -> Unit // ToggleScreen/None already handled inside onBackPressed()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(WearColors.Background)
            .runScreenTapGestures(
                onSingleTap = {
                    when {
                        !state.isRunning -> controller.startRun()
                        state.isPaused -> controller.resumeRun()
                        else -> controller.pauseRun()
                    }
                },
                onDoubleTap = {
                    if (state.isRunning && !state.isPaused) controller.requestTalkToCoach()
                }
            )
            .runScreenSwipeToggle(onToggle = { controller.toggleScreen() })
    ) {
        when (state.overlay) {
            Overlay.WAITING -> WaitingOverlay()
            Overlay.GPS_WAIT -> GpsWaitOverlay(quality = state.gpsQuality)
            Overlay.NONE -> if (state.screenPage == 0) DiamondDashboard(state) else GridDashboard(state)
        }
    }

    confirmDialog?.let { action ->
        ConfirmDialog(
            message = when (action) {
                BackAction.ConfirmFinish -> if (state.isWalk) "Finish walk?" else "Finish run?"
                else -> "Exit app?"
            },
            onConfirm = {
                confirmDialog = null
                when (action) {
                    BackAction.ConfirmFinish -> controller.finishRun()
                    BackAction.ConfirmExit -> onExit()
                    else -> Unit
                }
            },
            onDismiss = { confirmDialog = null }
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
            Button(onClick = onConfirm, colors = ButtonDefaults.primaryButtonColors()) {
                Text("Yes")
            }
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = onDismiss, colors = ButtonDefaults.secondaryButtonColors()) {
                Text("Cancel")
            }
        }
    }
}

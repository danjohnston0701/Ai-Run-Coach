package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.utils.OemBatteryHelper

private data class SetupStep(
    val number: Int,
    val icon: ImageVector,
    val title: String,
    val instruction: String,
    val exactPath: String,
    val whatToDo: String,
    val buttonLabel: String,
    val onAction: ((android.content.Context) -> Unit)?,
)

private val steps = listOf(
    SetupStep(
        number = 1,
        icon = Icons.Default.RocketLaunch,
        title = "Allow Autostart",
        instruction = "This is the most important step. Without it, ColorOS can stop AI Run Coach from running in the background the moment your screen locks — cutting off GPS and Bluetooth mid-run.",
        exactPath = "Settings → Privacy → Startup Manager (or Autostart)",
        whatToDo = "Find \"AI Run Coach\" in the list and turn the toggle ON.",
        buttonLabel = "Update Settings",
        onAction = { context -> OemBatteryHelper.openAutoStartSettings(context) },
    ),
    SetupStep(
        number = 2,
        icon = Icons.Default.PowerSettingsNew,
        title = "Allow Background Battery Usage",
        instruction = "ColorOS separately limits battery usage per app. On the default \"Optimized\" setting, it can still throttle GPS accuracy during a run.",
        exactPath = "Settings → Battery → App Battery Management → AI Run Coach",
        whatToDo = "Change it from \"Optimized\" to \"Allow background activity\" (sometimes shown as \"No restrictions\").",
        buttonLabel = "Open Battery Settings",
        onAction = { context -> OemBatteryHelper.openBatteryManagementSettings(context) },
    ),
    SetupStep(
        number = 3,
        icon = Icons.Default.Lock,
        title = "Lock the App Card in Recent Apps",
        instruction = "ColorOS can still clear AI Run Coach from memory when you swipe away recent apps, even with the settings above enabled.",
        exactPath = "Recent Apps (the square/multitasking button)",
        whatToDo = "Find the AI Run Coach card, swipe down slightly on it (or tap the lock icon that appears), until you see a small padlock on the card.",
        buttonLabel = "",
        onAction = null,
    ),
)

@Composable
fun ColorOSSetupScreen(
    onNavigateBack: () -> Unit = {}
) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Colors.backgroundDefault)
                .padding(horizontal = Spacing.lg, vertical = Spacing.lg),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                modifier = Modifier
                    .size(24.dp)
                    .clickable { onNavigateBack() },
                tint = Colors.textPrimary
            )
            Text(
                text = "Fix Background Tracking",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.width(24.dp))
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = Spacing.lg,
                top = Spacing.lg,
                end = Spacing.lg,
                bottom = Spacing.xl
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.lg)
        ) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        Text(
                            text = "Why this matters",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Colors.textPrimary
                        )
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            text = "Oppo, OnePlus, and Realme phones run ColorOS, which restricts background apps far more " +
                                "aggressively than standard Android. Even with location permission granted, ColorOS can " +
                                "silently pause GPS and Bluetooth partway through a run — causing gaps, jumps in distance, " +
                                "or a watch connection that drops. Complete the 3 steps below once and this stops happening.",
                            fontSize = 13.sp,
                            color = Colors.textSecondary,
                            lineHeight = 18.sp
                        )
                    }
                }
            }

            items(steps) { step ->
                SetupStepCard(step = step, context = context)
            }

            item {
                Text(
                    text = "Menu names and locations vary slightly between ColorOS versions. If a button above doesn't land exactly on the right screen, use the path shown under each step to find it manually.",
                    fontSize = 12.sp,
                    color = Colors.textMuted,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(top = Spacing.sm)
                )
            }
        }
    }
}

@Composable
private fun SetupStepCard(step: SetupStep, context: android.content.Context) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .background(Colors.primary, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "${step.number}",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Colors.backgroundRoot
                    )
                }
                Spacer(modifier = Modifier.width(Spacing.md))
                Icon(
                    imageVector = step.icon,
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    text = step.title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Colors.textPrimary
                )
            }

            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                text = step.instruction,
                fontSize = 13.sp,
                color = Colors.textSecondary,
                lineHeight = 18.sp
            )

            Spacer(modifier = Modifier.height(Spacing.md))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Colors.backgroundDefault, RoundedCornerShape(8.dp))
                    .padding(Spacing.md)
            ) {
                Text(
                    text = step.exactPath,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Colors.primary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = step.whatToDo,
                    fontSize = 13.sp,
                    color = Colors.textPrimary,
                    lineHeight = 18.sp
                )
            }

            if (step.onAction != null) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Button(
                    onClick = { step.onAction.invoke(context) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text(
                        text = step.buttonLabel,
                        color = Colors.backgroundRoot,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

private data class TipBullet(val text: String)

private data class Tip(
    val icon: ImageVector,
    val title: String,
    val summary: String,
    val bullets: List<TipBullet>,
    val note: String? = null,
)

private val usefulTips = listOf(
    Tip(
        icon = Icons.Default.PhoneAndroid,
        title = "Phone stops tracking when the screen locks",
        summary = "Live data freezing or your run cutting short mid-session is almost always the phone's manufacturer, not the app.",
        bullets = listOf(
            TipBullet("Most Android phone makers ship their own battery manager on top of standard Android, which can kill apps running in the background — even with GPS and a Garmin/watch connection active — as soon as the screen locks."),
            TipBullet("The app already asks Android's standard \"ignore battery optimizations\" permission, but several manufacturers (see below) have a second, separate background-management layer that isn't covered by that permission."),
            TipBullet("Quickest workaround: avoid fully locking the screen during a run — let it dim/time out on its own, or increase your screen timeout in Settings → Display, rather than pressing the lock button."),
            TipBullet("If a run does freeze, reopen the app rather than force-closing it — recent versions detect this and safely save your run instead of leaving it stuck."),
        ),
    ),
    Tip(
        icon = Icons.Default.BatteryAlert,
        title = "Oppo / OnePlus / Realme (ColorOS)",
        summary = "ColorOS is one of the most aggressive battery managers on Android.",
        bullets = listOf(
            TipBullet("Settings → Battery → App Battery Management → AI Run Coach → set to \"Allow background activity\" / \"No restrictions\" (not \"Optimized\")."),
            TipBullet("Settings → Privacy → Startup Manager (Autostart) → enable AI Run Coach."),
            TipBullet("Open Recent Apps, find AI Run Coach's card, and tap the lock icon so it isn't cleared automatically."),
        ),
    ),
    Tip(
        icon = Icons.Default.BatteryAlert,
        title = "Xiaomi / Redmi / POCO (MIUI / HyperOS)",
        summary = "MIUI's autostart and battery saver settings can silently stop background tracking.",
        bullets = listOf(
            TipBullet("Settings → Apps → Manage apps → AI Run Coach → Battery saver → set to \"No restrictions\"."),
            TipBullet("Settings → Apps → Permissions → Autostart → enable AI Run Coach."),
            TipBullet("Lock the app's card in the Recent Apps view (swipe down on the card or tap the lock icon)."),
        ),
    ),
    Tip(
        icon = Icons.Default.BatteryAlert,
        title = "Samsung (One UI)",
        summary = "One UI can quietly put unused apps to sleep, cutting off background tracking.",
        bullets = listOf(
            TipBullet("Settings → Apps → AI Run Coach → Battery → set to \"Unrestricted\"."),
            TipBullet("Settings → Battery and device care → Battery → Background usage limits → make sure AI Run Coach isn't listed under \"Sleeping apps\" or \"Deep sleeping apps\" (remove it if it is)."),
        ),
    ),
    Tip(
        icon = Icons.Default.BatteryAlert,
        title = "Huawei / Honor (EMUI / HarmonyOS / Magic UI)",
        summary = "Also known for closing background apps aggressively.",
        bullets = listOf(
            TipBullet("Settings → Battery → App launch → find AI Run Coach and switch it from \"Managed automatically\" to manual, then enable Auto-launch, Secondary launch, and Run in background."),
            TipBullet("Settings → Apps → AI Run Coach → Battery → set to unrestricted / no restrictions."),
        ),
    ),
    Tip(
        icon = Icons.Default.Lightbulb,
        title = "General battery-saving tips for long runs",
        summary = "GPS, a live screen, and a connected watch all draw extra power — a few habits go a long way on longer sessions.",
        bullets = listOf(
            TipBullet("Lower your screen brightness before starting — it's usually the single biggest battery drain during a run."),
            TipBullet("Close other apps running in the background before you start, so they aren't competing for battery and memory."),
            TipBullet("For ultra-distance or multi-hour sessions, consider a portable charger — GPS tracking apps are power-intensive by nature."),
            TipBullet("Turn on your phone's actual power-saving mode only if needed — some versions throttle GPS accuracy or background networking, which can affect live coaching and data sync."),
        ),
    ),
    Tip(
        icon = Icons.Default.Watch,
        title = "Keeping your Garmin or Wear watch connected",
        summary = "Watch dropouts mid-run are usually a Bluetooth or background-permission issue on the phone side, not the watch.",
        bullets = listOf(
            TipBullet("Keep Bluetooth turned on throughout your run — some phones disable it automatically in aggressive battery-saving modes."),
            TipBullet("Keep both the AI Run Coach app and your watch's companion app (Garmin Connect / Galaxy Wearable) up to date."),
            TipBullet("Apply the manufacturer-specific background permissions above — a watch connection dropping when the phone screen locks has the same root cause as data tracking freezing."),
        ),
        note = "If your watch keeps recording correctly but the phone's live display freezes or disconnects, that's almost always one of the background-permission settings above rather than a Bluetooth range issue.",
    ),
)

@Composable
fun UsefulTipsScreen(
    onNavigateBack: () -> Unit = {}
) {
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
                text = "Helpful Tips and Info",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.width(24.dp))
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundRoot),
            contentPadding = PaddingValues(
                start = Spacing.lg,
                top = Spacing.lg,
                end = Spacing.lg,
                bottom = Spacing.xl
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            item {
                Text(
                    text = "Common questions and device-specific settings to get the most reliable tracking during your runs.",
                    fontSize = 14.sp,
                    color = Colors.textSecondary,
                    modifier = Modifier.padding(bottom = Spacing.sm)
                )
            }
            items(usefulTips) { tip ->
                TipCard(tip)
            }
        }
    }
}

@Composable
private fun TipCard(tip: Tip) {
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { expanded = !expanded },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = tip.icon,
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = tip.title,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Colors.textPrimary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (!expanded) {
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = tip.summary,
                                fontSize = 13.sp,
                                color = Colors.textSecondary,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (expanded) "Collapse" else "Expand",
                    tint = Colors.textMuted,
                    modifier = Modifier.size(20.dp)
                )
            }

            AnimatedVisibility(
                visible = expanded,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                Column(modifier = Modifier.padding(top = Spacing.md)) {
                    Text(
                        text = tip.summary,
                        fontSize = 13.sp,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(bottom = Spacing.sm)
                    )
                    tip.bullets.forEach { bullet ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            Text(
                                text = "•",
                                fontSize = 14.sp,
                                color = Colors.primary,
                                modifier = Modifier.padding(end = Spacing.sm)
                            )
                            Text(
                                text = bullet.text,
                                fontSize = 13.sp,
                                color = Colors.textPrimary,
                                lineHeight = 18.sp
                            )
                        }
                    }
                    tip.note?.let { note ->
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            text = note,
                            fontSize = 12.sp,
                            color = Colors.textMuted,
                            lineHeight = 16.sp
                        )
                    }
                }
            }
        }
    }
}

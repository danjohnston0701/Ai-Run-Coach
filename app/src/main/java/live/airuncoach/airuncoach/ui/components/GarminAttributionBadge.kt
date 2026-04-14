package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles


/**
 * Garmin attribution badge — required by Garmin Developer API Brand Guidelines v6.30.2025.
 *
 * Usage rules (from the guidelines):
 *  • Place directly beneath or adjacent to the primary title/heading of any data view
 *    that shows Garmin device-sourced data (HR, pace, distance, cadence, etc.)
 *  • Must appear ABOVE THE FOLD — never in tooltips, footnotes, or expandable containers
 *  • Text format: "Garmin [device model]" or just "Garmin" when model is unavailable
 *  • Show on EVERY screen with Garmin data — not conditional on externalSource flag
 *
 * @param deviceModel  e.g. "Fenix 7", "Forerunner 955" — pass null to show "Garmin" only
 * @param modifier     standard Compose modifier
 * @param style        [GarminBadgeStyle.INLINE] (row-level, default) or
 *                     [GarminBadgeStyle.HEADER] (section header, slightly larger)
 */
@Composable
fun GarminAttributionBadge(
    modifier: Modifier = Modifier,
    deviceModel: String? = null,
    style: GarminBadgeStyle = GarminBadgeStyle.INLINE,
) {
    val label = if (!deviceModel.isNullOrBlank()) "Garmin $deviceModel" else "Garmin"
    val iconSize: Dp
    val fontSize: Float
    val paddingH: Dp
    val paddingV: Dp

    when (style) {
        GarminBadgeStyle.HEADER -> {
            iconSize = 18.dp
            fontSize = 12f
            paddingH = 10.dp
            paddingV = 5.dp
        }
        GarminBadgeStyle.INLINE -> {
            iconSize = 14.dp
            fontSize = 10f
            paddingH = 8.dp
            paddingV = 3.dp
        }
    }

    Surface(
        shape = RoundedCornerShape(4.dp),
        color = Color(0xFF0C1929),          // very dark navy — subtle but distinct
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = paddingH, vertical = paddingV),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_garmin_connect_logo),
                contentDescription = null,
                modifier = Modifier.size(iconSize),
                contentScale = ContentScale.Fit,
            )
            Text(
                text = label,
                style = AppTextStyles.caption.copy(
                    fontSize = fontSize.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF6B8CA8),   // muted steel-blue — readable, not intrusive
                    letterSpacing = 0.2.sp,
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

enum class GarminBadgeStyle { HEADER, INLINE }

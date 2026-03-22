package live.airuncoach.airuncoach.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.domain.model.RunAchievement
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import java.util.Locale

/**
 * Helper to convert hex color string to Compose Color
 */
fun parseHexColor(hexString: String): Color {
    return Color(android.graphics.Color.parseColor(hexString))
}

/**
 * Pop-up badge for displaying a single achievement
 */
@Composable
fun AchievementBadgePopup(
    modifier: Modifier = Modifier,
    achievement: RunAchievement,
    isVisible: Boolean = true
) {
    AnimatedVisibility(
        visible = isVisible,
        enter = fadeIn() + expandVertically(expandFrom = Alignment.Top),
        exit = fadeOut() + shrinkVertically(shrinkTowards = Alignment.Top),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(parseHexColor(achievement.backgroundColor))
                .padding(Spacing.lg)
                .padding(top = Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            // Icon
            Text(
                text = achievement.icon,
                fontSize = 48.sp,
                modifier = Modifier.padding(Spacing.md)
            )

            // Title
            Text(
                text = achievement.title,
                style = AppTextStyles.h2,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            // Description
            Text(
                text = achievement.description,
                style = AppTextStyles.body,
                color = Color.White.copy(alpha = 0.9f),
                textAlign = TextAlign.Center
            )

            // Improvement percentage if available
            if (achievement.improvementPercent != null && achievement.improvementPercent > 0) {
                Text(
                    text = "⚡ ${String.format(Locale.getDefault(), "%.1f", achievement.improvementPercent)}% faster than previous",
                    style = AppTextStyles.caption,
                    color = Color.White.copy(alpha = 0.85f),
                    fontSize = 12.sp
                )
            }

            Spacer(modifier = Modifier.height(Spacing.md))
        }
    }
}

/**
 * Stacked badges for displaying multiple achievements in run summary
 */
@Composable
fun AchievementBadgesStack(
    achievements: List<RunAchievement>,
    modifier: Modifier = Modifier
) {
    if (achievements.isEmpty()) {
        return
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        achievements.forEach { achievement ->
            AchievementBadgeItem(achievement = achievement)
        }
    }
}

/**
 * Individual achievement badge for the badges tab
 */
@Composable
fun AchievementBadgeItem(
    achievement: RunAchievement,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(parseHexColor(achievement.backgroundColor))
            .padding(Spacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Icon
            Text(
                text = achievement.icon,
                fontSize = 28.sp
            )

            // Title and description
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = achievement.title,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                    color = Color.White,
                    fontSize = 14.sp
                )
                Text(
                    text = achievement.category,
                    style = AppTextStyles.caption,
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 11.sp
                )
            }
        }

        // Improvement badge
        if (achievement.improvementPercent != null && achievement.improvementPercent > 0) {
            Text(
                text = "${String.format(Locale.getDefault(), "%.0f", achievement.improvementPercent)}%",
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                color = Color.White,
                fontSize = 12.sp,
                modifier = Modifier
                    .background(Color.White.copy(alpha = 0.3f), shape = RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }
    }
}

/**
 * Empty state for when no achievements are earned
 */
@Composable
fun NoAchievementsState(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        Text(
            text = "🏃",
            fontSize = 48.sp
        )
        Text(
            text = "No Personal Bests Yet",
            style = AppTextStyles.h3,
            color = Colors.textPrimary
        )
        Text(
            text = "Push your limits to earn achievement badges!",
            style = AppTextStyles.caption,
            color = Colors.textMuted,
            textAlign = TextAlign.Center
        )
    }
}

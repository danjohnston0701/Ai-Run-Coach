package live.airuncoach.airuncoach.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// 1. Renamed the object to avoid conflicts and for clarity
object AppTextStyles {
    // Display/Stats
    val statLarge = TextStyle(
        fontSize = 48.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-2).sp,
        lineHeight = 56.sp
    )

    val stat = TextStyle(
        fontSize = 32.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-1).sp,
        lineHeight = 40.sp
    )

    // Headings
    val h1 = TextStyle(
        fontSize = 36.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.5).sp,
        lineHeight = 44.sp
    )

    val h2 = TextStyle(
        fontSize = 28.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.3).sp,
        lineHeight = 36.sp
    )

    val h3 = TextStyle(
        fontSize = 22.sp,
        fontWeight = FontWeight.SemiBold,
        lineHeight = 30.sp
    )

    val h4 = TextStyle(
        fontSize = 18.sp,
        fontWeight = FontWeight.SemiBold,
        lineHeight = 26.sp
    )

    // Body Text
    val bodyLarge = TextStyle(
        fontSize = 18.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 28.sp
    )

    val body = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 24.sp
    )

    val small = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 20.sp
    )

    val caption = TextStyle(
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.5.sp,
        lineHeight = 16.sp
    )

    // Links
    val link = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.Medium,
        color = Colors.primary,
        lineHeight = 24.sp
    )
}

// 2. Created the Typography object for the MaterialTheme
val AiRunCoachTypography = Typography(
    displayLarge = AppTextStyles.statLarge,
    displayMedium = AppTextStyles.stat,
    headlineLarge = AppTextStyles.h1,
    headlineMedium = AppTextStyles.h2,
    headlineSmall = AppTextStyles.h3,
    titleLarge = AppTextStyles.h4,
    bodyLarge = AppTextStyles.bodyLarge,
    bodyMedium = AppTextStyles.body,
    bodySmall = AppTextStyles.small,
    labelSmall = AppTextStyles.caption
)

package live.airuncoach.airuncoach.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = Colors.primary,
    background = Colors.backgroundRoot,
    surface = Colors.backgroundSecondary,
    onPrimary = Colors.buttonText,
    onSecondary = Colors.textPrimary,
    onBackground = Colors.textPrimary,
    onSurface = Colors.textPrimary,
    error = Colors.error,
    onError = Color.White
)

@Composable
fun AiRunCoachTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = AiRunCoachTypography,
        content = content
    )
}

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import live.airuncoach.airuncoach.ui.theme.Colors

@Composable
fun HistoryScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot),
        contentAlignment = Alignment.Center
    ) {
        Text(text = "History Screen", color = Colors.textPrimary)
    }
}

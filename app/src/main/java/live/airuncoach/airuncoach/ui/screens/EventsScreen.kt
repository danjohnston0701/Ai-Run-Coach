package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import live.airuncoach.airuncoach.ui.theme.Colors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventsScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot),
        contentAlignment = Alignment.Center
    ) {
        Text(text = "Events Screen", color = Colors.textPrimary)
    }
}

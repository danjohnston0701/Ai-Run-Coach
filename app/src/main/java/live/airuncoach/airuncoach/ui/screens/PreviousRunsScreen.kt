package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.viewmodel.PreviousRunsViewModel

@Composable
fun PreviousRunsScreen(
    onNavigateToRunSummary: (String) -> Unit,
    viewModel: PreviousRunsViewModel = hiltViewModel()
) {
    val runs by viewModel.runs.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.fetchRuns()
    }

    Scaffold(
        topBar = {
            // Top bar with title and back button
        },
        content = {
            if (isLoading) {
                // Show a loading indicator
            } else if (error != null) {
                // Show an error message
            } else {
                LazyColumn(modifier = Modifier.padding(it)) {
                    items(runs) { run ->
                        RunListItem(run = run, onClick = { onNavigateToRunSummary(run.id) })
                    }
                }
            }
        }
    )
}

@Composable
fun RunListItem(run: RunSession, onClick: () -> Unit) {
    Card(modifier = Modifier
        .fillMaxWidth()
        .padding(8.dp)
        .clickable { onClick() }) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = "Run on ${run.startTime}") // Placeholder
            Text(text = "Distance: ${run.getDistanceInKm()} km")
            Text(text = "Duration: ${run.getFormattedDuration()}")
        }
    }
}

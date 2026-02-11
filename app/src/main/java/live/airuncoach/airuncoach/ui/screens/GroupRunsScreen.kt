
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.GroupRunsUiState
import live.airuncoach.airuncoach.viewmodel.GroupRunsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupRunsScreen(onCreateGroupRun: () -> Unit, onNavigateBack: () -> Unit) {
    val viewModel: GroupRunsViewModel = hiltViewModel()
    val groupRunsState by viewModel.groupRunsState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Group Runs", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(id = R.drawable.icon_play_vector), contentDescription = "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCreateGroupRun,
                containerColor = Colors.primary
            ) {
                Icon(painterResource(id = R.drawable.icon_play_vector), contentDescription = "Create Group Run", tint = Colors.buttonText)
            }
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (val state = groupRunsState) {
                is GroupRunsUiState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = Colors.primary)
                }
                is GroupRunsUiState.Success -> {
                    if (state.groupRuns.isEmpty()) {
                        EmptyGroupRunsState(onCreateGroupRun)
                    } else {
                        GroupRunsList(groupRuns = state.groupRuns)
                    }
                }
                is GroupRunsUiState.Error -> {
                    ErrorGroupRunsState(
                        errorMessage = state.message,
                        onRetry = { viewModel.loadGroupRuns() },
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
            }
        }
    }
}

@Composable
fun ErrorGroupRunsState(
    errorMessage: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Icon
        Icon(
            painter = painterResource(id = R.drawable.icon_x_circle),
            contentDescription = "Error",
            tint = Colors.warning,
            modifier = Modifier.size(64.dp)
        )
        
        Spacer(modifier = Modifier.height(Spacing.lg))
        
        // Error message
        Text(
            text = errorMessage,
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            modifier = Modifier.padding(horizontal = Spacing.lg)
        )
        
        Spacer(modifier = Modifier.height(Spacing.xl))
        
        // Retry button (only show if not a "coming soon" message)
        if (!errorMessage.contains("coming soon", ignoreCase = true)) {
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary
                )
            ) {
                Text(
                    text = "Retry",
                    color = Colors.buttonText,
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
        }
    }
}

@Composable
fun EmptyGroupRunsState(onCreateGroupRun: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_profile_vector),
            contentDescription = "No Group Runs",
            tint = Colors.textMuted,
            modifier = Modifier.size(80.dp)
        )
        Spacer(modifier = Modifier.height(Spacing.lg))
        Text(
            text = "No Group Runs",
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Text(
            text = "Be the first to organize a group run! Tap the + button to create one.",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
        )
    }
}

@Composable
fun GroupRunsList(groupRuns: List<GroupRun>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.lg)
    ) {
        items(groupRuns) { groupRun ->
            GroupRunCard(groupRun = groupRun)
            Spacer(modifier = Modifier.height(Spacing.md))
        }
    }
}

@Composable
fun GroupRunCard(groupRun: GroupRun) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(text = groupRun.name, style = AppTextStyles.h4, color = Colors.textPrimary)
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(text = groupRun.description, style = AppTextStyles.body, color = Colors.textSecondary)
        }
    }
}

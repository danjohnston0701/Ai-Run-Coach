package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.GroupRunResultsResponse
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import javax.inject.Inject

/**
 * Standalone results table for a group run, reached from the detail screen's "View Results"
 * (the `group_run_results/{groupRunId}` route — which was navigated to but never registered,
 * so the button crashed). The Run Summary's "Group" tab renders the same tables, but needs the
 * viewer's own run to exist; this screen has no such requirement, so it also works for an
 * organiser or participant who didn't run.
 *
 * Auto-refreshes every 15 s while any accepted participant still has no linked run, so the
 * table fills in as people finish, then stops.
 */
@HiltViewModel
class GroupRunResultsViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {
    private val _results = MutableStateFlow<GroupRunResultsResponse?>(null)
    val results: StateFlow<GroupRunResultsResponse?> = _results.asStateFlow()
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var refreshJob: kotlinx.coroutines.Job? = null

    fun load(groupRunId: String) {
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            fetch(groupRunId, showSpinner = true)
            while (isActive && _results.value?.results?.any { it.runId == null } == true) {
                delay(15_000)
                fetch(groupRunId, showSpinner = false)
            }
        }
    }

    fun refresh(groupRunId: String) = load(groupRunId)

    private suspend fun fetch(groupRunId: String, showSpinner: Boolean) {
        if (showSpinner) _isLoading.value = true
        try {
            _results.value = apiService.getGroupRunResults(groupRunId)
            _error.value = null
        } catch (e: Exception) {
            if (_results.value == null) _error.value = e.message ?: "Failed to load results"
        } finally {
            _isLoading.value = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupRunResultsScreen(
    groupRunId: String,
    onNavigateBack: () -> Unit,
) {
    val viewModel: GroupRunResultsViewModel = hiltViewModel()
    val results by viewModel.results.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    var metricTab by remember { mutableIntStateOf(0) }
    val metricTabs = listOf("Summary", "Pace", "SPM", "Elevation", "HR")

    LaunchedEffect(groupRunId) { viewModel.load(groupRunId) }

    Scaffold(
        containerColor = Colors.backgroundRoot,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        results?.groupRunName ?: "Group Run Results",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refresh(groupRunId) }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot),
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(Colors.backgroundRoot)) {
            when {
                isLoading && results == null -> CircularProgressIndicator(
                    color = Colors.primary, modifier = Modifier.align(Alignment.Center),
                )
                error != null && results == null -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(Spacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(error ?: "", style = AppTextStyles.body, color = Colors.error)
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Button(onClick = { viewModel.refresh(groupRunId) }) { Text("Retry") }
                }
                else -> {
                    val participants = results?.results.orEmpty()
                    val finished = participants.count { it.runId != null }
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(horizontal = Spacing.lg),
                        contentPadding = PaddingValues(bottom = Spacing.xl),
                        verticalArrangement = Arrangement.spacedBy(Spacing.md),
                    ) {
                        item {
                            Text(
                                "$finished of ${participants.size} finished" +
                                    if (finished < participants.size) " — updates as others finish" else "",
                                style = AppTextStyles.small, color = Colors.textMuted,
                                modifier = Modifier.padding(top = Spacing.sm),
                            )
                        }
                        item {
                            ScrollableTabRow(
                                selectedTabIndex = metricTab,
                                containerColor = Colors.backgroundRoot,
                                contentColor = Colors.primary,
                                edgePadding = 0.dp,
                            ) {
                                metricTabs.forEachIndexed { index, label ->
                                    Tab(
                                        selected = metricTab == index,
                                        onClick = { metricTab = index },
                                        selectedContentColor = Colors.primary,
                                        unselectedContentColor = Colors.textMuted,
                                    ) {
                                        Text(
                                            label,
                                            style = AppTextStyles.caption.copy(fontWeight = if (metricTab == index) FontWeight.Bold else FontWeight.Medium),
                                            modifier = Modifier.padding(vertical = 12.dp, horizontal = Spacing.sm),
                                        )
                                    }
                                }
                            }
                        }
                        item {
                            when (metricTab) {
                                0 -> GroupRunSummaryTable(participants)
                                1 -> GroupRunPaceTable(participants)
                                2 -> GroupRunSpmTable(participants)
                                3 -> GroupRunElevationTable(participants)
                                else -> GroupRunHrTable(participants)
                            }
                        }
                    }
                }
            }
        }
    }
}

package live.airuncoach.airuncoach.ui.screens

import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.viewmodel.RouteGenerationState
import live.airuncoach.airuncoach.viewmodel.RouteGenerationViewModel
import live.airuncoach.airuncoach.viewmodel.RouteGenerationViewModelFactory

/**
 * Main Route Generation Screen - Orchestrates the flow between:
 * 1. Setup screen (configure run parameters)
 * 2. Loading screen (generating routes from backend)
 * 3. Selection screen (choose from generated routes)
 */
@Composable
fun RouteGenerationScreen(
    onNavigateBack: () -> Unit = {},
    onRouteSelected: (String) -> Unit = {}
) {
    val context = LocalContext.current
    val viewModel: RouteGenerationViewModel = viewModel(
        factory = RouteGenerationViewModelFactory(context)
    )
    
    val uiState by viewModel.uiState.collectAsState()
    val routes by viewModel.routes.collectAsState()
    val userLocation by viewModel.userLocation.collectAsState()
    val aiCoachEnabled by viewModel.aiCoachEnabled.collectAsState()
    
    // State for setup screen
    var targetDistance by remember { mutableStateOf(5f) }
    var targetTimeEnabled by remember { mutableStateOf(false) }
    var targetHours by remember { mutableStateOf(0) }
    var targetMinutes by remember { mutableStateOf(0) }
    var targetSeconds by remember { mutableStateOf(0) }
    var liveTrackingEnabled by remember { mutableStateOf(false) }
    var isGroupRun by remember { mutableStateOf(false) }
    
    when (uiState) {
        is RouteGenerationState.Setup -> {
            MapMyRunSetupScreen(
                initialDistance = targetDistance,
                initialTargetTimeEnabled = targetTimeEnabled,
                initialHours = targetHours,
                initialMinutes = targetMinutes,
                initialSeconds = targetSeconds,
                onNavigateBack = onNavigateBack,
                onGenerateRoute = { distance, timeEnabled, hours, minutes, seconds, liveTracking, groupRun ->
                    // Save parameters
                    targetDistance = distance
                    targetTimeEnabled = timeEnabled
                    targetHours = hours
                    targetMinutes = minutes
                    targetSeconds = seconds
                    liveTrackingEnabled = liveTracking
                    isGroupRun = groupRun
                    
                    // Trigger route generation
                    viewModel.generateRoutes(
                        distance = distance,
                        activityType = "run",
                        targetTimeEnabled = timeEnabled,
                        hours = hours,
                        minutes = minutes,
                        seconds = seconds,
                        liveTrackingEnabled = liveTracking,
                        isGroupRun = groupRun
                    )
                }
            )
        }
        
        is RouteGenerationState.Loading -> {
            RouteGenerationLoadingScreen(
                coachName = "Coach Carter",
                targetDistance = targetDistance
            )
        }
        
        is RouteGenerationState.Success -> {
            RouteSelectionScreen(
                routes = routes,
                targetDistance = targetDistance,
                aiCoachEnabled = aiCoachEnabled,
                onAiCoachToggle = { viewModel.toggleAiCoach() },
                onNavigateBack = {
                    viewModel.resetToSetup()
                },
                onRouteSelected = { selectedRoute ->
                    onRouteSelected(selectedRoute.id)
                },
                onRegenerateRoutes = {
                    viewModel.generateRoutes(
                        distance = targetDistance,
                        activityType = "run",
                        targetTimeEnabled = targetTimeEnabled,
                        hours = targetHours,
                        minutes = targetMinutes,
                        seconds = targetSeconds,
                        liveTrackingEnabled = liveTrackingEnabled,
                        isGroupRun = isGroupRun
                    )
                }
            )
        }
        
        is RouteGenerationState.Error -> {
            // Show error state (could create a dedicated error screen)
            MapMyRunSetupScreen(
                initialDistance = targetDistance,
                initialTargetTimeEnabled = targetTimeEnabled,
                initialHours = targetHours,
                initialMinutes = targetMinutes,
                initialSeconds = targetSeconds,
                onNavigateBack = onNavigateBack,
                onGenerateRoute = { distance, timeEnabled, hours, minutes, seconds, liveTracking, groupRun ->
                    targetDistance = distance
                    targetTimeEnabled = timeEnabled
                    targetHours = hours
                    targetMinutes = minutes
                    targetSeconds = seconds
                    liveTrackingEnabled = liveTracking
                    isGroupRun = groupRun
                    
                    viewModel.generateRoutes(
                        distance = distance,
                        activityType = "run",
                        targetTimeEnabled = timeEnabled,
                        hours = hours,
                        minutes = minutes,
                        seconds = seconds,
                        liveTrackingEnabled = liveTracking,
                        isGroupRun = groupRun
                    )
                }
            )
            // TODO: Show error snackbar
        }
    }
}

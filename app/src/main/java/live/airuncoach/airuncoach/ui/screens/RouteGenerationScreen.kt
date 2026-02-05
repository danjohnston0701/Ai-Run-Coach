package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.tasks.await
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.RouteGenerationViewModel
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteGenerationScreen(
    onNavigateBack: () -> Unit,
    onRouteSelected: (String) -> Unit,
    viewModel: RouteGenerationViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val routes by viewModel.routes.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    
    var distanceKm by remember { mutableStateOf(5.0f) }
    var preferTrails by remember { mutableStateOf(true) }
    var avoidHills by remember { mutableStateOf(false) }
    var currentLocation by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var hasLocationPermission by remember { mutableStateOf(false) }
    
    // Check permission status
    LaunchedEffect(Unit) {
        hasLocationPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    // Permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }
    
    // Get current location
    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission) {
            try {
                val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
                @SuppressLint("MissingPermission")
                val location = fusedLocationClient.lastLocation.await()
                if (location != null) {
                    currentLocation = Pair(location.latitude, location.longitude)
                }
            } catch (e: Exception) {
                android.util.Log.e("RouteGen", "Error getting location", e)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Generate Route", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundDefault
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundDefault)
                .padding(padding)
                .padding(horizontal = Spacing.md),
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            // Request permission if needed
            if (!hasLocationPermission) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                    ) {
                        Column(
                            modifier = Modifier.padding(Spacing.md)
                        ) {
                            Text(
                                "Location Permission Required",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(Spacing.sm))
                            Text(
                                "We need your location to generate routes nearby",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Colors.textSecondary
                            )
                            Spacer(Modifier.height(Spacing.md))
                            Button(
                                onClick = {
                                    locationPermissionLauncher.launch(
                                        arrayOf(
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                            Manifest.permission.ACCESS_COARSE_LOCATION
                                        )
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Colors.primary
                                )
                            ) {
                                Text("Grant Permission")
                            }
                        }
                    }
                }
            }
            
            // Location indicator
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Row(
                        modifier = Modifier.padding(Spacing.md),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = if (currentLocation != null) Colors.primary else Colors.textSecondary
                        )
                        Spacer(Modifier.width(Spacing.sm))
                        Text(
                            text = if (currentLocation != null) {
                                "Using your current location"
                            } else {
                                "Getting location..."
                            },
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }

            // Distance slider
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(
                        modifier = Modifier.padding(Spacing.md)
                    ) {
                        Text(
                            "Distance: ${distanceKm.roundToInt()}km",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Slider(
                            value = distanceKm,
                            onValueChange = { distanceKm = it },
                            valueRange = 1f..20f,
                            steps = 18
                        )
                    }
                }
            }

            // Options
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(
                        modifier = Modifier.padding(Spacing.md)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { preferTrails = !preferTrails }
                                .padding(vertical = Spacing.sm),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Prefer Trails", fontWeight = FontWeight.Medium)
                                Text(
                                    "Use paths, parks, and trails over roads",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary
                                )
                            }
                            Switch(
                                checked = preferTrails,
                                onCheckedChange = { preferTrails = it }
                            )
                        }
                        
                        Divider(modifier = Modifier.padding(vertical = Spacing.sm))
                        
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { avoidHills = !avoidHills }
                                .padding(vertical = Spacing.sm),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Avoid Hills", fontWeight = FontWeight.Medium)
                                Text(
                                    "Prefer flat routes with minimal elevation",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary
                                )
                            }
                            Switch(
                                checked = avoidHills,
                                onCheckedChange = { avoidHills = it }
                            )
                        }
                    }
                }
            }

            // Generate button
            item {
                Button(
                    onClick = {
                        currentLocation?.let { (lat, lng) ->
                            viewModel.generateIntelligentRoutes(
                                latitude = lat,
                                longitude = lng,
                                distanceKm = distanceKm.toDouble(),
                                preferTrails = preferTrails,
                                avoidHills = avoidHills
                            )
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    enabled = currentLocation != null && !isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary
                    )
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = Colors.buttonText
                        )
                    } else {
                        Text("Generate 3 Route Options", fontWeight = FontWeight.Bold, color = Colors.buttonText)
                    }
                }
            }

            // Error message
            error?.let { errorMessage ->
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Colors.error.copy(alpha = 0.1f))
                    ) {
                        Text(
                            text = errorMessage,
                            modifier = Modifier.padding(Spacing.md),
                            color = Colors.error
                        )
                    }
                }
            }

            // Generated routes
            if (routes.isNotEmpty()) {
                item {
                    Text(
                        "Select a Route",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = Spacing.md)
                    )
                }

                itemsIndexed(routes) { index, route ->
                    RouteCard(
                        route = route,
                        routeNumber = index + 1,
                        onClick = { onRouteSelected(route.id) }
                    )
                }
            }

            // Bottom spacing
            item {
                Spacer(Modifier.height(Spacing.xl))
            }
        }
    }
}

@Composable
private fun RouteCard(
    route: live.airuncoach.airuncoach.domain.model.GeneratedRoute,
    routeNumber: Int,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Route Option $routeNumber",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                
                Surface(
                    color = when (route.difficulty) {
                        live.airuncoach.airuncoach.domain.model.RouteDifficulty.EASY -> Colors.success
                        live.airuncoach.airuncoach.domain.model.RouteDifficulty.MODERATE -> Colors.warning
                        live.airuncoach.airuncoach.domain.model.RouteDifficulty.HARD -> Colors.error
                    },
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text(
                        route.difficulty.name,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = Colors.buttonText
                    )
                }
            }
            
            Spacer(Modifier.height(Spacing.sm))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        "Distance",
                        style = MaterialTheme.typography.bodySmall,
                        color = Colors.textSecondary
                    )
                    Text(
                        "${(route.distance / 1000.0).format(2)} km",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                }
                
                Column {
                    Text(
                        "Elevation Gain",
                        style = MaterialTheme.typography.bodySmall,
                        color = Colors.textSecondary
                    )
                    Text(
                        "${route.elevationGain.toInt()}m",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                }
                
                Column {
                    Text(
                        "Est. Time",
                        style = MaterialTheme.typography.bodySmall,
                        color = Colors.textSecondary
                    )
                    Text(
                        "${route.duration.toInt()} min",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

private fun Double.format(digits: Int) = "%.${digits}f".format(this)

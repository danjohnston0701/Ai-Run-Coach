package live.airuncoach.airuncoach.ui.screens

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.*
import com.google.maps.android.PolyUtil
import live.airuncoach.airuncoach.domain.model.GeneratedRoute
import live.airuncoach.airuncoach.domain.model.RouteDifficulty
import kotlin.math.atan
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteSelectionScreen(
    routes: List<GeneratedRoute>,
    distanceKm: Double,
    selectedRouteId: String?,
    onRouteSelected: (String) -> Unit,
    onStartRun: () -> Unit,
    onBack: () -> Unit,
    onRegenerateRoutes: () -> Unit,
    aiCoachEnabled: Boolean,
    onAiCoachToggle: (Boolean) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "SELECT YOUR ROUTE",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            "Choose from ${routes.size} routes",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF8B9AA8)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0A1628)
                )
            )
        },
        containerColor = Color(0xFF0A1628)
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Group routes by difficulty
                // Sort routes by distance (low to high) within each difficulty
                val easyRoutes = routes.filter { it.difficulty == RouteDifficulty.EASY }.sortedBy { it.distance }
                val moderateRoutes = routes.filter { it.difficulty == RouteDifficulty.MODERATE }.sortedBy { it.distance }
                val hardRoutes = routes.filter { it.difficulty == RouteDifficulty.HARD }.sortedBy { it.distance }

                // Easy Routes
                if (easyRoutes.isNotEmpty()) {
                    item {
                        DifficultyHeader("EASY ROUTES", Color(0xFFFFD700))
                    }
                    items(easyRoutes) { route ->
                        RouteCard(
                            route = route,
                            isSelected = route.id == selectedRouteId,
                            onSelect = { onRouteSelected(route.id) }
                        )
                    }
                }

                // Moderate Routes
                if (moderateRoutes.isNotEmpty()) {
                    item {
                        DifficultyHeader("MODERATE ROUTES", Color(0xFFFFD700))
                    }
                    items(moderateRoutes) { route ->
                        RouteCard(
                            route = route,
                            isSelected = route.id == selectedRouteId,
                            onSelect = { onRouteSelected(route.id) }
                        )
                    }
                }

                // Hard Routes
                if (hardRoutes.isNotEmpty()) {
                    item {
                        DifficultyHeader("HARD ROUTES", Color(0xFFFFD700))
                    }
                    items(hardRoutes) { route ->
                        RouteCard(
                            route = route,
                            isSelected = route.id == selectedRouteId,
                            onSelect = { onRouteSelected(route.id) }
                        )
                    }
                }

                // Spacer for bottom button
                item {
                    Spacer(Modifier.height(100.dp))
                }
            }

            // Bottom: Start Run Button
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color(0xFF0A1628))
                        )
                    )
                    .padding(16.dp)
            ) {
                Button(
                    onClick = onStartRun,
                    enabled = selectedRouteId != null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF00E5FF),
                        disabledContainerColor = Color(0xFF1A2634)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        "START RUN",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (selectedRouteId != null) Color.Black else Color.Gray
                    )
                }
            }
        }
    }
}

@Composable
fun DifficultyHeader(title: String, color: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        Text(
            text = title,
            color = color,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp
        )
    }
}

@Composable
fun RouteCard(
    route: GeneratedRoute,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    // Debug logging
    Log.d("RouteCard", "Route ${route.id}: distance=${route.distance}km, elevGain=${route.elevationGain}m, elevLoss=${route.elevationLoss}m")
    
    val borderColor = if (isSelected) Color(0xFF00E5FF) else Color.Transparent
    val difficultyColor = when (route.difficulty) {
        RouteDifficulty.EASY -> Color(0xFF34A853)
        RouteDifficulty.MODERATE -> Color(0xFFFFA726)
        RouteDifficulty.HARD -> Color(0xFFEF5350)
    }
    
    // Calculate average gradient angle in degrees (CORRECT formula using atan)
    val maxClimb = if (route.distance > 0 && route.elevationGain > 0) {
        val angle = (atan(route.elevationGain / route.distance) * (180.0 / Math.PI)).format(1)
        Log.d("RouteCard", "Climb angle: ${route.elevationGain}m / ${route.distance}m = $angle°")
        angle
    } else {
        "0.0"
    }
    val maxDescent = if (route.distance > 0 && route.elevationLoss > 0) {
        val angle = (atan(route.elevationLoss / route.distance) * (180.0 / Math.PI)).format(1)
        Log.d("RouteCard", "Descent angle: ${route.elevationLoss}m / ${route.distance}m = $angle°")
        angle
    } else {
        "0.0"
    }
    
    // Store GoogleMap reference for zoom controls
    var googleMapRef by remember { mutableStateOf<GoogleMap?>(null) }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(3.dp, borderColor, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2634)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            // Map View - Clickable to select route
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .clickable(onClick = onSelect) // Map click also selects route
            ) {
                AndroidView(
                    factory = { context ->
                        MapView(context).apply {
                            onCreate(null)
                            onResume()
                            getMapAsync { googleMap ->
                                googleMapRef = googleMap // Store reference for zoom controls
                                try {
                                    // Decode polyline
                                    val points = PolyUtil.decode(route.polyline)
                                    
                                    if (points.isNotEmpty()) {
                                        // Add polyline to map
                                        val polylineOptions = PolylineOptions()
                                            .addAll(points)
                                            .width(8f)
                                            .color(android.graphics.Color.parseColor("#00E5FF"))
                                            .geodesic(true)
                                        
                                        googleMap.addPolyline(polylineOptions)
                                        
                                        // Add start marker (blue)
                                        googleMap.addMarker(
                                            MarkerOptions()
                                                .position(points.first())
                                                .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_BLUE))
                                                .title("Start")
                                        )
                                        
                                        // Add finish marker (green)
                                        googleMap.addMarker(
                                            MarkerOptions()
                                                .position(points.last())
                                                .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_GREEN))
                                                .title("Finish")
                                        )
                                        
                                        // Calculate bounds and zoom
                                        val boundsBuilder = LatLngBounds.Builder()
                                        points.forEach { boundsBuilder.include(it) }
                                        val bounds = boundsBuilder.build()
                                        
                                        googleMap.moveCamera(
                                            CameraUpdateFactory.newLatLngBounds(bounds, 100)
                                        )
                                        
                                        // Disable map interactions (zoom controls handle this)
                                        googleMap.uiSettings.isScrollGesturesEnabled = false
                                        googleMap.uiSettings.isZoomGesturesEnabled = false
                                        googleMap.uiSettings.isTiltGesturesEnabled = false
                                        googleMap.uiSettings.isRotateGesturesEnabled = false
                                    }
                                } catch (e: Exception) {
                                    Log.e("RouteCard", "Error rendering map", e)
                                }
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
                
                // Difficulty Badge (top left)
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(difficultyColor.copy(alpha = 0.9f))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(Color.White)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = route.difficulty.name,
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                
                // Selected Badge (top right)
                if (isSelected) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(12.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color(0xFF00E5FF))
                            .padding(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = "Selected",
                            color = Color.Black,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                
                // Zoom controls (bottom right) - REMOVED FULLSCREEN ICON
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Zoom in button
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.White)
                            .clickable {
                                googleMapRef?.let { map ->
                                    map.animateCamera(CameraUpdateFactory.zoomIn())
                                    Log.d("RouteCard", "Zoom in")
                                }
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Text("+", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                    }
                    // Zoom out button
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.White)
                            .clickable {
                                googleMapRef?.let { map ->
                                    map.animateCamera(CameraUpdateFactory.zoomOut())
                                    Log.d("RouteCard", "Zoom out")
                                }
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Text("−", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                    }
                }
            }
            
            // Route Details Section (with SELECT ROUTE visual indicator)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0F1A2A))
                    .clickable(onClick = onSelect) // Bottom section also selects
            ) {
                // Distance and Elevation
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("🛣️", fontSize = 20.sp)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "${route.distance.format(1)} km",
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("⛰️", fontSize = 18.sp)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "${route.elevationGain.roundToInt()}m",
                            color = Color(0xFF8B9AA8),
                            fontSize = 16.sp
                        )
                    }
                }
                
                // Climb and Descent
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "↗ Steepest climb: $maxClimb°",
                        color = Color(0xFF34A853),
                        fontSize = 13.sp
                    )
                    Text(
                        text = "↘ Steepest descent: $maxDescent°",
                        color = Color(0xFFFFA726),
                        fontSize = 13.sp
                    )
                }
                
                // SELECT ROUTE indicator (visual cue for users)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isSelected) Color(0xFF00E5FF) else Color(0xFF1A2634))
                        .padding(12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isSelected) "✓ ROUTE SELECTED" else "TAP TO SELECT ROUTE",
                        color = if (isSelected) Color.Black else Color(0xFF8B9AA8),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                }
            }
        }
    }
}

private fun Double.format(decimals: Int): String = "%.${decimals}f".format(this)

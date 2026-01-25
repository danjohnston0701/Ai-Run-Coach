package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.*
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.utils.PolylineUtils

/**
 * Composable that displays a route on Google Maps
 * Shows the route polyline with blue (start) to green (finish) gradient
 */
@Composable
fun RouteMapPreview(
    encodedPolyline: String,
    modifier: Modifier = Modifier,
    onMapClick: () -> Unit = {}
) {
    // Decode the polyline
    val routePoints = remember(encodedPolyline) {
        try {
            val decoded = PolylineUtils.decode(encodedPolyline)
            android.util.Log.d("RouteMapPreview", "✅ Decoded ${decoded.size} points from polyline")
            decoded
        } catch (e: Exception) {
            android.util.Log.e("RouteMapPreview", "❌ Failed to decode polyline: ${e.message}")
            emptyList()
        }
    }
    
    if (routePoints.isEmpty()) {
        // Show placeholder if decoding fails
        Box(
            modifier = modifier,
            contentAlignment = Alignment.Center
        ) {
            androidx.compose.material3.Text(
                text = "Map unavailable",
                modifier = Modifier.padding(16.dp),
                color = Colors.textMuted
            )
        }
        return
    }
    
    android.util.Log.d("RouteMapPreview", "📍 Route spans from ${routePoints.first()} to ${routePoints.last()}")
    
    // Calculate camera position (center on route)
    val cameraPositionState = rememberCameraPositionState {
        position = com.google.android.gms.maps.model.CameraPosition.fromLatLngZoom(
            routePoints[routePoints.size / 2], // Center of route
            14f
        )
    }
    
    // Map settings
    val mapProperties = remember {
        MapProperties(
            isMyLocationEnabled = false
        )
    }
    
    val uiSettings = remember {
        MapUiSettings(
            zoomControlsEnabled = true, // Enable built-in Google Maps zoom controls
            compassEnabled = false,
            myLocationButtonEnabled = false,
            mapToolbarEnabled = false,
            scrollGesturesEnabled = true, // Enable scrolling/panning
            zoomGesturesEnabled = true, // Enable zoom gestures
            rotationGesturesEnabled = true,
            tiltGesturesEnabled = false
        )
    }
    
    GoogleMap(
        modifier = modifier,
        cameraPositionState = cameraPositionState,
        properties = mapProperties,
        uiSettings = uiSettings,
        onMapClick = { onMapClick() } // Make entire map clickable to select route
    ) {
        // Draw gradient polyline with overlapping segments to prevent gaps
        val segmentCount = kotlin.math.min(30, routePoints.size - 1)
        val pointsPerSegment = (routePoints.size - 1) / segmentCount
        
        for (i in 0 until segmentCount) {
            val startIndex = i * pointsPerSegment
            // Key fix: Add 1 to endIndex to create overlap between segments
            val endIndex = if (i == segmentCount - 1) routePoints.size else kotlin.math.min((i + 1) * pointsPerSegment + 1, routePoints.size)
            
            if (startIndex < endIndex && startIndex < routePoints.size && endIndex <= routePoints.size) {
                val segmentPoints = routePoints.subList(startIndex, endIndex)
                
                // Interpolate color from blue (0xFF2563EB) to green (0xFF10B981)
                val progress = i.toFloat() / (segmentCount - 1)
                val red = (37 + (16 - 37) * progress).toInt().coerceIn(0, 255)
                val green = (99 + (185 - 99) * progress).toInt().coerceIn(0, 255)
                val blue = (235 + (129 - 235) * progress).toInt().coerceIn(0, 255)
                
                Polyline(
                    points = segmentPoints,
                    color = androidx.compose.ui.graphics.Color(
                        red = red,
                        green = green,
                        blue = blue,
                        alpha = 255
                    ),
                    width = 14f,
                    startCap = com.google.android.gms.maps.model.RoundCap(),
                    endCap = com.google.android.gms.maps.model.RoundCap(),
                    jointType = JointType.ROUND,
                    visible = true
                )
            }
        }
        
        // Add start marker (blue)
        com.google.maps.android.compose.Marker(
            state = com.google.maps.android.compose.rememberMarkerState(position = routePoints.first()),
            title = "Start",
            icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_BLUE)
        )
        
        // Add finish marker (green)
        com.google.maps.android.compose.Marker(
            state = com.google.maps.android.compose.rememberMarkerState(position = routePoints.last()),
            title = "Finish",
            icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_GREEN)
        )
    }
    
    // Fit camera to show entire route with generous padding
    LaunchedEffect(routePoints) {
        if (routePoints.isNotEmpty()) {
            try {
                val boundsBuilder = LatLngBounds.Builder()
                routePoints.forEach { boundsBuilder.include(it) }
                val bounds = boundsBuilder.build()
                
                // Use animate instead of move for smoother transition
                // Increase padding to 150px to ensure full route is visible
                cameraPositionState.animate(
                    CameraUpdateFactory.newLatLngBounds(bounds, 150),
                    durationMs = 1000
                )
            } catch (e: Exception) {
                android.util.Log.e("RouteMapPreview", "Failed to fit bounds: ${e.message}")
            }
        }
    }
}

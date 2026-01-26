package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.components.RouteMapPreview
import live.airuncoach.airuncoach.network.model.RouteOption
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteSelectionScreen(
    routes: List<RouteOption>,
    targetDistance: Float,
    aiCoachEnabled: Boolean = true,
    onAiCoachToggle: () -> Unit = {},
    onNavigateBack: () -> Unit = {},
    onRouteSelected: (RouteOption) -> Unit = {},
    onRegenerateRoutes: () -> Unit = {}
) {
    var selectedRoute by remember { mutableStateOf<RouteOption?>(null) }
    
    // Group routes by difficulty
    val easyRoutes = routes.filter { it.difficulty.equals("easy", ignoreCase = true) }
    val moderateRoutes = routes.filter { it.difficulty.equals("moderate", ignoreCase = true) }
    val hardRoutes = routes.filter { it.difficulty.equals("hard", ignoreCase = true) }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = if (selectedRoute != null) 160.dp else 80.dp)
        ) {
            item {
                // Header
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Spacing.lg)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = onNavigateBack) {
                            Icon(
                                painter = painterResource(id = android.R.drawable.ic_menu_close_clear_cancel),
                                contentDescription = "Back",
                                tint = Colors.textMuted
                            )
                        }
                        
                        Spacer(modifier = Modifier.weight(1f))
                        
                        IconButton(onClick = { /* Group run placeholder */ }) {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_profile_vector),
                                contentDescription = "Group Run",
                                tint = Colors.textMuted
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    Text(
                        text = "CHOOSE YOUR ROUTE",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    
                    Column(
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Select from ${routes.size} route options for your ${targetDistance.toInt()}km run",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                        
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        
                        // AI Coach toggle - clickable
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .clip(RoundedCornerShape(BorderRadius.full))
                                .background(if (aiCoachEnabled) Colors.backgroundSecondary else Colors.backgroundTertiary)
                                .clickable { onAiCoachToggle() }
                                .padding(horizontal = Spacing.md, vertical = Spacing.xs)
                        ) {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_profile_vector),
                                contentDescription = "AI Coach Toggle",
                                tint = if (aiCoachEnabled) Colors.primary else Colors.textMuted,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.xs))
                            Text(
                                text = "AI Coach",
                                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                                color = if (aiCoachEnabled) Colors.primary else Colors.textMuted
                            )
                            Spacer(modifier = Modifier.width(Spacing.xs))
                            Text(
                                text = if (aiCoachEnabled) "On" else "Off",
                                style = AppTextStyles.caption,
                                color = if (aiCoachEnabled) Colors.primary else Colors.textMuted
                            )
                        }
                    }
                }
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
            
            // Route Legend
            item {
                RouteLegend()
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.lg)) }
            
            // EASY ROUTES
            if (easyRoutes.isNotEmpty()) {
                item {
                    Text(
                        text = "EASY ROUTES",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Color(0xFF10B981),
                        modifier = Modifier.padding(horizontal = Spacing.lg)
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
                
                items(easyRoutes) { route ->
                    RouteCard(
                        route = route,
                        isSelected = selectedRoute?.id == route.id,
                        onRouteClick = {
                            selectedRoute = if (selectedRoute?.id == route.id) null else route
                        }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
            }
            
            // MODERATE ROUTES
            if (moderateRoutes.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        text = "MODERATE ROUTES",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Color(0xFFF59E0B),
                        modifier = Modifier.padding(horizontal = Spacing.lg)
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
                
                items(moderateRoutes) { route ->
                    RouteCard(
                        route = route,
                        isSelected = selectedRoute?.id == route.id,
                        onRouteClick = {
                            selectedRoute = if (selectedRoute?.id == route.id) null else route
                        }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
            }
            
            // HARD ROUTES
            if (hardRoutes.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        text = "HARD ROUTES",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Color(0xFFEF4444),
                        modifier = Modifier.padding(horizontal = Spacing.lg)
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
                
                items(hardRoutes) { route ->
                    RouteCard(
                        route = route,
                        isSelected = selectedRoute?.id == route.id,
                        onRouteClick = {
                            selectedRoute = if (selectedRoute?.id == route.id) null else route
                        }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }
            }
            
            // Regenerate button
            item {
                OutlinedButton(
                    onClick = onRegenerateRoutes,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg)
                        .height(56.dp),
                    shape = RoundedCornerShape(BorderRadius.md),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Colors.primary
                    ),
                    border = androidx.compose.foundation.BorderStroke(2.dp, Colors.primary)
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_play_vector), // Replace with refresh icon
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(
                        text = "Regenerate Routes",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.xxl)) }
        }
        
        // Bottom action button
        AnimatedVisibility(
            visible = selectedRoute != null,
            modifier = Modifier.align(Alignment.BottomCenter)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Colors.backgroundRoot)
                    .padding(Spacing.lg)
            ) {
                Button(
                    onClick = { selectedRoute?.let { onRouteSelected(it) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(60.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    )
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_play_vector),
                        contentDescription = null,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(
                        text = "PREPARE RUN SESSION",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    }
}

@Composable
fun RouteLegend() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clip(RoundedCornerShape(BorderRadius.sm))
            .background(Colors.backgroundSecondary)
            .padding(Spacing.md),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Start indicator
        Box(
            modifier = Modifier
                .size(16.dp)
                .clip(CircleShape)
                .background(Color(0xFF3B82F6))
        )
        Spacer(modifier = Modifier.width(Spacing.xs))
        Text(
            text = "Start",
            style = AppTextStyles.body,
            color = Colors.textPrimary
        )
        
        Spacer(modifier = Modifier.width(Spacing.lg))
        
        // Route line
        Box(
            modifier = Modifier
                .width(40.dp)
                .height(3.dp)
                .background(
                    brush = androidx.compose.ui.graphics.Brush.horizontalGradient(
                        listOf(Color(0xFF3B82F6), Color(0xFF10B981))
                    )
                )
        )
        
        Spacer(modifier = Modifier.width(Spacing.lg))
        
        // Finish indicator
        Box(
            modifier = Modifier
                .size(16.dp)
                .clip(CircleShape)
                .background(Color(0xFF10B981))
        )
        Spacer(modifier = Modifier.width(Spacing.xs))
        Text(
            text = "Finish",
            style = AppTextStyles.body,
            color = Colors.textPrimary
        )
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun RouteCard(
    route: RouteOption,
    isSelected: Boolean,
    onRouteClick: () -> Unit
) {
    val difficultyColor = when (route.difficulty.lowercase()) {
        "easy" -> Color(0xFF10B981)
        "moderate" -> Color(0xFFF59E0B)
        "hard" -> Color(0xFFEF4444)
        else -> Colors.primary
    }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .then(
                if (isSelected) {
                    Modifier.border(3.dp, Colors.primary, RoundedCornerShape(BorderRadius.lg))
                } else {
                    Modifier
                }
            ),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        onClick = {
            android.util.Log.d("RouteCard", "Route clicked: ${route.id}")
            onRouteClick()
        }
    ) {
        Column {
            // Map View with actual route
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
            ) {
                // Render actual Google Map with route - clicking map also selects route
                RouteMapPreview(
                    encodedPolyline = route.polyline,
                    modifier = Modifier.fillMaxSize(),
                    onMapClick = {
                        android.util.Log.d("RouteCard", "Map clicked for route: ${route.id}")
                        onRouteClick()
                    }
                )
                // Difficulty badge
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(Spacing.md)
                        .clip(RoundedCornerShape(BorderRadius.full))
                        .background(difficultyColor)
                        .padding(horizontal = Spacing.md, vertical = Spacing.sm)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "● ${route.difficulty.uppercase()}",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                    }
                }
                
                // Selected badge
                if (isSelected) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(Spacing.md)
                            .clip(RoundedCornerShape(BorderRadius.full))
                            .background(Colors.primary)
                            .padding(horizontal = Spacing.md, vertical = Spacing.sm)
                    ) {
                        Text(
                            text = "Selected",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                            color = Colors.buttonText
                        )
                    }
                }
                
                // Map controls removed - gestures disabled to allow scrolling
            }
            
            // Route details
            Column(modifier = Modifier.padding(Spacing.lg)) {
                // Distance and elevation row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_location_vector),
                                contentDescription = null,
                                tint = Colors.textPrimary,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.xs))
                            Text(
                                text = "%.1f km".format(route.distance),
                                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                                color = Colors.textPrimary
                            )
                        }
                    }
                    
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "⛰️",
                            style = AppTextStyles.body
                        )
                        Spacer(modifier = Modifier.width(Spacing.xs))
                        Text(
                            text = "${route.elevationGain}m",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(Spacing.sm))
                
                // Gradient info
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    RouteMetric(
                        label = "Steepest climb",
                        value = "%.1f°".format(route.maxGradientDegrees),
                        color = Color(0xFF10B981)
                    )
                    
                    RouteMetric(
                        label = "Steepest descent",
                        value = "%.1f°".format(route.maxGradientDegrees),
                        color = Color(0xFFF59E0B)
                    )
                }
                
                // Additional info if present
                if (route.description.contains("major roads", ignoreCase = true)) {
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        text = "Includes major roads",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
            }
        }
    }
}

@Composable
fun MapControlButton(icon: Int, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(BorderRadius.sm))
            .background(Colors.backgroundRoot.copy(alpha = 0.9f))
    ) {
        Icon(
            painter = painterResource(id = icon),
            contentDescription = null,
            tint = Colors.textPrimary,
            modifier = Modifier.size(16.dp)
        )
    }
}

@Composable
fun RouteMetric(label: String, value: String, color: Color) {
    Column {
        Text(
            text = value,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
            color = color
        )
        Text(
            text = label,
            style = AppTextStyles.small,
            color = Colors.textMuted
        )
    }
}

package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

/**
 * RAW DATA TAB
 * For power users who want every single metric
 */
@Composable
fun RawDataTab(runSession: RunSession) {
    var showAllPoints by remember { mutableStateOf(false) }
    
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painterResource(id = R.drawable.icon_chart_vector),
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Column {
                    Text(
                        "Raw Data",
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "All the numbers, unfiltered",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }
        }

        // ========== SESSION METADATA ==========
        item {
            RawDataSection("Session Information") {
                RawDataRow("Run ID", runSession.id)
                RawDataRow("Start Time", formatTimestamp(runSession.startTime))
                RawDataRow("End Time", runSession.endTime?.let { formatTimestamp(it) } ?: "In Progress")
                RawDataRow("Duration (ms)", runSession.duration.toString())
                RawDataRow("Active", runSession.isActive.toString())
                RawDataRow("Route Hash", runSession.routeHash ?: "N/A")
                RawDataRow("Route Name", runSession.routeName ?: "Unnamed")
            }
        }

        // ========== DISTANCE METRICS ==========
        item {
            RawDataSection("Distance Metrics") {
                RawDataRow("Total Distance (m)", String.format("%.2f", runSession.distance))
                RawDataRow("Total Distance (km)", String.format("%.3f", runSession.getDistanceInKm()))
                RawDataRow("Total Distance (mi)", String.format("%.3f", runSession.getDistanceInKm() * 0.621371))
                RawDataRow("GPS Points Recorded", runSession.routePoints.size.toString())
                RawDataRow("Avg Point Distance", 
                    if (runSession.routePoints.size > 1) 
                        String.format("%.1fm", runSession.distance / runSession.routePoints.size)
                    else "N/A"
                )
            }
        }

        // ========== SPEED & PACE ==========
        item {
            RawDataSection("Speed & Pace") {
                RawDataRow("Average Speed (m/s)", String.format("%.3f", runSession.averageSpeed))
                RawDataRow("Average Speed (km/h)", String.format("%.2f", runSession.averageSpeed * 3.6))
                RawDataRow("Average Speed (mph)", String.format("%.2f", runSession.averageSpeed * 2.23694))
                RawDataRow("Max Speed (m/s)", String.format("%.3f", runSession.maxSpeed))
                RawDataRow("Max Speed (km/h)", String.format("%.2f", runSession.maxSpeed * 3.6))
                RawDataRow("Max Speed (mph)", String.format("%.2f", runSession.maxSpeed * 2.23694))
                RawDataRow("Average Pace (min/km)", runSession.averagePace ?: "N/A")
                RawDataRow("Average Pace (min/mi)", runSession.averagePace?.let { convertPaceToMiles(it) } ?: "N/A")
            }
        }

        // ========== PHYSIOLOGICAL ==========
        item {
            RawDataSection("Physiological Metrics") {
                RawDataRow("Average Heart Rate", "${runSession.heartRate} bpm")
                RawDataRow("Max Heart Rate", "N/A") // TODO: Track max HR
                RawDataRow("Min Heart Rate", "N/A") // TODO: Track min HR
                RawDataRow("HR Reserve Used", "N/A") // TODO: Calculate
                RawDataRow("Average Cadence", "${runSession.cadence} spm")
                RawDataRow("Max Cadence", "N/A") // TODO: Track max cadence
                RawDataRow("Step Count (estimated)", "${runSession.cadence * (runSession.duration / 1000 / 60).toInt()}")
            }
        }

        // ========== ELEVATION ==========
        item {
            RawDataSection("Elevation Metrics") {
                RawDataRow("Total Ascent (m)", String.format("%.2f", runSession.totalElevationGain))
                RawDataRow("Total Ascent (ft)", String.format("%.0f", runSession.totalElevationGain * 3.28084))
                RawDataRow("Total Descent (m)", String.format("%.2f", runSession.totalElevationLoss))
                RawDataRow("Total Descent (ft)", String.format("%.0f", runSession.totalElevationLoss * 3.28084))
                RawDataRow("Net Elevation Change (m)", String.format("%.2f", runSession.totalElevationGain - runSession.totalElevationLoss))
                RawDataRow("Average Gradient (%)", String.format("%.2f", runSession.averageGradient))
                RawDataRow("Max Gradient (%)", String.format("%.2f", runSession.maxGradient))
                RawDataRow("Terrain Type", runSession.terrainType.name)
                RawDataRow("Highest Point (m)", getMaxAltitude(runSession.routePoints))
                RawDataRow("Lowest Point (m)", getMinAltitude(runSession.routePoints))
            }
        }

        // ========== ENERGY ==========
        item {
            RawDataSection("Energy Expenditure") {
                RawDataRow("Calories Burned", runSession.calories.toString())
                RawDataRow("Calories per Km", String.format("%.0f", runSession.calories / runSession.getDistanceInKm()))
                RawDataRow("Calories per Minute", String.format("%.1f", runSession.calories / (runSession.duration / 1000.0 / 60.0)))
                RawDataRow("Energy Rate (kcal/hr)", String.format("%.0f", runSession.calories / (runSession.duration / 1000.0 / 3600.0)))
            }
        }

        // ========== WEATHER ==========
        runSession.weatherAtStart?.let { weather ->
            item {
                RawDataSection("Weather at Start") {
                    RawDataRow("Condition", weather.condition ?: weather.description)
                    RawDataRow("Temperature (°C)", String.format("%.1f", weather.temperature))
                    RawDataRow("Temperature (°F)", String.format("%.1f", weather.temperature * 9/5 + 32))
                    weather.feelsLike?.let {
                        RawDataRow("Feels Like (°C)", String.format("%.1f", it))
                        RawDataRow("Feels Like (°F)", String.format("%.1f", it * 9/5 + 32))
                    }
                    RawDataRow("Humidity (%)", weather.humidity.toString())
                    RawDataRow("Wind Speed (m/s)", String.format("%.1f", weather.windSpeed))
                    RawDataRow("Wind Speed (km/h)", String.format("%.1f", weather.windSpeed * 3.6))
                    RawDataRow("Wind Speed (mph)", String.format("%.1f", weather.windSpeed * 2.23694))
                    weather.windDirection?.let { 
                        RawDataRow("Wind Direction (°)", it.toString())
                        RawDataRow("Wind Direction", getWindDirection(it))
                    }
                    weather.uvIndex?.let { RawDataRow("UV Index", it.toString()) }
                }
            }
        }

        runSession.weatherAtEnd?.let { weather ->
            item {
                RawDataSection("Weather at End") {
                    RawDataRow("Condition", weather.condition ?: weather.description)
                    RawDataRow("Temperature (°C)", String.format("%.1f", weather.temperature))
                    RawDataRow("Humidity (%)", weather.humidity.toString())
                    RawDataRow("Wind Speed (m/s)", String.format("%.1f", weather.windSpeed))
                }
            }
        }

        // ========== SPLIT DETAILS ==========
        item {
            RawDataSection("Split Details (${runSession.kmSplits.size} splits)") {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Km", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(1f))
                    Text("Time", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(1f))
                    Text("Pace", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted, modifier = Modifier.weight(1f))
                }
                Spacer(modifier = Modifier.height(Spacing.xs))
                Divider(color = Colors.textMuted.copy(alpha = 0.2f))
                Spacer(modifier = Modifier.height(Spacing.xs))
            }
        }

        itemsIndexed(runSession.kmSplits) { index, split ->
            SplitDetailRow(split, index == runSession.kmSplits.lastIndex)
        }

        // ========== GPS ROUTE DATA ==========
        item {
            RawDataSection("GPS Route Data (${runSession.routePoints.size} points)") {
                Text(
                    "Tap to expand point-by-point data",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
            }
        }
        
        if (showAllPoints) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        // Header
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("#", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(0.5f))
                            Text("Lat", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(1.5f))
                            Text("Lng", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(1.5f))
                            Text("Alt", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(1f))
                        }
                        Divider(modifier = Modifier.padding(vertical = Spacing.xs))
                        
                        runSession.routePoints.take(50).forEachIndexed { index, point ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("$index", style = AppTextStyles.caption, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(0.5f))
                                Text(String.format("%.6f", point.latitude), style = AppTextStyles.caption, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1.5f))
                                Text(String.format("%.6f", point.longitude), style = AppTextStyles.caption, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1.5f))
                                Text(point.altitude?.let { String.format("%.1f", it) } ?: "N/A", style = AppTextStyles.caption, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f))
                            }
                            if (index < 49) Divider(modifier = Modifier.padding(vertical = 2.dp), color = Colors.textMuted.copy(alpha = 0.1f))
                        }
                        
                        if (runSession.routePoints.size > 50) {
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text(
                                "... and ${runSession.routePoints.size - 50} more points",
                                style = AppTextStyles.caption,
                                color = Colors.textMuted
                            )
                        }
                    }
                }
            }
        }

        // ========== TECHNICAL INFO ==========
        item {
            RawDataSection("Technical Information") {
                RawDataRow("Coaching Phase", runSession.phase.name)
                RawDataRow("Is Struggling", runSession.isStruggling.toString())
                RawDataRow("GPS Accuracy", "N/A") // TODO: Track GPS accuracy
                RawDataRow("Sensor Data Points", runSession.routePoints.size.toString())
                RawDataRow("Data Collection Rate", 
                    if (runSession.duration > 0) 
                        String.format("%.1f points/min", runSession.routePoints.size / (runSession.duration / 1000.0 / 60.0))
                    else "N/A"
                )
            }
        }

        // ========== EXPORT OPTIONS ==========
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.primary.copy(alpha = 0.1f)
                )
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Text(
                        "Export Raw Data",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Text(
                        "Download this run's data in various formats",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        ExportButton("GPX", Modifier.weight(1f))
                        ExportButton("TCX", Modifier.weight(1f))
                        ExportButton("FIT", Modifier.weight(1f))
                        ExportButton("JSON", Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun RawDataSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(
                title,
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.md))
            content()
        }
    }
}

@Composable
private fun RawDataRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            label,
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            modifier = Modifier.weight(1.5f)
        )
        Text(
            value,
            style = AppTextStyles.body.copy(fontFamily = FontFamily.Monospace),
            color = Colors.textPrimary,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun SplitDetailRow(split: KmSplit, isLast: Boolean) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("${split.km}", style = AppTextStyles.body.copy(fontFamily = FontFamily.Monospace), modifier = Modifier.weight(1f))
            Text(formatSplitTime(split.time), style = AppTextStyles.body.copy(fontFamily = FontFamily.Monospace), modifier = Modifier.weight(1f))
            Text(split.pace, style = AppTextStyles.body.copy(fontFamily = FontFamily.Monospace), modifier = Modifier.weight(1f))
        }
        if (!isLast) {
            Divider(
                modifier = Modifier.padding(horizontal = Spacing.lg),
                color = Colors.textMuted.copy(alpha = 0.1f)
            )
        }
    }
}

@Composable
private fun ExportButton(format: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.2f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            contentAlignment = Alignment.Center
        ) {
            Text(
                format,
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                color = Colors.primary
            )
        }
    }
}

// Helper Functions

private fun formatTimestamp(timestamp: Long): String {
    val sdf = SimpleDateFormat("MMM dd, yyyy HH:mm:ss", Locale.getDefault())
    return sdf.format(Date(timestamp))
}

private fun convertPaceToMiles(paceKm: String): String {
    try {
        val parts = paceKm.split(":")
        if (parts.size != 2) return "N/A"
        
        val minutes = parts[0].toInt()
        val seconds = parts[1].toInt()
        val totalSeconds = minutes * 60 + seconds
        
        val milesSeconds = (totalSeconds * 1.60934).toInt()
        val milesMinutes = milesSeconds / 60
        val milesRemainingSeconds = milesSeconds % 60
        
        return String.format("%d:%02d", milesMinutes, milesRemainingSeconds)
    } catch (e: Exception) {
        return "N/A"
    }
}

private fun getMaxAltitude(points: List<LocationPoint>): String {
    val max = points.mapNotNull { it.altitude }.maxOrNull()
    return max?.let { String.format("%.1f", it) } ?: "N/A"
}

private fun getMinAltitude(points: List<LocationPoint>): String {
    val min = points.mapNotNull { it.altitude }.minOrNull()
    return min?.let { String.format("%.1f", it) } ?: "N/A"
}

private fun getWindDirection(degrees: Int): String {
    val directions = arrayOf("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")
    val index = ((degrees + 11.25) / 22.5).toInt() % 16
    return directions[index]
}

private fun formatSplitTime(millis: Long): String {
    val totalSeconds = millis / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format("%d:%02d", minutes, seconds)
}

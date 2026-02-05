package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.Event
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventsScreen(
    onEventClick: (Event) -> Unit = {}
) {
    val context = LocalContext.current
    val sessionManager = remember { SessionManager(context) }
    val apiService = remember { RetrofitClient(context, sessionManager).instance }
    
    var eventsByCountry by remember { mutableStateOf<Map<String, List<Event>>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var expandedCountries by remember { mutableStateOf<Set<String>>(emptySet()) }
    val scope = rememberCoroutineScope()
    
    LaunchedEffect(Unit) {
        scope.launch {
            try {
                isLoading = true
                errorMessage = null
                eventsByCountry = apiService.getEventsGrouped()
                // Auto-expand if only one country
                if (eventsByCountry.size == 1) {
                    expandedCountries = eventsByCountry.keys.toSet()
                }
                android.util.Log.d("EventsScreen", "✅ Loaded events from ${eventsByCountry.size} countries")
            } catch (e: Exception) {
                android.util.Log.e("EventsScreen", "❌ Failed to load events: ${e.message}", e)
                errorMessage = "Failed to load events: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "EVENTS",
                            style = AppTextStyles.h2.copy(
                                fontWeight = FontWeight.Bold,
                                color = Colors.primary
                            )
                        )
                        Text(
                            text = "Browse running events worldwide",
                            style = AppTextStyles.small,
                            color = Colors.textSecondary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                )
            )
        },
        containerColor = Colors.backgroundRoot
    ) { paddingValues ->
        when {
            isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Colors.primary)
                }
            }
            errorMessage != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(Spacing.lg)
                    ) {
                        Text(
                            text = errorMessage ?: "Unknown error",
                            color = Colors.error,
                            style = AppTextStyles.body
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = {
                                scope.launch {
                                    try {
                                        isLoading = true
                                        errorMessage = null
                                        eventsByCountry = apiService.getEventsGrouped()
                                    } catch (e: Exception) {
                                        errorMessage = "Failed to load events: ${e.message}"
                                    } finally {
                                        isLoading = false
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Colors.primary,
                                contentColor = Colors.buttonText
                            )
                        ) {
                            Text("Retry")
                        }
                    }
                }
            }
            eventsByCountry.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "No events available",
                            style = AppTextStyles.h3,
                            color = Colors.textSecondary
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Check back later for organized races",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentPadding = PaddingValues(Spacing.md),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    // Summary header
                    item {
                        val totalEvents = eventsByCountry.values.sumOf { it.size }
                        Text(
                            text = "$totalEvents events across ${eventsByCountry.size} country${if (eventsByCountry.size != 1) "ies" else ""}",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary,
                            modifier = Modifier.padding(bottom = Spacing.md)
                        )
                    }
                    
                    // Countries and events
                    eventsByCountry.forEach { (country, events) ->
                        item {
                            CountrySection(
                                country = country,
                                events = events,
                                isExpanded = expandedCountries.contains(country),
                                onToggle = {
                                    expandedCountries = if (expandedCountries.contains(country)) {
                                        expandedCountries - country
                                    } else {
                                        expandedCountries + country
                                    }
                                },
                                onEventClick = onEventClick
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CountrySection(
    country: String,
    events: List<Event>,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    onEventClick: (Event) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Spacing.md)
    ) {
        // Country header
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onToggle() },
            shape = RoundedCornerShape(BorderRadius.md),
            colors = CardDefaults.cardColors(
                containerColor = Colors.backgroundSecondary
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Spacing.md),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = getCountryFlag(country),
                        style = AppTextStyles.h2
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(
                        text = country,
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
                
                Surface(
                    shape = RoundedCornerShape(BorderRadius.full),
                    color = Colors.primary.copy(alpha = 0.2f)
                ) {
                    Text(
                        text = "${events.size} event${if (events.size != 1) "s" else ""}",
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
                
                Text(
                    text = if (isExpanded) "▲" else "▼",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    modifier = Modifier.padding(start = Spacing.sm)
                )
            }
        }
        
        // Events list
        if (isExpanded) {
            Spacer(modifier = Modifier.height(Spacing.sm))
            events.forEach { event ->
                EventCard(
                    event = event,
                    onClick = { onEventClick(event) }
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
        }
    }
}

@Composable
fun EventCard(event: Event, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md)
        ) {
            // Event name and type badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = event.name,
                    style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary,
                    modifier = Modifier.weight(1f)
                )
                
                Surface(
                    shape = RoundedCornerShape(BorderRadius.sm),
                    color = Colors.warning.copy(alpha = 0.2f)
                ) {
                    Text(
                        text = event.eventType.uppercase(),
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                        color = Colors.warning,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.xs))
            
            // Location
            if (!event.city.isNullOrEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "📍",
                        style = AppTextStyles.body
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = event.city,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
                Spacer(modifier = Modifier.height(Spacing.xs))
            }
            
            // Schedule info
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // When
                Column {
                    Text(
                        text = formatSchedule(event),
                        style = AppTextStyles.body.copy(
                            fontWeight = FontWeight.Medium,
                            color = Colors.primary
                        )
                    )
                }
                
                // Distance & Difficulty
                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    if (event.distance != null) {
                        Surface(
                        shape = RoundedCornerShape(BorderRadius.sm),
                        color = Colors.success.copy(alpha = 0.15f)
                    ) {
                            Text(
                                text = "${event.distance} km",
                                style = AppTextStyles.small,
                                color = Colors.success,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                    
                    if (!event.difficulty.isNullOrEmpty()) {
                        Surface(
                            color = when (event.difficulty.lowercase()) {
                                "easy" -> Colors.success.copy(alpha = 0.15f)
                                "hard" -> Colors.error.copy(alpha = 0.15f)
                                else -> Colors.warning.copy(alpha = 0.15f)
                            },
                            shape = RoundedCornerShape(BorderRadius.sm)
                        ) {
                            Text(
                                text = event.difficulty.capitalize(),
                                style = AppTextStyles.small,
                                color = when (event.difficulty.lowercase()) {
                                    "easy" -> Colors.success
                                    "hard" -> Colors.error
                                    else -> Colors.warning
                                },
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun formatSchedule(event: Event): String {
    return when {
        event.scheduleType == "recurring" && event.dayOfWeek != null -> {
            val dayName = getDayName(event.dayOfWeek)
            val pattern = event.recurrencePattern?.capitalize() ?: "Weekly"
            if (isEventTomorrow(event.dayOfWeek)) {
                "Tomorrow ($pattern)"
            } else {
                "$dayName ($pattern)"
            }
        }
        event.specificDate != null -> {
            try {
                val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                val date = sdf.parse(event.specificDate)
                val displaySdf = SimpleDateFormat("MMM dd, yyyy", Locale.getDefault())
                displaySdf.format(date ?: Date())
            } catch (e: Exception) {
                event.specificDate
            }
        }
        else -> "Check event details"
    }
}

private fun getDayName(dayOfWeek: Int): String {
    return when (dayOfWeek) {
        0 -> "Sunday"
        1 -> "Monday"
        2 -> "Tuesday"
        3 -> "Wednesday"
        4 -> "Thursday"
        5 -> "Friday"
        6 -> "Saturday"
        else -> "Unknown"
    }
}

private fun isEventTomorrow(dayOfWeek: Int): Boolean {
    val calendar = Calendar.getInstance()
    calendar.add(Calendar.DAY_OF_YEAR, 1)
    val tomorrowDayOfWeek = (calendar.get(Calendar.DAY_OF_WEEK) + 5) % 7 // Convert to 0-6 format
    return dayOfWeek == tomorrowDayOfWeek
}

private fun getCountryFlag(country: String): String {
    return when (country.lowercase()) {
        "new zealand" -> "🇳🇿"
        "australia" -> "🇦🇺"
        "united states", "usa" -> "🇺🇸"
        "united kingdom", "uk" -> "🇬🇧"
        "canada" -> "🇨🇦"
        "ireland" -> "🇮🇪"
        "south africa" -> "🇿🇦"
        "france" -> "🇫🇷"
        "germany" -> "🇩🇪"
        "spain" -> "🇪🇸"
        "italy" -> "🇮🇹"
        "japan" -> "🇯🇵"
        "china" -> "🇨🇳"
        "india" -> "🇮🇳"
        "brazil" -> "🇧🇷"
        else -> "🌍"
    }
}

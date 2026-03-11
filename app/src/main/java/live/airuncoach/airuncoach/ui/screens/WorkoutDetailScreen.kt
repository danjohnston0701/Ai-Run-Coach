package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.HeartRateZones
import live.airuncoach.airuncoach.network.model.WorkoutDetails
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutDetailScreen(
    workout: WorkoutDetails,
    onNavigateBack: () -> Unit,
    onStartWorkout: (WorkoutDetails) -> Unit,
    onMarkComplete: (WorkoutDetails) -> Unit
) {
    val color = workoutTypeColor(workout.workoutType)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        workoutTypeLabel(workout.workoutType),
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(R.drawable.icon_arrow_back_vector), "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg)
        ) {
            // ── Hero section ───────────────────────────────────────────────────
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(modifier = Modifier.padding(Spacing.xl), horizontalAlignment = Alignment.CenterHorizontally) {
                    WorkoutTypeBadge(workout.workoutType)
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        workout.description ?: workoutTypeLabel(workout.workoutType),
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // ── Key stats ─────────────────────────────────────────────────────
            if (workout.workoutType != "rest") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    workout.distance?.let {
                        WorkoutStatCard(label = "Distance", value = "${it}km", icon = R.drawable.icon_target_vector, modifier = Modifier.weight(1f))
                    }
                    workout.targetPace?.let {
                        WorkoutStatCard(label = "Target Pace", value = "$it/km", icon = R.drawable.icon_timer_vector, modifier = Modifier.weight(1f))
                    }
                    workout.intensity?.let {
                        // Convert "z1" to "Zone 1", "z2" to "Zone 2", etc.
                        val zoneLabel = it.replace(Regex("^z([1-5])$")) { match -> "Zone ${match.groupValues[1].uppercase()}" }
                        WorkoutStatCard(label = "Intensity", value = zoneLabel, icon = R.drawable.icon_heart_vector, modifier = Modifier.weight(1f))
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))

                // ── Zone description and pace guidance ─────────────────────────────
                workout.intensity?.let { intensity ->
                    val zoneNumber = intensity.replace(Regex("[^0-9]"), "").toIntOrNull() ?: 2
                    val zoneInfo = HeartRateZones.getZoneInfo(zoneNumber)
                    
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, zoneInfo.run { 
                                when(zone) {
                                    1 -> Colors.success.copy(alpha = 0.3f)
                                    2 -> Colors.primary.copy(alpha = 0.3f)
                                    3 -> Colors.warning.copy(alpha = 0.3f)
                                    4, 5 -> Colors.error.copy(alpha = 0.3f)
                                    else -> Colors.textMuted.copy(alpha = 0.3f)
                                }
                            }, RoundedCornerShape(12.dp)),
                        colors = CardDefaults.cardColors(containerColor = zoneInfo.run { 
                            when(zone) {
                                1 -> Colors.success.copy(alpha = 0.05f)
                                2 -> Colors.primary.copy(alpha = 0.05f)
                                3 -> Colors.warning.copy(alpha = 0.05f)
                                4, 5 -> Colors.error.copy(alpha = 0.05f)
                                else -> Colors.backgroundSecondary
                            }
                        }),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(Spacing.lg)) {
                            Text(zoneInfo.name, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            
                            Text("What it feels like:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            Text(zoneInfo.description, style = AppTextStyles.small, color = Colors.textSecondary)
                            
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("Pace guidance:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            Text(zoneInfo.paceGuidance, style = AppTextStyles.small, color = Colors.textSecondary)
                            
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("Benefits:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            Text(zoneInfo.benefits, style = AppTextStyles.small, color = Colors.textSecondary)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Instructions ──────────────────────────────────────────────────
            if (!workout.instructions.isNullOrEmpty()) {
                Text("Workout Instructions", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                Spacer(modifier = Modifier.height(Spacing.sm))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        workout.instructions,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(Spacing.lg)
                    )
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Structure breakdown ───────────────────────────────────────────
            if (workout.workoutType == "intervals" || workout.workoutType == "tempo") {
                WorkoutStructureSection(workout)
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Why this workout ──────────────────────────────────────────────
            val why = workoutWhyText(workout.workoutType)
            Text("Why this workout?", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Spacer(modifier = Modifier.height(Spacing.sm))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.06f)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(modifier = Modifier.padding(Spacing.lg)) {
                    Icon(painterResource(R.drawable.icon_ai_vector), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(why, style = AppTextStyles.body, color = Colors.textSecondary)
                }
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            // ── Actions ───────────────────────────────────────────────────────
            if (workout.isCompleted) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.success, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Workout Complete!", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.success)
                }
            } else if (workout.workoutType != "rest") {
                Button(
                    onClick = { onStartWorkout(workout) },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(painterResource(R.drawable.icon_play_vector), null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Start This Workout", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                }
                Spacer(modifier = Modifier.height(Spacing.sm))
                OutlinedButton(
                    onClick = { onMarkComplete(workout) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Mark as Done (no GPS)", style = AppTextStyles.body)
                }
            } else {
                // Rest day
                Button(
                    onClick = { onMarkComplete(workout) },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.success),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Log Rest Day", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                }
            }

            Spacer(modifier = Modifier.height(Spacing.xl))
        }
    }
}

@Composable
fun WorkoutStatCard(label: String, value: String, icon: Int, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(painterResource(icon), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Text(label, style = AppTextStyles.small, color = Colors.textMuted)
        }
    }
}

@Composable
fun WorkoutStructureSection(workout: WorkoutDetails) {
    Text("Workout Structure", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
    Spacer(modifier = Modifier.height(Spacing.sm))

    val structure: List<Triple<String, String, androidx.compose.ui.graphics.Color>> = when (workout.workoutType) {
        "intervals" -> listOf(
            Triple("Warm-up", "10 min easy (Zone 2)", Colors.success),
            Triple("Work intervals", workout.instructions ?: "Repeat as prescribed", Colors.error),
            Triple("Cool-down", "5 min easy", Colors.success)
        )
        "tempo" -> listOf(
            Triple("Warm-up", "10 min easy (Zone 2)", Colors.success),
            Triple("Tempo", "${workout.instructions ?: "Sustained effort"} (Zone 4)", Colors.warning),
            Triple("Cool-down", "5 min easy", Colors.success)
        )
        else -> emptyList()
    }

    structure.forEach { (phase, detail, color) ->
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
            shape = RoundedCornerShape(10.dp)
        ) {
            Row(modifier = Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.width(4.dp).height(40.dp).background(color, RoundedCornerShape(2.dp)))
                Spacer(modifier = Modifier.width(Spacing.md))
                Column {
                    Text(phase, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Text(detail, style = AppTextStyles.small, color = Colors.textSecondary)
                }
            }
        }
        Spacer(modifier = Modifier.height(Spacing.sm))
    }
}

fun workoutWhyText(type: String) = when (type) {
    "easy" -> "Easy runs build your aerobic base — the foundation of all running fitness. These runs train your body to burn fat efficiently and prepare you for harder sessions later in the week."
    "long_run" -> "The long run is the cornerstone of your training. It builds endurance, teaches your body to manage fuel over time, and builds the mental resilience needed for race day."
    "tempo" -> "Tempo runs raise your lactate threshold — the pace you can sustain before fatigue kicks in. This is the most direct route to running faster for longer."
    "intervals" -> "High-intensity intervals improve your VO₂ max (maximal oxygen uptake) and running economy. Short bursts at race effort or faster teach your body to move more efficiently."
    "hill_repeats" -> "Hill repeats build strength, power, and running form. They're resistance training for runners — building the muscles needed to sustain pace when tired."
    "recovery" -> "Recovery runs flush out fatigue from hard sessions without adding stress. They keep your legs moving and set you up for the next quality session."
    "rest" -> "Rest is where adaptation happens. Your body repairs muscle, replenishes glycogen, and grows stronger. Skipping rest leads to injury and underperformance."
    else -> "This workout is prescribed by your AI coach to optimally develop your running fitness towards your goal."
}

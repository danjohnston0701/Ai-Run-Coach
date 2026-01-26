
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.FitnessLevelViewModel
import live.airuncoach.airuncoach.viewmodel.FitnessLevelViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FitnessLevelScreen(onNavigateBack: () -> Unit) {
    val context = LocalContext.current
    val viewModel: FitnessLevelViewModel = viewModel(factory = FitnessLevelViewModelFactory(context))
    val fitnessLevel by viewModel.fitnessLevel.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Fitness Level", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Spacing.lg)
        ) {
            item {
                SectionTitle(title = "Select Your Fitness Level")
                Spacer(modifier = Modifier.height(Spacing.md))
            }
            items(viewModel.fitnessLevels.size) { index ->
                val level = viewModel.fitnessLevels[index]
                FitnessLevelSelector(
                    level = level,
                    isSelected = level == fitnessLevel,
                    onClick = { viewModel.onFitnessLevelChanged(level) }
                )
                Spacer(modifier = Modifier.height(Spacing.sm))
            }
            item {
                Spacer(modifier = Modifier.height(Spacing.xl))
                Button(
                    onClick = {
                        viewModel.saveFitnessLevel()
                        onNavigateBack()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Save Changes", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

@Composable
fun FitnessLevelSelector(level: String, isSelected: Boolean, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) Colors.primary.copy(alpha = 0.2f) else Colors.backgroundSecondary
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = level,
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            if (isSelected) {
                RadioButton(
                    selected = true,
                    onClick = {},
                    colors = RadioButtonDefaults.colors(selectedColor = Colors.primary)
                )
            }
        }
    }
}

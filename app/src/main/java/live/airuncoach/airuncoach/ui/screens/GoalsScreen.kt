package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.*

@Composable
fun GoalsScreen(onCreateGoal: () -> Unit = {}) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.lg)
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_target_vector),
                contentDescription = "Goals",
                tint = Colors.primary,
                modifier = Modifier.size(80.dp)
            )
            Text(
                text = "No active goals yet",
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Text(
                text = "Set a goal to track your progress",
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))
            Button(
                onClick = onCreateGoal,
                modifier = Modifier
                    .width(200.dp)
                    .height(50.dp),
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                )
            ) {
                Text(
                    text = "Create Goal",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
        }
    }
}

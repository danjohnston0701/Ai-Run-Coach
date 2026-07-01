package live.airuncoach.airuncoach.ui.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors

/**
 * Dialog for selecting friends to invite as live run observers.
 *
 * Features:
 * - Search/filter by name
 * - Checkbox to select multiple friends
 * - Show selected count
 * - Handle no friends scenario
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FriendPickerDialog(
    friends: List<Friend>,
    onFriendsSelected: (List<String>) -> Unit,  // Returns list of selected friend IDs
    onDismiss: () -> Unit,
    initialSelected: List<String> = emptyList()  // Pre-selected friend IDs
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedFriendIds by remember { mutableStateOf(initialSelected.toSet()) }

    // Filter friends based on search query
    val filteredFriends = friends.filter { friend ->
        friend.name.contains(searchQuery, ignoreCase = true)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.85f),
            shape = RoundedCornerShape(12.dp),
            color = Colors.backgroundSecondary
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Select Friends",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(
                            Icons.Default.Clear,
                            contentDescription = "Close",
                            tint = Colors.textMuted
                        )
                    }
                }

                // Search field
                TextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp)
                        .height(48.dp),
                    placeholder = {
                        Text(
                            "Search friends...",
                            style = AppTextStyles.small,
                            color = Colors.textMuted
                        )
                    },
                    leadingIcon = {
                        Icon(
                            Icons.Default.Search,
                            contentDescription = null,
                            tint = Colors.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(
                                    Icons.Default.Clear,
                                    contentDescription = "Clear",
                                    tint = Colors.textMuted
                                )
                            }
                        }
                    },
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Colors.backgroundTertiary.copy(alpha = 0.5f),
                        unfocusedContainerColor = Colors.backgroundTertiary.copy(alpha = 0.3f),
                        focusedIndicatorColor = Colors.primary,
                        unfocusedIndicatorColor = Colors.primary.copy(alpha = 0.3f)
                    ),
                    textStyle = AppTextStyles.small,
                    singleLine = true
                )

                // Selected count
                if (selectedFriendIds.isNotEmpty()) {
                    Text(
                        "${selectedFriendIds.size} selected",
                        style = AppTextStyles.small,
                        color = Colors.primary,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                }

                // Friends list
                if (filteredFriends.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        if (friends.isEmpty()) {
                            Text(
                                "No friends yet",
                                style = AppTextStyles.body,
                                color = Colors.textMuted,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        } else {
                            Text(
                                "No friends match '$searchQuery'",
                                style = AppTextStyles.body,
                                color = Colors.textMuted,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(filteredFriends) { friend ->
                            val isSelected = friend.id in selectedFriendIds

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(
                                        if (isSelected)
                                            Colors.primary.copy(alpha = 0.1f)
                                        else
                                            Colors.backgroundTertiary.copy(alpha = 0.3f)
                                    )
                                    .clickable {
                                        selectedFriendIds = if (isSelected) {
                                            selectedFriendIds - friend.id
                                        } else {
                                            selectedFriendIds + friend.id
                                        }
                                    }
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Checkbox
                                Checkbox(
                                    checked = isSelected,
                                    onCheckedChange = { checked ->
                                        selectedFriendIds = if (checked) {
                                            selectedFriendIds + friend.id
                                        } else {
                                            selectedFriendIds - friend.id
                                        }
                                    },
                                    colors = CheckboxDefaults.colors(
                                        checkedColor = Colors.primary,
                                        uncheckedColor = Colors.primary.copy(alpha = 0.5f)
                                    )
                                )

                                // Profile pic placeholder
                                Box(
                                    modifier = Modifier
                                        .size(40.dp)
                                        .clip(CircleShape)
                                        .background(Colors.primary.copy(alpha = 0.2f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        friend.name.firstOrNull()?.uppercaseChar().toString(),
                                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                        color = Colors.primary
                                    )
                                }

                                // Name
                                Text(
                                    friend.name,
                                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                    color = Colors.textPrimary,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }

                // Action buttons
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Text("Cancel", fontSize = 14.sp, color = Colors.primary)
                    }

                    Button(
                        onClick = {
                            onFriendsSelected(selectedFriendIds.toList())
                            onDismiss()
                        },
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (selectedFriendIds.isEmpty()) 
                                Colors.primary.copy(alpha = 0.5f) 
                            else 
                                Colors.primary
                        ),
                        enabled = selectedFriendIds.isNotEmpty()
                    ) {
                        Text("Add Selected", fontSize = 14.sp, color = Color.White)
                    }
                }
            }
        }
    }
}

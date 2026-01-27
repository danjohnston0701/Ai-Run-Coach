
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.FindFriendsUiState
import live.airuncoach.airuncoach.viewmodel.FriendsViewModel
import live.airuncoach.airuncoach.viewmodel.FriendsViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FindFriendsScreen(onNavigateBack: () -> Unit) {
    val viewModel: FriendsViewModel = viewModel(factory = FriendsViewModelFactory(LocalContext.current))
    val findFriendsState by viewModel.findFriendsState.collectAsState()
    val addedFriendIds by viewModel.addedFriendIds.collectAsState()
    var searchQuery by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Find Friends", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(id = R.drawable.icon_play_vector), contentDescription = "Back", tint = Colors.textPrimary)
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
                .padding(Spacing.lg)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    label = { Text("Search by name or referral") },
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Colors.textPrimary,
                        unfocusedTextColor = Colors.textPrimary,
                        cursorColor = Colors.primary,
                        focusedBorderColor = Colors.primary,
                        unfocusedBorderColor = Colors.textMuted
                    )
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Button(
                    onClick = { viewModel.searchUsers(searchQuery) },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Search")
                }
            }
            Spacer(modifier = Modifier.height(Spacing.lg))

            when (val state = findFriendsState) {
                is FindFriendsUiState.Idle -> EmptySearchState()
                is FindFriendsUiState.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally), color = Colors.primary)
                is FindFriendsUiState.Success -> {
                    if (state.users.isEmpty()) {
                        NoResultsState()
                    } else {
                        UserList(users = state.users, addedIds = addedFriendIds, onAddFriend = { viewModel.addFriend(it) })
                    }
                }
                is FindFriendsUiState.Error -> Text(text = state.message, color = Colors.error, modifier = Modifier.align(Alignment.CenterHorizontally))
            }
        }
    }
}

@Composable
fun EmptySearchState() { /* ... */ }

@Composable
fun NoResultsState() { /* ... */ }

@Composable
fun UserList(users: List<Friend>, addedIds: Set<String>, onAddFriend: (String) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(users) { user ->
            UserCard(user = user, isAdded = user.id in addedIds, onAddClick = { onAddFriend(user.id) })
            Spacer(modifier = Modifier.height(Spacing.md))
        }
    }
}

@Composable
fun UserCard(user: Friend, isAdded: Boolean, onAddClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(
                    model = user.profilePic,
                    contentDescription = "Profile Picture",
                    modifier = Modifier
                        .size(50.dp)
                        .clip(CircleShape)
                )
                Spacer(modifier = Modifier.width(Spacing.md))
                Text(
                    text = user.name,
                    style = AppTextStyles.h4,
                    color = Colors.textPrimary
                )
            }
            Button(
                onClick = onAddClick, 
                enabled = !isAdded,
                colors = ButtonDefaults.buttonColors(containerColor = if (isAdded) Colors.backgroundSecondary else Colors.primary)
            ) {
                Text(if (isAdded) "Added" else "Add")
            }
        }
    }
}


package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import live.airuncoach.airuncoach.viewmodel.FriendsUiState
import live.airuncoach.airuncoach.viewmodel.FriendsViewModel
import live.airuncoach.airuncoach.viewmodel.FriendsViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FriendsScreen(onNavigateBack: () -> Unit, onNavigateToFindFriends: () -> Unit) {
    val viewModel: FriendsViewModel = viewModel(factory = FriendsViewModelFactory(LocalContext.current))
    val friendsState by viewModel.friendsState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Friends", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (val state = friendsState) {
                is FriendsUiState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = Colors.primary)
                }
                is FriendsUiState.Success -> {
                    if (state.friends.isEmpty()) {
                        EmptyFriendsState(onNavigateToFindFriends)
                    } else {
                        FriendsList(friends = state.friends)
                    }
                }
                is FriendsUiState.Error -> {
                    Text(text = state.message, color = Colors.error, modifier = Modifier.align(Alignment.Center))
                }
            }
        }
    }
}

@Composable
fun EmptyFriendsState(onNavigateToFindFriends: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_profile_vector),
            contentDescription = "No Friends",
            tint = Colors.textMuted,
            modifier = Modifier.size(80.dp)
        )
        Spacer(modifier = Modifier.height(Spacing.lg))
        Text(
            text = "My Friends (0)",
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(
            text = "You haven\'t added any friends yet. Add friends to share your progress!",
            style = AppTextStyles.body,
            color = Colors.textSecondary,
        )
        Spacer(modifier = Modifier.height(Spacing.xl))
        Button(
            onClick = onNavigateToFindFriends,
            colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
        ) {
            Text("Find Friends")
        }
    }
}

@Composable
fun FriendsList(friends: List<Friend>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        items(friends) { friend ->
            FriendCard(friend = friend)
        }
    }
}

@Composable
fun FriendCard(friend: Friend) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Profile Picture
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(Colors.primary.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                if (!friend.profilePic.isNullOrBlank()) {
                    AsyncImage(
                        model = friend.profilePic,
                        contentDescription = "Profile Picture",
                        modifier = Modifier.fillMaxSize(),
                        error = painterResource(id = R.drawable.icon_profile_vector)
                    )
                } else {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_profile_vector),
                        contentDescription = "Default Avatar",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(Spacing.md))
            
            // Name and ID
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = friend.name,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "ID: ${friend.id.take(8)}...",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
            
            // Action Buttons
            Row(
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                // View Activity Button
                IconButton(
                    onClick = { /* TODO: Navigate to friend's activity */ },
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_eye),
                        contentDescription = "View Activity",
                        tint = Colors.primary,
                        modifier = Modifier.size(20.dp)
                    )
                }
                
                // Remove Friend Button
                IconButton(
                    onClick = { /* TODO: Remove friend */ },
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Remove Friend",
                        tint = Colors.error,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

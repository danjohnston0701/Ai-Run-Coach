
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
        contentPadding = PaddingValues(Spacing.lg)
    ) {
        items(friends) { friend ->
            FriendCard(friend = friend)
            Spacer(modifier = Modifier.height(Spacing.md))
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
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = friend.profilePicUrl,
                contentDescription = "Profile Picture",
                modifier = Modifier
                    .size(50.dp)
                    .clip(CircleShape)
            )
            Spacer(modifier = Modifier.width(Spacing.md))
            Text(
                text = friend.name,
                style = AppTextStyles.h4,
                color = Colors.textPrimary
            )
        }
    }
}


package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.network.model.FriendRequestItem
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FriendsScreen(onNavigateBack: () -> Unit) {
    val viewModel: FriendsViewModel = viewModel(factory = FriendsViewModelFactory(LocalContext.current))
    val friendsState by viewModel.friendsState.collectAsState()
    val searchState by viewModel.searchState.collectAsState()
    val pendingRequestsState by viewModel.pendingRequestsState.collectAsState()
    @Suppress("UNUSED_VARIABLE") val addedFriendIds by viewModel.addedFriendIds.collectAsState()
    var searchQuery by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "Friends", 
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), 
                        color = Colors.textPrimary
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack, 
                            contentDescription = "Back", 
                            tint = Colors.textPrimary
                        )
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
                
                .padding(horizontal = Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.lg)
        ) {
            // Search Section
            item {
                val keyboardController = LocalSoftwareKeyboardController.current
                Spacer(modifier = Modifier.height(Spacing.md))
                /*
                Text(
                    text = "Find Friends",
                    style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                 */
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Search by name or email address",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
                Spacer(modifier = Modifier.height(Spacing.md))

                // Unified search bar
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = Colors.backgroundSecondary,
                    tonalElevation = 0.dp
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = Spacing.md, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            tint = if (searchQuery.isNotBlank()) Colors.primary else Colors.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        TextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = {
                                Text(
                                    "Search by name or email",
                                    style = AppTextStyles.body,
                                    color = Colors.textMuted
                                )
                            },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            colors = TextFieldDefaults.colors(
                                focusedTextColor = Colors.textPrimary,
                                unfocusedTextColor = Colors.textPrimary,
                                cursorColor = Colors.primary,
                                focusedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                                unfocusedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                                focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                                unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                                disabledIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                            ),
                            textStyle = AppTextStyles.body,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                            keyboardActions = KeyboardActions(onSearch = {
                                if (searchQuery.isNotBlank()) {
                                    viewModel.searchUsers(searchQuery)
                                    keyboardController?.hide()
                                }
                            })
                        )
                        if (searchQuery.isNotBlank()) {
                            IconButton(
                                onClick = {
                                    searchQuery = ""
                                    viewModel.clearSearch()
                                },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Clear",
                                    tint = Colors.textMuted,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                        FilledIconButton(
                            onClick = {
                                if (searchQuery.isNotBlank()) {
                                    viewModel.searchUsers(searchQuery)
                                    keyboardController?.hide()
                                }
                            },
                            modifier = Modifier.size(36.dp),
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = if (searchQuery.isNotBlank()) Colors.primary else Colors.backgroundSecondary
                            )
                        ) {
                            Icon(
                                imageVector = Icons.Default.Search,
                                contentDescription = "Search",
                                tint = if (searchQuery.isNotBlank()) androidx.compose.ui.graphics.Color.White else Colors.textMuted,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }

            // Search Results
            when (val state = searchState) {
                is SearchUiState.Loading -> {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(Spacing.lg)) {
                            CircularProgressIndicator(
                                modifier = Modifier.align(Alignment.Center),
                                color = Colors.primary
                            )
                        }
                    }
                }
                is SearchUiState.Success -> {
                    if (state.users.isNotEmpty()) {
                        items(state.users) { user ->
                            SearchUserCard(
                                user = user,
                                onAddClick = { viewModel.sendFriendRequest(user.id) },
                                onWithdrawClick = { requestId -> viewModel.cancelSentRequest(requestId) }
                            )
                        }
                    } else if (searchQuery.isNotBlank()) {
                        item {
                            Text(
                                text = "No users found",
                                style = AppTextStyles.body,
                                color = Colors.textSecondary,
                                modifier = Modifier.padding(Spacing.md)
                            )
                        }
                    }
                }
                is SearchUiState.Error -> {
                    item {
                        Text(
                            text = state.message,
                            color = Colors.error,
                            modifier = Modifier.padding(Spacing.md)
                        )
                    }
                }
                else -> {}
            }
    /* Remove Invite Link Section
            // Add by invite link section
            item {
                val keyboardController2 = LocalSoftwareKeyboardController.current
                var inviteLink by remember { mutableStateOf("") }
                var inviteLinkError by remember { mutableStateOf<String?>(null) }

                Spacer(modifier = Modifier.height(Spacing.md))

                // Section header
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text(
                        text = "Add via Invite Link",
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Paste a friend's invite link to send them a request",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
                Spacer(modifier = Modifier.height(Spacing.md))

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = Colors.backgroundSecondary
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = Spacing.md, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_people_vector),
                            contentDescription = null,
                            tint = if (inviteLink.isNotBlank()) Colors.primary else Colors.textMuted,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        TextField(
                            value = inviteLink,
                            onValueChange = { inviteLink = it; inviteLinkError = null },
                            placeholder = {
                                Text(
                                    "Paste invite link here…",
                                    style = AppTextStyles.body,
                                    color = Colors.textMuted
                                )
                            },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            colors = TextFieldDefaults.colors(
                                focusedTextColor = Colors.textPrimary,
                                unfocusedTextColor = Colors.textPrimary,
                                cursorColor = Colors.primary,
                                focusedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                                unfocusedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                                focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                                unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                                disabledIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                            ),
                            textStyle = AppTextStyles.body,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                            keyboardActions = KeyboardActions(onGo = {
                                val userId = extractUserIdFromInviteLink(inviteLink)
                                if (userId != null) {
                                    viewModel.sendFriendRequest(userId)
                                    inviteLink = ""
                                    keyboardController2?.hide()
                                } else {
                                    inviteLinkError = "Invalid invite link"
                                }
                            })
                        )
                        if (inviteLink.isNotBlank()) {
                            IconButton(onClick = { inviteLink = ""; inviteLinkError = null }, modifier = Modifier.size(32.dp)) {
                                Icon(imageVector = Icons.Default.Close, contentDescription = "Clear", tint = Colors.textMuted, modifier = Modifier.size(16.dp))
                            }
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                        FilledIconButton(
                            onClick = {
                                val userId = extractUserIdFromInviteLink(inviteLink)
                                if (userId != null) {
                                    viewModel.sendFriendRequest(userId)
                                    inviteLink = ""
                                    keyboardController2?.hide()
                                } else {
                                    inviteLinkError = "Invalid invite link"
                                }
                            },
                            modifier = Modifier.size(36.dp),
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = if (inviteLink.isNotBlank()) Colors.primary else Colors.backgroundSecondary
                            )
                        ) {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_people_vector),
                                contentDescription = "Add Friend",
                                tint = if (inviteLink.isNotBlank()) androidx.compose.ui.graphics.Color.White else Colors.textMuted,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }

                if (inviteLinkError != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = inviteLinkError!!,
                        style = AppTextStyles.caption,
                        color = Colors.error
                    )
                }
            }
            */

            // Pending Friend Requests Section - always show header
            item {
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Pending Requests",
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    // Refresh button
                    TextButton(onClick = { viewModel.loadPendingRequests() }) {
                        Text("Refresh", style = AppTextStyles.caption, color = Colors.primary)
                    }
                }
            }

            when (val state = pendingRequestsState) {
                is PendingRequestsUiState.Loading -> {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(Spacing.md)) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp).align(Alignment.Center),
                                color = Colors.primary,
                                strokeWidth = 2.dp
                            )
                        }
                    }
                }
                is PendingRequestsUiState.Success -> {
                    if (state.received.isEmpty() && state.sent.isEmpty()) {
                        item {
                            Text(
                                text = "No pending requests",
                                style = AppTextStyles.caption,
                                color = Colors.textMuted,
                                modifier = Modifier.padding(vertical = Spacing.sm)
                            )
                        }
                    }

                    // Received requests (waiting for you to accept/decline)
                    items(state.received) { request ->
                        PendingRequestCard(
                            request = request,
                            isIncoming = true,
                            onAccept = { viewModel.acceptFriendRequest(request.id) },
                            onDecline = { viewModel.declineFriendRequest(request.id) },
                            onCancel = {}
                        )
                    }

                    // Sent requests (waiting for them to accept)
                    items(state.sent) { request ->
                        PendingRequestCard(
                            request = request,
                            isIncoming = false,
                            onAccept = {},
                            onDecline = {},
                            onCancel = { viewModel.cancelSentRequest(request.id) }
                        )
                    }
                }
                is PendingRequestsUiState.Error -> {
                    item {
                        Text(
                            text = "⚠️ ${state.message}",
                            style = AppTextStyles.caption,
                            color = Colors.error,
                            modifier = Modifier.padding(vertical = Spacing.sm)
                        )
                    }
                }
            }

            // Invite Friend Section
            item {
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Invite Friends",
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
            }

            item {
                FriendInviteLinkCard(context = LocalContext.current)
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // My Friends Section
            item {
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    text = "My Friends",
                    style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }

            when (val state = friendsState) {
                is FriendsUiState.Loading -> {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(Spacing.lg)) {
                            CircularProgressIndicator(
                                modifier = Modifier.align(Alignment.Center),
                                color = Colors.primary
                            )
                        }
                    }
                }
                is FriendsUiState.Success -> {
                    if (state.friends.isEmpty()) {
                        item {
                            Text(
                                text = "No friends yet. Search for users above to send friend requests!",
                                style = AppTextStyles.body,
                                color = Colors.textSecondary,
                                modifier = Modifier.padding(Spacing.md)
                            )
                        }
                    } else {
                        items(state.friends) { friend ->
                            FriendCard(friend = friend)
                        }
                    }
                }
                is FriendsUiState.Error -> {
                    item {
                        Text(
                            text = state.message,
                            color = Colors.error,
                            modifier = Modifier.padding(Spacing.md)
                        )
                    }
                }
            }

            item { Spacer(modifier = Modifier.height(Spacing.xl)) }
        }
    }
}

@Composable
fun SearchUserCard(
    user: Friend,
    onAddClick: () -> Unit,
    onWithdrawClick: (requestId: String) -> Unit
) {
    // Determine state: prefer DB-sourced status, fall back to nothing
    val dbStatus = user.friendRequestStatus  // "pending", "declined", "withdrawn", "accepted", "received_pending", null
    val requestId = user.friendRequestId

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                // Profile Picture
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(Colors.primary.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    if (!user.profilePic.isNullOrBlank()) {
                        AsyncImage(
                            model = user.profilePic,
                            contentDescription = "Profile Picture",
                            modifier = Modifier.fillMaxSize()
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
                Column {
                    Text(
                        text = user.name,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = user.email,
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            when {
                dbStatus == "accepted" -> {
                    // Already friends
                    Text(
                        text = "Friends ✓",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = Colors.success,
                        modifier = Modifier.padding(horizontal = Spacing.sm)
                    )
                }
                dbStatus == "pending" && requestId != null -> {
                    // Sent, awaiting response — show Withdraw button
                    Button(
                        onClick = { onWithdrawClick(requestId) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.error.copy(alpha = 0.15f),
                            contentColor = Colors.error
                        ),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text("Withdraw", fontSize = 13.sp)
                    }
                }
                dbStatus == "received_pending" -> {
                    // They sent us a request — show Accept
                    Button(
                        onClick = onAddClick,
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.success),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text("Accept", fontSize = 13.sp)
                    }
                }
                else -> {
                    // No request, or previously declined/withdrawn — show Add Friend
                    Button(
                        onClick = onAddClick,
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text("Add Friend", fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun PendingRequestCard(
    request: FriendRequestItem,
    isIncoming: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit
) {
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
                val profilePic = if (isIncoming) request.requesterProfilePic else request.addresseeProfilePic
                if (!profilePic.isNullOrBlank()) {
                    AsyncImage(
                        model = profilePic,
                        contentDescription = "Profile Picture",
                        modifier = Modifier.fillMaxSize()
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

            Column(modifier = Modifier.weight(1f)) {
                val name = if (isIncoming) request.requesterName else request.addresseeName
                Text(
                    text = name ?: "Unknown User",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Text(
                    text = if (isIncoming) "Wants to be friends" else "Request pending",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }

            // Action Buttons
            if (isIncoming) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    IconButton(
                        onClick = onAccept,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = "Accept",
                            tint = Colors.success,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    IconButton(
                        onClick = onDecline,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = "Decline",
                            tint = Colors.error,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            } else {
                Button(
                    onClick = onCancel,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.error.copy(alpha = 0.1f),
                        contentColor = Colors.error
                    ),
                    modifier = Modifier.height(36.dp),
                    enabled = true
                ) {
                    Text(
                        "Withdraw",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                        fontSize = 12.sp
                    )
                }
            }
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

            // Name and Email
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = friend.name,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = friend.email,
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }

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
        }
    }
}

/**
 * Extracts the userId from an AI Run Coach invite link.
 * Supports formats like:
 *   https://airuncoach.live/invite/{userId}
 *   airuncoach://invite/{userId}
 */
fun extractUserIdFromInviteLink(link: String): String? {
    val trimmed = link.trim()
    // Match /invite/<userId> segment
    val regex = Regex("""/invite/([a-zA-Z0-9\-]+)""")
    return regex.find(trimmed)?.groupValues?.getOrNull(1)?.takeIf { it.length >= 8 }
}

// ── Friend Invite Link Card ──────────────────────────────────────────────────

private const val INVITE_BASE_URL = "https://airuncoach.live/invite"

@Composable
fun FriendInviteLinkCard(context: android.content.Context) {
    // Get current user ID from session/shared prefs
    val sharedPrefs = context.getSharedPreferences("user_prefs", android.content.Context.MODE_PRIVATE)
    val userJson = sharedPrefs.getString("user", null)
    val gson = com.google.gson.Gson()
    val user = try {
        if (userJson != null) gson.fromJson(userJson, live.airuncoach.airuncoach.domain.model.User::class.java) else null
    } catch (@Suppress("UNUSED_VARIABLE") e: Exception) {
        null
    }
    
    val userId = user?.id ?: return
    val inviteUrl = "$INVITE_BASE_URL/$userId"
    var copied by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Header row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Colors.primary.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.Share,
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Column {
                    Text(
                        text = "Invite a Friend",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = "Share your link so friends can add you",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Link pill
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Colors.backgroundRoot)
                    .padding(horizontal = Spacing.md, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = inviteUrl,
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Medium),
                    color = Colors.textSecondary,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Action buttons
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                // Copy button
                OutlinedButton(
                    onClick = {
                        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Friend invite link", inviteUrl))
                        copied = true
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = if (copied) Colors.success else Colors.primary),
                    border = ButtonDefaults.outlinedButtonBorder.copy(
                        brush = androidx.compose.ui.graphics.SolidColor(if (copied) Colors.success else Colors.primary)
                    )
                ) {
                    Icon(
                        imageVector = Icons.Filled.ContentCopy,
                        contentDescription = "Copy",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(if (copied) "Copied!" else "Copy Link", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold))
                }

                // Share button
                Button(
                    onClick = {
                        val sendIntent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(android.content.Intent.EXTRA_SUBJECT, "Join me on AI Run Coach!")
                            putExtra(
                                android.content.Intent.EXTRA_TEXT,
                                "Hey! I'm using AI Run Coach to track my runs and get AI coaching. " +
                                "Click this link to add me as a friend: $inviteUrl"
                            )
                        }
                        context.startActivity(android.content.Intent.createChooser(sendIntent, "Share via"))
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Share,
                        contentDescription = "Share",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Share", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

/**
 * Garmin Permissions Management Screen
 * 
 * Allows users to view and manage their Garmin data access permissions
 * Shows which scopes are granted and allows re-authorization to request new permissions
 */

package com.airuncoach.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// ============================================================================
// DATA MODELS
// ============================================================================

data class GarminPermission(
  val id: String,
  val name: String,
  val description: String,
  val icon: String,
  val isGranted: Boolean,
  val category: String // "activities" | "health" | "wellness"
)

data class GarminPermissionsState(
  val deviceName: String? = null,
  val connectedSince: String? = null,
  val lastSyncAt: String? = null,
  val permissions: List<GarminPermission> = emptyList(),
  val isLoading: Boolean = false,
  val error: String? = null,
  val showReauthorizeDialog: Boolean = false,
  val reauthorizeInProgress: Boolean = false,
  val reauthorizeUrl: String? = null
)

// ============================================================================
// VIEWMODEL
// ============================================================================

@HiltViewModel
class GarminPermissionsViewModel @Inject constructor(
  private val garminService: GarminPermissionsService
) : ViewModel() {

  private val _state = MutableStateFlow(GarminPermissionsState())
  val state: StateFlow<GarminPermissionsState> = _state.asStateFlow()

  init {
    loadPermissions()
  }

  fun loadPermissions() {
    viewModelScope.launch {
      _state.value = _state.value.copy(isLoading = true, error = null)
      try {
        val permissions = garminService.getPermissions()
        _state.value = permissions.copy(isLoading = false)
      } catch (e: Exception) {
        _state.value = _state.value.copy(
          isLoading = false,
          error = "Failed to load permissions: ${e.message}"
        )
      }
    }
  }

  fun showReauthorizeDialog() {
    _state.value = _state.value.copy(showReauthorizeDialog = true)
  }

  fun hideReauthorizeDialog() {
    _state.value = _state.value.copy(showReauthorizeDialog = false)
  }

  fun reauthorizeGarmin() {
    viewModelScope.launch {
      _state.value = _state.value.copy(reauthorizeInProgress = true, error = null)
      try {
        val url = garminService.getReauthorizationUrl()
        _state.value = _state.value.copy(reauthorizeUrl = url)
        // In a real app, you'd open this URL in a browser/WebView
        // The app will be notified via deep link when authorization is complete
      } catch (e: Exception) {
        _state.value = _state.value.copy(
          reauthorizeInProgress = false,
          error = "Failed to get authorization URL: ${e.message}"
        )
      }
    }
  }

  fun disconnectGarmin(onSuccess: () -> Unit) {
    viewModelScope.launch {
      try {
        garminService.disconnectDevice()
        onSuccess()
      } catch (e: Exception) {
        _state.value = _state.value.copy(error = "Failed to disconnect: ${e.message}")
      }
    }
  }
}

// ============================================================================
// UI COMPOSABLES
// ============================================================================

@Composable
fun GarminPermissionsScreen(
  onBackClick: () -> Unit,
  viewModel: GarminPermissionsViewModel = hiltViewModel()
) {
  val state by viewModel.state.collectAsState()
  var showDisconnectDialog by remember { mutableStateOf(false) }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color(0xFF0F0F0F))
  ) {
    // Header
    GarminPermissionsHeader(onBackClick = onBackClick)

    if (state.isLoading) {
      Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
      ) {
        CircularProgressIndicator(color = Color(0xFF00D4FF))
      }
    } else if (state.error != null) {
      ErrorState(error = state.error!!, onRetry = { viewModel.loadPermissions() })
    } else {
      LazyColumn(
        modifier = Modifier
          .fillMaxSize()
          .verticalScroll(rememberScrollState()),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
      ) {
        // Device Info
        item {
          DeviceInfoCard(
            deviceName = state.deviceName ?: "Unknown Device",
            connectedSince = state.connectedSince,
            lastSyncAt = state.lastSyncAt
          )
        }

        // Permissions by Category
        item {
          Text(
            "DATA ACCESS PERMISSIONS",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(top = 8.dp)
          )
        }

        val groupedPermissions = state.permissions.groupBy { it.category }

        groupedPermissions.forEach { (category, permissions) ->
          item {
            PermissionCategoryCard(
              category = category,
              permissions = permissions
            )
          }
        }

        // Action Buttons
        item {
          ActionButtonsSection(
            onReauthorize = { viewModel.showReauthorizeDialog() },
            onDisconnect = { showDisconnectDialog = true }
          )
        }

        item {
          Spacer(modifier = Modifier.height(32.dp))
        }
      }
    }
  }

  // Reauthorize Dialog
  if (state.showReauthorizeDialog) {
    ReauthorizeConfirmationDialog(
      onConfirm = {
        viewModel.reauthorizeGarmin()
        viewModel.hideReauthorizeDialog()
      },
      onDismiss = { viewModel.hideReauthorizeDialog() }
    )
  }

  // Disconnect Dialog
  if (showDisconnectDialog) {
    DisconnectConfirmationDialog(
      onConfirm = {
        viewModel.disconnectGarmin(onSuccess = onBackClick)
        showDisconnectDialog = false
      },
      onDismiss = { showDisconnectDialog = false }
    )
  }
}

@Composable
fun GarminPermissionsHeader(onBackClick: () -> Unit) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .background(Color(0xFF1A1A1A))
      .padding(16.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically
  ) {
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      IconButton(onClick = onBackClick) {
        Text("←", fontSize = 24.sp, color = Color(0xFF00D4FF))
      }
      Column {
        Text(
          "Garmin Permissions",
          fontSize = 16.sp,
          fontWeight = FontWeight.Bold,
          color = Color.White
        )
        Text(
          "Manage data access",
          fontSize = 11.sp,
          color = Color(0xFF888888)
        )
      }
    }
  }
}

@Composable
fun DeviceInfoCard(
  deviceName: String,
  connectedSince: String?,
  lastSyncAt: String?
) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(12.dp),
    backgroundColor = Color(0xFF1A1A1A),
    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
  ) {
    Column(
      modifier = Modifier.padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Column {
          Text(
            "🔌 $deviceName",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White
          )
          if (connectedSince != null) {
            Text(
              "Connected $connectedSince",
              fontSize = 11.sp,
              color = Color(0xFF888888)
            )
          }
        }
        Surface(
          modifier = Modifier
            .background(Color(0xFF00FF88), shape = RoundedCornerShape(6.dp))
            .padding(6.dp),
          color = Color.Transparent
        ) {
          Text(
            "✓ Active",
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF000000)
          )
        }
      }

      if (lastSyncAt != null) {
        Divider(
          modifier = Modifier.fillMaxWidth(),
          color = Color(0xFF333333),
          thickness = 1.dp
        )
        Text(
          "Last synced: $lastSyncAt",
          fontSize = 11.sp,
          color = Color(0xFF666666)
        )
      }
    }
  }
}

@Composable
fun PermissionCategoryCard(
  category: String,
  permissions: List<GarminPermission>
) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(12.dp),
    backgroundColor = Color(0xFF1A1A1A),
    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
  ) {
    Column(
      modifier = Modifier.padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      // Category Header
      Text(
        getCategoryLabel(category),
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color(0xFFB0B0B0)
      )

      // Permissions
      permissions.forEach { permission ->
        PermissionItemRow(permission = permission)
      }
    }
  }
}

@Composable
fun PermissionItemRow(permission: GarminPermission) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 4.dp),
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    verticalAlignment = Alignment.CenterVertically
  ) {
    // Status Icon
    Text(
      if (permission.isGranted) "✓" else "○",
      fontSize = 14.sp,
      color = if (permission.isGranted) Color(0xFF00FF88) else Color(0xFF666666),
      fontWeight = FontWeight.Bold
    )

    // Permission Icon & Name
    Column(modifier = Modifier.weight(1f)) {
      Text(
        "${permission.icon} ${permission.name}",
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (permission.isGranted) Color.White else Color(0xFF888888)
      )
      Text(
        permission.description,
        fontSize = 10.sp,
        color = Color(0xFF666666)
      )
    }

    // Status Badge
    Surface(
      modifier = Modifier
        .background(
          if (permission.isGranted) Color(0xFF00FF88).copy(alpha = 0.2f)
          else Color(0xFF666666).copy(alpha = 0.2f),
          shape = RoundedCornerShape(4.dp)
        )
        .padding(4.dp),
      color = Color.Transparent
    ) {
      Text(
        if (permission.isGranted) "Granted" else "Not granted",
        fontSize = 9.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (permission.isGranted) Color(0xFF00FF88) else Color(0xFF888888)
      )
    }
  }
}

@Composable
fun ActionButtonsSection(
  onReauthorize: () -> Unit,
  onDisconnect: () -> Unit
) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Button(
      onClick = onReauthorize,
      modifier = Modifier
        .fillMaxWidth()
        .height(44.dp),
      colors = ButtonDefaults.buttonColors(
        containerColor = Color(0xFF00D4FF)
      ),
      shape = RoundedCornerShape(8.dp)
    ) {
      Text(
        "Update Permissions",
        fontWeight = FontWeight.SemiBold,
        color = Color(0xFF000000)
      )
    }

    Button(
      onClick = onDisconnect,
      modifier = Modifier
        .fillMaxWidth()
        .height(44.dp),
      colors = ButtonDefaults.buttonColors(
        containerColor = Color(0xFF3A1A1A)
      ),
      shape = RoundedCornerShape(8.dp)
    ) {
      Text(
        "Disconnect Device",
        fontWeight = FontWeight.SemiBold,
        color = Color(0xFFFF5555)
      )
    }

    Text(
      "Disconnecting will stop syncing Garmin data. You can reconnect anytime.",
      fontSize = 10.sp,
      color = Color(0xFF666666),
      textAlign = TextAlign.Center,
      modifier = Modifier
        .fillMaxWidth()
        .padding(top = 8.dp)
    )
  }
}

@Composable
fun ReauthorizeConfirmationDialog(
  onConfirm: () -> Unit,
  onDismiss: () -> Unit
) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Text("Update Garmin Permissions?", color = Color.White)
    },
    text = {
      Text(
        "You'll be taken to Garmin to review and update your data permissions. You can grant access to new data types or modify existing permissions.",
        color = Color(0xFFDDDDDD)
      )
    },
    confirmButton = {
      Button(
        onClick = onConfirm,
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00D4FF))
      ) {
        Text("Continue", color = Color(0xFF000000))
      }
    },
    dismissButton = {
      Button(
        onClick = onDismiss,
        colors = ButtonDefaults.buttonColors(
          containerColor = Color.Transparent,
          contentColor = Color(0xFF00D4FF)
        )
      ) {
        Text("Cancel")
      }
    },
    containerColor = Color(0xFF1A1A1A)
  )
}

@Composable
fun DisconnectConfirmationDialog(
  onConfirm: () -> Unit,
  onDismiss: () -> Unit
) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Text("Disconnect Garmin?", color = Color.White)
    },
    text = {
      Text(
        "You will stop receiving Garmin data syncs. Your existing run history will be preserved, but no new data will be added. You can reconnect your device anytime.",
        color = Color(0xFFDDDDDD)
      )
    },
    confirmButton = {
      Button(
        onClick = onConfirm,
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF5555))
      ) {
        Text("Disconnect", color = Color.White)
      }
    },
    dismissButton = {
      Button(
        onClick = onDismiss,
        colors = ButtonDefaults.buttonColors(
          containerColor = Color.Transparent,
          contentColor = Color(0xFF00D4FF)
        )
      ) {
        Text("Cancel")
      }
    },
    containerColor = Color(0xFF1A1A1A)
  )
}

@Composable
fun ErrorState(
  error: String,
  onRetry: () -> Unit
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(16.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(
      "⚠️",
      fontSize = 48.sp,
      modifier = Modifier.padding(bottom = 16.dp)
    )
    Text(
      "Failed to Load Permissions",
      fontSize = 16.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White,
      textAlign = TextAlign.Center
    )
    Spacer(modifier = Modifier.height(8.dp))
    Text(
      error,
      fontSize = 12.sp,
      color = Color(0xFF888888),
      textAlign = TextAlign.Center
    )
    Spacer(modifier = Modifier.height(24.dp))
    Button(
      onClick = onRetry,
      colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00D4FF))
    ) {
      Text("Retry", color = Color(0xFF000000))
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fun getCategoryLabel(category: String): String = when (category) {
  "activities" -> "📊 Activities & Running"
  "health" -> "❤️ Health & Recovery"
  "wellness" -> "😴 Wellness & Stress"
  else -> category
}

// ============================================================================
// SERVICE (Mock - will be injected)
// ============================================================================

interface GarminPermissionsService {
  suspend fun getPermissions(): GarminPermissionsState
  suspend fun getReauthorizationUrl(): String
  suspend fun disconnectDevice()
}

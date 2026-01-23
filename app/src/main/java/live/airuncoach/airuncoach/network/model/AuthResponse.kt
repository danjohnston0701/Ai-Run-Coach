package live.airuncoach.airuncoach.network.model

import live.airuncoach.airuncoach.domain.model.User

data class AuthResponse(
    val token: String?,
    val user: User?
)

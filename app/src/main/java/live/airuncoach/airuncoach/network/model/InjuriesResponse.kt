package live.airuncoach.airuncoach.network.model

import live.airuncoach.airuncoach.domain.model.Injury

/**
 * Response from GET /api/user/injuries
 * Contains injuries organized by status
 */
data class InjuriesResponse(
    val active: List<Injury> = emptyList(),
    val chronic: List<Injury> = emptyList(),
    val healed: List<Injury> = emptyList(),
    val all: List<Injury> = emptyList()
)

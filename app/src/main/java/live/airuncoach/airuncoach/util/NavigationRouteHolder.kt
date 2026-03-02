package live.airuncoach.airuncoach.util

import live.airuncoach.airuncoach.domain.model.TurnInstruction

/**
 * Static holder to pass route navigation data to RunTrackingService.
 * Intent extras can't carry complex lists reliably (size limits, serialization),
 * so we use a static holder pattern (same as RunConfigHolder).
 *
 * Set before starting the service, consumed once on service start.
 */
object NavigationRouteHolder {

    /** Encoded Google polyline for the planned route */
    var polyline: String? = null
        private set

    /** Turn-by-turn navigation instructions with GPS coordinates */
    var turnInstructions: List<TurnInstruction> = emptyList()
        private set

    fun set(polyline: String?, instructions: List<TurnInstruction>) {
        this.polyline = polyline
        this.turnInstructions = instructions
    }

    /**
     * Consume and clear the data (call once from service).
     * Returns null if no data was set.
     */
    fun consume(): Pair<String?, List<TurnInstruction>>? {
        val poly = polyline
        val instr = turnInstructions
        if (poly == null && instr.isEmpty()) return null
        polyline = null
        turnInstructions = emptyList()
        return Pair(poly, instr)
    }

    fun clear() {
        polyline = null
        turnInstructions = emptyList()
    }
}

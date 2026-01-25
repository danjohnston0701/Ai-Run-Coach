
package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class Plan(val name: String, val price: String, val discount: String? = null)

class SubscriptionViewModel : ViewModel() {

    private val _plans = MutableStateFlow<List<Plan>>(emptyList())
    val plans: StateFlow<List<Plan>> = _plans.asStateFlow()

    private val _selectedPlan = MutableStateFlow<Plan?>(null)
    val selectedPlan: StateFlow<Plan?> = _selectedPlan.asStateFlow()

    init {
        loadPlans()
    }

    private fun loadPlans() {
        val planList = listOf(
            Plan("Monthly", "$9.99/month"),
            Plan("Yearly", "$79.99/year", "Save 33%")
        )
        _plans.value = planList
        _selectedPlan.value = planList.last()
    }

    fun selectPlan(plan: Plan) {
        _selectedPlan.value = plan
    }
}

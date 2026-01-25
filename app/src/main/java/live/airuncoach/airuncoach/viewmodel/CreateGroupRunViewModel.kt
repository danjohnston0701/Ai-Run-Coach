
package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class CreateGroupRunViewModel : ViewModel() {

    private val _runName = MutableStateFlow("")
    val runName: StateFlow<String> = _runName.asStateFlow()

    private val _meetingPoint = MutableStateFlow("")
    val meetingPoint: StateFlow<String> = _meetingPoint.asStateFlow()

    private val _description = MutableStateFlow("")
    val description: StateFlow<String> = _description.asStateFlow()

    private val _distance = MutableStateFlow("")
    val distance: StateFlow<String> = _distance.asStateFlow()

    private val _maxParticipants = MutableStateFlow("")
    val maxParticipants: StateFlow<String> = _maxParticipants.asStateFlow()

    private val _dateTime = MutableStateFlow("")
    val dateTime: StateFlow<String> = _dateTime.asStateFlow()

    fun onRunNameChanged(name: String) {
        _runName.value = name
    }

    fun onMeetingPointChanged(point: String) {
        _meetingPoint.value = point
    }

    fun onDescriptionChanged(desc: String) {
        _description.value = desc
    }

    fun onDistanceChanged(dist: String) {
        _distance.value = dist
    }

    fun onMaxParticipantsChanged(participants: String) {
        _maxParticipants.value = participants
    }

    fun onDateTimeChanged(dt: String) {
        _dateTime.value = dt
    }

    fun createGroupRun() {
        viewModelScope.launch {
            // TODO: Implement group run creation logic
        }
    }
}

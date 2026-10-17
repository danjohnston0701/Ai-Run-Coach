package live.airuncoach.airuncoach.wear.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.wear.compose.foundation.rotary.RotaryScrollableDefaults
import androidx.wear.compose.foundation.rotary.rotaryScrollable
import androidx.wear.compose.material.PositionIndicator

/**
 * Container for the text-and-button screens (waiting, prepare gate, GPS wait, ready, paused,
 * confirm). Centred when it fits; scrolls by touch, bezel or crown when it doesn't — which is
 * what happens at the larger system font sizes, where a fixed column ran off the round face
 * (Play's Wear review rejected 1000009 for "texts are cut off when a large font size is
 * selected"). Insets keep text clear of the round edge: ~10% at the sides, and a deeper bottom
 * inset so the last line can scroll up out of the narrow bottom of the circle. The screens with
 * the logo header start near the top (the logo is narrow), the rest centre.
 */
@Composable
fun ScrollingScreen(
    modifier: Modifier = Modifier,
    verticalArrangement: Arrangement.Vertical = Arrangement.Center,
    content: @Composable ColumnScope.() -> Unit
) {
    val scrollState = rememberScrollState()
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val screenWidth = maxWidth
        val screenHeight = maxHeight
        Box(
            modifier = Modifier
                .fillMaxSize()
                .rotaryScrollable(RotaryScrollableDefaults.behavior(scrollState), focusRequester)
                .verticalScroll(scrollState)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = screenHeight)
                    .padding(
                        start = screenWidth * 0.10f,
                        end = screenWidth * 0.10f,
                        top = screenHeight * 0.05f,
                        bottom = screenHeight * 0.14f
                    ),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = verticalArrangement,
                content = content
            )
        }
        PositionIndicator(scrollState = scrollState)
    }
}

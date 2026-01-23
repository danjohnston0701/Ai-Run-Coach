package live.airuncoach.airuncoach.ui.theme

import androidx.compose.ui.graphics.Color

object Colors {
    // Primary Brand Colors
    val primary = Color(0xFF00D4FF)           // Bright cyan/teal - main accent
    val primaryDark = Color(0xFF00B8E6)       // Pressed/active state
    val accent = Color(0xFFFF6B35)            // Warm orange - CTAs, highlights

    // Semantic Colors
    val success = Color(0xFF00E676)           // Green - achievements, good pace
    val warning = Color(0xFFFFB300)           // Amber - moderate, caution
    val error = Color(0xFFFF5252)             // Red - errors, extreme difficulty

    // Background Colors (Darkest to Lightest)
    val backgroundRoot = Color(0xFF0A0F1A)    // Deep dark blue-black (main bg)
    val backgroundDefault = Color(0xFF111827) // Slightly lighter
    val backgroundSecondary = Color(0xFF1F2937) // Card backgrounds
    val backgroundTertiary = Color(0xFF374151)  // Elevated elements, inputs

    // Text Colors
    val textPrimary = Color(0xFFFFFFFF)       // White - headings, main text
    val textSecondary = Color(0xFFA0AEC0)     // Light gray - descriptions
    val textMuted = Color(0xFF718096)         // Muted gray - labels, hints
    val buttonText = Color(0xFF0A0F1A)        // Dark - on primary buttons

    // Border Colors
    val border = Color(0xFF2D3748)            // Default borders
    val borderLight = Color(0xFF4A5568)       // Lighter borders

    // Overlay
    val overlay = Color(0xB3000000)           // 70% black overlay

    // Difficulty Colors
    val difficultyEasy = success
    val difficultyModerate = warning
    val difficultyHard = accent
    val difficultyExtreme = error

    // Route Gradient (Start to End)
    val routeGradientStart = Color(0xFF00D4FF) // Cyan
    val routeGradientEnd = Color(0xFF00E676)   // Green
}

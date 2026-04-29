# Elite Watch UI Redesign

## Current Issues
- Generic layout lacking visual hierarchy
- Typography too uniform
- No animation/movement (feels static)
- Coaching cue blends in
- Missing premium polish
- Poor use of screen space
- Generic color treatment

## Elite Redesign Principles

### 1. **Dramatic Visual Hierarchy**
```
TIMER (HUGE, top-center)
    ↓ (massive white space)
ZONE ARC (full-width compass rose)
    ↓ (breathing space)
PACE (primary metric, massive)
DISTANCE | HR | CADENCE (secondary row)
```

### 2. **Typography Mastery**
- **Timer**: NUMBER_HOT (biggest, must read at glance while running)
- **Pace**: Reduced from NUMBER_MILD to NUMBER_MEDIUM (still huge but not drowning timer)
- **Secondary row**: SMALL for values, XTINY for labels
- **Coaching cue**: MEDIUM, bold, golden overlay (always readable)

### 3. **Premium Motion**
- Zone arcs pulse with heartbeat rhythm
- Timer flickers cyan on zone change
- Coaching cue fades in from top (not instant)
- Paused banner orange with pulsing animation
- Smooth zone color transitions

### 4. **Smart Color Strategy**
- **Active zone**: Full brightness + glow + highlight
- **Inactive zones**: Dimmed but visible
- **HR badge**: Zone-colored background (dark) with zone text
- **Coaching cue**: Golden/amber (#FFD700) on semi-transparent dark background
- **Timer**: Cyan on zone change (attention grabber)

### 5. **Refined Layout Grid**
```
h*0.04  — TIMER (NUMBER_HOT)
h*0.14  — Blank (breathing space)
h*0.15-0.50 — ZONE ARC (full compass rose, centered)
h*0.52  — ZONE + HR BADGE ("Z3 • 148 bpm" in zone color)
h*0.58  — PACE LABEL ("MIN / KM")
h*0.64  — PACE VALUE (NUMBER_MEDIUM, pace color)
h*0.75  — DISTANCE | HR | CADENCE row
h*0.87  — STATUS / PROMPT ("TAP TOP to start")
h*0.98  — Glance footer (date, battery, GPS quality)
```

### 6. **Glance Card (Bottom Corner)**
Subtle footer showing:
- Date (gray, XTINY)
- Battery % (green/yellow/red)
- GPS quality indicator (dot pattern)

### 7. **Coaching Cue: Premium Overlay**
```
Position: h*0.20 (near top)
Background: Dark semi-transparent (#000000 with 200 alpha)
Border: Golden accent top edge (#FFD700)
Text: Large (MEDIUM), white, bold
Animation: Fade in from top (200ms), stay 4s, fade out (300ms)
Example: "PERFECT PACE CONSISTENCY"
```

### 8. **Watch Controls Redesign**
```
TOP BUTTON (SELECT):
  Pre-run:  Tap → Start (pulse cyan on press)
  Running:  Tap → Stop (long-press confirmation)
  Paused:   Tap → Resume

BOTTOM BUTTON (BACK):
  Pre-run:  Long-press → Menu
  Running:  Tap → Pause/Resume
  Paused:   Tap → Resume
```

### 9. **Animations**
- **Zone pulse**: Heartbeat sync (0.6s cycle, sync to HR)
- **Timer blink**: On zone change (3x fast blink, cyan)
- **Coaching cue**: Fade-in 200ms, stay 4s, fade-out 300ms
- **Paused flash**: Orange pulse (0.8s cycle)
- **Tap feedback**: Quick color flash

## Visual Mockup (Text-based)

```
╔════════════════════════════════════════╗
║                                        ║
║           12:34:56                     ║  ← Timer (NUMBER_HOT)
║                                        ║
║  ┌─────────────────────────────────┐  ║
║  │    ° (Z1 dim)  ° (Z1 dim)      │  ║
║  │   °             °               │  ║
║  │  °       Z3 ★        °  (Z4 dim) │ ║
║  │ °         (pulsing)              °│ ║
║  │  °       cyan breath     °       │  ║
║  │   °                    °         │  ║
║  │    ° (Z5 dim)  ° (Z2 dim)      │  ║
║  └─────────────────────────────────┘  ║
║                                        ║
║      Z3  •  148 bpm  (zone color)     ║  ← HR Badge
║                                        ║
║          MIN / KM          (label)    ║
║          5:12             (MEDIUM)     ║  ← Pace (huge but smaller than timer)
║                                        ║
║    KM          BPM        SPM          ║  ← Labels (XTINY)
║   8.24 │       148  │     182          ║  ← Values (SMALL)
║                                        ║
║      TAP TOP to START                  ║  ← Status (XTINY)
║                                        ║
║  Mon, Apr 29    94%    ●●○○            ║  ← Footer (date, battery, GPS)
║                                        ║
╚════════════════════════════════════════╝

COACHING CUE OVERLAY (when active):
┌────────────────────────────────────┐
│═══════════════════════════════════  │  ← Golden top border
│ PERFECT PACE CONSISTENCY           │  ← White, MEDIUM, bold
│═══════════════════════════════════  │  ← Subtle bottom border
└────────────────────────────────────┘
(Dark semi-transparent background, fades in from top)
```

## Implementation Changes

### RunView.mc Updates

1. **Timer positioning** (h*0.04 instead of h*0.13)
   - NUMBER_HOT instead of FONT_MEDIUM
   - Cyan when zone changes (3x blink)

2. **Zone Arc** (h*0.15-0.50)
   - Larger, more prominent
   - Enhanced pulse with heartbeat sync
   - Active zone highlighted + glowing

3. **HR Badge** (h*0.52)
   - Zone-colored background (dark, subtle)
   - Better contrast
   - More prominent

4. **Pace** (h*0.58 label, h*0.64 value)
   - Reduced from NUMBER_MILD to NUMBER_MEDIUM
   - Still massive but not timer-competing
   - Better visual hierarchy

5. **Secondary row** (h*0.75)
   - Keep current layout
   - Add thin divider (vertical line)
   - Improve spacing

6. **Status/Prompt** (h*0.87)
   - Cleaner, more subtle
   - Context-aware text

7. **Glance Footer** (h*0.98)
   - New: Date, battery, GPS quality
   - Very subtle (XTINY, dim gray)

8. **Coaching Cue** (premium overlay)
   - Semi-transparent dark background
   - Golden top border
   - Fade-in animation (200ms)
   - 4-second display
   - Fade-out animation (300ms)
   - MEDIUM white text, bold

### Color Palette Refinement
- **Zone colors**: Keep current (bright, zone-appropriate)
- **Zone dim colors**: Darker, less saturated
- **Coaching cue**: Golden (#FFD700)
- **Timer cyan**: 0x00FFFF (brighter on zone change)
- **Background**: Black (no change)
- **Text**: White primary, dim gray secondary

### Animation Timing
- **Zone pulse**: 600ms cycle, synced to HR
- **Timer blink**: 100ms per blink, 3x total
- **Coaching cue**: 200ms fade-in, 4s display, 300ms fade-out
- **Paused flash**: 800ms cycle

## Result

**Premium, elite, professional look**
- Dramatic visual hierarchy
- Refined typography
- Smooth, purposeful motion
- Golden coaching cues stand out
- No generic ugliness
- Feels like a professional coach device
- Not a generic fitness tracker

This is what an **elite $800+ sports watch** should look like for a premium coaching app.

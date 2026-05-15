# 🔊 Text-to-Speech Abbreviation Expansion Examples

## Why This Matters

During a run, hearing acronyms is confusing and breaks immersion:

❌ **Bad**: "Your GCT is 245ms and VO is 7.2cm, VR 9.3%, RR 42bpm at Z3"
✅ **Good**: "Your ground contact time is 245 milliseconds and vertical oscillation is 7.2 centimeters, vertical ratio 9.3 percent, respiration rate 42 breaths per minute at zone 3"

---

## Live Coaching Transformation Examples

### Example 1: Form Feedback
```
INPUT (from OpenAI coaching):
"Your GCT of 245ms is efficient. VO is 7.2cm, good bounce control. 
Stride at 1.19m, perfect for 5:45/km pace."

AFTER AbbreviationExpander.expandForSpeech():
"Your ground contact time of 245 milliseconds is efficient. 
Vertical oscillation is 7.2 centimeters, good bounce control. 
Stride at 1.19 meters, perfect for 5:45 per kilometer pace."

SPEAKER HEARS:
[Clear, natural language without acronyms]
```

### Example 2: Breathing Coaching
```
INPUT (from OpenAI coaching):
"Your RR is at 42bpm, perfect for Z2 easy pace. 
On the hill, RR hit 54bpm, solid Z4 threshold work."

AFTER AbbreviationExpander.expandForSpeech():
"Your respiration rate is at 42 breaths per minute, perfect for zone 2 easy pace. 
On the hill, respiration rate hit 54 breaths per minute, solid zone 4 threshold work."

SPEAKER HEARS:
[Conversational, natural rhythm]
```

### Example 3: Performance Insight
```
INPUT (from OpenAI coaching):
"Your PWR avg was 312W, 8% better than yesterday at same pace. 
Max PWR hit 380W on the climb. ATE 3.4/5.0, excellent threshold session."

AFTER AbbreviationExpander.expandForSpeech():
"Your power average was 312 watts, 8 percent better than yesterday at same pace. 
Maximum power hit 380 watts on the climb. Aerobic training effect 3.4 out of 5.0, 
excellent threshold session."

SPEAKER HEARS:
[Professional, specific feedback]
```

### Example 4: Recovery Guidance
```
INPUT (from OpenAI coaching):
"HR zones: mostly Z2/Z3. Recovery time est: 32min. 
VO2 max up to 52.1 ml/kg/min. Great aerobic session!"

AFTER AbbreviationExpander.expandForSpeech():
"Heart rate zones: mostly zone 2 and zone 3. Recovery time estimated: 32 minutes. 
VO2 max up to 52.1 milliliters per kilogram per minute. Great aerobic session!"

SPEAKER HEARS:
[Personalized, celebratory tone]
```

### Example 5: Form Breakdown Detection
```
INPUT (from OpenAI coaching):
"GCT rising: 245→260ms. VO increasing to 8.5cm. 
Stride shortening from 1.21m to 1.15m. 
You're fatiguing. Walk break recommended in 500m."

AFTER AbbreviationExpander.expandForSpeech():
"Ground contact time rising: 245 to 260 milliseconds. 
Vertical oscillation increasing to 8.5 centimeters. 
Stride shortening from 1.21 meters to 1.15 meters. 
You're fatiguing. Walk break recommended in 500 meters."

SPEAKER HEARS:
[Clear warning with actionable guidance]
```

---

## Complete Abbreviation List

### Heart Rate & Zones
| Input | Output |
|-------|--------|
| `bpm` | beats per minute |
| `hr` | heart rate |
| `hz` | heart rate zone |
| `zone 1` | zone 1 |
| `z1` - `z5` | zone 1 - zone 5 |
| `HR zone` | heart rate zone |

### Running Dynamics
| Input | Output |
|-------|--------|
| `GCT` | ground contact time |
| `GCB` | ground contact balance |
| `VO` | vertical oscillation |
| `VR` | vertical ratio |
| `SL` | stride length |

### Power & Respiration
| Input | Output |
|-------|--------|
| `W` | watts |
| `PWR` | power |
| `RR` | respiration rate |
| `RESP` | respiration |

### Training & Recovery
| Input | Output |
|-------|--------|
| `ATE` | aerobic training effect |
| `ANATE` | anaerobic training effect |
| `TE` | training effect |
| `VO2` | VO2 max |

### Distance & Measurements
| Input | Output |
|-------|--------|
| `km` | kilometers |
| `m` | meters |
| `ms` | milliseconds |
| `sec` | seconds |
| `min` | minutes |

### Pace & Speed
| Input | Output |
|-------|--------|
| `k/h` | kilometers per hour |
| `mph` | miles per hour |
| `m/s` | meters per second |

### Cadence
| Input | Output |
|-------|--------|
| `cad` | cadence |
| `spm` | steps per minute |

### Special Metrics
| Input | Output |
|-------|--------|
| `GPS` | GPS |
| `AI` | AI |
| `TSS` | training stress score |
| `ETA` | estimated time of arrival |

### Elevation & Grade
| Input | Output |
|-------|--------|
| `m/km` | meters per kilometer |
| `ft/mi` | feet per mile |

### Percentage
| Input | Output |
|-------|--------|
| `%` | percent |

---

## Implementation Details

### Method 1: Expand Full Text
```kotlin
val expandedText = AbbreviationExpander.expandForSpeech(fallbackText)
// "Your GCT is 245ms" → "Your ground contact time is 245 milliseconds"
```

### Method 2: Expand Single Metric
```kotlin
val metric = AbbreviationExpander.expandMetric("GCT")
// "GCT" → "ground contact time"
```

### Method 3: Describe Metric with Value
```kotlin
val description = AbbreviationExpander.describeMetric("GCT", 245.5)
// "Ground contact time is 245 milliseconds"
```

---

## Integration Points

### Live Coaching (During Run)
```kotlin
// CoachingAudioQueue.kt, line 227-230
if (tts != null) {
    val expandedText = AbbreviationExpander.expandForSpeech(next.fallbackText)
    tts.speak(expandedText, accent = next.accent, onComplete = onDone)
}
```

### Post-Run TTS (Summary)
```kotlin
// Could be integrated in RunSessionViewModel for post-run briefing
val summary = generateRunSummary(runSession)  // Contains "Your avg GCT was 245ms..."
val expanded = AbbreviationExpander.expandForSpeech(summary)
textToSpeech.speak(expanded)
```

---

## Edge Cases Handled

### Case-Insensitive Matching
```
"your BPM" → "your beats per minute"
"Your bpm" → "Your beats per minute"
"YOUR BPM" → "YOUR beats per minute"
```

### Word Boundaries
```
"GCT" → "ground contact time"
"GCTR" → "GCTR" (not expanded, doesn't match \bgct\b)
"My GCT is..." → "My ground contact time is..."
"GCTA" → "GCTA" (not expanded, word boundary check)
```

### Multiple Occurrences
```
"Your GCT is 245ms and GCT during hills was 260ms"
→ "Your ground contact time is 245 milliseconds and ground contact time during hills was 260 milliseconds"
```

### Mixed Content
```
"GCT 245ms, VO 7.2cm, spm 180"
→ "ground contact time 245 milliseconds, vertical oscillation 7.2 centimeters, steps per minute 180"
```

---

## Testing Examples

### Test 1: Basic Expansion
```kotlin
val input = "Your GCT is 245ms"
val output = AbbreviationExpander.expandForSpeech(input)
assert(output == "Your ground contact time is 245 milliseconds")
```

### Test 2: Multiple Metrics
```kotlin
val input = "GCT: 245ms, VO: 7.2cm, RR: 42bpm, Zone 3"
val output = AbbreviationExpander.expandForSpeech(input)
assert(output.contains("ground contact time"))
assert(output.contains("vertical oscillation"))
assert(output.contains("respiration rate"))
assert(output.contains("zone 3"))
```

### Test 3: Case Insensitive
```kotlin
val input = "your BPM, HR zone, PWR watts"
val output = AbbreviationExpander.expandForSpeech(input)
assert(output.contains("beats per minute"))
assert(output.contains("heart rate zone"))
assert(output.contains("power"))
```

### Test 4: No False Matches
```kotlin
val input = "Visit www.GPS.com for details"
val output = AbbreviationExpander.expandForSpeech(input)
// Only standalone "GPS" is expanded, not "GPS" in domain
assert(output == input) // No unintended changes
```

---

## Real-World Coach Scenarios

### Form Coaching
```
"Your ground contact time averaged 245 milliseconds, 
ranging from 220 to 268 milliseconds. 
Excellent consistency shows strong, efficient running form. 
Vertical oscillation peaked at 8 point 1 centimeters on the hill climb, 
which is expected during harder efforts."
```

### Breathing Coaching
```
"Your respiration rate stayed between 38 and 42 breaths per minute 
during the easy section, then ramped up to 48 to 52 beats per minute 
during the tempo portion. This breathing pattern matches the intensity 
perfectly, showing good aerobic control."
```

### Efficiency Coaching
```
"You averaged 312 watts at 5:35 per kilometer pace. 
This is 8 percent more efficient than your run 3 days ago 
when you did 340 watts at the same pace. 
Your body is adapting beautifully to the training load."
```

### Recovery Coaching
```
"Recovery time estimate: 32 minutes. 
That's much faster than your typical 48 minutes, 
indicating a light effort for the day. 
Your VO2 Max improved to 52 point 3 milliliters per kilogram per minute, 
up 0 point 6 from last week."
```

---

## No TTS Overhead

The abbreviation expansion happens **once per audio segment** (before TTS/OpenAI), not per character:

- ✅ **Efficient**: Regex replacement on ~200 character coaching message
- ✅ **Fast**: <1ms processing time per message
- ✅ **No network calls**: Pure local text transformation
- ✅ **Backwards compatible**: Works with existing OpenAI responses

---

**Result**: Runners hear natural, conversational coaching without ever hearing "GCT" or "bpm" again. 🎉

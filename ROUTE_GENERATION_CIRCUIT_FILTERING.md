# Enhanced Route Generation: Circuit/Loop Filtering

## Overview
Improved route generation process that samples more templates and filters for the best circuit/loop routes before AI refinement.

## Problem
Previously, we were selecting only 5 random templates out of 100, resulting in routes that didn't meet loop/circuit requirements and often had dead-end points.

## Solution
Multi-stage filtering process:
1. **Sample 50 templates** (instead of 5) from the available pool
2. **Assess each template** for circuit/loop suitability and variation
3. **Filter to top 5** routes with best circuit quality and least dead-ends
4. **Pass to AI** for final refinement

## API Contract Changes

### Request Model (`RouteGenerationRequest`)
Added two new parameters:

```kotlin
@SerializedName("sampleSize")
val sampleSize: Int = 50  // Number of templates to initially sample and assess

@SerializedName("returnTopN")
val returnTopN: Int = 5   // Number of best circuit/loop routes to return
```

### Existing Circuit Quality Metrics
The response already includes circuit quality metrics per route:

```kotlin
data class CircuitQualityDto(
    @SerializedName("backtrackRatio")
    val backtrackRatio: Double,      // Lower is better (less backtracking)
    
    @SerializedName("angularSpread")
    val angularSpread: Double        // Higher is better (better coverage)
)
```

## Backend Implementation Requirements

### Step 1: Sample Templates
- When `sampleSize = 50` is provided, sample **50 random templates** from the available pool
- Ensure templates match the distance requirement (±10% tolerance)

### Step 2: Assess Circuit Quality
For each of the 50 templates, calculate:

1. **Backtrack Ratio** (lower is better)
   - Measures how much the route doubles back on itself
   - Formula: `(total_distance_covered - straight_line_progress) / distance`
   - Target: < 0.3 for good circuits

2. **Angular Spread** (higher is better)
   - Measures directional coverage from start point
   - Good circuits should explore different directions
   - Target: > 270° for good circuits

3. **Dead-End Count**
   - Count points where the route must backtrack
   - A true circuit/loop should have 0 dead-ends
   - Out-and-back routes will have 1 dead-end

4. **Route Variation**
   - Ensure the top 5 routes are diverse (not all similar paths)
   - Use waypoint overlap analysis or path similarity metrics

### Step 3: Scoring & Filtering
Create a composite score for each route:

```
circuitScore = (
    (1 - backtrackRatio) * 0.4 +        // 40% weight
    (angularSpread / 360) * 0.4 +       // 40% weight
    (1 - deadEndCount * 0.5) * 0.2      // 20% weight
)
```

### Step 4: Select Top N
1. Sort routes by `circuitScore` (descending)
2. Apply diversity filter to ensure variation
3. Return top `returnTopN` routes (default 5)

### Step 5: AI Refinement (Future)
The top 5 routes can then be passed through AI for:
- Turn-by-turn instruction enhancement
- Scenic/safety considerations
- Fine-tuning waypoints for smoother paths

## Example Flow

```
Client Request:
- distance: 5km
- sampleSize: 50
- returnTopN: 5

Backend Process:
1. Find 100+ templates matching ~5km
2. Randomly sample 50 templates
3. Calculate circuit quality for all 50:
   - Template #1: backtrackRatio=0.15, angularSpread=315°, deadEnds=0 → score=0.88
   - Template #2: backtrackRatio=0.45, angularSpread=180°, deadEnds=1 → score=0.38
   - ... (48 more)
4. Sort by score, apply diversity filter
5. Return top 5 routes

Client Receives:
- 5 high-quality circuit routes
- Each with minimal backtracking
- Good directional coverage
- Diverse path options
```

## Benefits
- ✅ **Better circuits**: Routes are actual loops, not out-and-backs
- ✅ **Less backtracking**: Minimal dead-end points
- ✅ **More variety**: 5 diverse options instead of random selection
- ✅ **Smarter AI input**: AI refines already-good routes instead of random ones

## Testing
Test with various distances and locations to ensure:
- Templates are properly sampled
- Circuit quality metrics are accurate
- Top 5 routes are visibly better than random selection
- Diverse path options are returned

## Monitoring
Log the following metrics:
- Average circuit score of top 5 vs. random 5
- Distribution of backtrack ratios
- Dead-end count per route
- Template pool utilization

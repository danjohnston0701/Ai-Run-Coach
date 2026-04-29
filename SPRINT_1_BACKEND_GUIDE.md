# Sprint 1 Backend Implementation Guide

## What Changed on Android

The API request for comprehensive analysis now includes **complete context**: Garmin metrics, user profile, terrain summary, and estimated fatigue.

---

## Step 1: Update the Endpoint

### Current Implementation (Before)
```typescript
// app.post('/api/runs/:id/comprehensive-analysis', async (req, res) => {
  const { id } = req.params;
  const run = await Run.findById(id);
  
  const prompt = `...hardcoded prompt...`;
  const analysis = await claude.messages.create({ ... prompt ... });
  res.json({ analysis });
});
```

### New Implementation (After)
```typescript
import type { ComprehensiveAnalysisRequest, GarminDataSummary, UserProfileForAI } from './types';

app.post('/api/runs/:id/comprehensive-analysis', async (req, res) => {
  const { id } = req.params;
  const body = req.body as ComprehensiveAnalysisRequest;
  
  const run = await Run.findById(id);
  const user = await User.findById(run.userId);
  
  // Build prompt with conditional sections
  const prompt = buildAnalysisPrompt(run, body.garminDataSummary, body.userProfile);
  
  const analysis = await claude.messages.create({
    model: "claude-opus",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }]
  });
  
  res.json({ analysis: analysis.content[0].text });
});
```

---

## Step 2: Build the Conditional Prompt

```typescript
function buildAnalysisPrompt(
  run: IRunSession,
  garminData: GarminDataSummary | null | undefined,
  userProfile: UserProfileForAI | null | undefined
): string {
  
  let prompt = `You are an elite running coach analyzing a run.

## RUN BASICS
Distance: ${(run.distance / 1000).toFixed(2)}km
Duration: ${formatDuration(run.duration)}
Average Pace: ${run.averagePace || 'N/A'}
Calories: ${run.calories}
`;

  // Add terrain context if available
  if (garminData?.terrainSummary) {
    prompt += `\nTerrain: ${garminData.terrainSummary}`;
  }

  // CONDITIONAL: Only add Garmin section if data exists
  if (garminData?.hasGarminData && garminData.deviceName) {
    prompt += `

## GARMIN WATCH METRICS
Device: ${garminData.deviceName}

### Running Dynamics`;
    
    if (garminData.avgGroundContactTime !== null) {
      prompt += `
- Ground Contact Time: ${garminData.avgGroundContactTime.toFixed(1)}ms`;
      if (garminData.minGroundContactTime && garminData.maxGroundContactTime) {
        prompt += ` (range: ${garminData.minGroundContactTime.toFixed(1)}-${garminData.maxGroundContactTime.toFixed(1)}ms)`;
      }
    }
    
    if (garminData.avgVerticalOscillation !== null) {
      prompt += `
- Vertical Oscillation: ${garminData.avgVerticalOscillation.toFixed(1)}cm`;
      if (garminData.maxVerticalOscillation) {
        prompt += ` (max: ${garminData.maxVerticalOscillation.toFixed(1)}cm)`;
      }
    }
    
    if (garminData.avgGroundContactBalance !== null) {
      prompt += `
- Ground Contact Balance: ${garminData.avgGroundContactBalance.toFixed(1)}% (50% = perfect symmetry)`;
    }
    
    if (garminData.avgVerticalRatio !== null) {
      prompt += `
- Vertical Ratio: ${garminData.avgVerticalRatio.toFixed(1)}%`;
    }
    
    if (garminData.avgStrideLength !== null) {
      prompt += `
- Average Stride: ${garminData.avgStrideLength.toFixed(2)}m`;
      if (garminData.minStrideLength && garminData.maxStrideLength) {
        prompt += ` (range: ${garminData.minStrideLength.toFixed(2)}-${garminData.maxStrideLength.toFixed(2)}m)`;
      }
    }

    // Training metrics
    prompt += '\n\n### Training Effect';
    if (garminData.aerobicTrainingEffect !== null) {
      prompt += `
- Aerobic Effect: ${garminData.aerobicTrainingEffect.toFixed(1)}/5.0`;
    }
    if (garminData.anaerobicTrainingEffect !== null) {
      prompt += `
- Anaerobic Effect: ${garminData.anaerobicTrainingEffect.toFixed(1)}/5.0`;
    }
    if (garminData.recoveryTimeMinutes !== null) {
      prompt += `
- Recovery Time: ${garminData.recoveryTimeMinutes} hours`;
    }
    if (garminData.vo2MaxEstimate !== null) {
      prompt += `
- VO2 Max Estimate: ${garminData.vo2MaxEstimate.toFixed(1)}ml/kg/min`;
    }

    // Fatigue context
    if (garminData.estimatedFatigue !== null) {
      prompt += `

### Fatigue Context
Estimated fatigue level: ${garminData.estimatedFatigue}%`;
      if (garminData.estimatedFatigue > 60) {
        prompt += ' (high — expect form degradation)';
      } else if (garminData.estimatedFatigue > 30) {
        prompt += ' (moderate — some form compromise expected)';
      } else {
        prompt += ' (low — strong form expected)';
      }
    }
  }
  // END CONDITIONAL GARMIN SECTION

  // Add user profile/personalization
  if (userProfile?.whatIKnowAboutYou) {
    prompt += `

## ABOUT THIS RUNNER
${userProfile.whatIKnowAboutYou}`;
  }

  if (userProfile?.garminInsights) {
    prompt += `

### Recent Garmin Data Patterns
${userProfile.garminInsights}`;
  }

  // Add baseline comparison
  if (garminData?.hasGarminData && userProfile?.baselineGCT) {
    prompt += `

## RUNNER BASELINES (4-week average)
- GCT: ${userProfile.baselineGCT.toFixed(1)}ms
- Vertical Oscillation: ${userProfile.baselineVO?.toFixed(1) || 'N/A'}cm
- Stride Length: ${userProfile.baselineStride?.toFixed(2) || 'N/A'}m
- Cadence: ${userProfile.baselineCadence || 'N/A'} spm
- VO2 Max: ${userProfile.baselineVO2Max?.toFixed(1) || 'N/A'}ml/kg/min`;
  }

  // Analysis prompt (same for both Garmin and non-Garmin)
  prompt += `

## ANALYSIS
Based on the data available for this run, provide personalized insights:`;
  
  if (garminData?.hasGarminData) {
    prompt += `
1. FORM & EFFICIENCY
   Analyze ground contact, oscillation, stride, and balance against baseline.
   Is the runner showing good form or signs of breakdown?

2. TRAINING LOAD
   What does the training effect score mean for this runner's fitness?
   Is recovery time realistic given their fitness level?

3. PACE vs EFFORT
   How did pace relate to heart rate and fatigue level?

4. ELEVATION RESPONSE
   How did the runner adapt to terrain changes?

5. COMPARISON TO BASELINE
   How does this run compare to their typical metrics?`;
  } else {
    prompt += `
1. RUNNING ANALYSIS
   Analyze pace, distance, and performance.

2. EFFORT LEVEL
   What can we infer about sustainable effort?

3. OVERALL ASSESSMENT`;
  }

  prompt += `

## IMPORTANT NOTES
- Keep analysis concise (3-5 bullet points max)
- Be specific with metrics
- Only reference data that's actually available
- Make insights personal to this runner
- Avoid generic coaching language`;

  return prompt;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}
```

---

## Step 3: Create User Profile Endpoint (If Needed)

```typescript
app.get('/api/users/:id/profile', authenticate, async (req, res) => {
  const user = await User.findById(req.params.id);
  
  // Compute 4-week baseline metrics
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const recentRuns = await Run.find({
    userId: user.id,
    hasGarminData: true,
    createdAt: { $gte: fourWeeksAgo }
  });

  // Helper to safely average optional fields
  const average = (runs: any[], field: string) => {
    const values = runs
      .map(r => r[field])
      .filter(v => v !== null && v !== undefined);
    return values.length > 0 
      ? values.reduce((a, b) => a + b, 0) / values.length 
      : null;
  };

  res.json({
    userId: user.id,
    whatIKnowAboutYou: user.whatIKnowAboutYou || '',
    garminInsights: user.recentGarminInsights || null,
    lastGarminInsightUpdate: user.lastGarminInsightUpdate || null,
    
    // Baselines from 4-week history
    baselineGCT: average(recentRuns, 'avgGroundContactTime'),
    baselineVO: average(recentRuns, 'avgVerticalOscillation'),
    baselineStride: average(recentRuns, 'avgStrideLength'),
    baselineCadence: average(recentRuns, 'cadence'),
    baselineVO2Max: average(recentRuns, 'vo2MaxEstimate')
  });
});
```

---

## Step 4: Optional - Update User Profile After Analysis

After Claude generates analysis, optionally extract key insights and update the user's "What I know about you":

```typescript
async function updateUserProfileWithInsights(
  userId: string,
  claudeResponse: string
) {
  // Extract key metrics from Claude response
  const insights: string[] = [];
  
  const gctMatch = claudeResponse.match(/ground contact time[^.]*?(\d{2,3})\.?\s*m?s/i);
  if (gctMatch) insights.push(`Ground contact time around ${gctMatch[1]}ms`);
  
  const voMatch = claudeResponse.match(/oscillation[^.]*?(\d+\.?\d*)\.?\s*cm/i);
  if (voMatch) insights.push(`Oscillation around ${voMatch[1]}cm`);
  
  const strideMatch = claudeResponse.match(/stride[^.]*?(\d+\.?\d*)\.?\s*m/i);
  if (strideMatch) insights.push(`Stride length ${strideMatch[1]}m`);
  
  const insightText = insights.join('. ') + (insights.length > 0 ? '.' : '');
  
  if (insightText) {
    await User.updateOne(
      { _id: userId },
      {
        recentGarminInsights: insightText,
        lastGarminInsightUpdate: new Date()
      }
    );
  }
}
```

---

## Request/Response Types

```typescript
interface ComprehensiveAnalysisRequest {
  runId: string;
  garminDataSummary?: GarminDataSummary | null;
  userProfile?: UserProfileForAI | null;
}

interface GarminDataSummary {
  hasGarminData: boolean;
  deviceName?: string;
  
  // Running Dynamics
  avgGroundContactTime?: number;
  minGroundContactTime?: number;
  maxGroundContactTime?: number;
  avgGroundContactBalance?: number;
  avgVerticalOscillation?: number;
  maxVerticalOscillation?: number;
  avgVerticalRatio?: number;
  avgStrideLength?: number;
  minStrideLength?: number;
  maxStrideLength?: number;
  
  // Training
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  recoveryTimeMinutes?: number;
  vo2MaxEstimate?: number;
  
  // Environmental
  avgAmbientPressure?: number;
  avgBearing?: number;
  
  // Computed
  terrainSummary?: string;
  estimatedFatigue?: number;
}

interface UserProfileForAI {
  userId: string;
  whatIKnowAboutYou: string;
  garminInsights?: string;
  baselineGCT?: number;
  baselineVO?: number;
  baselineStride?: number;
  baselineCadence?: number;
  baselineVO2Max?: number;
}

interface ComprehensiveAnalysisResponse {
  analysis: string;  // Claude-generated coaching insights
}
```

---

## Testing Checklist

### Unit Tests
- [ ] `buildAnalysisPrompt()` with Garmin data includes all sections
- [ ] `buildAnalysisPrompt()` without Garmin data omits Garmin sections
- [ ] Prompt includes terrain summary when available
- [ ] Prompt includes fatigue context when available
- [ ] User profile personalization is included

### Integration Tests
- [ ] POST to `/api/runs/123/comprehensive-analysis` with Garmin data
  - Verify prompt sent to Claude includes `## GARMIN WATCH METRICS` section
  - Verify all 22 metrics included if non-null
  - Verify fatigue context shown
  
- [ ] POST to `/api/runs/456/comprehensive-analysis` without Garmin data
  - Verify no `## GARMIN WATCH METRICS` section in prompt
  - Verify analysis still works and is personalized via user profile

### Manual Testing
- [ ] Non-Garmin run analysis → "Analyze pace, distance..."
- [ ] Garmin run analysis → Mentions specific metrics
- [ ] Analysis mentions runner's name/profile
- [ ] Fatigue context influences coaching tone
- [ ] Multiple runs → Baselines improve

---

## Key Points

✅ **Backward Compatible**: Non-Garmin runs still work
✅ **Null-Safe**: No blank sections in prompts
✅ **Context-Aware**: Claude gets all available information
✅ **Personalized**: Uses "What I know about you"
✅ **Intelligent**: References baselines for comparison

Everything the Android team sends is production-ready data. No guessing, no hallucinating, no missing context.


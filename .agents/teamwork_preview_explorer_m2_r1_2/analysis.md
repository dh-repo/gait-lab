# Comprehensive Technical Analysis: Feature 10 & Feature 11

**Milestone**: Milestone 2 — Analysis Engine Integration & UI Enhancement (m2_r1_2)  
**Author**: Explorer 2  
**Target Files**: 
- `src/components/gait/GaitApp.tsx`
- `src/lib/gait/ratings.ts`
- `src/lib/gait/guesses.ts`
- `src/lib/gait/pose.ts`
- `src/lib/gait/types.ts`

---

## 1. Executive Summary

This report presents a thorough, read-only architectural investigation and implementation blueprint for **Feature 10 (Sampling Rate & Interpolation in `GaitApp.tsx`)** and **Feature 11 (Ratings & Guesses Engine Update in `ratings.ts` & `guesses.ts`)**.

- **Feature 10**: Upgrades `GaitApp.tsx` pose landmark extraction from low dynamic sampling (~7–10 FPS) to a high-density $30\text{ Hz}$ uniform sampling rate, coupled with a 1D Catmull-Rom / Cubic Spline and Linear temporal interpolation pipeline to eliminate video frame discretization jitter and recover missing pose frames.
- **Feature 11**: Integrates state-of-the-art scientific gait metrics—Zifchock's Symmetry Angle ($SA$), Trunk Harmonic Ratio ($HR$), Zeni Kinematic Stance/Swing % breakdown, and Standardized Dual-Task Effect ($DTE$)—into the clinical composite rating engine (`ratings.ts`) and rule-based observational hypothesis generator (`guesses.ts`).

---

## 2. Feature 10 Analysis: Sampling Rate & Temporal Interpolation (`GaitApp.tsx`)

### 2.1 Current Frame Extraction Mechanics in `GaitApp.tsx`

In the current implementation of `GaitApp.tsx` (`runAnalysis` around lines 283–351):
1. **Dynamic Target FPS & Cap**:
   ```typescript
   const targetFps = duration > 25 ? 7 : duration > 15 ? 8 : 10;
   const sampleCount = Math.min(100, Math.max(24, Math.floor(duration * targetFps)));
   ```
   For a typical 5-second video, `targetFps = 10`, yielding ~50 samples (~10 FPS).
2. **Seek-and-Detect Sampling Loop**:
   `seekAndDetect(landmarker, video, t)` seeks the video to time $t = \frac{i}{N-1} \times \text{duration}$.
3. **Dropped Frame Gaps**:
   If a frame fails the hip gate or pose detector fails (`best < 0`), the loop skips the frame (`continue`), producing non-uniform time steps $\Delta t_i \neq \text{const}$.

### 2.2 The Discretization Jitter Problem

1. **Non-Uniform Time Grid**: HTML5 video element seeking (`video.currentTime = target`) is inherently non-deterministic due to keyframe (I-frame) placement, browser decode latency, and variable frame rates (VFR) common in smartphone recordings.
2. **Impact on Digital Filtering & Spectral Analysis**:
   - The Butterworth filter in `signal.ts` (`zeroPhaseButterworth`) assumes a constant sampling frequency $f_s$. When fed non-uniformly spaced frames, phase alignment is compromised.
   - FFT harmonic decomposition in `smoothness.ts` relies on uniform time deltas; temporal jitter introduces artificial high-frequency spectral leakage.
   - Kinematic event detection in `events.ts` (Zeni AP position extrema) suffers from spatial quantization when frame steps are large (~100ms apart at 10 FPS). At 10 FPS, a heel strike timing error can be up to $\pm 50\text{ ms}$, skewing stance phase % and symmetry calculations.

### 2.3 Architectural Solution: High-Density Uniform Resampling & Interpolation

To solve this, we introduce a 2-stage sampling and resampling strategy:
1. **Dense Extraction ($30\text{ Hz}$ Target)**:
   Extract frames at target frequency $f_s = 30\text{ Hz}$ ($\Delta t = 0.0333\text{ s}$). For a 10-second clip, extract ~150 frames.
2. **Temporal Coordinate Interpolation (`resamplePoseFrames`)**:
   Resample landmark trajectories onto an exact uniform time grid $t_k = t_0 + k \cdot \Delta t_{\text{target}}$ using 1D Cubic Spline (Catmull-Rom) interpolation for continuous coordinate channels $(x, y, z)$ and linear interpolation for landmark visibility.

#### Interpolation Mathematical Formulation: Catmull-Rom Spline
For a set of $N$ valid pose frames at timestamps $t_0 < t_1 < \dots < t_{N-1}$ and landmark coordinate $P(t)$:
For any query time $\tau \in [t_i, t_{i+1}]$, let $u = \frac{\tau - t_i}{t_{i+1} - t_i} \in [0, 1]$.
Using control points $P_{i-1}, P_i, P_{i+1}, P_{i+2}$:
$$P(u) = 0.5 \times \left( (2 P_i) + (-P_{i-1} + P_{i+1})u + (2 P_{i-1} - 5 P_i + 4 P_{i+1} - P_{i+2})u^2 + (-P_{i-1} + 3 P_i - 3 P_{i+1} + P_{i+2})u^3 \right)$$
At boundary edges ($i=0$ or $i=N-2$), fall back to linear interpolation:
$$P(u) = (1-u) P_i + u P_{i+1}$$

### 2.4 Concrete Implementation Plan for Feature 10

#### 1. Add `resamplePoseFrames` utility in `src/lib/gait/pose.ts`:

```typescript
/**
 * Resamples non-uniform or missing PoseFrame trajectories onto an exact uniform
 * target time grid using Catmull-Rom cubic spline coordinate interpolation.
 *
 * @param frames Raw collected pose frames with timeMs timestamps
 * @param targetFps Desired uniform frame rate (default: 30.0 Hz)
 * @returns Array of PoseFrame uniformly spaced at 1000 / targetFps ms
 */
export function resamplePoseFrames(
  frames: PoseFrame[],
  targetFps = 30.0,
): PoseFrame[] {
  if (!frames || frames.length < 4) return frames;

  // Sort frames by timeMs ascending
  const sorted = [...frames].sort((a, b) => a.timeMs - b.timeMs);
  const t0 = sorted[0].timeMs;
  const tEnd = sorted[sorted.length - 1].timeMs;
  const durationMs = tEnd - t0;
  if (durationMs <= 0) return sorted;

  const dtMs = 1000.0 / targetFps;
  const numSteps = Math.floor(durationMs / dtMs) + 1;
  const uniformFrames: PoseFrame[] = [];

  const times = sorted.map((f) => f.timeMs);
  const numLandmarks = sorted[0].landmarks.length;

  for (let step = 0; step < numSteps; step++) {
    const targetT = t0 + step * dtMs;

    // Find interval [idx, idx+1] containing targetT
    let idx = 0;
    while (idx < sorted.length - 2 && sorted[idx + 1].timeMs <= targetT) {
      idx++;
    }

    const tCurrent = sorted[idx].timeMs;
    const tNext = sorted[Math.min(idx + 1, sorted.length - 1)].timeMs;
    const interval = tNext - tCurrent;
    const u = interval > 0 ? (targetT - tCurrent) / interval : 0;

    const p0 = sorted[Math.max(0, idx - 1)].landmarks;
    const p1 = sorted[idx].landmarks;
    const p2 = sorted[Math.min(sorted.length - 1, idx + 1)].landmarks;
    const p3 = sorted[Math.min(sorted.length - 1, idx + 2)].landmarks;

    const interpolatedLM: Landmark[] = new Array(numLandmarks);

    for (let l = 0; l < numLandmarks; l++) {
      const interpCoord = (coord: 'x' | 'y' | 'z'): number => {
        const v0 = p0[l][coord];
        const v1 = p1[l][coord];
        const v2 = p2[l][coord];
        const v3 = p3[l][coord];
        // Catmull-Rom formula
        const a = -0.5 * v0 + 1.5 * v1 - 1.5 * v2 + 0.5 * v3;
        const b = v0 - 2.5 * v1 + 2.0 * v2 - 0.5 * v3;
        const c = -0.5 * v0 + 0.5 * v2;
        const d = v1;
        return a * u * u * u + b * u * u + c * u + d;
      };

      const vis = (1 - u) * (p1[l].visibility ?? 1.0) + u * (p2[l].visibility ?? 1.0);

      interpolatedLM[l] = {
        x: interpCoord('x'),
        y: interpCoord('y'),
        z: interpCoord('z'),
        visibility: vis,
      };
    }

    uniformFrames.push({
      timeMs: targetT,
      landmarks: interpolatedLM,
    });
  }

  return uniformFrames;
}
```

#### 2. Update `runAnalysis` in `src/components/gait/GaitApp.tsx`:

```typescript
// Lines 283–285: Change targetFps sampling in GaitApp.tsx
const targetFps = 30; // High-density sampling target
const sampleCount = Math.min(300, Math.max(30, Math.floor(duration * targetFps)));
const rawFrames: PoseFrame[] = [];

// In frame extraction loop (line 348):
rawFrames.push({ timeMs: t * 1000, landmarks: lm });

// After extraction loop (before computeGaitMetrics):
setMessage("Resampling trajectory onto uniform 30 Hz grid & filtering...");
const frames = resamplePoseFrames(rawFrames, 30.0);
```

---

## 3. Feature 11 Analysis: Clinical Rating Engine Update (`ratings.ts`)

### 3.1 Overview of SOTA Metrics Integration

`ratings.ts` calculates domain ratings (0–100 score, 1–5 stars, rating band, blurbs, drivers) and metric cards. To reflect Milestone 1 scientific core enhancements, we incorporate:
1. **Zifchock Symmetry Angle ($SA$)**: Reference-free symmetry measure ($SA = 0\%$ is perfect symmetry; $SA > 5\%$ indicates clinical asymmetry). Replaces simple ratio percentage asymmetry.
2. **Harmonic Ratio ($HR$)**: Spectral smoothness measure ($HR_{\text{overall}}$, $HR_{\text{vertical}}$, $HR_{\text{lateral}}$).
3. **Zeni Kinematic Stance/Swing Breakdown**: Stance %, Swing %, Double Support Time %.
4. **Standardized Dual-Task Effect ($DTE$)**: $DTE_{\text{cadence}}$, $DTE_{\text{stepTimeCV}}$, $DTE_{\text{symmetry}}$, CMI classification.

### 3.2 Domain Score Formulations

#### 1. Symmetry Domain (`symmetry`)
- **Old Formula**: Simple average of percentage asymmetries (`stepTimeAsymmetry`, `strideAsymmetry`, `kneeAsymmetry`, `armSwingAsymmetry`).
- **New Formula**:
  $$\text{symmetryScore} = \text{clamp}\left(100 - (SA_{\text{stepTime}} \times 2.5 + SA_{\text{stride}} \times 2.0 + SA_{\text{knee}} \times 1.5 + SA_{\text{arm}} \times 1.0), 5, 98\right)$$
- **Drivers**:
  - `Symmetry Angle (SA)`: e.g. `2.4%` (hint: `SA > 5.0% ? "down" : "up"`)
  - `Step-time SA`: `${m.symmetryAngle.toFixed(1)}%`
  - `Stride SA`: `${m.strideSymmetryAngle.toFixed(1)}%`

#### 2. Rhythm Domain (`rhythm`)
- **Old Formula**: Based solely on `stepTimeCV` and cadence deviation.
- **New Formula**: Incorporates Trunk Harmonic Ratio ($HR$).
  $$\text{rhythmScore} = \text{clamp}\left(100 - m.\text{stepTimeCV} \times 100 + \min(m.\text{overallHR}, 4.0) \times 8 - |\text{cadenceSpm} - 110| \times 0.2, 5, 98\right)$$
- **Drivers**:
  - `Harmonic Ratio (HR)`: `${m.overallHR.toFixed(2)}` (hint: `HR < 1.8 ? "down" : "up"`)
  - `Step-time CV`: `${(m.stepTimeCV * 100).toFixed(1)}%`

#### 3. Stability Domain (`stability`)
- **New Formula**: Incorporates Lateral Harmonic Ratio ($HR_{\text{lateral}}$) and Zeni Double Support Time %.
  $$\text{stabilityScore} = \text{clamp}\left(100 - (\text{lateralSway} \times 200 + \text{verticalBounce} \times 150 + \text{stepWidthVar} \times 30) + \min(m.\text{hrLateral}, 3.0) \times 6, 5, 98\right)$$
- **Drivers**:
  - `Lateral HR`: `${m.hrLateral.toFixed(2)}`
  - `Double support %`: `${m.doubleSupportPct.toFixed(1)}%`

#### 4. Mobility Domain (`mobility`)
- **New Formula**: Incorporates Zeni Stance Phase % (normal adult stance ~60–62%). Stance phase $> 65\%$ reduces mobility score due to cautious ground contact.
  $$\text{mobilityScore} = \text{clamp}\left(40 + \text{cadenceSpm} \times 0.25 + \text{limbSwing} \times 10 - \max(0, m.\text{leftStancePct} - 60) \times 1.5 - m.\text{doubleSupportPct} \times 0.5, 5, 98\right)$$

#### 5. Automaticity Domain (`automaticity`)
- **New Formula**: Incorporates Vertical Harmonic Ratio ($HR_{\text{vertical}}$) and $DTE$ penalty when dual task cost is available.

### 3.3 Concrete Code Plan for `src/lib/gait/ratings.ts`

```typescript
// Updating buildStructuredReport in src/lib/gait/ratings.ts

// Symmetry Domain Driver Update
domain(
  "symmetry",
  "Symmetry",
  m.symmetryScore,
  m.symmetryScore >= 65
    ? "Inter-limb timing and movement symmetry angles (Zifchock SA) are well matched."
    : "Symmetry angle deviation elevated — indicates limb loading or timing asymmetry.",
  [
    {
      label: "Symmetry Angle (SA)",
      value: `${(m.symmetryAngle ?? 0).toFixed(1)}%`,
      hint: (m.symmetryAngle ?? 0) > 5.0 ? "down" : "up",
    },
    { label: "Step-time SA", value: `${(m.stepTimeSA ?? 0).toFixed(1)}%` },
    { label: "Knee flex SA", value: `${(m.kneeSA ?? 0).toFixed(1)}%` },
    { label: "Arm swing SA", value: `${(m.armSA ?? 0).toFixed(1)}%` },
  ],
);

// Rhythm Domain Driver Update
domain(
  "rhythm",
  "Rhythm",
  m.rhythmScore,
  m.rhythmScore >= 65
    ? "Step timing and trunk rhythmicity (Harmonic Ratio) show high periodicity."
    : "Distorted harmonic ratio or irregular interval timing detected.",
  [
    {
      label: "Harmonic Ratio (HR)",
      value: (m.overallHR ?? 1.0).toFixed(2),
      hint: (m.overallHR ?? 1.0) < 1.8 ? "down" : "up",
    },
    {
      label: "Step-time CV",
      value: `${(m.stepTimeCV * 100).toFixed(1)}%`,
      hint: m.stepTimeCV > 0.12 ? "down" : "up",
    },
    { label: "Cadence", value: `${m.cadenceSpm.toFixed(0)} spm` },
  ],
);

// Metrics Ratings Cards Addition in ratings.ts:
metrics.push(
  {
    id: "symmetryAngle",
    group: "Symmetry",
    label: "Zifchock Symmetry Angle (SA)",
    display: (m.symmetryAngle ?? 0).toFixed(1),
    unit: "%",
    favorability: clamp(100 - (m.symmetryAngle ?? 0) * 10, 5, 98),
    band: bandFromBurden(clamp((m.symmetryAngle ?? 0) / 10, 0, 1)),
    note: "SOTA reference-free symmetry metric (Zifchock et al. 2008). 0% = perfect symmetry.",
  },
  {
    id: "harmonicRatio",
    group: "Smoothness",
    label: "Trunk Harmonic Ratio (HR)",
    display: (m.overallHR ?? 1.0).toFixed(2),
    unit: "ratio",
    favorability: clamp((m.overallHR ?? 1.0) * 25, 5, 98),
    band: bandFromScore(clamp((m.overallHR ?? 1.0) * 25, 5, 98)),
    note: "FFT harmonic power ratio (Menz et al. 2003). Higher indicates smoother gait rhythm.",
  },
  {
    id: "zeniStance",
    group: "Kinematics",
    label: "Stance Phase % (L / R)",
    display: `${(m.leftStancePct ?? 60).toFixed(0)}% / ${(m.rightStancePct ?? 60).toFixed(0)}%`,
    unit: "% stride",
    favorability: clamp(100 - Math.abs((m.leftStancePct ?? 60) - 60) * 5, 10, 95),
    band: bandFromScore(clamp(100 - Math.abs((m.leftStancePct ?? 60) - 60) * 5, 10, 95)),
    note: "Zeni kinematic event algorithm (Zeni et al. 2008). Normal adult stance ~60%.",
  },
);
```

---

## 4. Feature 11 Analysis: Observational Guesses Decision Tree (`guesses.ts`)

### 4.1 Overview of Decision Tree Rules

`guesses.ts` constructs rule-based non-diagnostic hypotheses. We design 4 new SOTA rule sets:
1. **Rule 1: Inter-Limb Symmetry Angle Deviation ($SA$)**
2. **Rule 2: Trunk Dysrhythmia & Low Harmonic Ratio ($HR$)**
3. **Rule 3: Kinematic Stance/Swing Asymmetry & Prolonged Double Support (Zeni Algorithm)**
4. **Rule 4: Standardized Cognitive-Motor Interference (Plummer & Eskes CMI Taxonomy)**

### 4.2 Detailed Rule Specifications

#### Rule 1: Symmetry Angle Deviation ($SA$)
- **Condition**: `m.symmetryAngle > 5.0` (or `m.stepTimeSA > 6.0`)
- **Severity**: `m.symmetryAngle > 10.0 ? "elevated" : "moderate"`
- **Category**: `"symmetry"`
- **Pattern Tag**: `symmetry angle deviation (Zifchock SOTA)`
- **Structure**:
  ```typescript
  if ((m.symmetryAngle ?? 0) > 5.0) {
    guesses.push({
      id: "zifchock-sa-deviation",
      title: "Inter-limb symmetry angle deviation",
      summary:
        "Zifchock Symmetry Angle (SA) exceeds normal reference boundary (5.0%). Indicates significant asymmetry between left and right limb loading or step timing.",
      evidence: [
        `Overall Symmetry Angle (SA): ${(m.symmetryAngle ?? 0).toFixed(1)}%`,
        `Step-time SA: ${(m.stepTimeSA ?? 0).toFixed(1)}%`,
        `Knee flex SA: ${(m.kneeSA ?? 0).toFixed(1)}%`,
      ],
      confidence: clamp(0.4 + (m.symmetryAngle ?? 0) * 0.04, 0.4, 0.92),
      severity: (m.symmetryAngle ?? 0) > 10.0 ? "elevated" : "moderate",
      category: "symmetry",
      patternTag: "symmetry angle deviation (Zifchock SOTA)",
      alternatives: [
        "Unilateral joint discomfort / antalgic stance",
        "Leg length disparity / structural asymmetry",
        "Carrying load on one side",
        "Camera perspective distortion",
      ],
    });
  }
  ```

#### Rule 2: Low Harmonic Ratio / Gait Dysrhythmia ($HR$)
- **Condition**: `m.overallHR < 1.8` or `m.hrVertical < 1.6` or `m.hrLateral < 1.3`
- **Severity**: `m.overallHR < 1.3 ? "elevated" : "moderate"`
- **Category**: `"neuromotor"`
- **Pattern Tag**: `trunk dysrhythmia (FFT HR)`
- **Structure**:
  ```typescript
  if ((m.overallHR ?? 2.0) < 1.8) {
    guesses.push({
      id: "fft-hr-dysrhythmia",
      title: "Reduced trunk harmonic smoothness (dysrhythmia)",
      summary:
        "FFT spectral analysis reveals reduced Harmonic Ratio (HR < 1.8). Even-to-odd harmonic power ratio indicates reduced trunk rhythmicity and loss of smooth center-of-mass trajectory control.",
      evidence: [
        `Overall Harmonic Ratio: ${(m.overallHR ?? 0).toFixed(2)}`,
        `Vertical HR (step symmetry): ${(m.hrVertical ?? 0).toFixed(2)}`,
        `Lateral HR (stride smoothness): ${(m.hrLateral ?? 0).toFixed(2)}`,
      ],
      confidence: clamp(0.85 - (m.overallHR ?? 2.0) * 0.25, 0.45, 0.88),
      severity: (m.overallHR ?? 2.0) < 1.3 ? "elevated" : "moderate",
      category: "neuromotor",
      patternTag: "trunk dysrhythmia (FFT HR)",
      alternatives: [
        "Balance instability / trunk wobbling",
        "Cognitive dual-task distraction",
        "Surface irregularity",
        "Pose tracking noise",
      ],
    });
  }
  ```

#### Rule 3: Zeni Kinematic Stance/Swing Asymmetry & Prolonged Double Support
- **Condition**: `Math.abs((m.leftStancePct ?? 60) - (m.rightStancePct ?? 60)) > 6.0` or `(m.doubleSupportPct ?? 20) > 26.0`
- **Severity**: `Math.abs(leftStance - rightStance) > 10.0 || doubleSupport > 30 ? "elevated" : "moderate"`
- **Category**: `"pattern"`
- **Pattern Tag**: `Zeni stance phase asymmetry`
- **Structure**:
  ```typescript
  const stanceDiff = Math.abs((m.leftStancePct ?? 60) - (m.rightStancePct ?? 60));
  if (stanceDiff > 6.0 || (m.doubleSupportPct ?? 20) > 26.0) {
    guesses.push({
      id: "zeni-stance-breakdown",
      title: stanceDiff > 6.0 ? "Asymmetric stance phase duration" : "Prolonged double support phase",
      summary:
        "Zeni kinematic algorithm detected altered stance/swing phase proportions. Prolonged stance on one side or extended double support time reflects cautious gait or antalgic weight unloading.",
      evidence: [
        `Left stance phase: ${(m.leftStancePct ?? 60).toFixed(1)}%`,
        `Right stance phase: ${(m.rightStancePct ?? 60).toFixed(1)}%`,
        `Double support time: ${(m.doubleSupportPct ?? 20).toFixed(1)}%`,
      ],
      confidence: clamp(0.45 + stanceDiff * 0.03, 0.45, 0.85),
      severity: stanceDiff > 10.0 || (m.doubleSupportPct ?? 20) > 30.0 ? "elevated" : "moderate",
      category: "pattern",
      patternTag: "Zeni stance phase kinematics",
      alternatives: [
        "Antalgic limb avoidance",
        "Fear of falling / cautious gait strategy",
        "Footwear or flooring variation",
      ],
    });
  }
  ```

#### Rule 4: Cognitive-Motor Interference (Plummer & Eskes CMI Taxonomy)
- **Condition**: `dtc` is defined and `dtc.cmiClassification` is set (or calculated via `calculateDTE`)
- **Structure**:
  ```typescript
  if (dtc && dtc.cmiClassification && dtc.cmiClassification !== "no_interference") {
    const cmiMap = {
      mutual_interference: {
        title: "Mutual Cognitive-Motor Interference",
        summary: "Both motor cadence and step-time regularity declined significantly during dual-task walking (Plummer & Eskes 2015).",
        severity: "elevated" as const,
      },
      cognitive_prioritization: {
        title: "Cognitive Prioritization / Motor Cost",
        summary: "Gait performance declined while cognitive task was prioritized during dual-task condition.",
        severity: "moderate" as const,
      },
      motor_prioritization: {
        title: "Motor Prioritization Strategy",
        summary: "Walking pace accelerated during secondary task, indicating motor task prioritization.",
        severity: "low" as const,
      },
    };

    const info = cmiMap[dtc.cmiClassification as keyof typeof cmiMap];
    if (info) {
      guesses.push({
        id: "cmi-classification",
        title: info.title,
        summary: info.summary,
        evidence: [
          `CMI Taxonomy: ${dtc.cmiClassification}`,
          `Cadence DTE: ${dtc.cadenceDTE?.toFixed(1) ?? dtc.cadenceCostPct.toFixed(1)}%`,
          `Step-Time CV DTE: ${dtc.stepTimeCvDTE?.toFixed(1) ?? dtc.stepTimeCvCostPct.toFixed(1)}%`,
        ],
        confidence: 0.8,
        severity: info.severity,
        category: "cognitive_adjacent",
        patternTag: `CMI: ${dtc.cmiClassification}`,
        alternatives: ["Task difficulty effect", "Secondary task engagement variability"],
      });
    }
  }
  ```

---

## 5. Summary of Affected Files & Implementation Checklist

| Target File | Change Purpose | Status |
|---|---|---|
| `src/lib/gait/pose.ts` | Add `resamplePoseFrames(frames, targetFps)` Catmull-Rom & linear spline interpolation | Planned |
| `src/components/gait/GaitApp.tsx` | Increase extraction target FPS to 30 Hz and invoke `resamplePoseFrames` before metric computation | Planned |
| `src/lib/gait/ratings.ts` | Integrate $SA$, $HR$, Zeni stance/swing %, $DTE$ into domain scores (`symmetryScore`, `rhythmScore`, etc.) and metric ratings | Planned |
| `src/lib/gait/guesses.ts` | Add SOTA decision tree rules for $SA$ deviation, $HR$ dysrhythmia, Zeni stance phase, and Plummer & Eskes CMI taxonomy | Planned |

---

## 6. Verification Method

1. **Type Checking**:
   Run `npx tsc --noEmit` or `npm run typecheck` to confirm zero type errors across `pose.ts`, `GaitApp.tsx`, `ratings.ts`, `guesses.ts`, and `types.ts`.
2. **Unit & Integration Testing**:
   - Verify `resamplePoseFrames` returns exact uniform timestamps $\Delta t = 33.33\text{ ms}$ and preserves smooth sinusoidal trajectories without NaN.
   - Verify `buildStructuredReport` correctly includes $SA$, $HR$, and Zeni stance phase in domain ratings and drivers.
   - Verify `buildEducatedGuesses` fires `zifchock-sa-deviation` when $SA > 5.0\%$ and `fft-hr-dysrhythmia` when $HR < 1.8$.

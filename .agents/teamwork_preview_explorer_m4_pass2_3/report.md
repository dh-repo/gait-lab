# Milestone 4 Pass 2 Technical Investigation Report: Gait Event Detection & Synthetic U-Turn Blueprint

**Agent ID**: `teamwork_preview_explorer_m4_pass2_3`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m4_pass2_3`  
**Target Codebase**: `/Users/damian/GitHub/gait-lab/src/lib/gait/events.ts`  
**Target Tests**: `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/events.test.ts`  
**Date**: 2026-08-10  

---

## 1. Executive Summary

This report presents a thorough, read-only forensic investigation into kinematic gait event detection in `src/lib/gait/events.ts` and its test suite `src/lib/gait/__tests__/events.test.ts` for **Milestone 4 (Requirement R5: Dynamic Walking Direction & Lateral Ankle Disambiguation)**.

### Core Discoveries:
1. **Global Direction Vulnerability in U-Turns**: `detectGaitEventsZeni` computes a single global walking direction (`+1` or `-1`) by taking the global median of foot orientation differences `(lToe.x - lHeel.x)` across all frames. In 180° walk-and-turn protocols, positive foot differences from the outbound path cancel out negative foot differences from the return path. The resulting median is near zero, causing fallback to total hip displacement (which is also ~0 for returning walks). This assigns a default global `direction = 1`, causing 100% of return-segment heel strikes to be searched with inverted peak modes (`heelStrikeMode = "max"` instead of `"min"`), completely failing event detection on the return walk.
2. **Naive Parity Alternation Fragility in Frontal-Y Fallback**: When AP motion collapses (`apRange < 0.028`), the engine falls back to vertical ankle coordinate extrema (`midAnkleY`). It assigns contacts using naive index modulo parity (`if (k % 2 === 0) rawLHeelStrikes.push(f); else rawRHeelStrikes.push(f);`). A single missed contact or false positive permanently inverts left/right foot labeling for all remaining steps.
3. **Comprehensive Synthetic U-Turn Test Suite Design**: We specify two new synthetic test scenarios—Sagittal 180° U-Turn Walk-and-Turn Protocol and Frontal Walk-and-Turn with Lateral Ankle Disambiguation—to rigorously validate R5 dynamic direction and frontal-Y contact disambiguation.
4. **Zero-Regression Safeguards**: We map potential regression risks across existing tests (`events.test.ts`, `e2e_gait_engine_tiers.test.ts`, `challenger_m5_2.test.ts`, `events.challenger_m7_2.test.ts`) and establish explicit safeguards for API contract backward compatibility (`inferredDirection` summary scalar), window boundary clamping, hysteresis thresholding, and low frame rate handling.

---

## 2. Forensic Analysis of `detectGaitEventsZeni` Across Scenarios

### 2.1 Current Implementation Architecture (`src/lib/gait/events.ts`)

`detectGaitEventsZeni` (lines 190–527) performs kinematic gait event detection based on anterior-posterior (AP) foot displacement relative to mid-hip position:

```ts
// 1. Mid-hip and relative foot trajectory calculation (lines 212–235)
const hipX = lHip && rHip ? (lHip.x + rHip.x) / 2 : 0.5;
leftHeelXRel[i] = lHeel - hipX;
rightHeelXRel[i] = rHeel - hipX;
leftToeXRel[i] = lToe - hipX;
rightToeXRel[i] = rToe - hipX;

// 2. Global direction calculation (lines 237–290)
for (let i = 0; i < n; i++) {
  // Pushes (lToe.x - lHeel.x) and (rToe.x - rHeel.x) for landmarks with visibility >= 0.4
}
if (footDiffs.length >= 5) {
  footDiffs.sort((a, b) => a - b);
  const medianFootDiff = footDiffs[Math.floor(footDiffs.length / 2)];
  if (Math.abs(medianFootDiff) > 0.005) {
    direction = medianFootDiff > 0 ? 1 : -1;
  } else {
    direction = (midHipX[n - 1] - midHipX[0]) < -0.05 ? -1 : 1;
  }
}

// 3. Peak mode selection based on direction (lines 300–306)
const heelStrikeMode: "max" | "min" = direction === 1 ? "max" : "min";
const toeOffMode: "max" | "min" = direction === 1 ? "min" : "max";
```

### 2.2 Behavior on Current Test Scenarios

#### Scenario A: Straight Walking (L->R vs R->L)
- **Left-to-Right (`direction = 1`)**:
  - `toe.x - heel.x > +0.005` (foot points right, in direction of motion).
  - `medianFootDiff > 0.005` $\implies$ `direction = 1`.
  - `heelStrikeMode = "max"`: Heel strike occurs at maximum positive X relative to mid-hip (foot reaches furthest forward in L->R direction).
  - `toeOffMode = "min"`: Toe off occurs at minimum X relative to mid-hip (foot is furthest trailing behind hip).
  - **Result**: Passes all assertions in `events.test.ts` (lines 7–22).
- **Right-to-Left (`direction = -1`)**:
  - `toe.x - heel.x < -0.005` (foot points left).
  - `medianFootDiff < -0.005` $\implies$ `direction = -1`.
  - `heelStrikeMode = "min"`: Heel strike occurs at minimum X relative to mid-hip (furthest forward in R->L direction).
  - `toeOffMode = "max"`: Toe off occurs at maximum X relative to mid-hip (furthest trailing behind hip).
  - **Result**: Passes all assertions in `events.test.ts` (lines 24–38).

#### Scenario B: Frontal View Walking (`apRange < 0.028`)
- **Trigger**: Lines 316–322 check if AP heel motion range is $< 0.028$ and `apEventCount < 5`.
- **Mechanism**:
  - Computes vertical ankle trajectories `leftAnkleY`, `rightAnkleY`, and `midAnkleY = max(leftAnkleY, rightAnkleY)` (lines 323–336).
  - Maxima in `filtMidY` represent ground contact frames (`midStrikes`).
  - Assigns contacts to left and right feet via index modulo parity (lines 349–352):
    ```ts
    for (let k = 0; k < midStrikes.length; k++) {
      const f = midStrikes[k];
      if (k % 2 === 0) rawLHeelStrikes.push(f);
      else rawRHeelStrikes.push(f);
    }
    ```
- **Vulnerability**: If one stride contact is missed by `findExtrema` or an extra bounce artifact is included, parity flips. Step $k$ becomes step $k+1$, permanently swapping left and right leg event assignments for the rest of the clip.

#### Scenario C: Walk-and-Turn / U-Turn Protocols (Failure Mechanism)
Consider a subject performing a 10-meter clinical walk-and-turn protocol:
1. **Outbound segment** (0s–3s): 90 frames of L->R walking. `footDiffs` contains ~180 samples of $+0.05$.
2. **Turn segment** (3s–4s): 30 frames of 180° pivot.
3. **Return segment** (4s–7s): 90 frames of R->L walking. `footDiffs` contains ~180 samples of $-0.05$.

**Mathematical Trace of Failure**:
$$\text{Sorted } \texttt{footDiffs} = [\underbrace{-0.05, \dots, -0.05}_{180 \text{ samples}}, \underbrace{\approx 0, \dots, \approx 0}_{30 \text{ samples}}, \underbrace{+0.05, \dots, +0.05}_{180 \text{ samples}}]$$
- Median index is $390 / 2 = 195$, where $\text{footDiffs}[195] \approx 0.000$.
- $|\text{medianFootDiff}| \le 0.005 \implies$ enters fallback to total hip displacement:
  $$\Delta X_{\text{hip}} = \text{midHipX}[209] - \text{midHipX}[0] \approx 0.15 - 0.15 = 0.000$$
- Fallback assigns default `direction = 1`.
- Global `heelStrikeMode = "max"` is applied across all 210 frames.
- **Impact**:
  - Frames 0–90 (outbound): Correctly detected using `"max"`.
  - Frames 120–210 (return): In R->L walking, true heel strikes are at minimum relative X. Mode `"max"` searches for positive peaks, completely missing heel strikes and incorrectly picking toe-off frames instead.
  - **Outcome**: Return segment event detection fails, corrupting overall stance/swing breakdown and step time variability.

---

## 3. Synthetic U-Turn Test Blueprint & Scenario Specifications

To verify dynamic per-stride walking direction (R5) and lateral ankle contact disambiguation, we design three synthetic test scenarios for `events.test.ts`.

### 3.1 Scenario 1: Sagittal 180° U-Turn Walk-and-Turn Protocol

#### Test Description
A single subject walks left-to-right for 3.0 seconds, turns 180 degrees over 1.0 second, and walks right-to-left for 3.0 seconds at 30 FPS (210 total frames).

#### Generator Specification (`generateSagittalUTurnFrames`)
```ts
export function generateSagittalUTurnFrames(fps = 30, durationSec = 7.0): PoseFrame[] {
  const totalFrames = Math.floor(fps * durationSec);
  const frames: PoseFrame[] = [];
  const turnStart = Math.floor(fps * 3.0); // frame 90
  const turnEnd = Math.floor(fps * 4.0);   // frame 120
  const speed = 0.10; // norm units / sec
  const freq = 1.6; // Hz (~96 spm)

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const timeMs = t * 1000;

    let dir = 1;
    let headingAngle = 0; // 0 = L->R, PI = R->L
    let posX = 0.15;

    if (f < turnStart) {
      dir = 1;
      headingAngle = 0;
      posX = 0.15 + speed * t;
    } else if (f >= turnStart && f <= turnEnd) {
      const u = (f - turnStart) / (turnEnd - turnStart);
      headingAngle = Math.PI * (1 - Math.cos(Math.PI * u)) / 2; // smooth 0 to PI transition
      const distBefore = speed * (turnStart / fps);
      const turnDx = speed * (u * (turnEnd - turnStart) / fps) * Math.cos(headingAngle);
      posX = 0.15 + distBefore + turnDx;
      dir = Math.cos(headingAngle) >= 0 ? 1 : -1;
    } else {
      dir = -1;
      headingAngle = Math.PI;
      const distBefore = speed * (turnStart / fps);
      const turnDist = speed * 0.5;
      posX = 0.15 + distBefore + turnDist - speed * ((f - turnEnd) / fps);
    }

    const midHipX = posX;
    const midHipY = 0.5 + 0.02 * Math.sin(2 * Math.PI * freq * 2 * t);
    const legPhase = 2 * Math.PI * freq * t;
    const rightPhase = legPhase + Math.PI;

    const leftAnkleOffset = 0.15 * Math.sin(legPhase) * Math.cos(headingAngle);
    const rightAnkleOffset = 0.15 * Math.sin(rightPhase) * Math.cos(headingAngle);

    const leftAnkleX = midHipX + leftAnkleOffset;
    const rightAnkleX = midHipX + rightAnkleOffset;
    const leftAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(legPhase));
    const rightAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(rightPhase));

    const footVector = 0.05 * Math.cos(headingAngle);

    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    landmarks[0]  = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
    landmarks[11] = { x: midHipX - 0.05 * Math.cos(headingAngle), y: 0.3, z: 0, visibility: 0.9 };
    landmarks[12] = { x: midHipX + 0.05 * Math.cos(headingAngle), y: 0.3, z: 0, visibility: 0.9 };
    landmarks[23] = { x: midHipX - 0.04, y: midHipY, z: 0, visibility: 0.9 };
    landmarks[24] = { x: midHipX + 0.04, y: midHipY, z: 0, visibility: 0.9 };
    landmarks[25] = { x: (midHipX + leftAnkleX) / 2, y: 0.68, z: 0, visibility: 0.9 };
    landmarks[26] = { x: (midHipX + rightAnkleX) / 2, y: 0.68, z: 0, visibility: 0.9 };
    landmarks[27] = { x: leftAnkleX, y: leftAnkleY, z: 0, visibility: 0.9 };
    landmarks[28] = { x: rightAnkleX, y: rightAnkleY, z: 0, visibility: 0.9 };
    landmarks[29] = { x: leftAnkleX - footVector * 0.4, y: leftAnkleY, z: 0, visibility: 0.9 };
    landmarks[30] = { x: rightAnkleX - footVector * 0.4, y: rightAnkleY, z: 0, visibility: 0.9 };
    landmarks[31] = { x: leftAnkleX + footVector * 0.6, y: leftAnkleY + 0.01, z: 0, visibility: 0.9 };
    landmarks[32] = { x: rightAnkleX + footVector * 0.6, y: rightAnkleY + 0.01, z: 0, visibility: 0.9 };

    frames.push({ timeMs, landmarks });
  }

  return frames;
}
```

#### Test Blueprint (Vitest)
```ts
it("detects heel strikes and stance phases across both directions of a 180° U-turn walk", () => {
  const frames = generateSagittalUTurnFrames(30, 7.0);
  const result = detectGaitEventsZeni(frames, 30);

  // 1. Overall step events detected in both segments
  const outboundEvents = result.stepEvents.filter((e) => e.frame < 90);
  const returnEvents = result.stepEvents.filter((e) => e.frame > 120);

  expect(outboundEvents.length).toBeGreaterThanOrEqual(4);
  expect(returnEvents.length).toBeGreaterThanOrEqual(4);

  // 2. Physiological phase breakdown validation
  expect(result.leftStancePct).toBeGreaterThanOrEqual(45);
  expect(result.leftStancePct).toBeLessThanOrEqual(75);
  expect(result.rightStancePct).toBeGreaterThanOrEqual(45);
  expect(result.rightStancePct).toBeLessThanOrEqual(75);
  expect(result.doubleSupportPct).toBeGreaterThanOrEqual(5.0);
  expect(result.doubleSupportPct).toBeLessThanOrEqual(40.0);
});
```

---

### 3.2 Scenario 2: Frontal Walk-and-Turn with Lateral Ankle Disambiguation

#### Test Description
A subject walks toward the camera, turns 180°, and walks away from the camera in a frontal camera perspective (`apRange < 0.028`). Tests that lateral ankle position inspection (`y_L` vs `y_R` and `x_L` vs `x_R`) correctly disambiguates left vs right stance contacts without relying on modulo parity `k % 2`.

#### Generator Specification (`generateFrontalUTurnFrames`)
```ts
export function generateFrontalUTurnFrames(fps = 30, durationSec = 6.0): PoseFrame[] {
  const totalFrames = Math.floor(fps * durationSec);
  const frames: PoseFrame[] = [];
  const turnStart = Math.floor(fps * 2.5); // frame 75
  const turnEnd = Math.floor(fps * 3.5);   // frame 105
  const freq = 1.6;

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const timeMs = t * 1000;

    let isTowardCamera = f < turnStart;
    let isAwayFromCamera = f > turnEnd;

    // In frontal view, left ankle is on camera-right (higher X) when facing camera,
    // and on camera-left (lower X) when facing away from camera.
    const midHipX = 0.5;
    const midHipY = 0.5 + 0.01 * Math.sin(2 * Math.PI * freq * 2 * t);
    const legPhase = 2 * Math.PI * freq * t;
    const rightPhase = legPhase + Math.PI;

    // Lateral ankle spacing
    const lateralSep = 0.08;
    let lAnkleBaseX = midHipX + (isTowardCamera ? lateralSep : -lateralSep);
    let rAnkleBaseX = midHipX + (isTowardCamera ? -lateralSep : lateralSep);

    // Stance foot reaches max Y (lowest in image)
    const leftAnkleY = 0.85 - 0.04 * Math.max(0, Math.sin(legPhase));
    const rightAnkleY = 0.85 - 0.04 * Math.max(0, Math.sin(rightPhase));

    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    landmarks[0]  = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
    landmarks[11] = { x: lAnkleBaseX, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[12] = { x: rAnkleBaseX, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[23] = { x: lAnkleBaseX, y: midHipY, z: 0, visibility: 0.9 };
    landmarks[24] = { x: rAnkleBaseX, y: midHipY, z: 0, visibility: 0.9 };
    landmarks[27] = { x: lAnkleBaseX, y: leftAnkleY, z: 0, visibility: 0.9 };
    landmarks[28] = { x: rAnkleBaseX, y: rightAnkleY, z: 0, visibility: 0.9 };
    landmarks[29] = { x: lAnkleBaseX, y: leftAnkleY, z: 0, visibility: 0.9 };
    landmarks[30] = { x: rAnkleBaseX, y: rightAnkleY, z: 0, visibility: 0.9 };
    landmarks[31] = { x: lAnkleBaseX, y: leftAnkleY + 0.01, z: 0, visibility: 0.9 };
    landmarks[32] = { x: rAnkleBaseX, y: rightAnkleY + 0.01, z: 0, visibility: 0.9 };

    frames.push({ timeMs, landmarks });
  }

  return frames;
}
```

#### Test Blueprint (Vitest)
```ts
it("correctly disambiguates left and right contacts in frontal U-turn using lateral ankle landmarks", () => {
  const frames = generateFrontalUTurnFrames(30, 6.0);
  const result = detectGaitEventsZeni(frames, 30);

  expect(result.stepEvents.length).toBeGreaterThan(0);

  // Verify that left heel strikes correspond to frames where left ankle is at stance contact Y
  const leftStrikes = result.stepEvents.filter((e) => e.side === "left" && e.type === "heel_strike");
  const rightStrikes = result.stepEvents.filter((e) => e.side === "right" && e.type === "heel_strike");

  expect(leftStrikes.length).toBeGreaterThan(0);
  expect(rightStrikes.length).toBeGreaterThan(0);

  for (const strike of leftStrikes) {
    const frameLms = frames[strike.frame].landmarks;
    const lY = frameLms[27].y;
    const rY = frameLms[28].y;
    // Left ankle should be lower or equal to right ankle at left stance contact
    expect(lY).toBeGreaterThanOrEqual(rY - 0.02);
  }
});
```

---

## 4. Architectural Implementation Blueprint for R5 in `events.ts`

### 4.1 Dynamic Per-Stride Walking Direction (Sliding Window)

#### Mathematical Formulation
1. **Sliding Window Size**:
   $$W = \min\left(n, \max\left(5, \text{Math.round}(1.5 \cdot \text{effectiveFps})\right)\right)$$
   (e.g., $W = 45$ frames at 30 FPS).
2. **Local Median Calculation**:
   For each frame $i \in [0, n-1]$:
   - Define local frame interval $[i_{\text{start}}, i_{\text{end}}] = [\max(0, i - \lfloor W/2 \rfloor), \min(n-1, i + \lfloor W/2 \rfloor)]$.
   - Collect valid foot orientation differences $\Delta x_{\text{foot}} = x_{\text{toe}} - x_{\text{heel}}$ for visible landmarks ($\text{visibility} \ge 0.4$) within interval.
   - Compute local median $\tilde{D}_i$.
3. **Sign-Flip Hysteresis Thresholding ($> 0.01$)**:
   - Maintain state $d_{\text{state}} \in \{+1, -1\}$, initialized to initial valid median sign (or hip drift fallback).
   - For frame $i$:
     - If $\tilde{D}_i > +0.01 \implies d_{\text{state}} = +1$.
     - If $\tilde{D}_i < -0.01 \implies d_{\text{state}} = -1$.
     - If $|\tilde{D}_i| \le 0.01 \implies$ retain current $d_{\text{state}}$.
   - Construct direction vector $\mathbf{D} = [d_0, d_1, \dots, d_{n-1}]$.
4. **Segment-Wise Extrema Peak Detection**:
   - Instead of applying global `"max"` or `"min"` across all $n$ frames, evaluate peak extrema locally:
     - Heel strike at $i$: if $d_i = +1$, search positive peak (`"max"`); if $d_i = -1$, search negative peak (`"min"`).
     - Toe off at $i$: if $d_i = +1$, search negative peak (`"min"`); if $d_i = -1$, search positive peak (`"max"`).
5. **Backward Compatibility Preservation**:
   - Return `inferredDirection` as a single summary scalar (mode or median of $\mathbf{D}$) so existing tests asserting `result.inferredDirection === 1` or `-1` remain 100% passing.

---

### 4.2 Frontal-Y Lateral Ankle Contact Disambiguation

Replace modulo parity alternation (`if (k % 2 === 0)`) in lines 349–370 with direct landmark coordinate inspection at peak contact frame $f$:

```ts
// Multi-Factor Frontal Contact Disambiguation Blueprint
for (let k = 0; k < midStrikes.length; k++) {
  const f = midStrikes[k];
  const frame = frames[f];
  const lAnkle = frame?.landmarks?.[LM.L_ANKLE];
  const rAnkle = frame?.landmarks?.[LM.R_ANKLE];
  const lHip = frame?.landmarks?.[LM.L_HIP];
  const rHip = frame?.landmarks?.[LM.R_HIP];

  const lY = lAnkle?.y ?? 0.5;
  const rY = rAnkle?.y ?? 0.5;
  const yDiff = lY - rY; // positive => left ankle is lower in frame (closer to ground)

  let isLeftContact = false;
  if (Math.abs(yDiff) > 0.008) {
    // 1. Primary factor: Vertical elevation (stance leg is planted lower in image)
    isLeftContact = yDiff > 0;
  } else {
    // 2. Secondary factor: Lateral position relative to hip center
    const hipCenterX = (lHip && rHip) ? (lHip.x + rHip.x) / 2 : 0.5;
    const lXRel = (lAnkle?.x ?? 0.5) - hipCenterX;
    const rXRel = (rAnkle?.x ?? 0.5) - hipCenterX;
    isLeftContact = Math.abs(lXRel) > Math.abs(rXRel);
  }

  if (isLeftContact) {
    rawLHeelStrikes.push(f);
  } else {
    rawRHeelStrikes.push(f);
  }
}
```

---

## 5. Regression Risk Assessment & Mitigation Matrix

We conducted a complete audit of all existing test files that invoke `detectGaitEventsZeni` or inspect event breakdown results:

| Test File | Test Case / Area | Failure Risk under R5 | Required Safeguard / Mitigation |
|---|---|---|---|
| `events.test.ts` (lines 7–38) | `detects heel strike... left-to-right` & `right-to-left` | **Low**: Constant direction clips produce uniform direction vector $\mathbf{D} = [1, \dots, 1]$ or $[-1, \dots, -1]$. | Ensure hysteresis threshold $> 0.01$ does not delay direction initialization on frame 0. |
| `events.test.ts` (lines 112–148) | `inferredDirection` assertion in follow-cam shots | **High**: Existing tests explicitly check `result.inferredDirection === 1` and `-1`. | `detectGaitEventsZeni` must compute `inferredDirection` summary scalar (mode/median of $\mathbf{D}$) and return it in `GaitPhaseBreakdown`. |
| `events.test.ts` (lines 80–94) | Short frame count ($n < 10$) | **Medium**: Window size $W = 45$ exceeds $n = 7$. | Clamp window size $W_{\text{eff}} = \min(n, \max(5, \text{round}(1.5 \cdot \text{fps})))$ and preserve early return for $n < 10$. |
| `e2e_gait_engine_tiers.test.ts` (lines 302–320) | Tier 1 direction inference (`bdLr`, `bdRl`) | **High**: Direct check `bdLr.inferredDirection === 1` and `bdRl.inferredDirection === -1`. | Maintain summary `inferredDirection` property on returned breakdown object. |
| `events.challenger_m7_2.test.ts` (line 266) | Multi-FPS stress (10 Hz, 60 Hz, 120 Hz) | **Medium**: At 10 Hz, $1.5 \cdot 10 = 15$ frames; at 120 Hz, $1.5 \cdot 120 = 180$ frames. | Scale sliding window size dynamically with `effectiveFps` ($1.5 \cdot \text{effectiveFps}$). |
| `challenger_m5_2.test.ts` (line 182) | Frontal frames event detection | **High**: Modulo parity replacement must accurately process existing frontal test inputs. | Validate multi-factor vertical $y_{\text{L}}$ vs $y_{\text{R}}$ ankle check on `generateSyntheticWalkingFrames({ viewAngle: 'frontal' })`. |
| `m1_challenger_adversarial_suite.test.ts` (line 127) | Edge cases: FPS = 0, -30, NaN, Infinity | **Low**: Pre-checks exist (`fps <= 0`). | Maintain existing boundary checks at function entry. |

---

## 6. Verification Plan for Milestone 4

To independently verify R5 dynamic direction and frontal-Y fixes during M4 execution:

1. **Vitest Test Suite Execution**:
   ```bash
   npx vitest run src/lib/gait/__tests__/events.test.ts
   npx vitest run src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts
   npx vitest run src/lib/gait/__tests__/events.challenger_m7_2.test.ts
   ```
   *Requirement*: 100% green pass rate across all existing 15+ tests plus 2 new synthetic U-turn test scenarios.

2. **TypeScript & Lint Verification**:
   ```bash
   npx tsc --noEmit
   npx eslint src/lib/gait/events.ts
   ```
   *Requirement*: 0 compilation or linting errors.

3. **Full Suite Regression Check**:
   ```bash
   npx vitest run
   ```
   *Requirement*: All 986+ existing tests in the project pass without regression.

---

**Report Authored By**: `teamwork_preview_explorer_m4_pass2_3`  
**Status**: Investigation & Blueprint Complete — Ready for M4 Implementation

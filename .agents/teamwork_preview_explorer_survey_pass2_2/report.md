# Phase 2 Technical Survey & Requirement Analysis Report (R4, R5, R6, R7)

**Agent ID**: `teamwork_preview_explorer_survey_pass2_2`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_2`  
**Project Root**: `/Users/damian/GitHub/gait-lab`  
**Date**: 2026-08-10  

---

## 1. Executive Summary

This report delivers an exhaustive, read-only codebase survey for requirements **R4, R5, R6, and R7** of Phase 2 in the `gait-lab` spatio-temporal gait analysis engine. Based on deep inspection of `src/lib/gait/PoseTracker.ts`, `src/lib/gait/events.ts`, `src/lib/gait/analysis.ts`, `src/lib/gait/signal.ts`, and associated unit/integration test suites (986/986 passing), we document the precise locations, algorithmic deficiencies, math formulations, data structures, and test dependencies required for Phase 2 implementation.

---

## 2. Requirement R4: Biometric-Aware Target Lock & Occlusion Recovery in `PoseTracker.ts`

### 2.1 Current Architecture & Code Mapping
- **File Path**: `/Users/damian/GitHub/gait-lab/src/lib/gait/PoseTracker.ts` (416 lines)
- **Relevant Code Ranges**:
  - `PoseTracker` state properties: lines 105–108
  - Candidate scoring loop in `loop()`: lines 337–369
  - Velocity estimation step: lines 374–386

```ts
// Existing candidate scoring in PoseTracker.ts (lines 357 & 362):
let score = area * 2;
if (this.lastTargetHip) {
  const dLast = Math.hypot(hip.x - this.lastTargetHip.x, hip.y - this.lastTargetHip.y);
  const dPred = dtSec > 0 ? Math.hypot(hip.x - predX, hip.y - predY) : dLast;
  const d = Math.min(dLast, dPred);
  score = d <= 0.35 ? area * 2 - d * 4 + 1.0 : area * 2 - d * 2;
}
```

### 2.2 Forensic Diagnosis of 4 Core Weaknesses
1. **Bbox Area Bias (`area * 2`)**: Scoring relies heavily on raw bounding box area (`box.w * box.h`). When a bystander or secondary subject walks closer to the camera, their larger bbox area inflates their score, stealing target lock from the primary subject.
2. **Missing Biometric Matching**: Unlike `matchPeople()` in `analysis.ts`, `PoseTracker` does not compute or compare morphological body proportions (`torsoLegRatio`, `shoulderHipRatio`, `aspectRatio`).
3. **Unclamped Velocity Jitter**: Single-frame MediaPipe keypoint noise produces large step velocity estimates (`vxStep = (newHip.x - lastTargetHip.x) / dtSec`). Without velocity clamping, `targetVelocity` spikes, causing predicted position (`predX, predY`) to overshoot.
4. **Lack of Occlusion Recovery Timeout**: When target landmarks are lost across consecutive frames (e.g. subject passes behind an obstacle or exits/re-enters frame), `lastTargetHip` stays static while predictions diverge, never timing out or resetting the lock.

### 2.3 Required Technical Upgrades & Design
- **Biometric Integration**:
  - Import `computeBiometricSignature`, `biometricDistance`, `BiometricSignature` from `./analysis`.
  - Maintain `targetBiometrics?: BiometricSignature` state property in `PoseTracker`.
- **Normalized 4-Factor Candidate Scoring**:
  $$\text{Score} = 0.40 \cdot S_{\text{spatial}} + 0.30 \cdot S_{\text{biometric}} + 0.15 \cdot S_{\text{area}} + 0.15 \cdot S_{\text{continuity}}$$
  - $S_{\text{spatial}} = \max(0, 1 - d_{\text{pred}} / d_{\text{max}})$ where $d_{\text{max}} = 0.40$
  - $S_{\text{biometric}} = 1 - \min(1, \text{biometricDistance}(\text{candBio}, \text{targetBio}))$
  - $S_{\text{area}} = 1 - \min(1, |\text{candArea} - \text{targetArea}| / \max(0.01, \text{targetArea}))$
  - $S_{\text{continuity}} = \max(0, 1 - d_{\text{last}} / d_{\text{max}})$
- **Rolling Velocity Clamping ($\pm 2\sigma$)**:
  - Track rolling window of velocity step magnitudes (or per-axis components).
  - Clamp raw step velocity $v_{\text{step}}$ to $[\mu - 2\sigma, \mu + 2\sigma]$ before blending into `targetVelocity`.
- **Occlusion Coasting & 30-Frame Timeout**:
  - Track `occlusionFrames: number`.
  - When no valid candidate matches: decay velocity by $0.9^N$ per frame ($v_{k} = 0.9 \cdot v_{k-1}$), coast `lastTargetHip` using decayed velocity.
  - If `occlusionFrames >= 30` (~1s at 30fps), reset target lock (`lastTargetHip = null`, `targetVelocity = {vx:0, vy:0}`, `targetBiometrics = undefined`).

### 2.4 Test Suite & File Dependencies
- Primary Test File: `src/lib/gait/__tests__/PoseTracker.test.ts`
- Related Tests: `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts`, `src/components/gait/__tests__/WebcamCapture.test.tsx`, `src/lib/gait/__tests__/challenger_m2_1_empirical.test.ts`.

---

## 3. Requirement R5: Dynamic Per-Stride Walking Direction for U-Turn Handling in `events.ts`

### 3.1 Current Architecture & Code Mapping
- **File Path**: `/Users/damian/GitHub/gait-lab/src/lib/gait/events.ts` (610 lines)
- **Function**: `detectGaitEventsZeni` (lines 237–290 direction detection, lines 349–370 frontal-Y fallback)

```ts
// Existing direction calculation in events.ts (lines 270–284):
let direction = 1;
if (footDiffs.length >= 5) {
  footDiffs.sort((a, b) => a - b);
  const midIdx = Math.floor(footDiffs.length / 2);
  const medianFootDiff = footDiffs.length % 2 === 0
    ? (footDiffs[midIdx - 1] + footDiffs[midIdx]) / 2
    : footDiffs[midIdx];
  if (Math.abs(medianFootDiff) > 0.005) {
    direction = medianFootDiff > 0 ? 1 : -1;
  }
}
```

### 3.2 Forensic Diagnosis of Deficiencies
1. **Global Single-Direction Assumption**: The engine calculates a single global `direction` (+1 or -1) for the entire video clip. In 10-meter walk-and-turn clinical tests, the subject turns 180° mid-trial. During the return segment, heel-strike and toe-off peak modes (`heelStrikeMode = direction === 1 ? "max" : "min"`) invert, missing all heel strikes on the return path.
2. **Frontal-Y Fallback Parity Fragility**: Lines 349–370 use strict modulo alternation (`if (k % 2 === 0) rawLHeelStrikes.push(f); else rawRHeelStrikes.push(f);`). If a single heel strike is missed or noisy frame added, all subsequent left/right step contacts are permanently inverted.

### 3.3 Required Technical Upgrades & Design
- **Sliding Window Direction Vector (~1.5s / 45 frames)**:
  - Define window size $W = \text{Math.round}(1.5 \cdot \text{effectiveFps})$ (e.g. 45 frames at 30 FPS).
  - Compute local median foot orientation $\Delta x_{\text{foot}} = x_{\text{toe}} - x_{\text{heel}}$ over sliding window $[i - W/2, i + W/2]$.
  - Apply sign-flip hysteresis with threshold $> 0.01$: change direction state to $+1$ only if local median $> +0.01$, and to $-1$ only if local median $< -0.01$.
  - Segment gait sequence into directional regions; execute peak finding (`findExtrema`) with matching local `heelStrikeMode` and `toeOffMode` per region.
- **Frontal-Y Fallback Lateral Ankle Disambiguation**:
  - Inspect joint coordinates at peak frame $f$: compare left ankle position $(x_{\text{L}}, y_{\text{L}})$ vs right ankle position $(x_{\text{R}}, y_{\text{R}})$.
  - Assign contact $f$ to Left foot if $y_{\text{L}} > y_{\text{R}}$ (lower in image) or based on lateral displacement $x_{\text{L}}$ relative to mid-hip, replacing blind $k \% 2$ index parity.

### 3.4 Test Suite & File Dependencies
- Primary Test Files: `src/lib/gait/__tests__/events.test.ts`, `src/lib/gait/__tests__/events.challenger_m7_2.test.ts`.

---

## 4. Requirement R6: Visibility-Gated Biometric Signatures & Sagittal Fix in `analysis.ts`

### 4.1 Current Architecture & Code Mapping
- **File Path**: `/Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts` (1236 lines)
- **Functions**: `computeBiometricSignature` (lines 717–756), `biometricDistance` (lines 758–765), track EMA update (lines 890–898).

```ts
// Existing computeBiometricSignature in analysis.ts (lines 723-733):
const leftShoulder = landmarks[11];
const rightShoulder = landmarks[12];
const leftHip = landmarks[23];
const rightHip = landmarks[24];
// NO visibility checks! Occluded joints corrupt ratio computations.
```

### 4.2 Forensic Diagnosis of Deficiencies
1. **Un-gated Keypoints**: Keypoints 11, 12, 23, 24, 27, 28 are read without evaluating `.visibility`. Low-confidence occluded landmarks introduce severe noise into `torsoLegRatio` and `shoulderHipRatio`.
2. **Sagittal Profile Collapse**: When subject is in side profile ($aspectRatio < 0.35$), left and right shoulders/hips project onto nearly identical X coordinates. `shoulderW = hypot(leftShoulder.x - rightShoulder.x, ...)` shrinks towards 0, causing `shoulderHipRatio` to collapse or fluctuate wildly.
3. **Static EMA Updating**: Track biometrics update using fixed 70/30 weighting (`0.7 * old + 0.3 * new`), regardless of whether the new frame's landmarks are high-confidence or noisy.

### 4.3 Required Technical Upgrades & Design
- **Keypoint Visibility Gate (`visibility >= 0.4`)**:
  - Verify `(lm.visibility ?? 1.0) >= 0.4` for keypoints 11, 12, 23, 24.
  - If visible landmarks are insufficient to compute reliable proportions, return `undefined` from `computeBiometricSignature()`.
  - Signature return type becomes `BiometricSignature | undefined`.
- **Sagittal View Handling ($aspectRatio < 0.35$)**:
  - Detect sagittal alignment when `aspectRatio < 0.35`.
  - In `biometricDistance(a, b)`: down-weight `shoulderHipRatio` contribution (e.g. reduce weight from $0.30$ to $0.05$ or $0.00$), re-distributing weight to `aspectRatio` ($0.50$) and `torsoLegRatio` ($0.45$).
- **Visibility-Weighted EMA Updating**:
  - Compute average landmark visibility $V_{\text{mean}}$ across keypoints 11, 12, 23, 24.
  - Blend EMA with dynamic weight $\alpha = 0.30 \cdot V_{\text{mean}}$:
    $$\text{bio}_{\text{updated}} = (1 - \alpha) \cdot \text{bio}_{\text{track}} + \alpha \cdot \text{bio}_{\text{frame}}$$

### 4.4 Test Suite & File Dependencies
- Primary Test Files: `src/lib/gait/__tests__/person_identification_stress.test.ts`, `src/lib/gait/__tests__/challenger_m2_1_empirical.test.ts`.
- Components Affected: `src/components/gait/GaitApp.tsx`.

---

## 5. Requirement R7: Adaptive SG Window & Uniform Resampling Guard in `signal.ts`

### 5.1 Current Architecture & Code Mapping
- **File Path**: `/Users/damian/GitHub/gait-lab/src/lib/gait/signal.ts` (426 lines)
- **Functions**: `savitzkyGolay5` (lines 190–232), `zeroPhaseButterworth` (lines 135–180).

```ts
// Existing savitzkyGolay5 kernel in signal.ts (lines 222-228):
// Fixed 5-point stencil 1/35 * [-3, 12, 17, 12, -3]
```

### 5.2 Forensic Diagnosis of Deficiencies
1. **Fixed 5-Point SG Stencil**: `savitzkyGolay5` uses a fixed 5-point stencil. At 60 FPS, 5 frames spans only ~83 ms (too small to eliminate high-frequency MediaPipe jitter). At 15 FPS, 5 frames spans 333 ms (over-smoothing heel-strike transient peaks).
2. **Non-Uniform Sampling Distortion in Butterworth**: `zeroPhaseButterworth` assumes a constant frame interval $\Delta t = 1 / \text{fps}$. WebRTC stream delivery and variable video decoding rates produce fluctuating timestamp intervals. Applying standard digital filter difference equations directly to non-uniformly sampled data distorts frequency response.

### 5.3 Required Technical Upgrades & Design
- **FPS-Adaptive Savitzky-Golay Windowing**:
  - Compute window size:
    $$W_{\text{raw}} = \text{Math.round}(\text{fps} \cdot 0.17)$$
    $$W = \max(5, \min(15, W_{\text{raw}} | 1)) \quad \text{(clamped odd integer between 5 and 15)}$$
  - At 30 FPS: $W = 5$ points (~167 ms span)
  - At 60 FPS: $W = 9$ or $11$ points (~167 ms span)
  - Dynamically generate or select Savitzky-Golay filter coefficients for window size $W$.
- **Uniform Resampling Guard in `zeroPhaseButterworth`**:
  - When optional timestamps $t_i$ are provided (or extracted from frames):
    - Compute intervals $\Delta t_i = t_{i+1} - t_i$, mean $\mu_{\Delta t}$, and variance $\sigma^2_{\Delta t}$.
    - If $\sigma^2_{\Delta t} > 0.10 \cdot \mu_{\Delta t}$ (variance $> 10\%$ of mean interval):
      - Linearly resample signal array onto uniform time grid $t_{\text{uniform}} = t_0 + k \cdot \mu_{\Delta t}$ prior to Butterworth filtering.

### 5.4 Test Suite & File Dependencies
- Primary Test Files: `src/lib/gait/__tests__/signal.test.ts`, `src/lib/gait/__tests__/events.challenger_m7_2.test.ts`, `src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts`.

---

## 6. Comprehensive Summary Matrix & Handoff Plan

| Req | Target File | Line Range | Key Deficiencies Identified | Solution Summary | Primary Tests |
|---|---|---|---|---|---|
| **R4** | `PoseTracker.ts` | 105-108, 337-369, 374-386 | Bbox area bias (`area * 2`), no biometrics, unclamped velocity jitter, no occlusion timeout | Normalized 4-factor score (40/30/15/15), $\pm 2\sigma$ velocity clamp, $0.9^N$ velocity decay + 30-frame lock reset | `PoseTracker.test.ts`, `WebcamCapture.test.tsx` |
| **R5** | `events.ts` | 237-290, 349-370 | Global single-direction assumption fails U-turns; Frontal-Y naive $k \% 2$ parity flips | Sliding window (~1.5s/45f) median foot orientation with hysteresis > 0.01; Lateral ankle coordinate inspection | `events.test.ts`, `events.challenger_m7_2.test.ts` |
| **R6** | `analysis.ts` | 717-756, 758-765, 890-898 | Un-gated keypoint reads, sagittal profile collapse ($aspectRatio < 0.35$), static EMA | Gate `visibility >= 0.4` (return `undefined`), down-weight $shoulderHipRatio$ in sagittal profile, visibility-weighted EMA | `person_identification_stress.test.ts`, `challenger_m2_1.test.ts` |
| **R7** | `signal.ts` | 135-180, 190-232 | Fixed 5-point SG stencil at all FPS; Butterworth assumes uniform $\Delta t$ | Adaptive SG window size $\text{fps} \cdot 0.17$ (5-15 odd points); Uniform resampling guard when $\text{var}(\Delta t) > 0.10 \cdot \text{mean}(\Delta t)$ | `signal.test.ts`, `e2e_gait_engine_tiers.test.ts` |

---

**Report Authored By**: `teamwork_preview_explorer_survey_pass2_2`  
**Status**: Survey Complete & Verified Green (986/986 Vitest tests passing)

# R6 Architecture Blueprint: Visibility-Gated Biometrics & Sagittal Collapse Fix

**Author**: `teamwork_preview_explorer_m1_2`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m1_2`  
**Target File**: `src/lib/gait/analysis.ts`  
**Date**: 2026-08-10  

---

## 1. Executive Summary

Requirement **R6** upgrades the morphological biometric signature subsystem in `src/lib/gait/analysis.ts`. In gait video analysis, keypoint occlusion and camera angle shifts (specifically sagittal profile orientation) introduce noise into morphological body proportions (`torsoLegRatio`, `shoulderHipRatio`, `aspectRatio`). 

Currently, `computeBiometricSignature()` reads raw landmark coordinates without checking keypoint visibility (`.visibility`), leading to corrupted biometric signatures when joints are occluded. Additionally, `shoulderHipRatio` collapses or fluctuates wildly when a subject walks in sagittal profile (`aspectRatio < 0.35`) due to near-zero 2D projection of shoulder and hip widths. Finally, track biometrics are updated using a static 70/30 Exponential Moving Average (EMA) regardless of frame landmark quality.

This report provides an exhaustive breakdown of the current implementation, followed by a precise technical blueprint and production-ready code replacement snippets to implement keypoint visibility gating (`visibility >= 0.4`), sagittal aspect ratio suppression, mean landmark visibility-weighted EMA updates, and comprehensive defensive guards against `NaN`, `Infinity`, or `undefined` propagation.

---

## 2. Forensic Architecture Breakdown of Current Code

### 2.1 Code Mapping in `src/lib/gait/analysis.ts`

- **`BiometricSignature` Type Definition** (lines 691–695):
  ```ts
  export type BiometricSignature = {
    aspectRatio: number;
    torsoLegRatio: number;
    shoulderHipRatio: number;
  };
  ```
- **`computeBiometricSignature()` Function** (lines 717–756):
  ```ts
  export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature {
    const box = boundingBox(landmarks);
    const h = Math.max(0.01, box.h);
    const w = Math.max(0.01, box.w);
    const aspectRatio = w / h;

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    let torsoLegRatio = 0.7;
    let shoulderHipRatio = 1.2;

    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const sMidX = (leftShoulder.x + rightShoulder.x) / 2;
      const sMidY = (leftShoulder.y + rightShoulder.y) / 2;
      const hMidX = (leftHip.x + rightHip.x) / 2;
      const hMidY = (leftHip.y + rightHip.y) / 2;

      const torsoLen = Math.hypot(sMidX - hMidX, sMidY - hMidY);

      let legLen = h - torsoLen;
      if (leftAnkle && rightAnkle) {
        const aMidX = (leftAnkle.x + rightAnkle.x) / 2;
        const aMidY = (leftAnkle.y + rightAnkle.y) / 2;
        legLen = Math.hypot(hMidX - aMidX, hMidY - aMidY);
      }
      legLen = Math.max(0.01, legLen);
      torsoLegRatio = torsoLen / legLen;

      const shoulderW = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
      const hipW = Math.hypot(leftHip.x - rightHip.x, leftHip.y - rightHip.y);
      shoulderHipRatio = shoulderW / Math.max(0.01, hipW);
    }

    return { aspectRatio, torsoLegRatio, shoulderHipRatio };
  }
  ```
- **`biometricDistance()` Function** (lines 758–765):
  ```ts
  export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number {
    if (!a || !b) return 0;
    const dAspect = Math.abs(a.aspectRatio - b.aspectRatio) / Math.max(0.1, a.aspectRatio, b.aspectRatio);
    const dTorsoLeg = Math.abs(a.torsoLegRatio - b.torsoLegRatio) / Math.max(0.1, a.torsoLegRatio, b.torsoLegRatio);
    const dShoulderHip = Math.abs(a.shoulderHipRatio - b.shoulderHipRatio) / Math.max(0.1, a.shoulderHipRatio, b.shoulderHipRatio);

    return dAspect * 0.35 + dTorsoLeg * 0.35 + dShoulderHip * 0.30;
  }
  ```
- **Track Assignment & Biometrics EMA Update in `matchPeople()`** (lines 890–898):
  ```ts
  if (trk.biometrics) {
    trk.biometrics = {
      aspectRatio: 0.7 * trk.biometrics.aspectRatio + 0.3 * bio.aspectRatio,
      torsoLegRatio: 0.7 * trk.biometrics.torsoLegRatio + 0.3 * bio.torsoLegRatio,
      shoulderHipRatio: 0.7 * trk.biometrics.shoulderHipRatio + 0.3 * bio.shoulderHipRatio,
    };
  } else {
    trk.biometrics = bio;
  }
  ```
- **Track Merging Biometrics Averaging in `mergeFragmentedTracks()`** (lines 1034–1044):
  ```ts
  if (earlier.biometrics && later.biometrics) {
    const totalW = w1 + w2;
    const eb = earlier.biometrics as any;
    const lb = later.biometrics as any;

    earlier.biometrics = {
      aspectRatio: (eb.aspectRatio * w1 + lb.aspectRatio * w2) / totalW,
      torsoLegRatio: ((eb.torsoLegRatio ?? eb.torsoRatio ?? 0.35) * w1 + (lb.torsoLegRatio ?? lb.torsoRatio ?? 0.35) * w2) / totalW,
      shoulderHipRatio: ((eb.shoulderHipRatio ?? eb.shoulderWidthRatio ?? 0.25) * w1 + (lb.shoulderHipRatio ?? lb.shoulderWidthRatio ?? 0.25) * w2) / totalW,
    };
  }
  ```

---

### 2.2 Forensic Analysis of Identified Deficiencies

1. **Zero Keypoint Visibility Gating**:
   - `computeBiometricSignature()` checks `if (leftShoulder && rightShoulder && leftHip && rightHip)`. However, MediaPipe keypoints can be present in the array but have low visibility (`visibility < 0.4`).
   - Occluded keypoints carry noisy, arbitrary pixel coordinates, leading to nonsensical ratios (e.g. `torsoLegRatio = 5.2` or `shoulderHipRatio = 0.05`).
   - Returning default values (`0.7`, `1.2`) or computing ratios from occluded keypoints corrupts the person track biometrics.

2. **Sagittal Profile Collapse**:
   - In frontal camera views, shoulder width (`shoulderW`) and hip width (`hipW`) are wide and stable.
   - In side profile / sagittal camera views (`aspectRatio < 0.35`), left and right shoulders overlap in X projection.
   - As `shoulderW` and `hipW` approach zero in 2D image coordinates, slight keypoint jitter causes `shoulderW / hipW` to fluctuate wildly (e.g. spiking from 0.4 to 3.5).
   - In `biometricDistance()`, `shoulderHipRatio` carries a fixed 30% weight (`dShoulderHip * 0.30`), causing valid track matches in side profile to be falsely rejected due to sagittal ratio collapse.

3. **Fixed 70/30 EMA Update**:
   - In `matchPeople()`, track biometrics update using fixed weights: `0.7 * old + 0.3 * new`.
   - Low-confidence or noisy frames update the track with the same weight as high-confidence frames.
   - Un-gated execution overwrites or assigns `trk.biometrics = bio` even when `bio` is derived from poor keypoints.

4. **Missing Type & Range Defensive Guards**:
   - No explicit protection against `NaN` or `Infinity` propagation if `legLen` or `hipW` equals 0 or if coordinates are non-finite.
   - No guard against `bio` being `undefined` during track updating in `matchPeople()`.

---

## 3. Detailed Technical Blueprint for R6

### 3.1 Requirement Breakdown & Specifications

#### 1. Visibility Gating (`visibility >= 0.4`)
- **Target Keypoints**:
  - `11` (Left Shoulder)
  - `12` (Right Shoulder)
  - `23` (Left Hip)
  - `24` (Right Hip)
  - `27` (Left Ankle)
  - `28` (Right Ankle)
- **Gating Rule**:
  - All 6 keypoints must be present (`landmarks[idx] !== undefined`).
  - Each required keypoint must satisfy `(lm.visibility ?? 1.0) >= 0.4`.
  - If any of the 6 keypoints is missing or has visibility `< 0.4`, `computeBiometricSignature()` MUST return `undefined`.
- **Return Type Change**:
  - Function signature updated to: `export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature | undefined`.

#### 2. Sagittal Aspect Ratio Detection & Suppression
- **Sagittal Detection Threshold**:
  - Detect sagittal profile alignment when `aspectRatio < 0.35` (where `aspectRatio = box.w / box.h`).
  - In `biometricDistance(a, b)`: evaluate `const isSagittal = a.aspectRatio < 0.35 || b.aspectRatio < 0.35;`.
- **Weight Redistribution**:
  - **Standard (Non-Sagittal)** View (`a.aspectRatio >= 0.35 && b.aspectRatio >= 0.35`):
    - `wAspect = 0.35`, `wTorsoLeg = 0.35`, `wShoulderHip = 0.30` (sum = 1.0).
  - **Sagittal View** (`a.aspectRatio < 0.35 || b.aspectRatio < 0.35`):
    - Suppress / down-weight `shoulderHipRatio` to `wShoulderHip = 0.05`.
    - Re-distribute weight to stable features: `wAspect = 0.475`, `wTorsoLeg = 0.475` (sum = 1.0).

#### 3. Mean Landmark Visibility Weighted EMA
- **Mean Visibility Calculation**:
  - Compute `meanVisibility = (vis11 + vis12 + vis23 + vis24 + vis27 + vis28) / 6.0`.
  - Attach `meanVisibility` to `BiometricSignature` object:
    ```ts
    export type BiometricSignature = {
      aspectRatio: number;
      torsoLegRatio: number;
      shoulderHipRatio: number;
      meanVisibility?: number;
    };
    ```
- **Visibility-Scaled Alpha**:
  - Scale the learning rate $\alpha$ by `meanVisibility`:
    $$\alpha = \text{clamp}(0.30 \cdot \text{meanVisibility}, 0.05, 0.50)$$
    $$\text{oldWeight} = 1.0 - \alpha$$
  - When `meanVisibility = 1.0`: $\alpha = 0.30$, `oldWeight = 0.70` (matches standard 70/30 EMA).
  - When `meanVisibility = 0.5`: $\alpha = 0.15$, `oldWeight = 0.85` (down-weights noisy frame).
- **Track Updating Guard**:
  - In `matchPeople()`, check `if (bio)` before performing EMA update or initializing `trk.biometrics`.
  - If `bio` is `undefined`, skip biometrics update, preserving `trk.biometrics` as-is.

#### 4. Defensive Guards Against `NaN`, `Infinity`, and Propagation Failure
- `boundingBox(landmarks)` fallback height/width clamped to $\ge 0.01$.
- `legLen` clamped to $\ge 0.01$, `hipW` clamped to $\ge 0.01$.
- `Number.isFinite()` validation on all computed ratios before returning.
- In `biometricDistance()`, return `0` if `!a || !b` or if any property is `NaN`/`Infinity`.

---

## 4. Production-Ready Code Replacement Snippets

Below are the exact, fully-typed code replacements to be applied to `src/lib/gait/analysis.ts`.

### 4.1 Type Definition (`src/lib/gait/analysis.ts`, lines 691–695)

```ts
export type BiometricSignature = {
  aspectRatio: number;
  torsoLegRatio: number;
  shoulderHipRatio: number;
  meanVisibility?: number;
};
```

### 4.2 `computeBiometricSignature()` (`src/lib/gait/analysis.ts`, lines 717–756)

```ts
export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature | undefined {
  if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 29) {
    return undefined;
  }

  // Required keypoints: 11 (L shoulder), 12 (R shoulder), 23 (L hip), 24 (R hip), 27 (L ankle), 28 (R ankle)
  const REQUIRED_INDICES = [11, 12, 23, 24, 27, 28];
  let visSum = 0;

  for (const idx of REQUIRED_INDICES) {
    const lm = landmarks[idx];
    if (!lm || typeof lm.x !== "number" || typeof lm.y !== "number" || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) {
      return undefined;
    }
    const vis = typeof lm.visibility === "number" && Number.isFinite(lm.visibility) ? lm.visibility : 1.0;
    if (vis < 0.4) {
      return undefined;
    }
    visSum += vis;
  }

  const meanVisibility = visSum / REQUIRED_INDICES.length;

  const box = boundingBox(landmarks);
  const h = Math.max(0.01, Number.isFinite(box.h) ? box.h : 0.01);
  const w = Math.max(0.01, Number.isFinite(box.w) ? box.w : 0.01);
  const aspectRatio = w / h;

  if (!Number.isFinite(aspectRatio)) {
    return undefined;
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const sMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const sMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hMidX = (leftHip.x + rightHip.x) / 2;
  const hMidY = (leftHip.y + rightHip.y) / 2;

  const torsoLen = Math.hypot(sMidX - hMidX, sMidY - hMidY);
  if (!Number.isFinite(torsoLen)) {
    return undefined;
  }

  const aMidX = (leftAnkle.x + rightAnkle.x) / 2;
  const aMidY = (leftAnkle.y + rightAnkle.y) / 2;
  const legLen = Math.max(0.01, Math.hypot(hMidX - aMidX, hMidY - aMidY));

  const torsoLegRatio = torsoLen / legLen;
  if (!Number.isFinite(torsoLegRatio)) {
    return undefined;
  }

  const shoulderW = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
  const hipW = Math.max(0.01, Math.hypot(leftHip.x - rightHip.x, leftHip.y - rightHip.y));
  const shoulderHipRatio = shoulderW / hipW;

  if (!Number.isFinite(shoulderHipRatio)) {
    return undefined;
  }

  return { aspectRatio, torsoLegRatio, shoulderHipRatio, meanVisibility };
}
```

### 4.3 `biometricDistance()` (`src/lib/gait/analysis.ts`, lines 758–765)

```ts
export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number {
  if (!a || !b) return 0;

  if (
    !Number.isFinite(a.aspectRatio) ||
    !Number.isFinite(a.torsoLegRatio) ||
    !Number.isFinite(a.shoulderHipRatio) ||
    !Number.isFinite(b.aspectRatio) ||
    !Number.isFinite(b.torsoLegRatio) ||
    !Number.isFinite(b.shoulderHipRatio)
  ) {
    return 0;
  }

  const dAspect = Math.abs(a.aspectRatio - b.aspectRatio) / Math.max(0.1, a.aspectRatio, b.aspectRatio);
  const dTorsoLeg = Math.abs(a.torsoLegRatio - b.torsoLegRatio) / Math.max(0.1, a.torsoLegRatio, b.torsoLegRatio);
  const dShoulderHip = Math.abs(a.shoulderHipRatio - b.shoulderHipRatio) / Math.max(0.1, a.shoulderHipRatio, b.shoulderHipRatio);

  // Sagittal view detection: aspect ratio < 0.35 indicates side profile where width projections collapse
  const isSagittal = a.aspectRatio < 0.35 || b.aspectRatio < 0.35;
  const wAspect = isSagittal ? 0.475 : 0.35;
  const wTorsoLeg = isSagittal ? 0.475 : 0.35;
  const wShoulderHip = isSagittal ? 0.05 : 0.30;

  const distVal = dAspect * wAspect + dTorsoLeg * wTorsoLeg + dShoulderHip * wShoulderHip;
  return Number.isFinite(distVal) ? distVal : 0;
}
```

### 4.4 Track Biometrics EMA Update in `matchPeople()` (`src/lib/gait/analysis.ts`, lines 890–898)

```ts
    if (bio) {
      if (trk.biometrics) {
        const meanVis = typeof bio.meanVisibility === "number" && Number.isFinite(bio.meanVisibility) ? bio.meanVisibility : 1.0;
        const alpha = Math.min(0.5, Math.max(0.05, 0.30 * meanVis));
        const oldWeight = 1.0 - alpha;

        const updatedAspect = oldWeight * trk.biometrics.aspectRatio + alpha * bio.aspectRatio;
        const updatedTorsoLeg = oldWeight * trk.biometrics.torsoLegRatio + alpha * bio.torsoLegRatio;
        const updatedShoulderHip = oldWeight * trk.biometrics.shoulderHipRatio + alpha * bio.shoulderHipRatio;
        const updatedVis = oldWeight * (trk.biometrics.meanVisibility ?? 1.0) + alpha * meanVis;

        if (Number.isFinite(updatedAspect) && Number.isFinite(updatedTorsoLeg) && Number.isFinite(updatedShoulderHip)) {
          trk.biometrics = {
            aspectRatio: updatedAspect,
            torsoLegRatio: updatedTorsoLeg,
            shoulderHipRatio: updatedShoulderHip,
            meanVisibility: updatedVis,
          };
        }
      } else {
        trk.biometrics = bio;
      }
    }
```

---

## 5. Impact Analysis & Integration Audit

### 5.1 Callers of `computeBiometricSignature()`

1. **`matchPeople()` in `src/lib/gait/analysis.ts`**:
   - `bio` can now be `undefined`.
   - `trk.biometrics ? biometricDistance(bio, trk.biometrics) : 0` handles `bio = undefined` by returning `0` inside `biometricDistance()`.
   - Track initialization `biometrics: bio` sets `biometrics` to `undefined` if `bio` is `undefined`. When a valid frame arrives, `if (bio)` assigns `trk.biometrics = bio`.

2. **`person_identification_stress.test.ts`**:
   - Synthetic landmark generators set `visibility = 0.95`, so `computeBiometricSignature()` returns valid signatures for non-occluded tests.
   - For occlusion tests (`visibility < 0.4`), `computeBiometricSignature()` safely returns `undefined`, testing track persistence without corrupted biometrics.

3. **`PoseTracker.ts` (Requirement R4)**:
   - R4 imports `computeBiometricSignature` and `biometricDistance`. It checks `candBio = computeBiometricSignature(cand)` and skips biometric similarity scoring if `candBio` or `targetBiometrics` is `undefined`.

---

## 6. Verification Plan & Test Protocol

### 6.1 Executable Verification Commands
- TypeScript typecheck: `npx tsc --noEmit`
- ESLint check: `npx eslint src/lib/gait/analysis.ts`
- Vitest test suite: `npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts`
- Full engine test suite: `npx vitest run`

### 6.2 New Unit Test Scenarios to Verify R6

1. **Visibility Gating Test**:
   - Pass landmarks where keypoint 11 has `visibility: 0.35` while keypoints 12, 23, 24, 27, 28 have `visibility: 0.9`. Verify `computeBiometricSignature()` returns `undefined`.
   - Pass landmarks where all 6 keypoints have `visibility: 0.40`. Verify `computeBiometricSignature()` returns a valid object.

2. **Sagittal Collapse Suppression Test**:
   - Compare `a = { aspectRatio: 0.25, torsoLegRatio: 0.6, shoulderHipRatio: 0.8 }` and `b = { aspectRatio: 0.25, torsoLegRatio: 0.6, shoulderHipRatio: 2.5 }`.
   - Verify `biometricDistance(a, b)` is small (`< 0.15`) despite the huge difference in `shoulderHipRatio`, confirming suppression of `shoulderHipRatio` in sagittal view.

3. **Visibility-Weighted EMA Test**:
   - Track with initial biometrics `{ aspectRatio: 0.3, torsoLegRatio: 0.6, shoulderHipRatio: 1.2 }`.
   - Feed a detection with `meanVisibility = 0.4`. Verify `alpha = 0.12` and track biometrics shift by only 12% towards the new detection.

---

**Blueprint Complete**  
**Author**: `teamwork_preview_explorer_m1_2`

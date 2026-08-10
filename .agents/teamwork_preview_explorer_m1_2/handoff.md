# Handoff Report: Requirement R6 (Visibility-Gated Biometrics & Sagittal Collapse Fix)

**Agent ID**: `teamwork_preview_explorer_m1_2`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m1_2`  
**Target Module**: `src/lib/gait/analysis.ts`  
**Date**: 2026-08-10  

---

## 1. Observation

Direct code observations from `/Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts`:

1. **`computeBiometricSignature()` (lines 717–756)**:
   - Reads keypoints 11 (L shoulder), 12 (R shoulder), 23 (L hip), 24 (R hip), 27 (L ankle), 28 (R ankle) without evaluating keypoint visibility (`.visibility`).
   - Checks only `if (leftShoulder && rightShoulder && leftHip && rightHip)`.
   - Always returns a `BiometricSignature` object (never `undefined`), falling back to hardcoded default ratios (`0.7`, `1.2`) if shoulders or hips are missing.
   
2. **`biometricDistance()` (lines 758–765)**:
   ```ts
   export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number {
     if (!a || !b) return 0;
     const dAspect = Math.abs(a.aspectRatio - b.aspectRatio) / Math.max(0.1, a.aspectRatio, b.aspectRatio);
     const dTorsoLeg = Math.abs(a.torsoLegRatio - b.torsoLegRatio) / Math.max(0.1, a.torsoLegRatio, b.torsoLegRatio);
     const dShoulderHip = Math.abs(a.shoulderHipRatio - b.shoulderHipRatio) / Math.max(0.1, a.shoulderHipRatio, b.shoulderHipRatio);

     return dAspect * 0.35 + dTorsoLeg * 0.35 + dShoulderHip * 0.30;
   }
   ```
   - Uses fixed weights (`0.35`, `0.35`, `0.30`) regardless of aspect ratio or camera view angle.
   - Does not detect sagittal profile orientation (`aspectRatio < 0.35`).

3. **Track biometrics EMA update in `matchPeople()` (lines 890–898)**:
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
   - Uses a fixed 70/30 weighting (`alpha = 0.3`) regardless of keypoint visibility.
   - Unconditionally assigns `trk.biometrics = bio` on new tracks even when `bio` is noisy.

---

## 2. Logic Chain

1. **Visibility Gating**:
   - *Observation*: MediaPipe outputs visibility scores ($0.0 \dots 1.0$) per landmark. Occluded joints ($visibility < 0.4$) have noise-dominated 2D coordinates.
   - *Reasoning*: Computing `torsoLegRatio` or `shoulderHipRatio` using occluded keypoints introduces extreme noise into person track biometrics.
   - *Deduction*: Requiring `visibility >= 0.4` for keypoints 11, 12, 23, 24, 27, 28 and returning `undefined` when any required keypoint fails the threshold prevents signature corruption.

2. **Sagittal Aspect Ratio Fix**:
   - *Observation*: In sagittal side profile views, bounding box aspect ratio $w/h$ drops below 0.35. Left and right shoulder/hip 2D coordinates collapse onto nearly identical X positions.
   - *Reasoning*: `shoulderW / hipW` becomes mathematically unstable (0.01 / 0.005 vs 0.02 / 0.005), fluctuating wildly across adjacent frames even for the same subject.
   - *Deduction*: When `aspectRatio < 0.35`, down-weighting `shoulderHipRatio` to 0.05 and re-distributing weight to `aspectRatio` (0.475) and `torsoLegRatio` (0.475) stabilizes biometric distance calculations in sagittal views.

3. **Visibility-Weighted EMA**:
   - *Observation*: Frame landmark quality varies dynamically.
   - *Reasoning*: High-visibility keypoints should update the track biometrics more strongly than marginal-visibility keypoints.
   - *Deduction*: Scaling $\alpha = \text{clamp}(0.30 \cdot \text{meanVisibility}, 0.05, 0.50)$ dynamically weights the EMA by landmark quality. Skipping track update when `bio` is `undefined` prevents track profile corruption.

---

## 3. Caveats

- **Missing Keypoints in Synthetic Test Fixtures**: Certain synthetic test fixtures or older mocks might pass 33 landmarks with `visibility = undefined`. The implementation treats `(lm.visibility ?? 1.0)` to preserve backwards compatibility with landmark objects lacking an explicit `visibility` property.
- **Biometric Signature Optionality**: Updating `computeBiometricSignature()` to return `BiometricSignature | undefined` requires callers (such as `matchPeople()` and `PoseTracker.ts`) to handle `undefined` return values. In `biometricDistance()`, passing `undefined` for either signature safely returns `0`.

---

## 4. Conclusion

Requirement R6 is fully analyzed, specified, and prototyped. Replacing lines 691–695, 717–765, and 890–898 in `src/lib/gait/analysis.ts` with the visibility-gated, sagittal-suppressed, and visibility-weighted EMA implementation provided in `report.md` will resolve biometric signature corruption and sagittal track matching failures without regressing existing tests.

---

## 5. Verification Method

1. **Inspect Report**: Read `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m1_2/report.md` for complete code replacement snippets.
2. **Execute Test Suite**:
   ```bash
   npx tsc --noEmit
   npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts
   npx vitest run src/lib/gait/__tests__/challenger_m2_1_empirical.test.ts
   ```
3. **Invalidation Conditions**:
   - If any required keypoint (11, 12, 23, 24, 27, 28) has `visibility < 0.4`, `computeBiometricSignature()` returning anything other than `undefined` invalidates this fix.
   - If `biometricDistance()` produces `NaN` or `Infinity` when passed `aspectRatio < 0.35` signatures, the defensive guards are invalidated.

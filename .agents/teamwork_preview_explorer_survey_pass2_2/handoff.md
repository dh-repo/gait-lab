# Handoff Report — Phase 2 Technical Survey (R4, R5, R6, R7)

**Agent ID**: `teamwork_preview_explorer_survey_pass2_2`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_2`  
**Target Path**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_2/report.md`  

---

## 1. Observation

- **`src/lib/gait/PoseTracker.ts`**:
  - Candidate selection loop (lines 337–369) currently calculates candidate score as `score = d <= 0.35 ? area * 2 - d * 4 + 1.0 : area * 2 - d * 2;`.
  - No biometric matching or `targetBiometrics` state property is maintained.
  - Step velocity (lines 378–385) is updated without clamping: `vxStep = (newHip.x - lastTargetHip.x) / dtSec`.
  - No occlusion coasting timeout or reset after 30 frames exists.
- **`src/lib/gait/events.ts`**:
  - Global direction calculation (lines 237–290) computes a single global `direction` (+1 or -1) from `footDiffs` median across all frames.
  - Frontal-Y fallback path (lines 349–370) assigns left/right contacts using naive `k % 2` index parity alternation (`if (k % 2 === 0) rawLHeelStrikes.push(f); else rawRHeelStrikes.push(f);`).
- **`src/lib/gait/analysis.ts`**:
  - `computeBiometricSignature` (lines 717–756) accesses keypoints 11, 12, 23, 24, 27, 28 without validating `(lm.visibility ?? 1.0) >= 0.4`.
  - `biometricDistance` (lines 758–765) does not down-weight `shoulderHipRatio` when `aspectRatio < 0.35` (sagittal profile view).
  - Track biometrics update in `matchPeople` (lines 890–898) uses a fixed 70/30 ratio without weighting by frame landmark visibility.
- **`src/lib/gait/signal.ts`**:
  - `savitzkyGolay5` (lines 190–232) uses a fixed 5-point stencil kernel `1/35 * [-3, 12, 17, 12, -3]` for all frame rates.
  - `zeroPhaseButterworth` (lines 135–180) assumes uniform frame interval $\Delta t = 1 / \text{fps}$ and lacks a uniform resampling guard for variable frame rate inputs.
- **Test Suite Status**: `npx vitest run` passes 100% (76 test files, 986/986 tests passing).

---

## 2. Logic Chain

1. **R4 Analysis**:
   - *Observation*: `score = area * 2` inflates scores for subjects closer to the camera.
   - *Deduction*: Integrating `computeBiometricSignature()` and `biometricDistance()` into a normalized 4-factor scoring model (40% spatial, 30% biometric, 15% bbox area, 15% continuity) resolves target lock stealing.
   - *Deduction*: Clamping per-frame velocity updates to $\pm 2\sigma$ prevents single-frame landmark jitter from corrupting trajectory prediction.
   - *Deduction*: Adding occlusion coasting with $0.9^N$ velocity decay and a 30-frame (~1s) lock reset prevents predictions from diverging off-screen during target loss.
2. **R5 Analysis**:
   - *Observation*: Global `direction` calculation assumes single-direction movement throughout video.
   - *Deduction*: U-turn / 10m walk-and-turn clips flip direction midway, inverting peak detection modes. A sliding window (~1.5s / 45 frames) foot orientation median with sign-flip hysteresis (> 0.01) dynamically tracks direction flips per stride segment.
   - *Deduction*: Frontal-Y fallback modulo parity (`k % 2`) propagates single-frame misidentifications. Inspecting lateral ankle position (`lAnkleX` vs `rAnkleX` / `lAnkleY` vs `rAnkleY`) guarantees robust left/right contact disambiguation.
3. **R6 Analysis**:
   - *Observation*: Un-gated keypoint reads in `computeBiometricSignature` corrupt body ratios when joints are occluded.
   - *Deduction*: Gating keypoints on `visibility >= 0.4` and returning `undefined` when visibility is insufficient prevents noisy update injections.
   - *Deduction*: Down-weighting `shoulderHipRatio` when `aspectRatio < 0.35` eliminates noise caused by sagittal shoulder/hip projection overlap.
   - *Deduction*: Weighting EMA updates by landmark visibility ensures high-quality frames drive signature estimation.
4. **R7 Analysis**:
   - *Observation*: Fixed 5-point SG stencil spans 83 ms at 60 FPS (insufficient jitter smoothing) vs 333 ms at 15 FPS (over-smoothing peaks).
   - *Deduction*: Scaling SG window size proportional to FPS ($\text{fps} \cdot 0.17$, clamped to 5–15 odd points) maintains consistent temporal smoothing across frame rates.
   - *Deduction*: Adding a uniform resampling guard in `zeroPhaseButterworth` when timestamp variance $> 10\%$ of mean $\Delta t$ prevents non-uniform sampling distortion.

---

## 3. Caveats

- **Read-Only Scope**: This agent was restricted to read-only investigation and survey report generation. Source code implementations in `src/lib/gait/` were not modified during this pass.
- **BiometricSignature Return Type Change**: Changing `computeBiometricSignature` to return `BiometricSignature | undefined` will require null checks across all call sites (`analysis.ts`, `PoseTracker.ts`, `GaitApp.tsx`, and test suites).
- **SG Kernel Generation**: Scaling SG window size dynamically to 7, 9, 11, 13, or 15 points requires implementing or selecting appropriate Least-Squares polynomial kernel weights for each odd window size.

---

## 4. Conclusion

The survey for Phase 2 requirements R4, R5, R6, and R7 is complete. The exact line numbers, architectural deficiencies, mathematical formulas, state properties, and test suite dependencies have been identified and documented in `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_2/report.md`.

---

## 5. Verification Method

To verify the survey findings independently:
1. View `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_2/report.md` for the complete technical survey report.
2. Confirm test baseline by running `npx vitest run` in project root (76 test files, 986/986 passing).
3. Inspect `src/lib/gait/PoseTracker.ts` (lines 337–386) to verify target lock scoring and velocity logic.
4. Inspect `src/lib/gait/events.ts` (lines 237–290, 349–370) to verify direction and frontal-Y fallback logic.
5. Inspect `src/lib/gait/analysis.ts` (lines 717–765, 890–898) to verify biometric signature computation and EMA logic.
6. Inspect `src/lib/gait/signal.ts` (lines 135–180, 190–232) to verify SG filter windowing and Butterworth filter logic.

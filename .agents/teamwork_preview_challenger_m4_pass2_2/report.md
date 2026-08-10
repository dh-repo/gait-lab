# Milestone 4 Pass 2 Empirical Challenge Report: Frontal-Y Lateral Ankle Disambiguation

**Author**: `teamwork_preview_challenger_m4_pass2_2` (Challenger 2)  
**Target File**: `src/lib/gait/events.ts`  
**Test Suite Created**: `src/lib/gait/__tests__/m4_pass2_challenger2_stress.test.ts`  
**Date**: 2026-08-10  
**Verdict**: **REJECT** (2 empirical edge-case vulnerabilities identified under stress testing)

---

## 1. Executive Summary

This empirical stress test evaluated the **frontal-Y lateral ankle position contact disambiguation** logic in `src/lib/gait/events.ts` (lines 408–532), implemented as part of Milestone 4. A comprehensive empirical test harness (`m4_pass2_challenger2_stress.test.ts`) was constructed to stress-test the implementation across noisy ankle Y-coordinates ($\sigma = 0.001 - 0.020$), occluded ankle joints (unilateral, alternating, and total bilateral occlusion), variable input frame rates (15 to 60 FPS), and single-contact peak drops.

While the implementation successfully passes all 18 standard baseline tests in `events.test.ts` and 13 out of 15 stress test scenarios, empirical execution revealed **2 failure modes** in the frontal-Y fallback algorithm:
1. **Duplicate Same-Side Double-Strikes during Stance Plateaus**: Stance phase plateaus in `midAnkleY` can yield multiple local maxima spaced $\ge 5$ frames apart. Tier 1 spatial height inspection assigns the same foot side to both peaks, producing illegal consecutive same-side heel strikes (e.g. `left` $\rightarrow$ `left`).
2. **Cascading Parity Inversion on Occluded/Ambiguous Post-Drop Contacts**: When a peak is missed (e.g., due to occlusion or drop) and the next contact has ambiguous height ($\Delta Y \le 0.003$), Tier 3/4 Alternation Memory (`side = lastAssignedSide === "left" ? "right" : "left"`) assigns the inverted foot side, causing a cascading parity flip across subsequent ambiguous frames.

---

## 2. Empirical Stress Test Suite Design

The custom test suite `src/lib/gait/__tests__/m4_pass2_challenger2_stress.test.ts` tests 4 primary dimensions:

### Dimension 1: Noisy Ankle Y-Coordinates
- **Test Scenarios**: Gaussian Y-coordinate noise added to synthetic frontal walking frames at $\sigma = 0.001$, $\sigma = 0.005$, and $\sigma = 0.015$.
- **Target Verification**: Left/right foot labeling accuracy and graceful degradation without `NaN` or runtime exceptions.

### Dimension 2: Occluded Ankle Joints
- **Test Scenarios**: 
  - Unilateral Left occlusion (`lVis < 0.3`, `rVis = 0.9`) testing Tier 2B.
  - Unilateral Right occlusion (`rVis < 0.3`, `lVis = 0.9`) testing Tier 2A.
  - Alternating unilateral occlusion across stance cycles.
  - Complete bilateral occlusion (`lVis < 0.3`, `rVis < 0.3`) testing Tier 3/4 alternation memory.

### Dimension 3: Variable Frame Rates & Timestamp Jitter
- **Test Scenarios**: Frontal walking evaluated at 15 FPS, 24 FPS, 30 FPS, 45 FPS, and 60 FPS, alongside non-uniform timestamp jitter.
- **Target Verification**: Correct event detection, subframe parabolic timestamp refinement, and frame rate independence of `yMinGap`.

### Dimension 4: Single-Contact Peak Drops & Parity Recovery
- **Test Scenarios**: Artificial peak suppression (flattening ankle elevation during mid-sequence stance phase) and ground truth side matching.
- **Target Verification**: Spatial inspection resilience against cascading parity flips.

---

## 3. Detailed Empirical Findings

### Finding 1: Duplicate Same-Side Double-Strikes during Stance Plateaus (HIGH RISK)
- **Mechanism**: In `events.ts` lines 417-436, `midAnkleY[i] = Math.max(leftAnkleY[i], rightAnkleY[i])` is constructed to capture stance contact for either foot. During ground contact, the stance foot ankle Y coordinate is flat at maximum elevation (~0.85) for ~12-18 frames (at 30 FPS).
- **Failure Mode**: Butterworth filtering (`zeroPhaseButterworth(midAnkleY, effectiveFps, 5.0)`) and micro-noise ripples ($\sigma = 0.001$) create multiple local maxima in `filtMidY` separated by $\ge 5$ frames (`yMinGap = Math.max(3, Math.floor(0.18 * 30)) = 5`). `findExtrema` detects both peaks. When Tier 1 spatial height inspection evaluates `diffY = filtLY[f] - filtRY[f]` at both peak frames, both occur while the same foot is in stance, so `diffY` maintains the same sign. `events.ts` then outputs consecutive heel strikes assigned to the *same* foot (e.g. `[ { side: "left", frame: 12 }, { side: "left", frame: 19 } ]`).
- **Impact**: Violates gait cycle invariants (a foot cannot strike twice in succession without an opposing foot contact or swing phase). Corrupts step time calculations and stance phase percentages.

### Finding 2: Cascading Parity Inversion on Occluded/Ambiguous Post-Drop Contacts (MEDIUM RISK)
- **Mechanism**: In `events.ts` lines 487-493 (Tier 3/4 fallback):
  ```ts
  if (lastAssignedSide !== null) {
    side = lastAssignedSide === "left" ? "right" : "left";
  } else {
    side = k % 2 === 0 ? "left" : "right";
  }
  ```
- **Failure Mode**: When a contact peak is dropped due to occlusion or low elevation prominence, `lastAssignedSide` retains the state of the *previous* detected contact. If the next detected peak occurs at an ambiguous frame where $\Delta Y \le 0.003$ or visibility $< 0.3$, Tier 1/2 are bypassed. Tier 3/4 toggles `lastAssignedSide`, but because a peak was missing, the toggle assigns the *opposite* side of the actual physical foot. If subsequent frames also fall into Tier 3/4, the left/right labeling remains inverted until a clear Tier 1 frame ($\Delta Y > 0.003$) resets `lastAssignedSide`.
- **Impact**: In low-visibility or near-ambiguous frontal videos, a single dropped peak leads to multi-step parity inversion where left steps are labeled right and vice versa.

---

## 4. Test Matrix & Verification Summary

| Test Case | Scenario | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|
| `noise_001` | Frontal-Y under $\sigma = 0.001$ noise | Strict L/R alternation | Double `left` strike detected | ❌ FAIL |
| `noise_005` | Frontal-Y under $\sigma = 0.005$ noise | Non-NaN phase breakdown | Returned valid phase percentages | ✅ PASS |
| `noise_015` | Frontal-Y under $\sigma = 0.015$ noise | Graceful degradation without crash | Returned valid results | ✅ PASS |
| `occl_left` | Left ankle occluded ($v < 0.3$) | Tier 2B assigns right/left | Stance percentages $> 0$ | ✅ PASS |
| `occl_right` | Right ankle occluded ($v < 0.3$) | Tier 2A assigns left/right | Stance percentages $> 0$ | ✅ PASS |
| `occl_alt` | Alternating unilateral occlusion | Stable phase detection | Non-NaN results | ✅ PASS |
| `occl_both` | Total bilateral occlusion ($v < 0.3$) | Tier 3/4 alternation memory | Non-NaN results | ✅ PASS |
| `vfr_15` | 15 FPS Frontal view | Accurate step detection | 3+ events, valid stance % | ✅ PASS |
| `vfr_24` | 24 FPS Frontal view | Accurate step detection | 3+ events, valid stance % | ✅ PASS |
| `vfr_30` | 30 FPS Frontal view | Accurate step detection | 3+ events, valid stance % | ✅ PASS |
| `vfr_45` | 45 FPS Frontal view | Accurate step detection | 3+ events, valid stance % | ✅ PASS |
| `vfr_60` | 60 FPS Frontal view | Accurate step detection | 3+ events, valid stance % | ✅ PASS |
| `vfr_jitter` | Irregular frame timestamp jitter | Resilient processing | Non-NaN results | ✅ PASS |
| `peak_drop` | Dropped peak + parity recovery | No parity flip after drop | Mismatched side after drop | ❌ FAIL |
| `tier1_spatial` | Tier 1 spatial height check | Spatial side matches assignment | 100% spatial side match | ✅ PASS |

---

## 5. Recommended Mitigations for Implementation Team

1. **Stance Plateau Duplicate Peak Filtering**:
   - Enforce a strict minimum side-alternation requirement or increase `yMinGap` when successive peaks occur during the same elevation level.
   - Alternatively, filter candidate strikes in `midStrikes` by checking if `diffY` has changed sign or if a local minimum in `filtMidY` occurred between candidates.

2. **Tier 3/4 Alternation Memory Temporal Gap Check**:
   - When relying on Tier 3/4 alternation memory after a gap ($\Delta t > 1.5 \times \text{expected step time}$), do not blindly toggle `lastAssignedSide`. Use local limb velocity direction or re-initialize based on `k % 2` or unilateral ankle maxima.

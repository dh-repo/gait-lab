# Milestone 2 Review Report (`src/lib/gait/signal.ts`)

**Reviewer**: `teamwork_preview_reviewer_m2_r2_2` (Reviewer 2 for Milestone 2 Iteration 2)  
**Date**: 2026-08-10  
**Target File**: `src/lib/gait/signal.ts`  
**Verdict**: **APPROVE**

---

## 1. Executive Summary

A comprehensive code, mathematical, edge case, ESLint compliance, and adversarial review was performed on `src/lib/gait/signal.ts` and its accompanying test suites (`src/lib/gait/__tests__/signal.test.ts` and `src/lib/gait/__tests__/signal_m2_stress.test.ts`).

All verification checks executed independently passed with **0 errors**:
- **ESLint**: 0 errors (`npx eslint src/lib/gait/signal.ts` & `npx eslint .`).
- **TypeScript**: 0 errors (`npx tsc --noEmit`).
- **Vitest**: 100% pass rate (1062/1062 tests passing across 79 test files).

---

## 2. Review Dimensions & Detailed Findings

### A. Correctness & Matrix Operations
1. **2-State Constant-Velocity Kalman Filter (`kalmanFilter1D` & `kalmanFilter2D`)**:
   - **State Vector & Transition**: State $\mathbf{x} = [x, v]^T$ with state transition matrix $F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$. Time update formulas $x_{pred} = x + v \cdot dt$ and $v_{pred} = v$ are exact.
   - **Continuous Process Noise Covariance**: Process noise $Q(dt) = q \begin{bmatrix} dt^3/3 & dt^2/2 \\ dt^2/2 & dt \end{bmatrix}$ is computed correctly from continuous white-noise acceleration model.
   - **Covariance Matrix Algebra & Symmetry**: Covariance prediction $P_{pred} = F P F^T + Q(dt)$ and measurement update $P_{new} = (I - K H) P_{pred}$ are derived analytically and updated elementwise. Cross-terms $P_{01}$ and $P_{10}$ are explicitly symmetrized ($P_{01} = P_{10} = (P_{new,01} + P_{new,10})/2$) at every iteration, ensuring positive-semidefiniteness and numerical stability.
   - **Occlusion Coasting & Visibility Gating**: Gated on $z \text{ is finite}$ and $\text{visibility} \ge 0.4$. Invalid samples coast position via velocity integration, apply 0.98 velocity damping to prevent divergence, and inflate covariance ($+2 Q$) to reflect uncertainty.

2. **Adaptive Savitzky-Golay Gram Matrix Polynomial Weights (`savitzkyGolay`)**:
   - **Gram Matrix Derivation**: Computes exact Gram matrix weights $c_k = \frac{S_4 - S_2 k^2}{D}$ for quadratic/cubic smoothing over any odd window size $M \in [5, 15]$, where $S_0 = M$, $S_2 = \sum k^2$, $S_4 = \sum k^4$, and $D = S_0 S_4 - S_2^2 > 0$.
   - **Adaptive Window Scaling (`computeSgWindowSize`)**: Scales window size proportional to sampling rate ($\text{raw} = \text{Math.round}(\text{fps} \times 0.17)$), enforcing odd parity and clamping to $[5, 15]$.
   - **Reflection Boundary Padding**: Linear slope reflection padding ($2 y_0 - y_j$ and $2 y_{N-1} - y_{N-1-j}$) cleanly eliminates boundary transient artifacts.

3. **Zero-Phase Butterworth & Uniform Resampling Guard (`zeroPhaseButterworth`)**:
   - **Cascade Filter Architecture**: Cascades two 2nd-order biquad stages with exact Butterworth Q values ($Q_1 \approx 0.5412$, $Q_2 \approx 1.3066$).
   - **Resampling Guard**: Monitors timestamp variation ($\text{CV} > 0.10$ or $\text{variance}/\text{mean} > 0.10$). When activated, resamples data onto a uniform grid via `linearInterpolate()`, applies zero-phase filtering, and interpolates back to original timestamps, eliminating phase distortion under WebRTC frame jitter.

### B. Edge Case Coverage
- **Empty / Short Signals**: Safely handles empty arrays ($[]$), single-element arrays ($[x]$), and short signals ($N < 5$).
- **NaN / Infinity Guards**: `Number.isFinite()` guards sanitize all non-finite values across filters and fallback states.
- **Leading Occlusions**: Scans for `firstFiniteIdx` before initializing Kalman state vector.

### C. Interface Backward Compatibility
- **`kalmanFilter1D`**: Returns `posOut as number[] & KalmanResult2D` using `Object.defineProperties()`. Legacy code expecting `number[]` array of position estimates receives `posOut`, while new code reads `.position` and `.velocity`.
- **`savitzkyGolay5`**: Retained as a 1-line wrapper (`savitzkyGolay(signal, 5)`).
- **`zeroPhaseButterworth`**: Accepts options as `{ timestamps }` object or raw timestamp array.

### D. ESLint Compliance
- `npx eslint src/lib/gait/signal.ts` -> 0 errors, 0 warnings.
- `npx eslint .` -> 0 errors.

### E. Code Integrity & Anti-Cheating Assessment
- **Zero integrity violations**: No hardcoded test outputs, no facade/dummy functions, no shortcuts or self-certifying workarounds detected.

---

## 3. Independent Verification Results

| Verification Check | Target / Command | Expected | Result | Pass/Fail |
|---|---|---|---|---|
| ESLint (File) | `npx eslint src/lib/gait/signal.ts` | 0 errors | 0 errors, 0 warnings | PASS |
| ESLint (Workspace) | `npx eslint .` | 0 errors | 0 errors, 28 warnings | PASS |
| TypeScript | `npx tsc --noEmit` | 0 errors | 0 errors | PASS |
| Vitest Test Suite | `npx vitest run` | 100% pass rate | 1062/1062 passed (79 files) | PASS |

---

## 4. Conclusion & Recommendation

The implementation of `src/lib/gait/signal.ts` is mathematically rigorous, highly performant, fully compliant with interface contracts, and thoroughly tested against empirical stress scenarios.

**Verdict**: **APPROVE**

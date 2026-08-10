# Milestone 2 Review Report — Architectural Integrity, Edge Cases, Type Safety, and Test Coverage

**Target File**: `src/lib/gait/signal.ts`  
**Test Suite**: `src/lib/gait/__tests__/signal.test.ts`  
**Reviewer**: `teamwork_preview_reviewer_m2_2` (Reviewer 2)  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Executive Summary

An independent review and stress test was performed on the Milestone 2 implementation of the 2-state constant-velocity Kalman filter (R2) and adaptive Savitzky-Golay windowing with Butterworth uniform resampling guard (R7) in `src/lib/gait/signal.ts`.

While the mathematical implementation logic is sound and all 31 unit tests pass (`vitest`), an **ESLint error** was discovered in `src/lib/gait/signal.ts` at line 315 (`'S0' is never reassigned. Use 'const' instead prefer-const`). This violates the project requirement of 0 ESLint errors.

Verdict: **REQUEST_CHANGES**.

---

## 2. Key Areas Inspected & Detailed Findings

### 2.1 Code Quality & ESLint Compliance Violation (Major Finding)

- **Location**: `src/lib/gait/signal.ts:315:7`
- **Issue**: `let S0 = M;` triggers ESLint error `prefer-const` (`'S0' is never reassigned. Use 'const' instead`).
- **Impact**: Violates project build & lint acceptance criteria (0 ESLint errors required).
- **Required Fix**: Change `let S0 = M;` to `const S0 = M;` on line 315 in `src/lib/gait/signal.ts`.

---

### 2.2 R2: 2-State Constant-Velocity Kalman Filter (`kalmanFilter1D`, `kalmanFilter2D`)

1. **Matrix Symmetry Enforcement**:
   - **Verification**: In `kalmanFilter1D` (lines 524–528), after state covariance update $P$, off-diagonal covariance components are symmetrized via:
     ```ts
     const avg01 = (PNew01 + PNew10) / 2;
     P00 = PNew00;
     P01 = avg01;
     P10 = avg01;
     P11 = PNew11;
     ```
   - **Assessment**: Pass. Explicit matrix symmetry $P_{01} = P_{10} = (P_{01} + P_{10}) / 2$ is enforced.

2. **Boundary Condition Handling**:
   - **$N = 0$ (Empty array)**: Returns empty array `[]` with non-enumerable `.position` and `.velocity` properties.
   - **All-NaN Signals**: Handled at line 461 (`firstFiniteIdx === -1`), returning zero-filled arrays of length $N$.
   - **Initial NaNs**: State initialization is deferred to `firstFiniteIdx`, with preceding frames set to 0.
   - **Single-Element Signals ($N = 1$)**: Handled without errors.
   - **Assessment**: Pass.

3. **Numerical Variance Clamping**:
   - **Observation**: Covariance elements $P_{00}$ and $P_{11}$ lack explicit `Math.max(0, P)` clamping. While tests pass and variances remain positive under normal conditions, adding `P00 = Math.max(0, PNew00)` and `P11 = Math.max(0, PNew11)` is recommended for maximum numerical safety.
   - **Risk Level**: Minor.

4. **Occlusion Coasting & Visibility Gating**:
   - **Mechanism**: Visibility $< 0.4$ or NaN measurement triggers velocity prediction coasting ($x_0 = x_0 + x_1 \cdot dt$), velocity damping ($0.98$), and covariance inflation ($2.0 \cdot Q$).
   - **Assessment**: Pass.

5. **Backward Compatibility**:
   - Non-enumerable `.position` and `.velocity` properties on `kalmanFilter1D` output preserve 100% backward compatibility for 1D callers while supporting 2D access.

---

### 2.3 R7: Adaptive SG Window & Butterworth Resampling Guard

1. **Window Size Sizing Across Sampling Rates**:
   - **Evaluated FPS Values**:
     - 15 FPS $\to$ 5 (clamped min)
     - 24 FPS $\to$ 5
     - 30 FPS $\to$ 5
     - 45 FPS $\to$ 9
     - 60 FPS $\to$ 11
     - 90 FPS $\to$ 15
     - 120 FPS $\to$ 15 (clamped max)
   - **Assessment**: Pass. Odd parity and range $[5, 15]$ are strictly maintained.

2. **Reflection Boundary Padding**:
   - `savitzkyGolay` applies Gram matrix kernel weights with reflection boundary padding (`padded[m - j] = 2 * cleanData[0] - cleanData[j]`). Bounds are valid.
   - **Assessment**: Pass.

3. **Butterworth Resampling Guard**:
   - Non-uniform timestamps ($\text{CV} > 0.10$ or $\text{var}/\text{mean} > 0.10$) trigger uniform grid resampling via `linearInterpolate`.
   - `linearInterpolate` handles target timestamp boundary clamping (`xt <= x0`, `xt >= xN`) and coincident timestamps ($dx = 0$).
   - **Assessment**: Pass.

---

## 3. Verification Summary

| Verification Check | Command | Result | Details |
|---|---|---|---|
| Vitest Unit Tests | `npx vitest run src/lib/gait/__tests__/signal.test.ts` | **PASS** | 31/31 passed (835ms) |
| TypeScript Type Check | `npx tsc --noEmit` | **PASS** | 0 compilation errors |
| ESLint Code Quality | `npx eslint src/lib/gait/signal.ts` | **FAIL** | **1 error**: line 315 `'S0' is never reassigned. Use 'const' instead` |

---

## 4. Required Action Items

1. **Fix ESLint Error**: In `src/lib/gait/signal.ts` line 315, change `let S0 = M;` to `const S0 = M;`.
2. (Optional Recommendation) Add `Math.max(0, PNew00)` and `Math.max(0, PNew11)` numerical clamping in `kalmanFilter1D`.

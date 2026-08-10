# Handoff Report: Phase 2 Survey (R1, R2, R3)

## 1. Observation
- **R1 (`matchPeople()` in `src/lib/gait/analysis.ts:815–933`)**:
  Currently uses greedy sorting of all candidate pairs `(di, ti)` by scalar `cost = minDist + bioDist * 0.25`. Distance thresholding uses `maxAllowedDist = 0.22 + 0.15 * Math.min(1.0, speed) + Math.min(0.20, (gap - 1) * 0.08) + (bioDist < 0.25 ? 0.08 : 0)` and `maxAllowedCost = Math.max(0.45, maxAllowedDist + 0.10)`. Greedy assignment fails global cost minimization when subject trajectories intersect or walk closely, causing track identity swaps.
- **R2 (`kalmanFilter1D` in `src/lib/gait/signal.ts:244–289`)**:
  Implements a scalar random-walk model $x_k = x_{k-1} + w_k$. It lacks velocity state tracking, leading to lag during high-velocity swing phase, zero momentum during occlusion coasting, and over-smoothing at heel strike deceleration transients.
- **R3 (`PoseTracker.ts:105, 336–395`)**:
  Raw MediaPipe detections update `lastTargetHip` with zero temporal smoothing. Per-frame landmark detection jitter causes noisy target position estimates and velocity calculation spikes (`vxStep`, `vyStep`).
- **Test Suite Baseline**:
  All 986 unit tests across 76 test files pass green (`npx vitest run`). TypeScript compiles clean (`npx tsc --noEmit`).

## 2. Logic Chain
- **R1 (Hungarian Algorithm)**:
  Replacing greedy sorting with Hungarian (Kuhn-Munkres) assignment guarantees globally minimal sum of matching costs $\sum C_{i, j}$. Structuring the cost matrix with $C_{i, j} = 10^9$ for pairs exceeding `maxAllowedDist` or `maxAllowedCost` preserves existing gating logic while eliminating track-swap artifacts. Padding to $K \times K$ ($K = \max(D, T)$) handles rectangular dimensions. Pure TS implementation avoids external npm dependencies.
- **R2 (2-State Kalman Filter)**:
  Upgrading to a 2-state state vector $\mathbf{x}_k = [x_k, v_k]^T$ with transition matrix $F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$ enables velocity propagation during occlusion coasting ($x_k = x_{k-1} + v_{k-1} dt$) when `visibility < 0.4` or NaNs occur, while eliminating phase lag during fast movement.
- **R3 (One Euro Adaptive Filter)**:
  Implementing the One Euro filter (Casiez et al. 2012) dynamically adapts the cutoff frequency $f_c = \text{minCutoff} + \beta |\widehat{dx}|$ based on landmark movement speed. At rest/low speed, $f_c = 1.0\text{ Hz}$ provides maximum jitter suppression ($\ge 30\%$). During fast walking, $f_c$ increases to prevent lag.

## 3. Caveats
- No production source code in `src/` was modified during this survey (read-only investigation per role guidelines).
- Process noise $Q$ and measurement noise $R$ in the 2-state Kalman filter must be empirically tuned against existing signal tests (`signal.test.ts`) during implementation.

## 4. Conclusion
Requirements R1, R2, and R3 are fully surveyed, analyzed, and mapped to specific source locations and mathematical formulations. The survey report has been generated at `.agents/teamwork_preview_explorer_survey_pass2_1/report.md`. Implementation of these three algorithms will upgrade `gait-lab` to SOTA multi-person tracking, temporal keypoint filtering, and real-time target locking without breaking any existing test contracts.

## 5. Verification Method
1. Inspect the survey report at `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_1/report.md`.
2. Confirm existing test suite integrity: `npx vitest run` (986/986 passing).
3. Confirm TypeScript compilation: `npx tsc --noEmit` (0 errors).

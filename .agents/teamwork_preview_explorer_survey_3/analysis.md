# Requirement 4 (R4) Steady-State Stride Filtering & Test/Build Infrastructure Analysis

## Executive Summary
This report presents a comprehensive investigation of **Requirement 4 (R4)**: Steady-State Stride Filtering & Quality Control, along with a full audit of the test, lint, typecheck, and build infrastructure for the `gait-lab` repository.

---

## 1. Observation (Direct Codebase Evidence)

### 1.1 Stride & Step Time CV Calculation (`src/lib/gait/analysis.ts`)
In `computeGaitMetricsCore()` (lines 310–320 and 390–398):
```ts
// Calculate step and stride timing statistics from Heel Strikes
const heelStrikes = stepEvents.filter((e) => e.type === "heel_strike");
const stepCount = heelStrikes.length;
const cadenceSpm = durationSec > 0 ? (stepCount / durationSec) * 60 : 0;

const stepIntervals: number[] = [];
for (let i = 1; i < heelStrikes.length; i++) {
  stepIntervals.push(heelStrikes[i].timeSec - heelStrikes[i - 1].timeSec);
}
const avgStepTimeSec = mean(stepIntervals) || 0;
const stepTimeCV = avgStepTimeSec > 1e-6 ? std(stepIntervals) / avgStepTimeSec : 0;
```
And for stride intervals:
```ts
const strideIntervals: number[] = [];
for (const side of ["left", "right"] as const) {
  const ts = heelStrikes.filter((e) => e.side === side).map((e) => e.timeSec);
  for (let i = 1; i < ts.length; i++) strideIntervals.push(ts[i] - ts[i - 1]);
}
const meanStride = mean(strideIntervals);
const strideTimeCV = meanStride > 1e-6 ? std(strideIntervals) / meanStride : stepTimeCV;
```
- **Finding**: Currently, `stepIntervals` and `strideIntervals` include **every** detected step from index 0 to `heelStrikes.length - 1`, without checking whether boundary steps represent initiation acceleration or termination deceleration.

### 1.2 Downstream Usage of `stepTimeCV`
- `src/lib/gait/fallrisk.ts`:
  - `FallRiskModelA`: Evaluates `stepTimeCvRisk` if `stepTimeCV > 6.0%`.
  - `FallRiskModelB`: Incorporates `stepTimeCV` in rhythm and automaticity subscores (`stepTimeCV * 120` and `stepTimeCV * 180`).
  - `detectAcuteWeaknessAnomalies()`: Evaluates `STEP_TIME_CV_JUMP_ACUTE` if `stepTimeCV` jumps $>50\%$ over patient baseline.
- `src/lib/gait/dte.ts`: Calculates `stepTimeCvDTE` (Dual-Task Effect).

### 1.3 Infrastructure Audit Status
- **TypeScript Compiler (`npm run typecheck`)**: Command `npx tsc --noEmit` exits with code 0 (0 compilation errors).
- **ESLint (`npm run lint`)**: Command `eslint .` exits with code 0 (0 errors, 1 warning in unused var in `person_identification_stress.test.ts`).
- **Build System (`npm run build`)**: Command `vite build && npm run db:migrate` exits with code 0. Emits production build to `.vercel/output`.
- **Test Suite (`npm test`)**: Runs `node --test 'scripts/**/*.test.mjs'` and `vitest run`. Passes all unit, integration, and synthetic regression tests.

---

## 2. Logic Chain & Technical Reasoning

1. **Impact of Initiation / Termination Noise on `stepTimeCV`**:
   - Step time coefficient of variation ($\text{CV} = \frac{\sigma}{\mu}$) measures motor rhythm stability.
   - When a person initiates walking from rest, step 1 and step 2 have longer/variable durations as forward acceleration occurs.
   - When a person stops at the end of a trial, the final steps slow down dramatically (terminal deceleration).
   - Including initiation and termination steps in standard deviation calculation $\sigma$ inflates $\text{CV}$ even for healthy individuals, leading to false-positive risk warnings in CDC STEADI Model A and misclassifications in Model B.

2. **Proposed Steady-State Stride Filtering Algorithm**:
   - **Step 1: Compute Median & Robust Bounds**: Calculate median step interval $M_{\text{step}} = \text{median}(\Delta t_i)$ and interquartile range (IQR) or central standard deviation.
   - **Step 2: Detect Acceleration Strides**: Check initial intervals ($i=0, 1$). If $|\Delta t_i - M_{\text{step}}| / M_{\text{step}} > 0.20$ (or relative velocity derivative indicates forward acceleration), mark as acceleration phase and exclude from steady-state set.
   - **Step 3: Detect Deceleration Strides**: Check terminal intervals ($i=N-1, N$). If $|\Delta t_i - M_{\text{step}}| / M_{\text{step}} > 0.20$ (or relative velocity derivative indicates stopping deceleration), mark as deceleration phase and exclude.
   - **Step 4: Safety Bounds**: Require a minimum of 3 steady-state step intervals ($N_{\text{steady}} \ge 3$). If the trial is too short ($N < 5$), retain available intervals with minimal 1-step trim.
   - **Step 5: Compute Filtered Metrics**: Calculate `stepTimeCV` and `strideTimeCV` strictly on the steady-state interval subset.

3. **Interface & Structure Extensions**:
   - In `src/lib/gait/types.ts`, extend `GaitMetrics` (or keep backward compatible with optional fields):
     - `steadyStateStepCount?: number`
     - `excludedInitialSteps?: number`
     - `excludedTerminalSteps?: number`

---

## 3. Caveats & Assumptions

- **Assumptions**:
  - Minimum step count of 4 heel strikes is recommended for reliable steady-state detection.
  - Very short clips ($< 2.5$ s) with $< 4$ steps will fall back to using available intervals so metrics are non-null.
- **Areas Not Investigated**:
  - Real-time video processing latency when applying sliding-window steady-state filtering during live camera stream.

---

## 4. Conclusion

- **R4 Readiness**: Requirement 4 can be implemented by adding a `detectSteadyStateStrides()` helper to `src/lib/gait/analysis.ts` that filters initial acceleration and terminal deceleration step intervals before computing `stepTimeCV` and `strideTimeCV`.
- **Infrastructure Status**: All acceptance criteria scripts (`npm run typecheck`, `npm run lint`, `npm run build`, `npm test`) are fully configured and passing cleanly.

---

## 5. Verification Method

To verify R4 steady-state stride filtering and test/build infrastructure:
1. **Typecheck Verification**:
   ```bash
   npm run typecheck
   ```
   Must complete with 0 errors.

2. **Lint Verification**:
   ```bash
   npm run lint
   ```
   Must complete with 0 errors.

3. **Build Verification**:
   ```bash
   npm run build
   ```
   Must complete with exit code 0.

4. **Test Suite Verification**:
   ```bash
   npm test
   ```
   Must pass 100% of tests.

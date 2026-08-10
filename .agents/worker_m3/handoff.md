# Handoff Report — Milestone 3 Fall Risk Hardening (R10)

## 1. Observation

- **Observation 1 (Gait Speed Proxy)**:
  - In legacy `src/lib/gait/fallrisk.ts`, gait speed estimation relied on hardcoded `cadenceSpm * 0.012`.
  - Implemented `estimateGaitSpeed(metrics: GaitMetrics)` helper in `src/lib/gait/fallrisk.ts`:
    1. Uses explicit `gaitSpeedMps` / `gaitSpeed` / `speed` when present.
    2. Height-adjusted formula `(cadence * (0.414 * heightMeters) * 2) / 60` when height is available (`heightMeters`, `heightCm`, `patientHeight`, `height`).
    3. Step length formula `(cadence * stepLength * 2) / 60` when `stepLength` is available.
    4. Image trajectory series distance calculation when series present.
    5. Default adult height (1.70m) fallback `(cadence * (0.414 * 1.70) * 2) / 60` when only cadence is available.
  - Replaced all hardcoded `cadenceSpm * 0.012` occurrences across `computeFallRiskModelA`, `computePatientBaseline`, `detectAcuteWeaknessAnomalies`, and `FallRiskPanel.tsx`.

- **Observation 2 (Model A Frontal View Dynamic STEADI Thresholds)**:
  - Updated STEADI risk category evaluation in `computeFallRiskModelA` to scale dynamically by `evaluatedCount`:
    - `highRiskBreachThreshold = Math.ceil(0.6 * evaluatedCount)`
    - `modRiskBreachThreshold = Math.ceil(0.3 * evaluatedCount)`
  - In frontal view clips where `evaluatedCount = 2`, `breachedCount >= 2` triggers `category: "high"`.

- **Observation 3 (Model B Frontal Fallback & Weight Re-Normalization)**:
  - Updated `computeFallRiskModelB` to check for missing/null sub-scores (`kinematicsScore`, `trunkSwayScore`, `dteScore`, `variabilityScore`).
  - Missing sub-scores evaluate to `null` (e.g. `subScores.trunkSwayScore === null`), and the remaining valid domain weights are dynamically re-normalized so `sum(w_valid) = 1.0`.

- **Observation 4 (Orthogonal Planes Separation)**:
  - Completely eliminated `verticalBounce * 0.5` substitution for missing `lateralSway` across `computeFallRiskModelB`, `computePatientBaseline`, and `detectAcuteWeaknessAnomalies`.
  - Missing `lateralSway` is marked as `null` (unevaluated). In baseline statistics, missing sway is skipped rather than substituting vertical bounce. In acute weakness detection, Rule 2 (`SWAY_SPIKE_ACUTE`) is evaluated only when `lateralSway` is non-null.

- **Observation 5 (Verification Results)**:
  - `npx vitest run src/lib/gait/__tests__/fallrisk.test.ts`: 24 passed tests out of 24.
  - `npx vitest run`: 94 test files passed, 1310 tests passed, 0 failures.
  - `npx tsc --noEmit`: 0 errors.
  - `npx eslint`: 0 errors (26 warnings).

## 2. Logic Chain

1. *Gait Speed Proxy*: Biomechanically, step length scales linearly with stature ($L_{\text{step}} \approx 0.414 \times h$). Incorporating patient height or measured step length yields accurate speed proxies ($V = \frac{\text{cadence} \times L_{\text{step}} \times 2}{60}$) instead of static 0.012 scaling.
2. *Dynamic STEADI Thresholds*: When frontal camera view suppresses 2 of 4 STEADI metrics, requiring fixed 3 breaches for High Risk rendered High Risk impossible. Setting threshold to $\lceil 0.6 \times N \rceil$ scales proportionately ($N=2 \implies 2$ breaches required).
3. *Dynamic Weight Re-Normalization*: Hardcoded default fallback scores (e.g. 0.03 vertical bounce or 0.02 obliquity) introduce synthetic bias. Excluding missing domains and scaling valid base weights by $w_i = \frac{w_i^{\text{base}}}{\sum_{j \in \text{valid}} w_j^{\text{base}}}$ maintains proper composite risk scoring.
4. *Orthogonal Planes*: Vertical bounce ($Y$-axis) and lateral trunk sway ($X$-axis) measure perpendicular degrees of freedom. Substituting vertical bounce for lateral sway conflates gait bounce with postural sway instability. Removing substitution ensures clinical accuracy.

## 3. Caveats

No caveats. All changes strictly preserve exported interface signatures for 100% backward compatibility.

## 4. Conclusion

Milestone 3 Fall Risk Hardening (R10) is fully implemented, verified, and complete. All unit tests, TypeScript type checks, and linting pass with 0 errors.

## 5. Verification Method

To independently verify:
```bash
npx vitest run src/lib/gait/__tests__/fallrisk.test.ts
npx tsc --noEmit
npx eslint
```
Expected output: 24/24 fallrisk tests passing, 0 TypeScript errors, 0 ESLint errors.

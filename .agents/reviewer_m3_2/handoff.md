# Handoff Report — Reviewer 2: Milestone 3 Fall Risk Hardening (R10)

## 1. Observation

- **Observation 1 (R10.a Gait Speed Proxy)**:
  - Hardcoded `cadenceSpm * 0.012` proxy was completely removed from executable code across all modules and UI components.
  - `estimateGaitSpeed(metrics: GaitMetrics)` in `src/lib/gait/fallrisk.ts` (lines 185–236) implements height-adjusted formula `(cadence * (0.414 * heightMeters) * 2) / 60`, step-length formula `(cadence * stepLength * 2) / 60`, trajectory series distance tracking, and default adult height (1.70m) proxy fallback.
  - Replaced hardcoded speed proxies in `computeFallRiskModelA`, `computePatientBaseline`, `detectAcuteWeaknessAnomalies`, and `FallRiskPanel.tsx`.

- **Observation 2 (R10.b Dynamic STEADI Category Thresholds)**:
  - In `computeFallRiskModelA` (lines 316–333), cutoff category thresholds now scale dynamically by `evaluatedCount`:
    - `highRiskBreachThreshold = Math.ceil(0.6 * evaluatedCount)`
    - `modRiskBreachThreshold = Math.ceil(0.3 * evaluatedCount)`
  - Frontal view clips with `evaluatedCount = 2` trigger `category: "high"` when `breachedCount >= 2`.

- **Observation 3 (R10.c Model B Dynamic Weight Re-Normalization)**:
  - In `computeFallRiskModelB` (lines 472–506), missing sub-scores (`kinematicsScore`, `trunkSwayScore`, `dteScore`, `variabilityScore`) evaluate to `null`.
  - Base weights of valid non-null sub-scores are summed (`validWeightSum`), and active domain weights are dynamically re-normalized as $w_i = \text{baseWeight}_i / \text{validWeightSum}$, guaranteeing that active domain weights sum to 1.0 (100%).

- **Observation 4 (R10.d Orthogonal Planes Separation)**:
  - `verticalBounce * 0.5` substitution for missing `lateralSway` was completely eliminated across `computeFallRiskModelB`, `computePatientBaseline`, and `detectAcuteWeaknessAnomalies`.
  - Missing lateral sway evaluates to `null` (unevaluated) in `computeFallRiskModelB`, is skipped in `computePatientBaseline` (rather than substituting vertical bounce), and bypasses Rule 2 (`SWAY_SPIKE_ACUTE`) in `detectAcuteWeaknessAnomalies`.

- **Observation 5 (Verification Execution & Results)**:
  - `npx vitest run src/lib/gait/__tests__/fallrisk.test.ts`: 24 passed out of 24 tests.
  - `npx vitest run src/components/gait/__tests__/e2e_fallrisk_ui.test.tsx`: 40 passed out of 40 tests.
  - `npx vitest run src/lib/gait/__tests__/`: 19 test files passed, 237 passed out of 237 tests.
  - `npx tsc --noEmit`: 0 errors.
  - `npx eslint`: 0 errors (42 warnings).

- **Observation 6 (Integrity Check)**:
  - Verified no hardcoded test expectations or dummy facade functions in `fallrisk.ts`. All outputs are computed dynamically via statistical and mathematical logic. No integrity violations found.

## 2. Logic Chain

1. *Height-Adjusted Proxy*: Stature-based step length estimation ($L_{\text{step}} = 0.414 \times h$) provides biomechanically sound gait speed estimation ($V = \frac{\text{cadence} \times L_{\text{step}} \times 2}{60}$) replacing the arbitrary fixed 0.012 multiplier.
2. *Dynamic STEADI Thresholds*: Scaling STEADI breach cutoffs via $\lceil 0.6 \times N \rceil$ ensures proportional classification when camera perspective (e.g. frontal view) suppresses double support or symmetry angle metrics.
3. *Weight Re-Normalization*: Summing base weights over non-null subscores and dividing each base weight by `validWeightSum` preserves composite score range [0, 100] without biasing scores with synthetic fallback constants.
4. *Orthogonal Planes*: Vertical bounce ($Y$-axis) and lateral sway ($X$-axis) are independent degrees of freedom; omitting lateral sway when unavailable prevents conflation of gait bounce with postural instability.

## 3. Caveats

No caveats. All updated functions maintain exact backward compatibility and export signatures.

## 4. Conclusion

**Verdict**: `APPROVE`

Milestone 3 (Fall Risk Hardening R10) passes all functional requirements, clinical safety criteria, type checks, linting, unit test suites, and integrity checks.

## 5. Verification Method

To independently verify:
```bash
npx vitest run src/lib/gait/__tests__/fallrisk.test.ts
npx vitest run src/components/gait/__tests__/e2e_fallrisk_ui.test.tsx
npx tsc --noEmit
npx eslint
```
Expected output: 100% tests passing, 0 TypeScript errors, 0 ESLint errors.

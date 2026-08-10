## 2026-08-10T14:19:32Z
You are teamwork_preview_worker (Worker for M3).
Working directory: /Users/damian/GitHub/gait-lab/.agents/worker_m3/

Your task is to implement Milestone 3 Fall Risk Hardening (R10) in `src/lib/gait/fallrisk.ts`:

1. **Gait Speed Proxy**:
   Replace hardcoded `cadence * 0.012` with height-adjusted formula `(cadence * (0.414 * heightMeters) * 2) / 60` when height is available, or `(cadence * stepLength * 2) / 60` when step length is available.
2. **Model A Frontal View Dynamic STEADI Thresholds**:
   Adjust STEADI high risk threshold dynamically by `evaluatedCount`: `breachedCount >= Math.ceil(0.6 * evaluatedCount)` for High Risk. In frontal view clips where `evaluatedCount = 2`, `breachedCount >= 2` triggers High Risk.
3. **Model B Frontal Fallback & Weight Re-Normalization**:
   Exclude missing/null metrics (`kinematicsScore`, `trunkSwayScore`, `dteScore`) from sub-score calculation and re-normalize remaining domain weights dynamically.
4. **Orthogonal Planes Separation**:
   Eliminate `verticalBounce * 0.5` substitution for `lateralSway` across `computeFallRiskModelB`, `computePatientBaseline`, and `detectAcuteWeaknessAnomalies`. Mark missing lateral sway as `null` (unevaluated).

Mandatory References:
- `/Users/damian/GitHub/gait-lab/.agents/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m3_1/handoff.md`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m3_1/proposed_fallrisk.ts`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Instructions:
1. Initialize working directory with `BRIEFING.md` and `progress.md`.
2. Update `src/lib/gait/fallrisk.ts` and relevant tests (`src/lib/gait/__tests__/fallrisk.test.ts`).
3. Run verification: `npx vitest run`, `npx tsc --noEmit`, `npx eslint`.
4. Create final report at `/Users/damian/GitHub/gait-lab/.agents/worker_m3/handoff.md` with complete test and build results. Send message back to parent.

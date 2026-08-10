## 2026-08-10T03:30:34Z
<USER_REQUEST>
You are the Project Orchestrator for gait-lab.

Your objective is to execute the requirements in `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md` (specifically the latest follow-up request from 2026-08-10T03:29:45Z).

Working directory: `/Users/damian/GitHub/gait-lab/.agents/orchestrator`
Project root: `/Users/damian/GitHub/gait-lab`

## Requirements Summary
1. **R1. Fix 2 Failing Tests & Harden Algorithm Accuracy**: Root-cause fix for `e2e_engine_enhancements.test.ts` (steady-state stride filter over-trimming valid asymmetry variability) and `split_half_stress_m8_2.test.ts` (split-half CI bounds monotonicity under extreme variance injection). All 861+ tests green without weakening test assertions.
2. **R2. Deepen Signal Processing & Event Detection Tuning**: Systematic review and balanced parameter tuning across core modules (`events.ts`, `analysis.ts`, `signal.ts`, `PoseTracker.ts`, `ratings.ts`, `guesses.ts`, `fallrisk.ts`). Ensure real-world clips (`tuning-3992.mp4` / `tuning-3993.mp4`) are optimal.
3. **R3. Expand Adversarial Test Coverage for Identified Gaps**: Add synthetic scenarios for 6 gap categories (landmark jitter/noise, variable frame rate, landmark occlusion, extreme gait asymmetry, micro-steps/Parkinsonian, camera shake). No uncaught exceptions, NaN, or Infinity.
4. **R4. Download & Integrate Additional Reference Gait Video Data**: Download up to 10 reference videos (at least 2 required) from open datasets / repositories (sagittal, frontal, follow-cam) into `public/samples/`.
5. **R5. Documentation & Scientific Justification Alignment**: Update `scientific_justifications.md` and `peer_review_report.md` to reflect algorithm changes and line-range mappings.

## Acceptance Criteria
- 100% green pass rate across ALL Vitest test suites (`npx vitest run`).
- 0 TypeScript compilation errors (`npx tsc --noEmit`).
- 0 ESLint errors (`npx eslint .`).
- 0 false duplicate tracks on single-subject sample videos.
- At least 6 new adversarial test scenarios added (one per gap category).
- At least 2 new reference video clips downloaded into `public/samples/`.
- `scientific_justifications.md` line-range mappings verified.

Follow the team protocol: decompose into milestones, create `.agents/orchestrator/BRIEFING.md` and `progress.md`, spawn specialist subagents (explorer, worker, reviewer, challenger, auditor), conduct reviews and audits per milestone, and when all milestones pass, write a final summary and declare completion so the Sentinel can trigger the Victory Audit.


## 2026-08-10T04:06:34Z
<USER_REQUEST>
Resume work at /Users/damian/GitHub/gait-lab/.agents/orchestrator. Read handoff.md, BRIEFING.md, ORIGINAL_REQUEST.md, DISPATCH.md, PROJECT.md, and progress.md for current state.
Your parent is ae28ae8f-da65-45ea-a312-8898654ea4b6 — use this ID for all escalation and status reporting (send_message).

CURRENT TASK:
1. Dispatch Milestone 4 Iteration 3 verification team (2 Reviewers, 2 Challengers, 1 Forensic Auditor) to verify worker_m4_3's remediation (report_m4_3.md, scripts/extract_reference_gait_videos.mjs, SamplePicker.tsx, sample_picker.test.ts). Once verified (GateResult: PASS), mark M4 DONE in PROJECT.md and progress.md.
2. Execute Milestone 5 (Documentation & Scientific Justification Alignment R5):
   - Spawn Worker worker_m5_1 to update scientific_justifications.md (line-range mappings in §4, olsDetrend, 0.001 prominence floor, missing subsystems) and peer_review_report.md per .agents/spec_miner_survey_1/spec_r5.md.
   - Dispatch M5 verification team (2 Reviewers, 2 Challengers, 1 Forensic Auditor) to verify M5. Once verified (GateResult: PASS), mark M5 DONE.
3. Run final test suite pass (npx vitest run, npx tsc --noEmit, npx eslint .) and audit, synthesize results across all 5 milestones, write final report to parent (ae28ae8f-da65-45ea-a312-8898654ea4b6), and declare completion for Sentinel victory audit.
</USER_REQUEST>

## 2026-08-10T11:33:48Z
<USER_REQUEST>
You are the Project Orchestrator for gait-lab.
Working directory: `/Users/damian/GitHub/gait-lab`
Your metadata directory: `/Users/damian/GitHub/gait-lab/.agents/orchestrator`

A new high-priority precision engineering pass has been requested. Refer to `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md` (specifically section `## Follow-up — 2026-08-10T11:33:30Z`) for complete requirements:

### Summary of Requirements:
- **R1. Hungarian Algorithm**: Replace greedy pair matching in `matchPeople()` (analysis.ts) with the Hungarian (Kuhn-Munkres) algorithm for optimal bipartite matching. Keep cost function (`minDist + bioDist * 0.25`) and `maxAllowedDist` gating.
- **R2. 2-State Kalman Filter**: Upgrade `kalmanFilter1D()` in `signal.ts` to a 2-state constant-velocity model `[position, velocity]^T`. Tune Q and R against synthetic suite. Occlusion coasting with velocity prediction when `visibility < 0.4`.
- **R3. One Euro Adaptive Filter**: Implement One Euro Filter (Casiez et al. 2012) in `PoseTracker.ts` for real-time landmark/hip-center smoothing with adaptive cutoff based on signal derivative.
- **R4. Biometric-Aware Target Lock & Occlusion Recovery**: Upgrade `PoseTracker.ts` candidate scoring with biometric signature matching (`computeBiometricSignature`, `biometricDistance`), normalized multi-factor score (40% spatial, 30% biometric, 15% bbox area, 15% continuity), ±2σ velocity clamping, and occlusion coasting timeout (velocity decay 0.9^N, reset lock after 30 frames).
- **R5. Dynamic Walking Direction for U-Turn Handling**: Time-varying walking direction using sliding window (~1.5s / 45 frames) in `detectGaitEventsZeni()` (events.ts) with sign-flip hysteresis > 0.01. Add lateral ankle position disambiguation for frontal-Y fallback.
- **R6. Visibility-Gated Biometrics & Sagittal Fix**: Gate keypoint biometrics on `visibility >= 0.4` (return `undefined` if insufficient). Suppress/down-weight `shoulderHipRatio` when `aspectRatio < 0.35`. Visibility-weighted EMA updates.
- **R7. Adaptive SG Window & Uniform Resampling Guard**: Scale Savitzky-Golay window with FPS (`fps * 0.17`, 5 to 15 points). Add uniform resampling guard to `zeroPhaseButterworth()` when dt variance > 10% of mean dt.
- **R8. Expand Unit Test Coverage for Untested Modules**: Add dedicated test files for `landmarks.ts`, `calibration.ts`, `homography.ts`, `liveCapture.ts`, `persistence.server.ts`.
- **R9. Clinical Normative Reference Integration**: Create `src/lib/gait/normatives.ts` with Winter (2009) / Bovi (2011) age/sex-stratified ranges, Z-scores, Gait Deviation Index (GDI, Schwartz & Rozumalski 2008), and integrate into `ratings.ts` & `guesses.ts`.
- **Acceptance Criteria**: 100% green tests (>= 1050 tests passing), 0 tsc errors, 0 eslint errors, all algorithm assertions passing, `scientific_justifications.md` updated with line ranges & citations.
</USER_REQUEST>

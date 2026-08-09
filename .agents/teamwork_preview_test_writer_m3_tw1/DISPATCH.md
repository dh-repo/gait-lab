# Task Assignment: Test Writer (Milestone 3)

## Identity
- Role: teamwork_preview_test_writer
- Working directory: /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_test_writer_m3_tw1

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Instructions
Read the following documents before starting:
- /Users/damian/GitHub/gait-lab/.agents/ORIGINAL_REQUEST.md
- /Users/damian/GitHub/gait-lab/PROJECT.md
- /Users/damian/GitHub/gait-lab/.agents/teamwork_sub_orch_m3/SCOPE.md
- /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m3_exp1/analysis.md
- /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m3_exp2/analysis.md
- /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m3_exp3/analysis.md

## Assigned Write Scope
You are assigned exclusive write ownership over:
1. `vitest.config.ts` (create in project root to include `src/**/*.test.ts` and exclude `scripts/**`)
2. `package.json` (update `"test"` script to `"node --test 'scripts/**/*.test.mjs' && vitest run"`)
3. `src/lib/gait/__tests__/testHelpers.ts` (shared test helpers)
4. `src/lib/gait/__tests__/signal.test.ts` (expand)
5. `src/lib/gait/__tests__/events.test.ts` (expand)
6. `src/lib/gait/__tests__/symmetry.test.ts` (expand)
7. `src/lib/gait/__tests__/smoothness.test.ts` (expand)
8. `src/lib/gait/__tests__/dte.test.ts` (expand)
9. `src/lib/gait/__tests__/analysis.test.ts` (create)
10. `src/lib/gait/__tests__/ratings.test.ts` (create)
11. `src/lib/gait/__tests__/guesses.test.ts` (create)
12. `src/lib/gait/__tests__/persistence.test.ts` (create)

## Specific Execution & Test Requirements
1. **Vitest Config & Tooling**:
   Create `vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config';
   import path from 'path';

   export default defineConfig({
     test: {
       environment: 'node',
       include: ['src/**/*.test.ts'],
       exclude: ['scripts/**', 'node_modules/**'],
       alias: {
         '@': path.resolve(__dirname, './src'),
       },
     },
   });
   ```
   Update `package.json` script:
   `"test": "node --test 'scripts/**/*.test.mjs' && vitest run"`

2. **Test Implementation & Expansion**:
   - `testHelpers.ts`: Create reusable generators for synthetic pose frames, mock gait metrics, and synthetic signal data.
   - `signal.test.ts`: Expand coverage to test `butterworthLowPass`, `zeroPhaseButterworth` boundary padding and cutoff frequency sweeps, `linearDetrend`, `computeFFTHarmonics` ($n<8$ fallback, Hann windowing, odd/even sums).
   - `events.test.ts`: Expand coverage to test left-to-right (`direction=1`) vs right-to-left (`direction=-1`) Zeni gait event detection, low landmark visibility ANKLE fallback in `getLandmarkX`, stance/swing breakdown, double support timing, and boundary conditions ($n<10$).
   - `symmetry.test.ts`: Expand coverage to test `symmetryAngle` near-zero epsilon ($1e-6$), specific ratios (1:1, 2:1, 3:1, 10:1), mathematical cap (50.0%), and `gaitSymmetryIndex` ($GSI$).
   - `smoothness.test.ts`: Expand coverage to test vertical ($HR_{vert}$) vs lateral ($HR_{lat}$) Harmonic Ratio formulas, rhythmic vs dysrhythmic signals, and short array fallback ($n<8$).
   - `dte.test.ts`: Expand coverage to test all 4 Plummer & Eskes CMI quadrants (`no_interference`, `cognitive_prioritization`, `motor_prioritization`, `mutual_interference`), exact $\pm 5.0\%$ boundary thresholds, `symmetryDTE`, and default fallback.
   - `analysis.test.ts`: Create comprehensive tests for `detectViewAngle` (0, 90, 180, 270 deg, diagonal), `computeGaitMetrics` full pipeline, `matchPeople` multi-person tracking, `trackPriorityScore`, `tracksToPeople`, `computeDualTaskCost`, and `resamplePoseFrames`.
   - `ratings.test.ts`: Create comprehensive tests for `bandFromScore`, `bandFromBurden`, `dataQualityScore`, `buildStructuredReport` (report structure, star ratings, domain composite scores, metric favorability directions).
   - `guesses.test.ts`: Create comprehensive tests for `buildEducatedGuesses` testing rule triggers across asymmetric, irregular, reduced stance, speed drop, and impairment patterns, confidence scoring, and determination ladder.
   - `persistence.test.ts`: Create comprehensive tests for session persistence structures, JSON serialization/deserialization, DB session record formatting, and `saveGaitSession` / `getGaitSession` payload mapping.

3. **Execution Verification**:
   - Run `npx vitest run` and confirm 100% passing tests with 0 failures across all test files.
   - Run `npm test` and confirm both script tests and vitest tests pass 100% with exit code 0.

Write your handoff report to `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_test_writer_m3_tw1/handoff.md`.
Send a completion message back to parent orchestrator.

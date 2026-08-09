## 2026-08-09T09:11:44Z
You are Worker for Milestone 7 (M7: R3 Continuous Window Frame Sampling & Subframe Timestamp Refinement).
Your workspace directory is `/Users/damian/GitHub/gait-lab/.agents/worker_m7_1`.

Read the project specifications and explorer blueprints:
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_3/analysis.md`
- `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_3/handoff.md`

File Ownership:
You have EXCLUSIVE write access to:
- `src/components/gait/GaitApp.tsx`
- `src/lib/gait/events.ts`
- `src/lib/gait/analysis.ts`
- `src/lib/gait/__tests__/events.test.ts`
- `src/lib/gait/__tests__/analysis.test.ts`

Tasks:
1. `src/components/gait/GaitApp.tsx`:
   - Update `runAnalysis()` frame sampling loop.
   - For videos > 10s, sample a continuous 10–12s window at full 30 Hz ($N = 300\text{--}360$ frames, $\Delta t = 33.3\text{ ms}$) rather than spreading 300 seeks over the entire clip duration. For clips <= 10s, sample the full clip at 30 Hz.
   - Compute and report the true achieved `samplingFps` (e.g. 30.0 Hz) in the returned `GaitMetrics`.
2. `src/lib/gait/events.ts`:
   - Implement parabolic 3-point subframe timestamp refinement `refinePeakTimestamp(signal, peakIdx, frameTimeSec, fps)`.
   - Update `detectGaitEventsZeni` to refine `timeSec` for each initial contact (heel strike) and terminal contact (toe off) event.
   - Export `refinePeakTimestamp`.
3. `src/lib/gait/analysis.ts`:
   - Ensure `stepTimeCV` calculation uses high-precision refined timestamps and is clip-length invariant.
4. Unit Tests (`events.test.ts` & `analysis.test.ts`):
   - Add unit tests verifying parabolic subframe timestamp refinement accuracy (< 3 ms timing precision).
   - Add test verifying `stepTimeCV` consistency across clip lengths (10s vs 30s vs 60s).
5. Verification:
   - `npx vitest run src/lib/gait/__tests__/events.test.ts src/lib/gait/__tests__/analysis.test.ts`
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your changes and verification logs to `/Users/damian/GitHub/gait-lab/.agents/worker_m7_1/changes.md` and write a complete handoff report to `/Users/damian/GitHub/gait-lab/.agents/worker_m7_1/handoff.md`.

# Dispatch for Challenger M1-2

**Role**: teamwork_preview_challenger (Noise Stress & Signal Integrity Challenger)
**Working Directory**: /Users/damian/GitHub/gait-lab/.agents/challenger_m1_2

## Objective
Empirically stress-test and challenge the 1D landmark coordinate temporal smoothing filter in `src/lib/gait/signal.ts` and integration in `src/lib/gait/analysis.ts`:
1. Verify `savitzkyGolay5` and `smoothPoseFrames` against high-frequency Gaussian noise, impulse noise spikes, zero-length signals, micro-clips ($N = 1, 2, 3, 4$), and $N \ge 500$ frame clips.
2. Verify linear trend signal preservation ($y = ax + b$) across all frames including endpoints $0, 1, N-2, N-1$.
3. Run synthetic noise regression tests (`cat1_landmark_jitter_noise.test.ts`) and confirm >50% noise variance reduction without peak phase shift.
4. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Authoritative Reference Inputs
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md`
- `/Users/damian/GitHub/gait-lab/.agents/worker_m1_1/handoff.md`

## Output Requirements
Deliver `handoff.md` with explicit Verdict (`APPROVE` or `REJECT`) and test verification evidence. Communicate completion via `send_message`.

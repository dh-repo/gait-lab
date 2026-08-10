## 2026-08-10T07:30:46Z
<USER_REQUEST>
You are explorer_survey_2.
Your working directory is: /Users/damian/GitHub/gait-lab/.agents/explorer_survey_2
Original request path: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md

OBJECTIVE:
Investigate R2 (Signal Processing & Event Detection Tuning) and R3 (Adversarial Test Coverage Gaps).
1. Inspect core engine modules: `src/engine/events.ts`, `src/engine/analysis.ts`, `src/engine/signal.ts`, `src/engine/PoseTracker.ts`, `src/engine/ratings.ts`, `src/engine/guesses.ts`, `src/engine/fallrisk.ts`.
2. Inspect tuning reference clips (`tuning-3992.mp4` / `tuning-3993.mp4` if available, and associated sample data/test fixtures).
3. Inspect current test files to catalog existing adversarial test coverage.
4. Identify missing scenarios across the 6 gap categories:
   - Landmark jitter/noise
   - Variable frame rate
   - Landmark occlusion
   - Extreme gait asymmetry
   - Micro-steps / Parkinsonian gait
   - Camera shake
5. Propose specific parameter tuning guidelines and test generator strategies for the 6 gap categories.

OUTPUT: Write your detailed report to `/Users/damian/GitHub/gait-lab/.agents/explorer_survey_2/survey_r2_r3.md` and deliver handoff.md in your working directory. Send a message to parent with the summary and report path.
</USER_REQUEST>

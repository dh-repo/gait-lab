## 2026-08-10T11:36:33Z
You are teamwork_preview_explorer_m1_2 (Explorer 2 for Milestone 1).
Working directory: /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m1_2

Your task:
Analyze R6 (Visibility-gated biometrics & sagittal collapse fix in src/lib/gait/analysis.ts).
Read the following authoritative documents:
- /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- /Users/damian/GitHub/gait-lab/PROJECT.md
- /Users/damian/GitHub/gait-lab/.agents/teamwork_sub_orch_m1_pass2/SCOPE.md
- Target source file: /Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts (focus on computeBiometricSignature lines ~717-756 and biometricDistance)

Produce a detailed blueprint for R6:
1. Exact breakdown of current computeBiometricSignature and biometricDistance functions.
2. Visibility Gating:
   - Check keypoints 11 (L shoulder), 12 (R shoulder), 23 (L hip), 24 (R hip), 27 (L ankle), 28 (R ankle).
   - Require `.visibility >= 0.4` for all required keypoints. If any keypoint is missing or visibility < 0.4, return `undefined` (skip biometric signature for that frame).
3. Sagittal Aspect Ratio Fix:
   - In biometricDistance(), detect sagittal alignment when `aspectRatio < 0.35` (e.g. subject walking directly towards/away or in side profile where shoulder/hip width projection is near 0).
   - Suppress or down-weight `shoulderHipRatio` difference when `aspectRatio < 0.35` (e.g. exclude shoulderHipRatio from normalized distance or reduce weight to near 0).
4. Mean Landmark Visibility Weighted EMA:
   - Calculate `meanVisibility` of the keypoints used in signature calculation.
   - Weight the running EMA update of PersonTrack biometrics by `meanVisibility` (or scale alpha by visibility) instead of fixed 70/30.
5. Defensive guards: ensure no NaN, Infinity, or undefined propagation.

Write your report to: /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m1_2/report.md
Also write a handoff report at: /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m1_2/handoff.md
Once finished, send a message to parent (1c9f83f7-70ba-4364-948a-19d2c0d41673) with your summary and path to your handoff report.

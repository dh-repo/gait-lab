# Dispatch for Explorer M1-1

**Role**: teamwork_preview_explorer (CV Model Hierarchy Specialist)
**Working Directory**: /Users/damian/GitHub/gait-lab/.agents/explorer_m1_1

## Task Objective
Investigate `src/lib/gait/pose.ts` and analyze the required implementation for the MediaPipe Pose Landmarker model hierarchy upgrade:
1. Support `pose_landmarker_heavy.task` with fallback to `pose_landmarker_full.task` and `pose_landmarker_lite.task`.
2. Support GPU delegate attempt with CPU delegate fallback for each model tier.
3. Support local model asset path (`/models/pose_landmarker_${tier}.task`) with Google Storage CDN URL fallback (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${tier}/float16/1/pose_landmarker_${tier}.task`).
4. Update `PoseLandmarkerLike` interface to expose `modelTier?: PoseLandmarkerModelTier` and `delegate?: PoseLandmarkerDelegate`.
5. Specify unit test additions for `pose.test.ts`.

## Authoritative Reference Inputs
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_survey_1/analysis.md`



## 2026-08-09T21:07:01Z
You are Explorer M1-1 for gait-lab.
Your working directory is: /Users/damian/GitHub/gait-lab/.agents/explorer_m1_1
Mandatory Reference: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md

Read /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md, /Users/damian/GitHub/gait-lab/PROJECT.md, /Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md, /Users/damian/GitHub/gait-lab/.agents/explorer_m1_1/DISPATCH.md, and /Users/damian/GitHub/gait-lab/.agents/explorer_survey_1/analysis.md.

Investigate `src/lib/gait/pose.ts` and analyze the required implementation for the MediaPipe Pose Landmarker model hierarchy upgrade:
1. Support `pose_landmarker_heavy.task` with fallback to `pose_landmarker_full.task` and `pose_landmarker_lite.task`.
2. Support GPU delegate attempt with CPU delegate fallback for each model tier.
3. Support local model asset path (`/models/pose_landmarker_${tier}.task`) with Google Storage CDN URL fallback (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${tier}/float16/1/pose_landmarker_${tier}.task`).
4. Update `PoseLandmarkerLike` interface to expose `modelTier?: PoseLandmarkerModelTier` and `delegate?: PoseLandmarkerDelegate`.
5. Specify unit test additions for `pose.test.ts`.

Write your detailed technical report to `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_1/analysis.md` and deliver `handoff.md`. Communicate completion via send_message to parent.


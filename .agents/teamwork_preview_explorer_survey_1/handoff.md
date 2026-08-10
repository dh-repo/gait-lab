# Handoff Report: Requirement 1 (R1) Survey & Architectural Analysis

## 1. Observation
- **`src/lib/gait/pose.ts`**:
  - Line 35: hardcodes `const modelAssetPath = "/models/pose_landmarker_lite.task";`.
  - Lines 47-59: attempts creation with `delegate: "GPU"`, falling back to `delegate: "CPU"` for `lite` only.
- **`public/models/`**:
  - Contains `pose_landmarker_lite.task` (5,777,746 bytes). `pose_landmarker_heavy.task` and `pose_landmarker_full.task` are not currently in `public/models/`.
- **`src/lib/gait/analysis.ts`**:
  - `computeGaitMetricsCore(frames: PoseFrame[])` receives raw keypoint frames and computes derived geometry (`series`, `torso`, `leftKneeAngle`, `detectViewAngle`, `detectGaitEventsZeni`) prior to Butterworth filtering of derived 1D metrics.
- **`src/lib/gait/signal.ts`**:
  - Contains `zeroPhaseButterworth`, `butterworthLowPass`, and `olsDetrend`. Does not currently contain Savitzky-Golay or Kalman 1D coordinate smoothing filters.

## 2. Logic Chain
- **Step 1**: In `pose.ts`, `getPoseLandmarker()` can be enhanced to iterate through `MODEL_CANDIDATES = ["/models/pose_landmarker_heavy.task", "/models/pose_landmarker_full.task", "/models/pose_landmarker_lite.task"]`. For each candidate path, it will attempt `GPU` delegate, then `CPU` delegate. If an asset is missing or fails to initialize, it catches the error and proceeds to the next candidate model in the chain. This enables `heavy` or `full` model support whenever available while guaranteeing backwards-compatible fallback to `lite`.
- **Step 2**: Filtering raw 1D keypoint coordinates $(x_i(t), y_i(t), z_i(t))$ across frames before calculating derived geometry eliminates noise propagation into joint angles, bounding boxes, torso height, and step length proxies.
- **Step 3**: 5-point Savitzky-Golay filtering ($y[i] = \frac{-3y[i-2] + 12y[i-1] + 17y[i] + 12y[i+1] - 3y[i+2]}{35}$) with reflection boundary padding and 1D Constant Velocity Kalman Filtering provide zero-phase noise suppression for landmark trajectories.
- **Step 4**: Integrating `smoothPoseFrames` at the entry of `computeGaitMetricsCore` ensures all kinematic metric computations and event detections operate on temporally smoothed keypoints.

## 3. Caveats
- No caveats regarding code state. Existing test suite passes 100%. `pose_landmarker_heavy.task` and `pose_landmarker_full.task` should be supported via fallback if files are not present on disk.

## 4. Conclusion
Requirement 1 (R1) investigation is complete. The design for model candidate cascading fallback (`heavy` GPU/CPU -> `full` GPU/CPU -> `lite` GPU/CPU) and 1D keypoint coordinate temporal smoothing (5-point Savitzky-Golay and Kalman filters integrated into `signal.ts` and `analysis.ts`) is fully specified and ready for implementation.

## 5. Verification Method
- **Analysis File**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_1/analysis.md`
- **Handoff File**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_1/handoff.md`
- **Commands**:
  - `npm test`: Verify unit tests pass.
  - `npm run typecheck`: Verify 0 TypeScript errors.

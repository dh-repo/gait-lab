# Handoff Report: Requirements 2 & 3 Investigation (R2 & R3)

**Agent:** `teamwork_preview_explorer_survey_2`  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_2`  
**Parent Agent:** `a781c023-9e74-468c-b16f-39a0ba455871`

---

## 1. Observation
- **PoseTracker & WebRTC Options (`src/lib/gait/PoseTracker.ts`)**:
  - `PoseTracker.ts:107`: `constructor(targetFps = 30, maxBufferFrames = 900)`
  - `PoseTracker.ts:144`: `const requestedTargetFps = options.targetFps ?? 30;`
  - `GaitApp.tsx:111`: `const WEBCAM_TARGET_FPS = 30;`
  - Current configuration defaults to 30 FPS instead of ideal 60 FPS.
- **Floor Marker Calibration**:
  - No spatial mm/px calibration module currently exists in `src/lib/gait/`. Raw landmarks are processed in normalized $[0, 1]$ image space.
- **Gait Event Detection (`src/lib/gait/events.ts`)**:
  - `events.ts:186–307`: `detectGaitEventsZeni` detects Heel Strikes and Toe Offs purely from 1D relative AP foot displacement ($x_{heel} - x_{hip}$). Vertical ankle acceleration and Zero-Velocity Updates (ZUPT) are not currently incorporated into the event detection loop.
- **Planar Homography & Step Width (`src/lib/gait/analysis.ts`)**:
  - `analysis.ts:274, 385, 402`: `stepWidth` is calculated as raw 1D pixel/normalized distance $|x_L - x_R| / th$. Under oblique camera angles, perspective distortion degrades step width accuracy.

---

## 2. Logic Chain
1. **60 FPS Video Capture (R2.1)**:
   - Setting `targetFps = 60` and `maxBufferFrames = 1800` in `PoseTracker.ts` and updating `WEBCAM_TARGET_FPS = 60` in `GaitApp.tsx` doubles temporal sampling resolution from 33.3 ms to 16.7 ms per frame, improving subframe peak timestamp accuracy.
2. **Floor Marker Calibration (R2.2)**:
   - Introducing `calibration.ts` with support for reference cards (85.6 mm x 53.98 mm), QR codes, and AprilTags provides a direct mapping from image pixels/normalized units to physical millimeters ($\text{mm/px}$), enabling exact gait speed ($\text{m/s}$) and step length/width ($\text{mm}$) calculations.
3. **Multi-Signal Heel-Strike Fusion & ZUPT (R3.1)**:
   - Fusing relative AP foot displacement with vertical ankle acceleration minima ($a_{y, ankle}$) and Zero-Velocity Updates ($v_{foot} \approx 0$ during stance) eliminates false positives and missing steps in shuffling or complex gait.
4. **2D Floor Planar Homography Transformation (R3.2)**:
   - Implementing a Direct Linear Transform (DLT) 3x3 homography matrix solver in `homography.ts` projects 2D image coordinates into top-down floor plane coordinates, removing perspective distortion from step width estimation under oblique camera angles.

---

## 3. Caveats
- Hardware limitations: WebRTC cameras without 60 FPS hardware support will gracefully fall back to 30 FPS via `OverconstrainedError` handling.
- Marker visibility: When no calibration marker is detected, the engine must safely fall back to torso-height normalization.

---

## 4. Conclusion
The codebase analysis for R2 and R3 is complete. The exact technical specifications, affected files, math/geometry models, and test procedures have been documented in detail in `analysis.md` and this `handoff.md`.

---

## 5. Verification Method
- **Unit Tests**:
  ```bash
  npx vitest run src/lib/gait/__tests__/PoseTracker.test.ts
  npx vitest run src/lib/gait/__tests__/events.test.ts
  ```
- **Type Checking & Build**:
  ```bash
  npm run typecheck
  npm run lint
  npm run build
  ```

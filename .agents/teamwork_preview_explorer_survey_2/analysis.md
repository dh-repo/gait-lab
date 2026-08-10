# Comprehensive Technical Analysis: Requirements 2 & 3 (R2 & R3)

**Author:** `teamwork_preview_explorer_survey_2`  
**Date:** 2026-08-09  
**Target Repository:** `/Users/damian/GitHub/gait-lab`  
**Focus Scope:** R2 (WebRTC 60 FPS constraints & Floor Marker Calibration) & R3 (Multi-Signal Gait Event Fusion & 2D Floor Planar Homography)

---

## 1. Observation

### 1.1 WebRTC Camera Capture (`src/lib/gait/PoseTracker.ts` & `src/components/gait/GaitApp.tsx`)
- In `src/lib/gait/PoseTracker.ts` (lines 107–110, 144–156):
  ```ts
  constructor(targetFps = 30, maxBufferFrames = 900) {
    this.targetIntervalMs = 1000 / targetFps;
    this.maxBufferFrames = maxBufferFrames;
  }

  const requestedTargetFps = options.targetFps ?? 30;
  this.targetIntervalMs = 1000 / requestedTargetFps;

  const constraints: MediaStreamConstraints = {
    video: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      facingMode: options.facingMode || "user",
      width: options.width ? { ideal: options.width } : { ideal: 1280 },
      height: options.height ? { ideal: options.height } : { ideal: 720 },
      frameRate: { ideal: requestedTargetFps, max: 60 },
    },
    audio: false,
  };
  ```
- In `src/components/gait/GaitApp.tsx` (lines 110–111):
  ```ts
  const WEBCAM_TARGET_FPS = 30;
  const WEBCAM_BUFFER_FRAMES = 900;
  ```
- **Observation Summary**: Defaults are currently set to 30 FPS. The MediaStreamConstraints in `PoseTracker.ts` default `requestedTargetFps` to 30 instead of 60.

### 1.2 Real-World Floor Marker Calibration
- **Current File Inspection**: Searched `src/lib/gait/` for calibration, marker, pixel scale, or mm/px utilities; no existing implementation exists.
- **Observation Summary**: Currently, all landmark coordinates in `PoseFrame.landmarks` are stored in normalized $[0, 1]$ image space. Metric calculations (such as stride travel in `analysis.ts:358-361`) rely on relative torso height normalization without physical millimeter ($\text{mm/px}$) spatial mapping.

### 1.3 Kinematic Gait Event Detection (`src/lib/gait/events.ts`)
- In `src/lib/gait/events.ts` (lines 186–307):
  ```ts
  // Extract mid-hip AP (x) trajectory and relative foot AP displacement
  leftHeelXRel[i] = lHeel - hipX;
  rightHeelXRel[i] = rHeel - hipX;
  leftToeXRel[i] = lToe - hipX;
  rightToeXRel[i] = rToe - hipX;
  ...
  const rawLHeelStrikes = findExtrema(filtLHeel, heelStrikeMode, minGap);
  const rawRHeelStrikes = findExtrema(filtRHeel, heelStrikeMode, minGap);
  ```
- **Observation Summary**: The current Zeni 2008 algorithm detects events purely from 1D relative AP foot displacement ($x_{heel} - x_{hip}$). It does not incorporate vertical ankle acceleration minima or Zero-Velocity Updates (ZUPT).

### 1.4 Planar Homography & Step Width Estimation (`src/lib/gait/analysis.ts`)
- In `src/lib/gait/analysis.ts` (lines 274, 385, 402):
  ```ts
  stepWidth: Math.abs(lm[LM.L_ANKLE].x - lm[LM.R_ANKLE].x) / th
  ...
  const rawStepWidthVariability = std(series.map((s) => s.stepWidth));
  ```
- **Observation Summary**: Step width is measured directly as 1D $x$-coordinate distance in camera image space normalized by torso height. In oblique or elevated camera angles, perspective foreshortening distorts step width and step width variability.

---

## 2. Logic Chain

### 2.1 R2.1: WebRTC 60 FPS Video Capture Constraints
1. **From Observation 1.1**: `PoseTracker.ts` constructor defaults to `targetFps = 30`, and `GaitApp.tsx` defines `WEBCAM_TARGET_FPS = 30`.
2. **Reasoning**: Higher frame rate (60 FPS) provides double temporal sampling resolution ($16.67\text{ ms}$ interval vs $33.33\text{ ms}$ interval), reducing timing discretization error in gait phase detection and subframe timestamp refinement.
3. **Actionable Spec**:
   - Update `PoseTracker.ts` constructor default: `targetFps = 60`, `maxBufferFrames = 1800` (preserving 30 seconds rolling window at 60 Hz).
   - In `startWebcam`: `const requestedTargetFps = options.targetFps ?? 60;`
   - Set video frameRate constraint: `frameRate: { ideal: 60, max: 60 }` (or `{ ideal: requestedTargetFps, max: 60 }`).
   - Update `GaitApp.tsx`: `WEBCAM_TARGET_FPS = 60`, `WEBCAM_BUFFER_FRAMES = 1800`.
   - Update unit tests in `PoseTracker.test.ts` to assert 60 FPS defaults.

### 2.2 R2.2: Real-World Floor Marker Calibration
1. **From Observation 1.2**: No absolute spatial scale ($\text{mm/px}$) currently exists in the codebase.
2. **Reasoning**: Spatio-temporal metrics (gait speed in m/s, step length in mm, step width in mm) require a mapping between 2D image coordinates (pixels or normalized $[0,1]$) and physical millimeters.
3. **Actionable Spec**:
   - Create `src/lib/gait/calibration.ts`.
   - Support planar marker types:
     - Standard Reference Card (ISO/IEC 7810 ID-1: $85.6\text{ mm} \times 53.98\text{ mm}$).
     - QR Code target (user-defined physical width $W_{real}$, e.g. $100\text{ mm}$ or $200\text{ mm}$).
     - AprilTag target.
     - Manual 2-point reference calibration.
   - Scale derivation formula:
     $$\text{mmPerPixel} = \frac{\text{physicalWidthMm}}{\text{pixelWidth}}$$
     $$\text{mmPerNormUnit} = \text{mmPerPixel} \times \text{imageWidthPx}$$
   - Function signatures:
     ```ts
     export interface FloorCalibration {
       type: "reference_card" | "qr" | "apriltag" | "manual";
       physicalWidthMm: number;
       pixelWidth: number;
       mmPerPixel: number;
       mmPerNormUnit: number;
       homographyMatrix?: number[][];
     }
     export function computeFloorCalibrationFromMarker(
       markerWidthPx: number,
       physicalWidthMm: number,
       imageWidthPx: number,
     ): FloorCalibration;
     export function convertDistanceToMm(
       distNorm: number,
       calibration: FloorCalibration,
     ): number;
     ```
   - Integrate into `GaitMetrics`: expose `gaitSpeedMps = (totalDistanceMm / 1000) / durationSec`.

### 2.3 R3.1: Multi-Signal Heel-Strike Fusion & ZUPT Algorithm
1. **From Observation 1.3**: Zeni AP relative foot displacement alone can miss heel strikes or produce false positives during shuffling or atypical gait.
2. **Reasoning**: Foot contact with the floor is characterized by 3 distinct physical phenomena:
   - Max/Min relative AP displacement (Zeni kinematic peak).
   - Impact deceleration minimum in vertical ankle acceleration $a_{y, ankle}(t)$ as downward velocity turns around.
   - Zero-Velocity Updates (ZUPT): During stance phase, foot velocity $\|\vec{v}_{foot}(t)\| \approx 0$.
3. **Actionable Spec**:
   - In `events.ts`:
     - Extract $y_{ankle}(t)$ trajectory, low-pass filter at $f_c = 6.0\text{ Hz}$, compute vertical velocity $v_{y, ankle}(t)$ and vertical acceleration $a_{y, ankle}(t) = \frac{d^2 y_{ankle}}{dt^2}$.
     - Compute 2D foot velocity magnitude $v_{foot}(t) = \sqrt{v_{x, ankle}^2 + v_{y, ankle}^2}$.
     - Define ZUPT indicator: $ZUPT(t) = 1$ when $v_{foot}(t) < \text{threshold}_{zupt}$ (or local velocity minimum).
     - Fusion Scoring Function for Heel Strike candidates:
       $$S_{fused}(t) = w_1 S_{AP, norm}(t) + w_2 (-a_{y, ankle, norm}(t)) + w_3 (1 - v_{foot, norm}(t))$$
     - Refine candidate AP peaks by searching a temporal window $\pm \Delta t$ ($\approx 0.12\text{ s}$) for $S_{fused}(t)$ local maximum.
     - Apply parabolic subframe timestamp refinement `refinePeakTimestamp` to the fused signal peak to maintain $< 3\text{ ms}$ precision.
     - For Toe-Off: detect exit from ZUPT state ($v_{foot}$ increasing) combined with AP toe displacement extrema.

### 2.4 R3.2: 2D Floor Planar Homography Transformation
1. **From Observation 1.4**: Step width measured directly in 2D image space suffers from perspective distortion under oblique camera angles.
2. **Reasoning**: A 2D planar homography matrix $H \in \mathbb{R}^{3 \times 3}$ maps image plane coordinates $(u, v)$ to top-down floor plane coordinates $(X, Y)$, eliminating perspective foreshortening.
3. **Actionable Spec**:
   - Create `src/lib/gait/homography.ts`.
   - Implement Direct Linear Transform (DLT) solver:
     - Input: 4 point correspondences $(u_i, v_i) \leftrightarrow (X_i, Y_i)$ ($i=1..4$) on the floor plane.
     - Set up $8 \times 9$ matrix equation $A h = 0$ (or $8 \times 8$ with $h_{33} = 1$).
     - Solve for $H$:
       $$H = \begin{bmatrix} h_{11} & h_{12} & h_{13} \\ h_{21} & h_{22} & h_{23} \\ h_{31} & h_{32} & h_{33} \end{bmatrix}$$
   - Function signatures:
     ```ts
     export function computeHomographyMatrix(
       srcPoints: { x: number; y: number }[],
       dstPoints: { x: number; y: number }[],
     ): number[][];
     export function transformPointHomography(
       pt: { x: number; y: number },
       H: number[][],
     ): { x: number; y: number };
     ```
   - In `analysis.ts`:
     - Transform left and right ankle landmarks $(u_L, v_L)$ and $(u_R, v_R)$ into floor plane $(X_L, Y_L)$ and $(X_R, Y_R)$.
     - Compute walking progression vector $\vec{d}_{walk} = (\Delta X, \Delta Y)$ and normal vector $\vec{n}_{walk} = (-\Delta Y, \Delta X) / \|\vec{d}_{walk}\|$.
     - Calculate floor step width: $\text{StepWidth}_{floor} = |(X_L - X_R) n_x + (Y_L - Y_R) n_y|$.

---

## 3. Caveats
- **WebRTC Camera Hardware Limits**: Requesting `ideal: 60` FPS on cameras that physically only support 30 FPS will result in the browser returning 30 FPS streams. `PoseTracker.ts` already includes `OverconstrainedError` fallback logic to gracefully handle hardware constraints.
- **Floor Marker Visibility**: When no calibration marker is visible in the frame, the system must gracefully fall back to torso-height normalization or default pinhole perspective estimation without throwing exceptions.

---

## 4. Conclusion
The proposed architecture for Requirements 2 and 3 provides a mathematically rigorous, backwards-compatible, and fully testable upgrade path:
1. **PoseTracker.ts**: Updating default constraints to 60 FPS doubles temporal sampling resolution.
2. **calibration.ts**: Introducing floor marker spatial calibration enables absolute physical millimeter metrics ($\text{mm/px}$) and true gait speed ($\text{m/s}$).
3. **events.ts**: Fusing relative AP displacement with vertical ankle acceleration minima and ZUPT velocity indicators eliminates phase detection artifacts across diverse gait patterns.
4. **homography.ts**: Implementing 2D floor planar homography delivers accurate, perspective-corrected top-down step width estimation across oblique camera views.

---

## 5. Verification Method

### 5.1 Test Execution Commands
Run the full suite using vitest:
```bash
npx vitest run src/lib/gait/__tests__/PoseTracker.test.ts
npx vitest run src/lib/gait/__tests__/events.test.ts
```
When new modules are added, run:
```bash
npx vitest run src/lib/gait/__tests__/calibration.test.ts
npx vitest run src/lib/gait/__tests__/homography.test.ts
```

### 5.2 Quality Assurance Gates
- `npm run typecheck` (0 errors)
- `npm run lint` (0 errors)
- `npm run build` (successful production build)

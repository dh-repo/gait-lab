# Technical Survey & Architecture Report: R2 & R3
**Target Repository:** `gait-lab`
**Scope:** R2 (60 FPS WebRTC, Floor-Plane Marker Calibration) & R3 (Multi-Signal Heel-Strike Fusion with ZUPT, 2D Planar Homography)
**Date:** August 9, 2026

---

## 1. Executive Summary

This technical survey details the architectural design, mathematical formulations, and codebase integration plans for **Requirement 2 (R2)** and **Requirement 3 (R3)** of the `gait-lab` spatio-temporal gait analysis engine.

### Key Objectives:
1. **R2.1 — 60 FPS WebRTC Constraints (`src/lib/gait/PoseTracker.ts`)**: Upgrade MediaStream constraints to request `ideal: 60` FPS video capture, adjust default target FPS and buffer capacities, and ensure robust fallback handling for legacy devices.
2. **R2.2 — Floor-Plane Marker Calibration (mm/px)**: Implement real-world reference calibration (QR / AprilTag / reference card / known dimension marker) to convert normalized image coordinates to physical millimeters ($\text{mm/px}$), integrating spatial scaling directly into gait velocity and metric estimation.
3. **R3.1 — Multi-Signal Heel-Strike Event Fusion with ZUPT (`src/lib/gait/events.ts`)**: Upgrade single-signal AP displacement event detection to a tri-signal fused detection algorithm combining anterior-posterior foot displacement extrema, vertical ankle impact acceleration minima ($\ddot{y}_{\text{ankle}}$), and Zero-Velocity Updates (ZUPT).
4. **R3.2 — 2D Floor Planar Homography Transformation**: Implement a $3 \times 3$ homography matrix transformation $H$ mapping image coordinates $(x, y)$ to physical top-down floor plane coordinates $(X, Y)$ via Direct Linear Transform (DLT) for accurate step width estimation across oblique camera angles.

---

## 2. Section 1: R2.1 — 60 FPS WebRTC Constraints (`src/lib/gait/PoseTracker.ts`)

### 2.1 Codebase Audit (`PoseTracker.ts`)
In `src/lib/gait/PoseTracker.ts`:
* **Constructor (lines 107–110)**: Currently defaults `targetFps` to 30 and `maxBufferFrames` to 900:
  ```ts
  constructor(targetFps = 30, maxBufferFrames = 900) {
    this.targetIntervalMs = 1000 / targetFps;
    this.maxBufferFrames = maxBufferFrames;
  }
  ```
* **WebRTC Constraints Construction (lines 144–156)**:
  ```ts
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
* **Issues & Gaps Identified**:
  1. When options are omitted, `requestedTargetFps` resolves to `30`, requesting `{ ideal: 30, max: 60 }` instead of `{ ideal: 60, max: 60 }`.
  2. At 60 FPS, a 900-frame rolling buffer holds only 15 seconds of video. For standard 30-second gait capture protocols, `maxBufferFrames` must default to 1800 frames.

### 2.2 Detailed Modification Plan
1. **Default Framerate & Buffer Upgrade**:
   * Change constructor defaults in `PoseTracker.ts`:
     ```ts
     constructor(targetFps = 60, maxBufferFrames = 1800) {
       this.targetIntervalMs = 1000 / targetFps;
       this.maxBufferFrames = maxBufferFrames;
     }
     ```
   * Update fallback in `startWebcam`:
     ```ts
     const requestedTargetFps = options.targetFps ?? 60;
     ```
   * Explicitly set WebRTC video constraints:
     ```ts
     frameRate: { ideal: 60, max: 60 }
     ```
2. **Overconstrained Error Fallback Strategy**:
   * Maintain the existing retry block (lines 166–176). If a camera device rejects 60 FPS / HD constraints with an `OverconstrainedError`, `PoseTracker` gracefully retries basic `{ video: true, audio: false }` constraints.
   * `this.effectiveFps` dynamically measures actual frame intervals, ensuring downstream signal processing (Butterworth filtering and numerical differentiation) uses the real effective FPS regardless of hardware limitations.
3. **UI Component Alignment**:
   * Ensure components instantiating `PoseTracker` (e.g., `GaitApp.tsx`, `WebcamCapture.tsx`) use the updated default or pass `{ targetFps: 60 }`.

---

## 3. Section 2: R2.2 — Real-World Floor-Plane Marker Calibration (mm/px)

### 3.1 Physics & Geometric Rationale
MediaPipe Pose outputs normalized coordinates $(x, y) \in [0, 1] \times [0, 1]$. To compute physical spatial gait metrics—such as Gait Speed ($m/s$), Step Width ($mm$), and Stride Length ($m$)—without relying on uncalibrated torso height approximations, image scale $S_{\text{mm/px}}$ ($\text{mm/pixel}$) must be established.

### 3.2 Calibration Mathematical Formulation
Given a known calibration object on the floor (e.g., QR code, AprilTag, reference card, or 200 mm checkerboard square):
1. Let $D_{\text{real\_mm}}$ be the known physical dimension of the marker (e.g. $200\text{ mm}$ or $85.6\text{ mm}$ for a card).
2. Let $(x_1, y_1)$ and $(x_2, y_2)$ be the detected endpoints of the reference marker in normalized image coordinates on an image of resolution $W \times H$.
3. Pixel distance:
   $$D_{\text{px}} = \sqrt{\left((x_2 - x_1) \cdot W\right)^2 + \left((y_2 - y_1) \cdot H\right)^2}$$
4. Calibration scale factor $S_{\text{mm/px}}$:
   $$S_{\text{mm/px}} = \frac{D_{\text{real\_mm}}}{D_{\text{px}}} \quad (\text{mm/pixel})$$

### 3.3 Data Structures & Type Definition
Add `CalibrationData` interface to `src/lib/gait/types.ts`:
```ts
export interface CalibrationData {
  type: "marker" | "card" | "manual_scale" | "homography";
  mmPerPixel: number;        // e.g. 1.25 mm/px
  imageWidth: number;        // e.g. 1280
  imageHeight: number;       // e.g. 720
  markerSizeMm?: number;     // e.g. 200 mm
  refPointsPx?: Array<{ x: number; y: number }>;
  homographyMatrix?: number[][]; // 3x3 homography matrix H
}
```
Update `GaitMetrics` interface in `types.ts` to include:
```ts
calibration?: CalibrationData;
gaitSpeedMps?: number | null; // Speed in meters per second
meanStepWidthMm?: number | null; // Step width in millimeters
meanStrideLengthM?: number | null; // Stride length in meters
```

### 3.4 Metric Calculation Integration (`analysis.ts`)
* Calculate gait speed ($m/s$):
  $$\text{Speed (m/s)} = \frac{\text{Total Hip Travel (px)} \cdot S_{\text{mm/px}}}{1000 \cdot \text{Duration (s)}}$$
* Calculate physical stride length ($m$) and step width ($mm$).
* Fallback: When no calibration marker is specified (`calibration` is undefined), spatial metrics fall back to `torsoHeight` normalized units.

---

## 4. Section 3: R3.1 — Multi-Signal Heel-Strike Event Fusion with ZUPT (`src/lib/gait/events.ts`)

### 4.1 Limitations of Current Single-Signal Detection
In `src/lib/gait/events.ts`, `detectGaitEventsZeni` relies solely on 1D low-pass filtered Anterior-Posterior (AP) relative foot displacement:
$$x_{\text{rel\_heel}}(t) = x_{\text{heel}}(t) - x_{\text{hip}}(t)$$
While effective for steady, linear walking, AP displacement extrema alone can degrade during:
* Parkinsonian shuffling or micro-steps (low AP prominence).
* Variable walking speeds and acceleration/deceleration transitions.
* Foot crossover or partial limb occlusion.

### 4.2 Tri-Signal Fusion Formulation
To achieve state-of-the-art precision, event detection will fuse three distinct biomechanical signals for Heel Strike (Initial Contact):

1. **Signal 1: AP Relative Displacement Score ($S_{\text{AP}}$)**
   * Relative AP position $x_{\text{rel\_heel}}(t) = (x_{\text{heel}}(t) - x_{\text{hip}}(t)) \cdot \text{direction}$.
   * Filtered via 4th-order zero-phase Butterworth filter at $f_c = 6.0\text{ Hz}$.
   * Normalized to $[0, 1]$:
     $$\hat{S}_{\text{AP}}(t) = \frac{x_{\text{rel\_heel}}(t) - \min(x_{\text{rel\_heel}})}{\max(x_{\text{rel\_heel}}) - \min(x_{\text{rel\_heel}})}$$

2. **Signal 2: Vertical Ankle Acceleration Minima Score ($S_{\text{V-Acc}}$)**
   * Vertical ankle trajectory $y_{\text{ankle}}(t)$ (where $+y$ points downward in image space).
   * First derivative (vertical velocity): $v_y(t) = \frac{d}{dt} y_{\text{ankle}}(t)$ (Butterworth filtered).
   * Second derivative (vertical acceleration): $a_y(t) = \frac{d}{dt} v_y(t)$.
   * At heel contact with the floor, downward foot velocity rapidly drops to zero, producing a sharp impact deceleration spike ($\min a_y(t)$ or peak upward acceleration).
   * Normalized inverted acceleration score:
     $$\hat{S}_{\text{V-Acc}}(t) = \frac{-a_y(t) - \min(-a_y)}{\max(-a_y) - \min(-a_y)}$$

3. **Signal 3: Zero-Velocity Update (ZUPT) Stance Onset Score ($S_{\text{ZUPT}}$)**
   * Total 2D foot velocity magnitude:
     $$v_{\text{foot}}(t) = \sqrt{\left(\frac{d x_{\text{heel}}}{dt}\right)^2 + \left(\frac{d y_{\text{heel}}}{dt}\right)^2}$$
   * Stance onset / Initial Contact is characterized by foot velocity dropping to near zero.
   * Gaussian ZUPT likelihood score:
     $$\hat{S}_{\text{ZUPT}}(t) = \exp\left(-\frac{v_{\text{foot}}(t)^2}{2 \sigma_v^2}\right)$$
     where $\sigma_v = 0.05 \cdot \text{max}(v_{\text{foot}})$.

4. **Composite Fused Event Score ($F_{\text{HS}}$)**
   * Weighted sum of normalized score maps:
     $$F_{\text{HS}}(t) = w_{\text{AP}} \cdot \hat{S}_{\text{AP}}(t) + w_{\text{V-Acc}} \cdot \hat{S}_{\text{V-Acc}}(t) + w_{\text{ZUPT}} \cdot \hat{S}_{\text{ZUPT}}(t)$$
   * Default weights: $w_{\text{AP}} = 0.45$, $w_{\text{V-Acc}} = 0.35$, $w_{\text{ZUPT}} = 0.20$.
   * Heel strike candidates are identified by local maxima in $F_{\text{HS}}(t)$ with minimum frame gap constraints ($\text{minGap} = \lfloor 0.35 \cdot \text{fps} \rfloor$).
   * Discrete peak frame indices are passed to `refinePeakTimestamp` for parabolic subframe timestamp refinement (< 3 ms precision).

---

## 5. Section 4: R3.2 — 2D Floor Planar Homography Transformation

### 5.1 Perspective Distortion in Oblique Camera Views
When capturing gait from oblique or perspective camera angles, 2D image distances compress with depth ($1/z$ foreshortening). Measuring step width directly in 2D image space distorts true step width when the subject moves towards, away from, or at an angle relative to the camera.

### 5.2 Homography Transformation Formulation ($H$)
A $3 \times 3$ planar homography matrix $H$ maps homogeneous image coordinates $\mathbf{p} = [x, y, 1]^T$ to physical top-down floor plane coordinates $\mathbf{P} = [X, Y, 1]^T$:

$$\begin{bmatrix} X' \\ Y' \\ W' \end{bmatrix} = H \begin{bmatrix} x \\ y \\ 1 \end{bmatrix} = \begin{bmatrix} h_{11} & h_{12} & h_{13} \\ h_{21} & h_{22} & h_{23} \\ h_{31} & h_{32} & h_{33} \end{bmatrix} \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$$

De-homogenized floor coordinates:
$$X = \frac{X'}{W'} = \frac{h_{11} x + h_{12} y + h_{13}}{h_{31} x + h_{32} y + h_{33}}, \quad Y = \frac{Y'}{W'} = \frac{h_{21} x + h_{22} y + h_{23}}{h_{31} x + h_{32} y + h_{33}}$$

### 5.3 Direct Linear Transform (DLT) Algorithm
Given 4 non-collinear point correspondences $(x_i, y_i) \leftrightarrow (X_i, Y_i)$ for $i = 1, 2, 3, 4$:
Each point correspondence yields 2 linear constraints:
$$x_i h_{11} + y_i h_{12} + h_{13} - X_i x_i h_{31} - X_i y_i h_{32} - X_i h_{33} = 0$$
$$x_i h_{21} + y_i h_{22} + h_{23} - Y_i x_i h_{31} - Y_i y_i h_{32} - Y_i h_{33} = 0$$

Setting $h_{33} = 1$ yields an $8 \times 8$ linear system $A_{8 \times 8} \mathbf{h}_{1..8} = \mathbf{b}$:
$$\mathbf{h} = A^{-1} \mathbf{b}$$
Solved via Gaussian elimination with partial pivoting in pure TypeScript (`src/lib/gait/homography.ts`).

### 5.4 Step Width Calculation via Projected Floor Coordinates
1. For left foot ankle/heel $(x_L, y_L)$ and right foot ankle/heel $(x_R, y_R)$ at stance/heel-strike:
   $$\text{Left Floor Point}: (X_L, Y_L) = \text{projectPoint}(H, x_L, y_L)$$
   $$\text{Right Floor Point}: (X_R, Y_R) = \text{projectPoint}(H, x_R, y_R)$$
2. Walking direction vector on the floor plane:
   $$\mathbf{v}_{\text{walk}} = (\Delta X_{\text{walk}}, \Delta Y_{\text{walk}})$$
   $$\hat{\mathbf{v}}_{\text{walk}} = \frac{\mathbf{v}_{\text{walk}}}{\|\mathbf{v}_{\text{walk}}\|}$$
3. Transverse unit vector perpendicular to walking progress:
   $$\hat{\mathbf{n}}_{\text{transverse}} = (-\hat{v}_Y, \hat{v}_X)$$
4. Transverse Step Width:
   $$\text{Step Width}_{\text{homography}} = \left| (X_L - X_R) \cdot \hat{n}_X + (Y_L - Y_R) \cdot \hat{n}_Y \right|$$
This metric is completely invariant to camera angle, tilt, or perspective foreshortening.

---

## 6. Section 5: Affected Files & Test Verification Strategy

### 6.1 Affected Source Files
| File Path | Requirement | Key Changes |
|-----------|-------------|-------------|
| `src/lib/gait/PoseTracker.ts` | R2.1 | Set default `targetFps = 60`, `maxBufferFrames = 1800`, `frameRate: { ideal: 60, max: 60 }`. |
| `src/lib/gait/types.ts` | R2.2 & R3.2 | Add `CalibrationData` interface and expand `GaitMetrics` with spatial & homography properties. |
| `src/lib/gait/events.ts` | R3.1 | Implement tri-signal fusion function `detectGaitEventsFused` combining AP displacement, vertical ankle acceleration minima, and ZUPT. |
| `src/lib/gait/homography.ts` | R3.2 | New module implementing 3x3 Homography DLT solver (`solveHomography`), 2D projection (`projectPoint`), and step width computation. |
| `src/lib/gait/calibration.ts` | R2.2 | New module implementing marker pixel-to-mm scale computation and physical distance scaling. |
| `src/lib/gait/analysis.ts` | R2.2 & R3.2 | Integrate calibration scale and homography projection into metric calculation pipeline. |

### 6.2 Unit & Integration Test Strategy
1. `src/lib/gait/__tests__/PoseTracker.test.ts`: Verify 60 FPS initialization, 1800 frame buffer limit, and overconstrained error fallback.
2. `src/lib/gait/__tests__/events.test.ts`: Verify multi-signal fusion heel-strike accuracy on synthetic walking frames (normal, shuffling, asymmetric).
3. `src/lib/gait/__tests__/homography.test.ts`: New unit tests verifying 4-point DLT matrix calculation, point projection accuracy, and step width calculation under perspective distortion.
4. `src/lib/gait/__tests__/calibration.test.ts`: New unit tests verifying pixel-to-mm scale factor and physical speed ($m/s$) estimation.

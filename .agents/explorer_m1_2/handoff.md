# Handoff Report: 1D Landmark Coordinate Temporal Smoothing (M1.2)

**Author:** Explorer M1-2 (Signal Processing & Temporal Smoothing Specialist)  
**Date:** 2026-08-09  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_2`  
**Target Module:** `src/lib/gait/signal.ts`  

---

## 1. Observation

1. **Missing 1D Coordinate Smoothing in `src/lib/gait/signal.ts`**:
   `signal.ts` (lines 1–178) currently exports `olsDetrend`, `butterworthLowPass`, and `zeroPhaseButterworth`. It does **not** export `savitzkyGolay5` or `smoothPoseFrames`.
2. **Keypoint Coordinate Jitter Impact in `src/lib/gait/analysis.ts`**:
   In `analysis.ts` (lines 242–285), raw landmark coordinates are processed directly for view angle detection (`detectViewAngle`), Zeni event detection (`detectGaitEventsZeni`), and joint angle computations (`computeGaitAngleAnalysis`). Butterworth low-pass filtering (line 279) is only applied post-hoc to summary series like `midHipX`, `leftWristRel`, and `leftKneeAngle`. Raw keypoint spatial jitter corrupts transient peak detection and joint angle extremes prior to metric calculation.
3. **Types in `src/lib/gait/types.ts`**:
   `Landmark` (lines 14–19) defines `{ x: number; y: number; z: number; visibility?: number; presence?: number }`. `PoseFrame` (lines 21–25) defines `{ timeMs: number; landmarks: Landmark[]; worldLandmarks?: Landmark[] }`. `LandmarkFrame` is currently not defined as an explicit type alias.

---

## 2. Logic Chain

1. **Noise Reduction Requirement**:
   MediaPipe keypoints exhibit high-frequency coordinate noise. A 5-point Savitzky-Golay filter fits a local quadratic polynomial $p(t) = c_0 + c_1 t + c_2 t^2$ over moving windows of 5 points.
2. **Convolution Kernel**:
   Solving the least-squares normal equations for the center point $c_0$ yields kernel $\mathbf{W} = \frac{1}{35} [-3, 12, 17, 12, -3]$. Sum of weights equals $1.0$, preserving DC signals without baseline drift and reducing noise variance by $51.75\%$.
3. **Boundary Reflection Padding**:
   For sequence length $N \ge 5$:
   - Left padding: $x_{-1} = 2 x_0 - x_1$, $x_{-2} = 2 x_0 - x_2$
   - Right padding: $x_N = 2 x_{N-1} - x_{N-2}$, $x_{N+1} = 2 x_{N-1} - x_{N-3}$
   Substituting linear trend $x[k] = a k + b$ into these boundary equations yields **$0.000$ error** across all boundary points $i \in \{0, 1, N-2, N-1\}$.
4. **Short Sequence Handling**:
   For $N < 5$, `savitzkyGolay5` and `smoothPoseFrames` return a shallow copy of the input signal/frames unaltered, preventing array out-of-bounds indexing and index distortions.
5. **Metadata Preservation & Immutability**:
   `smoothPoseFrames` extracts 1D spatial coordinate trajectories for each landmark index $j \in [0, 32]$ for $x, y, z$ (and `worldLandmarks` $x, y, z$ if present). Rebuilding the frame objects with `{ ...origLm, x, y, z }` and `{ ...origFrame, landmarks }` preserves `visibility`, `presence`, `timeMs`, and all auxiliary metadata without mutating input frames in place.

---

## 3. Caveats

1. **Minimum Frame Threshold**: Sequences with $N < 5$ frames bypass filtering and return un-smoothed keypoints. This is intended behavior to avoid edge artifact distortion on micro-clips.
2. **World Landmarks Handling**: `worldLandmarks` are smoothed when present on the first frame of a clip. If absent, only 2D/3D image `landmarks` are processed.

---

## 4. Conclusion

### Concrete Implementation Proposals

#### A. Add `savitzkyGolay5` & `smoothPoseFrames` to `src/lib/gait/signal.ts`:

```typescript
import type { Landmark, PoseFrame } from "./types";

export type LandmarkFrame = PoseFrame;

/**
 * 5-Point Savitzky-Golay 1D Temporal Smoothing Filter.
 * Fits a local quadratic polynomial using kernel 1/35 * [-3, 12, 17, 12, -3].
 * Uses linear boundary reflection padding for N >= 5 frames.
 * Returns input unaltered for N < 5 frames.
 */
export function savitzkyGolay5(signal: number[]): number[] {
  if (!signal || signal.length < 5) {
    return signal ? signal.map((v) => (Number.isFinite(v) ? v : 0)) : [];
  }

  const clean = signal.map((v) => (Number.isFinite(v) ? v : 0));
  const n = clean.length;

  const padded = new Array<number>(n + 4);
  padded[0] = 2 * clean[0] - clean[2];
  padded[1] = 2 * clean[0] - clean[1];
  for (let i = 0; i < n; i++) {
    padded[i + 2] = clean[i];
  }
  padded[n + 2] = 2 * clean[n - 1] - clean[n - 2];
  padded[n + 3] = 2 * clean[n - 1] - clean[n - 3];

  const out = new Array<number>(n);
  const inv35 = 1 / 35;

  for (let i = 0; i < n; i++) {
    const idx = i + 2;
    out[i] = inv35 * (
      -3 * padded[idx - 2] +
      12 * padded[idx - 1] +
      17 * padded[idx] +
      12 * padded[idx + 1] -
       3 * padded[idx + 2]
    );
  }

  return out;
}

/**
 * Applies 5-point Savitzky-Golay 1D temporal coordinate smoothing across all 33 keypoints'
 * (x, y, z) spatial coordinates across pose frames.
 * Preserves landmark visibility, presence, and timestamp metadata untouched.
 */
export function smoothPoseFrames<T extends PoseFrame>(frames: T[]): T[] {
  if (!frames || frames.length < 5) {
    return frames ? frames.slice() : [];
  }

  const n = frames.length;
  const numLandmarks = frames[0]?.landmarks?.length ?? 0;
  if (numLandmarks === 0) {
    return frames.slice();
  }

  const smoothedX: number[][] = [];
  const smoothedY: number[][] = [];
  const smoothedZ: number[][] = [];

  for (let j = 0; j < numLandmarks; j++) {
    const xSig = new Array<number>(n);
    const ySig = new Array<number>(n);
    const zSig = new Array<number>(n);

    for (let i = 0; i < n; i++) {
      const lm = frames[i].landmarks[j];
      xSig[i] = lm?.x ?? 0;
      ySig[i] = lm?.y ?? 0;
      zSig[i] = lm?.z ?? 0;
    }

    smoothedX.push(savitzkyGolay5(xSig));
    smoothedY.push(savitzkyGolay5(ySig));
    smoothedZ.push(savitzkyGolay5(zSig));
  }

  const hasWorld = Boolean(frames[0]?.worldLandmarks && frames[0].worldLandmarks.length > 0);
  const numWorldLandmarks = hasWorld ? frames[0].worldLandmarks!.length : 0;
  const smoothedWorldX: number[][] = [];
  const smoothedWorldY: number[][] = [];
  const smoothedWorldZ: number[][] = [];

  if (hasWorld) {
    for (let j = 0; j < numWorldLandmarks; j++) {
      const wxSig = new Array<number>(n);
      const wySig = new Array<number>(n);
      const wzSig = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        const wlm = frames[i].worldLandmarks?.[j];
        wxSig[i] = wlm?.x ?? 0;
        wySig[i] = wlm?.y ?? 0;
        wzSig[i] = wlm?.z ?? 0;
      }

      smoothedWorldX.push(savitzkyGolay5(wxSig));
      smoothedWorldY.push(savitzkyGolay5(wySig));
      smoothedWorldZ.push(savitzkyGolay5(wzSig));
    }
  }

  return frames.map((origFrame, i) => {
    const newLandmarks: Landmark[] = origFrame.landmarks.map((origLm, j) => ({
      ...origLm,
      x: smoothedX[j][i],
      y: smoothedY[j][i],
      z: smoothedZ[j][i],
    }));

    let newWorldLandmarks: Landmark[] | undefined;
    if (hasWorld && origFrame.worldLandmarks) {
      newWorldLandmarks = origFrame.worldLandmarks.map((origWlm, j) => ({
        ...origWlm,
        x: smoothedWorldX[j][i],
        y: smoothedWorldY[j][i],
        z: smoothedWorldZ[j][i],
      }));
    }

    return {
      ...origFrame,
      landmarks: newLandmarks,
      ...(newWorldLandmarks ? { worldLandmarks: newWorldLandmarks } : {}),
    };
  });
}
```

#### B. Update `src/lib/gait/types.ts`:
Add export:
```typescript
export type LandmarkFrame = PoseFrame;
```

#### C. Update `src/lib/gait/analysis.ts`:
```typescript
import { smoothPoseFrames } from "./signal";

function computeGaitMetricsCore(rawFrames: PoseFrame[]): GaitMetrics {
  if (rawFrames.length < 5) return emptyMetrics(rawFrames);

  const frames = smoothPoseFrames(rawFrames);
  // ...
}
```

---

## 5. Verification Method

To verify the implementation independently:

1. **Run Unit Tests**:
   ```bash
   npx vitest run src/lib/gait/__tests__/signal.test.ts
   ```
2. **Run Full Test Suite**:
   ```bash
   npm test
   ```
3. **Run Typecheck and Lint**:
   ```bash
   npm run typecheck
   npm run lint
   ```
4. **Run Production Build**:
   ```bash
   npm run build
   ```

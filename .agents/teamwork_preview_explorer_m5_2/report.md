# Technical Analysis and Test Design Specification

**Target Modules:** `src/lib/gait/homography.ts` and `src/lib/gait/liveCapture.ts`  
**Agent ID:** `teamwork_preview_explorer_m5_2`  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m5_2`  
**Date:** 2026-08-10  

---

## 1. Executive Summary

This report delivers a deep technical analysis and comprehensive test design specification for two core modules in the `gait-lab` spatio-temporal gait analysis engine:
1. **`src/lib/gait/homography.ts`**: Provides 2D floor planar homography transformations, Direct Linear Transform (DLT) matrix estimation, Gaussian elimination with partial pivoting for $8 \times 8$ linear systems, perspective-to-floor projective mapping, and fallback handling for singular/degenerate point configurations.
2. **`src/lib/gait/liveCapture.ts`**: Provides real-time camera stream buffer calculations, wall-clock time span tracking, continuous pose frame sub-sequence extraction (gating out out-of-frame gaps $> 0.35\text{ s}$), and environment-aware camera facing mode selection (`"user"` vs `"environment"`) with SSR/jsdom safety guards.

Both modules are essential for clinical spatial accuracy (oblique perspective step width correction) and robust WebRTC stream intake. Neither module currently has a dedicated unit test suite under `src/lib/gait/__tests__/` (only high-level end-to-end assertions in `e2e_gait_engine_tiers.test.ts` and UI continuity tests in `src/components/gait/__tests__/LiveCaptureContinuity.test.tsx` exist).

This document details the mathematical algorithms, implementation structures, edge cases, Vitest node/jsdom environment mocking requirements, and concrete test suite specifications for `homography.test.ts` and `liveCapture.test.ts`.

---

## 2. Technical Analysis: `src/lib/gait/homography.ts`

### 2.1 Architectural Purpose & Mathematical Foundations
In markerless video-based gait analysis, camera setups are frequently oblique rather than orthogonal to the walking track. Oblique camera angles distort step width, stride length, and foot displacement due to perspective contraction (objects further away appear smaller and lines converge). 

To map 2D camera pixel coordinates $(x, y)$ onto absolute top-down floor plane coordinates $(X, Y)$, the engine uses a 2D-to-2D planar homography $H \in \mathbb{R}^{3 \times 3}$:

$$\begin{bmatrix} x' \\ y' \\ w' \end{bmatrix} = H \begin{bmatrix} x \\ y \\ 1 \end{bmatrix} = \begin{bmatrix} h_{00} & h_{01} & h_{02} \\ h_{10} & h_{11} & h_{12} \\ h_{20} & h_{21} & h_{22} \end{bmatrix} \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$$

$$\text{Projected Floor Coordinates:} \quad X = \frac{x'}{w'}, \quad Y = \frac{y'}{w'}$$

Because homography is defined up to a scale factor (8 degrees of freedom), $h_{22}$ is fixed to $1.0$. Estimating $H$ requires at least 4 non-collinear corresponding point pairs $(x_i, y_i) \leftrightarrow (X_i, Y_i)$ ($i = 1, 2, 3, 4$).

---

### 2.2 Detailed Function Analysis & Code Walkthrough

#### 1. Helper `toPoint2D(p: Point2D | [number, number]): Point2D` (Lines 12–17)
- **Signature:** `toPoint2D(p: Point2D | [number, number]): Point2D`
- **Behavior:** Normalizes input points into object format `{ x: number, y: number }`. Accepts either a tuple `[x, y]` or an object `{ x, y }`.
- **Edge Case:** Array check `Array.isArray(p)` handles raw tuple inputs safely.

#### 2. `solveLinearSystem8x8(A: number[][], b: number[]): number[] | null` (Lines 22–59)
- **Signature:** `solveLinearSystem8x8(A: number[][], b: number[]): number[] | null`
- **Algorithm:** Direct solver for an $8 \times 8$ system $A \cdot x = b$ using **Gaussian elimination with partial pivoting** followed by back substitution.
- **Detailed Mechanics:**
  1. Creates an augmented matrix $M \in \mathbb{R}^{8 \times 9}$ by appending vector $b$ to $A$: $M[i] = [\dots A[i], b[i]]$.
  2. Outer loop $i = 0 \dots 7$:
     - **Partial Pivoting:** Scans down column $i$ from row $i$ to row $7$ to find `maxRow` where $|M[k][i]|$ is maximized.
     - **Singularity Check:** If $|M[\text{maxRow}][i]| < 1\text{e-}9$, the matrix is rank-deficient/singular (or near-singular). Immediately returns `null`.
     - **Row Swap:** Swaps row $i$ and `maxRow`.
     - **Forward Elimination:** For rows $k = i+1 \dots 7$, computes factor $c = -M[k][i] / M[i][i]$. Updates row $k$: $M[k][j] += c \cdot M[i][j]$ for $j > i$, and explicitly zero out $M[k][i]$.
  3. **Back Substitution:** Initializes solution vector $x \in \mathbb{R}^8$. Iterates backwards $i = 7 \dots 0$:
     $$x[i] = \frac{M[i][8]}{M[i][i]}$$
     Subtracts $M[k][i] \cdot x[i]$ from $M[k][8]$ for all $k < i$.
- **Return:** 8-element array `x` representing $[h_0, h_1, h_2, h_3, h_4, h_5, h_6, h_7]$, or `null` if singular.

#### 3. `computeHomographyMatrix(...)` (Lines 65–134)
- **Signature:** `computeHomographyMatrix(imagePointsRaw: (Point2D | [number, number])[], floorPointsRaw: (Point2D | [number, number])[]): HomographyMatrix`
- **Algorithm:** Direct Linear Transform (DLT) mapping 4 image points to 4 floor points.
- **Detailed Mechanics:**
  1. **Input Validation:** If `!imagePointsRaw`, `!floorPointsRaw`, or either array has fewer than 4 points (`length < 4`), returns fallback 3x3 Identity Matrix:
     $$\begin{bmatrix} 1 & 0 & 0 \\ 0 & 1 & 0 \\ 0 & 0 & 1 \end{bmatrix}$$
  2. **Collinearity / Triangle Area Check:** Computes doubled area of the triangle formed by the first 3 image points $(p_0, p_1, p_2)$:
     $$\text{triArea} = |(p_1.x - p_0.x)(p_2.y - p_0.y) - (p_2.x - p_0.x)(p_1.y - p_0.y)|$$
     If $\text{triArea} < 1\text{e-}7$, points are collinear or degenerate. Immediately returns the 3x3 Identity Matrix fallback.
  3. **DLT System Construction:** For the first 4 corresponding point pairs $(x_i, y_i) \to (X_i, Y_i)$, sets up 2 linear equations per pair (8 equations total):
     $$\begin{aligned}
     -x_i \cdot h_0 - y_i \cdot h_1 - 1 \cdot h_2 + 0 \cdot h_3 + 0 \cdot h_4 + 0 \cdot h_5 + x_i X_i \cdot h_6 + y_i X_i \cdot h_7 &= -X_i \\
     0 \cdot h_0 + 0 \cdot h_1 + 0 \cdot h_2 - x_i \cdot h_3 - y_i \cdot h_4 - 1 \cdot h_5 + x_i Y_i \cdot h_6 + y_i Y_i \cdot h_7 &= -Y_i
     \end{aligned}$$
  4. Calls `solveLinearSystem8x8(A, b)`. If solver returns `null`, returns Identity Matrix fallback.
  5. Assembles and returns $3 \times 3$ Homography Matrix:
     $$H = \begin{bmatrix} h_0 & h_1 & h_2 \\ h_3 & h_4 & h_5 \\ h_6 & h_7 & 1.0 \end{bmatrix}$$

#### 4. `transformPoint(pointRaw, H)` (Lines 139–156)
- **Signature:** `transformPoint(pointRaw: Point2D | [number, number], H: HomographyMatrix): Point2D`
- **Algorithm:** Matrix-vector multiplication followed by projective division:
  $$x' = H_{00} x + H_{01} y + H_{02}, \quad y' = H_{10} x + H_{11} y + H_{12}, \quad w' = H_{20} x + H_{21} y + H_{22}$$
- **Horizon & Zero-Division Guard:**
  $$w = \begin{cases} w' & \text{if } |w'| > 1\text{e-}9 \\ 1.0 & \text{otherwise (fallback for points on horizon plane)} \end{cases}$$
- **Return:** `{ x: x' / w, y: y' / w }`.

#### 5. `projectToFloorPlane(pointRaw, matrix)` (Lines 161–167)
- **Signature:** `projectToFloorPlane(pointRaw: [number, number] | Point2D, matrix: HomographyMatrix): [number, number]`
- **Behavior:** Convenience wrapper around `transformPoint` returning `[x, y]` tuple format.

---

### 2.3 Comprehensive Edge Cases & Mathematical Vulnerabilities

| Edge Case / Condition | Module Handling | Risk / Impact if Untested |
|---|---|---|
| **Identity Point Mapping** | Same points for source and target | Must output identity matrix $H=I_3$ exactly |
| **Pure Translation/Scale** | Linear shift $(x+dx, y+dy)$ or scaling $(sx, sy)$ | Matrix must match $[[s, 0, dx],[0, s, dy],[0, 0, 1]]$ |
| **Collinear Image Points** | 3 or 4 points on line $y = mx + c$ ($\text{triArea} < 1\text{e-}7$) | Trigger identity matrix fallback (prevents division by zero or NaN matrix) |
| **Singular DLT Matrix** | Linearly dependent point combinations | `solveLinearSystem8x8` returns `null` $\to$ `computeHomographyMatrix` returns $I_3$ |
| **Horizon / Zero Homogeneous Scale** | $w' = H_{20}x + H_{21}y + H_{22} \approx 0$ | $w$ guarded by $1\text{e-}9 \implies$ falls back to $w=1.0$, preventing `Infinity` / `NaN` |
| **Fewer than 4 points** | Array length 0, 1, 2, 3, or `null`/`undefined` | Input validation guard returns identity matrix $I_3$ |
| **Tuple vs Object inputs** | `[x, y]` vs `{ x, y }` | `toPoint2D` handles both seamlessly |
| **Matrix Pivot Swapping Needed** | Diagonal element zero, requiring row swap | Verifies partial pivoting in `solveLinearSystem8x8` |

---

## 3. Technical Analysis: `src/lib/gait/liveCapture.ts`

### 3.1 Architectural Purpose & Stream Lifecycle
In real-time gait analysis using WebRTC / MediaDevices webcam capture:
- Frames arrive asynchronously at variable frame rates (typically 30–60 FPS).
- Subjects often walk into the frame, perform a pass, turn around, or exit the frame.
- Naive calculation of frame buffer duration using $(t_{\text{last}} - t_{\text{first}})$ causes severe metrics corruption if a subject steps out of frame for 20 seconds and returns. The naive span would register 20+ seconds despite having only 1 second of actual walking data.
- Interpolating missing frames over large gaps (e.g. Catmull-Rom or cubic spline resampling) fabricates non-existent motion.

`liveCapture.ts` isolates continuous sub-sequences of frames where inter-frame gaps do not exceed $0.35\text{ s}$ ($350\text{ ms}$) and determines camera facing defaults based on client capabilities.

---

### 3.2 Detailed Function Analysis & Code Walkthrough

#### 1. `bufferedSpanSec(frames: PoseFrame[]): number` (Lines 4–7)
- **Signature:** `bufferedSpanSec(frames: PoseFrame[]): number`
- **Behavior:** Calculates total wall-clock time span covered by the buffer in seconds.
- **Formula:** 
  $$\text{Span} = \begin{cases} 0 & \text{if } \text{frames.length} < 2 \\ \frac{\text{frames}[\text{last}].\text{timeMs} - \text{frames}[0].\text{timeMs}}{1000} & \text{otherwise} \end{cases}$$
- **Edge Cases:** Returns `0` for empty array `[]` or single-frame array `[f0]`.

#### 2. `longestContinuousRun(frames: PoseFrame[]): PoseFrame[]` (Lines 25–45)
- **Signature:** `longestContinuousRun(frames: PoseFrame[]): PoseFrame[]`
- **Constant:** `MAX_LIVE_GAP_SEC = 0.35` ($350\text{ ms}$)
- **Algorithm:**
  1. Guard: If `frames.length < 2`, returns `frames.slice()`.
  2. Main Loop: Traverses `i = 1 \dots \text{frames.length} - 1`.
  3. Computes gap: $\text{gapSec} = (\text{frames}[i].\text{timeMs} - \text{frames}[i-1].\text{timeMs}) / 1000$.
  4. If $\text{gapSec} > 0.35$:
     - Checks if current run length $(i - 1 - \text{runStart})$ is **strictly greater** than previous best run length $(\text{bestEnd} - \text{bestStart})$.
     - If strictly greater, updates `bestStart = runStart` and `bestEnd = i - 1`.
     - Resets `runStart = i`.
  5. Post-loop Check: Evaluates final run segment $(\text{frames.length} - 1 - \text{runStart})$. If strictly greater than best, updates `bestStart` and `bestEnd`.
  6. Returns `frames.slice(bestStart, bestEnd + 1)`.

#### 3. `defaultFacingMode(): "user" | "environment"` (Lines 57–62)
- **Signature:** `defaultFacingMode(): "user" | "environment"`
- **Behavior:**
  - On mobile/touch devices (where coarse pointer is detected via Media Query `(pointer: coarse)`), returns `"environment"` (rear camera) because gait recording captures another person walking.
  - On desktop devices (fine pointer), returns `"user"` (front webcam).
  - On SSR / Node / environments lacking `window` or `window.matchMedia`, returns `"user"`.

---

### 3.3 Vitest Node & JSDOM Environment Mocking Strategy

In Vitest running in `node` or standard `jsdom` mode:
1. `typeof window` may be `undefined` (in pure node environment).
2. `window.matchMedia` is not implemented in jsdom by default and is `undefined`.
3. To test `defaultFacingMode`:
   - Test 1 (SSR / missing window): Delete or undefine `window.matchMedia`. Verify it returns `"user"` without throwing.
   - Test 2 (Desktop): Mock `window.matchMedia` to return `{ matches: false }` for query `(pointer: coarse)`. Verify it returns `"user"`.
   - Test 3 (Mobile / Tablet): Mock `window.matchMedia` to return `{ matches: true }` for query `(pointer: coarse)`. Verify it returns `"environment"`.

---

## 4. Test Design Specification: `homography.test.ts`

**Target File:** `src/lib/gait/__tests__/homography.test.ts`  
**Coverage Target:** 100% statement, branch, and function coverage of `src/lib/gait/homography.ts`.

```
homography.test.ts
├── solveLinearSystem8x8
│   ├── 1. Solves identity system A = I_8, b = [1..8] correctly
│   ├── 2. Solves general invertible 8x8 linear system accurately
│   ├── 3. Performs partial pivoting when diagonal elements are zero
│   ├── 4. Returns null for singular matrix with zero row/column
│   └── 5. Returns null for near-singular matrix with pivot < 1e-9
├── computeHomographyMatrix
│   ├── 1. Returns 3x3 identity matrix when image points match floor points
│   ├── 2. Computes correct matrix for translation and uniform scale
│   ├── 3. Computes correct matrix for oblique trapezoid-to-rectangle perspective transformation
│   ├── 4. Returns identity fallback matrix for < 4 image or floor points
│   ├── 5. Returns identity fallback matrix for null/undefined inputs
│   ├── 6. Returns identity fallback matrix for collinear image points (triArea < 1e-7)
│   ├── 7. Handles point inputs supplied as tuples [x, y] and objects { x, y }
│   └── 8. Returns identity fallback matrix if solveLinearSystem8x8 fails
├── transformPoint
│   ├── 1. Maps origin and unit square points under identity matrix
│   ├── 2. Applies perspective homography transformation accurately
│   ├── 3. Protects against zero/near-zero homogeneous coordinate w' (< 1e-9)
│   └── 4. Accepts both object { x, y } and tuple [x, y] inputs
└── projectToFloorPlane
    ├── 1. Returns transformed point in tuple format [x, y]
    └── 2. Matches transformPoint output coordinates exactly
```

### Detailed Test Case Specs for Homography

1. **`solveLinearSystem8x8` - Identity & Basic Inversion:**
   - Input: $A = I_8$, $b = [1, 2, 3, 4, 5, 6, 7, 8]$.
   - Assertion: Returns $[1, 2, 3, 4, 5, 6, 7, 8]$.
2. **`solveLinearSystem8x8` - Partial Pivoting Verification:**
   - Matrix $A$ with $A[0][0] = 0$ but non-zero entry at $A[1][0] = 5$.
   - Assertion: Swaps rows during Gaussian elimination and returns valid solution without division by zero.
3. **`solveLinearSystem8x8` - Singularity Handling:**
   - Matrix $A$ where row 0 equals row 1 (linearly dependent).
   - Assertion: Returns `null`.
4. **`computeHomographyMatrix` - Square to Scale/Translate:**
   - Src: $(0,0), (100,0), (100,100), (0,100)$.
   - Dst: $(10,20), (210,20), (210,220), (10,220)$ (scale = 2, shift = (10,20)).
   - Assertion: $H \approx [[2,0,10],[0,2,20],[0,0,1]]$.
5. **`computeHomographyMatrix` - Oblique Perspective Distortion:**
   - Image Trapezoid: $(100,100), (300,100), (350,300), (50,300)$.
   - Floor Rectangle: $(0,0), (1000,0), (1000,2000), (0,2000)$.
   - Assertion: $H$ transforms $(100,100) \to (0,0)$ and center $(200,200) \to$ expected projective floor point within $1\text{e-}1$ precision.
6. **`computeHomographyMatrix` - Collinear Points:**
   - Image Points on line $y = 2x$: $(10,20), (20,40), (30,60), (40,80)$.
   - Assertion: Returns exact 3x3 identity matrix `[[1,0,0],[0,1,0],[0,0,1]]`.
7. **`transformPoint` - Zero Scale Guard:**
   - Matrix $H = [[1,0,0],[0,1,0],[0,0,0]]$ where $w' = 0$.
   - Assertion: $w$ guarded to $1.0$, returns `{ x: 0, y: 0 }` without `NaN` or `Infinity`.

---

## 5. Test Design Specification: `liveCapture.test.ts`

**Target File:** `src/lib/gait/__tests__/liveCapture.test.ts`  
**Coverage Target:** 100% statement, branch, and function coverage of `src/lib/gait/liveCapture.ts`.

```
liveCapture.test.ts
├── bufferedSpanSec
│   ├── 1. Returns 0 for empty frame array []
│   ├── 2. Returns 0 for single frame array
│   ├── 3. Computes correct span in seconds for multi-frame buffer
│   └── 4. Handles sub-millisecond and non-integer timestamps accurately
├── longestContinuousRun
│   ├── 1. Returns entire array when all gaps are <= 0.35s
│   ├── 2. Tolerates normal 30 Hz / 60 Hz frame drops (e.g. 0.1s gap)
│   ├── 3. Splits buffer and extracts longest run when gap exceeds 0.35s (e.g. 0.351s or 20s gap)
│   ├── 4. Selects longer run when gaps divide buffer into unequal segments
│   ├── 5. Preserves first run when two continuous segments have equal frame counts
│   ├── 6. Treats gap of exactly 0.35s (350ms) as continuous (boundary test)
│   └── 7. Handles empty [] and single frame buffers safely
└── defaultFacingMode
    ├── 1. Returns "user" when window is undefined (SSR environment)
    ├── 2. Returns "user" when window.matchMedia is undefined or not a function
    ├── 3. Returns "user" when matchMedia("(pointer: coarse)") matches is false (Desktop)
    └── 4. Returns "environment" when matchMedia("(pointer: coarse)") matches is true (Mobile/Tablet)
```

### Detailed Test Case Specs for LiveCapture

1. **`bufferedSpanSec` - Multi-frame calculation:**
   - Frames at $t = 1000\text{ ms}, 2500\text{ ms}, 4000\text{ ms}$.
   - Assertion: Returns $(4000 - 1000)/1000 = 3.0\text{ s}$.
2. **`longestContinuousRun` - Boundary Test at 0.35s:**
   - Frame timestamps: $[0, 0.35, 0.70]\text{ s}$. Gap is exactly $0.35\text{ s}$.
   - Condition: `gapSec > 0.35` evaluates to `false`.
   - Assertion: Returns all 3 frames in a single run.
3. **`longestContinuousRun` - Split at 0.351s:**
   - Frame timestamps: $[0, 0.1, 0.2, 0.551, 0.651, 0.751]\text{ s}$. Gap is $0.351\text{ s}$.
   - Condition: `gapSec > 0.35` evaluates to `true`.
   - Assertion: Segmented into two runs of 3 frames each. Selects first segment $[0, 0.1, 0.2]$ (length 3).
4. **`longestContinuousRun` - Large Gap (Out of Frame):**
   - 10 frames at 30 FPS ($0.33\text{ s}$), then 15s gap, then 20 frames at 30 FPS ($0.66\text{ s}$).
   - Assertion: Returns the 20-frame segment.
5. **`defaultFacingMode` - Vitest Mocking Setup:**
   ```ts
   // Vitest mock snippet for defaultFacingMode
   const originalMatchMedia = window.matchMedia;

   afterEach(() => {
     window.matchMedia = originalMatchMedia;
   });

   it("returns 'environment' on touch devices", () => {
     window.matchMedia = vi.fn().mockImplementation((query: string) => ({
       matches: query.includes("pointer: coarse"),
       media: query,
       onchange: null,
       addListener: vi.fn(),
       removeListener: vi.fn(),
       addEventListener: vi.fn(),
       removeEventListener: vi.fn(),
       dispatchEvent: vi.fn(),
     }));

     expect(defaultFacingMode()).toBe("environment");
   });
   ```

---

## 6. Verification and Implementation Checklist for Milestone 5

When `src/lib/gait/__tests__/homography.test.ts` and `src/lib/gait/__tests__/liveCapture.test.ts` are implemented:

1. **Run Vitest:**
   ```bash
   npx vitest run src/lib/gait/__tests__/homography.test.ts src/lib/gait/__tests__/liveCapture.test.ts
   ```
   *Expected Output:* 100% green passing tests.

2. **TypeScript Compilation Check:**
   ```bash
   npx tsc --noEmit
   ```
   *Expected Output:* 0 errors.

3. **ESLint Verification:**
   ```bash
   npx eslint src/lib/gait/__tests__/homography.test.ts src/lib/gait/__tests__/liveCapture.test.ts
   ```
   *Expected Output:* 0 errors.

---
*Report generated by `teamwork_preview_explorer_m5_2`.*

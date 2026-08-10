# Phase 2 Engineering Survey & Design Report: R8 & R9

**Agent ID:** `teamwork_preview_explorer_survey_pass2_3`  
**Date:** 2026-08-10  
**Project Root:** `/Users/damian/GitHub/gait-lab`  
**Target Scope:** Requirement R8 (Unit Test Expansion for 5 Untested Modules) & Requirement R9 (Clinical Normative Reference Integration)

---

## 1. Executive Summary

This report provides a comprehensive technical survey and architectural design for Phase 2 Requirements R8 and R9 in `gait-lab`:
1. **R8 Unit Test Expansion:** Maps all exported functions, types, current test gaps, edge cases, and mocking strategies for the 5 untested target modules (`src/lib/gait/landmarks.ts`, `src/lib/gait/calibration.ts`, `src/lib/gait/homography.ts`, `src/lib/gait/liveCapture.ts`, and `src/lib/gait/persistence.server.ts`).
2. **R9 Clinical Normative Reference Integration:** Designs `src/lib/gait/normatives.ts`, incorporating age- and sex-stratified normative data from Winter (2009) and Bovi et al. (2011), Z-score and percentile calculations, a camera-adapted Gait Deviation Index (GDI, Schwartz & Rozumalski 2008), and integration specifications for `src/lib/gait/ratings.ts` and `src/lib/gait/guesses.ts`.

---

## 2. Requirement R8: Unit Test Coverage Mapping for 5 Untested Modules

### Module 1: `src/lib/gait/landmarks.ts`

#### Overview & Export Inventory
- **Constants:**
  - `POSE_CONNECTIONS`: `[number, number][]` (25 MediaPipe pose skeletal joint pair tuples).
  - `LM`: `const` mapping joint names (`NOSE`, `L_SHOULDER`, `R_SHOULDER`, `L_HIP`, `R_HIP`, `L_KNEE`, `R_KNEE`, `L_ANKLE`, `R_ANKLE`, `L_HEEL`, `R_HEEL`, `L_FOOT`, `R_FOOT`, etc.) to landmark index integers (0–32).
  - `PERSON_COLORS`: `string[]` (6 hex colors for multi-person rendering).
- **Exported Functions:**
  - `mid(a?: Landmark, b?: Landmark): Landmark`: Calculates 3D midpoint; defaults missing `x`,`y` to 0.5, `z` to 0; visibility is `Math.min(visA, visB)`.
  - `dist(a?: Landmark, b?: Landmark): number`: 2D Euclidean distance between landmarks `a` and `b`. Fallback to 0 for invalid inputs.
  - `angleDeg(a?: Landmark, b?: Landmark, c?: Landmark): number`: 2D interior angle in degrees at vertex `b`. Fallback to 180° for nulls, zero-length vectors (`mag < 1e-8`), or non-finite dot/mag values.
  - `torsoHeight(lm: Landmark[]): number`: Distance between shoulder midpoint (LM 11/12) and hip midpoint (LM 23/24). Returns default 0.2 if `lm.length < 25` or `h < 0.05`.
  - `boundingBox(lm: Landmark[])`: Computes bounding box `{x, y, w, h}` with `0.03` padding across landmarks with `visibility >= 0.2`. Fallback `{x: 0.4, y: 0.2, w: 0.2, h: 0.6}` for invalid/empty inputs or zero-area bounds.
  - `hipCenter(lm: Landmark[]): Landmark`: Midpoint of hips (LM 23/24). Fallback `{x: 0.5, y: 0.5, z: 0, visibility: 0.9}` if `lm.length < 25`.
  - `mean(xs: number[]): number`: Arithmetic mean ignoring non-finite numbers.
  - `std(xs: number[]): number`: Sample standard deviation ignoring non-finite numbers; returns 0 if valid count < 2.
  - `range(xs: number[]): number`: `max - min` ignoring non-finite numbers; returns 0 if empty/invalid.
  - `clamp(n: number, a: number, b: number): number`: Clamps `n` to `[a, b]`; returns `a` if `n` is non-finite.
  - `pct(n: number, digits = 0): string`: Formats ratio to percentage string; returns `"0%"` if non-finite.

#### Current Test Gaps & Edge Cases
- No dedicated `landmarks.test.ts` exists.
- Geometry function edge cases:
  - `mid`: missing/null landmark parameters, `NaN`/`Infinity` values, zero vs partial visibility.
  - `dist`: null/undefined inputs, identical coordinates, non-finite values.
  - `angleDeg`: collinear vectors (0° and 180°), right angle (90°), degenerate coincident points (`mag < 1e-8`), null inputs.
  - `torsoHeight`: array length < 25, zero/tiny torso height (<0.05 fallback to 0.2), invalid landmark indices.
  - `boundingBox`: landmarks with `visibility < 0.2` filtering, invalid/short arrays, boundary padding clamping to `[0, 1]`.
  - `hipCenter`: invalid arrays, valid arrays with custom visibilities.
  - `mean`/`std`/`range`/`clamp`/`pct`: arrays with `NaN`, `Infinity`, empty arrays, single-element arrays, extreme numeric inputs.

#### Mock & Test Requirements
- **Test File Location:** `src/lib/gait/__tests__/landmarks.test.ts`.
- **Mocks Required:** None (pure math/landmark functions). Synthetic `Landmark` factory helpers needed.

---

### Module 2: `src/lib/gait/calibration.ts`

#### Overview & Export Inventory
- **Exported Types:**
  - `MarkerType`: `"card" | "qr" | "apriltag" | "custom" | (string & {})`
  - `CalibrationResult`: `{ mmPerPx: number; markerType: MarkerType; knownLengthMm: number; markerPixels: number }`
- **Exported Functions:**
  - `calculateMillimetersPerPixel(markerType: MarkerType | string, pixelDimensions: { width: number; height: number }): number`:
    Computes scale factor using physical reference width (Card = 85.6mm, QR = 50.0mm, AprilTag = 100.0mm, fallback default = 85.6mm). Returns 1.0 if `pixelDimensions.width <= 0`.
  - `computeCalibrationScale(markerPixels: number, knownLengthMm: number): CalibrationResult`:
    Computes custom `mmPerPx`. Returns fallback `{ mmPerPx: 1.0, ... }` if `markerPixels <= 0 || knownLengthMm <= 0`.
  - `applyCalibrationToPoint(xPx: number, yPx: number, scaleMmPerPx: number): { xMm: number; yMm: number }`:
    Converts pixel coordinates to millimeters. Uses 1.0 fallback if `scaleMmPerPx` is non-finite or `<= 0`.

#### Current Test Gaps & Edge Cases
- No dedicated `calibration.test.ts` exists.
- Gaps to cover:
  - Preset physical widths ("card" -> 85.6mm, "qr" -> 50mm, "apriltag" -> 100mm, custom/unknown strings -> 85.6mm default).
  - Edge cases in `calculateMillimetersPerPixel`: `width <= 0`, zero height, null/undefined `pixelDimensions`.
  - Edge cases in `computeCalibrationScale`: zero `markerPixels`, negative `knownLengthMm`, fractional/large values.
  - Edge cases in `applyCalibrationToPoint`: non-finite scale (`NaN`, `Infinity`), 0 scale, negative scale, coordinate scaling precision.

#### Mock & Test Requirements
- **Test File Location:** `src/lib/gait/__tests__/calibration.test.ts`.
- **Mocks Required:** None (pure functional conversion logic).

---

### Module 3: `src/lib/gait/homography.ts`

#### Overview & Export Inventory
- **Exported Types:**
  - `Point2D`: `{ x: number; y: number }`
  - `Matrix3x3`: `number[][]`
  - `HomographyMatrix`: `Matrix3x3`
- **Exported Functions:**
  - `solveLinearSystem8x8(A: number[][], b: number[]): number[] | null`:
    Solves 8x8 system via Gaussian elimination with partial pivoting. Returns `null` if matrix is singular (`Math.abs(M[maxRow][i]) < 1e-9`).
  - `computeHomographyMatrix(imagePointsRaw: (Point2D | [number, number])[], floorPointsRaw: (Point2D | [number, number])[]): HomographyMatrix`:
    Computes 3x3 DLT homography matrix. Checks collinearity via triangle area (`triArea < 1e-7`); returns 3x3 identity matrix fallback `[[1,0,0],[0,1,0],[0,0,1]]` if points are degenerate, insufficient (<4), or singular.
  - `transformPoint(pointRaw: Point2D | [number, number], H: HomographyMatrix): Point2D`:
    Applies homography transform with homogeneous division `(x'/w', y'/w')`. Fallback `w = 1.0` if `Math.abs(wPrime) < 1e-9`.
  - `projectToFloorPlane(pointRaw: [number, number] | Point2D, matrix: HomographyMatrix): [number, number]`:
    Wrapper returning `[x, y]` floor coordinate array.

#### Current Test Gaps & Edge Cases
- No dedicated `homography.test.ts` exists.
- Linear solver and geometric transformation edge cases:
  - Identity transform (square `[0,0]`, `[1,0]`, `[1,1]`, `[0,1]` mapped to identical floor square).
  - Pure scaling, translation, and rotation homographies.
  - Perspective projection (trapezoid camera view to rectangular floor plane).
  - Degenerate inputs: collinear image points, 3 points, empty arrays, null points.
  - Linear solver singular matrix condition (returns `null` -> triggers identity fallback matrix).
  - Division by zero protection in `transformPoint` when `wPrime ≈ 0`.
  - Tuple `[x, y]` vs `Point2D` object input formats.

#### Mock & Test Requirements
- **Test File Location:** `src/lib/gait/__tests__/homography.test.ts`.
- **Mocks Required:** None (pure linear algebra and geometry).

---

### Module 4: `src/lib/gait/liveCapture.ts`

#### Overview & Export Inventory
- **Exported Functions:**
  - `bufferedSpanSec(frames: PoseFrame[]): number`: Wall-clock span in seconds. Returns 0 if `frames.length < 2`.
  - `longestContinuousRun(frames: PoseFrame[]): PoseFrame[]`: Finds longest continuous sub-sequence of frames where consecutive time gap `<= 0.35`s (`MAX_LIVE_GAP_SEC`).
  - `defaultFacingMode(): "user" | "environment"`: Returns `"environment"` for coarse pointer (mobile/handheld), else `"user"`. Guards for SSR (`typeof window === "undefined"` or `window.matchMedia` missing).

#### Current Test Gaps & Edge Cases
- No dedicated `liveCapture.test.ts` exists.
- Test coverage gaps:
  - `bufferedSpanSec`: empty frames, single frame, uniform frame series, unordered timestamps.
  - `longestContinuousRun`: zero/single frame, gap-free continuous sequence, sequence with 1 gap > 0.35s, sequence with multiple gaps of varying lengths (ensuring longest run is selected), gaps at array boundaries.
  - `defaultFacingMode`:
    - SSR context (`window` undefined).
    - JSDOM context without `matchMedia`.
    - Mobile context (`matchMedia("(pointer: coarse)").matches === true` -> `"environment"`).
    - Desktop context (`matchMedia("(pointer: coarse)").matches === false` -> `"user"`).

#### Mock & Test Requirements
- **Test File Location:** `src/lib/gait/__tests__/liveCapture.test.ts`.
- **Mocks Required:**
  - `window` and `window.matchMedia` mocking using Vitest (`vi.stubGlobal('window', ...)` and `vi.fn()`).

---

### Module 5: `src/lib/gait/persistence.server.ts`

#### Overview & Export Inventory
- **Module Nature:** 2-line re-export wrapper: `export * from "./persistence";`.
- **Re-exported Functions & Types:**
  - `saveGaitSession`, `listGaitSessions`, `listPatientSessions`, `getGaitSession`, `deleteGaitSession`, `getPersistenceMode`.
  - `GaitSessionRecord` interface.

#### Current Test Gaps & Edge Cases
- `persistence.test.ts` verifies serialization and regex source patterns on `persistence.ts`, but `persistence.server.ts` itself has no dedicated test file.
- Gaps:
  - Re-export completeness verification: asserting that all 6 server functions and types exported by `persistence.ts` are re-exported by `persistence.server.ts`.
  - Server-only entry point import resolution integrity under Vitest runtime.

#### Mock & Test Requirements
- **Test File Location:** `src/lib/gait/__tests__/persistence.server.test.ts`.
- **Mocks Required:** Import contract verification.

---

## 3. Requirement R9: Clinical Normative Reference Integration Architecture

### Scientific Background & Clinical Datasets

#### 1. Winter (2009) — *Biomechanics and Motor Control of Human Movement* (4th Ed.)
- Provides canonical normative gait parameters for healthy adult walking at natural cadence:
  - Cadence: $105.0 \pm 8.0$ spm
  - Step Time: $0.57 \pm 0.04$ s
  - Step Time CV: $2.0 \pm 0.6$ %
  - Stance Phase: $60.5 \pm 2.0$ % of gait cycle
  - Double Support Phase: $20.8 \pm 2.5$ % of gait cycle
  - Knee Flexion ROM: $58.0 \pm 4.5$ °

#### 2. Bovi et al. (2011) — *Gait & Posture* 33(4): 555-560
- Provides age- and sex-stratified normative values across lifespan:
  - **Young Adults (18–49 yrs):**
    - Male: Cadence $112.4 \pm 7.5$ spm, Stance $60.2 \pm 1.5$ %, Double Support $20.1 \pm 2.0$ %, Knee ROM $60.5 \pm 3.8$ °
    - Female: Cadence $117.8 \pm 6.8$ spm, Stance $59.8 \pm 1.4$ %, Double Support $19.6 \pm 1.8$ %, Knee ROM $59.2 \pm 3.5$ °
  - **Middle-Aged Adults (50–64 yrs):**
    - Male: Cadence $108.6 \pm 8.0$ spm, Stance $61.4 \pm 1.8$ %, Double Support $21.5 \pm 2.2$ %, Knee ROM $57.4 \pm 4.0$ °
    - Female: Cadence $114.2 \pm 7.2$ spm, Stance $60.8 \pm 1.6$ %, Double Support $20.9 \pm 2.0$ %, Knee ROM $56.8 \pm 3.7$ °
  - **Elderly Adults (65+ yrs):**
    - Male: Cadence $103.2 \pm 9.5$ spm, Stance $62.8 \pm 2.5$ %, Double Support $23.8 \pm 3.0$ %, Knee ROM $53.5 \pm 4.8$ °
    - Female: Cadence $109.5 \pm 8.8$ spm, Stance $62.1 \pm 2.2$ %, Double Support $23.1 \pm 2.8$ %, Knee ROM $54.1 \pm 4.5$ °

---

### Architectural Design of `src/lib/gait/normatives.ts`

#### Data Types & Interface Specifications

```typescript
export type SexCategory = "male" | "female" | "combined";
export type AgeGroupCategory = "young" | "middle" | "elderly" | "combined";

export interface NormativeReferenceRange {
  paramId: string;
  label: string;
  unit: string;
  mean: number;
  sd: number;
  min95: number;
  max95: number;
  citation: "Winter (2009)" | "Bovi et al. (2011)";
}

export interface NormativeEvaluationResult {
  paramId: string;
  label: string;
  observedValue: number;
  normativeMean: number;
  normativeSd: number;
  zScore: number;
  percentile: number; // 0 to 100
  band: "normal" | "mild_deviation" | "moderate_deviation" | "severe_deviation";
  unit: string;
  citation: string;
}

export interface GaitDeviationIndexResult {
  gdiScore: number; // Scaled [0, 130], 100 = normative mean, each -10 = 1 SD deviation
  zRms: number;     // Root Mean Square Z-score across parameters
  interpretation: string;
  evaluatedParametersCount: number;
}
```

#### Mathematical Formulation for Z-Scores & Percentiles

1. **Z-Score Calculation:**
   $$Z = \frac{x_{\text{observed}} - \mu_{\text{norm}}}{\sigma_{\text{norm}}}$$
2. **Percentile Computation (Error Function Approximation):**
   $$P(Z) = 100 \cdot \Phi(Z) = 100 \cdot \frac{1}{2} \left[ 1 + \text{erf}\left( \frac{Z}{\sqrt{2}} \right) \right]$$
   where $\text{erf}(x) \approx \text{sign}(x) \cdot \sqrt{1 - \exp\left( -\frac{4}{\pi} x^2 \right)}$.

3. **Gait Deviation Index (GDI) Formulation:**
   Adapted from Schwartz & Rozumalski (2008) for camera-derived spatio-temporal and kinematic metrics:
   $$\text{GDI} = \max\left(0, \min\left(130, 100 - 10 \cdot \bar{Z}_{\text{rms}}\right)\right)$$
   where:
   $$\bar{Z}_{\text{rms}} = \sqrt{\frac{1}{K} \sum_{i=1}^{K} Z_i^2}$$
   for key parameters: Cadence, Step Time CV, Stance %, Double Support %, and Knee Flexion ROM.
   - **GDI $\ge$ 100:** Normal / Optimal gait mechanics ($\le 0$ SD deviation).
   - **GDI 90–99:** Mild deviation ($1$ SD deviation).
   - **GDI 80–89:** Moderate deviation ($2$ SD deviation).
   - **GDI $<$ 80:** Severe deviation ($\ge 3$ SD deviation).

---

### Integration Points in `ratings.ts` & `guesses.ts`

#### 1. Integration in `src/lib/gait/ratings.ts`

- Enrich `buildStructuredReport()`:
  - Evaluate metrics against normative ranges via `evaluateGaitNormatives(metrics, patientMeta)`.
  - Add `gdi` calculation result to report headline and domain ratings.
  - Include Z-score and percentile in `MetricRating` notes.

#### 2. Integration in `src/lib/gait/guesses.ts`

- Enrich `buildEducatedGuesses()`:
  - Add hypothesis rule `gdi-deviation`: triggers when $\text{GDI} < 85$ with clinical summary and Z-score evidence.
  - Add hypothesis rule `normative-percentile-deviation`: triggers when Step Time CV percentile $> 95$th percentile or Knee Flexion ROM $< 5$th percentile.

---

## 4. Comprehensive Verification Strategy

1. **Vitest Unit Test Execution:**
   - Execute `npx vitest run src/lib/gait/__tests__/landmarks.test.ts src/lib/gait/__tests__/calibration.test.ts src/lib/gait/__tests__/homography.test.ts src/lib/gait/__tests__/liveCapture.test.ts src/lib/gait/__tests__/persistence.server.test.ts src/lib/gait/__tests__/normatives.test.ts`.
2. **Typecheck & Linting:**
   - Execute `npx tsc --noEmit` and `npx eslint .`.
3. **Regression Testing:**
   - Run full Vitest suite (`npx vitest run`) to guarantee 100% pass rate across all 986+ existing tests.

---

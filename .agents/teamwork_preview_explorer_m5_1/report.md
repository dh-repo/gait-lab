# Technical Analysis and Test Design Specification

**Target Modules:**
1. `src/lib/gait/landmarks.ts`
2. `src/lib/gait/calibration.ts`

**Author:** teamwork_preview_explorer_m5_1  
**Date:** 2026-08-10  
**Project:** `gait-lab` (Milestone 5 — Expand Unit Test Coverage for Untested Modules)

---

## Executive Summary

This report provides a forensic technical analysis and complete test design specification for two core biomechanical helper modules in `gait-lab`: `landmarks.ts` and `calibration.ts`. 

- `src/lib/gait/landmarks.ts` supplies geometric, structural, spatial, and mathematical primitives for pose keypoints (midpoint, distance, 3-point angle, torso height, bounding box, hip center, mean, std, range, clamp, pct).
- `src/lib/gait/calibration.ts` provides physical floor-plane marker calibration and unit conversions mapping 2D image pixel coordinates to physical millimeters (mm/px).

Neither of these modules previously had dedicated unit test files. This document details all function signatures, calculation logic, edge cases, degenerate conditions, and complete test suite design specifications for creating `src/lib/gait/__tests__/landmarks.test.ts` and `src/lib/gait/__tests__/calibration.test.ts`.

---

## 1. Technical Analysis: `src/lib/gait/landmarks.ts`

### 1.1 Overview & Constants

`landmarks.ts` defines structural constants for skeleton representation and visual rendering:

1. **`POSE_CONNECTIONS: [number, number][]`**
   - **Type:** `[number, number][]`
   - **Content:** Array of 22 keypoint index pairs defining MediaPipe Pose skeleton connections (e.g. `[11, 12]`, `[11, 13]`, `[23, 24]`, `[27, 29]`, etc.).
   - **Index bounds:** All indices are between 11 and 32.

2. **`LM: const object`**
   - **Type:** `Record<string, number>`
   - **Map:**
     - `NOSE: 0`
     - `L_SHOULDER: 11`, `R_SHOULDER: 12`
     - `L_ELBOW: 13`, `R_ELBOW: 14`
     - `L_WRIST: 15`, `R_WRIST: 16`
     - `L_HIP: 23`, `R_HIP: 24`
     - `L_KNEE: 25`, `R_KNEE: 26`
     - `L_ANKLE: 27`, `R_ANKLE: 28`
     - `L_HEEL: 29`, `R_HEEL: 30`
     - `L_FOOT: 31`, `R_FOOT: 32`

3. **`PERSON_COLORS: string[]`**
   - **Type:** `string[]`
   - **Content:** 6 hex color strings used for multi-person rendering: `["#5b8def", "#3dd6c6", "#e8b86d", "#c79bff", "#e07a7a", "#6bcb8f"]`.

---

### 1.2 Functions Analysis

#### 1. `mid(a?: Landmark | null, b?: Landmark | null): Landmark`
- **Signature:** `(a: Landmark | undefined | null, b: Landmark | undefined | null) => Landmark`
- **Logic:**
  ```ts
  const ax = Number.isFinite(a?.x) ? (a!.x) : 0.5;
  const ay = Number.isFinite(a?.y) ? (a!.y) : 0.5;
  const az = Number.isFinite(a?.z) ? (a!.z) : 0;
  const bx = Number.isFinite(b?.x) ? (b!.x) : 0.5;
  const by = Number.isFinite(b?.y) ? (b!.y) : 0.5;
  const bz = Number.isFinite(b?.z) ? (b!.z) : 0;
  const visA = a?.visibility ?? 1;
  const visB = b?.visibility ?? 1;
  return {
    x: (ax + bx) / 2,
    y: (ay + by) / 2,
    z: (az + bz) / 2,
    visibility: Math.min(visA, visB),
  };
  ```
- **Key Characteristics:**
  - Standard 3D midpoint: `(a + b) / 2`.
  - Visibility is conservative (`Math.min(visA, visB)`).
  - Defaults missing/non-finite coordinates `x`, `y` to `0.5`, `z` to `0`, and `visibility` to `1`.
- **Edge Cases:**
  - `a` or `b` is `null` or `undefined`.
  - Coordinate `x`, `y`, or `z` is `NaN`, `Infinity`, or `-Infinity`.
  - `visibility` is missing or zero (`0.0`).

#### 2. `dist(a?: Landmark | null, b?: Landmark | null): number`
- **Signature:** `(a: Landmark | undefined | null, b: Landmark | undefined | null) => number`
- **Logic:**
  ```ts
  const ax = Number.isFinite(a?.x) ? (a!.x) : 0;
  const ay = Number.isFinite(a?.y) ? (a!.y) : 0;
  const bx = Number.isFinite(b?.x) ? (b!.x) : 0;
  const by = Number.isFinite(b?.y) ? (b!.y) : 0;
  const d = Math.hypot(ax - bx, ay - by);
  return Number.isFinite(d) ? d : 0;
  ```
- **Key Characteristics:**
  - Calculates 2D Euclidean distance in the XY plane using `Math.hypot(ax - bx, ay - by)`.
  - Ignores Z coordinate.
  - Defaults non-finite or missing coordinates to `0`.
- **Edge Cases:**
  - Null/undefined inputs.
  - Coincident points (`dist` = 0).
  - Non-finite coordinates (`NaN`, `Infinity`).

#### 3. `angleDeg(a?: Landmark | null, b?: Landmark | null, c?: Landmark | null): number`
- **Signature:** `(a: Landmark | undefined | null, b: Landmark | undefined | null, c: Landmark | undefined | null) => number`
- **Logic:**
  ```ts
  if (!a || !b || !c) return 180;
  // Fallbacks to 0.5 for non-finite coordinates
  const abx = ax - bx; const aby = ay - by;
  const cbx = cx - bx; const cby = cy - by;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag < 1e-8 || !Number.isFinite(mag) || !Number.isFinite(dot)) return 180;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  const angle = (Math.acos(cos) * 180) / Math.PI;
  return Number.isFinite(angle) ? angle : 180;
  ```
- **Key Characteristics:**
  - Calculates internal angle at vertex `b` formed by ray `b -> a` and ray `b -> c` in degrees `[0, 180]`.
  - Returns default `180` for missing landmarks, collinear degenerate points, or zero-length vectors (`mag < 1e-8`).
  - Clamps dot product ratio to `[-1, 1]` before calling `Math.acos` to avoid domain errors.
- **Edge Cases:**
  - Any point is `null` or `undefined`.
  - Zero-length vectors (`a == b` or `c == b`).
  - Straight line collinearity (180 deg or 0 deg).
  - Right angle (90 deg).

#### 4. `torsoHeight(lm: Landmark[]): number`
- **Signature:** `(lm: Landmark[]) => number`
- **Logic:**
  ```ts
  if (!Array.isArray(lm) || lm.length < 25) return 0.2;
  const shoulder = mid(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
  const hip = mid(lm[LM.L_HIP], lm[LM.R_HIP]);
  const h = dist(shoulder, hip);
  return Number.isFinite(h) && h >= 0.05 ? h : 0.2;
  ```
- **Key Characteristics:**
  - Calculates distance between mid-shoulder (`(11 + 12)/2`) and mid-hip (`(23 + 24)/2`).
  - Enforces minimum valid torso height threshold `0.05` (5% of frame dimension). If height `< 0.05` or invalid array (length `< 25`), returns default fallback `0.2`.
- **Edge Cases:**
  - Empty array `[]` or array length `< 25`.
  - Collapsed/zero torso height (`h < 0.05`).
  - Missing shoulder/hip landmark indices.

#### 5. `boundingBox(lm: Landmark[]): { x: number; y: number; w: number; h: number }`
- **Signature:** `(lm: Landmark[]) => { x: number; y: number; w: number; h: number }`
- **Logic:**
  ```ts
  // Iterates lm, ignores !p or visibility < 0.2
  // Computes minX, minY, maxX, maxY
  // If maxX <= minX || maxY <= minY returns default { x: 0.4, y: 0.2, w: 0.2, h: 0.6 }
  // Applies pad = 0.03, clamps to [0, 1]
  ```
- **Key Characteristics:**
  - Calculates padded `[x, y, w, h]` bounding box in normalized `[0, 1]` coordinates.
  - Filters out landmarks with `visibility < 0.2`.
  - Adds 3% padding (`pad = 0.03`).
  - Fallback box `{ x: 0.4, y: 0.2, w: 0.2, h: 0.6 }` returned when array is invalid, empty, or all landmarks are low-visibility.
- **Edge Cases:**
  - Empty array or non-array input.
  - Landmarks all low visibility (`< 0.2`).
  - Single point visible (`maxX <= minX`).
  - Full frame bounding box (`0` to `1`).

#### 6. `hipCenter(lm: Landmark[]): Landmark`
- **Signature:** `(lm: Landmark[]) => Landmark`
- **Logic:**
  ```ts
  if (!Array.isArray(lm) || lm.length < 25) {
    return { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
  }
  return mid(lm[LM.L_HIP], lm[LM.R_HIP]);
  ```
- **Key Characteristics:**
  - Computes midpoint between left hip (`LM.L_HIP = 23`) and right hip (`LM.R_HIP = 24`).
  - Returns default `{ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }` if `lm` is invalid or length `< 25`.

#### 7. Standard Statistical & Utility Functions
- **`mean(xs: number[]): number`**
  - Ignores non-finite values (`NaN`, `Infinity`). Returns `0` for empty or all-non-finite array.
- **`std(xs: number[]): number`**
  - Calculates population standard deviation ($\sqrt{\frac{1}{N}\sum (x_i - \mu)^2}$). Returns `0` if `finite count < 2`.
- **`range(xs: number[]): number`**
  - Calculates `Math.max(...valid) - Math.min(...valid)`. Returns `0` for empty/invalid input.
- **`clamp(n: number, a: number, b: number): number`**
  - Clamps `n` between `[a, b]`. If `n` is non-finite, returns `a`.
- **`pct(n: number, digits = 0): string`**
  - Formats `n` as percentage string (e.g. `pct(0.75)` -> `"75%"`). Returns `"0%"` if `n` non-finite.

---

## 2. Technical Analysis: `src/lib/gait/calibration.ts`

### 2.1 Overview & Types

`calibration.ts` converts image pixel dimensions to physical millimeters using known floor-plane calibration markers (e.g., credit card, QR tag, AprilTag).

- **`MarkerType`**: `"card" | "qr" | "apriltag" | "custom" | (string & {})`
- **`CalibrationResult`**:
  ```ts
  interface CalibrationResult {
    mmPerPx: number;
    markerType: MarkerType;
    knownLengthMm: number;
    markerPixels: number;
  }
  ```

---

### 2.2 Functions Analysis

#### 1. `calculateMillimetersPerPixel(markerType: MarkerType | string, pixelDimensions: { width: number; height: number }): number`
- **Signature:** `(markerType: MarkerType | string, pixelDimensions: { width: number; height: number }) => number`
- **Logic:**
  ```ts
  if (!pixelDimensions || pixelDimensions.width <= 0) return 1.0;
  let physicalWidthMm = 85.6; // standard card
  if (markerType === "qr") physicalWidthMm = 50.0;
  else if (markerType === "apriltag") physicalWidthMm = 100.0;
  return physicalWidthMm / pixelDimensions.width;
  ```
- **Physical Standards:**
  - `"card"` (or unknown/custom): `85.6` mm (ISO/IEC 7810 ID-1 standard)
  - `"qr"`: `50.0` mm
  - `"apriltag"`: `100.0` mm
- **Degenerate Conditions:**
  - `pixelDimensions` is `null`/`undefined` -> returns `1.0`.
  - `pixelDimensions.width <= 0` -> returns `1.0`.
  - Sub-pixel marker width (e.g. `0.5` px) -> `85.6 / 0.5 = 171.2`.

#### 2. `computeCalibrationScale(markerPixels: number, knownLengthMm: number): CalibrationResult`
- **Signature:** `(markerPixels: number, knownLengthMm: number) => CalibrationResult`
- **Logic:**
  ```ts
  if (markerPixels <= 0 || knownLengthMm <= 0) {
    return {
      mmPerPx: 1.0,
      markerType: "custom",
      knownLengthMm: knownLengthMm || 0,
      markerPixels: markerPixels || 0,
    };
  }
  const mmPerPx = knownLengthMm / markerPixels;
  return { mmPerPx, markerType: "custom", knownLengthMm, markerPixels };
  ```
- **Degenerate Conditions:**
  - `markerPixels <= 0` or `knownLengthMm <= 0` -> returns `mmPerPx: 1.0`. Preserves input `knownLengthMm` and `markerPixels` (or defaults to `0` if falsy).

#### 3. `applyCalibrationToPoint(xPx: number, yPx: number, scaleMmPerPx: number): { xMm: number; yMm: number }`
- **Signature:** `(xPx: number, yPx: number, scaleMmPerPx: number) => { xMm: number; yMm: number }`
- **Logic:**
  ```ts
  const scale = Number.isFinite(scaleMmPerPx) && scaleMmPerPx > 0 ? scaleMmPerPx : 1.0;
  return {
    xMm: xPx * scale,
    yMm: yPx * scale,
  };
  ```
- **Degenerate Conditions:**
  - `scaleMmPerPx <= 0`, `NaN`, `Infinity`, or `-Infinity` -> scale falls back to `1.0`.

---

## 3. Comprehensive Test Design Specs

### 3.1 Test Suite Structure for `landmarks.test.ts`

The test suite for `landmarks.ts` should be placed at `src/lib/gait/__tests__/landmarks.test.ts` and structured into 7 primary `describe` blocks:

1. **`describe("Constants & Skeleton Topology", ...)`**
   - Test `POSE_CONNECTIONS`: verify array length (22), check all pairs have 2 numbers, check all indices are within valid landmark range `[0, 32]`.
   - Test `LM`: verify named constants (`NOSE === 0`, `L_SHOULDER === 11`, `R_SHOULDER === 12`, `L_HIP === 23`, `R_HIP === 24`, `L_ANKLE === 27`, `R_ANKLE === 28`, `L_HEEL === 29`, `R_HEEL === 30`).
   - Test `PERSON_COLORS`: verify array contains 6 valid hex strings.

2. **`describe("mid()", ...)`**
   - Test normal midpoint calculation: `a = {x: 0.2, y: 0.4, z: 0.1, visibility: 0.8}`, `b = {x: 0.4, y: 0.6, z: 0.3, visibility: 0.9}` -> returns `{x: 0.3, y: 0.5, z: 0.2, visibility: 0.8}`.
   - Test null/undefined inputs: `mid(null, undefined)` -> returns `{x: 0.5, y: 0.5, z: 0, visibility: 1}`.
   - Test non-finite coordinates: `a = {x: NaN, y: Infinity, z: -Infinity}` -> uses fallbacks (`x: 0.5`, `y: 0.5`, `z: 0`).
   - Test visibility handling: `visA = 0.3`, `visB = 0.9` -> `visibility === 0.3`.

3. **`describe("dist()", ...)`**
   - Test normal distance: `a = {x: 0, y: 0}`, `b = {x: 3, y: 4}` -> returns `5`.
   - Test null/undefined handling: `dist(null, {x: 3, y: 4})` -> treats null as `(0, 0)`, returns `5`.
   - Test non-finite coordinates: `dist({x: NaN, y: 0}, {x: 0, y: 0})` -> returns `0`.
   - Test coincident points: `dist(a, a)` -> returns `0`.

4. **`describe("angleDeg()", ...)`**
   - Test right angle (90 deg): `a = {x: 0, y: 1}`, `b = {x: 0, y: 0}`, `c = {x: 1, y: 0}` -> returns `90`.
   - Test straight angle (180 deg): `a = {x: -1, y: 0}`, `b = {x: 0, y: 0}`, `c = {x: 1, y: 0}` -> returns `180`.
   - Test missing vertex or points: `angleDeg(null, b, c)` -> returns `180`.
   - Test zero-length vector (degenerate vertex): `a = b` -> returns `180`.
   - Test floating-point clamping edge cases where dot product ratio slightly exceeds 1.0.

5. **`describe("torsoHeight() & hipCenter()", ...)`**
   - Test `torsoHeight` normal case: shoulder mid `(0.5, 0.2)`, hip mid `(0.5, 0.6)` -> returns `0.4`.
   - Test `torsoHeight` collapsed torso (`h < 0.05`): returns fallback `0.2`.
   - Test `torsoHeight` invalid/short array (`length < 25`): returns fallback `0.2`.
   - Test `hipCenter` normal case: `L_HIP(23) = (0.4, 0.5)`, `R_HIP(24) = (0.6, 0.5)` -> returns `{x: 0.5, y: 0.5, z: 0, visibility: ...}`.
   - Test `hipCenter` short array (`length < 25`): returns fallback `{x: 0.5, y: 0.5, z: 0, visibility: 0.9}`.

6. **`describe("boundingBox()", ...)`**
   - Test normal box with visible landmarks: returns padded box clamped to `[0, 1]`.
   - Test low visibility landmarks (`visibility < 0.2`): ignored, returns default box `{x: 0.4, y: 0.2, w: 0.2, h: 0.6}`.
   - Test empty or non-array input: returns default box `{x: 0.4, y: 0.2, w: 0.2, h: 0.6}`.
   - Test boundary clamping: landmarks near screen edges `(0.01, 0.01)` and `(0.99, 0.99)` -> box bounded within `[0, 1]`.

7. **`describe("Statistical Helpers (mean, std, range, clamp, pct)", ...)`**
   - `mean`: test normal `[2, 4, 6]` -> `4`; test `[NaN, 4, Infinity]` -> `4`; test `[]` -> `0`.
   - `std`: test population std `[2, 4, 4, 4, 5, 5, 7, 9]` -> `2.0`; test single element `[5]` -> `0`; test all NaNs -> `0`.
   - `range`: test `[1, 5, 10]` -> `9`; test `[-5, 5]` -> `10`; test `[]` -> `0`.
   - `clamp`: test `clamp(5, 0, 10)` -> `5`; test `clamp(-5, 0, 10)` -> `0`; test `clamp(15, 0, 10)` -> `10`; test `clamp(NaN, 0, 10)` -> `0`.
   - `pct`: test `pct(0.756)` -> `"76%"`; test `pct(0.756, 1)` -> `"75.6%"`; test `pct(NaN)` -> `"0%"`.

---

### 3.2 Test Suite Structure for `calibration.test.ts`

The test suite for `calibration.ts` should be placed at `src/lib/gait/__tests__/calibration.test.ts` and structured into 3 primary `describe` blocks:

1. **`describe("calculateMillimetersPerPixel()", ...)`**
   - Test credit card standard (`"card"`): `pixelDimensions = { width: 100, height: 50 }` -> returns `0.856` mm/px (`85.6 / 100`).
   - Test QR tag standard (`"qr"`): `pixelDimensions = { width: 100, height: 100 }` -> returns `0.5` mm/px (`50.0 / 100`).
   - Test AprilTag standard (`"apriltag"`): `pixelDimensions = { width: 200, height: 200 }` -> returns `0.5` mm/px (`100.0 / 200`).
   - Test custom / unknown marker string: defaults to card width `85.6` mm.
   - Test zero or negative pixel width (`width: 0` or `width: -10`): returns fallback `1.0`.
   - Test null / undefined `pixelDimensions`: returns fallback `1.0`.
   - Test extreme/high-res dimensions (`width: 8560`): returns `0.01`.
   - Test sub-pixel dimensions (`width: 0.5`): returns `171.2`.

2. **`describe("computeCalibrationScale()", ...)`**
   - Test valid inputs: `markerPixels = 100`, `knownLengthMm = 50` -> returns `{ mmPerPx: 0.5, markerType: "custom", knownLengthMm: 50, markerPixels: 100 }`.
   - Test zero/negative `markerPixels` (`markerPixels = 0` or `-5`): returns `{ mmPerPx: 1.0, markerType: "custom", knownLengthMm: 50, markerPixels: 0 | -5 }`.
   - Test zero/negative `knownLengthMm` (`knownLengthMm = 0`): returns `{ mmPerPx: 1.0, markerType: "custom", knownLengthMm: 0, markerPixels: 100 }`.

3. **`describe("applyCalibrationToPoint()", ...)`**
   - Test valid conversion: `xPx = 100`, `yPx = 200`, `scaleMmPerPx = 0.5` -> returns `{ xMm: 50, yMm: 100 }`.
   - Test zero/negative scale (`scaleMmPerPx = 0` or `-0.5`): scale falls back to `1.0`, returns `{ xMm: 100, yMm: 200 }`.
   - Test non-finite scale (`scaleMmPerPx = NaN` or `Infinity`): scale falls back to `1.0`, returns `{ xMm: 100, yMm: 200 }`.
   - Test zero origin point: `(0, 0)` -> `{ xMm: 0, yMm: 0 }`.

---

## 4. Sample Code Implementation Specs for Test Files

Below are full, ready-to-write vitest spec files designed according to these specifications.

### `src/lib/gait/__tests__/landmarks.test.ts` (Design Template)

```ts
import { describe, it, expect } from "vitest";
import {
  mid,
  dist,
  angleDeg,
  torsoHeight,
  boundingBox,
  hipCenter,
  mean,
  std,
  range,
  clamp,
  pct,
  POSE_CONNECTIONS,
  LM,
  PERSON_COLORS,
} from "../landmarks";
import type { Landmark } from "../types";

describe("landmarks.ts - Constants & Structural Topology", () => {
  it("defines 22 valid skeleton pose connections", () => {
    expect(POSE_CONNECTIONS.length).toBe(22);
    for (const [a, b] of POSE_CONNECTIONS) {
      expect(typeof a).toBe("number");
      expect(typeof b).toBe("number");
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(32);
      expect(b).toBeLessThanOrEqual(32);
    }
  });

  it("defines landmark indices correctly matching MediaPipe Pose layout", () => {
    expect(LM.NOSE).toBe(0);
    expect(LM.L_SHOULDER).toBe(11);
    expect(LM.R_SHOULDER).toBe(12);
    expect(LM.L_HIP).toBe(23);
    expect(LM.R_HIP).toBe(24);
    expect(LM.L_ANKLE).toBe(27);
    expect(LM.R_ANKLE).toBe(28);
    expect(LM.L_HEEL).toBe(29);
    expect(LM.R_HEEL).toBe(30);
  });

  it("provides 6 valid hex color codes for person tracking", () => {
    expect(PERSON_COLORS.length).toBe(6);
    for (const color of PERSON_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("landmarks.ts - mid()", () => {
  it("calculates 3D midpoint and minimum visibility for valid landmarks", () => {
    const a: Landmark = { x: 0.2, y: 0.4, z: 0.1, visibility: 0.8 };
    const b: Landmark = { x: 0.4, y: 0.6, z: 0.3, visibility: 0.9 };
    const result = mid(a, b);
    expect(result.x).toBeCloseTo(0.3);
    expect(result.y).toBeCloseTo(0.5);
    expect(result.z).toBeCloseTo(0.2);
    expect(result.visibility).toBe(0.8);
  });

  it("handles null or undefined landmarks using default coordinates (0.5, 0.5, 0)", () => {
    const resNull = mid(null, undefined);
    expect(resNull).toEqual({ x: 0.5, y: 0.5, z: 0, visibility: 1 });
  });

  it("handles NaN or non-finite coordinates with fallbacks", () => {
    const a: Landmark = { x: NaN, y: Infinity, z: -Infinity, visibility: 0.5 };
    const b: Landmark = { x: 0.6, y: 0.8, z: 0.2, visibility: 0.7 };
    const result = mid(a, b);
    expect(result.x).toBeCloseTo(0.55); // (0.5 + 0.6) / 2
    expect(result.y).toBeCloseTo(0.65); // (0.5 + 0.8) / 2
    expect(result.z).toBeCloseTo(0.1);  // (0 + 0.2) / 2
    expect(result.visibility).toBe(0.5);
  });
});

describe("landmarks.ts - dist()", () => {
  it("computes 2D Euclidean distance between two valid points", () => {
    const a: Landmark = { x: 0, y: 0, z: 0 };
    const b: Landmark = { x: 3, y: 4, z: 10 };
    expect(dist(a, b)).toBeCloseTo(5.0);
  });

  it("handles null or undefined points treating them as (0, 0)", () => {
    const b: Landmark = { x: 3, y: 4, z: 0 };
    expect(dist(null, b)).toBeCloseTo(5.0);
    expect(dist(undefined, undefined)).toBe(0);
  });

  it("returns 0 for non-finite distance", () => {
    const a: Landmark = { x: NaN, y: 0, z: 0 };
    const b: Landmark = { x: 0, y: 0, z: 0 };
    expect(dist(a, b)).toBe(0);
  });
});

describe("landmarks.ts - angleDeg()", () => {
  it("calculates 90 degree right angle correctly", () => {
    const a: Landmark = { x: 0, y: 1, z: 0 };
    const b: Landmark = { x: 0, y: 0, z: 0 };
    const c: Landmark = { x: 1, y: 0, z: 0 };
    expect(angleDeg(a, b, c)).toBeCloseTo(90);
  });

  it("calculates 180 degree straight angle correctly", () => {
    const a: Landmark = { x: -1, y: 0, z: 0 };
    const b: Landmark = { x: 0, y: 0, z: 0 };
    const c: Landmark = { x: 1, y: 0, z: 0 };
    expect(angleDeg(a, b, c)).toBeCloseTo(180);
  });

  it("returns 180 when any landmark is missing or undefined", () => {
    const b: Landmark = { x: 0, y: 0, z: 0 };
    const c: Landmark = { x: 1, y: 0, z: 0 };
    expect(angleDeg(null, b, c)).toBe(180);
  });

  it("returns 180 for degenerate zero-length vectors", () => {
    const b: Landmark = { x: 0, y: 0, z: 0 };
    expect(angleDeg(b, b, b)).toBe(180);
  });
});

describe("landmarks.ts - torsoHeight() & hipCenter()", () => {
  it("computes torso height from shoulders to hips", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    lm[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0 };
    lm[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0 };
    lm[LM.L_HIP] = { x: 0.4, y: 0.7, z: 0 };
    lm[LM.R_HIP] = { x: 0.6, y: 0.7, z: 0 };
    expect(torsoHeight(lm)).toBeCloseTo(0.5);
  });

  it("returns default 0.2 for short or invalid landmark array", () => {
    expect(torsoHeight([])).toBe(0.2);
    expect(torsoHeight(Array.from({ length: 20 }, () => ({ x: 0, y: 0, z: 0 })))).toBe(0.2);
  });

  it("returns default 0.2 if computed torso height is under 0.05", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    lm[LM.L_SHOULDER] = { x: 0.5, y: 0.50, z: 0 };
    lm[LM.R_SHOULDER] = { x: 0.5, y: 0.50, z: 0 };
    lm[LM.L_HIP] = { x: 0.5, y: 0.51, z: 0 };
    lm[LM.R_HIP] = { x: 0.5, y: 0.51, z: 0 };
    expect(torsoHeight(lm)).toBe(0.2);
  });

  it("computes hipCenter as midpoint between left and right hip", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
    lm[LM.L_HIP] = { x: 0.3, y: 0.6, z: 0, visibility: 0.9 };
    lm[LM.R_HIP] = { x: 0.5, y: 0.6, z: 0, visibility: 0.7 };
    const hip = hipCenter(lm);
    expect(hip.x).toBeCloseTo(0.4);
    expect(hip.y).toBeCloseTo(0.6);
    expect(hip.visibility).toBe(0.7);
  });

  it("returns default hipCenter for invalid array", () => {
    expect(hipCenter([])).toEqual({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 });
  });
});

describe("landmarks.ts - boundingBox()", () => {
  it("computes padded bounding box for visible pose landmarks", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
    lm[11] = { x: 0.3, y: 0.2, z: 0, visibility: 0.9 };
    lm[12] = { x: 0.7, y: 0.8, z: 0, visibility: 0.9 };
    const box = boundingBox(lm);
    expect(box.x).toBeCloseTo(0.27); // 0.3 - 0.03 pad
    expect(box.y).toBeCloseTo(0.17); // 0.2 - 0.03 pad
    expect(box.w).toBeCloseTo(0.46); // (0.7 + 0.03) - 0.27
    expect(box.h).toBeCloseTo(0.66); // (0.8 + 0.03) - 0.17
  });

  it("returns default fallback box when array is empty or all landmarks low visibility", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
    expect(boundingBox(lm)).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 });
    expect(boundingBox([])).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 });
  });
});

describe("landmarks.ts - Statistical Helpers (mean, std, range, clamp, pct)", () => {
  it("mean() computes average of finite numbers and ignores NaNs", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([2, NaN, 4, Infinity, 6])).toBe(4);
    expect(mean([])).toBe(0);
  });

  it("std() computes population standard deviation", () => {
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0);
    expect(std([5])).toBe(0);
    expect(std([])).toBe(0);
  });

  it("range() computes difference between max and min finite values", () => {
    expect(range([1, 5, 10])).toBe(9);
    expect(range([-5, 5])).toBe(10);
    expect(range([NaN, Infinity])).toBe(0);
  });

  it("clamp() restricts value within bounds [a, b]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(NaN, 0, 10)).toBe(0);
  });

  it("pct() formats numbers as percentage strings", () => {
    expect(pct(0.756)).toBe("76%");
    expect(pct(0.756, 1)).toBe("75.6%");
    expect(pct(NaN)).toBe("0%");
  });
});
```

---

### `src/lib/gait/__tests__/calibration.test.ts` (Design Template)

```ts
import { describe, it, expect } from "vitest";
import {
  calculateMillimetersPerPixel,
  computeCalibrationScale,
  applyCalibrationToPoint,
} from "../calibration";

describe("calibration.ts - calculateMillimetersPerPixel()", () => {
  it("calculates mm/px for standard credit card marker (85.6 mm)", () => {
    const scale = calculateMillimetersPerPixel("card", { width: 100, height: 50 });
    expect(scale).toBeCloseTo(0.856);
  });

  it("calculates mm/px for standard QR tag marker (50.0 mm)", () => {
    const scale = calculateMillimetersPerPixel("qr", { width: 100, height: 100 });
    expect(scale).toBeCloseTo(0.5);
  });

  it("calculates mm/px for standard AprilTag marker (100.0 mm)", () => {
    const scale = calculateMillimetersPerPixel("apriltag", { width: 200, height: 200 });
    expect(scale).toBeCloseTo(0.5);
  });

  it("defaults to credit card width (85.6 mm) for custom or unknown marker types", () => {
    const scale = calculateMillimetersPerPixel("custom", { width: 85.6, height: 85.6 });
    expect(scale).toBeCloseTo(1.0);
  });

  it("returns fallback 1.0 for zero or negative pixel width", () => {
    expect(calculateMillimetersPerPixel("card", { width: 0, height: 50 })).toBe(1.0);
    expect(calculateMillimetersPerPixel("card", { width: -10, height: 50 })).toBe(1.0);
  });

  it("returns fallback 1.0 for null or undefined pixel dimensions", () => {
    expect(calculateMillimetersPerPixel("card", null as any)).toBe(1.0);
    expect(calculateMillimetersPerPixel("card", undefined as any)).toBe(1.0);
  });
});

describe("calibration.ts - computeCalibrationScale()", () => {
  it("computes scale from pixel measurement and known physical mm length", () => {
    const res = computeCalibrationScale(100, 50);
    expect(res.mmPerPx).toBeCloseTo(0.5);
    expect(res.markerType).toBe("custom");
    expect(res.knownLengthMm).toBe(50);
    expect(res.markerPixels).toBe(100);
  });

  it("returns fallback scale 1.0 for zero or negative marker pixels or known length", () => {
    const resZeroPx = computeCalibrationScale(0, 50);
    expect(resZeroPx.mmPerPx).toBe(1.0);
    expect(resZeroPx.knownLengthMm).toBe(50);
    expect(resZeroPx.markerPixels).toBe(0);

    const resZeroMm = computeCalibrationScale(100, 0);
    expect(resZeroMm.mmPerPx).toBe(1.0);
    expect(resZeroMm.knownLengthMm).toBe(0);
    expect(resZeroMm.markerPixels).toBe(100);
  });
});

describe("calibration.ts - applyCalibrationToPoint()", () => {
  it("converts pixel coordinates to physical millimeters using scale factor", () => {
    const pt = applyCalibrationToPoint(100, 200, 0.5);
    expect(pt.xMm).toBeCloseTo(50);
    expect(pt.yMm).toBeCloseTo(100);
  });

  it("falls back to scale 1.0 for non-finite, zero, or negative scale factors", () => {
    expect(applyCalibrationToPoint(100, 200, 0)).toEqual({ xMm: 100, yMm: 200 });
    expect(applyCalibrationToPoint(100, 200, -0.5)).toEqual({ xMm: 100, yMm: 200 });
    expect(applyCalibrationToPoint(100, 200, NaN)).toEqual({ xMm: 100, yMm: 200 });
    expect(applyCalibrationToPoint(100, 200, Infinity)).toEqual({ xMm: 100, yMm: 200 });
  });

  it("handles origin point (0, 0)", () => {
    expect(applyCalibrationToPoint(0, 0, 0.5)).toEqual({ xMm: 0, yMm: 0 });
  });
});
```

---

## 5. Summary & Verification Instructions

### How to verify test implementation
When the implementation agent creates `landmarks.test.ts` and `calibration.test.ts`:
1. Run `npx vitest run src/lib/gait/__tests__/landmarks.test.ts`
2. Run `npx vitest run src/lib/gait/__tests__/calibration.test.ts`
3. Verify 100% pass rate with zero errors.
4. Run `npx tsc --noEmit` to verify type safety.

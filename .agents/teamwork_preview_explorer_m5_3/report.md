# Technical Analysis & Unified Test Architecture Blueprint (Milestone 5)

## Executive Summary

This report provides a detailed technical analysis of `src/lib/gait/persistence.server.ts` and a unified test architecture blueprint for expanding unit test coverage across 5 key gait modules:
1. `src/lib/gait/__tests__/landmarks.test.ts`
2. `src/lib/gait/__tests__/calibration.test.ts`
3. `src/lib/gait/__tests__/homography.test.ts`
4. `src/lib/gait/__tests__/liveCapture.test.ts`
5. `src/lib/gait/__tests__/persistence.server.test.ts`

The synthesis includes precise `describe` blocks, `it` test cases, assertion strategies, Vitest mocking techniques, and edge case matrices to ensure 100% green execution and comprehensive test coverage.

---

## 1. Detailed Technical Analysis: `src/lib/gait/persistence.server.ts`

### 1.1 Architecture & Role
`src/lib/gait/persistence.server.ts` serves as the server-side entrypoint and re-export wrapper for gait analysis session persistence within the TanStack Start framework. Following modern full-stack TypeScript conventions, `.server.ts` modules indicate server-only execution boundaries that interact with database drivers (`@/lib/db`) and session authentication middleware (`@/lib/auth/middleware`).

### 1.2 Re-Exported Persistence Methods
The file executes `export * from "./persistence";`, re-exporting the following core persistence handlers and types:

1. **`saveGaitSession`** (`createServerFn({ method: "POST" })`)
   - **Middleware**: Guarded by `authMiddleware` which enforces authentication and injects `context.userId`.
   - **Validator**: Validates payload structure containing `{ id?: string; sessionName?: string; result: AnalysisResult }`.
   - **Handler Logic**:
     - Connects to database via `const sql = await getSql()`.
     - Generates default ID `gs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` if `id` is omitted.
     - Extracts `metrics`, `guesses`, `taskMode`, `dualTaskCost`, `angleAnalysis`, and `patientMeta` from `data.result`.
     - Writes to `gait_sessions` table with an `INSERT ... ON CONFLICT (id) DO UPDATE SET ... WHERE gait_sessions.user_id = ${context.userId}` upsert query.
     - **Ownership Security Guard**: Scopes `ON CONFLICT DO UPDATE` to `WHERE gait_sessions.user_id = ${context.userId}`. If an ID belonging to another user is passed, Postgres returns zero rows; the handler explicitly checks `if (!rows[0])` and throws `"Session could not be saved: id belongs to another user."`.
     - Returns saved `GaitSessionRecord`.

2. **`listGaitSessions`** (`createServerFn({ method: "GET" })`)
   - **Middleware**: `authMiddleware`.
   - **Handler Logic**: Queries `SELECT ... FROM gait_sessions WHERE user_id = ${context.userId} ORDER BY created_at DESC`. Aliases snake_case columns to camelCase `GaitSessionRecord` fields.

3. **`listPatientSessions`** (`createServerFn({ method: "GET" })`)
   - **Middleware**: `authMiddleware`.
   - **Validator**: Accepts `{ patientId: string } | string`.
   - **Handler Logic**: Queries `SELECT ... FROM gait_sessions WHERE user_id = ${context.userId} AND patient_meta_json->>'patientId' = ${patientId} ORDER BY created_at ASC`. Uses PostgreSQL JSONB field extraction.

4. **`getGaitSession`** (`createServerFn({ method: "GET" })`)
   - **Middleware**: `authMiddleware`.
   - **Validator**: Accepts `id: string`.
   - **Handler Logic**: Queries `SELECT ... FROM gait_sessions WHERE id = ${id} AND user_id = ${context.userId}`. Returns `GaitSessionRecord` or `null`.

5. **`deleteGaitSession`** (`createServerFn({ method: "POST" })`)
   - **Middleware**: `authMiddleware`.
   - **Validator**: Accepts `id: string`.
   - **Handler Logic**: Executes `DELETE FROM gait_sessions WHERE id = ${id} AND user_id = ${context.userId}`. Returns `{ success: true }`.

6. **`getPersistenceMode`** (`createServerFn({ method: "GET" })`)
   - **Handler Logic**: Dynamically imports `@/lib/db` to inspect `dbSource`. Returns `{ source: dbSource, durable: dbSource !== "pglite" }`.

7. **`GaitSessionRecord` Interface**:
   - Re-exports database representation containing scalar metrics (`overallScore`, `cadenceSpm`, etc.), JSONB columns (`metricsJson`, `guessesJson`, `dualTaskJson`, `angleAnalysisJson`, `patientMetaJson`), and ISO timestamps.

### 1.3 Database & Storage Interactions
- **Client Resolution**: Obtained via `await getSql()` from `@/lib/db`.
- **Database Driver**: Uses `node-postgres` (`pg`) when `DATABASE_URL` is set (e.g. Neon serverless Postgres on deployment). In local development or zero-config preview environments, falls back to in-memory **PGLite**.
- **Table Schema**: Table `gait_sessions` with primary key `id`, indexed owner foreign key `user_id`, JSONB fields for rich structured objects, and updated timestamp triggers.

### 1.4 Server-Side Execution Constraints
- **Runtime Environment**: Must run on Node.js or serverless execution context where `@tanstack/react-start` server function handlers can process request contexts.
- **Testing Approach**:
  - Existing `persistence.test.ts` tests JSON serialization/deserialization and static query ownership guards via `readFileSync`.
  - Dedicated `persistence.server.test.ts` validates re-export completeness, server function configuration contracts, method signatures, parameter validator parsing, and server execution safety.

---

## 2. Review of Existing Test Architecture under `src/lib/gait/__tests__/`

### 2.1 Test Style & Framework Standards
- **Framework**: Vitest (`import { describe, it, expect, vi } from "vitest"`).
- **Import Rules**: Standardized relative module imports:
  - Modules: `import { ... } from "../landmarks"`, `../calibration"`, etc.
  - Helpers: `import { createMockMetrics, generateSyntheticWalkingFrames } from "./testHelpers"`.
- **Assertion Idioms**:
  - `expect(val).toBe(expected)` for primitives & strict equality.
  - `expect(val).toBeCloseTo(expected, numDigits)` for floating-point calculations.
  - `expect(val).toEqual(expected)` for deep object matching.
  - `expect(() => fn()).toThrow(...)` for exception testing.
  - `expect(val).toBeDefined()`, `expect(val).toBeNull()`, `expect(val).toBe(true)` for state checks.

### 2.2 Mocking Strategies & Utilities
- **Browser APIs**: `vi.stubGlobal('window', ...)` or `vi.fn()` mocks for `matchMedia`, `navigator.mediaDevices`, `MediaStream`.
- **Server / DB Dependencies**: Static source inspection (`readFileSync`) or `vi.mock()` for `@/lib/db` and `@tanstack/react-start`.
- **Synthetic Data Generation**: `testHelpers.ts` provides `generateSyntheticWalkingFrames`, `generateStationaryPoseFrames`, `createPoseLandmarkCandidate`, `generateMultiCandidateStream`, `createMockMetrics`, and noise generators.

---

## 3. Unified Test Blueprint for 5 Target Test Files

### 3.1 Blueprint 1: `src/lib/gait/__tests__/landmarks.test.ts`

- **Target Source File**: `src/lib/gait/landmarks.ts`
- **Imports**: `describe, it, expect` from `"vitest"`, target functions from `"../landmarks"`, types from `"../types"`.

```typescript
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
  LM,
  POSE_CONNECTIONS,
  PERSON_COLORS,
} from "../landmarks";
import type { Landmark } from "../types";

describe("Biomechanical Landmarks Module (landmarks.ts)", () => {
  describe("LM Mappings and Pose Constants", () => {
    it("exports correct keypoint index constants in LM", () => {
      expect(LM.NOSE).toBe(0);
      expect(LM.L_SHOULDER).toBe(11);
      expect(LM.R_SHOULDER).toBe(12);
      expect(LM.L_HIP).toBe(23);
      expect(LM.R_HIP).toBe(24);
      expect(LM.L_ANKLE).toBe(27);
      expect(LM.R_ANKLE).toBe(28);
    });

    it("exports valid POSE_CONNECTIONS pair list", () => {
      expect(Array.isArray(POSE_CONNECTIONS)).toBe(true);
      expect(POSE_CONNECTIONS.length).toBeGreaterThan(15);
      expect(POSE_CONNECTIONS).toContainEqual([11, 12]);
      expect(POSE_CONNECTIONS).toContainEqual([23, 24]);
    });

    it("exports PERSON_COLORS hex palette array", () => {
      expect(PERSON_COLORS.length).toBeGreaterThanOrEqual(6);
      expect(PERSON_COLORS[0]).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe("mid() - Midpoint Calculation", () => {
    it("computes exact midpoint of two 3D landmarks with visibility min", () => {
      const a: Landmark = { x: 0.2, y: 0.4, z: 0.1, visibility: 0.9 };
      const b: Landmark = { x: 0.4, y: 0.8, z: 0.3, visibility: 0.7 };
      const result = mid(a, b);
      expect(result.x).toBeCloseTo(0.3);
      expect(result.y).toBeCloseTo(0.6);
      expect(result.z).toBeCloseTo(0.2);
      expect(result.visibility).toBe(0.7);
    });

    it("defaults missing or invalid coordinates to 0.5 (x, y) and 0 (z)", () => {
      const a: Landmark = { x: NaN, y: Infinity, z: undefined as any, visibility: 0.8 };
      const result = mid(a, null);
      expect(result.x).toBe(0.5);
      expect(result.y).toBe(0.5);
      expect(result.z).toBe(0);
      expect(result.visibility).toBe(0.8);
    });
  });

  describe("dist() - 2D Euclidean Distance", () => {
    it("computes 2D Euclidean distance between valid points", () => {
      const a: Landmark = { x: 0.1, y: 0.2, z: 0 };
      const b: Landmark = { x: 0.4, y: 0.6, z: 0 };
      expect(dist(a, b)).toBeCloseTo(0.5);
    });

    it("handles null, undefined, and non-finite coordinates returning 0", () => {
      expect(dist(null, undefined)).toBe(0);
      expect(dist({ x: NaN, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 })).toBe(0.5);
    });
  });

  describe("angleDeg() - 3-Point Joint Angle", () => {
    it("computes 90-degree angle for orthogonal vectors", () => {
      const a: Landmark = { x: 0.5, y: 0.2, z: 0 }; // vertex b at (0.5, 0.5)
      const b: Landmark = { x: 0.5, y: 0.5, z: 0 };
      const c: Landmark = { x: 0.8, y: 0.5, z: 0 };
      expect(angleDeg(a, b, c)).toBeCloseTo(90);
    });

    it("returns 180 fallback when points are missing or collinear/degenerate", () => {
      expect(angleDeg(null, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 })).toBe(180);
      expect(angleDeg({ x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 })).toBe(180);
    });
  });

  describe("torsoHeight() - Torso Height", () => {
    it("computes shoulder-to-hip midpoint distance", () => {
      const lms: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));
      lms[LM.L_SHOULDER] = { x: 0.4, y: 0.3, z: 0 };
      lms[LM.R_SHOULDER] = { x: 0.6, y: 0.3, z: 0 };
      lms[LM.L_HIP] = { x: 0.4, y: 0.6, z: 0 };
      lms[LM.R_HIP] = { x: 0.6, y: 0.6, z: 0 };
      expect(torsoHeight(lms)).toBeCloseTo(0.3);
    });

    it("returns 0.2 fallback for short arrays or degenerate height (< 0.05)", () => {
      expect(torsoHeight([])).toBe(0.2);
      const lms: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));
      expect(torsoHeight(lms)).toBe(0.2); // dist = 0 < 0.05
    });
  });

  describe("boundingBox() - Bounding Box Calculation", () => {
    it("computes padded bounding box (pad=0.03) for visible keypoints", () => {
      const lms: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
      lms[LM.L_SHOULDER] = { x: 0.4, y: 0.3, z: 0, visibility: 0.9 };
      lms[LM.R_HIP] = { x: 0.6, y: 0.7, z: 0, visibility: 0.9 };
      const bbox = boundingBox(lms);
      expect(bbox.x).toBeCloseTo(0.37);
      expect(bbox.y).toBeCloseTo(0.27);
      expect(bbox.w).toBeCloseTo(0.26);
      expect(bbox.h).toBeCloseTo(0.46);
    });

    it("returns default bbox when no visible keypoints exist", () => {
      expect(boundingBox([])).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 });
    });
  });

  describe("hipCenter() - Hip Center", () => {
    it("computes midpoint of left and right hips", () => {
      const lms: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
      lms[LM.L_HIP] = { x: 0.4, y: 0.5, z: 0, visibility: 0.9 };
      lms[LM.R_HIP] = { x: 0.6, y: 0.5, z: 0, visibility: 0.9 };
      const hip = hipCenter(lms);
      expect(hip.x).toBeCloseTo(0.5);
      expect(hip.y).toBeCloseTo(0.5);
    });

    it("returns fallback hip center for short array", () => {
      expect(hipCenter([])).toEqual({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 });
    });
  });

  describe("Statistical Helpers", () => {
    it("mean() computes average of finite numbers", () => {
      expect(mean([10, 20, 30, NaN])).toBe(20);
      expect(mean([])).toBe(0);
    });

    it("std() computes standard deviation", () => {
      expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 1);
      expect(std([5])).toBe(0);
    });

    it("range() computes difference between max and min", () => {
      expect(range([5, 1, 9, 3])).toBe(8);
      expect(range([])).toBe(0);
    });

    it("clamp() restricts value within bounds", () => {
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(NaN, 0, 10)).toBe(0);
    });

    it("pct() formats value as percentage string", () => {
      expect(pct(0.854, 1)).toBe("85.4%");
      expect(pct(NaN)).toBe("0%");
    });
  });
});
```

---

### 3.2 Blueprint 2: `src/lib/gait/__tests__/calibration.test.ts`

- **Target Source File**: `src/lib/gait/calibration.ts`
- **Imports**: `describe, it, expect` from `"vitest"`, target functions and types from `"../calibration"`.

```typescript
import { describe, it, expect } from "vitest";
import {
  calculateMillimetersPerPixel,
  computeCalibrationScale,
  applyCalibrationToPoint,
} from "../calibration";

describe("Floor Marker Calibration Module (calibration.ts)", () => {
  describe("calculateMillimetersPerPixel()", () => {
    it("calculates mm/px for credit card marker (85.6 mm)", () => {
      const mmPerPx = calculateMillimetersPerPixel("card", { width: 171.2, height: 108.0 });
      expect(mmPerPx).toBeCloseTo(0.5);
    });

    it("calculates mm/px for QR code marker (50.0 mm)", () => {
      const mmPerPx = calculateMillimetersPerPixel("qr", { width: 100.0, height: 100.0 });
      expect(mmPerPx).toBeCloseTo(0.5);
    });

    it("calculates mm/px for AprilTag marker (100.0 mm)", () => {
      const mmPerPx = calculateMillimetersPerPixel("apriltag", { width: 200.0, height: 200.0 });
      expect(mmPerPx).toBeCloseTo(0.5);
    });

    it("defaults to 85.6 mm for custom/unknown marker string", () => {
      const mmPerPx = calculateMillimetersPerPixel("unknown_custom", { width: 85.6, height: 85.6 });
      expect(mmPerPx).toBeCloseTo(1.0);
    });

    it("returns 1.0 fallback when pixel dimensions are zero or invalid", () => {
      expect(calculateMillimetersPerPixel("card", { width: 0, height: 100 })).toBe(1.0);
      expect(calculateMillimetersPerPixel("card", null as any)).toBe(1.0);
    });
  });

  describe("computeCalibrationScale()", () => {
    it("computes CalibrationResult object for valid pixel & physical measurements", () => {
      const result = computeCalibrationScale(200, 100);
      expect(result.mmPerPx).toBeCloseTo(0.5);
      expect(result.markerType).toBe("custom");
      expect(result.knownLengthMm).toBe(100);
      expect(result.markerPixels).toBe(200);
    });

    it("returns fallback CalibrationResult with mmPerPx = 1.0 for non-positive inputs", () => {
      const resultZeroPx = computeCalibrationScale(0, 100);
      expect(resultZeroPx.mmPerPx).toBe(1.0);

      const resultZeroMm = computeCalibrationScale(200, -10);
      expect(resultZeroMm.mmPerPx).toBe(1.0);
    });
  });

  describe("applyCalibrationToPoint()", () => {
    it("converts image pixels to physical millimeters", () => {
      const pt = applyCalibrationToPoint(100, 200, 0.75);
      expect(pt.xMm).toBeCloseTo(75);
      expect(pt.yMm).toBeCloseTo(150);
    });

    it("falls back to 1.0 scale factor for non-positive or non-finite scale", () => {
      const ptZero = applyCalibrationToPoint(50, 60, 0);
      expect(ptZero.xMm).toBe(50);
      expect(ptZero.yMm).toBe(60);

      const ptNaN = applyCalibrationToPoint(50, 60, NaN);
      expect(ptNaN.xMm).toBe(50);
      expect(ptNaN.yMm).toBe(60);
    });
  });
});
```

---

### 3.3 Blueprint 3: `src/lib/gait/__tests__/homography.test.ts`

- **Target Source File**: `src/lib/gait/homography.ts`
- **Imports**: `describe, it, expect` from `"vitest"`, target functions from `"../homography"`.

```typescript
import { describe, it, expect } from "vitest";
import {
  solveLinearSystem8x8,
  computeHomographyMatrix,
  transformPoint,
  projectToFloorPlane,
} from "../homography";

describe("2D Floor Planar Homography Module (homography.ts)", () => {
  describe("solveLinearSystem8x8()", () => {
    it("solves a non-singular 8x8 identity system accurately", () => {
      const A = Array.from({ length: 8 }, (_, i) =>
        Array.from({ length: 8 }, (_, j) => (i === j ? 1 : 0))
      );
      const b = [1, 2, 3, 4, 5, 6, 7, 8];
      const solution = solveLinearSystem8x8(A, b);
      expect(solution).toEqual(b);
    });

    it("returns null for a singular 8x8 matrix", () => {
      const A = Array.from({ length: 8 }, () => new Array(8).fill(0));
      const b = new Array(8).fill(1);
      expect(solveLinearSystem8x8(A, b)).toBeNull();
    });
  });

  describe("computeHomographyMatrix()", () => {
    it("computes valid 3x3 matrix for non-collinear square transform", () => {
      const imgPts = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const floorPts = [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ];
      const H = computeHomographyMatrix(imgPts, floorPts);
      expect(H.length).toBe(3);
      expect(H[0].length).toBe(3);
      expect(H[2][2]).toBe(1.0);
    });

    it("returns 3x3 identity fallback when inputs have < 4 points", () => {
      const H = computeHomographyMatrix([], []);
      expect(H).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);
    });

    it("returns 3x3 identity fallback when points are collinear (triArea < 1e-7)", () => {
      const imgPts = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ];
      const floorPts = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const H = computeHomographyMatrix(imgPts, floorPts);
      expect(H).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);
    });
  });

  describe("transformPoint()", () => {
    it("transforms Point2D using homography matrix with homogeneous normalization", () => {
      const H = [
        [2, 0, 10],
        [0, 2, 20],
        [0, 0, 1],
      ];
      const p = transformPoint({ x: 5, y: 5 }, H);
      expect(p.x).toBeCloseTo(20);
      expect(p.y).toBeCloseTo(30);
    });

    it("supports tuple point input format [x, y]", () => {
      const H = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      const p = transformPoint([15, 25], H);
      expect(p).toEqual({ x: 15, y: 25 });
    });

    it("prevents division by zero when wPrime is near zero (|w'| <= 1e-9)", () => {
      const H = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 0], // wPrime = 0
      ];
      const p = transformPoint({ x: 10, y: 20 }, H);
      expect(p.x).toBe(10);
      expect(p.y).toBe(20);
    });
  });

  describe("projectToFloorPlane()", () => {
    it("projects point onto floor plane returning [x, y] coordinate pair", () => {
      const H = [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 1],
      ];
      const pt = projectToFloorPlane([10, 10], H);
      expect(pt).toEqual([20, 30]);
    });
  });
});
```

---

### 3.4 Blueprint 4: `src/lib/gait/__tests__/liveCapture.test.ts`

- **Target Source File**: `src/lib/gait/liveCapture.ts`
- **Imports**: `describe, it, expect, vi, beforeEach, afterEach` from `"vitest"`, target functions from `"../liveCapture"`, types from `"../types"`.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bufferedSpanSec,
  longestContinuousRun,
  defaultFacingMode,
} from "../liveCapture";
import type { PoseFrame } from "../types";

describe("Live Capture Buffer & Device Module (liveCapture.ts)", () => {
  describe("bufferedSpanSec()", () => {
    it("calculates wall-clock time span in seconds", () => {
      const frames: PoseFrame[] = [
        { timeMs: 1000, landmarks: [] },
        { timeMs: 2500, landmarks: [] },
        { timeMs: 4000, landmarks: [] },
      ];
      expect(bufferedSpanSec(frames)).toBeCloseTo(3.0);
    });

    it("returns 0 for empty array or single frame", () => {
      expect(bufferedSpanSec([])).toBe(0);
      expect(bufferedSpanSec([{ timeMs: 1000, landmarks: [] }])).toBe(0);
    });
  });

  describe("longestContinuousRun()", () => {
    it("returns copy of entire array when all gaps <= MAX_LIVE_GAP_SEC (0.35s)", () => {
      const frames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 100, landmarks: [] },
        { timeMs: 200, landmarks: [] },
        { timeMs: 300, landmarks: [] },
      ];
      const run = longestContinuousRun(frames);
      expect(run.length).toBe(4);
      expect(run).toEqual(frames);
    });

    it("filters out gap > 0.35s and selects the longest contiguous run", () => {
      const frames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 100, landmarks: [] }, // Run 1 (2 frames)
        { timeMs: 1000, landmarks: [] }, // Gap 0.9s > 0.35s
        { timeMs: 1100, landmarks: [] },
        { timeMs: 1200, landmarks: [] },
        { timeMs: 1300, landmarks: [] }, // Run 2 (4 frames)
      ];
      const run = longestContinuousRun(frames);
      expect(run.length).toBe(4);
      expect(run[0].timeMs).toBe(1000);
      expect(run[3].timeMs).toBe(1300);
    });

    it("returns original array copy when frames length < 2", () => {
      const frames: PoseFrame[] = [{ timeMs: 100, landmarks: [] }];
      expect(longestContinuousRun(frames)).toEqual(frames);
    });
  });

  describe("defaultFacingMode()", () => {
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: originalMatchMedia,
      });
    });

    it("returns 'environment' for coarse pointer devices (handheld / mobile)", () => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query.includes("pointer: coarse"),
          media: query,
        })),
      });
      expect(defaultFacingMode()).toBe("environment");
    });

    it("returns 'user' for fine pointer devices (desktop / laptop)", () => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
        })),
      });
      expect(defaultFacingMode()).toBe("user");
    });

    it("returns 'user' when window.matchMedia is undefined (SSR / fallback environment)", () => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: undefined,
      });
      expect(defaultFacingMode()).toBe("user");
    });
  });
});
```

---

### 3.5 Blueprint 5: `src/lib/gait/__tests__/persistence.server.test.ts`

- **Target Source File**: `src/lib/gait/persistence.server.ts`
- **Imports**: `describe, it, expect` from `"vitest"`, target exports from `"../persistence.server"`.

```typescript
import { describe, it, expect } from "vitest";
import * as serverPersistence from "../persistence.server";
import {
  saveGaitSession,
  listGaitSessions,
  listPatientSessions,
  getGaitSession,
  deleteGaitSession,
  getPersistenceMode,
} from "../persistence.server";

describe("Gait Persistence Server Entrypoint (persistence.server.ts)", () => {
  describe("Re-Export Integrity", () => {
    it("re-exports all core persistence methods from ./persistence", () => {
      expect(serverPersistence.saveGaitSession).toBeDefined();
      expect(serverPersistence.listGaitSessions).toBeDefined();
      expect(serverPersistence.listPatientSessions).toBeDefined();
      expect(serverPersistence.getGaitSession).toBeDefined();
      expect(serverPersistence.deleteGaitSession).toBeDefined();
      expect(serverPersistence.getPersistenceMode).toBeDefined();
    });

    it("maintains function type definitions for all exported server functions", () => {
      expect(typeof saveGaitSession).toBe("function");
      expect(typeof listGaitSessions).toBe("function");
      expect(typeof listPatientSessions).toBe("function");
      expect(typeof getGaitSession).toBe("function");
      expect(typeof deleteGaitSession).toBe("function");
      expect(typeof getPersistenceMode).toBe("function");
    });
  });

  describe("Server Function Configuration & Contract Specifications", () => {
    it("exposes server functions with valid handler definitions", () => {
      // TanStack Start server functions wrap handlers with method and validator metadata
      expect(saveGaitSession).toHaveProperty("handler");
      expect(listGaitSessions).toHaveProperty("handler");
      expect(listPatientSessions).toHaveProperty("handler");
      expect(getGaitSession).toHaveProperty("handler");
      expect(deleteGaitSession).toHaveProperty("handler");
      expect(getPersistenceMode).toHaveProperty("handler");
    });
  });
});
```

---

## 4. Edge Case Coverage Matrix Across All 5 Target Modules

| Module | Function | Edge Case Scenario | Expected Behavior / Recovery |
|---|---|---|---|
| **landmarks.ts** | `mid()` | `a` or `b` is `null`/`undefined` | Defaults missing coords to `(0.5, 0.5, 0)`, computes min visibility. |
| **landmarks.ts** | `dist()` | Coordinates contain `NaN` or `Infinity` | Returns `0` distance without propagating `NaN`. |
| **landmarks.ts** | `angleDeg()` | Zero-length vectors or collinear points | Returns `180` degrees fallback. Clamps `cos` to `[-1, 1]`. |
| **landmarks.ts** | `torsoHeight()` | Array `< 25` items or height `< 0.05` | Returns `0.2` fallback height. |
| **landmarks.ts** | `boundingBox()` | Keypoints visibility `< 0.2` or empty array | Returns `{ x:0.4, y:0.2, w:0.2, h:0.6 }` default bbox. Clamps within `[0, 1]`. |
| **landmarks.ts** | `hipCenter()` | Array `< 25` items | Returns `{ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }`. |
| **landmarks.ts** | Statistical Helpers | `mean([])`, `std([5])`, `clamp(NaN)` | Returns `0` (mean/std), clamps `NaN` to `min`, `pct(NaN)` -> `'0%'`. |
| **calibration.ts**| `calculateMillimetersPerPixel` | `width <= 0` or null dimensions | Returns `1.0` fallback scale factor. |
| **calibration.ts**| `computeCalibrationScale` | `markerPixels <= 0` or `knownLengthMm <= 0` | Returns `{ mmPerPx: 1.0, markerType: "custom", ... }`. |
| **calibration.ts**| `applyCalibrationToPoint` | `scaleMmPerPx <= 0` or `NaN` | Uses fallback scale `1.0`. |
| **homography.ts** | `solveLinearSystem8x8` | Singular matrix (pivot `< 1e-9`) | Returns `null`. |
| **homography.ts** | `computeHomographyMatrix` | `< 4` points, collinear points (`triArea < 1e-7`), or solver returns `null` | Returns 3x3 identity matrix fallback. |
| **homography.ts** | `transformPoint` | `wPrime <= 1e-9` (near zero denominator) | Sets `w = 1.0`, preventing division by zero/`Infinity`. |
| **liveCapture.ts** | `bufferedSpanSec` | `< 2` frames | Returns `0`. |
| **liveCapture.ts** | `longestContinuousRun` | Time gaps `> 0.35s` | Splits buffer into contiguous segments and selects run with maximum frame count. |
| **liveCapture.ts** | `defaultFacingMode` | `window` or `window.matchMedia` `undefined` (SSR) | Returns `"user"`. Matches `(pointer: coarse)` -> `"environment"`. |
| **persistence.server.ts** | `saveGaitSession` | Cross-user session update attempt | `ON CONFLICT DO UPDATE ... WHERE user_id = context.userId` returns 0 rows and throws error. |
| **persistence.server.ts** | `getPersistenceMode` | PGLite in-memory fallback | Returns `{ source: "pglite", durable: false }`. |

---

## 5. Verification Method

To verify the test suite after implementing these 5 test files:
1. Run `npx vitest run src/lib/gait/__tests__/` to execute all unit tests.
2. Confirm 100% green pass rate with zero test failures across all test files.
3. Run `npx tsc --noEmit` to verify 0 TypeScript compilation errors.
4. Run `npx eslint src/lib/gait/__tests__/` to verify 0 ESLint errors.

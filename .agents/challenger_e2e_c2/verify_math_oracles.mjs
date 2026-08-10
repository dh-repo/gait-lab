import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// 1. Savitzky-Golay 5-Point Filter Verification
// ---------------------------------------------------------------------------
function savitzkyGolay5(signal) {
  if (!signal || signal.length < 5) return signal ? [...signal] : [];
  const n = signal.length;
  const out = new Array(n);
  const coeffs = [-3, 12, 17, 12, -3];

  out[0] = signal[0];
  out[1] = signal[1];
  out[n - 2] = signal[n - 2];
  out[n - 1] = signal[n - 1];

  for (let i = 2; i < n - 2; i++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) {
      sum += coeffs[k + 2] * signal[i + k];
    }
    out[i] = sum / 35.0;
  }
  return out;
}

console.log("=== EMPIRICAL MATHEMATICAL VERIFICATION HARNESS ===");

// 1a. Linear Trend Preservation (y = 5x - 12)
const linear = Array.from({ length: 20 }, (_, i) => 5 * i - 12);
const sgLinear = savitzkyGolay5(linear);
for (let i = 2; i < linear.length - 2; i++) {
  assert.ok(Math.abs(sgLinear[i] - linear[i]) < 1e-10, `Linear preservation failed at idx ${i}: expected ${linear[i]}, got ${sgLinear[i]}`);
}
console.log("✔ SG 5-point Filter: Linear Trend Preservation Verified (Error < 1e-10)");

// 1b. Quadratic Trend Preservation (y = 2x^2 - 3x + 1)
const quadratic = Array.from({ length: 20 }, (_, i) => 2 * i * i - 3 * i + 1);
const sgQuad = savitzkyGolay5(quadratic);
for (let i = 2; i < quadratic.length - 2; i++) {
  assert.ok(Math.abs(sgQuad[i] - quadratic[i]) < 1e-10, `Quadratic preservation failed at idx ${i}: expected ${quadratic[i]}, got ${sgQuad[i]}`);
}
console.log("✔ SG 5-point Filter: Quadratic Trend Preservation Verified (Error < 1e-10)");

// 1c. Cubic Trend Preservation (y = x^3 - 4x^2 + 2x - 7)
const cubic = Array.from({ length: 20 }, (_, i) => i * i * i - 4 * i * i + 2 * i - 7);
const sgCubic = savitzkyGolay5(cubic);
for (let i = 2; i < cubic.length - 2; i++) {
  assert.ok(Math.abs(sgCubic[i] - cubic[i]) < 1e-10, `Cubic preservation failed at idx ${i}: expected ${cubic[i]}, got ${sgCubic[i]}`);
}
console.log("✔ SG 5-point Filter: Cubic Trend Preservation Verified (Error < 1e-10)");

// ---------------------------------------------------------------------------
// 2. 3x3 DLT Homography Solver Verification
// ---------------------------------------------------------------------------
function computeHomographyMatrix(imagePoints, floorPoints) {
  if (!imagePoints || !floorPoints || imagePoints.length < 4 || floorPoints.length < 4) {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  const p0 = imagePoints[0];
  const p1 = imagePoints[1];
  const p2 = imagePoints[2];
  const triArea = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y));

  if (triArea < 1e-7) {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  const N = Math.min(imagePoints.length, floorPoints.length);
  const A = [];
  const b = [];

  for (let i = 0; i < N; i++) {
    const x = imagePoints[i].x;
    const y = imagePoints[i].y;
    const X = floorPoints[i].x;
    const Y = floorPoints[i].y;

    A.push([-x, -y, -1, 0, 0, 0, x * X, y * X]);
    b.push(-X);

    A.push([0, 0, 0, -x, -y, -1, x * Y, y * Y]);
    b.push(-Y);
  }

  const hVec = solveLinearSystem8x8(A.slice(0, 8), b.slice(0, 8));
  if (!hVec) {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  return [
    [hVec[0], hVec[1], hVec[2]],
    [hVec[3], hVec[4], hVec[5]],
    [hVec[6], hVec[7], 1.0],
  ];
}

function solveLinearSystem8x8(A, b) {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(M[maxRow][i]) < 1e-9) return null;

    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    for (let k = i + 1; k < n; k++) {
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) {
          M[k][j] = 0;
        } else {
          M[k][j] += c * M[i][j];
        }
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) {
      M[k][n] -= M[k][i] * x[i];
    }
  }
  return x;
}

function transformPoint(point, H) {
  const x = point.x;
  const y = point.y;
  const xPrime = H[0][0] * x + H[0][1] * y + H[0][2];
  const yPrime = H[1][0] * x + H[1][1] * y + H[1][2];
  const wPrime = H[2][0] * x + H[2][1] * y + H[2][2];
  const w = Math.abs(wPrime) > 1e-9 ? wPrime : 1.0;
  return { x: xPrime / w, y: yPrime / w };
}

// 2a. Clean Perspective Mapping Test
const imgPts = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 350, y: 400 },
  { x: 50, y: 400 },
];
const flrPts = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 2000 },
  { x: 0, y: 2000 },
];
const H = computeHomographyMatrix(imgPts, flrPts);
for (let i = 0; i < 4; i++) {
  const t = transformPoint(imgPts[i], H);
  assert.ok(Math.abs(t.x - flrPts[i].x) < 1e-3, `Homography X mismatch at ${i}: expected ${flrPts[i].x}, got ${t.x}`);
  assert.ok(Math.abs(t.y - flrPts[i].y) < 1e-3, `Homography Y mismatch at ${i}: expected ${flrPts[i].y}, got ${t.y}`);
}
console.log("✔ 3x3 DLT Homography Matrix Solver: Trapezoidal-to-Rectangular Projection Verified (Error < 1e-3 mm)");

// 2b. Collinear Degeneracy Test
const collinear = [
  { x: 10, y: 20 },
  { x: 20, y: 40 },
  { x: 30, y: 60 },
  { x: 40, y: 80 },
];
const Hcollinear = computeHomographyMatrix(collinear, flrPts);
assert.deepEqual(Hcollinear, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
console.log("✔ 3x3 DLT Homography Matrix Solver: Collinear Input Safe Identity Fallback Verified");

// ---------------------------------------------------------------------------
// 3. mm/px Floor Calibration Scaling Verification
// ---------------------------------------------------------------------------
function calculateMillimetersPerPixel(markerType, pixelDimensions) {
  if (!pixelDimensions || pixelDimensions.width <= 0) return 1.0;
  let physicalWidthMm = 85.6;
  if (markerType === "qr") physicalWidthMm = 50.0;
  else if (markerType === "apriltag") physicalWidthMm = 100.0;
  return physicalWidthMm / pixelDimensions.width;
}

assert.equal(calculateMillimetersPerPixel("card", { width: 100, height: 60 }), 0.856);
assert.equal(calculateMillimetersPerPixel("qr", { width: 200, height: 200 }), 0.25);
assert.equal(calculateMillimetersPerPixel("apriltag", { width: 400, height: 400 }), 0.25);
assert.equal(calculateMillimetersPerPixel("card", { width: 0, height: 100 }), 1.0);
assert.equal(calculateMillimetersPerPixel("card", { width: -10, height: 100 }), 1.0);
assert.equal(calculateMillimetersPerPixel("card", null), 1.0);
console.log("✔ mm/px Floor Calibration: Card (85.6mm), QR (50mm), AprilTag (100mm), and Zero/Invalid Inputs Verified");

// ---------------------------------------------------------------------------
// 4. Steady-State Stride Filtering Verification
// ---------------------------------------------------------------------------
function filterSteadyStateStrides(strideIntervals) {
  if (!strideIntervals || strideIntervals.length === 0) return { steadyStrides: [], excludedCount: 0 };
  if (strideIntervals.length < 3) return { steadyStrides: [...strideIntervals], excludedCount: 0 };

  const sorted = [...strideIntervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  let startIndex = 0;
  let endIndex = strideIntervals.length - 1;

  while (startIndex < endIndex && Math.abs(strideIntervals[startIndex] - median) / median > 0.25) {
    startIndex++;
  }
  while (endIndex > startIndex && Math.abs(strideIntervals[endIndex] - median) / median > 0.25) {
    endIndex--;
  }

  const steadyStrides = strideIntervals.slice(startIndex, endIndex + 1);
  const excludedCount = strideIntervals.length - steadyStrides.length;

  return { steadyStrides, excludedCount };
}

const runway = [1.20, 0.90, 0.62, 0.60, 0.61, 0.59, 0.60, 1.15];
const resRunway = filterSteadyStateStrides(runway);
assert.deepEqual(resRunway.steadyStrides, [0.62, 0.60, 0.61, 0.59, 0.60]);
assert.equal(resRunway.excludedCount, 3);
console.log("✔ Steady-State Stride Filtering: Initial Accel & Terminal Decel Exclusion Verified");

console.log("=== ALL EMPIRICAL VERIFICATION TESTS PASSED ===");

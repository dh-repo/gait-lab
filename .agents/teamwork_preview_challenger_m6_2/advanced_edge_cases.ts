import assert from "node:assert";
import { computeFFTHarmonics } from "../../src/lib/gait/signal";
import { computeHarmonicRatio } from "../../src/lib/gait/smoothness";

console.log("=== ADVANCED EDGE-CASE PROBING ===");

// 1. Check centerBin = 0 handling
const resZeroBin = computeFFTHarmonics(Array.from({ length: 64 }, (_, i) => Math.sin(0.0001 * i)), 30, 0.001, 10);
console.log("Very small strideFreq (0.001 Hz) -> centerBin 0:", resZeroBin);
assert(Number.isFinite(resZeroBin.harmonicRatio), "resZeroBin not finite");

// 2. Check high strideFreq (e.g. 50 Hz, above Nyquist)
const resHighFreq = computeFFTHarmonics(Array.from({ length: 64 }, (_, i) => Math.sin(i)), 30, 50, 10);
console.log("High strideFreq (50 Hz) -> centerBin >= halfSize:", resHighFreq);
assert(Number.isFinite(resHighFreq.harmonicRatio), "resHighFreq not finite");

// 3. Check numHarmonics = 0
const resZeroHarm = computeFFTHarmonics(Array.from({ length: 64 }, (_, i) => Math.sin(i)), 30, 1.0, 0);
console.log("numHarmonics = 0:", resZeroHarm);
assert.strictEqual(resZeroHarm.evenSum, 0);
assert.strictEqual(resZeroHarm.oddSum, 0);

// 4. Check computeHarmonicRatio with extreme/invalid inputs
const hr1 = computeHarmonicRatio([], [], 30);
assert.deepStrictEqual(hr1, { hrVertical: 1.0, hrLateral: 1.0, overallHR: 1.0 });

const hr2 = computeHarmonicRatio(Array(10).fill(1), Array(10).fill(1), -5);
assert.deepStrictEqual(hr2, { hrVertical: 1.0, hrLateral: 1.0, overallHR: 1.0 });

const hr3 = computeHarmonicRatio(Array(100).fill(0), Array(100).fill(0), 30, 1.0);
console.log("All zero signals computeHarmonicRatio:", hr3);
assert.strictEqual(hr3.hrVertical, 0.1);
assert.strictEqual(hr3.hrLateral, 0.1);
assert.strictEqual(hr3.overallHR, 0.1);

console.log("ALL ADVANCED EDGE-CASE TESTS PASSED!");

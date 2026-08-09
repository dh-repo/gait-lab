import assert from "node:assert";
import { computeFFTHarmonics } from "../../src/lib/gait/signal";
import { computeHarmonicRatio } from "../../src/lib/gait/smoothness";

console.log("==========================================================================");
console.log("STARTING EMPIRICAL STRESS TESTS FOR MILESTONE M6");
console.log("==========================================================================");

let totalPassed = 0;
let totalFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    totalPassed++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(err.stack || err);
    totalFailed++;
  }
}

// -----------------------------------------------------------------------------
// 1. Array Edge Cases & Signal Lengths
// -----------------------------------------------------------------------------
runTest("Short signals < 8 samples return safe default", () => {
  assert.deepStrictEqual(computeFFTHarmonics([]), { evenSum: 0, oddSum: 0, harmonicRatio: 1.0 });
  assert.deepStrictEqual(computeFFTHarmonics([1, 2, 3]), { evenSum: 0, oddSum: 0, harmonicRatio: 1.0 });
  assert.deepStrictEqual(computeFFTHarmonics(new Array(7).fill(1.5)), { evenSum: 0, oddSum: 0, harmonicRatio: 1.0 });
});

runTest("Short signals < 30 samples (N=8..29) execute without crashing or NaN", () => {
  const shortLengths = [8, 9, 10, 15, 20, 25, 29];
  for (const len of shortLengths) {
    const data = Array.from({ length: len }, (_, i) => Math.sin((2 * Math.PI * i) / 10));
    const res = computeFFTHarmonics(data, 30, 1.0, 10);
    assert(!Number.isNaN(res.evenSum), `N=${len} evenSum is NaN`);
    assert(!Number.isNaN(res.oddSum), `N=${len} oddSum is NaN`);
    assert(!Number.isNaN(res.harmonicRatio), `N=${len} harmonicRatio is NaN`);
    assert(Number.isFinite(res.harmonicRatio), `N=${len} harmonicRatio not finite`);
  }
});

runTest("Long signals > 1000 samples (N=1001..4096) execute accurately", () => {
  const longLengths = [1001, 1024, 2000, 4096];
  for (const len of longLengths) {
    const data = Array.from({ length: len }, (_, i) =>
      Math.sin((2 * Math.PI * 2 * i) / 30) + 0.2 * Math.sin((2 * Math.PI * 1 * i) / 30)
    );
    const res = computeFFTHarmonics(data, 30, 1.0, 10);
    assert(res.evenSum > res.oddSum, `N=${len} evenSum (${res.evenSum}) should be > oddSum (${res.oddSum})`);
    assert(res.harmonicRatio > 1.0, `N=${len} HR (${res.harmonicRatio}) should be > 1.0`);
    assert(Number.isFinite(res.harmonicRatio), `N=${len} HR not finite`);
  }
});

runTest("Prime signal lengths zero-padded to FFT size work correctly", () => {
  const primeLengths = [17, 31, 53, 97, 127, 257, 521, 1009];
  for (const len of primeLengths) {
    const data = Array.from({ length: len }, (_, i) => Math.sin((2 * Math.PI * 2 * i) / 30));
    const res = computeFFTHarmonics(data, 30, 1.0, 10);
    assert(Number.isFinite(res.harmonicRatio), `N=${len} HR not finite`);
    assert(res.evenSum > res.oddSum, `N=${len} evenSum should be > oddSum`);
  }
});

// -----------------------------------------------------------------------------
// 2. Special Signal Contents
// -----------------------------------------------------------------------------
runTest("Zero power signal (all 0s) returns harmonicRatio = 0 without NaN", () => {
  const data = new Array(100).fill(0);
  const res = computeFFTHarmonics(data, 30, 1.0, 10);
  assert.strictEqual(res.evenSum, 0);
  assert.strictEqual(res.oddSum, 0);
  assert.strictEqual(res.harmonicRatio, 0);
});

runTest("Constant DC offset (all 5s or all 100s) returns harmonicRatio = 0", () => {
  const data = new Array(100).fill(42.5);
  const res = computeFFTHarmonics(data, 30, 1.0, 10);
  assert(Math.abs(res.evenSum) < 1e-5, `evenSum was ${res.evenSum}`);
  assert(Math.abs(res.oddSum) < 1e-5, `oddSum was ${res.oddSum}`);
  assert(Math.abs(res.harmonicRatio) < 1e-5, `HR was ${res.harmonicRatio}`);
});

runTest("Pure linear trend is detrended and produces zero harmonic power", () => {
  const data = Array.from({ length: 100 }, (_, i) => 2.5 * i + 10);
  const res = computeFFTHarmonics(data, 30, 1.0, 10);
  assert(Math.abs(res.evenSum) < 1e-5, `evenSum was ${res.evenSum}`);
  assert(Math.abs(res.oddSum) < 1e-5, `oddSum was ${res.oddSum}`);
});

runTest("Extreme Gaussian/White Noise produces finite ratios without crashing", () => {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const noise = Array.from({ length: 300 }, () => (rnd() - 0.5) * 1000);
  const res = computeFFTHarmonics(noise, 30, 1.0, 10);
  assert(Number.isFinite(res.evenSum));
  assert(Number.isFinite(res.oddSum));
  assert(Number.isFinite(res.harmonicRatio));
});

runTest("Signal with single huge spike (impulse)", () => {
  const data = new Array(100).fill(0);
  data[50] = 1e6;
  const res = computeFFTHarmonics(data, 30, 1.0, 10);
  assert(Number.isFinite(res.harmonicRatio));
});

// -----------------------------------------------------------------------------
// 3. Spectral Leakage & Fractional Bin Frequencies
// -----------------------------------------------------------------------------
runTest("Fractional bin frequency (signal freq falls between FFT bins)", () => {
  const fps = 30;
  const N = 128;
  const targetFreq = 8.5 * (fps / N); // 1.9921875 Hz (fractional bin 8.5)
  const strideFreq = targetFreq / 2;

  const data = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * targetFreq * i) / fps));
  const res = computeFFTHarmonics(data, fps, strideFreq, 10);
  
  assert(res.evenSum > 0.1, `evenSum was ${res.evenSum}`);
  assert(res.harmonicRatio > 10, `HR was ${res.harmonicRatio}`);
});

runTest("3-bin neighborhood summation recovers energy for fractional bin frequencies", () => {
  const fps = 30;
  const N = 128;
  const intFreq = 8.0 * (fps / N);
  const fracFreq = 8.5 * (fps / N);

  const intData = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * intFreq * i) / fps));
  const fracData = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * fracFreq * i) / fps));

  const resInt = computeFFTHarmonics(intData, fps, intFreq / 2, 10);
  const resFrac = computeFFTHarmonics(fracData, fps, fracFreq / 2, 10);

  const energyRatio = resFrac.evenSum / resInt.evenSum;
  console.log(`  Energy recovery ratio for fractional bin 8.5 vs integer bin 8: ${(energyRatio * 100).toFixed(2)}%`);
  assert(energyRatio > 0.70, `Energy recovery ratio ${energyRatio} should be > 0.70`);
});

runTest("Overlapping bin neighborhoods for low f0 or small FFT size", () => {
  const data = Array.from({ length: 16 }, (_, i) => Math.sin((2 * Math.PI * 1.6 * i) / 30));
  const res = computeFFTHarmonics(data, 30, 0.8, 5);
  assert(Number.isFinite(res.harmonicRatio));
  assert(res.evenSum > 0);
});

// -----------------------------------------------------------------------------
// 4. Biomechanical Validity & Smoothness HR Module Integration
// -----------------------------------------------------------------------------
runTest("Symmetric gait vertical displacement produces high HR", () => {
  const fps = 30;
  const N = 180;
  const meanStrideSec = 1.0;

  const hipY = Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * 2 * (i / fps))) * 0.05);
  const hipX = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * 1 * (i / fps))) * 0.03);

  const { hrVertical, hrLateral, overallHR } = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);
  console.log(`  Symmetric gait -> hrVertical: ${hrVertical}, hrLateral: ${hrLateral}, overallHR: ${overallHR}`);
  assert(hrVertical > 3.0, `hrVertical (${hrVertical}) should be > 3.0`);
  assert(hrLateral > 3.0, `hrLateral (${hrLateral}) should be > 3.0`);
  assert(overallHR > 3.0, `overallHR (${overallHR}) should be > 3.0`);
});

runTest("Asymmetric gait (injecting 1 Hz stride harmonic into hipY) drops vertical HR", () => {
  const fps = 30;
  const N = 180;
  const meanStrideSec = 1.0;

  const hipY = Array.from({ length: N }, (_, i) =>
    Math.sin((2 * Math.PI * 2 * (i / fps))) * 0.05 +
    Math.sin((2 * Math.PI * 1 * (i / fps))) * 0.05
  );
  const hipX = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * 1 * (i / fps))) * 0.03);

  const { hrVertical } = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);
  console.log(`  Asymmetric gait -> hrVertical: ${hrVertical}`);
  assert(hrVertical < 1.8, `hrVertical (${hrVertical}) should be < 1.8`);
});

// -----------------------------------------------------------------------------
// 5. Parameter Boundary Checks & Legacy Compatibility
// -----------------------------------------------------------------------------
runTest("fps <= 16 with undefined strideFreq triggers legacy signature check", () => {
  const data = Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * i) / 8));
  const res = computeFFTHarmonics(data, 10);
  assert(Number.isFinite(res.harmonicRatio));
});

runTest("fps <= 16 WITH explicit strideFreq is treated as actual fps = 15", () => {
  const data = Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * i) / 8));
  const res = computeFFTHarmonics(data, 15, 1.0, 8);
  assert(Number.isFinite(res.harmonicRatio));
});

runTest("Invalid strideFreq (undefined, <= 0) falls back gracefully to peak search", () => {
  const data = Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * 4 * i) / 64));
  const res1 = computeFFTHarmonics(data, 30, undefined, 10);
  const res2 = computeFFTHarmonics(data, 30, -1.0, 10);
  assert(res1.harmonicRatio > 1.0);
  assert(res2.harmonicRatio > 1.0);
});

console.log("==========================================================================");
console.log(`SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log("==========================================================================");

if (totalFailed > 0) {
  process.exit(1);
}

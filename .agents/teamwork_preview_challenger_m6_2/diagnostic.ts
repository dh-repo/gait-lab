import { computeFFTHarmonics } from "../../src/lib/gait/signal";

console.log("=== DIAGNOSTIC 1: N=17 Prime Length Signal ===");
for (const N of [17, 30, 60, 120]) {
  const data = Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * 2 * i) / 30));
  const res = computeFFTHarmonics(data, 30, 1.0, 10);
  console.log(`N=${N} (Duration: ${(N/30).toFixed(2)}s) -> evenSum: ${res.evenSum.toFixed(4)}, oddSum: ${res.oddSum.toFixed(4)}, HR: ${res.harmonicRatio.toFixed(4)}`);
}

console.log("\n=== DIAGNOSTIC 2: Fallback Peak Search vs Explicit StrideFreq ===");
const data = Array.from({ length: 120 }, (_, i) => Math.sin((2 * Math.PI * 2 * i) / 30)); // 2 Hz sine wave (step freq)
const resExplicit = computeFFTHarmonics(data, 30, 1.0, 10); // f0 = 1.0 Hz (stride freq)
const resFallback = computeFFTHarmonics(data, 30, undefined, 10); // fallback peak search

console.log(`Explicit f0=1.0 Hz -> evenSum: ${resExplicit.evenSum.toFixed(4)}, oddSum: ${resExplicit.oddSum.toFixed(4)}, HR: ${resExplicit.harmonicRatio.toFixed(4)}`);
console.log(`Fallback (no f0) -> evenSum: ${resFallback.evenSum.toFixed(4)}, oddSum: ${resFallback.oddSum.toFixed(4)}, HR: ${resFallback.harmonicRatio.toFixed(4)}`);

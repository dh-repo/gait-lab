import { butterworthLowPass, zeroPhaseButterworth, linearDetrend, computeFFTHarmonics } from "../../src/lib/gait/signal";
import { symmetryAngle, gaitSymmetryIndex } from "../../src/lib/gait/symmetry";
import { computeHarmonicRatio } from "../../src/lib/gait/smoothness";
import { calculateDTE } from "../../src/lib/gait/dte";
import type { GaitMetrics } from "../../src/lib/gait/types";

console.log("=== EMPIRICAL MATHEMATICAL FIDELITY CHECK ===");

// 1. Check Symmetry Angle (SA) properties
const sa1 = symmetryAngle(10, 10);
const sa2 = symmetryAngle(10, 20);
const sa3 = symmetryAngle(20, 10); // Reference-free invariance check
const sa4 = symmetryAngle(0, 0);

console.log(`SA(10, 10) = ${sa1}% (Expected: 0.00%)`);
console.log(`SA(10, 20) = ${sa2}% (Expected: 20.48%)`);
console.log(`SA(20, 10) = ${sa3}% (Expected: 20.48% — invariant)`);
console.log(`SA(0, 0) = ${sa4}% (Expected: 0.00%)`);

if (sa1 !== 0.0 || sa2 !== 20.48 || sa3 !== 20.48 || sa4 !== 0.0) {
  console.error("ERROR: Symmetry Angle formula mismatch!");
  process.exit(1);
}

// 2. Check Gait Symmetry Index (GSI)
const gsi1 = gaitSymmetryIndex(10, 10);
const gsi2 = gaitSymmetryIndex(10, 20);
console.log(`GSI(10, 10) = ${gsi1}% (Expected: 100.00%)`);
console.log(`GSI(10, 20) = ${gsi2}% (Expected: 50.00%)`);

if (gsi1 !== 100.0 || gsi2 !== 50.0) {
  console.error("ERROR: GSI formula mismatch!");
  process.exit(1);
}

// 3. Check DTE formulas
const mockBase: Partial<GaitMetrics> = {
  cadenceSpm: 100,
  stepTimeCV: 0.05,
  symmetryScore: 80,
};

const mockDual: Partial<GaitMetrics> = {
  cadenceSpm: 90, // -10% decline
  stepTimeCV: 0.075, // +50% increase in CV -> -50% decline in stability
  symmetryScore: 72, // -10% decline
};

const dte = calculateDTE(mockBase as GaitMetrics, mockDual as GaitMetrics);
console.log("DTE Analysis:", dte);

if (dte.cadenceDTE !== -10.0) {
  console.error(`ERROR: Cadence DTE expected -10.0, got ${dte.cadenceDTE}`);
  process.exit(1);
}

if (dte.stepTimeCvDTE !== -50.0) {
  console.error(`ERROR: Step Time CV DTE expected -50.0, got ${dte.stepTimeCvDTE}`);
  process.exit(1);
}

if (dte.cmiClassification !== "mutual_interference") {
  console.error(`ERROR: CMI expected mutual_interference, got ${dte.cmiClassification}`);
  process.exit(1);
}

// 4. Check OLS linear detrending on a linear signal y = 2 + 3*i
const n = 20;
const linearSignal = Array.from({ length: n }, (_, i) => 2 + 3 * i);
const { detrended, trend } = linearDetrend(linearSignal);
const maxDetrendedErr = Math.max(...detrended.map(Math.abs));
console.log(`Linear Detrend Max Error on Pure Slope: ${maxDetrendedErr.toExponential(4)} (Expected: ~0)`);

if (maxDetrendedErr > 1e-10) {
  console.error("ERROR: OLS linear detrend failed on pure linear slope!");
  process.exit(1);
}

// 5. Check Zero-Phase Butterworth Filter on DC signal (interior point)
const dcSignal = Array.from({ length: 50 }, () => 5.0);
const filteredDC = zeroPhaseButterworth(dcSignal, 30, 6.0);
const interiorDcErr = Math.abs(filteredDC[25] - 5.0);
console.log(`Zero-phase Butterworth DC Preservation Interior Error: ${interiorDcErr.toExponential(4)} (Expected: ~0)`);

if (interiorDcErr > 1e-4) {
  console.error("ERROR: Zero-phase Butterworth failed DC preservation!");
  process.exit(1);
}

console.log("=== ALL EMPIRICAL MATHEMATICAL CHECKS PASSED PERFECTLY ===");

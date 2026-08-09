import { butterworthLowPass, zeroPhaseButterworth, linearDetrend, computeFFTHarmonics } from "../../src/lib/gait/signal";
import { detectGaitEventsZeni } from "../../src/lib/gait/events";
import { symmetryAngle, gaitSymmetryIndex } from "../../src/lib/gait/symmetry";
import { computeHarmonicRatio } from "../../src/lib/gait/smoothness";
import { calculateDTE } from "../../src/lib/gait/dte";
import type { PoseFrame, GaitMetrics } from "../../src/lib/gait/types";
import { LM } from "../../src/lib/gait/landmarks";

console.log("=== EMPIRICAL STRESS TEST HARNESS — GAIT-LAB M1 ALGORITHMS ===");

let passedCount = 0;
let failedCount = 0;
const findings: { id: string; category: string; severity: string; description: string; evidence: string }[] = [];

function assert(condition: boolean, testId: string, testName: string, detail: string, severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "MEDIUM") {
  if (condition) {
    passedCount++;
    console.log(`[PASS] [${testId}] ${testName}`);
  } else {
    failedCount++;
    const msg = `[FAIL] [${testId}] ${testName}: ${detail}`;
    console.error(msg);
    findings.push({
      id: testId,
      category: testId.split("-")[0],
      severity,
      description: testName,
      evidence: detail,
    });
  }
}

// -----------------------------------------------------------------------------
// 1. SIGNAL FILTERING (signal.ts)
// -----------------------------------------------------------------------------
console.log("\n--- 1. Testing Signal Filtering (signal.ts) ---");

// Test 1.1: Short arrays & edge bounds
try {
  const emptyRes = zeroPhaseButterworth([], 30, 6.0);
  assert(Array.isArray(emptyRes) && emptyRes.length === 0, "SIG-1.1a", "Empty array input", `Expected [], got ${JSON.stringify(emptyRes)}`);
  
  const short1 = zeroPhaseButterworth([10], 30, 6.0);
  assert(short1.length === 1 && short1[0] === 10, "SIG-1.1b", "1-element array input", `Expected [10], got ${JSON.stringify(short1)}`);

  const short4 = zeroPhaseButterworth([1, 2, 3, 4], 30, 6.0);
  assert(short4.length === 4 && JSON.stringify(short4) === JSON.stringify([1, 2, 3, 4]), "SIG-1.1c", "4-element array (length < 5)", `Expected original array copy, got ${JSON.stringify(short4)}`);
} catch (e: any) {
  assert(false, "SIG-1.1", "Short array handling", `Threw exception: ${e.message}`, "HIGH");
}

// Test 1.2: Zero vectors & constant signals
try {
  const zeroVec = new Array(100).fill(0);
  const filteredZeros = zeroPhaseButterworth(zeroVec, 30, 6.0);
  const maxAbsZero = Math.max(...filteredZeros.map(Math.abs));
  assert(filteredZeros.length === 100 && maxAbsZero < 1e-12, "SIG-1.2a", "Zero vector filtering", `Max abs error: ${maxAbsZero}`);

  const constVec = new Array(100).fill(42.5);
  const filteredConst = zeroPhaseButterworth(constVec, 30, 6.0);
  const maxConstErr = Math.max(...filteredConst.map(v => Math.abs(v - 42.5)));
  assert(maxConstErr < 1e-4, "SIG-1.2b", "Constant vector filtering boundary artifact", `Max deviation from 42.5: ${maxConstErr.toFixed(6)}. Transient step response leak due to zero initial condition state in applyBiquad and padLen=12.`, "MEDIUM");
} catch (e: any) {
  assert(false, "SIG-1.2", "Zero/constant signal handling", `Threw exception: ${e.message}`, "HIGH");
}

// Test 1.3: Extreme Noise & Frequency Attenuation
try {
  const fps = 30;
  const N = 150;
  const cleanSignal = new Array(N);
  const noisySignal = new Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / fps;
    const s1Hz = Math.sin(2 * Math.PI * 1.0 * t);
    const s12Hz = 2.0 * Math.sin(2 * Math.PI * 12.0 * t);
    cleanSignal[i] = s1Hz;
    noisySignal[i] = s1Hz + s12Hz;
  }
  const filtered = zeroPhaseButterworth(noisySignal, fps, 6.0);
  
  let rmsErr = 0;
  for (let i = 15; i < N - 15; i++) {
    rmsErr += Math.pow(filtered[i] - cleanSignal[i], 2);
  }
  rmsErr = Math.sqrt(rmsErr / (N - 30));

  let rmsNoisy = 0;
  for (let i = 15; i < N - 15; i++) {
    rmsNoisy += Math.pow(noisySignal[i] - cleanSignal[i], 2);
  }
  rmsNoisy = Math.sqrt(rmsNoisy / (N - 30));

  assert(rmsErr < 0.25 && rmsErr < rmsNoisy * 0.2, "SIG-1.3", "Extreme noise suppression (fc=6Hz)", `Clean RMS err: ${rmsErr.toFixed(4)}, Noisy RMS: ${rmsNoisy.toFixed(4)}`);
} catch (e: any) {
  assert(false, "SIG-1.3", "Extreme noise filtering", `Threw exception: ${e.message}`, "HIGH");
}

// Test 1.4: NaNs and Infinities
try {
  const nanVec = [1.0, 2.0, NaN, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
  const filteredNaN = zeroPhaseButterworth(nanVec, 30, 6.0);
  const hasNaN = filteredNaN.some(v => Number.isNaN(v));
  assert(filteredNaN.length === 10, "SIG-1.4a", "NaN array length preservation", `Length: ${filteredNaN.length}`);
  assert(!hasNaN, "SIG-1.4b", "NaN propagation resistance", `Array contains NaN values after filtering: ${JSON.stringify(filteredNaN)}`, "MEDIUM");
} catch (e: any) {
  assert(false, "SIG-1.4", "NaN handling crash test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 1.5: Linear Detrend
try {
  const N = 50;
  // Pure linear trend
  const pureLinear = Array.from({ length: N }, (_, i) => 3.0 + 0.5 * i);
  const { detrended: dPure, trend: tPure } = linearDetrend(pureLinear);
  const alphaPure = tPure(0);
  const betaPure = tPure(1) - tPure(0);
  assert(Math.abs(alphaPure - 3.0) < 1e-6 && Math.abs(betaPure - 0.5) < 1e-6, "SIG-1.5a", "Pure linear detrend exact recovery", `alpha=${alphaPure}, beta=${betaPure}`);

  // Linear trend + sinusoidal component
  const trendSignal = Array.from({ length: N }, (_, i) => 3.0 + 0.5 * i + Math.sin(i * 0.5));
  const { detrended, trend } = linearDetrend(trendSignal);
  assert(detrended.length === N, "SIG-1.5b", "Detrended length match", `Got length ${detrended.length}`);
} catch (e: any) {
  assert(false, "SIG-1.5", "Linear detrend test", `Threw exception: ${e.message}`, "HIGH");
}


// -----------------------------------------------------------------------------
// 2. ZENI GAIT EVENT DETECTION (events.ts)
// -----------------------------------------------------------------------------
console.log("\n--- 2. Testing Zeni Event Detection (events.ts) ---");

function createMockPoseFrames(options: {
  numFrames: number;
  fps: number;
  direction: 1 | -1;
  stepFreqHz?: number;
  missingLandmarks?: boolean;
  variableStride?: boolean;
}): PoseFrame[] {
  const { numFrames, fps, direction, stepFreqHz = 2.0, missingLandmarks = false, variableStride = false } = options;
  const frames: PoseFrame[] = [];

  for (let i = 0; i < numFrames; i++) {
    const t = i / fps;
    const hipX = 0.5 + direction * 0.8 * t;
    const hipY = 0.9;

    let strideMult = 1.0;
    if (variableStride && i > numFrames / 2) {
      strideMult = 1.5;
    }

    const lPhase = 2 * Math.PI * (stepFreqHz / 2) * t;
    const rPhase = lPhase + Math.PI;

    const amp = 0.15 * strideMult;
    const lHeelX = hipX + direction * amp * Math.sin(lPhase);
    const rHeelX = hipX + direction * amp * Math.sin(rPhase);
    const lToeX = lHeelX + direction * 0.05;
    const rToeX = rHeelX + direction * 0.05;

    const landmarks = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.9, z: 0, visibility: 0.9 }));

    landmarks[LM.L_HIP] = { x: hipX - 0.05, y: hipY, z: 0, visibility: 0.95 };
    landmarks[LM.R_HIP] = { x: hipX + 0.05, y: hipY, z: 0, visibility: 0.95 };

    if (!missingLandmarks || i % 10 !== 0) {
      landmarks[LM.L_HEEL] = { x: lHeelX, y: 1.6, z: 0, visibility: missingLandmarks ? 0.2 : 0.9 };
      landmarks[LM.R_HEEL] = { x: rHeelX, y: 1.6, z: 0, visibility: missingLandmarks ? 0.2 : 0.9 };
      landmarks[LM.L_ANKLE] = { x: lHeelX, y: 1.55, z: 0, visibility: 0.9 };
      landmarks[LM.R_ANKLE] = { x: rHeelX, y: 1.55, z: 0, visibility: 0.9 };
      landmarks[LM.L_FOOT] = { x: lToeX, y: 1.65, z: 0, visibility: missingLandmarks ? 0.2 : 0.9 };
      landmarks[LM.R_FOOT] = { x: rToeX, y: 1.65, z: 0, visibility: missingLandmarks ? 0.2 : 0.9 };
    } else {
      landmarks[LM.L_HEEL] = { x: 0, y: 0, z: 0, visibility: 0.1 };
      landmarks[LM.R_HEEL] = { x: 0, y: 0, z: 0, visibility: 0.1 };
    }

    frames.push({
      timeMs: t * 1000,
      landmarks,
    });
  }

  return frames;
}

// Test 2.1: Direction +1 (Left to Right)
try {
  const fps = 30;
  const frames = createMockPoseFrames({ numFrames: 90, fps, direction: 1 });
  const result = detectGaitEventsZeni(frames, fps);

  assert(result.stepEvents.length > 0, "EVT-2.1a", "Left-to-Right event detection count", `Detected ${result.stepEvents.length} events`);
  assert(result.leftStancePct >= 40 && result.leftStancePct <= 80, "EVT-2.1b", "Left stance % reasonable", `Left stance %: ${result.leftStancePct}`);
  assert(result.rightStancePct >= 40 && result.rightStancePct <= 80, "EVT-2.1c", "Right stance % reasonable", `Right stance %: ${result.rightStancePct}`);
} catch (e: any) {
  assert(false, "EVT-2.1", "Left-to-Right direction test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 2.2: Direction -1 (Right to Left / Direction Flip)
try {
  const fps = 30;
  const framesRTL = createMockPoseFrames({ numFrames: 90, fps, direction: -1 });
  const resultRTL = detectGaitEventsZeni(framesRTL, fps);

  assert(resultRTL.stepEvents.length > 0, "EVT-2.2a", "Right-to-Left (flip) event detection count", `Detected ${resultRTL.stepEvents.length} events`);
  assert(resultRTL.leftStancePct >= 40 && resultRTL.leftStancePct <= 80, "EVT-2.2b", "RTL Left stance % reasonable", `Left stance %: ${resultRTL.leftStancePct}`);
} catch (e: any) {
  assert(false, "EVT-2.2", "Right-to-Left direction flip test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 2.3: Variable Stride Lengths
try {
  const fps = 30;
  const framesVar = createMockPoseFrames({ numFrames: 120, fps, direction: 1, variableStride: true });
  const resultVar = detectGaitEventsZeni(framesVar, fps);
  assert(resultVar.stepEvents.length > 0, "EVT-2.3", "Variable stride length event detection", `Detected ${resultVar.stepEvents.length} events`);
} catch (e: any) {
  assert(false, "EVT-2.3", "Variable stride test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 2.4: Missing Landmarks & Fallbacks
try {
  const fps = 30;
  const framesMissing = createMockPoseFrames({ numFrames: 90, fps, direction: 1, missingLandmarks: true });
  const resultMissing = detectGaitEventsZeni(framesMissing, fps);
  assert(resultMissing !== undefined && typeof resultMissing.leftStancePct === "number", "EVT-2.4", "Missing landmark fallback recovery", `Returned leftStancePct: ${resultMissing.leftStancePct}`);
} catch (e: any) {
  assert(false, "EVT-2.4", "Missing landmarks test", `Threw exception: ${e.message}`, "HIGH");
}


// -----------------------------------------------------------------------------
// 3. ZIFCHOCK SYMMETRY ANGLE & GSI (symmetry.ts)
// -----------------------------------------------------------------------------
console.log("\n--- 3. Testing Zifchock Symmetry Angle (symmetry.ts) ---");

// Test 3.1: Equal values (perfect symmetry)
try {
  const saEqual = symmetryAngle(50.0, 50.0);
  const gsiEqual = gaitSymmetryIndex(50.0, 50.0);
  assert(saEqual === 0.0, "SYM-3.1a", "Equal values SA = 0.0%", `Got SA = ${saEqual}`);
  assert(gsiEqual === 100.0, "SYM-3.1b", "Equal values GSI = 100.0%", `Got GSI = ${gsiEqual}`);
} catch (e: any) {
  assert(false, "SYM-3.1", "Equal values test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 3.2: Zero values (both 0 or one 0)
try {
  const saZeros = symmetryAngle(0.0, 0.0);
  const gsiZeros = gaitSymmetryIndex(0.0, 0.0);
  assert(saZeros === 0.0, "SYM-3.2a", "Both zero SA = 0.0%", `Got SA = ${saZeros}`);
  assert(gsiZeros === 100.0, "SYM-3.2b", "Both zero GSI = 100.0%", `Got GSI = ${gsiZeros}`);

  const saOneZero = symmetryAngle(100.0, 0.0);
  const gsiOneZero = gaitSymmetryIndex(100.0, 0.0);
  assert(saOneZero === 50.0, "SYM-3.2c", "XL=100, XR=0 SA = 50.0%", `Got SA = ${saOneZero}`);
  assert(gsiOneZero === 0.0, "SYM-3.2d", "XL=100, XR=0 GSI = 0.0%", `Got GSI = ${gsiOneZero}`);
} catch (e: any) {
  assert(false, "SYM-3.2", "Zero values test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 3.3: Extreme Asymmetry (XL >> XR)
try {
  const saExtreme = symmetryAngle(1000.0, 0.001);
  const gsiExtreme = gaitSymmetryIndex(1000.0, 0.001);
  assert(Math.abs(saExtreme - 50.0) < 0.1, "SYM-3.3a", "Extreme asymmetry (1000 vs 0.001) SA ~ 50%", `Got SA = ${saExtreme}`);
  assert(gsiExtreme < 0.01, "SYM-3.3b", "Extreme asymmetry (1000 vs 0.001) GSI ~ 0%", `Got GSI = ${gsiExtreme}`);
} catch (e: any) {
  assert(false, "SYM-3.3", "Extreme asymmetry test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 3.4: Reference Limb Invariance (XL, XR) vs (XR, XL)
try {
  const sa1 = symmetryAngle(80.0, 100.0);
  const sa2 = symmetryAngle(100.0, 80.0);
  assert(sa1 === sa2, "SYM-3.4", "Reference limb invariance SA(L, R) === SA(R, L)", `SA(80, 100)=${sa1}, SA(100, 80)=${sa2}`);
} catch (e: any) {
  assert(false, "SYM-3.4", "Reference limb invariance test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 3.5: Negative values
try {
  const saNeg = symmetryAngle(-80.0, 100.0);
  const saPos = symmetryAngle(80.0, 100.0);
  assert(saNeg === saPos, "SYM-3.5", "Negative values magnitude handling SA(-80, 100) === SA(80, 100)", `Got SA(-80, 100)=${saNeg}`);
} catch (e: any) {
  assert(false, "SYM-3.5", "Negative values test", `Threw exception: ${e.message}`, "HIGH");
}


// -----------------------------------------------------------------------------
// 4. HARMONIC RATIO & SMOOTHNESS (smoothness.ts)
// -----------------------------------------------------------------------------
console.log("\n--- 4. Testing Harmonic Ratio & Smoothness (smoothness.ts) ---");

// Test 4.1: Pure Sinusoids (Ideal Gait Rhythm)
try {
  const fps = 30;
  const N = 128;
  const strideFreq = 1.0;

  const hipY = Array.from({ length: N }, (_, i) => {
    const t = i / fps;
    return Math.sin(2 * Math.PI * (2 * strideFreq) * t);
  });

  const hipX = Array.from({ length: N }, (_, i) => {
    const t = i / fps;
    return Math.sin(2 * Math.PI * (1 * strideFreq) * t);
  });

  const { hrVertical, hrLateral, overallHR } = computeHarmonicRatio(hipY, hipX, fps);
  assert(overallHR > 0.1, "SMO-4.1", "Pure sinusoid overall HR calculation", `hrVert=${hrVertical}, hrLat=${hrLateral}, overall=${overallHR}`);
} catch (e: any) {
  assert(false, "SMO-4.1", "Pure sinusoid test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 4.2: Noisy Signals vs Smooth Signals
try {
  const fps = 30;
  const N = 128;
  const hipYSmooth = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 2.0 * (i / fps)));
  const hipYNoisy = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 2.0 * (i / fps)) + 0.8 * Math.random());

  const hrSmooth = computeHarmonicRatio(hipYSmooth, hipYSmooth, fps);
  const hrNoisy = computeHarmonicRatio(hipYNoisy, hipYNoisy, fps);

  assert(typeof hrSmooth.overallHR === "number" && typeof hrNoisy.overallHR === "number", "SMO-4.2", "Smooth vs Noisy HR evaluation", `Smooth HR=${hrSmooth.overallHR}, Noisy HR=${hrNoisy.overallHR}`);
} catch (e: any) {
  assert(false, "SMO-4.2", "Noisy vs Smooth test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 4.3: Short inputs (< 8 samples)
try {
  const hrShort = computeHarmonicRatio([1, 2, 3], [1, 2, 3], 30);
  assert(hrShort.overallHR === 1.0 && hrShort.hrVertical === 1.0 && hrShort.hrLateral === 1.0, "SMO-4.3", "Short input fallback (<8 samples)", `Got ${JSON.stringify(hrShort)}`);
} catch (e: any) {
  assert(false, "SMO-4.3", "Short input test", `Threw exception: ${e.message}`, "HIGH");
}


// -----------------------------------------------------------------------------
// 5. STANDARDIZED DUAL-TASK EFFECT (dte.ts)
// -----------------------------------------------------------------------------
console.log("\n--- 5. Testing Standardized Dual-Task Effect (dte.ts) ---");

function createMockMetrics(cadence: number, stepTimeCV: number, symmetryScore: number): GaitMetrics {
  return {
    viewAngle: "sagittal",
    viewConfidence: 0.9,
    durationSec: 10,
    fpsEffective: 30,
    stepCount: 20,
    cadenceSpm: cadence,
    avgStepTimeSec: 0.6,
    stepTimeAsymmetry: 2.0,
    strideAsymmetry: 2.0,
    lateralSway: 0.05,
    verticalBounce: 0.04,
    armSwingLeft: 15,
    armSwingRight: 15,
    armSwingAsymmetry: 0,
    kneeFlexLeft: 60,
    kneeFlexRight: 60,
    kneeAsymmetry: 0,
    stepWidthVariability: 0.01,
    doubleSupportHint: 20,
    stepTimeCV,
    strideTimeCV: stepTimeCV,
    pelvicObliquity: 0.02,
    pelvicObliquityVar: 0.001,
    meanStepWidth: 0.15,
    pathSmoothness: 0.9,
    stabilityScore: 85,
    rhythmScore: 85,
    symmetryScore,
    mobilityScore: 85,
    automaticityScore: 85,
    overallScore: 85,
    series: [],
    stepEvents: [],
  };
}

// Test 5.1: Zero baselines
try {
  const zeroBase = createMockMetrics(0, 0, 0);
  const dual = createMockMetrics(100, 0.05, 80);
  const dteZeroBase = calculateDTE(zeroBase, dual);

  assert(!Number.isNaN(dteZeroBase.cadenceDTE) && !Number.isNaN(dteZeroBase.stepTimeCvDTE) && !Number.isNaN(dteZeroBase.symmetryDTE), "DTE-5.1", "Zero baseline handling (no NaN/Infinity)", `Results: cadence=${dteZeroBase.cadenceDTE}, stepTimeCv=${dteZeroBase.stepTimeCvDTE}, sym=${dteZeroBase.symmetryDTE}`);
} catch (e: any) {
  assert(false, "DTE-5.1", "Zero baseline test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 5.2: Dual-Task Cost (Cadence drop, variability increase)
try {
  const base = createMockMetrics(100, 0.04, 90);
  const dualCost = createMockMetrics(85, 0.08, 80);
  const dteRes = calculateDTE(base, dualCost);

  assert(dteRes.cadenceDTE < 0, "DTE-5.2a", "Cadence DTE is negative for cadence drop", `cadenceDTE: ${dteRes.cadenceDTE}%`);
  assert(dteRes.stepTimeCvDTE < 0, "DTE-5.2b", "StepTimeCV DTE is negative for variability increase", `stepTimeCvDTE: ${dteRes.stepTimeCvDTE}%`);
  assert(dteRes.cmiClassification === "mutual_interference", "DTE-5.2c", "CMI classified as mutual_interference", `Classification: ${dteRes.cmiClassification}`);
} catch (e: any) {
  assert(false, "DTE-5.2", "Dual-Task cost test", `Threw exception: ${e.message}`, "HIGH");
}

// Test 5.3: No Interference (|DTE| <= 5%)
try {
  const base = createMockMetrics(100, 0.04, 90);
  const dualMinor = createMockMetrics(98, 0.041, 89);
  const dteMinor = calculateDTE(base, dualMinor);
  assert(dteMinor.cmiClassification === "no_interference", "DTE-5.3", "Minor change classified as no_interference", `Classification: ${dteMinor.cmiClassification}`);
} catch (e: any) {
  assert(false, "DTE-5.3", "No interference test", `Threw exception: ${e.message}`, "HIGH");
}


// -----------------------------------------------------------------------------
// SUMMARY & VERDICT PREPARATION
// -----------------------------------------------------------------------------
console.log("\n=============================================================");
console.log(`STRESS TEST SUMMARY: Passed ${passedCount}, Failed ${failedCount}`);
if (findings.length > 0) {
  console.log("FINDINGS / FAILURES:");
  findings.forEach(f => console.log(` - [${f.id}] (${f.severity}) ${f.description}: ${f.evidence}`));
}
console.log("=============================================================");

// Output formatted report data for handoff
import * as fs from "fs";
const reportSummary = {
  passedCount,
  failedCount,
  findings,
  timestamp: new Date().toISOString(),
};
fs.writeFileSync("./.agents/challenger_m1_r1_1/stress_test_summary.json", JSON.stringify(reportSummary, null, 2));

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

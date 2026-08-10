import {
  kalmanFilter1D,
  kalmanFilter2D,
  savitzkyGolay,
  savitzkyGolayAdaptive,
  computeSgWindowSize,
  zeroPhaseButterworth,
  olsDetrend,
  linearInterpolate,
  smoothPoseFrames,
  butterworthLowPass,
} from "../../../../src/lib/gait/signal";
import type { PoseFrame } from "../../../../src/lib/gait/types";

console.log("=== EMPIRICAL STRESS TEST SUITE FOR SIGNAL.TS ===");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${msg}`);
  } else {
    failed++;
    console.error(`[FAIL] ${msg}`);
  }
}

// 1. All-NaN Signal for Kalman Filter
try {
  const allNan = [NaN, NaN, NaN, NaN, NaN];
  const kRes = kalmanFilter1D(allNan);
  assert(kRes.position.length === 5, "kalmanFilter1D(allNaN) returns position array of same length");
  assert(kRes.position.every(v => v === 0), "kalmanFilter1D(allNaN) returns all zeros position");
  assert(kRes.velocity.every(v => v === 0), "kalmanFilter1D(allNaN) returns all zeros velocity");
} catch (e) {
  assert(false, `kalmanFilter1D(allNaN) threw error: ${e}`);
}

// 2. Kalman Filter with extreme / invalid options
try {
  const sig = [1, 2, 3, 4, 5];
  const res0 = kalmanFilter1D(sig, { processNoise: 0, measurementNoise: 0, dt: 0 });
  assert(res0.position.length === 5 && res0.position.every(Number.isFinite), "kalmanFilter1D with 0 noise/dt handles without NaN");
  
  const resNeg = kalmanFilter1D(sig, { processNoise: -10, measurementNoise: -5, dt: -0.1 });
  assert(resNeg.position.length === 5 && resNeg.position.every(Number.isFinite), "kalmanFilter1D with negative options handles via Math.max safety");
} catch (e) {
  assert(false, `kalmanFilter1D invalid options test threw error: ${e}`);
}

// 3. Kalman filter 100-frame occlusion gap
try {
  const longGapSignal: number[] = [];
  for (let i = 0; i < 150; i++) {
    if (i >= 20 && i < 120) {
      longGapSignal.push(NaN);
    } else {
      longGapSignal.push(10.0 + i * 0.5);
    }
  }
  const longRes = kalmanFilter1D(longGapSignal, { processNoise: 1e-3, measurementNoise: 1e-2, dt: 0.033 });
  assert(longRes.position.every(Number.isFinite), "100-frame NaN gap remains finite");
  assert(longRes.velocity.every(Number.isFinite), "100-frame NaN gap velocity remains finite");
  assert(longRes.position[119] > longRes.position[19], "Position continues advancing during long gap");
  assert(longRes.velocity[119] < longRes.velocity[19], "Velocity decays gracefully during long gap");
} catch (e) {
  assert(false, `100-frame gap test failed: ${e}`);
}

// 4. savitzkyGolay with window larger than signal or even window
try {
  const shortSig = [1, 5, 2];
  const sgOut = savitzkyGolay(shortSig, 7);
  assert(sgOut.length === 3, "savitzkyGolay handles n < M gracefully returning cleanData");

  const evenWinSig = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const sgEven = savitzkyGolay(evenWinSig, 6); // even 6 should increment to 7
  assert(sgEven.length === 10 && sgEven.every(Number.isFinite), "savitzkyGolay handles even windowSize input");
} catch (e) {
  assert(false, `savitzkyGolay window tests threw: ${e}`);
}

// 5. computeSgWindowSize boundary testing
try {
  assert(computeSgWindowSize(0) === 5, "computeSgWindowSize(0) returns 5");
  assert(computeSgWindowSize(-30) === 5, "computeSgWindowSize(-30) returns 5");
  assert(computeSgWindowSize(NaN) === 5, "computeSgWindowSize(NaN) returns 5");
  assert(computeSgWindowSize(Infinity) === 5, "computeSgWindowSize(Infinity) returns 5");
  assert(computeSgWindowSize(15) === 5, "computeSgWindowSize(15) is 5");
  assert(computeSgWindowSize(30) === 5, "computeSgWindowSize(30) is 5");
  assert(computeSgWindowSize(60) === 11, "computeSgWindowSize(60) is 11");
  assert(computeSgWindowSize(120) === 15, "computeSgWindowSize(120) is 15");
  assert(computeSgWindowSize(240) === 15, "computeSgWindowSize(240) clamped to max 15");
} catch (e) {
  assert(false, `computeSgWindowSize boundary tests threw: ${e}`);
}

// 6. zeroPhaseButterworth with non-uniform timestamps & duplicate timestamps
try {
  const tsDuplicate = [0, 0.033, 0.033, 0.066, 0.100, 0.133, 0.166];
  const dataDup = [1, 2, 3, 4, 5, 6, 7];
  const dupRes = zeroPhaseButterworth(dataDup, 30, 6.0, { timestamps: tsDuplicate });
  assert(dupRes.length === 7 && dupRes.every(Number.isFinite), "zeroPhaseButterworth with duplicate timestamps handles dx=0 gracefully");

  const tsJitter = [0, 0.010, 0.090, 0.100, 0.200, 0.210];
  const dataJitter = [10, 12, 11, 15, 14, 16];
  const jitRes = zeroPhaseButterworth(dataJitter, 30, 6.0, { timestamps: tsJitter });
  assert(jitRes.length === 6 && jitRes.every(Number.isFinite), "zeroPhaseButterworth with high dt jitter produces finite output");
} catch (e) {
  assert(false, `zeroPhaseButterworth timestamp tests threw: ${e}`);
}

// 7. linearInterpolate edge cases
try {
  const liDup = linearInterpolate([10, 10, 20], [1, 2, 3], [5, 10, 15, 20, 25]);
  assert(liDup.length === 5 && liDup.every(Number.isFinite), "linearInterpolate with duplicate xOrig handles dx=0");
  const liEmpty = linearInterpolate([], [], []);
  assert(liEmpty.length === 0, "linearInterpolate with empty arrays returns empty");
} catch (e) {
  assert(false, `linearInterpolate edge case test threw: ${e}`);
}

// 8. smoothPoseFrames with Kalman, SG adaptive, worldLandmarks, missing fields
try {
  const poseFrames: PoseFrame[] = Array.from({ length: 10 }, (_, i) => ({
    timeMs: i * 33.3,
    landmarks: [
      { x: i, y: i * 2, z: i * 0.5, visibility: i % 2 === 0 ? 0.9 : 0.2 },
      { x: Math.sin(i), y: Math.cos(i), z: 0 },
    ],
    worldLandmarks: [
      { x: i * 0.1, y: i * 0.2, z: i * 0.05, visibility: 0.95 },
      { x: 0, y: 0, z: 0 },
    ],
  }));

  const smKalman = smoothPoseFrames(poseFrames, "kalman", { fps: 30 });
  assert(smKalman.length === 10, "smoothPoseFrames kalman returns correct frame count");
  assert(smKalman[0].landmarks[0].visibility === 0.9, "smoothPoseFrames preserves visibility metadata");
  assert(smKalman[1].landmarks[0].visibility === 0.2, "smoothPoseFrames preserves visibility metadata for low vis");

  const smAdaptive = smoothPoseFrames(poseFrames, "savitzky-golay", { fps: 60 });
  assert(smAdaptive.length === 10, "smoothPoseFrames savitzky-golay adaptive returns correct frame count");

  const smNone = smoothPoseFrames(poseFrames, "none");
  assert(smNone.length === 10, "smoothPoseFrames none method works");
} catch (e) {
  assert(false, `smoothPoseFrames tests threw: ${e}`);
}

console.log(`=== STRESS TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) {
  process.exit(1);
}

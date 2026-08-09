import type { GaitMetrics, Landmark, PoseFrame } from '../types';

export function createMockMetrics(overrides: Partial<GaitMetrics> = {}): GaitMetrics {
  return {
    viewAngle: 'sagittal',
    viewConfidence: 0.85,
    durationSec: 5.0,
    fpsEffective: 30,
    stepCount: 8,
    cadenceSpm: 100,
    avgStepTimeSec: 0.6,
    stepTimeAsymmetry: 0.05,
    strideAsymmetry: 0.04,
    lateralSway: 0.04,
    verticalBounce: 0.03,
    armSwingLeft: 0.3,
    armSwingRight: 0.3,
    armSwingAsymmetry: 0.05,
    kneeFlexLeft: 45,
    kneeFlexRight: 45,
    kneeAsymmetry: 0.05,
    stepWidthVariability: 0.02,
    doubleSupportHint: 0.2,
    leftStancePct: 60.0,
    rightStancePct: 60.0,
    leftSwingPct: 40.0,
    rightSwingPct: 40.0,
    doubleSupportPct: 20.0,
    symmetryAngle: 2.5,
    harmonicRatioVertical: 2.2,
    harmonicRatioLateral: 2.1,
    harmonicRatio: 2.15,
    stepTimeCV: 0.04,
    strideTimeCV: 0.03,
    pelvicObliquity: 0.02,
    pelvicObliquityVar: 0.01,
    meanStepWidth: 0.3,
    pathSmoothness: 0.85,
    stabilityScore: 85,
    rhythmScore: 82,
    symmetryScore: 88,
    mobilityScore: 80,
    automaticityScore: 84,
    overallScore: 84,
    series: [],
    stepEvents: [],
    ...overrides,
  };
}

export interface SyntheticFrameOptions {
  fps?: number;
  durationSec?: number;
  direction?: number; // 1 for left-to-right, -1 for right-to-left
  followCam?: boolean; // When true, simulates handheld follow-cam (net hip drift near 0)
  asymmetryFactor?: number;
  lowVisibilityLandmarks?: boolean;
  noiseLevel?: number;
  viewAngle?: 'sagittal' | 'frontal' | 'oblique';
}

export function generateSyntheticWalkingFrames(opts: SyntheticFrameOptions = {}): PoseFrame[] {
  const fps = opts.fps ?? 30;
  const durationSec = opts.durationSec ?? 3.0;
  const direction = opts.direction ?? 1;
  const asymmetryFactor = opts.asymmetryFactor ?? 1.0;
  const lowVisibilityLandmarks = opts.lowVisibilityLandmarks ?? false;
  const noiseLevel = opts.noiseLevel ?? 0;
  const viewAngle = opts.viewAngle ?? 'sagittal';

  const totalFrames = Math.floor(fps * durationSec);
  const frames: PoseFrame[] = [];
  const freq = 1.6; // step frequency Hz (~96 spm)

  let shoulderWidth = 0.05; // sagittal (sw = 0.05 / 0.2 = 0.25 < 0.4)
  let hipDepthDiff = 0.12;
  if (viewAngle === 'frontal') {
    shoulderWidth = 0.15; // frontal (sw = 0.15 / 0.2 = 0.75 > 0.55)
    hipDepthDiff = 0.02;
  } else if (viewAngle === 'oblique') {
    shoulderWidth = 0.09;
    hipDepthDiff = 0.05;
  }

  for (let f = 0; f < Math.max(1, totalFrames); f++) {
    const t = f / fps;
    const timeMs = t * 1000;
    const progress = opts.followCam
      ? 0
      : (t / Math.max(0.1, durationSec)) * 0.4 * direction;

    const noise = () => (noiseLevel > 0 ? (Math.random() - 0.5) * noiseLevel : 0);

    const midHipX = 0.5 + progress + noise();
    const midHipY = 0.5 + 0.02 * Math.sin(2 * Math.PI * freq * 2 * t) + noise();

    const leftPhase = 2 * Math.PI * freq * t;
    const rightPhase = 2 * Math.PI * freq * t * asymmetryFactor + Math.PI;

    const leftAnkleOffset = 0.15 * Math.sin(leftPhase);
    const rightAnkleOffset = 0.15 * Math.sin(rightPhase);

    const leftAnkleX = midHipX + direction * leftAnkleOffset + noise();
    const rightAnkleX = midHipX + direction * rightAnkleOffset + noise();

    const leftAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(leftPhase)) + noise();
    const rightAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(rightPhase)) + noise();

    const visPrimary = lowVisibilityLandmarks ? 0.1 : 0.9;

    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));

    // Nose
    landmarks[0] = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };

    // Shoulders (torso y = 0.3 to 0.5 => torsoHeight = 0.2)
    landmarks[11] = { x: midHipX - shoulderWidth / 2, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[12] = { x: midHipX + shoulderWidth / 2, y: 0.3, z: 0, visibility: 0.9 };

    // Wrists
    const leftWristX = midHipX - 0.1 * Math.sin(leftPhase);
    const rightWristX = midHipX + 0.1 * Math.sin(rightPhase);
    landmarks[15] = { x: leftWristX, y: 0.5, z: 0, visibility: 0.9 };
    landmarks[16] = { x: rightWristX, y: 0.5, z: 0, visibility: 0.9 };

    // Hips
    landmarks[23] = { x: midHipX - 0.05, y: midHipY, z: -hipDepthDiff / 2, visibility: 0.9 };
    landmarks[24] = { x: midHipX + 0.05, y: midHipY, z: hipDepthDiff / 2, visibility: 0.9 };

    // Knees
    landmarks[25] = { x: (midHipX + leftAnkleX) / 2, y: 0.68 + 0.03 * Math.sin(leftPhase), z: 0, visibility: 0.9 };
    landmarks[26] = { x: (midHipX + rightAnkleX) / 2, y: 0.68 + 0.03 * Math.sin(rightPhase), z: 0, visibility: 0.9 };

    // Ankles
    landmarks[27] = { x: leftAnkleX, y: leftAnkleY, z: 0, visibility: 0.9 };
    landmarks[28] = { x: rightAnkleX, y: rightAnkleY, z: 0, visibility: 0.9 };

    // Heels
    landmarks[29] = { x: leftAnkleX - 0.02 * direction, y: leftAnkleY, z: 0, visibility: visPrimary };
    landmarks[30] = { x: rightAnkleX - 0.02 * direction, y: rightAnkleY, z: 0, visibility: visPrimary };

    // Foot index
    landmarks[31] = { x: leftAnkleX + 0.04 * direction, y: leftAnkleY + 0.01, z: 0, visibility: visPrimary };
    landmarks[32] = { x: rightAnkleX + 0.04 * direction, y: rightAnkleY + 0.01, z: 0, visibility: visPrimary };

    frames.push({
      timeMs,
      landmarks,
    });
  }

  return frames;
}

export function generateStationaryPoseFrames(fps = 30, durationSec = 3.0): PoseFrame[] {
  const totalFrames = Math.max(5, Math.floor(fps * durationSec));
  const frames: PoseFrame[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    landmarks[11] = { x: 0.4, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[12] = { x: 0.6, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[23] = { x: 0.45, y: 0.5, z: 0, visibility: 0.9 };
    landmarks[24] = { x: 0.55, y: 0.5, z: 0, visibility: 0.9 };
    landmarks[25] = { x: 0.45, y: 0.7, z: 0, visibility: 0.9 };
    landmarks[26] = { x: 0.55, y: 0.7, z: 0, visibility: 0.9 };
    landmarks[27] = { x: 0.45, y: 0.85, z: 0, visibility: 0.9 };
    landmarks[28] = { x: 0.55, y: 0.85, z: 0, visibility: 0.9 };
    landmarks[29] = { x: 0.44, y: 0.85, z: 0, visibility: 0.9 };
    landmarks[30] = { x: 0.54, y: 0.85, z: 0, visibility: 0.9 };
    landmarks[31] = { x: 0.48, y: 0.86, z: 0, visibility: 0.9 };
    landmarks[32] = { x: 0.58, y: 0.86, z: 0, visibility: 0.9 };
    frames.push({
      timeMs: (f / fps) * 1000,
      landmarks,
    });
  }
  return frames;
}

export function generateNoisyPoseFrames(fps = 30, durationSec = 3.0, noiseLevel = 0.05): PoseFrame[] {
  return generateSyntheticWalkingFrames({ fps, durationSec, noiseLevel });
}

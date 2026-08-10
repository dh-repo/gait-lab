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

export type TrajectoryType = 'linear' | 'uturn' | 'static' | 'crossing' | 'fast_walking';

export interface PersonOcclusionConfig {
  startFrame: number;
  durationFrames: number; // 2 to 10 frames
  type?: 'missing' | 'degraded';
}

export interface PersonScaleConfig {
  startHeight: number; // e.g. 0.15
  endHeight: number;   // e.g. 0.85
  startFrame?: number;
  endFrame?: number;
}

export interface PersonUTurnConfig {
  turnFrame: number;
  turnDurationFrames?: number; // default: 6 frames
}

export interface PersonTrajectoryConfig {
  id: string; // e.g. "target", "passerby", "observer"
  role?: 'target' | 'passerby' | 'observer' | 'custom';
  
  // Starting spatial state
  initialX?: number; // 0..1 frame coordinates
  initialY?: number; // 0..1 frame coordinates
  initialHeight?: number; // e.g. 0.60
  
  // Trajectory behavior
  trajectoryType?: TrajectoryType;
  speed?: number; // norm units/sec (e.g. 0.15 for normal, 0.35 for fast walking)
  direction?: 1 | -1; // 1: left-to-right, -1: right-to-left
  
  // Frame active bounds
  startFrame?: number;
  endFrame?: number;

  // Feature specific configs
  scaleChange?: PersonScaleConfig;
  uTurn?: PersonUTurnConfig;
  occlusions?: PersonOcclusionConfig[];

  // Biometrics & noise
  stepFrequencyHz?: number;
  asymmetryFactor?: number;
  noiseLevel?: number;
  shoulderWidthRatio?: number;
  torsoRatio?: number;
}

export interface MultiPersonScenarioConfig {
  fps?: number; // default 30
  durationSec?: number; // default 3.0
  totalFrames?: number; // default derived from fps * durationSec
  
  // Detailed per-person configs
  people?: PersonTrajectoryConfig[];

  // Shorthand scenario flags (for rapid test construction)
  includeCrossingPasserby?: boolean;
  includeStaticObserver?: boolean;
  enableTargetUTurn?: boolean;
  enableTargetScaleChange?: boolean;
  enableFastWalking?: boolean;
  targetOcclusion?: PersonOcclusionConfig;

  // Evaluation flags
  randomizeDetectionOrder?: boolean;
}

export interface MultiPersonFrame {
  frameIndex: number;
  timeMs: number;
  landmarks: Landmark[][];
  groundTruthPersonIds: string[];
}

export interface GroundTruthTrackInfo {
  id: string;
  role: string;
  startFrame: number;
  endFrame: number;
  totalFrames: number;
}

export interface MultiPersonScenarioResult {
  frames: MultiPersonFrame[];
  groundTruthTracks: Map<string, GroundTruthTrackInfo>;
  config: MultiPersonScenarioConfig;
}

export interface CandidateConfig {
  x: number;          // Hip center x
  y: number;          // Hip center y
  scale: number;      // Bounding box scale factor (height, e.g. 0.6 => area ~ 0.12)
  visibility?: number;// Joint visibility (default 0.9)
  asymmetry?: number;
}

export interface MultiCandidateFrame {
  timeMs: number;
  candidates: CandidateConfig[];
}

export function createPoseLandmarkCandidate(config: CandidateConfig): Landmark[] {
  const { x, y, scale, visibility = 0.9 } = config;
  const w = scale * 0.33; // aspect ratio ~ 0.33
  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x, y, z: 0, visibility }));

  landmarks[0]  = { x, y: y - scale * 0.4, z: 0, visibility };                 // Nose
  landmarks[11] = { x: x - w / 2, y: y - scale * 0.25, z: 0, visibility };      // L_Shoulder
  landmarks[12] = { x: x + w / 2, y: y - scale * 0.25, z: 0, visibility };      // R_Shoulder
  landmarks[23] = { x: x - w / 4, y, z: 0, visibility };                       // L_Hip
  landmarks[24] = { x: x + w / 4, y, z: 0, visibility };                       // R_Hip
  landmarks[27] = { x: x - w / 4, y: y + scale * 0.4, z: 0, visibility };       // L_Ankle
  landmarks[28] = { x: x + w / 4, y: y + scale * 0.4, z: 0, visibility };       // R_Ankle
  return landmarks;
}

export function generateMultiCandidateStream(
  framesConfig: MultiCandidateFrame[],
): Array<{ landmarks: Landmark[][]; worldLandmarks?: Landmark[][] }> {
  return framesConfig.map((frame) => ({
    landmarks: frame.candidates.map(createPoseLandmarkCandidate),
  }));
}

/**
 * Generates synthetic multi-person frame sequences for gait tracking, re-identification,
 * target lock, and background suppression stress testing.
 */
export function generateMultiPersonScenario(
  config: MultiPersonScenarioConfig = {}
): MultiPersonScenarioResult {
  const fps = config.fps ?? 30;
  const durationSec = config.durationSec ?? 3.0;
  const totalFrames = config.totalFrames ?? Math.floor(fps * durationSec);

  // Assemble people configurations (supporting both explicit `people` array and convenience flags)
  const peopleConfigs: PersonTrajectoryConfig[] = config.people ? [...config.people] : [];

  // If no explicit target provided in `people`, create default target
  let targetConfig = peopleConfigs.find(p => p.id === 'target' || p.role === 'target');
  if (!targetConfig) {
    targetConfig = {
      id: 'target',
      role: 'target',
      initialX: 0.15,
      initialY: 0.5,
      initialHeight: config.enableTargetScaleChange ? 0.15 : 0.60,
      speed: config.enableFastWalking ? 0.35 : 0.15,
      direction: 1,
      trajectoryType: config.enableFastWalking ? 'fast_walking' : 'linear',
      scaleChange: config.enableTargetScaleChange
        ? { startHeight: 0.15, endHeight: 0.85, startFrame: 0, endFrame: totalFrames - 1 }
        : undefined,
      uTurn: config.enableTargetUTurn
        ? { turnFrame: Math.floor(totalFrames / 2), turnDurationFrames: 6 }
        : undefined,
      occlusions: config.targetOcclusion ? [config.targetOcclusion] : undefined,
    };
    peopleConfigs.push(targetConfig);
  }

  // Shorthand flag: crossing passerby
  if (config.includeCrossingPasserby && !peopleConfigs.some(p => p.id === 'passerby')) {
    peopleConfigs.push({
      id: 'passerby',
      role: 'passerby',
      initialX: 0.85,
      initialY: 0.5,
      initialHeight: 0.55,
      speed: 0.18,
      direction: -1,
      trajectoryType: 'crossing',
      startFrame: Math.max(0, Math.floor(totalFrames * 0.2)),
      endFrame: Math.min(totalFrames - 1, Math.floor(totalFrames * 0.8)),
    });
  }

  // Shorthand flag: static observer
  if (config.includeStaticObserver && !peopleConfigs.some(p => p.id === 'observer')) {
    peopleConfigs.push({
      id: 'observer',
      role: 'observer',
      initialX: 0.85,
      initialY: 0.45,
      initialHeight: 0.60,
      speed: 0,
      trajectoryType: 'static',
    });
  }

  const frames: MultiPersonFrame[] = [];
  const groundTruthTracks = new Map<string, GroundTruthTrackInfo>();

  // Track frame activity for ground truth summary
  for (const p of peopleConfigs) {
    const start = p.startFrame ?? 0;
    const end = p.endFrame ?? totalFrames - 1;
    groundTruthTracks.set(p.id, {
      id: p.id,
      role: p.role ?? 'custom',
      startFrame: start,
      endFrame: end,
      totalFrames: Math.max(0, end - start + 1),
    });
  }

  // Generate per-frame pose landmarks for each person
  for (let f = 0; f < totalFrames; f++) {
    const timeMs = (f / fps) * 1000;
    const frameLandmarks: Landmark[][] = [];
    const framePersonIds: string[] = [];

    for (const p of peopleConfigs) {
      const start = p.startFrame ?? 0;
      const end = p.endFrame ?? totalFrames - 1;
      if (f < start || f > end) continue;

      // Check occlusions
      let isOccluded = false;
      let isDegraded = false;
      if (p.occlusions) {
        for (const occ of p.occlusions) {
          if (f >= occ.startFrame && f < occ.startFrame + occ.durationFrames) {
            if (occ.type === 'degraded') {
              isDegraded = true;
            } else {
              isOccluded = true;
            }
            break;
          }
        }
      }

      if (isOccluded) continue; // Skip missing detection frames

      const lms = generateSinglePersonLandmarks(p, f, totalFrames, fps, isDegraded);
      frameLandmarks.push(lms);
      framePersonIds.push(p.id);
    }

    // Optional detection order randomization
    if (config.randomizeDetectionOrder && frameLandmarks.length > 1) {
      for (let i = frameLandmarks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [frameLandmarks[i], frameLandmarks[j]] = [frameLandmarks[j], frameLandmarks[i]];
        [framePersonIds[i], framePersonIds[j]] = [framePersonIds[j], framePersonIds[i]];
      }
    }

    frames.push({
      frameIndex: f,
      timeMs,
      landmarks: frameLandmarks,
      groundTruthPersonIds: framePersonIds,
    });
  }

  return {
    frames,
    groundTruthTracks,
    config,
  };
}

/**
 * Computes 33 MediaPipe pose landmarks for a specific person trajectory state at frame f.
 */
function generateSinglePersonLandmarks(
  p: PersonTrajectoryConfig,
  f: number,
  totalFrames: number,
  fps: number,
  isDegraded = false
): Landmark[] {
  const t = f / fps;
  const initialX = p.initialX ?? 0.15;
  const initialY = p.initialY ?? 0.50;
  const speed = p.speed ?? 0.15;
  const initialDir = p.direction ?? 1;

  // 1. Calculate current scale height h(f)
  let currentHeight = p.initialHeight ?? 0.60;
  if (p.scaleChange) {
    const scStart = p.scaleChange.startFrame ?? 0;
    const scEnd = p.scaleChange.endFrame ?? totalFrames - 1;
    const progress = Math.min(1, Math.max(0, (f - scStart) / Math.max(1, scEnd - scStart)));
    currentHeight = p.scaleChange.startHeight + progress * (p.scaleChange.endHeight - p.scaleChange.startHeight);
  }

  // 2. Calculate spatial position (x, y) and heading angle theta
  let currentDir = initialDir;
  let posX = initialX;
  let posY = initialY;

  if (p.trajectoryType === 'static') {
    posX = initialX;
    posY = initialY;
  } else if (p.uTurn && p.uTurn.turnFrame !== undefined) {
    const turnCenter = p.uTurn.turnFrame;
    const turnDuration = p.uTurn.turnDurationFrames ?? 6;
    const turnStart = turnCenter - Math.floor(turnDuration / 2);
    const turnEnd = turnStart + turnDuration;

    if (f < turnStart) {
      posX = initialX + initialDir * speed * (f / fps);
    } else if (f >= turnEnd) {
      const distBeforeTurn = speed * (turnStart / fps);
      const turnProgressDist = speed * (turnDuration / fps) * 0.5;
      const distAfterTurn = speed * ((f - turnEnd) / fps);
      posX = initialX + initialDir * (distBeforeTurn + turnProgressDist) - initialDir * distAfterTurn;
      currentDir = -initialDir as (1 | -1);
    } else {
      // Transition phase during U-turn
      const u = (f - turnStart) / turnDuration;
      const angle = Math.PI * (1 - Math.cos(Math.PI * u)) / 2; // Smooth cosine curve 0 -> PI
      const distBeforeTurn = speed * (turnStart / fps);
      const turnDx = speed * (u * turnDuration / fps) * Math.cos(angle);
      posX = initialX + initialDir * (distBeforeTurn + turnDx);
      posY = initialY + 0.02 * Math.sin(angle); // slight y-drift during turn
    }
  } else {
    // Linear / Fast Walking / Crossing
    posX = initialX + initialDir * speed * (f / fps);
  }

  // 3. Compute gait kinematics
  const freq = p.stepFrequencyHz ?? (p.trajectoryType === 'fast_walking' ? 2.2 : 1.6);
  const noiseLevel = p.noiseLevel ?? 0;
  const noise = () => (noiseLevel > 0 ? (Math.random() - 0.5) * noiseLevel : 0);

  const shoulderWidthRatio = p.shoulderWidthRatio ?? 0.25;
  const shoulderWidth = currentHeight * shoulderWidthRatio;
  const torsoHeight = currentHeight * (p.torsoRatio ?? 0.33);

  const midHipX = posX + noise();
  const midHipY = posY + noise();

  const leftPhase = 2 * Math.PI * freq * t;
  const rightPhase = leftPhase + Math.PI;

  const strideLength = 0.25 * currentHeight;
  const leftAnkleOffset = strideLength * Math.sin(leftPhase);
  const rightAnkleOffset = strideLength * Math.sin(rightPhase);

  const leftAnkleX = midHipX + currentDir * leftAnkleOffset + noise();
  const rightAnkleX = midHipX + currentDir * rightAnkleOffset + noise();

  const groundY = midHipY + currentHeight * 0.5;
  const leftAnkleY = groundY - 0.05 * currentHeight * Math.max(0, Math.sin(leftPhase)) + noise();
  const rightAnkleY = groundY - 0.05 * currentHeight * Math.max(0, Math.sin(rightPhase)) + noise();

  const vis = isDegraded ? 0.05 : 0.90;

  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));

  // Head (Nose 0)
  landmarks[0] = { x: midHipX, y: midHipY - torsoHeight - 0.15 * currentHeight, z: 0, visibility: vis };

  // Shoulders (11, 12)
  landmarks[11] = { x: midHipX - shoulderWidth / 2, y: midHipY - torsoHeight, z: 0, visibility: vis };
  landmarks[12] = { x: midHipX + shoulderWidth / 2, y: midHipY - torsoHeight, z: 0, visibility: vis };

  // Wrists (15, 16)
  landmarks[15] = { x: midHipX - 0.15 * currentHeight * Math.sin(leftPhase), y: midHipY - torsoHeight * 0.5, z: 0, visibility: vis };
  landmarks[16] = { x: midHipX + 0.15 * currentHeight * Math.sin(rightPhase), y: midHipY - torsoHeight * 0.5, z: 0, visibility: vis };

  // Hips (23, 24)
  landmarks[23] = { x: midHipX - 0.08 * currentHeight, y: midHipY, z: 0, visibility: vis };
  landmarks[24] = { x: midHipX + 0.08 * currentHeight, y: midHipY, z: 0, visibility: vis };

  // Knees (25, 26)
  landmarks[25] = { x: (midHipX + leftAnkleX) / 2, y: midHipY + currentHeight * 0.25 + 0.02 * currentHeight * Math.sin(leftPhase), z: 0, visibility: vis };
  landmarks[26] = { x: (midHipX + rightAnkleX) / 2, y: midHipY + currentHeight * 0.25 + 0.02 * currentHeight * Math.sin(rightPhase), z: 0, visibility: vis };

  // Ankles (27, 28)
  landmarks[27] = { x: leftAnkleX, y: leftAnkleY, z: 0, visibility: vis };
  landmarks[28] = { x: rightAnkleX, y: rightAnkleY, z: 0, visibility: vis };

  // Heels (29, 30)
  landmarks[29] = { x: leftAnkleX - 0.03 * currentDir * currentHeight, y: leftAnkleY, z: 0, visibility: vis };
  landmarks[30] = { x: rightAnkleX - 0.03 * currentDir * currentHeight, y: rightAnkleY, z: 0, visibility: vis };

  // Foot Index (31, 32)
  landmarks[31] = { x: leftAnkleX + 0.05 * currentDir * currentHeight, y: leftAnkleY + 0.01 * currentHeight, z: 0, visibility: vis };
  landmarks[32] = { x: rightAnkleX + 0.05 * currentDir * currentHeight, y: rightAnkleY + 0.01 * currentHeight, z: 0, visibility: vis };

  return landmarks;
}


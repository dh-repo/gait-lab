import * as THREE from "three";
import type { Landmark, PoseFrame, GaitMetrics } from "./types";
import type { GaitSessionRecord } from "./persistence";
import type { GaitAngleAnalysis } from "./angles";
import { getNormativeGaitCurves } from "./angles";

export type TrajectoryJoint = "none" | "ankle" | "knee" | "wrist" | "com";

export interface PoseReconstructionInput {
  angleAnalysis?: GaitAngleAnalysis | null;
  metrics?: GaitMetrics | null;
  frames?: PoseFrame[] | null;
  angleAnalysisJson?: GaitAngleAnalysis | null;
  metricsJson?: GaitMetrics | null;
}

/**
 * Calculates 5-segment Dempster (1955) weighted Center of Mass:
 * 0.50 * MidTorso + 0.20 * MidThigh + 0.12 * MidShank + 0.10 * MidArm + 0.08 * MidFoot
 */
export function calculateDempsterCoM(lmArray: Landmark[]): { x: number; y: number; z: number } {
  const avgPoints = (indices: number[]) => {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let count = 0;
    for (const idx of indices) {
      const lm = lmArray[idx];
      if (
        lm &&
        typeof lm.x === "number" &&
        !Number.isNaN(lm.x) &&
        typeof lm.y === "number" &&
        !Number.isNaN(lm.y) &&
        (lm.visibility ?? 1) >= 0.3
      ) {
        sumX += lm.x;
        sumY += lm.y;
        sumZ += typeof lm.z === "number" && !Number.isNaN(lm.z) ? lm.z : 0;
        count++;
      }
    }
    if (count === 0) return { x: 0.5, y: 0.5, z: 0 };
    return { x: sumX / count, y: sumY / count, z: sumZ / count };
  };

  const midTorso = avgPoints([11, 12, 23, 24]);
  const midThigh = avgPoints([23, 24, 25, 26]);
  const midShank = avgPoints([25, 26, 27, 28]);
  const midArm = avgPoints([11, 12, 13, 14, 15, 16]);
  const midFoot = avgPoints([29, 30, 31, 32]);

  const comX = 0.5 * midTorso.x + 0.2 * midThigh.x + 0.12 * midShank.x + 0.1 * midArm.x + 0.08 * midFoot.x;
  const comY = 0.5 * midTorso.y + 0.2 * midThigh.y + 0.12 * midShank.y + 0.1 * midArm.y + 0.08 * midFoot.y;
  const comZ = 0.5 * midTorso.z + 0.2 * midThigh.z + 0.12 * midShank.z + 0.1 * midArm.z + 0.08 * midFoot.z;

  return { x: comX, y: comY, z: comZ };
}

/**
 * Converts a normalized 2D/3D MediaPipe landmark to Three.js world coordinates
 * matching the DigitalTwinCanvas 3D scene convention.
 */
export function landmarkToThreeVector(lm: Landmark, xOffset = 0): THREE.Vector3 {
  const x = (lm.x - 0.5) * 2.2 + xOffset;
  const y = (1.0 - lm.y) * 1.9;
  const z = -(lm.z ?? 0) * 2.2;
  return new THREE.Vector3(x, y, z);
}

/**
 * Interpolates or samples joint angles at a specific gait cycle percentage (0..100%).
 */
function sampleJointAnglesAtPhase(
  angleAnalysis: GaitAngleAnalysis | null | undefined,
  phasePct: number,
): {
  kneeLeft: number;
  kneeRight: number;
  hipLeft: number;
  hipRight: number;
  ankleLeft: number;
  ankleRight: number;
} {
  const p = Math.max(0, Math.min(100, phasePct));
  const points = angleAnalysis?.normalizedPoints;

  // Fallback Perry & Burnfield (2010) normative curves
  const normCurves = getNormativeGaitCurves();
  const getNormAt = (pct: number) => {
    const idx = Math.max(0, Math.min(normCurves.length - 1, Math.round(pct)));
    return normCurves[idx];
  };

  const normLeft = getNormAt(p);
  const normRight = getNormAt((p + 50) % 100);

  if (!points || points.length === 0) {
    return {
      kneeLeft: normLeft.kneeMean,
      kneeRight: normRight.kneeMean,
      hipLeft: normLeft.hipMean,
      hipRight: normRight.hipMean,
      ankleLeft: normLeft.ankleMean,
      ankleRight: normRight.ankleMean,
    };
  }

  // Exact point or linear interpolation across normalizedPoints
  const idx = Math.min(points.length - 1, Math.floor((p / 100) * (points.length - 1)));
  const nextIdx = Math.min(points.length - 1, idx + 1);
  const t = (p / 100) * (points.length - 1) - idx;

  const ptA = points[idx];
  const ptB = points[nextIdx];

  const interp = (a: number | null | undefined, b: number | null | undefined, fallback: number) => {
    const valA = a != null && !Number.isNaN(a) ? a : fallback;
    const valB = b != null && !Number.isNaN(b) ? b : fallback;
    return valA * (1 - t) + valB * t;
  };

  const kneeLeft = interp(ptA?.kneeAngleLeft, ptB?.kneeAngleLeft, normLeft.kneeMean);
  const kneeRight = interp(ptA?.kneeAngleRight, ptB?.kneeAngleRight, normRight.kneeMean);
  const hipLeft = interp(ptA?.hipAngleLeft, ptB?.hipAngleLeft, normLeft.hipMean);
  const hipRight = interp(ptA?.hipAngleRight, ptB?.hipAngleRight, normRight.hipMean);
  const ankleLeft = interp(ptA?.ankleAngleLeft, ptB?.ankleAngleLeft, normLeft.ankleMean);
  const ankleRight = interp(ptA?.ankleAngleRight, ptB?.ankleAngleRight, normRight.ankleMean);

  return { kneeLeft, kneeRight, hipLeft, hipRight, ankleLeft, ankleRight };
}

/**
 * Synthesizes 33 3D MediaPipe skeletal landmarks at normalized gait cycle phase p in [0, 100]%.
 * Uses raw PoseFrame[] interpolation when available, or forward-kinematics biomechanical synthesis
 * from GaitAngleAnalysis and GaitMetrics.
 */
export function reconstructPoseAtPhase(
  session: GaitSessionRecord | PoseReconstructionInput | null | undefined,
  phasePct: number,
): Landmark[] {
  const p = Number.isFinite(phasePct) ? Math.max(0, Math.min(100, phasePct)) : 0;

  // Extract properties safely
  const s = session as Record<string, unknown> | null | undefined;
  const frames: PoseFrame[] | undefined = (s?.frames as PoseFrame[]) || undefined;
  const angleAnalysis: GaitAngleAnalysis | undefined =
    (s?.angleAnalysis as GaitAngleAnalysis) || (s?.angleAnalysisJson as GaitAngleAnalysis) || undefined;
  const metrics: GaitMetrics | undefined =
    (s?.metrics as GaitMetrics) || (s?.metricsJson as GaitMetrics) || undefined;

  // 1. Raw frames interpolation if available
  if (frames && Array.isArray(frames) && frames.length > 0) {
    const validFrames = frames.filter((f) => f && f.landmarks && f.landmarks.length >= 33);
    if (validFrames.length > 0) {
      const floatIndex = (p / 100) * (validFrames.length - 1);
      const idxA = Math.floor(floatIndex);
      const idxB = Math.min(validFrames.length - 1, idxA + 1);
      const frac = floatIndex - idxA;

      const fA = validFrames[idxA].landmarks;
      const fB = validFrames[idxB].landmarks;

      const result: Landmark[] = [];
      for (let i = 0; i < 33; i++) {
        const lmA = fA[i] || { x: 0.5, y: 0.5, z: 0, visibility: 0 };
        const lmB = fB[i] || { x: 0.5, y: 0.5, z: 0, visibility: 0 };
        const x = (1 - frac) * lmA.x + frac * lmB.x;
        const y = (1 - frac) * lmA.y + frac * lmB.y;
        const z = (1 - frac) * (lmA.z ?? 0) + frac * (lmB.z ?? 0);
        const visibility = Math.min(lmA.visibility ?? 1, lmB.visibility ?? 1);
        result.push({ x, y, z, visibility, presence: visibility });
      }
      return result;
    }
  }

  // 2. Biomechanical Forward Kinematics Synthesis from Kinematic Angles & Metrics
  const angles = sampleJointAnglesAtPhase(angleAnalysis, p);

  const phaseRad = (p / 100) * 2 * Math.PI;

  // Spatio-temporal oscillation parameters
  const verticalBounce = (metrics?.verticalBounce ?? 0.015);
  const lateralSway = (metrics?.lateralSway ?? 0.018);
  const pelvicObliquityDeg = (metrics?.pelvicObliquity ?? 3.5);
  const armSwingAmpLeft = ((metrics?.armSwingLeft ?? 22) * Math.PI) / 180;
  const armSwingAmpRight = ((metrics?.armSwingRight ?? 22) * Math.PI) / 180;

  // Pelvis root coordinates (MediaPipe normalized space [0, 1])
  const yPelvis = 0.48 + verticalBounce * Math.sin(2 * phaseRad); // 2 vertical dips per cycle
  const xPelvis = 0.5 + lateralSway * Math.sin(phaseRad); // 1 lateral sway cycle
  const zPelvis = 0.0;

  const oblAngle = (pelvicObliquityDeg * Math.PI / 180) * Math.sin(phaseRad);
  const yawAngle = (4.0 * Math.PI / 180) * Math.cos(phaseRad);

  const halfHipWidth = 0.08;
  const thighLen = 0.22;
  const shankLen = 0.22;
  const heelLen = 0.04;
  const toeLen = 0.08;

  // Hip Landmarks (23: Left Hip, 24: Right Hip)
  const xHipL = xPelvis - halfHipWidth * Math.cos(oblAngle) * Math.cos(yawAngle);
  const yHipL = yPelvis - halfHipWidth * Math.sin(oblAngle);
  const zHipL = zPelvis - halfHipWidth * Math.sin(yawAngle);

  const xHipR = xPelvis + halfHipWidth * Math.cos(oblAngle) * Math.cos(yawAngle);
  const yHipR = yPelvis + halfHipWidth * Math.sin(oblAngle);
  const zHipR = zPelvis + halfHipWidth * Math.sin(yawAngle);

  // --- Left Leg Kinematics ---
  // Hip flexion: positive flexes femur forward (-Z)
  const hipAngleRadL = (angles.hipLeft * Math.PI) / 180;
  const kneeFlexRadL = (angles.kneeLeft * Math.PI) / 180;
  const ankleFlexRadL = (angles.ankleLeft * Math.PI) / 180;

  const xKneeL = xHipL;
  const yKneeL = yHipL + thighLen * Math.cos(hipAngleRadL);
  const zKneeL = zHipL - thighLen * Math.sin(hipAngleRadL);

  const shankAngleRadL = hipAngleRadL - kneeFlexRadL;
  const xAnkL = xKneeL;
  const yAnkL = yKneeL + shankLen * Math.cos(shankAngleRadL);
  const zAnkL = zKneeL - shankLen * Math.sin(shankAngleRadL);

  const footAngleRadL = shankAngleRadL - Math.PI / 2 + ankleFlexRadL;
  const xHeelL = xAnkL - 0.01;
  const yHeelL = yAnkL + 0.02;
  const zHeelL = zAnkL + heelLen * Math.cos(footAngleRadL);

  const xToeL = xAnkL;
  const yToeL = yAnkL + 0.02;
  const zToeL = zAnkL - toeLen * Math.cos(footAngleRadL);

  // --- Right Leg Kinematics ---
  const hipAngleRadR = (angles.hipRight * Math.PI) / 180;
  const kneeFlexRadR = (angles.kneeRight * Math.PI) / 180;
  const ankleFlexRadR = (angles.ankleRight * Math.PI) / 180;

  const xKneeR = xHipR;
  const yKneeR = yHipR + thighLen * Math.cos(hipAngleRadR);
  const zKneeR = zHipR - thighLen * Math.sin(hipAngleRadR);

  const shankAngleRadR = hipAngleRadR - kneeFlexRadR;
  const xAnkR = xKneeR;
  const yAnkR = yKneeR + shankLen * Math.cos(shankAngleRadR);
  const zAnkR = zKneeR - shankLen * Math.sin(shankAngleRadR);

  const footAngleRadR = shankAngleRadR - Math.PI / 2 + ankleFlexRadR;
  const xHeelR = xAnkR + 0.01;
  const yHeelR = yAnkR + 0.02;
  const zHeelR = zAnkR + heelLen * Math.cos(footAngleRadR);

  const xToeR = xAnkR;
  const yToeR = yAnkR + 0.02;
  const zToeR = zAnkR - toeLen * Math.cos(footAngleRadR);

  // --- Upper Body Kinematics ---
  const torsoLen = 0.28;
  const yShCenter = yPelvis - torsoLen;
  const xShCenter = xPelvis;
  const zShCenter = zPelvis;

  const halfShWidth = 0.10;
  const shYaw = -0.7 * yawAngle; // Shoulders counter-rotate against pelvis
  const shObl = -0.5 * oblAngle;

  const xShL = xShCenter - halfShWidth * Math.cos(shObl) * Math.cos(shYaw);
  const yShL = yShCenter - halfShWidth * Math.sin(shObl);
  const zShL = zShCenter - halfShWidth * Math.sin(shYaw);

  const xShR = xShCenter + halfShWidth * Math.cos(shObl) * Math.cos(shYaw);
  const yShR = yShCenter + halfShWidth * Math.sin(shObl);
  const zShR = zShCenter + halfShWidth * Math.sin(shYaw);

  // Arm Swing (Left arm swings opposite to Left leg, in sync with Right leg)
  const armSwingAngleL = -armSwingAmpLeft * Math.sin(phaseRad);
  const armSwingAngleR = armSwingAmpRight * Math.sin(phaseRad);

  const upperArmLen = 0.14;
  const forearmLen = 0.13;

  const xElbL = xShL - 0.02;
  const yElbL = yShL + upperArmLen * Math.cos(armSwingAngleL);
  const zElbL = zShL - upperArmLen * Math.sin(armSwingAngleL);

  const elbFlexL = armSwingAngleL - 0.25 * Math.max(0, -armSwingAngleL);
  const xWriL = xElbL - 0.01;
  const yWriL = yElbL + forearmLen * Math.cos(elbFlexL);
  const zWriL = zElbL - forearmLen * Math.sin(elbFlexL);

  const xElbR = xShR + 0.02;
  const yElbR = yShR + upperArmLen * Math.cos(armSwingAngleR);
  const zElbR = zShR - upperArmLen * Math.sin(armSwingAngleR);

  const elbFlexR = armSwingAngleR - 0.25 * Math.max(0, -armSwingAngleR);
  const xWriR = xElbR + 0.01;
  const yWriR = yElbR + forearmLen * Math.cos(elbFlexR);
  const zWriR = zElbR - forearmLen * Math.sin(elbFlexR);

  // Head and Face
  const yNose = yShCenter - 0.08;
  const xNose = xShCenter;
  const zNose = zShCenter - 0.03;

  const landmarks: Landmark[] = new Array(33);

  // Helper to store landmark
  const setLm = (idx: number, x: number, y: number, z: number) => {
    landmarks[idx] = { x, y, z, visibility: 0.95, presence: 0.95 };
  };

  setLm(0, xNose, yNose, zNose); // Nose
  setLm(1, xNose - 0.012, yNose - 0.015, zNose + 0.01); // Left Eye Inner
  setLm(2, xNose - 0.02, yNose - 0.015, zNose + 0.01); // Left Eye
  setLm(3, xNose - 0.028, yNose - 0.015, zNose + 0.01); // Left Eye Outer
  setLm(4, xNose + 0.012, yNose - 0.015, zNose + 0.01); // Right Eye Inner
  setLm(5, xNose + 0.02, yNose - 0.015, zNose + 0.01); // Right Eye
  setLm(6, xNose + 0.028, yNose - 0.015, zNose + 0.01); // Right Eye Outer
  setLm(7, xNose - 0.045, yNose - 0.01, zNose + 0.035); // Left Ear
  setLm(8, xNose + 0.045, yNose - 0.01, zNose + 0.035); // Right Ear
  setLm(9, xNose - 0.015, yNose + 0.02, zNose + 0.005); // Mouth Left
  setLm(10, xNose + 0.015, yNose + 0.02, zNose + 0.005); // Mouth Right

  setLm(11, xShL, yShL, zShL); // Left Shoulder
  setLm(12, xShR, yShR, zShR); // Right Shoulder
  setLm(13, xElbL, yElbL, zElbL); // Left Elbow
  setLm(14, xElbR, yElbR, zElbR); // Right Elbow
  setLm(15, xWriL, yWriL, zWriL); // Left Wrist
  setLm(16, xWriR, yWriR, zWriR); // Right Wrist
  setLm(17, xWriL - 0.008, yWriL + 0.03, zWriL); // Left Pinky
  setLm(18, xWriR + 0.008, yWriR + 0.03, zWriR); // Right Pinky
  setLm(19, xWriL, yWriL + 0.035, zWriL - 0.005); // Left Index
  setLm(20, xWriR, yWriR + 0.035, zWriR - 0.005); // Right Index
  setLm(21, xWriL + 0.008, yWriL + 0.025, zWriL - 0.008); // Left Thumb
  setLm(22, xWriR - 0.008, yWriR + 0.025, zWriR - 0.008); // Right Thumb

  setLm(23, xHipL, yHipL, zHipL); // Left Hip
  setLm(24, xHipR, yHipR, zHipR); // Right Hip
  setLm(25, xKneeL, yKneeL, zKneeL); // Left Knee
  setLm(26, xKneeR, yKneeR, zKneeR); // Right Knee
  setLm(27, xAnkL, yAnkL, zAnkL); // Left Ankle
  setLm(28, xAnkR, yAnkR, zAnkR); // Right Ankle
  setLm(29, xHeelL, yHeelL, zHeelL); // Left Heel
  setLm(30, xHeelR, yHeelR, zHeelR); // Right Heel
  setLm(31, xToeL, yToeL, zToeL); // Left Toe
  setLm(32, xToeR, yToeR, zToeR); // Right Toe

  return landmarks;
}

/**
 * Builds bilateral 3D joint trajectory curves across 0..100% gait cycle.
 */
export function buildBilateralTrajectories(
  session: GaitSessionRecord | PoseReconstructionInput | null | undefined,
  joint: TrajectoryJoint,
  numPoints = 101,
  xOffset = 0,
): { left: THREE.Vector3[]; right: THREE.Vector3[] } {
  if (joint === "none") {
    return { left: [], right: [] };
  }

  const leftPoints: THREE.Vector3[] = [];
  const rightPoints: THREE.Vector3[] = [];

  for (let i = 0; i < numPoints; i++) {
    const pct = (i / (numPoints - 1)) * 100;
    const lms = reconstructPoseAtPhase(session, pct);

    if (joint === "com") {
      const com = calculateDempsterCoM(lms);
      const comVec = landmarkToThreeVector({ x: com.x, y: com.y, z: com.z }, xOffset);
      leftPoints.push(comVec);
      rightPoints.push(comVec.clone());
    } else if (joint === "ankle") {
      leftPoints.push(landmarkToThreeVector(lms[27], xOffset)); // L Ankle
      rightPoints.push(landmarkToThreeVector(lms[28], xOffset)); // R Ankle
    } else if (joint === "knee") {
      leftPoints.push(landmarkToThreeVector(lms[25], xOffset)); // L Knee
      rightPoints.push(landmarkToThreeVector(lms[26], xOffset)); // R Knee
    } else if (joint === "wrist") {
      leftPoints.push(landmarkToThreeVector(lms[15], xOffset)); // L Wrist
      rightPoints.push(landmarkToThreeVector(lms[16], xOffset)); // R Wrist
    }
  }

  return { left: leftPoints, right: rightPoints };
}

/**
 * Builds a single continuous 3D spatial trajectory curve across 0..100% gait cycle.
 * For "com", returns the CoM trail. For bilateral joints, returns the left limb path.
 */
export function buildFullCycleTrajectories(
  session: GaitSessionRecord | PoseReconstructionInput | null | undefined,
  joint: TrajectoryJoint,
  numPoints = 101,
  xOffset = 0,
): THREE.Vector3[] {
  const { left } = buildBilateralTrajectories(session, joint, numPoints, xOffset);
  return left;
}

import type { Landmark, PoseFrame } from "./types";
import { LM, dist, mid, mean } from "./landmarks";

export type WarningLevel = "nominal" | "warning" | "critical";

export interface AlignmentGuidance {
  /** Recommended tripod height adjustment in centimeters (+ = raise camera, - = lower camera) */
  heightAdjustmentCm: number;
  /** Recommended optical pitch tilt adjustment in degrees (+ = tilt up, - = tilt down) */
  tiltAdjustmentDeg: number;
  /** Recommended optical yaw rotation adjustment in degrees (+ = rotate clockwise, - = rotate counter-clockwise) */
  yawAdjustmentDeg: number;
  /** Recommended camera distance adjustment in meters (+ = move back, - = move closer) */
  distanceAdjustmentM: number;
  /** Actionable human-readable guidance instructions */
  guidanceText: string[];
}

export interface AnthropometricRatios {
  /** Apparent thigh-to-shank length ratio */
  thighShankRatio: number;
  /** Apparent torso-to-leg length ratio */
  torsoLegRatio: number;
  /** Expected normative thigh-to-shank ratio (Winter 2009 / Dempster 1955: ~1.05) */
  normativeThighShankRatio: number;
  /** Expected normative torso-to-leg ratio (Winter 2009: ~0.586) */
  normativeTorsoLegRatio: number;
  /** Estimated pitch angle derived purely from anthropometric segment foreshortening */
  anthroPitchDeg: number;
}

export interface CameraPerspectiveParams {
  /** Camera optical pitch elevation angle in degrees (+ = tilted downward looking from above, - = tilted upward) */
  pitchDeg: number;
  /** Camera optical yaw azimuth angle in degrees (90° = true sagittal perpendicular, 0° = true frontal) */
  yawDeg: number;
  /** Camera optical roll in-plane rotation angle in degrees */
  rollDeg: number;
  /** Estimated subject distance along optical axis in meters */
  distanceMeters: number;
  /** Estimated camera optical center height above ground in meters */
  cameraHeightMeters: number;
  /** Whether optical alignment is within nominal clinical threshold (<= 10° deviation) */
  isOrthogonal: boolean;
  /** Angular deviation from ideal orthogonal plane in degrees */
  obliqueDeviationDeg: number;
  /** 3-tier clinical warning classification */
  warningLevel: WarningLevel;
  /** Human-readable clinical warning message */
  warningMessage: string;
  /** Actionable physical repositioning guidance */
  guidance: AlignmentGuidance;
  /** Anthropometric segment ratio diagnostics */
  anthropometrics: AnthropometricRatios;
  /** Geometric foreshortening scaling factor cos(pitch) * cos(yawDeviation) */
  foreshorteningFactor: number;
  /** Estimation confidence score (0.0 to 1.0) */
  confidence: number;
}

export interface CalibrationOptions {
  /** Subject physical height in meters (default: 1.72 m) */
  subjectHeightM?: number;
  /** Intended primary view angle plane (default: "sagittal") */
  targetView?: "sagittal" | "frontal";
  /** Maximum allowable tilt angle before triggering warning (default: 10.0°) */
  tiltThresholdDeg?: number;
  /** Critical tilt angle threshold (default: 20.0°) */
  criticalThresholdDeg?: number;
  /** Normalized optical focal length fn = f / sensor_height (default: 1.15 for ~65° vertical FOV) */
  normalizedFocalLength?: number;
}

/** Standard Winter (2009) / Dempster (1955) anthropometric constants */
export const NORMATIVE_THIGH_SHANK_RATIO = 1.05;
export const NORMATIVE_TORSO_LEG_RATIO = 0.586;
export const DEFAULT_SUBJECT_HEIGHT_M = 1.72;
export const DEFAULT_FOCAL_LENGTH_NORM = 1.15;
export const DEFAULT_TILT_THRESHOLD_DEG = 10.0;
export const DEFAULT_CRITICAL_THRESHOLD_DEG = 20.0;

/**
 * Calculates anthropometric segment ratios and pitch foreshortening differential
 * from 2D / 3D body landmark coordinates.
 */
export function extractAnthropometricRatios(
  landmarks: Landmark[],
  targetView: "sagittal" | "frontal" = "sagittal"
): AnthropometricRatios {
  if (!landmarks || landmarks.length < 29) {
    return {
      thighShankRatio: NORMATIVE_THIGH_SHANK_RATIO,
      torsoLegRatio: NORMATIVE_TORSO_LEG_RATIO,
      normativeThighShankRatio: NORMATIVE_THIGH_SHANK_RATIO,
      normativeTorsoLegRatio: NORMATIVE_TORSO_LEG_RATIO,
      anthroPitchDeg: 0,
    };
  }

  const lHip = landmarks[LM.L_HIP];
  const rHip = landmarks[LM.R_HIP];
  const lKnee = landmarks[LM.L_KNEE];
  const rKnee = landmarks[LM.R_KNEE];
  const lAnkle = landmarks[LM.L_ANKLE];
  const rAnkle = landmarks[LM.R_ANKLE];
  const lShoulder = landmarks[LM.L_SHOULDER];
  const rShoulder = landmarks[LM.R_SHOULDER];

  const lThigh = dist(lHip, lKnee);
  const rThigh = dist(rHip, rKnee);
  const lShank = dist(lKnee, lAnkle);
  const rShank = dist(rKnee, rAnkle);

  // Pick the side with higher landmark visibility / length
  const thigh = Math.max(lThigh, rThigh, 1e-4);
  const shank = Math.max(lShank, rShank, 1e-4);
  const thighShankRatio = thigh / shank;

  const midHip = mid(lHip, rHip);
  const midShoulder = mid(lShoulder, rShoulder);
  const torsoLen = dist(midShoulder, midHip);
  const legLen = (thigh + shank) / 2;
  const torsoLegRatio = legLen > 1e-4 ? torsoLen / legLen : NORMATIVE_TORSO_LEG_RATIO;

  // Pitch differential calculation:
  // When camera pitches down, vertical dimensions (shank, standing trunk) are foreshortened by cos(pitch).
  // Thigh in sagittal stance swings through horizontal, giving unforeshortened reference.
  let foreshorteningCos = 1.0;
  if (targetView === "sagittal") {
    // In sagittal view, compare apparent vertical shank projection to normalized expected leg fraction
    const rawRatioRatio = thighShankRatio / NORMATIVE_THIGH_SHANK_RATIO;
    // If thigh is larger relative to shank than expected, vertical shank is foreshortened
    if (rawRatioRatio > 1.0) {
      foreshorteningCos = Math.max(0.5, Math.min(1.0, 1.0 / rawRatioRatio));
    } else {
      foreshorteningCos = Math.max(0.5, Math.min(1.0, rawRatioRatio));
    }
  } else {
    // In frontal view, compare torso-to-leg ratio
    const torsoRatioRatio = torsoLegRatio / NORMATIVE_TORSO_LEG_RATIO;
    foreshorteningCos = Math.max(0.5, Math.min(1.0, torsoRatioRatio));
  }

  const anthroPitchDeg = (Math.acos(foreshorteningCos) * 180) / Math.PI;

  return {
    thighShankRatio: Number(thighShankRatio.toFixed(3)),
    torsoLegRatio: Number(torsoLegRatio.toFixed(3)),
    normativeThighShankRatio: NORMATIVE_THIGH_SHANK_RATIO,
    normativeTorsoLegRatio: NORMATIVE_TORSO_LEG_RATIO,
    anthroPitchDeg: Number(anthroPitchDeg.toFixed(2)),
  };
}

/**
 * Estimates ground plane normal vector [nx, ny, nz] from foot contact landmarks across frames.
 * Uses 3D worldLandmarks when available, falling back to 2D coordinates.
 */
export function estimateGroundPlaneNormal(frames: PoseFrame[]): {
  normal: [number, number, number];
  pitchFloorDeg: number;
  rollFloorDeg: number;
} {
  if (!frames || frames.length === 0) {
    return { normal: [0, -1, 0], pitchFloorDeg: 0, rollFloorDeg: 0 };
  }

  // Check if we have true 3D worldLandmarks with depth variation
  const has3D = frames.some(
    (f) => f.worldLandmarks && f.worldLandmarks.length >= 33 && f.worldLandmarks.some((p) => Math.abs(p.z ?? 0) > 0.01)
  );

  const footPts: [number, number, number][] = [];

  for (const f of frames) {
    const lm = has3D && f.worldLandmarks && f.worldLandmarks.length >= 33 ? f.worldLandmarks : f.landmarks;
    if (!lm || lm.length < 33) continue;

    // Collect left and right ankle, heel, foot landmarks
    for (const idx of [LM.L_ANKLE, LM.R_ANKLE, LM.L_HEEL, LM.R_HEEL, LM.L_FOOT, LM.R_FOOT]) {
      const p = lm[idx];
      if (p && (p.visibility ?? 1) >= 0.3) {
        footPts.push([p.x, p.y, p.z ?? 0]);
      }
    }
  }

  if (footPts.length < 4) {
    return { normal: [0, -1, 0], pitchFloorDeg: 0, rollFloorDeg: 0 };
  }

  // If we only have 2D screen coordinates (where Z is relative landmark depth, not world position):
  // Screen Y increases as subject approaches camera on a level floor due to 1/Z perspective projection.
  // We must not fit a global 3D plane treating screen Y as physical elevation.
  if (!has3D) {
    // In 2D, estimate camera in-plane roll from average bilateral foot contact slope
    let rollSum = 0;
    let rollCount = 0;
    for (const f of frames) {
      const lm = f.landmarks;
      if (!lm || lm.length < 33) continue;
      const lAnk = lm[LM.L_ANKLE];
      const rAnk = lm[LM.R_ANKLE];
      if (lAnk && rAnk && (lAnk.visibility ?? 1) >= 0.4 && (rAnk.visibility ?? 1) >= 0.4) {
        const dx = rAnk.x - lAnk.x;
        const dy = rAnk.y - lAnk.y;
        if (Math.abs(dx) > 0.05) {
          const roll = (Math.atan2(dy, dx) * 180) / Math.PI;
          rollSum += roll;
          rollCount++;
        }
      }
    }
    const rollFloorDeg = rollCount > 0 ? Number((rollSum / rollCount).toFixed(2)) : 0;
    return { normal: [0, -1, 0], pitchFloorDeg: 0, rollFloorDeg };
  }

  // Compute centroid
  let cx = 0, cy = 0, cz = 0;
  for (const [x, y, z] of footPts) {
    cx += x;
    cy += y;
    cz += z;
  }
  cx /= footPts.length;
  cy /= footPts.length;
  cz /= footPts.length;

  // Covariance matrix for plane normal estimation (smallest eigenvector)
  let xx = 0, xy = 0, xz = 0, yz = 0, zz = 0;
  for (const [x, y, z] of footPts) {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yz += dy * dz;
    zz += dz * dz;
  }

  // Robust analytical cross product from principle ground spanning vectors
  let nx = 0;
  let ny = -1;
  let nz = 0;

  if (Math.abs(zz) > 1e-6 || Math.abs(yz) > 1e-6) {
    const det = xx * zz - xz * xz;
    if (Math.abs(det) > 1e-6) {
      nx = (xy * zz - yz * xz) / det;
      nz = (yz * xx - xy * xz) / det;
      ny = -1;
    }
  }

  const norm = Math.hypot(nx, ny, nz) || 1;
  nx /= norm;
  ny /= norm;
  nz /= norm;

  const rawPitchFloorDeg = (Math.atan2(-nz, -ny) * 180) / Math.PI;
  const rawRollFloorDeg = (Math.atan2(nx, -ny) * 180) / Math.PI;

  // Clamp realistic floor plane pitch to [-35°, 35°]
  const pitchFloorDeg = Math.max(-35, Math.min(35, rawPitchFloorDeg));
  const rollFloorDeg = Math.max(-35, Math.min(35, rawRollFloorDeg));

  return {
    normal: [nx, ny, nz],
    pitchFloorDeg: Number(pitchFloorDeg.toFixed(2)),
    rollFloorDeg: Number(rollFloorDeg.toFixed(2)),
  };
}

/**
 * Estimates camera optical yaw (azimuth) angle in degrees:
 * 90° = True Sagittal View (walking perpendicular to optical axis)
 * 0° = True Frontal View (walking directly towards/away from camera)
 */
export function estimateCameraYaw(
  frames: PoseFrame[],
  targetView: "sagittal" | "frontal" = "sagittal"
): { yawDeg: number; yawConfidence: number } {
  if (!frames || frames.length === 0) {
    return { yawDeg: targetView === "sagittal" ? 90 : 0, yawConfidence: 0.5 };
  }

  const shoulderYaws: number[] = [];
  const hipYaws: number[] = [];

  for (const f of frames) {
    const lm = f.landmarks;
    if (!lm || lm.length < 25) continue;

    const lSh = lm[LM.L_SHOULDER];
    const rSh = lm[LM.R_SHOULDER];
    const lHip = lm[LM.L_HIP];
    const rHip = lm[LM.R_HIP];

    if (lSh && rSh && (lSh.visibility ?? 1) >= 0.3 && (rSh.visibility ?? 1) >= 0.3) {
      const dx = Math.abs(rSh.x - lSh.x);
      const dz = Math.abs((rSh.z ?? 0) - (lSh.z ?? 0));
      // In sagittal view, dx -> 0, dz -> max (yielding ~90°)
      // In frontal view, dz -> 0, dx -> max (yielding ~0°)
      const yaw = (Math.atan2(dz, dx) * 180) / Math.PI;
      shoulderYaws.push(yaw);
    }

    if (lHip && rHip && (lHip.visibility ?? 1) >= 0.3 && (rHip.visibility ?? 1) >= 0.3) {
      const dx = Math.abs(rHip.x - lHip.x);
      const dz = Math.abs((rHip.z ?? 0) - (lHip.z ?? 0));
      const yaw = (Math.atan2(dz, dx) * 180) / Math.PI;
      hipYaws.push(yaw);
    }
  }

  // Trajectory progression angle if multi-frame
  let trajYaw: number | null = null;
  if (frames.length >= 5) {
    const firstHip = mid(frames[0].landmarks[LM.L_HIP], frames[0].landmarks[LM.R_HIP]);
    const lastHip = mid(
      frames[frames.length - 1].landmarks[LM.L_HIP],
      frames[frames.length - 1].landmarks[LM.R_HIP]
    );
    const dx = Math.abs(lastHip.x - firstHip.x);
    const dz = Math.abs((lastHip.z ?? 0) - (firstHip.z ?? 0));
    if (dx + dz > 0.05) {
      // If moving predominantly across screen (dx > dz), yaw is closer to 90° (sagittal)
      trajYaw = (Math.atan2(dx, dz) * 180) / Math.PI;
    }
  }

  const avgShoulderYaw = shoulderYaws.length > 0 ? mean(shoulderYaws) : (targetView === "sagittal" ? 90 : 0);
  const avgHipYaw = hipYaws.length > 0 ? mean(hipYaws) : avgShoulderYaw;

  let fusedYaw = 0.55 * avgShoulderYaw + 0.45 * avgHipYaw;
  if (trajYaw !== null) {
    fusedYaw = 0.4 * avgShoulderYaw + 0.3 * avgHipYaw + 0.3 * trajYaw;
  }

  return {
    yawDeg: Number(fusedYaw.toFixed(2)),
    yawConfidence: shoulderYaws.length > 0 ? 0.85 : 0.4,
  };
}

/**
 * Estimates distance from camera to subject and camera elevation height.
 */
export function estimateDistanceAndHeight(
  frames: PoseFrame[],
  pitchDeg: number,
  subjectHeightM = DEFAULT_SUBJECT_HEIGHT_M,
  focalLengthNorm = DEFAULT_FOCAL_LENGTH_NORM
): { distanceMeters: number; cameraHeightMeters: number } {
  if (!frames || frames.length === 0) {
    return { distanceMeters: 2.8, cameraHeightMeters: 1.4 };
  }

  const heights: number[] = [];
  const hipYs: number[] = [];

  for (const f of frames) {
    const lm = f.landmarks;
    if (!lm || lm.length < 29) continue;

    const nose = lm[LM.NOSE];
    const lAnkle = lm[LM.L_ANKLE];
    const rAnkle = lm[LM.R_ANKLE];
    const ankleY = Math.max(lAnkle?.y ?? 0.9, rAnkle?.y ?? 0.9);
    const headY = nose?.y ?? 0.15;

    const hNorm = ankleY - headY;
    if (hNorm >= 0.15 && hNorm <= 1.0) {
      heights.push(hNorm);
    }

    const hip = mid(lm[LM.L_HIP], lm[LM.R_HIP]);
    hipYs.push(hip.y);
  }

  const avgHNorm = heights.length > 0 ? mean(heights) : 0.65;
  const distanceMeters = (focalLengthNorm * subjectHeightM) / Math.max(0.1, avgHNorm);

  // Subject hip height in world is ~0.53 * subjectHeight
  const subjectHipHeightM = 0.53 * subjectHeightM;
  // Elevation delta = D * tan(pitch)
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const heightDeltaM = distanceMeters * Math.tan(pitchRad);
  const cameraHeightMeters = Math.max(0.3, subjectHipHeightM + heightDeltaM);

  return {
    distanceMeters: Number(distanceMeters.toFixed(2)),
    cameraHeightMeters: Number(cameraHeightMeters.toFixed(2)),
  };
}

/**
 * Generates actionable physical alignment guidance recommendations.
 */
export function generateAlignmentGuidance(
  pitchDeg: number,
  yawDeg: number,
  distanceMeters: number,
  cameraHeightMeters: number,
  targetView: "sagittal" | "frontal" = "sagittal",
  tiltThresholdDeg = DEFAULT_TILT_THRESHOLD_DEG
): AlignmentGuidance {
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const heightDeltaM = distanceMeters * Math.tan(pitchRad);
  const heightAdjustmentCm = Number((-heightDeltaM * 100).toFixed(1));
  const tiltAdjustmentDeg = Number((-pitchDeg).toFixed(1));

  const targetYaw = targetView === "sagittal" ? 90.0 : 0.0;
  const yawAdjustmentDeg = Number((targetYaw - yawDeg).toFixed(1));

  let distanceAdjustmentM = 0;
  if (distanceMeters < 2.0) {
    distanceAdjustmentM = Number((2.8 - distanceMeters).toFixed(1));
  } else if (distanceMeters > 4.5) {
    distanceAdjustmentM = Number((3.2 - distanceMeters).toFixed(1));
  }

  const guidanceText: string[] = [];

  // Pitch / Height Guidance
  if (Math.abs(pitchDeg) > tiltThresholdDeg) {
    if (pitchDeg > 0) {
      const cm = Math.abs(Math.round(heightAdjustmentCm));
      const deg = Math.abs(Math.round(pitchDeg));
      guidanceText.push(`Lower tripod by ~${cm} cm, or tilt camera up by ${deg}° to align with hip height.`);
    } else {
      const cm = Math.abs(Math.round(heightAdjustmentCm));
      const deg = Math.abs(Math.round(pitchDeg));
      guidanceText.push(`Raise tripod by ~${cm} cm, or tilt camera down by ${deg}° to align with hip height.`);
    }
  } else {
    guidanceText.push(`Tripod height is optimal (~${cameraHeightMeters.toFixed(2)} m elevation).`);
  }

  // Yaw Guidance
  const yawDev = Math.abs(yawAdjustmentDeg);
  if (yawDev > tiltThresholdDeg) {
    const rotDir = yawAdjustmentDeg > 0 ? "clockwise" : "counter-clockwise";
    guidanceText.push(
      `Rotate camera ~${Math.round(yawDev)}° ${rotDir} toward ${targetView === "sagittal" ? "the sagittal plane (parallel to line of walking)" : "the frontal plane"}.`
    );
  } else {
    guidanceText.push(`Optical azimuth alignment is nominal (${yawDeg.toFixed(1)}°).`);
  }

  // Distance Guidance
  if (distanceAdjustmentM > 0) {
    guidanceText.push(`Move camera back ~${distanceAdjustmentM} m to prevent stride clipping at walkway boundaries.`);
  } else if (distanceAdjustmentM < 0) {
    guidanceText.push(`Move camera closer ~${Math.abs(distanceAdjustmentM)} m for higher landmark resolution.`);
  } else {
    guidanceText.push(`Subject distance is optimal (${distanceMeters.toFixed(2)} m).`);
  }

  return {
    heightAdjustmentCm,
    tiltAdjustmentDeg,
    yawAdjustmentDeg,
    distanceAdjustmentM,
    guidanceText,
  };
}

/**
 * Real-time optical perspective attitude estimator from a single pose frame.
 */
export function estimateRealtimePerspective(
  frame: PoseFrame,
  options: CalibrationOptions = {}
): CameraPerspectiveParams {
  return estimateCameraPerspective([frame], options);
}

/**
 * Markerless optical camera attitude estimator across continuous gait sequence.
 * Fuses anthropometric segment invariants (Winter 2009 / Dempster 1955), ground contact geometry,
 * and azimuth projection ratios.
 */
export function estimateCameraPerspective(
  frames: PoseFrame[],
  options: CalibrationOptions = {}
): CameraPerspectiveParams {
  const tiltThresholdDeg = options.tiltThresholdDeg || DEFAULT_TILT_THRESHOLD_DEG;
  const criticalThresholdDeg = options.criticalThresholdDeg || DEFAULT_CRITICAL_THRESHOLD_DEG;
  const subjectHeightM = options.subjectHeightM || DEFAULT_SUBJECT_HEIGHT_M;
  const focalLengthNorm = options.normalizedFocalLength || DEFAULT_FOCAL_LENGTH_NORM;

  // Auto-detect view plane if not explicitly passed
  const initialYaw = estimateCameraYaw(frames, options.targetView || "sagittal");
  const targetView = options.targetView || (initialYaw.yawDeg < 45 ? "frontal" : "sagittal");

  if (!frames || frames.length === 0) {
    const defaultGuidance: AlignmentGuidance = {
      heightAdjustmentCm: 0,
      tiltAdjustmentDeg: 0,
      yawAdjustmentDeg: 0,
      distanceAdjustmentM: 0,
      guidanceText: ["No pose frames available for optical calibration."],
    };
    return {
      pitchDeg: 0,
      yawDeg: targetView === "sagittal" ? 90 : 0,
      rollDeg: 0,
      distanceMeters: 2.8,
      cameraHeightMeters: 1.4,
      isOrthogonal: true,
      obliqueDeviationDeg: 0,
      warningLevel: "nominal",
      warningMessage: `Camera is optimally aligned within the orthogonal plane (Pitch: 0.0°, Yaw: ${targetView === "sagittal" ? "90.0" : "0.0"}°).`,
      guidance: defaultGuidance,
      anthropometrics: {
        thighShankRatio: NORMATIVE_THIGH_SHANK_RATIO,
        torsoLegRatio: NORMATIVE_TORSO_LEG_RATIO,
        normativeThighShankRatio: NORMATIVE_THIGH_SHANK_RATIO,
        normativeTorsoLegRatio: NORMATIVE_TORSO_LEG_RATIO,
        anthroPitchDeg: 0,
      },
      foreshorteningFactor: 1.0,
      confidence: 0,
    };
  }

  // 1. Anthropometric Ratios
  const anthroResults = frames.map((f) => extractAnthropometricRatios(f.landmarks, targetView));
  const avgAnthroPitch = mean(anthroResults.map((a) => a.anthroPitchDeg));
  const avgThighShank = mean(anthroResults.map((a) => a.thighShankRatio));
  const avgTorsoLeg = mean(anthroResults.map((a) => a.torsoLegRatio));

  // 2. Ground Plane Normal from Foot Contacts
  const { pitchFloorDeg, rollFloorDeg } = estimateGroundPlaneNormal(frames);

  // 3. Multi-cue Pitch Fusion:
  // Ground plane normal (55%) + Anthropometric foreshortening (45%)
  let fusedPitchDeg = 0.55 * pitchFloorDeg + 0.45 * avgAnthroPitch;
  if (Math.abs(pitchFloorDeg) < 1e-4) {
    fusedPitchDeg = avgAnthroPitch;
  } else if (Math.abs(avgAnthroPitch) < 1e-4) {
    fusedPitchDeg = pitchFloorDeg;
  }
  fusedPitchDeg = Number(fusedPitchDeg.toFixed(2));

  // 4. Optical Yaw Estimation
  const { yawDeg, yawConfidence } = estimateCameraYaw(frames, targetView);

  // 5. Distance and Height
  const { distanceMeters, cameraHeightMeters } = estimateDistanceAndHeight(
    frames,
    fusedPitchDeg,
    subjectHeightM,
    focalLengthNorm
  );

  // 6. Angular Oblique Deviation
  const targetYaw = targetView === "sagittal" ? 90.0 : 0.0;
  const yawDeviationDeg = Math.abs(yawDeg - targetYaw);
  const obliqueDeviationDeg = Number(Math.max(Math.abs(fusedPitchDeg), yawDeviationDeg).toFixed(2));

  // 7. 3-Tier Clinical Warning System
  let warningLevel: WarningLevel = "nominal";
  let isOrthogonal = true;
  let warningMessage = `Camera is optimally aligned within the orthogonal plane (Pitch: ${fusedPitchDeg >= 0 ? "+" : ""}${fusedPitchDeg}°, Yaw: ${yawDeg}°).`;

  const pitchRad = (fusedPitchDeg * Math.PI) / 180;
  const yawDevRad = (yawDeviationDeg * Math.PI) / 180;
  const foreshorteningFactor = Number((Math.cos(pitchRad) * Math.cos(yawDevRad)).toFixed(3));
  const foreshorteningPct = Math.round((1 - foreshorteningFactor) * 100);

  if (obliqueDeviationDeg > criticalThresholdDeg) {
    warningLevel = "critical";
    isOrthogonal = false;
    warningMessage = `Severe non-orthogonal perspective distortion (${obliqueDeviationDeg}° tilt). Apparent sagittal angles are foreshortened by ~${foreshorteningPct}%. Perspective correction is required.`;
  } else if (obliqueDeviationDeg > tiltThresholdDeg) {
    warningLevel = "warning";
    isOrthogonal = false;
    warningMessage = `Non-orthogonal camera view (${obliqueDeviationDeg}° tilt > ${tiltThresholdDeg}°). Sagittal angles may be foreshortened by ~${foreshorteningPct}%. Perspective correction recommended.`;
  }

  // 8. Physical Repositioning Guidance
  const guidance = generateAlignmentGuidance(
    fusedPitchDeg,
    yawDeg,
    distanceMeters,
    cameraHeightMeters,
    targetView,
    tiltThresholdDeg
  );

  const confidence = Number(
    Math.min(1.0, Math.max(0.2, (yawConfidence + (frames.length > 5 ? 0.2 : 0.05)) * 0.85)).toFixed(2)
  );

  return {
    pitchDeg: fusedPitchDeg,
    yawDeg,
    rollDeg: rollFloorDeg,
    distanceMeters,
    cameraHeightMeters,
    isOrthogonal,
    obliqueDeviationDeg,
    warningLevel,
    warningMessage,
    guidance,
    anthropometrics: {
      thighShankRatio: Number(avgThighShank.toFixed(3)),
      torsoLegRatio: Number(avgTorsoLeg.toFixed(3)),
      normativeThighShankRatio: NORMATIVE_THIGH_SHANK_RATIO,
      normativeTorsoLegRatio: NORMATIVE_TORSO_LEG_RATIO,
      anthroPitchDeg: Number(avgAnthroPitch.toFixed(2)),
    },
    foreshorteningFactor,
    confidence,
  };
}

/**
 * Computes 3x3 3D spatial rotation matrix for rectifying camera perspective attitude:
 * R_rect = R_z(-gamma) * R_x(-phi) * R_y(-delta)
 */
export function createPerspectiveRectificationMatrix(
  pitchDeg: number,
  yawDevDeg: number,
  rollDeg = 0
): number[][] {
  const phi = (pitchDeg * Math.PI) / 180;
  const delta = (yawDevDeg * Math.PI) / 180;
  const gamma = (rollDeg * Math.PI) / 180;

  // Rx(-phi)
  const cosP = Math.cos(-phi);
  const sinP = Math.sin(-phi);
  const Rx = [
    [1, 0, 0],
    [0, cosP, -sinP],
    [0, sinP, cosP],
  ];

  // Ry(-delta)
  const cosY = Math.cos(-delta);
  const sinY = Math.sin(-delta);
  const Ry = [
    [cosY, 0, sinY],
    [0, 1, 0],
    [-sinY, 0, cosY],
  ];

  // Rz(-gamma)
  const cosR = Math.cos(-gamma);
  const sinR = Math.sin(-gamma);
  const Rz = [
    [cosR, -sinR, 0],
    [sinR, cosR, 0],
    [0, 0, 1],
  ];

  // Multiply Rz * Rx
  const Rzx: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      Rzx[r][c] = Rz[r][0] * Rx[0][c] + Rz[r][1] * Rx[1][c] + Rz[r][2] * Rx[2][c];
    }
  }

  // Multiply (Rz * Rx) * Ry
  const R: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      R[r][c] = Rzx[r][0] * Ry[0][c] + Rzx[r][1] * Ry[1][c] + Rzx[r][2] * Ry[2][c];
    }
  }

  return R;
}

/**
 * Transforms a single Landmark by a 3x3 rotation matrix around a reference center.
 */
export function rectifyLandmark(
  landmark: Landmark,
  R: number[][],
  center: { x: number; y: number; z: number } = { x: 0.5, y: 0.5, z: 0 }
): Landmark {
  if (!landmark) return landmark;
  const x = landmark.x - center.x;
  const y = landmark.y - center.y;
  const z = (landmark.z ?? 0) - center.z;

  const rx = R[0][0] * x + R[0][1] * y + R[0][2] * z + center.x;
  const ry = R[1][0] * x + R[1][1] * y + R[1][2] * z + center.y;
  const rz = R[2][0] * x + R[2][1] * y + R[2][2] * z + center.z;

  return {
    ...landmark,
    x: rx,
    y: ry,
    z: rz,
  };
}

/**
 * Transforms an entire PoseFrame into the rectified orthogonal camera frame.
 */
export function rectifyPoseFrame(
  frame: PoseFrame,
  params: CameraPerspectiveParams
): PoseFrame {
  if (!frame || !frame.landmarks || frame.landmarks.length === 0) return frame;

  const targetYaw = params.yawDeg >= 45 ? 90.0 : 0.0;
  const yawDev = params.yawDeg - targetYaw;
  const R = createPerspectiveRectificationMatrix(params.pitchDeg, yawDev, params.rollDeg);

  const lHip = frame.landmarks[LM.L_HIP];
  const rHip = frame.landmarks[LM.R_HIP];
  const hip = mid(lHip, rHip);
  const center = { x: hip.x, y: hip.y, z: hip.z ?? 0 };

  const rectifiedLandmarks = frame.landmarks.map((lm) => rectifyLandmark(lm, R, center));

  let rectifiedWorldLandmarks: Landmark[] | undefined = undefined;
  if (frame.worldLandmarks && frame.worldLandmarks.length > 0) {
    const wCenter = { x: 0, y: 0, z: 0 };
    rectifiedWorldLandmarks = frame.worldLandmarks.map((lm) => rectifyLandmark(lm, R, wCenter));
  }

  return {
    ...frame,
    landmarks: rectifiedLandmarks,
    worldLandmarks: rectifiedWorldLandmarks,
  };
}

/**
 * Batch rectifies an array of PoseFrames using estimated camera perspective.
 */
export function rectifyPoseFrames(
  frames: PoseFrame[],
  params: CameraPerspectiveParams
): PoseFrame[] {
  if (!frames || frames.length === 0) return frames;
  return frames.map((f) => rectifyPoseFrame(f, params));
}

/**
 * 2D analytical joint angle perspective correction function:
 * theta_corrected = arctan(tan(theta_apparent) / (cos(phi) * cos(delta)))
 *
 * Corrects for perspective foreshortening in sagittal flexion/extension angles.
 */
export function correctAngleForPerspective(
  apparentAngleDeg: number,
  pitchDeg: number,
  yawDevDeg: number
): number {
  if (!Number.isFinite(apparentAngleDeg)) return 0;
  if (Math.abs(apparentAngleDeg) < 1e-4) return 0;

  const phiRad = (pitchDeg * Math.PI) / 180;
  const deltaRad = (yawDevDeg * Math.PI) / 180;

  const cosDenom = Math.cos(phiRad) * Math.cos(deltaRad);
  // Guard against near-singular projections (e.g. looking straight down 90°)
  if (Math.abs(cosDenom) < 1e-4) {
    return apparentAngleDeg;
  }

  const sign = apparentAngleDeg >= 0 ? 1 : -1;
  const absApparent = Math.abs(apparentAngleDeg);

  // Convert to radians
  const appRad = (absApparent * Math.PI) / 180;
  const tanApp = Math.tan(appRad);

  const correctedTan = tanApp / cosDenom;
  const correctedRad = Math.atan(correctedTan);
  let correctedDeg = (correctedRad * 180) / Math.PI;

  if (correctedDeg < 0) {
    correctedDeg += 180;
  }

  return Number((sign * correctedDeg).toFixed(2));
}

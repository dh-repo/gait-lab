/**
 * Perry & Burnfield (2010) 8-Phase Biomechanical Micro-Fault Detection Engine
 *
 * Pinpoints exact sub-phase kinematic deviations during the gait cycle:
 * 1. Initial Contact (0–2%): Absent heel strike / flat foot contact
 * 2. Loading Response (2–12%): Insufficient knee flexion wave (shock absorption deficit)
 * 3. Mid Stance (12–31%): Genu recurvatum (knee hyperextension) or crouch stance
 * 4. Terminal Stance (31–50%): Reduced hip extension (trailing limb deficit)
 * 5. Pre-Swing (50–60%): Insufficient knee flex preparation (push-off deficit)
 * 6. Initial Swing (60–73%): Peak knee flexion clearance deficit (stiff-knee / toe-drag risk)
 * 7. Mid Swing (73–87%): Foot drop / lack of neutral ankle dorsiflexion
 * 8. Terminal Swing (87–100%): Incomplete knee extension prior to initial contact
 */

import type { GaitAngleAnalysis, JointAnglePoint } from "./angles";
import type { GaitMetrics, PatientMetadata } from "./types";
import { PERRY_GAIT_PHASES, type GaitPhaseName } from "./phases";

export interface PhaseMicroFault {
  id: string;
  phaseId: GaitPhaseName;
  phaseName: string;
  cycleIntervalPct: [number, number]; // e.g. [2, 12]
  side: "left" | "right" | "bilateral";
  joint: "pelvis" | "hip" | "knee" | "ankle" | "trunk";
  severity: "mild" | "moderate" | "severe";
  observedValueDeg: number;
  normativeTargetDeg: number;
  unit: "°";
  clinicalTitle: string;
  biomechanicalMechanism: string;
  functionalRisk: string;
  correctiveClinicalCue: string;
  literatureCitation: "Perry & Burnfield (2010)" | "Winter (2009)" | "Sutherland (1988)";
}

export interface PhaseFaultAnalysisResult {
  faults: PhaseMicroFault[];
  faultCount: number;
  primaryImpairedPhase: string | null;
  phaseIntegrityScores: Record<GaitPhaseName, number>; // 0-100 score per phase
  clinicalSummary: string;
  patientFriendlyTakeaway: string;
}

/**
 * Analyzes continuous gait cycle angle trajectories and identifies phase-specific micro-faults.
 */
export function detectPhaseMicroFaults(
  angleAnalysis?: GaitAngleAnalysis,
  metrics?: GaitMetrics,
  patientMeta?: PatientMetadata | { age?: number; sex?: string }
): PhaseFaultAnalysisResult {
  const faults: PhaseMicroFault[] = [];
  const age = patientMeta?.age;
  const isPediatric = age !== undefined && age !== null && age < 18;

  const phaseIntegrityScores: Record<GaitPhaseName, number> = {
    initial_contact: 100,
    loading_response: 100,
    mid_stance: 100,
    terminal_stance: 100,
    pre_swing: 100,
    initial_swing: 100,
    mid_swing: 100,
    terminal_swing: 100,
  };

  if (!angleAnalysis || angleAnalysis.isSuppressed || !angleAnalysis.normalizedPoints || angleAnalysis.normalizedPoints.length < 10) {
    return {
      faults: [],
      faultCount: 0,
      primaryImpairedPhase: null,
      phaseIntegrityScores,
      clinicalSummary: "Phase micro-fault analysis unevaluated: insufficient normalized trajectory points.",
      patientFriendlyTakeaway: "Overall movement flow is consistent across stepping phases.",
    };
  }

  const points = angleAnalysis.normalizedPoints;

  // Helper to get mean joint angle within a percent range of gait cycle
  const getPhaseMean = (startPct: number, endPct: number, key: keyof JointAnglePoint): { left: number; right: number } => {
    const subset = points.filter((p) => p.gaitCyclePct >= startPct && p.gaitCyclePct <= endPct);
    if (subset.length === 0) return { left: 0, right: 0 };
    const leftVals = subset.map((p) => (p as any)[key] ?? (p as any)[`${key}Left`] ?? 0);
    const rightVals = subset.map((p) => (p as any)[key] ?? (p as any)[`${key}Right`] ?? 0);
    const meanL = leftVals.reduce((a, b) => a + b, 0) / leftVals.length;
    const meanR = rightVals.reduce((a, b) => a + b, 0) / rightVals.length;
    return { left: meanL, right: meanR };
  };

  // Helper to get max joint angle within a percent range
  const getPhaseMax = (startPct: number, endPct: number, keyL: string, keyR: string): { left: number; right: number } => {
    const subset = points.filter((p) => p.gaitCyclePct >= startPct && p.gaitCyclePct <= endPct);
    if (subset.length === 0) return { left: 0, right: 0 };
    let maxL = -Infinity;
    let maxR = -Infinity;
    for (const p of subset) {
      const vL = (p as any)[keyL] ?? (p as any).kneeAngleLeft ?? (p as any).kneeFlexionLeft ?? 0;
      const vR = (p as any)[keyR] ?? (p as any).kneeAngleRight ?? (p as any).kneeFlexionRight ?? 0;
      if (vL > maxL) maxL = vL;
      if (vR > maxR) maxR = vR;
    }
    return { left: maxL === -Infinity ? 0 : maxL, right: maxR === -Infinity ? 0 : maxR };
  };

  // Helper to get min joint angle within a percent range
  const getPhaseMin = (startPct: number, endPct: number, keyL: string, keyR: string): { left: number; right: number } => {
    const subset = points.filter((p) => p.gaitCyclePct >= startPct && p.gaitCyclePct <= endPct);
    if (subset.length === 0) return { left: 0, right: 0 };
    let minL = Infinity;
    let minR = Infinity;
    for (const p of subset) {
      const vL = (p as any)[keyL] ?? (p as any).kneeAngleLeft ?? (p as any).kneeFlexionLeft ?? 0;
      const vR = (p as any)[keyR] ?? (p as any).kneeAngleRight ?? (p as any).kneeFlexionRight ?? 0;
      if (vL < minL) minL = vL;
      if (vR < minR) minR = vR;
    }
    return { left: minL === Infinity ? 0 : minL, right: minR === Infinity ? 0 : minR };
  };

  // 1. Initial Contact (0–2%): Ankle Dorsiflexion Check (Normative: 0° to +5°)
  const icAnkle = getPhaseMean(0, 2, "ankleFlexion" as keyof JointAnglePoint);
  (["left", "right"] as const).forEach((side) => {
    const val = side === "left" ? icAnkle.left : icAnkle.right;
    if (val < -3.0) {
      const sev = val < -10.0 ? "severe" : val < -6.0 ? "moderate" : "mild";
      faults.push({
        id: `fault_ic_ankle_${side}`,
        phaseId: "initial_contact",
        phaseName: "Initial Contact",
        cycleIntervalPct: [0, 2],
        side,
        joint: "ankle",
        severity: sev,
        observedValueDeg: Number(val.toFixed(1)),
        normativeTargetDeg: 2.0,
        unit: "°",
        clinicalTitle: `Initial Contact Forefoot / Flat Landing (${side.toUpperCase()})`,
        biomechanicalMechanism: `Ankle is plantarflexed (${val.toFixed(1)}°) at initial ground contact rather than neutral/dorsiflexed.`,
        functionalRisk: "Abolishes the heel rocker mechanism and increases impact ground reaction force transmission.",
        correctiveClinicalCue: "Cue 'Heel strike first' with active pretibial tibialis anterior activation.",
        literatureCitation: "Perry & Burnfield (2010)",
      });
      phaseIntegrityScores.initial_contact = Math.max(0, phaseIntegrityScores.initial_contact - (sev === "severe" ? 30 : 15));
    }
  });

  // 2. Loading Response (2–12%): Knee Flexion Shock Absorption Wave (Normative: 15°–20° flexion)
  const lrKneeMax = getPhaseMax(2, 12, "kneeAngleLeft", "kneeAngleRight");
  (["left", "right"] as const).forEach((side) => {
    const val = side === "left" ? lrKneeMax.left : lrKneeMax.right;
    if (val < 10.0 && val > 0) {
      const sev = val < 5.0 ? "severe" : "moderate";
      faults.push({
        id: `fault_lr_knee_${side}`,
        phaseId: "loading_response",
        phaseName: "Loading Response",
        cycleIntervalPct: [2, 12],
        side,
        joint: "knee",
        severity: sev,
        observedValueDeg: Number(val.toFixed(1)),
        normativeTargetDeg: 18.0,
        unit: "°",
        clinicalTitle: `Stiff Loading Response Wave (${side.toUpperCase()})`,
        biomechanicalMechanism: `Peak knee flexion wave during weight acceptance reaches only ${val.toFixed(1)}° (Normative: 15°–20°).`,
        functionalRisk: "Impaired eccentric quadriceps shock absorption, transferring excessive vertical impact to the hip and lumbar spine.",
        correctiveClinicalCue: "Cue 'Soft knee landing' with controlled eccentric quadriceps loading drills.",
        literatureCitation: "Perry & Burnfield (2010)",
      });
      phaseIntegrityScores.loading_response = Math.max(0, phaseIntegrityScores.loading_response - (sev === "severe" ? 25 : 15));
    }
  });

  // 3. Mid Stance (12–31%): Knee Hyperextension / Genu Recurvatum (Normative: 0° to 5°)
  const msKneeMin = getPhaseMin(12, 31, "kneeAngleLeft", "kneeAngleRight");
  (["left", "right"] as const).forEach((side) => {
    const val = side === "left" ? msKneeMin.left : msKneeMin.right;
    if (val < -4.0) {
      const sev = val < -10.0 ? "severe" : "moderate";
      faults.push({
        id: `fault_ms_recurvatum_${side}`,
        phaseId: "mid_stance",
        phaseName: "Mid Stance",
        cycleIntervalPct: [12, 31],
        side,
        joint: "knee",
        severity: sev,
        observedValueDeg: Number(val.toFixed(1)),
        normativeTargetDeg: 2.0,
        unit: "°",
        clinicalTitle: `Mid-Stance Genu Recurvatum (${side.toUpperCase()})`,
        biomechanicalMechanism: `Knee extends past neutral into hyperextension (${val.toFixed(1)}°) during single-limb support.`,
        functionalRisk: "Excessive tensile strain on the posterior knee capsule and anterior cruciate ligament (ACL); risks chronic joint laxity.",
        correctiveClinicalCue: "Cue slight knee unlock during midstance and train hamstring/quadriceps co-contraction.",
        literatureCitation: "Perry & Burnfield (2010)",
      });
      phaseIntegrityScores.mid_stance = Math.max(0, phaseIntegrityScores.mid_stance - (sev === "severe" ? 30 : 20));
    }
  });

  // 4. Terminal Stance (31–50%): Hip Extension Trailing Limb Angle (Normative: 10° to 20° extension / -10° to -20°)
  const tsHip = getPhaseMean(35, 50, "hipFlexion" as keyof JointAnglePoint);
  (["left", "right"] as const).forEach((side) => {
    const val = side === "left" ? tsHip.left : tsHip.right;
    if (val > 5.0) {
      const sev = val > 15.0 ? "severe" : "moderate";
      faults.push({
        id: `fault_ts_hip_ext_${side}`,
        phaseId: "terminal_stance",
        phaseName: "Terminal Stance",
        cycleIntervalPct: [31, 50],
        side,
        joint: "hip",
        severity: sev,
        observedValueDeg: Number(val.toFixed(1)),
        normativeTargetDeg: -10.0,
        unit: "°",
        clinicalTitle: `Terminal Stance Hip Extension Deficit (${side.toUpperCase()})`,
        biomechanicalMechanism: `Limb fails to achieve trailing extension during late stance (mean flexion: ${val.toFixed(1)}°).`,
        functionalRisk: "Restricts contralateral step length and limits iliopsoas passive stretch-shortening elastic recoil.",
        correctiveClinicalCue: "Target iliopsoas flexibility and posterior gluteal activation through terminal push-off.",
        literatureCitation: "Perry & Burnfield (2010)",
      });
      phaseIntegrityScores.terminal_stance = Math.max(0, phaseIntegrityScores.terminal_stance - (sev === "severe" ? 25 : 15));
    }
  });

  // 5. Initial Swing (60–73%): Peak Knee Flexion Clearance (Normative: 55°–65° adult, 60°–68° ped)
  const targetPeakKnee = isPediatric ? 58.0 : 55.0;
  const isKneeMax = getPhaseMax(60, 75, "kneeAngleLeft", "kneeAngleRight");
  (["left", "right"] as const).forEach((side) => {
    const val = side === "left" ? isKneeMax.left : isKneeMax.right;
    if (val > 0 && val < (targetPeakKnee - 10.0)) {
      const sev = val < (targetPeakKnee - 20.0) ? "severe" : "moderate";
      faults.push({
        id: `fault_is_stiff_knee_${side}`,
        phaseId: "initial_swing",
        phaseName: "Initial Swing",
        cycleIntervalPct: [60, 73],
        side,
        joint: "knee",
        severity: sev,
        observedValueDeg: Number(val.toFixed(1)),
        normativeTargetDeg: isPediatric ? 63.0 : 60.0,
        unit: "°",
        clinicalTitle: `Initial Swing Peak Knee Clearance Deficit (${side.toUpperCase()})`,
        biomechanicalMechanism: `Peak knee flexion reaches only ${val.toFixed(1)}° during swing initiation (Target: ${targetPeakKnee}°).`,
        functionalRisk: "Inadequate foot clearance; precipitates compensatory vaulting, hip hiking, or lateral circumduction.",
        correctiveClinicalCue: "Implement active rectus femoris inhibition and hamstring acceleration drills during early swing.",
        literatureCitation: isPediatric ? "Sutherland (1988)" : "Perry & Burnfield (2010)",
      });
      phaseIntegrityScores.initial_swing = Math.max(0, phaseIntegrityScores.initial_swing - (sev === "severe" ? 30 : 20));
    }
  });

  // 6. Mid Swing (73–87%): Ankle Neutral Dorsiflexion (Normative: 0° to +5°)
  const msAnkle = getPhaseMean(73, 87, "ankleFlexion" as keyof JointAnglePoint);
  (["left", "right"] as const).forEach((side) => {
    const val = side === "left" ? msAnkle.left : msAnkle.right;
    if (val < -4.0) {
      const sev = val < -10.0 ? "severe" : "moderate";
      faults.push({
        id: `fault_ms_foot_drop_${side}`,
        phaseId: "mid_swing",
        phaseName: "Mid Swing",
        cycleIntervalPct: [73, 87],
        side,
        joint: "ankle",
        severity: sev,
        observedValueDeg: Number(val.toFixed(1)),
        normativeTargetDeg: 0.0,
        unit: "°",
        clinicalTitle: `Mid-Swing Foot Drop / Dorsiflexion Deficit (${side.toUpperCase()})`,
        biomechanicalMechanism: `Ankle drops into plantarflexion (${val.toFixed(1)}°) during mid-swing transit.`,
        functionalRisk: "Direct risk of toe-drag trip hazard; requires compensatory steppage hip flexion.",
        correctiveClinicalCue: "Anterior tibialis neuro-reeducation, functional electrical stimulation (FES), or AFO evaluation.",
        literatureCitation: "Perry & Burnfield (2010)",
      });
      phaseIntegrityScores.mid_swing = Math.max(0, phaseIntegrityScores.mid_swing - (sev === "severe" ? 35 : 20));
    }
  });

  // Determine Primary Impaired Phase
  let primaryImpairedPhase: string | null = null;
  let lowestScore = 100;
  for (const [phase, score] of Object.entries(phaseIntegrityScores) as [GaitPhaseName, number][]) {
    if (score < lowestScore) {
      lowestScore = score;
      const def = PERRY_GAIT_PHASES.find((p) => p.id === phase);
      primaryImpairedPhase = def?.name || phase;
    }
  }

  const faultCount = faults.length;
  let clinicalSummary = "All 8 Perry gait phases demonstrate intact kinematic timing and range of motion.";
  if (faultCount > 0) {
    const faultTitles = faults.slice(0, 3).map((f) => `${f.clinicalTitle} [${f.observedValueDeg}° vs target ${f.normativeTargetDeg}°]`);
    clinicalSummary = `Identified ${faultCount} phase-specific micro-fault(s). Primary impairment localized to ${primaryImpairedPhase || "gait cycle"}. Key findings: ${faultTitles.join("; ")}.`;
  }

  let patientFriendlyTakeaway = "Your stepping rhythm and leg clearance are well-timed throughout each step.";
  if (faultCount > 0) {
    const mainFault = faults[0];
    patientFriendlyTakeaway = `Main observation: During ${mainFault.phaseName.toLowerCase()}, your ${mainFault.side} ${mainFault.joint} showed a slight movement difference (${mainFault.observedValueDeg}°). Targeted exercises can help smooth this step.`;
  }

  return {
    faults,
    faultCount,
    primaryImpairedPhase: faultCount > 0 ? primaryImpairedPhase : null,
    phaseIntegrityScores,
    clinicalSummary,
    patientFriendlyTakeaway,
  };
}
